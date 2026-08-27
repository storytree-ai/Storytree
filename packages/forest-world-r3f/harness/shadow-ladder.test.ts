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
  paletteImageOfToken,
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
import { LEGACY_STATUS_TOKENS } from './status-vocabulary.js';

const ALL_SIX = [...STATUS_TOKENS.keys()].sort();

/** `safe_depth` of a status's ground token against a given reader table, rounded the way the
 *  recorded numbers are printed. */
function ceiling(
  status: string,
  table: Record<string, { r: number; g: number; b: number }[]>,
  tokens: ReadonlyMap<string, { top: readonly string[]; wheat: string; side: string }> = STATUS_TOKENS,
) {
  return safeDepth(parseHex(tokens.get(status)!.top[0]!), table).deepest;
}

// ---------------------------------------------------------------------------
// THE PORT'S PROVENANCE — pinned to the palette the recorded figures were measured on
// ---------------------------------------------------------------------------
//
// ⚠⚠ THE THREE TESTS BELOW READ `LEGACY_STATUS_TOKENS`, NOT THE LIVE PALETTE, AND THAT IS THE
// WHOLE POINT OF THEM. Their job is to prove this module is the SAME instrument as the
// compositor's `shadow.py` by reproducing three independently recorded configurations of the
// ceiling. Those figures were measured in August 2026 against the palette as it then stood.
// ADR-0462 has since moved `unknown` off the base grass family and merged `building` into
// `proposed`, so a reproduction pointed at the live table would reproduce nothing — it would
// simply recompute today's numbers and assert them against yesterday's, and the only honest
// way to keep it green would be to overwrite the recorded figures with whatever the port now
// emits. At that moment the provenance evidence is gone and every test still passes, which is
// indistinguishable from a port that works.
//
// So the historical arm is frozen and the LIVE arm is separate, below. If the palette moves
// again, these three do not move with it.

test('THE PORT — reproduces PR #1385s ceilings: all six statuses, top faces, full light', () => {
  const table = readerStatusTable({ statuses: ALL_SIX, tokens: LEGACY_STATUS_TOKENS });
  assert.equal(ceiling('healthy', table, LEGACY_STATUS_TOKENS), 0.74);
  assert.equal(ceiling('mapped', table, LEGACY_STATUS_TOKENS), 0.76);
  assert.equal(ceiling('proposed', table, LEGACY_STATUS_TOKENS), 0.88);
  assert.equal(ceiling('unknown', table, LEGACY_STATUS_TOKENS), 0.91);
});

test('THE PORT — reproduces PR #1407s FOLDED ceilings: the four statuses worldStatus renders', () => {
  // The fold DROPS `unhealthy` and `building` from the reader's vocabulary rather than
  // merging their tokens: a reader cannot have learned a colour the app never draws. That
  // reading is what makes `mapped` bottom out at the floor — with nothing darker left in the
  // table, darkening it flips to nothing.
  const table = readerStatusTable({ statuses: RENDERED_STATUSES, tokens: LEGACY_STATUS_TOKENS });
  assert.equal(ceiling('healthy', table, LEGACY_STATUS_TOKENS), 0.67);
  assert.equal(ceiling('mapped', table, LEGACY_STATUS_TOKENS), 0.3, 'the floor: it never flips at all');
  assert.equal(ceiling('proposed', table, LEGACY_STATUS_TOKENS), 0.88);
  assert.equal(ceiling('unknown', table, LEGACY_STATUS_TOKENS), 0.91);
});

test('THE PORT — reproduces the COLLAPSED configuration: one token per status', () => {
  const table = readerStatusTable({ statuses: RENDERED_STATUSES, oneToken: true, tokens: LEGACY_STATUS_TOKENS });
  assert.equal(ceiling('unknown', table, LEGACY_STATUS_TOKENS), 0.94, 'the collapse moves the binding ceiling the WRONG way');
  assert.equal(ceiling('proposed', table, LEGACY_STATUS_TOKENS), 0.9);
  assert.equal(ceiling('healthy', table, LEGACY_STATUS_TOKENS), 0.72);
});

test('THE FROZEN TABLE IS FROZEN — the port would report different ceilings on the live palette', () => {
  // Without this, `tokens: LEGACY_STATUS_TOKENS` above could be deleted from all three tests
  // and they would go on passing IF the palette happened not to have moved — so the pin would
  // read as ceremony rather than as the thing holding the provenance up. It HAS moved, and the
  // ceiling that moved most is `unknown`'s, which is the binding one.
  const legacy = readerStatusTable({ statuses: RENDERED_STATUSES, oneToken: true, tokens: LEGACY_STATUS_TOKENS });
  const live = readerStatusTable({ statuses: RENDERED_STATUSES, oneToken: true });
  assert.notDeepEqual(legacy, live, 'the palette has not moved — this pin is proving nothing');
  assert.notEqual(
    ceiling('unknown', live),
    ceiling('unknown', legacy, LEGACY_STATUS_TOKENS),
    'the live and frozen palettes agree on unknown’s ceiling — check LEGACY_STATUS_TOKENS is still history',
  );
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
  assert.equal(nearestStatus(parseHex(STATUS_TOKENS.get('proposed')!.side), table), 'mapped');
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
    // DOWNWARD — the direction a shadow moves: `proposed`'s two dark rungs read `mapped`.
    // Unproven greenfield read as inherited brownfield. This pair is what survives ADR-0462
    // and it is the whole remaining scope of `pull-the-four-land-colours-apart-in-hue`.
    'proposed@0.78->mapped',
    'proposed@0.8->mapped',
  ].sort());

  // ⚠ THREE ENTRIES LEFT THIS LIST ON 2026-08-27 (ADR-0462) AND THEY ARE THE POINT OF THE
  // CHANGE, so they are recorded here rather than deleted. Until `unknown` was given its own
  // colour it kept the base grass family, four degrees of hue from `healthy`:
  //
  //     unknown@0.78->healthy   doubt painted as PROOF — the worst available direction
  //     unknown@0.8 ->healthy   (ADR-0367 D5, ADR-0226), and it fired on two rungs of four
  //     healthy@1   ->unknown   proof painted as doubt, on the rung relief actually delivers
  //
  // The frozen palette still produces all five, which is what makes the improvement a
  // measurement rather than a claim about the diff.
  const legacyTable = readerStatusTable({ statuses: RENDERED_STATUSES, rung: FLAT_GROUND_LEVEL, oneToken: true, tokens: LEGACY_STATUS_TOKENS });
  const legacyBad = RENDERED_STATUSES.flatMap((st) =>
    SHADE_LEVELS.map((level) => ({ st, level, readsAs: nearestStatus(deliveredColour(LEGACY_STATUS_TOKENS.get(st)!.top[0]!, level), legacyTable) })),
  ).filter((v) => v.readsAs !== v.st);
  assert.deepEqual(
    legacyBad.map((v) => `${v.st}@${v.level}->${v.readsAs}`).sort(),
    ['healthy@1->unknown', 'proposed@0.78->mapped', 'proposed@0.8->mapped', 'unknown@0.78->healthy', 'unknown@0.8->healthy'],
  );
  assert.ok(legacyBad.length > seen.length, 'ADR-0462 did not reduce the inadmissible set');
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
  // 0.84 until 2026-08-27. ADR-0462 moved the binding status from `unknown` to `proposed` and
  // the derived rung went DEEPER with it. The literal is the witness; `derived === SHADOW_RUNG`
  // above is the assertion, and it is what would catch the rung being typed rather than derived.
  assert.equal(SHADOW_RUNG, 0.81);
  // admissible for every rendered status...
  const table = liveReaderTable();
  for (const st of RENDERED_STATUSES) {
    assert.equal(
      nearestStatus(deliveredColour(STATUS_TOKENS.get(st)!.top[0]!, SHADOW_RUNG), table),
      st,
      `${st} does not survive the shadow rung`,
    );
  }
  // ...and ONE STEP DEEPER IS NOT. Without this the test would pass for any cautiously
  // shallow number, and "we picked something safe" is not the same claim as "this is the
  // deepest a shadow may go", which is the claim the increment owes.
  const deeper = Math.round((SHADOW_RUNG - 0.01) * 10000) / 10000;
  const fails = RENDERED_STATUSES.filter(
    (st) => nearestStatus(deliveredColour(STATUS_TOKENS.get(st)!.top[0]!, deeper), table) !== st,
  );
  assert.ok(fails.length > 0, `${deeper} is also admissible — the ceiling is not where it says`);
  // ⚠ THE BINDING STATUS MOVED FROM `unknown` TO `proposed` ON 2026-08-27 (ADR-0462), and the
  // rung went 0.84 -> 0.81 with it: a DEEPER shadow is now admissible, because the status that
  // used to bind was the one sitting four degrees of hue from `healthy` and it is no longer
  // there. Nothing about the shadow was retuned — the rung is derived, and it moved because
  // the palette under it did.
  assert.deepEqual(fails, ['proposed'], 'proposed is the binding status');
});

test('the per-status ceilings still differ enough that ONE ladder binds hard', () => {
  const ceilings = liveCeilings();
  const byStatus = Object.fromEntries(ceilings.map((c) => [c.status, c.absolute]));
  // A ceiling is the level at which a status flips, so the HIGHEST one binds the single
  // ladder and the lowest has the most room to spare. `mapped` never flips at all (it bottoms
  // out at the floor with nothing darker left in the table), so the spread that matters is
  // over the three that do. A per-status ladder is therefore still POSSIBLE — and it would
  // make the shadow's own depth a status signal, which is the trade the increment records
  // rather than takes.
  const flipping = ['healthy', 'unknown', 'proposed'].map((st) => byStatus[st]!);
  const binding = Math.max(...flipping);
  const roomiest = Math.min(...flipping);
  assert.equal(binding, byStatus['proposed'], JSON.stringify(byStatus));
  assert.ok(binding / roomiest > 1.2, `spread is only ${binding / roomiest}x — ${JSON.stringify(byStatus)}`);
  // ADR-0462 WIDENED the spread rather than narrowing it: 0.648 (healthy) .. 0.81 (proposed),
  // a factor of 1.25, against 0.67 .. 0.84 before. The shadow got deeper AND the argument for
  // one ladder is unchanged.
  assert.ok(byStatus['proposed']! > 0.8 && byStatus['proposed']! < 0.82);
});

test('the ladder SPAN is wider than the gaps between statuses — the structural reason', () => {
  // Reported for the intuition, never as the verdict (see `luma`). Ordinal and unтunable:
  // the four rendered statuses are ordered along luminance, and the ladder steps further
  // than they are apart.
  const lums = RENDERED_STATUSES.map((st) => luma(parseHex(STATUS_TOKENS.get(st)!.top[0]!))).sort(
    (a, b) => a - b,
  );
  const gaps = lums.slice(1).map((l, i) => l - lums[i]!);
  const smallestGap = Math.min(...gaps);
  const healthyLuma = luma(parseHex(STATUS_TOKENS.get('healthy')!.top[0]!));
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
  //
  // 2026-08-22: the hero tree was replaced by MANY SMALL TREES, which brought three canopy
  // tokens — 228 -> 240 lit, 285 -> 300 shadowed. Those three are the first SHADE-KEYED tokens
  // (`SHADE_KEYS`), and the identity above still holds for them: a keyed token delivers exactly
  // one colour per rung just as a multiplied one does, so the shadow still costs one entry per
  // land token. That is the property worth having, and it is why the identity is the assertion
  // and these two literals are only the witness.
  //
  // 2026-08-27 (ADR-0462): `building` stopped owning a ground family and now shares
  // `proposed`'s object, so FOUR authored tokens left `landTokens()` — 240 -> 224 lit,
  // 300 -> 280 shadowed. `unknown`'s four moved rather than changed in number, but one of them
  // NOW COUNTS where it did not before: its old flank `#87985f` was unique, its new one
  // `#70757e` is too, while the interim candidate `#6b7280` would have been free because a
  // crown already held it — which is precisely the collision it was rejected for. This is the
  // first time the closure has SHRUNK, and the strict-superset assertion below is deliberately
  // NOT relaxed for it: every entry the smaller lit palette still holds must still be in the
  // shadowed one. What a shrinking palette needs guarding is the OTHER direction, and the
  // identity `after - before === landTokens().length` is what does that.
  assert.equal(before.length, 224);
  assert.equal(after.length, 280);
  // A STRICT SUPERSET WITH AN IDENTITY ON EVERY OLD ENTRY — the same property PR #1385
  // asserted of its 506-entry closure over the shipped 132. Without it, "we added 26
  // entries" could hide "and moved four of the ones already there".
  for (const hex of before) assert.ok(after.includes(hex), `${hex} lost from the palette`);
});

test('the shadow ramp is still (authored token x authored level) — the closure is untouched', () => {
  for (const st of [...STATUS_TOKENS.keys()]) {
    const fam = STATUS_TOKENS.get(st)!;
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
  //
  // ⚠ MEMBERSHIP IS ASSERTED DIRECTLY, NOT THROUGH `statusFamilyOf`'S SEARCH, and the
  // distinction started mattering on 2026-08-27. That function returns the FIRST family
  // holding a colour, in map order, so it cannot disambiguate a hex two families genuinely
  // share — and ADR-0462 made `unknown`'s flank the app's `--st-unknown` slate `#6b7280`,
  // which `building`'s crown has always worn too (the app authors no `--crown-building-*`
  // pair, so it falls through to `unknown`'s). Asking the search would report `building` for
  // four of `unknown`'s own rungs and read as a collision. The CLAIM here was never about the
  // search's tie-break; it is that the delivered colour is in the instance's own token image.
  let mismatches = 0;
  for (const st of RENDERED_STATUSES) {
    const fam = STATUS_TOKENS.get(st)!;
    for (const token of [...fam.top, fam.side]) {
      const image = new Set(paletteImageOfToken(token).map(toHex));
      for (const level of SHADE_LEVELS) {
        if (!image.has(toHex(deliveredColour(token, level)))) mismatches++;
      }
    }
  }
  assert.equal(mismatches, 0, 'exact membership holds at every rung — which is exactly the point');
  // and the search really is the weaker instrument, not merely a different one: it reports a
  // family for every one of those colours too, so it can never be the thing that fails.
  for (const st of RENDERED_STATUSES) {
    const fam = STATUS_TOKENS.get(st)!;
    for (const level of SHADE_LEVELS) {
      assert.notEqual(statusFamilyOf(deliveredColour(fam.top[0]!, level)), null);
    }
  }
  // ...while the reader model says two of those same (status, rung) pairs are foreign. The
  // two instruments disagree, they are both right, and they answer different questions.
  assert.equal(ladderAdmissibility(SHADE_LEVELS).filter((v) => !v.admissible).length, 2);
});

test('the shadow rung needs a shadow-AWARE family test, or the capture would cry wolf', () => {
  // `statusFamilyOf` searches `SHADE_LEVELS` only, so it finds a shadowed pixel in no token's
  // image and reports `null` — which `capture.mjs` counts as a foreign-status read. All 26
  // shadow entries would report foreign the moment a shadow was drawn.
  const shadowed = deliveredColour(STATUS_TOKENS.get('healthy')!.top[0]!, SHADOW_RUNG);
  assert.equal(statusFamilyOf(shadowed), null, 'the OLD instrument cannot see the shadow rung');
  assert.equal(familyOnShadowLadder(shadowed), 'healthy', 'the shadow-aware one can');
  // and it is not simply permissive: a colour on no ladder at all is still nobody's.
  assert.equal(familyOnShadowLadder({ r: 1, g: 2, b: 3 }), null);
  // every entry of the shadowed palette belongs to SOMEBODY — never `null`, which is the only
  // value `capture.mjs` counts. WHICH family the search names is not asserted, for the reason
  // the membership test above records: `#6b7280` is worn by `unknown`'s flank and `building`'s
  // crown alike, so a first-match search must name one of the two and either answer is right.
  let orphans = 0;
  for (const st of RENDERED_STATUSES) {
    const fam = STATUS_TOKENS.get(st)!;
    for (const token of [...fam.top, fam.side]) {
      for (const level of SHADOW_LADDER) {
        if (familyOnShadowLadder(deliveredColour(token, level)) === null) orphans++;
      }
    }
  }
  assert.equal(orphans, 0);
});

test('THE OVERCLAIM THIS SPLIT CAUGHT: healthy@1.00 is the reader talking, not the island', () => {
  // ⚠ THIS ONE IS HISTORY NOW, AND IT IS KEPT BECAUSE THE LESSON OUTLIVES THE COLLISION.
  // ADR-0462 moved `unknown` to its own slate, and `healthy@1.00` no longer reads as anything
  // but `healthy` — asserted at the end of this test. What must not be lost is WHY the figure
  // was never quotable in the first place: a narrow reference set can manufacture a headline
  // foreign read out of a reference set rather than out of any pixel. Pointed at the frozen
  // palette, the trap is still demonstrable, and the next reader who widens or narrows a
  // reader table has the worked example in front of them.
  const narrow = readerStatusTable({ statuses: RENDERED_STATUSES, rung: FLAT_GROUND_LEVEL, oneToken: true, tokens: LEGACY_STATUS_TOKENS });
  const legacyHealthyLit = deliveredColour(LEGACY_STATUS_TOKENS.get('healthy')!.top[0]!, 1.0);
  assert.equal(nearestStatus(legacyHealthyLit, narrow), 'unknown');
  // It disappears the moment the reader's table carries the three authored ground variants,
  // so it is a property of the REFERENCE SET, not of the colours the island draws.
  const wide = readerStatusTable({ statuses: RENDERED_STATUSES, rung: FLAT_GROUND_LEVEL, tokens: LEGACY_STATUS_TOKENS });
  assert.equal(nearestStatus(legacyHealthyLit, wide), 'healthy');
  // ON THE LIVE PALETTE IT NO LONGER FIRES UNDER EITHER READER — the collision is gone rather
  // than merely re-described, which is the change ADR-0462 bought.
  const healthyLit = deliveredColour(STATUS_TOKENS.get('healthy')!.top[0]!, 1.0);
  assert.equal(nearestStatus(healthyLit, liveReaderTable()), 'healthy');
  assert.equal(nearestStatus(healthyLit, readerStatusTable({ statuses: RENDERED_STATUSES, rung: FLAT_GROUND_LEVEL })), 'healthy');
  // The robust set is what survives BOTH readers — the verdicts no choice of reference set can
  // argue away. It was three, all DOWNWARD; ADR-0462 took the two `unknown` ones out and left
  // ONE. That is the honest headline of this change: the map's remaining colour confusion is a
  // single pair on a single rung, and it is `pull-the-four-land-colours-apart-in-hue`'s.
  const robust = robustlyInadmissible().map((v) => `${v.status}@${v.level}->${v.readsAs}`);
  assert.deepEqual(robust.sort(), ['proposed@0.78->mapped']);
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
