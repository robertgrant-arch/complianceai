import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const { word, isCaseSensitive, isRegex } = body;
    if (!word) return NextResponse.json({ error: 'Word is required' }, { status: 400 });

    // Check if keyword already exists in this list
    const existing = await prisma.keyword.findFirst({
      where: { listId: params.listId, word: { equals: word, mode: 'insensitive' } },
    });
    if (existing) return NextResponse.json({ error: 'Keyword already exists in this list' }, { status: 409 });

    const keyword = await prisma.keyword.create({
      data: {
        listId: params.listId,
        word,
        isCaseSensitive: isCaseSensitive ?? false,
        isRegex: isRegex ?? false,
      },
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.CREATE,
      resource: 'keyword',
      resourceId: keyword.id,
      details: { word, listId: params.listId },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json(keyword, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();
    const { keywordId } = body;

    if (!keywordId) return NextResponse.json({ error: 'keywordId is required' }, { status: 400 });

    await prisma.keyword.delete({ where: { id: keywordId } });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.DELETE,
      resource: 'keyword',
      resourceId: keywordId,
      details: { listId: params.listId },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
