import NextAuth, { type DefaultSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import * as bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// Extend NextAuth types
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

/** Fix-6: Re-validate role and active status from DB at most every 15 minutes. */
const ROLE_REVALIDATION_INTERVAL_MS = 15 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) {
          throw new Error('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Invalid credentials');
        }

        // Log the login action
        try {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              resource: 'auth',
              details: { method: 'credentials', email: user.email },
            },
          });
        } catch (error) {
          console.error('Failed to create audit log:', error);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as string,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in, populate token from the user object
      if (user) {
        token.id = user.id as string;
        token.role = user.role as string;
        token.roleCheckedAt = Date.now();
        return token;
      }

      // Fix-6 (Stale Auth): Re-validate role and active status from DB every 15 min.
      // If the user has been deactivated or their role changed, the session is
      // invalidated immediately rather than waiting for the JWT to expire.
      const now = Date.now();
      const lastCheck = (token.roleCheckedAt as number | undefined) ?? 0;
      if (now - lastCheck > ROLE_REVALIDATION_INTERVAL_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, isActive: true },
          });

          if (!dbUser || !dbUser.isActive) {
            // Returning null from jwt callback invalidates the session
            return null as any;
          }

          token.role = dbUser.role as string;
          token.roleCheckedAt = now;
        } catch (err) {
          // On DB error, keep the existing token rather than logging the user out
          console.error('[Auth] JWT role re-validation failed:', (err as Error).message);
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
