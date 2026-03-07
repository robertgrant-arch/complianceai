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
    const email = 'robert.grant@selectquote.com';
    const password = await bcrypt.hash('Gcaa10071007!@!@', 12);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password,
        role: 'ADMIN',
        isActive: true,
        name: 'Robert Grant',
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        email,
        password,
        role: 'ADMIN',
        isActive: true,
        name: 'Robert Grant',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Admin user upserted: ${user.email} (id: ${user.id})`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
