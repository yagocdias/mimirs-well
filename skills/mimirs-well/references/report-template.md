# Pattern Report Template

Use this template when producing the final Pattern Report in Mode 1 (Extraction).
Fill every section. If a section has nothing to add, write "None identified in this session"
rather than leaving it blank — absence of data is itself informative.

---

```markdown
# Pattern Report — [Project Name]
**Domain:** [e.g. RPA, product design, creative writing, data analysis]
**Date:** [YYYY-MM-DD]
**Session:** [1 of N, or "complete" if extraction is done]
**Extracted by:** Mimir's Well

---

## Core Patterns

### [Pattern Name — use a memorable, domain-agnostic name]
- **What it is:** [1–2 sentences describing the pattern clearly]
- **Why it works:** [the underlying principle — what problem does it solve structurally]
- **Example from this project:** [concrete, specific instance]
- **Transferability:** [what types of projects, domains, or situations this applies to]
- **Watch out for:** [conditions where the pattern breaks or needs adaptation]

[Repeat for each pattern]

---

## Key Decisions

[The most important choices made during this project and the reasoning behind them.
Focus on decisions that reveal principles, not just outcomes.]

| Decision | Alternatives considered | Why this path | What it reveals |
|----------|------------------------|---------------|-----------------|
| [decision] | [what else was on the table] | [the reasoning] | [the principle underneath] |

---

## Hard-Won Solutions

[Problems that resisted — and how they were finally solved.
These are often the most transferable insights because they represent real friction.]

### [Problem Name]
- **The problem:** [what it was and why it was hard]
- **What didn't work:** [approaches that failed]
- **What finally worked:** [the solution]
- **Why it worked:** [the insight that unlocked it]
- **Transferable lesson:** [what someone in a different project could take from this]

---

## Surprising Insights

[What exceeded or defied expectations — and what that reveals about the domain,
the approach, or the problem itself.]

- [Insight 1]: [what happened and what it suggests]
- [Insight 2]: ...

---

## What to Carry Forward

[If you were starting a similar project tomorrow, these are the things to bring.
Short, actionable, opinionated.]

1. [Thing 1]
2. [Thing 2]
3. [Thing 3]
...

---

## Open Questions

[What this project raised but didn't answer. Seeds for future extraction sessions.]

- [Question 1]
- [Question 2]

```

---

## Worked Example (abbreviated)

**Project:** Automated web scraper for regulatory filings
**Domain:** RPA / data extraction

### Core Pattern — Resilient Locator Strategy
- **What it is:** Never rely on a single element selector. Define a priority chain of 2–3
  locators (semantic ID → aria label → structural XPath) and fall back gracefully.
- **Why it works:** Web interfaces change. A chain of locators means one change doesn't
  break the whole automation.
- **Example:** Filing date field: tried `#filing-date` first, fell back to
  `[aria-label="Filing date"]`, then to `//table[@class="summary"]//td[3]`.
- **Transferability:** Any automation interacting with interfaces it doesn't control —
  web, desktop, or hybrid.
- **Watch out for:** Fallbacks that are too broad (match multiple elements). Each locator
  in the chain needs to be specific enough to be unambiguous.

### Key Decision
Separated configuration (URLs, credentials, retry limits) from logic into a single YAML
file loaded at runtime. Considered environment variables but chose YAML for readability
during debugging.
**What it reveals:** Configuration that humans need to read and edit belongs in a
human-readable format. Configuration that should be invisible can live in env vars.
