/**
 * lib/auth-helpers.ts
 *
 * Server-side authentication and authorisation helpers for Route Handlers
 * and Server Actions.
 *
 * FIX: MED-5 — requireRole() previously returned a 403 body that included
 *   the required role ("Required role: ADMIN, your role: AGENT"), leaking
 *   the internal RBAC hierarchy to any authenticated user who probed an
 *   endpoint.  All auth/authz errors now return opaque messages that reveal
 *   no detail about roles, user IDs, or permission structure.
 *
 * Usage in a Route Handler:
 *
 *   export async function GET(req: Request) {
 *     const session = await requireRole('SUPERVISOR');
 *     // session.user is typed and verified
 *     ...
 *   }
 *
 *   export async function PUT(req: Request) {
 *     await requireRole('ADMIN');
 *     ...
 *   }
 */

import { auth } from '@/auth';
import type { Session } from 'next-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role = 'AGENT' | 'SUPERVISOR' | 'ADMIN' | 'SUPER_ADMIN';

/** Ordered from least to most privileged. */
const ROLE_HIERARCHY: Role[] = ['AGENT', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];

// ---------------------------------------------------------------------------
// ApiError — structured error for Route Handlers
// ---------------------------------------------------------------------------

/**
 * Thrown by requireAuth / requireRole when the request should be rejected.
 * Route Handlers should catch this and call `.toResponse()`.
 *
 *   try {
 *     const session = await requireRole('ADMIN');
 *     ...
 *   } catch (err) {
 *     if (err instanceof ApiError) return err.toResponse();
 *     throw err; // let Next.js handle unexpected errors
 *   }
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    // FIX: MED-5 — message is always the opaque string we expose to clients.
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): Response {
    return Response.json(
      { error: this.message },
      { status: this.status }
    );
  }
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `userRole` meets or exceeds `required`.
 * Unknown role strings always return false.
 */
export function hasRole(userRole: string | undefined, required: Role): boolean {
  if (!userRole) return false;
  const userIdx     = ROLE_HIERARCHY.indexOf(userRole as Role);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);
  // If either role is not in the hierarchy, deny.
  if (userIdx === -1 || requiredIdx === -1) return false;
  return userIdx >= requiredIdx;
}

// ---------------------------------------------------------------------------
// requireAuth — authentication only, no role check
// ---------------------------------------------------------------------------

/**
 * Asserts that the current request has a valid session.
 * Returns the session on success.
 *
 * FIX: MED-5 — throws 401 "Unauthorized" with no additional detail.
 * Previous version threw messages like "No session found" or
 * "Session expired" which hinted at server-side session state.
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new ApiError(401, 'Unauthorized');
  }

  return session;
}

// ---------------------------------------------------------------------------
// requireRole — authentication + role authorisation
// ---------------------------------------------------------------------------

/**
 * Asserts that the current request is authenticated AND that the user holds
 * at least `minRole` in the role hierarchy.
 *
 * Returns the session on success.
 *
 * FIX: MED-5 — 401 and 403 responses are opaque.
 *   - 401 "Unauthorized"  → no session / invalid token
 *   - 403 "Forbidden"     → authenticated but insufficient role
 *
 * The required role, the user's actual role, and all RBAC structure are
 * intentionally absent from error responses.  These details are logged
 * server-side for debugging.
 *
 * @param minRole - The minimum role required to proceed.
 *
 * @example
 *   // In a Route Handler:
 *   const session = await requireRole('ADMIN');
 *   // session.user.id, session.user.role, etc. are available here.
 */
export async function requireRole(minRole: Role): Promise<Session> {
  const session = await auth();

  // ── Not authenticated ─────────────────────────────────────────────────
  if (!session?.user?.id) {
    // FIX: MED-5 — Do not reveal whether the session is missing vs expired.
    throw new ApiError(401, 'Unauthorized');
  }

  // ── Insufficient role ─────────────────────────────────────────────────
  if (!hasRole(session.user.role, minRole)) {
    // FIX: MED-5 — Log detail internally for debugging, but throw an opaque error.
    // Never include `minRole`, `session.user.role`, or any RBAC detail in the
    // thrown message — it will surface in API responses.
    console.warn(
      `[Auth] requireRole("${minRole}"): user ${session.user.id} ` +
        `has role "${session.user.role}" — access denied.`
    );
    throw new ApiError(403, 'Forbidden');
  }

  return session;
}

// ---------------------------------------------------------------------------
// withAuth / withRole — higher-order wrappers for Route Handlers
// ---------------------------------------------------------------------------

type RouteHandler = (
  req:     Request,
  context: { params: Record<string, string> },
  session: Session
) => Promise<Response>;

/**
 * Wraps a Route Handler requiring authentication only.
 *
 * @example
 *   export const GET = withAuth(async (req, context, session) => {
 *     return Response.json({ userId: session.user.id });
 *   });
 */
export function withAuth(handler: RouteHandler) {
  return async (req: Request, context: { params: Record<string, string> }) => {
    try {
      const session = await requireAuth();
      return await handler(req, context, session);
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      // Re-throw unexpected errors for Next.js error handling.
      throw err;
    }
  };
}

/**
 * Wraps a Route Handler requiring a minimum role.
 *
 * @example
 *   export const DELETE = withRole('ADMIN', async (req, context, session) => {
 *     // Only ADMIN and SUPER_ADMIN reach here.
 *     ...
 *   });
 */
export function withRole(minRole: Role, handler: RouteHandler) {
  return async (req: Request, context: { params: Record<string, string> }) => {
    try {
      const session = await requireRole(minRole);
      return await handler(req, context, session);
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      throw err;
    }
  };
}
