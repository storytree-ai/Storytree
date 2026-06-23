import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "@storytree/library";
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
  };
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => story }));
  assert.equal(env.ok, true);
  assert.equal(store.appended.length, 1); // only the observe gate signed
  assert.match(env.body, /1\/1 observe gate/);
});

test("adopt REFUSE: a non-brownfield status (healthy) is never adopted", async () => {
  const store = recordingStore();
  const env = await runAdopt("library", {}, deps({ store: store as unknown as AdoptDeps["store"], loadStory: () => ({ status: "healthy", reliabilityGates: [gate(1)] }) }));
  assert.equal(env.ok, false);
  assert.match(env.body, /is "healthy", not a brownfield/);
  assert.equal(store.appended.length, 0);
});

test("adopt REFUSE: a story with no observe gates", async () => {
  const env = await runAdopt("library", {}, deps({ loadStory: () => ({ status: "mapped", reliabilityGates: [gate(1, { kind: "build-tests", proofCommand: undefined })] }) }));
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
