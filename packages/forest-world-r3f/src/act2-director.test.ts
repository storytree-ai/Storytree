// act2-director.test.ts — Act 2 beat director: pure, visitor-paced choreography.
//
// This is an INTEGRATION test: it walks the REAL default six-beat script through
// the REAL advance() state machine, verifying the contractual properties the node
// spec mandates (ADR-0150 / ADR-0153). Per ADR-0122 each declared contract id
// LEADS a distinctly-named test so `storytree coverage act2-beat-director` reports
// full coverage:
//
//   • abd-advance-is-visitor-paced-and-deterministic — advance() moves exactly
//     one beat per call, two walks of the same script are deep-equal, state never
//     changes without a call, and past-done advances are parking no-ops.
//   • abd-green-only-on-signed-proof — a limb renders green only when its delta
//     carries the signed-proof marker; a green-without-marker delta is refused
//     loudly (the verification-gap answer, enforced at runtime, not a type hint).
//   • abd-upstream-stories-carry-dependsOn-and-honest-status — add-upstream-story beats raise
//     upstream stories with correct tri-state status, and the dependency edges
//     flow FROM dependent TO prerequisite (website.dependsOn=[backend],
//     backend.dependsOn=[database], database.dependsOn=[]) — the authoritative
//     ADR-0058 / cross-story-dependency direction corrected by ADR-0153.
//   • abd-default-script-is-the-one-continuous-arc — the exported default
//     script validates against the exported BeatScript zod contract, is exactly
//     the six-beat continuous arc (website walk → upstream dependency-layer
//     reveal) in order, contains no add-roads / wrong-way-road beat (the
//     antipattern is retired as the teach — ADR-0150 §4), and walks end-to-end
//     to the CTA state.
//
// WHY THIS IS ONE ORGANISM: the beat contract (zod BeatDelta), the advance()
// state machine, and the six-beat default script are inseparable. The tests
// therefore walk the REAL script through the REAL machine — not an isolated
// single-assertion stub.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Named exports: the pure advance() function, the zero DirectorState, the
// six-beat default script, the zod contracts, and the inferred types.
// The default export is the same script object as `defaultScript` (pinned below).
import act2Script, {
  advance,
  initialState,
  defaultScript,
  BeatScript,
  type Beat,
  type BeatDelta,
  type LimbDelta,
  type DirectorState,
  type StoryNode,
} from './act2-director.js';

// ---------------------------------------------------------------------------
// abd-advance-is-visitor-paced-and-deterministic
// ---------------------------------------------------------------------------

test('abd-advance-is-visitor-paced-and-deterministic: one tap = one beat, two walks deep-equal, no mutation, past-done parks', () => {
  // One beat per call: beatIndex increments by exactly 1, done only on the sixth.
  let state: DirectorState = initialState;
  const walk1: DirectorState[] = [];
  for (let i = 0; i < 6; i++) {
    const prevIndex = state.beatIndex;
    state = advance(state, defaultScript);
    walk1.push(state);
    assert.equal(
      state.beatIndex,
      prevIndex + 1,
      `step ${i + 1}: beatIndex increments by exactly 1 (visitor tap = one beat)`,
    );
    assert.equal(state.done, i === 5, `step ${i + 1}: done is ${i === 5}`);
  }

  // Deterministic: a second walk of the same script is deep-equal state-for-state.
  let state2: DirectorState = initialState;
  const walk2: DirectorState[] = [];
  for (let i = 0; i < 6; i++) {
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
// abd-upstream-stories-carry-dependsOn-and-honest-status
// ---------------------------------------------------------------------------

test('abd-upstream-stories-carry-dependsOn-and-honest-status: add-upstream-story builds the layered stack with correct dependsOn edges and tri-state status', () => {
  // Walk beats 1–3 (plant-story, attach-wisp, branch-caps) to set up the website.
  let state: DirectorState = initialState;
  state = advance(state, defaultScript); // beat 1: plant-story (website)
  state = advance(state, defaultScript); // beat 2: attach-wisp
  state = advance(state, defaultScript); // beat 3: branch-caps

  // After beats 1–3, world.stories is an array containing exactly the website story.
  assert.ok(
    Array.isArray(state.world.stories),
    'world.stories is an array after the website-walk beats',
  );
  assert.equal(state.world.stories.length, 1, 'exactly 1 story in the world after beats 1–3 (website only)');

  const websiteNode: StoryNode = state.world.stories[0]!;
  assert.equal(typeof websiteNode.id, 'string', 'website story has a string id');
  assert.ok(websiteNode.id.length > 0, 'website story id is non-empty');
  // plant-story seeds the website story as 'building' (proposed, not yet proven)
  assert.ok(
    ['proven', 'building', 'broken'].includes(websiteNode.status),
    `website status must be tri-state (proven/building/broken), got '${websiteNode.status}'`,
  );
  assert.equal(websiteNode.status, 'building', 'plant-story seeds the website story as building');
  assert.ok(Array.isArray(websiteNode.dependsOn), 'website story has a dependsOn array');

  // Beat 4: add-upstream-story raises the backend (the website depends on it).
  const beat4 = defaultScript[3]!;
  assert.equal(
    beat4.delta.kind,
    'add-upstream-story',
    'beat 4 is add-upstream-story (backend) — the dependency-layer reveal replaces the old wrong-way-road teach (ADR-0150 §4)',
  );

  state = advance(state, defaultScript); // beat 4: add-upstream-story (backend)

  // After beat 4: the world holds 2 stories — website and backend.
  assert.equal(
    state.world.stories.length,
    2,
    'world holds 2 stories after beat 4 (website + backend)',
  );

  const websiteAfterBeat4: StoryNode = state.world.stories.find(
    (s: StoryNode) => s.id === websiteNode.id,
  )!;
  assert.ok(websiteAfterBeat4 != null, 'website story is still present after beat 4');

  const backendNode: StoryNode = state.world.stories.find(
    (s: StoryNode) => s.id !== websiteNode.id,
  )!;
  assert.ok(backendNode != null, 'backend story was raised in beat 4');
  assert.ok(backendNode.id.length > 0, 'backend story has a non-empty id');

  // The WEBSITE now dependsOn the backend — the edge flows FROM dependent TO
  // prerequisite (website needs backend to serve a working checkout — ADR-0058 /
  // cross-story-dependency; direction corrected by ADR-0153).
  assert.ok(
    websiteAfterBeat4.dependsOn.includes(backendNode.id),
    `website.dependsOn must include backend id '${backendNode.id}' (website → backend dependency edge)`,
  );

  // The backend story's own dependsOn is empty before beat 5 (database not raised yet).
  assert.deepEqual(
    backendNode.dependsOn,
    [],
    'backend.dependsOn is [] before beat 5 — database not yet raised',
  );

  // The backend story carries a valid tri-state status.
  assert.ok(
    ['proven', 'building', 'broken'].includes(backendNode.status),
    `backend status must be tri-state (proven/building/broken), got '${backendNode.status}'`,
  );

  // Beat 5: add-upstream-story raises the database (the backend depends on it).
  const beat5 = defaultScript[4]!;
  assert.equal(
    beat5.delta.kind,
    'add-upstream-story',
    'beat 5 is add-upstream-story (database) — the second upstream layer',
  );

  state = advance(state, defaultScript); // beat 5: add-upstream-story (database)

  // After beat 5: the world holds 3 stories — website, backend, database.
  assert.equal(
    state.world.stories.length,
    3,
    'world holds 3 stories after beat 5 (website + backend + database)',
  );

  const dbNode: StoryNode = state.world.stories.find(
    (s: StoryNode) => s.id !== websiteNode.id && s.id !== backendNode.id,
  )!;
  assert.ok(dbNode != null, 'database story was raised in beat 5');
  assert.ok(dbNode.id.length > 0, 'database story has a non-empty id');

  // The BACKEND now dependsOn the database (backend.dependsOn=[database]).
  const backendAfterBeat5: StoryNode = state.world.stories.find(
    (s: StoryNode) => s.id === backendNode.id,
  )!;
  assert.ok(
    backendAfterBeat5.dependsOn.includes(dbNode.id),
    `backend.dependsOn must include database id '${dbNode.id}' (backend → database dependency edge)`,
  );

  // The DATABASE has no dependencies — it is the foundation (database.dependsOn=[]).
  assert.deepEqual(
    dbNode.dependsOn,
    [],
    'database.dependsOn is [] — the database is the foundation with no upstream prerequisites',
  );

  // The full layered stack: website → backend → database (dependent → prerequisite).
  const websiteFinal: StoryNode = state.world.stories.find(
    (s: StoryNode) => s.id === websiteNode.id,
  )!;
  assert.ok(
    websiteFinal.dependsOn.includes(backendAfterBeat5.id),
    'website still dependsOn backend after all upstream beats — the full three-layer stack is present',
  );
  assert.ok(
    backendAfterBeat5.dependsOn.includes(dbNode.id),
    'backend dependsOn database — website → backend → database stack is complete',
  );

  // Every story in the world carries a valid tri-state status (the honest legend:
  // green = proven, sapling = building, withered = broken).
  for (const story of state.world.stories) {
    assert.ok(
      ['proven', 'building', 'broken'].includes(story.status),
      `story '${story.id}' status must be tri-state (proven/building/broken), got '${story.status}'`,
    );
  }

  // Beat 6 — pull back: the grown WEBSITE resolves to 'proven'; the upstream
  // backend + database stay 'building' (proposed). This is the HONEST MIX
  // (UAT 2): the upstream layers are NEVER green — only the anchor the visitor
  // actually grew is proven, so the pull-back legend is backed by real statuses.
  state = advance(state, defaultScript); // beat 6: pull-back
  assert.equal(state.done, true, 'the walk is done after the six-beat continuous arc');

  const byId = new Map<string, StoryNode>(
    state.world.stories.map((s: StoryNode) => [s.id, s] as const),
  );
  const websiteEnd = byId.get(websiteNode.id)!;
  const backendEnd = byId.get(backendNode.id)!;
  const databaseEnd = byId.get(dbNode.id)!;
  assert.equal(
    websiteEnd.status,
    'proven',
    'the website (the grown anchor) resolves to proven at the pull-back',
  );
  assert.equal(
    backendEnd.status,
    'building',
    'the backend stays building (proposed) — an upstream layer is NEVER green (UAT 2)',
  );
  assert.equal(
    databaseEnd.status,
    'building',
    'the database stays building (proposed) — an upstream layer is NEVER green (UAT 2)',
  );

  // The final set is genuinely MIXED, not uniform amber — the legend is honest:
  // one proven (green) anchor + two building (sapling) upstream layers.
  const statuses = new Set(state.world.stories.map((s: StoryNode) => s.status));
  assert.ok(
    statuses.size > 1,
    `the final status set is genuinely mixed, not uniform (got: ${[...statuses].join(', ')})`,
  );
});

// ---------------------------------------------------------------------------
// abd-default-script-is-the-one-continuous-arc
// ---------------------------------------------------------------------------

test('abd-default-script-is-the-one-continuous-arc: validates against BeatScript, six approved beats in order, no wrong-way-road beat, walks end-to-end to the CTA', () => {
  // The exported default script validates against the exported zod contract —
  // the SAME contract the site parses its beat copy against at build time.
  const parsed = BeatScript.safeParse(defaultScript);
  assert.equal(parsed.success, true, 'defaultScript validates against the BeatScript contract');

  // The default export IS the default script (both surfaces stay pinned together).
  assert.equal(act2Script, defaultScript, 'the default export is the defaultScript');

  // Exactly six beats — the ONE continuous arc: website walk → upstream reveal → CTA.
  assert.equal(
    defaultScript.length,
    6,
    'exactly 6 beats in the default script (website walk + upstream dependency-layer reveal)',
  );

  // Delta kinds in order: the website walk then the upstream dependency-layer reveal.
  //   beat 1: plant-story     — seed → website tree with OUTCOME label, status building
  //   beat 2: attach-wisp     — soft wisp drifts over the tree (presence)
  //   beat 3: branch-caps     — capability limbs; green ONLY on signed proof
  //   beat 4: add-upstream-story — backend (website.dependsOn=[backend], ADR-0058)
  //   beat 5: add-upstream-story — database (backend.dependsOn=[database], ADR-0058)
  //   beat 6: pull-back       — widen to full legible forest → done: true (CTA)
  const actualKinds = defaultScript.map((b: Beat) => b.delta.kind);
  assert.deepEqual(
    actualKinds,
    [
      'plant-story',
      'attach-wisp',
      'branch-caps',
      'add-upstream-story',
      'add-upstream-story',
      'pull-back',
    ],
    'delta kinds match the six-beat continuous arc in order (website walk → upstream reveal → CTA)',
  );

  // The wrong-way-road antipattern is RETIRED from the default script (ADR-0150 §4).
  // The add-roads delta may survive as a latent capability but is NOT a beat in the
  // exported default script — the negative teach is gone.
  assert.ok(
    !actualKinds.includes('add-roads'),
    'add-roads is not in the default script — the wrong-way road antipattern is retired as the teach (ADR-0150 §4)',
  );

  // All beat ids are unique — the site keys its narration copy by beat id, so any
  // rename/renumber must be matched by the site-side narration wall in lockstep.
  const ids = defaultScript.map((b: Beat) => b.id);
  assert.equal(new Set(ids).size, 6, 'all 6 beat ids are unique');

  // End-to-end integration walk: the full six-beat walk produces the CTA end-state.
  let state: DirectorState = initialState;
  const beatIndexSeq: number[] = [];
  const doneSeq: boolean[] = [];
  for (const beat of defaultScript) {
    state = advance(state, defaultScript);
    beatIndexSeq.push(state.beatIndex);
    doneSeq.push(state.done);
    // Camera must follow each beat's declared target at every step.
    assert.deepEqual(state.camera, beat.camera, `camera follows beat '${beat.id}'`);
  }
  assert.deepEqual(
    beatIndexSeq,
    [1, 2, 3, 4, 5, 6],
    'beatIndex increments 1→6 across the six beats',
  );
  assert.deepEqual(
    doneSeq,
    [false, false, false, false, false, true],
    'done is true only after the sixth beat (the pull-back / CTA)',
  );
  assert.equal(state.done, true, 'terminal state: done is true');
  assert.equal(state.beatIndex, 6, 'terminal state: beatIndex is 6');
  // Camera is parked on the pull-back (the whole legible forest).
  assert.deepEqual(
    state.camera,
    defaultScript[5]!.camera,
    'terminal camera = beat 6 camera (pull-back to the full legible forest)',
  );

  // The terminal world holds 3 stories (website + backend + database) — the honest
  // legend (green = proven, sapling = building, withered = broken) is backed by data.
  assert.equal(
    state.world.stories.length,
    3,
    'terminal world holds 3 stories (website + backend + database)',
  );
});

// ---------------------------------------------------------------------------
// Auxiliary: the zero state
// ---------------------------------------------------------------------------

test('act2-initial-state: beatIndex is 0, done is false, world.stories is an empty array, camera is non-null', () => {
  assert.equal(initialState.beatIndex, 0, 'initial beatIndex is 0 (no beats applied yet)');
  assert.equal(initialState.done, false, 'initial done is false');
  assert.ok(
    Array.isArray(initialState.world.stories),
    'initial world.stories is an array (the multi-story world shape)',
  );
  assert.equal(
    initialState.world.stories.length,
    0,
    'initial world has no stories yet (the zero state)',
  );
  assert.ok(initialState.camera != null, 'initial camera is non-null');
});
