// colour-spread.test.ts — every refusal, fired.
//
// WHAT THIS SUITE IS FOR, STATED AS THE FAILURE IT EXISTS TO PREVENT. ADR-0418 D4 asks for a
// replacement check "built to fail", and the increment that carries it names the reason: a green
// check that verified nothing is the commonest fault class in this project. So the shape below is
// not "assert the happy path and move on" — every refusal in `colour-spread.ts` has a case that
// FIRES it, and the passing case is asserted against the SAME fixture the failing cases mutate,
// so a rung that silently stopped firing would take a passing test down with it.
//
// ⚠ THE FIXTURE IS THE COMMITTED CROSSING MEASUREMENT, NOT AN INVENTED ONE. The counts below are
// `docs/research/chapter2-grain-crossing-2026-08-27/grain-measure.json`'s real 8 px/unit row —
// control `distinct` 4, continuous `bins90` 94. An expectation invented for the test would pass
// against an implementation that had drifted away from the pictures the arc actually took, which
// is the "an expectation derived from its subject cannot fail" shape one level up.
//
// ⚠ AND THE AUTOMATIC MUTATION RUNG DOES NOT COVER THIS FILE. `pnpm gate`'s `check:mutation-diff`
// skips `harness/**` — the harness sits outside any workspace project's `src/`, so the rung
// reports NOTHING TO MUTATE rather than exercising these assertions. The mutation evidence for
// this module is therefore hand-run and recorded in
// `docs/research/chapter2-colour-spread-2026-08-27/README.md` §3, not produced by the gate.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPREAD_MANIFEST,
  SPREAD_OPAQUE_FLOOR,
  checkColourSpread,
  describeSpreadFailure,
  type DeliveredCanvas,
  type SpreadDeclaration,
} from './colour-spread.js';

/**
 * A histogram of `distinct` colours over `opaque` pixels whose 90%-mass count is EXACTLY
 * `bins90`.
 *
 * ⚠ THE FIRST DRAFT OF THIS HELPER WAS WRONG, AND THE SUITE CAUGHT IT — worth recording, because
 * the mistake is the one a fixture builder always makes. It gave `bins90` colours the bulk of the
 * mass and the rest one pixel each, and asserted the count would be `bins90`. It is not: the
 * heavy colours then carry ~99.99% of the frame, so 90% is reached at about 0.9 * `bins90` of
 * them — 85, not 94. A fixture that quietly delivers a different number than it advertises is an
 * expectation derived from its own subject.
 *
 * The construction that actually holds: `bins90` colours of `a = ceil(0.9 * opaque / bins90)`
 * each, so `bins90` of them just reach the 90% target and `bins90 - 1` of them fall short; the
 * remainder is spread over the tail, each strictly smaller so the sort order is what it looks
 * like. It needs `opaque >= bins90^2 / 0.9` to be constructible, which the assertion below
 * enforces rather than leaving to be discovered as a wrong number.
 */
function canvas(tag: string, opaque: number, distinct: number, bins90: number): DeliveredCanvas {
  const a = Math.ceil((0.9 * opaque) / bins90);
  assert.ok(a >= bins90, `fixture ${tag}: ${opaque} px is too few for bins90 ${bins90}`);
  const colours: [string, number][] = [];
  for (let i = 0; i < bins90; i++) colours.push([`#h${String(i).padStart(5, '0')}`, a]);
  const tail = distinct - bins90;
  const remainder = opaque - a * bins90;
  assert.ok(remainder >= tail, `fixture ${tag}: no pixels left for ${tail} tail colours`);
  if (tail > 0) {
    const per = Math.floor(remainder / tail);
    assert.ok(per < a, `fixture ${tag}: tail colours would outweigh the heavy ones`);
    for (let i = 0; i < tail; i++) {
      colours.push([`#t${String(i).padStart(5, '0')}`, i === 0 ? remainder - per * (tail - 1) : per]);
    }
  } else {
    assert.equal(remainder, 0, `fixture ${tag}: remainder with no tail to hold it`);
  }
  assert.equal(colours.reduce((s, [, n]) => s + n, 0), opaque, 'fixture accounts for every pixel');
  assert.equal(colours.length, distinct, 'fixture delivers the distinct count asked for');
  return { tag, opaque, colours };
}

/** An evenly-spread histogram, for cases where the exact 90%-mass count is not the point. */
function evenCanvas(tag: string, opaque: number, distinct: number): DeliveredCanvas {
  const per = Math.floor(opaque / distinct);
  const colours: [string, number][] = [];
  for (let i = 0; i < distinct; i++) {
    colours.push([`#e${String(i).padStart(5, '0')}`, i === 0 ? opaque - per * (distinct - 1) : per]);
  }
  return { tag, opaque, colours };
}

/** The crossing page's 8 px/unit row, as the real run delivered it. */
const CONTROL = canvas('grain-none-8px', 1_234_059, 4, 3);
const CONTINUOUS = canvas('grain-colour-8px', 1_234_059, 186, 94);

const MANIFEST = {
  'grain-none-8px': { regime: 'banded' },
  'grain-colour-8px': { regime: 'continuous', control: 'grain-none-8px' },
} as const satisfies Record<string, SpreadDeclaration>;

/** The shipped manifest as a lookup an arbitrary tag can be asked of. `SPREAD_MANIFEST` keeps its
 *  literal key type on purpose, so the two coverage assertions below reach it through a Map rather
 *  than through a widened binding — which is the shape `no-known-value-widening` refuses. */
const SHIPPED = new Map<string, SpreadDeclaration>(Object.entries(SPREAD_MANIFEST));

test('the fixture reproduces the committed crossing figures', () => {
  // If this drifts, every case below is measuring something other than the pictures the arc took.
  const v = checkColourSpread([CONTROL, CONTINUOUS], MANIFEST);
  const control = v.canvases.find((c) => c.tag === 'grain-none-8px');
  const continuous = v.canvases.find((c) => c.tag === 'grain-colour-8px');
  assert.equal(control?.distinct, 4);
  assert.equal(control?.bins90, 3);
  assert.equal(continuous?.distinct, 186);
  assert.equal(continuous?.bins90, 94);
});

test('a continuous panel clears a bar read off its control in the same run', () => {
  const v = checkColourSpread([CONTROL, CONTINUOUS], MANIFEST);
  assert.equal(v.ok, true);
  assert.equal(v.checked, 2);
  assert.equal(v.continuousChecked, 1);
  assert.equal(describeSpreadFailure(v), '');
  const continuous = v.canvases.find((c) => c.tag === 'grain-colour-8px');
  // THE BAR IS THE CONTROL'S TOTAL COLOUR COUNT, not a committed number — that is the whole
  // design. 4, measured beside it, against 94 delivered: a 23x margin.
  assert.equal(continuous?.bar, 4);
  assert.equal(continuous?.control, 'grain-none-8px');
});

test('COLLAPSED: a continuous panel that fell back onto the ladder is refused', () => {
  // The failure this module exists for. The grain stopped reaching delivered pixels, so the
  // picture is now expressible by the authored ladder — and it is MAXIMALLY on-palette while it
  // is, which is precisely why the palette check could never have caught it.
  const collapsed = canvas('grain-colour-8px', 1_234_059, 4, 3);
  const v = checkColourSpread([CONTROL, collapsed], MANIFEST);
  assert.equal(v.ok, false);
  const verdict = v.canvases.find((c) => c.tag === 'grain-colour-8px');
  assert.equal(verdict?.fault, 'collapsed');
  assert.match(describeSpreadFailure(v), /did not reach delivered pixels/);
});

test('COLLAPSED fires at the boundary, where bins90 exactly equals the bar', () => {
  // The bar is STRICT: "more colours than the ladder has". Equalling it is not exceeding it, and
  // an off-by-one here is the difference between a rung and a formality.
  const atBar = canvas('grain-colour-8px', 1_234_059, 10, 4);
  const v = checkColourSpread([CONTROL, atBar], MANIFEST);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'collapsed');

  const justOver = canvas('grain-colour-8px', 1_234_059, 10, 5);
  const w = checkColourSpread([CONTROL, justOver], MANIFEST);
  assert.equal(w.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, null);
});

test('the bar MOVES with the control, which is what makes it renderer-independent', () => {
  // A control drawing a wider ladder raises the bar for its sibling, in the same run, with no
  // committed number involved. This is the property that answers
  // `grain-picture-is-renderer-specific`: a quarter of grained pixels land on a different rung
  // between SwiftShader and an RTX 2060, so an absolute threshold is one machine's threshold.
  const widerControl = canvas('grain-none-8px', 1_234_059, 200, 3);
  const v = checkColourSpread([widerControl, CONTINUOUS], MANIFEST);
  const continuous = v.canvases.find((c) => c.tag === 'grain-colour-8px');
  assert.equal(continuous?.bar, 200);
  // 94 delivered against a bar of 200 — the same picture that passed above now fails, because
  // the ladder beside it got wider. Nothing in this module changed.
  assert.equal(continuous?.fault, 'collapsed');
});

test('MASK MISMATCH: arms that are not the same island are refused', () => {
  // `cover-measure.mjs`'s refusal 3. If the opaque counts move, the panels are not a comparison
  // and the spread difference is not attributable to the shading.
  const shrunk = canvas('grain-colour-8px', 1_000_000, 186, 94);
  const v = checkColourSpread([CONTROL, shrunk], MANIFEST);
  assert.equal(v.ok, false);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'mask-mismatch');
});

test('VACUOUS: too few pixels for a 90%-mass count to be about the material', () => {
  // Evenly spread, because the exact 90%-mass count is not what is under test here — what is,
  // is that a canvas below the floor is refused even when every other rung would pass it.
  const tiny = evenCanvas('grain-colour-8px', SPREAD_OPAQUE_FLOOR - 1, 186);
  const tinyControl = evenCanvas('grain-none-8px', SPREAD_OPAQUE_FLOOR - 1, 4);
  const v = checkColourSpread([tinyControl, tiny], MANIFEST);
  assert.equal(v.ok, false);
  // ⚠ VACUITY IS CHECKED BEFORE THE MASK, and that ordering is the point: these two panels have
  // matching masks and a bins90 far over the bar, so every other rung passes them. A run over a
  // 999-px canvas would otherwise report a clean spread verdict it never tested.
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'vacuous');
});

test('UNDECLARED: a tagged canvas the manifest does not know is refused, not skipped', () => {
  // The coverage trap, one level up from the check itself: renaming a tag or adding a page would
  // otherwise shrink what is audited while every assertion here stayed green.
  const stranger = canvas('grain-colour-16px', 1_234_059, 186, 94);
  const v = checkColourSpread([CONTROL, CONTINUOUS, stranger], MANIFEST);
  assert.equal(v.ok, false);
  assert.deepEqual([...v.unresolvedTags], ['grain-colour-16px']);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-16px')?.fault, 'undeclared');
  // ...and it does not count toward what was checked.
  assert.equal(v.checked, 2);
});

test('CONTROL MISSING: a continuous panel whose control is off the page is refused', () => {
  const v = checkColourSpread([CONTINUOUS], MANIFEST);
  assert.equal(v.ok, false);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'control-missing');
  // Unjudged must never read as passed: there is no bar, so there is no verdict.
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.bar, null);
});

test('CONTROL MISSING: a continuous declaration naming no control at all is refused', () => {
  const v = checkColourSpread([CONTROL, CONTINUOUS], {
    'grain-none-8px': { regime: 'banded' },
    'grain-colour-8px': { regime: 'continuous' },
  });
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'control-missing');
});

test('CONTROL NOT BANDED: a bar read off a continuous control means nothing, so it is refused', () => {
  // The subtlest of the five. Both panels are present, both have plenty of pixels, the masks
  // match and bins90 clears the bar — every number looks right. It is the CLAIM that is void:
  // "more colours than the authored ladder" is not what was measured if the thing measured is
  // not a ladder.
  const v = checkColourSpread([CONTROL, CONTINUOUS], {
    'grain-none-8px': { regime: 'continuous', control: 'grain-colour-8px' },
    'grain-colour-8px': { regime: 'continuous', control: 'grain-none-8px' },
  });
  assert.equal(v.ok, false);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-colour-8px')?.fault, 'control-not-banded');
});

test('untagged canvases are ignored, and a banded canvas is read rather than judged', () => {
  // A banded canvas carries no fault here BY DESIGN: `capture.mjs`'s off-palette refusal is what
  // holds it, unchanged, and a second rung restating that would be a vacuous green wearing a
  // second name.
  const untagged: DeliveredCanvas = { tag: null, opaque: 4, colours: [['#000000', 4]] };
  const v = checkColourSpread([CONTROL, CONTINUOUS, untagged], MANIFEST);
  assert.equal(v.ok, true);
  assert.equal(v.canvases.length, 2);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-none-8px')?.fault, null);
  assert.equal(v.canvases.find((c) => c.tag === 'grain-none-8px')?.bar, null);
});

test('the shipped manifest declares every tag on both pages capture.mjs drives', () => {
  // ⚠ THIS IS THE ASSERTION THAT KEEPS THE MANIFEST HONEST AS THE PAGES MOVE, and it is written
  // against the tags the driver actually photographs. The island page's seven and the crossing
  // page's eight are named in `island.tsx` and `grain.tsx` respectively.
  for (const tag of [
    // island.tsx
    'zoom-lit',
    'zoom-terrain',
    'zoom-shadow',
    'bare-lit',
    'bare-shadow',
    'delivered-lit',
    'delivered-shadow',
    // directions.tsx — the overview row and the five dressed islands
    'row-today',
    'row-walled',
    'row-hamlet',
    'row-terrace',
    'row-shrine',
    'row-wild',
    'today',
    'walled',
    'hamlet',
    'terrace',
    'shrine',
    'wild',
  ]) {
    assert.equal(SHIPPED.get(tag)?.regime, 'banded', `${tag} must be declared`);
  }
  for (const variant of ['none', 'normal', 'colour', 'both']) {
    for (const zoom of ['2px', '8px']) {
      const tag = `grain-${variant}-${zoom}`;
      const declaration = SHIPPED.get(tag);
      assert.ok(declaration, `${tag} must be declared`);
      // The two `colour` variants are the ones that leave the ladder; `none` and `normal` were
      // MEASURED closed on both zooms (0 off-palette px), which is why they are controls.
      const expected = variant === 'colour' || variant === 'both' ? 'continuous' : 'banded';
      assert.equal(declaration.regime, expected, `${tag} regime`);
      if (expected === 'continuous') assert.equal(declaration.control, `grain-none-${zoom}`);
    }
  }
});

test('every continuous declaration names a control that is itself declared banded', () => {
  // A structural check over the shipped manifest, so a hand-edit cannot leave a continuous panel
  // pointing at another continuous one — the `control-not-banded` case, caught at authoring time
  // rather than on a run.
  for (const [tag, declaration] of SHIPPED) {
    if (declaration.regime !== 'continuous') {
      assert.equal(declaration.control, undefined, `${tag}: a banded canvas needs no control`);
      continue;
    }
    const controlTag = declaration.control;
    assert.ok(controlTag, `${tag}: continuous canvases must name a control`);
    assert.equal(SHIPPED.get(controlTag)?.regime, 'banded', `${tag}: control must be banded`);
  }
});
