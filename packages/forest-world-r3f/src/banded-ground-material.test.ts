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

import {
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundRamp,
  rampSelectGlsl,
} from './banded-ground-material.js';
import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  grainGlsl,
  grainKeepsPaletteClosed,
  grainStops,
} from './land-grain.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, deliveredForLevel, toHex } from './shade-ladder.js';

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

test('⚠ THE THREE KNIFE-EDGE PRODUCTS — why the GPU is never allowed to multiply a colour', () => {
  // The first time this package let a shader compute `token * level` it delivered 929 px of
  // `#c2ad5e` where the authored entry is `#c2ad5f`: the product is EXACTLY 94.5 and JavaScript
  // rounds an exact half UP while the GPU's float-to-unorm8 conversion took it DOWN.
  //
  // These are the shipped ground's own instances of it. The sweep below ENUMERATES the class
  // rather than sampling it, which is what makes this a proof about the palette and not a spot
  // check — and it is worth enumerating: a first pass reasoned the class had two members and
  // the arithmetic found three, the extra one on `unknown`, the state that means "no data".
  assert.equal(105 * 0.9, 94.5, 'the yellow token blue channel');
  assert.equal(175 * 0.9, 157.5, 'the unknown token blue channel, at 0.9');
  assert.equal(175 * 0.78, 136.5, 'and again at 0.78 — two of the four rungs of unknown');
  assert.equal(toHex(deliveredForLevel('#d8c069', 0.9)), '#c2ad5f');
  assert.equal(toHex(deliveredForLevel('#9ca3af', 0.9)), '#8c939e');
  assert.equal(toHex(deliveredForLevel('#9ca3af', 0.78)), '#7a7f89');

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
    ['fragment: the grain source', 'uniform vec3 uRamp['],
    ['fragment: the grain uniforms', 'uniform vec3 uLightDir;\n      varying float vStatus;'],
    ['fragment: the world varying', 'varying vec3 vNormal;\n\n      void main() {'],
    ['fragment: the normal stage', 'vec3 n = normalize(vNormal);\n        // Half-lambert'],
    ['fragment: the colour write', '\n        gl_FragColor = vec4(c, 1.0);\n      }'],
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
