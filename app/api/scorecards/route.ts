import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scorecards = await prisma.scorecard.findMany({
      include: { items: true, campaigns: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ scorecards });
  } catch (error) {
    console.error('Scorecards GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { name, type, items, campaigns } = body;

    if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 });

    const scorecard = await prisma.scorecard.create({
      data: {
        name,
        type,
        items: items ? {
          create: items.map((item: any) => ({
            code: item.code,
            description: item.description,
            category: item.category,
            weight: item.weight ?? 1.0,
            evaluationType: item.evaluationType ?? 'BOOLEAN',
            maxScore: item.maxScore ?? 1.0,
          })),
        } : undefined,
        campaigns: campaigns ? {
          create: campaigns.map((c: string) => ({ campaignName: c })),
        } : undefined,
      },
      include: { items: true, campaigns: true },
    });

    return NextResponse.json({ scorecard }, { status: 201 });
  } catch (error) {
    console.error('Scorecards POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
