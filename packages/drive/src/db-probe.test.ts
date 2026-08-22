// The canonical DB-reachability probe (`pnpm db:probe`) — the verb CLAUDE.md's probe-don't-assume
// rule described in prose and never shipped, so every session hand-rolled it.
//
// These assert the paths that matter rather than only the happy one, because `ensureDbUp`'s
// readiness poll now runs this same function: a bug here fails the preflight for EVERY `--real`
// build, not one throwaway script. So the TIMEOUT and TEARDOWN paths are covered explicitly, and
// the last test pins the consolidation itself — the poll and the verb are one code path, and
// ADR-0060's 75/1 exit vocabulary survived it.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DB_PROBE_TIMEOUT_MS,
  ensureDbUp,
  probeDb,
  renderDbProbe,
  type DbProbeResult,
  type EnsureDbDeps,
  type ProbeDeps,
} from "./db-control.js";

/** A stand-in for the `PoolHandle` the real probe opens — `probeDb` only ever passes it through. */
const FAKE_HANDLE = { pool: "fake-pool", connector: "fake-connector" } as unknown as Awaited<
  ReturnType<ProbeDeps["open"]>
>;

/** A budget that never expires unless `fire()` is called; records whether it was cancelled. */
function manualBudget() {
  let release: (() => void) | null = null;
  let wasCancelled = false;
  let ms: number | null = null;
  return {
    budget: (requested: number) => {
      ms = requested;
      return {
        expired: new Promise<void>((resolve) => {
          release = resolve;
        }),
        cancel: () => void (wasCancelled = true),
      };
    },
    fire: () => release?.(),
    cancelled: () => wasCancelled,
    startedWith: () => ms,
  };
}

/** A pool whose `open()` resolves only when the test says so — for the late-arrival teardown case. */
function deferredHandle() {
  let resolve!: (h: typeof FAKE_HANDLE) => void;
  const promise = new Promise<typeof FAKE_HANDLE>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A clock that advances by `step` on every read, so `elapsedMs` is deterministic. */
function tickingClock(step: number): () => number {
  let t = 0;
  return () => {
    const v = t;
    t += step;
    return v;
  };
}

function probeDeps(over: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    open: async () => FAKE_HANDLE,
    select1: async () => ({ rows: [] }),
    close: async () => {},
    now: tickingClock(10),
    budget: () => ({ expired: new Promise<void>(() => {}), cancel: () => {} }),
    ...over,
  };
}

// ── The happy path ───────────────────────────────────────────────────────────

test("probeDb: the DB answers SELECT 1 → reachable, carrying the elapsed ms", async () => {
  const result = await probeDb(probeDeps(), DB_PROBE_TIMEOUT_MS);
  assert.equal(result.reachable, true);
  assert.equal(typeof result.elapsedMs, "number");
});

test("probeDb: the happy path CANCELS the budget — a fast probe must not leave a live timer", async () => {
  const b = manualBudget();
  await probeDb(probeDeps({ budget: b.budget }), DB_PROBE_TIMEOUT_MS);
  assert.equal(b.cancelled(), true, "the budget timer must be cancelled once the probe answered");
  assert.equal(b.startedWith(), DB_PROBE_TIMEOUT_MS, "the budget is started with the requested ms");
});

// ── The failure path: the EXACT reason, not a bare false ─────────────────────

test("probeDb: a throwing open() → unreachable carrying the EXACT reason (the boolean probe lost this)", async () => {
  const result = await probeDb(
    probeDeps({
      open: async () => {
        throw new Error("STORYTREE_DB_USER is not set");
      },
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(result.reachable, false);
  assert.equal(
    result.reachable === false && result.reason,
    "STORYTREE_DB_USER is not set",
    "unauthenticated and unreachable want different next actions; the old bare `false` could not tell them apart",
  );
});

test("probeDb: a throwing SELECT 1 (pool built, query refused) is reported, not swallowed", async () => {
  const result = await probeDb(
    probeDeps({
      select1: async () => {
        throw new Error("permission denied for schema events");
      },
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(result.reachable, false);
  assert.equal(result.reachable === false && result.reason, "permission denied for schema events");
});

test("probeDb: a non-Error throw still yields a string reason", async () => {
  const result = await probeDb(
    probeDeps({
      open: async () => {
        throw "ECONNREFUSED";
      },
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(result.reachable === false && result.reason, "ECONNREFUSED");
});

// ── The TIMEOUT path (the risk the consolidation raises) ─────────────────────

test("probeDb: the budget expiring while open() hangs → unreachable, naming the budget in seconds", async () => {
  const b = manualBudget();
  const pending = probeDb(
    probeDeps({
      open: () => new Promise(() => {}), // a STOPPED instance hangs the pool build itself
      budget: b.budget,
      now: tickingClock(1_000),
    }),
    45_000,
  );
  b.fire();
  const result = await pending;
  assert.equal(result.reachable, false);
  assert.match(
    result.reachable === false ? result.reason : "",
    /no answer within 45s/,
    "the refusal must name the budget it actually waited",
  );
  assert.match(
    result.reachable === false ? result.reason : "",
    /db:status/,
    "and point at the command that answers the other question",
  );
});

test("probeDb: a timed-out probe still reports a measured elapsedMs", async () => {
  const b = manualBudget();
  const pending = probeDb(
    probeDeps({ open: () => new Promise(() => {}), budget: b.budget, now: tickingClock(500) }),
    45_000,
  );
  b.fire();
  const result = await pending;
  assert.equal(typeof result.elapsedMs, "number");
});

// ── The TEARDOWN path: no leaked connector, on ANY exit ──────────────────────

test("probeDb: the pool is torn down on the happy path", async () => {
  let closed = 0;
  await probeDb(probeDeps({ close: async () => void closed++ }), DB_PROBE_TIMEOUT_MS);
  assert.equal(closed, 1);
});

test("probeDb: the pool is torn down when SELECT 1 throws", async () => {
  let closed = 0;
  await probeDb(
    probeDeps({
      select1: async () => {
        throw new Error("boom");
      },
      close: async () => void closed++,
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(closed, 1);
});

test("probeDb: a pool that resolves AFTER the budget won is still closed — no leaked connector", async () => {
  const b = manualBudget();
  let closed = 0;
  const late = deferredHandle();
  const pending = probeDb(
    probeDeps({ open: () => late.promise, close: async () => void closed++, budget: b.budget }),
    45_000,
  );
  b.fire();
  const result = await pending;
  assert.equal(result.reachable, false, "the budget won the race");

  // Now the late pool arrives. The work branch's finally must still tear it down.
  late.resolve(FAKE_HANDLE);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(closed, 1, "a late-resolving pool must never leak its connector");
});

test("probeDb: open() never resolving leaks nothing — close is never called on a handle we never got", async () => {
  const b = manualBudget();
  let closed = 0;
  const pending = probeDb(
    probeDeps({ open: () => new Promise(() => {}), close: async () => void closed++, budget: b.budget }),
    45_000,
  );
  b.fire();
  await pending;
  assert.equal(closed, 0);
});

test("probeDb: a THROWING close() does not change the verdict — the DB answered or it did not", async () => {
  const result = await probeDb(
    probeDeps({
      close: async () => {
        throw new Error("connector teardown failed");
      },
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(result.reachable, true, "teardown noise must not turn a reachable DB into a refusal");
});

test("probeDb never rejects — every failure is a verdict, so a caller cannot crash on it", async () => {
  const result = await probeDb(
    probeDeps({
      open: async () => {
        throw new Error("x");
      },
      close: async () => {
        throw new Error("y");
      },
    }),
    DB_PROBE_TIMEOUT_MS,
  );
  assert.equal(result.reachable, false);
});

// ── The rendered line ────────────────────────────────────────────────────────

test("renderDbProbe: reachable names the elapsed ms — the number that settles slow-DB vs wrong-poll", () => {
  assert.equal(
    renderDbProbe({ reachable: true, elapsedMs: 367 }),
    "reachable — SELECT 1 answered in 367 ms",
  );
});

test("renderDbProbe: unreachable carries the reason verbatim", () => {
  const line = renderDbProbe({ reachable: false, elapsedMs: 45_000, reason: "no answer within 45s." });
  assert.match(line, /UNREACHABLE after 45000 ms/);
  assert.match(line, /no answer within 45s\./);
});

// ── The consolidation, and what it must NOT have changed ─────────────────────
//
// `db:up`'s poll and `db:probe` are now one code path. ADR-0060's exit vocabulary is db-cli's
// reading of `EnsureDbResult`, so these pin the two shapes it switches on. If a future change to
// the probe altered them, `pnpm db:up` would start exiting 1 where it must exit 75 — telling an
// operator to re-issue a start against an instance that is merely still warming.

test("ADR-0060 preserved: a poll that exhausts at activationPolicy ALWAYS is stillWarming (db-cli exits 75)", async () => {
  const deps: EnsureDbDeps = {
    probe: async () => false,
    start: async () => {},
    sleep: async () => {},
    log: () => {},
    now: tickingClock(300_000),
    status: async () => ({ state: "RUNNABLE", activationPolicy: "ALWAYS" }),
    timeoutMs: 600_000,
  };
  const res = await ensureDbUp(deps);
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.stillWarming, true, "still warming = EX_TEMPFAIL 75, re-probe, never re-start");
});

test("ADR-0060 preserved: a poll that exhausts at activationPolicy NEVER is NOT stillWarming (db-cli exits 1)", async () => {
  const deps: EnsureDbDeps = {
    probe: async () => false,
    start: async () => {},
    sleep: async () => {},
    log: () => {},
    now: tickingClock(300_000),
    status: async () => ({ state: "STOPPED", activationPolicy: "NEVER" }),
    timeoutMs: 600_000,
  };
  const res = await ensureDbUp(deps);
  assert.equal(res.ok, false);
  assert.equal(
    res.ok === false && res.stillWarming,
    undefined,
    "the activation PATCH did not take — waiting will not help, so this must NOT read as still-warming",
  );
});

test("the poll consumes the probe as a BOOLEAN — the detailed result must stay assignable to it", async () => {
  // The consolidation only holds while probeLiveDb's shape still satisfies EnsureDbDeps["probe"].
  // This pins that structurally: a DbProbeResult folded to `.reachable` is what the poll receives.
  const asPollProbe: EnsureDbDeps["probe"] = async () => {
    const detailed: DbProbeResult = { reachable: true, elapsedMs: 12 };
    return detailed.reachable;
  };
  const res = await ensureDbUp({
    probe: asPollProbe,
    start: async () => {},
    sleep: async () => {},
    log: () => {},
    now: tickingClock(1_000),
  });
  assert.deepEqual(res, { ok: true, started: false });
});
