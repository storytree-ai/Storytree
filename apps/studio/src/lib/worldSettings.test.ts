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

import { describe, it, expect } from 'vitest';
import {
  CONTROLS,
  controlByKey,
  setControlValue,
  readControlValue,
  resetControls,
  buildShareUrl,
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
    // Layout (DAG vs solar) + Ground (tiling) + the building-drawer toggle — the dials
    // left after the road routing system was retired, plus the left-rail/drawer switch
    // (owner ask 2026-06-21: a gear switch, not a URL paste).
    const expected = ['layout', 'substrate', 'buildingDrawer'];
    expect([...keys].sort()).toEqual([...expected].sort());
    // The retired river/pond dials AND the retired road-routing dials must be GONE
    // (genuinely stripped, not shelved — ADR-0073 / ADR-0076).
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

  it('groups controls under Layout, Ground and Panels', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    expect(groups.has('Layout')).toBe(true);
    expect(groups.has('Ground')).toBe(true);
    // The building-drawer toggle lives in its own Panels section (the left-rail /
    // drawer for the distributed buildings, owner ask 2026-06-21).
    expect(groups.has('Panels')).toBe(true);
    expect(groups.size).toBe(3);
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

describe('worldSettings — buildingDrawer toggle (left-rail/drawer, owner ask 2026-06-21)', () => {
  it('defaults OFF and writing OFF REMOVES the param (byte-identical world)', () => {
    expect(readControlValue('', ctl('buildingDrawer'))).toBe(false);
    // turning the default-OFF toggle back off clears it
    expect(setControlValue('?buildingDrawer=on', ctl('buildingDrawer'), false)).toBe('');
  });

  it('turning it ON writes buildingDrawer=on, and reads back as true', () => {
    expect(setControlValue('', ctl('buildingDrawer'), true)).toBe('?buildingDrawer=on');
    expect(readControlValue('?buildingDrawer=on', ctl('buildingDrawer'))).toBe(true);
  });

  it('the off-spellings read as OFF', () => {
    for (const off of ['off', '0', 'false']) {
      expect(readControlValue(`?buildingDrawer=${off}`, ctl('buildingDrawer'))).toBe(false);
    }
  });

  it('preserves UNRELATED params when toggling', () => {
    const out = setControlValue('?debug=1', ctl('buildingDrawer'), true);
    expect(out).toContain('debug=1');
    expect(out).toContain('buildingDrawer=on');
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
    expect(resetControls('?substrate=hex&layout=solar&buildingDrawer=on')).toBe('');
  });

  it('preserves unmanaged params', () => {
    const out = resetControls('?substrate=hex&debug=1');
    expect(out).not.toContain('substrate');
    expect(out).toContain('debug=1');
  });
});
