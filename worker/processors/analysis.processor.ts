import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { notificationQueue } from '../queues';
import type { AnalysisJobData, NotificationJobData } from '../queues';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AuditFlag {
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  category: string;
  description: string;
  timestamp?: number;
  keyword?: string;
  quote?: string;
}

interface AnalysisResult {
  overallScore: number;
  complianceScore: number;
  toneScore: number;
  qualityScore: number;
  summary: string;
  recommendedAction: 'none' | 'coaching' | 'review' | 'escalate';
  flags: AuditFlag[];
  sentimentAgent: string;
  sentimentCustomer: string;
  topicsDiscussed: string[];
  callOutcome: string;
}

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

    // Fetch active keyword lists
    const keywordLists = await prisma.keywordList.findMany({
      where: { isActive: true },
      include: { keywords: true },
    });

    await job.updateProgress(20);

    // Build keyword context for the prompt
    const keywordContext = keywordLists.map((list) => ({
      type: list.type,
      name: list.name,
      keywords: list.keywords.map((k) => k.word),
    }));

    // Parse segments for structured transcript
    let segments: any[] = [];
    try {
      segments = JSON.parse(transcript.segments as string || '[]');
    } catch {}

    // Build formatted transcript for GPT
    const formattedTranscript = segments.length > 0
      ? segments.map((s: any) => `[${formatTime(s.startTime)}] ${s.speaker}: ${s.text}`).join('\n')
      : transcript.fullText;

    await job.updateProgress(30);

    // Run GPT-4o analysis
    const analysisResult = await runGPTAnalysis({
      transcript: formattedTranscript,
      agentName,
      campaignName,
      duration,
      keywordContext,
    });

    await job.updateProgress(70);

    // Check transcript for keyword matches
    const keywordMatches = findKeywordMatches(transcript.fullText, keywordLists);

    // Merge keyword flags with GPT flags
    const allFlags = [...analysisResult.flags, ...keywordMatches];

    // Save audit result
    const auditResult = await prisma.auditResult.create({
      data: {
        callRecordId: callId,
        overallScore: analysisResult.overallScore,
        complianceScore: analysisResult.complianceScore,
        toneScore: analysisResult.toneScore,
        qualityScore: analysisResult.qualityScore,
        summary: analysisResult.summary,
        recommendedAction: analysisResult.recommendedAction,
        sentimentAgent: analysisResult.sentimentAgent,
        sentimentCustomer: analysisResult.sentimentCustomer,
        topicsDiscussed: JSON.stringify(analysisResult.topicsDiscussed),
        callOutcome: analysisResult.callOutcome,
        auditFlags: {
          create: allFlags.map((flag) => ({
            type: flag.type,
            category: flag.category,
            description: flag.description,
            timestamp: flag.timestamp,
            keyword: flag.keyword,
            quote: flag.quote,
          })),
        },
      },
    });

    await job.updateProgress(85);

    // Update call record status
    await prisma.callRecord.update({
      where: { id: callId },
      data: {
        status: 'completed',
        reviewedAt: new Date(),
      },
    });

    await job.updateProgress(90);

    // Send notifications if needed
    const criticalFlags = allFlags.filter((f) => f.type === 'CRITICAL');
    const criticalThreshold = parseInt(process.env.CRITICAL_SCORE_THRESHOLD || '60');

    if (criticalFlags.length > 0) {
      const notifData: NotificationJobData = {
        type: 'critical_flag',
        callId,
        agentName,
        score: analysisResult.overallScore,
        flagCount: criticalFlags.length,
      };
      await notificationQueue.add(`notify-critical-${callId}`, notifData);
    } else if (analysisResult.overallScore < criticalThreshold) {
      const notifData: NotificationJobData = {
        type: 'low_score',
        callId,
        agentName,
        score: analysisResult.overallScore,
      };
      await notificationQueue.add(`notify-low-score-${callId}`, notifData);
    }

    await job.updateProgress(100);
    console.log(`[Analysis] Complete for call ${callId}: score=${analysisResult.overallScore}, flags=${allFlags.length}`);
  } catch (error: any) {
    console.error(`[Analysis] Error for call ${callId}:`, error.message);

    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'error' },
    });

    // Notify on error
    await notificationQueue.add(`notify-error-${callId}`, {
      type: 'processing_error',
      callId,
      agentName,
      error: error.message,
    });

    throw error;
  }
}

async function runGPTAnalysis(params: {
  transcript: string;
  agentName: string;
  campaignName: string;
  duration: number;
  keywordContext: any[];
}): Promise<AnalysisResult> {
  const { transcript, agentName, campaignName, duration, keywordContext } = params;

  const systemPrompt = `You are an expert compliance auditor for a call center. Your job is to analyze call transcripts and provide detailed compliance scoring and flagging.

You must evaluate calls across four dimensions:
1. **Compliance Score (0-100)**: Did the agent follow all regulatory requirements? Did they provide required disclosures? Did they avoid prohibited statements?
2. **Tone Score (0-100)**: Was the agent professional, empathetic, and appropriate in tone? Were they respectful to the customer?
3. **Quality Score (0-100)**: Did the agent handle the call effectively? Did they resolve the customer's issue? Was the call structured properly?
4. **Overall Score (0-100)**: Weighted average (Compliance: 50%, Tone: 25%, Quality: 25%)

Keyword Lists to check:
${JSON.stringify(keywordContext, null, 2)}

For PROHIBITED keywords: Flag as CRITICAL if found
For REQUIRED keywords: Flag as WARNING if NOT found  
For RISK keywords: Flag as WARNING if found
For COMPETITOR keywords: Flag as INFO if found

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": number,
  "complianceScore": number,
  "toneScore": number,
  "qualityScore": number,
  "summary": "2-3 sentence summary of the call",
  "recommendedAction": "none" | "coaching" | "review" | "escalate",
  "sentimentAgent": "positive" | "neutral" | "negative",
  "sentimentCustomer": "positive" | "neutral" | "negative",
  "topicsDiscussed": ["topic1", "topic2"],
  "callOutcome": "brief outcome description",
  "flags": [
    {
      "type": "CRITICAL" | "WARNING" | "INFO",
      "category": "category name",
      "description": "detailed description",
      "timestamp": optional_number_seconds,
      "keyword": "optional_matched_keyword",
      "quote": "optional_relevant_quote_from_transcript"
    }
  ]
}`;

  const userPrompt = `Analyze this call:
Agent: ${agentName}
Campaign: ${campaignName}
Duration: ${Math.floor(duration / 60)}m ${duration % 60}s

TRANSCRIPT:
${transcript.slice(0, 12000)}`; // Limit transcript length for token efficiency

  const response = await openai.chat.completions.create({
    model: process.env.GPT_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1, // Low temperature for consistent scoring
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from GPT');

  const result = JSON.parse(content) as AnalysisResult;

  // Validate and clamp scores
  result.overallScore = clamp(Math.round(result.overallScore), 0, 100);
  result.complianceScore = clamp(Math.round(result.complianceScore), 0, 100);
  result.toneScore = clamp(Math.round(result.toneScore), 0, 100);
  result.qualityScore = clamp(Math.round(result.qualityScore), 0, 100);

  // Recalculate overall score with proper weights
  result.overallScore = Math.round(
    result.complianceScore * 0.5 +
    result.toneScore * 0.25 +
    result.qualityScore * 0.25
  );

  return result;
}

/**
 * Find keyword matches in transcript text
 */
function findKeywordMatches(text: string, keywordLists: any[]): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const lowerText = text.toLowerCase();

  for (const list of keywordLists) {
    for (const kw of list.keywords) {
      const word = kw.isCaseSensitive ? kw.word : kw.word.toLowerCase();
      const searchText = kw.isCaseSensitive ? text : lowerText;

      let matched = false;
      if (kw.isRegex) {
        try {
          const regex = new RegExp(kw.word, kw.isCaseSensitive ? 'g' : 'gi');
          matched = regex.test(text);
        } catch {}
      } else {
        matched = searchText.includes(word);
      }

      if (matched) {
        let flagType: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO';
        let description = '';

        switch (list.type) {
          case 'prohibited':
            flagType = 'CRITICAL';
            description = `Prohibited phrase detected: "${kw.word}" (${list.name})`;
            break;
          case 'risk':
            flagType = 'WARNING';
            description = `Risk phrase detected: "${kw.word}" (${list.name})`;
            break;
          case 'competitor':
            flagType = 'INFO';
            description = `Competitor mention: "${kw.word}" (${list.name})`;
            break;
        }

        if (description) {
          flags.push({
            type: flagType,
            category: list.type,
            description,
            keyword: kw.word,
          });
        }
      }
    }

    // Check required keywords (flag if NOT found)
    if (list.type === 'required') {
      for (const kw of list.keywords) {
        const word = kw.isCaseSensitive ? kw.word : kw.word.toLowerCase();
        const searchText = kw.isCaseSensitive ? text : lowerText;
        const found = searchText.includes(word);

        if (!found) {
          flags.push({
            type: 'WARNING',
            category: 'required',
            description: `Required phrase not found: "${kw.word}" (${list.name})`,
            keyword: kw.word,
          });
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
