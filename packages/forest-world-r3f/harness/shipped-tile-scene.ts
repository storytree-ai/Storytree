// shipped-tile-scene.ts — THE 2D TILE FOOTPRINT FOLLOWS THE LAND RATIO (ADR-0528), laddered on the
// REAL forest for the owner (increment `tile-footprint-follows-the-land-ratio` on
// `land-ground-stack-arc`).
//
//   today            the map AS IT SHIPPED before this landing — `max(3, capabilities + 2)` hex tiles of
//                    radius 27 per island, at the shipped spacing ratio (CONTROL — every "moved" is vs this).
//                    Exported from the untouched code at the merge-base, never re-derived.
//   tile-spacing-<r> the same corpus drawn on the DERIVED tile — one hex per capability, the hex sized so
//                    that a drawn island IS `capabilities × 318 units²` — at spacing ratio r. The ladder
//                    is ADR-0528 D5: the gap re-laddered over correctly-sized tiles.
//
// ⚠⚠ THIS IS THE SPACING PAGE'S INSTRUMENT POINTED AT A DIFFERENT LADDER. Every arm is the studio's own
// `buildWorld` output for the live corpus, exported through the `?sceneExport=1` bridge by
// `apps/studio/scripts/export-tile-scenes.mjs`, pruned to what `worldTo3D` reads, and committed as
// `docs/research/chapter2-tile-footprint-2026-09-06/scenes/<arm>.json`. The shipped 3D pipeline —
// `worldTo3D` at the shipped land ratio, `dressMapWithCover`, `shippedGroundBuild`,
// `buildGroundMaterial` — the readings and the GPU clock are `shipped-spacing-scene.ts`'s, reached
// through its loader seam. Two ladders, one ruler: a number on this page is comparable to a number
// on that one because it was taken by the same code.
//
// ⚠⚠ THE ISLAND IS UNAFFECTED, AND THE DRIVER HOLDS IT. ADR-0520 sizes every 3D island to exactly
// `capabilities × 318` whatever its 2D tile footprint; what this landing changes is the FOOTPRINT
// the 2D layout reserves for it — and therefore where the islands stand. So on every arm the read
// island holds the same capabilities on the same land; its outline is composed from fewer hexes (one
// per capability instead of capabilities + 2), and that is the one change the read zoom shows.
//
// ⚠ FRAME COST REPORTS, IT DOES NOT GATE (ADR-0517 D4). Taken by `shipped-tile-cost.mjs`.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE. The tile lands in
// `packages/forest-world/src/hex.ts`; the spacing pick in `apps/studio/src/lib/islandSpacing.ts`.

import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.js';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.js';
import { FIT_ZOOM } from './shipped-crowd-scene.js';
import {
  SPACING_SHOTS,
  VISIBLE_DELTA,
  createSpacingRunner,
  fetchJsonFromPage,
  picture,
  type FetchJson,
  type SpacingArm,
  type SpacingArmRecord,
  type SpacingManifest,
  type SpacingRunner,
  type SpacingSceneFile,
} from './shipped-spacing-scene.js';

export const TILE_EVIDENCE_DIR = 'chapter2-tile-footprint-2026-09-06';
export const TILE_SCENES_ROUTE = `/reference/${TILE_EVIDENCE_DIR}/scenes`;
export const TILE_CONTROL_ARM = 'today';

/** What the 2D layout drew each island on, as the export records it per arm. */
export interface TileRecord {
  /** The hex circumradius the lattice was built on, ground units. */
  hexR: number;
  /** How an island's tile quota was derived from its capability count — prose, for the reader. */
  quota: string;
  /** Hexes per capability on the derived tile; absent on the control (its quota is the `+ 2` rule). */
  tilesPerCapability?: number;
}

export interface TileArmRecord extends SpacingArmRecord {
  tile: TileRecord;
  /** Where the scene came from: the studio's head when it was exported. The control's is the
   *  merge-base; the derived arms' is this branch. */
  source: { head: string; branch: string; generatedAt: string };
}

export interface TileManifest extends SpacingManifest {
  arms: TileArmRecord[];
  /** The derived tile every non-control arm stands on. */
  tile: TileRecord & { tilesPerCapability: number };
  /** The tile the control stands on — the map as it shipped. */
  controlTile: TileRecord;
}

export function tileArmId(ratio: number): string {
  return `tile-spacing-${ratio}`;
}

/** The manifest must name a control on the OLD tile and a descending ladder on the DERIVED tile,
 *  every arm carrying its tile and its source — refused otherwise. */
export function validateTileManifest(m: unknown): TileManifest {
  const bad = (why: string): never => {
    throw new Error(`shipped-tile-scene: manifest.json is not a tile ladder — ${why}`);
  };
  if (typeof m !== 'object' || m === null) return bad('not an object');
  const o = m as Partial<TileManifest>;
  if (!Array.isArray(o.arms) || o.arms.length < 2) return bad('fewer than two arms');
  if (typeof o.control !== 'string' || !o.arms.some((a) => a.id === o.control)) return bad('no control arm');
  if (typeof o.shippedRatio !== 'number') return bad('no shippedRatio');
  if (!Array.isArray(o.rungs) || o.rungs.length === 0) return bad('no rungs');
  if (typeof o.tile?.hexR !== 'number' || typeof o.tile.tilesPerCapability !== 'number') return bad('no derived tile');
  if (typeof o.controlTile?.hexR !== 'number') return bad('no control tile');
  if (!(o.tile.hexR < o.controlTile.hexR)) return bad(`the derived tile (${o.tile.hexR}) is not smaller than the control's (${o.controlTile.hexR})`);
  for (const a of o.arms) {
    if (typeof a.id !== 'string' || typeof a.file !== 'string') return bad(`arm ${JSON.stringify(a)} has no id/file`);
    if (typeof a.spacing?.ratio !== 'number') return bad(`arm ${a.id} carries no ratio`);
    if (typeof a.tile?.hexR !== 'number') return bad(`arm ${a.id} carries no tile`);
    if (typeof a.source?.head !== 'string') return bad(`arm ${a.id} carries no source head`);
    if (a.id === o.control && a.tile.hexR !== o.controlTile.hexR) return bad('the control does not stand on the control tile');
    if (a.id !== o.control && a.tile.hexR !== o.tile.hexR) return bad(`arm ${a.id} does not stand on the derived tile`);
  }
  const ratios = o.arms.filter((a) => a.id !== o.control).map((a) => a.spacing.ratio as number);
  for (let i = 1; i < ratios.length; i += 1) {
    if (ratios[i]! >= ratios[i - 1]!) return bad(`the ladder does not descend (${ratios.join(' / ')})`);
  }
  return o as TileManifest;
}

export async function loadTileArms(fetchJson: FetchJson, route: string = TILE_SCENES_ROUTE): Promise<{ manifest: TileManifest; arms: SpacingArm[] }> {
  const manifest = validateTileManifest(await fetchJson(`${route}/manifest.json`));
  const arms: SpacingArm[] = [];
  for (const record of manifest.arms) {
    const file = (await fetchJson(`${route}/${record.file}`)) as SpacingSceneFile;
    if (typeof file !== 'object' || file === null || file.scene?.el !== 'g') {
      throw new Error(`shipped-tile-scene: ${record.file} carries no scene graph`);
    }
    arms.push({ record, file });
  }
  return { manifest, arms };
}

export function tileArmCaption(record: TileArmRecord, manifest: TileManifest): string {
  const t = record.tile;
  const where = `hex radius ${t.hexR.toFixed(2)}, ${t.quota}`;
  if (record.id === manifest.control) {
    return `the map as it SHIPPED before this landing — ${where}, spacing ratio ${record.spacing.ratio} — TODAY (CONTROL)`;
  }
  const r = record.spacing.ratio;
  const tag = r === manifest.shippedRatio ? ' — THE SHIPPED PICK' : r === 0 ? ' — the lattice’s own floor; the boldest rung' : '';
  return `the DERIVED tile — ${where} (a drawn island is exactly capabilities × ${LAND_AREA_PER_CAPABILITY} units²) — every gap ${r} × the mean radius of the two islands it separates${tag}`;
}

export async function createTileRunner(fetchJson: FetchJson = fetchJsonFromPage): Promise<SpacingRunner> {
  return createSpacingRunner(fetchJson, loadTileArms);
}

// ---------------------------------------------------------------- the page

export async function mountShippedTile(root: HTMLElement): Promise<void> {
  const runner = await createTileRunner();
  window.tileRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const m = runner.manifest() as TileManifest;
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → scale ${cal.scale.toFixed(3)} · ` +
    `derived tile: hex radius ${m.tile.hexR.toFixed(3)}, ${m.tile.tilesPerCapability} tile per capability (${m.tile.quota}) · ` +
    `control tile: hex radius ${m.controlTile.hexR}, ${m.controlTile.quota} · shipped spacing ratio ${m.shippedRatio} · ` +
    `land ${LAND_AREA_PER_CAPABILITY} units² per capability on every island of every arm · signed elevation ${RENDER_ELEV_DEG}°`;
  root.appendChild(head);
  const { arms } = await loadTileArms(fetchJsonFromPage);
  for (const shot of SPACING_SHOTS) {
    const pic = picture(shot.picture);
    const h = document.createElement('h2');
    h.textContent = `${pic.id} — ${pic.what} — ${shot.zoom === FIT_ZOOM ? 'fitted (each arm at its own fit)' : `${shot.zoom} px/unit`}`;
    root.appendChild(h);
    const row = document.createElement('div');
    row.className = 'row';
    for (const arm of arms) {
      const r = runner.read(arm.record.id, pic.id, shot.zoom);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = runner.snapshot(arm.record.id, pic.id, shot.zoom);
      img.width = 900;
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent =
        `${arm.record.id} — ${tileArmCaption(arm.record as TileArmRecord, m)} · ${r.bounds.islands} islands · centres span ${r.bounds.centres.w.toFixed(0)}×${r.bounds.centres.d.toFixed(0)} units · ` +
        `nearest pair ${r.nearest.a}↔${r.nearest.b} ${r.nearest.distance.toFixed(0)} units apart, ${r.nearest.water.toFixed(0)} of water · ` +
        `${r.pxPerUnit.toFixed(3)} px/unit · land ${(r.landShare * 100).toFixed(2)}% of the frame, ${(r.landShareOfBox * 100).toFixed(1)}% of its box · ` +
        `${r.counts.capabilityTrees} trees · pine ${r.pineHeightPx.toFixed(1)} px · trails ${r.trails.edges} routed / ${r.trails.dropped.length} dropped · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()}`;
      fig.appendChild(cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }
}

declare global {
  interface Window {
    tileRunner?: SpacingRunner;
  }
}
