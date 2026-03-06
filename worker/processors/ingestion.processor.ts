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
  let calls;
  try {
    calls = await five9.getCallLogReport(new Date(startTime), new Date(endTime));
    console.log(`[Ingestion] Found ${calls.length} calls`);
  } catch (error: any) {
    console.error('[Ingestion] Failed to fetch Five9 call log:', error.message);
    throw new Error(`Five9 API error: ${error.message}`);
  }

  await job.updateProgress(30);

  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];

    try {
      // Check if call already exists
      const existing = await prisma.callRecord.findUnique({
        where: { five9CallId: call.callId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create call record
      const callRecord = await prisma.callRecord.create({
        data: {
          five9CallId: call.callId,
          agentId: call.agentId,
          agentName: call.agentName,
          campaignName: call.campaignName,
          callDirection: call.callDirection,
          startTime: call.startTime,
          endTime: call.endTime,
          duration: call.duration,
          ani: call.ani,
          dnis: call.dnis,
          disposition: call.disposition,
          status: 'pending',
        },
      });

      // Download and upload recording if available
      let s3Key: string | null = null;
      if (call.recordingUrl) {
        try {
          const recordingBuffer = await five9.downloadRecording(call.recordingUrl);
          if (recordingBuffer) {
            s3Key = generateRecordingKey(call.agentId, call.callId, call.startTime);
            await uploadFile(s3Key, recordingBuffer, 'audio/wav');

            await prisma.callRecord.update({
              where: { id: callRecord.id },
              data: { s3Key },
            });

            // Queue for transcription
            const transcriptionJob: TranscriptionJobData = {
              callId: callRecord.id,
              s3Key,
              agentName: call.agentName,
              duration: call.duration,
            };

            await transcriptionQueue.add(
              `transcribe-${callRecord.id}`,
              transcriptionJob,
              { priority: call.duration > 300 ? 10 : 5 } // Prioritize longer calls
            );

            await prisma.callRecord.update({
              where: { id: callRecord.id },
              data: { status: 'transcribing' },
            });
          }
        } catch (recordingError: any) {
          console.error(`[Ingestion] Failed to download recording for ${call.callId}:`, recordingError.message);
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

  return;
}
