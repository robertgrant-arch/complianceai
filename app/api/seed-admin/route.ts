import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');

  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = [
      { email: 'admin@company.com', password: 'Admin@123!', role: 'ADMIN', name: 'Admin User' },
      { email: 'supervisor@company.com', password: 'Admin@123!', role: 'SUPERVISOR', name: 'Supervisor User' },
      { email: 'auditor@company.com', password: 'Admin@123!', role: 'AUDITOR', name: 'Auditor User' },
    ];

    const results = [];
    for (const u of users) {
      const hashed = await bcrypt.hash(u.password, 12);
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { password: hashed, role: u.role as any, isActive: true, name: u.name, failedLoginCount: 0, lockedUntil: null },
        create: { email: u.email, password: hashed, role: u.role as any, isActive: true, name: u.name },
      });
      results.push(`${user.email} (id: ${user.id})`);
    }

    return NextResponse.json({ success: true, message: `Users seeded: ${results.join(', ')}` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
