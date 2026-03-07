import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  // Protect with a secret key
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret !== process.env.SEED_SECRET && secret !== 'complianceai-seed-2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const samples = [
      {
        name: 'Admin User',
        email: 'admin@complianceai.local',
        role: 'ADMIN' as const,
        rawPassword: 'Admin@123!',
      },
      {
        name: 'Supervisor User',
        email: 'supervisor@company.com',
        role: 'SUPERVISOR' as const,
        rawPassword: 'Supervisor@123!',
      },
      {
        name: 'Auditor User',
        email: 'auditor@company.com',
        role: 'AUDITOR' as const,
        rawPassword: 'Auditor@123!',
      },
      {
        name: 'Viewer User',
        email: 'viewer@company.com',
        role: 'VIEWER' as const,
        rawPassword: 'Viewer@123!',
      },
    ];

    const results = [];

    for (const sample of samples) {
      const pw = await bcrypt.hash(sample.rawPassword, 12);
      const user = await prisma.user.upsert({
        where: { email: sample.email },
        update: {},
        create: {
          name: sample.name,
          email: sample.email,
          role: sample.role,
          password: pw,
          isActive: true,
          failedLoginCount: 0,
        },
      });
      results.push({ email: user.email, role: user.role, status: 'ready' });
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      users: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Seed failed', details: error.message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
