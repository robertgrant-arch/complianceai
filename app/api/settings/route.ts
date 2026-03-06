import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-helpers';
import { createAuditLog, AuditActions, getIpAddress } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'SUPERVISOR']);

    const settings = await prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });

    // Convert to key-value object
    const settingsMap = settings.reduce((acc, s) => {
      try {
        acc[s.key] = JSON.parse(s.value);
      } catch {
        acc[s.key] = s.value;
      }
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({ settings: settingsMap, raw: settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole(['ADMIN']);
    const body = await req.json();

    const updates: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(body)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      updates.push({ key, value: stringValue });
    }

    // Upsert all settings
    await Promise.all(
      updates.map(({ key, value }) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );

    await createAuditLog({
      userId: session.user.id,
      action: AuditActions.UPDATE,
      resource: 'system_settings',
      details: { updatedKeys: updates.map((u) => u.key) },
      ipAddress: getIpAddress(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
