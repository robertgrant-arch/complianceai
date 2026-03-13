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
    const { callRecordId, phone, agentId, channel, consentGiven, wording, state, campaignId } = body;

    if (!phone || !agentId || consentGiven === undefined) {
      return NextResponse.json({ error: 'phone, agentId, and consentGiven are required' }, { status: 400 });
    }

    const event = await prisma.consentEvent.create({
      data: {
        callRecordId: callRecordId ?? null,
        phone,
        agentId,
        channel: channel ?? 'VOICE',
        consentGiven,
        wording: wording ?? null,
        state: state ?? null,
        campaignId: campaignId ?? null,
      },
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Consent event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const events = await prisma.consentEvent.findMany({
      where: {
        ...(phone ? { phone } : {}),
        ...(agentId ? { agentId } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Consent event GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
