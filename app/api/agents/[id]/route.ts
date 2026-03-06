import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get agent calls with audit results
    const calls = await prisma.callRecord.findMany({
      where: {
        agentId: params.id,
        startTime: { gte: startDate },
      },
      include: {
        auditResult: {
          select: {
            overallScore: true,
            complianceScore: true,
            toneScore: true,
            qualityScore: true,
            recommendedAction: true,
            _count: { select: { auditFlags: true } },
          },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    if (calls.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Calculate stats
    const completedCalls = calls.filter((c) => c.status === 'COMPLETED');
    const auditedCalls = completedCalls.filter((c) => c.auditResult);

    const avgScore = auditedCalls.length > 0
      ? Math.round(auditedCalls.reduce((sum, c) => sum + (c.auditResult?.overallScore || 0), 0) / auditedCalls.length)
      : null;

    const avgCompliance = auditedCalls.length > 0
      ? Math.round(auditedCalls.reduce((sum, c) => sum + (c.auditResult?.complianceScore || 0), 0) / auditedCalls.length)
      : null;

    const avgTone = auditedCalls.length > 0
      ? Math.round(auditedCalls.reduce((sum, c) => sum + (c.auditResult?.toneScore || 0), 0) / auditedCalls.length)
      : null;

    const avgQuality = auditedCalls.length > 0
      ? Math.round(auditedCalls.reduce((sum, c) => sum + (c.auditResult?.qualityScore || 0), 0) / auditedCalls.length)
      : null;

    // Score trend by day
    const scoreTrend = await prisma.$queryRaw<Array<{ date: string; avg_score: number }>>`
      SELECT 
        DATE(cr.start_time) as date,
        AVG(ar.overall_score) as avg_score
      FROM call_records cr
      JOIN audit_results ar ON ar.call_record_id = cr.id
      WHERE cr.agent_id = ${params.id}
        AND cr.start_time >= ${startDate}
      GROUP BY DATE(cr.start_time)
      ORDER BY date ASC
    `;

    return NextResponse.json({
      agentId: params.id,
      agentName: calls[0].agentName,
      stats: {
        totalCalls: calls.length,
        completedCalls: completedCalls.length,
        auditedCalls: auditedCalls.length,
        avgScore,
        avgCompliance,
        avgTone,
        avgQuality,
      },
      scoreTrend: scoreTrend.map((d) => ({
        date: d.date,
        score: Math.round(Number(d.avg_score)),
      })),
      recentCalls: calls.slice(0, 20),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
