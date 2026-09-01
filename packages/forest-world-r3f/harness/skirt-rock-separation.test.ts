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

import { SKIRT_ROCK, rimEdgeKeys } from '../src/stepped-skirt.js';
import { SHIPPED_COAST, clipToCoast, edgeKey } from '../src/coast-clip.js';
import { SHIPPED_SHORE } from '../src/shore-fall.js';
import { shoreArmRingPlan } from '../src/shore-ring.js';
import { crowdCells, crowdSize } from './shipped-crowd-scene.js';
import { SHADE_LEVELS, deliveredForLevel, parseHex, toHex, type Rgb255 } from '../src/shade-ladder.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';
import { SKIRT_GROUND_TOKENS, SKIRT_ROCK_ROW } from './shipped-skirt-scene.js';

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
  for (const c of ramp(SKIRT_ROCK)) {
    const hit = status.get(toHex(c));
    if (hit !== undefined) collisions.push(`the rock delivers ${toHex(c)}, which is ${hit}`);
  }
  assert.deepEqual(
    collisions,
    [],
    'A cliff that delivers a status colour makes the island’s edge indistinguishable from a status ' +
      'read. Move the ROCK, never a status token — the statuses are decided (ADR-0462) and the rock ' +
      'is a measurement that may be re-taken.',
  );
});

test('the rock’s nearest status neighbour is named and its clearance is reported', () => {
  const rock = ramp(SKIRT_ROCK);
  let nearest = { status: '', d: Number.POSITIVE_INFINITY, rock: '', status_: '' };
  for (const [name, token] of SHIPPED_GROUND_COLOUR) {
    for (const s of ramp(token)) {
      for (const r of rock) {
        const d = rgbDistance(r, s);
        if (d < nearest.d) nearest = { status: name, d, rock: toHex(r), status_: toHex(s) };
      }
    }
  }
  // ⚠ THIS ASSERTS A FLOOR, NOT A TARGET, and the floor is low on purpose. The rock is the APPROVED
  // RENDER'S OWN median skirt colour rather than a hue chosen for distance, so a tight bar here
  // would be this test overruling the picture the owner stamped. What it forbids is the rock
  // drifting to within a rounding of a status — which no measurement would ever produce and a
  // careless edit would.
  assert.ok(
    nearest.d > 8,
    `the rock's nearest status pixel is ${nearest.status} at distance ${nearest.d.toFixed(1)} ` +
      `(${nearest.rock} vs ${nearest.status_})`,
  );
  console.log(
    `skirt rock clearance: nearest status is ${nearest.status} at RGB distance ` +
      `${nearest.d.toFixed(1)} (${nearest.rock} vs ${nearest.status_})`,
  );
});

test('the rock is DARKER than every status the map can draw — it is the island’s anchor', () => {
  // The research's finding in one assertion: the cliff supplies the island's darkest value, and a
  // pale skirt spends it. If a status token were ever authored darker than the rock, the cliff
  // would stop being the anchor and this component's whole justification would have moved.
  const darkestRock = Math.min(...ramp(SKIRT_ROCK).map(luma));
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

test('the rock is the LAST ramp row, so no status was renumbered to make room for it', () => {
  assert.equal(SKIRT_GROUND_TOKENS[SKIRT_ROCK_ROW], SKIRT_ROCK);
  assert.equal(SKIRT_ROCK_ROW, SKIRT_GROUND_TOKENS.length - 1);
  // every status keeps the row its own insertion order gives it
  const statuses = [...SHIPPED_GROUND_COLOUR.values()];
  for (let i = 0; i < statuses.length; i += 1) {
    assert.equal(SKIRT_GROUND_TOKENS[i], statuses[i], `status row ${i} moved`);
  }
});

test('the rock parses to the measured median of the approved render’s own skirt pixels', () => {
  assert.deepEqual(parseHex(SKIRT_ROCK), { r: 77, g: 77, b: 79 });
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
