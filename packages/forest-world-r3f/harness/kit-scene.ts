// kit-scene.ts — THE BROWSER HALF: load the bought kit once, and stand the vocabulary's
// placements on the island as merged geometry.
//
// ⚠ IT MERGES PER MATERIAL, IT DOES NOT INSTANCE, and that is what keeps the comparison fair.
// `hardware-floor.mjs` measured this renderer DRAW-CALL bound, and the island's own props go
// through `mergeParts`, which emits exactly one mesh per authored token however many props
// there are. An arm that issued one draw call per prop would be measured as far more expensive
// for a reason that has nothing to do with being bought or textured. So every placement's
// transform is baked into its vertices and everything sharing a material becomes one mesh —
// the same shape the procedural dressing already takes, six meshes instead of seven tokens.
//
// ⚠ AND THE LOADER ROUTES THROUGH `applyRawColourConvention`. This renderer is not
// colour-managed; a base-colour map decoded the ordinary way renders about 3.5x dark and looks
// like a deliberate art direction. `texture-convention.test.ts` refuses this module if the call
// goes missing.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { LIGHT_DIRECTION } from './palette-band.js';
import { KIT_ASSEMBLIES, KIT_ROLE_SIZE, kitObjectNames } from './kit-vocabulary.js';
import type { KitAssembly, KitPlacement } from './kit-vocabulary.js';
import { applyRawColourConvention } from './texture-convention.js';
import type { ConventionMaterial } from './texture-convention.js';
import type { LightCalibration } from './pine-scene.js';

/** Vite serves `harness/` as its root, so `harness/assets/x.glb` is `/assets/x.glb`. */
export const KIT_ASSET_URL = '/assets/dressing-kit.glb';

/** One kit object, its transform already baked so every bounding box is in one space. */
export interface KitObject {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  materialName: string;
}

/** An assembly, recentred on its own footprint with its base at y = 0. */
export interface KitAssemblyGeometry {
  objects: KitObject[];
  /** Which declared kit objects it is made of — one may contribute more than one part. */
  names: readonly string[];
  /** The assembly's own height in kit units, before it is scaled to its role's height. */
  height: number;
  /** Its widest horizontal extent in kit units — what the delivered width is derived from. */
  width: number;
}

export interface LoadedKit {
  assemblies: Map<KitAssembly, KitAssemblyGeometry>;
  materials: string[];
  triangles: number;
  /** Bytes of the `.glb` as fetched, read off the response rather than transcribed. */
  wireBytes: number;
  textures: Array<{ name: string; width: number; height: number }>;
  /** Decoded bytes the GPU holds for those textures, mipmaps included. */
  gpuBytes: number;
}

/**
 * LOAD THE KIT.
 *
 * Two corrections the kit's own export needs for a map, both the same ones `loadPine` makes and
 * for the same reasons: the foliage is authored `BLEND`, which for a stand of cut-out leaf cards
 * is the classic sorting failure, so it is switched to an alpha TEST; and the base-colour maps
 * are put in this surface's raw convention.
 *
 * ⚠ EVERY GEOMETRY IS BAKED THROUGH ITS NODE'S WORLD MATRIX FIRST. glTF keeps a node transform
 * separate from its mesh, so a bounding box read straight off the geometry is in some other
 * space than the one the kit laid its objects out in — and this vocabulary's whole trunk/crown
 * relationship is a fact about that layout.
 */
export async function loadKit(url: string = KIT_ASSET_URL): Promise<LoadedKit> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`kit-scene: ${url} answered ${res.status}`);
  const bytes = await res.arrayBuffer();

  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  gltf.scene.updateMatrixWorld(true);

  // ⚠ A LIST PER NAME, NOT ONE OBJECT. A kit object wearing TWO materials — the dead pine wears
  // both `Pine_Trunks` and `Pine_Branches` — is exported as one node with two PRIMITIVES, and
  // `GLTFLoader` turns that into a Group whose children are named `<object>_0`, `<object>_1`.
  // Keying on the mesh's own name loses the object entirely, which the manifest floor below
  // caught on the first run rather than drawing a quietly incomplete island.
  const objects = new Map<string, KitObject[]>();
  const declared = new Set(kitObjectNames());
  const materials = new Set<string>();
  const textures = new Map<string, { name: string; width: number; height: number }>();
  let triangles = 0;

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    if (material.transparent) {
      // `alphaTest` and `transparent` are mutually exclusive in three: leaving `transparent` on
      // keeps the mesh in the sorted transparent pass even with a test set.
      material.transparent = false;
      material.alphaTest = 0.5;
      material.depthWrite = true;
    }
    material.side = THREE.DoubleSide;
    applyRawColourConvention(material satisfies ConventionMaterial);

    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
      const tex = material[key];
      if (!tex || !tex.image) continue;
      const img = tex.image as { width?: number; height?: number };
      textures.set(tex.uuid, {
        name: `${key}:${material.name}`,
        width: img.width ?? 0,
        height: img.height ?? 0,
      });
    }

    const geometry = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld);
    geometry.computeBoundingBox();
    const index = geometry.getIndex();
    triangles += index ? index.count / 3 : geometry.getAttribute('position').count / 3;
    materials.add(material.name);
    // Resolve the DECLARED object this primitive belongs to: its own name if that is declared,
    // else its parent group's, else its name with the primitive index stripped.
    const own = obj.name;
    const parent = obj.parent?.name ?? '';
    const stripped = own.replace(/_\d+$/, '');
    const key = declared.has(own) ? own : declared.has(parent) ? parent : stripped;
    const part = { name: key, geometry, material, materialName: material.name };
    const existing = objects.get(key);
    if (existing) existing.push(part);
    else objects.set(key, [part]);
  });

  // ⚠ THE MANIFEST FLOOR. Every count and every placement below is per assembly FOUND, so an
  // asset that lost an object would draw a quietly emptier island and nothing would say so.
  const missing = [...declared].filter((n) => !objects.has(n));
  if (missing.length > 0) {
    throw new Error(
      `kit-scene: ${url} is missing objects the vocabulary declares: ${missing.join(', ')}. ` +
        'Re-export the kit, or correct KIT_ASSEMBLIES — an island quietly missing a prop is an ' +
        'island under-reporting the work.',
    );
  }

  const assemblies = new Map<KitAssembly, KitAssemblyGeometry>();
  for (const [assembly, names] of Object.entries(KIT_ASSEMBLIES) as Array<
    [KitAssembly, readonly string[]]
  >) {
    const parts = names.flatMap((n) => objects.get(n)!);
    // ONE joint box for the whole assembly — see `KIT_ASSEMBLIES`. Recentring each object on its
    // own base drops a pine's crown 18% of the tree's height into its trunk.
    const box = new THREE.Box3();
    for (const part of parts) box.union(part.geometry.boundingBox!);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    for (const part of parts) {
      part.geometry.translate(-cx, -box.min.y, -cz);
      part.geometry.computeBoundingBox();
    }
    assemblies.set(assembly, {
      objects: parts,
      names,
      height: box.max.y - box.min.y,
      width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z),
    });
  }

  let gpuBytes = 0;
  for (const t of textures.values()) {
    // 4 bytes per texel, and the full mip chain is 4/3 of the base level.
    gpuBytes += Math.round(t.width * t.height * 4 * (4 / 3));
  }

  return {
    assemblies,
    materials: [...materials].sort(),
    triangles,
    wireBytes: bytes.byteLength,
    textures: [...textures.values()],
    gpuBytes,
  };
}

/** What one placement's geometry is multiplied by to stand at its role's height. */
export function placementScale(kit: LoadedKit, placement: KitPlacement): number {
  const assembly = kit.assemblies.get(placement.assembly);
  if (!assembly) throw new Error(`kit-scene: no assembly ${placement.assembly}`);
  const size = KIT_ROLE_SIZE[placement.role];
  // ⚠ THE DECLARED AXIS, not always the height. Scaling a wide flat prop by its height
  // multiplies its footprint by the same factor — see `KIT_ROLE_SIZE`.
  const own = size.axis === 'height' ? assembly.height : assembly.width;
  if (!(own > 0)) throw new Error(`kit-scene: assembly ${placement.assembly} has no ${size.axis}`);
  return size.units / own;
}

/** One placement's world size in ground units, after its role's scale. */
export interface PlacementExtent {
  width: number;
  height: number;
}

/** What one placement actually occupies on the island, which is what the object floor is read
 *  against — not the size that was asked for on one axis. */
export function placementExtent(kit: LoadedKit, placement: KitPlacement): PlacementExtent {
  const assembly = kit.assemblies.get(placement.assembly)!;
  const scale = placementScale(kit, placement);
  return { width: assembly.width * scale, height: assembly.height * scale };
}

/**
 * BUILD THE DRESSING: one merged mesh per material, however many props there are.
 *
 * The transform is `translate * rotateY * scale`, applied to a CLONE of the kit's geometry, so
 * the kit itself is never mutated and two placements of one assembly cannot interfere.
 */
export function kitMeshes(kit: LoadedKit, placements: readonly KitPlacement[]): THREE.Mesh[] {
  const byMaterial = new Map<string, { material: THREE.MeshStandardMaterial; parts: THREE.BufferGeometry[] }>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (const placement of placements) {
    const assembly = kit.assemblies.get(placement.assembly);
    if (!assembly) throw new Error(`kit-scene: no assembly ${placement.assembly}`);
    const scale = placementScale(kit, placement);
    q.setFromAxisAngle(up, placement.yaw);
    m.compose(
      new THREE.Vector3(placement.at.x, placement.y, placement.at.z),
      q,
      new THREE.Vector3(scale, scale, scale),
    );
    for (const part of assembly.objects) {
      const geometry = part.geometry.clone().applyMatrix4(m);
      const bucket = byMaterial.get(part.materialName);
      if (bucket) bucket.parts.push(geometry);
      else byMaterial.set(part.materialName, { material: part.material, parts: [geometry] });
    }
  }

  const out: THREE.Mesh[] = [];
  for (const [name, bucket] of byMaterial) {
    const merged = mergeGeometries(bucket.parts, false);
    if (!merged) {
      throw new Error(
        `kit-scene: could not merge the ${bucket.parts.length} geometries wearing ${name} — ` +
          'they do not share an attribute set, so this dressing would silently cost one draw ' +
          'call per prop on a draw-call-bound renderer',
      );
    }
    for (const part of bucket.parts) part.dispose();
    out.push(new THREE.Mesh(merged, bucket.material));
  }
  return out;
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
