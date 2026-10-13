# Changelog

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
