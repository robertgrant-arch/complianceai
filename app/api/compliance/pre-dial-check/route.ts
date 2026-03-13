import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkDnc, checkTimezone, checkFrequency, checkConsent } from '@/lib/compliance-rules';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { phone, campaignId, agentId, leadId, leadSource, state, lastContactedAt, consentFlags } = body;

    if (!phone || !campaignId) {
      return NextResponse.json({ error: 'phone and campaignId are required' }, { status: 400 });
    }

    const violations = [
      ...(await checkDnc({ phone })),
      ...(await checkTimezone({ phone, state })),
      ...(await checkFrequency({ phone, campaignId, lastContactedAt })),
      ...(await checkConsent({ phone, campaignId, state, consentFlags })),
    ];

    const allowed = violations.length === 0;

    // Log the check
    await prisma.preDialCheck.create({
      data: {
        phone,
        agentId: agentId ?? null,
        campaignId: campaignId ?? null,
        leadSource: leadSource ?? null,
        state: state ?? null,
        allowed,
        violations,
      },
    });

    return NextResponse.json({ allowed, violations });
  } catch (error) {
    console.error('Pre-dial check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    const limit = parseInt(searchParams.get('limit') ?? '50');

    const checks = await prisma.preDialCheck.findMany({
      where: phone ? { phone } : undefined,
      orderBy: { checkedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ checks });
  } catch (error) {
    console.error('Pre-dial check GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
