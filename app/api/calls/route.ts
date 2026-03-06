import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { apiRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { Prisma, CallStatus, CallDirection, FlagType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Rate limiting
  const rateLimitResult = await apiRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;

    // Filters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const agentId = searchParams.get('agentId') || '';
    const campaign = searchParams.get('campaign') || '';
    const direction = searchParams.get('direction') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const minScore = searchParams.get('minScore') ? parseInt(searchParams.get('minScore')!) : undefined;
    const maxScore = searchParams.get('maxScore') ? parseInt(searchParams.get('maxScore')!) : undefined;
    const flagType = searchParams.get('flagType') || '';
    const sortBy = searchParams.get('sortBy') || 'startTime';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Build where clause
    const where: Prisma.CallRecordWhereInput = {};

    if (search) {
      where.OR = [
        { agentName: { contains: search, mode: 'insensitive' } },
        { five9CallId: { contains: search, mode: 'insensitive' } },
        { campaignName: { contains: search, mode: 'insensitive' } },
        { ani: { contains: search, mode: 'insensitive' } },
        { disposition: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) where.status = status as CallStatus;
    if (agentId) where.agentId = agentId;
    if (campaign) where.campaignName = { contains: campaign, mode: 'insensitive' };
    if (direction) where.callDirection = direction as CallDirection;

    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.startTime.lte = endDate;
      }
    }

    // Score filter requires joining audit_results
    if (minScore !== undefined || maxScore !== undefined || flagType) {
      where.auditResult = {};
      if (minScore !== undefined) where.auditResult.overallScore = { gte: minScore };
      if (maxScore !== undefined) {
        where.auditResult.overallScore = {
          ...(where.auditResult.overallScore as Prisma.IntFilter),
          lte: maxScore,
        };
      }
      if (flagType) {
        where.auditResult.auditFlags = {
          some: { type: flagType as FlagType },
        };
      }
    }

    // Build orderBy
    let orderBy: Prisma.CallRecordOrderByWithRelationInput = { startTime: 'desc' };
    if (sortBy !== 'score') {
      const validSortFields = ['startTime', 'agentName', 'campaignName', 'duration', 'status', 'createdAt'];
      if (validSortFields.includes(sortBy)) {
        orderBy = { [sortBy]: sortOrder };
      }
    }

    const [calls, total] = await Promise.all([
      prisma.callRecord.findMany({
        where,
        include: {
          auditResult: {
            select: {
              id: true,
              overallScore: true,
              complianceScore: true,
              toneScore: true,
              qualityScore: true,
              recommendedAction: true,
              sentimentAgent: true,
              sentimentCustomer: true,
            },
          },
          transcript: {
            select: { id: true, wordCount: true },
          },
        },
        orderBy: sortBy === 'score'
          ? { auditResult: { overallScore: sortOrder } }
          : orderBy,
        skip,
        take: limit,
      }),
      prisma.callRecord.count({ where }),
    ]);

    // Log read action
    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.READ,
      resource: 'calls',
      details: { filters: { search, status, agentId, campaign }, page, limit },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({
      calls,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Calls API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}
