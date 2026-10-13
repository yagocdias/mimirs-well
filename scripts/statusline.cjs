/**
 * Mimir's Well — optional status line for Claude Code.
 *
 * WHY IT EXISTS
 * The hook's one-line meter (`systemMessage`) is drawn by the terminal UI and
 * some surfaces don't show it. The status line is drawn by Claude Code itself
 * in its footer, every redraw, without depending on Claude repeating anything.
 *
 * WHY IT IS SELF-CONTAINED
 * A plugin can't install a status line, so you copy this ONE file somewhere
 * stable (e.g. ~/.claude/) and point `statusLine` at it. It must not require()
 * anything from the plugin folder, whose path changes on every update.
 *
 * WHAT IT READS
 * Claude Code hands the status line the real numbers on stdin:
 * `context_window.total_input_tokens` (same formula as the hook),
 * `context_window.context_window_size`, and `cost.total_cost_usd`. The only
 * thing missing is the first turn's context — the denominator of "this turn
 * costs Nx the first" — which it takes from the hook's state or, failing
 * that, reads ONCE from the transcript. It never re-reads the transcript on
 * every redraw: long transcripts are many MB.
 *
 * It also records the real window size for the hook, which can't see it.
 *
 * ⚠️ Fails silently, always: a broken footer must never break the session.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const STATE_DIR = path.join(os.tmpdir(), "mimirs-well");
const DEFAULT_COST_FACTOR = 4;
const DEFAULT_RED_PCT = 70;
const YELLOW_FLOOR_PCT = 15;

const k = (n) => Math.round(n / 1000) + "k";
const stateFile = (sid) =>
  path.join(STATE_DIR, "session-" + String(sid || "no-session").replace(/[^a-zA-Z0-9-]/g, "") + ".json");

function readState(sid) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sid), "utf8"));
  } catch {
    return {};
  }
}

function writeState(sid, patch) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(stateFile(sid), JSON.stringify({ ...readState(sid), ...patch }), "utf8");
  } catch {
    /* convenience only */
  }
}

/** First request's context, read once. Same formula as meter.cjs#contextOf. */
function firstContextFromTranscript(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      if (line.indexOf("cache_read_input_tokens") === -1) continue;
      const o = JSON.parse(line);
      const u = o && o.type === "assistant" && o.message && o.message.usage;
      if (u) return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    }
  } catch {
    /* no transcript: factor unknown */
  }
  return 0;
}

/** Must stay identical to meter.cjs#levelOf (a test checks it). */
function levelOf({ context, opening, window, costFactor, redPct, yellowFloorPct }) {
  const cf = costFactor || DEFAULT_COST_FACTOR;
  const rp = redPct || DEFAULT_RED_PCT;
  const floor = yellowFloorPct == null ? YELLOW_FLOOR_PCT : yellowFloorPct;
  const pct = (100 * context) / window;
  if (pct >= rp) return 2;
  if (opening > 0 && context / opening >= cf && pct >= floor) return 1;
  return 0;
}

function envNumber(name, fallback) {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? n : fallback;
}

function line(j) {
  const cw = j.context_window || {};
  const context = cw.total_input_tokens || 0;
  // Before the first API response, and right after /compact, there is no
  // number yet. "measuring" beats printing 0k, which looks like an empty session.
  if (!context) return "⏳ Mimir's Well: measuring…";

  const window = cw.context_window_size || 200_000;
  const sid = j.session_id;
  const state = readState(sid);

  let opening = state.opening || 0;
  if (!opening) {
    opening = firstContextFromTranscript(j.transcript_path) || context;
    writeState(sid, { opening });
  }
  if (state.window !== window) writeState(sid, { window });

  const pct = Math.round(cw.used_percentage != null ? cw.used_percentage : (100 * context) / window);
  const level = levelOf({
    context,
    opening,
    window,
    costFactor: envNumber("MIMIR_COST_FACTOR", state.costFactor || DEFAULT_COST_FACTOR),
    redPct: envNumber("MIMIR_RED_PCT", state.redPct || DEFAULT_RED_PCT),
  });
  const light = level === 2 ? "🔴" : level === 1 ? "🟡" : "🟢";
  const label = window >= 1_000_000 ? (window / 1_000_000).toFixed(0) + "M" : k(window);

  const parts = [`${light} ${k(context)} (${pct}% of ${label})`];
  if (opening > 0) parts.push(`turn ~${(context / opening).toFixed(1)}x the first`);

  // Claude Code's own estimate at list price; it may differ from your bill,
  // and subscription plans aren't billed per token at all.
  const usd = j.cost && j.cost.total_cost_usd;
  if (typeof usd === "number") parts.push(`~$${usd.toFixed(2)} est.`);

  // Only present for subscription plans, after the first response.
  const five = j.rate_limits && j.rate_limits.five_hour;
  if (five && typeof five.used_percentage === "number") parts.push(`5h limit ${Math.round(five.used_percentage)}%`);

  return parts.join(" · ");
}

module.exports = { line, levelOf };

if (require.main === module) {
  let data = "";
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => {
    try {
      process.stdout.write(line(JSON.parse(data || "{}")));
    } catch {
      /* silence: see header */
    }
  });
}
