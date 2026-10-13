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
 * `parseLine` reads Claude Code's transcript (.jsonl). Its format is an
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

/** One transcript line -> one API request, or null if the line isn't one. */
function parseLine(line) {
  // Cheap filter: transcripts carry huge lines (tool results, snapshots)
  // with no usage at all. Only lines with usage are worth JSON.parse.
  if (!line || line.indexOf("cache_read_input_tokens") === -1) return null;
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (o.type !== "assistant" || !o.message || !o.message.usage) return null;
  // A subagent's turns carry the subagent's context, not this session's. Current
  // versions write them to their own file; if one ever writes them here, the
  // "last request" would be the subagent's and the meter would read it as ours.
  if (o.isSidechain) return null;
  const u = o.message.usage;
  return {
    id: o.requestId || o.message.id || o.uuid,
    model: o.message.model,
    fresh: u.input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    output: u.output_tokens || 0,
  };
}

/** Parses lines, skipping requests already in `seen` (a request spans several lines). */
function collect(lines, seen) {
  const reqs = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    reqs.push(r);
  }
  return reqs;
}

/** Reads the whole transcript and returns its API requests, de-duplicated by requestId. */
function readRequests(file) {
  return collect(fs.readFileSync(file, "utf8").split("\n"), new Set());
}

// The lines of one request are written together, so remembering the last few
// ids is enough to de-duplicate across reads.
const RECENT_IDS = 64;

/**
 * Reads only what was appended since the last read. The hook runs before
 * every prompt and transcripts reach tens of MB, so re-reading the whole file
 * each time grows with the session — exactly when the meter matters most.
 *
 * `scan` is what the previous call returned ({} the first time). Only complete
 * lines are consumed: a line still being written is read next time. If the
 * file is a different one or got shorter, it starts over and says so
 * (`restarted`), so the caller can drop what it had accumulated.
 */
function readNewRequests(file, scan = {}) {
  const restarted = scan.file !== file || !(scan.offset >= 0) || scan.offset > fs.statSync(file).size;
  const offset = restarted ? 0 : scan.offset;
  const seen = new Set(restarted ? [] : scan.recentIds || []);

  const fd = fs.openSync(file, "r");
  let buf;
  try {
    const len = Math.max(0, fs.fstatSync(fd).size - offset);
    buf = Buffer.alloc(len);
    let got = 0;
    while (got < len) {
      const n = fs.readSync(fd, buf, got, len - got, offset + got);
      if (!n) break;
      got += n;
    }
    buf = buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }

  // Cut at the last newline byte: never splits a line, nor a UTF-8 character.
  const end = buf.lastIndexOf(0x0a) + 1;
  const reqs = collect(buf.toString("utf8", 0, end).split("\n"), seen);
  return {
    reqs,
    restarted,
    scan: { file, offset: offset + end, recentIds: [...seen].slice(-RECENT_IDS) },
  };
}

/** Context size of one request (input side only, cache included). */
function contextOf(r) {
  return r.fresh + r.cacheWrite + r.cacheRead;
}

/**
 * The window a model runs with in Claude Code, read from its id, or 0 when the
 * id alone doesn't settle it. Per Claude Code's model docs: Fable, Sonnet 5+,
 * Haiku 5.5+ and Opus 4.7+ run with 1M by default. Older models run with 200k,
 * or with 1M through a "[1m]" variant the API model id doesn't show — so for
 * them the id can't decide, and the caller falls back to other evidence.
 */
function windowOfModel(model) {
  const id = String(model || "").toLowerCase();
  if (id.includes("[1m]")) return WINDOW_EXTENDED;
  // claude-opus-4-7, claude-haiku-4-5-20251001, anthropic.claude-opus-4-7-v1:0,
  // claude-opus-4-7@20250101; a date right after the major is not a minor.
  const m = /claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?=$|[-@:]))?/.exec(id);
  if (!m) return 0;
  const version = Number(m[2]) + Number(m[3] || 0) / 10;
  const native1M = { fable: 0, sonnet: 5, haiku: 5.5, opus: 4.7 }[m[1]];
  return version >= native1M ? WINDOW_EXTENDED : 0;
}

/**
 * The window size and where it came from, best source first:
 *   configured   the user's plugin setting: final, nothing overrides it;
 *   status line  Claude Code hands the status line the real size;
 *   1M disabled  CLAUDE_CODE_DISABLE_1M_CONTEXT keeps every model at 200k;
 *   model        the model id (windowOfModel);
 *   max tokens   CLAUDE_CODE_MAX_CONTEXT_TOKENS, for ids Claude Code doesn't know;
 *   inferred     a context above 200k is only possible in a 1M window;
 *   assumed      200k, a guess — and the meter says so instead of hiding it.
 * Then CLAUDE_CODE_AUTO_COMPACT_WINDOW caps it: compaction, the thing red
 * warns about, happens there and not at the model's limit.
 */
function windowOf({ configured, fromStatusLine, model, maxContextSeen, env = {} }) {
  if (configured > 0) return { window: configured, source: "configured" };
  let window, source;
  const byModel = windowOfModel(model);
  if (fromStatusLine > 0) [window, source] = [fromStatusLine, "status line"];
  else if (env.disable1M) [window, source] = [WINDOW_STANDARD, "1M disabled"];
  else if (byModel) [window, source] = [byModel, "model"];
  else if (env.maxContextTokens > 0) [window, source] = [env.maxContextTokens, "max tokens"];
  else if (maxContextSeen > WINDOW_STANDARD) [window, source] = [WINDOW_EXTENDED, "inferred"];
  else [window, source] = [WINDOW_STANDARD, "assumed"];
  if (env.autoCompactWindow > 0 && env.autoCompactWindow < window)
    [window, source] = [env.autoCompactWindow, "auto-compact"];
  return { window, source };
}

function resolveWindow(args) {
  return windowOf(args).window;
}

/** Where the window size came from, in words, for the report and the warnings. */
function windowNote(m) {
  return {
    configured: "set in the plugin options",
    "status line": "reported by Claude Code to the status line",
    "1M disabled": "CLAUDE_CODE_DISABLE_1M_CONTEXT is set",
    model: "the window of " + m.model,
    "max tokens": "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
    "auto-compact": "CLAUDE_CODE_AUTO_COMPACT_WINDOW (compaction happens there)",
    inferred: "inferred: the context passed 200k",
    assumed: "ASSUMED, not detected" + (m.model ? " (" + m.model + " doesn't settle it)" : ""),
  }[m.windowSource];
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

/**
 * Running totals of a session's requests: all `measure` needs, small enough to
 * keep in the state file so the hook can add only the new requests each turn.
 */
function tally(prev, reqs) {
  const t = { requests: 0, opening: 0, context: 0, maxContext: 0, sentTotal: 0, cacheReadTotal: 0, outputTotal: 0, ...prev };
  for (const r of reqs) {
    const c = contextOf(r);
    if (!t.requests) t.opening = c;
    t.requests++;
    t.context = c;
    t.model = r.model || t.model; // the latest: /model can switch mid-session
    t.maxContext = Math.max(t.maxContext, c);
    t.sentTotal += c;
    t.cacheReadTotal += r.cacheRead;
    t.outputTotal += r.output;
  }
  return t;
}

/** Everything the hook and the report print, computed once. */
function measure(reqs, opts = {}) {
  return measureTally(tally(null, reqs), opts);
}

function measureTally(t, opts = {}) {
  if (!t || !t.requests) return null;
  const context = t.context;
  const opening = t.opening || context;
  const { window, source } = windowOf({
    configured: opts.configuredWindow || 0,
    fromStatusLine: opts.windowFromStatusLine || 0,
    model: t.model,
    maxContextSeen: t.maxContext,
    env: opts.env,
  });
  const level = levelOf({
    context,
    opening,
    window,
    costFactor: opts.costFactor,
    redPct: opts.redPct,
    yellowFloorPct: opts.yellowFloorPct,
  });
  return {
    context,
    opening,
    factor: context / opening,
    model: t.model,
    window,
    windowSource: source,
    pct: Math.round((100 * context) / window),
    level,
    light: lightOf(level),
    requests: t.requests,
    sentTotal: t.sentTotal,
    cacheReadShare: t.sentTotal ? t.cacheReadTotal / t.sentTotal : 0,
    outputTotal: t.outputTotal,
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
    `${m.light} context ${k(m.context)} (${m.pct}% of ${windowLabel(m.window)}` +
    `${m.windowSource === "assumed" ? ", assumed" : ""}) · ` +
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
    // Claude Code's own settings that change the window; hooks inherit its env.
    env: {
      disable1M: /^(1|true|yes|on)$/i.test(process.env.CLAUDE_CODE_DISABLE_1M_CONTEXT || ""),
      maxContextTokens: Number(process.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS) || 0,
      autoCompactWindow: Number(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW) || 0,
    },
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

const DAY = 24 * 60 * 60 * 1000;
const STATE_MAX_AGE = 7 * DAY;

/**
 * One state file per session would pile up forever. At most once a day,
 * delete the ones untouched for a week: a session idle that long has no
 * meter worth keeping (the worst case is one repeated warning).
 */
function sweepState(now = Date.now()) {
  const marker = path.join(STATE_DIR, "last-sweep.json");
  if (now - (readJson(marker).at || 0) < DAY) return;
  writeJson(marker, { at: now });
  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!/^(session|latest)-.*\.json$/.test(f)) continue;
      const file = path.join(STATE_DIR, f);
      try {
        if (now - fs.statSync(file).mtimeMs > STATE_MAX_AGE) fs.unlinkSync(file);
      } catch {
        /* another session got there first */
      }
    }
  } catch {
    /* convenience only */
  }
}

module.exports = {
  WINDOW_STANDARD,
  WINDOW_EXTENDED,
  DEFAULTS,
  readRequests,
  readNewRequests,
  contextOf,
  windowOfModel,
  windowOf,
  windowNote,
  resolveWindow,
  levelOf,
  lightOf,
  tally,
  measure,
  measureTally,
  meterLine,
  windowLabel,
  k,
  options,
  STATE_DIR,
  readJson,
  writeJson,
  sessionFile,
  pointerFile,
  readSession,
  updateSession,
  sweepState,
};
