import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate, UatTest, UatTestWitness } from "@storytree/library";
import { SPINE_PRINCIPAL } from "@storytree/orchestrator";

import {
  flipFrontmatterStatus,
  runAdopt,
  type AdoptDeps,
  type AdoptStory,
} from "./adopt.js";

// ---------------------------------------------------------------------------
// flipFrontmatterStatus (pure)
// ---------------------------------------------------------------------------

const STORY_MD = ["---", "id: library", "tier: story", "status: mapped", "title: T", "---", "", "# body"].join("\n");

test("flip: mapped → proposed rewrites only the status line, byte-preserving the rest", () => {
  const res = flipFrontmatterStatus(STORY_MD, "mapped", "proposed");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.changed, true);
  assert.match(res.content, /^status: proposed$/m);
  assert.doesNotMatch(res.content, /status: mapped/);
  // everything else preserved
  assert.match(res.content, /id: library/);
  assert.match(res.content, /# body/);
});

test("flip: already `proposed` is idempotent (changed:false, no error)", () => {
  const proposed = STORY_MD.replace("status: mapped", "status: proposed");
  const res = flipFrontmatterStatus(proposed, "mapped", "proposed");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.changed, false);
});

test("flip: refuses a status that is neither from nor to (never flips a healthy/etc.)", () => {
  const healthy = STORY_MD.replace("status: mapped", "status: healthy");
  const res = flipFrontmatterStatus(healthy, "mapped", "proposed");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /status is "healthy"/);
});

test("flip: refuses a doc with no status line / no frontmatter", () => {
  assert.equal(flipFrontmatterStatus("# no frontmatter", "mapped", "proposed").ok, false);
  assert.equal(flipFrontmatterStatus("---\nid: x\n---\n", "mapped", "proposed").ok, false);
});

// ---------------------------------------------------------------------------
// runAdopt (pure-by-injection)
// ---------------------------------------------------------------------------

function gate(n: number, over: Partial<ReliabilityGate> = {}): ReliabilityGate {
  return {
    id: `library#gate-${n}`,
    title: `gate ${n}`,
    kind: "observe",
    covers: [],
    proofCommand: `pnpm --filter pkg-${n} test`,
    ...over,
  };
}

function leg(n: number, witness: UatTestWitness, over: Partial<UatTest> = {}): UatTest {
  return { id: `library#uat-${n}`, title: `leg ${n}`, witness, wouldBe: false, ...over };
}

interface RecordingStore {
  appended: { doc: { signer: string; approvedBy?: string; proofMode: string } }[];
  appendEvent(e: { doc: unknown }): Promise<unknown>;
}
function recordingStore(): RecordingStore {
  const appended: RecordingStore["appended"] = [];
  return {
    appended,
    async appendEvent(e) {
      appended.push(e as RecordingStore["appended"][number]);
      return e;
    },
  };
}

const TWO_OBSERVE: AdoptStory = {
  status: "mapped",
  reliabilityGates: [gate(1, { covers: ["cap-a"] }), gate(2)],
  uatTests: [],
};

function deps(over: Partial<AdoptDeps> = {}): AdoptDeps {
  return {
    store: recordingStore() as unknown as AdoptDeps["store"],
    loadStory: () => TWO_OBSERVE,
    gitState: () => ({ commitSha: "abc1234", clean: true }),
    observe: async () => ({ code: 0 }),
    resolveApprover: () => ({ ok: true, signer: "hua.mick@gmail.com" }),
    flipStatusToProposed: () => ({ ok: true, changed: true, content: "..." }),
    now: () => new Date("2026-06-23T00:00:00.000Z"),
    ...over,
  };
}

test("adopt GREEN: signs each observe gate (spine signer + approvedBy) and flips mapped→proposed", async () => {
  const store = recordingStore();
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"] }));
  assert.equal(env.ok, true);
  // both observe gates signed
  assert.equal(store.appended.length, 2);
  for (const ev of store.appended) {
    assert.equal(ev.doc.proofMode, "adopted");
    assert.equal(ev.doc.signer, SPINE_PRINCIPAL);
    assert.equal(ev.doc.approvedBy, "hua.mick@gmail.com");
  }
  assert.match(env.body, /2\/2 observe gate/);
  assert.match(env.body, /flipped mapped → proposed/);
  assert.match(env.body, new RegExp(SPINE_PRINCIPAL));
});

test("adopt: a non-observe gate is skipped (only observe gates are observe-and-signable)", async () => {
  const store = recordingStore();
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1), gate(2, { kind: "build-tests", proofCommand: undefined })],
    uatTests: [],
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  assert.equal(env.ok, true);
  assert.equal(store.appended.length, 1); // only the observe gate signed
  assert.match(env.body, /1\/1 observe gate/);
});

test("adopt REFUSE: a non-brownfield status (healthy) is never adopted", async () => {
  const store = recordingStore();
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => ({ status: "healthy", reliabilityGates: [gate(1)], uatTests: [] }) }));
  assert.equal(env.ok, false);
  assert.match(env.body, /is "healthy", not a brownfield/);
  assert.equal(store.appended.length, 0);
});

test("adopt REFUSE: a story with no observe gates", async () => {
  const env = await runAdopt("library", {}, deps({ loadStory: () => ({ status: "mapped", reliabilityGates: [gate(1, { kind: "build-tests", proofCommand: undefined })], uatTests: [] }) }));
  assert.equal(env.ok, false);
  assert.match(env.body, /no `observe` reliability gates/);
});

test("adopt REFUSE: no approver resolved (the adoption decision is a human act, ADR-0097)", async () => {
  const store = recordingStore();
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], resolveApprover: () => ({ ok: false, error: "no signer" }) }));
  assert.equal(env.ok, false);
  assert.match(env.body, /no signer/);
  assert.equal(store.appended.length, 0);
});

test("adopt REFUSE: no live store (a verdict that evaporates greens nothing)", async () => {
  const env = await runAdopt("library", {}, deps({ store: null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /live store/);
});

test("adopt REFUSE: a dirty tree (an adopted verdict pins the clean commit it observed)", async () => {
  const store = recordingStore();
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], gitState: () => ({ commitSha: "dirty99", clean: false }) }));
  assert.equal(env.ok, false);
  assert.match(env.body, /clean committed HEAD/);
  assert.equal(store.appended.length, 0);
});

test("adopt: a red observe gate is not signed, ok:false, but the story still entered the process (flip happened)", async () => {
  const store = recordingStore();
  let flipped = false;
  const env = await runAdopt("library", {}, deps({
    store: store as unknown as AdoptDeps["store"],
    observe: async (cmd) => ({ code: cmd.includes("pkg-2") ? 1 : 0 }), // gate-2 fails
    flipStatusToProposed: () => {
      flipped = true;
      return { ok: true, changed: true, content: "..." };
    },
  }));
  assert.equal(env.ok, false); // not all gates signed
  assert.equal(store.appended.length, 1); // only gate-1 signed
  assert.equal(flipped, true); // the adoption decision still entered the process
  assert.match(env.body, /1\/2 observe gate/);
});

// ---------------------------------------------------------------------------
// ADR-0106: the adopt pass classifies each UAT leg's witness and routes it
// ---------------------------------------------------------------------------

/** Read the appended verdicts' unit ids (the recording store keeps the full event at runtime). */
function appendedUnitIds(store: RecordingStore): string[] {
  return store.appended.map((e) => (e.doc as unknown as { unitId: string }).unitId);
}

test("ADR-0106: adopt observe-signs a machine leg, leaves human + either legs for the operator", async () => {
  const store = recordingStore();
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1)], // one observe gate → a machine leg routes to observe
    uatTests: [leg(1, "machine"), leg(2, "human"), leg(3, "either")],
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  assert.equal(env.ok, true);
  // gate-1 + the ONE machine leg are signed; the human and the (undecided→human) `either` legs are NOT.
  const ids = appendedUnitIds(store);
  assert.deepEqual(ids.sort(), ["library#gate-1", "library#uat-1"]);
  assert.ok(!ids.includes("library#uat-2") && !ids.includes("library#uat-3"));
  // every signed row is an `adopted` machine verdict signed by the spine.
  for (const ev of store.appended) {
    assert.equal(ev.doc.proofMode, "adopted");
    assert.equal(ev.doc.signer, SPINE_PRINCIPAL);
  }
  assert.match(env.body, /1\/1 machine observe-signed · 2 await your witness · 0 deferred/);
  assert.match(env.body, /library#uat-2 \(human\) — awaits your "I saw it work"/);
});

test("ADR-0106: the shared observe suite runs ONCE for the gate + the machine legs it covers (memoized)", async () => {
  const store = recordingStore();
  const calls: string[] = [];
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1)],
    uatTests: [leg(1, "machine"), leg(2, "machine"), leg(3, "machine")],
  };
  const env = await runAdopt("library", {}, deps({
    store: store as unknown as AdoptDeps["store"],
    loadStory: () => story,
    observe: async (cmd) => {
      calls.push(cmd);
      return { code: 0 };
    },
  }));
  assert.equal(env.ok, true);
  // gate-1 + all 3 machine legs share `pnpm --filter pkg-1 test` → observed exactly ONCE…
  assert.deepEqual(calls, ["pnpm --filter pkg-1 test"]);
  // …yet each obligation still earns its OWN signed verdict (gate-1 + uat-1..3 = 4 rows).
  assert.equal(store.appended.length, 4);
  assert.match(env.body, /3\/3 machine observe-signed/);
});

test("ADR-0106: a machine leg whose covering observe gate declares no command is not signed (fail-closed)", async () => {
  const store = recordingStore();
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1, { proofCommand: undefined })], // observe gate, but no command to observe
    uatTests: [leg(1, "machine")],
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  assert.equal(env.ok, false);
  assert.equal(store.appended.length, 0); // nothing observable → nothing signed
  assert.match(env.body, /library#uat-1 \(machine\) — covering gate library#gate-1 declares no command/);
});

test("ADR-0106: an aspirational (wouldBe) leg is not an obligation — never classified or signed", async () => {
  const store = recordingStore();
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1)],
    uatTests: [leg(1, "machine", { wouldBe: true })],
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  assert.equal(env.ok, true);
  assert.deepEqual(appendedUnitIds(store), ["library#gate-1"]); // only the gate; the wouldBe leg is skipped
  assert.doesNotMatch(env.body, /UAT legs \(ADR-0106\)/); // no real legs → no UAT-legs section rendered
});

// ---------------------------------------------------------------------------
// uat-bound-command-adoption: an invalid/unbound machine leg fails the WHOLE UAT-signing
// pass BEFORE any leg signs — no fallback to another gate, no partial UAT verdict set.
// ---------------------------------------------------------------------------

test("uat-bound-command-adoption: an unbound machine leg fails the whole UAT-signing pass — no partial verdict, even for a sibling leg that resolves fine on its own", async () => {
  const store = recordingStore();
  const story: AdoptStory = {
    status: "mapped",
    reliabilityGates: [gate(1)], // one observe gate — leg-1 below would resolve fine against it alone
    uatTests: [
      leg(1, "machine", { proofGateId: "library#gate-1" }), // validly bound to the declared gate
      leg(2, "machine"), // no proof-gate binding — refused (uat-machine-gate-resolution)
    ],
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  // The whole envelope fails: an invalid/unbound machine leg is never a partial-credit situation.
  assert.equal(env.ok, false);
  const ids = appendedUnitIds(store);
  // Reliability-gate signing stays a SEPARATE behaviour (unaffected by the UAT leg's refusal) — the
  // gate itself still signs its own `adopted` verdict …
  assert.deepEqual(ids, ["library#gate-1"]);
  // … but leg-1's otherwise-valid binding does not save it: NEITHER leg is signed — no fallback to
  // another gate, and no partial UAT verdict set, once any machine leg in the story is unbound.
  assert.ok(!ids.includes("library#uat-1"));
  assert.ok(!ids.includes("library#uat-2"));
});
