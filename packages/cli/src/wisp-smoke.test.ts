import test from "node:test";
import assert from "node:assert/strict";

import { rollupStatus, workEvent } from "@storytree/orchestrator";
import type { Verdict } from "@storytree/proof-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

import {
  DEFAULT_WISP_DWELL_SEC,
  emitWisp,
  gateEmitWisp,
  runWispSmoke,
} from "./wisp-smoke.js";
import type { WispSmokeStore } from "./wisp-smoke.js";

/**
 * The dry-run wisp SMOKE (ADR-0080), proven offline: a transient `building` mark verifies the
 * in-flight-build wisp pipeline (ADR-0048) WITHOUT a billed build and WITHOUT persisting any proof.
 * The RED-GREEN bar: the smoke appends EXACTLY ONE building mark then deletes it, NEVER writes a
 * verdict, and leaves the target unit's rollupStatus byte-identical — proven against a fake work
 * store and a fake clock (no real DB, no real wait).
 */

/** A faithful in-memory work store: append-only PLUS the smoke's narrow `deleteWorkEvent` exception. */
class FakeWorkStore implements WispSmokeStore {
  events: StoreEvent[] = [];
  #seq = 0;

  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent> {
    this.#seq += 1;
    const stored: StoreEvent = {
      seq: this.#seq,
      id: e.id,
      kind: e.kind,
      type: e.type,
      doc: e.doc,
      actor: e.actor ?? "system",
      at: `2026-06-20T00:00:0${this.#seq}.000Z`,
    };
    this.events.push(stored);
    return stored;
  }

  /** Mirror PgWorkStore: remove ONLY the building work-event(s) for (unitId, runId). */
  async deleteWorkEvent(unitId: string, runId: string): Promise<number> {
    const before = this.events.length;
    this.events = this.events.filter((e) => {
      const doc = e.doc as { unitId?: string; event?: string; runId?: string } | null;
      const isSmokeBuilding =
        e.kind === "work" &&
        doc?.event === "building" &&
        doc.unitId === unitId &&
        doc.runId === runId;
      return !isSmokeBuilding;
    });
    return before - this.events.length;
  }

  async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    return filter?.id === undefined ? this.events : this.events.filter((e) => e.id === filter.id);
  }
}

const PASS_VERDICT: Verdict = {
  unitId: "library",
  proofMode: "story",
  outcome: "pass",
  commitSha: "cafebabe",
  signer: "tester@example.com",
  runId: "real-run-1",
  outputVersion: "v1",
  evidence: [],
  at: "2026-06-19T00:00:00.000Z",
};

/** A no-op sleep: the dwell decrements its own budget per tick, so it terminates with no real wait. */
const noopSleep = async (): Promise<void> => {};

test("runWispSmoke appends EXACTLY ONE building mark then hard-deletes it (zero smoke rows after)", async () => {
  const store = new FakeWorkStore();
  // Seed the unit's durable history: a prior real build → healthy.
  await store.appendEvent(workEvent({ unitId: "library", event: "building", runId: "real-run-1", tier: "story" }, "tester@example.com"));
  await store.appendEvent({ id: "real-run-1:library", kind: "signing", type: "created", doc: PASS_VERDICT, actor: "tester@example.com" });

  const before = rollupStatus("library", await store.readEvents());
  assert.equal(before, "healthy");
  const seedLen = store.events.length;

  const result = await runWispSmoke({
    store,
    unitId: "library",
    tier: "story",
    runId: "wisp-smoke-1",
    signer: "tester@example.com",
    dwellMs: DEFAULT_WISP_DWELL_SEC * 1_000,
    sleep: noopSleep,
    log: () => {},
  });

  assert.deepEqual(result, { appended: true, deleted: 1 });
  // Exactly one smoke row was appended, and it is gone: the store is back to its seeded length.
  assert.equal(store.events.length, seedLen);
  // No building row for the smoke runId survives.
  assert.equal(
    store.events.filter((e) => (e.doc as { runId?: string }).runId === "wisp-smoke-1").length,
    0,
  );
});

test("runWispSmoke NEVER writes a verdict — only a building work event ever lands", async () => {
  const store = new FakeWorkStore();
  // Spy: capture every kind the smoke appends.
  const appendedKinds: string[] = [];
  const spy: WispSmokeStore = {
    appendEvent: async (e) => {
      appendedKinds.push(e.kind);
      return store.appendEvent(e);
    },
    deleteWorkEvent: (u, r) => store.deleteWorkEvent(u, r),
  };
  await runWispSmoke({
    store: spy,
    unitId: "library",
    tier: "story",
    runId: "wisp-smoke-2",
    signer: "tester@example.com",
    dwellMs: 60_000,
    sleep: noopSleep,
    log: () => {},
  });
  assert.deepEqual(appendedKinds, ["work"], "the smoke must append ONLY a work event, never a signing/verdict");
});

test("the unit's rollupStatus is BYTE-IDENTICAL before vs after the smoke", async () => {
  const store = new FakeWorkStore();
  await store.appendEvent(workEvent({ unitId: "library", event: "building", runId: "real-run-1", tier: "story" }, "tester@example.com"));
  await store.appendEvent({ id: "real-run-1:library", kind: "signing", type: "created", doc: PASS_VERDICT, actor: "tester@example.com" });
  const before = rollupStatus("library", await store.readEvents());

  await runWispSmoke({
    store,
    unitId: "library",
    tier: "story",
    runId: "wisp-smoke-3",
    signer: "tester@example.com",
    dwellMs: 90_000,
    sleep: noopSleep,
    log: () => {},
  });

  const after = rollupStatus("library", await store.readEvents());
  assert.equal(after, before, "the durable history (and so the derived status) must be untouched");
  assert.equal(after, "healthy");
});

test("DURING the dwell the building row is LIVE (the wisp would render) — it clears only on cleanup", async () => {
  const store = new FakeWorkStore();
  let liveDuringDwell = false;
  // Inspect the store mid-dwell: the smoke's building row must be present for the wisp to render.
  const sleep = async (): Promise<void> => {
    liveDuringDwell =
      store.events.filter((e) => {
        const doc = e.doc as { event?: string; runId?: string };
        return doc.event === "building" && doc.runId === "wisp-smoke-4";
      }).length === 1;
  };

  const result = await runWispSmoke({
    store,
    unitId: "library",
    tier: "story",
    runId: "wisp-smoke-4",
    signer: "tester@example.com",
    dwellMs: 75_000,
    sleep,
    log: () => {},
  });

  assert.equal(liveDuringDwell, true, "the building row must be live during the dwell");
  assert.equal(result.deleted, 1, "and removed exactly once on cleanup");
  assert.equal(store.events.length, 0, "nothing persists past the dwell");
});

test("runWispSmoke still cleans up when the dwell THROWS (covers fail / ctrl-c via the finally)", async () => {
  const store = new FakeWorkStore();
  const boom = new Error("dwell interrupted");
  const sleep = async (): Promise<void> => {
    throw boom;
  };
  await assert.rejects(
    runWispSmoke({
      store,
      unitId: "library",
      tier: "story",
      runId: "wisp-smoke-5",
      signer: "tester@example.com",
      dwellMs: 75_000,
      sleep,
      log: () => {},
    }),
    /dwell interrupted/,
  );
  // The finally still ran the hard delete — no orphaned smoke row.
  assert.equal(store.events.length, 0);
});

// ── gateEmitWisp (the shared dry-run-only + dwell precheck) ──────────────────

test("gateEmitWisp refuses a non-dry-run (--live/--real already light real wisps)", () => {
  const gate = gateEmitWisp({ dryRun: false, retryCmd: "storytree node build x --dry-run --emit-wisp" });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.match(gate.refusal.body, /DRY-RUN smoke/);
});

test("gateEmitWisp refuses a non-positive --dwell", () => {
  for (const bad of [0, -5, Number.NaN]) {
    const gate = gateEmitWisp({ dryRun: true, dwellSec: bad, retryCmd: "retry" });
    assert.equal(gate.ok, false, `dwell ${bad} must be refused`);
    if (!gate.ok) assert.match(gate.refusal.body, /--dwell must be a positive number/);
  }
});

test("gateEmitWisp defaults the dwell when unset, and passes a valid one through", () => {
  const def = gateEmitWisp({ dryRun: true, retryCmd: "retry" });
  assert.deepEqual(def, { ok: true, dwellSec: DEFAULT_WISP_DWELL_SEC });
  const explicit = gateEmitWisp({ dryRun: true, dwellSec: 30, retryCmd: "retry" });
  assert.deepEqual(explicit, { ok: true, dwellSec: 30 });
});

// ── emitWisp (the orchestration, with injected DB + store seams) ─────────────

test("emitWisp REQUIRES the live DB — a down DB is a fail-closed refusal, the store never opens", async () => {
  let opened = false;
  const env = await emitWisp(
    {
      unitId: "library",
      tier: "story",
      runId: "wisp-smoke-6",
      signer: "tester@example.com",
      dwellSec: 75,
      retryCmd: "storytree story build library --dry-run --emit-wisp",
    },
    {
      ensureDb: async () => ({ ok: false, reason: "instance STOPPED" }),
      openStore: async () => {
        opened = true;
        return { store: new FakeWorkStore(), close: async () => {} };
      },
      log: () => {},
    },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /REQUIRES the live DB/);
  assert.match(env.body, /instance STOPPED/);
  assert.equal(opened, false, "the store must not open when the DB is unreachable");
});

test("emitWisp success: building appended + hard-deleted, deep link + honest framing, no verdict", async () => {
  const store = new FakeWorkStore();
  let closed = false;
  const env = await emitWisp(
    {
      unitId: "library",
      tier: "story",
      runId: "wisp-smoke-7",
      signer: "tester@example.com",
      dwellSec: 75,
      retryCmd: "storytree story build library --dry-run --emit-wisp",
    },
    {
      ensureDb: async () => ({ ok: true, started: false }),
      openStore: async () => ({ store, close: async () => { closed = true; } }),
      sleep: noopSleep,
      log: () => {},
      installSigintCleanup: () => () => {}, // no real signal handler in tests
      studioUrl: "http://localhost:5173",
    },
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /wisp smoke library — DRY-RUN/);
  assert.match(env.body, /http:\/\/localhost:5173\/#\/tree/);
  assert.match(env.body, /NEVER a verdict/);
  assert.match(env.body, /hard-deleted the transient building row/);
  assert.equal(closed, true, "the pool is always closed");
  assert.equal(store.events.length, 0, "the transient row is gone");
});
