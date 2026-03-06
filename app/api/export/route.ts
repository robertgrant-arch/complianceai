/**
 * app/api/export/route.ts
 *
 * M-04: Streaming CSV export using ReadableStream + Prisma cursor-based pagination.
 * Instead of loading up to 10,000 rows into memory at once, rows are fetched in
 * batches of 500 and streamed directly to the client. This keeps memory usage flat
 * regardless of result set size.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 500;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(',') + '\n';
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type') || 'calls';
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const campaign = searchParams.get('campaign') || '';
    const agentId = searchParams.get('agentId') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    // Build Prisma where clause
    const where: Record<string, unknown> = {};
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
      const timeFilter: Record<string, Date> = {};
      if (dateFrom) timeFilter.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        timeFilter.lte = end;
      }
      where.startTime = timeFilter;
    }

    const filename = `${type}-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;

    if (type === 'calls') {
      const headers = [
        'Call ID', 'Five9 Call ID', 'Agent Name', 'Agent ID', 'Campaign',
        'Direction', 'Start Time', 'Duration (s)', 'ANI', 'DNIS',
        'Disposition', 'Status', 'Overall Score', 'Compliance Score',
        'Tone Score', 'Quality Score', 'Recommended Action', 'Summary', 'Reviewed At',
      ];

      // M-04: Create a ReadableStream that fetches and emits rows in batches
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Emit header row
          controller.enqueue(encoder.encode(headers.join(',') + '\n'));

          let cursor: string | undefined;
          let totalCount = 0;

          while (true) {
            const batch = await prisma.callRecord.findMany({
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
              take: BATCH_SIZE,
              ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });

            if (batch.length === 0) break;

            for (const call of batch) {
              const row = buildCsvRow([
                call.id,
                call.five9CallId,
                call.agentName,
                call.agentId,
                call.campaignName,
                call.callDirection,
                format(new Date(call.startTime), 'yyyy-MM-dd HH:mm:ss'),
                call.duration ?? '',
                call.ani ?? '',
                call.dnis ?? '',
                call.disposition ?? '',
                call.status,
                call.auditResult?.overallScore ?? '',
                call.auditResult?.complianceScore ?? '',
                call.auditResult?.toneScore ?? '',
                call.auditResult?.qualityScore ?? '',
                call.auditResult?.recommendedAction ?? '',
                call.auditResult?.summary ?? '',
                call.reviewedAt ? format(new Date(call.reviewedAt), 'yyyy-MM-dd HH:mm:ss') : '',
              ]);
              controller.enqueue(encoder.encode(row));
            }

            totalCount += batch.length;
            cursor = batch[batch.length - 1].id;

            if (batch.length < BATCH_SIZE) break;
          }

          // Fire-and-forget audit log (don't await in stream)
          createAuditLog({
            userId: session.user.id,
            action: AuditActions.CALL_EXPORTED,
            resource: 'calls',
            details: { format: 'csv', count: totalCount, filters: { search, status, campaign } },
            ipAddress: getIpAddress(req),
          }).catch(console.error);

          controller.close();
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (type === 'agents') {
      // Agent export is smaller (one row per agent) — no streaming needed
      const agentStats = await prisma.$queryRaw<Array<{
        agent_id: string;
        agent_name: string;
        total_calls: bigint;
        avg_score: number | null;
        avg_compliance: number | null;
        avg_tone: number | null;
        avg_quality: number | null;
        critical_flags: bigint;
      }>>`
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

      const headers = [
        'Agent ID', 'Agent Name', 'Total Calls', 'Avg Score',
        'Avg Compliance', 'Avg Tone', 'Avg Quality', 'Critical Flags',
      ];

      const rows = agentStats.map((a) =>
        buildCsvRow([
          a.agent_id,
          a.agent_name,
          Number(a.total_calls),
          a.avg_score != null ? Math.round(Number(a.avg_score)) : '',
          a.avg_compliance != null ? Math.round(Number(a.avg_compliance)) : '',
          a.avg_tone != null ? Math.round(Number(a.avg_tone)) : '',
          a.avg_quality != null ? Math.round(Number(a.avg_quality)) : '',
          Number(a.critical_flags),
        ]),
      );

      const csv = headers.join(',') + '\n' + rows.join('');

      await createAuditLog({
        userId: session.user.id,
        action: AuditActions.CALL_EXPORTED,
        resource: 'agents',
        details: { format: 'csv', count: agentStats.length },
        ipAddress: getIpAddress(req),
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
