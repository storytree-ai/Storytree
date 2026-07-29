import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { diffCorpusContent, loadCorpus } from "@storytree/library/store";

import {
  DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG as CEILING,
  evaluateCorpusContentDrain,
} from "./corpus-content-drain.js";

/**
 * The `check:corpus-content` drain ceiling (`verification-integrity-arc`, ADR-0252 D3, in ADR-0168
 * D4's shape). Pure — the core takes classified drift lists and the compared population, so every
 * level is testable without a DB. The red→green pair is each axis breaching ALONE; the guards pin what
 * the ceiling must NOT fire on, since a ceiling that reds on today's honest baseline would buy silence
 * rather than a drain.
 *
 * NOTE ON WHAT CANNOT BE PINNED HERE. Unlike its sibling `surface-coverage-drain.test.ts`, this suite
 * cannot assert the real repo's sweep: the population lives in the LIVE store and the gate is offline
 * by charter (`pnpm -r test` needs no DB). Adding a live-gated test would land in the exact
 * options-form-skip shape `check:verification-decay`'s `vacuous-proof` instrument exists to locate. So
 * the live baseline is pinned where it is observable — in the ceiling's own header, as a differential
 * control that can be re-run — and what is pinned HERE is everything that does not need the DB: the
 * ceiling values, the independence of the axes, the substrate direction, and the fact that the
 * comparison logic reports a full population when both sides genuinely match.
 */

/** Today's shape: every export-scope seed artifact had a live counterpart. */
const FULL = { compared: 160, comparedLive: 160 } as const;
const ids = (n: number, p = "a"): string[] => Array.from({ length: n }, (_, i) => `${p}-${i}`);

// ---------------------------------------------------------------------------
// RED — each axis, on its own
// ---------------------------------------------------------------------------

/**
 * The ceiling as it shipped on 2026-07-28, kept as an explicit config so the measured reasoning below
 * still runs after the axis was tightened to zero (ADR-0263 drain, 2026-07-29). The numbers in those
 * tests are evidence about the ceiling's SHAPE — split vs summed — which is independent of its value.
 */
const BASELINE_2026_07_28 = { valueDriftCeiling: 14, degradedLiveCeiling: 0 } as const;

test("RED: the value-drift axis breaches alone — at V=0 the FIRST unreconciled artifact reds", () => {
  const v = evaluateCorpusContentDrain({ valueDrift: ids(1), degradedLive: [] }, FULL);
  assert.equal(v.level, "red");
  assert.equal(v.valueDriftCount, 1);
  assert.equal(v.breaches.length, 1, "only the value-drift axis breached");
  assert.match(v.breaches[0] ?? "", /1 artifact\(s\) carry a live body differing from seed/);
  assert.match(v.breaches[0] ?? "", /V=0/);
  // The breach NAMES the items, so the drain is actionable from the gate output alone.
  assert.match(v.breaches[0] ?? "", /a-0/);
  assert.equal(v.unverified, undefined);

  // The "strictly above" boundary still holds at any ceiling — pinned against the historical one so a
  // future re-baseline cannot silently turn `>` into `>=`.
  assert.equal(
    evaluateCorpusContentDrain({ valueDrift: ids(14), degradedLive: [] }, FULL, BASELINE_2026_07_28).level,
    "warn",
    "AT the ceiling is not a breach",
  );
  assert.equal(
    evaluateCorpusContentDrain({ valueDrift: ids(15), degradedLive: [] }, FULL, BASELINE_2026_07_28).level,
    "red",
    "one PAST the ceiling is",
  );
});

test("RED: the degraded-live axis breaches alone — ONE below-floor body reds (D=0), and is named", () => {
  // D carries ZERO headroom: a live body below the schema floor is a data-integrity fault the exporter
  // REFUSES to propagate, so the minimal breach is a single artifact.
  const v = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: ["audit-the-signed-verdict"] }, FULL);
  assert.equal(v.level, "red");
  assert.equal(v.degradedLiveCount, 1);
  assert.equal(v.breaches.length, 1, "only the degraded-live axis breached");
  assert.match(v.breaches[0] ?? "", /1 artifact\(s\) carry a live body BELOW THE SCHEMA FLOOR/);
  assert.match(v.breaches[0] ?? "", /D=0/);
  assert.match(v.breaches[0] ?? "", /audit-the-signed-verdict/);
});

test("the two axes are INDEPENDENT and never summed — the measured hiding case reds", () => {
  // This replays the control measured against the live store on 2026-07-28. Baseline was
  // value-drift=14, degraded-live=0 (SUM 14). Simulating the realistic concurrent case — a sibling
  // drains ONE value-drift by export while ONE live body degrades — gives value-drift=13,
  // degraded-live=1, and the SUM is STILL 14. A summed ceiling of 14 sees nothing on either side of
  // that change; the split pair must red, because the more severe class would otherwise hide inside
  // the noisier one's headroom.
  const before = evaluateCorpusContentDrain({ valueDrift: ids(14), degradedLive: [] }, FULL, BASELINE_2026_07_28);
  assert.equal(before.level, "warn", "the baseline sits AT V and must stay green");

  const after = evaluateCorpusContentDrain(
    { valueDrift: ids(13), degradedLive: ["deep-modules"] },
    FULL,
    BASELINE_2026_07_28,
  );
  assert.equal(before.valueDriftCount + before.degradedLiveCount, 14);
  assert.equal(after.valueDriftCount + after.degradedLiveCount, 14, "the SUM is unchanged — a summed ceiling is blind");
  assert.equal(after.level, "red", "the split ceilings catch what the sum cannot");
  assert.equal(after.breaches.length, 1, "the under-ceiling value-drift list contributes no breach");
  assert.match(after.breaches[0] ?? "", /BELOW THE SCHEMA FLOOR/);

  // …and the reverse: the at-ceiling degraded list absorbs nothing for its sibling.
  const SPLIT = { valueDriftCeiling: 14, degradedLiveCeiling: 1 };
  const editorial = evaluateCorpusContentDrain({ valueDrift: ids(15), degradedLive: ["x"] }, FULL, SPLIT);
  assert.equal(editorial.level, "red");
  assert.equal(editorial.breaches.length, 1);
  assert.match(editorial.breaches[0] ?? "", /differing from seed/);

  // Both breached ⇒ two SEPARATE breach lines, never one summed count.
  const both = evaluateCorpusContentDrain({ valueDrift: ids(15), degradedLive: ["x"] }, FULL);
  assert.equal(both.breaches.length, 2);
});

test("the drained baseline (0 value-drift, 0 degraded) is OK — the ceiling ships green on its own sweep", () => {
  // A ceiling that red on its own baseline would price the next session toward loosening it rather
  // than draining. The 2026-07-29 run after the ADR-0263 drain found 0/0 over 174 export-scope
  // artifacts, all 174 present live — so the baseline must read OK, not merely not-red.
  const v = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, { compared: 174, comparedLive: 174 });
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.unverified, undefined);
});

// ---------------------------------------------------------------------------
// FALSE-POSITIVE GUARDS — what the ceiling must NOT fire on
// ---------------------------------------------------------------------------

test("GUARD: the ceilings are the DRAINED baseline — V=0 and D=0, both zero headroom", () => {
  // TIGHTENING-ONLY (ADR-0252 D3). V was 14 from 2026-07-28 until the ADR-0263 drain took the real
  // count to zero on 2026-07-29; the ceiling follows the measurement DOWN and may never follow it up.
  // A future edit that RAISES either number is the named gaming failure mode, and this pin is what
  // makes such an edit fail rather than pass quietly.
  assert.equal(CEILING.valueDriftCeiling, 0);
  assert.equal(CEILING.degradedLiveCeiling, 0);
  // A single artifact of either kind now fails — the property the check has never had until now.
  assert.equal(evaluateCorpusContentDrain({ valueDrift: ids(1), degradedLive: [] }, FULL).level, "red");
  assert.equal(evaluateCorpusContentDrain({ valueDrift: [], degradedLive: ["x"] }, FULL).level, "red");
});

test("GUARD: no WARN BAND was opened beneath the ceilings — a drift is never QUIETER than before bounding", () => {
  // The failure mode this pins: a ceiling that made counts under it print OK would leave the check
  // quieter than before it was bounded. At V=0 there is no band left to soften — every drift is RED —
  // so the guard now pins the stronger property directly.
  for (const n of [1, 7, 13, 14]) {
    const v = evaluateCorpusContentDrain({ valueDrift: ids(n), degradedLive: [] }, FULL);
    assert.equal(v.level, "red", `${n} value-drift must RED at a zero ceiling, never OK`);
    assert.equal(v.breaches.length, 1);
  }
  // …and the band-preserving property still holds wherever a ceiling IS non-zero, so a future
  // re-baseline onto a widened population cannot quietly turn sub-ceiling drift into OK.
  for (const n of [1, 7, 13, 14]) {
    const v = evaluateCorpusContentDrain({ valueDrift: ids(n), degradedLive: [] }, FULL, BASELINE_2026_07_28);
    assert.equal(v.level, "warn", `${n} value-drift under a non-zero ceiling must still WARN, never OK`);
    assert.deepEqual(v.breaches, []);
  }
  // A clean, fully compared corpus is the ONLY thing that reads OK.
  assert.equal(evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, FULL).level, "ok");
});

// ---------------------------------------------------------------------------
// The substrate guard — INVERTED relative to surface-coverage-drain.ts
// ---------------------------------------------------------------------------

test("SUBSTRATE: a short compared-live population never certifies OK — the measured false-clean case", () => {
  // Measured on the authoring checkout: an EMPTY live store took `drifted` 14 → 0 while `compared`
  // still read 160, so the check printed `OK — every seed body matches live across 160 export-scope
  // artifacts` against a store holding none of them. Zero drift over zero comparisons is not evidence.
  const empty = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, { compared: 160, comparedLive: 0 });
  assert.equal(empty.level, "warn", "an uncompared population must never read as a clean corpus");
  assert.notEqual(empty.unverified, undefined, "and it is REPORTED, never silently dropped");
  assert.match(empty.unverified ?? "", /only 0 of 160/);
  assert.deepEqual(empty.breaches, [], "a deficient substrate manufactures no breach");

  // A truncated store is the same shape.
  const trunc = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, { compared: 160, comparedLive: 10 });
  assert.equal(trunc.level, "warn");
  assert.match(trunc.unverified ?? "", /only 10 of 160/);
});

test("SUBSTRATE: a breach is ENFORCED whatever the population — the counts are a lower bound", () => {
  // This is where this ceiling parts company with `surface-coverage-drain.ts`, and it is measured
  // rather than assumed. There, an empty seed INFLATED the orphan list (1 → 11), so a breach computed
  // against it had to be suppressed. Here a deficient live store only DELETES comparison candidates —
  // `diffCorpusContent` skips any seed id live has no row for — so the reported counts can only be too
  // LOW. A breach on a partial sweep is therefore still a real breach: if a lower bound is already past
  // the ceiling, the true count is too. Suppressing it would hide a genuine fault behind a substrate
  // excuse.
  const v = evaluateCorpusContentDrain(
    { valueDrift: ids(20), degradedLive: ["x"] },
    { compared: 160, comparedLive: 30 },
  );
  assert.equal(v.level, "red", "a partial sweep does not excuse a breach it already proved");
  assert.equal(v.breaches.length, 2);
  // …and the shortfall is still reported alongside it, so the reader knows the count is a floor.
  assert.notEqual(v.unverified, undefined);
});

test("SUBSTRATE: a fully compared population reports no shortfall — the guard is silent when it should be", () => {
  // The subject here is `unverified`, which is a property of the POPULATION alone and must not move
  // when a ceiling is re-baselined — so it is asserted under both the current zero ceiling and a
  // non-zero one. (This test previously pinned `level: "warn"` under the default and so quietly
  // depended on V being non-zero; that coupling is what the second assertion removes.)
  const atZero = evaluateCorpusContentDrain({ valueDrift: ids(3), degradedLive: [] }, FULL);
  assert.equal(atZero.unverified, undefined, "a full population raises no shortfall, whatever the ceiling");
  assert.equal(atZero.level, "red", "…and at V=0 the drift itself reds");

  const underCeiling = evaluateCorpusContentDrain(
    { valueDrift: ids(3), degradedLive: [] },
    FULL,
    BASELINE_2026_07_28,
  );
  assert.equal(underCeiling.unverified, undefined);
  assert.equal(underCeiling.level, "warn", "sub-ceiling drift over a full population is WARN, not OK");
});

// ---------------------------------------------------------------------------
// The comparison logic itself, pinned offline against the REAL seed
// ---------------------------------------------------------------------------

test("BASELINE: the real seed compared against itself is CLEAN over the full population", () => {
  // The live population needs a DB, but the CLASSIFIER does not. Loading the committed seed into an
  // in-memory store and diffing it against itself pins the two facts the ceiling rests on: a matching
  // corpus reports zero drift of either kind, and `comparedLive` equals the seed scope rather than
  // being a constant — so the substrate guard above measures a real quantity and would go RED here if
  // `diffCorpusContent` ever stopped counting matched pairs.
  const seedStore = new InMemoryStore();
  return loadCorpus(seedStore).then(async () => {
    const seed = await seedStore.queryDocs();
    const diff = diffCorpusContent(seed, seed);
    assert.equal(diff.clean, true, "the seed cannot drift from itself");
    assert.deepEqual(diff.drifted, []);
    assert.ok(diff.compared > 0, "the seed carries an export-scope tier");
    assert.equal(diff.comparedLive, diff.compared, "every seed artifact was actually compared");

    const v = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, diff);
    assert.equal(v.level, "ok", "a fully compared, matching corpus is the OK case");
    assert.equal(v.unverified, undefined);
  });
});

test("BASELINE: dropping live rows deflates to a FALSE clean that only `comparedLive` exposes", () => {
  // The measured substrate failure, reproduced offline against the real seed: remove the live side and
  // the diff reports `clean: true` with `drifted: []`. `compared` is unchanged, so it cannot see this;
  // only `comparedLive` can, which is why the ceiling reads it.
  const seedStore = new InMemoryStore();
  return loadCorpus(seedStore).then(async () => {
    const seed = await seedStore.queryDocs();
    const diff = diffCorpusContent(seed, []);
    assert.equal(diff.clean, true, "an empty live store reports CLEAN — the false-clean this guards");
    assert.ok(diff.compared > 0, "…while the printed denominator is unchanged");
    assert.equal(diff.comparedLive, 0, "…and only the compared-live population reveals it");

    const v = evaluateCorpusContentDrain({ valueDrift: [], degradedLive: [] }, diff);
    assert.equal(v.level, "warn", "so the ceiling withholds OK");
    assert.notEqual(v.unverified, undefined);
  });
});
