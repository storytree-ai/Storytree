// The REMOTE arm of the bounded wait — `dispatched-work-wakes-its-dispatcher-arc` inc 1.
//
// WHAT THESE PIN, AND WHY THE SHAPE. The defect this instrument must not have is a FALSE TERMINAL:
// a watcher that reports "done" because it stopped being able to look. That is worse than the
// polling it replaces, because the dispatcher TRUSTS it and stops looking itself. So every test
// below is about what is REPORTED at a boundary where the watcher lost sight of the job, and each
// of the four ways it can lose sight is DRIVEN here rather than merely present in the code:
//
//   1. the host is unreachable            → 69, never a verdict, and never confused with a timeout
//   2. the remote run is gone, no sentinel → 76, never a pass
//   3. the sentinel never appears, alive   → keeps waiting, then expires as 75
//   4. the watcher's own bound expired     → 75, exactly as the local arm already does
//
// …plus the two INVERSE claims, which are what stop each branch degrading into a hair trigger: a
// single network blip must NOT halt, and a normally-finished run (whose process is legitimately
// gone by the time its sentinel lands) must NOT be reported as a crash.
//
// The clock, the sleep and the ssh round trip are all injected, so a full eight-minute wait runs in
// microseconds and nothing here needs a host, a network or a credential. `pnpm -r test` stays
// credential-free (ADR-0302 D3).
//
// Proof: node --import ../../scripts/tsx-cache-off.mjs --import tsx --test src/dispatch-remote.test.ts

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { resolveRepoBash } from "../../../scripts/resolve-bash.mjs";
import { isVerdict } from "./dispatch-handle.js";
import {
  DEFAULT_REMOTE_LIMITS,
  INITIAL_REMOTE_WATCH,
  PROBE_MARKER,
  UNREACHABLE_EXIT,
  VANISHED_EXIT,
  createRemoteWaitIo,
  parseRemoteProbe,
  remoteProbeScript,
  remoteTarget,
  shQuote,
  sshProbeArgs,
  stepRemoteWatch,
  unreachable,
  type RemoteSnapshot,
  type RemoteTarget,
  type RemoteWatchState,
  type SshResult,
  type WaitClock,
} from "./dispatch-remote.js";
import {
  DEFAULT_POLL_MS,
  UNVERIFIED_EXIT,
  waitExitCode,
  waitForDispatchHandle,
} from "./dispatch-wait.js";

const HANDLE = "/tmp/run.jsonl";
const EXIT = "/tmp/run.jsonl.exit";
const TARGET: RemoteTarget = remoteTarget("mint", HANDLE, "/tmp/run.pid");
const BLIND_TARGET: RemoteTarget = remoteTarget("mint", HANDLE);

// ---------------------------------------------------------------------------
// Snapshot builders — one per thing a probe can honestly have seen
// ---------------------------------------------------------------------------

const alive: RemoteSnapshot = {
  reach: "reached",
  logExists: true,
  sentinel: null,
  group: "live",
  logMtimeEpoch: 1_700_000_000,
};
const groupGone: RemoteSnapshot = { ...alive, group: "gone" };
const blind: RemoteSnapshot = { ...alive, group: "unknown" };
const settled = (code: string): RemoteSnapshot => ({ ...alive, group: "gone", sentinel: code });

/** A fake clock whose `sleep` only advances a counter — an 8-minute wait, in microseconds. */
function fakeClock(): WaitClock & { readonly sleeps: number[] } {
  let clock = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => clock,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
}

/** A probe that serves one snapshot per call, repeating the last one forever. */
function scriptedProbe(script: readonly RemoteSnapshot[]): () => RemoteSnapshot {
  let index = 0;
  return () => {
    const snap = script[Math.min(index, script.length - 1)];
    index += 1;
    assert.ok(snap !== undefined, "the scripted probe must never run dry");
    return snap;
  };
}

// ---------------------------------------------------------------------------
// A. The reply parser — every way a probe can fail lands in `unreachable`
// ---------------------------------------------------------------------------

function sshResult(over: Partial<SshResult>): SshResult {
  return { status: 0, signal: null, stdout: "", stderr: "", ...over };
}

const GOOD_REPLY = [PROBE_MARKER, "log=1", "sentinel=0", "group=live", "mtime=1700000000", ""].join("\n");

test("a good reply parses into exactly what the far side saw", () => {
  const snap = parseRemoteProbe(sshResult({ stdout: GOOD_REPLY }));
  assert.equal(snap.reach, "reached");
  assert.equal(snap.logExists, true);
  assert.equal(snap.sentinel, null, "absent is null, never the empty string");
  assert.equal(snap.group, "live");
  assert.equal(snap.logMtimeEpoch, 1_700_000_000);
});

test("a sentinel holding a status comes back as that status's TEXT, empty included", () => {
  const four = parseRemoteProbe(
    sshResult({ stdout: [PROBE_MARKER, "log=1", "sentinel=1", "sentinel-text=4", "group=gone", "mtime=-"].join("\n") }),
  );
  assert.equal(four.sentinel, "4");
  assert.equal(four.logMtimeEpoch, null, "an unavailable mtime is null, not 0");

  // A sentinel that EXISTS but is empty is a half-written file, and it must arrive as `""` rather
  // than `null` — `null` would say "no sentinel", which is a different fact with a different cure.
  const empty = parseRemoteProbe(
    sshResult({ stdout: [PROBE_MARKER, "log=1", "sentinel=1", "sentinel-text=", "group=live", "mtime=-"].join("\n") }),
  );
  assert.equal(empty.sentinel, "");
});

test("ssh's own failure status is UNREACHABLE, and says so", () => {
  const snap = parseRemoteProbe(
    sshResult({ status: 255, stderr: "ssh: connect to host mint port 22: Connection refused" }),
  );
  assert.equal(snap.reach, "unreachable");
  assert.equal(snap.sentinel, null);
  assert.equal(snap.group, "unknown", "an unreachable probe learned nothing about the process");
  assert.match(snap.reason ?? "", /could not connect or authenticate/);
  assert.match(snap.reason ?? "", /Connection refused/);
});

test("a missing ssh binary is UNREACHABLE, not an answer about the job", () => {
  const snap = parseRemoteProbe(sshResult({ status: null, spawnError: "spawnSync ssh ENOENT" }));
  assert.equal(snap.reach, "unreachable");
  assert.match(snap.reason ?? "", /ENOENT/);
});

test("a probe killed by its own timeout is UNREACHABLE, never 'the sentinel is absent'", () => {
  const snap = parseRemoteProbe(sshResult({ status: null, signal: "SIGTERM" }));
  assert.equal(snap.reach, "unreachable");
  assert.match(snap.reason ?? "", /killed \(SIGTERM\)/);
});

test("A REPLY THAT IS NOT IN THE PROTOCOL IS UNREACHABLE — the trap that would read as 'nothing there'", () => {
  // This is the one that would be a green check verifying nothing. A truncated, interleaved or
  // banner-prefixed reply parses perfectly happily into "log=0, no sentinel, group unknown" — a
  // confident, WRONG statement about somebody's run, from a read that failed. The marker is what
  // makes a failed read fail.
  for (const stdout of ["", "Welcome to Ubuntu 24.04 LTS\n", "log=1\nsentinel=0\ngroup=live\n"]) {
    const snap = parseRemoteProbe(sshResult({ stdout }));
    assert.equal(snap.reach, "unreachable", `expected garbage to be unreachable: ${JSON.stringify(stdout)}`);
    assert.equal(snap.logExists, false);
    assert.equal(snap.sentinel, null);
  }
  // …and the identical fields WITH the marker are trusted, so the assertion above is about the
  // marker and not about the fields being unparseable.
  const good = parseRemoteProbe(sshResult({ stdout: `${PROBE_MARKER}\nlog=1\nsentinel=0\ngroup=live\n` }));
  assert.equal(good.reach, "reached");
  assert.equal(good.logExists, true);
});

test("an unrecognised group word degrades to `unknown`, never to `gone`", () => {
  // `gone` is the word that can END a wait. Anything the far side says that this side does not
  // recognise must therefore land in the bucket that decides nothing.
  const snap = parseRemoteProbe(
    sshResult({ stdout: [PROBE_MARKER, "log=1", "sentinel=0", "group=probably-dead?", "mtime=-"].join("\n") }),
  );
  assert.equal(snap.group, "unknown");
});

// ---------------------------------------------------------------------------
// B. The strike machine — the only place a halt is decided
// ---------------------------------------------------------------------------

interface WatchRun {
  /** One entry per snapshot: the halt's `kind`, or `null` for "kept waiting". */
  readonly halts: readonly (string | null)[];
  readonly state: RemoteWatchState;
}

function run(snapshots: readonly RemoteSnapshot[], target: RemoteTarget = TARGET): WatchRun {
  let state = INITIAL_REMOTE_WATCH;
  const halts: (string | null)[] = [];
  for (const snap of snapshots) {
    const stepped = stepRemoteWatch(state, snap, target);
    state = stepped.state;
    halts.push(stepped.halt?.kind ?? null);
  }
  return { halts, state };
}

test("unreachable halts only on the THIRD consecutive failure, and carries 69", () => {
  const down = unreachable("Connection refused");
  const { halts } = run([down, down, down]);
  assert.deepEqual(halts, [null, null, "unreachable"]);

  const third = stepRemoteWatch(
    { unreachableStreak: 2, vanishedStreak: 0 },
    down,
    TARGET,
  ).halt;
  assert.equal(third?.exitCode, UNREACHABLE_EXIT);
  assert.match(third?.summary ?? "", /mint could not be reached/);
  assert.match(third?.detail.join("\n") ?? "", /NOTHING WAS OBSERVED/);
});

test("A SINGLE BLIP DOES NOT HALT — the streak resets on the next successful probe", () => {
  // Without this the verb is unusable over a real network: an eight-minute wait will meet a dropped
  // packet, and giving up on it would be no more honest, only sooner.
  const down = unreachable("kex_exchange_identification: read: Connection reset");
  const { halts } = run([down, down, alive, down, down, alive]);
  assert.deepEqual(halts, [null, null, null, null, null, null], "no halt from two-blip runs");
});

test("group gone with no sentinel halts on the THIRD sighting, and carries 76", () => {
  const { halts } = run([groupGone, groupGone, groupGone]);
  assert.deepEqual(halts, [null, null, "vanished"]);
  const halt = stepRemoteWatch({ unreachableStreak: 0, vanishedStreak: 2 }, groupGone, TARGET).halt;
  assert.equal(halt?.exitCode, VANISHED_EXIT);
  assert.match(halt?.detail.join("\n") ?? "", /THERE IS NO VERDICT/);
});

test("THE END-OF-RUN RACE IS NOT A CRASH — the process exits, then its wrapper writes the sentinel", () => {
  // Every healthy run passes through "group gone, no sentinel" for an instant. Halting on the first
  // sighting would report a normal completion as a crash — a false terminal pointing the other way.
  const { halts } = run([alive, groupGone, groupGone, settled("0")]);
  assert.deepEqual(halts, [null, null, null, null]);
});

test("★ `unknown` NEVER becomes `gone` — no way to look is not evidence of death", () => {
  // The load-bearing third bucket. With no pid file the group cannot be probed, and folding that
  // into "the process is gone" would let a watcher with no instrument declare a live run dead.
  const { halts } = run(Array.from({ length: 20 }, () => blind), BLIND_TARGET);
  assert.deepEqual(halts, Array.from({ length: 20 }, () => null));
});

test("an unreachable probe RESETS the vanish streak — a silence is not evidence about a process", () => {
  // Two sightings of a dead group, then the host goes away, then it comes back dead: the count must
  // start again, because the probes that saw nothing may not contribute to a claim about the job.
  const down = unreachable("Connection reset");
  const { halts, state } = run([groupGone, groupGone, down, groupGone]);
  assert.deepEqual(halts, [null, null, null, null]);
  assert.equal(state.vanishedStreak, 1, "the streak restarted after the blind probe");
});

test("a sentinel present outranks a gone group — the verdict wins over the corpse", () => {
  const { halts, state } = run([settled("0"), settled("0"), settled("0"), settled("0")]);
  assert.deepEqual(halts, [null, null, null, null]);
  assert.equal(state.vanishedStreak, 0);
});

// ---------------------------------------------------------------------------
// C. The four branches, END TO END through the real wait loop
// ---------------------------------------------------------------------------

test("BRANCH 1 — an unreachable host exits 69, is never a verdict, and is never a timeout", async () => {
  const clock = fakeClock();
  const io = createRemoteWaitIo(TARGET, scriptedProbe([unreachable("Connection refused")]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io);

  assert.equal(outcome.halt?.kind, "unreachable");
  assert.equal(waitExitCode(outcome), UNREACHABLE_EXIT);
  assert.equal(isVerdict(outcome.reading), false, "an unreachable host may never be cited as a result");
  assert.equal(outcome.timedOut, false, "it gave up because it could not see, not because time ran out");
  assert.equal(outcome.polls, DEFAULT_REMOTE_LIMITS.unreachableStrikes);
  assert.equal(io.probeCount(), outcome.polls, "one ssh round trip per poll, not three");
  assert.ok(clock.now() < 8 * 60 * 1000, "it did not sit out its whole bound to say it could not look");
});

test("BRANCH 2 — a remote run that died without a sentinel exits 76, and never reads as a pass", async () => {
  const clock = fakeClock();
  const io = createRemoteWaitIo(TARGET, scriptedProbe([alive, groupGone]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io);

  assert.equal(outcome.halt?.kind, "vanished");
  assert.equal(waitExitCode(outcome), VANISHED_EXIT);
  assert.notEqual(outcome.reading.state, "passed");
  assert.equal(isVerdict(outcome.reading), false);
  assert.equal(outcome.timedOut, false);
  assert.equal(outcome.polls, 4, "one live sighting, then three of the empty group");
});

test("BRANCH 3 — a sentinel that never appears while the run is ALIVE keeps waiting, then expires as 75", async () => {
  const clock = fakeClock();
  const io = createRemoteWaitIo(TARGET, scriptedProbe([alive]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 10_000, pollMs: 2000 });

  assert.equal(outcome.halt, undefined, "a live run is not a reason to stop watching");
  assert.equal(outcome.timedOut, true);
  assert.equal(waitExitCode(outcome), UNVERIFIED_EXIT);
  assert.equal(outcome.reading.state, "running");
  assert.equal(isVerdict(outcome.reading), false);
});

test("BRANCH 4 — the watcher's own bound expiring stays 75, and does NOT collapse into 69 or 76", async () => {
  // The increment's fourth branch: keep the local vocabulary, and keep the three apart. A caller
  // reading only the number must be able to tell "I could not reach the box" from "the box says the
  // job is gone" from "I ran out of my own time" — three different next moves.
  const clock = fakeClock();
  const io = createRemoteWaitIo(BLIND_TARGET, scriptedProbe([blind]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 60_000, pollMs: 2000 });

  assert.equal(waitExitCode(outcome), UNVERIFIED_EXIT);
  assert.notEqual(waitExitCode(outcome), UNREACHABLE_EXIT);
  assert.notEqual(waitExitCode(outcome), VANISHED_EXIT);
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.halt, undefined);
});

test("the three refusals and every gate verdict are mutually distinguishable BY NUMBER", () => {
  // Prose about "each is distinguishable" is worth nothing if two of them share a code. 75 is
  // already spent twice in this repo (this waiter's bound, and db:up's EX_TEMPFAIL), which is
  // exactly why the remote arm does not reach for it a third time.
  const gateCodes = [0, 1, 3, 4];
  const refusals = [UNVERIFIED_EXIT, UNREACHABLE_EXIT, VANISHED_EXIT];
  assert.equal(new Set(refusals).size, refusals.length, "the refusals must not share a code");
  for (const refusal of refusals) {
    assert.ok(!gateCodes.includes(refusal), `${String(refusal)} collides with a code the gate itself returns`);
  }
});

test("the HAPPY PATH still returns THE REMOTE RUN'S OWN status — 3 and 4 survive the network", async () => {
  for (const code of [0, 1, 3, 4, 42]) {
    const clock = fakeClock();
    const io = createRemoteWaitIo(TARGET, scriptedProbe([alive, alive, settled(`${String(code)}\n`)]), clock);
    const outcome = await waitForDispatchHandle(HANDLE, io);
    assert.equal(outcome.halt, undefined);
    assert.equal(outcome.timedOut, false);
    assert.equal(waitExitCode(outcome), code, `a remote run that exited ${String(code)}`);
    assert.deepEqual(clock.sleeps, [DEFAULT_POLL_MS, DEFAULT_POLL_MS]);
  }
});

test("a run that finishes DURING a network outage is still reported by its own sentinel", async () => {
  // The outage must not become the answer when the box comes back with the real one.
  const down = unreachable("Connection reset by peer");
  const clock = fakeClock();
  const io = createRemoteWaitIo(TARGET, scriptedProbe([alive, down, down, settled("0\n")]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io);
  assert.equal(outcome.halt, undefined);
  assert.equal(waitExitCode(outcome), 0);
});

test("an unparseable remote sentinel keeps waiting, exactly as it does locally", async () => {
  const clock = fakeClock();
  const io = createRemoteWaitIo(TARGET, scriptedProbe([settled("")]), clock);
  const outcome = await waitForDispatchHandle(HANDLE, io, { timeoutMs: 6000, pollMs: 2000 });
  assert.equal(outcome.reading.state, "unreadable");
  assert.equal(waitExitCode(outcome), UNVERIFIED_EXIT);
  assert.equal(outcome.halt, undefined, "half-written is not vanished");
});

test("the local arm is UNTOUCHED — no halt seam means no behaviour change", async () => {
  // The remote arm is a new observer, not a new loop. This asserts the extension is inert for a
  // WaitIo that does not implement it, which is what keeps one failure vocabulary rather than two.
  const files = new Map<string, string>([[EXIT, "3\n"]]);
  const clock = fakeClock();
  const outcome = await waitForDispatchHandle(HANDLE, {
    exists: (p) => files.has(p),
    readText: (p) => files.get(p) ?? "",
    now: clock.now,
    sleep: clock.sleep,
  });
  assert.equal(outcome.halt, undefined);
  assert.equal(waitExitCode(outcome), 3);
});

// ---------------------------------------------------------------------------
// D. The script and the ssh invocation
// ---------------------------------------------------------------------------

test("shQuote survives a path containing a single quote", () => {
  assert.equal(shQuote("/tmp/it's here.log"), `'/tmp/it'\\''s here.log'`);
});

test("★ THE LIVENESS PROBE SIGNALS THE PROCESS GROUP — with the leading minus", () => {
  // `setsid` makes the recorded pid a process-GROUP id. The parent sits at near-zero cpu while its
  // children (pnpm, tsx, blender) do the work, so a bare-pid probe answers about the wrong process.
  // A structural fence, read from the emitted script rather than from a comment about it.
  const script = remoteProbeScript(TARGET);
  assert.match(script, /kill -0 -"\$pgid"/, "the group form, not `kill -0 \"$pgid\"`");
  assert.doesNotMatch(script, /kill -0 "\$pgid"/);
});

test("the script embeds QUOTED paths, and reports `unknown` when there is no pid file to read", () => {
  const script = remoteProbeScript(remoteTarget("mint", "/tmp/a b.log", "/tmp/p id.pid"));
  assert.match(script, /log='\/tmp\/a b\.log'/);
  assert.match(script, /exitfile='\/tmp\/a b\.log\.exit'/);
  assert.match(script, /pidfile='\/tmp\/p id\.pid'/);
  assert.match(remoteProbeScript(BLIND_TARGET), /pidfile=''/);
});

test("ssh runs in BatchMode with a connect timeout — a wait must never sit on a password prompt", () => {
  const args = sshProbeArgs(TARGET);
  assert.ok(args.includes("BatchMode=yes"), "an interactive prompt would hang the wait, not refuse it");
  assert.ok(args.some((a) => a.startsWith("ConnectTimeout=")));
  assert.equal(args.at(-2), "mint");
  assert.equal(args.at(-1), "sh -s");
});

// ---------------------------------------------------------------------------
// E. INTEGRATION — the generated script actually runs, under a real shell
// ---------------------------------------------------------------------------
//
// The unit tests above prove the DECISIONS. They cannot prove the script is valid sh, and a script
// that fails to run reports every file as absent — which reads as "nothing dispatched here" and is
// waited out silently. So the script is executed for real against real files. No ssh, no host: the
// remote shell and a local one run the same POSIX sh, and it is the SCRIPT under test.
//
// It skips only when no shell can be RESOLVED — an environment fact. A shell that runs and then
// misbehaves is a defect and reds, rather than skipping into a vacuous green.

test("the generated script runs under a real shell and reports what is actually on disk", (t) => {
  let bash: string;
  try {
    bash = resolveRepoBash();
  } catch {
    t.skip("no POSIX shell resolvable on this machine — nothing to run the probe script under");
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), "st-remote-probe-"));
  try {
    const logPath = path.join(dir, "run.jsonl").replaceAll("\\", "/");
    const pidPath = path.join(dir, "run.pid").replaceAll("\\", "/");
    const target = remoteTarget("localhost", logPath, pidPath);

    const runScript = (): RemoteSnapshot => {
      const res = spawnSync(bash, ["-s"], {
        input: remoteProbeScript(target),
        encoding: "utf8",
        windowsHide: true,
      });
      if (res.error !== undefined) {
        throw new Error(`could not run the shell: ${res.error.message}`);
      }
      return parseRemoteProbe({
        status: res.status,
        signal: res.signal,
        stdout: res.stdout ?? "",
        stderr: res.stderr ?? "",
      });
    };

    // 1. Nothing dispatched here at all.
    const nothing = runScript();
    assert.equal(nothing.reach, "reached", `the script must RUN; it did not: ${nothing.reason ?? ""}`);
    assert.equal(nothing.logExists, false);
    assert.equal(nothing.sentinel, null);
    assert.equal(nothing.group, "unknown", "an unreadable pid file is unknown, never gone");

    // 2. A run in flight: a log, no sentinel, and a pid file naming a group that does not exist.
    writeFileSync(logPath, "turn 1\n", "utf8");
    writeFileSync(pidPath, "4194303\n", "utf8");
    const inFlight = runScript();
    assert.equal(inFlight.logExists, true);
    assert.equal(inFlight.sentinel, null);
    assert.equal(inFlight.group, "gone", "a group with no members reads as gone");
    assert.equal(typeof inFlight.logMtimeEpoch, "number", "the log's mtime round-trips as epoch seconds");

    // 3. Settled — the sentinel's exact status crosses the wire, trailing newline stripped.
    writeFileSync(`${logPath}.exit`, "4\n", "utf8");
    const done = runScript();
    assert.equal(done.sentinel, "4");

    // 4. A NON-NUMERIC pid file is `unknown`, not `gone`. The kill is never even attempted, so a
    //    corrupt pid file can never be mistaken for a dead process.
    writeFileSync(pidPath, "not-a-pid\n", "utf8");
    assert.equal(runScript().group, "unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
