/**
 * ComplianceAI Worker Service
 * BullMQ workers for Five9 ingestion, transcription, analysis, and notifications
 */

import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from './redis';
import {
  QUEUE_NAMES,
  ingestionQueue,
} from './queues';
import { processIngestion } from './processors/ingestion.processor';
import { processTranscription } from './processors/transcription.processor';
import { processAnalysis } from './processors/analysis.processor';
import { processNotification } from './processors/notification.processor';
import { prisma } from '@/lib/prisma';

// Worker concurrency from env
const TRANSCRIPTION_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');
const ANALYSIS_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '3');

console.log('🚀 Starting ComplianceAI Worker Service...');
console.log(`   Transcription workers: ${TRANSCRIPTION_CONCURRENCY}`);
console.log(`   Analysis workers: ${ANALYSIS_CONCURRENCY}`);

// ─── Ingestion Worker ────────────────────────────────────────────────────────
const ingestionWorker = new Worker(
  QUEUE_NAMES.INGESTION,
  processIngestion,
  {
    connection: redisConnection,
    concurrency: 1, // Only one ingestion at a time
  }
);

ingestionWorker.on('completed', (job) => {
  console.log(`✅ [Ingestion] Job ${job.id} completed`);
});

ingestionWorker.on('failed', (job, err) => {
  console.error(`❌ [Ingestion] Job ${job?.id} failed:`, err.message);
});

ingestionWorker.on('progress', (job, progress) => {
  console.log(`📊 [Ingestion] Job ${job.id} progress: ${progress}%`);
});

// ─── Transcription Worker ────────────────────────────────────────────────────
const transcriptionWorker = new Worker(
  QUEUE_NAMES.TRANSCRIPTION,
  processTranscription,
  {
    connection: redisConnection,
    concurrency: TRANSCRIPTION_CONCURRENCY,
    limiter: {
      max: 10,
      duration: 60000, // 10 transcriptions per minute (Whisper rate limit)
    },
  }
);

transcriptionWorker.on('completed', (job) => {
  console.log(`✅ [Transcription] Job ${job.id} completed`);
});

transcriptionWorker.on('failed', (job, err) => {
  console.error(`❌ [Transcription] Job ${job?.id} failed:`, err.message);
});

// ─── Analysis Worker ─────────────────────────────────────────────────────────
const analysisWorker = new Worker(
  QUEUE_NAMES.ANALYSIS,
  processAnalysis,
  {
    connection: redisConnection,
    concurrency: ANALYSIS_CONCURRENCY,
    limiter: {
      max: 20,
      duration: 60000, // 20 analyses per minute (GPT rate limit)
    },
  }
);

analysisWorker.on('completed', (job) => {
  console.log(`✅ [Analysis] Job ${job.id} completed`);
});

analysisWorker.on('failed', (job, err) => {
  console.error(`❌ [Analysis] Job ${job?.id} failed:`, err.message);
});

// ─── Notification Worker ─────────────────────────────────────────────────────
const notificationWorker = new Worker(
  QUEUE_NAMES.NOTIFICATION,
  processNotification,
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

notificationWorker.on('completed', (job) => {
  console.log(`✅ [Notification] Job ${job.id} sent`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`❌ [Notification] Job ${job?.id} failed:`, err.message);
});

// ─── Scheduled Ingestion ─────────────────────────────────────────────────────
async function schedulePeriodicIngestion() {
  const pollIntervalMinutes = parseInt(process.env.FIVE9_POLL_INTERVAL || '15');
  const five9Enabled = process.env.FIVE9_ENABLED === 'true';

  if (!five9Enabled) {
    console.log('ℹ️  Five9 ingestion is disabled (FIVE9_ENABLED=false)');
    return;
  }

  console.log(`⏰ Scheduling Five9 ingestion every ${pollIntervalMinutes} minutes`);

  // Add repeatable job using BullMQ v5 pattern
  await ingestionQueue.add(
    'scheduled-ingestion',
    {
      startTime: new Date(Date.now() - pollIntervalMinutes * 60 * 1000).toISOString(),
      endTime: new Date().toISOString(),
      triggeredBy: 'scheduler',
    },
    {
      repeat: {
        every: pollIntervalMinutes * 60 * 1000,
      },
      jobId: 'scheduled-ingestion',
    }
  );

  console.log(`✅ Ingestion scheduler started (every ${pollIntervalMinutes}m)`);
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function gracefulShutdown() {
  console.log('\n🛑 Shutting down workers gracefully...');

  await Promise.all([
    ingestionWorker.close(),
    transcriptionWorker.close(),
    analysisWorker.close(),
    notificationWorker.close(),
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
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Schedule periodic ingestion
    await schedulePeriodicIngestion();

    console.log('✅ All workers started and ready');
    console.log('   Listening for jobs...\n');
  } catch (error) {
    console.error('❌ Failed to start worker service:', error);
    process.exit(1);
  }
})();
