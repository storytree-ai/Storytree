// crowd-layout.ts — WHERE 35 ISLANDS STAND, and at what size a visitor actually sees them.
//
// PR #1693 dressed ONE island from the bought kit and it read as a pine forest. It attached a
// caveat to its own recommendation, and this module exists to answer it:
//
//   "nobody has seen a CROWD of these islands together, and that's exactly the kind of thing
//    that looks fine on one and turns to soup on four hundred."
//
// ⚠ THE CROWD SIZE THAT MATTERS IS 35, NOT FOUR HUNDRED — that is what the real forest has
// today (`docs/research/forest-snapshot-2026-08-28/README.md`: "35 islands, one per story, 21
// of them green"). Measuring an invented 400 would answer a question nobody is holding.
//
// ⚠⚠ AND THE CROWD IS SPARSE, WHICH IS THE THING AN INVENTED LAYOUT WOULD GET WRONG. Measured
// off the committed `forest-map.png` rather than assumed — see `REAL_FOREST` below. The real
// map is 97.5% background. A crowd packed shoulder-to-shoulder would answer a much harsher
// question than the product poses, and it would answer it in the direction that manufactures
// the very "soup" the caveat fears.
//
// Pure: no three, no React, no DOM. Every number a picture is framed by is computed here so it
// is typechecked, because a measurement instrument that is only transpiled can print confident
// numbers from code that does not compile (`measurement-instrument-must-be-typechecked`).

import type { SceneStatus } from '@storytree/forest-world';

import { frameWorld, orthographicZoomFor } from '../src/camera-framing.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { RENDER_ELEV_DEG } from './kit-vocabulary.js';

/**
 * WHAT THE REAL FOREST IS, measured rather than remembered.
 *
 * The story counts are `docs/research/forest-snapshot-2026-08-28/README.md`, taken from the live
 * store by `pnpm web:forest-snapshot`. The pixel figures are measured off that record's own
 * committed `forest-map.png` by `crowd-real-map.mjs`, which is committed beside this file so the
 * derivation can be re-run rather than trusted.
 */
export const REAL_FOREST = {
  /** Live stories on the public map — one island each. */
  islands: 35,
  /** How many read green, and only because a signed verdict says so (ADR-0453 D7). */
  proven: 21,
  /** The committed picture the pixel figures below are measured from. */
  source: 'docs/research/forest-snapshot-2026-08-28/forest-map.png',
  /** That picture's size, in image pixels. */
  imagePx: { w: 2280, h: 2822 },
  /** The bounding box every island falls inside, in image pixels. */
  forestBoxPx: { w: 2140, h: 2635 },
  /** Median island width over the 35, in image pixels — the typical island a reader sees. */
  medianIslandPx: 100,
  /** The widest island (`drive-machinery`, 27 capabilities), in image pixels. */
  widestIslandPx: 231,
  /**
   * ⚠ THE LOAD-BEARING ONE. Land pixels as a share of the forest's own bounding box: the real
   * map is overwhelmingly EMPTY. It is what the synthetic crowd is calibrated to reproduce, and
   * it is the parameter a made-up layout would get wrong in the direction that flatters the
   * question.
   */
  landFractionOfBox: 0.0285,
  /**
   * How much of its own bounding box an island's silhouette actually fills, MEAN OVER THE 40
   * BLOBS — an island is a lobed blob, not a rectangle, so its footprint is about three fifths of
   * the box it sits in.
   *
   * ⚠ IT WAS 0.543 AND THAT WAS ONE ISLAND'S FIGURE BEING USED AS THE POPULATION'S. 0.543 is the
   * fill of a single 157x93 blob holding 7,933 land px — not the mean (0.6015), the median
   * (0.5782), the area-weighted mean (0.5604), or any other statistic over the 40. That island is
   * not even distinguished: it is neither the widest nor the median-width one, and three blobs
   * share its 157 px width with fills of 0.543, 0.464 and 0.678. `crowdLayout` applies this to
   * EVERY island, so it has to be a population figure.
   *
   * The error ran toward the harsher answer, which is why the finding it fed still stands: an
   * understated fill understates the land each island contributes and so SHRINKS the frame the
   * crowd is packed into, making the synthetic crowd denser than the real map rather than sparser.
   * `crowd-real-map.mjs` prints `boxFillSpread` on every run so this cannot go quiet again.
   */
  islandBoxFill: 0.6015,
} as const;

/** The camera every land picture on this arc is taken at, in radians. */
export const ELEV_RAD = (RENDER_ELEV_DEG * Math.PI) / 180;

/**
 * THE 35 ISLANDS' STATUSES.
 *
 * ⚠ IT IS THE REAL FOREST'S SHAPE WITH ONE LABELLED DEVIATION, and both halves matter.
 *
 * The real forest today holds exactly TWO states — 21 folded to `healthy` by a signed verdict
 * and 14 sitting at their authored `proposed`. So the real crowd cannot answer the question this
 * increment is here for: *can a reader pick a FAILING island out of a healthy forest?* There is
 * no failing island on the public map to pick out.
 *
 * So the majority is kept real — 21 healthy, exactly the live count — and the remaining 14 are
 * spread across the other five states, including exactly ONE `unhealthy`. That one island is the
 * NEEDLE the truth reading hunts for, and it is a plant. Saying so is the point: an increment
 * that quietly seeded a failing island and then reported it was findable would be reporting on a
 * forest the product does not have.
 *
 * This is the same labelled-deviation idiom `island-fixture.ts` already uses for `oddOneOut` and
 * `criteriaStates`, and for the same reason (ADR-0367 D5): art that asserts a proof state the
 * work does not hold is the one way this arc can do real harm.
 */
export const CROWD_POPULATION: readonly SceneStatus[] = [
  ...Array<SceneStatus>(21).fill('healthy'),
  ...Array<SceneStatus>(8).fill('proposed'),
  ...Array<SceneStatus>(2).fill('building'),
  ...Array<SceneStatus>(2).fill('mapped'),
  'unknown',
  'unhealthy',
];

/** The one island the truth reading has to find, as an index into `CROWD_POPULATION` BEFORE the
 *  scatter. There is exactly one `unhealthy` entry, and the scatter moves it — so what marks the
 *  needle in a laid-out forest is its STATUS, never this position. */
export const NEEDLE_INDEX = CROWD_POPULATION.indexOf('unhealthy');

export interface CrowdIsland {
  index: number;
  status: SceneStatus;
  /** Where this island's own origin sits in GROUND space. */
  offset: { x: number; z: number };
  /** Is this the deliberately-planted failing island? */
  needle: boolean;
}

/** A reader's screen: device pixels, and how many of them one CSS pixel is. */
export interface Viewport {
  w: number;
  h: number;
  dpr: number;
}

export interface CrowdLayoutOptions {
  /** The island's own on-screen width in ground units, measured off a composed island. */
  islandW: number;
  /** The island's own on-screen HEIGHT in ground units — already foreshortened by the camera. */
  islandScreenH: number;
  /** How many islands. Defaults to the real forest's 35. */
  count?: number;
  /** The land share of the frame to reproduce. Defaults to the real map's measured 2.85%. */
  landFraction?: number;
}

export interface CrowdLayout {
  islands: CrowdIsland[];
  /** The scatter grid this layout used — what a neighbourhood view is derived from. */
  cols: number;
  rows: number;
  /** The forest's extent in GROUND units (x) and ground units of DEPTH (z). */
  groundW: number;
  groundD: number;
  /** One island's own footprint, carried through so the visitor-zoom rule can see the outermost
   *  ground cell rather than the island centre. */
  islandW: number;
  islandD: number;
  /** The forest's extent as the reader sees it: width and foreshortened height, in ground units. */
  screenW: number;
  screenH: number;
  /** The land share this layout actually delivers — computed, not the target that was asked for. */
  landFraction: number;
}

/**
 * A deterministic hash in [0,1) — the house pattern for placement jitter, so two runs of this
 * page lay the forest out identically and a difference between two pictures is the variable that
 * moved rather than the scatter.
 */
function jitter(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * SCATTER THE CROWD.
 *
 * ⚠ THE FRAME SIZE IS DERIVED FROM THE MEASURED DENSITY, NEVER CHOSEN. Given 35 islands of a
 * known footprint and the real map's measured land share, there is exactly one frame area that
 * reproduces it:
 *
 *     count * islandBoxFill * (w * h) / (frameW * frameH) = landFraction
 *
 * and the frame's aspect is the real forest box's own. A spacing picked by eye would be the one
 * parameter that decides whether a crowd looks like soup, chosen by the person hoping for an
 * answer — which is the fault class this factory keeps hitting.
 *
 * ⚠ THE LAYOUT IS A JITTERED GRID, AND IT IS A MODEL OF THE REAL FOREST'S DENSITY RATHER THAN A
 * COPY OF ITS TOPOLOGY. The real islands sit where `depends_on` puts them. Topology decides which
 * island is next to which; it does not change how many islands are in frame, how much of the
 * frame is land, or how many draw calls are submitted — which is all three of the questions this
 * page asks. What it WOULD change is a claim about a specific neighbour pair, and this page makes
 * none.
 */
export function crowdLayout(opts: CrowdLayoutOptions): CrowdLayout {
  const count = opts.count ?? REAL_FOREST.islands;
  const target = opts.landFraction ?? REAL_FOREST.landFractionOfBox;
  const aspect = REAL_FOREST.forestBoxPx.w / REAL_FOREST.forestBoxPx.h;

  const islandArea = REAL_FOREST.islandBoxFill * opts.islandW * opts.islandScreenH;
  const frameArea = (count * islandArea) / target;
  const screenW = Math.sqrt(frameArea * aspect);
  const screenH = screenW / aspect;

  // A grid just big enough to hold the count, kept close to the frame's own aspect so the cells
  // are not long thin slots that would line the islands up in visible rows.
  const cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / cols);
  const cellW = screenW / cols;
  const cellH = screenH / rows;

  // How far a cell may jitter without letting two islands overlap: whatever room the cell has
  // left over once the island is in it.
  const slackX = Math.max(0, cellW - opts.islandW) / 2;
  const slackZ = Math.max(0, cellH - opts.islandScreenH) / 2;

  // ⚠⚠ THE STATUSES ARE SCATTERED OVER THE GRID, NOT LAID DOWN IN ORDER — and taking them in
  // order was measurably wrong. `CROWD_POPULATION` lists 21 healthy and then the rest, so filling
  // the grid with it put every non-healthy island in one corner. Two things went wrong at once:
  // the whole-forest view got an EASIER question than the product poses (all the odd ones in one
  // place), and the neighbourhood view got an unanswerable one — the failing island had five
  // neighbours and not one of them was healthy, so there was no healthy population to read a bar
  // off and the reading correctly returned UNVERIFIED.
  //
  // The real map interleaves them: green and orange islands sit next to each other all over it.
  // The scatter is a deterministic Fisher-Yates on the same hash the jitter uses, so it is mixed
  // AND reproducible — two runs of this page lay the forest out identically.
  const scattered = [...CROWD_POPULATION];
  for (let i = scattered.length - 1; i > 0; i--) {
    const j = Math.floor(jitter(1000 + i) * (i + 1));
    const tmp = scattered[i]!;
    scattered[i] = scattered[j]!;
    scattered[j] = tmp;
  }

  const islands: CrowdIsland[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const screenX = (col + 0.5) * cellW - screenW / 2 + (jitter(i * 2 + 1) * 2 - 1) * slackX;
    const screenZ = (row + 0.5) * cellH - screenH / 2 + (jitter(i * 2 + 2) * 2 - 1) * slackZ;
    islands.push({
      index: i,
      status: scattered[i % scattered.length]!,
      // ⚠ SCREEN HEIGHT IS NOT GROUND DEPTH. The camera looks down at RENDER_ELEV_DEG, so a
      // ground span of z delivers z*sin(elev) of screen height. Laying the forest out in ground
      // units as though the two were the same would squash it vertically by 23% and quietly
      // change the density this whole function exists to reproduce.
      offset: { x: screenX, z: screenZ / Math.sin(ELEV_RAD) },
      needle: scattered[i % scattered.length] === 'unhealthy',
    });
  }

  return {
    islands,
    cols,
    rows,
    groundW: screenW,
    groundD: screenH / Math.sin(ELEV_RAD),
    islandW: opts.islandW,
    islandD: opts.islandScreenH / Math.sin(ELEV_RAD),
    screenW,
    screenH,
    landFraction: (count * islandArea) / (screenW * screenH),
  };
}

/**
 * WHAT ZOOM DOES A VISITOR ACTUALLY GET when the whole forest is on screen?
 *
 * ⚠⚠ THIS IS THE NUMBER THE WHOLE LANE TURNS ON, AND IT IS THE SHIPPED CANVAS'S OWN ANSWER
 * RATHER THAN ONE THIS PAGE INVENTED. Every land measurement on this arc is taken at 2 and 8
 * device pixels per ground unit, and 2 has been called "the overview — the size the map is
 * actually delivered at". That is the overview of ONE ISLAND, rendered alone. A visitor looking
 * at the whole forest is further back, and how much further back is not a matter of taste: the
 * shipped canvas frames a world by `frameWorld` and converts that to px per world unit by
 * `orthographicZoomFor`, and both are imported here rather than transcribed.
 *
 * Transcribing them is precisely the fault this factory keeps hitting — a camera check that
 * computed its expectation from a hand-copied duplicate of its own subject could not fail. So
 * `back = max(260, spread * 2.6)` does not appear in this file, and if the shipped rule moves,
 * this number moves with it.
 *
 * ⚠ AND IT IS A PROJECTION, NOT AN OBSERVATION. No 35-island 3D forest exists anywhere today —
 * `<ForestWorldCanvas>` is mounted only in this package's own dev harness, and the public forest
 * page is a flat DAG diagram built in the `web` submodule from a snapshot that carries no tile
 * geometry at all. So this says what the shipped framing rule WOULD deliver for a forest of this
 * extent. It is the honest form of the question; an observed figure is not available to be had.
 */
/**
 * THE GENEROUS WHOLE-FOREST VIEW — the forest's own screen extent fitted to the viewport, with
 * nothing wasted.
 *
 * ⚠ IT IS THE BEST CASE, AND THAT IS WHY THE PICTURES USE IT. `visitorZoom` below reports what the
 * SHIPPED framing rule delivers, which is coarser still — it takes its spread off raw GROUND z,
 * which the 50° camera then foreshortens by sin(50°), so it frames about 30% more world than it
 * needs vertically and leaves the forest inside a large empty margin. Photographing the crowd
 * through that would be scoring the art down for a framing bug. So the pictures give the crowd its
 * BEST shot — if it fails here it fails everywhere — and the shipped rule's own, worse figure is
 * reported beside it rather than quietly replaced by it.
 */
export function fitZoom(layout: CrowdLayout, viewport: { w: number; h: number }, pad = 1.02): number {
  return Math.min(viewport.w / (layout.screenW * pad), viewport.h / (layout.screenH * pad));
}

/**
 * THE NEIGHBOURHOOD VIEW — a 3x3 block of the scatter grid, which is where a reader actually
 * COMPARES islands to one another.
 *
 * ⚠ IT EXISTS BECAUSE THE OTHER TWO ZOOMS CANNOT ASK THE TRUTH QUESTION PROPERLY, and finding
 * that out is what put it here rather than a guess that it would be useful. At the whole-forest
 * view every island is in frame but each is a few dozen pixels; at 2 px/unit centred on one island
 * you can see it beautifully and there is NOTHING BESIDE IT to compare it against — measured, the
 * reading came back UNVERIFIED with one island in frame and zero healthy neighbours. "Can a reader
 * pick the failing island out of a healthy forest" needs a frame with both in it.
 *
 * The 3x3 is the grid's own, so it moves with the layout instead of being a magnification someone
 * liked the look of.
 */
export function neighbourhoodZoom(layout: CrowdLayout, viewport: { w: number; h: number }): number {
  const blockW = (layout.screenW / layout.cols) * 3;
  const blockH = (layout.screenH / layout.rows) * 3;
  return Math.min(viewport.w / blockW, viewport.h / blockH);
}

export interface VisitorZoom {
  /** CSS pixels per world unit — what the shipped orthographic `zoom` literally is. */
  cssPxPerUnit: number;
  /** The same figure in DEVICE pixels, which is what every land measurement on this arc quotes. */
  devicePxPerUnit: number;
  /** World half-height the shipped framing rule chose for a forest of this extent. */
  halfHeight: number;
}

export function visitorZoom(layout: CrowdLayout, viewport: Viewport): VisitorZoom {
  // The shipped rule reads the spread off every INSTANCE, not off island centres, so the
  // outermost ground cell is what sets it. Four corners of each island's own footprint carry
  // exactly that extent.
  const corners: InstanceDescriptor[] = [];
  for (const island of layout.islands) {
    for (const dx of [-layout.islandW / 2, layout.islandW / 2]) {
      for (const dz of [-layout.islandD / 2, layout.islandD / 2]) {
        corners.push({
          kind: 'cell-ground',
          group: 'cell-ground',
          transform: { x: island.offset.x + dx, y: 0, z: island.offset.z + dz },
        });
      }
    }
  }
  const { halfHeight } = frameWorld(corners);
  const cssPxPerUnit = orthographicZoomFor(halfHeight, Math.min(viewport.w, viewport.h) / viewport.dpr);
  return { cssPxPerUnit, devicePxPerUnit: cssPxPerUnit * viewport.dpr, halfHeight };
}
