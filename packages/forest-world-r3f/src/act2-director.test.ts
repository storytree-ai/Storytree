// act2-director.test.ts — Act 2 beat director: pure, visitor-paced choreography.
//
// This is an INTEGRATION test: it walks the REAL default seven-beat script through
// the REAL advance() state machine, verifying the contractual properties the node
// spec mandates (ADR-0147). Per ADR-0122 each declared contract id LEADS a
// distinctly-named test so `storytree coverage act2-beat-director` reports full coverage:
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
//   • abd-default-script-is-the-seven-approved-beats — the exported default script
//     validates against the exported `BeatScript` zod contract (the same contract
//     the site parses its beat copy against), is exactly the seven approved
//     research-table beats in order (ADR-0147: beat-5-grow-forest + beat-6-connect-
//     stories added; pull-back renumbered to beat-7-pull-back), and walks end-to-end
//     to the CTA state.
//   • abd-world-holds-multiple-stories — WorldState.stories is an array of per-story
//     nodes each carrying a tri-state status (proven / building / broken);
//     plant-story seeds stories[0]; grow-forest (beat 5) raises sibling stories with
//     a genuinely mixed status so the pull-back legend is HONEST (the latent
//     over-claim ADR-0147 fixes).
//
// WHY THIS IS ONE ORGANISM: the beat contract (zod BeatDelta), the advance()
// state machine, and the seven-beat default script are inseparable. The tests
// therefore walk the REAL script through the REAL machine — not an isolated
// single-assertion stub.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Named exports: the pure advance() function, the zero DirectorState, the
// default script, the zod contracts, and the inferred types. The default export
// is the same script object as `defaultScript` (pinned below).
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
  // Mechanics test: script-length-agnostic (works with 5 or 7 beats).
  // The COUNT is pinned separately in abd-default-script-is-the-seven-approved-beats.
  const BEATS = defaultScript.length;

  // One beat per call: beatIndex increments by exactly 1, done only on the last beat.
  let state: DirectorState = initialState;
  const walk1: DirectorState[] = [];
  for (let i = 0; i < BEATS; i++) {
    const prevIndex = state.beatIndex;
    state = advance(state, defaultScript);
    walk1.push(state);
    assert.equal(
      state.beatIndex,
      prevIndex + 1,
      `step ${i + 1}: beatIndex increments by exactly 1 (visitor tap = one beat)`,
    );
    assert.equal(state.done, i === BEATS - 1, `step ${i + 1}: done is ${i === BEATS - 1}`);
  }

  // Deterministic: a second walk of the same script is deep-equal state-for-state.
  let state2: DirectorState = initialState;
  const walk2: DirectorState[] = [];
  for (let i = 0; i < BEATS; i++) {
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
// abd-default-script-is-the-seven-approved-beats  (ADR-0147)
// ---------------------------------------------------------------------------

test('abd-default-script-is-the-seven-approved-beats: validates against BeatScript and walks end-to-end to the CTA', () => {
  // The exported default script validates against the exported zod contract —
  // the SAME contract the site parses its beat copy against at build time.
  const parsed = BeatScript.safeParse(defaultScript);
  assert.equal(parsed.success, true, 'defaultScript validates against the BeatScript contract');

  // The default export IS the default script (both surfaces stay pinned together).
  assert.equal(act2Script, defaultScript, 'the default export is the defaultScript');

  // ADR-0147: exactly SEVEN approved beats (not five).
  // Beats 1–4 kept verbatim; pull-back RENUMBERED beat-7-pull-back;
  // two new beats added: beat-5-grow-forest and beat-6-connect-stories.
  assert.equal(defaultScript.length, 7, 'exactly 7 beats in the default script (ADR-0147)');

  // Beat IDs are position-honest (id number = position in the arc):
  const expectedIds = [
    'beat-1-plant-story',
    'beat-2-attach-wisp',
    'beat-3-branch-caps',
    'beat-4-add-roads',
    'beat-5-grow-forest',      // NEW (ADR-0147)
    'beat-6-connect-stories',  // NEW (ADR-0147)
    'beat-7-pull-back',        // RENUMBERED (was beat-5-pull-back, ADR-0147)
  ];
  assert.deepEqual(
    defaultScript.map((b: Beat) => b.id),
    expectedIds,
    'beat ids are exactly the 7 position-honest approved ids (ADR-0147)',
  );

  // Delta kinds in order:
  //   beat-6-connect-stories reuses add-roads (inter-story dependency roads are
  //   already modelled by the existing road mechanism — no new road mechanism)
  const expectedKinds = [
    'plant-story',
    'attach-wisp',
    'branch-caps',
    'add-roads',
    'grow-forest',  // new delta kind (ADR-0147)
    'add-roads',    // beat-6-connect-stories reuses add-roads
    'pull-back',
  ];
  assert.deepEqual(
    defaultScript.map((b: Beat) => b.delta.kind),
    expectedKinds,
    'delta kinds match the 7 approved beats in order',
  );

  // All beat ids are unique — the site keys its narration copy by beat id.
  const ids = defaultScript.map((b: Beat) => b.id);
  assert.equal(new Set(ids).size, 7, 'all 7 beat ids are unique');

  // End-to-end integration walk: the full seven-beat walk produces the CTA end-state.
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
    [1, 2, 3, 4, 5, 6, 7],
    'beatIndex increments 1→7 across the seven approved beats',
  );
  assert.deepEqual(
    doneSeq,
    [false, false, false, false, false, false, true],
    'done is true only after the seventh beat (the pull-back / CTA)',
  );
  assert.equal(state.done, true, 'terminal state: done is true');
  assert.equal(state.beatIndex, 7, 'terminal state: beatIndex is 7');
  // Camera is parked on the pull-back (the whole legible forest)
  assert.deepEqual(
    state.camera,
    defaultScript[6]!.camera,
    'terminal camera = beat 7 camera (pull-back to the full forest)',
  );
});

// ---------------------------------------------------------------------------
// abd-world-holds-multiple-stories  (ADR-0147)
// ---------------------------------------------------------------------------

test('abd-world-holds-multiple-stories: WorldState.stories is an array; plant-story seeds stories[0]; grow-forest raises sibling stories with mixed status', () => {
  // ADR-0147: the world no longer holds ONE story — WorldState.stories is an array
  // of per-story nodes, each { id, label, hasWisp, status, limbs }.
  // The initial world has an empty stories array (not a bare storyId string).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initWorld = initialState.world as any;
  assert.ok(
    Array.isArray(initWorld.stories),
    'initial world.stories is an empty array (ADR-0147: world holds multiple stories, not a single storyId string)',
  );
  assert.equal(initWorld.stories.length, 0, 'initial world has no stories yet');

  // After beat-1 (plant-story), stories[0] is seeded with the planted story.
  // plant-story no longer OVERWRITES — it seeds stories[0] (ADR-0147 §THE MODEL).
  let state: DirectorState = advance(initialState, defaultScript);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worldAfterPlant = state.world as any;
  assert.ok(
    Array.isArray(worldAfterPlant.stories),
    'world.stories is an array after plant-story',
  );
  assert.equal(worldAfterPlant.stories.length, 1, 'exactly one story after plant-story (stories[0] seeded)');
  assert.equal(
    worldAfterPlant.stories[0].id,
    'story-outcome-api',
    'stories[0].id matches the planted story id',
  );
  assert.ok(
    typeof worldAfterPlant.stories[0].label === 'string' &&
      worldAfterPlant.stories[0].label.length > 0,
    'stories[0].label is a non-empty string (the outcome label on the map)',
  );

  // After beat-5 (grow-forest), the world holds MULTIPLE stories (neighbor islands).
  // Advance beats 1–5: plant-story, attach-wisp, branch-caps, add-roads, grow-forest.
  let s: DirectorState = initialState;
  for (let i = 0; i < 5; i++) {
    s = advance(s, defaultScript);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worldAfterGrow = s.world as any;
  assert.ok(
    Array.isArray(worldAfterGrow.stories),
    'world.stories is still an array after grow-forest',
  );
  assert.ok(
    worldAfterGrow.stories.length > 1,
    'more than one story after grow-forest (sibling island stories raised, ADR-0147)',
  );

  // Each story carries a tri-state status: proven | building | broken.
  // This is the ADR-0147 fix for the "latent over-claim" (all stories previously
  // folded to a single amber hue; no broken state existed).
  const validStatuses = new Set(['proven', 'building', 'broken']);
  const statuses: string[] = (worldAfterGrow.stories as Array<{ status: string }>).map(
    (st) => st.status,
  );
  for (const status of statuses) {
    assert.ok(
      validStatuses.has(status),
      `story status '${status}' must be one of proven/building/broken (ADR-0147 tri-state)`,
    );
  }

  // The status set is GENUINELY MIXED — at least two distinct statuses present
  // so the pull-back legend is HONEST (not uniform amber).
  assert.ok(
    new Set(statuses).size >= 2,
    'story statuses are genuinely mixed after grow-forest (at least 2 distinct values — the forest is not uniform)',
  );

  // The grow-forest beat (beat 5) uses the 'grow-forest' delta kind — a new entry
  // in the BeatDelta discriminated union (ADR-0147).
  const beat5 = defaultScript[4]!;
  assert.equal(
    beat5.id,
    'beat-5-grow-forest',
    "beat at index 4 has id 'beat-5-grow-forest' (ADR-0147)",
  );
  assert.equal(
    beat5.delta.kind,
    'grow-forest',
    "beat-5 delta kind is 'grow-forest' (new discriminated-union variant, ADR-0147)",
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
