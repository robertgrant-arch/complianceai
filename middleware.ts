import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication.
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

/**
 * Fix-4 (Auth Bypass): A route is public only if the pathname is an exact
 * match OR starts with the route followed by '/'. This prevents a path such
 * as "/login-evil" from matching the "/login" allowlist entry via startsWith.
 */
function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

export default auth((req) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: any };
  const pathname = nextUrl.pathname;

  // Allow public routes (Fix-4: exact or prefix-with-slash match)
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!session) {
    const loginUrl = new URL('/login', nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access — also use exact-or-prefix-slash matching (Fix-4)
  const userRole = session.user?.role;
  for (const [route, allowedRoles] of Object.entries(roleRoutes)) {
    if (
      (pathname === route || pathname.startsWith(route + '/')) &&
      !allowedRoles.includes(userRole)
    ) {
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized', nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
