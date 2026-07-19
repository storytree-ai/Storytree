// kit.ts — the SET of buildings a map composes from, and the one thing they must agree on.
//
// ADR-0217 D1 is emphatic that there is no factory connecting object types, and this is
// not one: it is a roster. Each entry names a building factory and its dials, nothing
// more. What the roster adds is the only property that cannot live inside a single
// building — a SHARED LIGHT.
//
// That constraint is invisible until you compose. Each building was tuned alone on its
// own contact sheet, so each carries its own `light_angle` (the windmill and pagoda at
// 135, the mushroom at 55, chosen to catch its camera-facing cap). Alone, every one of
// those is defensible. Together on one island they are a mistake you can see instantly:
// shadows falling two ways across neighbouring buildings reads as broken before it reads
// as anything else. The roster overrides all of them to one angle. Nothing about the
// individual buildings changed; composing them made a per-building choice into a shared
// one.

import type { BuildingModel } from './procedural-utils.js';
import { bakeBuilding } from './bake.js';
import type { BakedBuilding } from './bake.js';
import { forestWindmill } from './buildings/forest-windmill.js';
import { mushroomDwelling } from './buildings/mushroom-dwelling.js';
import { tieredPagoda } from './buildings/tiered-pagoda.js';

/**
 * The island's sun. One azimuth for every building on the map.
 *
 * 135° puts the light behind-left of the isometric view axis (which sits at 45°), so the
 * two camera-facing walls of every building separate — the near-left face lit, the
 * near-right face in shade. That separation is what makes an isometric solid read as a
 * solid, and it has to be the same separation on every building or the island stops
 * looking like one place.
 */
export const KIT_LIGHT_ANGLE = 135;

export interface KitEntry {
  /** stable identity — the bake is keyed on this, so reordering the roster is safe */
  id: string;
  /** what it is, in words, for a tooltip */
  label: string;
  model: () => BuildingModel;
}

/**
 * The roster. Deliberately small: three factories, two dials each, and no attempt to
 * cover a taxonomy. A map needs enough silhouettes that neighbouring islands are
 * distinguishable — it does not need a catalogue, and every entry here is a building
 * some later increment may have to defend on the owner's eye.
 */
export const KIT: KitEntry[] = [
  {
    id: 'windmill-brick',
    label: 'brick windmill',
    model: () => forestWindmill({ light_angle: KIT_LIGHT_ANGLE }),
  },
  {
    id: 'windmill-timber',
    label: 'tall timber windmill',
    model: () => forestWindmill({ light_angle: KIT_LIGHT_ANGLE, style_theme: 'timber', floors: 3, taper: 0.7 }),
  },
  {
    id: 'mushroom-classic',
    label: 'mushroom dwelling',
    model: () => mushroomDwelling({ light_angle: KIT_LIGHT_ANGLE }),
  },
  {
    id: 'mushroom-tall',
    label: 'two-storey mushroom dwelling',
    model: () => mushroomDwelling({ light_angle: KIT_LIGHT_ANGLE, floors: 2, capSpread: 1.45 }),
  },
  {
    id: 'pagoda-temple',
    label: 'tiered pagoda',
    model: () => tieredPagoda({ light_angle: KIT_LIGHT_ANGLE }),
  },
  {
    id: 'pagoda-slate',
    label: 'four-tier slate pagoda',
    model: () => tieredPagoda({ light_angle: KIT_LIGHT_ANGLE, style_theme: 'concrete', floors: 4, taper: 0.8 }),
  },
];

/** A kit entry after baking — drawables plus the box a caller scales against. */
export interface BakedKitEntry extends BakedBuilding {
  id: string;
  label: string;
}

/**
 * Bake the whole roster, normalized to the placement contract (centred on x = 0, standing
 * on y = 0).
 *
 * This is BUILD-TIME work and is meant to stay that way (ADR-0217 D4: the runtime performs
 * no geometry). Station 3's BSP runs tens to hundreds of milliseconds per building — a
 * cost that is nothing in a build script and unacceptable on a map that redraws.
 */
export function bakeKit(): BakedKitEntry[] {
  return KIT.map((e) => ({
    ...bakeBuilding(e.model(), { normalize: true, showGround: true }),
    id: e.id,
    label: e.label,
  }));
}
