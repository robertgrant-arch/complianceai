/**
 * analysis.processor.ts
 *
 * Fixes applied:
 * C-07: Keyword matching is done ONLY by the local findKeywordMatches() function.
 *       The GPT prompt no longer includes keyword lists or instructs GPT to match them,
 *       eliminating duplicate detection and reducing token usage.
 * C-08: Smart transcript truncation — truncates at the nearest sentence boundary
 *       rather than hard-slicing mid-word.
 * H-05: System prompt is loaded from the DB (system_settings key=compliance_auditor_prompt)
 *       so it can be edited via the Settings UI without a code deploy.
 * C-06: All enum values written as uppercase strings to match Prisma enums.
 */

import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { notificationQueue } from '../queues';
import type { AnalysisJobData, NotificationJobData } from '../queues';
import OpenAI from 'openai';
import type { GptAnalysisResult, AuditFlagShape } from '@/lib/types/transcript';
import { parseKeywordItems } from '@/lib/types/transcript';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// C-08: Maximum characters to send to GPT — approx 8,000 tokens at ~4 chars/token
const MAX_TRANSCRIPT_CHARS = 28_000;

// H-05: Default system prompt used only if DB setting is missing
const DEFAULT_SYSTEM_PROMPT = `You are an expert compliance auditor for insurance sales calls.
Analyze the transcript and return ONLY valid JSON matching the schema described.
Score dimensions: complianceScore (50%), toneScore (25%), qualityScore (25%).
overallScore = round(complianceScore*0.5 + toneScore*0.25 + qualityScore*0.25).
recommendedAction: "NONE" | "COACHING" | "REVIEW" | "ESCALATE"
sentimentAgent/sentimentCustomer: "POSITIVE" | "NEUTRAL" | "NEGATIVE"
flags[].type: "CRITICAL" | "WARNING" | "INFO"
flags[].category: "COMPLIANCE" | "TONE" | "KEYWORD" | "QUALITY" | "REQUIRED" | "RISK" | "COMPETITOR"`;

export async function processAnalysis(job: Job<AnalysisJobData>): Promise<void> {
  const { callId, transcriptId, agentName, campaignName, duration } = job.data;

  console.log(`[Analysis] Processing call ${callId}`);
  await job.updateProgress(10);

  try {
    // Fetch transcript
    const transcript = await prisma.callTranscript.findUnique({
      where: { id: transcriptId },
    });

    if (!transcript) {
      throw new Error(`Transcript ${transcriptId} not found`);
    }

    // H-05: Load system prompt from DB so it can be edited via Settings UI
    const promptSetting = await prisma.systemSetting.findUnique({
      where: { key: 'compliance_auditor_prompt' },
    });
    const systemPrompt = promptSetting?.value?.trim() || DEFAULT_SYSTEM_PROMPT;

    // Fetch active keyword lists — used ONLY for local matching (C-07)
    const keywordLists = await prisma.keywordList.findMany({
      where: { isActive: true },
    });

    await job.updateProgress(20);

    // Parse segments for structured transcript
    let segments: Array<{ speaker: string; startTime: number; text: string }> = [];
    try {
      const raw = transcript.segments;
      segments = Array.isArray(raw) ? raw : JSON.parse(raw as string || '[]');
    } catch {}

    // Build formatted transcript for GPT
    const rawTranscript =
      segments.length > 0
        ? segments.map((s) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`).join('\n')
        : transcript.fullText;

    // C-08: Smart truncation — cut at the nearest sentence boundary before the limit
    const truncatedTranscript = smartTruncate(rawTranscript, MAX_TRANSCRIPT_CHARS);
    const wasTruncated = truncatedTranscript.length < rawTranscript.length;

    await job.updateProgress(30);

    // C-07: GPT prompt does NOT include keyword lists — local matching handles keywords
    const userPrompt = `Analyze this call:
Agent: ${agentName}
Campaign: ${campaignName}
Duration: ${Math.floor(duration / 60)}m ${duration % 60}s
${wasTruncated ? '(Transcript truncated to fit context window)\n' : ''}
TRANSCRIPT:
${truncatedTranscript}`;

    // Run GPT-4o analysis
    const analysisResult = await runGPTAnalysis(systemPrompt, userPrompt);

    await job.updateProgress(70);

    // C-07: Local keyword matching is the SOLE source of keyword flags
    const keywordFlags = findKeywordMatches(transcript.fullText, keywordLists);

    // Merge: GPT flags (compliance/tone/quality) + local keyword flags
    const allFlags: AuditFlagShape[] = [...analysisResult.flags, ...keywordFlags];

    // C-06: Map string enum values to uppercase Prisma enum values
    const normalizeEnum = (v: string) => v.toUpperCase();

    // Save audit result
    const auditResult = await prisma.auditResult.create({
      data: {
        callRecordId: callId,
        overallScore: analysisResult.overallScore,
        complianceScore: analysisResult.complianceScore,
        toneScore: analysisResult.toneScore,
        qualityScore: analysisResult.qualityScore,
        summary: analysisResult.summary,
        recommendedAction: normalizeEnum(analysisResult.recommendedAction) as any,
        sentimentAgent: normalizeEnum(analysisResult.sentimentAgent) as any,
        sentimentCustomer: normalizeEnum(analysisResult.sentimentCustomer) as any,
        topicsDiscussed: JSON.stringify(analysisResult.topicsDiscussed),
        callOutcome: analysisResult.callOutcome,
        auditFlags: {
          create: allFlags.map((flag) => ({
            type: normalizeEnum(flag.type) as any,
            category: normalizeEnum(flag.category) as any,
            description: flag.description,
            timestamp: flag.timestamp ?? null,
            keyword: flag.keyword ?? null,
            quote: flag.quote ?? null,
          })),
        },
      },
    });

    await job.updateProgress(85);

    // C-06: Use uppercase enum value for status
    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'COMPLETED', reviewedAt: new Date() },
    });

    await job.updateProgress(90);

    // Send notifications if needed
    const criticalFlags = allFlags.filter((f) => normalizeEnum(f.type) === 'CRITICAL');
    const scoreThreshold = parseInt(process.env.CRITICAL_SCORE_THRESHOLD || '60');

    if (criticalFlags.length > 0) {
      const notifData: NotificationJobData = {
        type: 'critical_flag',
        callId,
        agentName,
        score: analysisResult.overallScore,
        flagCount: criticalFlags.length,
      };
      await notificationQueue.add(`notify-critical-${callId}` as string, notifData);
    } else if (analysisResult.overallScore < scoreThreshold) {
      const notifData: NotificationJobData = {
        type: 'low_score',
        callId,
        agentName,
        score: analysisResult.overallScore,
      };
      await notificationQueue.add(`notify-low-score-${callId}` as string, notifData);
    }

    await job.updateProgress(100);
    console.log(
      `[Analysis] Complete for call ${callId}: score=${analysisResult.overallScore}, flags=${allFlags.length}`,
    );
  } catch (error: any) {
    console.error(`[Analysis] Error for call ${callId}:`, error.message);

    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'ERROR' }, // C-06: uppercase enum
    });

    await notificationQueue.add(`notify-error-${callId}` as string, {
      type: 'processing_error',
      callId,
      agentName,
      error: error.message,
    });

    throw error;
  }
}

/**
 * C-08: Smart transcript truncation.
 * Cuts at the nearest sentence boundary ('. ', '! ', '? ', '\n') before maxChars.
 * Falls back to hard truncation only if no boundary is found.
 */
function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Search backwards from maxChars for a sentence boundary
  const sentenceEnders = ['. ', '! ', '? ', '\n'];
  let cutPoint = maxChars;

  for (let i = maxChars; i > maxChars * 0.8; i--) {
    const twoChar = text.slice(i - 1, i + 1);
    if (sentenceEnders.some((e) => twoChar.startsWith(e[0]) && (twoChar[1] === e[1] || twoChar[1] === undefined))) {
      cutPoint = i;
      break;
    }
    // Also break on newline
    if (text[i] === '\n') {
      cutPoint = i;
      break;
    }
  }

  return text.slice(0, cutPoint) + '\n[... transcript truncated ...]';
}

/**
 * Run GPT-4o analysis with the given system and user prompts.
 * C-07: Keyword lists are NOT included in the prompt.
 * H-05: systemPrompt is loaded from DB and passed in.
 */
async function runGPTAnalysis(
  systemPrompt: string,
  userPrompt: string,
): Promise<GptAnalysisResult> {
  const response = await openai.chat.completions.create({
    model: process.env.GPT_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: parseFloat(process.env.GPT_TEMPERATURE || '0.1'),
    max_tokens: parseInt(process.env.GPT_MAX_TOKENS || '2000'),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from GPT');

  const result = JSON.parse(content) as GptAnalysisResult;

  // Validate and clamp scores
  result.overallScore = clamp(Math.round(result.overallScore ?? 0), 0, 100);
  result.complianceScore = clamp(Math.round(result.complianceScore ?? 0), 0, 100);
  result.toneScore = clamp(Math.round(result.toneScore ?? 0), 0, 100);
  result.qualityScore = clamp(Math.round(result.qualityScore ?? 0), 0, 100);

  // Recalculate overall score with proper weights (don't trust GPT's arithmetic)
  result.overallScore = Math.round(
    result.complianceScore * 0.5 + result.toneScore * 0.25 + result.qualityScore * 0.25,
  );

  // Ensure flags array exists
  if (!Array.isArray(result.flags)) result.flags = [];

  return result;
}

/**
 * C-07: Local keyword matching — the SOLE source of keyword-based flags.
 * GPT is NOT asked to match keywords, preventing double-counting.
 * H-01: Keywords are read from the JSON column (KeywordItem[]).
 */
function findKeywordMatches(
  text: string,
  keywordLists: Array<{ type: string; name: string; keywords: unknown }>,
): AuditFlagShape[] {
  const flags: AuditFlagShape[] = [];
  const lowerText = text.toLowerCase();

  for (const list of keywordLists) {
    // H-01: Parse keywords from JSON column
    const items = parseKeywordItems(list.keywords);

    if (list.type === 'REQUIRED') {
      // Required: flag if NOT found
      for (const kw of items) {
        const word = kw.isCaseSensitive ? kw.word : kw.word.toLowerCase();
        const searchText = kw.isCaseSensitive ? text : lowerText;
        let found = false;

        if (kw.isRegex) {
          try {
            found = new RegExp(kw.word, kw.isCaseSensitive ? '' : 'i').test(text);
          } catch {}
        } else {
          found = searchText.includes(word);
        }

        if (!found) {
          flags.push({
            type: 'WARNING',
            category: 'REQUIRED',
            description: `Required phrase not found: "${kw.word}" (${list.name})`,
            keyword: kw.word,
          });
        }
      }
    } else {
      // Prohibited / Risk / Competitor: flag if found
      for (const kw of items) {
        const word = kw.isCaseSensitive ? kw.word : kw.word.toLowerCase();
        const searchText = kw.isCaseSensitive ? text : lowerText;
        let matched = false;

        if (kw.isRegex) {
          try {
            matched = new RegExp(kw.word, kw.isCaseSensitive ? 'g' : 'gi').test(text);
          } catch {}
        } else {
          matched = searchText.includes(word);
        }

        if (matched) {
          let flagType: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO';
          let category: AuditFlagShape['category'] = 'KEYWORD';
          let description = '';

          switch (list.type.toUpperCase()) {
            case 'PROHIBITED':
              flagType = 'CRITICAL';
              category = 'KEYWORD';
              description = `Prohibited phrase detected: "${kw.word}" (${list.name})`;
              break;
            case 'RISK':
              flagType = 'WARNING';
              category = 'RISK';
              description = `Risk phrase detected: "${kw.word}" (${list.name})`;
              break;
            case 'COMPETITOR':
              flagType = 'INFO';
              category = 'COMPETITOR';
              description = `Competitor mention: "${kw.word}" (${list.name})`;
              break;
          }

          if (description) {
            flags.push({ type: flagType, category, description, keyword: kw.word });
          }
        }
      }
    }
  }

  return flags;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
