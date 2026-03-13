import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const rules = await prisma.alertRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Alert rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const { name, description, pattern, severity, campaigns } = body;

    if (!name || !pattern) return NextResponse.json({ error: 'name and pattern are required' }, { status: 400 });

    const rule = await prisma.alertRule.create({
      data: {
        name,
        description: description ?? null,
        pattern,
        severity: severity ?? 'WARNING',
        campaigns: campaigns ?? [],
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Alert rules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const { id, isActive } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const rule = await prisma.alertRule.update({
      where: { id },
      data: { isActive },
    });

    return NextResponse.json({ rule });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Alert rules PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
