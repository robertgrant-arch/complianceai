import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

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
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('QA Override POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
