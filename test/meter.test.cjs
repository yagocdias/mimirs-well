// Run with: node --test test/meter.test.cjs
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
// Nor the real session: these tests often run inside Claude Code itself.
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimir-test-"));
  const env = { ...process.env, TMP: dir, TEMP: dir, TMPDIR: dir };
  for (const k of Object.keys(env))
    if (k === "CLAUDE_CODE_SESSION_ID" || k.startsWith("CLAUDE_PLUGIN_OPTION_") || k.startsWith("MIMIR_")) delete env[k];
  env.MIMIR_WELL_DIR = path.join(dir, "well"); // never the user's real Well
  return { dir, env };
}

// A transcript line shaped like Claude Code's (only the fields the meter reads).
function req(id, context, { output = 500, sidechain = false, model = "claude-test" } = {}) {
  return JSON.stringify({
    type: "assistant",
    isSidechain: sidechain,
    requestId: "req_" + id,
    message: {
      model,
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: context - 1010,
        output_tokens: output,
      },
    },
  });
}

function writeTranscript(dir, contexts, model) {
  const file = path.join(dir, "t.jsonl");
  const lines = [JSON.stringify({ type: "user", message: { content: "hi" } })];
  contexts.forEach((c, i) => lines.push(req(i, c, { model })));
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

test("subagent (sidechain) requests are not this session's context", () => {
  const sb = sandbox();
  const file = path.join(sb.dir, "side.jsonl");
  fs.writeFileSync(file, [req(1, 50_000), req(2, 60_000), req(3, 9_000, { sidechain: true })].join("\n") + "\n");
  const reqs = meter.readRequests(file);
  assert.equal(reqs.length, 2);
  assert.equal(meter.measure(reqs).context, 60_000);
});

test("incremental read: same totals as a full read, one append at a time", () => {
  const sb = sandbox();
  const file = path.join(sb.dir, "inc.jsonl");
  const contexts = [20_000, 35_000, 35_000, 80_000, 30_000, 120_000];
  fs.writeFileSync(file, "");
  let scan, t = null;
  contexts.forEach((c, i) => {
    // A request spans several lines; its duplicate may land in the next read.
    fs.appendFileSync(file, req(i, c) + "\n" + (i % 2 ? req(i, c) + "\n" : ""));
    const r = meter.readNewRequests(file, scan);
    scan = r.scan;
    t = meter.tally(r.restarted ? null : t, r.reqs);
  });
  assert.deepEqual(meter.measureTally(t), meter.measure(meter.readRequests(file)));
  assert.equal(t.requests, contexts.length);
});

test("incremental read: a line still being written waits; a shorter file starts over", () => {
  const sb = sandbox();
  const file = path.join(sb.dir, "partial.jsonl");
  const second = req(2, 60_000);
  fs.writeFileSync(file, req(1, 50_000) + "\n" + second.slice(0, 40));
  const a = meter.readNewRequests(file);
  assert.equal(a.reqs.length, 1);

  fs.appendFileSync(file, second.slice(40) + "\n");
  const b = meter.readNewRequests(file, a.scan);
  assert.equal(b.restarted, false);
  assert.deepEqual(b.reqs.map((r) => r.id), ["req_2"]);

  fs.writeFileSync(file, req(9, 10_000) + "\n");
  const c = meter.readNewRequests(file, b.scan);
  assert.equal(c.restarted, true);
  assert.deepEqual(c.reqs.map((r) => r.id), ["req_9"]);
});

test("window: config > status line > inference from a context above 200k > 200k", () => {
  assert.equal(meter.resolveWindow({ configured: 500_000, fromStatusLine: 1_000_000, maxContextSeen: 0 }), 500_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 1_000_000, maxContextSeen: 0 }), 1_000_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 0, maxContextSeen: 250_000 }), 1_000_000);
  assert.equal(meter.resolveWindow({ configured: 0, fromStatusLine: 0, maxContextSeen: 150_000 }), 200_000);
});

test("window from the model id: native 1M models; older ones can't be told from the id", () => {
  const cases = {
    "claude-opus-5-5": 1_000_000,
    "claude-fable-5-1": 1_000_000,
    "claude-sonnet-5": 1_000_000,
    "claude-haiku-5-5": 1_000_000,
    "claude-opus-4-7": 1_000_000,
    "anthropic.claude-opus-4-7-v1:0": 1_000_000,
    "claude-opus-4-7@20250101": 1_000_000,
    "claude-opus-4-6": 0, // 200k or [1m]: the id doesn't say
    "claude-sonnet-4-6": 0,
    "claude-sonnet-4-20250514": 0, // a date, not minor version 20
    "claude-haiku-4-5-20251001": 0,
    "claude-3-5-sonnet-20241022": 0,
    "claude-opus-4-6[1m]": 1_000_000,
    "": 0,
  };
  for (const [id, w] of Object.entries(cases)) assert.equal(meter.windowOfModel(id), w, id);
});

test("window sources: config > status line > 1M disabled > model > max tokens > inferred > assumed; auto-compact caps", () => {
  const src = (a) => meter.windowOf(a);
  const opus = "claude-opus-5-5";
  assert.deepEqual(src({ configured: 300_000, fromStatusLine: 1_000_000, model: opus }), { window: 300_000, source: "configured" });
  assert.deepEqual(src({ fromStatusLine: 200_000, model: opus }), { window: 200_000, source: "status line" });
  assert.deepEqual(src({ model: opus, env: { disable1M: true } }), { window: 200_000, source: "1M disabled" });
  assert.deepEqual(src({ model: opus }), { window: 1_000_000, source: "model" });
  assert.deepEqual(src({ model: "my-gateway-model", env: { maxContextTokens: 400_000 } }), { window: 400_000, source: "max tokens" });
  assert.deepEqual(src({ model: "claude-opus-4-6", maxContextSeen: 250_000 }), { window: 1_000_000, source: "inferred" });
  assert.deepEqual(src({ model: "claude-opus-4-6" }), { window: 200_000, source: "assumed" });
  assert.deepEqual(src({ model: opus, env: { autoCompactWindow: 500_000 } }), { window: 500_000, source: "auto-compact" });
  assert.deepEqual(src({ configured: 800_000, env: { autoCompactWindow: 500_000 } }), { window: 800_000, source: "configured" });
});

test("hook: Opus 5.5 at 141k is green on its 1M window (the false red of 2026-10-13)", () => {
  const sb = sandbox();
  const out = runHook(sb, {
    session_id: "opus55",
    transcript_path: writeTranscript(sb.dir, [70_000, 141_000], "claude-opus-5-5"),
    cwd: sb.dir,
  });
  assert.match(out.systemMessage, /🟢 context 141k \(14% of 1M\)/);
  assert.equal(out.hookSpecificOutput.additionalContext, undefined);
});

test("hook: a warning on an assumed window says it is assumed", () => {
  const sb = sandbox();
  const out = runHook(sb, {
    session_id: "assumed",
    transcript_path: writeTranscript(sb.dir, [70_000, 141_000], "claude-opus-4-6"),
    cwd: sb.dir,
  });
  assert.match(out.systemMessage, /71% of 200k, assumed/);
  assert.match(out.hookSpecificOutput.additionalContext, /saturation level 2/);
  assert.match(out.hookSpecificOutput.additionalContext, /window size was NOT detected/);
  assert.match(out.hookSpecificOutput.additionalContext, /claude-opus-4-6 doesn't settle it/);
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
  assert.match(green.systemMessage, /🟢 context 40k \(20% of 200k, assumed\)/);
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
  assert.match(r.stdout, /window size from \.+ ASSUMED, not detected/);
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

test("hooks.json: every hook runs exactly as Claude Code would spawn it", () => {
  // Unit tests call the script directly; this catches a manifest that points
  // at nothing (the hook fails silently by design, so nobody would notice).
  const sb = sandbox();
  const expand = (s) => s.split("${CLAUDE_PLUGIN_ROOT}").join(ROOT);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "hooks", "hooks.json"), "utf8"));
  const transcript = writeTranscript(sb.dir, [20_000, 40_000]);
  const expect = {
    UserPromptSubmit: (o) => assert.match(o.systemMessage, /^Mimir's Well · 🟢/),
    SessionStart: (o) => assert.match(o.hookSpecificOutput.additionalContext, /Sentinel is on/),
  };
  let ran = 0;
  for (const [event, groups] of Object.entries(manifest.hooks))
    for (const group of groups)
      for (const h of group.hooks) {
        assert.equal(h.type, "command", event);
        assert.ok(expect[event], "no expectation for " + event);
        const payload = JSON.stringify({ session_id: "manifest", transcript_path: transcript, cwd: sb.dir, hook_event_name: event, source: "startup" });
        const opts = { input: payload, env: { ...sb.env, CLAUDE_PLUGIN_ROOT: ROOT }, encoding: "utf8" };
        // Exec form (`args`): no shell. Otherwise the command line goes to a shell.
        const r = h.args
          ? spawnSync(expand(h.command), h.args.map(expand), opts)
          : spawnSync(expand(h.command), { ...opts, shell: true });
        assert.equal(r.status, 0, event + ": " + (r.error || r.stderr));
        expect[event](JSON.parse(r.stdout));
        ran++;
      }
  assert.ok(ran > 0, "hooks.json declares no hooks");
});

test("report: the session that runs it beats the folder's last-prompt pointer", () => {
  const sb = sandbox();
  const mine = path.join(sb.dir, "mine");
  const other = path.join(sb.dir, "other");
  fs.mkdirSync(mine);
  fs.mkdirSync(other);
  runHook(sb, { session_id: "mine", transcript_path: writeTranscript(mine, [20_000, 145_000]), cwd: sb.dir });
  // A second session in the same folder sends the last prompt.
  runHook(sb, { session_id: "other", transcript_path: writeTranscript(other, [20_000, 30_000]), cwd: sb.dir });
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "report.cjs")], {
    cwd: sb.dir,
    env: { ...sb.env, CLAUDE_CODE_SESSION_ID: "mine" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /source \.+ this session/);
  assert.match(r.stdout, /context now \.+ 145,000 tokens/);
});

test("hook sweeps state untouched for a week, at most once a day", () => {
  const sb = sandbox();
  const dir = path.join(sb.dir, "mimirs-well");
  fs.mkdirSync(dir);
  const old = path.join(dir, "session-old.json");
  const recent = path.join(dir, "session-recent.json");
  const notOurs = path.join(dir, "notes.txt");
  for (const f of [old, recent, notOurs]) fs.writeFileSync(f, "{}");
  const eightDaysAgo = (Date.now() - 8 * 24 * 3600 * 1000) / 1000;
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  fs.utimesSync(notOurs, eightDaysAgo, eightDaysAgo);

  const ask = () => runHook(sb, { session_id: "sweep", transcript_path: writeTranscript(sb.dir, [20_000]), cwd: sb.dir });
  ask();
  assert.equal(fs.existsSync(old), false, "a week-old state file is deleted");
  assert.equal(fs.existsSync(recent), true);
  assert.equal(fs.existsSync(notOurs), true, "only our own files");

  // Already swept today: a newly stale file waits for tomorrow.
  fs.writeFileSync(old, "{}");
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  ask();
  assert.equal(fs.existsSync(old), true);
});
