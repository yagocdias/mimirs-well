# Handoff Guide — Session Saturation & Migration (Mode 3)

A conversation has two kinds of limits. Understanding both is necessary for
knowing when to migrate and what to carry forward.

---

## Two Types of Saturation

### Technical Saturation
The context is getting expensive or physically filling up. It has two levels, and
they answer different questions (see `context-economics.md`):

- 🟡 **Cost** — each turn re-sends the whole context, so a turn now costs several
  times what the first one did, even with plenty of window left.
- 🔴 **Window** — the context is close to the window size and automatic compaction
  is near.

**Measure it; don't infer it.** Claude cannot perceive its own context size. When the
Mimir's Well hook is installed, use its numbers (or run the report — see SKILL.md,
Mode 3). Without a measurement, ask the user to check the interface's context
indicator instead of guessing.

Behavioral symptoms are a last resort and arrive late:
- Claude references something incorrectly that was discussed earlier
- Claude loses track of decisions made at the beginning of the conversation
- The conversation was automatically compacted/summarized

### Cognitive Saturation
The conversation has accumulated too many topics, threads, or context switches
to continue productively — even if the context window still has capacity. Symptoms:
- The conversation has covered 4+ distinct topics or workstreams
- Returning to an earlier topic requires significant re-explanation
- New questions need more preamble than they should
- The user is repeating context that was already established
- A major new topic is about to begin

Cognitive saturation is often more actionable than technical saturation — migrating
at the right moment preserves clarity, even when you technically could continue.

---

## Saturation Signal

When either type of saturation is detected, surface this signal at a natural pause:

> "🌊 *Mimir's Well: This session may be approaching saturation [technical / cognitive / both]. Continuing here risks losing context or clarity. Want a Handoff Package to migrate cleanly to a new chat?*"

**Discipline rules:**
- Never signal mid-thought or mid-task
- Always name the type (technical, cognitive, or both) and the evidence — measured
  numbers when you have them, quoted exactly
- Never hand off or close on your own: the user decides
- If the user says no: continue normally, re-evaluate in 10–15 exchanges
- If the user asks "are we saturated?": always answer honestly with evidence

---

## The Handoff Package

When the user confirms migration, generate a complete Handoff Package.
This is the single artifact the user needs to open a new session and continue
without losing anything important.

Structure it in four clearly labeled blocks:

---

### Block 1 — Project Instructions Update
Content that should be added or updated in the project's persistent instructions.
This is for durable context — things that should be true for all future sessions,
not just the next one.

```
## PROJECT INSTRUCTIONS UPDATE
[Add / Replace / Remove] the following:

[content to add or modify]

Reason: [one sentence explaining why this belongs in project instructions]
```

If nothing needs to change in project instructions, write: "No changes needed."

---

### Block 2 — Session Opener
The exact text the user should paste as the first message in the new chat.
This reconstructs the working context — where we are, what we're doing, what decisions
have been made — so the new session starts with full orientation.

```
## SESSION OPENER
Paste this as your first message in the new chat:

---
[Context summary — what this project/conversation is about]

[Current state — where we are right now]

[Active decisions — key choices already made that should not be revisited]

[Next step — the specific thing we were about to do or just started]

[Active skills — which skills should be running in this session]
---
```

Do not put the old session's token numbers in the opener — they describe a session
that is ending, and the new one measures itself from zero.

The session opener should be complete enough that no additional explanation is needed.
If the user pastes it in a new chat, that chat should be immediately productive.

Where there is a file system, also save the whole package to the project's `handoffs/`
folder (see "The Well on Disk" in SKILL.md). With the plugin installed, the next session in
this project finds it and offers to resume from it, so pasting becomes optional.

---

### Block 3 — Captured Patterns (if any)
Any patterns logged by the Sentinel during this session that haven't been compiled yet.
These should be preserved before the session closes.

```
## CAPTURED PATTERNS
[List of patterns logged this session, in micro-pattern format]

Recommended action: [compile into Pattern Report / add to Skill Seed / save for later]
```

If no patterns were logged, write: "No patterns captured this session."

---

### Block 4 — Discardable
What does NOT need to be carried forward. Explicitly listing this reduces the user's
cognitive load — they don't need to wonder if they're missing something.

```
## DISCARDABLE
The following from this session does not need to be carried forward:
- [item] — [reason it's not needed]
- [item] — [reason]
```

---

## Handoff Package — Example

**Scenario:** Long session developing two RPA bots, with several skill decisions made
and a saturation signal triggered mid-way through the second bot's architecture.

---

### Block 1 — Project Instructions Update
Add the following to project instructions:

```
## RPA Architecture Decisions (confirmed)
- Config/logic separation: all environment variables in config.yaml, never inline
- Locator strategy: always define a chain of 3 selectors per element
- Retry pattern: exponential backoff, max 3 retries, log full context on final failure
- Bot entry point: always a single main() function with explicit step logging
```

Reason: These decisions were confirmed across both bots and should apply to all future
automations in this project.

---

### Block 2 — Session Opener
Paste this as your first message in the new chat:

---
I'm developing two RPA bots for [domain]. Both share a common architecture (config/logic
separation, locator chains, exponential backoff retry). These decisions are confirmed and
should not be revisited.

**Current state:** Bot 1 is complete. Bot 2 architecture is defined but not yet implemented.
We were about to start writing the main orchestration loop for Bot 2.

**Next step:** Write the main() function for Bot 2, following the same entry point pattern
as Bot 1 (single main(), explicit step logging, early validation before any UI interaction).

**Active skills:** Mimir's Well (Sentinel + Saturation Monitor).

---

### Block 3 — Captured Patterns
- **Early Validation Gate** — validate all preconditions before touching any UI; fail fast
  with a clear message rather than mid-flow. Transferable to any automation with external deps.
- **Step Logger Wrapper** — wrap each major step in a logging decorator that records start,
  end, duration, and outcome. Makes post-mortem debugging significantly faster.

Recommended action: compile into Skill Seed for future RPA skill.

---

### Block 4 — Discardable
- The early debugging discussion about Bot 1's selector failures — resolved, not a pattern
- The comparison of retry libraries — decision made (custom implementation), debate closed
- All intermediate code snippets from Bot 1 — final version is in the project files
