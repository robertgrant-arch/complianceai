import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { getSignedDownloadUrl } from '@/lib/s3';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();

    const call = await prisma.callRecord.findUnique({
      where: { id: params.id },
      select: { id: true, s3Key: true, agentName: true, five9CallId: true },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    if (!call.s3Key) {
      return NextResponse.json({ error: 'No recording available for this call' }, { status: 404 });
    }

    // Generate presigned URL (valid for 1 hour)
    const url = await getSignedDownloadUrl(call.s3Key, undefined, 3600);

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.READ,
      resource: 'call_audio',
      resourceId: params.id,
      details: { s3Key: call.s3Key },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ url, expiresIn: 3600 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
