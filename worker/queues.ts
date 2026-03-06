import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './redis';

// Queue names
export const QUEUE_NAMES = {
  INGESTION: 'five9-ingestion',
  TRANSCRIPTION: 'call-transcription',
  ANALYSIS: 'call-analysis',
  NOTIFICATION: 'notification',
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

// Create queues
export const ingestionQueue = new Queue<IngestionJobData>(QUEUE_NAMES.INGESTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const transcriptionQueue = new Queue<TranscriptionJobData>(QUEUE_NAMES.TRANSCRIPTION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export const analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAMES.ANALYSIS, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 200 },
  },
});

// Queue events for monitoring
export const ingestionEvents = new QueueEvents(QUEUE_NAMES.INGESTION, { connection: redisConnection });
export const transcriptionEvents = new QueueEvents(QUEUE_NAMES.TRANSCRIPTION, { connection: redisConnection });
export const analysisEvents = new QueueEvents(QUEUE_NAMES.ANALYSIS, { connection: redisConnection });
