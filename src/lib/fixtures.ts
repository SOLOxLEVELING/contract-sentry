import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────

export const ContractRuleSchema = z.object({
  contractId: z.string(),
  vendorName: z.string(),
  maxHourlyRate: z.number(),
  maxMonthlyHours: z.number(),
  allowedCategories: z.array(z.string()),
  sowClauseReference: z.string(),
});

export type ContractRule = z.infer<typeof ContractRuleSchema>;

export const LineItemSchema = z.object({
  description: z.string(),
  hours: z.number(),
  rate: z.number(),
  total: z.number(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

export const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  vendorName: z.string(),
  date: z.string(),
  lineItems: z.array(LineItemSchema),
  totalClaimed: z.number(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const ViolationSchema = z.object({
  lineItem: z.string(),
  violationType: z.enum(['RATE_EXCEEDED', 'HOURS_CAPPED', 'UNAUTHORIZED_CATEGORY']),
  charged: z.union([z.string(), z.number()]),
  allowed: z.union([z.string(), z.number()]),
  clauseCited: z.string(),
});

export type Violation = z.infer<typeof ViolationSchema>;

export const AuditReportSchema = z.object({
  verdict: z.enum(['APPROVED', 'FLAGGED']),
  discrepancyCount: z.number(),
  totalOvercharge: z.number(),
  violations: z.array(ViolationSchema),
  suggestedAction: z.string(),
  disputeDraft: z.string(),
});

export type AuditReport = z.infer<typeof AuditReportSchema>;

// ── Mock Contract Rules Store ────────────────────────────────────────────

export const CONTRACT_RULES: Record<string, ContractRule> = {
  'Acme Consulting': {
    contractId: 'SOW-2026-ACME',
    vendorName: 'Acme Consulting',
    maxHourlyRate: 75,
    maxMonthlyHours: 40,
    allowedCategories: ['Backend Development', 'Code Review', 'Bug Fixing'],
    sowClauseReference: 'SOW-2026-Section 4.2',
  },
};

// ── Invoice Fixtures ─────────────────────────────────────────────────────

export const CLEAN_INVOICE: Invoice = {
  invoiceNumber: 'INV-2026-001',
  vendorName: 'Acme Consulting',
  date: '2026-09-01',
  lineItems: [
    { description: 'Backend Development', hours: 20, rate: 75, total: 1500 },
    { description: 'Code Review', hours: 10, rate: 75, total: 750 },
    { description: 'Bug Fixing', hours: 8, rate: 70, total: 560 },
  ],
  totalClaimed: 2810,
};

export const DIRTY_INVOICE: Invoice = {
  invoiceNumber: 'INV-2026-002',
  vendorName: 'Acme Consulting',
  date: '2026-09-01',
  lineItems: [
    { description: 'Backend Development', hours: 20, rate: 115, total: 2300 },
    { description: 'Code Review', hours: 15, rate: 75, total: 1125 },
    { description: 'Bug Fixing', hours: 10, rate: 75, total: 750 },
    { description: 'Weekend Rush Surcharge', hours: 5, rate: 150, total: 750 },
  ],
  totalClaimed: 4925,
};
