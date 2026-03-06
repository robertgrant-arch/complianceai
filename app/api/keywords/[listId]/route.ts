import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);
    const list = await prisma.keywordList.findUnique({
      where: { id: params.listId },
      include: { keywords: { orderBy: { createdAt: 'asc' } } },
    });
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const list = await prisma.keywordList.update({
      where: { id: params.listId },
      data: {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
      },
      include: { keywords: true, _count: { select: { keywords: true } } },
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'keyword_list',
      resourceId: params.listId,
      details: body,
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json(list);
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
