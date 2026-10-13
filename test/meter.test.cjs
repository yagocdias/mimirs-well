// Run with: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const meter = require(path.join(ROOT, "scripts", "meter.cjs"));
const statusline = require(path.join(ROOT, "scripts", "statusline.cjs"));

// Every child process gets its own temp dir, so tests never touch real state.
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimir-test-"));
  return { dir, env: { ...process.env, TMP: dir, TEMP: dir, TMPDIR: dir } };
}

// A transcript line shaped like Claude Code's (only the fields the meter reads).
function req(id, context, { output = 500 } = {}) {
  return JSON.stringify({
    type: "assistant",
    requestId: "req_" + id,
    message: {
      model: "claude-test",
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: context - 1010,
        output_tokens: output,
      },
    },
  });
}

function writeTranscript(dir, contexts) {
  const file = path.join(dir, "t.jsonl");
  const lines = [JSON.stringify({ type: "user", message: { content: "hi" } })];
  contexts.forEach((c, i) => lines.push(req(i, c)));
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

function runHook(sb, payload, extraEnv = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "saturation-hook.cjs")], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...sb.env, ...extraEnv },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, "the hook must always exit 0; stderr: " + r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("context = fresh + cache write + cache read (output excluded)", () => {
  assert.equal(meter.contextOf({ fresh: 10, cacheWrite: 1000, cacheRead: 99_000, output: 7 }), 100_010);
});

test("duplicate requestIds are counted once", () => {
  const sb = sandbox();
  const file = path.join(sb.dir, "dup.jsonl");
  fs.writeFileSync(file, [req(1, 50_000), req(1, 50_000), req(2, 60_000)].join("\n"));
  assert.equal(meter.readRequests(file).length, 2);
});

test("window: config > status line > inference from a context above 200k > 200k", () => {
  assert.equal(meter.resolveWindow({ configured: 500_000, fromStatusLine: 1_000_000, maxContextSeen: 0 }), 500_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 1_000_000, maxContextSeen: 0 }), 1_000_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 0, maxContextSeen: 250_000 }), 1_000_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 0, maxContextSeen: 150_000 }), 200_000);
});

test("levels on a 200k window: the old absolute 300k/700k could never fire here", () => {
  const base = { opening: 20_000, window: 200_000 };
  assert.equal(meter.levelOf({ ...base, context: 60_000 }), 0); // 3x
  assert.equal(meter.levelOf({ ...base, context: 85_000 }), 1); // 4.25x, 42%
  assert.equal(meter.levelOf({ ...base, context: 145_000 }), 2); // 72%
});

test("levels on a 1M window reproduce the calibrated case (opening ~74k)", () => {
  const base = { opening: 74_000, window: 1_000_000 };
  assert.equal(meter.levelOf({ ...base, context: 280_000 }), 0);
  assert.equal(meter.levelOf({ ...base, context: 300_000 }), 1);
  assert.equal(meter.levelOf({ ...base, context: 700_000 }), 2);
});

test("yellow floor: a tiny first turn doesn't make a small context 'expensive'", () => {
  // 4x of 5k is 20k = 10% of 200k: below the 15% floor, stays green.
  assert.equal(meter.levelOf({ opening: 5_000, context: 20_000, window: 200_000 }), 0);
});

test("status line and engine compute the same level (no drift between surfaces)", () => {
  for (const window of [200_000, 1_000_000])
    for (const opening of [5_000, 20_000, 74_000])
      for (let context = 10_000; context <= window; context += window / 40) {
        const a = { context, opening, window, costFactor: 4, redPct: 70 };
        assert.equal(statusline.levelOf(a), meter.levelOf(a), JSON.stringify(a));
      }
});

test("hook: green says nothing to Claude; crossing yellow warns ONCE; red warns; compaction re-arms", () => {
  const sb = sandbox();
  const sid = "s-" + Date.now();
  const ask = (contexts) =>
    runHook(sb, { session_id: sid, transcript_path: writeTranscript(sb.dir, contexts), cwd: sb.dir });

  const green = ask([20_000, 40_000]);
  assert.match(green.systemMessage, /🟢 context 40k \(20% of 200k\)/);
  assert.equal(green.hookSpecificOutput.additionalContext, undefined);

  const yellow = ask([20_000, 40_000, 85_000]);
  assert.match(yellow.systemMessage, /^Mimir's Well · 🟡/);
  assert.match(yellow.hookSpecificOutput.additionalContext, /saturation level 1/);

  const yellowAgain = ask([20_000, 40_000, 85_000, 90_000]);
  assert.equal(yellowAgain.hookSpecificOutput.additionalContext, undefined, "must not repeat the same level");

  const red = ask([20_000, 40_000, 85_000, 90_000, 150_000]);
  assert.match(red.hookSpecificOutput.additionalContext, /saturation level 2/);

  // /compact: context falls back to green, then grows again -> warns again.
  ask([20_000, 40_000, 85_000, 90_000, 150_000, 30_000]);
  const again = ask([20_000, 40_000, 85_000, 90_000, 150_000, 30_000, 90_000]);
  assert.match(again.hookSpecificOutput.additionalContext, /saturation level 1/);
});

test("hook: a context above 200k is read against a 1M window, not as 'over 100%'", () => {
  const sb = sandbox();
  const out = runHook(sb, { session_id: "big", transcript_path: writeTranscript(sb.dir, [74_000, 250_000]), cwd: sb.dir });
  assert.match(out.systemMessage, /250k \(25% of 1M\)/);
});

test("hook: plugin options change thresholds and enable the echo", () => {
  const sb = sandbox();
  const out = runHook(
    sb,
    { session_id: "opt", transcript_path: writeTranscript(sb.dir, [20_000, 50_000]), cwd: sb.dir },
    { CLAUDE_PLUGIN_OPTION_COST_FACTOR: "2", CLAUDE_PLUGIN_OPTION_ECHO_IN_REPLY: "true" }
  );
  assert.match(out.systemMessage, /🟡/);
  assert.match(out.hookSpecificOutput.additionalContext, /End your reply with this line/);
});

test("hook fails silently: bad stdin, missing transcript, empty transcript", () => {
  const sb = sandbox();
  assert.equal(runHook(sb, "not json"), null);
  assert.equal(runHook(sb, { session_id: "x", transcript_path: path.join(sb.dir, "missing.jsonl") }), null);
  const empty = path.join(sb.dir, "empty.jsonl");
  fs.writeFileSync(empty, "");
  assert.equal(runHook(sb, { session_id: "x", transcript_path: empty }), null);
});

test("report finds the session the hook saw in this folder", () => {
  const sb = sandbox();
  const transcript = writeTranscript(sb.dir, [20_000, 145_000]);
  runHook(sb, { session_id: "rep", transcript_path: transcript, cwd: sb.dir });
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "report.cjs")], {
    cwd: sb.dir,
    env: sb.env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /context now \.+ 145,000 tokens \(73% of 200,000\)/);
  assert.match(r.stdout, /🔴 2/);
});

test("status line: uses the harness numbers and records the window for the hook", () => {
  const sb = sandbox();
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "statusline.cjs")], {
    input: JSON.stringify({
      session_id: "sl",
      transcript_path: writeTranscript(sb.dir, [74_000, 310_000]),
      context_window: { total_input_tokens: 310_000, context_window_size: 1_000_000, used_percentage: 31 },
      cost: { total_cost_usd: 6.94 },
    }),
    env: sb.env,
    encoding: "utf8",
  });
  assert.equal(r.stdout, "🟡 310k (31% of 1M) · turn ~4.2x the first · ~$6.94 est.");
  const state = JSON.parse(fs.readFileSync(path.join(sb.dir, "mimirs-well", "session-sl.json"), "utf8"));
  assert.equal(state.window, 1_000_000);
});
