# Mintaborate

## Core Question
When a developer tells an agent to implement a workflow using Product Y's docs, does that documentation actually lead to a working result?

Mintaborate answers this by simulating real developer-agent implementation workflows and measuring outcome quality, failure causes, and doc fixes.

## Why Readability Scoring Is Not Enough
Agent-readable formats are useful, but readability alone is not the outcome teams care about.

The critical question is execution effectiveness:
- Did the agent find the right pages?
- Did it combine the right details across pages?
- Did it produce correct and actionable implementation output?
- Did the result remain grounded in documented behavior?

Mintaborate focuses on this end-to-end chain, not just whether docs are parsable.

## Product Definition
Mintaborate is an agent effectiveness simulation tool for documentation quality.

It runs implementation tasks against a docs source using only retrieved documentation context, then evaluates outcomes with deterministic checks plus LLM judging.

Output is diagnostics-first, score-second:
- Task pass/fail and rubric scores
- Trace evidence for each decision
- Failure attribution and suggested doc fixes

## Workflow Simulation Engine
For each task, workers execute an iterative loop:
- `retrieve`
- `plan`
- `act`
- `reflect`

This loop repeats until stop criteria are met. Every step is persisted for replay and analysis:
- Retrieved chunks and relevance scores
- Model prompts and responses
- Citations and selected sources
- Decisions, memory state, and termination reason
- Token and cost telemetry

## Evaluation Pipeline
Evaluation is two-stage:

1. Deterministic gates
- Citation presence
- Signal coverage
- Step depth/effort
- Termination behavior

2. LLM judge (constrained by gates)
- Completeness
- Correctness
- Groundedness
- Actionability

Deterministic checks reduce false positives and prevent high rubric scores from masking trace-level issues.

## Product Modes
### 1) Single-Docs Optimization
Run tasks on one docs source to identify implementation blockers and produce concrete documentation fixes.

### 2) Cross-Platform Directional Comparison
Run equivalent task sets across comparable products on different docs platforms to measure directional deltas in agent outcomes.

This is useful for positioning and decision support when framed honestly as directional demo evidence.

## Mintlify Strategic Fit
Mintlify's agent analytics can show where agents navigate. Mintaborate adds outcome evaluation:
- Did the task succeed?
- What failed?
- Which doc change is most likely to improve success?

This closes the loop from observed behavior to measurable execution quality.

## Fairness Protocol For Comparison Mode
To keep comparisons credible:
- Use fixed task sets per category and keep complexity balanced
- Justify product pairing (similar API/workflow scope)
- Publish caveats and label results as directional
- Avoid cherry-picking; include cases where non-Mintlify docs perform well
- Attribute wins/losses to specific mechanisms when possible (`llms-full.txt`, `skill.md`, content negotiation, MCP support, information architecture)

## Scope
Current scope is a focused demo:
- No auth or user accounts
- SQLite + Drizzle persistence for reproducible runs
- Fast setup and strong narrative for a short walkthrough

The goal is a convincing, technically grounded prototype, not a production benchmarking suite.

## Canonical Demo Narrative (3 Acts)
1. **Act 1: Simulation**
Run implementation tasks against one docs source and show outcomes with full execution traces.
2. **Act 2: Comparison**
Run equivalent tasks on a comparable product/docs platform pair and present directional deltas.
3. **Act 3: Product Implication**
Show how failure attribution and doc-fix recommendations can improve outcomes over re-runs.
