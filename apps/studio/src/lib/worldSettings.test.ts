// worldSettings is the SINGLE SOURCE OF TRUTH for the user-facing forest-map dials
// (the gear panel at #/tree) — the control schema AND the param↔URL binding. These
// tests pin the binding contract RED-FIRST so the panel and the TreeView readers can
// never drift: a control written to its DEFAULT must REMOVE its param (so the default
// world's URL stays clean / the world stays byte-identical), unrelated params survive,
// clamps mirror the TreeView parser exactly, and the shareable URL puts params BEFORE
// the #hash. Pure string/URL math — no React, no DOM — so the suite runs in node env.

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

describe('worldSettings — schema', () => {
  it('exposes the owner-listed dials, each with a key/label/group/kind/default', () => {
    const keys = CONTROLS.map((c) => c.key);
    // The owner's listed set, grouped (World / Pathway routing / Spread / Coast & ponds).
    for (const k of [
      'world',
      'substrate',
      'bundleFar',
      'deltaCone',
      'deltaConePull',
      'deltaPull',
      'meanderAmp',
      'meanderFreq',
      'riverRepel',
      'riverRepelRadius',
      'riverOpenBias',
      'riverOpenCell',
      'trunkFrac',
      'crescentMinDegree',
      'pondMouth',
      'weld',
    ]) {
      expect(keys, `missing control ${k}`).toContain(k);
    }
    for (const c of CONTROLS) {
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.group.length).toBeGreaterThan(0);
      expect(['number', 'toggle', 'select']).toContain(c.kind);
    }
  });

  it('keys are unique', () => {
    const keys = CONTROLS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('worldSettings — setControlValue (numeric)', () => {
  it('writes a non-default numeric param onto an empty search', () => {
    expect(setControlValue('', ctl('deltaCone'), 7)).toBe('?deltaCone=7');
  });

  it('removes a numeric param when set back to its DEFAULT', () => {
    // deltaCone default is 0 → writing 0 must drop it (clean default URL).
    expect(setControlValue('?deltaCone=7', ctl('deltaCone'), 0)).toBe('');
  });

  it('preserves UNRELATED params when setting a numeric', () => {
    const out = setControlValue('?world=roads', ctl('deltaCone'), 7);
    expect(out).toContain('world=roads');
    expect(out).toContain('deltaCone=7');
  });
});

describe('worldSettings — setControlValue (toggle)', () => {
  it('weld defaults ON → turning OFF writes weld=off', () => {
    // From a clean default URL, turning weld OFF means value=false.
    expect(setControlValue('', ctl('weld'), false)).toBe('?weld=off');
  });

  it('weld back ON removes the param (default is ON)', () => {
    expect(setControlValue('?weld=off', ctl('weld'), true)).toBe('');
  });

  it('pondMouth defaults ON → OFF writes pondMouth=off, ON removes it', () => {
    expect(setControlValue('', ctl('pondMouth'), false)).toBe('?pondMouth=off');
    expect(setControlValue('?pondMouth=off', ctl('pondMouth'), true)).toBe('');
  });
});

describe('worldSettings — setControlValue (select)', () => {
  it('world: roads writes world=roads, water (default) removes it', () => {
    expect(setControlValue('', ctl('world'), 'roads')).toBe('?world=roads');
    expect(setControlValue('?world=roads', ctl('world'), 'water')).toBe('');
  });

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

  it('riverRepelRadius clamps to its min (>= 1)', () => {
    const v = readControlValue('?riverRepelRadius=0', ctl('riverRepelRadius'));
    expect(typeof v).toBe('number');
    expect(v as number).toBeGreaterThanOrEqual(1);
  });

  it('deltaCone clamps to [0,360] max', () => {
    expect(readControlValue('?deltaCone=999', ctl('deltaCone'))).toBe(360);
  });

  it('an absent param reads the default', () => {
    expect(readControlValue('', ctl('deltaCone'))).toBe(0);
    expect(readControlValue('', ctl('deltaPull'))).toBe(1);
    expect(readControlValue('', ctl('weld'))).toBe(true);
    expect(readControlValue('', ctl('pondMouth'))).toBe(true);
    expect(readControlValue('', ctl('world'))).toBe('water');
    expect(readControlValue('', ctl('substrate'))).toBe('mesh');
  });

  it('reads a present toggle as OFF', () => {
    expect(readControlValue('?weld=off', ctl('weld'))).toBe(false);
    expect(readControlValue('?pondMouth=off', ctl('pondMouth'))).toBe(false);
  });

  it('reads a present select', () => {
    expect(readControlValue('?world=roads', ctl('world'))).toBe('roads');
    expect(readControlValue('?substrate=relaxed-quad', ctl('substrate'))).toBe('relaxed-quad');
  });
});

describe('worldSettings — buildShareUrl puts params BEFORE the hash', () => {
  it('orders ?…params before the #/tree hash', () => {
    const url = buildShareUrl('https://x.test/', '?deltaCone=7', '#/tree');
    expect(url).toBe('https://x.test/?deltaCone=7#/tree');
  });

  it('omits the ? when there are no params', () => {
    expect(buildShareUrl('https://x.test/', '', '#/tree')).toBe('https://x.test/#/tree');
  });

  it('keeps a focused deep-link hash intact', () => {
    const url = buildShareUrl('https://x.test/', '?world=roads', '#/tree/some-story');
    expect(url).toBe('https://x.test/?world=roads#/tree/some-story');
  });
});

describe('worldSettings — resetControls drops every managed param', () => {
  it('returns empty when only managed params were present', () => {
    expect(resetControls('?deltaCone=7&world=roads&weld=off')).toBe('');
  });

  it('preserves unmanaged params', () => {
    const out = resetControls('?deltaCone=7&debug=1');
    expect(out).not.toContain('deltaCone');
    expect(out).toContain('debug=1');
  });
});
