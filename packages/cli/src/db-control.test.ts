import { test } from "node:test";
import assert from "node:assert/strict";

import {
  effectiveVerdictStore,
  ensureDbUp,
  gcloudInvocation,
  withRestFallback,
  type EnsureDbDeps,
} from "./db-control.js";

/** A deterministic clock: `sleep` advances `now`, so the timeout loop runs without real waiting. */
function fakeClock(): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

/** A probe that yields the given booleans in order, then repeats the last one. */
function scriptedProbe(values: boolean[]): { probe: () => Promise<boolean>; calls: () => number } {
  let i = 0;
  return {
    probe: async () => values[Math.min(i++, values.length - 1)] ?? false,
    calls: () => i,
  };
}

function deps(over: Partial<EnsureDbDeps>): EnsureDbDeps {
  const clock = fakeClock();
  return {
    probe: async () => true,
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
    ...over,
  };
}

test("ensureDbUp fast path: a reachable DB returns immediately and never starts", async () => {
  let started = false;
  const res = await ensureDbUp(deps({ probe: async () => true, start: async () => void (started = true) }));
  assert.deepEqual(res, { ok: true, started: false });
  assert.equal(started, false, "the DB was already up — db:up must not run");
});

test("ensureDbUp starts the DB and succeeds once a later poll connects", async () => {
  // probe: #1 fast-path (false) → start → poll#1 (false) → poll#2 (true).
  const p = scriptedProbe([false, false, true]);
  let started = 0;
  const res = await ensureDbUp(
    deps({ probe: p.probe, start: async () => void started++, timeoutMs: 60_000, pollMs: 5_000 }),
  );
  assert.deepEqual(res, { ok: true, started: true });
  assert.equal(started, 1, "db:up ran exactly once");
  assert.equal(p.calls(), 3, "probed: fast-path, poll#1, poll#2");
});

test("ensureDbUp fails closed when the DB never becomes reachable within the timeout", async () => {
  const p = scriptedProbe([false]); // always down
  const res = await ensureDbUp(deps({ probe: p.probe, timeoutMs: 30, pollMs: 10 }));
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /did not accept connections/);
});

test("ensureDbUp fails closed (and never polls) when starting the DB throws", async () => {
  const p = scriptedProbe([false]);
  const res = await ensureDbUp(
    deps({
      probe: p.probe,
      start: async () => {
        throw new Error("gcloud not found");
      },
    }),
  );
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /could not start the database: gcloud not found/);
  assert.equal(p.calls(), 1, "only the fast-path probe ran — no polling after a failed start");
});

test("effectiveVerdictStore: a scripted (dry-run) walk passes its flag through unchanged", () => {
  assert.equal(effectiveVerdictStore(undefined, true), undefined); // → in-memory
  assert.equal(effectiveVerdictStore("pg", true), "pg"); // → refused downstream (forged healthy)
  assert.equal(effectiveVerdictStore("memory", true), "memory");
});

test("effectiveVerdictStore: a live/real build defaults an unset --store to pg, keeps explicit values", () => {
  assert.equal(effectiveVerdictStore(undefined, false), "pg", "the build owns the DB (ADR-0060)");
  assert.equal(effectiveVerdictStore("memory", false), "memory", "explicit opt-out is honoured");
  assert.equal(effectiveVerdictStore("pg", false), "pg");
});

test("gcloudInvocation routes through the shell on Windows (.cmd shim), direct elsewhere", () => {
  const win = gcloudInvocation(["sql", "instances", "patch"], "win32");
  assert.equal(win.shell, true);
  assert.equal(win.command, "gcloud sql instances patch");
  assert.deepEqual(win.args, []);

  const nix = gcloudInvocation(["sql", "instances", "patch"], "linux");
  assert.equal(nix.shell, false);
  assert.equal(nix.command, "gcloud");
  assert.deepEqual(nix.args, ["sql", "instances", "patch"]);
});

test("withRestFallback: REST start succeeds → gcloud is never invoked, nothing is logged", async () => {
  let gcloud = 0;
  const logs: string[] = [];
  await withRestFallback(async () => {}, async () => void gcloud++, (m) => logs.push(m));
  assert.equal(gcloud, 0, "REST succeeded — the gcloud fallback must not run");
  assert.deepEqual(logs, [], "no fallback log on the happy path");
});

test("withRestFallback: a REST failure logs the reason and falls back to gcloud", async () => {
  let gcloud = 0;
  const logs: string[] = [];
  await withRestFallback(
    async () => {
      throw new Error("no ADC token");
    },
    async () => void gcloud++,
    (m) => logs.push(m),
  );
  assert.equal(gcloud, 1, "the gcloud fallback ran exactly once");
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /REST call failed \(no ADC token\) — falling back to gcloud/);
});

test("withRestFallback: rejects when BOTH REST and gcloud fail (ensureDbUp then reports it)", async () => {
  await assert.rejects(
    () =>
      withRestFallback(
        async () => {
          throw new Error("rest down");
        },
        async () => {
          throw new Error("gcloud not found");
        },
        () => {},
      ),
    /gcloud not found/,
  );
});
