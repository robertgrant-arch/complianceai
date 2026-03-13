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
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '25');

    const where = {
      ...(agentId ? { agentId } : {}),
      ...(status ? { status: status as any } : {}),
    };

    const [tasks, total] = await Promise.all([
      prisma.coachingTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { callRecord: { select: { id: true, agentName: true, campaignName: true, startTime: true } } },
      }),
      prisma.coachingTask.count({ where }),
    ]);

    return NextResponse.json({ tasks, total, page, limit });
  } catch (error) {
    console.error('Coaching GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { agentId, callRecordId, ruleCode, title, description, assignedToId, dueAt } = body;

    if (!agentId || !title) return NextResponse.json({ error: 'agentId and title are required' }, { status: 400 });

    const task = await prisma.coachingTask.create({
      data: {
        agentId,
        callRecordId: callRecordId ?? null,
        ruleCode: ruleCode ?? null,
        title,
        description: description ?? null,
        assignedToId: assignedToId ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Coaching POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });

    const task = await prisma.coachingTask.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Coaching PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
