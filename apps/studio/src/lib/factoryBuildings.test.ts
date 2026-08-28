// The glue's three decisions, held to account (ADR-0217 increment 5).
//
// Stage-1 red-green only: WHICH building an island gets, WHERE it stands, and HOW MANY copies
// exist. The APPEARANCE — whether a factory building reads better on the island than the flat
// glyph it replaces — is the owner's verdict and is not signable here (ADR-0070 stage 2).

import { describe, it, expect, beforeAll } from 'vitest';

import {
  factoryBuildingFor,
  factoryDefId,
  factoryScale,
  loadFactoryKit,
  usedFactoryBuildings,
  type FactoryBuilding,
} from './factoryBuildings.js';
import { storyIcon, ICON_SHAPES } from './buildingLayout.js';

const SAMPLE = ['library', 'cli', 'studio', 'forest-world', 'orchestrator', 'drive', 'agent', 'notice-board'];

// The kit is fetched lazily so the megabyte of geometry stays out of the main chunk; the tests
// await it once and then exercise the pure functions over it.
let FACTORY_KIT: FactoryBuilding[];
beforeAll(async () => {
  FACTORY_KIT = await loadFactoryKit();
});

describe('the baked kit', () => {
  it('ships buildings', () => {
    expect(FACTORY_KIT.length).toBeGreaterThan(0);
    for (const b of FACTORY_KIT) {
      expect(b.nodes.length).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(b.width).toBeGreaterThan(0);
    }
  });

  it('stands every building on the origin, the placement contract the glyph used', () => {
    // ICON_GLYPH is centred on x=0 with its base at y=0. A building that did not match would
    // silently shift every existing call site's translate.
    for (const b of FACTORY_KIT) {
      expect(Math.abs(b.minX + b.width / 2)).toBeLessThan(0.01);
      expect(Math.abs(b.minY + b.height)).toBeLessThan(0.01);
    }
  });

  it('carries resolved colour on every drawable', () => {
    // The reason this lives in studio chrome and not in the shared scene-graph (ADR-0093 §4):
    // a facade's fill is its material modulated by N·L, so no CSS class can name it.
    for (const b of FACTORY_KIT) {
      for (const n of b.nodes) {
        expect(n.fill).toMatch(/^(#[0-9a-f]{3}|#[0-9a-f]{6}|none)$/i);
      }
    }
    // …and the colours genuinely differ within one building, which is the whole point.
    const first = FACTORY_KIT[0]!;
    expect(new Set(first.nodes.map((n) => n.fill)).size).toBeGreaterThan(3);
  });
});

describe('which building an island gets', () => {
  it('is deterministic — each id lands on the building it has always landed on', () => {
    // ⚠ THIS TABLE IS FROZEN. Read off the baked kit once and pinned; do NOT regenerate it to make
    // a failure go away. A red here means an island MOVED, which is exactly the regression the
    // `factoryBuildingFor` contract forbids ("a reader who learned the map keeps their landmarks").
    //
    // The previous form of this test asserted
    //   factoryBuildingFor(KIT, id).id === factoryBuildingFor(KIT, id).id
    // which is `x === x` — true of every possible implementation. Confirmed hollow 2026-08-29:
    // it passed with the whole bucket computation replaced by `const bucket = 0`, i.e. with every
    // island collapsed onto one building.
    const FROZEN = {
      library: 'windmill-brick',
      cli: 'windmill-timber',
      studio: 'mushroom-tall',
      'forest-world': 'pagoda-slate',
      orchestrator: 'windmill-timber',
      drive: 'windmill-timber',
      agent: 'windmill-brick',
      'notice-board': 'pagoda-temple',
    } satisfies Record<string, string>;
    for (const id of SAMPLE) {
      expect(factoryBuildingFor(FACTORY_KIT, id).id).toBe(FROZEN[id as keyof typeof FROZEN]);
    }
  });

  it('is keyed on the SAME identity bucket the flat glyph used, so no island moves', () => {
    // The swap is art-only. Two stories that shared a glyph shape still share a building, and a
    // story's building can only change if `storyIcon` changes — which is the existing contract.
    for (const id of SAMPLE) {
      const expected = FACTORY_KIT[storyIcon(id).shape % FACTORY_KIT.length];
      expect(factoryBuildingFor(FACTORY_KIT, id).id).toBe(expected!.id);
    }
  });

  it('resolves every shape bucket to a real building — asked THROUGH the subject', () => {
    // The bucket space (8) and the kit size (6) need not match; the modulo must still land, and
    // every building in the kit must be reachable by some island.
    //
    // The previous form of this test never called `factoryBuildingFor` at all: it indexed
    // `FACTORY_KIT[bucket % FACTORY_KIT.length]` itself and then asserted arithmetic over two
    // constants it had imported, so both sides moved together. Confirmed hollow 2026-08-29 — it
    // passed both with the kit index rotated by 3 and with the bucket pinned to 0.
    //
    // BUCKET_IDS is one real story id per shape bucket, so the loop below drives the subject
    // across its whole input space rather than re-deriving its formula.
    const BUCKET_IDS = [
      'library', 'cli', 'art-authoring', 'studio',
      'notice-board', 'forest-world', 'agent', 'drive',
    ];
    expect(BUCKET_IDS).toHaveLength(ICON_SHAPES);
    expect(new Set(BUCKET_IDS.map((id) => storyIcon(id).shape)).size).toBe(ICON_SHAPES);

    const kitIds = new Set(FACTORY_KIT.map((b) => b.id));
    const seen = new Set<string>();
    for (const id of BUCKET_IDS) {
      const building = factoryBuildingFor(FACTORY_KIT, id);
      // Every bucket lands on a building that is genuinely IN the kit.
      expect(kitIds.has(building.id)).toBe(true);
      seen.add(building.id);
    }
    // …and the eight buckets between them reach every one of the six buildings, so no building is
    // stranded and no bucket is starved. This is the assertion that dies when the mapping collapses.
    expect(seen.size).toBe(Math.min(ICON_SHAPES, FACTORY_KIT.length));
  });
});

describe('how many copies exist — the node budget', () => {
  it('defines only the buildings actually referenced', () => {
    const oneStory = usedFactoryBuildings(FACTORY_KIT, ['library']);
    expect(oneStory).toHaveLength(1);
    expect(oneStory[0]!.id).toBe(factoryBuildingFor(FACTORY_KIT, 'library').id);
  });

  it('never defines the same building twice, however many islands reference it', () => {
    // This IS the budget guarantee: N islands cost N `<use>` nodes plus one shared definition,
    // not N copies of an ~800-node building (ADR-0069's ceiling is ~1,000–3,000).
    const many = Array.from({ length: 50 }, (_, i) => SAMPLE[i % SAMPLE.length]!);
    const used = usedFactoryBuildings(FACTORY_KIT, many);
    expect(used.length).toBeLessThanOrEqual(FACTORY_KIT.length);
    expect(new Set(used.map((b) => b.id)).size).toBe(used.length);

    const definedNodes = used.reduce((n, b) => n + b.nodes.length, 0);
    const ifInlined = many.reduce((n, id) => n + factoryBuildingFor(FACTORY_KIT, id).nodes.length, 0);
    expect(definedNodes).toBeLessThan(ifInlined / 5);
  });

  it('returns kit order, so the defs block is stable across renders', () => {
    const a = usedFactoryBuildings(FACTORY_KIT, SAMPLE).map((b) => b.id);
    const b = usedFactoryBuildings(FACTORY_KIT, [...SAMPLE].reverse()).map((x) => x.id);
    expect(a).toEqual(b);
  });

  it('handles an empty map', () => {
    expect(usedFactoryBuildings(FACTORY_KIT, [])).toEqual([]);
  });
});

describe('where it stands', () => {
  it('scales to a target height, not a target width', () => {
    // Matching on width would make the windmill (wide sails) tower over its neighbours.
    for (const b of FACTORY_KIT) {
      expect(b.height * factoryScale(b, 24)).toBeCloseTo(24, 6);
    }
  });

  it('gives each building a distinct, stable defs id', () => {
    const ids = FACTORY_KIT.map((b) => factoryDefId(b.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(factoryDefId('windmill-brick')).toBe('factory-building-windmill-brick');
  });
});
