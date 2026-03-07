/**
 * auth.ts
 *
 * FIX: HIGH-5
 * - bcrypt cost factor raised to 12 (was default ~10)
 * - Account lockout after 5 consecutive failures (15-minute window)
 * - Timing-safe: same error message for "user not found" and "wrong password"
 * - Lockout fields (failedLoginCount, lockedUntil) read from DB; login resets them on success
 *
 * FIX: GoogleProvider is now OPTIONAL
 * - Only registered when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both set
 * - Credentials login works without Google OAuth configured
 *
 * FIX: Role hierarchy aligned with DB enum
 * - Uses VIEWER | AUDITOR | SUPERVISOR | ADMIN (matching Prisma UserRole)
 * - Removed references to AGENT and SUPER_ADMIN
 */
import NextAuth, { type DefaultSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
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
const ROLE_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export const BCRYPT_ROUNDS = 12;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

async function recordFailedAttempt(userId: string, currentCount: number): Promise<never> {
  const newCount = currentCount + 1;
  const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: newCount,
      ...(shouldLock
        ? { lockedUntil: addMs(new Date(), LOCKOUT_DURATION_MS) }
        : {}),
    },
  });

  throw new Error('Invalid credentials');
}

// ---------------------------------------------------------------------------
// Build providers dynamically — GoogleProvider only if env vars exist
// ---------------------------------------------------------------------------
function buildProviders() {
  const providers: any[] = [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            password: true,
            isActive: true,
            failedLoginCount: true,
            lockedUntil: true,
          },
        });

        if (!user) {
          await bcrypt.compare(
            credentials.password as string,
            '$2a$12$invalidhashpaddingtomatchcostfactorXXXXXXXXXXXXXXXXXXXX'
          );
          throw new Error('Invalid credentials');
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Invalid credentials');
        }

        if (!user.isActive) {
          await bcrypt.compare(
            credentials.password as string,
            '$2a$12$invalidhashpaddingtomatchcostfactorXXXXXXXXXXXXXXXXXXXX'
          );
          throw new Error('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          await recordFailedAttempt(user.id, user.failedLoginCount);
        }

        // Successful login - reset counter
        prisma.user
          .update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockedUntil: null },
          })
          .catch((err: unknown) => {
            console.error('[Auth] Failed to reset login counter:', err);
          });

        // Audit log
        prisma.auditLog
          .create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              resource: 'auth',
              details: { method: 'credentials', email: user.email },
            },
          })
          .catch((err: unknown) => {
            console.error('[Auth] Failed to create audit log:', err);
          });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as string,
        };
      },
    }),
  ];

  // Only add Google provider if credentials are configured
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  return providers;
}

// ---------------------------------------------------------------------------
// NextAuth config
// ---------------------------------------------------------------------------
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: buildProviders(),

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          select: { id: true, isActive: true },
        });

        if (!dbUser || !dbUser.isActive) {
          return false;
        }

        prisma.auditLog
          .create({
            data: {
              userId: dbUser.id,
              action: 'LOGIN',
              resource: 'auth',
              details: { method: 'google_sso', email: user.email },
            },
          })
          .catch((err: unknown) => {
            console.error('[Auth] Failed to create SSO audit log:', err);
          });

        return true;
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'google') {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
            select: { id: true, role: true },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
          }
        } else {
          token.id = user.id as string;
          token.role = user.role as string;
        }
        token.roleCheckedAt = Date.now();
        return token;
      }

      const now = Date.now();
      const lastCheck = (token.roleCheckedAt as number | undefined) ?? 0;

      if (now - lastCheck > ROLE_REVALIDATION_INTERVAL_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, isActive: true },
          });

          if (!dbUser || !dbUser.isActive) {
            return null as any;
          }

          token.role = dbUser.role as string;
          token.roleCheckedAt = now;
        } catch (err) {
          console.error(
            '[Auth] JWT role re-validation failed:',
            (err as Error).message
          );
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET,
});
