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

> "🌊 *Mimir's Well: This session may be approaching saturation [technical / cognitive / both]. Continuing here risks losing context or clarity. Want me to update the handoff so a new session picks up from here?*"

**Discipline rules:**
- Never signal mid-thought or mid-task
- Always name the type (technical, cognitive, or both) and the evidence — measured
  numbers when you have them, quoted exactly
- Never hand off or close on your own: the user decides
- If the user says no: continue normally, re-evaluate in 10–15 exchanges
- If the user asks "are we saturated?": always answer honestly with evidence

---

## Handing Off

A handoff is a file the next session reads, not text the user copies. The user should be
able to close this session and, in the next one, just say "check the handoffs".

### Where it goes, in this order

1. **The project's own living handoff.** Many projects keep a `HANDOFF.md` (in the root,
   `docs/` or `.claude/`) that every session updates; the session-start context names it.
   That file is the handoff. Update it in place, keeping its structure, its language and its
   habits — never impose the template below on it.
2. **No such file, but a file system.** Propose creating `docs/HANDOFF.md` (or `HANDOFF.md`
   in the root when there is no `docs/`) with the structure below. It's a file in the repo:
   ask once. If the user prefers to keep it out of the repo, write it to the Well's
   `handoffs/YYYY-MM-DD-HHMM.md` instead.
3. **No file system (claude.ai).** The only case where the handoff is text to paste: give the
   start-here part as one block, to open the new chat with.

### Updating it

- **Rewrite the start-here part at the top** for the next session: session number and date,
  where things stand, the one next step, and the decisions not to reopen (one line of why
  each). Replace the previous one; don't stack them.
- **Prune.** Move what got done out of the open items, drop what no longer applies. A handoff
  that only grows stops being read.
- **Keep the project's archive habit.** If old versions sit beside it (`HANDOFF.sessao01.md`
  and the like), archive the previous version the same way before rewriting.
- **Durable rules go where they belong.** What is true for every future session (a convention,
  a confirmed architecture decision) goes to `CLAUDE.md` or Claude Code's memory — show the
  lines and ask first. The handoff points at them instead of repeating them.
- **Patterns go to the Well.** Sentinel entries not logged yet are appended to `well-log.md`;
  the handoff mentions them in a line only if the next session needs them.
- **No token counts.** They describe a session that is ending; the next one measures itself.

### What to say in the reply

Two or three lines, not the content: what was updated, where, and how to resume. For example:

> Handoff updated in `docs/HANDOFF.md` (session 45: next step is the database migration). In the
> next session, say "check the handoffs" — or accept when it's offered.

Show the content only if the user asks for it.

### Resuming

When the user says "check the handoffs", "continue from the handoff" (in any language), or
accepts the offer made at session start: read the project's handoff — or the Well's pending
one — say in two or three lines where things stand and what the next step is, and start on it.
A Well handoff file is renamed to end in `.loaded.md` once resumed, so it isn't offered again;
a project's living `HANDOFF.md` is never renamed.

### Structure for a new handoff file

Write it in the user's language.

```markdown
# HANDOFF — [project]

## 🔴 Start here — session [N], [date]
**Where we are:** [current state, in two or three sentences]
**Next step:** [the one specific thing to do first]
**Do not reopen:** [decisions already made — one line of why each]

## Open items
[What's pending, most important first]

## Where things are
[Files, commands, environments the next session needs to find]

## Traps already paid for
[What failed and why, so it isn't tried again]
```
