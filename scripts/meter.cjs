/**
 * Mimir's Well — measurement engine.
 *
 * Pure module: requiring it has no side effects. The hook, the report and the
 * tests all use these same functions, because two token counts living in two
 * files drift apart silently, and the wrong one only shows up the day someone
 * compares them.
 *
 * WHAT IT MEASURES
 * The context of a turn = input_tokens + cache_creation_input_tokens +
 * cache_read_input_tokens of the most recent API request. This is the same
 * formula Claude Code uses for the status line's `context_window.total_input_tokens`
 * and `used_percentage` (input only, output excluded).
 *
 * WHY TWO SIGNALS, NOT ONE
 * Every turn re-sends the whole context. Prompt caching makes each token much
 * cheaper, but it does not change the shape of the curve: cost per turn grows
 * linearly with the context, and cost of the whole session grows roughly with
 * the square of the number of turns. So there are two independent questions:
 *   - YELLOW, "is this turn expensive?"  -> turn context vs. the first turn's.
 *   - RED,    "will the handoff still fit?" -> context vs. the window size.
 * They don't cross at the same number, so one threshold can't answer both.
 * See skills/mimirs-well/references/context-economics.md.
 *
 * ⚠️ DEPENDENCY OUTSIDE YOUR CONTROL
 * `readRequests` parses Claude Code's transcript (.jsonl). Its format is an
 * internal detail, not a documented API, and may change in any release. Every
 * caller must treat a failure here as "no measurement", never as an error.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const WINDOW_STANDARD = 200_000;
const WINDOW_EXTENDED = 1_000_000;

const DEFAULTS = Object.freeze({
  costFactor: 4, // yellow: a turn now costs this many times the first one
  redPct: 70, // red: context reached this % of the window
  yellowFloorPct: 15, // yellow never fires below this % of the window (tiny first turns)
});

/** Reads the transcript and returns its API requests, de-duplicated by requestId. */
function readRequests(file) {
  const raw = fs.readFileSync(file, "utf8");
  const seen = new Set();
  const reqs = [];
  for (const line of raw.split("\n")) {
    // Cheap filter: transcripts carry huge lines (tool results, snapshots)
    // with no usage at all. Only lines with usage are worth JSON.parse.
    if (!line || line.indexOf("cache_read_input_tokens") === -1) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "assistant" || !o.message || !o.message.usage) continue;
    const id = o.requestId || (o.message && o.message.id) || o.uuid;
    if (seen.has(id)) continue;
    seen.add(id);
    const u = o.message.usage;
    reqs.push({
      model: o.message.model,
      fresh: u.input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
      output: u.output_tokens || 0,
    });
  }
  return reqs;
}

/** Context size of one request (input side only, cache included). */
function contextOf(r) {
  return r.fresh + r.cacheWrite + r.cacheRead;
}

/**
 * The window size, best source first:
 *   1. what the user configured;
 *   2. what the status line saw (Claude Code hands it the real size);
 *   3. inference: a context above the standard window is only possible in an
 *      extended one;
 *   4. the standard window.
 */
function resolveWindow({ configured, fromStatusLine, maxContextSeen }) {
  if (configured > 0) return configured;
  if (fromStatusLine > 0) return fromStatusLine;
  if (maxContextSeen > WINDOW_STANDARD) return WINDOW_EXTENDED;
  return WINDOW_STANDARD;
}

/** 0 = green, 1 = yellow (plan), 2 = red (window). */
function levelOf({ context, opening, window, costFactor, redPct, yellowFloorPct }) {
  const cf = costFactor || DEFAULTS.costFactor;
  const rp = redPct || DEFAULTS.redPct;
  const floor = yellowFloorPct == null ? DEFAULTS.yellowFloorPct : yellowFloorPct;
  const pct = (100 * context) / window;
  if (pct >= rp) return 2;
  if (opening > 0 && context / opening >= cf && pct >= floor) return 1;
  return 0;
}

function lightOf(level) {
  return level === 2 ? "🔴" : level === 1 ? "🟡" : "🟢";
}

/** Everything the hook and the report print, computed once. */
function measure(reqs, opts = {}) {
  if (!reqs.length) return null;
  const context = contextOf(reqs[reqs.length - 1]);
  const opening = contextOf(reqs[0]) || context;
  const maxContextSeen = reqs.reduce((m, r) => Math.max(m, contextOf(r)), 0);
  const window = resolveWindow({
    configured: opts.configuredWindow || 0,
    fromStatusLine: opts.windowFromStatusLine || 0,
    maxContextSeen,
  });
  const level = levelOf({
    context,
    opening,
    window,
    costFactor: opts.costFactor,
    redPct: opts.redPct,
    yellowFloorPct: opts.yellowFloorPct,
  });
  const sentTotal = reqs.reduce((s, r) => s + contextOf(r), 0);
  const cacheReadTotal = reqs.reduce((s, r) => s + r.cacheRead, 0);
  return {
    context,
    opening,
    factor: context / opening,
    window,
    pct: Math.round((100 * context) / window),
    level,
    light: lightOf(level),
    requests: reqs.length,
    sentTotal,
    cacheReadShare: sentTotal ? cacheReadTotal / sentTotal : 0,
    outputTotal: reqs.reduce((s, r) => s + r.output, 0),
  };
}

function k(n) {
  return Math.round(n / 1000) + "k";
}

function windowLabel(w) {
  return w >= 1_000_000 ? (w / 1_000_000).toFixed(0) + "M" : k(w);
}

/** One-line meter, shared by the hook and the report. */
function meterLine(m) {
  return (
    `${m.light} context ${k(m.context)} (${m.pct}% of ${windowLabel(m.window)}) · ` +
    `turn ~${m.factor.toFixed(1)}x the first · ${m.requests} req`
  );
}

/** Reads a number option from the plugin config env var or a plain MIMIR_* env var. */
function numberOption(name, fallback) {
  const raw =
    process.env["CLAUDE_PLUGIN_OPTION_" + name.toUpperCase()] ??
    process.env["MIMIR_" + name.toUpperCase()];
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) ? n : fallback;
}

function boolOption(name, fallback) {
  const raw =
    process.env["CLAUDE_PLUGIN_OPTION_" + name.toUpperCase()] ??
    process.env["MIMIR_" + name.toUpperCase()];
  if (raw == null || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(raw));
}

function options() {
  return {
    configuredWindow: numberOption("context_window", 0),
    costFactor: numberOption("cost_factor", DEFAULTS.costFactor),
    redPct: numberOption("red_pct", DEFAULTS.redPct),
    echoInReply: boolOption("echo_in_reply", false),
  };
}

// ---------------------------------------------------------------------------
// Per-session state, in the OS temp dir. Convenience only: without it the
// signal degrades (it may repeat a warning), it never breaks.

const STATE_DIR = path.join(os.tmpdir(), "mimirs-well");

function safeId(id) {
  return String(id || "no-session").replace(/[^a-zA-Z0-9-]/g, "");
}

function cwdKey(cwd) {
  return crypto.createHash("sha1").update(path.resolve(String(cwd || ""))).digest("hex").slice(0, 16);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj), "utf8");
  } catch {
    /* convenience only */
  }
}

const sessionFile = (sessionId) => path.join(STATE_DIR, "session-" + safeId(sessionId) + ".json");
const pointerFile = (cwd) => path.join(STATE_DIR, "latest-" + cwdKey(cwd) + ".json");

function readSession(sessionId) {
  return readJson(sessionFile(sessionId));
}

function updateSession(sessionId, patch) {
  const cur = readSession(sessionId);
  writeJson(sessionFile(sessionId), { ...cur, ...patch, updatedAt: Date.now() });
}

module.exports = {
  WINDOW_STANDARD,
  WINDOW_EXTENDED,
  DEFAULTS,
  readRequests,
  contextOf,
  resolveWindow,
  levelOf,
  lightOf,
  measure,
  meterLine,
  k,
  options,
  STATE_DIR,
  readJson,
  writeJson,
  sessionFile,
  pointerFile,
  readSession,
  updateSession,
};
