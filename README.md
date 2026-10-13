# Mimir's Well

*[Leia em português](README.pt-BR.md)*

A meta-learning skill for Claude that does two jobs:

1. **Captures what's worth keeping.** It extracts reusable patterns from a project or
   conversation (Extraction), and quietly flags elegant solutions and hard-won lessons as they
   happen (Sentinel).
2. **Knows when a session should end, by measurement.** It watches session saturation and, when
   it's time, writes a **Handoff Package** so a fresh session starts fully oriented.

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
| `skills/mimirs-well/` | claude.ai **and** Claude Code | The skill: Extraction, Sentinel, Saturation Monitor, Handoff Package |
| `hooks/hooks.json` + `scripts/saturation-hook.cjs` | Claude Code (plugin) | Measures every turn; tells Claude only when a level is crossed |
| `scripts/report.cjs` | Claude Code (plugin) | The skill runs it when you ask "are we saturated?" |
| `scripts/statusline.cjs` | Claude Code (optional, manual) | The meter in Claude Code's footer |

Without the plugin (e.g. on claude.ai), the skill still works — it just says it has no
measurement and asks you to check your interface's context indicator, instead of guessing.

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

### Optional: the meter in the footer

Some interfaces don't display hook messages. The status line is drawn by Claude Code itself.
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
| `context_window` | `0` (auto) | Window size. Auto = the real size reported to the status line, else inferred (a context over 200k implies a 1M window), else 200k |
| `cost_factor` | `4` | 🟡 when a turn re-sends this many times the first turn's context |
| `red_pct` | `70` | 🔴 at this % of the window |
| `echo_in_reply` | `false` | Ask Claude to end each reply with the meter line — for surfaces that hide hook messages. Adds a line to every reply |

## Privacy and what it touches

- Reads your **local** session transcript (the `.jsonl` Claude Code already writes) to count tokens.
- Writes small state files (first-turn size, last level warned, how far the transcript was read)
  under your OS temp dir, in `mimirs-well/`. Files untouched for 7 days are deleted.
- Sends nothing anywhere. No network calls, no dependencies.

## Known limits

- **The transcript format is internal to Claude Code**, not a documented API. If a release
  changes it, the meter goes quiet (it fails silently by design) until the parser is updated.
  The status line uses documented fields and is not affected.
- **The hook can't see the window size**; it detects it (see `context_window`). Configure it if
  detection is wrong for your setup.
- **`report.cjs` run by hand, outside Claude Code,** can't know which session you mean: it reports
  the one that last sent a prompt in that folder. Pass a transcript path to choose. (When Claude
  runs it, it measures its own session.)

## Testing it

A 15-minute checklist for a first-time tester: [TESTING.md](TESTING.md).

## Development

```
node --test test/meter.test.cjs
```

The suite runs the hook end to end on synthetic transcripts — including exactly as `hooks.json`
declares it — and checks that the hook and the status line can't disagree about the level.

## License

MIT — see [LICENSE](LICENSE).
