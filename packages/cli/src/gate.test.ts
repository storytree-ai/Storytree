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

test("gate run refuses a non-observe gate (build-tests) — earned by a real build, not observe-and-sign", async () => {
  const store = memStore();
  const env = await gateCommand(
    { mode: "run", target: "brown#gate-1" },
    {},
    deps({
      store,
      loadReliabilityGates: () => [{ id: "brown#gate-1", title: "Add tests", kind: "build-tests" }],
    }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not 'observe'/);
  assert.ok((env.next ?? []).some((n) => /node build brown --real/.test(n)));
  assert.equal(store.events.length, 0);
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
