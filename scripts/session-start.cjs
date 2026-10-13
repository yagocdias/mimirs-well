/**
 * Mimir's Well — Claude Code `SessionStart` hook.
 *
 * WHY IT EXISTS
 * A skill enters the context only when something triggers it, but the
 * Sentinel has to be on *before* there is anything to notice. And a Handoff
 * Package is only useful if the next session finds it. This hook does both,
 * once per session, in a few lines:
 *   - reminds Claude the Sentinel is on, and where this project's Well is;
 *   - points at a recent Handoff Package not yet resumed (the path, not the
 *     package: the user decides whether it's worth the tokens);
 *   - on a resume after the prompt cache expired, says what the next turn
 *     will cost to re-write, which is when a fresh session is cheapest.
 *
 * Fails silently, always: a broken hook must never block a session.
 */

const fs = require("fs");
const path = require("path");
const well = require("./well.cjs");
const meter = require("./meter.cjs");

// Below this, re-writing the cache costs too little to mention.
const EXPIRED_CACHE_MIN_TOKENS = 50_000;

function done(output) {
  if (output) process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

function hours(h) {
  return h < 1 ? Math.max(1, Math.round(h * 60)) + " min" : Math.round(h) + " h";
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    done(null);
  }
  const source = input.source || "startup";
  const w = well.locate({ cwd: input.cwd });
  const context = [];
  const notes = [];

  // A resumed session still has the reminder in its context; every other start
  // (new, /clear, compaction, fork) gets it again.
  if (source !== "resume") {
    context.push(
      "Mimir's Well is installed (skill: mimirs-well). Its Sentinel is on in this session: when " +
        "something genuinely worth keeping happens (an elegant solution, a non-obvious decision, a " +
        "lesson learned the hard way), offer to log it with one ⚗️ line at a natural pause. Rarely: " +
        "one strong signal beats three weak ones.\n" +
        `This project's Well: ${w.dir}${w.exists ? "" : " (not created yet)"}. Every project: ${path.join(w.root, "projects")}. ` +
        "Load the mimirs-well skill before writing there."
    );
  }

  if (source === "startup" || source === "clear") {
    const h = well.pendingHandoff(w.dir);
    if (h) {
      context.push(
        `A Handoff Package written ${hours(h.ageH)} ago is waiting: ${h.file}\n` +
          "Tell the user in one line and offer to resume from it. Read it only if they say yes; " +
          "then rename it to end in .loaded.md, so it isn't offered again."
      );
      notes.push(`handoff from ${hours(h.ageH)} ago waiting (${path.basename(h.file)})`);
    }
  }

  if (source === "resume" && input.prompt_cache_likely_expired && input.context_tokens >= EXPIRED_CACHE_MIN_TOKENS) {
    const usd = typeof input.estimated_cache_write_usd === "number" ? `, ~$${input.estimated_cache_write_usd.toFixed(2)} est.` : "";
    const cost = `~${meter.k(input.context_tokens)} tokens${usd}`;
    context.push(
      `This session was resumed after its prompt cache expired: the next turn re-writes the whole context (${cost}). ` +
        "If what comes next doesn't depend on this context, a Handoff Package to a new session is cheaper. " +
        "Say so in one line and let the user choose."
    );
    notes.push(`resuming with an expired cache: the next turn re-writes ${cost}`);
  }

  if (!context.length) done(null);
  const out = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context.join("\n\n") } };
  if (notes.length) out.systemMessage = "Mimir's Well · " + notes.join(" · ");
  done(out);
}

try {
  main();
} catch {
  done(null);
}
