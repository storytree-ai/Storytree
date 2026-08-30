// banded-ground-material.ts — THE SHIPPED GROUND'S MATERIAL: the authored shade ladder, on the
// GPU, over a merged multi-status buffer. Browser-bound (it imports three), so it is exported
// via the `./canvas` subpath alongside `ForestWorldCanvas` and NEVER from the pure root barrel
// — the provability firewall holds (`world-to-3d.ts` stays importable under bare `node:test`).
// Its thinking half is `shade-ladder.ts`, which is pure and node-provable; this file only
// carries that contract onto a GPU.
//
// ⚠⚠ WHY THIS IS A SECOND MATERIAL AND NOT `harness/banded-material.ts` MOVED. That one takes
// ONE authored token per material, because the experiment island builds a mesh per prop role and
// can afford a material each. The shipped ground is the opposite shape by construction: 164
// arbitrary polygons that cannot share a geometry, merged into ONE buffer so the island costs one
// draw call instead of 164 (`cell-ground-geometry.ts`). One buffer carrying many statuses cannot
// wear a one-token material. What the two DO share — the ladder, the light, the quantiser, the
// `token x level` arithmetic — is `shade-ladder.ts`, which both import and neither copies.
//
// ⚠⚠ THE GPU PERFORMS NO COLOUR ARITHMETIC, AND THAT IS THE WHOLE DESIGN. The obvious shader
// takes the parcel's colour as a vertex attribute and multiplies it by the rung's level. It is
// wrong here for a measured reason: the GPU's float-to-unorm8 conversion resolves an exact half
// DOWN where `Math.round` takes it UP, which delivered 929 px of `#c2ad5e` against the authored
// `#c2ad5f` the first time this package tried it (`bandLevelIndex`). THREE of this map's own
// products land on exactly that knife edge — `#d8c069`'s blue at level 0.9 (94.5) and
// `#9ca3af`'s at both 0.9 (157.5) and 0.78 (136.5), so TWO of `unknown`'s four rungs are on it
// — and multiplying on the GPU would ship the same defect on the state that means "no data".
// Instead the ramp is built ONCE in TypeScript by `deliveredForLevel`, uploaded as
// finished colours, and the fragment stage SELECTS one. "The delivered pixel is an authored
// entry" is then a bit-identity rather than an approximation.
//
// ⚠ THE FRAGMENT WRITES AUTHORED sRGB STRAIGHT THROUGH, and this is deliberate rather than an
// oversight about colour management. three appends no output transform to a `ShaderMaterial`'s
// `main()` — the `<colorspace_fragment>` chunk lives inside the BUILT-IN materials' sources — so
// what this shader writes is what the framebuffer holds. The ramp is therefore uploaded as the
// authored bytes over 255, with no `THREE.Color` in the path to linearise it. Everything ELSE on
// the canvas (crowns, the story tree's bole, the wisps) keeps three's ordinary colour-managed
// path; nothing here disables `ColorManagement`, because doing so would silently repaint them.
//
// ⚠ AND IT IS UNLIT — no `ambientLight`, no `directionalLight`, no scene light of any kind
// reaches it. The lambert term is computed here against `LIGHT_DIRECTION`, the authored world
// direction the whole land is shaded by, because the ladder's rungs are only meaningful against
// the light they were authored under. A scene light multiplying on top would push every fragment
// off the ladder — which is what a banded ground under `MeshStandardMaterial` would be, and the
// reason this is a material rather than a vertex-colour trick.

import { ShaderMaterial, Vector3 } from 'three';

import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  grainGlsl,
  grainStops,
} from './land-grain.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, bandGlsl, deliveredForLevel } from './shade-ladder.js';

/** The attribute a merged ground buffer carries its parcel's RAMP ROW in — the name the shader
 *  declares and the name `ForestWorldCanvas` attaches `CellGroundGeometry.statuses` under. It is
 *  a constant rather than two string literals because a mismatch between them is silent: the
 *  attribute simply never arrives, every fragment reads row 0, and the island paints itself one
 *  status while looking like it is working. */
export const GROUND_STATUS_ATTRIBUTE = 'statusIndex';

/**
 * WHICH HALF of the grain octave the shipped ground wears — and they are separate options rather
 * than one switch because THEY LAND ON OPPOSITE SIDES OF THIS MATERIAL'S WHOLE GUARANTEE.
 *
 *   - `normal` perturbs the lambert BEFORE the quantiser, so the fragment still writes a
 *     `uRamp[...]` entry and the palette closure is untouched. It is what ships.
 *   - `both` additionally mixes a noise-driven ramp INTO the delivered colour, which is the
 *     mechanism the approved Cycles render used and is OFF-PALETTE BY CONSTRUCTION.
 *
 * ⚠⚠ `both` IS NOT ADOPTABLE ON THIS SURFACE TODAY, AND THAT IS A MEASUREMENT RATHER THAN A
 * POLICY. `harness/grain-status-reading.ts` drove all six shipped ground tokens through the
 * colour half's mix arithmetically — exhaustively, since the mix is linear in the grain scalar —
 * and asked the house reader model whether every reachable colour still reports its own status.
 * At the authored fac of 0.13 it does not: the `proposed`/`building` yellow at the ladder's two
 * darkest rungs (0.78, 0.80) walks into `healthy`'s green, and the largest fac every reading
 * survives is 0.031. That is a fence-1 failure (ADR-0392 D5 / ADR-0398 D7) rather than an
 * aesthetic one. `both` exists here so the comparison the owner looks at can show what the
 * closure costs, and so the fork can be put to him against a picture.
 *
 * There is deliberately NO `colour`-only mode, which `harness/banded-material.ts` does have: the
 * experiment needed to isolate the two halves to cost them separately, and that costing is done
 * (`docs/research/chapter2-frame-cost-2026-08-28/`). A mode nothing on this surface would ever
 * ask for is a branch no test can motivate.
 */
export type GroundGrainMode = 'normal' | 'both';

export interface BandedGroundMaterialOptions {
  /** The authored `#rrggbb` ground token for each ramp ROW, in row order. Row `i` is what a
   *  vertex carrying `statusIndex === i` wears. The caller owns the ordering and must use the
   *  same one for `cellGroundGeometry`'s `index` resolver — `ForestWorldCanvas` derives both
   *  from one `Map`, so there is one ordering rather than two that agree today. */
  tokens: readonly string[];
  /** WEAR the high-frequency grain octave. Absent means the generated shader source is
   *  byte-identical to the one this file emitted before the grain existed — the same claim
   *  `harness/banded-material.ts` makes about its own options, and
   *  `banded-ground-material.test.ts` asserts it rather than stating it. */
  grain?: GroundGrainMode;
}

/** A delivered colour as a GLSL literal, 0..1 per channel. The grain stops are AUTHORED
 *  constants, so they are written into the source rather than uploaded — the same argument
 *  `bandGlsl` makes about the ladder: a shader and a test holding private copies of one number
 *  prove nothing about each other. */
function glslVec3(c: { r: number; g: number; b: number }): string {
  return `vec3(${(c.r / 255).toFixed(6)}, ${(c.g / 255).toFixed(6)}, ${(c.b / 255).toFixed(6)})`;
}

/**
 * THE RAMP, FLATTENED — every `(token, level)` product this material can deliver, row-major, as
 * 0..1 channel triples ready to upload.
 *
 * Row-major and not level-major, so `row * SHADE_LEVELS.length + rung` is the index, which is the
 * one arithmetic the shader does. Exported because it is what a test enumerates to prove the
 * closure: the reachable set of this material is exactly this array, with no sampling.
 */
export function groundRamp(tokens: readonly string[]): number[][] {
  const out: number[][] = [];
  for (const token of tokens) {
    for (const level of SHADE_LEVELS) {
      const c = deliveredForLevel(token, level);
      out.push([c.r / 255, c.g / 255, c.b / 255]);
    }
  }
  return out;
}

/** The generated fragment-stage selection: a comparison chain rather than `uRamp[idx]`, because
 *  GLSL ES 1.0 forbids a dynamic index into a uniform array. Generated from the ramp's own length
 *  so it cannot fall short of it — a hand-typed chain that stopped early would paint every status
 *  past the cut-off with row 0's colour, which is a foreign-status read on the surface whose whole
 *  job is to report status. */
export function rampSelectGlsl(entries: number): string {
  // ⚠ BUILT WITH `Array.from` RATHER THAN AN INDEXED `for`, and that is a mutation-rung finding
  // rather than a style preference. The loop's `i < entries` and `i += 1` came back UNPROVEN —
  // killed, but with no test named — which the rung treats as neither a pass nor a survivor, and
  // which the `bun` runner's coverage attribution does to inline single-statement loop bodies
  // (`mutation-rung-misreports-inline-chains`). With the counter gone there is nothing left to
  // mis-attribute, and every remaining mutant lands on arithmetic a test names directly.
  const rest = Array.from(
    { length: Math.max(0, entries - 1) },
    (_, i) => `if (idx == ${i + 1}) c = uRamp[${i + 1}];`,
  );
  return ['vec3 c = uRamp[0];', ...rest].join('\n        ');
}

/**
 * The banded ground material: `colour = ramp[statusRow * nLevels + bandIndex(lambert)]`.
 *
 * The ladder in the fragment source is INTERPOLATED from `SHADE_LEVELS` by `bandGlsl()` and the
 * ramp is computed by `deliveredForLevel`, so a shader and a test holding private copies of the
 * same numbers is unrepresentable — the argument `bandGlsl` already makes about the ladder,
 * extended to the colours.
 *
 * THE AMBIENT FLOOR IS DELIBERATELY ABSENT. Adding a constant AFTER quantisation would produce
 * `token * level + ambient`, which is not a closure member. The ladder's darkest rung IS the
 * ambient floor; that is what a locked palette means, and on this surface it is also the fence
 * that stops a shaded `healthy` parcel walking into `unhealthy`'s territory.
 */
export function createBandedGroundMaterial(opts: BandedGroundMaterialOptions): ShaderMaterial {
  const ramp = groundRamp(opts.tokens);
  if (ramp.length === 0) {
    // A material with an empty ramp compiles to `uRamp[0]` on a zero-length uniform array, which
    // is a link error on some drivers and a black island on others. Refusing is the only reading
    // that cannot be mistaken for art.
    throw new Error('banded-ground-material: no tokens — a ground material with no palette');
  }
  const grainNormal = opts.grain === 'normal' || opts.grain === 'both';
  const grainColour = opts.grain === 'both';
  const grained = grainNormal || grainColour;
  const [grainDark, grainLight] = grainStops();

  // ⚠ THE WORLD POSITION RIDES THROUGH ONLY WHEN THE GRAIN NEEDS IT. An ungrained material's
  // source must stay byte-identical to the one this file emitted before the grain existed —
  // otherwise every figure already measured about the banded ground (0 off-palette pixels, 51%
  // cheaper per frame than `MeshStandardMaterial`) would be a figure about a different shader.
  const worldVarying = grained ? '\n      varying vec3 vWorld;' : '';
  const worldAssign = grained
    ? '\n        // The grain is authored in GROUND coordinates, so it is sampled in them.' +
      '\n        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
    : '';

  // ⚠ THE GRAIN UNIFORMS ARE ADDED BY STATEMENT — the same shape `harness/banded-material.ts`
  // uses, and for the same reason plus one the lint rules make sharper. The reason: an ungrained
  // material must carry NO `uGrain*` uniform at all, because a uniform the shader never declares
  // is dead weight a reader would take as evidence the grain is active. The sharper one: the two
  // shorter spellings are both refused, and correctly — annotating the WHOLE uniform object as an
  // open dictionary discards the fact that `uRamp` and `uLightDir` are always there
  // (`no-known-value-widening`), and a `...(cond ? {x} : {})` hides an omission behind an empty
  // object (`no-conditional-empty-object-spread`). An empty dictionary that starts empty discards
  // nothing and omits nothing.
  const grainUniforms: Record<string, { value: number }> = {};
  if (grainNormal) grainUniforms['uGrainNormalStrength'] = { value: GRAIN_NORMAL_STRENGTH };
  if (grainColour) grainUniforms['uGrainColourMix'] = { value: GRAIN_COLOUR_MIX };
  const uniforms = {
    uRamp: { value: ramp.map(([r, g, b]) => new Vector3(r, g, b)) },
    uLightDir: {
      value: new Vector3(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z),
    },
    ...grainUniforms,
  };

  const grainSource = grained ? `\n      ${grainGlsl().split('\n').join('\n      ')}\n` : '';
  // The two grain uniforms are declared as ONE appended string rather than as two
  // interpolated ternaries, and that IS the byte-identity claim rather than a formatting
  // preference: a `${cond ? x : ''}` sitting on its own line leaves that line's indentation
  // behind, so an ungrained shader would differ from the one measured on 2026-08-30 by two
  // whitespace-only lines. Byte-identical has to be literal or it is not a claim.
  const grainUniformDecls =
    (grainNormal ? '\n      uniform float uGrainNormalStrength;' : '') +
    (grainColour ? '\n      uniform float uGrainColourMix;' : '');
  const grainNormalStage = grainNormal
    ? `        // THE GRAIN'S NORMAL HALF — the palette-safe one, and the only one the shipped
        // ground wears. The linearised heightfield normal: a displacement h(x,z) has normal
        // normalize(vec3(-dh/dx, 1, -dh/dz)), so subtracting the gradient from an arbitrary
        // normal is that construction on a surface that is not already flat — which the
        // relief'd land is not.
        //
        // It runs BEFORE the lambert and therefore before the quantiser, so it can only move a
        // fragment between AUTHORED RUNGS of its own token's ramp. That is what keeps the
        // closure, and it is also this half's ceiling: on a four-rung ladder the delivered
        // grain is a stipple between two authored colours rather than the continuous
        // micro-variation Cycles delivers. See land-grain.ts.
        vec2 gradient = st_grainGradient(vWorld.xz);
        n = normalize(n - uGrainNormalStrength * vec3(gradient.x, 0.0, gradient.y));
`
    : '';
  const writeColour = grainColour
    ? `        // THE GRAIN'S COLOUR HALF — the mechanism Cycles used, and the one that BREAKS THE
        // CLOSURE. Mixing anything into the delivered colour produces a value that is not an
        // authored ramp entry. It is measured off this surface rather than argued about:
        // harness/grain-status-reading.ts found the authored 0.13 walks the yellow at the two
        // darkest rungs into healthy's green, and 0.031 is the largest fac that does not. This
        // branch exists so a comparison can SHOW what holding the closure costs.
        vec3 grainCol = mix(${glslVec3(grainDark)}, ${glslVec3(grainLight)}, st_grainRamped(vWorld.xz));
        gl_FragColor = vec4(mix(c, grainCol, uGrainColourMix), 1.0);`
    : '        gl_FragColor = vec4(c, 1.0);';

  return new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float ${GROUND_STATUS_ATTRIBUTE};
      varying float vStatus;
      varying vec3 vNormal;${worldVarying}
      void main() {
        // The ramp ROW rides through the interpolator. All three vertices of a triangle carry
        // the same parcel's row, so the interpolated value is that row exactly — GLSL ES 1.0
        // has no flat qualifier and does not need one here.
        vStatus = ${GROUND_STATUS_ATTRIBUTE};
        // The normal reaches the fragment stage in WORLD space: the light is an authored world
        // direction, so shading in view space would swing the lighting whenever the camera
        // moved — which on a banded material means visible rungs sliding across static ground.
        vNormal = normalize(mat3(modelMatrix) * normal);${worldAssign}
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${bandGlsl().split('\n').join('\n      ')}
${grainSource}
      uniform vec3 uRamp[${ramp.length}];
      uniform vec3 uLightDir;${grainUniformDecls}
      varying float vStatus;
      varying vec3 vNormal;${worldVarying}

      void main() {
        vec3 n = normalize(vNormal);
${grainNormalStage}        // Half-lambert: wrapped so the terminator lands inside the ladder's range instead of
        // collapsing every back-facing pixel onto the darkest rung. Still a single scalar, so
        // the closure argument is untouched.
        float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
        // +0.5 then truncate, rather than a bare cast: an interpolated float that arrives as
        // 1.9999998 for row 2 would otherwise select row 1 and report a foreign status.
        int idx = int(vStatus + 0.5) * ST_N_LEVELS + st_bandIndex(lambert);
        ${rampSelectGlsl(ramp.length)}
${writeColour}
      }
    `,
  });
}
