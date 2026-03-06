/**
 * auth.ts
 *
 * FIX: HIGH-5
 *   - bcrypt cost factor raised to 12 (was default ~10)
 *   - Account lockout after 5 consecutive failures (15-minute window)
 *   - Timing-safe: same error message for "user not found" and "wrong password"
 *   - Lockout fields (failedLoginCount, lockedUntil) read from DB; login resets them on success
 *
 * Prisma schema additions required:
 *   model User {
 *     ...
 *     failedLoginCount  Int       @default(0)
 *     lockedUntil       DateTime?
 *   }
 *
 * Run:  npx prisma migrate dev --name add_login_lockout_fields
 */

import NextAuth, { type DefaultSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Type augmentation
// ---------------------------------------------------------------------------
declare module 'next-auth' {
  interface User {
    id: string;
    role: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    } & DefaultSession['user'];
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often the JWT callback re-fetches role from the DB. */
const ROLE_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * FIX: HIGH-5 — Cost factor raised from default 10 to 12.
 *
 * Cost 12 ≈ ~250 ms on a modern server, making brute-force infeasible
 * while staying well within acceptable login latency.
 * Use this constant everywhere passwords are hashed (registration,
 * password-reset) so the value stays in sync.
 */
export const BCRYPT_ROUNDS = 12;

/** How many consecutive failures trigger a lockout. */
const MAX_FAILED_ATTEMPTS = 5;

/** How long an account stays locked after MAX_FAILED_ATTEMPTS failures. */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Adds `ms` milliseconds to `date`. */
function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

/**
 * Increments the failed-login counter and, once the threshold is reached,
 * sets `lockedUntil`. Always returns the same opaque error so callers
 * cannot distinguish "unknown user" from "wrong password".
 *
 * FIX: MED-5 (partial) — opaque error message, no role/account detail leaked.
 */
async function recordFailedAttempt(userId: string, currentCount: number): Promise<never> {
  const newCount = currentCount + 1;
  const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: newCount,
      ...(shouldLock ? { lockedUntil: addMs(new Date(), LOCKOUT_DURATION_MS) } : {}),
    },
  });

  // Always the same message — no detail about lock state intentionally.
  throw new Error('Invalid credentials');
}

// ---------------------------------------------------------------------------
// NextAuth config
// ---------------------------------------------------------------------------
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        // ── 1. Input guard ────────────────────────────────────────────────
        if (!credentials?.email || !credentials?.password) {
          // Throw the same message as all other auth failures.
          throw new Error('Invalid credentials');
        }

        // ── 2. User lookup ────────────────────────────────────────────────
        // Select only the columns we need; never pull the full row.
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          select: {
            id:               true,
            email:            true,
            name:             true,
            role:             true,
            password:         true,
            isActive:         true,
            failedLoginCount: true,
            lockedUntil:      true,
          },
        });

        // FIX: HIGH-5 — If the user doesn't exist, run a dummy bcrypt compare
        // so response timing is indistinguishable from a wrong-password path.
        if (!user) {
          await bcrypt.compare(
            credentials.password as string,
            // Dummy hash for a 12-round bcrypt — never matches.
            '$2a$12$invalidhashpaddingtomatchcostfactorXXXXXXXXXXXXXXXXXXXX'
          );
          throw new Error('Invalid credentials');
        }

        // ── 3. Lockout check ──────────────────────────────────────────────
        // FIX: HIGH-5 — Reject before bcrypt if account is locked.
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          // Do NOT reveal lock expiry or failed count in the message.
          throw new Error('Invalid credentials');
        }

        // ── 4. Active check ───────────────────────────────────────────────
        if (!user.isActive) {
          // Timing-safe: still run bcrypt so disabled accounts don't leak
          // via a faster response.
          await bcrypt.compare(
            credentials.password as string,
            '$2a$12$invalidhashpaddingtomatchcostfactorXXXXXXXXXXXXXXXXXXXX'
          );
          throw new Error('Invalid credentials');
        }

        // ── 5. Password verification ──────────────────────────────────────
        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          // FIX: HIGH-5 — Record failure and conditionally lock.
          await recordFailedAttempt(user.id, user.failedLoginCount);
          // recordFailedAttempt always throws; this line is unreachable.
        }

        // ── 6. Successful login — reset counter ───────────────────────────
        // Run in the background; do not block the response.
        prisma.user
          .update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockedUntil: null },
          })
          .catch((err: unknown) => {
            console.error('[Auth] Failed to reset login counter:', err);
          });

        // ── 7. Audit log ──────────────────────────────────────────────────
        prisma.auditLog
          .create({
            data: {
              userId:   user.id,
              action:   'LOGIN',
              resource: 'auth',
              details:  { method: 'credentials', email: user.email },
            },
          })
          .catch((err: unknown) => {
            console.error('[Auth] Failed to create audit log:', err);
          });

        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
          role:  user.role as string,
        };
      },
    }),
  ],

  callbacks: {
    // ── JWT callback ─────────────────────────────────────────────────────
    async jwt({ token, user }) {
      // Initial sign-in: seed the token from the user object.
      if (user) {
        token.id            = user.id   as string;
        token.role          = user.role as string;
        token.roleCheckedAt = Date.now();
        return token;
      }

      // Subsequent requests: revalidate role & active status on interval.
      const now       = Date.now();
      const lastCheck = (token.roleCheckedAt as number | undefined) ?? 0;

      if (now - lastCheck > ROLE_REVALIDATION_INTERVAL_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where:  { id: token.id as string },
            select: { role: true, isActive: true },
          });

          if (!dbUser || !dbUser.isActive) {
            // Forces NextAuth to destroy the session.
            return null as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          }

          token.role          = dbUser.role as string;
          token.roleCheckedAt = now;
        } catch (err) {
          // Do not invalidate a valid session on a transient DB error;
          // log and carry forward the existing token.
          console.error(
            '[Auth] JWT role re-validation failed:',
            (err as Error).message
          );
        }
      }

      return token;
    },

    // ── Session callback ─────────────────────────────────────────────────
    async session({ session, token }) {
      if (token) {
        session.user.id   = token.id   as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge:   24 * 60 * 60, // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
});
