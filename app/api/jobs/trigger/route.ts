import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['ADMIN', 'SUPERVISOR']);
    const body = await req.json();

    const { type, startTime, endTime } = body;

    if (type === 'ingestion') {
      // Dynamically import to avoid bundling BullMQ in Next.js
      const { ingestionQueue } = await import('@/worker/queues');

      const start = startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const end = endTime ? new Date(endTime) : new Date();

      const job = await ingestionQueue.add('manual-ingestion' as string, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        triggeredBy: session.user.id,
      });

      await createAuditLog({
        userId: session.user.id,
        action: AuditActions.CREATE,
        resource: 'ingestion_job',
        resourceId: job.id?.toString(),
        details: { startTime: start.toISOString(), endTime: end.toISOString() },
        ipAddress: getIpAddress(req),
      });

      return NextResponse.json({ success: true, jobId: job.id });
    }

    return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
