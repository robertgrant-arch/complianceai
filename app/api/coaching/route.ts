import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    const status = searchParams.get('status');

    const where = {
      ...(agentId ? { agentId } : {}),
      ...(status ? { status: status as any } : {}),
    };

    const tasks = await prisma.coachingTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tasks });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Coaching GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const { agentId, title, description, dueAt } = body;

    if (!agentId || !title) {
      return NextResponse.json({ error: 'agentId and title are required' }, { status: 400 });
    }

    const task = await prisma.coachingTask.create({
      data: {
        agentId,
        title,
        description: description ?? null,
        dueAt: dueAt ? new Date(dueAt) : null,
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Coaching POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const { id, status } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const task = await prisma.coachingTask.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ task });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Coaching PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
