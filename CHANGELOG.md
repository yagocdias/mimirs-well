# Changelog

## Unreleased (2.1.0)

- **The hook reads only what's new.** It keeps how far it read and the running totals in its
  state file, instead of re-reading the whole transcript before every prompt.
- **Subagent turns are ignored** (`isSidechain`), so they can never pass for this session's context.
- **`report.cjs` measures the session that runs it** (`CLAUDE_CODE_SESSION_ID`), even with two
  sessions in the same folder.
- **Old state is cleaned up:** at most once a day, state files untouched for 7 days are deleted.
- **Tests:** `hooks.json` is now run exactly as Claude Code spawns it; incremental reads,
  subagent lines, session lookup and cleanup are covered.

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
