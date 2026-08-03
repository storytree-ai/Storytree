// `ownerLocalDate` — the clock behind the human-facing `decided:` stamp on `adr new --decided`.
//
// WHY THIS FILE EXISTS, stated plainly because the honest reason is unusual. `ownerLocalDate` is
// real production code that already RUNS in production form: the composition root drives it, and
// mutating `OWNER_TIMEZONE` to `UTC` reds an existing assertion at `adr.test.ts` (`decided:
// 2026-07-11` -> `2026-07-10`). So this file does not close a coverage HOLE. What it closes is a
// LEGIBILITY gap: the symbol's name appeared in no test file, so `check:verification-decay`'s
// `unproven-seam-default` instrument counted it as an unproven seam default and pushed that rung to
// 25 against a ceiling of 24 — redding `pnpm gate` on the dev box for every session, caused by no
// branch, and SKIPPING the six rungs behind it (`&&` chain).
//
// The remedy had exactly one honest shape, and three dishonest ones that were explicitly rejected
// (parked as `drain-unproven-seam-default-back-to-24` on `verification-integrity-arc`):
//   - raising the ceiling (ADR-0252 D3 forbids it as a remedy; no measurement aperture widened),
//   - covering a DIFFERENT located symbol to get the count down (masks the actual growth),
//   - a name-only mention, which silences the instrument while proving nothing — the instrument's
//     own documented blind spot, and it has bitten this repo once already.
//
// So the bar for this file is that it must assert things NOTHING ELSE IN THE REPO ASSERTS, by
// importing and DRIVING the function. Two such claims, both load-bearing and neither covered
// elsewhere at unit level:
//   1. the `en-CA` formatting claim — that the output is `YYYY-MM-DD` and not a locale-slashed or
//      zero-unpadded rendering. The whole point of `en-CA` is that it formats ISO-shaped directly.
//   2. the zone is a real IANA zone observing DST, not a fixed offset. Sydney is UTC+11 in January
//      (AEDT) and UTC+10 in July (AEST); the January/July pair below cannot both be satisfied by
//      any single fixed offset, so a "simplify it to +10" refactor goes red here.
//
// Proof: pnpm --filter @storytree/cli exec node --import tsx --test src/owner-local-date.test.ts
// Mutation-verified: flipping OWNER_TIMEZONE in commands.ts from "Australia/Sydney" to "UTC" reds
// the January case below (2026-01-16 -> 2026-01-15). Re-verify that if you touch this file — a test
// that cannot fail drains the instrument without adding proof, which is the failure mode above.

import assert from "node:assert/strict";
import { test } from "node:test";

import { ownerLocalDate } from "./commands.js";

/** The shape the `decided:` frontmatter and the `## Status` prose both require. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test("formats as YYYY-MM-DD — the en-CA claim, not a locale-slashed rendering", () => {
  const formatted = ownerLocalDate(new Date("2026-03-07T02:00:00Z"));

  assert.match(
    formatted,
    ISO_DATE,
    "`decided:` frontmatter and the `## Status` prose both require YYYY-MM-DD; a locale that renders 7/3/2026 or 2026-3-7 breaks the ADR frontmatter parser",
  );
  // Zero-padding specifically: a single-digit month/day is the shape that slips through a looser
  // check and then sorts wrongly in the decision log.
  assert.equal(formatted, "2026-03-07");
});

test("uses the OWNER's zone, not UTC — a UTC clock reports the previous day for a whole morning", () => {
  // 13:30Z on 15 Jan is 00:30 on 16 Jan in Sydney (AEDT, +11). This is the exact off-by-one that
  // had to be hand-corrected on every owner-directed ADR: a session running before ~10:00 local
  // recorded the decision as the PREVIOUS day, silently mis-ordering it against the ADR it amends.
  assert.equal(ownerLocalDate(new Date("2026-01-15T13:30:00Z")), "2026-01-16");
});

test("the zone observes DST — a fixed offset cannot satisfy both halves of the year", () => {
  // Sydney is +11 in January (AEDT) and +10 in July (AEST). Same wall-clock UTC instant, 13:30Z:
  //   January -> 00:30 NEXT day   (only true at +11)
  //   July    -> 23:30 SAME day   (only true at +10)
  // No single fixed offset satisfies both, so replacing the IANA zone with `+10:00` or `+11:00`
  // reds this test. That is the point — `Intl` is doing real zone work here, not arithmetic.
  assert.equal(ownerLocalDate(new Date("2026-01-15T13:30:00Z")), "2026-01-16", "January is AEDT (+11)");
  assert.equal(ownerLocalDate(new Date("2026-07-15T13:30:00Z")), "2026-07-15", "July is AEST (+10)");
});

test("is a pure function of the instant it is given — no ambient clock read", () => {
  // The caller passes the instant (`ownerLocalDate(deps.now?.() ?? new Date())`), so the same input
  // must always produce the same output. If this ever reads the wall clock itself, the `--decided`
  // stamp stops being testable at all.
  const instant = new Date("2026-11-02T09:15:00Z");
  assert.equal(ownerLocalDate(instant), ownerLocalDate(instant));
  assert.equal(ownerLocalDate(new Date(instant.getTime())), ownerLocalDate(instant));
});
