/**
 * retention.processor.ts
 *
 * H-09: Enforces retention policies stored in the RetentionPolicy table.
 * Runs daily at 02:00 UTC (scheduled in worker/index.ts).
 *
 * For each CallStatus type that has a retention policy:
 *  1. Find call records older than retainDays
 *  2. If deleteAudio=true, delete the S3/MinIO audio file
 *  3. If deleteRecord=true, delete the entire call record (cascades to transcript/audit)
 *  4. If deleteRecord=false, only delete the audio and clear the s3Key
 */

import { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { deleteFile } from '@/lib/s3';
import type { RetentionJobData } from '../queues';

export async function processRetention(job: Job<RetentionJobData>): Promise<void> {
  const { dryRun = false } = job.data;

  console.log(`[Retention] Starting retention enforcement (dryRun=${dryRun})`);
  await job.updateProgress(5);

  // Load all retention policies
  const policies = await prisma.retentionPolicy.findMany();

  if (policies.length === 0) {
    console.log('[Retention] No retention policies configured — skipping');
    await job.updateProgress(100);
    return;
  }

  let totalAudioDeleted = 0;
  let totalRecordsDeleted = 0;
  let totalAudioCleared = 0;
  let errors = 0;

  for (let pIdx = 0; pIdx < policies.length; pIdx++) {
    const policy = policies[pIdx];
    const cutoffDate = new Date(Date.now() - policy.retainDays * 24 * 60 * 60 * 1000);

    console.log(
      `[Retention] Policy: status=${policy.callStatus}, retainDays=${policy.retainDays}, ` +
        `deleteAudio=${policy.deleteAudio}, deleteRecord=${policy.deleteRecord}, ` +
        `cutoff=${cutoffDate.toISOString()}`,
    );

    // Find expired call records in batches to avoid memory issues
    const BATCH_SIZE = 100;
    let offset = 0;

    while (true) {
      const expiredCalls = await prisma.callRecord.findMany({
        where: {
          status: policy.callStatus as any,
          createdAt: { lt: cutoffDate },
          // Only process records that still have data to clean
          OR: [
            { s3Key: { not: null } },
            ...(policy.deleteRecord ? [{}] : []),
          ],
        },
        select: {
          id: true,
          five9CallId: true,
          s3Key: true,
          agentName: true,
          createdAt: true,
        },
        take: BATCH_SIZE,
        skip: offset,
        orderBy: { createdAt: 'asc' },
      });

      if (expiredCalls.length === 0) break;

      console.log(
        `[Retention] Processing batch of ${expiredCalls.length} expired ${policy.callStatus} calls`,
      );

      for (const call of expiredCalls) {
        try {
          // Delete audio from S3/MinIO
          if (policy.deleteAudio && call.s3Key) {
            if (!dryRun) {
              try {
                await deleteFile(call.s3Key);
                totalAudioDeleted++;
              } catch (s3Err: any) {
                console.warn(
                  `[Retention] Failed to delete S3 file ${call.s3Key}: ${s3Err.message}`,
                );
                // Continue — don't let S3 errors block DB cleanup
              }
            } else {
              console.log(`[Retention] [DRY RUN] Would delete audio: ${call.s3Key}`);
              totalAudioDeleted++;
            }
          }

          if (policy.deleteRecord) {
            // Delete the entire call record (cascades to transcript, audit result, flags)
            if (!dryRun) {
              await prisma.callRecord.delete({ where: { id: call.id } });
              totalRecordsDeleted++;
            } else {
              console.log(
                `[Retention] [DRY RUN] Would delete record: ${call.id} (${call.five9CallId})`,
              );
              totalRecordsDeleted++;
            }
          } else if (policy.deleteAudio && call.s3Key) {
            // Keep the record but clear the s3Key so we don't try to delete again
            if (!dryRun) {
              await prisma.callRecord.update({
                where: { id: call.id },
                data: { s3Key: null },
              });
              totalAudioCleared++;
            } else {
              console.log(`[Retention] [DRY RUN] Would clear s3Key for: ${call.id}`);
              totalAudioCleared++;
            }
          }
        } catch (err: any) {
          console.error(`[Retention] Error processing call ${call.id}:`, err.message);
          errors++;
        }
      }

      offset += BATCH_SIZE;

      // Update progress
      const progress = 5 + Math.floor((pIdx / policies.length) * 90);
      await job.updateProgress(progress);

      // If we got fewer than BATCH_SIZE, we're done with this policy
      if (expiredCalls.length < BATCH_SIZE) break;
    }
  }

  await job.updateProgress(100);

  console.log(
    `[Retention] Complete${dryRun ? ' (DRY RUN)' : ''}: ` +
      `${totalAudioDeleted} audio files deleted, ` +
      `${totalRecordsDeleted} records deleted, ` +
      `${totalAudioCleared} s3Keys cleared, ` +
      `${errors} errors`,
  );
}
