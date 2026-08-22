// prop-presence.test.ts — THE INSTRUMENT HAS TO BE ABLE TO FAIL.
//
// The friction this closes is not that a prop went missing; it is that the instrument watching
// for it COULD NOT SEE IT. `capture.mjs`'s non-vacuity floor counts opaque pixels, and every prop
// is drawn over ground that is already opaque, so two runs either side of a real geometry change
// reported `opaque px : 11250412` — identical to the digit. A guard invariant under the failure
// it is credited with catching is a green that verified nothing.
//
// So the load-bearing test in this file is the RED one, and it is built to be honest about the
// comparison rather than merely to fail. The two fixtures below deliver the SAME NUMBER OF OPAQUE
// PIXELS: the missing prop's pixels are handed to the ground rather than deleted, which is what
// actually happens when a prop stops drawing — the ground behind it is what the camera then sees.
// The old instrument reads the two as identical, exactly as it did in the wild; the new one names
// the token that vanished. That is the whole claim, and it is asserted rather than described.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DRESSING_MUST_DELIVER,
  ROW_TAG_PREFIX,
  checkPropPresence,
  describePresenceFailure,
  discriminatingColours,
  expectedPropTokens,
  type DeliveredCanvas,
} from './prop-presence.js';
import { dressingNames } from './island-dressing.js';
import { PROP_TOKENS, STATUS_TOKENS, landTokens, toHex } from './palette-band.js';
import { shadowRamp } from './shadow-ladder.js';

/** A ground colour a real island delivers in bulk — the healthy family's lit top face. The
 *  fixtures are built from the REAL palette rather than from invented hexes, so a retuned token
 *  changes the fixture with the renderer instead of leaving a test agreeing with a colour that no
 *  longer exists. */
const GROUND = toHex(shadowRamp(STATUS_TOKENS['healthy']!.top[0]!)[3]!);

/** How many pixels each prop contributes in the honest fixture. Any number does; it is here so
 *  the arithmetic below reads. */
const PROP_PX = 400;

/**
 * One island's readback: opaque ground, plus every token the tag declares delivering its own
 * discriminating colour — with `omit` handed to the ground instead.
 *
 * THE HANDOVER IS THE POINT. Deleting the pixels would drop the opaque count, and a test whose
 * red case is also thinner is not testing the thing that was measured in the wild. Here both
 * fixtures deliver identically many opaque pixels and differ only in WHICH authored colour they
 * are.
 */
function island(tag: string, opts: { omit?: string } = {}): DeliveredCanvas {
  const expect = expectedPropTokens(tag);
  assert.ok(expect, `the fixture needs a tag the manifest knows; ${tag} resolved to nothing`);
  const colours: [string, number][] = [];
  let groundPx = 50_000;
  for (const token of expect) {
    if (token === opts.omit) {
      // The ground behind the prop is what the camera sees once the prop stops drawing.
      groundPx += PROP_PX;
      continue;
    }
    colours.push([discriminatingColours(token)[0]!, PROP_PX]);
  }
  colours.unshift([GROUND, groundPx]);
  return { tag, opaque: colours.reduce((s, [, n]) => s + n, 0), colours };
}

test('the honest island passes — every declared prop delivers', () => {
  const report = checkPropPresence([island('walled')]);
  assert.equal(report.checked, 1);
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2));
  assert.deepEqual(report.failures, []);
  const walled = report.canvases[0]!;
  assert.equal(walled.tokens.length, DRESSING_MUST_DELIVER.walled.length);
  assert.ok(
    walled.tokens.every((t) => t.deliveredPx === PROP_PX && t.present),
    'every declared token should read its own pixels',
  );
});

test('RED: a prop that stopped drawing is caught, and the opaque count is IDENTICAL', () => {
  const honest = island('walled');
  const lost = island('walled', { omit: PROP_TOKENS.stone });

  // THE OLD INSTRUMENT, REPRODUCED. This is the exact measurement the friction recorded in the
  // wild — same opaque total either side of a real change — and it is asserted here so that a
  // later session cannot read the new check as redundant with the old one.
  assert.equal(
    lost.opaque,
    honest.opaque,
    'the fixtures must be indistinguishable to an opaque-pixel floor, or this proves nothing',
  );
  assert.ok(lost.opaque > 5, 'and both must clear the per-canvas floor capture.mjs already has');

  const report = checkPropPresence([lost]);
  assert.equal(report.ok, false, 'a declared prop delivering zero pixels must REFUSE');
  assert.equal(report.failures.length, 1);
  const failed = report.failures[0]!;
  assert.deepEqual(
    failed.missing.map((t) => t.name),
    ['stone'],
    'and it must name the token that vanished, not merely report a failure',
  );
  assert.equal(failed.missing[0]!.deliveredPx, 0);
  // The other declared props are untouched, so the verdict is specific rather than a blanket red.
  assert.ok(failed.tokens.filter((t) => t.present).length === failed.tokens.length - 1);

  const message = describePresenceFailure(report);
  assert.match(message, /walled/);
  assert.match(message, /stone/);
  assert.match(message, new RegExp(PROP_TOKENS.stone));
});

test('RED: every declared token on every dressing is individually catchable', () => {
  // Not one token on one island. If any declared token could vanish without the check noticing,
  // the manifest would be advertising coverage it does not have.
  for (const name of dressingNames()) {
    for (const token of expectedPropTokens(name)!) {
      const report = checkPropPresence([island(name, { omit: token })]);
      assert.equal(report.ok, false, `${name}: losing ${token} passed the check`);
      assert.deepEqual(
        report.failures[0]!.missing.map((t) => t.token),
        [token],
        `${name}: losing ${token} named the wrong token`,
      );
    }
  }
});

test('the whole island going dark is caught too, not just one prop', () => {
  const bare: DeliveredCanvas = { tag: 'hamlet', opaque: 60_000, colours: [[GROUND, 60_000]] };
  const report = checkPropPresence([bare]);
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.failures[0]!.missing.map((t) => t.name),
    [...DRESSING_MUST_DELIVER.hamlet],
  );
});

test('the row twin owes exactly what the whole island owes', () => {
  for (const name of dressingNames()) {
    assert.deepEqual(
      expectedPropTokens(`${ROW_TAG_PREFIX}${name}`),
      expectedPropTokens(name),
      `${ROW_TAG_PREFIX}${name} must resolve to the same declaration as ${name}`,
    );
  }
});

test('the control declares nothing, and declaring nothing is not the same as being unknown', () => {
  assert.deepEqual(expectedPropTokens('today'), []);
  assert.deepEqual(expectedPropTokens('row-today'), []);
  // A tag on NEITHER evidence page resolves to null — unchecked, and REPORTED as unchecked
  // rather than counted. (Every tag that is actually on a page is declared; the test above
  // holds that mechanically. This is the behaviour for one that arrives undeclared.)
  assert.equal(expectedPropTokens('a-tag-no-page-carries'), null);
  const report = checkPropPresence([
    { tag: 'a-tag-no-page-carries', opaque: 900, colours: [[GROUND, 900]] },
    { tag: null, opaque: 900, colours: [[GROUND, 900]] },
  ]);
  assert.equal(report.checked, 0, 'an unknown tag is not silently counted as checked');
  assert.equal(report.withProps, 0, 'and it cannot help satisfy a coverage floor');
  assert.deepEqual(report.unresolvedTags, ['a-tag-no-page-carries']);
  assert.equal(report.ok, true, 'and it is not a failure either — the opaque floor still covers it');
});

test('EVERY tagged canvas on both evidence pages resolves to a declaration', () => {
  // THE HOLE ONE LEVEL UP FROM THE FRICTION, CLOSED MECHANICALLY. Everything else in this file
  // proves the check catches a prop that vanished from an island it knows about. It says nothing
  // about an island it does NOT know about — and a tagged canvas with no declaration is passed
  // over in silence, so adding a sixth dressed island, or renaming a tag, would quietly shrink
  // the instrument's coverage while every existing test stayed green. That is the same shape as
  // the failure this module exists to repair, arriving one level up.
  //
  // The tags are read from the pages themselves rather than listed here, because a list here is
  // one more thing to keep in step. `capture.mjs` finds its canvases by `data-st-tag` for exactly
  // the same reason, so this is the same identity the capture uses.
  const pages = ['island.tsx', 'directions.tsx'];
  const undeclared: string[] = [];
  let found = 0;
  for (const page of pages) {
    const src = readFileSync(new URL(page, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\btag="([^"]+)"/g)) {
      found++;
      if (expectedPropTokens(m[1]!) === null) undeclared.push(`${page}: ${m[1]}`);
    }
  }
  assert.ok(found > 10, `expected to find the pages' tags; found ${found} — has the syntax moved?`);
  assert.deepEqual(
    undeclared,
    [],
    'a tagged canvas with no declaration is skipped in silence, which is coverage lost without a signal',
  );
});

test('every dressing declares at least one prop, and every declared token is a real prop token', () => {
  const known = new Set<string>(Object.values(PROP_TOKENS));
  const onPalette = new Set(landTokens());
  for (const name of dressingNames()) {
    const declared = DRESSING_MUST_DELIVER[name];
    assert.ok(declared, `${name} has no entry in DRESSING_MUST_DELIVER`);
    assert.ok(declared.length > 0, `${name} declares nothing, so its island cannot be checked`);
    for (const token of expectedPropTokens(name)!) {
      assert.ok(known.has(token), `${name} declares ${token}, which is not a PROP_TOKEN`);
      assert.ok(onPalette.has(token), `${name} declares ${token}, which is not an island token`);
    }
  }
});

test('every declared token is PROVABLE — it has a colour nothing else on the island delivers', () => {
  // Without this the check could pass for the wrong reason: a token sharing all its delivered
  // colours with the ground would read as present whenever the ground did.
  for (const name of dressingNames()) {
    for (const token of expectedPropTokens(name)!) {
      assert.ok(
        discriminatingColours(token).length > 0,
        `${name} declares ${token}, which delivers no colour of its own`,
      );
    }
  }
});

test('the subtraction actually subtracts — a shared colour cannot prove either token', () => {
  // Today's palette has NO collision (measured: all 21 prop tokens keep all five of their
  // delivered colours across the 60 land tokens), so the subtraction currently removes nothing
  // and a test written against the real universe would agree with the answer whether or not the
  // line existed. Two constructed greys collide exactly — 125 x 0.80 rounds to 100, and 100 x 1.00
  // is 100 — which is what makes this an observation rather than a restatement.
  const a = '#646464';
  const b = '#7d7d7d';
  const alone = discriminatingColours(a, [a]);
  const shared = discriminatingColours(a, [a, b]);
  assert.equal(alone.length, 5, 'on its own a token keeps every rung it delivers');
  assert.ok(alone.includes(a), 'including its own full-strength colour');
  assert.ok(!shared.includes(a), 'which the neighbour also delivers, so it can prove neither');
  assert.equal(shared.length, alone.length - 1);
});

test('a declaration nothing can prove REFUSES rather than reading as present', () => {
  // Reached through the documented seam, because today's palette has no collision to reach it
  // with — and a fail-closed branch nobody has executed is a branch nobody knows works.
  const report = checkPropPresence([island('walled')], { discriminatorsOf: () => [] });
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.failures[0]!.unprovable.sort(),
    [...DRESSING_MUST_DELIVER.walled].sort(),
  );
  assert.match(describePresenceFailure(report), /indistinguishable/);
});

test('the floor is one pixel, and one pixel passes while zero does not', () => {
  const one: DeliveredCanvas = {
    tag: 'today',
    opaque: 10,
    colours: [[GROUND, 10]],
  };
  // `today` declares nothing, so it passes vacuously — the interesting case is a declared token
  // sitting exactly on the floor.
  assert.equal(checkPropPresence([one]).ok, true);
  const expect = expectedPropTokens('wild')!;
  const onTheFloor: DeliveredCanvas = {
    tag: 'wild',
    opaque: 1000,
    colours: [[GROUND, 1000 - expect.length], ...expect.map((t) => [discriminatingColours(t)[0]!, 1] as [string, number])],
  };
  assert.equal(checkPropPresence([onTheFloor]).ok, true, 'one pixel is presence');
  assert.equal(checkPropPresence([onTheFloor], { floor: 2 }).ok, false, 'the floor is a parameter');
});
