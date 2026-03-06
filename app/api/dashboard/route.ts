import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { subDays, startOfDay, format } from 'date-fns';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const startDate = startOfDay(subDays(new Date(), days));

    // Total calls in period
    const [
      totalCalls,
      completedCalls,
      pendingCalls,
      errorCalls,
      avgScores,
      flagCounts,
      recentFlags,
      callsByDay,
      scoresByDay,
      topAgents,
      campaignBreakdown,
    ] = await Promise.all([
      // Total calls
      prisma.callRecord.count({
        where: { startTime: { gte: startDate } },
      }),

      // Completed calls
      prisma.callRecord.count({
        where: { status: 'complete', startTime: { gte: startDate } },
      }),

      // Pending calls
      prisma.callRecord.count({
        where: {
          status: { in: ['pending', 'transcribing', 'analyzing'] },
          startTime: { gte: startDate },
        },
      }),

      // Error calls
      prisma.callRecord.count({
        where: { status: 'error', startTime: { gte: startDate } },
      }),

      // Average scores
      prisma.auditResult.aggregate({
        where: {
          callRecord: { startTime: { gte: startDate } },
        },
        _avg: {
          overallScore: true,
          complianceScore: true,
          toneScore: true,
          qualityScore: true,
        },
      }),

      // Flag counts by type
      prisma.auditFlag.groupBy({
        by: ['type'],
        where: {
          auditResult: {
            callRecord: { startTime: { gte: startDate } },
          },
        },
        _count: { type: true },
      }),

      // Recent critical flags
      prisma.auditFlag.findMany({
        where: {
          type: 'CRITICAL',
          auditResult: {
            callRecord: { startTime: { gte: startDate } },
          },
        },
        include: {
          auditResult: {
            include: {
              callRecord: {
                select: {
                  id: true,
                  agentName: true,
                  startTime: true,
                  campaignName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Calls by day
      prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT 
          DATE(start_time) as date,
          COUNT(*) as count
        FROM call_records
        WHERE start_time >= ${startDate}
        GROUP BY DATE(start_time)
        ORDER BY date ASC
      `,

      // Average scores by day
      prisma.$queryRaw<Array<{ date: string; avg_score: number }>>`
        SELECT 
          DATE(cr.start_time) as date,
          AVG(ar.overall_score) as avg_score
        FROM call_records cr
        JOIN audit_results ar ON ar.call_record_id = cr.id
        WHERE cr.start_time >= ${startDate}
        GROUP BY DATE(cr.start_time)
        ORDER BY date ASC
      `,

      // Top agents by score
      prisma.$queryRaw<Array<{ agent_id: string; agent_name: string; avg_score: number; call_count: bigint }>>`
        SELECT 
          cr.agent_id,
          cr.agent_name,
          AVG(ar.overall_score) as avg_score,
          COUNT(*) as call_count
        FROM call_records cr
        JOIN audit_results ar ON ar.call_record_id = cr.id
        WHERE cr.start_time >= ${startDate}
        GROUP BY cr.agent_id, cr.agent_name
        ORDER BY avg_score DESC
        LIMIT 10
      `,

      // Campaign breakdown
      prisma.$queryRaw<Array<{ campaign: string; count: bigint; avg_score: number }>>`
        SELECT 
          cr.campaign_name as campaign,
          COUNT(*) as count,
          AVG(ar.overall_score) as avg_score
        FROM call_records cr
        LEFT JOIN audit_results ar ON ar.call_record_id = cr.id
        WHERE cr.start_time >= ${startDate}
        GROUP BY cr.campaign_name
        ORDER BY count DESC
      `,
    ]);

    // Calculate compliance rate (calls with score >= 80)
    const highScoreCalls = await prisma.auditResult.count({
      where: {
        overallScore: { gte: 80 },
        callRecord: { startTime: { gte: startDate } },
      },
    });

    const complianceRate = completedCalls > 0
      ? Math.round((highScoreCalls / completedCalls) * 100)
      : 0;

    // Format flag counts
    const flagSummary = {
      CRITICAL: 0,
      WARNING: 0,
      INFO: 0,
    };
    flagCounts.forEach((f) => {
      flagSummary[f.type as keyof typeof flagSummary] = f._count.type;
    });

    return NextResponse.json({
      stats: {
        totalCalls,
        completedCalls,
        pendingCalls,
        errorCalls,
        complianceRate,
        avgOverallScore: Math.round(avgScores._avg.overallScore || 0),
        avgComplianceScore: Math.round(avgScores._avg.complianceScore || 0),
        avgToneScore: Math.round(avgScores._avg.toneScore || 0),
        avgQualityScore: Math.round(avgScores._avg.qualityScore || 0),
        flagCounts: flagSummary,
      },
      charts: {
        callsByDay: callsByDay.map((d) => ({
          date: d.date,
          count: Number(d.count),
        })),
        scoresByDay: scoresByDay.map((d) => ({
          date: d.date,
          score: Math.round(Number(d.avg_score)),
        })),
        campaignBreakdown: campaignBreakdown.map((c) => ({
          campaign: c.campaign,
          count: Number(c.count),
          avgScore: Math.round(Number(c.avg_score) || 0),
        })),
      },
      topAgents: topAgents.map((a) => ({
        agentId: a.agent_id,
        agentName: a.agent_name,
        avgScore: Math.round(Number(a.avg_score)),
        callCount: Number(a.call_count),
      })),
      recentFlags: recentFlags.map((f) => ({
        id: f.id,
        type: f.type,
        category: f.category,
        description: f.description,
        callId: f.auditResult.callRecord.id,
        agentName: f.auditResult.callRecord.agentName,
        startTime: f.auditResult.callRecord.startTime,
        campaignName: f.auditResult.callRecord.campaignName,
      })),
    });
  } catch (error: any) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}
