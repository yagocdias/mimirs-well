# Mimir's Well

*[Leia em português](README.pt-BR.md)*

A meta-learning skill for Claude that does two jobs:

1. **Captures what's worth keeping.** It extracts reusable patterns from a project or
   conversation (Extraction), and quietly flags elegant solutions and hard-won lessons as they
   happen (Sentinel).
2. **Knows when a session should end, by measurement.** It watches session saturation and, when
   it's time, updates the project's **handoff file** so the next session starts fully oriented —
   you just say "check the handoffs".

> Mimir guarded a well of wisdom beneath Yggdrasil; Odin gave an eye to drink from it.
> Wisdom is costly to acquire, worth preserving, and meant to be consulted — not rediscovered.

## Why the saturation signal is measured

A model can't perceive how full its own context is, so "the chat feels long" is a guess. And
"we're fine, there's caching" is wrong: caching makes each re-sent token about 10× cheaper,
but **every turn re-sends the whole context**. Cost per turn grows linearly with the context,
and cost of the session grows roughly with the **square** of its length. One measured session's
last turn cost 6.5× its first.

So the signal has two levels, answering two different questions:

| | Question | Default trigger |
|---|---|---|
| 🟡 | Are turns getting expensive? (your plan/budget) | a turn re-sends ≥ **4×** the first turn's context |
| 🔴 | Will the handoff still fit? (the window) | context ≥ **70%** of the window |

Details: [`context-economics.md`](skills/mimirs-well/references/context-economics.md).

## What's in the box

| Piece | Where it runs | What it does |
|---|---|---|
| `skills/mimirs-well/` | claude.ai **and** Claude Code | The skill: Extraction, Sentinel, Saturation Monitor, handoff |
| `hooks/meter-band.tsx` | Claude Code (plugin), terminal **and desktop app** | The meter, drawn above the prompt |
| `hooks/hooks.json` + `scripts/saturation-hook.cjs` | Claude Code (plugin) | Measures every turn; tells Claude only when a level is crossed |
| `scripts/session-start.cjs` | Claude Code (plugin) | At session start: keeps the Sentinel on, points at the project's Well, offers a recent handoff |
| `scripts/well.cjs` | Claude Code (plugin) | Where the Well lives on disk; the index the skill reads for cross-project synthesis |
| `scripts/report.cjs` | Claude Code (plugin) | The skill runs it when you ask "are we saturated?" |
| `scripts/statusline.cjs` | Claude Code (optional, manual) | The meter in Claude Code's footer |

Without the plugin (e.g. on claude.ai), the skill still works — it just says it has no
measurement and asks you to check your interface's context indicator, instead of guessing.

## The Well on disk

In Claude Code, everything the Well produces is saved, in one place for all your projects, so
it outlives the session and projects can be compared:

```
~/.mimir/projects/<project>/
  reports/YYYY-MM-DD-<topic>.md    Pattern Reports and Synthesis Reports
  seeds/<name>.md                  Skill Seeds
  well-log.md                      Sentinel entries you said yes to
  anchor.md                        the latest Continuity Anchor
  handoffs/YYYY-MM-DD-HHMM.md      handoffs of projects that keep no HANDOFF.md
```

A project is the git root of the folder you work in.

**Handoffs live in the project.** If it keeps a living `HANDOFF.md` (in the root, `docs/` or
`.claude/`), that file is the handoff: Claude updates it in place, in its own structure, and
replies in two lines instead of printing blocks to paste. A project without one gets
`docs/HANDOFF.md` (Claude asks first) or, if you'd rather keep it out of the repo, a file in the
Well. In the next session, say "check the handoffs" — or accept when Claude offers a handoff
updated in the last 48 hours.

Cross-project synthesis starts from an index of every project's reports, then reads only the
ones that matter. Change the location with the `well_dir` option. On claude.ai, which has no
file system, the artifacts stay in the conversation.

## Install

### Claude Code (skill + measured signal)

Requires **Node.js 18+** on your `PATH` (the hook is a Node script).

```
/plugin marketplace add yagocdias/mimirs-well
/plugin install mimirs-well@mimirs-well
```

Or from a terminal: `claude plugin marketplace add yagocdias/mimirs-well` then `claude plugin install mimirs-well@mimirs-well`.

Restart Claude Code after installing: hooks are loaded at startup.

### claude.ai (skill only)

Optional: to keep the passive modes always on inside a claude.ai Project, paste the block in [docs/claude-ai-project-instructions.md](docs/claude-ai-project-instructions.md) into that Project's instructions. Claude Code doesn't need it.

Download **`mimirs-well.skill`** from the [latest release](https://github.com/yagocdias/mimirs-well/releases/latest) and upload it as a custom skill in claude.ai settings. (Or zip the `skills/mimirs-well/` folder yourself.)

### The meter above the prompt

The plugin draws the meter in a band above the prompt — in the terminal and in the desktop app,
where hook messages aren't shown: `🟡 Mimir's Well · 291k of 1M (29%) · turn ~4.2x the first ·
~$12.50 est.` It reads Claude Code's own figures, so the window is the real one. Nothing to set
up: it needs a Claude Code version with plugin UI modules; older ones keep the hook's line.

### Optional: the meter in the footer

The status line is an alternative for terminals. The status line is drawn by Claude Code itself.
A plugin can't install a status line, so this step is manual:

1. Copy `scripts/statusline.cjs` to a stable place, e.g. `~/.claude/mimirs-well-statusline.cjs`
   (don't point at the plugin folder — its path changes on every update).
2. Add to `~/.claude/settings.json`, using the absolute path:

   ```json
   "statusLine": {
     "type": "command",
     "command": "node /absolute/path/to/mimirs-well-statusline.cjs"
   }
   ```

⚠️ Claude Code has **one** status line. If you already have one, this replaces it.

Output looks like: `🟡 310k (31% of 1M) · turn ~4.2x the first · ~$6.94 est. · 5h limit 23%`.
The dollar figure is Claude Code's own list-price estimate, not a bill.

## Configuration

Defaults work out of the box. To change them: `/plugin configure mimirs-well@mimirs-well` (or `--config KEY=VALUE` at install, or `MIMIR_*` environment variables):

| Option | Default | Meaning |
|---|---|---|
| `context_window` | `0` (auto) | Window size. Auto = the real size reported to the status line; else the model's window (Fable, Sonnet 5+, Haiku 5.5+, Opus 4.7+ run with 1M), honoring `CLAUDE_CODE_DISABLE_1M_CONTEXT`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS` and `CLAUDE_CODE_AUTO_COMPACT_WINDOW`; else inferred (a context over 200k implies 1M); else 200k, shown as **assumed** |
| `cost_factor` | `4` | 🟡 when a turn re-sends this many times the first turn's context |
| `red_pct` | `70` | 🔴 at this % of the window |
| `well_dir` | `~/.mimir` | Where the Well keeps reports, seeds, logs and handoffs, one folder per project |
| `echo_in_reply` | `false` | Ask Claude to end each reply with the meter line — for surfaces that hide hook messages. Adds a line to every reply |

## Privacy and what it touches

- Reads your **local** session transcript (the `.jsonl` Claude Code already writes) to count tokens.
- Writes small state files (first-turn size, last level warned, how far the transcript was read)
  under your OS temp dir, in `mimirs-well/`. Files untouched for 7 days are deleted.
- Saves what the Well produces (reports, seeds, log, handoffs) under `~/.mimir/`, or your `well_dir`.
  These are your conversations' conclusions: keep that folder out of anything you publish.
- Sends nothing anywhere. No network calls, no dependencies.

## Known limits

- **The transcript format is internal to Claude Code**, not a documented API. If a release
  changes it, the meter goes quiet (it fails silently by design) until the parser is updated.
  The status line uses documented fields and is not affected.
- **The hook can't see the window size**; it works it out from the model (see `context_window`).
  For Opus 4.6 and Sonnet 4.6 the model id can't tell 200k from their `[1m]` variant: the meter
  then says the window is *assumed*. Set `context_window`, or install the status line, to fix it.
- **`report.cjs` run by hand, outside Claude Code,** can't know which session you mean: it reports
  the one that last sent a prompt in that folder. Pass a transcript path to choose. (When Claude
  runs it, it measures its own session.)

## Testing it

A 15-minute checklist for a first-time tester: [TESTING.md](TESTING.md).

## Development

```
node --test "test/*.test.cjs"
claude plugin test .
```

The first runs the scripts' suite; the second, the band's, inside Claude Code's own engine.

The suite runs the hook end to end on synthetic transcripts — including exactly as `hooks.json`
declares it — and checks that the hook and the status line can't disagree about the level.

## License

MIT — see [LICENSE](LICENSE).
