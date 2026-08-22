/**
 * The standing integration UAT for the orientation-runner telemetry adapter (story
 * `context-traversal-telemetry`, capability `orientation-runner-telemetry`, ADR-0235 / ADR-0192).
 *
 * The adapter owns no drive source: this proof builds the wrapped runner over the REAL production
 * `createOrientationRunner` factory (`@storytree/drive`) over a temporary stories/ directory and an
 * in-memory read-only `Store` (`@storytree/storage-protocol`'s `InMemoryStore`) — a real-boundary
 * seam, never a stub of `createOrientationRunner` itself.
 *
 * Covers the four contracts declared in
 * `stories/context-traversal-telemetry/orientation-runner-telemetry.md`:
 *   1. decorated-production-runner-emits-read-strength
 *   2. orientation-search-list-is-metadata-only
 *   3. orientation-coverage-is-honest
 *   4. telemetry-wrapper-is-additive
 *
 * Every assertion is made against a value that came back OUT of the decorated runner or the
 * trace's own `replay()`, never against a literal object a test composed — per the story's own
 * falsifiability bar. Canary strings planted in fixture bodies are asserted ABSENT from the
 * serialized replay: the strict event schemas already refuse an unknown/content-bearing field
 * (so a leak would throw at `trace.append` time), but the canary check pins the OBSERVABLE outcome
 * directly rather than relying on that as an implicit side effect.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createOrientationRunner } from "@storytree/drive";
import { InMemoryStore } from "@storytree/storage-protocol";

import {
  withContextTraversalTelemetry,
  ORIENTATION_RUNNER_ADAPTER_COVERAGE,
  type OrientationRunnerTelemetry,
} from "./orientation-runner-adapter.js";
import { createContextTraversalTrace, type ContextTraversalTrace } from "./traversal-trace.js";
import { CoverageFeature, ContextTraversalCoverage, isContextVisitEvent } from "./traversal-events.js";

// ---------------------------------------------------------------------------
// Fixtures — a real stories/ directory and a real in-memory Store, both fed to the REAL
// createOrientationRunner factory. Canary strings mark content that must never reach telemetry.
// ---------------------------------------------------------------------------

const STORY_CANARY = "CANARY-STORY-BODY-4f8a91";
const ARTIFACT_TITLE = "A demo artifact";
const ARTIFACT_BODY_TEXT = "THE ARTIFACT BODY TEXT";
const ARTIFACT_CANARY = "CANARY-ARTIFACT-BODY-9c21e7";

/** A pinned, far-future instant — proves the adapter used the INJECTED clock, never `Date.now()`. */
const FIXED_NOW = "2099-01-01T00:00:00.000Z";

function makeStoriesDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "orientation-telemetry-story-"));
  const storyDir = path.join(dir, "demo-story");
  mkdirSync(storyDir);
  writeFileSync(
    path.join(storyDir, "story.md"),
    `---\nid: demo-story\ntier: story\n---\n# Demo story\n\n${STORY_CANARY}\n`,
    "utf8",
  );
  return dir;
}

async function makeKnowledgeStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "demo-artifact",
    kind: "principle",
    doc: {
      id: "demo-artifact",
      title: ARTIFACT_TITLE,
      body: `${ARTIFACT_BODY_TEXT}. ${ARTIFACT_CANARY}`,
      references: [],
    },
  });
  await store.upsertDoc({
    id: "second-principle",
    kind: "principle",
    doc: { id: "second-principle", title: "Second principle", body: "second body", references: [] },
  });
  await store.upsertDoc({
    id: "unrelated-note",
    kind: "note",
    doc: { id: "unrelated-note", title: "Unrelated note", body: "note body", references: [] },
  });
  return store;
}

/**
 * Fresh telemetry over a fresh trace: `nodeStore` is the SAME in-memory Store the production
 * runner reads over (a real collaborator, never a stub); `nextVisitId`/`now` are deterministic and
 * injected, so a correct adapter never reaches for an ambient clock or generates its own id.
 */
function makeTelemetry(
  nodeStore: InMemoryStore,
  sessionId: string,
) {
  const trace = createContextTraversalTrace();
  let counter = 0;
  const telemetry: OrientationRunnerTelemetry = {
    sessionId,
    trace,
    nodeStore,
    nextVisitId: () => `test-visit-${++counter}`,
    now: () => new Date(FIXED_NOW),
  };
  return { telemetry, trace };
}

// ---------------------------------------------------------------------------
// 1. decorated-production-runner-emits-read-strength
// ---------------------------------------------------------------------------

test("decorated-production-runner-emits-read-strength: the decorated production runner records focused-tree front-matter and tree-spec full-payload as distinct visit kinds targeting the same canonical node, with stable session identity, unique visit ids, the injected clock, and no envelope body — and the fixture's canary body text never enters the trace", async () => {
  const storiesDir = makeStoriesDir();
  const store = await makeKnowledgeStore();
  const runner = createOrientationRunner({ store, storiesDir, lookupConfig: () => null });
  const sessionId = "session-read-strength";
  const { telemetry, trace } = makeTelemetry(store, sessionId);
  const decorated = withContextTraversalTelemetry(runner, telemetry);

  const focused = await decorated(["tree", "demo-story"], { store: null, writable: false });
  assert.equal(focused.ok, true, "the focused-tree read must succeed against the fixture story");

  const spec = await decorated(["tree", "spec", "demo-story"], { store: null, writable: false });
  assert.equal(spec.ok, true, "the tree-spec read of the same node must succeed");

  const replay = trace.replay(sessionId);
  const visitEvents = replay.events.filter(isContextVisitEvent);
  assert.equal(visitEvents.length, 2, "exactly two visit observations are recorded, one per read");

  const frontMatter = visitEvents.find((event) => event.kind === "front_matter_read");
  const fullPayload = visitEvents.find((event) => event.kind === "full_payload_read");
  assert.ok(frontMatter !== undefined, "the focused-tree read is recorded as front_matter_read");
  assert.ok(fullPayload !== undefined, "the tree-spec read is recorded as full_payload_read");

  if (frontMatter !== undefined && fullPayload !== undefined) {
    // stable session identity, shared canonical node, distinct chronological visits
    assert.equal(frontMatter.sessionId, sessionId);
    assert.equal(fullPayload.sessionId, sessionId);
    assert.equal(frontMatter.nodeId, "demo-story");
    assert.equal(fullPayload.nodeId, "demo-story");
    assert.notEqual(frontMatter.visitId, fullPayload.visitId, "each occurrence gets its own visitId");
    assert.match(frontMatter.visitId, /^test-visit-\d+$/, "visitId is drawn from the injected generator");
    assert.match(fullPayload.visitId, /^test-visit-\d+$/, "visitId is drawn from the injected generator");

    // the injected clock, never an ambient one
    assert.equal(frontMatter.at, FIXED_NOW);
    assert.equal(fullPayload.at, FIXED_NOW);

    // field:surface_id — the one optional field this adapter declares support for
    assert.equal(typeof frontMatter.surfaceId, "string");
    assert.ok((frontMatter.surfaceId ?? "").length > 0, "front-matter reads carry a surfaceId");
    assert.equal(typeof fullPayload.surfaceId, "string");
    assert.ok((fullPayload.surfaceId ?? "").length > 0, "full-payload reads carry a surfaceId");

    // no envelope body ever rides on a visit event — both structurally (strict schema) and observably
    assert.equal(Object.hasOwn(frontMatter, "body"), false);
    assert.equal(Object.hasOwn(fullPayload, "body"), false);
  }

  // the fixture story's own markdown body must never reach the trace
  const serialized = JSON.stringify(replay);
  assert.equal(serialized.includes(STORY_CANARY), false, "the story's canary body text leaked into telemetry");
});

// ---------------------------------------------------------------------------
// 2. orientation-search-list-is-metadata-only
// ---------------------------------------------------------------------------

test("orientation-search-list-is-metadata-only: a successful Library artifact-list call records only its operation and canonical result ids, a later read of one result creates no followed edge, and no title/body/envelope text ever enters the trace", async () => {
  const storiesDir = makeStoriesDir();
  const store = await makeKnowledgeStore();
  const runner = createOrientationRunner({ store, storiesDir, lookupConfig: () => null });
  const sessionId = "session-search";
  const { telemetry, trace } = makeTelemetry(store, sessionId);
  const decorated = withContextTraversalTelemetry(runner, telemetry);

  // "principle" is a known PROPER SUBSET: 2 of the 3 fixture docs (the third is kind "note")
  const list = await decorated(["library", "artifact", "list", "principle"], {
    store: null,
    writable: false,
  });
  assert.equal(list.ok, true);

  // requesting one of the listed results afterward must not create a followed edge — the exact
  // temporal adjacency a timestamp-inference implementation would wrongly join
  const followUp = await decorated(["library", "artifact", "demo-artifact"], {
    store: null,
    writable: false,
  });
  assert.equal(followUp.ok, true);

  const replay = trace.replay(sessionId);
  const searchEvents = replay.events.filter((event) => event.kind === "search");
  assert.equal(searchEvents.length, 1, "exactly one search observation is recorded for the list call");

  const [search] = searchEvents;
  assert.ok(search !== undefined);
  if (search !== undefined && search.kind === "search") {
    assert.equal(search.sessionId, sessionId);
    assert.equal(search.operation, "library_artifact_list");
    assert.deepEqual(
      [...search.resultNodeIds].sort(),
      ["demo-artifact", "second-principle"].sort(),
      "resultNodeIds are exactly the canonical ids of the filtered-by-kind subset",
    );
    assert.equal(typeof search.surfaceId, "string");
    assert.ok(search.surfaceId.length > 0);
  }

  // the followed-edge relationship must never appear, however many reads follow a list
  const followedEdges = replay.relationships.filter((r) => r.kind === "followed_edge");
  assert.equal(followedEdges.length, 0, "no followed edge is ever inferred from a list→read sequence");

  // metadata-only: titles, bodies, and envelope text never enter the trace
  const serialized = JSON.stringify(replay);
  assert.equal(serialized.includes(ARTIFACT_TITLE), false);
  assert.equal(serialized.includes(ARTIFACT_BODY_TEXT), false);
  assert.equal(serialized.includes(ARTIFACT_CANARY), false);
});

// ---------------------------------------------------------------------------
// 3. orientation-coverage-is-honest
// ---------------------------------------------------------------------------

test("orientation-coverage-is-honest: ORIENTATION_RUNNER_ADAPTER_COVERAGE names exactly the four supported features, omits every other CoverageFeature computed from the enum (never hand-listed), and is actually declared to the trace on decoration — not merely exported unused", async () => {
  assert.equal(ORIENTATION_RUNNER_ADAPTER_COVERAGE.adapterId, "orientation-runner-decorator");

  const expectedSupported = [
    "event:front_matter_read",
    "event:full_payload_read",
    "event:search",
    "field:surface_id",
  ].sort();
  assert.deepEqual([...ORIENTATION_RUNNER_ADAPTER_COVERAGE.supported].sort(), expectedSupported);

  // omitted = every OTHER CoverageFeature — computed from the live enum, never hand-listed here
  const expectedOmitted = [...CoverageFeature.options].filter((f) => !expectedSupported.includes(f)).sort();
  assert.deepEqual([...ORIENTATION_RUNNER_ADAPTER_COVERAGE.omitted].sort(), expectedOmitted);
  assert.ok(expectedOmitted.length > 0, "the fixture itself must exercise a genuinely partial adapter");

  // the constant must itself be a genuine, exhaustive ContextTraversalCoverage value
  const parsed = ContextTraversalCoverage.parse(ORIENTATION_RUNNER_ADAPTER_COVERAGE);
  assert.deepEqual([...parsed.supported].sort(), expectedSupported);
  assert.deepEqual([...parsed.omitted].sort(), expectedOmitted);

  // read the declaration back OFF THE REPLAY, proving the adapter actually declared it to the
  // injected trace on decoration — a constant that is merely exported and never declared must fail
  const storiesDir = makeStoriesDir();
  const store = await makeKnowledgeStore();
  const runner = createOrientationRunner({ store, storiesDir, lookupConfig: () => null });
  const sessionId = "session-coverage";
  const { telemetry, trace } = makeTelemetry(store, sessionId);

  withContextTraversalTelemetry(runner, telemetry);
  // no read call at all — declaration must happen on decoration, not lazily on first success

  const declared = trace.replay().coverage.find((c) => c.adapterId === "orientation-runner-decorator");
  assert.ok(declared !== undefined, "the adapter must declare its own coverage to the injected trace");
  if (declared !== undefined) {
    assert.deepEqual([...declared.supported].sort(), expectedSupported);
    assert.deepEqual([...declared.omitted].sort(), expectedOmitted);
  }
});

// ---------------------------------------------------------------------------
// 4. telemetry-wrapper-is-additive
// ---------------------------------------------------------------------------

test("telemetry-wrapper-is-additive: the decorated runner returns an envelope deep-equal to the bare runner's for both a hit and a miss, recording an observation only on the hit", async () => {
  const storiesDir = makeStoriesDir();
  const store = await makeKnowledgeStore();
  const bareRunner = createOrientationRunner({ store, storiesDir, lookupConfig: () => null });
  const sessionId = "session-additive";
  const { telemetry, trace } = makeTelemetry(store, sessionId);
  const decorated = withContextTraversalTelemetry(bareRunner, telemetry);

  // --- hit: a genuine successful read --------------------------------------------------------
  const bareHit = await bareRunner(["tree", "demo-story"], { store: null, writable: false });
  assert.equal(bareHit.ok, true);
  const beforeHitCount = trace.replay(sessionId).events.length;

  const decoratedHit = await decorated(["tree", "demo-story"], { store: null, writable: false });
  assert.deepEqual(decoratedHit, bareHit, "the decorated envelope is unchanged from the bare runner's");

  const afterHitCount = trace.replay(sessionId).events.length;
  assert.equal(afterHitCount, beforeHitCount + 1, "a successful call records exactly one observation");

  // --- miss: a domain miss (unknown node), never a throw -------------------------------------
  const bareMiss = await bareRunner(["tree", "spec", "no-such-node"], { store: null, writable: false });
  assert.equal(bareMiss.ok, false);
  const beforeMissCount = trace.replay(sessionId).events.length;

  const decoratedMiss = await decorated(["tree", "spec", "no-such-node"], { store: null, writable: false });
  assert.deepEqual(decoratedMiss, bareMiss, "the miss envelope's body/next/ok are unchanged");

  const afterMissCount = trace.replay(sessionId).events.length;
  assert.equal(afterMissCount, beforeMissCount, "an unsuccessful call records NO observation");
});
