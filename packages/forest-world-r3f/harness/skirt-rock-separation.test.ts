// skirt-rock-separation.test.ts — THE OBLIGATION THE SKIRT'S ROCK INHERITS BY BEING FAMILY-LESS.
//
// ⚠⚠ WHY THIS FILE IS IN `harness/` AND NOT BESIDE THE MODULE IT GUARDS. The rock lives in
// `src/stepped-skirt.ts`; the STATUS tokens it must not collide with live in `ForestWorldCanvas.tsx`,
// which imports React and three and cannot be pulled into a `node:test` file. `shipped-baseline.ts`
// already parses that map off the shipped file's own source as `SHIPPED_GROUND_COLOUR` — so the
// comparison can only be made here, against the transcription the gate already holds to the source.
//
// THE OBLIGATION ITSELF is `prop-tokens.test.ts`'s, applied to a new family-less token: no colour a
// decoration can deliver may be a colour a status family delivers (ADR-0406 D4). A cliff that
// delivered `unhealthy`'s exact pixel would be an ornament indistinguishable from a status read —
// the one thing the owner's own settlement still forbids, because his test is that the island's
// state stays READABLE.
//
// ⚠ THE OWNER MOVED THE FENCE AND DID NOT REMOVE IT. "Every ground colour is a report" is retired;
// "can I tell what state this island is in" replaced it. An exact collision is the one failure that
// answers that question NO by construction rather than by judgement, so it is the half of his test
// that a machine can hold — and the only half. The rest is the picture, and the picture is
// `docs/research/chapter2-shipped-skirt-2026-09-01/`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKIRT_ROCK,
  SKIRT_ROCK_LIT,
  SKIRT_ROCK_SHADED,
  rimEdgeKeys,
} from '../src/stepped-skirt.js';
import { SHIPPED_COAST, clipToCoast, edgeKey } from '../src/coast-clip.js';
import { SHIPPED_SHORE } from '../src/shore-fall.js';
import { shoreArmRingPlan } from '../src/shore-ring.js';
import { crowdCells, crowdSize } from './shipped-crowd-scene.js';
import { SHADE_LEVELS, deliveredForLevel, parseHex, toHex, type Rgb255 } from '../src/shade-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import {
  SKIRT_GROUND_TOKENS,
  SKIRT_ROCK_LIT_ROW,
  SKIRT_ROCK_ROW,
  SKIRT_ROCK_SHADED_ROW,
} from './shipped-skirt-scene.js';

/**
 * EVERY ROCK THIS MAP OR THIS PAGE CAN DRAW, and each is held to the whole obligation below.
 *
 * ⚠⚠ THREE, NOT ONE, SINCE 2026-09-01 — and the median is still here because it is still DRAWN:
 * it is the `rock` arm's token, i.e. the control the two-token cliff is measured against, so
 * retiring it from this check would stop guarding a colour the comparison page still paints. What
 * SHIPS is the pair.
 */
const ROCKS: readonly (readonly [string, string])[] = [
  ['the LIT rock (ships)', SKIRT_ROCK_LIT],
  ['the SHADED rock (ships)', SKIRT_ROCK_SHADED],
  ['the MEDIAN rock (the comparison page’s `rock` arm)', SKIRT_ROCK],
];

/** Every pixel a token can deliver on the shipped ladder. */
function ramp(token: string): Rgb255[] {
  return SHADE_LEVELS.map((level) => deliveredForLevel(token, level));
}

/** Rec.709 luma, the axis the research judged the island's dark anchor on. */
const luma = (c: Rgb255): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Euclidean distance in 8-bit RGB. Crude as a perceptual model and deliberately so: it is used
 *  here only to REPORT how much clearance the rock has, never to pass or fail. The pass/fail is the
 *  exact collision below, which needs no model at all. */
const rgbDistance = (a: Rgb255, b: Rgb255): number =>
  Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

test('⚠ NO ROCK LEDGE CAN EVER DELIVER A COLOUR A STATUS FAMILY DELIVERS', () => {
  const status = new Map<string, string>();
  for (const [name, token] of SHIPPED_GROUND_COLOUR) {
    for (const c of ramp(token)) status.set(toHex(c), `${name} (${token})`);
  }
  const collisions: string[] = [];
  for (const [what, token] of ROCKS) {
    for (const c of ramp(token)) {
      const hit = status.get(toHex(c));
      if (hit !== undefined) collisions.push(`${what} delivers ${toHex(c)}, which is ${hit}`);
    }
  }
  assert.deepEqual(
    collisions,
    [],
    'A cliff that delivers a status colour makes the island’s edge indistinguishable from a status ' +
      'read. Move the ROCK, never a status token — the statuses are decided (ADR-0462) and the rocks ' +
      'are measurements that may be re-taken.',
  );
});

test('⚠ THE THREE ROCKS ARE DISTINCT HEXES — the ramp table indexes them by identity', () => {
  // `shipped-skirt-scene.ts` resolves each rock's ramp row with `indexOf`, which is exact only if
  // no two rocks share a hex. Two equal tokens would silently give both the FIRST one's row, so an
  // arm asking for the shaded rock would be handed the lit one's colour — and the page would
  // report a null result for a component it never drew.
  const hexes = ROCKS.map(([, token]) => token);
  assert.equal(new Set(hexes).size, hexes.length, `two rocks share a hex: ${hexes.join(', ')}`);
});

test('every rock’s nearest status neighbour is named and its clearance is reported', () => {
  for (const [what, token] of ROCKS) {
    let nearest = { status: '', d: Number.POSITIVE_INFINITY, rock: '', status_: '' };
    for (const [name, statusToken] of SHIPPED_GROUND_COLOUR) {
      for (const s of ramp(statusToken)) {
        for (const r of ramp(token)) {
          const d = rgbDistance(r, s);
          if (d < nearest.d) nearest = { status: name, d, rock: toHex(r), status_: toHex(s) };
        }
      }
    }
    // ⚠ THIS ASSERTS A FLOOR, NOT A TARGET, and the floor is low on purpose. Every rock here is
    // a statistic of the APPROVED RENDER'S OWN skirt pixels rather than a hue chosen for distance,
    // so a tight bar would be this test overruling the picture the owner stamped. What it forbids
    // is a rock drifting to within a rounding of a status — which no measurement would ever
    // produce and a careless edit would.
    assert.ok(
      nearest.d > 8,
      `${what}'s nearest status pixel is ${nearest.status} at distance ${nearest.d.toFixed(1)} ` +
        `(${nearest.rock} vs ${nearest.status_})`,
    );
    console.log(
      `skirt rock clearance: ${what} — nearest status is ${nearest.status} at RGB distance ` +
        `${nearest.d.toFixed(1)} (${nearest.rock} vs ${nearest.status_})`,
    );
  }
});

test('⚠ THE PAIR CLEARS THE STATUSES BY MORE THAN THE SINGLE ROCK EVER DID', () => {
  // ⚠⚠ THIS IS THE HALF OF THE OWNER'S OUTCOME TEST A MACHINE CAN HOLD, ASKED OF THE
  // CHANGE RATHER THAN OF THE STATE. A second family-less colour reads at first glance as a second
  // chance to be mistaken for a status. It is the opposite here, and the reason is arithmetic: the
  // median rock sits INSIDE `unhealthy`'s own luma band (62.1–77.1 against 67.1–83.9),
  // which is why the skirt's evidence page recorded its 9.0 clearance as "the one place this is
  // tight". Splitting the mask at its own median moves BOTH halves out of that band. If a later
  // edit ever narrows the pair back toward the single rock's clearance, this fails and says so.
  const clearance = (token: string): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const [, statusToken] of SHIPPED_GROUND_COLOUR) {
      for (const s of ramp(statusToken)) {
        for (const r of ramp(token)) best = Math.min(best, rgbDistance(r, s));
      }
    }
    return best;
  };
  const median = clearance(SKIRT_ROCK);
  for (const token of [SKIRT_ROCK_LIT, SKIRT_ROCK_SHADED]) {
    assert.ok(
      clearance(token) > median,
      `${token} clears the statuses by ${clearance(token).toFixed(1)}, no better than the single ` +
        `rock's ${median.toFixed(1)} — the pair is meant to buy separation, not spend it`,
    );
  }
  console.log(
    `skirt pair clearance: single ${median.toFixed(1)} → lit ` +
      `${clearance(SKIRT_ROCK_LIT).toFixed(1)} / shaded ${clearance(SKIRT_ROCK_SHADED).toFixed(1)}`,
  );
});

test('the rock is DARKER than every status the map can draw — it is the island’s anchor', () => {
  // The research's finding in one assertion: the cliff supplies the island's darkest value, and a
  // pale skirt spends it. If a status token were ever authored darker than the rock, the cliff
  // would stop being the anchor and this component's whole justification would have moved.
  //
  // ⚠ THE ANCHOR IS THE DARKEST PIXEL THE CLIFF CAN DELIVER, so it is the minimum over the
  // WHOLE pair rather than over one token. The LIT rock is deliberately NOT the anchor — it is
  // lighter than `unhealthy` — and asking each token separately would fail on a true statement.
  const darkestRock = Math.min(...ROCKS.flatMap(([, t]) => ramp(t).map(luma)));
  for (const [name, token] of SHIPPED_GROUND_COLOUR) {
    const darkestStatus = Math.min(...ramp(token).map(luma));
    if (name === 'unhealthy') {
      // ⚠ `unhealthy` IS THE CLOSE ONE AND IT IS NAMED RATHER THAN LUMPED IN. ADR-0470 settled it
      // as a charred near-black, so it is the one family the rock cannot be much darker than. The
      // clearance is asserted as a real gap rather than as an ordering, so a token edit that
      // narrowed it to nothing fails here instead of on the map.
      assert.ok(
        darkestStatus - darkestRock > 3,
        `unhealthy's darkest pixel (${darkestStatus.toFixed(1)}) sits within 3 luma of the rock's ` +
          `(${darkestRock.toFixed(1)}) — the cliff and a dead island's ground now read alike`,
      );
      continue;
    }
    assert.ok(
      darkestStatus > darkestRock,
      `${name} can deliver a pixel darker than the rock, so the cliff is not the island's anchor`,
    );
  }
});

test('the rocks are APPENDED rows, so no status was renumbered to make room for them', () => {
  // ⚠ THE CLAIM IS "NO STATUS MOVED", NOT "THE ROCK IS LAST". It was spelled as the second when
  // there was one rock and the two were the same sentence; they are not the same sentence with
  // three. Row `i` is what a vertex carrying `statusIndex === i` wears, so a status that changed
  // row paints every parcel a DIFFERENT status's colour — which is the failure this guards, and it
  // is indifferent to how many family-less tokens sit past the end.
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_ROW], SKIRT_ROCK);
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_LIT_ROW], SKIRT_ROCK_LIT);
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_SHADED_ROW], SKIRT_ROCK_SHADED);
  const statuses = [...SHIPPED_GROUND_COLOUR.values()];
  for (let i = 0; i < statuses.length; i += 1) {
    assert.equal(SKIRT_GROUND_TOKENS[i], statuses[i], `status row ${i} moved`);
  }
  // and every rock sits PAST the statuses rather than among them
  for (const row of [SKIRT_ROCK_ROW, SKIRT_ROCK_LIT_ROW, SKIRT_ROCK_SHADED_ROW]) {
    assert.ok(row >= statuses.length, `a rock took row ${row}, which a status owns`);
  }
});

test('the rocks parse to the measured statistics of the approved render’s own skirt pixels', () => {
  // ⚠⚠ THIS IS THE WHOLE PROVENANCE CLAIM IN THREE LINES, and it is the one thing about these
  // tokens that cannot be re-derived from anything else in the repository. The mask is the set of
  // pixels where `land-combined-1948px.png` and `land-strata-1948px.png` differ — the same render
  // differing in NOTHING but the skirt material, so the mask IS the skirt, exactly. Over those
  // 76,297 pixels: the median is what shipped on 2026-09-01, and the two quartiles are the median
  // of its shaded half and the median of its lit half. If a later session re-takes the measurement
  // it must move these numbers here, where the claim is written down, rather than only the hexes.
  assert.deepEqual(parseHex(SKIRT_ROCK), { r: 77, g: 77, b: 79 });
  assert.deepEqual(parseHex(SKIRT_ROCK_SHADED), { r: 29, g: 32, b: 37 });
  assert.deepEqual(parseHex(SKIRT_ROCK_LIT), { r: 115, g: 114, b: 116 });
  // and they are ordered, which is what makes "lit" and "shaded" the right names for them
  assert.ok(luma(parseHex(SKIRT_ROCK_SHADED)) < luma(parseHex(SKIRT_ROCK)));
  assert.ok(luma(parseHex(SKIRT_ROCK)) < luma(parseHex(SKIRT_ROCK_LIT)));
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// AND THE ONE THAT GUARDS THE SEAM BETWEEN THIS COMPONENT AND ITS NEIGHBOUR.

test('⚠ every rim edge the geometry WALKS is a rim edge the census MARKS', () => {
  // ⚠⚠ THE FAILURE THIS FORBIDS IS SILENT AND LOOKS LIKE ART. The rim census is taken over the
  // parcels' own rings; the wall loop walks the ring `decompose` produces. Those are the same loop
  // today only because the inset ring (PR #1780) inserts its points on INTERIOR edges — it is an
  // INSET ring, inside the coast rather than on it. A decomposition that inserted a point on a RIM
  // edge would split it into two sub-edges whose keys are in neither census, so both halves would
  // silently take the FLAT wall: a length of coast with no cliff, in the middle of a cliff, which
  // reads as a modelling choice rather than as a bug.
  //
  // Measured on the shipped fixture when this was written: 864 parcel-ring edges, 970 wall-ring
  // edges (106 inserted), and 260 rim edges by BOTH routes.
  const clipped = clipToCoast(crowdCells(crowdSize('one')), SHIPPED_COAST);
  const plan = shoreArmRingPlan(clipped, SHIPPED_SHORE);
  const fromCells = rimEdgeKeys(clipped);

  const uses = new Map<string, number>();
  for (const c of clipped) {
    const wall = plan.decompose(c).wall;
    if (wall.length < 3) continue;
    for (let i = 0; i < wall.length; i += 1) {
      const k = edgeKey(wall[i]!, wall[(i + 1) % wall.length]!);
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  const fromWalls = new Set([...uses].filter(([, n]) => n === 1).map(([k]) => k));

  assert.ok(fromCells.size > 0, 'the fixture has no rim at all — the check would be vacuous');
  assert.deepEqual(
    [...fromWalls].filter((k) => !fromCells.has(k)).sort(),
    [],
    'the decomposition produced boundary edges the rim census does not know about, so that stretch ' +
      'of coast will take the flat wall while its neighbours take the cliff. Build the census over ' +
      'the WALL rings rather than over the parcels’ own rings.',
  );
  assert.equal(fromWalls.size, fromCells.size);
});
