// act2Intro — the Act 2 intro's query GATE and the app-owned transport arithmetic (ADR-0282 D6).
//
// The gate half matters as much as the feature: this control mounts on the REAL map, so an
// over-eager reader would change the clean Studio route for every visitor. `?act2=intro` is an
// EXACT match; absence, an empty value and every near miss fall through untouched.

import { describe, it, expect } from 'vitest';
import { backProgress, readAct2Intro, waveAtProgress, waveStartProgress } from './act2Intro.js';
import { deriveForestRegrowPlan, type ForestRegrowStory } from '@storytree/app-surface';

describe('readAct2Intro', () => {
  it('mounts on the one exact value', () => {
    expect(readAct2Intro('?act2=intro')).toBe(true);
    expect(readAct2Intro('?foo=1&act2=intro&bar=2')).toBe(true);
  });

  it('leaves the clean route alone for absence, empty, and every near miss', () => {
    for (const search of [
      '',
      '?',
      '?act2=',
      '?act2',
      '?act2=on',
      '?act2=1',
      '?act2=true',
      '?act2=intro-x',
      '?act2=Intro',
      '?act2=INTRO',
      '?act2= intro',
      '?act3=intro',
      // a sibling witness gate's value must not turn this one on either. (Deliberately NOT
      // spelling the round-3 lab's value here: TreeViewShell audits that string's every mention
      // to prove that lab has no permanent navigation entry, and a test file is not an entry.)
      '?semanticGrowth=demo',
      '?organicGrowth=organic-island-accretion',
    ]) {
      expect(readAct2Intro(search), `"${search}" must fall through`).toBe(false);
    }
  });
});

const GRAPH: readonly ForestRegrowStory[] = [
  { id: 'a', dependsOn: [] },
  { id: 'b', dependsOn: [] },
  { id: 'c', dependsOn: ['a'] },
  { id: 'd', dependsOn: ['c'] },
];

const plan = deriveForestRegrowPlan(GRAPH);

describe('the wave transport', () => {
  it('reads the cursor back to the wave it is in', () => {
    expect(waveAtProgress(plan, 0)).toBe(0);
    expect(waveAtProgress(plan, waveStartProgress(plan, 1) + 1e-6)).toBe(1);
    expect(waveAtProgress(plan, waveStartProgress(plan, 2) + 1e-6)).toBe(2);
    expect(waveAtProgress(plan, 1)).toBe(plan.waveCount - 1);
  });

  it('takes Back to the top of the current wave before stepping to the previous one', () => {
    const secondWave = waveStartProgress(plan, 1);
    // partway INTO wave 1 ⇒ back to the top of wave 1
    expect(backProgress(plan, secondWave + 0.02)).toBeCloseTo(secondWave, 9);
    // already at the top of wave 1 ⇒ back to the top of wave 0
    expect(backProgress(plan, secondWave)).toBeCloseTo(waveStartProgress(plan, 0), 9);
  });

  it('never steps Back past nothing', () => {
    expect(backProgress(plan, 0)).toBe(0);
    expect(backProgress(plan, waveStartProgress(plan, 0))).toBe(0);
  });

  it('walks the whole forest back to nothing in a bounded number of steps', () => {
    let at = 1;
    for (let step = 0; step < plan.waveCount + 2 && at > 0; step += 1) {
      const next = backProgress(plan, at);
      expect(next, 'Back must make progress').toBeLessThan(at);
      at = next;
    }
    expect(at).toBe(0);
  });
});
