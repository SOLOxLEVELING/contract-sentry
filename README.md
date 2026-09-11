# ContractSentry

Autonomous invoice compliance auditor. Checks vendor invoices against SOW (Statement of Work) contract terms and flags violations — rate overcharges, hours cap breaches, unauthorized billing categories.

Built for the [Agents for Humans Hackathon](https://agentsforhumans.devpost.com/) (Track 2: Professional Agents).

## How it works

1. Upload an invoice (PDF/image) or use the built-in fixtures
2. An AI agent (Strands Agents SDK + Amazon Bedrock) fetches the matching SOW terms
3. A deterministic TypeScript engine audits every line item — the LLM advises, code judges
4. Get a verdict (APPROVED / FLAGGED) with exact overcharge amounts and clause citations

The key idea: **LLMs are bad at math.** So the agent orchestrates the workflow, but all dollar amounts, rate comparisons, and hours calculations happen in deterministic tool callbacks. No hallucinated numbers.

## Stack

- Next.js 15 (App Router, Turbopack)
- Strands Agents SDK + Amazon Bedrock (Nova Pro)
- TypeScript, Zod validation at every boundary
- Tailwind CSS

## Setup

```bash
npm install
```

Create a `.env` file:

```
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=ap-southeast-2
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
```

You need AWS credentials with Bedrock access (specifically `bedrock:InvokeModel` and `bedrock:Converse` permissions).

```bash
npm run dev
```

## Tests

Deterministic eval suite — no LLM calls, runs instantly:

```bash
npx tsx src/lib/eval-suite.ts
```

4 scenarios, 12 assertions covering clean invoices, case-insensitive category matching, custom SOW terms, and multi-violation detection.

## Project structure

```
src/
  app/
    page.tsx            # main UI
    api/audit/route.ts  # audit endpoint (agent + deterministic engine)
    api/extract/route.ts # PDF/image extraction via Bedrock
  lib/
    agent.ts            # agent setup, tools, deterministic audit logic
    fixtures.ts         # Zod schemas, contract rules, sample invoices
    eval-suite.ts       # test runner
```
