# Task Framework

## What a Task Is
A task represents something a developer would realistically try to accomplish by reading the documentation. The agent attempts the task using only the documentation as context.

## Task Structure
Each task has:
- **name**: Short label (e.g., "API Authentication")
- **description**: What the agent is trying to do (e.g., "Figure out how to authenticate API requests, including getting an API key and making a first authenticated call")
- **category**: Grouping — one of: getting-started, authentication, core-feature, integration, deployment, troubleshooting
- **difficulty**: easy | medium | hard
- **expected_signals**: Things a correct answer should contain (e.g., specific endpoint names, auth header format, code snippets). Used by the evaluator as grounding.

## Task Generation
Tasks can be:
1. **Auto-generated** — The tool reads the docs structure (via llms.txt) and generates relevant tasks based on what the documentation covers
2. **Pre-defined templates** — Common tasks that apply to most developer docs (auth, quickstart, error handling, etc.)
3. **User-defined** — The user adds custom tasks relevant to their specific docs

For the demo, auto-generation + templates is the sweet spot. The user shouldn't have to configure anything to get an impressive result.

## Evaluation Criteria
Each task attempt is evaluated by an LLM judge on:

1. **Completeness** — Did the agent produce a full, actionable answer? (0-10)
2. **Correctness** — Is the answer factually accurate based on the docs? (0-10)
3. **Groundedness** — Is the answer grounded in actual doc content, or did the agent hallucinate? (0-10)
4. **Actionability** — Could a developer follow this answer and succeed? (0-10)

Overall pass/fail threshold: average score >= 7 is a pass.

## Failure Classification
When a task fails, classify the root cause:
- **missing_content** — The docs simply don't cover this topic
- **insufficient_detail** — The topic is mentioned but not explained enough for an agent to act on
- **ambiguous_instructions** — Multiple interpretations possible, agent can't determine the right path
- **outdated_content** — Code examples or instructions reference deprecated features/versions
- **poor_structure** — The information exists but is scattered across pages in a way that's hard to follow
- **missing_examples** — Conceptual explanation exists but no concrete code/config examples

## Example Tasks (Generic Templates)

### Getting Started
- "Set up a development environment and run the hello world example"
- "Install the SDK and make your first API call"

### Authentication
- "Authenticate API requests with the correct credentials"
- "Set up OAuth / API key authentication"

### Core Features
- "Create, read, update, and delete the primary resource"
- "Configure webhooks to receive event notifications"
- "Set up rate limiting or usage quotas"

### Integration
- "Integrate with [common third-party tool]"
- "Set up CI/CD for automated deployments"

### Troubleshooting  
- "Debug a common error message"
- "Find the status page and understand error codes"
