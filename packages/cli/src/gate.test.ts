import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "@storytree/library";
import type { StoreEvent } from "@storytree/storage-protocol";

import { gateCommand } from "./gate.js";
import type { GateDeps, GateVerdictStoreLike } from "./gate.js";

// ── doubles ────────────────────────────────────────────────────────────────

function memStore(): GateVerdictStoreLike & { events: StoreEvent[] } {
  const events: StoreEvent[] = [];
  let seq = 0;
  return {
    events,
    async appendEvent(e) {
      const ev = { ...e, seq: seq++, at: "2026-06-21T00:00:00.000Z" } as unknown as StoreEvent;
      events.push(ev);
      return ev;
    },
    async readEvents() {
      return events;
    },
  };
}

const GATES: ReliabilityGate[] = [
  {
    id: "proof-protocol#gate-1",
    title: "The port's own suite is green",
    kind: "observe",
    covers: [],
    proofCommand: "pnpm --filter @storytree/proof-protocol test",
  },
];

function deps(over: Partial<GateDeps> = {}): GateDeps {
  return {
    store: memStore(),
    loadReliabilityGates: () => GATES,
    loadUatTests: () => [],
    gitState: () => ({ commitSha: "abc1234", clean: true }),
    observe: async () => ({ code: 0 }),
    resolveSigner: () => ({ ok: true, signer: "hua.mick@gmail.com" }),
    now: () => new Date("2026-06-21T00:00:00.000Z"),
    ...over,
  };
}

// ── list ─────────────────────────────────────────────────────────────────────

test("gate list shows each gate, its kind, command and PROVEN glyph (– before adoption)", async () => {
  const env = await gateCommand({ mode: "list", target: "proof-protocol" }, {}, deps());
  assert.equal(env.ok, true);
  assert.match(env.body, /proof-protocol#gate-1/);
  assert.match(env.body, /kind=observe/);
  assert.match(env.body, /proven=–/);
  assert.match(env.body, /unproven/);
});

test("gate list surfaces a build-tests gate's (build:) node, not a stray title backtick", async () => {
  const env = await gateCommand(
    { mode: "list", target: "brown" },
    {},
    deps({
      loadReliabilityGates: () => [
        {
          id: "brown#gate-1",
          title: "Build tests for the Postgres transactional path",
          kind: "build-tests",
          covers: [],
          // a stray first title backtick gets captured as proofCommand, but the operative ref is buildNode
          proofCommand: "PgLibraryStore",
          buildNode: "event-sourced-store-seam",
        },
      ],
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /kind=build-tests/);
  assert.match(env.body, /\(build: event-sourced-store-seam\)/);
  // the stray title backtick must NOT be rendered as a proof command
  assert.doesNotMatch(env.body, /`PgLibraryStore`/);
});

test("gate list on a story with no gates says so", async () => {
  const env = await gateCommand(
    { mode: "list", target: "x" },
    {},
    deps({ loadReliabilityGates: () => [] }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /declares no reliability gates/);
});

// ── run: the happy path ────────────────────────────────────────────────────

test("gate run observes an observe gate green at a clean HEAD and signs an adopted verdict", async () => {
  const store = memStore();
  const env = await gateCommand(
    { mode: "run", target: "proof-protocol#gate-1" },
    {},
    deps({ store }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /Adopted reliability gate/);
  assert.match(env.body, /proof mode: adopted/);
  // The verdict PERSISTED — one signed `adopted` verdict for the gate id.
  assert.equal(store.events.length, 1);
  const doc = (store.events[0] as unknown as { doc: { proofMode: string; unitId: string } }).doc;
  assert.equal(doc.proofMode, "adopted");
  assert.equal(doc.unitId, "proof-protocol#gate-1");
  // The reliability-gate roll-up now reads GREEN.
  assert.match(env.body, /reliability gates: GREEN/);
});

// ── run: fail-closed refusals ──────────────────────────────────────────────

test("gate run refuses an unknown gate id", async () => {
  const env = await gateCommand({ mode: "run", target: "proof-protocol#gate-9" }, {}, deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /no reliability gate "proof-protocol#gate-9"/);
});

test("gate run on a build-tests gate WITHOUT --real refuses, pointing at the build (--real), not observe-and-sign", async () => {
  const store = memStore();
  const env = await gateCommand(
    { mode: "run", target: "brown#gate-1" },
    {},
    deps({
      store,
      loadReliabilityGates: () => [
        { id: "brown#gate-1", title: "Add tests", kind: "build-tests", covers: [], buildNode: "brown-seam" },
      ],
    }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /kind 'build-tests'/);
  assert.match(env.body, /genuine red→green build/);
  // The retry points at the gate→loop build (ADR-0098), not observe-and-sign and not `node build`.
  assert.ok((env.next ?? []).some((n) => /gate run brown#gate-1 --real/.test(n)));
  assert.equal(store.events.length, 0);
});

test("gate run on a build-tests gate WITH --real but no (build:) reference refuses, asking for one", async () => {
  let driverCalls = 0;
  const env = await gateCommand(
    { mode: "run", target: "brown#gate-1" },
    { real: true },
    deps({
      loadReliabilityGates: () => [{ id: "brown#gate-1", title: "Add tests", kind: "build-tests", covers: [] }],
      driveBuildTestsGate: async () => {
        driverCalls++;
        return { ok: true, body: "should not run" };
      },
    }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /declares no build reference/);
  assert.match(env.body, /\(build: <node-id>\)/);
  assert.equal(driverCalls, 0, "the driver must not run without a build reference");
});

test("gate run on a build-tests gate WITH --real + a (build:) ref routes to the injected build driver", async () => {
  const seen: { gate?: ReliabilityGate; signer?: string } = {};
  const env = await gateCommand(
    { mode: "run", target: "brown#gate-1" },
    { real: true, signer: "builder@example.com" },
    deps({
      loadReliabilityGates: () => [
        { id: "brown#gate-1", title: "Add tests", kind: "build-tests", covers: ["brown-cap"], buildNode: "brown-seam" },
      ],
      driveBuildTestsGate: async (gate, signer) => {
        seen.gate = gate;
        if (signer !== undefined) seen.signer = signer;
        return { ok: true, body: `drove ${gate.id} via ${gate.buildNode}` };
      },
    }),
  );
  assert.equal(env.ok, true);
  assert.equal(env.body, "drove brown#gate-1 via brown-seam");
  assert.equal(seen.gate?.id, "brown#gate-1");
  assert.equal(seen.gate?.buildNode, "brown-seam");
  assert.equal(seen.signer, "builder@example.com");
});

test("gate run --real on a build-tests gate refuses when the build driver is not wired (read-only/offline)", async () => {
  // Omit driveBuildTestsGate entirely — the default deps() never sets it (offline / read-only).
  const env = await gateCommand(
    { mode: "run", target: "brown#gate-1" },
    { real: true },
    deps({
      loadReliabilityGates: () => [
        { id: "brown#gate-1", title: "Add tests", kind: "build-tests", covers: [], buildNode: "brown-seam" },
      ],
    }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not wired in this context/);
});

test("gate run refuses when the observed command is RED (a non-zero exit) — no verdict", async () => {
  const store = memStore();
  const env = await gateCommand(
    { mode: "run", target: "proof-protocol#gate-1" },
    {},
    deps({ store, observe: async () => ({ code: 1 }) }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /did NOT pass/);
  assert.equal(store.events.length, 0);
});

test("gate run refuses on a DIRTY tree (the adopted verdict pins a clean commit)", async () => {
  const store = memStore();
  const env = await gateCommand(
    { mode: "run", target: "proof-protocol#gate-1" },
    {},
    deps({ store, gitState: () => ({ commitSha: "dirty99", clean: false }) }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /tree is not clean/);
  assert.equal(store.events.length, 0);
});

test("gate run refuses offline (no --pg store — a verdict that does not persist greens nothing)", async () => {
  const env = await gateCommand(
    { mode: "run", target: "proof-protocol#gate-1" },
    {},
    deps({ store: null }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /run with --pg/);
});

test("gate run refuses a blank signer chain (a verdict must be attributable)", async () => {
  const env = await gateCommand(
    { mode: "run", target: "proof-protocol#gate-1" },
    {},
    deps({ resolveSigner: () => ({ ok: false, error: "no signer" }) }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no signer/);
});
