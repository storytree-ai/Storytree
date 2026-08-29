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

import { LIGHT_DIRECTION, SHADE_LEVELS, bandGlsl, deliveredForLevel } from './shade-ladder.js';

/** The attribute a merged ground buffer carries its parcel's RAMP ROW in — the name the shader
 *  declares and the name `ForestWorldCanvas` attaches `CellGroundGeometry.statuses` under. It is
 *  a constant rather than two string literals because a mismatch between them is silent: the
 *  attribute simply never arrives, every fragment reads row 0, and the island paints itself one
 *  status while looking like it is working. */
export const GROUND_STATUS_ATTRIBUTE = 'statusIndex';

export interface BandedGroundMaterialOptions {
  /** The authored `#rrggbb` ground token for each ramp ROW, in row order. Row `i` is what a
   *  vertex carrying `statusIndex === i` wears. The caller owns the ordering and must use the
   *  same one for `cellGroundGeometry`'s `index` resolver — `ForestWorldCanvas` derives both
   *  from one `Map`, so there is one ordering rather than two that agree today. */
  tokens: readonly string[];
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
  const lines = ['vec3 c = uRamp[0];'];
  for (let i = 1; i < entries; i += 1) lines.push(`if (idx == ${i}) c = uRamp[${i}];`);
  return lines.join('\n        ');
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
  return new ShaderMaterial({
    uniforms: {
      uRamp: { value: ramp.map(([r, g, b]) => new Vector3(r, g, b)) },
      uLightDir: {
        value: new Vector3(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z),
      },
    },
    vertexShader: `
      attribute float ${GROUND_STATUS_ATTRIBUTE};
      varying float vStatus;
      varying vec3 vNormal;
      void main() {
        // The ramp ROW rides through the interpolator. All three vertices of a triangle carry
        // the same parcel's row, so the interpolated value is that row exactly — GLSL ES 1.0
        // has no flat qualifier and does not need one here.
        vStatus = ${GROUND_STATUS_ATTRIBUTE};
        // The normal reaches the fragment stage in WORLD space: the light is an authored world
        // direction, so shading in view space would swing the lighting whenever the camera
        // moved — which on a banded material means visible rungs sliding across static ground.
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${bandGlsl().split('\n').join('\n      ')}

      uniform vec3 uRamp[${ramp.length}];
      uniform vec3 uLightDir;
      varying float vStatus;
      varying vec3 vNormal;

      void main() {
        vec3 n = normalize(vNormal);
        // Half-lambert: wrapped so the terminator lands inside the ladder's range instead of
        // collapsing every back-facing pixel onto the darkest rung. Still a single scalar, so
        // the closure argument is untouched.
        float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
        // +0.5 then truncate, rather than a bare cast: an interpolated float that arrives as
        // 1.9999998 for row 2 would otherwise select row 1 and report a foreign status.
        int idx = int(vStatus + 0.5) * ST_N_LEVELS + st_bandIndex(lambert);
        ${rampSelectGlsl(ramp.length)}
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}
