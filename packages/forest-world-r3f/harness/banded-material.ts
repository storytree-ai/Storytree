// banded-material.ts — the LOCKED PALETTE, on the GPU. Browser-bound (imports three), so
// it lives OUTSIDE the provability firewall alongside ForestWorldCanvas and is never
// re-exported from the pure root barrel. Its thinking half — the ladder, the tokens, the
// closure — is `palette-band.ts`, which is pure and node:test-provable; this file only
// carries that contract onto a GPU.
//
// THE CONSTRUCTION, RESTATED WHERE IT IS EXECUTED. The fragment stage receives the
// instance's own authored TOKEN and a continuous lambert term, quantises ONLY the lambert
// onto the authored ladder, and multiplies. So the delivered colour is `token * level` —
// a member of the closure that DEFINES the palette. Nothing searches for a nearest entry,
// so there is no nearest entry to get wrong, and no reachable colour belongs to another
// status's family.
//
// COLOUR MANAGEMENT IS DISABLED ON PURPOSE, AND THIS IS LOAD-BEARING. three.js by default
// treats material colours as linear-sRGB and converts on output. Under that default the
// pixel a GPU delivers for `#8cb85e` is NOT `#8cb85e`, and the palette-closure check would
// fail for a colour-management reason while looking exactly like a banding bug — the arc
// has lost time to instruments that failed for a reason other than the one they named. The
// tokens here are authored sRGB hex and must arrive at the framebuffer unmodified, so the
// renderer is configured for no conversion and the shader writes the token straight
// through. `configureExactColour` is the one call that establishes it, and the capture
// harness asserts the result on delivered pixels rather than trusting this comment.

import * as THREE from 'three';

import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  grainGlsl,
  grainStops,
} from './land-grain.js';
import { terrainWarpGlsl, type Terrain } from './terrain-vocabulary.js';
import type { ShadowField } from './land-shadow.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, bandGlsl, parseHex, tokenRamp } from './palette-band.js';
import {
  SHADOW_LADDER,
  SHADOW_RUNG_INDEX,
  rungsAShadowDarkens,
  shadowRamp,
} from './shadow-ladder.js';

/** Put a renderer into EXACT-COLOUR mode: what the shader writes is what the framebuffer
 *  holds. Required for the palette-closure proof to mean anything. Call once per renderer. */
export function configureExactColour(renderer: THREE.WebGLRenderer): void {
  // No output transform: the shader's rgb is already authored sRGB.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // ...and no INPUT transform either, or `new THREE.Color('#8cb85e')` would be linearised
  // on the way in and the round trip would still not be an identity.
  THREE.ColorManagement.enabled = false;
}

/** A token as a three Color carrying the authored sRGB values verbatim (no linearisation —
 *  see `configureExactColour`). */
export function tokenColour(hex: string): THREE.Color {
  const { r, g, b } = parseHex(hex);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

/** The single light direction the whole land is shaded by, DERIVED from the pure half's
 *  authored constant rather than re-typed. Whether a shape is visible on a banded material
 *  is decided by the light jointly with a surface normal, so a node test has to be able to
 *  reach the same direction the GPU is given — and two private copies of one number would
 *  prove nothing about each other, which is the argument `bandGlsl` already makes about the
 *  ladder. See `LIGHT_DIRECTION` in `palette-band.ts` for the projection fence it sits
 *  behind. */
export const LIGHT_DIR = new THREE.Vector3(
  LIGHT_DIRECTION.x,
  LIGHT_DIRECTION.y,
  LIGHT_DIRECTION.z,
);

/**
 * WHICH HALF of the grain octave a material wears. The two are separate options rather than
 * one switch because they land on opposite sides of the palette closure — see `land-grain.ts`.
 *
 *   - `normal` perturbs the lambert BEFORE quantisation, so the fragment still writes an
 *     authored ramp entry and the palette stays closed. Safe on any captured panel.
 *   - `colour` mixes a noise-driven ramp INTO the delivered colour, exactly as Cycles does. It
 *     is off-palette by construction: permitted on `harness/` by ADR-0418 D2/D3, but
 *     `capture.mjs` refuses an off-palette pixel and exits non-zero, so a panel wearing this
 *     must stay out of that audit until `replace-the-palette-closure-check` lands.
 *   - `both` is what the approved render actually did.
 */
export type GrainMode = 'normal' | 'colour' | 'both';

export interface GrainOptions {
  mode: GrainMode;
  /** Bump strength for the `normal` half. Defaults to the authored `GRAIN_NORMAL_STRENGTH`. */
  normalStrength?: number;
  /** Mix factor for the `colour` half. Defaults to the authored `GRAIN_COLOUR_MIX`. */
  colourMix?: number;
}

/** How a terrain reaches the shader. A `Terrain` from `terrain-vocabulary.ts` — kept as an
 *  import type so this module carries none of the vocabulary's own constants. */
export interface BandedMaterialOptions {
  /** The authored token this material's surfaces wear, `#rrggbb`. */
  token: string;
  /** Draw the back faces too (a plant is not a closed solid from every angle). */
  doubleSided?: boolean;
  /** RECEIVE the ground-space shadow field. Absent means this material is not shadowed at
   *  all and its ramp stays the four authored rungs — so a panel without a shadow delivers
   *  bit-identical pixels to the ones it delivered before this existed. */
  shadow?: ShadowTexture;
  /** WEAR the high-frequency grain octave. Absent means the generated shader source is
   *  byte-identical to the one this file emitted before the grain existed — the same argument
   *  `shadow` makes above, and `banded-material.test.ts` asserts it rather than claiming it. */
  grain?: GrainOptions;
  /**
   * WEAR A NAMED TERRAIN (ADR-0461 D1) — a rotation and a non-uniform squeeze applied to the
   * grain's sample space, so one proven field delivers rows, furrows, pools or stony fines
   * according to which state the land is carrying.
   *
   * ⚠ IT ONLY DOES ANYTHING WHERE THE GRAIN IS ALREADY ON. The terrain warps the grain's
   * sample coordinate; with no grain there is nothing to warp, and asking for one is a
   * no-op rather than an error — `terrainWithoutGrainIsInert` states that about the source.
   *
   * ⚠ ABSENT MEANS THE SHADER SOURCE IS BYTE-IDENTICAL to the one this file emitted before
   * terrains existed. Same argument as the grain's, same reason: a panel that predates the
   * vocabulary must deliver the pixels it always delivered, or every comparison against an
   * earlier pass silently becomes a comparison of two different renderers.
   */
  terrain?: Terrain;
}

/** The shadow field, uploaded. Built by `shadowFieldTexture` so the rect and the texture can
 *  never disagree about which ground the samples cover. */
export interface ShadowTexture {
  texture: THREE.Texture;
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
}

/**
 * Upload a `ShadowField` as a single-channel texture.
 *
 * LINEAR FILTERING, ON PURPOSE, AND IT COSTS NOTHING. The fragment stage thresholds this
 * scalar (one shadow rung means the decision is binary), so interpolation cannot introduce a
 * colour — it only moves WHERE the edge falls, to sub-texel precision. Nearest filtering
 * would staircase the shadow's outline along the field's own grid at the 8 px/unit panels,
 * which reads as a defect in the shadow rather than in the sampling.
 */
export function shadowFieldTexture(field: ShadowField): ShadowTexture {
  const tex = new THREE.DataTexture(
    field.data,
    field.w,
    field.h,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return {
    texture: tex,
    minX: field.minX,
    minZ: field.minZ,
    spanX: field.w / field.gres,
    spanZ: field.h / field.gres,
  };
}

/**
 * The banded (toon) material: `colour = token * st_bandShade(lambert)`.
 *
 * The ladder in the fragment source is INTERPOLATED from `SHADE_LEVELS` by `bandGlsl()`,
 * never hand-typed here — a shader and a test holding private copies of the same numbers
 * prove nothing about each other.
 *
 * The AMBIENT FLOOR is deliberately absent. Adding a constant to the lambert before
 * quantising would still land on the ladder, but adding one AFTER (the usual "lift the
 * shadows" move) would produce `token * level + ambient`, which is not a closure member.
 * The palette's darkest rung IS the ambient floor; that is what a locked palette means.
 */
export function createBandedMaterial(opts: BandedMaterialOptions): THREE.ShaderMaterial {
  const shadowed = opts.shadow !== undefined;
  // The RAMP is the token's finished delivered colours, already rounded in TypeScript by
  // `tokenRamp`. The GPU selects one and writes it through; it performs no colour
  // arithmetic. That is what makes the palette proof a bit-identity — see `bandLevelIndex`
  // for the 929-pixel measurement that forced this design.
  //
  // With a shadow the ramp is one entry longer and NOTHING ELSE CHANGES: the extra entry is
  // `token x SHADOW_RUNG`, which is a member of the same `(authored token x authored level)`
  // closure the palette is defined as. The shadow costs palette ENTRIES; it does not cost
  // the closure argument.
  const levels = shadowed ? SHADOW_LADDER : SHADE_LEVELS;
  const rampColours = shadowed ? shadowRamp(opts.token) : tokenRamp(opts.token);
  const ramp = rampColours.map((c) => new THREE.Vector3(c.r / 255, c.g / 255, c.b / 255));

  // `st_bandIndex` quantises onto `SHADE_LEVELS` and always will — the shadow rung is
  // deliberately NOT reachable by lighting (see `SHADOW_LADDER`). So the lit rung index has
  // to be remapped from the authored ladder into the longer one, and the map is generated
  // here from the two arrays rather than written down, because a hand-typed map that drifted
  // would repaint every rung one step off and look like a shading bug.
  const remap = SHADE_LEVELS.map((level, i) => `if (rung == ${i}) idx = ${levels.indexOf(level)};`);
  // Which lit rungs a shadow is allowed to darken: those LIGHTER than the shadow rung. A
  // pixel already darker keeps its own level, because a shadow that brightened a surface
  // would be a shadow lighting something up.
  const darkenable = rungsAShadowDarkens();

  // THE GRAIN, decomposed into its two independent halves. Both are absent by default and
  // every line of grain GLSL below is emitted behind one of these flags, which is what makes
  // "a material without grain compiles the source it always did" a property of the code rather
  // than a promise in a comment.
  const grainNormal = opts.grain?.mode === 'normal' || opts.grain?.mode === 'both';
  const grainColour = opts.grain?.mode === 'colour' || opts.grain?.mode === 'both';
  const grained = grainNormal || grainColour;
  // The terrain warps the grain's SAMPLE COORDINATE. With no grain there is nothing to warp,
  // so a terrain asked for on an ungrained material emits nothing at all — inert, not an error.
  const terrain = grained ? opts.terrain : undefined;
  // ⚠ ONE EXPRESSION, USED AT EVERY GRAIN SAMPLE SITE. The grain is sampled in two places (the
  // normal half's gradient and the colour half's ramp) and a terrain that reached only one of
  // them would deliver a directional bump under an undirected mottle — a picture that looks
  // like a bug in the art rather than in the wiring.
  const grainSample = terrain ? 'st_terrainWarp(vWorld.xz)' : 'vWorld.xz';
  const [grainDark, grainLight] = grainStops();
  const glslVec3 = (c: { r: number; g: number; b: number }): string =>
    `vec3(${(c.r / 255).toFixed(6)}, ${(c.g / 255).toFixed(6)}, ${(c.b / 255).toFixed(6)})`;

  // The grain uniforms are added by STATEMENT rather than by a conditional spread: an ungrained
  // material must carry no `uGrain*` at all (a uniform the shader never declares is dead weight
  // that a reader would take for evidence the grain is active), and `land-grain.test.ts` asserts
  // their absence.
  const grainUniforms: Record<string, { value: number }> = {};
  if (grainNormal) {
    grainUniforms['uGrainNormalStrength'] = {
      value: opts.grain?.normalStrength ?? GRAIN_NORMAL_STRENGTH,
    };
  }
  if (grainColour) {
    grainUniforms['uGrainColourMix'] = { value: opts.grain?.colourMix ?? GRAIN_COLOUR_MIX };
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRamp: { value: ramp },
      uLightDir: { value: LIGHT_DIR.clone() },
      ...grainUniforms,
      uShadowTex: { value: opts.shadow?.texture ?? null },
      uShadowRect: {
        value: new THREE.Vector4(
          opts.shadow?.minX ?? 0,
          opts.shadow?.minZ ?? 0,
          1 / (opts.shadow?.spanX ?? 1),
          1 / (opts.shadow?.spanZ ?? 1),
        ),
      },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        // The normal reaches the fragment stage in WORLD space: the light is an authored
        // world direction, so shading it in view space would swing the lighting whenever
        // the camera moved — which on a banded material means visible rungs sliding across
        // static geometry.
        vNormal = normalize(mat3(modelMatrix) * normal);
        // The world POSITION for the same reason: the shadow field is authored in ground
        // coordinates, so it has to be sampled in ground coordinates.
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${bandGlsl()}
${grained ? `\n      ${grainGlsl().split('\n').join('\n      ')}\n` : ''}${terrain ? `\n      ${terrainWarpGlsl(terrain).split('\n').join('\n      ')}\n` : ''}
      uniform vec3 uRamp[${levels.length}];
      uniform vec3 uLightDir;
      ${shadowed ? 'uniform sampler2D uShadowTex;\n      uniform vec4 uShadowRect;' : ''}
      ${grainNormal ? 'uniform float uGrainNormalStrength;' : ''}
      ${grainColour ? 'uniform float uGrainColourMix;' : ''}
      varying vec3 vNormal;
      varying vec3 vWorld;

      void main() {
        vec3 n = normalize(vNormal);
${
  grainNormal
    ? `        // THE GRAIN'S NORMAL HALF. The linearised heightfield normal: a displacement
        // h(x,z) has normal normalize(vec3(-dh/dx, 1, -dh/dz)), so subtracting the gradient
        // from an arbitrary normal is that construction on a surface that is not already
        // flat — which the relief'd land is not.
        //
        // It runs BEFORE the lambert and therefore before the quantiser, so it can only ever
        // move a fragment between AUTHORED RUNGS. That is what keeps the palette closed here
        // and it is also this half's ceiling: on a four-rung ladder the delivered grain is a
        // stipple between two authored colours, not the continuous micro-variation Cycles
        // delivers. See land-grain.ts.
        vec2 gradient = st_grainGradient(${grainSample});
        n = normalize(n - uGrainNormalStrength * vec3(gradient.x, 0.0, gradient.y));
`
    : ''
}        // Half-lambert: wrapped so the terminator lands inside the ladder's range instead
        // of collapsing every back-facing pixel onto the darkest rung. It is still a single
        // scalar, so the closure argument is untouched.
        float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
        int rung = st_bandIndex(lambert);
        int idx = 0;
        ${remap.join('\n        ')}
${
  shadowed
    ? `        // ONE shadow rung, so the decision is BINARY. That is not a simplification —
        // it is what a closed palette with a measured confusability ceiling leaves room
        // for. A penumbra needs intermediate rungs and every one of them costs palette
        // entries and walks a status closer to its neighbour.
        vec2 uv = vec2((vWorld.x - uShadowRect.x) * uShadowRect.z,
                       (vWorld.z - uShadowRect.y) * uShadowRect.w);
        float sh = texture2D(uShadowTex, uv).r;
        if (sh > 0.5) {
          ${darkenable.map((i) => `if (rung == ${i}) idx = ${SHADOW_RUNG_INDEX};`).join('\n          ')}
        }`
    : ''
}
        // A constant-indexed read: GLSL ES 1.0 forbids a dynamic index into a uniform
        // array, so the rung is selected by comparison rather than by subscript.
        vec3 c = uRamp[0];
        ${levels
          .map((_, i) => (i === 0 ? '' : `if (idx == ${i}) c = uRamp[${i}];`))
          .filter(Boolean)
          .join('\n        ')}
${
  grainColour
    ? `        // THE GRAIN'S COLOUR HALF — the mechanism Cycles actually used, and the one that
        // BREAKS THE CLOSURE. Mixing anything into the delivered colour produces a value that
        // is not an authored ramp entry, so this material's pixels are off-palette by
        // construction and capture.mjs will refuse them. ADR-0418 D2/D3 permit continuous
        // shading on harness/; the INSTRUMENT has not caught up, which is what
        // replace-the-palette-closure-check exists to fix. It is built so the crossing can be
        // measured against the treatment as approved, not so it can be adopted today.
        vec3 grainCol = mix(${glslVec3(grainDark)}, ${glslVec3(grainLight)}, st_grainRamped(${grainSample}));
        vec3 outColour = mix(c, grainCol, uGrainColourMix);
        gl_FragColor = vec4(outColour, 1.0);`
    : '        gl_FragColor = vec4(c, 1.0);'
}
      }
    `,
  });
  if (opts.doubleSided) material.side = THREE.DoubleSide;
  return material;
}

/** Upload a generated `PlantMesh` (plain typed arrays from the pure generator) as a
 *  three BufferGeometry. The generator stays browser-free; this is the only place the two
 *  halves meet. */
export function toBufferGeometry(mesh: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
}): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return g;
}
