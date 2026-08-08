import { test } from "node:test";
import assert from "node:assert/strict";

import {
  effectiveVerdictStore,
  ensureDbUp,
  START_TIMEOUT_MS,
  type EnsureDbDeps,
} from "./db-control.js";

/** A budget that never fires — the default in {@link deps}, so no test holds a real timer. */
function idleBudget(): { expired: Promise<void>; cancel: () => void } {
  return { expired: new Promise<void>(() => {}), cancel: () => {} };
}

/** A budget that has ALREADY expired — the wedged-activation-call harness. */
function firedBudget(): { expired: Promise<void>; cancel: () => void } {
  return { expired: Promise.resolve(), cancel: () => {} };
}

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
    budget: idleBudget,
    ...over,
  };
}

test("ensureDbUp fast path: a reachable DB returns immediately and never starts", async () => {
  let started = false;
  const res = await ensureDbUp(deps({ probe: async () => true, start: async () => void (started = true) }));
  assert.deepEqual(res, { ok: true, started: false });
  assert.equal(started, false, "the DB was already up — db:up must not run");
});

test("ensureDbUp refuses INSTANTLY on a data-plane refusal — never probes, never starts (ADR-0250)", async () => {
  let probed = 0;
  let started = 0;
  const res = await ensureDbUp(
    deps({
      refusal: "live store refused: this session's egress cannot carry a Postgres data connection",
      probe: async () => {
        probed++;
        return false;
      },
      start: async () => void started++,
    }),
  );
  assert.equal(res.ok, false);
  assert.match(
    res.ok === false ? res.reason : "",
    /egress cannot carry a Postgres data connection/,
    "the refusal must carry the real mechanism through, not the generic 'did not accept connections'",
  );
  assert.equal(probed, 0, "a structurally blocked session must not spend the 45s probe budget");
  assert.equal(started, 0, "and must not start an instance that was never the problem");
});

test("ensureDbUp with an ABSENT/null refusal behaves exactly as before (the laptop path)", async () => {
  assert.deepEqual(await ensureDbUp(deps({ refusal: null })), { ok: true, started: false });
  assert.deepEqual(await ensureDbUp(deps({})), { ok: true, started: false });
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
        throw new Error("no ADC token");
      },
    }),
  );
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /could not start the database: no ADC token/);
  assert.equal(p.calls(), 1, "only the fast-path probe ran — no polling after a failed start");
});

test("ensureDbUp fails closed on a SYNCHRONOUSLY throwing start, not just a rejected promise", async () => {
  // `start` is typed to return a promise, but a caller that throws before returning one must still
  // get a refusal — this function's contract is to ANSWER, never to blow up. The distinction became
  // live when the activation call moved out of the `try` to be raced against its budget.
  const p = scriptedProbe([false]);
  const res = await ensureDbUp(
    deps({
      probe: p.probe,
      start: (): Promise<void> => {
        throw new Error("ADC lookup exploded before any request");
      },
    }),
  );
  assert.equal(res.ok, false);
  assert.match((res as { reason: string }).reason, /could not start the database: ADC lookup exploded/);
  assert.equal(p.calls(), 1, "only the fast-path probe ran — no polling after a failed start");
});

test("ensureDbUp's DEFAULT poll budget covers a real ~6 min cold start (oq-live-build-autostart-cold-start-wait)", async () => {
  // The observed GCP cold start is ~5–6 min (≤366s end-to-end). With the old 180s default this build
  // refused spuriously; the default must now wait long enough for a slow start to connect.
  const clock = fakeClock();
  const upAt = 370_000; // accepts connections at ~6m10s — past the old 180s budget, within the new one
  const res = await ensureDbUp({
    probe: async () => clock.now() >= upAt, // fast-path probe at t=0 → false → start → poll
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
    // no timeoutMs / pollMs → exercises the real defaults
  });
  assert.deepEqual(res, { ok: true, started: true });
});

test("ensureDbUp's DEFAULT poll budget sits comfortably ABOVE the ~5–6 min cold start its own banner advertises", async () => {
  // The friction (db-up-poll-window-shorter-than-the-cold-start-it-triggers): the progress line
  // says "a cold start runs ~5–6 min", so a poll ceiling near that range gives up on starts it
  // itself called normal. The ceiling must carry real headroom — a start that connects at ~8m40s
  // (observed cold starts have reached ~21 min after the overnight stop) still succeeds.
  const clock = fakeClock();
  const upAt = 520_000; // accepts connections at 8m40s — past the old 420s ceiling
  const res = await ensureDbUp({
    probe: async () => clock.now() >= upAt,
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
    // no timeoutMs / pollMs → exercises the real defaults
  });
  assert.deepEqual(res, { ok: true, started: true });
});

test("ensureDbUp timeout with the instance reporting ALWAYS → stillWarming: re-probe, do not re-start", async () => {
  // "Start issued, instance still warming" is distinguishable from "genuinely unreachable": the
  // activation PATCH took (policy ALWAYS), so the instance is coming up — the operator should
  // re-probe, never issue another start. The old failure collapsed both into one message.
  const res = await ensureDbUp(
    deps({
      probe: async () => false,
      status: async () => ({ state: "RUNNABLE", activationPolicy: "ALWAYS" }),
      timeoutMs: 30,
      pollMs: 10,
    }),
  );
  assert.equal(res.ok, false);
  const failure = res as { reason: string; stillWarming?: boolean };
  assert.equal(failure.stillWarming, true, "an ALWAYS instance after a start is warming, not unreachable");
  assert.match(failure.reason, /still warming/i, "the reason names the warming state");
  assert.match(failure.reason, /re-probe/i, "the remedy is to re-probe");
  assert.match(failure.reason, /not .*(another start|re-start)/i, "and explicitly NOT another start");
});

test("ensureDbUp timeout with the instance NOT on ALWAYS → genuinely unreachable, no stillWarming", async () => {
  // The activation PATCH did not take (policy still NEVER) — this is not a cold start in
  // progress, so the failure must NOT read as "just wait": it names the observed state instead.
  const res = await ensureDbUp(
    deps({
      probe: async () => false,
      status: async () => ({ state: "STOPPED", activationPolicy: "NEVER" }),
      timeoutMs: 30,
      pollMs: 10,
    }),
  );
  assert.equal(res.ok, false);
  const failure = res as { reason: string; stillWarming?: boolean };
  assert.notEqual(failure.stillWarming, true, "a NEVER instance is not 'still warming'");
  assert.match(failure.reason, /NEVER/, "the reason surfaces the observed activation policy");
});

test("ensureDbUp timeout with a THROWING/absent status probe falls back to the generic refusal", async () => {
  const throwing = await ensureDbUp(
    deps({
      probe: async () => false,
      status: async () => {
        throw new Error("Admin API unreachable");
      },
      timeoutMs: 30,
      pollMs: 10,
    }),
  );
  assert.equal(throwing.ok, false);
  assert.notEqual((throwing as { stillWarming?: boolean }).stillWarming, true);
  assert.match((throwing as { reason: string }).reason, /did not accept connections/);

  const absent = await ensureDbUp(deps({ probe: async () => false, timeoutMs: 30, pollMs: 10 }));
  assert.equal(absent.ok, false);
  assert.match((absent as { reason: string }).reason, /did not accept connections/);
});

test("ensureDbUp emits a periodic progress line while waiting for a slow start", async () => {
  const clock = fakeClock();
  const logs: string[] = [];
  const upAt = 95_000; // up after ~1.5 min, so at least two 30s progress ticks fire first
  const res = await ensureDbUp({
    probe: async () => clock.now() >= upAt,
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: (m: string) => void logs.push(m),
  });
  assert.equal(res.ok, true);
  const progress = logs.filter((m) => /still waiting/i.test(m));
  assert.ok(progress.length >= 2, "progress is surfaced repeatedly, not just once");
  assert.match(progress[0] ?? "", /\b\d+s elapsed\b/, "the progress line reports elapsed seconds");
});

test("the ACTIVATION CALL is bounded: a start that never returns refuses instead of hanging forever", async () => {
  // The wedge `diagnosis-honesty-arc` names. `start()` was awaited with no bound at all, so a hung
  // ADC token mint or an unreachable Admin API parked the preflight indefinitely — and from a
  // redirected log that was byte-identical to a healthy build thinking.
  let polled = 0;
  const res = await ensureDbUp(
    deps({
      probe: async () => {
        polled++;
        return false;
      },
      start: () => new Promise<void>(() => {}), // never returns — the wedge
      budget: firedBudget,
    }),
  );
  assert.equal(res.ok, false, "an unbounded wait is not an outcome — the preflight must answer");
  assert.equal(polled, 1, "only the fast-path probe ran: there is nothing to poll for, nothing started");
});

test("the wedged-activation refusal names the ADMIN API, and says it is NOT a slow database start", async () => {
  // This arc's whole bar: name the REAL blocker rather than a downstream symptom. A wedged PATCH and
  // a slow cold start want OPPOSITE responses (intervene vs wait), so the message must not merely
  // report a timeout — it must say which of the two this is, and why waiting cannot help.
  const res = await ensureDbUp(
    deps({ probe: async () => false, start: () => new Promise<void>(() => {}), budget: firedBudget }),
  );
  const reason = res.ok === false ? res.reason : "";
  assert.match(reason, /ACTIVATION CALL/i, "the blocker is named: the activation call, not 'the database'");
  assert.match(reason, /Admin REST\s+API|ADC token/i, "and the component that is not answering is named");
  assert.match(reason, /NOT a slow database start/i, "it explicitly rules OUT the look-alike diagnosis");
  assert.match(reason, /waiting\s+longer cannot help/i, "so the reader does not wait out a wedge");
  assert.match(reason, /print-access-token/, "and it hands over the actionable next check");
  assert.notEqual(
    (res as { stillWarming?: boolean }).stillWarming,
    true,
    "nothing is warming — the PATCH that would begin the start never landed",
  );
});

test("the activation budget defaults to 120s and is REPORTED as the number actually waited", async () => {
  const dflt = await ensureDbUp(
    deps({ probe: async () => false, start: () => new Promise<void>(() => {}), budget: firedBudget }),
  );
  assert.equal(START_TIMEOUT_MS, 120_000);
  assert.match((dflt as { reason: string }).reason, /within 120s/);

  const override = await ensureDbUp(
    deps({
      probe: async () => false,
      start: () => new Promise<void>(() => {}),
      budget: firedBudget,
      startTimeoutMs: 5_000,
    }),
  );
  assert.match((override as { reason: string }).reason, /within 5s/, "the message reports the real budget");
});

test("bounding the activation call did NOT shorten the wait for the database it starts", async () => {
  // The two budgets measure different things and must not be conflated: START is one REST PATCH,
  // the POLL is the multi-minute cold start. A start that returns promptly must still get the full
  // 600s poll — a cold start reaching ~8m40s still succeeds, exactly as before.
  const clock = fakeClock();
  const upAt = 520_000;
  const res = await ensureDbUp({
    probe: async () => clock.now() >= upAt,
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
    budget: idleBudget, // the activation call returned; its budget never fires
  });
  assert.deepEqual(res, { ok: true, started: true }, "the cold-start poll is untouched by the start bound");
});

test("a start that rejects AFTER its budget won does not surface as an unhandled rejection", async () => {
  // The losing branch of the race still has to be handled, or a late REST failure crashes a process
  // that already reported an honest refusal.
  let reject: ((e: Error) => void) | undefined;
  const res = await ensureDbUp(
    deps({
      probe: async () => false,
      start: () => new Promise<void>((_, rej) => void (reject = rej)),
      budget: firedBudget,
    }),
  );
  assert.equal(res.ok, false);
  reject?.(new Error("Admin API 503, arriving late"));
  await new Promise((r) => setImmediate(r)); // let the late rejection settle
});

test("the preflight NAMES each leg it enters, so silence always has an owner", async () => {
  // The friction's other half: on the healthy path the preflight logged NOTHING, so its ~45s probe
  // was indistinguishable from a process doing nothing. Every state it can sit in is now announced
  // BEFORE it is entered — probing, activating, waiting — which is what lets a reader of a
  // redirected log say which precondition is holding the clock.
  const quiet: string[] = [];
  await ensureDbUp(deps({ probe: async () => true, log: (m) => void quiet.push(m) }));
  assert.match(quiet.join("\n"), /probing the live store/i, "even the fast path announces its probe");

  const slow: string[] = [];
  const p = scriptedProbe([false, true]);
  await ensureDbUp(
    deps({ probe: p.probe, log: (m) => void slow.push(m), timeoutMs: 60_000, pollMs: 5_000 }),
  );
  const joined = slow.join("\n");
  assert.match(joined, /probing the live store/i);
  assert.match(joined, /issuing the Cloud SQL activation call/i, "the activation call is its own named leg");
  assert.match(joined, /activation call accepted/i, "and its RETURN is announced, so the next wait is attributable");
});

test("a HANGING Admin status call cannot hang the command at the moment it becomes useful", async () => {
  // The status call is the LAST thing the preflight does before naming which failure this is. An
  // unbounded one would stall the command precisely where a diagnosis was about to arrive — the
  // same defect as the unbounded activation call, one level down. It is bounded, and a timeout
  // degrades to the generic refusal exactly as a THROWING status already did.
  // The activation call gets the FIRST budget (idle — it returns fine); the status call gets the
  // SECOND (fired), so only the leg under test times out.
  let issued = 0;
  const res = await ensureDbUp(
    deps({
      probe: async () => false,
      status: () => new Promise<never>(() => {}), // never answers
      budget: () => (issued++ === 0 ? idleBudget() : firedBudget()),
      timeoutMs: 30,
      pollMs: 10,
    }),
  );
  assert.equal(issued, 2, "both external calls are on a budget — the start AND the status");
  assert.equal(res.ok, false);
  assert.notEqual(
    (res as { stillWarming?: boolean }).stillWarming,
    true,
    "an unanswered status call must never be reported as a confident 'still warming'",
  );
  assert.match((res as { reason: string }).reason, /did not accept connections/);
});

test("ensureDbUp works with NO injected budget — the real timer is the default and is cancelled", async () => {
  // The seam is optional so the pure decision flow keeps its existing callers; production supplies
  // nothing and gets `realBudget`. If the timer were not cancelled, this test would hang the runner
  // for 120s past its assertion.
  const clock = fakeClock();
  const res = await ensureDbUp({
    probe: async () => clock.now() >= 20_000,
    start: async () => {},
    sleep: clock.sleep,
    now: clock.now,
    log: () => {},
  });
  assert.deepEqual(res, { ok: true, started: true });
});

test("effectiveVerdictStore: a SYNTHETIC walk (dry-run OR live smoke) passes its flag through unchanged", () => {
  // synthetic = true covers BOTH a --dry-run scripted walk AND a --live add(2,3) smoke (ADR-0099-B).
  assert.equal(effectiveVerdictStore(undefined, true), undefined); // → in-memory
  assert.equal(effectiveVerdictStore("pg", true), "pg"); // → refused downstream (forged healthy)
  assert.equal(effectiveVerdictStore("memory", true), "memory");
});

test("effectiveVerdictStore: ADR-0099-B — a --live smoke no longer defaults an unset --store to pg", () => {
  // The crux of ADR-0099-B: a synthetic --live smoke (synthetic=true) must NOT default to pg, where
  // ADR-0081 used to make EVERY live/real build persist. A synthetic PASS never reaches the shared log.
  assert.equal(effectiveVerdictStore(undefined, true), undefined, "a --live smoke persists nothing by default");
});

test("effectiveVerdictStore: only a REAL driven proof defaults an unset --store to pg", () => {
  // synthetic = false is the REAL driven proof (--real, a genuine red→green); it owns the DB (ADR-0060).
  assert.equal(effectiveVerdictStore(undefined, false), "pg", "a real build owns the DB (ADR-0060)");
  // "memory" still passes through here — it is NOT a CLI option (ADR-0081 refuses it at dispatch),
  // only the internal test seam reaches this function with it, and it must still map to in-memory.
  assert.equal(effectiveVerdictStore("memory", false), "memory", "internal test seam still maps to in-memory");
  assert.equal(effectiveVerdictStore("pg", false), "pg");
});
