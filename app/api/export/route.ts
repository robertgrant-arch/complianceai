import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { format } from 'date-fns';

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: any[]): string {
  return fields.map(escapeCsvField).join(',');
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const exportFormat = searchParams.get('format') || 'csv';
    const type = searchParams.get('type') || 'calls';

    // Build filters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const campaign = searchParams.get('campaign') || '';
    const agentId = searchParams.get('agentId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    const where: any = {};
    if (search) {
      where.OR = [
        { agentName: { contains: search, mode: 'insensitive' } },
        { campaignName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (campaign) where.campaignName = { contains: campaign, mode: 'insensitive' };
    if (agentId) where.agentId = agentId;
    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.startTime.lte = end;
      }
    }

    if (type === 'calls') {
      const calls = await prisma.callRecord.findMany({
        where,
        include: {
          auditResult: {
            select: {
              overallScore: true,
              complianceScore: true,
              toneScore: true,
              qualityScore: true,
              recommendedAction: true,
              summary: true,
            },
          },
        },
        orderBy: { startTime: 'desc' },
        take: 10000,
      });

      if (exportFormat === 'csv') {
        const headers = [
          'Call ID', 'Five9 Call ID', 'Agent Name', 'Agent ID', 'Campaign',
          'Direction', 'Start Time', 'Duration (s)', 'ANI', 'DNIS',
          'Disposition', 'Status', 'Overall Score', 'Compliance Score',
          'Tone Score', 'Quality Score', 'Recommended Action',
          'Summary', 'Reviewed At',
        ];

        const rows = calls.map((call: any) => buildCsvRow([
          call.id,
          call.five9CallId,
          call.agentName,
          call.agentId,
          call.campaignName,
          call.callDirection,
          format(new Date(call.startTime), 'yyyy-MM-dd HH:mm:ss'),
          call.duration || '',
          call.ani || '',
          call.dnis || '',
          call.disposition || '',
          call.status,
          call.auditResult?.overallScore ?? '',
          call.auditResult?.complianceScore ?? '',
          call.auditResult?.toneScore ?? '',
          call.auditResult?.qualityScore ?? '',
          call.auditResult?.recommendedAction ?? '',
          call.auditResult?.summary ?? '',
          call.reviewedAt ? format(new Date(call.reviewedAt), 'yyyy-MM-dd HH:mm:ss') : '',
        ]));

        const csv = [headers.join(','), ...rows].join('\n');

        await createAuditLog({
          userId: session.user.id,
          action: AuditActions.CALL_EXPORTED,
          resource: 'calls',
          details: { format: 'csv', count: calls.length, filters: { search, status, campaign } },
          ipAddress: getIpAddress(req),
        });

        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="calls-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
          },
        });
      }
    }

    if (type === 'agents') {
      const agentStats = await prisma.$queryRaw<any[]>`
        SELECT 
          cr.agent_id,
          cr.agent_name,
          COUNT(*) as total_calls,
          AVG(ar.overall_score) as avg_score,
          AVG(ar.compliance_score) as avg_compliance,
          AVG(ar.tone_score) as avg_tone,
          AVG(ar.quality_score) as avg_quality,
          COUNT(CASE WHEN af.type = 'CRITICAL' THEN 1 END) as critical_flags
        FROM call_records cr
        LEFT JOIN audit_results ar ON ar.call_record_id = cr.id
        LEFT JOIN audit_flags af ON af.audit_result_id = ar.id
        GROUP BY cr.agent_id, cr.agent_name
        ORDER BY avg_score DESC NULLS LAST
      `;

      const headers = ['Agent ID', 'Agent Name', 'Total Calls', 'Avg Score', 'Avg Compliance', 'Avg Tone', 'Avg Quality', 'Critical Flags'];
      const rows = agentStats.map((a: any) => buildCsvRow([
        a.agent_id,
        a.agent_name,
        Number(a.total_calls),
        a.avg_score ? Math.round(Number(a.avg_score)) : '',
        a.avg_compliance ? Math.round(Number(a.avg_compliance)) : '',
        a.avg_tone ? Math.round(Number(a.avg_tone)) : '',
        a.avg_quality ? Math.round(Number(a.avg_quality)) : '',
        Number(a.critical_flags),
      ]));

      const csv = [headers.join(','), ...rows].join('\n');

      await createAuditLog({
        userId: session.user.id,
        action: AuditActions.CALL_EXPORTED,
        resource: 'agents',
        details: { format: 'csv', count: agentStats.length },
        ipAddress: getIpAddress(req),
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="agents-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
