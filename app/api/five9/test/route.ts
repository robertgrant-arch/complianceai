import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { testFive9Connection } from '@/lib/five9';

export async function POST(req: NextRequest) {
  try {
    await requireRole(['ADMIN']);

    await testFive9Connection();
    return NextResponse.json({ success: true, message: 'Five9 connection successful' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Connection failed' },
      { status: 500 }
    );
  }
}
