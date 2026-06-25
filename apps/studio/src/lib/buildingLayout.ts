// buildingLayout -- the pure graph + identity math for the forest's "building"
// render class (ADR-0076 S2 -> ADR-0102), built behind the default-ON `?buildings` flag.
//
// ADR-0102 (owner-directed, 2026-06-25) replaced the generic, consumer-only bookshelf
// STAMP with PER-ISLAND ICON STAMPS in BOTH directions. Every island gets its own
// deterministic identity icon. A story tagged `render: building` (today `library`, and
// now `cli`) PROMOTES every edge incident to it from a road to a per-island icon stamp:
//   * the depended island's icon is placed on the depender island
//   * so you carry the icon of WHAT YOU DEPEND ON -- placement is the direction.
// The asymmetry does the rest:
//   * a SINK hub (library, depended-on by many) RADIATES its icon onto its consumers;
//     its own island stays (nearly) clean.
//   * a SOURCE hub (cli, depends on many) AGGLOMERATES a dense "city" of its
//     dependencies' icons.
// The edge is KEPT as a low-salience badge, never dropped (honoring ADR-0074 S1
// "de-noise visually, never drop edges"). Hybrid scope: ONLY `render: building`
// islands promote to stamps; every other edge stays a road.
//
// Why a standalone, framework-free module (mirrors solarLayout / connectionSet):
//   * Pure number/graph math (no React, no DOM) -> unit-testable in the node-env
//     vitest suite (buildingLayout.test.ts) -- Stage-1 red-green of the geometry +
//     promotion (ADR-0070 two-stage proof; the APPEARANCE -- the icon art, the "city" --
//     is owner-attested, never self-signed here).
//   * buildWorld consumes `promotedStamps` / `stampsByCarrier` to decide which icons
//     each island carries, and `storyIcon` for each island's deterministic identity.

import { fullConnectionSet, type WiredNode } from './connectionSet.js';
import type { TreeStory } from '../types';

// ---------- the building-class roster (the Shared Islands panel, ADR-0088) ----------

/**
 * The building-class stories -- every story tagged `building === true` (ADR-0076 S2). These no
 * longer render on the map (ADR-0088, Shared Islands panel -- amends ADR-0076 S2): they are
 * lifted OFF the forest into a permanent left "Shared Islands" panel, each drawn as its FULL
 * island. Generic over the flag, so a future building-class story appears automatically; order
 * follows the input so the panel render is stable. Pure + deterministic.
 */
export function sharedIslandStories(stories: readonly TreeStory[]): TreeStory[] {
  return stories.filter((s) => s.building === true);
}

// ---------- deterministic hash (self-contained; no Math.random) ----------

/** FNV-1a -> uint32. Stable across runs so an icon never reshuffles. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- (a) per-island identity icon (ADR-0102 S1) ----------

/** Number of distinct silhouette buckets an icon shape can take. */
export const ICON_SHAPES = 8;

/**
 * One island's deterministic visual identity (ADR-0102 S1). A pure function of the id, so
 * the icon never reshuffles between visits and an island reads the same wherever it is
 * stamped (on its own card, or on a depender's island). The triplet gives redundancy for
 * legibility: shape + hue carry the identity at a glance; the monogram disambiguates up close.
 * The ART (how a `shape` bucket is drawn, how `hue` is applied) is owner-attested (ADR-0070);
 * this models identity only.
 */
export interface IconIdentity {
  /** 0..ICON_SHAPES-1 -- distinct silhouette bucket. */
  shape: number;
  /** 0..359 -- fill hue. */
  hue: number;
  /** 1-2 uppercase chars from the id (legibility; secondary to shape+hue). */
  monogram: string;
}

/**
 * Derive an island's deterministic identity icon from its id (ADR-0102 S1). FNV-1a-seeded:
 *   * shape  = hash(id) % ICON_SHAPES
 *   * hue    = hash(id + ':hue') % 360  (a separate seed so shape and hue vary independently)
 *   * monogram = the uppercased initials of the hyphen-separated words, capped at 2 chars
 *     (`drive-machinery`->`DM`, `notice-board`->`NB`); for a SINGLE word, its first 2 letters
 *     uppercased (`library`->`LI`, `cli`->`CL`, `studio`->`ST`, `agent`->`AG`).
 * Pure + deterministic.
 */
export function storyIcon(id: string): IconIdentity {
  return {
    shape: hash(id) % ICON_SHAPES,
    hue: hash(`${id}:hue`) % 360,
    monogram: monogramOf(id),
  };
}

/** The 1-2 char monogram for an id (see {@link storyIcon}). */
function monogramOf(id: string): string {
  const words = id.split('-').filter((w) => w.length > 0);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  }
  const w = words[0] ?? '';
  return w.slice(0, 2).toUpperCase();
}

// ---------- (b) both-directions stamp promotion (ADR-0102 S2/S3) ----------

/** One promoted icon stamp: island `on` carries island `icon`'s identity glyph (ADR-0102 S2).
 *  Reads "you carry the icon of what you depend on", so `on` depends on `icon`. */
export interface IconStamp {
  /** The island that carries the stamp (the depender). */
  on: string;
  /** The island whose identity glyph is carried (the depended-on). */
  icon: string;
}

/**
 * Promote every edge incident to a building-class island into a per-island icon stamp, in
 * BOTH directions (ADR-0102 S2/S3). For each building B present in `nodes`, from B's full
 * connection set (both directions, recovered from both declaration styles, {@link fullConnectionSet}):
 *   * each consumer C of B (`.consumedBy`) present  -> `{ on: C, icon: B }`  -- B radiates its
 *     icon onto C (C depends on B, so C carries B's icon: the SINK-hub fan-out);
 *   * each dependency P of B (`.dependsOn`) present -> `{ on: B, icon: P }`  -- B carries P's
 *     icon (B depends on P: the SOURCE-hub "city").
 *
 * Restricted to ids PRESENT in `nodes`. Self-edges cannot occur (fullConnectionSet drops them).
 * Deduped by `(on, icon)` and returned in deterministic order (sorted by `on`, then `icon`), so
 * the render is byte-stable and order-independent of the input.
 *
 * The both-buildings case is handled by the dedup: cli depends on library (library declares
 * `consumed_by: [cli]`), so `{ on: cli, icon: library }` is emitted from BOTH library's
 * consumer-direction and cli's dependency-direction -> kept ONCE. cli carries library; library
 * does NOT carry cli (no cycle -- ADR-0058). This is why library stays clean while cli's city
 * includes library.
 *
 * Compute this from the FULL story list -- the building's incident edges must be visible BEFORE
 * the building stories are excluded from the laid-out territories.
 */
export function promotedStamps(
  nodes: readonly WiredNode[],
  buildingIds: ReadonlySet<string>,
): IconStamp[] {
  const present = new Set(nodes.map((n) => n.id));
  const wired = nodes as WiredNode[];
  const seen = new Set<string>();
  const out: IconStamp[] = [];
  const add = (on: string, icon: string): void => {
    if (!present.has(on) || !present.has(icon)) return;
    const key = `${on} ${icon}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ on, icon });
  };
  for (const b of buildingIds) {
    if (!present.has(b)) continue;
    const conn = fullConnectionSet(wired, b);
    // B radiates onto its consumers (each consumer depends on B -> carries B's icon)
    for (const consumer of conn.consumedBy) add(consumer, b);
    // B's city: B carries the icon of each thing it depends on
    for (const dep of conn.dependsOn) add(b, dep);
  }
  out.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.icon < b.icon ? -1 : a.icon > b.icon ? 1 : 0));
  return out;
}

// ---------- (c) grouping helper ----------

/**
 * Group promoted stamps by their CARRIER island -> the sorted list of icon ids it carries
 * (ADR-0102). The map both feeds the renderer (an island's stamp set) and makes the
 * source-hub "city" trivially assertable (`stampsByCarrier(stamps).get('cli')`). Pure +
 * deterministic: each carrier's icon list is deduped and sorted.
 */
export function stampsByCarrier(stamps: readonly IconStamp[]): Map<string, string[]> {
  const grouped = new Map<string, Set<string>>();
  for (const s of stamps) {
    let set = grouped.get(s.on);
    if (!set) {
      set = new Set<string>();
      grouped.set(s.on, set);
    }
    set.add(s.icon);
  }
  const out = new Map<string, string[]>();
  for (const [carrier, set] of grouped) {
    out.set(carrier, [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return out;
}
