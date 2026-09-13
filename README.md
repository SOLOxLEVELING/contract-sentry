# ContractSentry

**Autonomous invoice compliance auditor.** Upload a vendor invoice, and an AI agent cross-checks every line item against your Statement of Work — flagging rate overcharges, hours cap breaches, and unauthorized billing categories in seconds.

Built for the [Agents for Humans Hackathon](https://agentsforhumans.devpost.com/) — Track 2: Professional Agents.

## The Problem

Freelancers, agencies, and small businesses waste hours every month manually cross-checking vendor invoices against MSAs and SOWs. Rate increases, hours cap overruns, and out-of-scope line items slip through — costing thousands in silent overpayments.

## The Solution

ContractSentry is an autonomous audit agent. When an invoice is submitted:

1. The agent reads the invoice (PDF upload or structured data)
2. It fetches the matching SOW contract terms via the `fetchContractRules` tool
3. A **deterministic TypeScript engine** audits every line item — the LLM advises, code judges
4. Violations produce a structured report with exact overcharge amounts and clause citations
5. A professional dispute email is auto-drafted, ready to send

**The key insight:** LLMs are bad at math. So the agent orchestrates the workflow, but all dollar amounts, rate comparisons, and hours calculations happen in deterministic tool callbacks. No hallucinated numbers.

## Features

- **PDF/Image Extraction** — Upload real invoices; Bedrock extracts structured line items
- **Deterministic Audit Engine** — Rate checks, hours caps, and category validation in TypeScript, not the LLM
- **Live Agent Telemetry** — Watch each tool execution step in real-time with timing and arguments
- **Webhook Ingestion** — `POST /api/webhook` for autonomous pipeline integration
- **Discord Notifications** — Flagged invoices trigger instant Discord alerts with violation details
- **Dispute Email Drafting** — One-click copy of a professional dispute email citing exact SOW clauses
- **Custom Invoice Editor** — Edit line items inline or build invoices from scratch
- **Eval Suite** — 4 scenarios, 12 assertions, zero LLM calls — runs instantly

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Agent SDK | [@strands-agents/sdk](https://github.com/strands-agents/sdk-typescript) |
| LLM | Amazon Bedrock (Nova Pro) |
| Language | TypeScript 7, strict mode |
| Validation | Zod 4 at every boundary |
| Styling | Tailwind CSS 4 |
| Icons | Lucide React |

## Quick Start

```bash
git clone https://github.com/SOLOxLEVELING/contract-sentry.git
cd contract-sentry
npm install
```

Create a `.env` file:

```env
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=ap-southeast-2
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...  # optional
```

You need AWS credentials with Bedrock access (`bedrock:InvokeModel` and `bedrock:Converse` permissions).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

Deterministic eval suite — no LLM calls, runs instantly:

```bash
npx tsx src/lib/eval-suite.ts
```

Covers clean invoices, case-insensitive category matching, custom SOW terms, and multi-violation detection.

## Project Structure

```
src/
  app/
    page.tsx                  # Main UI — invoice editor, audit results, telemetry
    layout.tsx                # Root layout
    api/
      audit/route.ts          # Audit endpoint (agent + deterministic engine)
      extract/route.ts        # PDF/image extraction via Bedrock
      webhook/route.ts        # Autonomous webhook ingestion
      notify/route.ts         # Discord notification dispatch
  lib/
    agent.ts                  # Agent setup, tools, deterministic audit logic
    fixtures.ts               # Zod schemas, contract rules, sample invoices
    audit-store.ts            # Audit result persistence
    notifications.ts          # Discord webhook integration
    eval-suite.ts             # Deterministic test runner
```

## How the Agent Works

```
Invoice submitted
       │
       ▼
┌──────────────┐     ┌─────────────────────┐
│  Strands SDK │────▶│ fetchContractRules() │  ← Retrieves SOW terms
│   Agent      │     └─────────────────────┘
│  (Bedrock)   │
│              │     ┌─────────────────────┐
│              │────▶│  auditLineItems()   │  ← Deterministic math engine
│              │     └─────────────────────┘     (TypeScript, not LLM)
│              │
│              │────▶  Structured verdict + dispute email
└──────────────┘
```

The LLM decides *what* to check and *how* to explain results. TypeScript decides *whether* numbers pass or fail. This separation ensures zero hallucinated dollar amounts.

## Webhook Integration

Send invoices programmatically for autonomous processing:

```bash
curl -X POST https://your-deployment.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"invoiceNumber": "INV-100", "vendorName": "Acme Corp", ...}'
```

Flagged invoices automatically trigger Discord notifications with violation summaries.

## License

[MIT](LICENSE)
