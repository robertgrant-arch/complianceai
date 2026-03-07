/**
 * app/api/users/route.ts
 *
 * User Management API - ADMIN only.
 * GET  /api/users   - List all users (excludes password hash)
 * POST /api/users   - Create a new user (with password OR Google SSO)
 *
 * FIX: POST now accepts optional password field for credential-based login
 * FIX: Role enum aligned with Prisma UserRole
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole, ApiError } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { NextRequest } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '@/auth';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const CreateUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AUDITOR', 'VIEWER']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const session = await requireRole('ADMIN');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ users });
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN');

    const body = await req.json();
    const parsed = CreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, name, role, password } = parsed.data;

    // Check for duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password if provided, otherwise use Google SSO placeholder
    let hashedPassword = '__GOOGLE_SSO__';
    if (password) {
      hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: role as any,
        password: hashedPassword,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.CREATE,
      resource: 'user',
      resourceId: user.id,
      details: {
        email,
        name,
        role,
        authMethod: password ? 'credentials' : 'google_sso',
        createdBy: session.user.email,
      },
    });

    return Response.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }
}
