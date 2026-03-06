/**
 * lib/api-handler.ts
 *
 * Shared API route wrapper that handles:
 *  - Rate limiting
 *  - Authentication / role checking
 *  - Zod input validation (query params or JSON body)
 *  - Consistent error serialisation
 *
 * Usage:
 *   export const GET = apiHandler({ auth: true }, async (req, ctx) => { ... });
 *   export const POST = apiHandler({ auth: true, roles: ['ADMIN'], bodySchema: MySchema }, async (req, ctx) => { ... });
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';
import { requireAuth, requireRole } from './auth-helpers';
import { apiRateLimit } from './rate-limit';

export interface ApiHandlerOptions<TBody = unknown, TQuery = unknown> {
  /** Require a valid session (default: true) */
  auth?: boolean;
  /** Restrict to specific roles. Implies auth: true. */
  roles?: string[];
  /** Zod schema to validate the JSON request body */
  bodySchema?: ZodSchema<TBody>;
  /** Zod schema to validate URL search params (values are always strings) */
  querySchema?: ZodSchema<TQuery>;
  /** Skip rate limiting (default: false) */
  skipRateLimit?: boolean;
}

export interface ApiContext<TBody = unknown, TQuery = unknown> {
  session: Awaited<ReturnType<typeof requireAuth>>;
  body: TBody;
  query: TQuery;
}

type RouteHandler<TBody, TQuery> = (
  req: NextRequest,
  ctx: ApiContext<TBody, TQuery>,
  routeParams?: Record<string, string>,
) => Promise<NextResponse>;

export function apiHandler<TBody = unknown, TQuery = unknown>(
  options: ApiHandlerOptions<TBody, TQuery>,
  handler: RouteHandler<TBody, TQuery>,
) {
  return async (req: NextRequest, routeContext?: { params?: Record<string, string> }) => {
    // ── Rate limiting ──────────────────────────────────────────────────────────
    if (!options.skipRateLimit) {
      const limited = await apiRateLimit(req);
      if (limited) return limited;
    }

    // ── Auth ───────────────────────────────────────────────────────────────────
    let session: Awaited<ReturnType<typeof requireAuth>>;
    try {
      if (options.roles && options.roles.length > 0) {
        session = await requireRole(options.roles as any);
      } else if (options.auth !== false) {
        session = await requireAuth();
      } else {
        // Public route – create a minimal stub so ctx.session is always defined
        session = null as any;
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || 'Unauthorized' },
        { status: err.statusCode || 401 },
      );
    }

    // ── Body validation ────────────────────────────────────────────────────────
    let body = {} as TBody;
    if (options.bodySchema) {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const result = options.bodySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { error: 'Validation error', issues: result.error.flatten().fieldErrors },
          { status: 422 },
        );
      }
      body = result.data;
    }

    // ── Query validation ───────────────────────────────────────────────────────
    let query = {} as TQuery;
    if (options.querySchema) {
      const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
      const result = options.querySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { error: 'Invalid query parameters', issues: result.error.flatten().fieldErrors },
          { status: 422 },
        );
      }
      query = result.data;
    }

    // ── Handler ────────────────────────────────────────────────────────────────
    try {
      return await handler(req, { session, body, query }, routeContext?.params);
    } catch (err: any) {
      console.error('[API Error]', req.method, req.url, err);
      return NextResponse.json(
        { error: err.message || 'Internal server error' },
        { status: err.statusCode || 500 },
      );
    }
  };
}
