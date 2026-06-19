// Stage-1 red-green of the RADIAL solar-system layout geometry (ADR-0074 §6 /
// `solar-system-world`). These pin the contract buildWorld's solar branch leans on:
// hubs at the centre, organisms on rank-keyed orbits, deterministic + order-
// independent placement, and spokes that actually join their endpoints. The
// APPEARANCE is owner-attested (ADR-0070), NOT asserted here.

import { describe, it, expect } from 'vitest';
import { solarSeeds, spokePath, SOLAR_OPTS, type SolarNode, type Pt } from './solarLayout';

const dist = (p: Pt): number => Math.hypot(p.x, p.y);

function node(id: string, rank: number, hub = false, radius = 30): SolarNode {
  return { id, rank, hub, radius };
}

describe('solarSeeds — hubs at the centre', () => {
  it('places a lone hub exactly at the origin', () => {
    const seeds = solarSeeds([node('cli', 0, true)]);
    expect(seeds.get(0)).toEqual({ x: 0, y: 0 });
  });

  it('clusters two hubs symmetrically near the origin (within hubRadius)', () => {
    const seeds = solarSeeds([node('cli', 0, true), node('store', 0, true)]);
    const a = seeds.get(0)!;
    const b = seeds.get(1)!;
    expect(dist(a)).toBeCloseTo(SOLAR_OPTS.hubRadius, 5);
    expect(dist(b)).toBeCloseTo(SOLAR_OPTS.hubRadius, 5);
    // symmetric about the origin (opposite points on the hub circle)
    expect(a.x).toBeCloseTo(-b.x, 5);
    expect(a.y).toBeCloseTo(-b.y, 5);
  });

  it('seats every hub strictly inside the innermost orbit', () => {
    const seeds = solarSeeds([node('cli', 0, true), node('store', 0, true), node('a', 0)]);
    expect(dist(seeds.get(0)!)).toBeLessThan(SOLAR_OPTS.innerRadius);
    expect(dist(seeds.get(1)!)).toBeLessThan(SOLAR_OPTS.innerRadius);
  });
});

describe('solarSeeds — organisms orbit by rank', () => {
  it('returns a position for every node', () => {
    const nodes = [node('cli', 0, true), node('a', 0), node('b', 1), node('c', 2)];
    const seeds = solarSeeds(nodes);
    expect(seeds.size).toBe(nodes.length);
    for (let i = 0; i < nodes.length; i++) expect(seeds.get(i)).toBeDefined();
  });

  it('places higher-rank organisms on strictly outer rings', () => {
    // sparse rings so the rank base radius dominates (no crowd-growth)
    const nodes = [node('r0', 0), node('r1', 1), node('r2', 2)];
    const seeds = solarSeeds(nodes);
    const d0 = dist(seeds.get(0)!);
    const d1 = dist(seeds.get(1)!);
    const d2 = dist(seeds.get(2)!);
    expect(d0).toBeLessThan(d1);
    expect(d1).toBeLessThan(d2);
    // ~innerRadius (precision 1 absorbs the 2dp position rounding, not an axis-aligned exact)
    expect(d0).toBeCloseTo(SOLAR_OPTS.innerRadius, 1);
  });

  it('compacts ring indices over rank GAPS (rank 0,5,9 → three adjacent rings)', () => {
    const nodes = [node('a', 0), node('b', 5), node('c', 9)];
    const seeds = solarSeeds(nodes);
    expect(dist(seeds.get(0)!)).toBeCloseTo(SOLAR_OPTS.innerRadius, 1);
    expect(dist(seeds.get(1)!)).toBeCloseTo(SOLAR_OPTS.innerRadius + SOLAR_OPTS.ringStep, 1);
    expect(dist(seeds.get(2)!)).toBeCloseTo(SOLAR_OPTS.innerRadius + 2 * SOLAR_OPTS.ringStep, 1);
  });

  it('grows a crowded ring outward so islands fit around it', () => {
    const sparse = solarSeeds([node('only', 0)]);
    const many = Array.from({ length: 24 }, (_, k) => node(`n${k}`, 0, false, 40));
    const crowded = solarSeeds(many);
    // a single-node ring sits at the base; 24 fat islands must push the ring out
    expect(dist(sparse.get(0)!)).toBeCloseTo(SOLAR_OPTS.innerRadius, 1);
    expect(dist(crowded.get(0)!)).toBeGreaterThan(SOLAR_OPTS.innerRadius);
  });

  it('spreads a ring around the full circle (members are not colinear)', () => {
    const nodes = Array.from({ length: 6 }, (_, k) => node(`n${k}`, 0));
    const seeds = solarSeeds(nodes);
    const angles = new Set([...seeds.values()].map((p) => Math.round(Math.atan2(p.y, p.x) * 50)));
    // 6 distinct angular slots — a real orbit, not a stacked line
    expect(angles.size).toBe(6);
  });
});

describe('solarSeeds — deterministic + order-independent', () => {
  it('is byte-for-byte deterministic across calls', () => {
    const nodes = [node('cli', 0, true), node('a', 0), node('b', 1), node('c', 1)];
    expect(solarSeeds(nodes)).toEqual(solarSeeds(nodes));
  });

  it('places each id identically regardless of input array order', () => {
    const a = [node('cli', 0, true), node('x', 0), node('y', 1), node('z', 1)];
    const b = [node('z', 1), node('y', 1), node('cli', 0, true), node('x', 0)];
    const posA = new Map(a.map((n, i) => [n.id, solarSeeds(a).get(i)!]));
    const posB = new Map(b.map((n, i) => [n.id, solarSeeds(b).get(i)!]));
    for (const id of ['cli', 'x', 'y', 'z']) {
      expect(posB.get(id)).toEqual(posA.get(id));
    }
  });
});

describe('spokePath — joins endpoints, never dropped', () => {
  it('starts at `from` and ends at `to`', () => {
    const d = spokePath({ x: 100, y: -50 }, { x: 0, y: 0 });
    expect(d.startsWith('M 100 -50')).toBe(true);
    expect(d.trimEnd().endsWith('0 0')).toBe(true);
  });

  it('is a single quadratic segment (one control point)', () => {
    const d = spokePath({ x: 200, y: 10 }, { x: 5, y: 5 });
    expect((d.match(/Q/g) ?? []).length).toBe(1);
  });

  it('is deterministic', () => {
    const f = { x: 123.4, y: -67.8 };
    const t = { x: 12, y: 9 };
    expect(spokePath(f, t)).toBe(spokePath(f, t));
  });
});
