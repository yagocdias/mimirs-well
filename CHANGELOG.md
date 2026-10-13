# Changelog

## 2.1.0

- **The Well keeps what it produces.** Pattern Reports, Skill Seeds, the Sentinel log, the
  Continuity Anchor and Handoff Packages are saved under one global folder (`~/.mimir`, option
  `well_dir`), one subfolder per project, so synthesis can read across projects
  (`well.cjs index`).
- **A `SessionStart` hook** keeps the Sentinel on in every session, points Claude at the
  project's Well, and offers a Handoff Package from the last 48 hours — no pasting. On a resume
  after the prompt cache expired, it says what the next turn will re-write.
- **A leaner skill.** SKILL.md is now a router (about half the size); the Extraction dialogue
  moved to `references/extraction.md`. The description names its triggers instead of
  "bias toward triggering", and says what it is not for.
- **In the user's language.** Signals and artifacts follow the conversation's language.
- **Patterns that act.** A confirmed pattern that is a rule for the project can also go to
  Claude Code's memory or the project's `CLAUDE.md` (asking first), so the next session uses it.
- **Seeds grow into skills**, through `skill-creator` when available or written directly to
  `~/.claude/skills/<name>/`.
- **The hook reads only what's new.** It keeps how far it read and the running totals in its
  state file, instead of re-reading the whole transcript before every prompt.
- **The window comes from the model.** Fable, Sonnet 5+, Haiku 5.5+ and Opus 4.7+ are read as 1M,
  honoring `CLAUDE_CODE_DISABLE_1M_CONTEXT`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS` and
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. Before, an Opus 5.5 session at 141k got a 🔴 "70% of 200k".
- **A guessed window says so:** the meter line shows `assumed`, the 🟡/🔴 warnings tell Claude to
  say it first, and the report names where the window size came from.
- **Subagent turns are ignored** (`isSidechain`), so they can never pass for this session's context.
- **`report.cjs` measures the session that runs it** (`CLAUDE_CODE_SESSION_ID`), even with two
  sessions in the same folder.
- **Old state is cleaned up:** at most once a day, state files untouched for 7 days are deleted.
- **Tests:** `hooks.json` is now run exactly as Claude Code spawns it; incremental reads,
  subagent lines, session lookup, cleanup, the Well and the session-start hook are covered.
  Run them all with `node --test`.

## 2.0.0

- **Measured saturation.** A Claude Code `UserPromptSubmit` hook reads real token counts every
  turn and tells Claude only when a level is crossed. The skill now measures (hook or
  `report.cjs`) and, without a measurement, says so instead of guessing.
- **Two levels that work on any window size:** 🟡 when a turn re-sends ≥ 4× the first turn's
  context (cost), 🔴 at 70% of the window. Both configurable.
- **Optional status line** with Claude Code's own numbers.
- New reference: `context-economics.md` (why cost grows quadratically with session length).
- Periodic re-evaluation (every ~10 exchanges and on topic shifts) moved into the skill itself.
- Packaged as a Claude Code plugin; the skill folder still works alone on claude.ai.

## 1.3

- Saturation Monitor with periodic re-evaluation (lived in project instructions only).

## 1.2 — Three modes · 1.1 — Sentinel · 1.0 — Extraction
