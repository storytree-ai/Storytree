// shadow-ladder.test.ts — the admissibility instrument, and the two findings it produces.
//
// THE FIRST BLOCK IS NOT ABOUT SHADOW AT ALL: it holds the PORT to the three configurations
// of the ceiling that were independently measured and recorded by earlier passes. A reader
// model invented here and tuned until it agreed with a preferred conclusion would be exactly
// the move this arc declined once and kept the refusal on the record for. A port that
// reproduces three recorded configurations is the same instrument; one that reproduced none
// of them would be a new metric wearing an old name.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHADE_LEVELS,
  STATUS_TOKENS,
  landPalette,
  landTokens,
  parseHex,
  statusFamilyOf,
  toHex,
} from './palette-band.js';
import {
  FLAT_GROUND_LEVEL,
  RENDERED_STATUSES,
  SHADOW_LADDER,
  SHADOW_RUNG,
  SHADOW_RUNG_INDEX,
  deepestAdmissibleRung,
  deliveredColour,
  familyOnShadowLadder,
  ladderAdmissibility,
  landPaletteWithShadow,
  liveCeilings,
  liveReaderTable,
  luminanceOverlap,
  luma,
  nearestStatus,
  readerStatusTable,
  robustlyInadmissible,
  rungsAShadowDarkens,
  safeDepth,
  shadowRamp,
} from './shadow-ladder.js';

const ALL_SIX = Object.keys(STATUS_TOKENS).sort();

/** `safe_depth` of a status's ground token against a given reader table, rounded the way the
 *  recorded numbers are printed. */
function ceiling(status: string, table: Record<string, { r: number; g: number; b: number }[]>) {
  return safeDepth(parseHex(STATUS_TOKENS[status]!.top[0]!), table).deepest;
}

test('THE PORT — reproduces PR #1385s ceilings: all six statuses, top faces, full light', () => {
  const table = readerStatusTable({ statuses: ALL_SIX });
  assert.equal(ceiling('healthy', table), 0.74);
  assert.equal(ceiling('mapped', table), 0.76);
  assert.equal(ceiling('proposed', table), 0.88);
  assert.equal(ceiling('unknown', table), 0.91);
});

test('THE PORT — reproduces PR #1407s FOLDED ceilings: the four statuses worldStatus renders', () => {
  // The fold DROPS `unhealthy` and `building` from the reader's vocabulary rather than
  // merging their tokens: a reader cannot have learned a colour the app never draws. That
  // reading is what makes `mapped` bottom out at the floor — with nothing darker left in the
  // table, darkening it flips to nothing.
  const table = readerStatusTable({ statuses: RENDERED_STATUSES });
  assert.equal(ceiling('healthy', table), 0.67);
  assert.equal(ceiling('mapped', table), 0.3, 'the floor: it never flips at all');
  assert.equal(ceiling('proposed', table), 0.88);
  assert.equal(ceiling('unknown', table), 0.91);
});

test('THE PORT — reproduces the COLLAPSED configuration: one token per status', () => {
  const table = readerStatusTable({ statuses: RENDERED_STATUSES, oneToken: true });
  assert.equal(ceiling('unknown', table), 0.94, 'the collapse moves the binding ceiling the WRONG way');
  assert.equal(ceiling('proposed', table), 0.9);
  assert.equal(ceiling('healthy', table), 0.72);
});

test('NON-VACUITY: the reader really can report a foreign status', () => {
  // Without this the three tests above would still pass if `nearestStatus` always returned
  // the status it was handed, which is the shape of a broken instrument that looks calm.
  const table = readerStatusTable({ statuses: RENDERED_STATUSES });
  const veryDark = { r: 20, g: 24, b: 14 };
  assert.notEqual(nearestStatus(veryDark, table), 'proposed');
  // and a WALL colour, at FULL LIGHT, already reads foreign against the guard's own
  // top-face table — the pre-existing condition `reader_status_table` records as 21 of 78
  // colours, with no shadow anywhere near it.
  assert.equal(nearestStatus(parseHex(STATUS_TOKENS['proposed']!.side), table), 'mapped');
});

test('FLAT GROUND IS DELIVERED AT 0.90, and that is derived from the light, not typed', () => {
  assert.equal(FLAT_GROUND_LEVEL, 0.9);
  assert.ok(SHADE_LEVELS.includes(FLAT_GROUND_LEVEL));
  // The consequence that makes the whole re-basing necessary: the live ground never wears
  // the raw token, so the compositor's full-light reader table is not this renderer's.
  assert.notEqual(FLAT_GROUND_LEVEL, 1.0);
});

test('THE FINDING: the SHIPPED ladder is already inadmissible, before any shadow exists', () => {
  // A measurement about the land that landed on 2026-08-20, not a cost of this change.
  // Relief reaches all four rungs, so an island carrying a `proposed` or `unknown` parcel
  // already delivers ground that reads as another status.
  const bad = ladderAdmissibility(SHADE_LEVELS).filter((v) => !v.admissible);
  const seen = bad.map((v) => `${v.status}@${v.level}->${v.readsAs}`).sort();
  assert.deepEqual(seen, [
    // DOWNWARD — the direction a shadow moves, and the one the increment names: doubt
    // painted as proof. Both of `unknown`'s dark rungs read `healthy`.
    'proposed@0.78->mapped',
    'proposed@0.8->mapped',
    'unknown@0.78->healthy',
    'unknown@0.8->healthy',
    // UPWARD, which nobody had looked for: a `healthy` slope tilted INTO the light lands on
    // rung 1.00 and reads `unknown` — proof painted as doubt. Relief delivers rung 1.00
    // today, so this is live too, and it means the collision is not a property of DARKENING.
    // It is a property of a ladder that steps further than the statuses are apart.
    'healthy@1->unknown',
  ].sort());
  // `mapped` is clear at every shipped rung. The failure is NOT uniform, which is what makes
  // a per-status ladder tempting and a single one bind hard.
  assert.equal(bad.filter((v) => v.status === 'mapped').length, 0);
});

test('the SHADOW RUNG adds no collision of its own — it is the whole point of deriving it', () => {
  const before = ladderAdmissibility(SHADE_LEVELS)
    .filter((v) => !v.admissible)
    .map((v) => `${v.status}@${v.level}`);
  const after = ladderAdmissibility(SHADOW_LADDER)
    .filter((v) => !v.admissible)
    .map((v) => `${v.status}@${v.level}`);
  assert.deepEqual(after.sort(), before.sort(), 'the shadow rung introduced a foreign read');
});

test('THE SHADOW RUNG is DERIVED, is the deepest admissible level, and is a boundary', () => {
  const derived = deepestAdmissibleRung();
  assert.equal(derived, SHADOW_RUNG);
  assert.equal(SHADOW_RUNG, 0.84);
  // admissible for every rendered status...
  const table = liveReaderTable();
  for (const st of RENDERED_STATUSES) {
    assert.equal(
      nearestStatus(deliveredColour(STATUS_TOKENS[st]!.top[0]!, SHADOW_RUNG), table),
      st,
      `${st} does not survive the shadow rung`,
    );
  }
  // ...and ONE STEP DEEPER IS NOT. Without this the test would pass for any cautiously
  // shallow number, and "we picked something safe" is not the same claim as "this is the
  // deepest a shadow may go", which is the claim the increment owes.
  const deeper = Math.round((SHADOW_RUNG - 0.01) * 10000) / 10000;
  const fails = RENDERED_STATUSES.filter(
    (st) => nearestStatus(deliveredColour(STATUS_TOKENS[st]!.top[0]!, deeper), table) !== st,
  );
  assert.ok(fails.length > 0, `${deeper} is also admissible — the ceiling is not where it says`);
  assert.deepEqual(fails, ['unknown'], 'unknown is the binding status');
});

test('the per-status ceilings differ by a factor of ~1.3, which is why ONE ladder binds hard', () => {
  const ceilings = liveCeilings();
  const byStatus = Object.fromEntries(ceilings.map((c) => [c.status, c.absolute]));
  // healthy can go far deeper than unknown can. A per-status ladder is therefore POSSIBLE —
  // and it would make the shadow's own depth a status signal, which is the trade the
  // increment records rather than takes.
  assert.ok(byStatus['healthy']! < byStatus['unknown']! - 0.15, JSON.stringify(byStatus));
  assert.ok(byStatus['unknown']! > 0.84 && byStatus['unknown']! < 0.85);
});

test('the ladder SPAN is wider than the gaps between statuses — the structural reason', () => {
  // Reported for the intuition, never as the verdict (see `luma`). Ordinal and unтunable:
  // the four rendered statuses are ordered along luminance, and the ladder steps further
  // than they are apart.
  const lums = RENDERED_STATUSES.map((st) => luma(parseHex(STATUS_TOKENS[st]!.top[0]!))).sort(
    (a, b) => a - b,
  );
  const gaps = lums.slice(1).map((l, i) => l - lums[i]!);
  const smallestGap = Math.min(...gaps);
  const healthyLuma = luma(parseHex(STATUS_TOKENS['healthy']!.top[0]!));
  const span = healthyLuma * (1 - SHADE_LEVELS[0]!);
  const oneStep = healthyLuma * (FLAT_GROUND_LEVEL - 0.8);
  assert.ok(span > smallestGap * 4, `span ${span} vs smallest gap ${smallestGap}`);
  assert.ok(oneStep > smallestGap * 2, `one step ${oneStep} vs smallest gap ${smallestGap}`);
});

test('SHADOW_LADDER extends the authored ladder by exactly one level, and stays sorted', () => {
  assert.equal(SHADOW_LADDER.length, SHADE_LEVELS.length + 1);
  for (const level of SHADE_LEVELS) assert.ok(SHADOW_LADDER.includes(level));
  assert.deepEqual([...SHADOW_LADDER], [...SHADOW_LADDER].sort((a, b) => a - b));
  assert.equal(SHADOW_LADDER[SHADOW_RUNG_INDEX], SHADOW_RUNG);
  // The shadow rung is NOT reachable by lighting — `bandShade` still quantises onto
  // SHADE_LEVELS, so no normal can land a pixel there and only the shadow term can.
  assert.ok(!SHADE_LEVELS.includes(SHADOW_RUNG));
});

test('THE PALETTE COST, as a number: one rung, one entry per land token, nothing displaced', () => {
  const before = landPalette();
  const after = landPaletteWithShadow();
  // The cost is ONE ENTRY PER AUTHORED LAND TOKEN, by construction — so it is stated as that
  // identity rather than as a literal that goes stale the next time the land grows a prop.
  // (It did, mid-flight: the story tree's crown and bole and the UAT flower materials landed
  // on `main` while this pass was measuring, taking the closure from 104 to 156.)
  assert.equal(after.length - before.length, landTokens().length);
  // 2026-08-21: the land grew props (ADR-0406), which is the case the comment above
  // anticipated. The eighteen `PROP_TOKENS` took the closure from 156 to 228 and the shadowed
  // closure from 195 to 285. The IDENTITY above is what actually holds the cost; these two
  // literals are the witness that the growth was the one we authored and not a colour that
  // arrived by another route.
  assert.equal(before.length, 228);
  assert.equal(after.length, 285);
  // A STRICT SUPERSET WITH AN IDENTITY ON EVERY OLD ENTRY — the same property PR #1385
  // asserted of its 506-entry closure over the shipped 132. Without it, "we added 26
  // entries" could hide "and moved four of the ones already there".
  for (const hex of before) assert.ok(after.includes(hex), `${hex} lost from the palette`);
});

test('the shadow ramp is still (authored token x authored level) — the closure is untouched', () => {
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.wheat, fam.side]) {
      const ramp = shadowRamp(token);
      assert.equal(ramp.length, SHADOW_LADDER.length);
      ramp.forEach((c, i) => {
        assert.equal(toHex(c), toHex(deliveredColour(token, SHADOW_LADDER[i]!)));
      });
    }
  }
});

test('a shadow only DARKENS: the rungs it may move are those lighter than it', () => {
  const darkenable = rungsAShadowDarkens();
  assert.ok(darkenable.length > 0, 'a shadow that can darken nothing is not a shadow');
  for (const i of darkenable) assert.ok(SHADE_LEVELS[i]! > SHADOW_RUNG);
  for (let i = 0; i < SHADE_LEVELS.length; i++) {
    if (!darkenable.includes(i)) assert.ok(SHADE_LEVELS[i]! < SHADOW_RUNG);
  }
  // The consequence worth knowing: relief's own dark rungs are BELOW the shadow rung, so a
  // shadow falling on an already-shaded slope leaves it alone.
  assert.deepEqual(darkenable, [2, 3]);
});

test('WHY THE SHIPPED INSTRUMENT CANNOT ANSWER THIS — statusFamilyOf is vacuous here', () => {
  // Pinned so a later reader cannot mistake `capture.mjs`'s standing "0 foreign-status
  // reads" for an answer to the confusability question. Every colour the SHIPPED ladder can
  // deliver is a member of its own token's image, at every rung, by construction — including
  // the two rungs the reader model calls foreign.
  let mismatches = 0;
  for (const st of RENDERED_STATUSES) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.side]) {
      for (const level of SHADE_LEVELS) {
        if (statusFamilyOf(deliveredColour(token, level)) !== st) mismatches++;
      }
    }
  }
  assert.equal(mismatches, 0, 'exact membership holds at every rung — which is exactly the point');
  // ...while the reader model says five of those same (status, rung) pairs are foreign. The
  // two instruments disagree, they are both right, and they answer different questions.
  assert.equal(ladderAdmissibility(SHADE_LEVELS).filter((v) => !v.admissible).length, 5);
});

test('the shadow rung needs a shadow-AWARE family test, or the capture would cry wolf', () => {
  // `statusFamilyOf` searches `SHADE_LEVELS` only, so it finds a shadowed pixel in no token's
  // image and reports `null` — which `capture.mjs` counts as a foreign-status read. All 26
  // shadow entries would report foreign the moment a shadow was drawn.
  const shadowed = deliveredColour(STATUS_TOKENS['healthy']!.top[0]!, SHADOW_RUNG);
  assert.equal(statusFamilyOf(shadowed), null, 'the OLD instrument cannot see the shadow rung');
  assert.equal(familyOnShadowLadder(shadowed), 'healthy', 'the shadow-aware one can');
  // and it is not simply permissive: a colour on no ladder at all is still nobody's.
  assert.equal(familyOnShadowLadder({ r: 1, g: 2, b: 3 }), null);
  // every entry of the shadowed palette belongs to somebody or is the shared wheat override
  let orphans = 0;
  for (const st of RENDERED_STATUSES) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.side]) {
      for (const level of SHADOW_LADDER) {
        if (familyOnShadowLadder(deliveredColour(token, level)) !== st) orphans++;
      }
    }
  }
  assert.equal(orphans, 0);
});

test('THE OVERCLAIM THIS SPLIT CAUGHT: healthy@1.00 is the reader talking, not the island', () => {
  // Against the live renderer's own one-token reader, `healthy` at full light reads
  // `unknown` — and the island delivers two million pixels of exactly that colour, so
  // reporting it as a foreign read would have been this pass's headline number.
  const narrow = liveReaderTable();
  const healthyLit = deliveredColour(STATUS_TOKENS['healthy']!.top[0]!, 1.0);
  assert.equal(nearestStatus(healthyLit, narrow), 'unknown');
  // It disappears the moment the reader's table carries the three authored ground variants,
  // so it is a property of the REFERENCE SET, not of the colours the island draws.
  const wide = readerStatusTable({ statuses: RENDERED_STATUSES, rung: FLAT_GROUND_LEVEL });
  assert.equal(nearestStatus(healthyLit, wide), 'healthy');
  // The robust set is what survives both — three verdicts, all DOWNWARD, which is the
  // direction a shadow moves and the one ADR-0367 D5 is about.
  const robust = robustlyInadmissible().map((v) => `${v.status}@${v.level}->${v.readsAs}`);
  assert.deepEqual(robust.sort(), [
    'proposed@0.78->mapped',
    'unknown@0.78->healthy',
    'unknown@0.8->healthy',
  ]);
  assert.ok(!robust.some((r) => r.startsWith('healthy@')));
});

test('THE PARAMETER-FREE CORE: every status pair overlaps in delivered luminance', () => {
  // No reader model can argue with this one. `mapped` at its lit rung is darker than
  // `healthy` at its darkest; `unknown`'s two dark rungs bracket `healthy`'s lit one.
  const { ranges, overlaps } = luminanceOverlap();
  assert.equal(ranges.length, RENDERED_STATUSES.length);
  const pairs = (RENDERED_STATUSES.length * (RENDERED_STATUSES.length - 1)) / 2;
  assert.equal(overlaps.length, pairs, 'some pair separates by luminance alone — check which');
  // The consequence: no re-anchoring WITHIN the luminance ordering can fix the collisions,
  // because there is no ordering left to re-anchor. What separates the statuses is HUE.
  const worst = overlaps.reduce((m, o) => (o.luma > m.luma ? o : m));
  assert.ok(worst.luma > 30, `widest overlap is only ${worst.luma} luma`);
});
