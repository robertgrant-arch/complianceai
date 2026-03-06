/**
 * app/api/keywords/[listId]/route.ts
 *
 * H-01: Keywords are stored as a JSON array on KeywordList.keywords.
 * No include/relation needed — keywords are part of the KeywordList row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);

    const list = await prisma.keywordList.findUnique({
      where: { id: params.listId },
    });

    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      ...list,
      keywordCount: Array.isArray(list.keywords) ? (list.keywords as unknown[]).length : 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    // H-01: Allow replacing the full keywords JSON array
    if (body.keywords !== undefined) updateData.keywords = body.keywords;

    const list = await prisma.keywordList.update({
      where: { id: params.listId },
      data: updateData,
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'keyword_list',
      resourceId: params.listId,
      details: { fields: Object.keys(updateData) },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({
      ...list,
      keywordCount: Array.isArray(list.keywords) ? (list.keywords as unknown[]).length : 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN']);

    await prisma.keywordList.delete({ where: { id: params.listId } });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.DELETE,
      resource: 'keyword_list',
      resourceId: params.listId,
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
