import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runAudit } from '@/lib/agent';
import { saveAuditEvent } from '@/lib/audit-store';

export const maxDuration = 60;

const WebhookInvoiceSchema = z.object({
  vendorName: z.string(),
  invoiceNumber: z.string().optional(),
  date: z.string().optional(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      hours: z.number(),
      rate: z.number(),
    }),
  ),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = WebhookInvoiceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invoice payload', details: parsed.error.issues },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const lineItems = data.lineItems.map((li) => ({
      ...li,
      total: Math.round(li.hours * li.rate * 100) / 100,
    }));
    const totalClaimed = lineItems.reduce((s, li) => s + li.total, 0);

    const invoice = {
      invoiceNumber: data.invoiceNumber || `INV-WH-${Date.now().toString(36).toUpperCase()}`,
      vendorName: data.vendorName,
      date: data.date || new Date().toISOString().split('T')[0]!,
      lineItems,
      totalClaimed: Math.round(totalClaimed * 100) / 100,
    };

    const result = await runAudit(invoice);
    const report = result.report;

    const event = saveAuditEvent({
      vendorName: invoice.vendorName,
      invoiceNumber: invoice.invoiceNumber,
      totalClaimed: invoice.totalClaimed,
      verdict: report?.verdict ?? 'APPROVED',
      overcharge: report?.totalOvercharge ?? 0,
      violations: report?.violations.length ?? 0,
      source: 'WEBHOOK',
    });

    return NextResponse.json({
      success: true,
      eventId: event.id,
      verdict: report?.verdict ?? 'APPROVED',
      overcharge: report?.totalOvercharge ?? 0,
      violations: report?.violations.length ?? 0,
      totalClaimed: invoice.totalClaimed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[webhook/invoice] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
