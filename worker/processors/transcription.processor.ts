/**
 * transcription.processor.ts
 *
 * Replaced OpenAI Whisper with AWS Transcribe for call transcription.
 * Audio is uploaded to S3, then AWS Transcribe processes it asynchronously.
 * Results are polled until complete, then parsed and stored.
 */
import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { downloadFile } from '@/lib/s3';
import { analysisQueue } from '../queues';
import type { TranscriptionJobData, AnalysisJobData } from '../queues';
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
  LanguageCode,
} from '@aws-sdk/client-transcribe';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as https from 'https';

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_TRANSCRIBE_REGION || process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

const TRANSCRIBE_BUCKET = process.env.S3_BUCKET || 'complianceai-audio';
const TRANSCRIBE_OUTPUT_BUCKET = process.env.AWS_TRANSCRIBE_OUTPUT_BUCKET || TRANSCRIBE_BUCKET;

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

  // Update status to TRANSCRIBING (C-06: uppercase enum)
  await prisma.callRecord.update({
    where: { id: callId },
    data: { status: 'TRANSCRIBING' },
  });

  try {
    // Ensure audio file is in S3 (it should already be from ingestion)
    console.log(`[Transcription] Audio file at S3 key: ${s3Key}`);
    await job.updateProgress(20);

    // Start AWS Transcribe job
    const transcribeJobName = `complianceai-${callId}-${Date.now()}`;
    const mediaUri = `s3://${TRANSCRIBE_BUCKET}/${s3Key}`;

    console.log(`[Transcription] Starting AWS Transcribe job: ${transcribeJobName}`);
    await transcribeClient.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: transcribeJobName,
        LanguageCode: (process.env.AWS_TRANSCRIBE_LANGUAGE || 'en-US') as LanguageCode,
        MediaFormat: s3Key.endsWith('.mp3') ? 'mp3' : s3Key.endsWith('.flac') ? 'flac' : 'wav',
        Media: { MediaFileUri: mediaUri },
        OutputBucketName: TRANSCRIBE_OUTPUT_BUCKET,
        OutputKey: `transcripts/${callId}/${transcribeJobName}.json`,
        Settings: {
          ShowSpeakerLabels: true,
          MaxSpeakerLabels: 2, // Agent + Customer
        },
      }),
    );

    await job.updateProgress(30);

    // Poll for completion
    let jobStatus: string = 'IN_PROGRESS';
    let transcriptFileUri: string | undefined;
    const maxAttempts = 120; // 10 minutes max (5s intervals)
    let attempts = 0;

    while (jobStatus === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      const result = await transcribeClient.send(
        new GetTranscriptionJobCommand({
          TranscriptionJobName: transcribeJobName,
        }),
      );

      jobStatus = result.TranscriptionJob?.TranscriptionJobStatus || 'FAILED';
      transcriptFileUri = result.TranscriptionJob?.Transcript?.TranscriptFileUri;

      // Update progress based on polling
      const progress = Math.min(30 + Math.floor((attempts / maxAttempts) * 40), 70);
      await job.updateProgress(progress);
    }

    if (jobStatus !== 'COMPLETED' || !transcriptFileUri) {
      throw new Error(`AWS Transcribe job failed with status: ${jobStatus}`);
    }

    await job.updateProgress(70);

    // Fetch the transcript result from the URI
    console.log(`[Transcription] Fetching transcript from: ${transcriptFileUri}`);
    const transcriptData = await fetchTranscriptResult(transcriptFileUri);

    // Parse AWS Transcribe response into our segment format
    const fullText = transcriptData.results?.transcripts?.[0]?.transcript || '';
    const segments = parseAwsTranscribeSegments(transcriptData, agentName);

    // Save transcript to database (C-06: model name is callTranscript)
    const transcript = await prisma.callTranscript.create({
      data: {
        callRecordId: callId,
        fullText,
        segments: JSON.stringify(segments),
        language: (process.env.AWS_TRANSCRIBE_LANGUAGE || 'en-US').split('-')[0],
        durationSeconds: duration,
        wordCount: fullText.split(/\s+/).length,
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
    await analysisQueue.add(`analyze-${callId}` as string, analysisJobData);

    // Update call status to ANALYZING (C-06: uppercase enum)
    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'ANALYZING' },
    });

    await job.updateProgress(100);
    console.log(`[Transcription] Complete for call ${callId}: ${segments.length} segments`);
  } catch (error: any) {
    console.error(`[Transcription] Error for call ${callId}:`, error.message);

    // Update status to ERROR (C-06: uppercase enum)
    await prisma.callRecord.update({
      where: { id: callId },
      data: { status: 'ERROR' },
    });
    throw error;
  }
}

/**
 * Fetch the transcript JSON result from AWS Transcribe output URI.
 */
async function fetchTranscriptResult(uri: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(uri, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse AWS Transcribe result'));
        }
      });
      res.on('error', reject);
    });
  });
}

/**
 * Parse AWS Transcribe speaker-labeled segments into our TranscriptSegment format.
 * AWS Transcribe returns speaker labels (spk_0, spk_1) which we map to agent/customer.
 */
function parseAwsTranscribeSegments(
  transcriptData: any,
  agentName: string,
): TranscriptSegment[] {
  const speakerLabels = transcriptData.results?.speaker_labels;
  const items = transcriptData.results?.items || [];

  if (!speakerLabels || !speakerLabels.segments) {
    // Fallback: no speaker diarization available
    const fullText = transcriptData.results?.transcripts?.[0]?.transcript || '';
    return [{
      speaker: agentName,
      startTime: 0,
      endTime: 0,
      text: fullText,
    }];
  }

  // Map AWS speaker labels to our speaker names
  // Assumption: spk_0 is the agent (first speaker), spk_1 is the customer
  const speakerMap: Record<string, string> = {
    spk_0: agentName,
    spk_1: 'Customer',
  };

  const segments: TranscriptSegment[] = [];

  for (const segment of speakerLabels.segments) {
    const speaker = speakerMap[segment.speaker_label] || segment.speaker_label;
    const segmentItems = segment.items || [];

    // Build text from items in this segment
    const words: string[] = [];
    for (const item of segmentItems) {
      // Find matching item in the main items array for the actual content
      const matchingItem = items.find(
        (i: any) =>
          i.start_time === item.start_time && i.end_time === item.end_time,
      );
      if (matchingItem) {
        const content = matchingItem.alternatives?.[0]?.content || '';
        // Punctuation items don't have a space before them
        if (matchingItem.type === 'punctuation') {
          words.push(content);
        } else {
          words.push(` ${content}`);
        }
      }
    }

    const text = words.join('').trim();
    if (text) {
      segments.push({
        speaker,
        startTime: parseFloat(segment.start_time) || 0,
        endTime: parseFloat(segment.end_time) || 0,
        text,
      });
    }
  }

  return segments;
}
