/**
 * app/api/users/[id]/route.ts
 *
 * User Management API — single user operations, ADMIN only.
 * PATCH /api/users/:id  — Update user role, active status, or password
 * DELETE /api/users/:id — Delete a user (cannot delete yourself)
 *
 * FIX: Added password reset support for admins
 * FIX: Role enum aligned with Prisma UserRole
 * FEAT: Added DELETE endpoint for user removal
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole, ApiError } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { NextRequest } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '@/auth';

export const dynamic = 'force-dynamic';

const UpdateUserSchema = z.object({
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AUDITOR', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = params;
    const body = await req.json();
    const parsed = UpdateUserSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Prevent admin from deactivating themselves
    if (id === session.user.id && parsed.data.isActive === false) {
      return Response.json(
        { error: 'You cannot deactivate your own account' },
        { status: 400 }
      );
    }

    // Prevent admin from demoting themselves
    if (id === session.user.id && parsed.data.role && parsed.data.role !== 'ADMIN') {
      return Response.json(
        { error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const updateData: any = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.password) {
      updateData.password = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'user',
      resourceId: user.id,
      details: {
        changes: {
          ...parsed.data,
          password: parsed.data.password ? '[REDACTED]' : undefined,
        },
        previousRole: existing.role,
        previousIsActive: existing.isActive,
        updatedBy: session.user.email,
      },
    });

    return Response.json({ user });
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole('ADMIN');
    const { id } = params;

    // Prevent admin from deleting themselves
    if (id === session.user.id) {
      return Response.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.user.delete({ where: { id } });

    // Audit log
    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.DELETE,
      resource: 'user',
      resourceId: id,
      details: {
        deletedUser: {
          email: existing.email,
          name: existing.name,
          role: existing.role,
        },
        deletedBy: session.user.email,
      },
    });

    return Response.json({ success: true, message: `User ${existing.email} deleted` });
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    throw err;
  }
}
