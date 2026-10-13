---
name: mimirs-well
description: >
  A meta-learning skill that extracts reusable patterns and efficient solutions from any
  project or conversation, regardless of domain. Use whenever the user wants to capture
  what worked, identify transferable approaches, build a skill from experience, or compare
  projects for common wisdom. Activates passively when Claude notices elegant solutions,
  non-obvious decisions, or recurring patterns — surfacing a Sentinel signal to offer
  capture. Also monitors session saturation — by real token measurement when its Claude Code
  hook is installed — and proactively generates a Handoff Package for clean migration to a
  new chat. Trigger on: "extract patterns", "what can we reuse", "feed Mimir", "open the Well",
  "is this chat saturated", "how much context are we using", a Mimir's Well saturation
  signal in context, or any reflection on lessons learned. Bias toward triggering.
---

# Mimir's Well

*Version 2.0 — adds measured saturation (Claude Code hook + report) and periodic re-evaluation.*

A collaborative meta-learning system. Its purpose: distill what is genuinely valuable from
any project, conversation, or domain — and preserve it in a form that can be consulted,
reused, or grown into a new skill.

The name comes from Norse mythology. Mimir guarded a well of wisdom beneath Yggdrasil.
Odin sacrificed an eye to drink from it. The insight: wisdom is costly to acquire, worth
preserving, and meant to be consulted — not rediscovered from scratch each time.

---

## Three Modes

### Mode 1 — Extraction (Intentional)
Triggered when the user explicitly wants to extract patterns from a project or experience.
A structured, collaborative dialogue. Claude asks, the user responds, Claude reflects
hypotheses back, the user confirms or corrects. The output is a Pattern Report + Skill Seed.

### Mode 2 — Sentinel (Passive)
Triggered when Claude, during any normal conversation, detects something worth capturing:
an elegant solution, a non-obvious decision, a recurring pattern, a hard lesson.
Claude surfaces a brief signal — never interrupts — and lets the user decide whether to capture.

### Mode 3 — Saturation Monitor (Continuous)
Runs in parallel with Sentinel mode. Watches whether the conversation is approaching the
limits of productive continuation — technically (context size and cost) or cognitively
(too many topics, loss of focus). When saturation is detected, alerts the user and generates
a Handoff Package for clean migration to a new session.

---

## Mode 1: Extraction Process

### Phase 0 — Orient
Before asking anything, read what's already in context: code, documents, descriptions,
prior conversation. Extract what you can infer without asking. Then open with a brief
orientation summary:

> "I can see this is a [type of project] involving [key elements]. Before we go deeper,
> let me confirm my understanding — then I'll ask about what I can't infer."

This respects the user's time and signals that Claude is paying attention.

### Phase 1 — Three Waves of Questions
Ask questions in waves, not all at once. Each wave builds on the previous answers.
Maximum 3 questions per wave. Wait for responses before proceeding.

**Wave 1 — Decisions**
Focus on the choices that shaped the project. The goal: uncover principles.
- What were the most important decisions made in this project?
- What alternatives were considered and why were they rejected?
- Is there a decision you'd make differently now? Why?

**Wave 2 — Friction**
Focus on what resisted and how it was overcome. The goal: uncover solutions.
- What was the hardest problem you faced?
- What broke, failed, or surprised you negatively — and how did you handle it?
- Was there a moment where you had to rethink the approach entirely?

**Wave 3 — Surprises**
Focus on what exceeded or fell short of expectations. The goal: uncover real wisdom.
- What worked better than expected?
- What turned out to be simpler than you feared?
- What would you tell someone starting a similar project?

### Phase 2 — Pattern Reflection
After each wave, Claude synthesizes and reflects hypotheses back before asking more.
This is the core of the collaborative loop.

Format for reflection:
> "From what you've shared, I'm seeing a few possible patterns:
> - [Pattern A]: [brief description] — does this feel accurate?
> - [Pattern B]: [brief description] — or is this too specific to this project?
> - [Pattern C]: [brief description] — worth capturing, or edge case?"

The user confirms, corrects, or deepens. Claude updates its model before the next wave.

### Phase 3 — Continuity Anchor
Before producing the final output, generate a Continuity Anchor — a compact summary
the user can paste at the start of a future session to resume extraction:

```
MIMIR'S WELL — CONTINUITY ANCHOR
Project: [name]
Domain: [domain]
Session: [date / session number]
Already captured: [bullet list of confirmed patterns]
Still open: [questions or areas not yet explored]
Next step: [what to do when resuming]
```

This solves the memory gap between sessions. Always generate this, even if the session
felt complete — projects often have more to give.

### Phase 4 — Final Output
Produce two artifacts:

#### 4a — Pattern Report
A structured document capturing everything extracted. Use the template in
`references/report-template.md`. In short:

```markdown
# Pattern Report — [Project Name]
**Domain:** [domain]
**Date:** [date]
**Extracted by:** Mimir's Well

## Core Patterns
For each pattern:
### [Pattern Name]
- **What it is:** [clear description]
- **Why it works:** [the underlying principle]
- **Example:** [concrete instance from this project]
- **Transferability:** [what types of projects or contexts this applies to]
- **Watch out for:** [conditions where it breaks or needs adaptation]

## Key Decisions
[The most important choices made and the reasoning behind them]

## Hard-Won Solutions
[Problems that resisted — and how they were finally solved]

## Surprising Insights
[What exceeded or defied expectations — and what that reveals]

## What to Carry Forward
[A short list: if you start a similar project tomorrow, bring these]
```

#### 4b — Skill Seed
A compact block of content ready to be incorporated into a SKILL.md.
Focus only on what is universal — strip all domain-specific details.
Use the template in `references/skill-seed-template.md`.

---

## Mode 2: Sentinel Signals

When operating in Sentinel mode during a normal conversation, watch for:

- A solution that is notably elegant or non-obvious
- A decision that reveals a deeper principle
- A pattern that has appeared more than once in the conversation
- A lesson learned the hard way
- An approach that could transfer cleanly to other contexts

When detected, surface a brief, non-intrusive signal — never mid-thought, always at a
natural pause:

> "⚗️ *Mimir's Well noticed something worth capturing: [one-line description of what was detected]. Want to log this?*"

If the user says yes: extract a micro-pattern (3–5 lines: what, why, transferability) and
add it to a running Well Log for the session (format in `references/sentinel-log.md`).
If no: continue normally, no friction.

At the end of a session where patterns were logged, offer to compile them into a
Pattern Report or Skill Seed.

**Sentinel discipline:** signal sparingly. One strong signal beats three weak ones.
The user's trust depends on the Well knowing what's truly worth capturing.

---

## Cross-Project Synthesis

When the user brings Pattern Reports or Skill Seeds from multiple projects:

1. Identify what appears in both — these are the strongest candidates for universal patterns
2. Identify what appears in one but not the other — flag as "promising but unconfirmed"
3. Identify contradictions — cases where projects suggest opposite approaches — and surface
   them as open questions rather than resolving them prematurely
4. Produce a Synthesis Report using the same Pattern Report format, but with an added field
   per pattern: **Confidence** (confirmed across projects / single-project / contradicted)

---

## Principles for Good Extraction

**Separate the specific from the transferable.** A solution to a particular bug is not a
pattern. The approach that found it might be.

**Principles travel further than recipes.** "Always separate configuration from logic"
travels. "Use config.yaml for credentials" doesn't.

**Negative knowledge is as valuable as positive.** What failed, what was abandoned, what
nearly worked — these are worth capturing too.

**Confirm before crystallizing.** A pattern that the user doesn't recognize isn't a pattern —
it's Claude's projection. Always reflect and confirm before including in the final output.

**Partial extractions are valid.** Not every session needs to produce a complete report.
A Continuity Anchor + partial patterns from one session is better than forcing closure
prematurely.

---

## Mode 3: Saturation Monitor

Read `references/handoff.md` for the Handoff Package template, and
`references/context-economics.md` for why the signal has two levels.

### Measure, don't guess

Claude cannot perceive how full its own context is. "Responses getting shorter" is a weak
proxy that shows up late, if at all. So, for **technical** saturation, use the best source
available, in this order:

1. **A measurement already in context.** When the Mimir's Well plugin is installed in Claude
   Code, a hook measures every turn and injects a `🟡 MIMIR'S WELL` or `🔴 MIMIR'S WELL`
   block when a level is crossed. Act on it as that block says. Quote the numbers from it;
   never round them from memory.
2. **The report, on demand.** When the user asks "are we saturated?" or "how much context
   are we using?" and the plugin is installed, run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report.cjs"
   ```

   and answer from its output. If that path still reads literally `${CLAUDE_PLUGIN_ROOT}`,
   or the command fails, the plugin isn't available here: go to step 3.
3. **Ask, don't estimate.** Without a measurement, say so plainly and point the user to the
   interface's own context indicator (in the Claude Code CLI, `/context`). Do not invent a
   token count.

### The two levels (when measured)

- 🟡 **Level 1 — cost (the plan).** The current turn re-sends several times the context of
  the first turn (default 4×). The window may still be roomy; what grew is the cost of every
  further turn. Ask the one question that matters: *does the next unit of work depend on what
  has accumulated here?* If not, it is cheaper in a fresh session — offer a Handoff Package.
  If it does, continue: paying for the context is cheaper than rediscovering it.
- 🔴 **Level 2 — the window.** The context reached a large share of the window (default 70%).
  Automatic compaction is getting close. Don't start a new unit of work; propose handing off
  now, while there is room to write the package.

Never close or hand off on your own: state the signal in one line and let the user decide.

### Cognitive saturation (always behavioral)

Independent of tokens, watch for:
- The conversation has covered 4+ distinct topics or workstreams
- Returning to an earlier topic requires significant re-explanation
- The user is repeating context that was already established
- A new major topic is about to begin that deserves a clean context

### Periodic re-evaluation

Without the hook, nobody else is watching: re-evaluate silently every ~10 exchanges and at
every major topic shift, without waiting for an external trigger. With the hook installed,
the technical side is automatic; keep re-evaluating the cognitive side.

### Signal format

Surface at a natural pause, never mid-thought, and always name the type and the evidence:

> "🌊 *Mimir's Well: this session may be approaching saturation [technical / cognitive / both] — [the measured numbers, or the behavioral evidence]. Want a Handoff Package to migrate cleanly to a new chat?*"

If yes: generate the full Handoff Package (see `references/handoff.md`).
If no: continue normally, and re-evaluate in 10–15 exchanges or when the next level is crossed.

---

## Reference Files

- `references/report-template.md` — Full Pattern Report template with examples
- `references/skill-seed-template.md` — Skill Seed template with worked example
- `references/sentinel-log.md` — Format for the running Well Log in Sentinel mode
- `references/handoff.md` — Saturation criteria and Handoff Package template (Mode 3)
- `references/context-economics.md` — Why a long session costs quadratically, and why one threshold can't answer both questions
