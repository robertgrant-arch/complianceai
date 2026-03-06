/**
 * ComplianceAI Worker Service
 * BullMQ workers for Five9 ingestion, transcription, analysis, notifications, and retention.
 *
 * H-03: Dead Letter Queue (DLQ) listeners route exhausted-retry jobs to DLQ queues.
 * H-09: Retention enforcement worker runs daily to purge expired call records.
 */

import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from './redis';
import {
  QUEUE_NAMES,
  ingestionQueue,
  retentionQueue,
  dlqIngestionQueue,
  dlqTranscriptionQueue,
  dlqAnalysisQueue,
} from './queues';
import type { DlqJobData } from './queues';
import { processIngestion } from './processors/ingestion.processor';
import { processTranscription } from './processors/transcription.processor';
import { processAnalysis } from './processors/analysis.processor';
import { processNotification } from './processors/notification.processor';
import { processRetention } from './processors/retention.processor';
import { prisma } from '@/lib/prisma';

const TRANSCRIPTION_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');
const ANALYSIS_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');

console.log('🚀 Starting ComplianceAI Worker Service...');
console.log(`   Transcription workers: ${TRANSCRIPTION_CONCURRENCY}`);
console.log(`   Analysis workers: ${ANALYSIS_CONCURRENCY}`);

// ─── Ingestion Worker ─────────────────────────────────────────────────────────
const ingestionWorker = new Worker(QUEUE_NAMES.INGESTION, processIngestion, {
  connection: redisConnection,
  concurrency: 1, // Only one ingestion at a time
});

ingestionWorker.on('completed', (job) => {
  console.log(`✅ [Ingestion] Job ${job.id} completed`);
});

ingestionWorker.on('progress', (job, progress) => {
  console.log(`📊 [Ingestion] Job ${job.id} progress: ${progress}%`);
});

// H-03: Route failed ingestion jobs to DLQ after all retries are exhausted
ingestionWorker.on('failed', async (job, err) => {
  console.error(`❌ [Ingestion] Job ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    const dlqData: DlqJobData = {
      originalQueue: QUEUE_NAMES.INGESTION,
      originalJobId: job.id ?? 'unknown',
      originalData: job.data,
      failedReason: err.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    };
    // Cast job name to string to satisfy BullMQ v5 generic NameType constraint
    await dlqIngestionQueue.add(`dlq-${job.id}` as string, dlqData).catch(console.error);
    console.warn(`⚠️  [Ingestion] Job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`);
  }
});

// ─── Transcription Worker ─────────────────────────────────────────────────────
const transcriptionWorker = new Worker(QUEUE_NAMES.TRANSCRIPTION, processTranscription, {
  connection: redisConnection,
  concurrency: TRANSCRIPTION_CONCURRENCY,
  limiter: {
    max: 10,
    duration: 60_000, // 10 transcriptions per minute (Whisper rate limit)
  },
});

transcriptionWorker.on('completed', (job) => {
  console.log(`✅ [Transcription] Job ${job.id} completed`);
});

// H-03: Route failed transcription jobs to DLQ
transcriptionWorker.on('failed', async (job, err) => {
  console.error(`❌ [Transcription] Job ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    const dlqData: DlqJobData = {
      originalQueue: QUEUE_NAMES.TRANSCRIPTION,
      originalJobId: job.id ?? 'unknown',
      originalData: job.data,
      failedReason: err.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    };
    await dlqTranscriptionQueue.add(`dlq-${job.id}` as string, dlqData).catch(console.error);
    console.warn(`⚠️  [Transcription] Job ${job.id} moved to DLQ`);
  }
});

// ─── Analysis Worker ──────────────────────────────────────────────────────────
const analysisWorker = new Worker(QUEUE_NAMES.ANALYSIS, processAnalysis, {
  connection: redisConnection,
  concurrency: ANALYSIS_CONCURRENCY,
  limiter: {
    max: 20,
    duration: 60_000, // 20 analyses per minute (GPT rate limit)
  },
});

analysisWorker.on('completed', (job) => {
  console.log(`✅ [Analysis] Job ${job.id} completed`);
});

// H-03: Route failed analysis jobs to DLQ
analysisWorker.on('failed', async (job, err) => {
  console.error(`❌ [Analysis] Job ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    const dlqData: DlqJobData = {
      originalQueue: QUEUE_NAMES.ANALYSIS,
      originalJobId: job.id ?? 'unknown',
      originalData: job.data,
      failedReason: err.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    };
    await dlqAnalysisQueue.add(`dlq-${job.id}` as string, dlqData).catch(console.error);
    console.warn(`⚠️  [Analysis] Job ${job.id} moved to DLQ`);
  }
});

// ─── Notification Worker ──────────────────────────────────────────────────────
const notificationWorker = new Worker(QUEUE_NAMES.NOTIFICATION, processNotification, {
  connection: redisConnection,
  concurrency: 5,
});

notificationWorker.on('completed', (job) => {
  console.log(`✅ [Notification] Job ${job.id} sent`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ [Notification] Job ${job?.id} failed:`, err.message);
});

// ─── Retention Worker (H-09) ──────────────────────────────────────────────────
const retentionWorker = new Worker(QUEUE_NAMES.RETENTION, processRetention, {
  connection: redisConnection,
  concurrency: 1, // Only one retention run at a time
});

retentionWorker.on('completed', (job) => {
  console.log(`✅ [Retention] Job ${job.id} completed`);
});

retentionWorker.on('failed', (job, err) => {
  console.error(`❌ [Retention] Job ${job?.id} failed:`, err.message);
});

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────
async function scheduleJobs() {
  // Five9 ingestion schedule
  const pollIntervalMinutes = parseInt(process.env.FIVE9_POLL_INTERVAL || '15');
  const five9Enabled = process.env.FIVE9_ENABLED === 'true';

  if (five9Enabled) {
    console.log(`⏰ Scheduling Five9 ingestion every ${pollIntervalMinutes} minutes`);
    await ingestionQueue.add(
      'scheduled-ingestion',
      {
        startTime: new Date(Date.now() - pollIntervalMinutes * 60 * 1000).toISOString(),
        endTime: new Date().toISOString(),
        triggeredBy: 'scheduler',
      },
      {
        repeat: { every: pollIntervalMinutes * 60 * 1000 },
        jobId: 'scheduled-ingestion',
      },
    );
    console.log(`✅ Ingestion scheduler started (every ${pollIntervalMinutes}m)`);
  } else {
    console.log('ℹ️  Five9 ingestion is disabled (FIVE9_ENABLED=false)');
  }

  // H-09: Daily retention enforcement at 02:00 UTC
  await retentionQueue.add(
    'daily-retention',
    { dryRun: false },
    {
      repeat: { pattern: '0 2 * * *' }, // cron: 02:00 UTC daily
      jobId: 'daily-retention',
    },
  );
  console.log('✅ Retention enforcement scheduled (daily at 02:00 UTC)');
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\n🛑 Shutting down workers gracefully...');

  await Promise.all([
    ingestionWorker.close(),
    transcriptionWorker.close(),
    analysisWorker.close(),
    notificationWorker.close(),
    retentionWorker.close(),
  ]);

  await prisma.$disconnect();
  console.log('✅ All workers stopped. Goodbye!');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ─── Start ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    await scheduleJobs();

    console.log('✅ All workers started and ready');
    console.log('   Listening for jobs...\n');
  } catch (error) {
    console.error('❌ Failed to start worker service:', error);
    process.exit(1);
  }
})();
