import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

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
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Consent event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
