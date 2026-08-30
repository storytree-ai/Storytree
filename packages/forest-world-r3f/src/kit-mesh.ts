// kit-mesh.ts — THE BROWSER HALF OF THE BOUGHT KIT: parse it once, and stand the vocabulary's
// placements on the island as merged geometry.
//
// ⚠⚠ CROSSED INTO `src/` ON 2026-08-30 as a SPLIT of `harness/kit-scene.ts`. What is here is
// everything the SHIPPED canvas needs to draw a bought object; what stayed is the harness's own
// FETCH (`loadKit(url)`, which serves the `.glb` off vite) and its LIGHT CALIBRATION, which is an
// instrument that probes a renderer rather than part of the treatment. The shipped canvas has no
// `/assets/` to fetch from — the web sync carries only `.ts` — so it parses the embedded bytes
// (`kit-asset.ts`) instead, which is the same asset by construction.
//
// ⚠ IT MERGES PER MATERIAL, IT DOES NOT INSTANCE, and that is what keeps the comparison fair.
// `hardware-floor.mjs` measured this renderer DRAW-CALL bound, so an arm that issued one draw call
// per prop would be measured as far more expensive for a reason that has nothing to do with being
// bought or textured. Every placement's transform is baked into its vertices and everything
// sharing a material becomes one mesh.
//
// ⚠ AND THE LOADER ROUTES THROUGH `applyRawColourConvention`. This renderer is not
// colour-managed; a base-colour map decoded the ordinary way renders about 3.5x dark and looks
// like a deliberate art direction. `texture-convention.test.ts` refuses a loader path that skips
// it.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { decodeKitAsset } from './kit-asset.js';
import {
  KIT_ASSEMBLIES,
  KIT_ROLES,
  KIT_ROLE_ASSEMBLIES,
  KIT_ROLE_SIZE,
  kitObjectNames,
} from './kit-vocabulary.js';
import type { KitAssembly, KitPlacement, KitRole, RoleFootprints } from './kit-vocabulary.js';
import { leafTintGainFor } from './leaf-tint.js';
import { mapMeans } from './map-texels.js';
import type { DecodedMap } from './map-texels.js';
import { applyRawColourConvention } from './texture-convention.js';
import type { ConventionMaterial, Rgb } from './texture-convention.js';

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

/** The materials whose texels are LEAVES, and therefore the ones a state's tint rotates.
 *
 *  ⚠ HAND-AUTHORED, UPSTREAM OF THE ASSET, and this is what keeps the dead trunk bare. The kit
 *  gives `Pine_Trunk_No_Leaves_01` BOTH `Pine_Trunks` and `Pine_Branches` — its dead branches
 *  wear the same material as a live crown's needles. Tinting by MATERIAL alone would therefore
 *  paint a dead tree's branches yellow for a state it does not hold; the tint is a property of
 *  the PLACEMENT (`KitPlacement.tint`, `null` for the dead form) and this set only says which of
 *  that placement's parts the tint reaches. */
export const LEAF_MATERIALS: ReadonlySet<string> = new Set(['Pine_Branches']);

export interface LoadedKit {
  assemblies: Map<KitAssembly, KitAssemblyGeometry>;
  materials: string[];
  /** Each leaf material's own base-colour mean over its solid texels — what a tint is rotated
   *  from. Read off the asset rather than declared, because a footprint or a mean restated here
   *  would be a second copy that drifts the first time the kit is re-exported. */
  leafMeans: Map<string, Rgb>;
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
export async function parseKit(
  bytes: ArrayBuffer,
  source = 'the embedded kit',
): Promise<LoadedKit> {

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
      `kit-mesh: ${source} is missing objects the vocabulary declares: ${missing.join(', ')}. ` +
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

  // ⚠ THE LEAF MEANS ARE READ HERE, ONCE, FROM THE ASSET'S OWN DECODED TEXELS — not declared and
  // not derived from the delivered frame. A tint rotates a map onto a token's chromaticity at the
  // MAP's own luminance (`leaf-tint.ts`), so it needs the map's mean and nothing else; taking it
  // from the picture instead would be an expectation derived from its own subject.
  const leafMeans = new Map<string, Rgb>();
  for (const parts of objects.values()) {
    for (const part of parts) {
      if (!LEAF_MATERIALS.has(part.materialName)) continue;
      if (leafMeans.has(part.materialName)) continue;
      const image = part.material.map?.image as DecodedMap | undefined;
      if (!image) {
        throw new Error(
          `kit-mesh: the leaf material ${part.materialName} carries no base-colour map, so a ` +
            'state tint has nothing to rotate — a crown would silently wear the token as a flat ' +
            'colour instead of the asset it was bought for',
        );
      }
      leafMeans.set(part.materialName, mapMeans(image).raw);
    }
  }
  const missingLeaf = [...LEAF_MATERIALS].filter((m) => !leafMeans.has(m));
  if (missingLeaf.length > 0) {
    throw new Error(
      `kit-mesh: ${source} carries none of the declared leaf materials [${missingLeaf.join(', ')}] — ` +
        "every tinted state would fall back to the kit's own green and the island would report " +
        'every capability as proven',
    );
  }

  return {
    assemblies,
    materials: [...materials].sort(),
    leafMeans,
    triangles,
    wireBytes: bytes.byteLength,
    textures: [...textures.values()],
    gpuBytes,
  };
}

/**
 * PARSE THE KIT THE SHIPPED CANVAS CARRIES — the embedded bytes, not a fetch.
 *
 * ⚠ THE SHIPPED PATH HAS NO URL TO FETCH. `pnpm sync:web-engine` copies `.ts` and `.tsx` only,
 * so a module reaching for `/assets/dressing-kit.glb` would work in the parent harness and 404 in
 * the public engine copy — silently, only for visitors. `kit-asset.ts` is the same asset by
 * construction: a drift test re-derives it from the committed `.glb` byte for byte.
 */
export async function loadEmbeddedKit(): Promise<LoadedKit> {
  return parseKit(decodeKitAsset(), 'the embedded kit (src/kit-asset.ts)');
}

/**
 * THE GROUND WIDTH EACH ROLE OCCUPIES, measured off the kit's own geometry at its role's scale.
 *
 * This is what keeps two props apart (`dressIslandFromKit`'s `footprint`), and it is measured
 * rather than declared for one reason: a pine's canopy is as wide as ITS OWN geometry says once
 * scaled to 18 ground units of height, and a number restated in the vocabulary would drift the
 * first time the asset is re-exported at a different rung or with a different tree.
 *
 * The widest assembly serving a role wins, so a role's clearance is enough for any of its arms.
 */
export function roleFootprints(kit: LoadedKit): RoleFootprints {
  const out = {} as Record<KitRole, number>;
  for (const role of KIT_ROLES) {
    let widest = 0;
    for (const name of KIT_ROLE_ASSEMBLIES[role]) {
      const assembly = kit.assemblies.get(name);
      if (!assembly) throw new Error(`kit-mesh: no assembly ${name} for role ${role}`);
      const size = KIT_ROLE_SIZE[role];
      const own = size.axis === 'height' ? assembly.height : assembly.width;
      if (!(own > 0)) throw new Error(`kit-mesh: assembly ${name} has no ${size.axis}`);
      widest = Math.max(widest, (assembly.width * size.units) / own);
    }
    out[role] = widest;
  }
  return out;
}

/**
 * THE MATERIAL A PLACEMENT'S PART WEARS — the kit's own, or a tinted clone of it.
 *
 * ⚠ ONE CLONE PER (MATERIAL, TINT), CACHED. `MeshStandardMaterial` compiles a program per
 * material, and this renderer is draw-call bound, so a clone per PLACEMENT would trade the merge
 * this file exists to do for one draw call per tree. Three tints over one leaf material is three
 * extra draw calls on a whole island.
 */
export function tintedMaterial(
  kit: LoadedKit,
  base: THREE.MeshStandardMaterial,
  materialName: string,
  tint: string | null,
  cache: Map<string, THREE.MeshStandardMaterial>,
): THREE.MeshStandardMaterial {
  if (tint === null || !LEAF_MATERIALS.has(materialName)) return base;
  const key = `${materialName}::${tint}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const mean = kit.leafMeans.get(materialName);
  if (!mean) throw new Error(`kit-mesh: no base-colour mean for the leaf material ${materialName}`);
  const gain = leafTintGainFor(tint, mean);
  if (!gain) {
    throw new Error(
      `kit-mesh: the state ${tint} has no declared leaf tint, so a placement asking for one is ` +
        'asking the crown to carry a state the vocabulary does not name',
    );
  }
  const clone = base.clone();
  // ⚠ The gain is applied to `color`, which three multiplies into the sampled texel — so the
  // map's own variation survives and only its chromaticity moves. `ColorManagement` is off on
  // this surface (`configureExactColour`), so the three numbers reach the shader unconverted,
  // which is the whole basis of `leaf-tint.ts`'s arithmetic being predictive at all.
  clone.color.setRGB(gain.r, gain.g, gain.b);
  clone.needsUpdate = true;
  cache.set(key, clone);
  return clone;
}

/** What one placement's geometry is multiplied by to stand at its role's height. */
export function placementScale(kit: LoadedKit, placement: KitPlacement): number {
  const assembly = kit.assemblies.get(placement.assembly);
  if (!assembly) throw new Error(`kit-mesh: no assembly ${placement.assembly}`);
  const size = KIT_ROLE_SIZE[placement.role];
  // ⚠ THE DECLARED AXIS, not always the height. Scaling a wide flat prop by its height
  // multiplies its footprint by the same factor — see `KIT_ROLE_SIZE`.
  const own = size.axis === 'height' ? assembly.height : assembly.width;
  if (!(own > 0)) throw new Error(`kit-mesh: assembly ${placement.assembly} has no ${size.axis}`);
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

/** One merge bucket: everything sharing a material AND a tint becomes one mesh. */
interface MergeBucket {
  material: THREE.MeshStandardMaterial;
  parts: THREE.BufferGeometry[];
}

/**
 * BUILD THE DRESSING: one merged mesh per (material, tint), however many props there are.
 *
 * The transform is `translate * rotateY * scale`, applied to a CLONE of the kit's geometry, so
 * the kit itself is never mutated and two placements of one assembly cannot interfere.
 *
 * ⚠ THE TINT IS PART OF THE BUCKET KEY, and it has to be: a merged mesh wears ONE material, so
 * merging a yellow-crowned tree with a green one by material alone would silently paint both
 * whichever colour arrived first — an island reporting a state that half its capabilities do not
 * hold, drawn with no error anywhere. The cost is one extra draw call per tint actually used.
 */
export function kitMeshes(kit: LoadedKit, placements: readonly KitPlacement[]): THREE.Mesh[] {
  const byMaterial = new Map<string, MergeBucket>();
  const tints = new Map<string, THREE.MeshStandardMaterial>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (const placement of placements) {
    const assembly = kit.assemblies.get(placement.assembly);
    if (!assembly) throw new Error(`kit-mesh: no assembly ${placement.assembly}`);
    const scale = placementScale(kit, placement);
    q.setFromAxisAngle(up, placement.yaw);
    m.compose(
      new THREE.Vector3(placement.at.x, placement.y, placement.at.z),
      q,
      new THREE.Vector3(scale, scale, scale),
    );
    for (const part of assembly.objects) {
      const geometry = part.geometry.clone().applyMatrix4(m);
      const material = tintedMaterial(kit, part.material, part.materialName, placement.tint, tints);
      const key = material === part.material ? part.materialName : `${part.materialName}::${placement.tint}`;
      const bucket = byMaterial.get(key);
      if (bucket) bucket.parts.push(geometry);
      else byMaterial.set(key, { material, parts: [geometry] });
    }
  }

  const out: THREE.Mesh[] = [];
  for (const [name, bucket] of byMaterial) {
    const merged = mergeGeometries(bucket.parts, false);
    if (!merged) {
      throw new Error(
        `kit-mesh: could not merge the ${bucket.parts.length} geometries wearing ${name} — ` +
          'they do not share an attribute set, so this dressing would silently cost one draw ' +
          'call per prop on a draw-call-bound renderer',
      );
    }
    for (const part of bucket.parts) part.dispose();
    out.push(new THREE.Mesh(merged, bucket.material));
  }
  return out;
}
