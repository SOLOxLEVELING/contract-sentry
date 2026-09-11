import { createAuditAgent, auditLog } from './agent';
import { CLEAN_INVOICE, DIRTY_INVOICE, type Invoice } from './fixtures';

async function runAudit(label: string, invoice: Invoice) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}\n`);
  console.log('Invoice:', JSON.stringify(invoice, null, 2));
  console.log('\n--- Agent Execution ---\n');

  const agent = createAuditAgent();
  const prompt = `Audit the following invoice:\n\n${JSON.stringify(invoice, null, 2)}`;

  const result = await agent.invoke(prompt);

  console.log('\n--- Agent Result ---');
  console.log('Stop reason:', result.stopReason);

  if (auditLog.length > 0) {
    const latest = auditLog[auditLog.length - 1]!;
    console.log('\n--- Recorded Audit Report ---');
    console.log(JSON.stringify(latest.report, null, 2));
  } else {
    console.log('\n[WARNING] No audit report was recorded to the log.');
  }
}

async function main() {
  console.log('ContractSentry Agent Test Runner');
  console.log('================================\n');

  await runAudit('TEST 1: Clean Invoice (expect APPROVED)', CLEAN_INVOICE);

  auditLog.length = 0;

  await runAudit('TEST 2: Dirty Invoice (expect FLAGGED)', DIRTY_INVOICE);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
