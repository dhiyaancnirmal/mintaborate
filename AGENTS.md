# AGENTS.md

## Project Context
Read PROJECT.md first. Mintaborate is a documentation agent-readiness testing tool. It runs AI agent tasks against Mintlify documentation sites and scores how well the docs support agent workflows.

## Tech Stack
- **Framework:** Next.js 15+ (App Router, React 19, Server Components, Server Actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 4+ with shadcn/ui components
- **Deployment:** Vercel
- **AI/LLM:** Anthropic Claude API (claude-sonnet-4-20250514 for task execution, claude-sonnet-4-20250514 for evaluation/judging)
- **Font:** Inter (variable) — matches Mintlify's brand
- **Primary accent color:** `rgb(36, 224, 126)` / `#24E07E` — Mintlify's signature green

## Design Direction
This project should visually feel like it *belongs* in the Mintlify ecosystem. Clean, minimal, developer-focused. Dark mode default. Use Inter variable font throughout. The green accent should be used sparingly — for scores, pass indicators, key CTAs. The overall aesthetic should be polished and premium, not generic.

Reference Mintlify's own site (mintlify.com) for design language — they use a lot of subtle gradients, clean card layouts, and restrained use of color.

## Architecture Overview

The app has three main concerns:

### 1. Documentation Ingestion
Given a Mintlify docs URL, fetch and parse the documentation. Multiple approaches:
- Fetch `/llms.txt` and `/llms-full.txt` for structured content
- Fetch `/skill.md` for the existing agent capability summary  
- Use the site's MCP server if available
- Fall back to scraping individual pages as markdown (append `.md` to any Mintlify page URL)

### 2. Task Definition & Execution
Define agent tasks that represent real things a developer would try to do using the docs. For example:
- "How do I authenticate with the API?"
- "Set up a webhook listener"
- "Deploy to production"
- "Configure rate limiting"

Then run an AI agent that attempts each task using *only* the documentation as context. The agent should behave like a developer reading the docs — it searches, reads pages, follows links, and tries to produce a working answer.

### 3. Evaluation & Scoring
Use LLM-as-judge to evaluate each task attempt:
- Did the agent produce a correct, actionable answer?
- Was the answer grounded in the documentation (not hallucinated)?
- Where did it struggle? What was missing from the docs?
- Classify failures: missing content, ambiguous instructions, outdated examples, insufficient detail, broken links, etc.

Display results as a dashboard with per-task pass/fail, overall score, and actionable diagnostics.

## File Structure Guidance
Use Next.js App Router conventions. Keep it simple:
- `app/` — pages and layouts
- `components/` — React components
- `lib/` — utilities, API clients, types
- `app/api/` — API routes for LLM calls and doc fetching

## Key Decisions for the Agent
- Use server components where possible, client components only when needed for interactivity
- All LLM API calls happen server-side (API routes or server actions)
- The app should work as a single-page flow: paste URL → configure tasks → run → view results
- Keep the scope tight. This is a demo, not a production SaaS. Optimize for "looks great in a 3-minute Screen Studio video"
- Don't over-engineer. No auth, no database, no user accounts. Everything is ephemeral per session.

## What Good Looks Like
The demo should be impressive when someone pastes a real Mintlify docs URL (like docs.anthropic.com or docs.cursor.com) and sees a scored report card appear. The visual impact of green checkmarks and red X's next to real documentation tasks is what sells this.
