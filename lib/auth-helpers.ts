import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'AUDITOR' | 'VIEWER';
export type RoleCheck = UserRole | UserRole[];

/**
 * Get current session on server side
 */
export async function getSession() {
  return await auth();
}

/**
 * Require authentication for API routes
 * Returns session or throws 401
 */
export async function requireAuth(req?: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError('Unauthorized', 401);
  }
  return session;
}

/**
 * Require specific role(s) for API routes
 */
export async function requireRole(roles: RoleCheck) {
  const session = await requireAuth();
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  if (!allowedRoles.includes(session.user.role as UserRole)) {
    throw new AuthError('Forbidden: Insufficient permissions', 403);
  }

  return session;
}

/**
 * Check if user has required role
 */
export function hasRole(userRole: string, requiredRoles: RoleCheck): boolean {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.includes(userRole as UserRole);
}

/**
 * Role hierarchy: ADMIN > SUPERVISOR > AUDITOR > VIEWER
 */
export function hasMinimumRole(userRole: string, minimumRole: UserRole): boolean {
  const hierarchy: Record<UserRole, number> = {
    ADMIN: 4,
    SUPERVISOR: 3,
    AUDITOR: 2,
    VIEWER: 1,
  };
  return (hierarchy[userRole as UserRole] || 0) >= hierarchy[minimumRole];
}

/**
 * API route wrapper with auth and role check
 */
export function withAuth(
  handler: (req: NextRequest, session: any) => Promise<NextResponse>,
  requiredRole?: RoleCheck
) {
  return async (req: NextRequest) => {
    try {
      const session = requiredRole
        ? await requireRole(requiredRole)
        : await requireAuth();
      return await handler(req, session);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }
      console.error('API route error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
