/**
 * worker/queues.ts
 *
 * H-03: Added Dead Letter Queues (DLQ) for each processing queue.
 *       Jobs that exhaust all retries are moved to the DLQ instead of
 *       being silently discarded. Failed jobs are kept in Redis for
 *       inspection (removeOnFail: false on main queues).
 *       DLQ queues have removeOnFail: { count: 500 } to bound memory.
 */

import { Queue, QueueEvents } from 'bullmq';
import { redisConnection, redisConnectionOptions } from './redis';

// Queue names
export const QUEUE_NAMES = {
  INGESTION: 'five9-ingestion',
  TRANSCRIPTION: 'call-transcription',
  ANALYSIS: 'call-analysis',
  NOTIFICATION: 'notification',
  RETENTION: 'retention-enforcement', // H-09
  // H-03: Dead Letter Queues
  DLQ_INGESTION: 'five9-ingestion-dlq',
  DLQ_TRANSCRIPTION: 'call-transcription-dlq',
  DLQ_ANALYSIS: 'call-analysis-dlq',
} as const;

// Job data types
export interface IngestionJobData {
  startTime: string;
  endTime: string;
  triggeredBy?: string;
}

export interface TranscriptionJobData {
  callId: string;
  s3Key: string;
  agentName: string;
  duration: number;
}

export interface AnalysisJobData {
  callId: string;
  transcriptId: string;
  agentName: string;
  campaignName: string;
  duration: number;
}

export interface NotificationJobData {
  type: 'critical_flag' | 'low_score' | 'processing_error';
  callId: string;
  agentName: string;
  score?: number;
  flagCount?: number;
  error?: string;
}

export interface RetentionJobData {
  dryRun?: boolean;
}

// H-03: DLQ job wraps the original failed job for inspection
export interface DlqJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: unknown;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
}

// ── Main processing queues ────────────────────────────────────────────────────

export const ingestionQueue = new Queue<IngestionJobData>(QUEUE_NAMES.INGESTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // H-03: explicit retry limit
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false, // H-03: keep failed jobs in Redis for DLQ routing
  },
});

export const transcriptionQueue = new Queue<TranscriptionJobData>(QUEUE_NAMES.TRANSCRIPTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false, // H-03: keep for DLQ routing
  },
});

export const analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAMES.ANALYSIS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false, // H-03: keep for DLQ routing
  },
});

export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 }, // Notifications are lower priority — can discard
  },
});

// H-09: Retention enforcement queue (runs on a daily cron)
export const retentionQueue = new Queue<RetentionJobData>(QUEUE_NAMES.RETENTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

// H-03: Dead Letter Queues — receive jobs that exhausted all retries
export const dlqIngestionQueue = new Queue<DlqJobData>(QUEUE_NAMES.DLQ_INGESTION, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false, // Keep DLQ completions for audit
    removeOnFail: { count: 500 },
  },
});

export const dlqTranscriptionQueue = new Queue<DlqJobData>(QUEUE_NAMES.DLQ_TRANSCRIPTION, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: { count: 500 },
  },
});

export const dlqAnalysisQueue = new Queue<DlqJobData>(QUEUE_NAMES.DLQ_ANALYSIS, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: { count: 500 },
  },
});

// M-05: QueueEvents require their own dedicated connection (they use BRPOP/BLPOP)
// so we pass the options object, not the shared IORedis instance.
export const ingestionEvents = new QueueEvents(QUEUE_NAMES.INGESTION, {
  connection: redisConnectionOptions,
});
export const transcriptionEvents = new QueueEvents(QUEUE_NAMES.TRANSCRIPTION, {
  connection: redisConnectionOptions,
});
export const analysisEvents = new QueueEvents(QUEUE_NAMES.ANALYSIS, {
  connection: redisConnectionOptions,
});
