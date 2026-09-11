import { auditLineItemsDeterministic } from './agent';
import { CONTRACT_RULES, CLEAN_INVOICE } from './fixtures';
import type { ContractRule } from './fixtures';

const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Test 1: Clean Invoice ───────────────────────────────────────────────

function testCleanInvoice() {
  console.log('\n[1] Clean Invoice → APPROVED, 0 violations');
  const contract = CONTRACT_RULES['Acme Consulting']!;
  const result = auditLineItemsDeterministic(contract, CLEAN_INVOICE.lineItems);

  assert(result.violations.length === 0, 'Zero violations', `got ${result.violations.length}`);
  assert(result.totalOvercharge === 0, 'Zero overcharge', `got $${result.totalOvercharge}`);
  assert(result.totalHoursBilled === 38, 'Total hours = 38', `got ${result.totalHoursBilled}`);
}

// ── Test 2: Case-Insensitive Category Matching ──────────────────────────

function testCaseInsensitive() {
  console.log('\n[2] Case Sensitivity → lowercase categories pass validation');
  const contract = CONTRACT_RULES['Acme Consulting']!;
  const lineItems = [
    { description: 'backend development', hours: 10, rate: 75, total: 750 },
    { description: '  Code Review  ', hours: 5, rate: 70, total: 350 },
    { description: 'BUG FIXING', hours: 3, rate: 75, total: 225 },
  ];
  const result = auditLineItemsDeterministic(contract, lineItems);

  const catViolations = result.violations.filter(v => v.violationType === 'UNAUTHORIZED_CATEGORY');
  assert(catViolations.length === 0, 'No UNAUTHORIZED_CATEGORY violations', `got ${catViolations.length}: ${catViolations.map(v => v.lineItem).join(', ')}`);
  assert(result.totalHoursBilled === 18, 'Total hours = 18', `got ${result.totalHoursBilled}`);
}

// ── Test 3: Custom SOW → Generous Rate Passes ───────────────────────────

function testCustomSOW() {
  console.log('\n[3] Custom SOW ($120/hr allowed) → $110/hr billed → APPROVED');
  const customContract: ContractRule = {
    contractId: 'SOW-CUSTOM-TEST',
    vendorName: 'Test Vendor',
    maxHourlyRate: 120,
    maxMonthlyHours: 100,
    allowedCategories: ['Engineering', 'Design'],
    sowClauseReference: 'Custom-Section 1.0',
  };
  const lineItems = [
    { description: 'Engineering', hours: 20, rate: 110, total: 2200 },
    { description: 'Design', hours: 10, rate: 100, total: 1000 },
  ];
  const result = auditLineItemsDeterministic(customContract, lineItems);

  assert(result.violations.length === 0, 'Zero violations at $110/hr under $120/hr cap', `got ${result.violations.length}`);
  assert(result.totalOvercharge === 0, 'Zero overcharge', `got $${result.totalOvercharge}`);
}

// ── Test 4: Multi-Violation → Rate + Hours + Category ───────────────────

function testMultiViolation() {
  console.log('\n[4] Multi-Violation → FLAGGED with exact violation counts');
  const contract: ContractRule = {
    contractId: 'SOW-STRICT',
    vendorName: 'Strict Corp',
    maxHourlyRate: 50,
    maxMonthlyHours: 20,
    allowedCategories: ['Development'],
    sowClauseReference: 'SOW-Strict-3.1',
  };
  const lineItems = [
    { description: 'Development', hours: 15, rate: 80, total: 1200 },
    { description: 'Marketing', hours: 10, rate: 60, total: 600 },
  ];
  const result = auditLineItemsDeterministic(contract, lineItems);

  const byType = (t: string) => result.violations.filter(v => v.violationType === t);

  assert(result.violations.length >= 3, `At least 3 violations`, `got ${result.violations.length}`);
  assert(byType('RATE_EXCEEDED').length === 2, '2 RATE_EXCEEDED (both items exceed $50/hr)', `got ${byType('RATE_EXCEEDED').length}`);
  assert(byType('UNAUTHORIZED_CATEGORY').length === 1, '1 UNAUTHORIZED_CATEGORY (Marketing)', `got ${byType('UNAUTHORIZED_CATEGORY').length}`);
  assert(byType('HOURS_CAPPED').length === 1, '1 HOURS_CAPPED (25 hrs > 20 cap)', `got ${byType('HOURS_CAPPED').length}`);
  assert(result.totalOvercharge > 0, 'Overcharge is positive', `got $${result.totalOvercharge}`);
}

// ── Run ─────────────────────────────────────────────────────────────────

console.log('━━━ ContractSentry Eval Suite ━━━');

testCleanInvoice();
testCaseInsensitive();
testCustomSOW();
testMultiViolation();

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━`);
process.exit(failed > 0 ? 1 : 0);
