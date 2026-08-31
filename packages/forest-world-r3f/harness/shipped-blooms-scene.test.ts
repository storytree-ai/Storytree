// shipped-blooms-scene.test.ts — the bloom comparison's own arithmetic, without a GPU.
//
// ⚠ THE PICTURES ON THAT PAGE ARE NOT THE PROOF. A flower says nothing about whose signature it
// is, so what the driver refuses on is the CENSUS — and a census is only worth refusing on if it
// can come out non-zero. These tests hold both halves: the attributed arm misattributes NOTHING,
// and the scattered arm misattributes a LOT. Either one alone is satisfied by a census that
// counted nothing at all.

import assert from 'node:assert/strict';
import test from 'node:test';

import { KIT_FOOTPRINTS_2026_08_29 } from '../src/kit-vocabulary.js';
import { signedCriteriaByIsland } from '../src/map-dressing.js';
import { bloomCensus, bloomPlacements } from './shipped-blooms-scene.js';
import {
  crowdBlooms,
  crowdCells,
  crowdDescriptors,
  crowdIslandId,
  crowdSize,
} from './shipped-crowd-scene.js';

const FOOT = KIT_FOOTPRINTS_2026_08_29;
const FOREST = crowdSize('forest');

/**
 * GROUND IS NOT A SIGNATURE — asserted here, in the HARNESS suite, as well as beside the function.
 *
 * ⚠⚠ THE DUPLICATION IS FOR `check:mutation-diff`'s ATTRIBUTION, and it is worth stating exactly
 * because the obvious explanation is wrong. Mutate `signedCriteriaByIsland`'s
 * `d.kind !== 'uat-bloom'` filter either way and every `cell-ground` descriptor becomes a signature
 * — 164 per island across 35 islands — so the dressing places ~6,300 objects instead of 584. That
 * is a real, loud difference and several tests catch it. It is also NOT a hang: measured on this
 * fixture, the honest dressing takes 38 ms and the inflated one 803 ms, so §3's slow-suite/timeout
 * shape is RULED OUT rather than assumed.
 *
 * What actually happened: CI's Bun reporter could resolve NO failing test name to a dry-run id for
 * these two mutants — three runs, the same two, `killedBy` empty, which constraint 4 scores
 * UNPROVEN — while the identical local run reported all 73 killed with a named killer each. Adding
 * six more assertions in the SAME src-side file changed nothing, which is what points at the file's
 * names rather than at the assertions. So the witness is repeated HERE, in a different suite, and
 * called as the first statement of every test that dresses.
 */
function assertSignatureCountIsSane(): void {
  const signed = signedCriteriaByIsland(crowdDescriptors(FOREST));
  const total = [...signed.values()].reduce((a, b) => a + b, 0);
  assert.equal(
    total,
    crowdBlooms(FOREST).length,
    'the map counted something other than its signatures — ground has leaked into the count',
  );
}

test('NON-VACUITY: the crowd holds many stories, and they do NOT share one id', () => {
  // ⚠ Before 2026-08-31 they did, because the descriptor stream carried no island at all — so
  // thirty-five copies of one island's cells were thirty-five copies of ONE story, and any
  // per-story reading taken off this crowd would have been wrong in the direction that looks fine.
  const islands = new Set(crowdCells(FOREST).map((c) => c.island));
  assert.equal(islands.size, FOREST.islands, `${islands.size} distinct stories on ${FOREST.islands} islands`);
  assert.ok(islands.has(crowdIslandId(0)), 'the ids are the crowd id rule, not something else');
});

test('the forest holds stories that signed everything AND stories that signed nothing', () => {
  // ⚠⚠ THE PROPERTY THE WHOLE COMPARISON RESTS ON. A crowd where every story signed all ten draws
  // the same flowers under either dressing, so the page would picture a difference that is not
  // there — and would keep passing while the fix was reverted. The mix comes from the fixture's
  // own rule: a criterion defaults to `proven` on a HEALTHY island and `pending` on any other,
  // because a story's status IS its own signed UAT verdict (ADR-0033 d.4).
  const perIsland = new Map<string, number>();
  for (const island of crowdCells(FOREST)) {
    if (island.island !== undefined) perIsland.set(island.island, 0);
  }
  for (const bloom of crowdBlooms(FOREST)) {
    if (bloom.island !== undefined) perIsland.set(bloom.island, (perIsland.get(bloom.island) ?? 0) + 1);
  }
  const counts = [...perIsland.values()];
  assert.ok(
    counts.some((n) => n > 0),
    'no story in this forest has signed anything',
  );
  assert.ok(
    counts.some((n) => n === 0),
    'every story in this forest has signed something — a misattribution could not show',
  );
});

test('every bloom descriptor names a story AND a criterion, and no criterion is named twice', () => {
  const blooms = crowdBlooms(FOREST);
  assert.ok(blooms.length > 0);
  const ids = new Set<string>();
  for (const bloom of blooms) {
    assert.equal(bloom.kind, 'uat-bloom');
    assert.equal(typeof bloom.island, 'string', 'a signature with no story');
    assert.equal(typeof bloom.criterion, 'string', 'a signature with no criterion');
    ids.add(bloom.criterion!);
  }
  // ⚠ The crowd is ONE island copied N times, so the fixture's criterion ids repeat unless the
  // island id is folded in. Two stories sharing a criterion id would collapse in any dedupe.
  assert.equal(ids.size, blooms.length, 'two stories share a criterion id');
});

test('⚠⚠ THE ATTRIBUTED ARM MISATTRIBUTES NOTHING, and draws every signature the scene holds', () => {
  assertSignatureCountIsSane();
  const census = bloomCensus(FOOT, 'attributed');
  assert.equal(census.misattributed, 0, 'a flower stood on a story that did not sign it');
  assert.equal(census.undrawn, 0, 'a signature the map holds and does not draw');
  assert.equal(census.drawn, census.signed);
  assert.equal(census.unsignedIslandsWearingFlowers, 0);
});

test('⚠⚠ THE SCATTERED ARM MISATTRIBUTES A LOT — which is what the fix bought', () => {
  assertSignatureCountIsSane();
  // The same count, spent through ONE whole-map dressing call. This is the mistake the pinned
  // `blooms: 0` was standing in for, and a page that could not show it would be picturing nothing.
  const census = bloomCensus(FOOT, 'scattered');
  assert.equal(census.drawn, census.signed, 'the same number of flowers, in the wrong places');
  assert.ok(census.misattributed > 0, 'the scattered arm misattributed nothing');
  assert.ok(
    census.unsignedIslandsWearingFlowers > 0,
    'the scattered arm put no flower on a story that signed nothing — the sharp end of the defect',
  );
});

test('the `none` arm is the honest under-report the map actually shipped', () => {
  assertSignatureCountIsSane();
  const census = bloomCensus(FOOT, 'none');
  assert.equal(census.drawn, 0, 'the pinned count drew a flower');
  assert.equal(census.misattributed, 0, 'drawing nothing can misattribute nothing');
  assert.equal(census.undrawn, census.signed, 'every signature undrawn — which is what zero means');
});

test('⚠ every arm stands the SAME capabilities — the population is a confound, and it is held', () => {
  assertSignatureCountIsSane();
  // ⚠⚠ THE CONFOUND CHECK, and it is what makes the page a comparison rather than a picture of
  // two different maps. It caught a real one: the crowd is one fixture island copied N times, so
  // until `crowdCells` re-stamped its capability ids per island all thirty-five wore the SAME
  // eleven capIds, and the whole-map call stood eleven objects on a thirty-five-island forest. The
  // page would then have differed by 374 trees, and that difference would have been the FIXTURE's.
  const trees = (dressing: 'none' | 'scattered' | 'attributed') =>
    bloomPlacements(FOOT, dressing)
      .filter((p) => p.role !== 'bloom')
      .map((p) => p.capId)
      .sort();
  const none = trees('none');
  assert.ok(none.length > 300, `only ${none.length} objects on a ${FOREST.islands}-island forest`);
  assert.deepEqual(trees('attributed'), none, 'the arms stand objects for different capabilities');
  assert.deepEqual(trees('scattered'), none, 'the arms stand objects for different capabilities');
});

test('⚠ the per-island dressing MOVES the trees too, and that is the same change, not a second one', () => {
  assertSignatureCountIsSane();
  // ⚠ SAID OUT LOUD RATHER THAN GLOSSED, because the page's captions must not claim more than is
  // true. `dressIslandFromKit` seeds each placement from the capability's INDEX in the list it was
  // given, so a whole-map call numbers island 12's capabilities from 132 and a per-island call
  // numbers them from 0. Same capabilities, same count, same parcels — different spot inside the
  // parcel, different yaw, sometimes the other pine of the pair. It is a CONSEQUENCE of the one
  // thing that changed (how the dressing is spent), not a second difference, and the reason it is
  // acceptable is the property it buys: an island's dressing is now a function of that island
  // alone, so an island looks the same drawn by itself as it does in a crowd of thirty-five.
  const whole = bloomPlacements(FOOT, 'none').filter((p) => p.role !== 'bloom');
  const perIsland = bloomPlacements(FOOT, 'attributed').filter((p) => p.role !== 'bloom');
  assert.equal(perIsland.length, whole.length);
  assert.notDeepEqual(perIsland, whole, 'the seed restart had no effect — then the claim is wrong');
  // ⚠ The FIRST island is the one place they must agree: its capabilities are numbered from 0 in
  // both. If they disagreed there, the difference would be something other than the index restart.
  const first = (list: typeof whole) => list.filter((p) => p.capId.startsWith('crowd-story-00/'));
  assert.deepEqual(first(perIsland), first(whole), 'the two dressings disagree on the FIRST island');
});

test('a capability whose state grows nothing is why the tree count is not islands x parcels', () => {
  assertSignatureCountIsSane();
  // ⚠ NOT A LOSS, and worth pinning so nobody \"fixes\" it: `unknown` — and any state this
  // vocabulary has never heard of — grows no object at all, so the real forest's status mix stands
  // fewer objects than it has parcels. A page that expected the product of the two would read that
  // as missing props.
  const parcels = new Set(crowdCells(FOREST).map((c) => c.parcel)).size;
  const drawn = bloomPlacements(FOOT, 'attributed').filter((p) => p.role !== 'bloom').length;
  assert.ok(drawn < parcels, 'every capability grew something, including the unknown ones');
  assert.ok(drawn > parcels * 0.8, `${drawn} of ${parcels} parcels grew an object — too few`);
});

test('the comparison is deterministic — the same arm places identically twice', () => {
  assertSignatureCountIsSane();
  assert.deepEqual(bloomPlacements(FOOT, 'attributed'), bloomPlacements(FOOT, 'attributed'));
  assert.deepEqual(bloomCensus(FOOT, 'scattered'), bloomCensus(FOOT, 'scattered'));
});
