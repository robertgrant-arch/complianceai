import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { prisma } from '@/lib/prisma';
import { checkDnc, checkTimezone, checkFrequency, checkConsent } from '@/lib/compliance-rules';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

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
        allowed,
        violations: violations as any,
      },
    });

    return NextResponse.json({ allowed, violations });
  } catch (error: any) {
    if (error?.name === 'ApiError') return error.toResponse();
    console.error('Pre-dial check error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
