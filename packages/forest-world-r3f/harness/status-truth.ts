// status-truth.ts — DOES A RENDERED ISLAND'S GROUND READ AS THE STATE IT HOLDS, AND AS NO OTHER?
//
// `demonstrate-the-map-still-reports-truth` on `adopt-the-land-into-the-shipped-map-arc`, end-state
// item 3 of the arc: every capability's status must read correctly off the finished land, DEMONSTRATED
// rather than asserted. ADR-0475 D2 is the frame this instrument answers to: "THE LAND IS UNIFORM
// WITHIN AN ISLAND, AND CARRIES THE STORY'S OWN STATE … island-level state reads off the ground at the
// opening view." So the question this module asks is exactly the map's own truth claim for the
// ground: does each island's GROUND read as that island's own state, and as no other.
//
// ⚠⚠ SIX STATUSES, NOT FOUR, AND FIVE COLOURS OVER THEM (ADR-0462 D1/D2). `proposed` and `building`
// share ONE authored token — "the same object under two keys in STATUS_TOKENS, so 'two states, one
// token' is a fact about the code that no later edit can half-apply" — because the owner judged there
// is no value in a sixth colour for live work the orbiting wisp already signals. That is a DECISION
// measured on delivered pixels, not a gap this instrument reports as a defect: an island painted
// `proposed` and one painted `building` are EXPECTED to read as the same family, and this module
// reports that pair's separation as zero rather than failing on it.
//
// ⚠ A PIXEL VOTES FOR THE NEAREST STATUS in the weighted space `nearestReadStatus` searches — over
// EVERY authored rung the shipped ground can deliver a status's token at (`fullReaderTable`), never
// against one reference colour. A real frame's ground carries slope shading, the occlusion field and
// the grain's normal half, so a single "flat lit" reference would call honest shading a misread.
//
// ⚠ BACKGROUND PIXELS DO NOT VOTE. An island's rect is a bounding box in frame pixels and is never
// exactly the island's silhouette — the corners are sea or neighbouring geometry — so a pixel
// matching the scene's own clear colour is excluded before any vote is counted. Counting it would
// hand the frame's own background a vote for whichever status's token happens to sit nearest it.
//
// Pure: no three, no DOM, no canvas. Takes a rendered frame as a plain `Uint8ClampedArray` plus the
// scene's background colour and the islands' pixel rects — exactly what a WebGL `readPixels` call and
// a camera projection hand back — so this instrument is provable under `bun test` with hand-built
// synthetic frames, and the SAME arithmetic then reads a real capture in the browser page.

import { deliveredForLevel, type Rgb255 } from '../src/shade-ladder.js';
import { W_LUMA } from '../src/shadow-rung.js';
import { ownFamily, shippedLadder, SHIPPED_STATUSES } from './grain-status-reading.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';

/** A pixel rectangle in FRAME pixels — half-open, `[x0, x1) x [y0, y1)`, the form a camera
 *  projection to screen space naturally produces. */
export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One island as the instrument needs to know it: its authored status and where its ground sits in
 *  the frame. */
export interface IslandSpec {
  id: string;
  status: string;
  rect: PixelRect;
}

/** A rendered frame — a `readPixels` buffer plus the dimensions it was read at. RGBA, 4 bytes/pixel,
 *  row 0 at the BOTTOM (WebGL's own convention) — this module never needs to know which end is up,
 *  since every rect it is handed is in the same buffer's own coordinate space. */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The reader's reference colours, per status, over every rung: `Record<status, Rgb255[]>`. */
export type ReaderTable = Readonly<Record<string, readonly Rgb255[]>>;

/**
 * THE READER TABLE — every authored rung x every token, from {@link SHIPPED_GROUND_COLOUR}.
 *
 * ⚠⚠ NOT ONE REFERENCE PER STATUS. `grain-status-reading.ts`'s `shippedReaderTable` deliberately
 * narrows to ONE entry at `FLAT_GROUND_LEVEL` because its question is about a viewer's assumed
 * reference for a SINGLE flat face. This instrument reads REAL rendered pixels, which the shipped
 * ladder delivers at any of nine lit rungs plus the derived shadow rung depending on a fragment's
 * slope and occlusion — so a table with one entry per status would call an honestly-shaded pixel a
 * misread. `shippedLadder()` is `SHADE_LEVELS` plus the derived shadow rung
 * (`shadowLadderFor(SHIPPED_TOKENS).rung`), which is every rung the shipped material can deliver.
 */
export function fullReaderTable(
  statuses: readonly string[] = SHIPPED_STATUSES,
  levels: readonly number[] = shippedLadder(),
): ReaderTable {
  const table: Record<string, Rgb255[]> = {};
  for (const status of statuses) {
    const token = SHIPPED_GROUND_COLOUR.get(status);
    if (token === undefined) {
      throw new Error(`status-truth: no shipped token for status ${JSON.stringify(status)}`);
    }
    table[status] = levels.map((level) => deliveredForLevel(token, level));
  }
  return table;
}

/** The weighted squared distance the arc's own confusability reader searches
 *  (`harness/shadow-ladder.ts`'s `colourDistance2`, `harness/ground-cover.ts`'s `colourDistance` —
 *  same weights, transcribed from the author-time compositor's own quantiser). Local rather than
 *  imported: this is the one seam every fault-seeding sweep of this module mutates, and mutating a
 *  shared export would silently move every OTHER instrument that imports it. */
export function weightedDistance2(a: Rgb255, b: Rgb255): number {
  return W_LUMA[0] * (a.r - b.r) ** 2 + W_LUMA[1] * (a.g - b.g) ** 2 + W_LUMA[2] * (a.b - b.b) ** 2;
}

/**
 * WHICH STATUS a pixel is nearest, over EVERY entry in the table. Ties go to the alphabetically
 * first status — the same convention `harness/shadow-ladder.ts`'s `nearestStatus` uses — so the
 * result is deterministic rather than order-dependent, and an exact tie is decided by that ordering
 * rather than by a special "count it as a match" branch.
 */
export function nearestReadStatus(colour: Rgb255, table: ReaderTable): string {
  let best = '';
  let bestD = Infinity;
  for (const status of Object.keys(table).sort()) {
    for (const entry of table[status]!) {
      const d = weightedDistance2(colour, entry);
      if (d < bestD) {
        bestD = d;
        best = status;
      }
    }
  }
  return best;
}

/** Is `px` the frame's own background — excluded from every vote, at zero tolerance: the shipped
 *  runner disables antialiasing and clears to an exact colour, so an interior background pixel is a
 *  bit-exact match. */
export function isBackgroundPixel(px: Rgb255, background: Rgb255): boolean {
  return px.r === background.r && px.g === background.g && px.b === background.b;
}

/**
 * THE CANONICAL NAME FOR A STATUS'S FAMILY — the alphabetically first member of
 * {@link ownFamily}. `proposed` and `building` share ONE token (ADR-0462), so both resolve to the
 * same key (`building`, alphabetically first) and their votes fold together; every other status is
 * a singleton family and is its own key. Computing this explicitly, rather than trusting that a
 * shared-token pair never independently wins a per-pixel vote, is what makes the fold a property of
 * the ARITHMETIC rather than an accident of how ties happen to break.
 */
export function familyKeyOf(status: string): string {
  const sorted = [...ownFamily(status)].sort();
  const key = sorted[0];
  if (key === undefined) throw new Error(`status-truth: ownFamily(${JSON.stringify(status)}) is empty`);
  return key;
}

/** One island's verdict: every ground pixel inside its rect voted for the FAMILY of the status it
 *  reads nearest, and the island's own reading is the PLURALITY of those family votes. */
export interface IslandVerdict {
  id: string;
  status: string;
  /** {@link familyKeyOf} of {@link status} — every status sharing its authored token folds to this
   *  one key (ADR-0462's `proposed`/`building` pair), or it is a singleton for any other status. */
  ownFamily: string;
  /** Ground pixels inside the rect — background excluded. */
  groundPixels: number;
  /** No ground pixel in the rect at all — never a PASS, however the empty vote count is read. */
  empty: boolean;
  /** The plurality-vote family key, or `null` when {@link empty}. */
  readFamily: string | null;
  /** Per-status vote counts over the rect's ground pixels — before the family fold, for a report
   *  that wants to show which individual token a pixel matched. */
  votes: Readonly<Record<string, number>>;
  /** Vote counts folded onto {@link familyKeyOf} — what {@link readFamily} is the argmax of. */
  familyVotes: Readonly<Record<string, number>>;
  /** Fraction of ground pixels voting for {@link ownFamily}. */
  ownShare: number;
  /** Fraction of ground pixels voting for any other family — `1 - ownShare` whenever
   *  {@link groundPixels} is non-zero, since every ground pixel's vote folds to exactly one family. */
  foreignShare: number;
  /** {@link readFamily} equals {@link ownFamily} — the island reads as the state it holds. */
  pass: boolean;
}

/**
 * Vote every ground pixel inside `island.rect` and return its verdict.
 *
 * ⚠⚠ THE RECT MAY OVERLAP GROUND THAT IS NOT THE ISLAND'S if it was not shrunk toward the centre
 * (the caller's job — see `harness/shipped-status-scene.ts`), but this function does not know that;
 * it counts every non-background pixel inside the rect it is handed and votes it. That is
 * deliberate: a positional oracle can only judge WHERE geometry sits (`asset:a-green-positional-
 * oracle-is-necessary-not-sufficient`), so the rect discipline is a caller obligation and this
 * instrument's job is the colour question alone.
 */
export function islandVerdict(
  frame: Frame,
  background: Rgb255,
  island: IslandSpec,
  table: ReaderTable = fullReaderTable(),
): IslandVerdict {
  const ownKey = familyKeyOf(island.status);
  const x0 = Math.max(0, Math.floor(island.rect.x0));
  const y0 = Math.max(0, Math.floor(island.rect.y0));
  const x1 = Math.min(frame.width, Math.ceil(island.rect.x1));
  const y1 = Math.min(frame.height, Math.ceil(island.rect.y1));

  const votes: Record<string, number> = {};
  const familyVotes: Record<string, number> = {};
  let groundPixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      const px: Rgb255 = { r: frame.data[i]!, g: frame.data[i + 1]!, b: frame.data[i + 2]! };
      if (isBackgroundPixel(px, background)) continue;
      groundPixels += 1;
      const st = nearestReadStatus(px, table);
      votes[st] = (votes[st] ?? 0) + 1;
      const key = familyKeyOf(st);
      familyVotes[key] = (familyVotes[key] ?? 0) + 1;
    }
  }

  if (groundPixels === 0) {
    return {
      id: island.id,
      status: island.status,
      ownFamily: ownKey,
      groundPixels: 0,
      empty: true,
      readFamily: null,
      votes,
      familyVotes,
      ownShare: 0,
      foreignShare: 0,
      pass: false,
    };
  }

  // THE PLURALITY VOTE, OVER FAMILIES — the family with the MOST votes, ties broken alphabetically
  // by STRICT `>` (the first-encountered family keeps the win unless a later one strictly beats it).
  // A mutant that swapped `>` for `>=` would let the LAST-sorted family in an exact tie win instead
  // of the first, which is the "treat a tie as a pass" fault this module was hand-seeded with; a
  // mutant that swapped `>` for `<` would report the LEAST-voted family, the "flip the plurality to
  // minority" fault.
  let readFamily = '';
  let bestCount = -1;
  for (const key of Object.keys(familyVotes).sort()) {
    const count = familyVotes[key]!;
    if (count > bestCount) {
      bestCount = count;
      readFamily = key;
    }
  }

  const ownVotes = familyVotes[ownKey] ?? 0;

  return {
    id: island.id,
    status: island.status,
    ownFamily: ownKey,
    groundPixels,
    empty: false,
    readFamily,
    votes,
    familyVotes,
    ownShare: ownVotes / groundPixels,
    foreignShare: (groundPixels - ownVotes) / groundPixels,
    pass: readFamily === ownKey,
  };
}

/** How far apart two statuses' delivered-colour sets sit, at minimum, in the reader table — the
 *  colour-channel separation floor between them. */
export interface PairSeparation {
  a: string;
  b: string;
  /** The minimum distance between any of `a`'s delivered colours and any of `b`'s, in the same
   *  channel-unit space `harness/ground-cover.ts`'s `colourDistance` reports in (a SQRT distance,
   *  not the squared form {@link weightedDistance2} searches in). */
  minDistance: number;
}

/**
 * Every pair of statuses in `table`, with the minimum distance between their delivered-colour sets.
 *
 * ⚠⚠ EXPECT EXACTLY ONE ZERO PAIR: `proposed`/`building`. ADR-0462 D1/D2 merged them onto one
 * authored token, so their delivered-colour sets are IDENTICAL at every rung and the minimum
 * distance between them is exactly zero — a measured identity the decision created, not a defect
 * this function is reporting.
 */
export function statusPairSeparation(table: ReaderTable = fullReaderTable()): PairSeparation[] {
  const statuses = Object.keys(table).sort();
  const out: PairSeparation[] = [];
  for (let i = 0; i < statuses.length; i += 1) {
    for (let j = i + 1; j < statuses.length; j += 1) {
      const a = statuses[i]!;
      const b = statuses[j]!;
      let min = Infinity;
      for (const ea of table[a]!) {
        for (const eb of table[b]!) {
          const d = Math.sqrt(weightedDistance2(ea, eb));
          if (d < min) min = d;
        }
      }
      out.push({ a, b, minDistance: min });
    }
  }
  return out;
}

/** The whole demonstration's verdict over one frame: every island's read, and the pair-separation
 *  table the frame's palette was built from. */
export interface StatusTruthVerdict {
  islands: readonly IslandVerdict[];
  pairs: readonly PairSeparation[];
  /** Pairs whose {@link PairSeparation.minDistance} is exactly zero, as `[a, b]` tuples. */
  zeroPairs: readonly (readonly [string, string])[];
  /** Every island read as its own family, and none was empty. */
  allPass: boolean;
}

export function statusTruthVerdict(
  frame: Frame,
  background: Rgb255,
  islands: readonly IslandSpec[],
  table: ReaderTable = fullReaderTable(),
): StatusTruthVerdict {
  const islandVerdicts = islands.map((island) => islandVerdict(frame, background, island, table));
  const pairs = statusPairSeparation(table);
  const zeroPairs = pairs
    .filter((p) => p.minDistance === 0)
    .map((p) => [p.a, p.b] as const);
  return {
    islands: islandVerdicts,
    pairs,
    zeroPairs,
    allPass: islandVerdicts.every((v) => v.pass && !v.empty),
  };
}
