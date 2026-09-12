import { NextResponse } from 'next/server';
import { InvoiceSchema, AuditReportSchema } from '@/lib/fixtures';
import { sendDisputeAlert } from '@/lib/notifications';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const invoiceParsed = InvoiceSchema.safeParse(body.invoice);
    const reportParsed = AuditReportSchema.safeParse(body.report);

    if (!invoiceParsed.success || !reportParsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { sent } = await sendDisputeAlert(reportParsed.data, invoiceParsed.data);

    return NextResponse.json({ success: true, sent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[notify] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
