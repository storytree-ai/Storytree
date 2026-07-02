// act2-director.test.ts — Act 2 beat director: pure, visitor-paced choreography.
//
// This is an INTEGRATION test: it walks the REAL default five-beat script through
// the REAL advance() state machine, verifying the contractual properties the node
// spec mandates. Per ADR-0122 each declared contract id LEADS a distinctly-named
// test so `storytree coverage act2-beat-director` reports full coverage:
//
//   • abd-advance-is-visitor-paced-and-deterministic — advance() moves exactly
//     one beat per call, two walks of the same script are deep-equal, state never
//     changes without a call, and past-done advances are parking no-ops.
//   • abd-green-only-on-signed-proof — a limb renders green only when its delta
//     carries the signed-proof marker; a green-without-marker delta is refused
//     loudly (the verification-gap answer, enforced at runtime, not a type hint).
//   • abd-wrong-way-road-is-flagged-from-data — the beat-4 UI→DB road is flagged
//     as an antipattern because its data declares the layer violation, distinct
//     from every well-directed road.
//   • abd-default-script-is-the-five-approved-beats — the exported default script
//     validates against the exported `BeatScript` zod contract (the same contract
//     the site parses its beat copy against), is exactly the five approved
//     research-table beats in order, and walks end-to-end to the CTA state.
//
// WHY THIS IS ONE ORGANISM: the beat contract (zod BeatDelta), the advance()
// state machine, and the five-beat default script are inseparable. The tests
// therefore walk the REAL script through the REAL machine — not an isolated
// single-assertion stub.
//
// The import from './act2-director.js' was the RED anchor: the module did not
// exist at HEAD, so every test failed with "Cannot find module" — the right-kind
// red (missing implementation, not a syntax error in the test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Named exports: the pure advance() function, the zero DirectorState, the five-beat
// default script, the zod contracts, and the inferred types. The default export is
// the same script object as `defaultScript` (pinned below).
import act2Script, {
  advance,
  initialState,
  defaultScript,
  BeatScript,
  type Beat,
  type BeatDelta,
  type LimbDelta,
  type RoadDelta,
  type DirectorState,
} from './act2-director.js';

// ---------------------------------------------------------------------------
// abd-advance-is-visitor-paced-and-deterministic
// ---------------------------------------------------------------------------

test('abd-advance-is-visitor-paced-and-deterministic: one tap = one beat, two walks deep-equal, no mutation, past-done parks', () => {
  // One beat per call: beatIndex increments by exactly 1, done only on the fifth.
  let state: DirectorState = initialState;
  const walk1: DirectorState[] = [];
  for (let i = 0; i < 5; i++) {
    const prevIndex = state.beatIndex;
    state = advance(state, defaultScript);
    walk1.push(state);
    assert.equal(
      state.beatIndex,
      prevIndex + 1,
      `step ${i + 1}: beatIndex increments by exactly 1 (visitor tap = one beat)`,
    );
    assert.equal(state.done, i === 4, `step ${i + 1}: done is ${i === 4}`);
  }

  // Deterministic: a second walk of the same script is deep-equal state-for-state.
  let state2: DirectorState = initialState;
  const walk2: DirectorState[] = [];
  for (let i = 0; i < 5; i++) {
    state2 = advance(state2, defaultScript);
    walk2.push(state2);
  }
  assert.deepEqual(walk2, walk1, 'two walks of the same script are deep-equal (no RNG, no timers)');

  // State never changes without a call: advance() does not mutate its input.
  const s: DirectorState = { ...initialState };
  const indexBefore = s.beatIndex;
  const doneBefore = s.done;
  advance(s, defaultScript);
  assert.equal(s.beatIndex, indexBefore, 'advance does not mutate input.beatIndex');
  assert.equal(s.done, doneBefore, 'advance does not mutate input.done');

  // Past-done advances are parking no-ops: the CTA state is returned unchanged.
  const parked = advance(state, defaultScript);
  assert.equal(parked, state, 'advance past done returns the SAME state object (a true no-op)');
  assert.equal(parked.done, true, 'still done after advancing past the end');
  assert.equal(
    parked.beatIndex,
    state.beatIndex,
    'beatIndex does not increase past done — the state is parked on the CTA',
  );
});

// ---------------------------------------------------------------------------
// abd-green-only-on-signed-proof
// ---------------------------------------------------------------------------

test('abd-green-only-on-signed-proof: green limbs carry the marker; a green-without-marker delta is refused loudly', () => {
  const beat3 = defaultScript[2]!;
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

  // Beat 3 MUST also show the verification gap: at least one limb is still not
  // proven, and no unproven limb wears the marker.
  const notGreen = delta.limbs.filter((l: LimbDelta) => !l.green);
  assert.ok(
    notGreen.length > 0,
    'beat 3 must have at least one non-green limb (in-progress or proposed) to show the gap',
  );
  for (const limb of notGreen) {
    assert.ok(
      limb.signedProof == null || limb.signedProof.length === 0,
      `non-green limb '${limb.id}' must NOT carry a signedProof marker`,
    );
  }

  // THE REFUSAL: a mutated script whose beat-3 delta claims green WITHOUT the
  // marker is refused by the director — a faked "done" cannot colour the tree
  // even in fiction. (The type allows it; the RUNTIME contract refuses it.)
  const mutated: Beat[] = defaultScript.map((b, i) =>
    i === 2
      ? {
          ...b,
          delta: {
            kind: 'branch-caps' as const,
            limbs: [{ id: 'cap-faked-done', label: 'Faked done', green: true }],
          },
        }
      : b,
  );
  let toBeat3: DirectorState = initialState;
  toBeat3 = advance(toBeat3, mutated); // beat 1
  toBeat3 = advance(toBeat3, mutated); // beat 2
  assert.throws(
    () => advance(toBeat3, mutated),
    'the director refuses a green-without-marker delta (contract violation)',
  );

  // The exported contract itself refuses the same script — the site's build-time
  // parse catches a faked green before it ever reaches a canvas.
  assert.equal(
    BeatScript.safeParse(mutated).success,
    false,
    'BeatScript.safeParse refuses a script whose green limb lacks the signedProof marker',
  );
});

// ---------------------------------------------------------------------------
// abd-wrong-way-road-is-flagged-from-data
// ---------------------------------------------------------------------------

test('abd-wrong-way-road-is-flagged-from-data: exactly one road declares the layer violation, and it is the UI→DB skip', () => {
  const beat4 = defaultScript[3]!;
  assert.equal(beat4.delta.kind, 'add-roads', 'beat 4 delta is add-roads');

  const delta = beat4.delta as Extract<BeatDelta, { kind: 'add-roads' }>;
  assert.ok(Array.isArray(delta.roads), 'add-roads delta has a roads array');

  // At least 2 roads: the valid DAG dependency road(s) + the wrong-way antipattern
  assert.ok(
    delta.roads.length >= 2,
    'beat 4 has at least 2 roads (DAG road + the wrong-way UI→DB antipattern)',
  );

  // Exactly one road carries a declared violation — the antipattern is flagged
  // FROM ITS DATA (a declared layer violation), distinct from every well-directed road.
  const violations = delta.roads.filter(
    (r: RoadDelta) => r.violation != null && r.violation.length > 0,
  );
  assert.equal(violations.length, 1, 'exactly one road is flagged as a declared layer violation');

  const v = violations[0]!;
  assert.ok(
    typeof v.violation === 'string' && v.violation.length > 0,
    'the violation label is a non-empty string (the antipattern name, not a presentation hint)',
  );
  // The flagged road IS the wrong-way UI→DB road skipping the service layer.
  assert.equal(v.from, 'ui', 'the flagged road starts at the UI');
  assert.equal(v.to, 'db', 'the flagged road ends at the DB (skipping the service layer)');
});

// ---------------------------------------------------------------------------
// abd-default-script-is-the-five-approved-beats
// ---------------------------------------------------------------------------

test('abd-default-script-is-the-five-approved-beats: validates against BeatScript and walks end-to-end to the CTA', () => {
  // The exported default script validates against the exported zod contract —
  // the SAME contract the site parses its beat copy against at build time.
  const parsed = BeatScript.safeParse(defaultScript);
  assert.equal(parsed.success, true, 'defaultScript validates against the BeatScript contract');

  // The default export IS the default script (both surfaces stay pinned together).
  assert.equal(act2Script, defaultScript, 'the default export is the defaultScript');

  // Exactly the five approved research-table beats, in order:
  //   1. plant-story  — a seed grows into a tree with its OUTCOME on a label
  //   2. attach-wisp  — a soft wisp drifts over the tree
  //   3. branch-caps  — capability limbs; green only on a signed passing proof
  //   4. add-roads    — DAG roads; one road flagged as a declared layer violation
  //   5. pull-back    — camera widens to the full legible forest → done: true (CTA)
  assert.equal(defaultScript.length, 5, 'exactly 5 beats in the default script');
  const expectedKinds: BeatDelta['kind'][] = [
    'plant-story',
    'attach-wisp',
    'branch-caps',
    'add-roads',
    'pull-back',
  ];
  const actualKinds = defaultScript.map((b: Beat) => b.delta.kind);
  assert.deepEqual(actualKinds, expectedKinds, 'delta kinds match the five approved beats in order');

  // All beat ids are unique — the site keys its narration copy by beat id.
  const ids = defaultScript.map((b: Beat) => b.id);
  assert.equal(new Set(ids).size, 5, 'all beat ids are unique');

  // End-to-end integration walk: the full five-beat walk produces the CTA end-state.
  let state: DirectorState = initialState;
  const beatIndexSeq: number[] = [];
  const doneSeq: boolean[] = [];
  for (const beat of defaultScript) {
    state = advance(state, defaultScript);
    beatIndexSeq.push(state.beatIndex);
    doneSeq.push(state.done);
    // Camera must follow each beat's declared target at every step
    assert.deepEqual(state.camera, beat.camera, `camera follows beat '${beat.id}'`);
  }
  assert.deepEqual(
    beatIndexSeq,
    [1, 2, 3, 4, 5],
    'beatIndex increments 1→5 across the five approved beats',
  );
  assert.deepEqual(
    doneSeq,
    [false, false, false, false, true],
    'done is true only after the fifth beat (the pull-back / CTA)',
  );
  assert.equal(state.done, true, 'terminal state: done is true');
  assert.equal(state.beatIndex, 5, 'terminal state: beatIndex is 5');
  // Camera is parked on the pull-back (the whole legible forest)
  assert.deepEqual(
    state.camera,
    defaultScript[4]!.camera,
    'terminal camera = beat 5 camera (pull-back to the full forest)',
  );
});

// ---------------------------------------------------------------------------
// Auxiliary: the zero state
// ---------------------------------------------------------------------------

test('act2-initial-state: beatIndex is 0, done is false, world and camera are non-null', () => {
  assert.equal(initialState.beatIndex, 0, 'initial beatIndex is 0 (no beats applied yet)');
  assert.equal(initialState.done, false, 'initial done is false');
  assert.ok(initialState.world != null, 'initial world is non-null');
  assert.ok(initialState.camera != null, 'initial camera is non-null');
});
