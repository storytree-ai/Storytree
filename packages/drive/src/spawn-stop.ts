// STOPPING registered work — the reclaim half of `shared-box-session-ownership-arc`.
//
// THE DEFECT THIS CLOSES. Increment 1 gave a session an INVENTORY (`storytree own`): it can now see
// the background work it still holds. Seeing is not reclaiming, and the one cleanup path a session
// is told to use is measurably dishonest — friction
// `taskstop-kills-the-wrapper-and-leaves-the-detached-child-holding-the-port`: `TaskStop` terminates
// the shell it launched, the detached node process that shell spawned keeps running and keeps its
// listening port, and the call reports SUCCESS. The success message is precisely what stops anyone
// checking, so the leak survives until the next session collides with the held port and goes hunting
// the process table on a shared box — the manoeuvre this arc exists to make unnecessary.
//
// So this module is built around one rule, and everything else here is a consequence of it:
//
//     THE VERDICT COMES FROM THE RE-PROBE, NEVER FROM THE SIGNAL.
//
// A terminator that returns `true` has delivered a signal. That is not evidence the process died —
// it is evidence the request was accepted. {@link stopSpawn} therefore ignores the terminator's
// return value as a verdict, waits, asks the liveness probe again, and reports what the PROBE said.
// A stop that could not be confirmed is reported as unconfirmed, which is the whole point: the
// entry's complaint is not that stopping is hard, it is that failing to stop reads as success.
//
// THE LADDER. Ask politely, verify, then insist, then verify again:
//
//     probe → (already gone?) → graceful → wait → probe → force → wait → probe → verdict
//
// TREE, NOT PID. Killing the recorded pid alone would REBUILD the defect: the registered process is
// a `pnpm` / `tsx` shim whose real work is a child, and killing the parent orphans the child holding
// the port. {@link nodeTerminator} therefore targets the process TREE on both platforms — `taskkill
// /T` on Windows, the process GROUP on POSIX — and falls back to the bare pid when the tree call is
// refused, because killing one process is strictly better than killing none.
//
// OWNERSHIP IS THE SAFETY PROPERTY, and it is enforced by {@link resolveStopTargets} rather than by
// care. A caller may only stop pids that appear in ITS OWN session's inventory; a pid belonging to
// another session is REFUSED and named as such. That is the difference between this and the
// start-time sweep the arc was filed about — a sweep has no ownership signal to filter on, so it
// reaches across sessions and kills a sibling's live run, and the sibling gets no signal about why.
// Here, reaching across sessions is not discouraged, it is unrepresentable: the target list is
// derived from one session's directory.
//
// PURE BY INJECTION, like the registry beside it. The ladder takes its terminator, its probe and its
// clock as arguments, so every outcome below — including "the force kill did not work" — is unit
// tested with no processes, no signals and no waiting.

import { execFileSync } from "node:child_process";

import {
  type AliveProbe,
  type ClassifiedSpawn,
  type OwnershipSummary,
  type SpawnRecord,
  type SpawnRegistryIo,
  defaultRegistryRoot,
  deregisterSpawn,
  spawnRecordPath,
} from "./spawn-registry.js";

// ---------------------------------------------------------------------------
// The seams
// ---------------------------------------------------------------------------

/**
 * How hard to ask. `graceful` lets a process run its exit handlers — which is what de-registers its
 * own record and flushes whatever it was writing; `force` does not, and is the reason a forced stop
 * leaves a leaked record behind rather than a clean one.
 */
export type StopMode = "graceful" | "force";

/**
 * Ask the OS to stop a process tree. Returns whether the request was DELIVERED — never whether the
 * process died. Nothing in this module treats a `true` here as a verdict; see the header.
 */
export type Terminator = (pid: number, mode: StopMode) => boolean;

/** Block for `ms`. Injected so the tests exercise the full ladder without waiting for it. */
export type Sleep = (ms: number) => void;

/**
 * How long to wait for each rung before re-probing.
 *
 * These are deliberately SHORT. The wait is not "long enough for any process to shut down cleanly" —
 * no such number exists — it is long enough that a process which is going to die from this signal
 * has done so. Anything still alive after it gets the next rung, and anything still alive after the
 * last rung is REPORTED rather than waited on, because an honest "it did not die" beats a longer
 * hang that ends in the same answer.
 */
export interface StopTiming {
  readonly gracefulWaitMs: number;
  readonly forceWaitMs: number;
}

export const DEFAULT_STOP_TIMING: StopTiming = { gracefulWaitMs: 2000, forceWaitMs: 2000 };

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * What can honestly be said after trying to stop one process.
 *
 *  - `already-gone`  — the probe said dead BEFORE anything was signalled. The record was stale: this
 *                      is a leaked row, not a stop, and reporting it as a kill would overstate what
 *                      happened.
 *  - `stopped`       — a re-probe confirmed the process is gone. The only success value.
 *  - `still-running` — a re-probe confirmed it is STILL THERE after the force rung. The honest
 *                      failure, and the one the friction entry says never gets reported today.
 *  - `unconfirmed`   — the probe could not tell after the attempt. NOT a success: an unanswerable
 *                      probe is not a probe that said yes (the ADR-0328 D3 discipline the registry's
 *                      `holdsLiveWork` already follows for `unknown`).
 */
export type StopOutcome = "already-gone" | "stopped" | "still-running" | "unconfirmed";

export interface StopResult {
  readonly record: SpawnRecord;
  readonly outcome: StopOutcome;
  /** The rung that produced the outcome — `null` when nothing was signalled at all. */
  readonly viaMode: StopMode | null;
  /** Whether the registry row was removed. Only ever true when the process is provably gone. */
  readonly recordCleared: boolean;
}

/** Did this stop leave the process running? `unconfirmed` counts as yes — see {@link StopOutcome}. */
export function stopLeftWorkRunning(result: StopResult): boolean {
  return result.outcome === "still-running" || result.outcome === "unconfirmed";
}

// ---------------------------------------------------------------------------
// Target resolution — the ownership fence
// ---------------------------------------------------------------------------

/** A pid the caller asked for that its own inventory does not contain. */
export interface UnownedTarget {
  readonly pid: number;
  /** `"not-registered"` when no session claims it; otherwise the session that does. */
  readonly heldBy: string | "not-registered";
}

export interface StopTargets {
  readonly targets: readonly ClassifiedSpawn[];
  readonly unowned: readonly UnownedTarget[];
}

/**
 * Narrow a requested pid list to the ones this session actually owns.
 *
 * THE FENCE, and the reason it is a function rather than a rule to remember: a caller cannot stop
 * what it does not own, because the candidate set is built from one session's inventory. `others`
 * exists only to tell the caller WHO owns a refused pid — attribution, which is what makes this
 * usable without a start-time guess — and is never a source of targets.
 */
export function resolveStopTargets(
  mine: OwnershipSummary,
  requestedPids: readonly number[],
  others: readonly OwnershipSummary[] = [],
): StopTargets {
  const owned = new Map<number, ClassifiedSpawn>();
  for (const entry of [...mine.live, ...mine.unknown, ...mine.leaked]) {
    owned.set(entry.record.pid, entry);
  }

  const targets: ClassifiedSpawn[] = [];
  const unowned: UnownedTarget[] = [];
  const seen = new Set<number>();

  for (const pid of requestedPids) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    const hit = owned.get(pid);
    if (hit !== undefined) {
      targets.push(hit);
      continue;
    }
    unowned.push({ pid, heldBy: findHolder(pid, others) });
  }
  return { targets, unowned };
}

function findHolder(pid: number, others: readonly OwnershipSummary[]): string | "not-registered" {
  for (const summary of others) {
    for (const entry of [...summary.live, ...summary.unknown, ...summary.leaked]) {
      if (entry.record.pid === pid) return summary.sessionId;
    }
  }
  return "not-registered";
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

export interface StopSpawnDeps {
  readonly terminate: Terminator;
  readonly probe: AliveProbe;
  readonly sleep: Sleep;
  readonly timing?: StopTiming;
  /** Registry writes. Omitted in a preview; supplied when the row should be cleared on success. */
  readonly io?: SpawnRegistryIo;
  readonly root?: string;
}

/**
 * Stop one registered process, then VERIFY, then say what actually happened.
 *
 * WHY THE RECORD IS ONLY CLEARED ON A CONFIRMED DEATH. A registry row is the evidence that work
 * exists; removing it is the one action here that can HIDE something. So it happens exactly when the
 * process is provably gone, and never on `still-running` or `unconfirmed` — a stop that failed must
 * leave the row standing, or the next `storytree own` reports a clean inventory over a process that
 * is still writing, which is the false clear this whole arc exists to remove. That is also why a
 * forced kill still clears: the victim had no chance to de-register itself, so the row it left is
 * ours to retire, and it was retired on EVIDENCE rather than on the assumption the signal worked.
 */
export function stopSpawn(entry: ClassifiedSpawn, deps: StopSpawnDeps): StopResult {
  const timing = deps.timing ?? DEFAULT_STOP_TIMING;
  const { record } = entry;

  // Rung 0 — is there anything to stop? A dead pid signalled anyway would report a kill that never
  // happened, and on a reused pid it would be someone else's process.
  if (deps.probe(record.pid) === false) {
    return finish(record, "already-gone", null, deps);
  }

  for (const [mode, waitMs] of [
    ["graceful", timing.gracefulWaitMs],
    ["force", timing.forceWaitMs],
  ] as const) {
    deps.terminate(record.pid, mode);
    deps.sleep(waitMs);
    // The verdict. Note what is NOT consulted: whatever `terminate` returned.
    const after = deps.probe(record.pid);
    if (after === false) return finish(record, "stopped", mode, deps);
    if (after === "unknown" && mode === "force") {
      return finish(record, "unconfirmed", mode, deps);
    }
  }

  return finish(record, "still-running", "force", deps);
}

function finish(
  record: SpawnRecord,
  outcome: StopOutcome,
  viaMode: StopMode | null,
  deps: StopSpawnDeps,
): StopResult {
  const provablyGone = outcome === "stopped" || outcome === "already-gone";
  let recordCleared = false;
  if (provablyGone && deps.io !== undefined) {
    deregisterSpawn(
      spawnRecordPath(deps.root ?? defaultRegistryRoot(), record.sessionId, record.pid),
      deps.io,
    );
    recordCleared = true;
  }
  return { record, outcome, viaMode, recordCleared };
}

/** Run the ladder over several targets, in the order given. */
export function stopSpawns(
  targets: readonly ClassifiedSpawn[],
  deps: StopSpawnDeps,
): StopResult[] {
  return targets.map((entry) => stopSpawn(entry, deps));
}

// ---------------------------------------------------------------------------
// The real terminator
// ---------------------------------------------------------------------------

/** Block the thread for `ms` without an event-loop turn — the caller is a CLI about to report. */
export function nodeSleep(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Stop a process TREE on the host platform.
 *
 * WHY THE TREE IS THE UNIT. The registered pid is usually a shim — `pnpm` spawning `tsx` spawning
 * `node` — and the friction entry this module answers is exactly that the parent dies while the
 * child keeps the port. Killing the recorded pid alone would reproduce the reported bug in the verb
 * built to fix it.
 *
 * WINDOWS. `taskkill /T` walks the child tree; without `/F` it asks, with `/F` it terminates.
 * (Node's own `process.kill(pid, "SIGTERM")` maps to `TerminateProcess` here, so it is neither
 * graceful nor tree-aware — using it would make the `graceful` rung a lie AND leak the children.)
 *
 * POSIX. Signalling `-pid` targets the process GROUP, which is what catches the children. A process
 * that is not a group leader answers `ESRCH`, so the bare pid is the documented fallback: stopping
 * one process is strictly better than stopping none, and the ladder's re-probe reports the shortfall
 * rather than hiding it.
 */
export function nodeTerminator(pid: number, mode: StopMode): boolean {
  if (process.platform === "win32") {
    const args = mode === "force" ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"];
    try {
      execFileSync("taskkill", args, { stdio: "ignore" });
      return true;
    } catch {
      // taskkill exits non-zero for "no such process" as well as for a refusal. Either way nothing
      // was delivered, and the re-probe is what decides the outcome.
      return false;
    }
  }

  const signal = mode === "force" ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}
