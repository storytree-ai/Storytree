// IslandView.tsx — the live-rendered ISLAND (dev-only harness).
//
// The first pass of this experiment answered on a row of plants, and the owner replied with
// the arc's own standing rule: judge on the ISLAND, never a contact sheet. A plant row can
// show that one convention carries more detail; only an island can show whether the result
// reads as a place — whether the vegetation sits IN the land rather than on top of it,
// whether density reads as density, and whether a hundred small marks compose or just fight.
//
// The comparison discipline is unchanged and it is the thing that makes any of this
// readable: ONE SCENE, TWO DELIVERY CONVENTIONS. Both panels draw the same `buildScene`
// output, the same ground cells, the same plants at the same ground positions, the same
// banded palette, the same light, the same orthographic 50-degree camera. The only
// difference is the rasterisation resolution. So a difference between the panels is the
// convention and nothing else.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import {
  configureExactColour,
  createBandedMaterial,
} from './banded-material.js';
import {
  groundBounds,
  groundCellsFrom,
  type GroundCell,
} from './island-descriptors.js';
import {
  LAND_CELL_DEPTH as CELL_DEPTH,
  LAND_RELIEF_AMPLITUDE,
  PARCEL_BEVEL_DROP,
  landHeight,
  landHeightRange,
  landNormal,
  planLandDefinition,
  signedArea2,
  wallFootY,
} from './land-definition.js';
import { islandScene, type IslandOptions } from './island-fixture.js';
import { plantsFrom, type PlantInstance } from './plant-descriptors.js';
import { growPlant } from './plant-geometry.js';
import { STATUS_TOKENS } from './palette-band.js';
import {
  LAND_CAMERA_ELEVATION_DEG,
  groundFlattening,
  uprightForeshortening,
} from '@storytree/forest-world';

/** The elevation the live camera renders at — the arc's signed research angle (2026-08-16:
 *  "50 degrees looks good, i think we go with this"). NOT the angle the scene was projected
 *  at; that is `LAND_CAMERA_ELEVATION_DEG` and it is what the extractor unprojects by. */
const RENDER_ELEV_DEG = 50;


/**
 * What interior definition the LAND carries.
 *
 * Separable on purpose. The two mechanisms answer different halves of "the land is one
 * flat colour" — relief gives a big parcel's interior something to be, and the bevel gives
 * the island a structure to read — and a reader who cannot see them apart cannot tell which
 * one is doing the work. `flat` is the 2026-08-19 control, unchanged.
 */
export type LandDefinition = 'flat' | 'relief' | 'bevel' | 'full';

export interface IslandViewProps {
  /** Rasterise at this many device pixels per ground unit. 1 = the sprite convention. */
  pxPerUnit: number;
  /** Present at this many CSS pixels per ground unit. */
  displayPxPerUnit: number;
  /** Plant silhouette style — the owner's "circular swirls" fork. */
  style?: 'mound' | 'foliage';
  /** Draw the vegetation at all (a bare-land control). */
  plants?: boolean;
  /** Give one capability a foreign status, for the mixed-island panel. */
  island?: IslandOptions;
  /** How much interior definition the land carries. Defaults to `full`. */
  land?: LandDefinition;
  /** Relief amplitude override, for the amplitude ladder panel. */
  amplitude?: number;
}

/** ONE shared WebGL context for the page — a browser caps simultaneous contexts near
 *  sixteen and silently LOSES the oldest, and a lost canvas delivers zero pixels, which
 *  can never FAIL a palette check and can only make one pass for the wrong reason. */
let shared: { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null = null;

function sharedRenderer(): { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // Off on purpose: a multisampled edge blends two palette entries into a colour on
    // neither, and would condemn the shader for the compositor's arithmetic.
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor(0x000000, 0);
  shared = { renderer, canvas };
  return shared;
}

/** A 3D vertex plus the normal it wears — the unit the emitters below trade in. */
interface V3 {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Build one merged ground mesh per status family: a top face per cell, a bevel face along
 * every boundary edge, and a wall skirt at the island's rim. Merged rather than
 * per-cell-meshed because 164 draw calls would be measuring a different thing.
 *
 * WHAT CHANGED HERE, AND WHY IT IS TWO MECHANISMS RATHER THAN ONE. The 2026-08-19 island
 * showed the bare land as a single flat green field: every cell carried the same token, and
 * every top face carried the same straight-up normal, so the whole island quantised onto one
 * rung of the ladder. Both halves of that had to move, and they are separable because they
 * fix different things — `land-definition.ts` carries the reasoning and the numbers.
 *
 *   - RELIEF gives the normal somewhere to go. Vertices ride a continuous height field and
 *     wear its analytic normal, so a big parcel's interior stops being one rung.
 *   - THE BEVEL gives the island structure to read. Boundary edges turn down over 1.6
 *     ground units, so a parcel reads as a parcel.
 *
 * NEITHER OF THEM NAMES A COLOUR. The material still emits `token * bandShade(lambert)`, so
 * the palette closure is untouched by construction and the amplitude below is free in
 * palette terms — which is true of THIS renderer and emphatically not of the author-time
 * compositor path, where the same idea cost +619 entries.
 */
function groundMeshes(
  cells: readonly GroundCell[],
  land: LandDefinition,
  amplitude: number,
): THREE.Mesh[] {
  const relief = land === 'relief' || land === 'full' ? amplitude : 0;
  const bevel = land === 'bevel' || land === 'full';
  const plan = planLandDefinition(cells);

  /** Lift a ground point onto the relief field, carrying the field's analytic normal. A
   *  PER-VERTEX analytic normal rather than a per-face one: face normals would make each
   *  triangle quantise whole and deliver the land as a mosaic of hard facets, which is the
   *  rejected per-cell noise arriving by another route. */
  const onLand = (p: { x: number; y: number }, drop = 0): V3 => {
    const n = landNormal(p.x, p.y, relief);
    return {
      x: p.x,
      y: landHeight(p.x, p.y, relief) - drop,
      z: p.y,
      nx: n.x,
      ny: n.y,
      nz: n.z,
    };
  };

  const byStatus = new Map<string, number[]>();
  cells.forEach((c, i) => {
    const key = c.wheat ? `${c.status}::wheat` : c.status;
    const list = byStatus.get(key) ?? [];
    list.push(i);
    byStatus.set(key, list);
  });

  const meshes: THREE.Mesh[] = [];
  for (const [key, group] of byStatus) {
    const [status, wheat] = key.split('::');
    const fam = STATUS_TOKENS[status!] ?? STATUS_TOKENS['unknown']!;
    const positions: number[] = [];
    const normals: number[] = [];

    const tri = (a: V3, b: V3, c: V3): void => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      normals.push(a.nx, a.ny, a.nz, b.nx, b.ny, b.nz, c.nx, c.ny, c.nz);
    };
    /**
     * A flat quad `a-b-c-d`, wound so that the face the camera can see is the one pointing
     * along `want`, and normalled with `want` on all four corners.
     *
     * BOTH HALVES ARE DERIVED, NOT ASSUMED, AND THAT IS THE LESSON THIS FILE ALREADY PAID
     * FOR ONCE. SVG (x, y) maps to 3D (x, z), which flips handedness, so "the winding I
     * wrote down" is not reliably the winding that survives front-face culling — the first
     * island render lost every top face to exactly that and looked like an art problem.
     * So the geometric normal is computed and the winding chosen to agree with `want`.
     *
     * The four corners share ONE normal because a bevel face and a wall face are genuinely
     * flat. On a banded material that is what makes them read as a fold and an edge rather
     * than as a smeared gradient.
     */
    const quad = (
      a: V3,
      b: V3,
      c: V3,
      d: V3,
      want: { x: number; y: number; z: number },
    ): void => {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      const gx = uy * vz - uz * vy;
      const gy = uz * vx - ux * vz;
      const gz = ux * vy - uy * vx;
      const f = (p: V3): V3 => ({ ...p, nx: want.x, ny: want.y, nz: want.z });
      if (gx * want.x + gy * want.y + gz * want.z >= 0) {
        tri(f(a), f(b), f(c));
        tri(f(a), f(c), f(d));
      } else {
        tri(f(a), f(c), f(b));
        tri(f(a), f(d), f(c));
      }
    };

    /** The unit normal of the plane through three points, flipped to point upward — the
     *  bevel's own slope, which is what gives its two sides different rungs. */
    const faceUp = (a: V3, b: V3, c: V3): { x: number; y: number; z: number } => {
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const s = ny < 0 ? -1 / len : 1 / len;
      nx *= s;
      ny *= s;
      nz *= s;
      return { x: nx, y: ny, z: nz };
    };

    for (const ci of group) {
      const cell = cells[ci]!;
      const n = cell.points.length;
      // The top face's outline: the cell's own points, pulled in along every boundary edge
      // so the bevel has somewhere to sit. `insetPoint` returns the vertex unchanged where
      // there is no boundary, so an interior cell is untouched.
      const outer = cell.points;
      const inner = bevel
        ? outer.map((_, k) => plan.insetPoint(ci, k))
        : outer.map((p) => ({ x: p.x, y: p.y }));

      // WINDING IS LOAD-BEARING HERE AND IT COST A WHOLE RENDER. With front-face culling
      // on, a polygon wound the wrong way culls its own top face — which on the first
      // island render left only the wall skirts, an island of thin green lines over holes
      // that read like a design failure. So the winding is DERIVED from the polygon's own
      // signed area: whichever way the cell was authored, its triangles face +y.
      const flip = signedArea2(inner) > 0;
      let cx = 0;
      let cy = 0;
      for (const p of inner) {
        cx += p.x;
        cy += p.y;
      }
      const mid = onLand({ x: cx / n, y: cy / n });
      for (let i = 0; i < n; i++) {
        const a = onLand(inner[i]!);
        const b = onLand(inner[(i + 1) % n]!);
        if (flip) tri(mid, b, a);
        else tri(mid, a, b);
      }

      for (let i = 0; i < n; i++) {
        const role = plan.edgeRole(ci, i);
        if (role === 'interior') continue;
        const oa = outer[i]!;
        const ob = outer[(i + 1) % n]!;
        if (bevel) {
          // The bevel: from the inset line at ground height, down and out to the original
          // edge. Two parcels each bevel their own side of a shared edge, so a capability
          // boundary comes out as a V-groove with a lit face and a shaded face — a fold in
          // the same lighting language as everything else, not a drawn line.
          const p0 = onLand(inner[i]!);
          const p1 = onLand(inner[(i + 1) % n]!);
          const p2 = onLand(ob, PARCEL_BEVEL_DROP);
          const p3 = onLand(oa, PARCEL_BEVEL_DROP);
          quad(p0, p1, p2, p3, faceUp(p0, p1, p2));
        }
        if (role !== 'rim') continue;
        // The wall skirt, so the land has thickness at the render angle. Emitted ONLY at
        // the rim now: every other edge is shared with a neighbouring cell, so its skirt
        // was always hidden — and once the ground undulates, a hidden skirt stops being
        // reliably hidden and starts poking through the terrain as a stray dark sliver.
        //
        // IT HANGS FROM THE RIM RATHER THAN REACHING A FIXED FLOOR, AND THAT IS A FIX
        // RATHER THAN A PREFERENCE. The skirt used to run from y = 0 down to a constant
        // y = -CELL_DEPTH, which is the same thing on a flat plane and is NOT the same
        // thing once the coast rises and falls: measured on this fixture, 30 of the rim's
        // 104 endpoints sit BELOW -CELL_DEPTH, so nearly a third of the coast would have
        // rendered its wall UPSIDE DOWN — a band of wall pointing up out of the land. The
        // wall now hangs a constant CELL_DEPTH below whatever the rim is doing, which
        // keeps the authored thickness everywhere and leaves the island's underside
        // undulating where nobody at a 50-degree camera can see it.
        const drop = bevel ? PARCEL_BEVEL_DROP : 0;
        const ta = onLand(oa, drop);
        const tb = onLand(ob, drop);
        const footA = wallFootY(ta.y);
        const footB = wallFootY(tb.y);
        // Outward horizontal normal, oriented AWAY from the cell's own centroid rather
        // than taken from the edge direction, which the handedness flip makes unreliable.
        const ex = ob.x - oa.x;
        const ey = ob.y - oa.y;
        const el = Math.hypot(ex, ey) || 1;
        let nx = -ey / el;
        let nz = ex / el;
        if (nx * (cx / n - (oa.x + ob.x) / 2) + nz * (cy / n - (oa.y + ob.y) / 2) > 0) {
          nx = -nx;
          nz = -nz;
        }
        quad(ta, tb, { ...tb, y: footB }, { ...ta, y: footA }, { x: nx, y: 0, z: nz });
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    // ONE token for the whole family — ground, bevel and wall alike. The bevel deliberately
    // does NOT take the darker `side` token: a boundary drawn in a different colour is a
    // drawn SEAM, which is the treatment the owner removed. Wearing the ground's own token
    // and differing only by rung makes it a fold in the land instead. Colour is per-mesh,
    // so a cell can never emit a colour from another status's family.
    const token = wheat ? fam.wheat : fam.top[0]!;
    meshes.push(new THREE.Mesh(geom, createBandedMaterial({ token, doubleSided: false })));
  }
  return meshes;
}

/** One merged mesh per (status, style) for the vegetation — same merging rationale.
 *
 *  `relief` is the ground's amplitude, and passing it is not optional dressing: a plant is
 *  fitted to stand on y = 0, so the moment the land stops being a plane every plant either
 *  floats above it or sinks into it. That failure is quiet at delivered size — a shrub half
 *  a unit into the ground still looks like a shrub — which is exactly why it is threaded
 *  through here rather than left to be noticed. */
function plantMesh(
  plants: readonly PlantInstance[],
  style: 'mound' | 'foliage',
  relief: number,
): THREE.Mesh[] {
  const byStatus = new Map<string, PlantInstance[]>();
  for (const p of plants) {
    const list = byStatus.get(p.material) ?? [];
    list.push(p);
    byStatus.set(p.material, list);
  }

  // TWO DIFFERENT FORESHORTENINGS, AND USING THE WRONG ONE IS A 2.8x ERROR.
  //
  //   - a GROUND distance foreshortens by sin(elev) = 0.342 at the land camera;
  //   - an UPRIGHT height foreshortens by cos(elev) = 0.940.
  //
  // A plant's footprint carries both: its WIDTH is a ground span in x (which does not
  // foreshorten at all), its HEIGHT is the upright mark's drawn height, and its POSITION is
  // a ground point. The first render divided the height by the GROUND flattening, which
  // multiplied every plant by 2.75 and produced shrubs towering over the cells they stand
  // on. `camera.ts` names the split precisely; this is what its two helpers are for.
  const groundFlat = groundFlattening(LAND_CAMERA_ELEVATION_DEG);
  const upright = uprightForeshortening(LAND_CAMERA_ELEVATION_DEG);
  const meshes: THREE.Mesh[] = [];
  for (const [status, group] of byStatus) {
    const fam = STATUS_TOKENS[status] ?? STATUS_TOKENS['unknown']!;
    const positions: number[] = [];
    const normals: number[] = [];

    group.forEach((p, i) => {
      // The descriptor's footprint is in the scene's PROJECTED space, so its height was
      // foreshortened on the way out. Recover it the same way the ground is recovered —
      // otherwise the plants would be squat against land that is not.
      const mesh = growPlant({
        seed: (i + 1) * 2654435761,
        form: p.form === 'mixed' ? 'shrub' : p.form,
        width: Math.max(1.5, p.footprint.w),
        height: Math.max(1.2, p.footprint.h / upright),
        detail: 2,
        style,
      });
      // Ground position: the plant stands at its own ground contact, unprojected — and now
      // at the HEIGHT the land actually has there, so it sits IN the land rather than on a
      // remembered plane.
      const gx = p.transform.x;
      const gz = p.transform.z / groundFlat;
      const gy = landHeight(gx, gz, relief);
      for (let v = 0; v < mesh.indices.length; v++) {
        const idx = mesh.indices[v]! * 3;
        positions.push(
          mesh.positions[idx]! + gx,
          mesh.positions[idx + 1]! + gy,
          mesh.positions[idx + 2]! + gz,
        );
        normals.push(mesh.normals[idx]!, mesh.normals[idx + 1]!, mesh.normals[idx + 2]!);
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    // Vegetation wears the status's SIDE token — a darker member of the same family, so a
    // plant reads as distinct from the ground beneath it without leaving its own status.
    meshes.push(
      new THREE.Mesh(geom, createBandedMaterial({ token: fam.side, doubleSided: true })),
    );
  }
  return meshes;
}

function renderIsland(canvas: HTMLCanvasElement, props: IslandViewProps): void {
  const scene3 = new THREE.Scene();
  const scene = islandScene(props.island ?? {});
  const cells = groundCellsFrom(scene);
  const bounds = groundBounds(cells);
  const land = props.land ?? 'full';
  const amplitude = props.amplitude ?? LAND_RELIEF_AMPLITUDE;
  const relief = land === 'relief' || land === 'full' ? amplitude : 0;

  for (const m of groundMeshes(cells, land, amplitude)) scene3.add(m);
  if (props.plants !== false) {
    for (const m of plantMesh(plantsFrom(scene), props.style ?? 'mound', relief)) scene3.add(m);
  }

  // The island's on-screen size at this camera: the ground's depth foreshortens by
  // sin(RENDER_ELEV), and its width does not. The relief's own height is an UPRIGHT extent,
  // so it foreshortens by cos — the other of the two flattenings, and using one where the
  // other belongs is the silent 2.75x error this file already paid for once.
  //
  // The upright extent is the whole solid, top to bottom: relief reaches `landHeightRange`
  // either side of zero, the bevel takes the rim a further `PARCEL_BEVEL_DROP` down, and
  // the wall hangs `CELL_DEPTH` below that. Framing on less crops the coast, which reads
  // like a clipped island rather than like a camera that is too tight.
  const elev = (RENDER_ELEV_DEG * Math.PI) / 180;
  const screenW = bounds.w;
  const upright =
    2 * landHeightRange(relief) + (land === 'bevel' || land === 'full' ? PARCEL_BEVEL_DROP : 0);
  const screenH = bounds.h * Math.sin(elev) + (CELL_DEPTH + upright) * Math.cos(elev);
  const pad = 3;
  const bufW = Math.max(1, Math.round((screenW + pad * 2) * props.pxPerUnit));
  const bufH = Math.max(1, Math.round((screenH + pad * 2) * props.pxPerUnit));

  const { renderer, canvas: glCanvas } = sharedRenderer();
  renderer.setSize(bufW, bufH, false);

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  const camera = new THREE.OrthographicCamera(
    -(screenW + pad * 2) / 2,
    (screenW + pad * 2) / 2,
    (screenH + pad * 2) / 2,
    -(screenH + pad * 2) / 2,
    -2000,
    2000,
  );
  const dist = 500;
  camera.position.set(cx, Math.sin(elev) * dist, cz + Math.cos(elev) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(cx, 0, cz);
  camera.updateProjectionMatrix();

  renderer.render(scene3, camera);

  canvas.width = bufW;
  canvas.height = bufH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bufW, bufH);
    ctx.drawImage(glCanvas, 0, 0, bufW, bufH, 0, 0, bufW, bufH);
  }
  canvas.style.width = `${(screenW + pad * 2) * props.displayPxPerUnit}px`;
  canvas.style.height = `${(screenH + pad * 2) * props.displayPxPerUnit}px`;
  canvas.style.imageRendering = 'pixelated';
}

export function IslandPanel({
  label,
  note,
  ...props
}: IslandViewProps & { label: string; note: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderIsland(ref.current, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.pxPerUnit,
    props.displayPxPerUnit,
    props.style,
    props.plants,
    props.island,
    props.land,
    props.amplitude,
  ]);
  return (
    <figure className="panel">
      <figcaption>
        <strong>{label}</strong>
        <span>{note}</span>
      </figcaption>
      <div className="stage">
        <canvas ref={ref} />
      </div>
    </figure>
  );
}
