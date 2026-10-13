# Context Economics — why the saturation signal has two levels

Read this when you need to explain *why* Mimir's Well warns, or when a user asks whether a
long session is "fine because of caching".

---

## 1. Every turn re-sends the whole context

A model has no memory between turns. To answer turn N, the whole conversation so far
(instructions, files read, tool results, every earlier message) is sent again. So:

- **cost of one turn ∝ size of the context at that turn** — linear;
- **cost of the whole session ∝ (number of turns)²** — roughly quadratic, because the
  context grows as the session goes on.

## 2. Prompt caching changes the price, not the shape

With prompt caching, most of the re-sent context is billed as a cache read, which is about
a tenth of the price of fresh input. That is a huge saving — and it is what makes long
sessions viable at all — but it divides the **price per token**. It does not change the
**curve**. A session twice as long still costs roughly four times as much.

## 3. One measured session, as an illustration

A long working session (332 API requests) was measured from its transcript:

| | |
|---|---|
| Input re-sent over the session | ~100.8 M tokens |
| … of which cache reads | **99.1%** |
| Cost with caching vs. without | caching cut the bill by **~87%** (7.85×) |
| Average context per request, by quarter of the session | 151k → 270k → 368k → **427k** |
| Context of the last turn vs. the first | **6.5×** — so the last turn cost ~6.5× the first |

A quadratic model fitted to it matched the measured cost. Consequence: **the same work split
into two sessions costs about a third less** in re-sent context.

*One session, one model, one point in time — treat the numbers as an illustration of the
shape, not as constants.*

## 4. Two questions, two levels

Because cost grows with the square of length while the window is a hard ceiling, "should we
wrap up?" is really two different questions, and they don't cross at the same number:

| Level | Question | Default trigger | What to do |
|---|---|---|---|
| 🟡 1 | *Is each turn getting expensive?* (the plan) | the turn re-sends ≥ 4× the first turn's context, and at least 15% of the window | Ask: does the next unit of work depend on what's accumulated here? If not, it's cheaper in a fresh session. If it does, keep going — paying for context is cheaper than rediscovering it. |
| 🔴 2 | *Will the handoff still fit?* (the window) | ≥ 70% of the context window | Don't start new work. Hand off now, while there's room to write the package and before automatic compaction summarizes away detail. |

A single threshold near the ceiling would let sessions run expensive for a long time; a
single low threshold would waste most of the window. Two levels let each question be
answered on its own.

## 5. Things that are easy to get wrong

- **Window percentage is not a cost measure.** It tells you when compaction will happen, not
  when turns became expensive.
- **Context and duration are different resources.** A long-running command (a test suite, a
  build) can take an hour and add almost nothing to the context.
- **After compaction the context drops** and the levels re-arm. The first turn's context
  stays the reference for the cost multiplier.
- **"Equivalent cost" is not a bill.** Subscription plans aren't billed per token. A dollar
  estimate is only a common unit to compare one turn with another.
- **Read the number from the measurement, not from memory.** Context grows during a turn;
  the meter is the source of truth.
