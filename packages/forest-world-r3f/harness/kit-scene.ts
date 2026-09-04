// kit-scene.ts — the harness's route into the bought kit's browser half, which CROSSED into
// `src/kit-mesh.ts` on 2026-08-30.
//
// ⚠⚠ WHAT MOVED. Parsing the kit, pairing a trunk with its own crown, measuring each role's
// footprint off the loaded geometry, tinting a leaf material and merging every placement into one
// mesh per (material, tint) — all of it is what the SHIPPED canvas does now, so all of it crossed.
// It is re-exported below, which is what stops the experiment and the product standing two
// different trees on two different islands and calling them the same comparison.
//
// ⚠ WHAT STAYED IS THE FETCH AND THE LIGHTS, and both for the same reason: they are how the
// HARNESS reaches and lights the kit, not what the kit IS. Vite serves `harness/` as its root, so
// this surface can fetch `/assets/dressing-kit.glb` off disk; the shipped canvas cannot (the web
// sync carries only `.ts`) and parses the embedded bytes instead. `kitLights` takes a
// `LightCalibration`, measured by probing a live renderer — an instrument, and one the shipped
// canvas does not run.

import * as THREE from 'three';

import { parseKit } from '../src/kit-mesh.js';
import type { LoadedKit } from '../src/kit-mesh.js';
import { LIGHT_DIRECTION } from './palette-band.js';
import type { LightCalibration } from './pine-scene.js';

export {
  LEAF_MATERIALS,
  kitMeshes,
  loadEmbeddedKit,
  parseKit,
  placementExtent,
  placementScale,
  roleFootprints,
  roleHeights,
  setKitPropLighting,
  tintedMaterial,
} from '../src/kit-mesh.js';
export type {
  KitAssemblyGeometry,
  KitObject,
  LoadedKit,
  PlacementExtent,
} from '../src/kit-mesh.js';

/** Vite serves `harness/` as its root, so `harness/assets/x.glb` is `/assets/x.glb`. */
export const KIT_ASSET_URL = '/assets/dressing-kit.glb';

/**
 * LOAD THE KIT OFF THE HARNESS'S OWN SERVER.
 *
 * ⚠ IT READS `wireBytes` OFF THE RESPONSE rather than off a decoded buffer, and that is the
 * point of keeping a fetch at all: the payload figure every table on this arc is stated in is what
 * a visitor would download, and a number taken from anywhere else is a different claim.
 */
export async function loadKit(url: string = KIT_ASSET_URL): Promise<LoadedKit> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`kit-scene: ${url} answered ${res.status}`);
  const bytes = await res.arrayBuffer();
  return parseKit(bytes, url);
}

/**
 * The lights a bought asset needs, at the intensities `calibrateLights` measured.
 *
 * `createBandedMaterial` ignores lights entirely, so adding these changes nothing about the land
 * beside them — a claim the page's driver refuses the run over rather than asserting. They are
 * aimed along `palette-band.ts`'s own `LIGHT_DIRECTION`, so the bought props are lit by the same
 * sun the banded land is shaded by; anything else reads as an art difference rather than a
 * wiring one.
 */
export function kitLights(cal: LightCalibration): THREE.Light[] {
  const ambient = new THREE.AmbientLight(0xffffff, cal.floor * cal.scale);
  const key = new THREE.DirectionalLight(0xffffff, (cal.target - cal.floor) * cal.scale);
  key.position
    .set(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z)
    .normalize()
    .multiplyScalar(400);
  return [ambient, key];
}
