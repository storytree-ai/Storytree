// land-theme.test.ts — the per-theme separation floor, held to the one thing that makes it an
// instrument: it must be able to say NO.
//
// ⚠⚠ WHY THE REFUSAL TESTS COME FIRST HERE. This factory has caught four checks in two days that
// were structurally incapable of failing — a camera check computing its expectation from a copy of
// its own subject, a frame timer measuring submission instead of execution, a quality check that
// would have green-lit a tree whose textures never loaded. A floor that passes every theme is
// indistinguishable from no floor at all, and the difference is not visible in a green run. So the
// deliberately-collapsed themes are asserted BEFORE the good ones, and each is asserted to break
// exactly ONE half — because if both halves broke together, a floor that had silently lost one of
// them would still refuse both and read as healthy.
//
// ⚠ AND THE AUTOMATIC MUTATION RUNG COVERS NONE OF THIS. `pnpm gate`'s `check:mutation-diff` skips
// `harness/**` — the harness sits outside any workspace project's `src/` — so it reports NOTHING TO
// MUTATE for every file this increment touched. Mutation evidence is hand-run and recorded in
// `docs/research/chapter2-land-theme-2026-08-28/README.md` §3.

import assert from 'node:assert/strict';
import test from 'node:test';

import { grainFeaturePeriod } from './land-grain.js';
import { STATUS_TOKENS, type StatusFamily } from './palette-band.js';
import { ADR0462_STATUS_TOKENS, STATUS_COLOUR, vocabularySeparation } from './status-vocabulary.js';
import { LEGACY_SHADE_LEVELS } from './palette-band.js';
import { TERRAINS, type Terrain, type TerrainName } from './terrain-vocabulary.js';
import {
  COLD_SEASON_THEME,
  HIGH_SUMMER_THEME,
  REFUSED_THEMES,
  SHIPPED_THEME,
  THEMES,
  THEME_KEYS,
  familyFrom,
  geometricDistance,
  geometryVerdict,
  resolveTheme,
  shippedGeometryFloor,
  themeById,
  themeSeparation,
  themeVerdictLine,
  type LandTheme,
  type ThemeTerrain,
} from './land-theme.js';

const BASE = grainFeaturePeriod();

/** A theme built from one hex per terrain, keeping the shipped land — the shape most of the
 *  fixtures below want. */
function tinted(id: string, tops: Record<TerrainName, string>): LandTheme {
  const terrain = new Map<TerrainName, ThemeTerrain>();
  for (const t of TERRAINS) {
    terrain.set(t.name, {
      family: familyFrom(tops[t.name], '#d6b271'),
      stretch: t.stretch,
      bearing: t.bearing,
      lattice: t.lattice,
    });
  }
  return { id, title: id, character: 'a fixture', terrain };
}

/* ── ⚠⚠ THE FLOOR CAN SAY NO ───────────────────────────────────────────────────────────────── */

test('⚠⚠ a theme that collapses two colours is REFUSED, and the LAND half still passes', () => {
  // `dusk-flats` pulls the scrub and the standing water toward each other until the lit ladder
  // spans the gap — ADR-0414 D4's failure, and the way a real theme would break rather than by
  // giving two states one hex. Its land is untouched, so the geometry half must return a clean
  // pass: that is what proves the two halves are independent instruments rather than one verdict
  // reported twice.
  const dusk = REFUSED_THEMES.find((t) => t.id === 'dusk-flats');
  assert.ok(dusk, 'the committed colour-collapse fixture is missing — the refusal is unproved');
  const v = themeSeparation(dusk, BASE);
  assert.equal(v.pass, false, `dusk-flats must be refused; got ${themeVerdictLine(v)}`);
  assert.equal(v.colour.pass, false, 'the COLOUR half is the one that must refuse it');
  assert.equal(v.geometry.pass, true, 'its land is untouched, so the GEOMETRY half must pass');
  assert.ok(
    v.colour.under.some((u) => u.pair === 'brown/black'),
    `the binding pair must be brown/black; got ${v.colour.under.map((u) => u.pair).join(', ')}`,
  );
  assert.ok(v.colour.foreignReads.length > 0, 'delivered pixels must actually read as another colour');
});

test('⚠⚠ a theme that collapses two LANDS is REFUSED, and the COLOUR half still passes', () => {
  // `levelled-fields` is high summer's palette exactly, with `fallow` given `wheatfield`'s land.
  // Those two share a token under every theme (ADR-0462), so once they share a land as well there
  // is NOTHING left to tell two states apart — and colour, correctly, reports no problem at all.
  // A floor that had lost its geometry half would pass this theme, which is the whole reason the
  // half exists.
  const levelled = REFUSED_THEMES.find((t) => t.id === 'levelled-fields');
  assert.ok(levelled, 'the committed land-collapse fixture is missing — the refusal is unproved');
  const v = themeSeparation(levelled, BASE);
  assert.equal(v.pass, false, `levelled-fields must be refused; got ${themeVerdictLine(v)}`);
  assert.equal(v.colour.pass, true, 'its colours are high summer’s, which clear the floor');
  assert.equal(v.geometry.pass, false, 'the GEOMETRY half is the one that must refuse it');
  const tightest = v.geometry.pairs[0]!;
  assert.equal(tightest.pair, 'fallow/wheatfield');
  assert.equal(tightest.distance.carried, 0, 'the two lands are identical, so the distance is zero');
});

test('⚠ the two refusal fixtures break DIFFERENT halves — neither is a second copy of the other', () => {
  // NON-VACUITY for the pair of tests above. If both fixtures happened to break the same half,
  // the other half would be entirely unproved while this file still read as thorough.
  const halves = REFUSED_THEMES.map((t) => {
    const v = themeSeparation(t, BASE);
    return `${v.colour.pass ? 'colour-ok' : 'colour-refused'}/${v.geometry.pass ? 'land-ok' : 'land-refused'}`;
  });
  assert.equal(new Set(halves).size, REFUSED_THEMES.length, `both fixtures break the same half: ${halves.join(' ')}`);
});

test('⚠ a REAL palette this project shipped is refused — the pre-clay table', () => {
  // Not a synthetic bad case. `ADR0462_STATUS_TOKENS` is the palette that shipped on 2026-08-27,
  // the day before the tilled clay replaced `mapped`'s tan, frozen at commit 1693f33e. Run through
  // the colour half it REFUSES, naming `yellow/brown`. A floor whose only failing input was
  // invented for it would be much weaker evidence than one that refuses something we drew.
  // ⚠ ON THE FOUR-RUNG LADDER THIS PALETTE WAS JUDGED ON. The nine-rung ladder adopted 2026-08-31
  // shrinks every family's largest lighting step, so this same table scores 1.439 there — it is
  // still refused, on its surviving foreign read rather than on its ratio, and a reproduction that
  // quietly changed which half did the refusing would not be one.
  const v = vocabularySeparation(
    ADR0462_STATUS_TOKENS,
    STATUS_COLOUR,
    undefined,
    LEGACY_SHADE_LEVELS,
  );
  assert.equal(v.pass, false, 'the pre-clay palette must not clear the floor');
  assert.equal(v.tightest.pair, 'yellow/brown');
  assert.ok(v.tightest.ratio < 0.4, `the recorded ratio is 0.395; got ${v.tightest.ratio.toFixed(3)}`);
  assert.equal(v.foreignReads.length, 2, 'the recorded run carried two foreign colour reads');
});

test('⚠ a land set with no colour-blind pair is REFUSED, not passed', () => {
  // The vacuity arm. `resolveTheme` guarantees the pair survives, so it is unreachable through a
  // theme — this is the door that makes the branch executable, because a branch nobody has run is
  // a branch nobody knows works.
  const noPair: Terrain[] = TERRAINS.map((t, i) => ({ ...t, token: `#0000${(i + 16).toString(16)}0` }));
  assert.throws(() => geometryVerdict(noPair, BASE), /no colour-blind pair/);
});

/* ── the offered themes clear it ───────────────────────────────────────────────────────────── */

test('every offered theme clears the floor', () => {
  assert.ok(THEMES.length >= 2, 'a floor with one theme has nothing to be a floor for');
  for (const theme of THEMES) {
    const v = themeSeparation(theme, BASE);
    assert.equal(v.pass, true, `${theme.id}: ${themeVerdictLine(v)}`);
    assert.equal(v.colour.foreignReads.length, 0, `${theme.id} delivers a pixel that reads as another colour`);
  }
});

test('⚠ the themes really are different from each other — a floor over one palette drawn three times proves nothing', () => {
  // NON-VACUITY for the test above. Three themes that all resolved to the shipped tokens would
  // pass the floor unanimously and would say nothing whatever about theming.
  const signatures = THEMES.map((t) => [...resolveTheme(t).tokens.values()].map((f) => f.top[0]).join(','));
  assert.equal(new Set(signatures).size, THEMES.length, 'two offered themes deliver the same colours');
  // And at least one theme must move the LAND as well, or the resolution layer's geometry half is
  // available but never exercised.
  const movedLand = THEMES.filter((t) => {
    const r = resolveTheme(t);
    return r.terrains.some((x, i) => {
      const s = TERRAINS[i]!;
      return x.stretch !== s.stretch || x.bearing !== s.bearing || x.lattice !== s.lattice;
    });
  });
  assert.ok(movedLand.length >= 1, 'no offered theme moves the land — the geometry channel is inert');
});

test('the shipped theme IS the shipped land, token for token and land for land', () => {
  const r = resolveTheme(SHIPPED_THEME);
  assert.deepEqual(r.terrains, TERRAINS, 'the reference theme must resolve to the vocabulary itself');
  for (const t of TERRAINS) {
    assert.deepEqual(r.tokens.get(t.state), STATUS_TOKENS.get(t.state), `${t.state} moved under the shipped theme`);
  }
});

test('a theme resolves the six settled TERRAIN names, not the states', () => {
  assert.deepEqual([...THEME_KEYS].sort(), ['fallow', 'forest', 'heath', 'scree', 'swamp', 'wheatfield']);
  for (const theme of [...THEMES, ...REFUSED_THEMES]) {
    assert.deepEqual([...theme.terrain.keys()].sort(), [...THEME_KEYS].sort(), `${theme.id} does not resolve all six`);
  }
  assert.equal(themeById('high-summer'), HIGH_SUMMER_THEME);
  assert.equal(themeById('nothing-of-the-sort'), undefined);
});

test('a theme id names its character, never its hues (ADR-0461 D2, by the same argument)', () => {
  const hues = /green|yellow|black|grey|gray|brown|blue|red|white|amber|gold|olive|ochre/i;
  for (const theme of [...THEMES, ...REFUSED_THEMES]) {
    assert.doesNotMatch(theme.id, hues, `theme '${theme.id}' names a colour — a name its own edit can falsify`);
    assert.ok(theme.character.length > 20, `${theme.id} must say what it IS`);
  }
});

/* ── resolution refuses rather than defaults ───────────────────────────────────────────────── */

test('⚠ a PARTIAL theme is refused — a missing terrain would draw a state in another theme’s land', () => {
  const partial = new Map(HIGH_SUMMER_THEME.terrain);
  partial.delete('scree');
  assert.throws(
    () => resolveTheme({ ...HIGH_SUMMER_THEME, id: 'partial', terrain: partial }),
    /says nothing about 'scree'/,
  );
});

test('⚠ a theme resolving a name the vocabulary does not have is refused', () => {
  const bogus = new Map(HIGH_SUMMER_THEME.terrain);
  bogus.set('moorland' as TerrainName, HIGH_SUMMER_THEME.terrain.get('forest')!);
  assert.throws(() => resolveTheme({ ...HIGH_SUMMER_THEME, id: 'bogus', terrain: bogus }), /not one of the six terrains/);
});

test('⚠ a theme SPLITTING ADR-0462’s shared colour is refused, because the floor cannot measure it', () => {
  // Not a judgment that splitting is wrong — the instrument enumerates exactly the five classes
  // `LAND_COLOURS` names, so a sixth is unreachable, and an unmeasurable theme must not pass a
  // floor. The refusal says which decision would have to move.
  const split = new Map(HIGH_SUMMER_THEME.terrain);
  const fallow = split.get('fallow')!;
  split.set('fallow', { ...fallow, family: familyFrom('#c74a2b', '#e2c98d') });
  assert.throws(() => resolveTheme({ ...HIGH_SUMMER_THEME, id: 'split', terrain: split }), /re-decides ADR-0462/);
});

/* ── the geometry channel ──────────────────────────────────────────────────────────────────── */

test('⚠ the bar is READ OFF the shipped vocabulary, and this pins what it currently reads', () => {
  // ⚠ WHEN THIS GOES RED: establish what moved in `TERRAINS`, say so in the landing, THEN
  // re-record. Never re-record reflexively — the bar moving silently is exactly how a floor stops
  // being a floor. The digest sits beside the properties because an invariance-style property
  // suite cannot see a value that is wrong the same way everywhere
  // (`self-comparison-invariance-suites-are-blind-by-construction`).
  const floor = shippedGeometryFloor(BASE);
  assert.equal(floor.from, 'heath/swamp', 'the shipped vocabulary’s weakest link moved');
  assert.ok(Math.abs(floor.bar - 0.7655) < 0.001, `the bar reads ${floor.bar.toFixed(4)}, recorded 0.7655`);
});

test('⚠ the bar is not a number picked to make the answer come out', () => {
  // The house test of an honest bar (`pixel-threshold-reads-off-a-same-run-control`): where would
  // a number chosen to PASS have sat? The shipped colour-blind pair sits at ~2.83 octaves, so a
  // picked number would sit just under 2.83. The bar is ~0.77 and is set by `heath`/`swamp` — a
  // pair colour already separates, which nobody was trying to make pass.
  const floor = shippedGeometryFloor(BASE);
  const v = themeSeparation(SHIPPED_THEME, BASE);
  const carried = v.geometry.pairs[0]!.distance.carried;
  assert.ok(carried > floor.bar * 3, `the pair under judgment clears the bar by ${(carried / floor.bar).toFixed(1)}x`);
  assert.notEqual(floor.from, 'fallow/wheatfield', 'the bar must not be set by the pair it judges');
});

test('a bearing is an AXIS, not a heading — 170° apart is 10° apart', () => {
  const rows = (bearing: number): Terrain => ({ ...TERRAINS[3]!, bearing });
  const a = geometricDistance(rows(0), rows((170 * Math.PI) / 180), BASE);
  const b = geometricDistance(rows(0), rows((10 * Math.PI) / 180), BASE);
  assert.ok(Math.abs(a.direction - b.direction) < 1e-9, `${a.direction} vs ${b.direction}`);
});

test('⚠ a bearing on an UNDIRECTED land counts for nothing', () => {
  // An isotropic mottle has no direction to differ in, so a rotated `forest` is the same land.
  // Scoring it as a right angle apart would let a theme "separate" two identical mottles by
  // writing a different number in a field the picture cannot show.
  const forest = TERRAINS[0]!;
  assert.equal(forest.stretch, 1, 'premise: forest is the undirected land');
  const rotated: Terrain = { ...forest, bearing: Math.PI / 2 };
  const d = geometricDistance(forest, rotated, BASE);
  assert.equal(d.direction, 0);
  assert.equal(d.carried, 0, 'nothing distinguishes an undirected land from itself rotated');
});

test('the scale channel is symmetric and reads in octaves', () => {
  const fine: Terrain = { ...TERRAINS[0]!, lattice: 1 };
  const coarse: Terrain = { ...TERRAINS[0]!, lattice: 4 };
  const d = geometricDistance(fine, coarse, BASE);
  assert.ok(Math.abs(d.scale - 2) < 1e-9, `four times coarser is two octaves; got ${d.scale}`);
  assert.equal(geometricDistance(coarse, fine, BASE).scale, d.scale);
});

test('⚠ either channel alone carries a pair — direction OR scale, the same claim pairVerdict makes', () => {
  const base = TERRAINS[3]!; // wheatfield: directed
  const sameScaleCrosswise: Terrain = { ...base, bearing: base.bearing + Math.PI / 2 };
  const dDir = geometricDistance(base, sameScaleCrosswise, BASE);
  assert.equal(dDir.scale, 0, 'premise: identical feature scale');
  assert.ok(dDir.carried > 0, 'two crosswise lands must be separated by direction alone');

  const sameBearingFiner: Terrain = { ...base, lattice: base.lattice * 8 };
  const dScale = geometricDistance(base, sameBearingFiner, BASE);
  assert.equal(dScale.direction, 0, 'premise: identically directed');
  assert.ok(dScale.carried >= 3, 'two lands eight times apart must be separated by scale alone');
});

test('⚠ a colour-only theme is a real theme — high summer moves no land at all', () => {
  const r = resolveTheme(HIGH_SUMMER_THEME);
  for (let i = 0; i < TERRAINS.length; i++) {
    const s = TERRAINS[i]!;
    const t = r.terrains[i]!;
    assert.equal(t.stretch, s.stretch);
    assert.equal(t.bearing, s.bearing);
    assert.equal(t.lattice, s.lattice);
    assert.notEqual(t.token, s.token, `${t.name} must actually change colour, or the theme is a copy`);
  }
});

test('cold season moves BOTH channels and its colour-blind pair survives the move', () => {
  const v = themeSeparation(COLD_SEASON_THEME, BASE);
  const pair = v.geometry.pairs.find((p) => p.pair === 'fallow/wheatfield')!;
  assert.ok(pair.separated, `cold season levelled its own fields: ${JSON.stringify(pair.distance)}`);
  assert.ok(pair.distance.scale > 2, `the pair must stay apart in feature scale; got ${pair.distance.scale}`);
});

test('familyFrom keeps the shipped families’ own internal ratios, and invents no wheat', () => {
  const fam: StatusFamily = familyFrom('#808080', '#d6b271');
  assert.equal(fam.top.length, 3);
  assert.equal(fam.top[0], '#808080');
  assert.equal(fam.wheat, '#d6b271');
  // top[1] darker, top[2] lighter, side darker still — the relationship `healthy` carries.
  assert.ok(parseInt(fam.top[1]!.slice(1, 3), 16) < 0x80);
  assert.ok(parseInt(fam.top[2]!.slice(1, 3), 16) > 0x80);
  assert.ok(parseInt(fam.side.slice(1, 3), 16) < parseInt(fam.top[1]!.slice(1, 3), 16));
});

test('a themeVerdictLine names the bar’s source, so a figure never arrives anonymous', () => {
  const line = themeVerdictLine(themeSeparation(HIGH_SUMMER_THEME, BASE));
  assert.match(line, /CLEARS/);
  assert.match(line, /heath\/swamp/, 'the control that set the bar must be named in the line');
  assert.match(line, /foreign read/);
});

test('a fixture theme that is merely tinted still resolves — the helper the fixtures use is honest', () => {
  const t = tinted('fixture', {
    forest: '#5f8f3a',
    heath: '#8a5a3a',
    fallow: '#d9c069',
    wheatfield: '#d9c069',
    swamp: '#3a3a34',
    scree: '#9aa3ab',
  });
  const r = resolveTheme(t);
  assert.equal(r.terrains.length, 6);
  assert.equal(r.terrains[0]!.token, '#5f8f3a');
});
