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
// panel is permanent, not a flag) and was removed from the gear schema. ADR-0283 D2 then retired the
// Layout picker itself, so the gear carries Art style + Selection and nothing else.

import { describe, it, expect } from 'vitest';
import {
  CONTROLS,
  controlByKey,
  MANAGED_KEYS,
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
    // The sprite-art-sheets `artStyle` select + its `artScale` size dial (sprites derive their size
    // from the vector body they replace; the dial multiplies the fit). The `layout` select went with
    // ADR-0283 D2 (owner-directed 2026-08-02): DAG rows are the ONE arrangement now, not the default
    // among three, so there is nothing to pick. The grounded-art `garden` / `cosy` toggles were retired by
    // ADR-0228, the `veg` vegetation-vocabulary toggle by ADR-0231, and the `substrate` "Ground tiling"
    // select by ADR-0233 (mesh is now the one tiling, not a dial). The `buildingIsland` toggle was
    // REMOVED with ADR-0088 (the shared-island panel is permanent, not a gear flag), so the gear carries
    // no Panels switch.
    // `selectionMotion` joins them (owner-directed 2026-07-27): selecting an island lights its
    // one-hop routes as two-lane hued lanes, and this dial is what MOVES when it does — draw +
    // pulse once (default), a looping march, or still. The lanes themselves are not optional.
    const expected = ['artStyle', 'artScale', 'selectionMotion'];
    expect([...keys].sort()).toEqual([...expected].sort());
    // The retired river/pond dials, road-routing dials, the removed building toggles
    // (building-DRAWER, then building-ISLAND), the retired grounded-art `garden` / `cosy` / `veg`
    // toggles AND the retired `substrate` ground-tiling select must be GONE (genuinely stripped, not
    // shelved — ADR-0073 / ADR-0076 / ADR-0088 / ADR-0228 / ADR-0231 / ADR-0233 / ADR-0283).
    for (const gone of [
      'layout',
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
      'veg',
      'substrate',
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

  it('groups controls under Art style + Selection (Layout, Panels, World art, Ground gone)', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    // ADR-0283 D2 retired the `layout` select — the only Layout control — so the section goes too.
    expect(groups.has('Layout')).toBe(false);
    // The building-island toggle (the only Panels control) was removed — no Panels section.
    expect(groups.has('Panels')).toBe(false);
    // The "World art" section held only the `veg` toggle, retired by ADR-0231 (vegetation is now
    // permanent world art, not a dial), so the section is gone.
    expect(groups.has('World art')).toBe(false);
    // The "Ground" section held only the `substrate` tiling select, retired by ADR-0233 (mesh is the one
    // tiling, not a dial), so that section is gone too.
    expect(groups.has('Ground')).toBe(false);
    // The sprite-art-sheets `artStyle` select + `artScale` dial share the "Art style" section.
    expect(groups.has('Art style')).toBe(true);
    // the two-lane selection highlight's motion dial gets its own section
    expect(groups.has('Selection')).toBe(true);
    expect(groups.size).toBe(2);
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — the layout picker is RETIRED (ADR-0283 D2)', () => {
  // Rows were already the DEFAULT (ADR-0229, 2026-07-23, amending ADR-0171); what goes here is the
  // ALTERNATIVES. Every growth, arrival and pathway choreography now has exactly one arrangement to
  // be correct against, which is the point — an edge-driven regrow reads down a row layout as a
  // front, and scatters across the plane under stress-majorization placement.
  it('offers no layout control at all', () => {
    expect(controlByKey('layout')).toBeUndefined();
    expect(MANAGED_KEYS).not.toContain('layout');
  });

  it('leaves every former ?layout= value as an ordinary unmanaged param', () => {
    // Not honoured, not normalized, not stripped by reset — just inert, like `?nonsense=1`.
    for (const value of ['stress', 'solar', 'radial', 'stress-majorization', 'dag', 'whatever']) {
      expect(resetControls(`?layout=${value}`)).toBe(`?layout=${value}`);
    }
  });
});

// ADR-0233 retired the `substrate` "Ground tiling" select: mesh is the one and only tiling, no longer a
// dial. The former "substrate control (select)" suite is gone; the schema test above pins `substrate` as
// a RETIRED key. Select-control binding (default removes the param, unrelated params preserved) stays
// covered by the artStyle suite below.

describe('worldSettings — buildShareUrl puts params BEFORE the hash', () => {
  it('orders ?…params before the #/tree hash', () => {
    const url = buildShareUrl('https://x.test/', '?artStyle=daylight', '#/tree');
    expect(url).toBe('https://x.test/?artStyle=daylight#/tree');
  });

  it('omits the ? when there are no params', () => {
    expect(buildShareUrl('https://x.test/', '', '#/tree')).toBe('https://x.test/#/tree');
  });

  it('keeps a focused deep-link hash intact', () => {
    const url = buildShareUrl('https://x.test/', '?artStyle=daylight', '#/tree/some-story');
    expect(url).toBe('https://x.test/?artStyle=daylight#/tree/some-story');
  });
});

describe('worldSettings — resetControls drops every managed param', () => {
  it('returns empty when only managed params were present', () => {
    expect(resetControls('?artStyle=storybook&artScale=1.4&selectionMotion=march')).toBe('');
  });

  it('preserves unmanaged params', () => {
    const out = resetControls('?artStyle=storybook&debug=1');
    expect(out).not.toContain('artStyle');
    expect(out).toContain('debug=1');
  });
});

describe('worldSettings — readRenderScene (scene is now the DEFAULT, ADR-0093 Unit D)', () => {
  it('defaults to the SCENE render when no ?render param is present', () => {
    // The flip: absence => scene (the shared scene-graph is the canonical render now).
    expect(readRenderScene('')).toBe(true);
    expect(readRenderScene('?artStyle=daylight')).toBe(true);
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

// ADR-0231 retired the `veg` gear toggle and `readVegetationVocab`: the vegetation vocabulary
// (ADR-0226) is now PERMANENT studio world art, always composed — there is no dial to bind, so the
// former "vegetation-vocabulary gear TOGGLE" + "readVegetationVocab" suites are gone. The schema test
// above pins `veg` as a RETIRED key so a re-introduction is caught red.

describe('worldSettings — artStyle control (sprite-art-sheets arc, Storybook default)', () => {
  it('defaults to Storybook and writing Storybook REMOVES the param', () => {
    expect(readControlValue('', ctl('artStyle'))).toBe('storybook');
    expect(setControlValue('?artStyle=vector', ctl('artStyle'), 'storybook')).toBe('');
  });

  it('writes Vector as the explicit procedural opt-out', () => {
    expect(setControlValue('', ctl('artStyle'), 'vector')).toBe('?artStyle=vector');
    expect(readControlValue('?artStyle=vector', ctl('artStyle'))).toBe('vector');
  });

  it('writes the two non-default nano-banana sheets when picked, and offers every style in the dropdown', () => {
    for (const name of ['daylight', 'watercolor']) {
      expect(setControlValue('', ctl('artStyle'), name)).toBe(`?artStyle=${name}`);
      expect(readControlValue(`?artStyle=${name}`, ctl('artStyle'))).toBe(name);
    }
    const artStyle = ctl('artStyle');
    if (artStyle.kind !== 'select') throw new Error('artStyle should be a select control');
    const opts = artStyle.options.map((o) => o.value);
    expect(opts).toEqual(['storybook', 'daylight', 'watercolor', 'vector']);
  });

  it('the retired stub / cosy / evening sheets no longer resolve (fall back to vector)', () => {
    for (const gone of ['stub-a', 'stub-b', 'cosy', 'evening']) {
      expect(readControlValue(`?artStyle=${gone}`, ctl('artStyle'))).toBe('vector');
    }
  });

  it('an unknown/typo`d explicit value normalizes to Vector (never a silent broken sheet)', () => {
    expect(readControlValue('?artStyle=stub-z', ctl('artStyle'))).toBe('vector');
    expect(readControlValue('?artStyle=', ctl('artStyle'))).toBe('vector');
  });

  it('preserves UNRELATED params when setting the default', () => {
    const out = setControlValue('?artStyle=vector&debug=1', ctl('artStyle'), 'storybook');
    expect(out).toContain('debug=1');
    expect(out).not.toContain('artStyle');
  });
});

describe('worldSettings — selectionMotion (the two-lane highlight`s motion)', () => {
  const CTL = controlByKey('selectionMotion')!;

  it('defaults to the one-shot draw + pulse, and writes NO param for it', () => {
    expect(readControlValue('', CTL)).toBe('draw');
    expect(readControlValue('?selectionMotion=draw', CTL)).toBe('draw');
    // the default option is the param's ABSENCE, so an untouched world's URL stays clean
    expect(setControlValue('?selectionMotion=march', CTL, 'draw')).toBe('');
  });

  it('reads the looping march and the still state, and round-trips them through the URL', () => {
    expect(readControlValue('?selectionMotion=march', CTL)).toBe('march');
    expect(readControlValue('?selectionMotion=off', CTL)).toBe('off');
    expect(setControlValue('', CTL, 'march')).toBe('?selectionMotion=march');
    expect(setControlValue('', CTL, 'off')).toBe('?selectionMotion=off');
  });

  it('folds the still-spellings together and fails SAFE to the default on anything unknown', () => {
    for (const off of ['off', 'none', 'still']) {
      expect(readControlValue(`?selectionMotion=${off}`, CTL)).toBe('off');
    }
    // a stale or hand-typed value can never leave the map in an undefined motion state
    for (const junk of ['', 'sparkle', 'DRAW', '1']) {
      expect(readControlValue(`?selectionMotion=${junk}`, CTL)).toBe('draw');
    }
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
