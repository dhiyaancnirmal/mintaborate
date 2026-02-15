# Design Tokens & Visual Guidelines

## Brand
- **Name:** Mintaborate
- **Tagline:** "Agent-readiness testing for documentation"
- **Tone:** Developer-focused, clean, premium. Feels like it belongs in the Mintlify ecosystem.

## Colors
```
Primary Green:    #24E07E / rgb(36, 224, 126)   — Mintlify's signature green. Use for: pass states, primary CTAs, accent highlights
Fail Red:         #EF4444                         — Use for: fail states, error indicators
Warning Amber:    #F59E0B                         — Use for: partial pass, warnings
Background Dark:  #0A0A0A                         — Primary background (dark mode default)
Surface:          #141414                         — Card/panel backgrounds
Surface Elevated: #1E1E1E                         — Hover states, elevated cards
Border:           #262626                         — Subtle borders
Text Primary:     #FAFAFA                         — Main text
Text Secondary:   #A1A1AA                         — Muted text, descriptions
Text Tertiary:    #52525B                         — Very muted, labels
```

## Typography
- **Font Family:** Inter (variable weight)
- **Import:** `@fontsource-variable/inter` or Google Fonts
- **Weights used:** 400 (body), 500 (medium/labels), 600 (semibold/headings), 700 (bold/scores)
- **Body size:** 14px-16px
- **Monospace:** Use for URLs, code snippets, task definitions — JetBrains Mono or Geist Mono

## Layout Principles
- Dark mode default (no light mode needed for the demo)
- Max content width ~1200px, centered
- Generous whitespace — don't crowd things
- Cards with subtle borders, no heavy shadows
- Score numbers should be large and prominent — the visual payoff is seeing 11/15 in big type

## Component Patterns
- Use shadcn/ui as the base component library
- Cards for each task result (pass/fail indicator + task name + diagnosis)
- Progress/loading states during agent execution (this takes time — make the wait feel intentional)
- A big hero score at the top of the results page
- Collapsible detail panels for failure diagnostics

## Animation
- Keep it subtle. Fade-ins for results as they stream in.
- The score number could animate/count up when results land.
- No gratuitous motion.
