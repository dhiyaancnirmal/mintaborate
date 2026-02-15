# Mintaborate

Agent-readiness testing for documentation.

Paste a Mintlify docs URL. Get a scored report card showing how well your docs work for AI agents.

## Stack
- Next.js 15+ (App Router, React 19, Server Components)
- TypeScript
- Tailwind CSS 4+
- shadcn/ui
- Anthropic Claude API
- Vercel

## Getting Started

```bash
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

## How It Works

1. Enter a Mintlify docs URL
2. Mintaborate fetches the documentation (llms-full.txt, skill.md, individual pages)
3. AI agent tasks are generated based on what the docs cover
4. An agent attempts each task using only the docs as context
5. An LLM judge evaluates each attempt
6. Results displayed as a dashboard with pass/fail scores and failure diagnostics

## Project Context

See `PROJECT.md` for full context. This is a portfolio project demonstrating value to Mintlify — filling the gap between their agent analytics (what agents do) and agent evaluation (where agents fail and why).
