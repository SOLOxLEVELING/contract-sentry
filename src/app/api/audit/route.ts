import { NextResponse } from 'next/server';
import { runAudit } from '@/lib/agent';
import { CLEAN_INVOICE, DIRTY_INVOICE, InvoiceSchema, ContractRuleSchema } from '@/lib/fixtures';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    let invoice;
    if (body.fixtureId === 'clean') {
      invoice = CLEAN_INVOICE;
    } else if (body.fixtureId === 'dirty') {
      invoice = DIRTY_INVOICE;
    } else if (body.invoice) {
      const parsed = InvoiceSchema.safeParse(body.invoice);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid invoice payload', details: parsed.error.issues },
          { status: 400 },
        );
      }
      invoice = parsed.data;
    } else {
      return NextResponse.json(
        { error: 'Provide fixtureId ("clean" or "dirty") or an invoice object.' },
        { status: 400 },
      );
    }

    let customContractRules = null;
    if (body.customContractRules) {
      const parsed = ContractRuleSchema.safeParse(body.customContractRules);
      if (parsed.success) customContractRules = parsed.data;
    }

    const result = await runAudit(invoice, customContractRules);

    return NextResponse.json({
      invoice,
      contractRules: result.contractRules,
      steps: result.steps,
      report: result.report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[audit] Agent error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
