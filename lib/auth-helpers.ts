/**
 * lib/auth-helpers.ts
 *
 * Server-side authentication and authorisation helpers for Route Handlers
 * and Server Actions.
 */
import { auth } from '@/auth';
import type { Session } from 'next-auth';

// Types
export type Role = 'VIEWER' | 'AUDITOR' | 'SUPERVISOR' | 'ADMIN';

/** Ordered from least to most privileged - matches Prisma UserRole enum. */
const ROLE_HIERARCHY: Role[] = ['VIEWER', 'AUDITOR', 'SUPERVISOR', 'ADMIN'];

// ApiError
export class ApiError extends Error {
  constructor(
    public readonly status: number,
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

// Role helpers
export function hasRole(userRole: string | undefined, required: Role): boolean {
  if (!userRole) return false;
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);
  if (userIdx === -1 || requiredIdx === -1) return false;
  return userIdx >= requiredIdx;
}

// requireAuth
export async function requireAuth(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, 'Unauthorized');
  }
  return session;
}

// requireRole - accepts a single Role OR an array of Roles
export async function requireRole(minRole: Role | Role[]): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, 'Unauthorized');
  }

  // If an array is passed, check if user has ANY of the listed roles (exact match or higher)
  if (Array.isArray(minRole)) {
    const hasAny = minRole.some((role) => hasRole(session.user.role, role));
    if (!hasAny) {
      throw new ApiError(403, 'Forbidden');
    }
  } else {
    if (!hasRole(session.user.role, minRole)) {
      throw new ApiError(403, 'Forbidden');
    }
  }

  return session;
}

// withAuth / withRole wrappers
type RouteHandler = (
  req: Request,
  context: { params: Record<string, string> },
  session: Session
) => Promise<Response>;

export function withAuth(handler: RouteHandler) {
  return async (req: Request, context: { params: Record<string, string> }) => {
    try {
      const session = await requireAuth();
      return await handler(req, context, session);
    } catch (err) {
      if (err instanceof ApiError) return err.toResponse();
      throw err;
    }
  };
}

export function withRole(minRole: Role | Role[], handler: RouteHandler) {
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
