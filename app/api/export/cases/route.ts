import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const cases = await prisma.exportCase.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ cases });
  } catch (error) {
    console.error('Export cases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { label, callIds } = body;

    if (!callIds || !Array.isArray(callIds) || callIds.length === 0) {
      return NextResponse.json({ error: 'callIds array is required' }, { status: 400 });
    }

    const exportCase = await prisma.exportCase.create({
      data: {
        label: label ?? null,
        callIds,
        status: 'PENDING',
        requestedBy: (session.user as any)?.email ?? null,
      },
    });

    // TODO: enqueue BullMQ job to build the export package
    // await exportQueue.add('build-export', { caseId: exportCase.id });

    return NextResponse.json({ exportCase }, { status: 201 });
  } catch (error) {
    console.error('Export cases POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
