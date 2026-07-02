// act2-director.test.ts — Act 2 beat director: pure, visitor-paced choreography.
//
// This is an INTEGRATION test: it walks the REAL default five-beat script through
// the REAL advance() state machine, verifying the contractual properties the node
// spec mandates:
//
//   • visitor-paced: advance() moves exactly one beat per call and parks on the
//     final CTA state — the deliberate inverse of Act 1's all-at-once.
//   • beat 3 green capability limbs carry the signed-proof marker — a limb that
//     lacks the marker cannot be coloured green (the verification-gap answer).
//   • beat 4 wrong-way UI→DB road carries a declared layer-violation flag
//     FROM ITS DATA — the antipattern is flagged in the delta, not as a
//     presentation hint added by the canvas.
//   • the exported default script IS the five approved research-table beats,
//     in sequence, walking end-to-end through the full state machine.
//
// WHY THIS IS ONE ORGANISM: the beat contract (typed BeatDelta), the advance()
// state machine, and the five-beat default script are inseparable. The test
// therefore walks the REAL script through the REAL machine — not an isolated
// single-assertion stub.
//
// The import from './act2-director.js' is the RED anchor: the module does not
// exist yet. Every test fails with "Cannot find module" — the right-kind red
// (missing implementation, not a syntax error in the test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Default export: the five-beat Beat[] script.
// Named exports: the pure advance() function, the zero DirectorState, and types.
import act2Script, {
  advance,
  initialState,
  type Beat,
  type BeatDelta,
  type LimbDelta,
  type RoadDelta,
  type DirectorState,
} from './act2-director.js';

// ---------------------------------------------------------------------------
// THE FIVE-BEAT DEFAULT SCRIPT
// ---------------------------------------------------------------------------

test('act2-default-script: default export is an array of exactly 5 beats', () => {
  assert.ok(Array.isArray(act2Script), 'default export is an array');
  assert.equal(act2Script.length, 5, 'exactly 5 beats in the default script');
});

test('act2-default-script: all 5 beats carry id, narrationKey, camera, and delta', () => {
  for (const [i, beat] of act2Script.entries()) {
    assert.equal(typeof beat.id, 'string', `beat[${i}] id is a string`);
    assert.ok(beat.id.length > 0, `beat[${i}] id is non-empty`);
    assert.equal(typeof beat.narrationKey, 'string', `beat[${i}] narrationKey is a string`);
    assert.ok(beat.narrationKey.length > 0, `beat[${i}] narrationKey is non-empty`);
    assert.ok(beat.camera != null, `beat[${i}] camera is present`);
    assert.ok(beat.delta != null, `beat[${i}] delta is present`);
  }
  // All ids must be unique — each beat is distinct
  const ids = act2Script.map((b: Beat) => b.id);
  assert.equal(new Set(ids).size, 5, 'all beat ids are unique');
});

test('act2-default-script: delta kinds follow the five approved research-table beats in order', () => {
  // The five approved beats in sequence (verbatim in spirit, per node spec):
  //   1. plant-story  — a seed grows into a tree with its OUTCOME on a label
  //   2. attach-wisp  — a soft wisp drifts over the tree
  //   3. branch-caps  — capability limbs; green only on a signed passing proof
  //   4. add-roads    — DAG roads; one road flagged as a declared layer violation
  //   5. pull-back    — camera widens to the full legible forest → done: true (CTA)
  const expectedKinds: BeatDelta['kind'][] = [
    'plant-story',
    'attach-wisp',
    'branch-caps',
    'add-roads',
    'pull-back',
  ];
  const actualKinds = act2Script.map((b: Beat) => b.delta.kind);
  assert.deepEqual(actualKinds, expectedKinds, 'delta kinds match the five approved beats in order');
});

// ---------------------------------------------------------------------------
// VISITOR-PACED STATE MACHINE
// ---------------------------------------------------------------------------

test('act2-initial-state: beatIndex is 0, done is false, world and camera are non-null', () => {
  assert.equal(initialState.beatIndex, 0, 'initial beatIndex is 0 (no beats applied yet)');
  assert.equal(initialState.done, false, 'initial done is false');
  assert.ok(initialState.world != null, 'initial world is non-null');
  assert.ok(initialState.camera != null, 'initial camera is non-null');
});

test('act2-advance: visitor-paced — moves exactly one beat per call, never more', () => {
  let state: DirectorState = initialState;
  for (let i = 0; i < 5; i++) {
    const prevIndex = state.beatIndex;
    state = advance(state, act2Script);
    assert.equal(
      state.beatIndex,
      prevIndex + 1,
      `step ${i + 1}: beatIndex increments by exactly 1 (visitor tap = one beat)`,
    );
    assert.equal(state.done, i === 4, `step ${i + 1}: done is ${i === 4}`);
  }
});

test('act2-advance: camera follows each beat\'s declared camera target', () => {
  let state: DirectorState = initialState;
  for (const beat of act2Script) {
    state = advance(state, act2Script);
    assert.deepEqual(
      state.camera,
      beat.camera,
      `after beat '${beat.id}': state.camera reflects beat.camera`,
    );
  }
});

test('act2-advance: pure function — does not mutate the input DirectorState', () => {
  // Spread to get a fresh object (protects against Object.freeze false negatives)
  const s: DirectorState = { ...initialState };
  const indexBefore = s.beatIndex;
  const doneBefore = s.done;
  advance(s, act2Script);
  assert.equal(s.beatIndex, indexBefore, 'advance does not mutate input.beatIndex');
  assert.equal(s.done, doneBefore, 'advance does not mutate input.done');
});

test('act2-advance: parks on the final CTA state — advance past done is a no-op', () => {
  // Walk all 5 beats to reach done
  let state: DirectorState = initialState;
  for (let i = 0; i < 5; i++) state = advance(state, act2Script);
  assert.equal(state.done, true, 'done after walking all 5 beats');
  const finalIndex = state.beatIndex;

  // Call advance again — must return the same CTA state, not advance further
  const parked = advance(state, act2Script);
  assert.equal(parked.done, true, 'still done after advancing past the end');
  assert.equal(
    parked.beatIndex,
    finalIndex,
    'beatIndex does not increase past done — the state is parked on the CTA',
  );
});

// ---------------------------------------------------------------------------
// BEAT 3: SIGNED-PROOF MARKER — no proof, no green
// ---------------------------------------------------------------------------

test('act2-beat3: green capability limbs carry the signed-proof marker — no proof, no green', () => {
  const beat3 = act2Script[2]!;
  assert.equal(beat3.delta.kind, 'branch-caps', 'beat 3 delta is branch-caps');

  // Narrow to the branch-caps variant (Extract is safe: BeatDelta is a discriminated union)
  const delta = beat3.delta as Extract<BeatDelta, { kind: 'branch-caps' }>;
  assert.ok(Array.isArray(delta.limbs), 'branch-caps delta has a limbs array');
  assert.ok(delta.limbs.length > 0, 'at least one capability limb in beat 3');

  // Every green limb MUST carry the signed-proof marker
  const greenLimbs = delta.limbs.filter((l: LimbDelta) => l.green);
  assert.ok(greenLimbs.length > 0, 'beat 3 has at least one green (proven) limb');
  for (const limb of greenLimbs) {
    assert.ok(
      typeof limb.signedProof === 'string' && limb.signedProof.length > 0,
      `green limb '${limb.id}' must carry a non-empty signedProof marker (the proof IS the proof)`,
    );
  }
});

test('act2-beat3: non-green limbs do NOT carry the signed-proof marker — demonstrates the verification gap', () => {
  const beat3 = act2Script[2]!;
  const delta = beat3.delta as Extract<BeatDelta, { kind: 'branch-caps' }>;

  // Beat 3 MUST show the verification gap: at least one limb is still not proven
  const notGreen = delta.limbs.filter((l: LimbDelta) => !l.green);
  assert.ok(
    notGreen.length > 0,
    'beat 3 must have at least one non-green limb (in-progress or proposed) to show the gap',
  );
  for (const limb of notGreen) {
    // A "done"-without-proof delta cannot colour a limb green — no marker on the unproven
    assert.ok(
      limb.signedProof == null || limb.signedProof.length === 0,
      `non-green limb '${limb.id}' must NOT carry a signedProof marker`,
    );
  }
});

// ---------------------------------------------------------------------------
// BEAT 4: DECLARED LAYER VIOLATION — antipattern flagged from the data
// ---------------------------------------------------------------------------

test('act2-beat4: the wrong-way UI→DB road is flagged with a declared layer-violation in its delta', () => {
  const beat4 = act2Script[3]!;
  assert.equal(beat4.delta.kind, 'add-roads', 'beat 4 delta is add-roads');

  const delta = beat4.delta as Extract<BeatDelta, { kind: 'add-roads' }>;
  assert.ok(Array.isArray(delta.roads), 'add-roads delta has a roads array');

  // At least 2 roads: the valid DAG dependency road(s) + the wrong-way antipattern
  assert.ok(
    delta.roads.length >= 2,
    'beat 4 has at least 2 roads (DAG road + the wrong-way UI→DB antipattern)',
  );

  // Exactly one road must carry a declared violation — the antipattern is flagged FROM ITS DATA
  const violations = delta.roads.filter(
    (r: RoadDelta) => r.violation != null && r.violation.length > 0,
  );
  assert.equal(violations.length, 1, 'exactly one road is flagged as a declared layer violation');

  const v = violations[0]!;
  assert.ok(
    typeof v.violation === 'string' && v.violation.length > 0,
    'the violation label is a non-empty string (the antipattern name, not a presentation hint)',
  );
});

// ---------------------------------------------------------------------------
// END-TO-END INTEGRATION WALK
// ---------------------------------------------------------------------------

test('act2-director: full five-beat walk — produces the declared CTA end-state', () => {
  let state: DirectorState = initialState;

  const beatIndexSeq: number[] = [];
  const doneSeq: boolean[] = [];

  for (const beat of act2Script) {
    state = advance(state, act2Script);
    beatIndexSeq.push(state.beatIndex);
    doneSeq.push(state.done);
    // Camera must follow each beat's declared target at every step
    assert.deepEqual(
      state.camera,
      beat.camera,
      `camera follows beat '${beat.id}'`,
    );
  }

  // beatIndex increments 1 → 5 across the five beats
  assert.deepEqual(
    beatIndexSeq,
    [1, 2, 3, 4, 5],
    'beatIndex increments 1→5 across the five approved beats',
  );

  // done is false for all beats except the fifth (the CTA state)
  assert.deepEqual(
    doneSeq,
    [false, false, false, false, true],
    'done is true only after the fifth beat (the pull-back / CTA)',
  );

  // The terminal state IS the CTA state
  assert.equal(state.done, true, 'terminal state: done is true');
  assert.equal(state.beatIndex, 5, 'terminal state: beatIndex is 5');
  // Camera is parked on the pull-back (the whole legible forest)
  assert.deepEqual(
    state.camera,
    act2Script[4]!.camera,
    'terminal camera = beat 5 camera (pull-back to the full forest)',
  );
});
