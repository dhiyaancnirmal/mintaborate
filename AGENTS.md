# AGENTS.md

## Project Context
Read `PROJECT.md` first.

Mintaborate simulates real developer-agent implementation workflows against documentation and measures whether docs lead to working outcomes. Mintlify ingestion paths are prioritized, but the system supports generic docs.

Primary objective: produce evidence-backed diagnostics and actionable documentation fixes, not only a readability score.

## Tech Stack
- **Framework:** Next.js 16+ (App Router, React 19, Server Components, Server Actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4+ with shadcn/ui components
- **Data:** SQLite + Drizzle ORM
- **Deployment:** Vercel
- **AI/LLM:** Provider-agnostic model adapters (OpenAI, Anthropic, OpenAI-compatible endpoints)
- **Font:** Inter (variable)
- **Primary accent color:** `rgb(36, 224, 126)` / `#24E07E`

## Design Direction
The UI should feel like it belongs in the Mintlify ecosystem: clean, minimal, developer-focused, dark-mode-first, restrained use of green accents for key status and CTA moments.

Reference [mintlify.com](https://mintlify.com) for visual language: subtle gradients, clean card layouts, high signal-to-noise.

## Architecture Overview
The app has three main concerns:

### 1. Documentation Ingestion
Given a docs URL, fetch and parse documentation with Mintlify-first paths:
- Fetch `/llms.txt` and `/llms-full.txt`
- Fetch `/skill.md`
- Use site MCP server when available
- Fall back to markdown page fetches and HTML scraping

### 2. Task Definition and Execution
Define implementation-oriented tasks a developer would delegate to an agent, then execute with multi-step workers using only documentation context.

Each task follows an iterative execution loop:
- `retrieve -> plan -> act -> reflect`

Persist full traces (retrieval choices, model I/O, citations, decisions, and run telemetry).

### 3. Outcome Evaluation and Failure Attribution
Evaluate attempts in two stages:
- Deterministic checks first (citation presence, signal coverage, step depth, termination behavior)
- LLM judge second (completeness, correctness, groundedness, actionability)

Classify failure causes and always attach evidence-backed, actionable doc recommendations.

## File Structure Guidance
Use Next.js App Router conventions:
- `app/` - pages and layouts
- `components/` - shared UI components (if/when added)
- `lib/` - utilities, orchestration, adapters, types
- `app/api/` - API routes for runs, ingestion, and model calls

## Key Decisions For Agents Working In This Repo
- Use Server Components by default; use Client Components only when interactivity requires them
- Keep model/API calls server-side only
- Preserve single-flow UX: paste URL -> configure tasks/workers -> run -> inspect report
- Keep scope demo-focused and execution-oriented
- Do not over-engineer (no auth, no multi-tenant accounts)
- Maintain reproducibility via SQLite persistence

## What Good Looks Like
A strong demo run should clearly show:
- Which tasks succeeded and failed
- Why failures happened (trace + attribution)
- What doc changes would raise success rate
- Optional directional comparison across docs platforms with explicit fairness caveats
