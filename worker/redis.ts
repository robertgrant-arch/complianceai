/**
 * worker/redis.ts
 *
 * M-05: Redis connection configuration for BullMQ.
 *
 * NOTE: BullMQ bundles its own version of ioredis internally. Passing an external
 * IORedis instance causes TypeScript type conflicts between the two ioredis versions.
 * The correct approach is to pass a plain ConnectionOptions object — BullMQ will
 * create and manage its own IORedis connections from this config.
 *
 * BullMQ already reuses connections efficiently: each Queue uses one connection,
 * each Worker uses two (one for polling, one for commands). The connection options
 * are defined once here and shared across all queues/workers to ensure consistency.
 */

import type { ConnectionOptions } from 'bullmq';

/**
 * Shared Redis connection options for all BullMQ queues and workers.
 * BullMQ creates its own IORedis instances from these options.
 */
export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  // Required for BullMQ — disables the 3-retry limit on commands
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Alias for places that explicitly need ConnectionOptions type.
 * QueueEvents, FlowProducer, etc. all accept the same shape.
 */
export const redisConnectionOptions: ConnectionOptions = redisConnection;
