import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { getSignedDownloadUrl } from '@/lib/s3';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();

    const call = await prisma.callRecord.findUnique({
      where: { id: params.id },
      include: {
        transcript: true,
        auditResult: {
          include: {
            auditFlags: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Generate presigned URL for audio if s3Key exists
    let audioUrl: string | null = null;
    if (call.s3Key) {
      try {
        audioUrl = await getSignedDownloadUrl(call.s3Key);
      } catch (err) {
        console.error('Failed to generate presigned URL:', err);
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.READ,
      resource: 'call',
      resourceId: params.id,
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ ...call, audioUrl });
  } catch (error: any) {
    console.error('Call GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const body = await req.json();

    const call = await prisma.callRecord.findUnique({
      where: { id: params.id },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Allowed fields to update
    const allowedFields = ['notes', 'reviewedBy', 'reviewedAt', 'disposition'];
    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Auto-set reviewer
    if (body.reviewed === true) {
      updateData.reviewedBy = session.user.id;
      updateData.reviewedAt = new Date();
    }

    const updated = await prisma.callRecord.update({
      where: { id: params.id },
      data: updateData,
    });

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'call',
      resourceId: params.id,
      details: { updatedFields: Object.keys(updateData) },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Call PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}
