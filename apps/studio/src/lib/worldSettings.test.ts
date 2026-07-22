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
  readVegetationVocab,
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
    // Layout (DAG vs solar) + Ground (tiling), plus the grounded-art `veg` toggle (the promoted
    // vegetation-vocabulary default; the `garden` / `cosy` toggles were retired by ADR-0228) and the
    // sprite-art-sheets `artStyle` select + its `artScale` size dial (sprites derive their size from
    // the vector body they replace; the dial multiplies the fit). The `buildingIsland` toggle was
    // REMOVED with ADR-0088 (the shared-island panel is permanent, not a gear flag), so the gear
    // carries no Panels switch.
    const expected = ['layout', 'substrate', 'veg', 'artStyle', 'artScale'];
    expect([...keys].sort()).toEqual([...expected].sort());
    // The retired river/pond dials, road-routing dials, the removed building toggles
    // (building-DRAWER, then building-ISLAND) AND the retired grounded-art `garden` / `cosy` toggles
    // must be GONE (genuinely stripped, not shelved — ADR-0073 / ADR-0076 / ADR-0088 / ADR-0228).
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
      'garden',
      'cosy',
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

  it('groups controls under Layout, Ground and World art (Panels gone with ADR-0088)', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    expect(groups.has('Layout')).toBe(true);
    expect(groups.has('Ground')).toBe(true);
    // The grounded-art vegetation vocabulary lives in its own gear section (renamed from "Cosy island"
    // to "World art" when the garden/cosy toggles were retired — ADR-0228).
    expect(groups.has('World art')).toBe(true);
    // The building-island toggle (the only Panels control) was removed — no Panels section.
    expect(groups.has('Panels')).toBe(false);
    // The sprite-art-sheets `artStyle` select + `artScale` dial share the "Art style" section.
    expect(groups.has('Art style')).toBe(true);
    expect(groups.size).toBe(4);
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — layout control (ADR-0229 dag default / ADR-0074 §6 solar)', () => {
  it('defaults to dag and writing dag REMOVES the param (ADR-0229 attested default, amends ADR-0171)', () => {
    expect(readControlValue('', ctl('layout'))).toBe('dag');
    expect(setControlValue('?layout=stress', ctl('layout'), 'dag')).toBe('');
  });

  it('writes layout=stress / layout=solar when a non-default world is picked', () => {
    expect(setControlValue('', ctl('layout'), 'stress')).toBe('?layout=stress');
    expect(readControlValue('?layout=stress', ctl('layout'))).toBe('stress');
    expect(setControlValue('', ctl('layout'), 'solar')).toBe('?layout=solar');
    expect(readControlValue('?layout=solar', ctl('layout'))).toBe('solar');
  });

  it('normalizes aliases and unknowns to the dag default', () => {
    expect(readControlValue('?layout=radial', ctl('layout'))).toBe('solar');
    expect(readControlValue('?layout=stress-majorization', ctl('layout'))).toBe('stress');
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

describe('worldSettings — the vegetation-vocabulary gear TOGGLE (owner ask: gear panel, not URLs)', () => {
  // ADR-0228 retired the `garden` / `cosy` grounded-art toggles + readGardenIsland / readCosyIsland;
  // `veg` (the promoted default) is the one grounded-art world-art toggle that remains.
  it('veg is a default-ON toggle in the "World art" group (ADR-0226 promoted to the studio default)', () => {
    const c = ctl('veg');
    expect(c.kind).toBe('toggle');
    expect(c.group).toBe('World art');
    expect(readControlValue('', c)).toBe(true); // default ON — the vocabulary is the studio default
  });
  it('the veg toggle (default ON) writes veg=off when turned off / removes it when on, matching readVegetationVocab', () => {
    const c = ctl('veg');
    // ON is the default → setting it on removes the param; OFF writes the escape token.
    expect(setControlValue('', c, true)).toBe('');
    expect(setControlValue('', c, false)).toBe('?veg=off');
    expect(readVegetationVocab('?veg=off')).toBe(false);
    expect(setControlValue('?veg=off', c, true)).toBe('');
  });
});

describe('worldSettings — artStyle control (sprite-art-sheets spike, default-off select)', () => {
  it('defaults to vector and writing vector REMOVES the param (byte-identical world)', () => {
    expect(readControlValue('', ctl('artStyle'))).toBe('vector');
    expect(setControlValue('?artStyle=stub-a', ctl('artStyle'), 'vector')).toBe('');
  });

  it('writes artStyle=stub-a / artStyle=stub-b when a stub sheet is picked', () => {
    expect(setControlValue('', ctl('artStyle'), 'stub-a')).toBe('?artStyle=stub-a');
    expect(readControlValue('?artStyle=stub-a', ctl('artStyle'))).toBe('stub-a');
    expect(setControlValue('', ctl('artStyle'), 'stub-b')).toBe('?artStyle=stub-b');
    expect(readControlValue('?artStyle=stub-b', ctl('artStyle'))).toBe('stub-b');
  });

  it('writes the real nano-banana sheets (cosy / evening) when picked (sprite-art-sheets wave 2)', () => {
    expect(setControlValue('', ctl('artStyle'), 'cosy')).toBe('?artStyle=cosy');
    expect(readControlValue('?artStyle=cosy', ctl('artStyle'))).toBe('cosy');
    expect(setControlValue('', ctl('artStyle'), 'evening')).toBe('?artStyle=evening');
    expect(readControlValue('?artStyle=evening', ctl('artStyle'))).toBe('evening');
    // both are offered in the panel dropdown
    const artStyle = ctl('artStyle');
    if (artStyle.kind !== 'select') throw new Error('artStyle should be a select control');
    const opts = artStyle.options.map((o) => o.value);
    expect(opts).toContain('cosy');
    expect(opts).toContain('evening');
  });

  it('an unknown/typo`d value normalizes to the vector default (never a silent broken sheet)', () => {
    expect(readControlValue('?artStyle=stub-z', ctl('artStyle'))).toBe('vector');
    expect(readControlValue('?artStyle=', ctl('artStyle'))).toBe('vector');
  });

  it('preserves UNRELATED params when setting the select', () => {
    const out = setControlValue('?debug=1', ctl('artStyle'), 'stub-a');
    expect(out).toContain('debug=1');
    expect(out).toContain('artStyle=stub-a');
  });
});

describe('worldSettings — artScale dial (derived sprite sizing)', () => {
  it('defaults to 1 (match the vector footprint) and writing 1 REMOVES the param', () => {
    expect(readControlValue('', ctl('artScale'))).toBe(1);
    expect(setControlValue('?artScale=1.5', ctl('artScale'), 1)).toBe('');
  });

  it('reads a set value and clamps garbage to the default / the clamp floor', () => {
    expect(readControlValue('?artScale=1.5', ctl('artScale'))).toBe(1.5);
    expect(readControlValue('?artScale=wat', ctl('artScale'))).toBe(1);
    expect(readControlValue('?artScale=0', ctl('artScale'))).toBe(0.05); // clampMin, never zero-size art
  });
});

describe('worldSettings — readVegetationVocab (grounded-art, ADR-0226, promoted to the studio DEFAULT)', () => {
  it('is ON by default / for unrelated params', () => {
    expect(readVegetationVocab('')).toBe(true);
    expect(readVegetationVocab('?cosy=on&layout=solar')).toBe(true);
  });
  it('is OFF only for the explicit escape tokens', () => {
    expect(readVegetationVocab('?veg=off')).toBe(false);
    expect(readVegetationVocab('?veg=0')).toBe(false);
    expect(readVegetationVocab('?veg=false')).toBe(false);
  });
  it('an unknown ?veg value stays ON (default)', () => {
    expect(readVegetationVocab('?veg=wat')).toBe(true);
    expect(readVegetationVocab('?veg=on')).toBe(true);
  });
});
