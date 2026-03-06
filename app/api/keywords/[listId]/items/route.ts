/**
 * app/api/keywords/[listId]/items/route.ts
 *
 * H-01: Individual keyword add/remove operations.
 * Since keywords are stored as a JSON array on KeywordList, we:
 *   POST  → read the list, push a new item with a generated id, write back
 *   DELETE → read the list, filter out the item by id, write back
 *
 * This avoids a separate Keyword table and join overhead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { randomUUID } from 'crypto';

interface KeywordItem {
  id: string;
  word: string;
  isCaseSensitive: boolean;
  isRegex: boolean;
  createdAt: string;
}

export async function POST(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const { word, isCaseSensitive, isRegex } = body;
    if (!word?.trim()) {
      return NextResponse.json({ error: 'Word is required' }, { status: 400 });
    }

    const list = await prisma.keywordList.findUnique({ where: { id: params.listId } });
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const keywords = (list.keywords as unknown as KeywordItem[]) || [];

    // Check for duplicate (case-insensitive)
    const duplicate = keywords.find(
      (k) => k.word.toLowerCase() === word.trim().toLowerCase(),
    );
    if (duplicate) {
      return NextResponse.json({ error: 'Keyword already exists in this list' }, { status: 409 });
    }

    const newItem: KeywordItem = {
      id: randomUUID(),
      word: word.trim(),
      isCaseSensitive: isCaseSensitive ?? false,
      isRegex: isRegex ?? false,
      createdAt: new Date().toISOString(),
    };

    const updatedKeywords = [...keywords, newItem];

    await prisma.keywordList.update({
      where: { id: params.listId },
      data: { keywords: updatedKeywords as any },
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.CREATE,
      resource: 'keyword',
      resourceId: newItem.id,
      details: { word: newItem.word, listId: params.listId },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json(newItem, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { listId: string } }) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();
    const { keywordId } = body;

    if (!keywordId) {
      return NextResponse.json({ error: 'keywordId is required' }, { status: 400 });
    }

    const list = await prisma.keywordList.findUnique({ where: { id: params.listId } });
    if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 });

    const keywords = (list.keywords as unknown as KeywordItem[]) || [];
    const filtered = keywords.filter((k) => k.id !== keywordId);

    if (filtered.length === keywords.length) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
    }

    await prisma.keywordList.update({
      where: { id: params.listId },
      data: { keywords: filtered as any },
    });

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
