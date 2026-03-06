import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth'];

// Role-based route access
const roleRoutes: Record<string, string[]> = {
  '/settings': ['ADMIN', 'SUPERVISOR'],
  '/settings/keywords': ['ADMIN', 'SUPERVISOR'],
  '/settings/retention': ['ADMIN'],
  '/settings/audit-log': ['ADMIN', 'SUPERVISOR'],
  '/api/settings': ['ADMIN', 'SUPERVISOR'],
  '/api/keywords': ['ADMIN', 'SUPERVISOR'],
  '/api/retention': ['ADMIN'],
  '/api/audit-log': ['ADMIN', 'SUPERVISOR'],
};

export default auth((req) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: any };
  const pathname = nextUrl.pathname;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL('/login', nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access
  const userRole = session.user?.role;
  for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(route) && !allowedRoles.includes(userRole)) {
      // Redirect to dashboard with error for unauthorized access
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
