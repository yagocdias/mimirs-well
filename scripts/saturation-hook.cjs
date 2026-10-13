/**
 * Mimir's Well — saturation signal. Claude Code `UserPromptSubmit` hook.
 *
 * WHY A HOOK AND NOT ONLY THE SKILL
 * A skill is instructions: it only runs when invoked, and a trigger that
 * depends on someone remembering decays. The hook answers WHEN; the skill
 * answers WHAT TO DO. The hook runs before every prompt, measures, and only
 * talks to Claude when a level is crossed.
 *
 * WHY IT READS THE TRANSCRIPT
 * Hooks are shell commands and can't call tools. Claude Code passes the
 * transcript path on stdin, and the last request's usage in it gives the same
 * number the status line reports. See the dependency warning in meter.cjs.
 *
 * Fails silently, always: a broken meter must never block a prompt.
 */

const fs = require("fs");
const meter = require("./meter.cjs");

function done(output) {
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const YELLOW = (m) =>
  `
🟡 MIMIR'S WELL — saturation level 1 (cost per turn), measured now

Context is at ${meter.k(m.context)} tokens. Every turn re-sends the whole context,
so this turn costs ~${m.factor.toFixed(1)}x what a turn cost at the start of this
session. This is NOT a window warning (${m.pct}% of the window is used); it is a
cost warning: the cumulative cost of a session grows roughly with the square of
its length.

What to do: if the next unit of work does NOT depend on what has accumulated
here, it is cheaper in a fresh session — offer a Handoff Package (mimirs-well
skill, references/handoff.md). If it DOES depend on it, continue: paying for the
context is cheaper than rediscovering it.

Tell the user this in one line and let them choose. Do not close the session on your own.
`.trim();

const RED = (m) =>
  `
🔴 MIMIR'S WELL — saturation level 2 (the window), measured now

Context is at ${meter.k(m.context)} tokens, ${m.pct}% of a ${meter.k(m.window)} window.
Automatic compaction is getting close, and compaction summarizes away detail the
user may still need.

What to do: do not start a new unit of work. Propose to the user to hand off now
and, if they agree, generate the Handoff Package (mimirs-well skill,
references/handoff.md) while there is still room for it.
`.trim();

function main() {
  const input = readStdin();
  if (!input || !input.transcript_path) done(null);

  const sid = input.session_id;
  const state = meter.readSession(sid);

  // Only the lines appended since the last prompt; the running totals live in
  // the state file. Without both (first prompt, v2.0 state), read it all.
  let read, tally;
  try {
    read = meter.readNewRequests(input.transcript_path, state.tally ? state.scan : undefined);
    tally = meter.tally(read.restarted ? null : state.tally, read.reqs);
  } catch {
    done(null);
  }

  const opts = meter.options();
  const m = meter.measureTally(tally, { ...opts, windowFromStatusLine: state.window || 0 });
  if (!m) done(null);

  // Re-arm after a /compact: if the context fell below a level, crossing it
  // again must warn again.
  let warned = Math.min(state.warned || 0, m.level);

  const line = "Mimir's Well · " + meter.meterLine(m);
  const out = { hookEventName: "UserPromptSubmit" };
  const context = [];

  if (m.level > warned) {
    context.push(m.level === 2 ? RED(m) : YELLOW(m));
    warned = m.level;
  }
  if (opts.echoInReply) {
    context.push(
      "End your reply with this line, exactly as written, on its own " +
        "(it is the user's saturation meter; their interface does not show hook messages):\n" +
        line
    );
  }
  if (context.length) out.additionalContext = context.join("\n\n---\n\n");

  meter.updateSession(sid, {
    transcript: input.transcript_path,
    cwd: input.cwd,
    opening: m.opening,
    warned,
    scan: read.scan,
    tally,
    // The status line isn't a plugin component and can't read plugin options:
    // hand it the effective thresholds so both surfaces agree.
    costFactor: opts.costFactor,
    redPct: opts.redPct,
  });
  meter.writeJson(meter.pointerFile(input.cwd || process.cwd()), {
    sessionId: sid,
    transcript: input.transcript_path,
    updatedAt: Date.now(),
  });
  meter.sweepState();

  // systemMessage: one line for the user every turn (shown by the terminal UI).
  done({ systemMessage: line, hookSpecificOutput: out });
}

try {
  main();
} catch {
  done(null);
}
