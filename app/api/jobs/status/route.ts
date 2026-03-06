import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);

    // Dynamically import to avoid bundling BullMQ in Next.js
    const { ingestionQueue, transcriptionQueue, analysisQueue, notificationQueue } = await import('@/worker/queues');

    const [ingestion, transcription, analysis, notification] = await Promise.all([
      getQueueStats(ingestionQueue),
      getQueueStats(transcriptionQueue),
      getQueueStats(analysisQueue),
      getQueueStats(notificationQueue),
    ]);

    return NextResponse.json({
      queues: {
        ingestion,
        transcription,
        analysis,
        notification,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

async function getQueueStats(queue: any) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}
