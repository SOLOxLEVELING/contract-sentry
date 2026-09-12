import { NextResponse } from 'next/server';
import { getAuditEvents } from '@/lib/audit-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ events: getAuditEvents() });
}
