// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const well = require(path.join(ROOT, "scripts", "well.cjs"));

// Every test gets its own Well; the user's real ~/.mimir is never touched.
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mimir-well-test-"));
  const env = { ...process.env, TMP: dir, TEMP: dir, TMPDIR: dir, MIMIR_WELL_DIR: path.join(dir, "well") };
  for (const k of Object.keys(env)) if (k.startsWith("CLAUDE_PLUGIN_OPTION_")) delete env[k];
  return { dir, env, well: env.MIMIR_WELL_DIR };
}

function runStart(sb, payload) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "session-start.cjs")], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: sb.env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, "the hook must always exit 0; stderr: " + r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

function ageFile(file, hours) {
  const t = (Date.now() - hours * 3_600_000) / 1000;
  fs.utimesSync(file, t, t);
}

test("a project is its git root, named after its folder; locating creates nothing", () => {
  const sb = sandbox();
  const repo = path.join(sb.dir, "Meu Projeto");
  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src", "deep"), { recursive: true });
  const w = well.locate({ root: sb.well, cwd: path.join(repo, "src", "deep") });
  assert.equal(w.project, "meu-projeto");
  assert.equal(w.path, repo);
  assert.equal(w.dir, path.join(sb.well, "projects", "meu-projeto"));
  assert.equal(w.exists, false);
  assert.equal(fs.existsSync(sb.well), false);
});

test("two folders with the same name don't share a Well", () => {
  const sb = sandbox();
  const a = path.join(sb.dir, "a", "app");
  const b = path.join(sb.dir, "b", "app");
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });
  const wa = well.ensure({ root: sb.well, cwd: a });
  const wb = well.ensure({ root: sb.well, cwd: b });
  assert.equal(wa.project, "app");
  assert.match(wb.project, /^app-[0-9a-f]{6}$/);
  assert.equal(well.locate({ root: sb.well, cwd: a }).project, "app", "stable once created");
  assert.equal(well.locate({ root: sb.well, cwd: b }).project, wb.project);
  for (const sub of ["reports", "seeds", "handoffs"]) assert.ok(fs.existsSync(path.join(wa.dir, sub)), sub);
  assert.equal(JSON.parse(fs.readFileSync(path.join(wb.dir, "project.json"), "utf8")).path, b);
});

test("the pending handoff is the newest not yet resumed, and at most 48 h old", () => {
  const sb = sandbox();
  const w = well.ensure({ root: sb.well, cwd: sb.dir });
  const handoff = (name, hours) => {
    const file = path.join(w.dir, "handoffs", name);
    fs.writeFileSync(file, "# Handoff");
    ageFile(file, hours);
    return file;
  };
  assert.equal(well.pendingHandoff(w.dir), null);
  handoff("2026-10-10-0900.md", 72);
  assert.equal(well.pendingHandoff(w.dir), null, "older than 48 h");
  const pending = handoff("2026-10-12-0900.md", 20);
  handoff("2026-10-13-0900.loaded.md", 2);
  assert.equal(well.pendingHandoff(w.dir).file, pending, "*.loaded.md was already resumed");
});

test("the index lists every project's reports and seeds by title", () => {
  const sb = sandbox();
  const one = well.ensure({ root: sb.well, cwd: path.join(sb.dir, "one") });
  well.ensure({ root: sb.well, cwd: path.join(sb.dir, "two") });
  fs.writeFileSync(path.join(one.dir, "reports", "2026-10-13-meter.md"), "\n# Pattern Report — Meter\n\nbody");
  fs.writeFileSync(path.join(one.dir, "seeds", "retry.md"), "no heading");
  fs.writeFileSync(path.join(one.dir, "anchor.md"), "anchor");
  const idx = well.index({ root: sb.well });
  assert.deepEqual(idx.map((p) => p.project), ["one", "two"]);
  assert.equal(idx[0].reports[0].title, "Pattern Report — Meter");
  assert.equal(idx[0].seeds[0].title, "retry");
  assert.equal(idx[0].anchor, path.join(one.dir, "anchor.md"));
  assert.deepEqual(idx[1].reports, []);
});

test("CLI: an unsubstituted --root falls back to the configured Well", () => {
  const sb = sandbox();
  const placeholder = "$" + "{user_config.well_dir}";
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "well.cjs"), "where", "--root", placeholder], {
    cwd: sb.dir,
    env: sb.env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).root, path.resolve(sb.well));
});

test("session start: reminds the Sentinel and points at this project's Well", () => {
  const sb = sandbox();
  const out = runStart(sb, { session_id: "s", cwd: sb.dir, source: "startup" });
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Sentinel is on/);
  assert.ok(ctx.includes(well.locate({ root: sb.well, cwd: sb.dir }).dir), ctx);
  assert.match(ctx, /not created yet/);
  assert.equal(out.systemMessage, undefined, "nothing for the user to see");
});

test("session start: offers a recent handoff on startup, nothing on resume", () => {
  const sb = sandbox();
  const w = well.ensure({ root: sb.well, cwd: sb.dir });
  fs.writeFileSync(path.join(w.dir, "handoffs", "2026-10-13-1500.md"), "# Handoff");
  const start = runStart(sb, { session_id: "s", cwd: sb.dir, source: "startup" });
  assert.match(start.hookSpecificOutput.additionalContext, /Handoff Package written .+ ago is waiting/);
  assert.match(start.hookSpecificOutput.additionalContext, /\.loaded\.md/);
  assert.match(start.systemMessage, /^Mimir's Well · handoff from .+ ago waiting \(2026-10-13-1500\.md\)/);
  assert.equal(runStart(sb, { session_id: "s", cwd: sb.dir, source: "resume" }), null, "a resume already has its context");
});

test("session start: a resume after the cache expired says what the next turn re-writes", () => {
  const sb = sandbox();
  const big = runStart(sb, {
    session_id: "s",
    cwd: sb.dir,
    source: "resume",
    prompt_cache_likely_expired: true,
    context_tokens: 182_340,
    estimated_cache_write_usd: 1.1396,
  });
  assert.match(big.systemMessage, /expired cache: the next turn re-writes ~182k tokens, ~\$1\.14 est\./);
  assert.match(big.hookSpecificOutput.additionalContext, /Handoff Package to a new session is cheaper/);
  const small = runStart(sb, { session_id: "s", cwd: sb.dir, source: "resume", prompt_cache_likely_expired: true, context_tokens: 20_000 });
  assert.equal(small, null, "too small to matter");
});

test("session start fails silently on bad stdin", () => {
  assert.equal(runStart(sandbox(), "not json"), null);
});
