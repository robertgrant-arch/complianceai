import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { Five9Client } from '@/lib/five9';
import { uploadFile, generateRecordingKey } from '@/lib/s3';
import { transcriptionQueue } from '../queues';
import type { IngestionJobData, TranscriptionJobData } from '../queues';

export async function processIngestion(job: Job<IngestionJobData>): Promise<void> {
  const { startTime, endTime } = job.data;
  const five9 = new Five9Client();

  console.log(`[Ingestion] Fetching calls from ${startTime} to ${endTime}`);
  await job.updateProgress(10);

  // Fetch call log from Five9
  let calls: Awaited<ReturnType<typeof five9.getCallLogReport>>;
  try {
    calls = await five9.getCallLogReport(new Date(startTime), new Date(endTime));
    console.log(`[Ingestion] Found ${calls.length} calls`);
  } catch (error: any) {
    console.error('[Ingestion] Failed to fetch Five9 call log:', error.message);
    throw new Error(`Five9 API error: ${error.message}`);
  }

  await job.updateProgress(30);

  if (calls.length === 0) {
    await job.updateProgress(100);
    console.log('[Ingestion] No calls to process');
    return;
  }

  // C-03: Batch fetch ALL existing five9CallIds in a single query (was N queries)
  const allCallIds = calls.map((c) => c.callId);
  const existingRecords = await prisma.callRecord.findMany({
    where: { five9CallId: { in: allCallIds } },
    select: { five9CallId: true },
  });
  // O(1) Set lookup instead of a DB query per call — up to 50x faster on large batches
  const existingIds = new Set(existingRecords.map((r) => r.five9CallId));

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];

    try {
      // C-03: O(1) Set lookup
      if (existingIds.has(call.callId)) {
        skipped++;
        continue;
      }

      // C-06: Map lowercase Five9 direction to uppercase Prisma enum
      const callDirection =
        call.callDirection?.toLowerCase() === 'inbound' ? 'INBOUND' : 'OUTBOUND';

      // Create call record
      const callRecord = await prisma.callRecord.create({
        data: {
          five9CallId: call.callId,
          agentId: call.agentId,
          agentName: call.agentName,
          campaignName: call.campaignName,
          callDirection: callDirection as any,
          startTime: call.startTime,
          endTime: call.endTime,
          duration: call.duration,
          ani: call.ani,
          dnis: call.dnis,
          disposition: call.disposition,
          status: 'PENDING', // C-06: uppercase enum
        },
      });

      // Download and upload recording if available
      if (call.recordingUrl) {
        try {
          const recordingBuffer = await five9.downloadRecording(call.recordingUrl);
          if (recordingBuffer) {
            const s3Key = generateRecordingKey(call.agentId, call.callId, call.startTime);
            await uploadFile(s3Key, recordingBuffer, 'audio/wav');

            // Single update: set s3Key and status together
            await prisma.callRecord.update({
              where: { id: callRecord.id },
              data: { s3Key, status: 'TRANSCRIBING' }, // C-06: uppercase enum
            });

            // Queue for transcription
            const transcriptionJob: TranscriptionJobData = {
              callId: callRecord.id,
              s3Key,
              agentName: call.agentName,
              duration: call.duration,
            };
            await transcriptionQueue.add(
              `transcribe-${callRecord.id}` as string,
              transcriptionJob,
              { priority: call.duration > 300 ? 10 : 5 }, // Prioritize longer calls
            );
          }
        } catch (recordingError: any) {
          console.error(
            `[Ingestion] Failed to download recording for ${call.callId}:`,
            recordingError.message,
          );
          // Don't fail the whole ingestion for one recording
        }
      }

      ingested++;
    } catch (error: any) {
      console.error(`[Ingestion] Error processing call ${call.callId}:`, error.message);
      errors++;
    }

    // Update progress
    const progress = 30 + Math.floor((i / calls.length) * 60);
    await job.updateProgress(progress);
  }

  // Update last ingestion time
  await five9.updateLastIngestionTime(new Date(endTime));
  await job.updateProgress(100);

  console.log(`[Ingestion] Complete: ${ingested} ingested, ${skipped} skipped, ${errors} errors`);
}
