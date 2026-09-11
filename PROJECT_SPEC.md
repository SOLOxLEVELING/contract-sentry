# ContractSentry: Autonomous Vendor Invoice & SOW Compliance Agent

## 1. Problem Statement

Freelancers, agencies, and small businesses waste dozens of hours every month cross-checking incoming vendor invoices against agreed Master Services Agreements (MSAs) or Statements of Work (SOWs). Discrepancies like rate increases, billable hour caps, and out-of-scope deliverables slip through and cost companies thousands in overpayments.

## 2. Core Solution

ContractSentry is an autonomous audit agent powered by `@strands-agents/sdk` and Amazon Bedrock. When an invoice is submitted:

1. The agent inspects the invoice data.
2. It queries active contract terms using the `fetchContractRules` tool.
3. It performs line-by-line verification using the `auditLineItems` tool.
4. If violations exist, it generates a structured audit report and automatically drafts an itemized dispute email citing the exact contract clauses violated.
5. If clean, it flags the invoice as "Ready for Payment" and logs it.

## 3. Data Models & Schemas

### Contract Rule (SOW Baseline):

- `contractId`: string
- `vendorName`: string
- `maxHourlyRate`: number (e.g., $75)
- `maxMonthlyHours`: number (e.g., 40 hours)
- `allowedCategories`: string[] (e.g., ["Backend Development", "Code Review", "Bug Fixing"])
- `sowClauseReference`: string (e.g., "SOW-2026-Section 4.2")

### Invoice Input:

- `invoiceNumber`: string
- `vendorName`: string
- `date`: string
- `lineItems`: Array<{ description: string; hours: number; rate: number; total: number }>
- `totalClaimed`: number

### Agent Audit Output (Zod Schema):

- `verdict`: "APPROVED" | "FLAGGED"
- `discrepancyCount`: number
- `totalOvercharge`: number
- `violations`: Array<{
  lineItem: string;
  violationType: "RATE_EXCEEDED" | "HOURS_CAPPED" | "UNAUTHORIZED_CATEGORY";
  charged: string | number;
  allowed: string | number;
  clauseCited: string;
  }>
- `suggestedAction`: string
- `disputeDraft`: string (Polite, professional email template ready for human review)

## 4. Required Strands Agent Tools

1. `fetchContractRules(vendorName: string)`: Retrieves the agreed SOW terms for that vendor.
2. `auditLineItems(contractId: string, lineItems: Array)`: Deterministic math engine checking hours and rates against contract parameters.
3. `recordAuditResult(result: AuditReport)`: Persists the audit verdict to local storage / memory.

## 5. UI Requirements (Next.js + Tailwind)

- Header: Brand logo, "ContractSentry", status pill ("Agent Ready - Bedrock Connected").
- Controls:
  - "Load Clean Sample Invoice" (Passes with zero violations).
  - "Load Faulty Sample Invoice" (Has $115/hr rate violation and unauthorized "Weekend Rush Surcharge").
  - "Run Agent Audit" Button.
- Execution View:
  - Live Agent Step Tracker (e.g., "Step 1: Reading Invoice" -> "Step 2: Fetching SOW-2026-4.2" -> "Step 3: Calculating Line Variance" -> "Step 4: Report Generated").
- Result View:
  - High-visibility status banner (Green for Approved / Red for Flagged).
  - Discrepancy comparison table (Billed vs. Allowed).
  - 1-Click "Copy Dispute Email" component.
