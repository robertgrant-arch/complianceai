/**
 * lib/rate-limit.ts
 *
 * Fix-7  (Medium): Replace in-memory Map with a Redis sliding-window rate limiter
 *                  using ioredis. Limits are shared across all Next.js instances.
 *
 * Fix-11 (Low):    The old implementation used setInterval to purge stale entries,
 *                  which leaked under Next.js HMR. The Redis implementation uses
 *                  TTL-based expiry — no setInterval needed.
 *
 * Algorithm: Sliding-window log using a Redis sorted set.
 *   Key:   {prefix}:{ip}
 *   Score: request timestamp (ms)
 *   On each request:
 *     1. Remove entries older than the window
 *     2. Count remaining entries
 *     3. If count >= limit → reject 429
 *     4. Otherwise add current timestamp and set TTL
 *
 * Fallback: if REDIS_URL is not set or Redis is unreachable, the limiter
 * falls back to an in-memory fixed-window counter (fail-open for availability).
 */

import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

// ─── Redis connection ─────────────────────────────────────────────────────────

// Fix-11: use globalThis to persist the connection across HMR reloads in dev,
// preventing a new Redis connection being created on every hot-reload.
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitRedis: Redis | null | undefined;
}

function getRedis(): Redis | null {
  if (globalThis.__rateLimitRedis !== undefined) return globalThis.__rateLimitRedis;

  const url = process.env.REDIS_URL;
  if (!url) {
    globalThis.__rateLimitRedis = null;
    return null;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    client.on('error', (err) => {
      console.error('[RateLimit] Redis error:', err.message);
    });
    globalThis.__rateLimitRedis = client;
    return client;
  } catch {
    globalThis.__rateLimitRedis = null;
    return null;
  }
}

// ─── In-memory fallback (used when Redis is unavailable) ─────────────────────

interface FallbackEntry {
  count: number;
  resetTime: number;
}

// Fix-11: guard setInterval with globalThis flag so it only runs once across HMR
declare global {
  // eslint-disable-next-line no-var
  var __rateLimitCleanupStarted: boolean | undefined;
}

const fallbackStore = new Map<string, FallbackEntry>();

if (!globalThis.__rateLimitCleanupStarted) {
  globalThis.__rateLimitCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    fallbackStore.forEach((value, key) => {
      if (value.resetTime < now) fallbackStore.delete(key);
    });
  }, 5 * 60 * 1000);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitOptions {
  /** Maximum requests allowed within the window. */
  limit?: number;
  /** Window size in milliseconds. */
  windowMs?: number;
  /** Key prefix to namespace different limiters. */
  keyPrefix?: string;
}

// ─── Core implementation ──────────────────────────────────────────────────────

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    limit = 100,
    windowMs = 60 * 1000,
    keyPrefix = 'rl',
  } = options;

  return async function rateLimitMiddleware(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    // ── Fix-7: Redis sliding-window path ──────────────────────────────────────
    const redis = getRedis();
    if (redis) {
      try {
        const windowStart = now - windowMs;
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(key, '-inf', windowStart);
        pipeline.zcard(key);
        pipeline.zadd(key, now, `${now}-${Math.random()}`);
        pipeline.pexpire(key, windowMs);

        const results = await pipeline.exec();
        if (results) {
          const countResult = results[1];
          const count = (countResult && !countResult[0] ? (countResult[1] as number) : 0);

          if (count >= limit) {
            const retryAfter = Math.ceil(windowMs / 1000);
            return NextResponse.json(
              { error: 'Too many requests', retryAfter },
              {
                status: 429,
                headers: {
                  'Retry-After': String(retryAfter),
                  'X-RateLimit-Limit': String(limit),
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(now + windowMs),
                },
              }
            );
          }
        }
        return null;
      } catch (err: any) {
        console.error('[RateLimit] Redis pipeline error (falling back to in-memory):', err.message);
        // Fall through to in-memory fallback
      }
    }

    // ── Fix-11: In-memory fallback (fixed-window) ─────────────────────────────
    const current = fallbackStore.get(key);
    if (!current || current.resetTime < now) {
      fallbackStore.set(key, { count: 1, resetTime: now + windowMs });
      return null;
    }
    if (current.count >= limit) {
      const retryAfter = Math.ceil((current.resetTime - now) / 1000);
      return NextResponse.json(
        { error: 'Too many requests', retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(current.resetTime),
          },
        }
      );
    }
    current.count++;
    return null;
  };
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

export const apiRateLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 });
export const authRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'auth' });
export const exportRateLimit = rateLimit({ limit: 10, windowMs: 60 * 1000, keyPrefix: 'export' });
