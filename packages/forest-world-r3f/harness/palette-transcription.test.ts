// palette-transcription.test.ts — the guard, held to the two things that make a guard worthless.
//
// 1. IT MUST AGREE WITH THE WORLD. The three copies on disk really do say one thing today.
// 2. ⚠ IT MUST BE ABLE TO REFUSE. Six instruments were caught on this arc in two days that could
//    not — a camera check computing its expectation from a copy of its own subject, a frame timer
//    measuring submission rather than execution, a quality check that would have passed a tree
//    whose textures never loaded. So the refusals below are not decoration: the guard is run
//    against the ACTUAL pre-fix palette (frozen as `SPIKE_STATUS_COLOUR`) and asserted to say no,
//    which is a claim about the state this whole unit exists to have corrected, and it is asserted
//    HERE rather than left in a commit message that decays the moment the parser is touched.
//
// The mutations are applied to the PARSED INPUTS rather than to files on disk, deliberately: a
// suite that rewrote `apps/studio/src/index.css` to prove a point would be a suite that can
// corrupt a sibling worktree's tree when two run at once.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { STATUS_TOKENS, TREE_TOKENS } from './palette-band.js';
import { SPIKE_STATUS_COLOUR } from './shipped-baseline.js';
import {
  DECIDED_STATUSES,
  checkTranscriptions,
  parseCanvasPalette,
  parseCssCrowns,
  parseCssGroundFamilies,
  stripCssComments,
  transcriptionDisagreements,
  type GroundFamily,
} from './palette-transcription.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, '..');
const REPO = join(PACKAGE, '..', '..');
const SOURCES = {
  cssPath: join(REPO, 'apps', 'studio', 'src', 'index.css'),
  canvasPath: join(PACKAGE, 'src', 'ForestWorldCanvas.tsx'),
};
const read = (p: string): string => readFileSync(p, 'utf8');

/* ── 1. the world ──────────────────────────────────────────────────────────────────────────── */

test('the three copies of the status palette agree, ground and crown, on all six states', () => {
  const { faults, disagreements } = checkTranscriptions(read, SOURCES, STATUS_TOKENS, TREE_TOKENS);
  assert.deepEqual(faults, []);
  assert.deepEqual(disagreements, []);
});

test('every parser actually found something — an empty parse is silence, not agreement', () => {
  const css = read(SOURCES.cssPath);
  const canvas = read(SOURCES.canvasPath);
  for (const status of DECIDED_STATUSES) {
    assert.ok(parseCssGroundFamilies(css).has(status), `no CSS ground family for ${status}`);
    assert.ok(parseCssCrowns(css).has(status), `no CSS crown token for ${status}`);
    assert.ok(parseCanvasPalette(canvas, 'GROUND_COLOUR').has(status), `no canvas ground for ${status}`);
    assert.ok(parseCanvasPalette(canvas, 'CROWN_COLOUR').has(status), `no canvas crown for ${status}`);
  }
});

test('the shared-block and cascade-fallthrough cases are read, not assumed', () => {
  // The two places a naive parser is WRONG rather than merely incomplete, and both are decisions
  // (ADR-0462) rather than formatting. One CSS block carries two selectors, so `building` has a
  // ground family without a block of its own; and `building` has NO crown rule at all, so it
  // resolves through the unqualified `.story-tree .crown-lo circle` default.
  const css = read(SOURCES.cssPath);
  const ground = parseCssGroundFamilies(css);
  assert.equal(ground.get('building')?.top[0], ground.get('proposed')?.top[0]);
  const crowns = parseCssCrowns(css);
  assert.equal(crowns.get('building'), crowns.get('unknown'));
  assert.notEqual(crowns.get('building'), crowns.get('proposed'));
});

test('comments are stripped before parsing — the CSS quotes hexes it does not apply', () => {
  // `.hex-territory.st-mapped`'s own comment quotes four hexes, including the retired tan
  // `#b3946a` this arc replaced. A parser that swept a comment would compare the decision
  // against the value it superseded and call it agreement.
  const css = read(SOURCES.cssPath);
  assert.match(css, /#b3946a/, 'the retired tan is still quoted in prose — this test would go vacuous without it');
  assert.ok(!stripCssComments(css).includes('#b3946a'), 'the retired tan survived comment-stripping');
});

/* ── 2. the refusals ───────────────────────────────────────────────────────────────────────── */

/** The live inputs, as parsed — the base every mutation below perturbs by exactly one value. */
function liveInputs() {
  const css = read(SOURCES.cssPath);
  const canvas = read(SOURCES.canvasPath);
  return {
    cssGround: parseCssGroundFamilies(css),
    cssCrown: parseCssCrowns(css),
    bandGround: STATUS_TOKENS as ReadonlyMap<string, GroundFamily>,
    bandCrown: new Map([...TREE_TOKENS].map(([s, t]) => [s, t.crown] as const)),
    canvasGround: parseCanvasPalette(canvas, 'GROUND_COLOUR'),
    canvasCrown: parseCanvasPalette(canvas, 'CROWN_COLOUR'),
  };
}

test('CAN FAIL — the ACTUAL pre-fix canvas palette is refused, on every one of its six states', () => {
  // The strongest form this proof takes: not a synthetic wrong colour, but the exact table the
  // shipped canvas held until 2026-08-28, run through today's guard.
  const base = liveInputs();
  const rows = transcriptionDisagreements({ ...base, canvasGround: SPIKE_STATUS_COLOUR });
  const refused = new Set(rows.map((r) => r.token));
  for (const status of DECIDED_STATUSES) {
    assert.ok(refused.has(`${status}.ground (canvas)`), `the spike palette's ${status} was NOT refused`);
  }
  // And it names both values, so a red tells the reader what to edit.
  const mapped = rows.find((r) => r.token === 'mapped.ground (canvas)');
  assert.equal(mapped?.expected, '#b7684e');
  assert.equal(mapped?.actual, '#5d8fa8');
});

test('CAN FAIL — a crown handed its own GROUND colour, which is the bug a straight swap makes', () => {
  const base = liveInputs();
  const canvasCrown = new Map(base.canvasCrown).set('building', base.canvasGround.get('building')!);
  const rows = transcriptionDisagreements({ ...base, canvasCrown });
  assert.deepEqual(
    rows.map((r) => r.token),
    ['building.crown (canvas)'],
    'exactly the one mutated token, and nothing else, is reported',
  );
});

test('CAN FAIL — the CSS retuned alone, which is the drift only a gate rung ever sees', () => {
  // `apps/studio` does not depend on this package, so a CSS-only branch runs no test here under
  // the gate's affected-scope narrowing. This asserts the COMPARISON refuses; that the rung is
  // reached at all is `gate-order.ts`'s job.
  const base = liveInputs();
  const charred = base.cssGround.get('unhealthy')!;
  const cssGround = new Map(base.cssGround).set('unhealthy', { ...charred, top: ['#57544b', ...charred.top.slice(1)] });
  const rows = transcriptionDisagreements({ ...base, cssGround });
  assert.deepEqual(rows.map((r) => r.token).sort(), ['unhealthy.ground (canvas)', 'unhealthy.top[0]']);
});

test('CAN FAIL — a family half-applied: the flank left behind when the top moved', () => {
  const base = liveInputs();
  const clay = base.bandGround.get('mapped')!;
  const bandGround = new Map(base.bandGround).set('mapped', { ...clay, side: '#85683f' });
  const rows = transcriptionDisagreements({ ...base, bandGround });
  assert.deepEqual(rows.map((r) => r.token), ['mapped.side']);
});

test('CAN FAIL — a status DELETED from a copy is a disagreement, never a narrowing', () => {
  // The vacuity this guard is most at risk of: statuses come from `DECIDED_STATUSES`, authored
  // upstream of all three subjects, so a copy that simply stopped holding one is reported. Were
  // the status list derived from the subjects instead, deleting an entry from every copy would
  // make the disagreement vanish along with the thing it guards.
  const base = liveInputs();
  const canvasGround = new Map(base.canvasGround);
  canvasGround.delete('unhealthy');
  const rows = transcriptionDisagreements({ ...base, canvasGround });
  assert.deepEqual(rows.map((r) => r.token), ['unhealthy.ground (canvas)']);
  assert.equal(rows[0]?.actual, '(absent)');
});

test('CAN FAIL — a source that parsed to NOTHING is a fault, not perfect agreement', () => {
  // A renamed binding or a moved file leaves every map empty. Compared against each other, three
  // empty maps agree completely — which is how a check comes to certify nothing while staying
  // green. `checkTranscriptions` refuses that separately from the token comparison.
  const { faults } = checkTranscriptions(
    (p) => (p === SOURCES.canvasPath ? 'export const NOTHING = 1;' : read(p)),
    SOURCES,
    STATUS_TOKENS,
    TREE_TOKENS,
  );
  assert.equal(faults.length, 2, 'both canvas bindings are reported unreadable');
  for (const f of faults) assert.match(f, /ForestWorldCanvas\.tsx (GROUND|CROWN)_COLOUR yielded no entry/);
});
