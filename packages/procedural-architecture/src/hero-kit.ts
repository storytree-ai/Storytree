// hero-kit.ts — the cosy-island HERO roster (grounded-art inc 10).
//
// Distinct from `kit.ts`. That kit is a set of interchangeable island-identity buildings a
// story is bucketed into; this is a fixed, NAMED garden set — one cottage, one gazebo, one
// autumn tree, one stepping stone — authored to match the cosy-island concept
// (docs/research/grounded-art-concept/cosy-island-concept.png). The composition increment
// (grounded-art inc 11) places these by name to remake one whole island as the concept
// garden; it does not bucket into them. Keeping them out of `KIT` is also what leaves the
// existing six buildings' committed bake byte-for-byte unchanged.
//
// What the roster still owns is the one property no single piece can carry — a SHARED SUN.
// Every hero is baked under `KIT_LIGHT_ANGLE`, the same island azimuth the buildings use, so
// a cottage and a tree standing on one island cast their light the same way. A test holds it.

import type { BuildingModel } from './procedural-utils.js';
import { bakeBuilding } from './bake.js';
import type { BakedBuilding, BakeOptions } from './bake.js';
import { KIT_LIGHT_ANGLE } from './kit.js';
import { cottage } from './buildings/cottage.js';
import { gazebo } from './buildings/gazebo.js';
import { forestHut } from './buildings/forest-hut.js';
import { autumnTree } from './landscape/autumn-tree.js';
import { steppingStone } from './landscape/stepping-stone.js';

export interface HeroEntry {
  /** stable identity — the bake is keyed on this, and inc 11 references heroes by it */
  id: string;
  /** what it is, in words, for a tooltip and the contact sheet */
  label: string;
  model: () => BuildingModel;
}

/**
 * The hero roster. Small and named on purpose: these are the specific pieces the concept
 * garden is made of, not a catalogue. Ids are stable so the composition increment can name
 * `cottage` / `gazebo` / `autumn-tree` / `stepping-stone` directly.
 */
export const HERO_KIT: HeroEntry[] = [
  { id: 'cottage', label: 'shingled cottage', model: () => cottage({ light_angle: KIT_LIGHT_ANGLE }) },
  { id: 'gazebo', label: 'garden gazebo', model: () => gazebo({ light_angle: KIT_LIGHT_ANGLE }) },
  { id: 'autumn-tree', label: 'big autumn tree', model: () => autumnTree({ light_angle: KIT_LIGHT_ANGLE }) },
  { id: 'stepping-stone', label: 'stepping stone', model: () => steppingStone({ light_angle: KIT_LIGHT_ANGLE }) },
  // Appended, not inserted: the four above keep their indices, so their committed bake
  // in kit.json stays byte-for-byte and only the new `forest-hut` entry moves.
  { id: 'forest-hut', label: 'cosy forest hut', model: () => forestHut({ light_angle: KIT_LIGHT_ANGLE }) },
];

/**
 * The soft, low-contrast light the whole hero kit bakes under. The style bible reads the
 * concept as low contrast ("nothing is near-black or pure white"), so the heroes raise the
 * ambient floor well above the buildings' crisp 0.42 and soften the flat-face outline. This
 * is the KIT/PALETTE half of the machinery-first ladder — a physically-sound piece that
 * reads too harsh is a shading gap, tuned in the machinery rather than reinterpreted.
 * Exported so the contact-sheet render bakes under exactly the same light.
 */
export const HERO_BAKE: BakeOptions = {
  normalize: true,
  showGround: true,
  ambient: 0.7,
  diffuse: 0.3,
  outlineShade: 0.74,
};

/** A hero after baking — drawables plus the box a caller scales against. */
export interface BakedHeroEntry extends BakedBuilding {
  id: string;
  label: string;
}

/**
 * Bake the whole hero roster, normalized to the placement contract (centred on x = 0,
 * standing on y = 0) with its own contact shadow, under the soft shared sun — the same
 * BUILD-TIME bake the buildings get (ADR-0217 D4: the runtime performs no geometry).
 */
export function bakeHeroKit(): BakedHeroEntry[] {
  return HERO_KIT.map((e) => ({
    ...bakeBuilding(e.model(), HERO_BAKE),
    id: e.id,
    label: e.label,
  }));
}
