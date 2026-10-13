# Sentinel Log Format

The Sentinel Log is a running record of patterns detected passively during a conversation.
Where there is a file system, it lives in the project's `well-log.md` (see "The Well on Disk"
in SKILL.md): append each entry the user says yes to, so it survives the session. Without
one, keep it explicitly in the conversation. Either way, offer to compile it at the end of
a session where signals were captured.

---

## Log Entry Format

Each entry captured during Sentinel mode should follow this structure:

```
⚗️ [Timestamp or sequence number]
WHAT: [One sentence — what was detected]
WHY IT MATTERS: [One sentence — why this is transferable]
TRANSFERABILITY: [brief — what other contexts this applies to]
SOURCE: [brief reference to where in the conversation this came from]
STATUS: [logged / confirmed by user / skipped]
```

---

## End-of-Session Compilation

When a session ends with logged Sentinel entries, offer:

> "During this conversation, Mimir's Well logged [N] pattern(s). Want me to compile
> them into a Pattern Report or Skill Seed before we close?"

If yes: use the Pattern Report or Skill Seed template from the other reference files,
drawing from the log entries. Treat each entry as a candidate pattern — confirm with
the user before including in the final output.

If no: offer the Continuity Anchor anyway, with the log entries appended, so they
aren't lost.

---

## Sentinel Signal Discipline

The value of the Sentinel depends entirely on its signal-to-noise ratio.
Surface a signal only when at least two of the following are true:

- The solution is non-obvious (a competent person might not have thought of it)
- The pattern has appeared more than once in this conversation
- The insight required real effort or failure to reach
- The approach transfers cleanly to at least two other domains or contexts

When in doubt, don't signal. One missed pattern costs less than one false alarm
that trains the user to ignore the signals.

---

## Example Log

```
⚗️ Entry 1
WHAT: User separated retry logic into a dedicated wrapper function rather than
      inlining it in each operation
WHY IT MATTERS: Centralizing retry logic means changing retry behavior requires
      touching one place, not ten
TRANSFERABILITY: Any system with unreliable external dependencies — APIs, file I/O,
      network calls, UI automation
SOURCE: Code review discussion, around the HTTPClient refactor
STATUS: confirmed by user

⚗️ Entry 2
WHAT: User chose to log the full request/response on failure rather than just
      the error message
WHY IT MATTERS: Reconstructing what happened without re-running is only possible
      if enough context was captured at failure time
TRANSFERABILITY: Any automated process where failures need to be diagnosed offline
SOURCE: Debugging session for the filing parser
STATUS: logged
```
