import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get unique agents with their stats
    const agentStats = await prisma.$queryRaw<Array<{
      agent_id: string;
      agent_name: string;
      total_calls: bigint;
      completed_calls: bigint;
      avg_score: number;
      avg_compliance: number;
      avg_tone: number;
      avg_quality: number;
      critical_flags: bigint;
      warning_flags: bigint;
    }>>`
      SELECT 
        cr.agent_id,
        cr.agent_name,
        COUNT(*) as total_calls,
        COUNT(CASE WHEN cr.status = 'complete' THEN 1 END) as completed_calls,
        AVG(ar.overall_score) as avg_score,
        AVG(ar.compliance_score) as avg_compliance,
        AVG(ar.tone_score) as avg_tone,
        AVG(ar.quality_score) as avg_quality,
        COUNT(CASE WHEN af.type = 'CRITICAL' THEN 1 END) as critical_flags,
        COUNT(CASE WHEN af.type = 'WARNING' THEN 1 END) as warning_flags
      FROM call_records cr
      LEFT JOIN audit_results ar ON ar.call_record_id = cr.id
      LEFT JOIN audit_flags af ON af.audit_result_id = ar.id
      WHERE cr.start_time >= ${startDate}
      GROUP BY cr.agent_id, cr.agent_name
      ORDER BY avg_score DESC NULLS LAST
    `;

    return NextResponse.json({
      agents: agentStats.map((a) => ({
        agentId: a.agent_id,
        agentName: a.agent_name,
        totalCalls: Number(a.total_calls),
        completedCalls: Number(a.completed_calls),
        avgScore: a.avg_score ? Math.round(Number(a.avg_score)) : null,
        avgComplianceScore: a.avg_compliance ? Math.round(Number(a.avg_compliance)) : null,
        avgToneScore: a.avg_tone ? Math.round(Number(a.avg_tone)) : null,
        avgQualityScore: a.avg_quality ? Math.round(Number(a.avg_quality)) : null,
        criticalFlags: Number(a.critical_flags),
        warningFlags: Number(a.warning_flags),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
