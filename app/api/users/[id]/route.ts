/**
 * app/api/users/[id]/route.ts
 *
 * User Management API — single user operations, ADMIN only.
 * PATCH /api/users/:id  — Update user role or active status
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole, ApiError } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const UpdateUserSchema = z.object({
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AUDITOR', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
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
        changes: parsed.data,
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
