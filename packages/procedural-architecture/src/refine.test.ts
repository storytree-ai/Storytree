// refine.test.ts — station 4's loop, quorum, and revert-only/abstain semantics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refine, quorumJudge } from './refine.js';
import type { Artist, LookJudge, LookVerdict } from './refine.js';

// The asset under test is just a number (a stand-in "quality"); render is identity, so
// the judge sees the two numbers directly. This isolates the LOOP's control logic from
// any real geometry — the machinery is the same for any asset type.
type Asset = number;
const identity = (a: Asset): Asset => a;

/** An artist that plays a fixed script of proposed values, then stops (null). */
function scriptedArtist(values: readonly Asset[]): Artist<Asset> {
  return (_current, pass) => {
    const v = values[pass - 1];
    return v === undefined ? null : { asset: v, label: `set ${v}` };
  };
}

/** Fixed-verdict judges. */
const saysAfterWorse: LookJudge<Asset> = () => ({ worse: 'after' });
const saysBeforeWorse: LookJudge<Asset> = () => ({ worse: 'before' });
const abstains: LookJudge<Asset> = () => ({ worse: 'neither' });
/** A judge that condemns the edit only when the number went DOWN. */
const higherIsBetter: LookJudge<Asset> = (before, after): LookVerdict =>
  after < before ? { worse: 'after' } : { worse: 'before' };

test('revert-only: an edit the judge condemns is reverted (asset unchanged)', async () => {
  const r = await refine({ initial: 5, artist: scriptedArtist([10]), render: identity, judge: saysAfterWorse });
  assert.equal(r.asset, 5, 'the condemned edit must be discarded');
  assert.equal(r.decisions.length, 1);
  assert.equal(r.decisions[0]?.kept, false);
});

test('an edit the judge prefers is kept', async () => {
  const r = await refine({ initial: 5, artist: scriptedArtist([10]), render: identity, judge: saysBeforeWorse });
  assert.equal(r.asset, 10, 'a preferred edit must be applied');
  assert.equal(r.decisions[0]?.kept, true);
});

test('abstain (neither) KEEPS the edit — revert-only never throws away on "can\'t tell"', async () => {
  const r = await refine({ initial: 5, artist: scriptedArtist([10]), render: identity, judge: abstains });
  assert.equal(r.asset, 10, 'abstain must not trigger a revert');
  assert.equal(r.decisions[0]?.kept, true);
});

test('a mixed sequence keeps only the edits the judge does not condemn', async () => {
  // 0 -> 10 (up, kept) -> 3 (down, reverted, stays 10) -> 20 (up, kept)
  const r = await refine({ initial: 0, artist: scriptedArtist([10, 3, 20]), render: identity, judge: higherIsBetter });
  assert.equal(r.asset, 20);
  assert.deepEqual(r.decisions.map((d) => d.kept), [true, false, true]);
  assert.equal(r.passes, 3);
});

test('bounded: an artist that never stops runs exactly maxPasses (default 3)', async () => {
  const everProposing: Artist<Asset> = (c) => ({ asset: c + 1 });
  const r = await refine({ initial: 0, artist: everProposing, render: identity, judge: abstains });
  assert.equal(r.passes, 3, 'default bound is 3 passes');
  assert.equal(r.asset, 3);
});

test('bounded: maxPasses is honoured when set', async () => {
  const everProposing: Artist<Asset> = (c) => ({ asset: c + 1 });
  const r = await refine({ initial: 0, artist: everProposing, render: identity, judge: abstains, maxPasses: 5 });
  assert.equal(r.passes, 5);
});

test('the artist stops the loop early by returning null', async () => {
  const r = await refine({ initial: 0, artist: scriptedArtist([10]), render: identity, judge: saysBeforeWorse, maxPasses: 3 });
  assert.equal(r.passes, 1, 'only one pass ran before the artist was satisfied');
});

test('quorum: a lone dissenting judge does NOT force a revert (the false-revert guard)', async () => {
  const q = quorumJudge([saysAfterWorse, abstains, abstains]); // default threshold = 2 of 3
  const v = await q(1, 2);
  assert.equal(v.worse, 'neither', '1/3 calling the edit worse is below the 2-of-3 quorum');
  const r = await refine({ initial: 5, artist: scriptedArtist([10]), render: identity, judge: q });
  assert.equal(r.asset, 10, 'below-quorum condemnation keeps the edit');
});

test('quorum: a majority calling the edit worse DOES revert', async () => {
  const q = quorumJudge([saysAfterWorse, saysAfterWorse, abstains]);
  const v = await q(1, 2);
  assert.equal(v.worse, 'after', '2/3 meets the 2-of-3 quorum');
  const r = await refine({ initial: 5, artist: scriptedArtist([10]), render: identity, judge: q });
  assert.equal(r.asset, 5, 'quorum condemnation reverts the edit');
});

test('quorum: an explicit threshold is respected', async () => {
  const unanimous = quorumJudge([saysAfterWorse, saysAfterWorse, abstains], 3);
  assert.equal((await unanimous(1, 2)).worse, 'neither', '2/3 is below a threshold of 3');
  const any = quorumJudge([saysAfterWorse, abstains, abstains], 1);
  assert.equal((await any(1, 2)).worse, 'after', '1/3 meets a threshold of 1');
});

test('quorum: rejects an empty panel or an out-of-range threshold', () => {
  assert.throws(() => quorumJudge([]), /at least one judge/);
  assert.throws(() => quorumJudge([abstains, abstains], 3), /out of range/);
  assert.throws(() => quorumJudge([abstains], 0), /out of range/);
});

test('quorum counts only "after" votes — a judge naming the BEFORE worse never reverts', async () => {
  const q = quorumJudge([saysBeforeWorse, saysBeforeWorse, saysBeforeWorse]);
  assert.equal((await q(1, 2)).worse, 'neither', 'no "after" votes → never a revert, whatever the panel says about the before');
});
