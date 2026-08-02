import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { diffCorpusContent, loadCorpus } from "@storytree/library/store";

import {
  DEFAULT_CORPUS_CONTENT_DRAIN_CONFIG as CEILING,
  evaluateCorpusContentDrain,
} from "./corpus-content-drain.js";

/**
 * The `check:corpus-content` drain ceilings (`verification-integrity-arc`, ADR-0252 D3, in ADR-0168
 * D4's shape; re-apertured by ADR-0290). Pure — the core takes CHARGED drift lists and the compared
 * population, so every level is testable without a DB. The red→green pair is each axis breaching
 * ALONE; the guards pin what the ceiling must NOT fire on, since a ceiling that reds on today's honest
 * baseline would buy silence rather than a drain.
 *
 * NOTE ON WHAT CANNOT BE PINNED HERE. Unlike its sibling `surface-coverage-drain.test.ts`, this suite
 * cannot assert the real repo's sweep: the population lives in the LIVE store and the gate is offline
 * by charter (`pnpm -r test` needs no DB). Adding a live-gated test would land in the exact
 * options-form-skip shape `check:verification-decay`'s `vacuous-proof` instrument exists to locate. So
 * the live baseline is pinned where it is observable — in the ceiling's own header, as a differential
 * control that can be re-run — and what is pinned HERE is everything that does not need the DB: the
 * ceiling values, the independence of the axes, the substrate direction, and the fact that the
 * comparison logic reports a full population when both sides genuinely match. The ATTRIBUTION half is
 * pinned in `corpus-content-attribution.test.ts`, which is pure for the same reason.
 */

/** Today's shape: every export-scope seed artifact had a live counterpart. */
const FULL = { compared: 160, comparedLive: 160 } as const;
const ids = (n: number, p = "a"): string[] => Array.from({ length: n }, (_, i) => `${p}-${i}`);
const NONE = { authoredValueDrift: [], degradedLive: [], authoredLiveOnly: [] } as const;

// ---------------------------------------------------------------------------
// RED — each axis, on its own
// ---------------------------------------------------------------------------

/**
 * The ceiling as it shipped on 2026-07-28, kept as an explicit config so the measured reasoning below
 * still runs after the axis was tightened to zero (ADR-0263 drain, 2026-07-29). The numbers in those
 * tests are evidence about the ceiling's SHAPE — split vs summed — which is independent of its value.
 */
const BASELINE_2026_07_28 = {
  authoredDriftCeiling: 14,
  degradedLiveCeiling: 0,
  authoredLiveOnlyCeiling: 0,
} as const;

test("RED: the authored value-drift axis breaches alone — at A=0 the FIRST unreconciled artifact reds", () => {
  const v = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(1) }, FULL);
  assert.equal(v.level, "red");
  assert.equal(v.authoredDriftCount, 1);
  assert.equal(v.breaches.length, 1, "only the authored value-drift axis breached");
  assert.match(v.breaches[0] ?? "", /1 artifact\(s\) this branch authored carry a live body differing from seed/);
  assert.match(v.breaches[0] ?? "", /A=0/);
  // The breach NAMES the items, so the drain is actionable from the gate output alone.
  assert.match(v.breaches[0] ?? "", /a-0/);
  assert.equal(v.unverified, undefined);

  // The "strictly above" boundary still holds at any ceiling — pinned against the historical one so a
  // future re-baseline cannot silently turn `>` into `>=`.
  assert.equal(
    evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(14) }, FULL, BASELINE_2026_07_28).level,
    "warn",
    "AT the ceiling is not a breach",
  );
  assert.equal(
    evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(15) }, FULL, BASELINE_2026_07_28).level,
    "red",
    "one PAST the ceiling is",
  );
});

test("RED: the degraded-live axis breaches alone — ONE below-floor body reds (D=0), and is named", () => {
  // D carries ZERO headroom: a live body below the schema floor is a data-integrity fault the exporter
  // REFUSES to propagate, so the minimal breach is a single artifact.
  const v = evaluateCorpusContentDrain({ ...NONE, degradedLive: ["audit-the-signed-verdict"] }, FULL);
  assert.equal(v.level, "red");
  assert.equal(v.degradedLiveCount, 1);
  assert.equal(v.breaches.length, 1, "only the degraded-live axis breached");
  assert.match(v.breaches[0] ?? "", /1 artifact\(s\) carry a live body BELOW THE SCHEMA FLOOR/);
  assert.match(v.breaches[0] ?? "", /D=0/);
  assert.match(v.breaches[0] ?? "", /audit-the-signed-verdict/);
});

test("RED: the authored live-only axis breaches alone — the population the check was BLIND to (ADR-0290)", () => {
  // The WIDENING half of ADR-0290's aperture change, and the reason it is not a softening. Before it,
  // `diffCorpusContent` walked the SEED scope and skipped any id live carried but the seed did not, so
  // a durable artifact created live and never exported was counted on NEITHER axis — while
  // `computeExportedSeed` appended it to the seed anyway. Measured 2026-07-30: a GREEN `OK — every
  // seed body matches live across 177 export-scope artifacts` alongside an `export-corpus --pg` dry
  // run reporting one pending addition in the same shell.
  const v = evaluateCorpusContentDrain({ ...NONE, authoredLiveOnly: ["citing-a-document-is-not-reading-it"] }, FULL);
  assert.equal(v.level, "red");
  assert.equal(v.authoredLiveOnlyCount, 1);
  assert.equal(v.breaches.length, 1, "only the live-only axis breached");
  assert.match(v.breaches[0] ?? "", /created live are ABSENT from the seed/);
  assert.match(v.breaches[0] ?? "", /L=0/);
  assert.match(v.breaches[0] ?? "", /citing-a-document-is-not-reading-it/);
});

test("the axes are INDEPENDENT and never summed — the measured hiding case reds", () => {
  // This replays the control measured against the live store on 2026-07-28. Baseline was
  // value-drift=14, degraded-live=0 (SUM 14). Simulating the realistic concurrent case — a sibling
  // drains ONE value-drift by export while ONE live body degrades — gives value-drift=13,
  // degraded-live=1, and the SUM is STILL 14. A summed ceiling of 14 sees nothing on either side of
  // that change; the split pair must red, because the more severe class would otherwise hide inside
  // the noisier one's headroom.
  const before = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(14) }, FULL, BASELINE_2026_07_28);
  assert.equal(before.level, "warn", "the baseline sits AT A and must stay green");

  const after = evaluateCorpusContentDrain(
    { ...NONE, authoredValueDrift: ids(13), degradedLive: ["deep-modules"] },
    FULL,
    BASELINE_2026_07_28,
  );
  assert.equal(before.authoredDriftCount + before.degradedLiveCount, 14);
  assert.equal(
    after.authoredDriftCount + after.degradedLiveCount,
    14,
    "the SUM is unchanged — a summed ceiling is blind",
  );
  assert.equal(after.level, "red", "the split ceilings catch what the sum cannot");
  assert.equal(after.breaches.length, 1, "the under-ceiling value-drift list contributes no breach");
  assert.match(after.breaches[0] ?? "", /BELOW THE SCHEMA FLOOR/);

  // …and the reverse: the at-ceiling degraded list absorbs nothing for its sibling.
  const SPLIT = { authoredDriftCeiling: 14, degradedLiveCeiling: 1, authoredLiveOnlyCeiling: 0 };
  const editorial = evaluateCorpusContentDrain(
    { ...NONE, authoredValueDrift: ids(15), degradedLive: ["x"] },
    FULL,
    SPLIT,
  );
  assert.equal(editorial.level, "red");
  assert.equal(editorial.breaches.length, 1);
  assert.match(editorial.breaches[0] ?? "", /differing from seed/);

  // All three breached ⇒ three SEPARATE breach lines, never one summed count.
  const all = evaluateCorpusContentDrain(
    { authoredValueDrift: ids(15), degradedLive: ["x"], authoredLiveOnly: ["y"] },
    FULL,
  );
  assert.equal(all.breaches.length, 3);
});

test("the drained baseline (0 / 0 / 0) is OK — the ceiling ships green on its own sweep", () => {
  // A ceiling that red on its own baseline would price the next session toward loosening it rather
  // than draining. The 2026-07-29 run after the ADR-0263 drain found 0/0 over 174 export-scope
  // artifacts, all 174 present live — so the baseline must read OK, not merely not-red.
  const v = evaluateCorpusContentDrain(NONE, { compared: 174, comparedLive: 174 });
  assert.equal(v.level, "ok");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.unverified, undefined);
});

test("DEFERRED drift is never charged, and never silently dropped either — it holds the verdict at WARN", () => {
  // ADR-0290's narrowing half. Drift charged to another writer (or to being behind main) contributes
  // ZERO breaches — that is the whole fix, and it is what unblocked the measured case of a branch
  // identical to origin/main being red on three artifacts it had not touched. But it must not read as
  // a clean corpus either: `deferred` holds the verdict at WARN so the shell's report is never
  // presented under an `ok`.
  const v = evaluateCorpusContentDrain(NONE, { ...FULL, deferred: 3 });
  assert.equal(v.level, "warn", "someone else's drift is reported, not certified away");
  assert.deepEqual(v.breaches, [], "…and contributes no breach at all");
  assert.equal(v.authoredDriftCount, 0);

  // The pre-ADR-0290 behaviour on the same population, for contrast: charged, it reds.
  const charged = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(3) }, FULL);
  assert.equal(charged.level, "red");
});

// ---------------------------------------------------------------------------
// FALSE-POSITIVE GUARDS — what the ceiling must NOT fire on
// ---------------------------------------------------------------------------

test("GUARD: the ceilings are the DRAINED baseline — A=0, D=0 and L=0, all zero headroom", () => {
  // TIGHTENING-ONLY WITHIN A FIXED MEASUREMENT APERTURE (ADR-0252 D3 as amended by ADR-0269). A was 14
  // from 2026-07-28 until the ADR-0263 drain took the real count to zero on 2026-07-29; the ceiling
  // follows the measurement DOWN, and follows it UP only on a genuine enlargement of what the sweep
  // SCANS — never to absorb drift that accumulated under an unchanged aperture, which stays the named
  // gaming failure mode. This pin is what makes EITHER edit deliberate rather than quiet: a raise that
  // absorbs drift fails here as it always did, and a legitimate aperture re-baseline has to come here
  // and record its decomposition (ADR-0269 4(f)), which is the audit surface working as intended.
  //
  // ADR-0290 IS such a re-aperture, and the decomposition is recorded rather than assumed: the numbers
  // did not move (all three are zero, as the first two already were), the POPULATION each measures
  // did. It narrows one direction (drift no signal attributes to this branch) and widens another (a
  // live-only artifact this branch authored, previously invisible on both axes).
  assert.equal(CEILING.authoredDriftCeiling, 0);
  assert.equal(CEILING.degradedLiveCeiling, 0);
  assert.equal(CEILING.authoredLiveOnlyCeiling, 0);
  // A single artifact of any of the three kinds now fails.
  assert.equal(evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(1) }, FULL).level, "red");
  assert.equal(evaluateCorpusContentDrain({ ...NONE, degradedLive: ["x"] }, FULL).level, "red");
  assert.equal(evaluateCorpusContentDrain({ ...NONE, authoredLiveOnly: ["x"] }, FULL).level, "red");
});

test("GUARD: no WARN BAND was opened beneath the ceilings — a charged drift is never QUIETER than before", () => {
  // The failure mode this pins: a ceiling that made counts under it print OK would leave the check
  // quieter than before it was bounded. At A=0 there is no band left to soften — every CHARGED drift
  // is RED — so the guard pins the stronger property directly.
  for (const n of [1, 7, 13, 14]) {
    const v = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(n) }, FULL);
    assert.equal(v.level, "red", `${n} authored value-drift must RED at a zero ceiling, never OK`);
    assert.equal(v.breaches.length, 1);
  }
  // …and the band-preserving property still holds wherever a ceiling IS non-zero, so a future
  // re-baseline onto a widened population cannot quietly turn sub-ceiling drift into OK.
  for (const n of [1, 7, 13, 14]) {
    const v = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(n) }, FULL, BASELINE_2026_07_28);
    assert.equal(v.level, "warn", `${n} authored value-drift under a non-zero ceiling must still WARN, never OK`);
    assert.deepEqual(v.breaches, []);
  }
  // A clean, fully compared corpus with nothing deferred is the ONLY thing that reads OK.
  assert.equal(evaluateCorpusContentDrain(NONE, FULL).level, "ok");
});

// ---------------------------------------------------------------------------
// The substrate guard — INVERTED relative to surface-coverage-drain.ts
// ---------------------------------------------------------------------------

test("SUBSTRATE: a short compared-live population never certifies OK — the measured false-clean case", () => {
  // Measured on the authoring checkout: an EMPTY live store took `drifted` 14 → 0 while `compared`
  // still read 160, so the check printed `OK — every seed body matches live across 160 export-scope
  // artifacts` against a store holding none of them. Zero drift over zero comparisons is not evidence.
  const empty = evaluateCorpusContentDrain(NONE, { compared: 160, comparedLive: 0 });
  assert.equal(empty.level, "warn", "an uncompared population must never read as a clean corpus");
  assert.notEqual(empty.unverified, undefined, "and it is REPORTED, never silently dropped");
  assert.match(empty.unverified ?? "", /only 0 of 160/);
  assert.deepEqual(empty.breaches, [], "a deficient substrate manufactures no breach");

  // A truncated store is the same shape.
  const trunc = evaluateCorpusContentDrain(NONE, { compared: 160, comparedLive: 10 });
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
    { ...NONE, authoredValueDrift: ids(20), degradedLive: ["x"] },
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
  // non-zero one.
  const atZero = evaluateCorpusContentDrain({ ...NONE, authoredValueDrift: ids(3) }, FULL);
  assert.equal(atZero.unverified, undefined, "a full population raises no shortfall, whatever the ceiling");
  assert.equal(atZero.level, "red", "…and at A=0 the drift itself reds");

  const underCeiling = evaluateCorpusContentDrain(
    { ...NONE, authoredValueDrift: ids(3) },
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
  // in-memory store and diffing it against itself pins the facts the ceiling rests on: a matching
  // corpus reports zero drift of either kind and NO live-only population, and `comparedLive` equals
  // the seed scope rather than being a constant — so the substrate guard above measures a real
  // quantity and would go RED here if `diffCorpusContent` ever stopped counting matched pairs.
  const seedStore = new InMemoryStore();
  return loadCorpus(seedStore).then(async () => {
    const seed = await seedStore.queryDocs();
    const diff = diffCorpusContent(seed, seed);
    assert.equal(diff.clean, true, "the seed cannot drift from itself");
    assert.deepEqual(diff.drifted, []);
    assert.deepEqual(diff.liveOnly, [], "…and holds nothing live carries that it does not");
    assert.ok(diff.compared > 0, "the seed carries an export-scope tier");
    assert.equal(diff.comparedLive, diff.compared, "every seed artifact was actually compared");

    const v = evaluateCorpusContentDrain(NONE, diff);
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

    const v = evaluateCorpusContentDrain(NONE, diff);
    assert.equal(v.level, "warn", "so the ceiling withholds OK");
    assert.notEqual(v.unverified, undefined);
  });
});

test("BASELINE: a LIVE-ONLY artifact is reported by the diff — the blind spot that let a retire resurrect", () => {
  // The other direction, pinned against the real seed. Before ADR-0290 `diffCorpusContent` returned
  // nothing about an id live carried and the seed did not, so a caller could print a clean verdict
  // while `computeExportedSeed` stood ready to append it. That is exactly how `oq-diff-view-altitude`
  // — an open question the owner had RETIRED under ADR-0267 D5 — came within one blind `--write` of
  // being written back into the committed seed on 2026-07-30.
  const seedStore = new InMemoryStore();
  return loadCorpus(seedStore).then(async () => {
    const seed = await seedStore.queryDocs();
    const live = [
      ...seed,
      {
        id: "oq-only-live",
        kind: "open-question",
        doc: { id: "oq-only-live", kind: "open-question" },
        createdAt: "",
        updatedAt: "",
      },
    ];
    const diff = diffCorpusContent(seed, live);
    assert.equal(diff.clean, true, "it is NOT drift — there is nothing on the seed side to compare");
    assert.deepEqual(diff.liveOnly, ["oq-only-live"], "…but it is no longer invisible");
  });
});
