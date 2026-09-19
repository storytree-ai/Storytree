import { test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { Store } from "@storytree/storage-protocol";
import { INNER_LOOP_EVENT_KIND } from "@storytree/proof-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";
import type { AuthoringPhase, AuthorResult, PhaseAuthor } from "@storytree/agent";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  resolveBuildConfig,
  resolveSignerFromEnv,
  readInnerLoopLedger,
} from "@storytree/orchestrator";
import type { BuildWorktree, LeafPhasePrompts, NodeBuildConfig, NodeSpec } from "@storytree/orchestrator";

import { fixtureRepo, fixtureStories, scriptedAuthors, scopeFor, cannedLiveAuthor } from "./real-chain-fixture.js";

/**
 * `real-lifecycle-records-its-attempt` (ADR-0576 D5): the single-node REAL lifecycle records ONE
 * attempt on the durable attempt ledger immediately before its gate walk, and one signed pass after
 * a signed result — never before, never adjudicating.
 *
 * The module is imported as a NAMESPACE (`import * as`), never by name (ADR-0057 C): the fields this
 * unit adds (`RealBuildArgs.incrementId`, `RealBuildResult.innerLoop`, and the two exported types
 * `InnerLoopAppend` / `InnerLoopRecording`) are structural, so at HEAD `buildNodeReal` silently
 * ignores `incrementId` and records nothing — every assertion below fails on WHAT THE BUILD DID,
 * never on a missing symbol (`buildNodeReal` / `RealBuildArgs` / `RealBuildResult` all already exist
 * and are reached through this namespace).
 */
import * as NodeBuildModule from "./node-build.js";

/** The inner-loop docs the store holds, in append order — the shape the spec's own walkthrough reads. */
async function innerLoopDocs(store: Store): Promise<unknown[]> {
  return (await store.readEvents())
    .filter((e) => e.kind === INNER_LOOP_EVENT_KIND)
    .map((e) => e.doc);
}

/**
 * Wraps a scripted {@link PhaseAuthor}: counts its calls and, on the FIRST call, snapshots the
 * store's inner-loop docs BEFORE delegating — so a test can assert the attempt was appended before
 * the leaf ever ran.
 */
interface RecordingAuthor extends PhaseAuthor {
  calls: number;
  firstCallSnapshot: unknown[] | undefined;
}

function makeRecordingAuthor(store: Store, inner: PhaseAuthor): RecordingAuthor {
  const recording: RecordingAuthor = {
    calls: 0,
    firstCallSnapshot: undefined,
    async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
      recording.calls += 1;
      if (recording.calls === 1) {
        recording.firstCallSnapshot = await innerLoopDocs(store);
      }
      return inner.author(phase, prompt);
    },
  };
  return recording;
}

/** An `InMemoryStore` whose `appendEvent` throws for ANY inner-loop event, delegating everything else. */
class ThrowingAttemptAppendStore extends InMemoryStore {
  override async appendEvent(
    e: Parameters<InMemoryStore["appendEvent"]>[0],
  ): ReturnType<InMemoryStore["appendEvent"]> {
    if (e.kind === INNER_LOOP_EVENT_KIND) {
      throw new Error("attempt-append-marker");
    }
    return super.appendEvent(e);
  }
}

/** An `InMemoryStore` whose `appendEvent` throws ONLY for a `signed-pass` inner-loop event. */
class ThrowingSignedPassAppendStore extends InMemoryStore {
  override async appendEvent(
    e: Parameters<InMemoryStore["appendEvent"]>[0],
  ): ReturnType<InMemoryStore["appendEvent"]> {
    if (
      e.kind === INNER_LOOP_EVENT_KIND &&
      typeof e.doc === "object" &&
      e.doc !== null &&
      (e.doc as { event?: unknown }).event === "signed-pass"
    ) {
      throw new Error("signed-pass-append-marker");
    }
    return super.appendEvent(e);
  }
}

interface Fixture {
  stories: string;
  repoRoot: string;
  worktree: BuildWorktree;
  spec: NodeSpec;
  buildConfig: NodeBuildConfig;
  signer: string;
  phasePrompts: LeafPhasePrompts;
}

/** One throwaway fixture repo + story + worktree, ready for a `buildNodeReal` call over `unitId`. */
async function setupFixture(unitId: string): Promise<Fixture> {
  const stories = await fixtureStories([{ id: unitId, dependsOn: [] }]);
  const repo = await fixtureRepo(false);
  const worktree = await createBuildWorktree(repo.root, {});
  const specFile = findNodeSpecFile(stories, unitId);
  assert.ok(specFile !== null, `ground truth: the fixture ${unitId} spec must resolve`);
  const spec: NodeSpec = loadNodeSpec(specFile as string);
  const resolved = resolveBuildConfig(spec);
  assert.ok(
    resolved !== null && resolved.config.real !== undefined,
    `ground truth: ${unitId} must carry a real: arm`,
  );
  const buildConfig = (resolved as { config: NodeBuildConfig }).config;
  const signerResult = resolveSignerFromEnv({ flag: "tester@example.com" });
  assert.equal(signerResult.ok, true, "ground truth: the fixture signer must resolve");
  const signer = (signerResult as { ok: true; signer: string }).signer;
  const corpus = new InMemoryStore();
  await loadFixtureCorpus(corpus);
  const promptsResult = await NodeBuildModule.renderLeafPhasePrompts(corpus);
  assert.equal(promptsResult.ok, true, "ground truth: the Library leaf prompts must render");
  const phasePrompts = (promptsResult as { ok: true; prompts: LeafPhasePrompts }).prompts;
  return { stories, repoRoot: repo.root, worktree, spec, buildConfig, signer, phasePrompts };
}

async function teardownFixture(fx: Fixture): Promise<void> {
  await fx.worktree.remove();
  await fsp.rm(fx.stories, { recursive: true, force: true });
  await fsp.rm(fx.repoRoot, { recursive: true, force: true });
}

test(
  "an-attempt-is-recorded-before-the-gate-walk: given an increment, one attempt is appended before " +
    "the leaf authors anything, and a walk that fails records nothing more",
  async () => {
    const fx = await setupFixture("cap-bad");
    const store = new InMemoryStore();
    const inner = scriptedAuthors({ "cap-bad": scopeFor("cap-bad") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-bad");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-bad-1",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
        incrementId: "inc-1",
      });

      assert.equal(built.result.ok, false, "ground truth: cap-bad's authored impl never satisfies its test");
      assert.ok(recording.calls >= 1, "ground truth: the recording author must have been called");
      assert.deepEqual(
        recording.firstCallSnapshot,
        [{ event: "attempt", unitId: "cap-bad", incrementId: "inc-1", runId: "run-bad-1" }],
        "the attempt must be appended BEFORE the leaf's first call",
      );
      const docsAfter = await innerLoopDocs(store);
      assert.deepEqual(
        docsAfter,
        [{ event: "attempt", unitId: "cap-bad", incrementId: "inc-1", runId: "run-bad-1" }],
        "a failed walk records no signed pass",
      );
      assert.deepEqual(
        built.innerLoop,
        { incrementId: "inc-1", attempt: { recorded: true } },
        "the recording carries the attempt and no signedPass key",
      );
      const ledger = await readInnerLoopLedger(store, "cap-bad");
      assert.deepEqual(ledger.attempts, [{ runId: "run-bad-1", incrementId: "inc-1", signed: false }]);
      assert.equal(ledger.consecutiveFailures, 1);
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "a-signed-walk-records-its-signed-pass: a walk the spine signs appends one signed pass after its " +
    "attempt and reports both",
  async () => {
    const fx = await setupFixture("cap-a");
    const store = new InMemoryStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-a-1",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
        incrementId: "inc-1",
      });

      assert.equal(built.result.ok, true, "ground truth: cap-a's authored impl satisfies its test");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, [
        { event: "attempt", unitId: "cap-a", incrementId: "inc-1", runId: "run-a-1" },
        { event: "signed-pass", unitId: "cap-a", incrementId: "inc-1", runId: "run-a-1" },
      ]);
      assert.deepEqual(built.innerLoop, {
        incrementId: "inc-1",
        attempt: { recorded: true },
        signedPass: { recorded: true },
      });
      const ledger = await readInnerLoopLedger(store, "cap-a");
      assert.deepEqual(ledger.unresolvedSignedRuns, ["run-a-1"]);
      assert.equal(ledger.policy.disposition, "signed");
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "an-unrecordable-attempt-refuses-the-walk: an attempt that cannot be appended refuses the walk " +
    "before the leaf is called",
  async () => {
    // Sub-case 1: the append itself throws.
    const fx = await setupFixture("cap-a");
    const store = new ThrowingAttemptAppendStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-throw-attempt",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
        incrementId: "inc-1",
      });

      assert.equal(built.result.ok, false, "ground truth: an unrecordable attempt must refuse the walk");
      if (built.result.ok) return;
      assert.equal(built.result.failedAt, "AUTHOR_TEST");
      assert.deepEqual(built.result.phasesVisited, []);
      assert.match(built.result.reason, /attempt-append-marker/);
      assert.match(built.result.reason, /ADR-0576 D5/);
      assert.equal(recording.calls, 0, "ground truth: the leaf must never be called");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, []);
      const signingEvents = (await store.readEvents()).filter((e) => e.kind === "signing");
      assert.deepEqual(signingEvents, []);
      assert.deepEqual(built.innerLoop, {
        incrementId: "inc-1",
        attempt: { recorded: false, reason: "attempt-append-marker" },
      });
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "an-unrecordable-attempt-refuses-the-walk: the refusal names the unit, the run and the increment " +
    "whose attempt could not be recorded",
  async () => {
    const fx = await setupFixture("cap-a");
    const store = new ThrowingAttemptAppendStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-named-refusal",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: inner as PhaseAuthor,
        incrementId: "inc-1",
      });

      assert.equal(built.result.ok, false, "ground truth: an unrecordable attempt must refuse the walk");
      if (built.result.ok) return;
      assert.equal(
        built.result.reason,
        "inner-loop attempt for cap-a (run run-named-refusal, increment inc-1) could not be recorded: " +
          "attempt-append-marker — the walk is refused before the leaf (ADR-0576 D5)",
      );
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "an-unrecordable-attempt-refuses-the-walk: the protocol's own refusal of a blank increment id " +
    "takes the same fail-closed path",
  async () => {
    // Sub-case 2: a blank incrementId is refused by the protocol's own validation, over a store that
    // would otherwise happily record anything.
    const fx = await setupFixture("cap-a");
    const store = new InMemoryStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-blank-increment",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
        incrementId: "   ",
      });

      assert.equal(built.result.ok, false, "ground truth: a blank increment id must refuse the walk");
      assert.equal(recording.calls, 0, "ground truth: the leaf must never be called");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, []);

      assert.equal(built.innerLoop?.incrementId, "   ");
      const attempt = built.innerLoop?.attempt;
      assert.equal(attempt?.recorded, false, "ground truth: a blank id can never be recorded");
      if (attempt === undefined || attempt.recorded !== false) return;
      assert.ok(attempt.reason.trim().length > 0, "the refusal's reason must be a non-empty string");
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "an-unrecordable-signed-pass-is-reported: a signed pass that cannot be appended leaves the verdict " +
    "standing and is reported on the result",
  async () => {
    const fx = await setupFixture("cap-a");
    const store = new ThrowingSignedPassAppendStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-throw-signed-pass",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
        incrementId: "inc-1",
      });

      assert.equal(built.result.ok, true, "ground truth: the verdict must stand despite the unrecordable signed pass");
      const signingEvents = (await store.readEvents()).filter((e) => e.kind === "signing");
      assert.ok(signingEvents.length >= 1, "the verdict must have been signed");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, [
        { event: "attempt", unitId: "cap-a", incrementId: "inc-1", runId: "run-throw-signed-pass" },
      ]);
      assert.deepEqual(built.innerLoop, {
        incrementId: "inc-1",
        attempt: { recorded: true },
        signedPass: { recorded: false, reason: "signed-pass-append-marker" },
      });
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "nothing-is-recorded-without-an-increment-or-a-walk: a build given no increment appends no " +
    "inner-loop event and carries no recording",
  async () => {
    const fx = await setupFixture("cap-a");
    const store = new InMemoryStore();
    const inner = scriptedAuthors({ "cap-a": scopeFor("cap-a") })(fx.spec, fx.worktree.root);
    assert.ok(inner !== undefined, "ground truth: the scripted author must resolve for cap-a");
    const recording = makeRecordingAuthor(store, inner as PhaseAuthor);
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-no-increment",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        authorOverride: recording,
      });

      assert.equal(built.result.ok, true, "ground truth: cap-a's authored impl satisfies its test");
      assert.equal("innerLoop" in built, false, "with no incrementId, nothing must be recorded");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, []);
    } finally {
      await teardownFixture(fx);
    }
  },
);

test(
  "nothing-is-recorded-without-an-increment-or-a-walk: a walk refused before it starts appends no " +
    "inner-loop event and carries no recording",
  async () => {
    const fx = await setupFixture("cap-a");
    const store = new InMemoryStore();
    try {
      const built = await NodeBuildModule.buildNodeReal({
        spec: fx.spec,
        worktree: fx.worktree,
        baseSha: fx.worktree.headSha,
        realConfig: fx.buildConfig.real!,
        store,
        runId: "run-resolver-refusal",
        signer: fx.signer,
        phasePrompts: fx.phasePrompts,
        repoRoot: fx.repoRoot,
        promote: false,
        incrementId: "inc-1",
        liveAuthorOverride: cannedLiveAuthor([]),
      });

      assert.equal(built.result.ok, false, "ground truth: liveAuthorOverride without authorOverride is refused");
      if (built.result.ok) return;
      assert.match(built.result.reason, /liveAuthorOverride/);
      assert.equal("innerLoop" in built, false, "a resolver refusal before any walk must record nothing");
      const docs = await innerLoopDocs(store);
      assert.deepEqual(docs, []);
    } finally {
      await teardownFixture(fx);
    }
  },
);
