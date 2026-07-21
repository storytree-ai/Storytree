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
  readCosyIsland,
  readGardenIsland,
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
    // Layout (DAG vs solar) + Ground (tiling), plus the grounded-art cosy-island feature gates
    // (`garden` / `cosy` / `veg`) surfaced as gear toggles (owner ask 2026-07-20 — flick them in the
    // panel rather than type URLs). The `buildingIsland` toggle was REMOVED with ADR-0088 (the
    // shared-island panel is permanent, not a gear flag), so the gear no longer carries a Panels switch.
    const expected = ['layout', 'substrate', 'garden', 'cosy', 'veg'];
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

  it('groups controls under Layout, Ground and Cosy island (Panels gone with ADR-0088)', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    expect(groups.has('Layout')).toBe(true);
    expect(groups.has('Ground')).toBe(true);
    // The grounded-art cosy-island feature gates (garden / cosy) live in their own gear section.
    expect(groups.has('Cosy island')).toBe(true);
    // The building-island toggle (the only Panels control) was removed — no Panels section.
    expect(groups.has('Panels')).toBe(false);
    expect(groups.size).toBe(3);
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — layout control (ADR-0171 stress default / ADR-0074 §6 solar)', () => {
  it('defaults to stress and writing stress REMOVES the param (ADR-0171 attested default)', () => {
    expect(readControlValue('', ctl('layout'))).toBe('stress');
    expect(setControlValue('?layout=dag', ctl('layout'), 'stress')).toBe('');
  });

  it('writes layout=dag / layout=solar when a non-default world is picked', () => {
    expect(setControlValue('', ctl('layout'), 'dag')).toBe('?layout=dag');
    expect(readControlValue('?layout=dag', ctl('layout'))).toBe('dag');
    expect(setControlValue('', ctl('layout'), 'solar')).toBe('?layout=solar');
    expect(readControlValue('?layout=solar', ctl('layout'))).toBe('solar');
  });

  it('normalizes aliases and unknowns to the stress default', () => {
    expect(readControlValue('?layout=radial', ctl('layout'))).toBe('solar');
    expect(readControlValue('?layout=rows', ctl('layout'))).toBe('dag');
    expect(readControlValue('?layout=whatever', ctl('layout'))).toBe('stress');
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

describe('worldSettings — readCosyIsland (grounded-art inc 9, default-off cosy palette flag)', () => {
  it('defaults OFF when no ?cosy param is present', () => {
    expect(readCosyIsland('')).toBe(false);
    expect(readCosyIsland('?substrate=hex&layout=solar')).toBe(false);
  });

  it('?cosy=on / =1 / =true all turn the cosy palette on', () => {
    expect(readCosyIsland('?cosy=on')).toBe(true);
    expect(readCosyIsland('?cosy=1')).toBe(true);
    expect(readCosyIsland('?cosy=true')).toBe(true);
  });

  it('an unknown ?cosy value stays OFF (no silent typo-activation)', () => {
    expect(readCosyIsland('?cosy=wat')).toBe(false);
    expect(readCosyIsland('?cosy=off')).toBe(false);
  });
});

describe('worldSettings — readGardenIsland (grounded-art inc 11, ADR-0221, default-off garden flag)', () => {
  it('defaults OFF (absent or unrelated params)', () => {
    expect(readGardenIsland('')).toBe(false);
    expect(readGardenIsland('?cosy=on&layout=solar')).toBe(false);
  });
  it('reads ON for the accepted spellings', () => {
    expect(readGardenIsland('?garden=on')).toBe(true);
    expect(readGardenIsland('?garden=1')).toBe(true);
    expect(readGardenIsland('?garden=true')).toBe(true);
  });
  it('an unknown ?garden value stays OFF', () => {
    expect(readGardenIsland('?garden=wat')).toBe(false);
    expect(readGardenIsland('?garden=off')).toBe(false);
  });
});

describe('worldSettings — the cosy-island gear TOGGLES (owner ask: gear panel, not URLs)', () => {
  it('garden + cosy + veg are default-off toggles in the "Cosy island" group', () => {
    for (const key of ['garden', 'cosy', 'veg']) {
      const c = ctl(key);
      expect(c.kind).toBe('toggle');
      expect(c.group).toBe('Cosy island');
      expect(readControlValue('', c)).toBe(false); // default off
    }
  });
  it('flicking the garden toggle writes garden=on / removes it — and the reader agrees', () => {
    const c = ctl('garden');
    const on = setControlValue('', c, true);
    expect(on).toBe('?garden=on');
    expect(readControlValue(on, c)).toBe(true);
    expect(readGardenIsland(on)).toBe(true); // the gear toggle and the standalone reader match
    expect(setControlValue('?garden=on', c, false)).toBe(''); // back to default removes the param
  });
  it('the cosy toggle writes cosy=on / removes it, matching readCosyIsland', () => {
    const c = ctl('cosy');
    expect(setControlValue('', c, true)).toBe('?cosy=on');
    expect(readCosyIsland('?cosy=on')).toBe(true);
    expect(setControlValue('?cosy=on', c, false)).toBe('');
  });
  it('the veg toggle writes veg=on / removes it, matching readVegetationVocab', () => {
    const c = ctl('veg');
    expect(setControlValue('', c, true)).toBe('?veg=on');
    expect(readVegetationVocab('?veg=on')).toBe(true);
    expect(setControlValue('?veg=on', c, false)).toBe('');
  });
});

describe('worldSettings — readVegetationVocab (grounded-art, ADR-0226, default-off vegetation flag)', () => {
  it('is OFF by default / for unrelated params', () => {
    expect(readVegetationVocab('')).toBe(false);
    expect(readVegetationVocab('?cosy=on&layout=solar')).toBe(false);
  });
  it('is ON for the accepted truthy tokens', () => {
    expect(readVegetationVocab('?veg=on')).toBe(true);
    expect(readVegetationVocab('?veg=1')).toBe(true);
    expect(readVegetationVocab('?veg=true')).toBe(true);
  });
  it('an unknown ?veg value stays OFF', () => {
    expect(readVegetationVocab('?veg=wat')).toBe(false);
    expect(readVegetationVocab('?veg=off')).toBe(false);
  });
});
