/**
 * Mimir's Well — on-demand measurement report.
 *
 *   node report.cjs                 # this session (CLAUDE_CODE_SESSION_ID), else the
 *                                   # one the hook last saw in this folder
 *   node report.cjs <transcript>    # a specific transcript (.jsonl)
 *
 * The skill runs this when the user asks "is this session saturated?", so the
 * answer comes from the same engine as the hook, not from an estimate.
 */

const fs = require("fs");
const path = require("path");
const meter = require("./meter.cjs");

function newestSessionTranscript() {
  try {
    const files = fs
      .readdirSync(meter.STATE_DIR)
      .filter((f) => f.startsWith("session-"))
      .map((f) => meter.readJson(path.join(meter.STATE_DIR, f)))
      .filter((s) => s.transcript && s.updatedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return files.length ? files[0] : null;
  } catch {
    return null;
  }
}

function locate() {
  const arg = process.argv[2];
  if (arg) return { transcript: arg, sessionId: null, how: "given as argument" };
  // Claude Code exports the session id to the commands it runs: when the skill
  // runs this report, that names the very session asking, even with two
  // sessions open in the same folder.
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  const own = sid ? meter.readSession(sid) : {};
  if (own.transcript) return { transcript: own.transcript, sessionId: sid, how: "this session" };
  const ptr = meter.readJson(meter.pointerFile(process.cwd()));
  if (ptr.transcript) return { transcript: ptr.transcript, sessionId: ptr.sessionId, how: "last session seen in this folder" };
  const s = newestSessionTranscript();
  if (s) return { transcript: s.transcript, sessionId: null, how: "most recent session seen anywhere (no match for this folder)" };
  return null;
}

function main() {
  const where = locate();
  if (!where) {
    console.error(
      "No measurement available: the Mimir's Well hook has not run yet in any session.\n" +
        "Send one prompt with the plugin enabled, or pass a transcript path."
    );
    process.exit(1);
  }
  let reqs;
  try {
    reqs = meter.readRequests(where.transcript);
  } catch (e) {
    console.error("Could not read the transcript: " + where.transcript + "\n" + e.message);
    process.exit(1);
  }
  const state = where.sessionId ? meter.readSession(where.sessionId) : {};
  const m = meter.measure(reqs, { ...meter.options(), windowFromStatusLine: state.window || 0 });
  if (!m) {
    console.error("The transcript has no API requests yet: " + where.transcript);
    process.exit(1);
  }

  const n = (x) => x.toLocaleString("en-US");
  const verdict =
    m.level === 2
      ? "🔴 2 — hand off now (window)"
      : m.level === 1
        ? "🟡 1 — turns are expensive (plan); the window still has room"
        : "🟢 0 — room on both";
  const L = [
    "MIMIR'S WELL — SESSION MEASUREMENT",
    "source .................. " + where.how,
    "",
    "context now ............. " + n(m.context) + " tokens (" + m.pct + "% of " + n(m.window) + ")",
    "window size from ........ " + meter.windowNote(m),
    "context at first turn ... " + n(m.opening),
    "cost of this turn ....... ~" + m.factor.toFixed(1) + "x the first turn",
    "API requests ............ " + m.requests,
    "input sent, total ....... " + n(m.sentTotal) + " (" + (100 * m.cacheReadShare).toFixed(1) + "% cache reads)",
    "output, total ........... " + n(m.outputTotal),
    "",
    "saturation level ........ " + verdict,
  ];
  console.log(L.join("\n"));
}

main();
