import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['ADMIN']);

    // Get retention settings
    const settings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: 'retention_' } },
    });

    const retentionDays = parseInt(
      settings.find((s) => s.key === 'retention_days')?.value || '365'
    );
    const deleteAudio = settings.find((s) => s.key === 'retention_delete_audio')?.value === 'true';
    const deleteTranscripts = settings.find((s) => s.key === 'retention_delete_transcripts')?.value === 'true';

    // Count records that would be affected
    const cutoffDate = subDays(new Date(), retentionDays);
    const affectedCount = await prisma.callRecord.count({
      where: { startTime: { lt: cutoffDate } },
    });

    // Get storage stats
    const totalCalls = await prisma.callRecord.count();
    const callsWithAudio = await prisma.callRecord.count({ where: { s3Key: { not: null } } });

    return NextResponse.json({
      policy: {
        retentionDays,
        deleteAudio,
        deleteTranscripts,
        cutoffDate,
      },
      stats: {
        totalCalls,
        callsWithAudio,
        affectedByRetention: affectedCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(['ADMIN']);
    const body = await req.json();

    const { retentionDays, deleteAudio, deleteTranscripts } = body;

    // Validate
    if (retentionDays < 30) {
      return NextResponse.json({ error: 'Minimum retention period is 30 days' }, { status: 400 });
    }

    // Save settings
    await Promise.all([
      prisma.systemSetting.upsert({
        where: { key: 'retention_days' },
        update: { value: String(retentionDays) },
        create: { key: 'retention_days', value: String(retentionDays) },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'retention_delete_audio' },
        update: { value: String(deleteAudio) },
        create: { key: 'retention_delete_audio', value: String(deleteAudio) },
      }),
      prisma.systemSetting.upsert({
        where: { key: 'retention_delete_transcripts' },
        update: { value: String(deleteTranscripts) },
        create: { key: 'retention_delete_transcripts', value: String(deleteTranscripts) },
      }),
    ]);

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'retention_policy',
      details: { retentionDays, deleteAudio, deleteTranscripts },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

// Manual purge endpoint
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole(['ADMIN']);

    const settings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: 'retention_' } },
    });

    const retentionDays = parseInt(
      settings.find((s) => s.key === 'retention_days')?.value || '365'
    );
    const deleteAudio = settings.find((s) => s.key === 'retention_delete_audio')?.value === 'true';

    const cutoffDate = subDays(new Date(), retentionDays);

    // Get calls to purge
    const callsToPurge = await prisma.callRecord.findMany({
      where: { startTime: { lt: cutoffDate } },
      select: { id: true, s3Key: true },
    });

    let purgedCount = 0;
    let audioDeleted = 0;

    for (const call of callsToPurge) {
      // Delete audio from S3 if configured
      if (deleteAudio && call.s3Key) {
        try {
          const { deleteFile } = await import('@/lib/s3');
          await deleteFile(call.s3Key);
          audioDeleted++;
        } catch (err) {
          console.error(`Failed to delete S3 file for call ${call.id}:`, err);
        }
        // Clear s3Key but keep record
        await prisma.callRecord.update({
          where: { id: call.id },
          data: { s3Key: null },
        });
      }
      purgedCount++;
    }

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.DELETE,
      resource: 'retention_purge',
      details: { purgedCount, audioDeleted, cutoffDate },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ success: true, purgedCount, audioDeleted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
