// worldSettings is the SINGLE SOURCE OF TRUTH for the user-facing forest-map dials
// (the gear panel at #/tree) — the control schema AND the param↔URL binding. These
// tests pin the binding contract RED-FIRST so the panel and the TreeView readers can
// never drift: a control written to its DEFAULT must REMOVE its param (so the default
// world's URL stays clean / the world stays byte-identical), unrelated params survive,
// and the shareable URL puts params BEFORE the #hash. Pure string/URL math — no React,
// no DOM — so the suite runs in node env.
//
// ADR-0073 made roads the one world; ADR-0076 retired the river-trail ROUTING system
// (connections are now thin perimeter-docked lines with nothing to tune), so the
// road-routing dials are GONE — only Layout (DAG vs solar) and Ground (tiling) remain.
//
// ADR-0088 (Shared Islands panel, amends ADR-0076 §2): the building islands moved OFF the
// map into a permanent left panel, so the `buildingIsland` GEAR TOGGLE lost its meaning (the
// panel is permanent, not a flag) and was removed from the gear schema — only Layout and
// Ground survive in the gear now (Panels is gone).

import { describe, it, expect } from 'vitest';
import {
  CONTROLS,
  controlByKey,
  setControlValue,
  readControlValue,
  resetControls,
  buildShareUrl,
  readRenderScene,
  type ControlSpec,
} from './worldSettings.js';

/** Pull a control spec by URL key, failing loudly if the schema dropped it. */
function ctl(key: string): ControlSpec {
  const c = controlByKey(key);
  if (!c) throw new Error(`no control for key ${key}`);
  return c;
}

describe('worldSettings — schema (docked-line roads, ADR-0076)', () => {
  it('exposes exactly the surviving dials, each with a key/label/group/kind/hint', () => {
    const keys = CONTROLS.map((c) => c.key);
    // Layout (DAG vs solar) + Ground (tiling) — the only dials left. The `buildingIsland`
    // toggle was REMOVED with ADR-0088 (the shared-island panel is permanent, not a gear
    // flag), so the gear no longer carries a Panels switch.
    const expected = ['layout', 'substrate'];
    expect([...keys].sort()).toEqual([...expected].sort());
    // The retired river/pond dials, road-routing dials AND the removed building toggles
    // (building-DRAWER, then building-ISLAND) must be GONE (genuinely stripped, not shelved —
    // ADR-0073 / ADR-0076 / ADR-0088).
    for (const gone of [
      'roads',
      'roadStraighten',
      'bundleFar',
      'deltaPull',
      'riverRepel',
      'world',
      'deltaCone',
      'meanderAmp',
      'pondMouth',
      'weld',
      'buildingDrawer',
      'buildingIsland',
    ]) {
      expect(keys, `retired control still present: ${gone}`).not.toContain(gone);
    }
    for (const c of CONTROLS) {
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.group.length).toBeGreaterThan(0);
      expect(['number', 'toggle', 'select']).toContain(c.kind);
      // Every control carries a visible plain-English description (a sub-label under the row).
      expect((c.hint ?? '').length, `control ${c.key} needs a hint`).toBeGreaterThan(0);
    }
  });

  it('groups controls under Layout and Ground only (Panels gone with ADR-0088)', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    expect(groups.has('Layout')).toBe(true);
    expect(groups.has('Ground')).toBe(true);
    // The building-island toggle (the only Panels control) was removed — no Panels section.
    expect(groups.has('Panels')).toBe(false);
    expect(groups.size).toBe(2);
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — layout control (solar-system, ADR-0074 §6)', () => {
  it('defaults to dag and writing dag REMOVES the param (byte-identical world)', () => {
    expect(readControlValue('', ctl('layout'))).toBe('dag');
    expect(setControlValue('?layout=solar', ctl('layout'), 'dag')).toBe('');
  });

  it('writes layout=solar when the radial world is picked', () => {
    expect(setControlValue('', ctl('layout'), 'solar')).toBe('?layout=solar');
    expect(readControlValue('?layout=solar', ctl('layout'))).toBe('solar');
  });

  it('normalizes aliases and unknowns to dag', () => {
    expect(readControlValue('?layout=radial', ctl('layout'))).toBe('solar');
    expect(readControlValue('?layout=rows', ctl('layout'))).toBe('dag');
    expect(readControlValue('?layout=whatever', ctl('layout'))).toBe('dag');
  });
});

describe('worldSettings — substrate control (select)', () => {
  it('mesh (default) removes the param, others write substrate=<value>', () => {
    expect(setControlValue('?substrate=hex', ctl('substrate'), 'mesh')).toBe('');
    expect(setControlValue('', ctl('substrate'), 'hex')).toBe('?substrate=hex');
    expect(setControlValue('', ctl('substrate'), 'relaxed-quad')).toBe('?substrate=relaxed-quad');
  });

  it('reads the default when absent and a present value when set', () => {
    expect(readControlValue('', ctl('substrate'))).toBe('mesh');
    expect(readControlValue('?substrate=relaxed-quad', ctl('substrate'))).toBe('relaxed-quad');
  });

  it('preserves UNRELATED params when setting a select', () => {
    const out = setControlValue('?debug=1', ctl('substrate'), 'hex');
    expect(out).toContain('debug=1');
    expect(out).toContain('substrate=hex');
  });
});

describe('worldSettings — buildShareUrl puts params BEFORE the hash', () => {
  it('orders ?…params before the #/tree hash', () => {
    const url = buildShareUrl('https://x.test/', '?substrate=hex', '#/tree');
    expect(url).toBe('https://x.test/?substrate=hex#/tree');
  });

  it('omits the ? when there are no params', () => {
    expect(buildShareUrl('https://x.test/', '', '#/tree')).toBe('https://x.test/#/tree');
  });

  it('keeps a focused deep-link hash intact', () => {
    const url = buildShareUrl('https://x.test/', '?layout=solar', '#/tree/some-story');
    expect(url).toBe('https://x.test/?layout=solar#/tree/some-story');
  });
});

describe('worldSettings — resetControls drops every managed param', () => {
  it('returns empty when only managed params were present', () => {
    expect(resetControls('?substrate=hex&layout=solar')).toBe('');
  });

  it('preserves unmanaged params', () => {
    const out = resetControls('?substrate=hex&debug=1');
    expect(out).not.toContain('substrate');
    expect(out).toContain('debug=1');
  });
});

describe('worldSettings — readRenderScene (scene is now the DEFAULT, ADR-0093 Unit D)', () => {
  it('defaults to the SCENE render when no ?render param is present', () => {
    // The flip: absence => scene (the shared scene-graph is the canonical render now).
    expect(readRenderScene('')).toBe(true);
    expect(readRenderScene('?substrate=hex&layout=solar')).toBe(true);
  });

  it('the ?render=legacy / ?render=inline escape hatch selects the inline render', () => {
    expect(readRenderScene('?render=legacy')).toBe(false);
    expect(readRenderScene('?render=inline')).toBe(false);
  });

  it('?render=scene still explicitly selects the scene render', () => {
    expect(readRenderScene('?render=scene')).toBe(true);
  });

  it('an unknown ?render value falls back to the scene default (not the escape hatch)', () => {
    expect(readRenderScene('?render=wat')).toBe(true);
  });
});
