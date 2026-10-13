/**
 * Mimir's Well — where the Well lives on disk.
 *
 *   node well.cjs [--root DIR]            # where this project's Well is (JSON)
 *   node well.cjs ensure [--root DIR]     # create it, then print the same JSON
 *   node well.cjs index [--root DIR]      # every project's reports, seeds and anchor
 *
 * WHY ONE GLOBAL WELL, NOT ONE PER PROJECT
 * The point of the Well is to relate what different projects taught. A folder
 * inside each repo would scatter that across the disk (and into each repo's
 * git). So there is one root, ~/.mimir by default, with a folder per project:
 *
 *   ~/.mimir/projects/<project>/
 *     project.json                  which folder on disk this project is
 *     reports/YYYY-MM-DD-<topic>.md Pattern Reports (and Synthesis Reports)
 *     seeds/<name>.md               Skill Seeds
 *     well-log.md                   Sentinel entries, appended
 *     anchor.md                     the latest Continuity Anchor
 *     handoffs/YYYY-MM-DD-HHMM.md   Handoff Packages; "*.loaded.md" once resumed
 *
 * WHY --root
 * The plugin's `well_dir` option reaches hooks as an env var, but not commands
 * Claude runs through the Bash tool. The skill passes it explicitly instead.
 *
 * A project is the git root above the working folder (or the folder itself).
 * Two projects with the same folder name get told apart by project.json.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const HANDOFF_MAX_AGE_H = 48;

function wellRoot(given) {
  // A "${user_config.well_dir}" left unsubstituted (skill used outside the plugin) is no path.
  if (given && given.includes("${")) given = "";
  const raw =
    given ||
    process.env.CLAUDE_PLUGIN_OPTION_WELL_DIR ||
    process.env.MIMIR_WELL_DIR ||
    path.join(os.homedir(), ".mimir");
  return path.resolve(raw.replace(/^~(?=$|[\\/])/, os.homedir()));
}

/** The git root above `cwd`, or `cwd` itself. */
function projectPath(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(cwd || process.cwd());
    dir = up;
  }
}

function slugOf(p) {
  return (
    path
      .basename(p)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "root"
  );
}

const samePath = (a, b) =>
  process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** This project's folder in the Well. Pure: creates nothing. */
function locate({ root, cwd } = {}) {
  const r = wellRoot(root);
  const proj = projectPath(cwd);
  const base = slugOf(proj);
  const hashed = base + "-" + crypto.createHash("sha1").update(proj.toLowerCase()).digest("hex").slice(0, 6);
  for (const slug of [base, hashed]) {
    const dir = path.join(r, "projects", slug);
    const meta = readJson(path.join(dir, "project.json"));
    // Free, or already ours: take it. Taken by another folder: try the next.
    if (!meta.path || samePath(meta.path, proj)) return { root: r, project: slug, path: proj, dir, exists: !!meta.path };
  }
  return { root: r, project: hashed, path: proj, dir: path.join(r, "projects", hashed), exists: false };
}

function ensure(opts) {
  const w = locate(opts);
  for (const sub of ["reports", "seeds", "handoffs"]) fs.mkdirSync(path.join(w.dir, sub), { recursive: true });
  const meta = path.join(w.dir, "project.json");
  if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ path: w.path, created: new Date().toISOString() }, null, 2));
  return { ...w, exists: true };
}

/** The newest Handoff Package not yet resumed, if younger than maxAgeH. */
function pendingHandoff(dir, { maxAgeH = HANDOFF_MAX_AGE_H, now = Date.now() } = {}) {
  let best = null;
  try {
    for (const f of fs.readdirSync(path.join(dir, "handoffs"))) {
      if (!f.endsWith(".md") || f.endsWith(".loaded.md")) continue;
      const file = path.join(dir, "handoffs", f);
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    }
  } catch {
    return null;
  }
  if (!best) return null;
  const ageH = (now - best.mtime) / 3_600_000;
  return ageH <= maxAgeH ? { file: best.file, ageH } : null;
}

/** First Markdown heading, or the file name: enough to choose what to read. */
function titleOf(file) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 2000);
    const m = /^#\s+(.+)$/m.exec(head);
    if (m) return m[1].trim();
  } catch {
    /* fall through */
  }
  return path.basename(file, ".md");
}

/**
 * A table of contents of the whole Well, for cross-project synthesis: titles
 * and paths, not contents, so Claude reads only the reports that matter.
 */
function index(opts) {
  const r = wellRoot(opts && opts.root);
  const out = [];
  let projects = [];
  try {
    projects = fs.readdirSync(path.join(r, "projects"));
  } catch {
    return out;
  }
  for (const slug of projects.sort()) {
    const dir = path.join(r, "projects", slug);
    const entry = { project: slug, path: readJson(path.join(dir, "project.json")).path || null, reports: [], seeds: [] };
    for (const kind of ["reports", "seeds"])
      try {
        for (const f of fs.readdirSync(path.join(dir, kind)).sort())
          if (f.endsWith(".md")) entry[kind].push({ file: path.join(dir, kind, f), title: titleOf(path.join(dir, kind, f)) });
      } catch {
        /* none yet */
      }
    for (const f of ["anchor.md", "well-log.md"]) if (fs.existsSync(path.join(dir, f))) entry[f.replace(".md", "")] = path.join(dir, f);
    out.push(entry);
  }
  return out;
}

module.exports = { HANDOFF_MAX_AGE_H, wellRoot, projectPath, slugOf, locate, ensure, pendingHandoff, index };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--root");
  const root = i >= 0 ? args.splice(i, 2)[1] : undefined;
  const cmd = args[0] || "where";
  try {
    const result =
      cmd === "ensure" ? ensure({ root }) : cmd === "index" ? index({ root }) : cmd === "where" ? locate({ root }) : null;
    if (!result) throw new Error("unknown command: " + cmd + " (use: where, ensure, index)");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
