import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-helpers';
import { apiRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';
import { Prisma, CallStatus, CallDirection, FlagType } from '@prisma/client';

export const dynamic = 'force-dynamic';

// Fix-8 (Medium): Zod schema validates and bounds all query parameters.
const callsQuerySchema = z.object({
  // Fix-8: search capped at 200 characters to prevent DB query abuse
  search: z.string().max(200, 'search must be 200 characters or fewer').optional().default(''),
  status: z.string().optional().default(''),
  agentId: z.string().optional().default(''),
  campaign: z.string().max(200).optional().default(''),
  direction: z.string().optional().default(''),
  dateFrom: z.string().optional().default(''),
  dateTo: z.string().optional().default(''),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  flagType: z.string().optional().default(''),
  sortBy: z.string().optional().default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  // Fix-8: page capped at 10,000 to prevent offset attacks
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  // Fix-8: pageSize capped at 100 to prevent large payload attacks
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export async function GET(req: NextRequest) {
  // Rate limiting
  const rateLimitResult = await apiRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    // Fix-8: Parse and validate all query params with Zod
    const parseResult = callsQuerySchema.safeParse({
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      agentId: searchParams.get('agentId') ?? undefined,
      campaign: searchParams.get('campaign') ?? undefined,
      direction: searchParams.get('direction') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      minScore: searchParams.get('minScore') ?? undefined,
      maxScore: searchParams.get('maxScore') ?? undefined,
      flagType: searchParams.get('flagType') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      sortOrder: searchParams.get('sortOrder') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const {
      search, status, agentId, campaign, direction,
      dateFrom, dateTo, minScore, maxScore, flagType,
      sortBy, sortOrder, page, limit,
    } = parseResult.data;

    const skip = (page - 1) * limit;

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

    // Score / flag filters
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
          // Fix-13: transcript removed from list query — it is only needed on the
          // call detail page and adds unnecessary JOIN overhead to the list endpoint.
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
