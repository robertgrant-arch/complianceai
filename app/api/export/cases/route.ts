import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const cases = await prisma.exportCase.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ cases });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Export cases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await req.json();
    const { label, callIds } = body;

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return NextResponse.json({ error: 'callIds array is required' }, { status: 400 });
    }

    const exportCase = await prisma.exportCase.create({
      data: {
        label: label ?? `Export ${new Date().toISOString()}`,
        callIds,
        createdBy: (session.user as any)?.id ?? 'unknown',
      },
    });

    return NextResponse.json({ exportCase }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Export cases POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
