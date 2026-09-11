# ContractSentry - Project & Engineering Guidelines

## Hackathon Context

- Event: "Agents for Humans Hackathon" (Devpost & AWS)
- Track: Professional Agents (Automating tedious business administrative tasks)
- Core Framework: `@strands-agents/sdk` (TypeScript) + Amazon Bedrock (Claude 3.5 Sonnet / Haiku)

## Engineering Principles

1. Deterministic Guardrails: The LLM is an advisor; TypeScript code is the judge. Math, dollar totals, and rate limits must be calculated in deterministic tool functions, not hallucinated by the model.
2. Type Safety: Strict TypeScript. Validate all agent inputs and outputs with Zod schemas.
3. Fast Feedback: When writing code, test immediately using `npx tsx` or `npm run build`. Never leave syntax or type errors unaddressed.
4. UI/UX: Next.js 15 App Router, Tailwind CSS, Lucide React icons. Design for high clarity: clean dark mode, responsive audit cards, live timeline of agent tool executions.

## Common Commands

- Dev Server: `npm run dev`
- Build / Typecheck: `npm run build`
- Run local agent test: `npx tsx src/lib/agent-test.ts`

## UI & Styling Standards (Anti-Slop Directive)

1. Aesthetics: Minimalist, dense fintech tool (Linear / Stripe style).
2. Prohibited Utilities: NO gradients (`bg-gradient-*`), NO ambient glow blurs (`blur-xl`), NO cartoon illustrations, NO oversized radiuses (`rounded-3xl` -> use `rounded-md` or `rounded-lg`).
3. Typography & Palette: Dark monochrome (`bg-zinc-950`, surfaces `bg-zinc-900/50`, borders `border-zinc-800`). Monospace (`font-mono`) for numbers, rates, clauses, and code blocks.
4. Density: Compact padding (`p-3` or `p-4`, not `p-8`). Dense tabular data over loose card stacks.
5. Telemetry: Display real agent metrics—tool execution time, input arguments, and raw clause matches.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
