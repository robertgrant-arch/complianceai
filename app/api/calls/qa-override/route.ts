import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { auditResultId, overallScore, comment } = body;

    if (!auditResultId) return NextResponse.json({ error: 'auditResultId is required' }, { status: 400 });

    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    const override = await prisma.qAOverride.create({
      data: {
        auditResultId,
        userId,
        overallScore: overallScore ?? null,
        comment: comment ?? null,
      },
    });

    return NextResponse.json({ override }, { status: 201 });
  } catch (error) {
    console.error('QA Override POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const auditResultId = searchParams.get('auditResultId');

    const overrides = await prisma.qAOverride.findMany({
      where: auditResultId ? { auditResultId } : undefined,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ overrides });
  } catch (error) {
    console.error('QA Override GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
