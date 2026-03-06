/**
 * app/api/keywords/route.ts
 *
 * H-01: Keywords are stored as a JSON array on KeywordList.keywords.
 * There is no separate Keyword model — all CRUD operates on the JSON field.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export async function GET(_req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);

    // H-01: keywords is a JSON field — no include/relation needed
    const lists = await prisma.keywordList.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Compute keyword count from JSON array length for the UI
    const listsWithCount = lists.map((list) => ({
      ...list,
      keywordCount: Array.isArray(list.keywords) ? (list.keywords as unknown[]).length : 0,
    }));

    return NextResponse.json({ lists: listsWithCount });
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

    // H-01: Create with empty keywords JSON array
    const list = await prisma.keywordList.create({
      data: {
        name,
        description,
        type,
        isActive: isActive ?? true,
        keywords: [],
      },
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.CREATE,
      resource: 'keyword_list',
      resourceId: list.id,
      details: { name, type },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ ...list, keywordCount: 0 }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
