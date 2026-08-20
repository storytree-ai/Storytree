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
  triangulateFan,
  type GroundCell,
} from './island-descriptors.js';
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

/** Cell walls: how far a cell body is extruded downward, in ground units. Small — the land
 *  is a relaxed mesh of flat parcels, not a stack of blocks (ADR-0367 D5's interior fork
 *  settled on flat per-cell fills plus rim pieces). */
const CELL_DEPTH = 2.2;

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

/** Build one merged ground mesh per status family: a top face per cell plus a south-facing
 *  wall skirt, so the land has thickness at the render angle. Merged rather than
 *  per-cell-meshed because 162 draw calls would be measuring a different thing. */
function groundMeshes(cells: readonly GroundCell[]): THREE.Mesh[] {
  const byStatus = new Map<string, GroundCell[]>();
  for (const c of cells) {
    const key = c.wheat ? `${c.status}::wheat` : c.status;
    const list = byStatus.get(key) ?? [];
    list.push(c);
    byStatus.set(key, list);
  }

  const meshes: THREE.Mesh[] = [];
  for (const [key, group] of byStatus) {
    const [status, wheat] = key.split('::');
    const fam = STATUS_TOKENS[status!] ?? STATUS_TOKENS['unknown']!;
    const positions: number[] = [];
    const normals: number[] = [];

    for (const cell of group) {
      // Top face — flat, so its normal is straight up and it lands on the ladder's brightest
      // rung. That IS the land's "one surface" (the owner's 2026-08-16 flat-green direction).
      //
      // WINDING IS LOAD-BEARING HERE AND IT COST A WHOLE RENDER. SVG (x, y) maps to 3D
      // (x, z), which FLIPS HANDEDNESS, so a polygon wound one way in the scene comes out
      // wound the other way seen from above. With front-face culling on, that culled every
      // top face and left only the wall skirts — an island that rendered as a lattice of
      // thin green lines over holes, and read like an art problem rather than a bug.
      //
      // So the winding is DERIVED from the polygon's own signed area rather than assumed:
      // whichever way the cell was authored, its triangles are emitted facing +y.
      const fan = triangulateFan(cell.points);
      let signed = 0;
      for (let i = 0; i < cell.points.length; i++) {
        const a = cell.points[i]!;
        const b = cell.points[(i + 1) % cell.points.length]!;
        signed += a.x * b.y - b.x * a.y;
      }
      const flip = signed > 0;
      for (const [ax, ay, bx, by, cx, cy] of fan) {
        if (flip) positions.push(ax!, 0, ay!, cx!, 0, cy!, bx!, 0, by!);
        else positions.push(ax!, 0, ay!, bx!, 0, by!, cx!, 0, cy!);
        for (let k = 0; k < 3; k++) normals.push(0, 1, 0);
      }
      // Wall skirt — only the edges facing the camera need drawing, but drawing them all is
      // cheaper than deciding, and back faces are culled anyway.
      for (let i = 0; i < cell.points.length; i++) {
        const a = cell.points[i]!;
        const b = cell.points[(i + 1) % cell.points.length]!;
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const len = Math.hypot(ex, ey) || 1;
        // Outward horizontal normal of this edge.
        const nx = ey / len;
        const nz = -ex / len;
        positions.push(
          a.x, 0, a.y, b.x, 0, b.y, b.x, -CELL_DEPTH, b.y,
          a.x, 0, a.y, b.x, -CELL_DEPTH, b.y, a.x, -CELL_DEPTH, a.y,
        );
        for (let k = 0; k < 6; k++) normals.push(nx, 0, nz);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    // The wall family is the SIDE token, the top the first ground variant — the same split
    // the compositor's `KEY_SHADE` makes. Colour is per-mesh, so a cell can never emit a
    // colour from another status's family.
    const token = wheat ? fam.wheat : fam.top[0]!;
    meshes.push(new THREE.Mesh(geom, createBandedMaterial({ token, doubleSided: false })));
  }
  return meshes;
}

/** One merged mesh per (status, style) for the vegetation — same merging rationale. */
function plantMesh(plants: readonly PlantInstance[], style: 'mound' | 'foliage'): THREE.Mesh[] {
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
      // Ground position: the plant stands at its own ground contact, unprojected.
      const gx = p.transform.x;
      const gz = p.transform.z / groundFlat;
      for (let v = 0; v < mesh.indices.length; v++) {
        const idx = mesh.indices[v]! * 3;
        positions.push(
          mesh.positions[idx]! + gx,
          mesh.positions[idx + 1]!,
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

  for (const m of groundMeshes(cells)) scene3.add(m);
  if (props.plants !== false) {
    for (const m of plantMesh(plantsFrom(scene), props.style ?? 'mound')) scene3.add(m);
  }

  // The island's on-screen size at this camera: the ground's depth foreshortens by
  // sin(RENDER_ELEV), and its width does not.
  const elev = (RENDER_ELEV_DEG * Math.PI) / 180;
  const screenW = bounds.w;
  const screenH = bounds.h * Math.sin(elev) + CELL_DEPTH * Math.cos(elev);
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
  }, [props.pxPerUnit, props.displayPxPerUnit, props.style, props.plants, props.island]);
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
