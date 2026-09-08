import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SIGNING_EVENT_KIND, type Verdict } from "@storytree/proof-protocol";
import type { RollupEvent, StoryBaselineStore } from "@storytree/orchestrator";
import { InMemoryStore } from "@storytree/storage-protocol";

import { makeGateDeps, makeUatDeps, readGitState, run } from "./commands.js";
import {
  loadAllStoryBaselineCandidates,
  loadStoryBaselineCandidate,
  makeStoryBaselineAdvancer,
  storyBaselineBackfillCommand,
} from "./story-baseline.js";

const criterion = {
  criterionId: "uatc_111111111111111111111111",
  revisionId: "uatr1:1111111111111111",
};

test("story baseline backfill reports accepted, unproven and unreadable stories without authored-status input", async () => {
  const events: RollupEvent[] = [{
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId: criterion.criterionId,
      ...criterion,
      proofMode: "story",
      outcome: "pass",
      commitSha: "cafebabe",
      signer: "spine:storytree",
      runId: "proof",
      outputVersion: "v1",
      evidence: [],
      at: "2026-09-09T00:00:00.000Z",
    } satisfies Verdict,
  }];
  const appended: RollupEvent[] = [];
  const result = await storyBaselineBackfillCommand([], {
    store: {
      readEvents: async () => [...events, ...appended],
      appendEvent: async (event) => {
        appended.push({ kind: event.kind, seq: events.length + appended.length + 1, doc: event.doc });
        return event;
      },
    },
    candidates: () => [
      {
        storyId: "broken",
        declaration: { capabilities: [], obligations: [criterion] },
        unresolvedHealthIssue: true,
      },
      { storyId: "green", declaration: { capabilities: [], obligations: [criterion] } },
      { storyId: "unproven", declaration: { capabilities: [{ id: "cap-a", status: "building" }], obligations: [] } },
      { storyId: "unreadable", error: "story parse failed" },
    ],
    gitState: () => ({ commitSha: "cafebabe", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.match(result.body, /broken: declined/);
  assert.match(result.body, /green: recorded/);
  assert.match(result.body, /unproven: declined/);
  assert.match(result.body, /unreadable: declined/);
  assert.equal(appended.length, 1);
  const baseline = appended[0]?.doc as Verdict;
  assert.equal(
    result.body,
    [
      "story baseline backfill: 1 recorded, 3 declined, 0 deferred (limit 100).",
      "",
      "  – broken: declined — current story health is unhealthy; no complete signed proof or durable baseline exists",
      `  ✓ green: recorded — complete current signed proof covers capabilities [none] and obligations [${criterion.criterionId}] (${baseline.storyBaseline?.fingerprint})`,
      "  – unproven: declined — current signed proof does not yet complete the story; current proof is missing or failed for [capability:cap-a]",
      "  – unreadable: declined — story parse failed",
      "",
      "Every story was reported. Authored status was not consulted; only complete current signed proof recorded a baseline.",
    ].join("\n"),
  );
  assert.deepEqual(result.next, ["storytree tree --pg"]);
  assert.equal(baseline.commitSha, "cafebabe");
  assert.equal(baseline.signer, "owner@example.com");
  assert.equal(baseline.runId, "story-baseline-backfill:2026-09-09T00:00:00.000Z:green");
});

test("story baseline backfill refuses without the live store", async () => {
  const result = await storyBaselineBackfillCommand([], {
    store: null,
    candidates: () => [],
    gitState: () => ({ commitSha: "cafebabe", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.body,
    "story baseline backfill reads and writes signed proof in the live store — rerun with --pg.",
  );
  assert.deepEqual(result.next, ["pnpm db:up", "storytree story baseline backfill --pg"]);
});

test("story baseline backfill refuses unreadable or dirty git and an unresolved signer", async () => {
  const store: StoryBaselineStore = {
    readEvents: async () => [],
    appendEvent: async (event) => event,
  };
  const common = {
    store,
    candidates: () => [],
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  };
  for (const gitState of [() => null, () => ({ commitSha: "dirty", clean: false })]) {
    const result = await storyBaselineBackfillCommand([], {
      ...common,
      gitState,
      resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.body, "story baseline backfill needs a clean committed HEAD whose hierarchy it can bind.");
    assert.deepEqual(result.next, ["git status", "storytree story baseline backfill --pg"]);
  }
  const signer = await storyBaselineBackfillCommand([], {
    ...common,
    gitState: () => ({ commitSha: "clean", clean: true }),
    resolveSigner: () => ({ ok: false, error: "no attributable signer" }),
  });
  assert.deepEqual(signer, {
    ok: false,
    body: "no attributable signer",
    next: ["git config user.email"],
  });
});

test("story baseline backfill normalises requested ids, deduplicates them and reports unknown ids", async () => {
  const appended: Array<{ id: string; kind: string; doc: unknown }> = [];
  const events: RollupEvent[] = [{
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId: criterion.criterionId,
      ...criterion,
      proofMode: "story",
      outcome: "pass",
      commitSha: "proof",
      signer: "spine:storytree",
      runId: "proof",
      evidence: [],
      at: "2026-09-09T00:00:00.000Z",
    },
  }];
  const result = await storyBaselineBackfillCommand([" green ", "green", "unknown", ""], {
    store: {
      readEvents: async () => [...events, ...appended.map((event, index) => ({ ...event, seq: index + 2 }))],
      appendEvent: async (event) => { appended.push(event); return event; },
    },
    candidates: () => [
      { storyId: "ignored", error: "must not be considered" },
      { storyId: "green", declaration: { capabilities: [], obligations: [criterion] } },
    ],
    gitState: () => ({ commitSha: "head", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.equal(result.ok, true);
  assert.match(result.body, /1 recorded, 1 declined, 0 deferred/);
  assert.match(result.body, /green: recorded/);
  assert.match(result.body, /unknown: declined — story declaration not found or unreadable/);
  assert.doesNotMatch(result.body, /ignored/);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.id, "story-baseline-backfill:2026-09-09T00:00:00.000Z:green:green:baseline");
});

test("story baseline backfill reports candidates beyond its fixed bound as deferred", async () => {
  const candidates = Array.from({ length: 101 }, (_, index) => ({
    storyId: `story-${String(index).padStart(3, "0")}`,
    error: "unreadable",
  }));
  const result = await storyBaselineBackfillCommand([], {
    store: { readEvents: async () => [], appendEvent: async (event) => event },
    candidates: () => candidates,
    gitState: () => ({ commitSha: "head", clean: true }),
    resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
    now: () => new Date("2026-09-09T00:00:00.000Z"),
  });
  assert.match(result.body, /0 recorded, 100 declined, 1 deferred \(limit 100\)/);
  assert.match(result.body, /  · story-100: deferred — outside this bounded pass \(limit 100\)/);
});

function writeSpec(root: string, id: string, lines: readonly string[]): void {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "story.md"), lines.join("\n"));
}

test("candidate loading distinguishes complete, missing, malformed and non-story declarations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "story-baseline-candidates-"));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  writeSpec(root, "good", [
    "---", "id: good", "tier: story", "title: Good", "outcome: works", "status: proposed",
    "proof_mode: UAT", "capabilities:", "  - cap-good", "---", "", "Body.",
  ]);
  writeFileSync(join(root, "good", "cap-good.md"), [
    "---", "id: cap-good", "tier: capability", "title: Cap", "outcome: works", "status: building",
    "proof_mode: integration-test", "---", "", "Body.",
  ].join("\n"));
  writeSpec(root, "missing-cap", [
    "---", "id: missing-cap", "tier: story", "title: Missing", "outcome: missing", "status: proposed",
    "proof_mode: UAT", "capabilities:", "  - absent-cap", "---", "", "Body.",
  ]);
  writeSpec(root, "bad-cap", [
    "---", "id: bad-cap", "tier: story", "title: Bad cap", "outcome: bad", "status: proposed",
    "proof_mode: UAT", "capabilities:", "  - broken-cap", "---", "", "Body.",
  ]);
  writeFileSync(join(root, "bad-cap", "broken-cap.md"), "not frontmatter\n");
  writeSpec(root, "wrong-tier", [
    "---", "id: wrong-tier", "tier: capability", "title: Wrong", "outcome: wrong", "status: proposed",
    "proof_mode: integration-test", "---", "", "Body.",
  ]);
  writeSpec(root, "malformed", ["not frontmatter"]);
  mkdirSync(join(root, "empty"));
  writeFileSync(join(root, "README.txt"), "not a story directory");

  assert.deepEqual(loadStoryBaselineCandidate(root, "good"), {
    storyId: "good",
    declaration: { capabilities: [{ id: "cap-good", status: "building" }], obligations: [] },
    coverage: [],
    unresolvedHealthIssue: false,
  });
  for (const id of ["missing-cap", "bad-cap"]) {
    const candidate = loadStoryBaselineCandidate(root, id);
    assert.equal(candidate.declaration?.capabilities[0]?.id, id === "missing-cap" ? "absent-cap" : "broken-cap");
    assert.equal(candidate.declaration?.capabilities[0]?.status, undefined);
    assert.equal(candidate.unresolvedHealthIssue, true);
  }
  assert.equal(loadStoryBaselineCandidate(root, "empty").error, "story.md not found");
  assert.equal(loadStoryBaselineCandidate(root, "wrong-tier").error, "the declaration is not a story");
  assert.match(loadStoryBaselineCandidate(root, "malformed").error ?? "", /frontmatter/);
  assert.deepEqual(
    loadAllStoryBaselineCandidates(root).map((candidate) => candidate.storyId).sort(),
    ["bad-cap", "empty", "good", "malformed", "missing-cap", "wrong-tier"],
  );
  assert.deepEqual(loadAllStoryBaselineCandidates(join(root, "absent")), []);
});

test("candidate advancer refuses unreadable input and records a canonical baseline for readable proof", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "story-baseline-advance-"));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  writeSpec(root, "good", [
    "---", "id: good", "tier: story", "title: Good", "outcome: works", "status: proposed",
    "proof_mode: UAT", "capabilities:", "  - cap-good", "---", "", "Body.",
  ]);
  writeFileSync(join(root, "good", "cap-good.md"), [
    "---", "id: cap-good", "tier: capability", "title: Cap", "outcome: works", "status: building",
    "proof_mode: integration-test", "---", "", "Body.",
  ].join("\n"));
  const events: RollupEvent[] = [{
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId: "cap-good", proofMode: "capability", outcome: "pass", commitSha: "head",
      signer: "spine:storytree", runId: "proof", evidence: [], at: "2026-09-09T00:00:00.000Z",
    },
  }];
  const appended: Array<{ id: string; kind: string; doc: unknown }> = [];
  const store = {
    readEvents: async () => [...events, ...appended.map((event, index) => ({ ...event, seq: index + 2 }))],
    appendEvent: async (event: { id: string; kind: string; doc: unknown }) => { appended.push(event); return event; },
  };
  assert.equal(makeStoryBaselineAdvancer(root, null), undefined);
  const advance = makeStoryBaselineAdvancer(root, store);
  assert.ok(advance !== undefined);
  await assert.rejects(() => advance("absent", {
    commitSha: "head", signer: "owner@example.com", runId: "missing", at: "2026-09-09T00:00:00.000Z",
  }), /story\.md not found/);
  const result = await advance("good", {
    commitSha: "head", signer: "owner@example.com", runId: "advance", at: "2026-09-09T00:00:00.000Z",
  });
  assert.equal((result as { state: string }).state, "recorded");
  assert.equal(appended.length, 1);
  const doc = appended[0]?.doc as Verdict;
  assert.deepEqual(doc.storyBaseline?.capabilityIds, ["cap-good"]);
  assert.equal(doc.storyBaseline?.obligationIds.length, 0);
});

test("command dispatch wires baseline backfill and the optional gate/UAT advancer in both store modes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "story-baseline-dispatch-"));
  t.after(() => { rmSync(root, { recursive: true, force: true }); });
  writeSpec(root, "good", [
    "---", "id: good", "tier: story", "title: Good", "outcome: works", "status: proposed",
    "proof_mode: UAT", "capabilities:", "  - cap-good", "---", "", "Body.",
  ]);
  writeFileSync(join(root, "good", "cap-good.md"), [
    "---", "id: cap-good", "tier: capability", "title: Cap", "outcome: works", "status: building",
    "proof_mode: integration-test", "---", "", "Body.",
  ].join("\n"));
  const store = new InMemoryStore();
  await store.appendEvent({
    id: "proof",
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: "cap-good", proofMode: "capability", outcome: "pass", commitSha: "head",
      signer: "spine:storytree", runId: "proof", evidence: [], at: "2026-09-09T00:00:00.000Z",
    },
    actor: "spine:storytree",
  });
  const liveDeps = {
    store,
    uatStore: store,
    storiesDir: root,
    storyBaselineBackfill: {
      gitState: () => ({ commitSha: "head", clean: true }),
      resolveSigner: () => ({ ok: true as const, signer: "owner@example.com" }),
      now: () => new Date("2026-09-09T00:00:00.000Z"),
    },
  };
  const backfill = await run(["story", "baseline", "backfill", "good", "--pg"], liveDeps);
  assert.equal(backfill.ok, true);
  assert.match(backfill.body, /good: recorded/);
  assert.deepEqual(backfill.next, ["storytree tree --pg"]);

  const liveGate = await run(["gate", "list", "good"], liveDeps);
  const liveUat = await run(["uat", "list", "good"], liveDeps);
  assert.equal(liveGate.ok, true);
  assert.equal(liveUat.ok, true);

  const offlineDeps = { store: new InMemoryStore(), storiesDir: root };
  assert.equal((await run(["gate", "list", "good"], offlineDeps)).ok, true);
  assert.equal((await run(["uat", "list", "good"], offlineDeps)).ok, true);
  const composedGateLive = makeGateDeps(liveDeps, {}, root);
  const composedUatLive = makeUatDeps(liveDeps, null, root);
  assert.equal(composedGateLive.store, store);
  assert.equal(composedUatLive.store, store);
  assert.equal(typeof composedGateLive.advanceStoryBaseline, "function");
  assert.equal(typeof composedUatLive.advanceStoryBaseline, "function");
  const composedGateOffline = makeGateDeps(offlineDeps, {}, root);
  const composedUatOffline = makeUatDeps(offlineDeps, null, root);
  assert.equal(composedGateOffline.store, null);
  assert.equal(composedUatOffline.store, null);
  assert.equal("advanceStoryBaseline" in composedGateOffline, false);
  assert.equal("advanceStoryBaseline" in composedUatOffline, false);
  const unknown = await run(["story", "baseline", "other"], offlineDeps);
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown story command "baseline"/);
  assert.deepEqual(unknown.next, [
    "storytree story build library --dry-run",
    "storytree story baseline backfill --pg",
    "storytree adopt plan library",
  ]);
  const wrongArea = await run(["story", "other", "backfill"], offlineDeps);
  assert.equal(wrongArea.ok, false);
  assert.match(wrongArea.body, /unknown story command "other"/);

  const dirty = await run(["story", "baseline", "backfill", "good", "--pg"], {
    store: offlineDeps.store,
    uatStore: new InMemoryStore(),
    storiesDir: root,
    storyBaselineBackfill: {
      gitState: () => ({ commitSha: "dirty", clean: false }),
      resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
      now: () => new Date("2026-09-09T00:00:00.000Z"),
    },
  });
  assert.equal(dirty.ok, false);
  assert.match(dirty.body, /clean committed HEAD/);
  const noDirectoryOverride = await run(["story", "baseline", "backfill"], {
    store: offlineDeps.store,
  });
  assert.equal(noDirectoryOverride.ok, false);
  assert.match(noDirectoryOverride.body, /rerun with --pg/);
  const corpusDefault = await run(["story", "baseline", "backfill", "drive-machinery", "--pg"], {
    store: offlineDeps.store,
    uatStore: new InMemoryStore(),
    storyBaselineBackfill: {
      gitState: () => ({ commitSha: "head", clean: true }),
      resolveSigner: () => ({ ok: true, signer: "owner@example.com" }),
      now: () => new Date("2026-09-09T00:00:00.000Z"),
    },
  });
  assert.equal(corpusDefault.ok, true);
  assert.match(corpusDefault.body, /drive-machinery: declined/);
  assert.doesNotMatch(corpusDefault.body, /story declaration not found or unreadable/);
});

test("command dispatch drives the real story-baseline git, signer and clock defaults", async () => {
  const root = mkdtempSync(join(tmpdir(), "story-baseline-defaults-"));
  const entryCwd = process.cwd();
  const entrySigner = process.env["STORYTREE_SIGNER"];
  const git = (args: readonly string[]): string =>
    execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();

  try {
    writeSpec(root, "good", [
      "---", "id: good", "tier: story", "title: Good", "outcome: works", "status: proposed",
      "proof_mode: UAT", "capabilities:", "  - cap-good", "---", "", "Body.",
    ]);
    writeFileSync(join(root, "good", "cap-good.md"), [
      "---", "id: cap-good", "tier: capability", "title: Cap", "outcome: works", "status: building",
      "proof_mode: integration-test", "---", "", "Body.",
    ].join("\n"));
    writeFileSync(join(root, "tracked.txt"), "clean\n");
    git(["init", "-b", "main"]);
    git(["config", "user.email", "fixture@storytree.test"]);
    git(["config", "user.name", "fixture"]);
    git(["config", "commit.gpgsign", "false"]);
    git(["config", "core.autocrlf", "false"]);
    git(["add", "-A"]);
    git(["commit", "-m", "fixture"]);
    const head = git(["rev-parse", "HEAD"]);

    process.env["STORYTREE_SIGNER"] = "fixture@storytree.test";
    process.chdir(root);
    assert.deepEqual(readGitState(), { commitSha: head, clean: true });

    const store = new InMemoryStore();
    await store.appendEvent({
      id: "proof",
      kind: SIGNING_EVENT_KIND,
      type: "created",
      doc: {
        unitId: "cap-good", proofMode: "capability", outcome: "pass", commitSha: head,
        signer: "spine:storytree", runId: "proof", evidence: [], at: "2026-09-09T00:00:00.000Z",
      },
      actor: "spine:storytree",
    });
    const before = Date.now();
    const recorded = await run(["story", "baseline", "backfill", "good", "--pg"], {
      store,
      uatStore: store,
      storiesDir: root,
    });
    const after = Date.now();
    assert.equal(recorded.ok, true, recorded.body);
    assert.match(recorded.body, /good: recorded/);
    const events = await store.readEvents();
    const baseline = events.find((event) =>
      (event.doc as { storyBaseline?: unknown }).storyBaseline !== undefined,
    )?.doc as Verdict | undefined;
    assert.ok(baseline !== undefined);
    assert.equal(baseline.commitSha, head, "the public route used the real git default's HEAD");
    assert.equal(baseline.signer, "fixture@storytree.test", "the public route used the real signer default");
    assert.ok(
      Date.parse(baseline.at) >= before && Date.parse(baseline.at) <= after,
      "the public route stamped the baseline with the real clock default",
    );

    writeFileSync(join(root, "tracked.txt"), "dirty\n");
    assert.deepEqual(readGitState(), { commitSha: head, clean: false });
    const refused = await run(["story", "baseline", "backfill", "good", "--pg"], {
      store,
      uatStore: store,
      storiesDir: root,
    });
    assert.equal(refused.ok, false);
    assert.match(refused.body, /clean committed HEAD/);
    assert.equal((await store.readEvents()).length, events.length, "dirty default git state appended nothing");
  } finally {
    process.chdir(entryCwd);
    if (entrySigner === undefined) delete process.env["STORYTREE_SIGNER"];
    else process.env["STORYTREE_SIGNER"] = entrySigner;
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
