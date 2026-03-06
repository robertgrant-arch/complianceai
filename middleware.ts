/**
 * middleware.ts
 *
 * FIX: LOW-4 — Static assets explicitly excluded from the auth matcher.
 * FIX: MED-5 (partial) — redirects use generic /login?error=auth rather than
 * exposing the required role or current role in the redirect URL.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';

// ---------------------------------------------------------------------------
// Route → minimum required role mapping
// ---------------------------------------------------------------------------

type Role = 'AGENT' | 'SUPERVISOR' | 'ADMIN' | 'SUPER_ADMIN';

/** Ordered from least to most privileged for the hasRole() check below. */
const ROLE_HIERARCHY: Role[] = ['AGENT', 'SUPERVISOR', 'ADMIN', 'SUPER_ADMIN'];

const PROTECTED_ROUTES: Array<{ prefix: string; minRole: Role }> = [
  { prefix: '/api/settings', minRole: 'ADMIN' },
  { prefix: '/settings', minRole: 'ADMIN' },
  { prefix: '/api/admin', minRole: 'SUPER_ADMIN' },
  { prefix: '/admin', minRole: 'SUPER_ADMIN' },
  { prefix: '/api/calls', minRole: 'AGENT' },
  { prefix: '/api/reports', minRole: 'SUPERVISOR' },
  { prefix: '/reports', minRole: 'SUPERVISOR' },
  { prefix: '/dashboard', minRole: 'AGENT' },
];

function hasRole(userRole: string | undefined, required: Role): boolean {
  if (!userRole) return false;
  const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);
  if (userIdx === -1 || requiredIdx === -1) return false;
  return userIdx >= requiredIdx;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const match = PROTECTED_ROUTES.find(({ prefix }) => pathname.startsWith(prefix));
  if (!match) return NextResponse.next();

  const session = await auth();

  if (!session?.user) {
    // FIX: MED-5 — Do not include pathname or role detail in the error param.
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'auth');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!hasRole(session.user.role, match.minRole)) {
    // FIX: MED-5 — Redirect to a generic forbidden page.
    const forbiddenUrl = new URL('/forbidden', req.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  const response = NextResponse.next();
  response.headers.set('x-user-id', session.user.id);
  response.headers.set('x-user-role', session.user.role);
  return response;
}

// ---------------------------------------------------------------------------
// Matcher — FIX: LOW-4
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|public/|api/csp-report|login|forbidden).*)',
  ],
};
