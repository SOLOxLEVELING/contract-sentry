import { z } from 'zod';
import { Agent, BedrockModel, tool } from '@strands-agents/sdk';
import {
  CONTRACT_RULES,
  LineItemSchema,
  type ContractRule,
  type Invoice,
  type AuditReport,
  type Violation,
} from './fixtures';

// ── Execution Step Tracking ─────────────────────────────────────────────

export interface ExecutionStep {
  tool: string;
  label: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

// ── Model (shared stateless singleton) ──────────────────────────────────

const model = new BedrockModel({
  modelId: process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0',
  region: process.env.APP_AWS_REGION || 'ap-southeast-2',
  clientConfig: process.env.APP_AWS_ACCESS_KEY_ID ? {
    credentials: {
      accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
    },
  } : undefined,
  maxTokens: 4096,
  temperature: 0.2,
});

// ── System Prompt ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ContractSentry, an autonomous invoice compliance auditor.

When given an invoice, you MUST follow these steps in order:
1. Call fetchContractRules with the vendor name from the invoice to retrieve the agreed contract terms.
2. Call auditLineItems with the contractId, vendorName, and the invoice's line items to perform deterministic compliance checks.
3. Analyze the audit results. If there are violations, the verdict is FLAGGED. If there are zero violations, the verdict is APPROVED.
4. If FLAGGED: draft a polite, professional dispute email that cites the exact contract clause, lists each violation with the billed vs. allowed amounts, and requests correction.
   If APPROVED: write a short confirmation that the invoice is clear for payment.
5. Call recordAuditResult with the complete structured report including your dispute draft or approval note.

Rules:
- NEVER invent dollar amounts or hours. Use only the numbers returned by auditLineItems.
- The totalOvercharge must match the value returned by auditLineItems exactly.
- The discrepancyCount must equal the number of violations returned by auditLineItems.
- Every violation from auditLineItems must appear in your report.`;

// ── Deterministic Audit Engine ──────────────────────────────────────────

export interface AuditEngineResult {
  violations: Violation[];
  totalOvercharge: number;
  totalHoursBilled: number;
  maxMonthlyHours: number;
}

export function auditLineItemsDeterministic(
  contract: ContractRule,
  lineItems: Array<{ description: string; hours: number; rate: number; total: number }>,
): AuditEngineResult {
  const violations: Violation[] = [];
  let totalOvercharge = 0;
  let totalHours = 0;
  const normalizedAllowed = contract.allowedCategories.map(c => c.toLowerCase().trim());

  for (const item of lineItems) {
    totalHours += item.hours;

    if (!normalizedAllowed.includes(item.description.toLowerCase().trim())) {
      violations.push({
        lineItem: item.description,
        violationType: 'UNAUTHORIZED_CATEGORY',
        charged: item.description,
        allowed: contract.allowedCategories.join(', '),
        clauseCited: contract.sowClauseReference,
      });
      totalOvercharge += item.total;
    }

    if (item.rate > contract.maxHourlyRate) {
      const overcharge = (item.rate - contract.maxHourlyRate) * item.hours;
      violations.push({
        lineItem: item.description,
        violationType: 'RATE_EXCEEDED',
        charged: item.rate,
        allowed: contract.maxHourlyRate,
        clauseCited: contract.sowClauseReference,
      });
      totalOvercharge += overcharge;
    }
  }

  if (totalHours > contract.maxMonthlyHours) {
    const excessHours = totalHours - contract.maxMonthlyHours;
    violations.push({
      lineItem: 'Total Hours',
      violationType: 'HOURS_CAPPED',
      charged: totalHours,
      allowed: contract.maxMonthlyHours,
      clauseCited: contract.sowClauseReference,
    });
    const avgRate =
      lineItems.reduce((sum, li) => sum + li.rate * li.hours, 0) /
      lineItems.reduce((sum, li) => sum + li.hours, 0);
    totalOvercharge += excessHours * avgRate;
  }

  return {
    violations,
    totalOvercharge: Math.round(totalOvercharge * 100) / 100,
    totalHoursBilled: totalHours,
    maxMonthlyHours: contract.maxMonthlyHours,
  };
}

// ── Tool Factories (per-request instances for step capture) ─────────────

function createTools(steps: ExecutionStep[], onReport: (r: AuditReport) => void, timing: { lastEnd: number }, contractRulesOverride?: ContractRule) {
  const fetchContractRules = tool({
    name: 'fetchContractRules',
    description:
      'Retrieves the agreed SOW / contract terms for a given vendor. Returns the contract rules including max hourly rate, max monthly hours, and allowed billing categories.',
    inputSchema: z.object({
      vendorName: z.string().describe('The vendor name to look up'),
    }),
    callback: ({ vendorName }) => {
      const rules = contractRulesOverride ?? CONTRACT_RULES[vendorName];
      const result = rules
        ? { found: true as const, rules }
        : { found: false as const, error: `No contract found for vendor: ${vendorName}` };
      const now = performance.now();
      const elapsed = Math.round(now - timing.lastEnd);
      timing.lastEnd = now;
      steps.push({
        tool: 'fetchContractRules',
        label: `Fetching SOW for "${vendorName}"`,
        input: { vendorName },
        output: result,
        durationMs: elapsed,
      });
      return result;
    },
  });

  const auditLineItems = tool({
    name: 'auditLineItems',
    description:
      'Deterministic math engine that checks invoice line items against contract parameters. Returns all violations found including rate overcharges, hours cap breaches, and unauthorized categories.',
    inputSchema: z.object({
      contractId: z.string().describe('The contract ID to audit against'),
      vendorName: z.string().describe('The vendor name to look up contract rules'),
      lineItems: z.array(LineItemSchema).describe('The invoice line items to audit'),
    }),
    callback: ({ vendorName, lineItems }) => {
      const contract = contractRulesOverride ?? CONTRACT_RULES[vendorName];
      if (!contract) {
        const result = { error: `No contract rules found for vendor: ${vendorName}`, violations: [], totalOvercharge: 0 };
        const now = performance.now();
        const elapsed = Math.round(now - timing.lastEnd);
        timing.lastEnd = now;
        steps.push({ tool: 'auditLineItems', label: 'Auditing Line Items', input: { vendorName, lineItems }, output: result, durationMs: elapsed });
        return result;
      }

      const result = auditLineItemsDeterministic(contract, lineItems);

      const now = performance.now();
      const elapsed = Math.round(now - timing.lastEnd);
      timing.lastEnd = now;
      steps.push({
        tool: 'auditLineItems',
        label: `Calculating line-item variance (${lineItems.length} items)`,
        input: { contractId: contract.contractId, vendorName, lineItemCount: lineItems.length },
        output: result,
        durationMs: elapsed,
      });

      return result;
    },
  });

  const recordAuditResult = tool({
    name: 'recordAuditResult',
    description:
      'Persists the final audit verdict to the audit log. Call this after completing the audit with the full structured report.',
    inputSchema: z.object({
      verdict: z.enum(['APPROVED', 'FLAGGED']),
      discrepancyCount: z.number(),
      totalOvercharge: z.number(),
      violations: z.array(
        z.object({
          lineItem: z.string(),
          violationType: z.enum(['RATE_EXCEEDED', 'HOURS_CAPPED', 'UNAUTHORIZED_CATEGORY']),
          charged: z.union([z.string(), z.number()]),
          allowed: z.union([z.string(), z.number()]),
          clauseCited: z.string(),
        }),
      ),
      suggestedAction: z.string(),
      disputeDraft: z.string(),
    }),
    callback: (report) => {
      onReport(report);
      const result = { success: true, loggedAt: new Date().toISOString() };
      const now = performance.now();
      const elapsed = Math.round(now - timing.lastEnd);
      timing.lastEnd = now;
      steps.push({
        tool: 'recordAuditResult',
        label: `Report Generated — ${report.verdict}`,
        input: { verdict: report.verdict, discrepancyCount: report.discrepancyCount },
        output: result,
        durationMs: elapsed,
      });
      return result;
    },
  });

  return [fetchContractRules, auditLineItems, recordAuditResult];
}

// ── Public API ──────────────────────────────────────────────────────────

export interface AuditResult {
  steps: ExecutionStep[];
  report: AuditReport | null;
  contractRules: ContractRule | null;
}

export async function runAudit(invoice: Invoice, contractRulesOverride?: ContractRule | null): Promise<AuditResult> {
  const steps: ExecutionStep[] = [];
  let report: AuditReport | null = null;
  const timing = { lastEnd: performance.now() };

  const tools = createTools(steps, (r) => { report = r; }, timing, contractRulesOverride ?? undefined);

  const agent = new Agent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    name: 'ContractSentry',
    description: 'Autonomous vendor invoice & SOW compliance auditor',
    printer: false,
  });

  await agent.invoke(`Audit the following invoice:\n\n${JSON.stringify(invoice, null, 2)}`);

  const contractRules = contractRulesOverride ?? CONTRACT_RULES[invoice.vendorName] ?? null;

  const seen = new Set<string>();
  const dedupedSteps = steps.filter((step) => {
    if (seen.has(step.tool)) return false;
    seen.add(step.tool);
    return true;
  });

  return { steps: dedupedSteps, report, contractRules };
}

// ── Legacy CLI exports ──────────────────────────────────────────────────

const auditLog: Array<{ timestamp: string; report: AuditReport }> = [];

export { auditLog };

export function createAuditAgent() {
  const cliSteps: ExecutionStep[] = [];
  const tools = createTools(cliSteps, (r) => {
    auditLog.push({ timestamp: new Date().toISOString(), report: r });
  }, { lastEnd: performance.now() });

  return new Agent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    name: 'ContractSentry',
    description: 'Autonomous vendor invoice & SOW compliance auditor',
  });
}
