// worldSettings is the SINGLE SOURCE OF TRUTH for the user-facing forest-map dials
// (the gear panel at #/tree) — the control schema AND the param↔URL binding. These
// tests pin the binding contract RED-FIRST so the panel and the TreeView readers can
// never drift: a control written to its DEFAULT must REMOVE its param (so the default
// world's URL stays clean / the world stays byte-identical), unrelated params survive,
// clamps mirror the TreeView parser exactly, and the shareable URL puts params BEFORE
// the #hash. Pure string/URL math — no React, no DOM — so the suite runs in node env.
//
// ADR-0073 (roads is the one world): the river/pond dials were RETIRED. The schema is
// now a small road-named set in two groups (Ground / Roads), each with a visible hint.

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

describe('worldSettings — schema (roads world, ADR-0073)', () => {
  it('exposes exactly the road-world dials, each with a key/label/group/kind/default', () => {
    const keys = CONTROLS.map((c) => c.key);
    // The road-world set, grouped (Ground / Roads). A small, intuitive set.
    const expected = ['substrate', 'roadStraighten', 'bundleFar', 'deltaPull', 'riverRepel'];
    for (const k of expected) {
      expect(keys, `missing control ${k}`).toContain(k);
    }
    // The retired river/pond dials must be GONE (genuinely stripped, not shelved).
    for (const gone of [
      'world',
      'deltaCone',
      'deltaConePull',
      'meanderAmp',
      'meanderFreq',
      'riverRepelRadius',
      'riverOpenBias',
      'riverOpenCell',
      'trunkFrac',
      'crescentMinDegree',
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
      // Every control carries a visible plain-English description (rendered as a
      // sub-label under the row, ADR-0073 / owner ask 2026-06-18).
      expect((c.hint ?? '').length, `control ${c.key} needs a hint`).toBeGreaterThan(0);
    }
  });

  it('groups controls under Ground and Roads only', () => {
    const groups = new Set(CONTROLS.map((c) => c.group));
    expect(groups.has('Ground')).toBe(true);
    expect(groups.has('Roads')).toBe(true);
    expect(groups.size).toBe(2);
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — setControlValue (numeric)', () => {
  it('writes a non-default numeric param onto an empty search', () => {
    expect(setControlValue('', ctl('bundleFar'), 500)).toBe('?bundleFar=500');
  });

  it('removes a numeric param when set back to its DEFAULT', () => {
    // bundleFar default is 300 → writing 300 must drop it (clean default URL).
    expect(setControlValue('?bundleFar=500', ctl('bundleFar'), 300)).toBe('');
  });

  it('preserves UNRELATED params when setting a numeric', () => {
    const out = setControlValue('?debug=1', ctl('bundleFar'), 500);
    expect(out).toContain('debug=1');
    expect(out).toContain('bundleFar=500');
  });
});

describe('worldSettings — roadStraighten control', () => {
  it('defaults to DIRT_PATH_STRAIGHTEN (0.28) and removing on default', () => {
    expect(readControlValue('', ctl('roadStraighten'))).toBe(0.28);
    expect(setControlValue('?roadStraighten=0.6', ctl('roadStraighten'), 0.28)).toBe('');
  });

  it('writes a non-default value and clamps to [0,1]', () => {
    expect(setControlValue('', ctl('roadStraighten'), 0.6)).toBe('?roadStraighten=0.6');
    expect(readControlValue('?roadStraighten=5', ctl('roadStraighten'))).toBe(1);
    expect(readControlValue('?roadStraighten=-1', ctl('roadStraighten'))).toBe(0);
  });
});

describe('worldSettings — setControlValue (select)', () => {
  it('substrate: mesh (default) removes the param, others write substrate=<value>', () => {
    expect(setControlValue('?substrate=hex', ctl('substrate'), 'mesh')).toBe('');
    expect(setControlValue('', ctl('substrate'), 'hex')).toBe('?substrate=hex');
    expect(setControlValue('', ctl('substrate'), 'relaxed-quad')).toBe('?substrate=relaxed-quad');
    expect(setControlValue('', ctl('substrate'), 'relaxed-hex')).toBe('?substrate=relaxed-hex');
  });
});

describe('worldSettings — readControlValue clamps mirror the parser', () => {
  it('deltaPull clamps to [0,1] max', () => {
    expect(readControlValue('?deltaPull=5', ctl('deltaPull'))).toBe(1);
  });

  it('riverRepel clamps to its min (>= 0)', () => {
    const v = readControlValue('?riverRepel=-2', ctl('riverRepel'));
    expect(typeof v).toBe('number');
    expect(v as number).toBeGreaterThanOrEqual(0);
  });

  it('an absent param reads the default', () => {
    expect(readControlValue('', ctl('bundleFar'))).toBe(300);
    expect(readControlValue('', ctl('deltaPull'))).toBe(1);
    expect(readControlValue('', ctl('riverRepel'))).toBe(0);
    expect(readControlValue('', ctl('substrate'))).toBe('mesh');
  });

  it('reads a present select', () => {
    expect(readControlValue('?substrate=relaxed-quad', ctl('substrate'))).toBe('relaxed-quad');
  });
});

describe('worldSettings — buildShareUrl puts params BEFORE the hash', () => {
  it('orders ?…params before the #/tree hash', () => {
    const url = buildShareUrl('https://x.test/', '?bundleFar=500', '#/tree');
    expect(url).toBe('https://x.test/?bundleFar=500#/tree');
  });

  it('omits the ? when there are no params', () => {
    expect(buildShareUrl('https://x.test/', '', '#/tree')).toBe('https://x.test/#/tree');
  });

  it('keeps a focused deep-link hash intact', () => {
    const url = buildShareUrl('https://x.test/', '?substrate=hex', '#/tree/some-story');
    expect(url).toBe('https://x.test/?substrate=hex#/tree/some-story');
  });
});

describe('worldSettings — resetControls drops every managed param', () => {
  it('returns empty when only managed params were present', () => {
    expect(resetControls('?bundleFar=500&substrate=hex&deltaPull=0.5')).toBe('');
  });

  it('preserves unmanaged params', () => {
    const out = resetControls('?bundleFar=500&debug=1');
    expect(out).not.toContain('bundleFar');
    expect(out).toContain('debug=1');
  });
});
