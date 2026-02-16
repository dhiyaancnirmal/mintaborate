# Mintaborate

Agent effectiveness simulation for technical documentation.

Paste a docs URL and run implementation tasks that mimic real developer-agent workflows. Mintaborate shows whether the docs lead to working outcomes, where agents fail, and what to fix.

## What It Proves
- Whether agents can complete implementation workflows using docs as their only reference
- Where failures happen across discovery, navigation, synthesis, and code generation
- Before/after impact of documentation changes on task success

## How It Works
1. Enter a documentation URL (Mintlify paths are prioritized, generic docs are supported)
2. Ingest docs from `llms-full.txt`, `llms.txt`, `skill.md`, markdown paths, and HTML fallback
3. Build tasks from user input, templates, and doc-derived task generation
4. Execute workers with an iterative loop: `retrieve -> plan -> act -> reflect`
5. Persist traces for retrieval, model I/O, citations, decisions, and cost/token usage
6. Score with deterministic checks first, then LLM judging constrained by those checks
7. Stream a final report with pass/fail, rubric scores, failure classes, and diagnostics

## Comparison Mode (Directional)
Mintaborate can run equivalent tasks across comparable products on different docs platforms and report directional deltas in agent success.

This is demo evidence, not a peer-reviewed benchmark. Fairness controls matter: fixed task sets, comparable product scope, and transparent caveats.

## Canonical Demo Narrative (3 Acts)
1. **Act 1: Simulation**
Run implementation tasks against one docs source and show task outcomes plus execution traces.
2. **Act 2: Comparison**
Run equivalent tasks on a comparable product/docs platform pair and show directional deltas.
3. **Act 3: Product Implication**
Show how failure attribution and doc-fix recommendations convert into measurable improvement.

## Stack
- Next.js 16+ (App Router, React 19, Server Components)
- TypeScript
- Tailwind CSS 4+
- shadcn/ui
- SQLite + Drizzle ORM
- Provider-agnostic model adapters (OpenAI, Anthropic, OpenAI-compatible endpoints)
- Vercel

## Getting Started

```bash
npm install
cp .env.example .env.local
# Add model provider keys to .env.local
npm run dev
```

## Project Context
See `PROJECT.md` for strategic framing and `AGENTS.md` for implementation guidance.
