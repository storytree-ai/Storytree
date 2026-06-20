// Stage-1 red-green of the forest "building" render class (ADR-0076 §2): the
// DISTRIBUTION (which islands carry a building's icon) and the bookshelf icon
// GEOMETRY (deterministic, in-bounds book spines). The APPEARANCE is owner-attested
// (ADR-0070), NOT asserted here.

import { describe, it, expect } from 'vitest';
import { bookshelfConsumers, shelfBooks, SHELF_TUNING } from './buildingLayout';
import type { WiredNode } from './connectionSet';

const node = (id: string, dependsOn: string[] = [], consumedBy: string[] = []): WiredNode => ({
  id,
  dependsOn,
  consumedBy,
});

describe('bookshelfConsumers — distribute a building onto every island it connects to', () => {
  it('stamps the icon on every story whose depends_on names the building', () => {
    const nodes = [
      node('library'),
      node('store', ['library']),
      node('studio', ['library', 'notice-board']),
      node('notice-board', ['library']),
      node('unrelated', ['something-else']),
    ];
    const consumers = bookshelfConsumers(nodes, new Set(['library']));
    expect([...consumers].sort()).toEqual(['notice-board', 'store', 'studio']);
  });

  it('also counts the building`s OWN consumed_by (provider-side hub edge)', () => {
    // the real corpus shape: library declares consumed_by:[cli]; cli is the edgeless hub
    const nodes = [
      node('cli'),
      node('library', ['proof-protocol'], ['cli']),
      node('proof-protocol'),
    ];
    const consumers = bookshelfConsumers(nodes, new Set(['library']));
    expect(consumers.has('cli')).toBe(true);
    // proof-protocol is what library DEPENDS ON, not a consumer — excluded
    expect(consumers.has('proof-protocol')).toBe(false);
  });

  it('never stamps a building on itself or another building', () => {
    const nodes = [
      node('library', [], ['cli']),
      node('other-building', ['library']),
      node('cli'),
    ];
    // both library and other-building are buildings; only cli (a real consumer) survives
    const consumers = bookshelfConsumers(nodes, new Set(['library', 'other-building']));
    expect([...consumers]).toEqual(['cli']);
  });

  it('restricts to present ids (a dangling depends_on is ignored)', () => {
    const nodes = [node('library'), node('ghost-ref', ['library'])];
    const consumers = bookshelfConsumers([nodes[0]!], new Set(['library']));
    expect(consumers.size).toBe(0);
  });

  it('is empty when no building id is present', () => {
    const nodes = [node('a', ['b']), node('b')];
    expect(bookshelfConsumers(nodes, new Set(['library'])).size).toBe(0);
    expect(bookshelfConsumers(nodes, new Set()).size).toBe(0);
  });

  it('is deterministic and order-independent', () => {
    const a = [node('library', [], ['cli']), node('cli'), node('store', ['library'])];
    const b = [node('store', ['library']), node('cli'), node('library', [], ['cli'])];
    const fromA = [...bookshelfConsumers(a, new Set(['library']))].sort();
    const fromB = [...bookshelfConsumers(b, new Set(['library']))].sort();
    expect(fromA).toEqual(fromB);
    expect(fromA).toEqual(['cli', 'store']);
  });

  it('matches the live library corpus: its 8 dependents ∪ consumed_by:[cli]', () => {
    // the actual depends_on edges in stories/*/story.md as of 2026-06-20
    const dependents = [
      'drive-machinery',
      'feedback-graduation',
      'notice-board',
      'store',
      'studio',
      'studio-cloud',
      'studio-members',
      'uat-attestation',
    ];
    const nodes: WiredNode[] = [
      node('library', ['proof-protocol'], ['cli']),
      node('cli'),
      node('proof-protocol'),
      ...dependents.map((id) => node(id, ['library'])),
    ];
    const consumers = bookshelfConsumers(nodes, new Set(['library']));
    expect([...consumers].sort()).toEqual([...dependents, 'cli'].sort());
  });
});

describe('shelfBooks — the crammed bookshelf shelf geometry', () => {
  it('fills the shelf width without overflowing it', () => {
    const books = shelfBooks(1, 30, 10);
    expect(books.length).toBeGreaterThan(2);
    for (const b of books) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(30 + 1e-9);
    }
    // the last spine sits near the right edge (the row really is full, not half-empty)
    const last = books[books.length - 1]!;
    expect(last.x + last.w).toBeGreaterThan(30 - (SHELF_TUNING.maxW + SHELF_TUNING.gap));
  });

  it('clamps every spine height to the shelf interior', () => {
    const height = 9;
    for (const b of shelfBooks(7, 28, height)) {
      expect(b.h).toBeLessThanOrEqual(height + 1e-9);
      expect(b.h).toBeGreaterThanOrEqual(height * SHELF_TUNING.minHFrac - 1e-9);
    }
  });

  it('varies heights, widths and colours (not a uniform picket fence)', () => {
    const books = shelfBooks(42, 40, 11);
    expect(new Set(books.map((b) => b.variant)).size).toBeGreaterThan(1);
    expect(new Set(books.map((b) => Math.round(b.h))).size).toBeGreaterThan(1);
    expect(new Set(books.map((b) => Math.round(b.w * 10))).size).toBeGreaterThan(1);
  });

  it('leans some books and keeps the rest upright (a lived-in, crammed look)', () => {
    // across several shelves at least one book tilts and at least one stays upright
    const many = [0, 1, 2, 3, 4, 5].flatMap((s) => shelfBooks(s, 40, 11));
    expect(many.some((b) => b.tilt !== 0)).toBe(true);
    expect(many.some((b) => b.tilt === 0)).toBe(true);
    for (const b of many) expect(Math.abs(b.tilt)).toBeLessThanOrEqual(SHELF_TUNING.maxTilt + 1e-9);
  });

  it('is byte-for-byte deterministic across calls', () => {
    expect(shelfBooks(3, 32, 10)).toEqual(shelfBooks(3, 32, 10));
  });

  it('different seeds give different rows', () => {
    expect(shelfBooks(1, 32, 10)).not.toEqual(shelfBooks(2, 32, 10));
  });

  it('returns an empty row when the shelf is too narrow for any book', () => {
    expect(shelfBooks(1, 1, 10)).toEqual([]);
  });
});
