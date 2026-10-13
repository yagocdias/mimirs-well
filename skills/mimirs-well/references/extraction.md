# Extraction — the full process (Mode 1)

A structured, collaborative dialogue: Claude asks, the user answers, Claude reflects
hypotheses back, the user confirms or corrects. The output is a Pattern Report and a
Skill Seed. Read this when the user asks to extract patterns from a project or experience.

---

## Phase 0 — Orient

Before asking anything, read what's already in context: code, documents, descriptions,
prior conversation, and the project's `anchor.md` in the Well if there is one (an earlier
extraction left off there). Extract what you can infer without asking. Then open with a
brief orientation summary:

> "I can see this is a [type of project] involving [key elements]. Before we go deeper,
> let me confirm my understanding — then I'll ask about what I can't infer."

This respects the user's time and signals that Claude is paying attention.

## Phase 1 — Three Waves of Questions

Ask questions in waves, not all at once. Each wave builds on the previous answers.
Maximum 3 questions per wave. Wait for responses before proceeding.

**Wave 1 — Decisions.** The choices that shaped the project. The goal: uncover principles.
- What were the most important decisions made in this project?
- What alternatives were considered and why were they rejected?
- Is there a decision you'd make differently now? Why?

**Wave 2 — Friction.** What resisted and how it was overcome. The goal: uncover solutions.
- What was the hardest problem you faced?
- What broke, failed, or surprised you negatively — and how did you handle it?
- Was there a moment where you had to rethink the approach entirely?

**Wave 3 — Surprises.** What exceeded or fell short of expectations. The goal: uncover real wisdom.
- What worked better than expected?
- What turned out to be simpler than you feared?
- What would you tell someone starting a similar project?

## Phase 2 — Pattern Reflection

After each wave, synthesize and reflect hypotheses back before asking more. This is the
core of the collaborative loop.

> "From what you've shared, I'm seeing a few possible patterns:
> - [Pattern A]: [brief description] — does this feel accurate?
> - [Pattern B]: [brief description] — or is this too specific to this project?
> - [Pattern C]: [brief description] — worth capturing, or edge case?"

The user confirms, corrects, or deepens. Update your model before the next wave.

## Phase 3 — Continuity Anchor

Before the final output, write a Continuity Anchor — a compact summary that lets a future
session resume the extraction:

```
MIMIR'S WELL — CONTINUITY ANCHOR
Project: [name]
Domain: [domain]
Session: [date / session number]
Already captured: [bullet list of confirmed patterns]
Still open: [questions or areas not yet explored]
Next step: [what to do when resuming]
```

Always write it, even if the session felt complete — projects often have more to give.
Save it as the project's `anchor.md` (it replaces the previous one).

## Phase 4 — Final Output

**4a — Pattern Report.** Everything extracted, in the template of `report-template.md`:
core patterns (what, why it works, example, transferability, watch out for), key
decisions, hard-won solutions, surprising insights, what to carry forward.

**4b — Skill Seed.** Only what is universal, every domain-specific detail stripped, in the
template of `skill-seed-template.md`. Then offer to grow it into a skill (the end of that
file says how).

---

## Principles for Good Extraction

**Separate the specific from the transferable.** A solution to a particular bug is not a
pattern. The approach that found it might be.

**Principles travel further than recipes.** "Always separate configuration from logic"
travels. "Use config.yaml for credentials" doesn't.

**Negative knowledge is as valuable as positive.** What failed, what was abandoned, what
nearly worked — these are worth capturing too.

**Confirm before crystallizing.** A pattern the user doesn't recognize isn't a pattern —
it's Claude's projection. Always reflect and confirm before including it.

**Partial extractions are valid.** A Continuity Anchor plus partial patterns from one
session is better than forcing closure prematurely.
