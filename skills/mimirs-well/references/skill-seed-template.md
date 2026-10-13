# Skill Seed Template

A Skill Seed is the distilled, domain-agnostic output of an extraction session.
It is not a finished skill — it is the raw material for one.

A Skill Seed should contain only what is transferable. If a pattern only makes sense
in the context of the specific project it came from, it belongs in the Pattern Report,
not the Skill Seed.

---

```markdown
## Skill Seed — [Domain / Theme]
**Source projects:** [list of projects this was extracted from]
**Date:** [YYYY-MM-DD]
**Confidence:** [single-project / confirmed across N projects / contradicted]

---

### Suggested Skill
**Name:** [snake-case name, memorable and domain-agnostic if possible]
**Trigger contexts:** [describe when Claude should consult this skill —
  be specific enough to trigger reliably, broad enough not to miss cases]

---

### Patterns
[Each pattern in one line: NAME — description]

- **[Pattern Name]** — [what it is and why it travels]
- **[Pattern Name]** — ...

---

### Principles
[The underlying reasoning. Why do these patterns work? What do they have in common?
Principles are more durable than patterns — they survive context changes.]

1. [Principle 1]
2. [Principle 2]
3. ...

---

### Pitfalls
[Conditions where these patterns break, need adaptation, or are actively harmful.
A skill that doesn't know its own limits is dangerous.]

- [Pitfall 1]: [when it happens and what to do instead]
- [Pitfall 2]: ...

---

### Open Questions
[What this seed doesn't yet answer. Needs more projects to confirm or refute.
These become the agenda for the next extraction session.]

- [Question 1]
- [Question 2]

---

### Raw Material
[Optional: paste relevant excerpts from the Pattern Report here for reference
when building the full SKILL.md]
```

---

## Worked Example

**Skill Seed — Resilient Automation**
**Source projects:** Web scraper for regulatory filings, HR portal bot
**Date:** 2025-11-03
**Confidence:** Confirmed across 2 projects

---

### Suggested Skill
**Name:** `resilient-automation`
**Trigger contexts:** When building, reviewing, or debugging any automation that interacts
with interfaces it doesn't control (web UIs, desktop apps, third-party portals). Also when
the user mentions fragile bots, broken selectors, or retry logic.

---

### Patterns
- **Locator Chain** — define 2–3 fallback selectors per element; don't rely on a single point of failure
- **Configuration Boundary** — keep all environment-specific values (URLs, credentials, thresholds) out of logic files
- **Explicit Wait Contract** — never use fixed sleeps; always wait for a specific observable condition
- **Structured Failure** — log enough context on failure that a human can reconstruct what happened without re-running
- **Idempotent Steps** — design each step so re-running it doesn't cause damage if it already succeeded

---

### Principles
1. Automations fail at the boundary between what you control and what you don't. Design for that boundary.
2. Configuration that changes between environments doesn't belong in code.
3. A bot that fails silently is worse than one that fails loudly.
4. The cost of a fragile automation compounds — each change in the target interface breaks it again.

---

### Pitfalls
- **Locator chains that are too broad:** a fallback that matches multiple elements is worse than no fallback
- **Over-engineering retry logic:** retries mask problems; log first, retry second
- **Treating test and prod as equivalent:** some patterns (e.g., aggressive retries) are fine in prod but hide bugs in test

---

### Open Questions
- Does the Locator Chain pattern apply to desktop automation (not just web)?
- Is there a pattern for handling partial state — when a multi-step process fails halfway through?
