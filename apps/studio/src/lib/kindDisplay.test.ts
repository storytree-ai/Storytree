// ADR-0183 D1 pins the naming split: `arc` is the canonical kind KEY (routes, refs, API, CLI)
// while the studio DISPLAYS it as "Epic" by default, flippable to "Arc". These tests pin the
// display contract red-first so no component hand-rolls the alias: only the `arc` kind is ever
// aliased, the alias is display-text only (never a key), and the persisted preference defaults
// to 'epic' on a missing/garbage stored value. Pure string math + an injectable storage stub —
// no React, no DOM — so the suite runs in node env.

import { describe, it, expect } from 'vitest';
import {
  kindLabel,
  typeLabel,
  readArcDisplay,
  ARC_DISPLAY_KEY,
  type ArcDisplay,
} from './kindDisplay.js';

describe('kindLabel (the chip / inline kind text)', () => {
  it('aliases arc to epic when the display preference is epic (the D1 default)', () => {
    expect(kindLabel('arc', 'epic')).toBe('epic');
  });

  it('shows the canonical key when the preference is flipped to arc', () => {
    expect(kindLabel('arc', 'arc')).toBe('arc');
  });

  it('never aliases any other kind, under either preference', () => {
    for (const display of ['epic', 'arc'] as ArcDisplay[]) {
      expect(kindLabel('plan', display)).toBe('plan');
      expect(kindLabel('definition', display)).toBe('definition');
      expect(kindLabel('adr', display)).toBe('adr');
    }
  });
});

describe('typeLabel (the plural heading text)', () => {
  it('aliases the arc heading to Epics by default and Arcs when flipped', () => {
    expect(typeLabel('arc', 'epic', 'Arcs')).toBe('Epics');
    expect(typeLabel('arc', 'arc', 'Arcs')).toBe('Arcs');
  });

  it('passes every other heading through untouched', () => {
    expect(typeLabel('plan', 'epic', 'Plans')).toBe('Plans');
    expect(typeLabel('definition', 'arc', 'Definitions')).toBe('Definitions');
  });
});

describe('readArcDisplay (the persisted preference)', () => {
  const storageWith = (value: string | null) => ({
    getItem: (key: string) => (key === ARC_DISPLAY_KEY ? value : null),
  });

  it("defaults to 'epic' when nothing is stored (D1: Epic is the default)", () => {
    expect(readArcDisplay(storageWith(null))).toBe('epic');
  });

  it("reads a stored 'arc' flip back", () => {
    expect(readArcDisplay(storageWith('arc'))).toBe('arc');
  });

  it("treats a garbage stored value as the 'epic' default, never a crash", () => {
    expect(readArcDisplay(storageWith('EPIC!!'))).toBe('epic');
  });

  it("survives an unavailable storage (private mode) as the 'epic' default", () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readArcDisplay(throwing)).toBe('epic');
  });
});
