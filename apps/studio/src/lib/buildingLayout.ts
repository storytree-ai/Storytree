// buildingLayout — the pure geometry + graph math for the forest's "building"
// render class (ADR-0076 §2), built behind the default-OFF `?buildings=on` flag.
//
// The owner steer (2026-06-20) replaced the single-house model with a DISTRIBUTED
// one: a story tagged `render: building` (e.g. `library`) does NOT get its own
// island/organism node — instead the building is stamped, as a small icon, on
// EVERY island that connects to it. So the library "moves to the side" by being
// drawn on each of its consumers, and a bottom legend maps the icon → its meaning.
//
// Why a standalone, framework-free module (mirrors solarLayout / connectionSet):
//   • Pure number/graph math (no React, no DOM) → unit-testable in the node-env
//     vitest suite (buildingLayout.test.ts) — Stage-1 red-green of the geometry +
//     distribution (ADR-0070 two-stage proof; the APPEARANCE is owner-attested,
//     never self-signed here).
//   • buildWorld consumes `bookshelfConsumers` to decide which territories carry a
//     bookshelf, and `shelfBooks` to lay out the icon's spines deterministically.

import { fullConnectionSet, type WiredNode } from './connectionSet.js';

// ---------- the distribution: which islands carry a building's icon ----------

/**
 * The set of CONSUMER story ids a building's icon is stamped on: every story that
 * connects to a building-tagged story. "Connects to" is the building's full inbound
 * connection set (ADR-0074 §4, via {@link fullConnectionSet}) — i.e. the union of
 *   • every story whose `depends_on` names the building, and
 *   • every id in the building's own `consumed_by`
 * resolved symmetrically from BOTH declaration styles, so a hub whose edge is
 * declared provider-side (`library` is `consumed_by: [cli]`) is still counted.
 *
 * Restricted to ids actually PRESENT in `nodes` and never a building itself (one
 * building never carries another's icon). Pure + deterministic.
 *
 * Compute this from the FULL story list BEFORE the building stories are excluded
 * from the laid-out territories — otherwise their inbound edges are already gone.
 */
export function bookshelfConsumers(
  nodes: readonly WiredNode[],
  buildingIds: ReadonlySet<string>,
): Set<string> {
  const present = new Set(nodes.map((n) => n.id));
  const wired = nodes as WiredNode[];
  const out = new Set<string>();
  for (const b of buildingIds) {
    if (!present.has(b)) continue;
    for (const c of fullConnectionSet(wired, b).consumedBy) {
      if (present.has(c) && !buildingIds.has(c)) out.add(c);
    }
  }
  return out;
}

// ---------- deterministic pseudo-random (self-contained; no Math.random) ----------

/** FNV-1a → uint32. Stable across runs so an icon never reshuffles. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A uint32 seed → [0,1). mulberry32 single step, deterministic. */
function rand01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- the bookshelf icon geometry ----------

/** One upright book spine on a shelf (a coloured vertical bar, occasionally leaning). */
export interface BookSpine {
  /** Left edge, px from the shelf interior's left (0 = flush left). */
  x: number;
  /** Spine width (the book's thickness on the shelf). */
  w: number;
  /** Spine height — always ≤ the shelf interior height. */
  h: number;
  /** A small lean in degrees (mostly 0; a few books tilt for a lived-in, crammed look). */
  tilt: number;
  /** Colour bucket 0..palette-1 (faded reds / tans / browns picked in CSS). */
  variant: number;
}

/** Tuning for {@link shelfBooks} — the crammed-old-library look. */
export interface ShelfTuning {
  /** Min / max spine width. */
  minW: number;
  maxW: number;
  /** Min spine height as a fraction of the shelf interior height (max is the full height). */
  minHFrac: number;
  /** Gap between adjacent spines. */
  gap: number;
  /** Fraction of books that lean (0..1). */
  tiltChance: number;
  /** Max absolute lean in degrees. */
  maxTilt: number;
  /** Number of colour buckets. */
  palette: number;
}

export const SHELF_TUNING: ShelfTuning = {
  minW: 3.2,
  maxW: 6,
  minHFrac: 0.66,
  gap: 1.1,
  tiltChance: 0.22,
  maxTilt: 9,
  palette: 5,
};

/**
 * Fill one shelf interior `[0, width] × height` with upright book spines, left to
 * right, until the next spine wouldn't fit — a crammed row of varied heights,
 * widths and colours, a few leaning. Deterministic by `seed` (per shelf), so the
 * icon renders identically every visit. Pure: returns the spine list; the caller
 * paints them. Heights are clamped to the shelf so a spine never overshoots the case.
 */
export function shelfBooks(
  seed: number,
  width: number,
  height: number,
  tuning: ShelfTuning = SHELF_TUNING,
): BookSpine[] {
  const out: BookSpine[] = [];
  let x = 0;
  let i = 0;
  // guard the loop (width/minW is the natural bound; +4 slack for the gap arithmetic)
  const maxBooks = Math.ceil(width / Math.max(tuning.minW, 0.5)) + 4;
  while (i < maxBooks) {
    const r = (k: number): number => rand01(hash(`${seed}:${i}:${k}`));
    const w = tuning.minW + r(0) * (tuning.maxW - tuning.minW);
    if (x + w > width) break;
    const h = height * (tuning.minHFrac + r(1) * (1 - tuning.minHFrac));
    const tilt = r(2) < tuning.tiltChance ? (r(3) - 0.5) * 2 * tuning.maxTilt : 0;
    const variant = Math.floor(r(4) * tuning.palette) % tuning.palette;
    out.push({ x, w, h, tilt, variant });
    x += w + tuning.gap;
    i++;
  }
  return out;
}
