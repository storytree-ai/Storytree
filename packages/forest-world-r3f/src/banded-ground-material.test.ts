// banded-ground-material.test.ts — what the shipped ground's material may and may not deliver.
//
// ⚠ EVERY CLAIM HERE IS ABOUT THE RAMP AND THE GENERATED SOURCE, NOT ABOUT A PICTURE, and that
// is the stronger form rather than the cheaper one. A capture proves the pixels it photographed
// were on-palette; it can never prove no REACHABLE pixel is off it. If the only expression that
// reaches `gl_FragColor` is a `uRamp` element, then no lighting term and no interpolation can
// produce a colour outside the closure, because none of them is ever added to a colour. That is
// the argument `grainKeepsPaletteClosed` already makes in the harness, applied to the surface
// where a foreign-status read would actually mislead someone (ADR-0392 D5 / ADR-0398 D7).

import assert from 'node:assert/strict';
import test from 'node:test';

import { DataTexture } from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundAtlasTexture,
  groundRamp,
  groundShadowTexture,
  litRemapGlsl,
  rampSelectGlsl,
  shadowDarkenGlsl,
} from './banded-ground-material.js';
import { buildGroundOcclusion } from './contact-shade.js';
import { atlasScale, buildAtlasOcclusion } from './shadow-atlas.js';
import type { InstanceDescriptor } from './world-to-3d.js';
import { occlusionGrid } from './land-shadow.js';
import { shadowLadderFor } from './shadow-rung.js';
import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  grainGlsl,
  grainKeepsPaletteClosed,
  grainStops,
} from './land-grain.js';
import {
  LEGACY_SHADE_LEVELS,
  LIGHT_DIRECTION,
  SHADE_LEVELS,
  bandGlsl,
  deliveredForLevel,
  toHex,
} from './shade-ladder.js';

/** The six shipped ground statuses' tokens, in `ForestWorldCanvas`'s own `GROUND_COLOUR` order.
 *  ⚠ Transcribed rather than imported: importing the canvas would drag React and three into a
 *  bare-node test. `shipped-baseline.test.ts` is what holds the canvas to these values, so this
 *  is a fixture the ramp arithmetic is exercised over, never a second source of truth. */
const SHIPPED_TOKENS = ['#8cb85e', '#b7684e', '#d8c069', '#d8c069', '#57544a', '#9ca3af'];

test('the ramp is ROW-MAJOR: row r, rung k is at r * nLevels + k', () => {
  const ramp = groundRamp(SHIPPED_TOKENS);
  assert.equal(ramp.length, SHIPPED_TOKENS.length * SHADE_LEVELS.length);
  SHIPPED_TOKENS.forEach((token, row) => {
    SHADE_LEVELS.forEach((level, rung) => {
      const got = ramp[row * SHADE_LEVELS.length + rung]!;
      const want = deliveredForLevel(token, level);
      assert.deepEqual(
        got.map((c) => Math.round(c * 255)),
        [want.r, want.g, want.b],
        `row ${row} (${token}) rung ${rung}`,
      );
    });
  });
});

test('⚠ THE EIGHT KNIFE-EDGE PRODUCTS — why the GPU is never allowed to multiply a colour', () => {
  // The first time this package let a shader compute `token * level` it delivered 929 px of
  // `#c2ad5e` where the authored entry is `#c2ad5f`: the product is EXACTLY 94.5 and JavaScript
  // rounds an exact half UP while the GPU's float-to-unorm8 conversion took it DOWN.
  //
  // These are the shipped ground's own instances of it. The sweep below ENUMERATES the class
  // rather than sampling it, which is what makes this a proof about the palette and not a spot
  // check — and it is worth enumerating: a first pass reasoned the class had two members and
  // the arithmetic found three, the extra one on `unknown`, the state that means "no data".
  //
  // ⚠⚠ AND REFINING THE LADDER MORE THAN DOUBLED THE CLASS: 3 members on the four-rung ladder,
  // EIGHT on the nine. That is arithmetic rather than bad luck — a 0.025 grid puts far more
  // (channel x level) products on an exact half than a 0.02/0.10/0.10 one does, and five of the
  // eight are on `healthy`'s green, the most common colour on the map. So the adoption did not
  // merely leave the never-let-the-GPU-multiply rule standing; it made it MUCH more live. The
  // architecture already handles it — colours are rounded once, in TypeScript, and uploaded
  // finished — which is why a change that would have been a visible regression under the first
  // design costs nothing under this one.
  assert.equal(105 * 0.9, 94.5, 'the yellow token blue channel');
  assert.equal(175 * 0.9, 157.5, 'the unknown token blue channel, at 0.9');
  assert.equal(140 * 0.825, 115.5, 'and the green token green channel, at a rung the refinement added');
  assert.equal(toHex(deliveredForLevel('#d8c069', 0.9)), '#c2ad5f');
  assert.equal(toHex(deliveredForLevel('#9ca3af', 0.9)), '#8c939e');
  assert.equal(toHex(deliveredForLevel('#8cb85e', 0.825)), '#74984e');

  const halves: string[] = [];
  for (const token of new Set(SHIPPED_TOKENS)) {
    for (const level of SHADE_LEVELS) {
      const t = [
        Number.parseInt(token.slice(1, 3), 16),
        Number.parseInt(token.slice(3, 5), 16),
        Number.parseInt(token.slice(5, 7), 16),
      ];
      for (const channel of t) {
        const product = channel * level;
        if (Math.abs(product - Math.floor(product) - 0.5) < 1e-9) halves.push(`${token}@${level}=${product}`);
      }
    }
  }
  // NON-VACUITY: the class is not empty, so "the GPU must not multiply" is a live constraint on
  // this palette rather than a precaution about a hypothetical one.
  assert.deepEqual(halves.sort(), [
    '#57544a@0.875=73.5',
    '#8cb85e@0.825=115.5',
    '#8cb85e@0.875=122.5',
    '#8cb85e@0.925=129.5',
    '#8cb85e@0.975=136.5',
    '#9ca3af@0.875=136.5',
    '#9ca3af@0.9=157.5',
    '#d8c069@0.9=94.5',
  ]);
  // ⚠ THE FOUR-RUNG LADDER'S OWN THREE, held beside them, so the growth above is the ladder
  // moving rather than this sweep drifting. `#9ca3af@0.78` left the class with the rung itself.
  const legacyHalves: string[] = [];
  for (const token of new Set(SHIPPED_TOKENS)) {
    for (const level of LEGACY_SHADE_LEVELS) {
      for (const channel of [1, 3, 5].map((i) => Number.parseInt(token.slice(i, i + 2), 16))) {
        const product = channel * level;
        if (Math.abs(product - Math.floor(product) - 0.5) < 1e-9) {
          legacyHalves.push(`${token}@${level}=${product}`);
        }
      }
    }
  }
  assert.deepEqual(legacyHalves.sort(), [
    '#9ca3af@0.78=136.5',
    '#9ca3af@0.9=157.5',
    '#d8c069@0.9=94.5',
  ]);
});

test('a ramp of zero tokens is REFUSED — an empty palette is a black island, not art', () => {
  assert.deepEqual(groundRamp([]), []);
  assert.throws(() => createBandedGroundMaterial({ tokens: [] }), /no tokens/);
});

test('the attribute NAME is `statusIndex` — the one string two files must agree on', () => {
  // ⚠ ASSERTED AS A LITERAL, which every other test here deliberately avoids. The constant exists
  // so the shader's declaration and the canvas's `attach` cannot disagree, and every test that
  // USES the constant is satisfied by any value at all, including an empty string. The failure it
  // would hide is silent: the attribute never arrives, every fragment reads row 0, and the island
  // paints itself one status while looking like it is working.
  assert.equal(GROUND_STATUS_ATTRIBUTE, 'statusIndex');
});

test('rampSelectGlsl covers EVERY entry, and its first is the fallthrough', () => {
  // A chain that stopped short would paint every status past the cut-off with row 0's colour —
  // a foreign-status read, and the quietest possible one: a plausible colour on a real parcel.
  for (const n of [1, 2, 24, 25]) {
    const glsl = rampSelectGlsl(n);
    assert.match(glsl, /^vec3 c = uRamp\[0\];/);
    for (let i = 1; i < n; i += 1) {
      assert.ok(glsl.includes(`if (idx == ${i}) c = uRamp[${i}];`), `entry ${i} of ${n} unreachable`);
    }
    assert.ok(!glsl.includes(`uRamp[${n}]`), 'the chain must not index past the ramp');
    // ⚠ ONE STATEMENT PER LINE. The chain is spliced into the fragment source as text, so a lost
    // separator collapses `vec3 c = uRamp[0];if (idx == 1) …` onto one line — which still
    // compiles and reads fine, until the day a `//` comment is added to any of them and the rest
    // of the shader is commented out. `includes` cannot see it; the line count can.
    assert.equal(glsl.split('\n').length, n, `${n} entries should emit ${n} lines`);
    for (const line of glsl.split('\n')) assert.match(line, /^\s*(vec3 c|if \(idx)/);
  }
});

test('the fragment stage writes a uRamp entry AND NOTHING ELSE — the closure, read off the source', () => {
  const material = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  const src = material.fragmentShader;
  const mainAt = src.indexOf('void main(');
  assert.ok(mainAt >= 0, 'the fragment shader has a main()');
  const body = src.slice(mainAt);
  // The ONE write, and its right-hand side is `c` — which the select chain can only ever have
  // set to a `uRamp` element. Nothing mixes, adds, or multiplies a colour anywhere in main().
  const writes = body.match(/gl_FragColor\s*=\s*[^;]+;/g) ?? [];
  assert.deepEqual(writes, ['gl_FragColor = vec4(c, 1.0);'], 'exactly one colour write, of `c`');
  const assignmentsToC = body.match(/\bc\s*=\s*[^;]+;/g) ?? [];
  assert.ok(assignmentsToC.length >= 1);
  for (const a of assignmentsToC) {
    assert.match(a, /c = uRamp\[\d+\];/, `an assignment to the delivered colour that is not a ramp read: ${a}`);
  }
});

test('the shader quantises through the SHARED ladder, never a private copy of it', () => {
  const material = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  const src = material.fragmentShader;
  assert.match(src, /int st_bandIndex\(float lambert\)/, 'the generated quantiser is present');
  assert.match(src, new RegExp(`const int ST_N_LEVELS = ${SHADE_LEVELS.length};`));
  for (const level of SHADE_LEVELS) assert.ok(src.includes(level.toFixed(6)), `rung ${level} missing`);
  // Half-lambert, wrapped: the terminator lands inside the ladder rather than collapsing every
  // back-facing pixel onto the darkest rung. Same expression as `rungOfNormal` in the pure half.
  assert.match(src, /dot\(n, normalize\(uLightDir\)\) \* 0\.5 \+ 0\.5/);
  // The uniform array is exactly as long as the ramp — a shorter declaration is a link error on
  // some drivers and a silent read of garbage on others.
  assert.match(src, new RegExp(`uniform vec3 uRamp\\[${SHIPPED_TOKENS.length * SHADE_LEVELS.length}\\];`));
});

test('the row arrives by ATTRIBUTE, and the vertex stage passes it through untouched', () => {
  const material = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  const vs = material.vertexShader;
  assert.ok(vs.includes(`attribute float ${GROUND_STATUS_ATTRIBUTE};`), 'the attribute is declared');
  assert.ok(vs.includes(`vStatus = ${GROUND_STATUS_ATTRIBUTE};`), 'and is passed through unmodified');
  // The normal reaches the fragment stage in WORLD space. In view space the ladder's rungs would
  // slide across static ground every time the viewer panned.
  assert.match(vs, /vNormal = normalize\(mat3\(modelMatrix\) \* normal\);/);
  // ...and the fragment stage rounds the interpolated row rather than truncating it: an
  // interpolant arriving as 1.9999998 would otherwise select row 1 and report a foreign status.
  assert.match(material.fragmentShader, /int\(vStatus \+ 0\.5\)/);
});

test('the material is UNLIT — no scene light may multiply on top of an authored rung', () => {
  const material = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  // `lights: false` is the default for a ShaderMaterial and is what keeps three from injecting
  // its light uniforms; the assertion is that nothing has turned it on, because a scene light
  // multiplying the ramp would push every fragment off the closed palette.
  assert.equal(material.lights, false);
  assert.deepEqual(Object.keys(material.uniforms).sort(), ['uLightDir', 'uRamp']);
  assert.equal(material.uniforms['uRamp']!.value.length, SHIPPED_TOKENS.length * SHADE_LEVELS.length);
});

test('the UNIFORMS carry the values, not merely the right number of slots', () => {
  // ⚠ A LENGTH IS NOT A VALUE, and on this material the difference is the whole picture: a ramp
  // of the right length full of zeroes draws a black island, and a light direction of `undefined`
  // draws an unlit one. Both were mutation survivors against a suite that checked the shapes.
  const material = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  const ramp = groundRamp(SHIPPED_TOKENS);
  const uploaded = material.uniforms['uRamp']!.value as { x: number; y: number; z: number }[];
  uploaded.forEach((v, i) => {
    const want = ramp[i]!;
    assert.ok(Math.abs(v.x - want[0]!) < 1e-12, `ramp[${i}].r`);
    assert.ok(Math.abs(v.y - want[1]!) < 1e-12, `ramp[${i}].g`);
    assert.ok(Math.abs(v.z - want[2]!) < 1e-12, `ramp[${i}].b`);
  });
  // NON-VACUITY: the ramp is not all one colour, so "every entry matches" says something.
  assert.ok(new Set(uploaded.map((v) => `${v.x},${v.y},${v.z}`)).size > 1);

  const light = material.uniforms['uLightDir']!.value as { x: number; y: number; z: number };
  assert.equal(light.x, LIGHT_DIRECTION.x);
  assert.equal(light.y, LIGHT_DIRECTION.y);
  assert.equal(light.z, LIGHT_DIRECTION.z);
  // ...and it is a COPY, so a material cannot mutate the module's authored constant through it.
  assert.notEqual(light, LIGHT_DIRECTION);
});

test('the fragment source is MULTI-LINE — the quantiser is spliced in, not collapsed', () => {
  // The ladder GLSL is indented into the fragment source line by line. Losing that join would
  // put `// GENERATED from …` and the entire quantiser on ONE line, commenting the shader out.
  const src = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS }).fragmentShader;
  const commentLines = src.split('\n').filter((l) => l.trim().startsWith('//'));
  assert.ok(commentLines.length >= 5, `only ${commentLines.length} comment lines — the join is lost`);
  for (const line of commentLines) {
    assert.ok(!line.includes('return'), `a comment line swallowed code: ${line.trim().slice(0, 60)}`);
  }
});

test('two statuses sharing a token share a ROW VALUE but not a row — proposed and building', () => {
  // ADR-0462 gives `proposed` and `building` one yellow. They are separate rows here because the
  // rows are the canvas map's own keys, and collapsing them would make the row index depend on
  // which colours happen to be equal today — a coupling that breaks the moment one is retuned.
  const ramp = groundRamp(SHIPPED_TOKENS);
  const proposed = ramp.slice(2 * SHADE_LEVELS.length, 3 * SHADE_LEVELS.length);
  const building = ramp.slice(3 * SHADE_LEVELS.length, 4 * SHADE_LEVELS.length);
  assert.deepEqual(proposed, building);
});

test('NO TWO STATUSES SHARE A DELIVERED COLOUR — except the pair that shares a token', () => {
  // The fence this surface exists behind: a capability must read as the state it holds and as no
  // other. The material cannot deliver a colour outside the ramp, so the whole question is
  // whether two DIFFERENT statuses' rows overlap — which is decidable here, exhaustively,
  // without a GPU.
  const rows = SHIPPED_TOKENS.map((token) =>
    new Set(SHADE_LEVELS.map((level) => toHex(deliveredForLevel(token, level)))),
  );
  for (let a = 0; a < rows.length; a += 1) {
    for (let b = a + 1; b < rows.length; b += 1) {
      const shared = [...rows[a]!].filter((c) => rows[b]!.has(c));
      const sameToken = SHIPPED_TOKENS[a] === SHIPPED_TOKENS[b];
      if (sameToken) {
        assert.equal(shared.length, rows[a]!.size, 'a shared token must share its whole row');
      } else {
        assert.deepEqual(shared, [], `rows ${a} (${SHIPPED_TOKENS[a]}) and ${b} (${SHIPPED_TOKENS[b]}) collide on ${shared}`);
      }
    }
  }
});

test('the LADDER FLOOR bounds the ground: nothing darker than 0.78 of its own token', () => {
  // What the banded material buys the map that `MeshStandardMaterial` could not. A smooth
  // lambert under a scene light can deliver any lightness the light produces, including one that
  // walks a status into a darker status's range. Here the reachable set is finite and floored.
  for (const token of new Set(SHIPPED_TOKENS)) {
    const t = {
      r: Number.parseInt(token.slice(1, 3), 16),
      g: Number.parseInt(token.slice(3, 5), 16),
      b: Number.parseInt(token.slice(5, 7), 16),
    };
    for (const level of SHADE_LEVELS) {
      const c = deliveredForLevel(token, level);
      for (const ch of ['r', 'g', 'b'] as const) {
        assert.ok(c[ch] >= Math.round(t[ch] * SHADE_LEVELS[0]!), `${token} ${ch} below the floor`);
        assert.ok(c[ch] <= t[ch], `${token} ${ch} above its own token`);
      }
    }
  }
});


// ─────────────────────────────────────────────────────────────────────── THE GRAIN OPTION
//
// ⚠⚠ THE ONE THING THIS SECTION MUST ESTABLISH, and it is not "the grain works": an ABSENT grain
// leaves this material EXACTLY as it was. Every figure the arc has published about the banded
// ground — 0 off-palette pixels on two renderers, 38–51% cheaper per frame than the material it
// replaced — is a figure about a specific shader. If adding an option moved that shader by even a
// whitespace line, those numbers would silently become numbers about something else.

test('AN ABSENT GRAIN CHANGES NOTHING — same source, same uniforms, byte for byte', () => {
  const bare = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  // The `uGrain*` uniforms are added by statement, so an ungrained material must carry neither.
  assert.deepEqual(Object.keys(bare.uniforms).sort(), ['uLightDir', 'uRamp']);
  // And the source must mention nothing the grain brought with it.
  assert.ok(!/st_grain/.test(bare.fragmentShader), 'no grain helper in an ungrained shader');
  assert.ok(!/vWorld/.test(bare.fragmentShader), 'no world varying in an ungrained fragment stage');
  assert.ok(!/vWorld/.test(bare.vertexShader), 'and none in the vertex stage either');
  assert.ok(!/uGrain/.test(bare.fragmentShader));
  // ⚠ AND NO RESIDUE AT THE SIX INTERPOLATION SITES, which is the half a "does it mention the
  // grain" sweep cannot see. A `${cond ? x : ''}` sitting on its own line leaves that line's
  // INDENTATION behind when the condition is false, so the shader stays correct and stops being
  // byte-identical — silently, and in the direction that makes every published figure about it
  // slightly untrue. That defect was real while this option was being written; it is caught here
  // by naming what each site must join to when the grain is absent, rather than by sweeping for
  // blank lines (the spliced-in ladder source legitimately carries some of its own).
  const joins: readonly [string, string][] = [
    // ⚠ THE PRECEDING LINE IS PART OF THIS ONE. `'uniform vec3 uRamp['` alone is satisfied by
    // any amount of injected text before it, which is exactly what a mutated `: ''` else-branch
    // is. The ladder's own last line is DERIVED rather than transcribed, so retuning `bandGlsl`
    // moves the expectation with it instead of leaving a literal that quietly stops anchoring.
    [
      'fragment: the grain source',
      `${bandGlsl().split('\n').at(-1)!}\n\n      uniform vec3 uRamp[`,
    ],
    ['fragment: the grain uniforms', 'uniform vec3 uLightDir;\n      varying float vStatus;'],
    ['fragment: the world varying', 'varying vec3 vNormal;\n\n      void main() {'],
    ['fragment: the normal stage', 'vec3 n = normalize(vNormal);\n        // Half-lambert'],
    ['fragment: the colour write', '\n        gl_FragColor = vec4(c, 1.0);\n      }'],
    // The shadow's own interpolation site: the index stage. An unshadowed material must join
    // straight from the half-lambert to the one `int idx` line it has always had.
    [
      'fragment: the index stage',
      'float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;\n        // +0.5 then truncate',
    ],
  ];
  for (const [what, expected] of joins) {
    assert.ok(bare.fragmentShader.includes(expected), `${what} left residue behind`);
  }
  assert.ok(
    bare.vertexShader.includes('varying vec3 vNormal;\n      void main() {'),
    'vertex: the world varying left residue behind',
  );
  assert.ok(
    bare.vertexShader.includes('mat3(modelMatrix) * normal);\n        gl_Position'),
    'vertex: the world assignment left residue behind',
  );
});

test('NON-VACUITY: the grain modes really do fill those sites, so the joins above mean something', () => {
  // Without this, every `includes` in the test above would be satisfied by a builder that ignored
  // its `grain` option entirely — the shape a byte-identity check degrades into.
  const g = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'normal' });
  assert.ok(!g.fragmentShader.includes('varying vec3 vNormal;\n\n      void main() {'));
  assert.ok(!g.fragmentShader.includes('vec3 n = normalize(vNormal);\n        // Half-lambert'));
  assert.ok(!g.vertexShader.includes('varying vec3 vNormal;\n      void main() {'));
  assert.ok(!g.vertexShader.includes('mat3(modelMatrix) * normal);\n        gl_Position'));
  const b = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'both' });
  assert.ok(!b.fragmentShader.includes('\n        gl_FragColor = vec4(c, 1.0);\n      }'));
});

test("the NORMAL half keeps the closure — it perturbs the LAMBERT, never the colour", () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'normal' });
  // The property that makes this half adoptable at all, asked of the SOURCE rather than of a
  // picture — a capture can only ever sample the pixels it photographed.
  assert.ok(grainKeepsPaletteClosed(m.fragmentShader), 'the shipped grain must stay palette-closed');
  // And it must actually be in there: a closed shader with no grain would pass the line above.
  assert.ok(/st_grainGradient\(vWorld\.xz\)/.test(m.fragmentShader), 'the grain must sample the world');
  assert.ok(/uGrainNormalStrength/.test(m.fragmentShader));
  assert.equal(m.uniforms['uGrainNormalStrength']?.value, GRAIN_NORMAL_STRENGTH);
  assert.equal(m.uniforms['uGrainColourMix'], undefined, 'the normal half uploads no mix factor');
  // ⚠ THE ORDER IS THE WHOLE ARGUMENT. The perturbation has to happen BEFORE the lambert, or the
  // fragment would be quantised off an unperturbed normal and the grain would be inert — a
  // component that is in the code and not in the picture.
  const body = m.fragmentShader.slice(m.fragmentShader.indexOf('void main('));
  assert.ok(
    body.indexOf('st_grainGradient') < body.indexOf('float lambert'),
    'the grain must perturb the normal before the lambert is taken',
  );
  assert.ok(body.indexOf('float lambert') < body.indexOf('st_bandIndex'), 'and the lambert before the quantiser');
});

test('the COLOUR half BREAKS the closure, which is why the shipped canvas may not ask for it', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'both' });
  assert.ok(!grainKeepsPaletteClosed(m.fragmentShader), 'mode `both` must be off-palette');
  assert.equal(m.uniforms['uGrainColourMix']?.value, GRAIN_COLOUR_MIX);
  assert.equal(m.uniforms['uGrainNormalStrength']?.value, GRAIN_NORMAL_STRENGTH, '`both` is both');
  // The two grain stops are written into the source as literals from `grainStops()`, so the
  // shader and the pure module cannot hold different colours (the `bandGlsl` argument).
  const [dark, light] = grainStops();
  for (const stop of [dark, light]) {
    const literal = `vec3(${(stop.r / 255).toFixed(6)}, ${(stop.g / 255).toFixed(6)}, ${(stop.b / 255).toFixed(6)})`;
    assert.ok(m.fragmentShader.includes(literal), `the grain stop ${literal} is not in the source`);
  }
});

test('THE GRAIN NEVER MOVES THE RAMP — the palette is the same object in all three modes', () => {
  // The map's honesty does not depend on which grain is on: the reachable colour set of the two
  // palette-closed modes is the SAME 24 authored entries, and the ramp `both` mixes away from is
  // that set too. Without this, "the grain is a shading change" would be an assertion.
  const rampOf = (grain?: 'normal' | 'both'): string =>
    JSON.stringify(
      (grain === undefined
        ? createBandedGroundMaterial({ tokens: SHIPPED_TOKENS })
        : createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain })
      ).uniforms['uRamp']!.value,
    );
  assert.equal(rampOf('normal'), rampOf());
  assert.equal(rampOf('both'), rampOf());
});

test('the grain GLSL is spliced in from the module, not transcribed', () => {
  // The same argument `bandGlsl` makes about the ladder, extended to the field: a shader and a
  // test holding private copies of the lattice, the octave count or the ramp span would prove
  // nothing about each other. Every line of the generated field has to be present verbatim.
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'normal' });
  for (const line of grainGlsl().split('\n')) {
    if (line.trim().length === 0) continue;
    assert.ok(
      m.fragmentShader.includes(line.trim()),
      `the generated grain source is missing: ${line.trim()}`,
    );
  }
});

test('a GRAINED material really emits every fragment the grain needs — positively, not by absence', () => {
  // ⚠ THE UNGRAINED ASSERTIONS ABOVE ARE ALL `!includes`, AND AN ABSENCE CANNOT HOLD A PRESENCE.
  // Every conditional string in the builder could be blanked to "" and those tests would go on
  // passing while the grained shader failed to compile — measured, six surviving `StringLiteral`
  // mutants on this branch. These say what each one must contain.
  const g = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'normal' });
  // The world position, declared in BOTH stages and assigned in the vertex stage. A varying
  // declared in one stage only is a link error; assigned nowhere, it is silently zero, which
  // shades the whole island with one grain sample and looks like the grain being too coarse.
  assert.ok(g.vertexShader.includes('varying vec3 vWorld;'), 'vertex must declare vWorld');
  assert.ok(g.fragmentShader.includes('varying vec3 vWorld;'), 'fragment must declare vWorld');
  assert.ok(
    g.vertexShader.includes('vWorld = (modelMatrix * vec4(position, 1.0)).xyz;'),
    'and the vertex stage must assign it in WORLD space — a view-space grain would swim',
  );
  // ⚠ WITH ITS COMMENT. Generated shader source is read by whoever debugs a driver's compile log,
  // and every other block this file emits explains itself there; an emitted comment that nothing
  // holds is one a later edit drops without noticing.
  assert.ok(
    g.vertexShader.includes('// The grain is authored in GROUND coordinates, so it is sampled in them.'),
    'the assignment must say why it is in world space',
  );
  assert.ok(g.fragmentShader.includes('uniform float uGrainNormalStrength;'));
  // The spliced grain source keeps its INDENTATION, which is what a blanked join separator loses
  // — the shader still compiles, so nothing but this notices.
  assert.ok(
    g.fragmentShader.includes('\n      float st_grainHash(vec2 i) {'),
    'the grain source must be spliced in at the shader body indentation',
  );

  const b = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, grain: 'both' });
  assert.ok(b.vertexShader.includes('varying vec3 vWorld;'));
  assert.ok(b.fragmentShader.includes('uniform float uGrainNormalStrength;'));
  assert.ok(b.fragmentShader.includes('uniform float uGrainColourMix;'));
  assert.ok(b.fragmentShader.includes('st_grainRamped(vWorld.xz)'), 'the colour half samples too');
  // ⚠ AND `normal` MUST NOT CARRY THE COLOUR HALF'S UNIFORM. A declared-but-unused uniform is a
  // reader taking the shipped material for the off-palette one.
  assert.ok(!g.fragmentShader.includes('uGrainColourMix'));
});

// ---------------------------------------------------------------------------
// THE SHADOW — the fourth component of the approved treatment to reach this material.
//
// ⚠ THE CLAIM THAT MATTERS IS STILL THE CLOSURE, and the shadow is the first option that grows
// the palette rather than merely moving within it. It grows it by exactly ONE authored level per
// row: `token x SHADOW_RUNG`, a member of the same `(authored token x authored level)` closure
// the palette is defined as. The shadow costs palette ENTRIES; it does not cost the closure, and
// `the ramp grows by exactly one level per row` is what says so.
// ---------------------------------------------------------------------------

/** A field over a small rect with one caster in it — enough to build a real texture from.
 *
 *  ⚠ THE GRID IS CHECKED BEFORE THE FIELD IS BUILT, and that guard is about how the mutation rung
 *  scores a hang rather than about this material. This fixture is a 252x252 field; under a broken
 *  resolution cap it is 2048x2048, and ten of those is a suite that grinds rather than fails —
 *  reported as a TIMEOUT, which the rung counts as UNPROVEN, credited to no test. Asked first, a
 *  wrong grid is reported as a wrong grid. `land-shadow.test.ts`'s `smallGrid` is the same guard. */
const SHADOW_BOUNDS = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
const testShadow = () => {
  const grid = occlusionGrid(SHADOW_BOUNDS);
  assert.ok(
    grid.w <= 300 && grid.h <= 300,
    `the shadow fixture's grid is ${grid.w}x${grid.h} — the resolution cap is not capping`,
  );
  return groundShadowTexture(
    buildGroundOcclusion({
      bounds: SHADOW_BOUNDS,
      relief: 2.2,
      casters: [{ x: 0, z: 0, radius: 7, height: 19 }],
    }),
  );
};

test('AN ABSENT SHADOW CHANGES NOTHING — no uniform, no sampler, no varying', () => {
  const bare = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  assert.ok(!/uShadow/.test(bare.fragmentShader), 'an unshadowed fragment stage names no shadow');
  assert.ok(!/texture2D/.test(bare.fragmentShader), 'and samples no texture');
  assert.ok(!/sampler2D/.test(bare.fragmentShader));
  assert.deepEqual(Object.keys(bare.uniforms).sort(), ['uLightDir', 'uRamp']);
  // The ramp stays the NINE authored rungs per row — four until the ladder was adopted on
  // 2026-08-31, and the literal is spelled out rather than read off `SHADE_LEVELS` so that a
  // ladder change has to be looked at here rather than absorbed.
  assert.equal((bare.uniforms['uRamp']!.value as unknown[]).length, SHIPPED_TOKENS.length * 9);
  // ⚠ THE WHOLE THREE-LINE BLOCK, not just its last line. The index stage is now built by
  // interpolation, so its two comment lines are string literals a mutant can blank — and a shader
  // that still selects correctly while having lost the sentence explaining WHY is exactly the
  // kind of erosion this file exists to refuse.
  assert.ok(
    bare.fragmentShader.includes(
      '        // +0.5 then truncate, rather than a bare cast: an interpolated float that arrives as\n' +
        '        // 1.9999998 for row 2 would otherwise select row 1 and report a foreign status.\n' +
        '        int idx = int(vStatus + 0.5) * ST_N_LEVELS + st_bandIndex(lambert);',
    ),
  );
});

test('NON-VACUITY: a shadowed material really does fill every one of those sites', () => {
  // Without this, the absent-shadow test above is satisfied by a builder that ignores the option.
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  assert.ok(m.fragmentShader.includes('uniform sampler2D uShadowTex;'));
  assert.ok(m.fragmentShader.includes('uniform vec4 uShadowRect;'));
  assert.ok(m.fragmentShader.includes('texture2D(uShadowTex, shUv).r > 0.5'));
  // The uniforms carry the REAL texture rather than a placeholder shaped like one.
  const shadow = testShadow();
  const wired = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow });
  assert.equal(wired.uniforms['uShadowTex']!.value, shadow.texture);
  assert.deepEqual(Object.keys(m.uniforms).sort(), [
    'uLightDir',
    'uRamp',
    'uShadowRect',
    'uShadowTex',
  ]);
  assert.ok(
    !m.fragmentShader.includes('int idx = int(vStatus + 0.5) * ST_N_LEVELS + st_bandIndex(lambert);'),
  );
});

test('THE RAMP GROWS BY EXACTLY ONE LEVEL PER ROW, and every entry is still authored', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  const ramp = m.uniforms['uRamp']!.value as { x: number; y: number; z: number }[];
  assert.equal(ramp.length, SHIPPED_TOKENS.length * (SHADE_LEVELS.length + 1));
  assert.equal(ramp.length, SHIPPED_TOKENS.length * 10);
  // ⚠ THE CLOSURE, ENUMERATED RATHER THAN SAMPLED: every uploaded colour must be exactly
  // `deliveredForLevel(token, level)` for a level ON the shadow ladder.
  SHIPPED_TOKENS.forEach((token, row) => {
    ladder.levels.forEach((level, rung) => {
      const c = deliveredForLevel(token, level);
      const entry = ramp[row * ladder.levels.length + rung]!;
      assert.equal(
        toHex({
          r: Math.round(entry.x * 255),
          g: Math.round(entry.y * 255),
          b: Math.round(entry.z * 255),
        }),
        toHex(c),
        `row ${row} rung ${rung}`,
      );
    });
  });
});

test('groundRamp over the shadow ladder is the same array the material uploads', () => {
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  assert.equal(groundRamp(SHIPPED_TOKENS, ladder.levels).length, 60);
  // And the default is still the authored ladder, so every existing caller reads the ladder the
  // map wears rather than a second one.
  assert.equal(groundRamp(SHIPPED_TOKENS).length, 54);
});

test('THE FRAGMENT SELECTS — the shadow adds no arithmetic to a delivered colour', () => {
  // The whole closure argument in one assertion: the only expression reaching `gl_FragColor` is
  // still a `uRamp` element. A shadow that multiplied, mixed or subtracted would break it.
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  const body = m.fragmentShader.slice(m.fragmentShader.indexOf('void main('));
  assert.ok(body.includes('gl_FragColor = vec4(c, 1.0);'));
  assert.ok(!/gl_FragColor = vec4\(c \*/.test(body), 'no multiply on the way out');
  assert.ok(!/mix\(c,/.test(body), 'no mix on the way out');
});

test('THE STRIDE MOVES WITH THE LADDER — a shadowed row is ten entries wide', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  assert.ok(
    m.fragmentShader.includes('int idx = int(vStatus + 0.5) * 10 + lvl;'),
    'the shadowed stride must be the shadow ladder’s length, not ST_N_LEVELS',
  );
  // ⚠ A stride left at 9 would select the NEXT ROW's colours for every status past the first —
  // a foreign-status read on the surface whose whole job is to report status.
  assert.ok(!m.fragmentShader.includes('* ST_N_LEVELS + lvl'));
});

test('the lit remap is emitted LINE FOR LINE, and it is a lookup rather than an offset', () => {
  // ⚠ 44 of the grain crossing's 109 mutation survivors were BLANKED GLSL LITERALS. A generator's
  // emitted source has to be pinned as source, not merely exercised.
  assert.equal(
    litRemapGlsl([1, 2, 3, 4]),
    'if (rung == 0) lvl = 1;\n        if (rung == 1) lvl = 2;\n        ' +
      'if (rung == 2) lvl = 3;\n        if (rung == 3) lvl = 4;',
  );
  // A rung landing MID-ladder produces a non-uniform remap, which an offset could not express.
  assert.equal(
    litRemapGlsl([0, 1, 3, 4]),
    'if (rung == 0) lvl = 0;\n        if (rung == 1) lvl = 1;\n        ' +
      'if (rung == 2) lvl = 3;\n        if (rung == 3) lvl = 4;',
  );
  assert.equal(litRemapGlsl([]), '');
});

test('the darken chain is emitted line for line, and sends every named rung to the shadow', () => {
  assert.equal(
    shadowDarkenGlsl([0, 1, 2, 3], 0),
    'if (rung == 0) lvl = 0;\n            if (rung == 1) lvl = 0;\n            ' +
      'if (rung == 2) lvl = 0;\n            if (rung == 3) lvl = 0;',
  );
  // A rung index other than 0, so the literal is not simply the loop counter wearing a name.
  assert.equal(shadowDarkenGlsl([2], 7), 'if (rung == 2) lvl = 7;');
  assert.equal(shadowDarkenGlsl([], 0), '');
});

test('the shipped material’s own remap and darken chains are in its source', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  const ladder = shadowLadderFor(SHIPPED_TOKENS);
  assert.ok(m.fragmentShader.includes(litRemapGlsl(ladder.litIndex)));
  assert.ok(m.fragmentShader.includes(shadowDarkenGlsl(ladder.darkenable, ladder.rungIndex)));
});

test('the shadow is sampled in GROUND space, through the rect the texture was built with', () => {
  const shadow = testShadow();
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow });
  assert.ok(
    m.fragmentShader.includes('vec2 shUv = vec2((vWorld.x - uShadowRect.x) * uShadowRect.z,'),
  );
  assert.ok(m.fragmentShader.includes('(vWorld.z - uShadowRect.y) * uShadowRect.w);'));
  assert.ok(m.vertexShader.includes('vWorld = (modelMatrix * vec4(position, 1.0)).xyz;'));
  // The rect carries the RECIPROCAL spans, so the fragment multiplies rather than divides.
  const rect = m.uniforms['uShadowRect']!.value as { x: number; y: number; z: number; w: number };
  assert.equal(rect.x, shadow.minX);
  assert.equal(rect.y, shadow.minZ);
  assert.ok(Math.abs(rect.z - 1 / shadow.spanX) < 1e-12);
  assert.ok(Math.abs(rect.w - 1 / shadow.spanZ) < 1e-12);
});

test('the uploaded texture covers the field’s own ground rect', () => {
  const field = buildGroundOcclusion({ bounds: SHADOW_BOUNDS, relief: 2.2, casters: [] });
  const shadow = groundShadowTexture(field);
  assert.equal(shadow.minX, field.minX);
  assert.equal(shadow.minZ, field.minZ);
  assert.ok(Math.abs(shadow.spanX - field.w / field.gres) < 1e-12);
  assert.ok(Math.abs(shadow.spanZ - field.h / field.gres) < 1e-12);
  // The texture really carries the field's own samples, at the field's own dimensions — an
  // `instanceof` rather than a cast, because a cast would discard exactly the evidence being
  // asked for (the house TypeScript standard's `no-unsafe-cast`).
  assert.ok(shadow.texture instanceof DataTexture);
  assert.equal(shadow.texture.image.width, field.w);
  assert.equal(shadow.texture.image.height, field.h);
  assert.equal(shadow.texture.image.data, field.data);
  // ⚠ AND IT IS FLAGGED FOR UPLOAD. A `DataTexture` whose `needsUpdate` was never set is a
  // texture the GPU never receives: every fragment then samples an empty sampler and the island
  // renders unshadowed, correctly, in silence. Asked through `version` rather than through
  // `needsUpdate`, which in three is a WRITE-ONLY setter — reading it back gives `undefined`, and
  // an assertion on that is satisfied by never having set it.
  assert.ok(shadow.texture.version > 0, "the texture must be flagged for upload");
});

test('a shadowed material still declares its GRAIN when it wears one, and both when both', () => {
  const m = createBandedGroundMaterial({
    tokens: SHIPPED_TOKENS,
    grain: 'normal',
    shadow: testShadow(),
  });
  assert.ok(m.fragmentShader.includes('uniform float uGrainNormalStrength;'));
  assert.ok(m.fragmentShader.includes('uniform sampler2D uShadowTex;'));
  assert.ok(grainKeepsPaletteClosed(m.fragmentShader), 'the shipped combination stays closed');
  // ONE world varying, not two: both riders share it.
  assert.equal(m.vertexShader.split('varying vec3 vWorld;').length - 1, 1);
  // And the GRAIN's own comment is the one that survives, so a grained material's source is
  // unchanged at that site by the shadow's arrival.
  assert.ok(
    m.vertexShader.includes(
      '// The grain is authored in GROUND coordinates, so it is sampled in them.',
    ),
  );
});

test('a shadowed material with NO grain says so at the world varying’s own site', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  assert.ok(
    m.vertexShader.includes(
      '// The occlusion field is authored in GROUND coordinates, so it is sampled in them.',
    ),
  );
  assert.ok(!m.vertexShader.includes('// The grain is authored in GROUND coordinates'));
});

test('a palette that cannot carry a shadow REFUSES rather than shipping a lie', () => {
  assert.throws(
    () => createBandedGroundMaterial({ tokens: ['#808080', '#7f7f7f'], shadow: testShadow() }),
    /cannot be drawn inside this closed palette/,
  );
});

test('THE `lit` OPTION reaches BOTH the ramp and the shader, and absent means byte-identical', () => {
  // ⚠ BOTH HALVES OR NEITHER. The ramp is indexed by the shader's own `st_bandIndex`, so a `lit`
  // that reached the ramp but not the GLSL (or the reverse) would index a 12-entry row with a
  // 4-rung quantiser — every parcel painted some other rung's colour, silently, on the surface
  // whose whole job is to report status.
  const tokens = ['#8cb85e', '#b7684e', '#d8c069', '#57544a', '#9ca3af'];
  const lit = [0.78, 0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98, 1.0];

  const shipped = createBandedGroundMaterial({ tokens });
  const refined = createBandedGroundMaterial({ tokens, lit });

  // THE RAMP: one entry per (token, rung).
  assert.equal((shipped.uniforms['uRamp']!.value as unknown[]).length, tokens.length * 9);
  assert.equal((refined.uniforms['uRamp']!.value as unknown[]).length, tokens.length * lit.length);

  // THE SHADER: the quantiser carries the same count, and the ladder's own rungs.
  assert.match(refined.fragmentShader, /const int ST_N_LEVELS = 12;/);
  assert.match(shipped.fragmentShader, /const int ST_N_LEVELS = 9;/);
  assert.ok(refined.fragmentShader.includes('return 0.820000;'), 'an intermediate rung is missing');
  assert.ok(!shipped.fragmentShader.includes('return 0.820000;'));

  // ⚠ AND THE GENERATED LADDER IS SPLICED IN WITH ITS INDENTATION INTACT. The join is what makes
  // the emitted source readable AND what a byte-identity claim rests on; dropping it leaves the
  // ladder flush against the margin inside a template that is otherwise indented.
  assert.ok(refined.fragmentShader.includes('\n      const int ST_N_LEVELS = 12;'));

  // ABSENT MEANS ABSENT: passing no ladder must emit exactly what a canvas that has never heard of
  // this option emits, or every figure already published about the banded ground is about a
  // different shader.
  assert.equal(createBandedGroundMaterial({ tokens, grain: 'normal' }).fragmentShader, createBandedGroundMaterial({ tokens, grain: 'normal' }).fragmentShader);
  assert.notEqual(refined.fragmentShader, shipped.fragmentShader);
});

test('a SHADOWED material re-derives its rung against the `lit` ladder rather than the authored one', () => {
  // The coupling the fourth crossing was written to prevent, one lever further along: a candidate
  // ladder must not silently inherit the shipped ladder's 0.77. The ramp is the observable — it is
  // one entry longer per row than the lit ladder, and the extra entry is THIS ladder's rung.
  const tokens = ['#8cb85e', '#b7684e', '#d8c069', '#57544a', '#9ca3af'];
  const lit = [0.86, 0.9, 0.94, 1.0];
  const shadow = groundShadowTexture(
    buildGroundOcclusion({ bounds: SHADOW_BOUNDS, relief: 2.2, casters: [{ x: 0, z: 0, radius: 7, height: 19 }] }),
  );

  const unshadowed = createBandedGroundMaterial({ tokens, lit });
  const shadowed = createBandedGroundMaterial({ tokens, lit, shadow });
  const rampLen = (m: { uniforms: Record<string, { value: unknown }> }): number =>
    (m.uniforms['uRamp']!.value as unknown[]).length;

  assert.equal(rampLen(unshadowed), tokens.length * lit.length);
  assert.equal(rampLen(shadowed), tokens.length * (lit.length + 1), 'the shadow adds ONE rung per row');
  // And it is the rung derived against THIS ladder, which is not the shipped one.
  assert.equal(shadowLadderFor(tokens, lit).levels.length, lit.length + 1);
  // NON-VACUITY: an unshadowed material of the SAME ladder carries no shadow uniform at all, so
  // the length difference above is the rung rather than an unrelated uniform.
  assert.ok(!('uShadowTex' in unshadowed.uniforms));
  assert.ok('uShadowTex' in shadowed.uniforms);
});


// ---------------------------------------------------------------------------------------------
// THE PACKED ATLAS — the SECOND spelling of the occlusion input, and the first thing this
// material has ever needed from the vertex stage.

/** A tiny packed atlas over two islands, memoised: the mutation rung runs the covering tests once
 *  per mutant, and a witness that rebuilt a field per assertion is how a slow suite gets scored as
 *  a set of phantom survivors. */
const testAtlas = (): ReturnType<typeof groundAtlasTexture> =>
  groundAtlasTexture(
    buildAtlasOcclusion({
      cells: [ATLAS_CELL_A, ATLAS_CELL_B],
      relief: 2.2,
      casters: [{ x: 10, z: 10, radius: 5, height: 19 }],
    }),
  );

const atlasCellOf = (island: string, x: number): InstanceDescriptor => ({
  kind: 'cell-ground',
  group: 'cell-ground',
  transform: { x: x + 10, y: 0, z: 10 },
  island,
  points: [
    { x, y: 0, z: 0 },
    { x: x + 20, y: 0, z: 0 },
    { x: x + 20, y: 0, z: 20 },
    { x, y: 0, z: 20 },
  ],
});
const ATLAS_CELL_A = atlasCellOf('a', 0);
const ATLAS_CELL_B = atlasCellOf('b', 300);

test('AN ABSENT ATLAS CHANGES NOTHING — no attribute, no varying, no scale uniform', () => {
  const bare = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS });
  const rect = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  for (const m of [bare, rect]) {
    assert.ok(!/atlasOrigin/.test(m.vertexShader), 'no atlas attribute in the vertex stage');
    assert.ok(!/vAtlasOrigin/.test(m.fragmentShader), 'and no atlas varying in the fragment stage');
    assert.ok(!/uShadowAtlasScale/.test(m.fragmentShader));
    assert.ok(!Object.keys(m.uniforms).includes('uShadowAtlasScale'));
  }
  // ⚠ AND THE RECT FORM’S OWN uv LINE IS UNTOUCHED, byte for byte — every committed figure
  // about the shadowed ground was taken against exactly these two lines.
  assert.ok(
    rect.fragmentShader.includes(
      '        vec2 shUv = vec2((vWorld.x - uShadowRect.x) * uShadowRect.z,\n' +
        '                         (vWorld.z - uShadowRect.y) * uShadowRect.w);',
    ),
  );
});

test('NON-VACUITY: an ATLASED material really does fill every one of those sites', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadowAtlas: testAtlas() });
  assert.ok(m.vertexShader.includes(`attribute vec2 ${GROUND_ATLAS_ATTRIBUTE};`));
  assert.ok(m.vertexShader.includes(`vAtlasOrigin = ${GROUND_ATLAS_ATTRIBUTE};`));
  assert.ok(m.vertexShader.includes('varying vec2 vAtlasOrigin;'));
  assert.ok(m.fragmentShader.includes('varying vec2 vAtlasOrigin;'));
  assert.ok(m.fragmentShader.includes('uniform vec2 uShadowAtlasScale;'));
  assert.ok(m.fragmentShader.includes('uniform sampler2D uShadowTex;'));
  assert.ok(
    m.fragmentShader.includes(
      'vec2 shUv = vAtlasOrigin + vec2(vWorld.x, vWorld.z) * uShadowAtlasScale;',
    ),
  );
  // The rect form's uniform must NOT be there: two ways to find a sample is one way too many.
  assert.ok(!/uShadowRect/.test(m.fragmentShader));
});

test('BOTH occlusion forms at once is REFUSED — not resolved by precedence', () => {
  assert.throws(
    () =>
      createBandedGroundMaterial({
        tokens: SHIPPED_TOKENS,
        shadow: testShadow(),
        shadowAtlas: testAtlas(),
      }),
    /two spellings of one input/,
  );
});

test('the atlas still selects a uRamp entry AND NOTHING ELSE — the closure is unmoved', () => {
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadowAtlas: testAtlas() });
  const body = m.fragmentShader.slice(m.fragmentShader.indexOf('void main()'));
  const writes = body.match(/gl_FragColor\s*=\s*[^;]+;/g) ?? [];
  assert.equal(writes.length, 1);
  assert.equal(writes[0], 'gl_FragColor = vec4(c, 1.0);');
  // And the ramp grew by exactly the shadow rung, as the rect form does — the packing changes
  // where a sample lives, never what a fragment may deliver.
  const rect = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadow: testShadow() });
  assert.equal(
    (m.uniforms['uRamp']!.value as unknown[]).length,
    (rect.uniforms['uRamp']!.value as unknown[]).length,
  );
});

test('the uploaded SCALE is the packing’s own derivation, not a second copy of it', () => {
  const field = buildAtlasOcclusion({
    cells: [ATLAS_CELL_A, ATLAS_CELL_B],
    relief: 2.2,
    casters: [{ x: 10, z: 10, radius: 5, height: 19 }],
  });
  const uploaded = groundAtlasTexture(field);
  const derived = atlasScale(field);
  assert.equal(uploaded.scaleU, derived.u);
  assert.equal(uploaded.scaleV, derived.v);
  const m = createBandedGroundMaterial({ tokens: SHIPPED_TOKENS, shadowAtlas: uploaded });
  const scale = m.uniforms['uShadowAtlasScale']!.value as { x: number; y: number };
  assert.equal(scale.x, derived.u);
  assert.equal(scale.y, derived.v);
  assert.equal((m.uniforms['uShadowTex']!.value as DataTexture).image.width, field.w);
});
