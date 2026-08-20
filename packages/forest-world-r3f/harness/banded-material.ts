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

import { LIGHT_DIR_AUTHORED, SHADE_LEVELS, bandGlsl, parseHex, tokenRamp } from './palette-band.js';

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

/** The single light direction the whole land is shaded by, as a three vector. The NUMBERS live
 *  in `palette-band.ts` beside the authored tokens — they are authored art, and the pure
 *  geometry half derives from them (the UAT bloom faces the light). This is only their
 *  browser-side form. */
export const LIGHT_DIR = new THREE.Vector3(...LIGHT_DIR_AUTHORED).normalize();

export interface BandedMaterialOptions {
  /** The authored token this material's surfaces wear, `#rrggbb`. */
  token: string;
  /** Draw the back faces too (a plant is not a closed solid from every angle). */
  doubleSided?: boolean;
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
  // The RAMP is the token's finished delivered colours, already rounded in TypeScript by
  // `tokenRamp`. The GPU selects one and writes it through; it performs no colour
  // arithmetic. That is what makes the palette proof a bit-identity — see `bandLevelIndex`
  // for the 929-pixel measurement that forced this design.
  const ramp = tokenRamp(opts.token).map((c) => new THREE.Vector3(c.r / 255, c.g / 255, c.b / 255));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRamp: { value: ramp },
      uLightDir: { value: LIGHT_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        // The normal reaches the fragment stage in WORLD space: the light is an authored
        // world direction, so shading it in view space would swing the lighting whenever
        // the camera moved — which on a banded material means visible rungs sliding across
        // static geometry.
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${bandGlsl()}

      uniform vec3 uRamp[${SHADE_LEVELS.length}];
      uniform vec3 uLightDir;
      varying vec3 vNormal;

      void main() {
        vec3 n = normalize(vNormal);
        // Half-lambert: wrapped so the terminator lands inside the ladder's range instead
        // of collapsing every back-facing pixel onto the darkest rung. It is still a single
        // scalar, so the closure argument is untouched.
        float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
        int rung = st_bandIndex(lambert);
        // A constant-indexed read: GLSL ES 1.0 forbids a dynamic index into a uniform
        // array, so the rung is selected by comparison rather than by subscript.
        vec3 c = uRamp[0];
        ${SHADE_LEVELS.map((_, i) => (i === 0 ? '' : `if (rung == ${i}) c = uRamp[${i}];`))
          .filter(Boolean)
          .join('\n        ')}
        gl_FragColor = vec4(c, 1.0);
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
