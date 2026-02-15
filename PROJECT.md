# Mintaborate

## What This Is

Mintaborate is a documentation agent-readiness testing tool built as a portfolio project targeting Mintlify. It evaluates how well a company's Mintlify-powered documentation performs when AI agents try to use it to accomplish real tasks.

Think of it as **CI/CD for documentation quality, from the agent's perspective.**

The core loop:
1. User pastes a Mintlify docs URL
2. The tool defines a set of agent tasks against those docs (e.g., "authenticate with the API", "set up webhooks", "deploy to production")
3. An AI agent attempts each task using only the documentation (via MCP, llms.txt, or direct scraping)
4. Each task gets scored: pass/fail, with a diagnosis of *why* it failed (missing page, ambiguous instructions, outdated code sample, etc.)
5. Results are displayed as a dashboard — a "report card" for documentation agent-readiness

### The Extended Loop (skill.md optimization)
Once the test suite runs, Mintaborate can also:
- Evaluate the auto-generated skill.md from the Mintlify site
- Re-run the test suite with the skill.md in context
- Generate an optimized skill.md based on failure analysis
- Re-run again and show the before/after delta

This creates a complete feedback loop: **test → diagnose → improve → re-test.**

## Why This Matters to Mintlify

Mintlify's entire strategic direction is "documentation is now as much for AI agents as for humans." They've shipped:
- **Agent analytics** (Feb 2026) — passive observation of which agents visit and what they access
- **skill.md** (Jan 2026) — condensed capability files that agents can install
- **llms.txt / llms-full.txt** — plain text doc formats optimized for LLM ingestion
- **Autopilot** (Dec 2025) — monitors codebase changes and auto-generates doc update PRs
- **MCP server support** — lets agents query docs directly
- **Content negotiation** — serves markdown to agents, HTML to humans

**The gap Mintaborate fills:** Mintlify shows you *what* agents do (analytics). Mintaborate shows you *where agents fail and why*. Nobody is actively testing whether docs work for agents. This is the missing piece in their product story.

Mintlify could ship this as a feature: every time a customer deploys docs, run the test suite, flag regressions, suggest skill.md improvements. That's the pitch.

## Why This Project Exists

This is being built by Dhiyaan as a portfolio project to demonstrate value to Mintlify and land an engineering role. The strategy:
- Build it as a real, functional tool
- Record a high-quality Screen Studio video walkthrough
- Post on Twitter and email directly to Mintlify team
- Show deep understanding of their product, codebase, and strategic direction

The video narrative should flow as:
1. "Here's [Company X]'s Mintlify docs. I defined 15 agent tasks."
2. "11 pass. 4 fail. Here's why each fails."
3. "Now here's their auto-generated skill.md. Re-run: 12 pass — marginal improvement."
4. "Here's an optimized skill.md using failure data. Re-run: 14 pass."
5. "This feedback loop could be a Mintlify feature."

## Key Mintlify Context

- ~35 person team, SF-based, YC W22, $22M raised (a16z Series A)
- 18,000+ companies, 100M+ developers annually
- Customers include Anthropic, Cursor, Perplexity, Coinbase, Vercel, X
- They value "slope over y-intercept" — learning velocity and grit
- Interview process involves Next.js take-homes and React debugging sessions
- Acquired Trieve (search/RAG company), built custom analytics on ClickHouse + Kafka
- Key people: Han Wang (co-founder), Hahnbee Lee (co-founder), Dens Sumesh (engineer, ex-Trieve), Nick Khami (engineer)
