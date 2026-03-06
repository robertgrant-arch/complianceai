import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);

    const lists = await prisma.keywordList.findMany({
      include: {
        keywords: {
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { keywords: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ lists });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const { name, description, type, isActive } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    const list = await prisma.keywordList.create({
      data: {
        name,
        description,
        type,
        isActive: isActive ?? true,
      },
      include: { keywords: true, _count: { select: { keywords: true } } },
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.CREATE,
      resource: 'keyword_list',
      resourceId: list.id,
      details: { name, type },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json(list, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
