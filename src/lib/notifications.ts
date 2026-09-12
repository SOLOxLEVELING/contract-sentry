import type { AuditReport, Invoice } from './fixtures';

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export async function sendDisputeAlert(
  report: AuditReport,
  invoice: Invoice,
): Promise<{ sent: boolean }> {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[notifications] DISCORD_WEBHOOK_URL not configured, skipping dispatch.');
    return { sent: false };
  }

  const isFlagged = report.verdict === 'FLAGGED';
  const color = isFlagged ? 0xef4444 : 0x22c55e;

  const topViolations = report.violations.slice(0, 3).map((v) => {
    const charged = typeof v.charged === 'number' ? fmt(v.charged) : v.charged;
    const allowed = typeof v.allowed === 'number' ? fmt(v.allowed) : v.allowed;
    return `**${v.lineItem}** — ${v.violationType.replace(/_/g, ' ')} (billed ${charged}, allowed ${allowed})`;
  }).join('\n');

  const embed = {
    title: isFlagged
      ? `🚨 Sentry Alert: Overcharge Detected`
      : `✅ Invoice Approved`,
    color,
    fields: [
      { name: 'Vendor', value: invoice.vendorName, inline: true },
      { name: 'Invoice', value: invoice.invoiceNumber, inline: true },
      { name: 'Total Claimed', value: fmt(invoice.totalClaimed), inline: true },
      ...(isFlagged
        ? [
            { name: 'Overcharge', value: fmt(report.totalOvercharge), inline: true },
            { name: 'Violations', value: String(report.discrepancyCount), inline: true },
            ...(topViolations ? [{ name: 'Top Violations', value: topViolations, inline: false }] : []),
          ]
        : []),
    ],
    footer: { text: 'ContractSentry Autonomous Daemon' },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      console.error('[notifications] Discord webhook failed:', res.status, await res.text());
      return { sent: false };
    }

    console.log('[notifications] Discord alert dispatched:', report.verdict);
    return { sent: true };
  } catch (err) {
    console.error('[notifications] Discord webhook error:', err);
    return { sent: false };
  }
}
