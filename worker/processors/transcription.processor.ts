import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { downloadFile } from '@/lib/s3';
import { analysisQueue } from '../queues';
import type { TranscriptionJobData, AnalysisJobData } from '../queues';
import OpenAI from 'openai';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TranscriptSegment {
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
}

export async function processTranscription(job: Job<TranscriptionJobData>): Promise<void> {
  const { callId, s3Key, agentName, duration } = job.data;

  console.log(`[Transcription] Processing call ${callId}`);
  await job.updateProgress(10);

  // Update status
  await prisma.callRecord.update({
    where: { id: callId },
    data: { status: 'transcribing' },
  });

  let tempFilePath: string | null = null;

  try {
    // Download audio from S3
    console.log(`[Transcription] Downloading audio from S3: ${s3Key}`);
    const audioBuffer = await downloadFile(s3Key);
    await job.updateProgress(30);

    // Write to temp file (OpenAI SDK requires a file path or File object)
    tempFilePath = path.join(os.tmpdir(), `call-${callId}-${Date.now()}.wav`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    // Transcribe with Whisper
    console.log(`[Transcription] Sending to Whisper API...`);
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath) as any,
      model: process.env.WHISPER_MODEL || 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment', 'word'],
      language: 'en',
    });

    await job.updateProgress(70);

    // Process segments with speaker diarization (simplified)
    const segments = processSegments(transcriptionResponse, agentName);

    // Save transcript to database
    const transcript = await prisma.callTranscript.create({
      data: {
        callRecordId: callId,
        fullText: transcriptionResponse.text,
        segments: JSON.stringify(segments),
        language: transcriptionResponse.language || 'en',
        durationSeconds: transcriptionResponse.duration || duration,
        wordCount: transcriptionResponse.text.split(/\s+/).length,
      },
    });

    await job.updateProgress(85);

    // Get call record for campaign info
    const callRecord = await prisma.callRecord.findUnique({
      where: { id: callId },
      select: { campaignName: true, duration: true },
    });

    // Queue for AI analysis
    const analysisJobData: AnalysisJobData = {
      callId,
      transcriptId: transcript.id,
      agentName,
      campaignName: callRecord?.campaignName || 'Unknown',
      duration: callRecord?.duration || duration,
    };

    await analysisQueue.add(`analyze-${callId}`, analysisJobData);

    // Update call status
    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'analyzing' },
    });

    await job.updateProgress(100);
    console.log(`[Transcription] Complete for call ${callId}: ${segments.length} segments`);
  } catch (error: any) {
    console.error(`[Transcription] Error for call ${callId}:`, error.message);

    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'error' },
    });

    throw error;
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
  }
}

/**
 * Process Whisper segments and assign speakers
 * Uses simple heuristics: agent speaks first, alternates with customer
 */
function processSegments(
  transcription: any,
  agentName: string
): TranscriptSegment[] {
  const rawSegments = transcription.segments || [];

  if (rawSegments.length === 0) {
    // Fallback: create single segment from full text
    return [{
      speaker: agentName,
      startTime: 0,
      endTime: transcription.duration || 0,
      text: transcription.text,
    }];
  }

  // Simple speaker assignment based on pause detection
  // In production, use a proper diarization model (e.g., pyannote)
  const segments: TranscriptSegment[] = [];
  let currentSpeaker = agentName;
  let lastEndTime = 0;

  for (const seg of rawSegments) {
    const pauseDuration = seg.start - lastEndTime;

    // Switch speaker on significant pause (>1.5 seconds)
    if (pauseDuration > 1.5 && segments.length > 0) {
      currentSpeaker = currentSpeaker === agentName ? 'Customer' : agentName;
    }

    segments.push({
      speaker: currentSpeaker,
      startTime: seg.start,
      endTime: seg.end,
      text: seg.text.trim(),
    });

    lastEndTime = seg.end;
  }

  return segments;
}
