import { NextRequest, NextResponse } from 'next/server';

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// In production, use Redis for distributed rate limiting
const store = new Map<string, RateLimitStore>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  store.forEach((value, key) => {
    if (value.resetTime < now) {
      store.delete(key);
    }
  });
}, 5 * 60 * 1000);

interface RateLimitOptions {
  limit?: number;       // Max requests per window
  windowMs?: number;    // Window size in milliseconds
  keyPrefix?: string;   // Prefix for the rate limit key
}

/**
 * Rate limit middleware for API routes
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const {
    limit = 100,
    windowMs = 60 * 1000, // 1 minute
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

    const current = store.get(key);

    if (!current || current.resetTime < now) {
      store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return null; // Allow request
    }

    if (current.count >= limit) {
      const retryAfter = Math.ceil((current.resetTime - now) / 1000);
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter,
        },
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
    return null; // Allow request
  };
}

// Pre-configured rate limiters
export const apiRateLimit = rateLimit({ limit: 100, windowMs: 60 * 1000 });
export const authRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, keyPrefix: 'auth' });
export const exportRateLimit = rateLimit({ limit: 10, windowMs: 60 * 1000, keyPrefix: 'export' });
