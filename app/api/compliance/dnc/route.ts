import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const where = phone ? { phone: { contains: phone } } : {};

    const [entries, total] = await Promise.all([
      prisma.dncEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dncEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, page, limit });
  } catch (error) {
    console.error('DNC GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { phone, source, reason } = body;

    if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

    const entry = await prisma.dncEntry.upsert({
      where: { phone },
      update: { source: source ?? 'internal', reason: reason ?? null, addedBy: (session.user as any)?.email },
      create: { phone, source: source ?? 'internal', reason: reason ?? null, addedBy: (session.user as any)?.email },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('DNC POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

    await prisma.dncEntry.delete({ where: { phone } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DNC DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
