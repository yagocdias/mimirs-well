---
name: mimirs-well
description: >
  Meta-learning across projects: extracts reusable patterns from a project or conversation,
  quietly flags lessons worth keeping as they happen (Sentinel), keeps them in a Well shared by
  all projects, and tells — by measurement, when its Claude Code hook is installed — when a
  session should hand off to a fresh one, updating the project's handoff file. Use when the user
  wants to capture what worked, extract or compare patterns, reuse lessons from other projects,
  turn experience into a skill, asks whether the session is saturated or how much context is used,
  asks to update, check or resume from the handoff(s) (in any language), says "feed Mimir" or
  "open the Well", or when a Mimir's Well block (🟡/🔴 saturation, session
  start) is in context. Not for ordinary coding or writing requests that involve none of these.
---

# Mimir's Well

*Version 2.2.* Mimir guarded a well of wisdom beneath Yggdrasil; Odin gave an eye to drink
from it. Wisdom is costly to acquire, worth preserving, and meant to be consulted — not
rediscovered from scratch each time. This skill distills what is genuinely valuable from any
project or conversation and keeps it where it can be consulted, reused, or grown into a skill.

**Speak the user's language.** Write every artifact — reports, seeds, log entries, anchors,
handoffs — in the language of the conversation, translating the templates' headings. The
signals keep their emoji (⚗️ 🌊 🟡 🔴); their words are translated. Mimir's Well blocks injected
by hooks arrive in English: relay them in the user's language. File names stay ASCII kebab-case.

## The modes

| Mode | When | Read |
|---|---|---|
| **Extraction** | The user asks to extract patterns from a project or experience | `references/extraction.md` |
| **Sentinel** | Always, quietly, during normal work | below; `references/sentinel-log.md` |
| **Synthesis** | The user wants to compare projects or reuse what other projects taught | below |
| **Saturation** | A 🟡/🔴 block in context, the user asks, or a re-evaluation finds it | below; `references/handoff.md` |

## The Well on disk

Where there is a file system (Claude Code), everything the Well produces is saved in one global
Well, one folder per project, so it outlives the session and projects can be read side by side.
On claude.ai, without a file system, show the artifacts in the reply.

The plugin's session-start hook puts this project's folder in context. If it isn't there:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/well.cjs" --root "${user_config.well_dir}"`. Before the
first write in a project, create the folder with the same command plus `ensure`. If those paths
still read literally `${...}`, the plugin isn't installed: use `~/.mimir/projects/<project folder name>/`.

| Artifact | File, inside the project's folder | How |
|---|---|---|
| Pattern Report | `reports/YYYY-MM-DD-<topic>.md` | new file |
| Synthesis Report | `reports/YYYY-MM-DD-synthesis-<topic>.md` | new file |
| Skill Seed | `seeds/<name>.md` | new file |
| Sentinel entry the user said yes to | `well-log.md` | append |
| Continuity Anchor | `anchor.md` | overwrite: only the latest matters |
| Handoff, when the project keeps no `HANDOFF.md` of its own | `handoffs/YYYY-MM-DD-HHMM.md` | new file |

Save each artifact when you produce it and say where in one line. Show it in the reply too when
the user needs to read it now.

## Sentinel

Watch for a solution that is notably elegant or non-obvious, a decision that reveals a deeper
principle, a pattern that recurs, a lesson learned the hard way, an approach that transfers
cleanly. At a natural pause — never mid-thought — offer it in one line:

> ⚗️ *Mimir's Well noticed something worth capturing: [one line]. Want to log this?*

If yes: write a 3–5 line micro-pattern (format in `references/sentinel-log.md`) and append it to
`well-log.md`. If no: carry on, no friction. At the end of a session with entries, offer to
compile them into a Pattern Report or Skill Seed.

**Signal sparingly.** One strong signal beats three weak ones; the user's trust depends on the
Well knowing what's truly worth capturing.

## After a pattern is confirmed: make it act

The Well keeps the why and the cross-project view, but Claude only acts on what it sees at the
start of a session. When a confirmed pattern is a rule for this project's future work (a
convention, a decision not to revisit), offer to also save it where the next session will see
it: Claude Code's memory, or the project's `CLAUDE.md`. That file belongs to the repo: show the
exact lines and ask before writing. One line per rule, pointing back to the report file.

When a Skill Seed is solid enough, offer to grow it into a real skill — the end of
`references/skill-seed-template.md` says how.

## Synthesis across projects

Start from the Well's table of contents — titles and paths, not contents:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/well.cjs" index --root "${user_config.well_dir}"`.
Read only the reports and seeds that bear on the question; reports the user pastes count too.
Then: what appears in several projects (strongest candidates), what appears in one only
(promising but unconfirmed), and what contradicts (open questions — don't resolve them
prematurely). Write a Synthesis Report in the Pattern Report format, adding to each pattern a
**Confidence**: confirmed across projects / single-project / contradicted.

## Saturation

**Measure, don't guess.** Claude cannot perceive how full its own context is. With the plugin,
the person already sees the meter in a band above the prompt (terminal and desktop app): don't
repeat it in replies unless asked. For the technical side, use the best source available:

1. **A measurement in context.** With the plugin installed, a hook injects a `🟡 MIMIR'S WELL`
   or `🔴 MIMIR'S WELL` block when a level is crossed. Act as it says and quote its numbers.
   If it says the window size was assumed, say that first: the percentage may be too high.
2. **The report, on demand** ("are we saturated?", "how much context?"):
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/report.cjs"` — answer from its output.
3. **No measurement** (the path reads literally `${...}`, or the command fails): say so and point
   to the interface's own indicator (`/context` in the Claude Code CLI). Never invent a count.

🟡 means each turn now costs several times the first: ask whether the next unit of work depends
on what accumulated here — if not, a fresh session is cheaper. 🔴 means the window is filling and
compaction is near: don't start new work, propose handing off while the package still fits.

The cognitive side is always yours to watch: 4+ topics, re-explaining earlier threads, the user
repeating context, a major new topic about to begin. Without the hook, re-evaluate silently every
~10 exchanges and at topic shifts.

Signal at a natural pause, with the type and the evidence, and let the user decide — never hand
off on your own:

> 🌊 *Mimir's Well: this session may be approaching saturation [technical / cognitive / both] — [measured numbers or behavioral evidence]. Want me to update the handoff so a new session picks up from here?*

**Handing off is updating a file, not printing blocks to paste.** If yes, follow
`references/handoff.md`: the project's own living `HANDOFF.md` comes first (the session-start
context names it), updated in place in its own structure; then reply in two or three lines —
what was updated, where, and that the next session only needs "check the handoffs".

**Resuming.** When the user asks to check or resume from the handoffs, or accepts the offer made
at session start: read the handoff, say in two or three lines where things stand and the next
step, and start on it.

## References

- `references/extraction.md` — the Extraction dialogue, phase by phase, and its principles
- `references/report-template.md` — Pattern Report template with examples
- `references/skill-seed-template.md` — Skill Seed template, and how to grow a seed into a skill
- `references/sentinel-log.md` — Well Log entry format and signal discipline
- `references/handoff.md` — saturation criteria, and how to hand off and resume through a file
- `references/context-economics.md` — why a long session costs quadratically, and why one threshold can't answer both questions
