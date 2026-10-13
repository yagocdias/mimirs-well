# Testing Mimir's Well (tester guide)

About 15 minutes. You need nothing from the author: everything is in this repository.

## 0. Prerequisites

| Check | Command | Expected |
|---|---|---|
| Claude Code | `claude --version` | any recent version |
| Node.js 18+ | `node --version` | `v18` or higher |
| git | `git --version` | any (the marketplace is cloned with git) |

## 1. Install

```
claude plugin marketplace add yagocdias/mimirs-well
claude plugin install mimirs-well@mimirs-well
```

(or `/plugin marketplace add …` and `/plugin install …` inside Claude Code)

**Restart Claude Code.** Hooks only load when a session starts.

## 2. Make the test fast (optional, recommended)

By default the 🟡 signal needs a turn that re-sends 4× the first turn's context, which takes a
long session. For the test, lower it:

```
/plugin configure mimirs-well@mimirs-well
```

and set `cost_factor` to `1.5`. From a terminal, the same thing:

```
echo '{"cost_factor":"1.5"}' | claude plugin configure mimirs-well@mimirs-well --values-stdin
```

Put it back to `4` when you're done. Restart Claude Code after changing it.

## 3. The checks

Open a **new** session in any project and go through these in order. Note what you see.

| # | Do this | Expected |
|---|---|---|
| 1 | Send any prompt | **Terminal:** a line `Mimir's Well · 🟢 context …k (…% of …) · turn ~1.0x the first · N req`. **Desktop app / IDE:** this line may not be shown — that's a known limit, not a failure (see step 4) |
| 2 | Ask Claude to read a few large files from the project | The context grows. Once a turn re-sends ≥ 1.5× the first turn's context (and ≥ 15% of the window), Claude tells you **in one line** that the session reached 🟡 and asks whether to hand off. It must **not** close anything on its own |
| 3 | Ask: *"are we saturated?"* | Claude runs the measurement report and quotes real numbers (context, % of window, ×first turn). It must not invent a number |
| 4 | Ask: *"give me a Handoff Package"* | Four blocks: project-instructions update, session opener, captured patterns, discardable |
| 5 | Ask: *"what can we reuse from this session?"* | Extraction mode: an orientation summary, then at most 3 questions per wave |

## 4. Optional: the meter in the footer

If step 1 showed nothing (desktop/IDE), install the status line as described in the README
("Optional: the meter in the footer") and repeat step 1. Or set `echo_in_reply` to `true` in
`/plugin configure` — Claude will end each reply with the meter line.

## 5. Report back

Open an issue at https://github.com/yagocdias/mimirs-well/issues with:

- OS, `claude --version`, and the interface (terminal, desktop app, IDE)
- which check (1–5) failed and what you saw instead
- the output of the report, run from the project folder:

  ```
  node ~/.claude/plugins/cache/mimirs-well/mimirs-well/2.0.0/scripts/report.cjs
  ```

  (On Windows: `%USERPROFILE%\.claude\plugins\cache\mimirs-well\mimirs-well\2.0.0\scripts\report.cjs`.)

⚠️ **Don't attach session transcripts** — they contain your conversation. The report only has numbers.

## 6. Uninstall

```
claude plugin uninstall mimirs-well@mimirs-well
claude plugin marketplace remove mimirs-well
```
