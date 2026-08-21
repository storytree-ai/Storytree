import test from "node:test";
import assert from "node:assert/strict";

import type { StoreEvent } from "@storytree/storage-protocol";
import type { UatTestCriterion } from "@storytree/library";
import {
  canonicalUatCriterionContent,
  criterionRevisionId,
  parseUatTestCriteria,
} from "@storytree/library";
import { SIGNING_EVENT_KIND, Verdict } from "@storytree/proof-protocol";

import { uatCommand, type UatDeps, type GitState } from "./uat.js";

/**
 * The per-test UAT write surface (ADR-0082): `uat attest` mints an operator-attested verdict only
 * when every honesty wall holds, and `uat list` reads the per-test PROVEN state (the signed verdict,
 * distinct from a vouch) and the story's AND-roll-up. All offline — store, git, loader, signer, clock
 * injected.
 */

// A fake verdict store that mirrors PgWorkStore's fail-closed contract: a signing event must be a
// full Verdict (Verdict.parse), and readEvents replays everything appended (seq-ordered).
function fakeStore(seed: StoreEvent[] = []) {
  const events: StoreEvent[] = [...seed];
  const verdicts: Verdict[] = [];
  let seq = events.length;
  return {
    verdicts,
    events,
    store: {
      async appendEvent(e: {
        id: string;
        kind: string;
        type: "created";
        doc: unknown;
        actor?: string;
      }): Promise<StoreEvent> {
        seq += 1;
        let doc = e.doc;
        if (e.kind === SIGNING_EVENT_KIND) {
          const v = Verdict.parse(e.doc); // fail-closed, exactly like the real store
          verdicts.push(v);
          doc = v;
        }
        const ev: StoreEvent = {
          seq,
          id: e.id,
          kind: e.kind,
          type: e.type,
          doc,
          actor: e.actor ?? "system",
          at: (doc as { at?: string }).at ?? "2026-06-20T00:00:00.000Z",
        };
        events.push(ev);
        return ev;
      },
      async readEvents(): Promise<StoreEvent[]> {
        return [...events];
      },
    },
  };
}

const C1 = "uatc_000000000000000000000001";
const C2 = "uatc_000000000000000000000002";
const C3 = "uatc_000000000000000000000003";
const R1 = "uatr1:0000000000000001";
const R2 = "uatr1:0000000000000002";
const R3 = "uatr1:0000000000000003";

const C4 = "uatc_000000000000000000000004";
const R4 = "uatr1:0000000000000004";

const DEMO_TESTS: UatTestCriterion[] = [
  { criterionId: C1, revisionId: R1, title: "Human relay", witness: "human", wouldBe: false },
  {
    criterionId: C2,
    revisionId: R2,
    title: "Machine run",
    witness: "machine",
    wouldBe: false,
    proofGateId: "demo#gate-1",
  },
  { criterionId: C3, revisionId: R3, title: "Either", witness: "either", wouldBe: false },
];

/**
 * Deliberately UNBOUND: no command can sign it, so the surface must offer none (ADR-0405 D5). Kept
 * OUT of {@link DEMO_TESTS} — a story's UAT greens only when EVERY declared leg has a signed pass,
 * so adding a permanently-unsignable leg to the shared fixture would silently un-green the roll-up
 * tests rather than testing anything.
 */
const UNBOUND_LEG: UatTestCriterion = {
  criterionId: C4,
  revisionId: R4,
  title: "Machine, unbound",
  witness: "machine",
  wouldBe: false,
};
const WITH_UNBOUND: UatTestCriterion[] = [...DEMO_TESTS, UNBOUND_LEG];

/** The story's declared gates — `demo#gate-1` is the observe gate C2 binds to. */
const DEMO_GATES = [
  {
    id: "demo#gate-1",
    title: "The demo suite is green",
    kind: "observe" as const,
    proofCommand: "pnpm --filter demo test",
    covers: [],
  },
  {
    id: "demo#gate-2",
    title: "A regression leg",
    kind: "build-tests" as const,
    covers: [],
  },
];

function baseDeps(over: Partial<UatDeps> = {}): UatDeps {
  return {
    store: fakeStore().store,
    loadUatTestCriteria: (storyId) => (storyId === "demo" ? DEMO_TESTS : []),
    loadReliabilityGates: (storyId) => (storyId === "demo" ? DEMO_GATES : []),
    gitState: (): GitState | null => ({ commitSha: "cafebabe0123", clean: true }),
    identity: { sessionId: "goofy-aryabhata", branch: "claude/x" },
    resolveSigner: (flag) => ({ ok: true, signer: flag ?? "owner@example.com" }),
    now: () => new Date("2026-06-20T12:00:00.000Z"),
    readStoryBody: () => null,
    writeStoryBody: () => {
      throw new Error("writeStoryBody: not wired for this test");
    },
    readCorpusStories: () => [],
    ...over,
  };
}

// ── uat list ───────────────────────────────────────────────────────────────────

test("list: refuses with no story id", async () => {
  const r = await uatCommand({ mode: "list", target: undefined }, {}, baseDeps());
  assert.equal(r.ok, false);
});

test("list: a story with no UAT test criteria reports so (ok)", async () => {
  const r = await uatCommand({ mode: "list", target: "empty" }, {}, baseDeps());
  assert.equal(r.ok, true);
  assert.match(r.body, /declares no UAT test criteria/);
});

test("list: offline (no store) renders tests but drops the PROVEN column", async () => {
  const r = await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps({ store: null }));
  assert.equal(r.ok, true);
  assert.match(r.body, new RegExp(C1));
  assert.match(r.body, /witness=human/);
  assert.doesNotMatch(r.body, /proven=/);
  assert.match(r.body, /proven state needs the live store/);
});

test("list: with the store shows per-test PROVEN glyphs and the story roll-up", async () => {
  // Seed a signed pass for uat-1 only — so the story under-claims (not all proven).
  const f = fakeStore();
  await f.store.appendEvent({
    id: `r:${C1}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C1,
      criterionId: C1,
      revisionId: R1,
      proofMode: "operator-attested",
      outcome: "pass",
      commitSha: "abc",
      signer: "owner@example.com",
      runId: "r",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  const r = await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps({ store: f.store }));
  assert.equal(r.ok, true);
  assert.match(r.body, new RegExp(`${C1}.*proven=✓`));
  assert.match(r.body, new RegExp(`${C2}.*proven=–`));
  assert.match(r.body, /story UAT: unproven/);
});

// ── the proving route: never point at a command this leg's own guard refuses (ADR-0405 D5) ──────

test("list: offers ADOPT for an observe-bound machine leg, never `uat attest`", async () => {
  const r = await uatCommand(
    { mode: "list", target: "demo" },
    {},
    baseDeps({ loadUatTestCriteria: () => WITH_UNBOUND }),
  );
  assert.equal(r.ok, true);
  assert.ok(
    r.next.includes("storytree adopt demo --pg"),
    `the adopt run is the only path that signs a machine leg's criterion verdict; got ${JSON.stringify(r.next)}`,
  );
  // The bug this replaces: `uat attest <machine leg>` was offered unconditionally and is REFUSED
  // by the witness guard (ADR-0082 d.2). No offered command may name a machine criterion id.
  for (const cmd of r.next) {
    assert.ok(
      !(cmd.includes("uat attest") && (cmd.includes(C2) || cmd.includes(C4))),
      `offered a command its own guard refuses: ${cmd}`,
    );
  }
});

test("list: still offers `uat attest` for the human leg, naming that leg", async () => {
  const r = await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps());
  assert.ok(
    r.next.some((c) => c.includes("uat attest") && c.includes(C1)),
    `the human leg keeps its operator path; got ${JSON.stringify(r.next)}`,
  );
});

test("list: an UNBOUND machine leg is named as unprovable and gets no signing command", async () => {
  const r = await uatCommand(
    { mode: "list", target: "demo" },
    {},
    baseDeps({ loadUatTestCriteria: () => WITH_UNBOUND }),
  );
  assert.match(r.body, new RegExp(`✗ ${C4} — .*proof-gate binding`));
  for (const cmd of r.next) {
    assert.ok(!cmd.includes(C4), `an unbound leg cannot be signed by anything, yet was offered: ${cmd}`);
  }
});

test("list: a build-tests-bound machine leg routes to the build gate, not adopt", async () => {
  const buildBound: UatTestCriterion[] = [
    { criterionId: C2, revisionId: R2, title: "Regression", witness: "machine", wouldBe: false, proofGateId: "demo#gate-2" },
  ];
  const r = await uatCommand(
    { mode: "list", target: "demo" },
    {},
    baseDeps({ loadUatTestCriteria: () => buildBound }),
  );
  assert.ok(
    r.next.includes("storytree build gate demo#gate-2 --real --pg"),
    `a build-tests gate is earned by a red→green, never observe-and-sign; got ${JSON.stringify(r.next)}`,
  );
  assert.ok(!r.next.some((c) => c.startsWith("storytree adopt")), "must not offer the adopt run");
});

test("list: NON-VACUITY — the route genuinely varies with the binding", async () => {
  // If `resolveProvingRoute` ever collapsed to one answer these three would stop disagreeing, and
  // every assertion above would pass while verifying nothing.
  const only = async (tests: UatTestCriterion[]): Promise<string[]> =>
    (await uatCommand({ mode: "list", target: "demo" }, {}, baseDeps({ loadUatTestCriteria: () => tests })))
      .next.filter((c) => !c.startsWith("storytree tree"));
  const human = await only([DEMO_TESTS[0]!]);
  const observe = await only([DEMO_TESTS[1]!]);
  const unbound = await only([UNBOUND_LEG]);
  assert.notDeepEqual(human, observe);
  assert.notDeepEqual(observe, unbound);
  assert.deepEqual(unbound, [], "an unbound leg offers no signing command at all");
});

test("attest: a refused observe-bound machine leg points at ADOPT, not at a build", async () => {
  const r = await uatCommand({ mode: "attest", storyId: "demo", target: C2 }, {}, baseDeps());
  assert.equal(r.ok, false);
  assert.match(r.body, /refused/);
  assert.ok(
    r.next.some((c) => c.startsWith("storytree adopt demo --pg")),
    `got ${JSON.stringify(r.next)}`,
  );
  assert.ok(
    !r.next.some((c) => c.includes("node build")),
    "the old pointer sent observe-bound legs down the build path, which cannot sign them",
  );
});

test("attest: a refused UNBOUND machine leg names the missing binding and offers no signing verb", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C4 },
    {},
    baseDeps({ loadUatTestCriteria: () => WITH_UNBOUND }),
  );
  assert.equal(r.ok, false);
  assert.ok(
    r.next.some((c) => c.includes("no usable proof-gate binding")),
    `got ${JSON.stringify(r.next)}`,
  );
  assert.ok(!r.next.some((c) => c.startsWith("storytree adopt")), "nothing can sign an unbound leg");
});

// ── uat attest: refusals (the honesty walls) ─────────────────────────────────────

test("attest: refuses an unknown test id", async () => {
  const unknown = "uatc_000000000000000000000009";
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: unknown },
    {},
    baseDeps(),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, new RegExp(`no UAT criterion "${unknown}"`));
});

test("attest: refuses a bad --outcome", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { outcome: "maybe" },
    baseDeps(),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /--outcome must be pass\|fail/);
});

test("attest: refuses an unresolved signer", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ resolveSigner: () => ({ ok: false, error: "no signer" }) }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /no signer/);
});

test("attest: a machine-witness test refuses operator attestation (run the machine proof)", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C2 },
    {},
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /machine-witness/);
  assert.equal(f.verdicts.length, 0, "nothing is signed");
});

test("attest: a sandbox (agent) signer can never self-attest a human test", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { signer: "sandbox:claude-opus-4-8@run-9" },
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /self-attest|self-exempt/);
  assert.equal(f.verdicts.length, 0);
});

test("attest: the building session can never self-attest its own human test", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { signer: "goofy-aryabhata" }, // == the session identity
    baseDeps({ store: f.store, identity: { sessionId: "goofy-aryabhata", branch: "x" } }),
  );
  assert.equal(r.ok, false);
  assert.equal(f.verdicts.length, 0);
});

test("attest: refuses without --pg (the store is null)", async () => {
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ store: null }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /--pg/);
});

test("attest: refuses on a dirty tree (the verdict pins a commit)", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    {},
    baseDeps({ store: f.store, gitState: () => ({ commitSha: "abc", clean: false }) }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /DIRTY/);
  assert.equal(f.verdicts.length, 0);
});

// ── uat attest: the happy path ───────────────────────────────────────────────────

test("attest: a human test signs an operator-attested verdict into events.verdict", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { note: "saw the relay land" },
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, true);
  assert.equal(f.verdicts.length, 1);
  const v = f.verdicts[0]!;
  assert.equal(v.unitId, C1);
  assert.equal(v.criterionId, C1);
  assert.equal(v.revisionId, R1);
  assert.equal(v.proofMode, "operator-attested");
  assert.equal(v.outcome, "pass");
  assert.equal(v.signer, "owner@example.com");
  assert.equal(v.commitSha, "cafebabe0123");
  assert.equal(v.evidence[0]?.note, "saw the relay land");
  assert.match(r.body, /SIGNED verdict/);
});

test("attest: an either-witness test admits an operator attestation", async () => {
  const f = fakeStore();
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C3 },
    {},
    baseDeps({ store: f.store }),
  );
  assert.equal(r.ok, true);
  assert.equal(f.verdicts.length, 1);
});

test("attest: the story greens only once EVERY declared test has a signed pass", async () => {
  // demo has 3 tests; uat-2 is machine-witness, so seed its machine pass first.
  const f = fakeStore();
  await f.store.appendEvent({
    id: `m:${C2}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C2,
      criterionId: C2,
      revisionId: R2,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "abc",
      signer: "sandbox:runner@1",
      runId: "m",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  const deps = baseDeps({ store: f.store });

  // After attesting uat-1, the story is still unproven (uat-3 missing).
  const r1 = await uatCommand({ mode: "attest", storyId: "demo", target: C1 }, {}, deps);
  assert.equal(r1.ok, true);
  assert.match(r1.body, /story UAT:  unproven/);

  // Attesting the last test (uat-3) greens the story's UAT.
  const r2 = await uatCommand({ mode: "attest", storyId: "demo", target: C3 }, {}, deps);
  assert.equal(r2.ok, true);
  assert.match(r2.body, /story UAT:  GREEN/);
});

test("attest: a signed fail withers a previously-green story to unhealthy", async () => {
  const f = fakeStore();
  const deps = baseDeps({ store: f.store });
  // Prove uat-2 (machine) up front so a 3-test story can be fully green.
  await f.store.appendEvent({
    id: `m:${C2}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: {
      unitId: C2,
      criterionId: C2,
      revisionId: R2,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "abc",
      signer: "sandbox:runner@1",
      runId: "m",
      at: "2026-06-20T00:00:00.000Z",
    },
  });
  await uatCommand({ mode: "attest", storyId: "demo", target: C1 }, {}, deps);
  await uatCommand({ mode: "attest", storyId: "demo", target: C3 }, {}, deps);
  // Now regress uat-1 with a signed fail.
  const r = await uatCommand(
    { mode: "attest", storyId: "demo", target: C1 },
    { outcome: "fail" },
    deps,
  );
  assert.equal(r.ok, true);
  assert.match(r.body, /story UAT:  WITHERED/);
});

// ── uat rerevision ───────────────────────────────────────────────────────────

/** Author one criterion item whose `(revision-id:)` binds its own canonical content. */
function boundItem(criterionId: string, prose: string): string {
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(`1. ${prose}`));
  return `1. ${prose} _(criterion-id: ${criterionId})_ _(revision-id: ${revisionId})_`;
}

function storyBody(item: string): string {
  return `## UAT Test Criteria\n\n${item}\n`;
}

test("rerevision: refuses with no story id", async () => {
  const r = await uatCommand({ mode: "rerevision", target: undefined }, {}, baseDeps());
  assert.equal(r.ok, false);
  assert.match(r.body, /needs a story id/);
});

test("rerevision: refuses a story with no spec on disk", async () => {
  const r = await uatCommand({ mode: "rerevision", target: "ghost" }, {}, baseDeps());
  assert.equal(r.ok, false);
  assert.match(r.body, /no story spec for "ghost"/);
});

test("rerevision: a clean story reports no drift and writes nothing", async () => {
  const body = storyBody(boundItem(C1, "**Clean** _(witness: human)_: bound."));
  // writeStoryBody throws if called — reaching it would fail this test.
  const r = await uatCommand(
    { mode: "rerevision", target: "demo" },
    { write: true },
    baseDeps({ readStoryBody: () => body }),
  );
  assert.equal(r.ok, true);
  assert.match(r.body, /all bind their current content/);
});

test("rerevision: bare REPORTS drift, refuses, and writes nothing", async () => {
  const original = boundItem(C1, "**Claim** _(witness: human)_: original.");
  const drifted = storyBody(original.replace("original.", "edited."));
  const r = await uatCommand(
    { mode: "rerevision", target: "demo" },
    {}, // no --write; writeStoryBody would throw
    baseDeps({ readStoryBody: () => drifted }),
  );
  assert.equal(r.ok, false, "a story that does not parse is not an ok state");
  assert.match(r.body, /1 of 1 criterion revision\(s\) no longer bind/);
  assert.match(r.body, new RegExp(C1));
  assert.match(r.body, /Nothing was written/);
  assert.deepEqual(r.next, ["storytree uat rerevision demo --write"]);
});

test("rerevision: --write applies the recompute and preserves authored identity", async () => {
  const original = boundItem(C1, "**Claim** _(witness: human)_: original.");
  const drifted = storyBody(original.replace("original.", "edited."));
  const written: string[] = [];
  const r = await uatCommand(
    { mode: "rerevision", target: "demo" },
    { write: true },
    baseDeps({
      readStoryBody: () => drifted,
      writeStoryBody: (_id, b) => {
        written.push(b);
      },
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(written.length, 1);
  // The written body is what the REAL parser accepts — the point of the verb.
  const parsed = parseUatTestCriteria("demo", written[0]!);
  assert.equal(parsed[0]!.criterionId, C1, "identity is authored and immutable — never renumbered");
  assert.ok(parsed[0]!.previousRevisionId, "the superseded revision is recorded, preserving lineage");
});

test("rerevision: an unreadable identity is REFUSED, never repaired past", async () => {
  const r = await uatCommand(
    { mode: "rerevision", target: "demo" },
    { write: true },
    baseDeps({ readStoryBody: () => storyBody("1. **No identity annotations at all.**") }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /never invent, re-match or renumber an identity/);
});

// ── uat census ───────────────────────────────────────────────────────────────

test("census: counts BOTH written forms of the witness tag, and names the reader it used", async () => {
  const standalone = boundItem(C1, "**Standalone** _(witness: human)_: a.");
  const fusedProse = "**Fused**: b.";
  const fusedTags = "_(witness: human)(detail: beta#uat-1)_";
  const fusedRevision = criterionRevisionId(
    canonicalUatCriterionContent(`1. ${fusedProse} ${fusedTags}`),
  );
  const fused = `1. ${fusedProse} _(criterion-id: ${C2})_ _(revision-id: ${fusedRevision})_ ${fusedTags}`;

  const r = await uatCommand(
    { mode: "census", target: undefined },
    {},
    baseDeps({
      readCorpusStories: () => [
        { storyId: "alpha", sourcePath: "stories/alpha/story.md", body: storyBody(standalone) },
        { storyId: "beta", sourcePath: "stories/beta/story.md", body: storyBody(fused) },
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.match(r.body, /2 criterion\(s\) across 2 story\/stories/);
  assert.match(r.body, /human\s+2 leg\(s\)\s+across\s+2 story/);
  assert.match(r.body, /parseUatTestCriteria/, "the census names the reader it counted through");
});

test("census: an unreadable story REFUSES the whole count rather than under-reporting", async () => {
  const r = await uatCommand(
    { mode: "census", target: undefined },
    {},
    baseDeps({
      readCorpusStories: () => [
        {
          storyId: "broken",
          sourcePath: "stories/broken/story.md",
          body: storyBody(
            `1. **Stale** _(criterion-id: ${C1})_ _(revision-id: uatr1:0000000000000000)_`,
          ),
        },
      ],
    }),
  );
  assert.equal(r.ok, false);
  assert.match(r.body, /stories\/broken\/story\.md/);
  assert.match(r.body, /under-report exactly like a grep/);
});
