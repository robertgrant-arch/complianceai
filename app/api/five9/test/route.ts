import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { Five9Client } from '@/lib/five9';

export async function POST(req: NextRequest) {
  try {
    await requireRole(['ADMIN']);

    const client = new Five9Client();
    const result = await client.testConnection();

    if (result.success) {
      return NextResponse.json({ success: true, message: result.message });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Connection failed' },
      { status: 500 }
    );
  }
}
