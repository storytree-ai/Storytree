// The SPAWN REGISTRY — which long-running work belongs to which session, on a shared dev box.
//
// THE DEFECT THIS CLOSES (`shared-box-session-ownership-arc`, increment 1). Several sessions run
// concurrently on one box, each spawning deep pnpm / tsx / node trees. Nothing attributes any of it
// back to the session that started it, and no verb answers "what am I still running?". Two failures
// compound out of that single gap: a session cannot INVENTORY its own work, so it cannot RECLAIM it
// safely — the only heuristic left is start time, which reaches across sessions and kills a
// sibling's live run. The harness half is no better: it notifies on a task's completion OR failure,
// so a task that HANGS produces neither, and its silence is indistinguishable from "already handled".
// A session can therefore run every step of the ADR-0271 closing leg, report itself INERT, and still
// hold live work it has no way to discover. That is not only untidy: `library artifact edit` is
// last-write-wins and both writers print success, so a hung write that commits after its session went
// inert silently reverts a field another session had already corrected, attributable to nobody.
//
// THE SHAPE. One tiny JSON file per live process, under a per-session directory:
//
//     <root>/<sessionId>/<pid>.json
//
// A process REGISTERS itself as it starts and DE-REGISTERS on exit. The directory name is the
// ownership key, so "my work" is a directory listing rather than a guess about a command line, and
// "not my work" is every other directory — which is what lets a reclaim be scoped to one session
// with no heuristic and no cross-session reach.
//
// WHY A FILE PER PID AND NOT AN APPEND LOG. Concurrent writers. A JSONL registry has every session
// (and every one of its own parallel invocations) appending to one file, where an interleaved write
// corrupts a line that then reads as a lost record. One file per pid makes each write a single
// `writeFileSync` to a path nobody else names, and de-registration an `unlink` of that same path —
// no locking, no read-modify-write, no torn lines.
//
// WHAT A LEAKED RECORD MEANS, and why the registry does not delete it. A record whose process is
// gone was NOT de-registered, which happens exactly when the process was killed or crashed. That is
// signal, not litter: it is the record of work that ended without saying so, and it is the only
// evidence a later session has that something died mid-flight. So it is REPORTED as leaked and
// cleared on request ({@link clearExitedRecords}), never silently swept during a read.
//
// THE LIMIT, STATED RATHER THAN PAPERED OVER: a pid can be REUSED once the process holding it exits.
// A leaked record whose pid the OS has since handed to something unrelated therefore reads as `live`.
// The window is small in practice (records are removed on normal exit, so only killed/crashed
// processes linger) but it is real, and it is why {@link classifySpawn} reports what the probe SAW
// rather than asserting the recorded command is what is running. Nothing here may be used to kill a
// process; naming a candidate is the whole contract.
//
// PURE BY INJECTION. Every decision below is a function of its arguments — the filesystem arrives as
// {@link SpawnRegistryIo} and liveness as an {@link AliveProbe} — so the states, the classification
// and the render are unit-tested with no processes and no disk.

import * as fs from "node:fs";
import path from "node:path";

// The FORMAT — where a record lives and what it says — is defined once, in plain ESM, because the
// registrars that matter most are not all TypeScript: `scripts/studio.mjs` spawns the detached vite
// server that outlives a session, and it must run before any workspace install (see
// `spawn-record.mjs`). Re-exported rather than restated here so a drifted copy is impossible; the
// reference equality is pinned by `spawn-record.test.ts`, because a second copy would fail in the one
// direction nothing notices — the launcher writing records this reader has stopped looking for.
//
// The DETACHED registrar rides along on the same surface: a launcher that registers on its CHILD's
// behalf is doing registry work, and a caller should never have to know which of the two files a
// given function came from.
export {
  defaultRegistryRoot,
  deriveSpawnIdentity,
  formatSpawnRecord,
  registerDetachedSpawn,
  removeSpawnRecord,
  removeSpawnRecordForPid,
  sanitizeSessionId,
  spawnRecordPath,
} from "./spawn-record.mjs";
export type { DetachedSpawn, RegisterOptions, SpawnIdentity } from "./spawn-record.mjs";

import {
  defaultRegistryRoot,
  formatSpawnRecord,
  sanitizeSessionId,
  spawnRecordPath,
} from "./spawn-record.mjs";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** One registered process: who owns it, what it is, and when it started. */
export interface SpawnRecord {
  /** The owning session (ADR-0033 worktree identity), or the `STORYTREE_SESSION_ID` override. */
  readonly sessionId: string;
  /** The branch the session is on. May be empty when git could not say. */
  readonly branch: string;
  /** The OS process id. */
  readonly pid: number;
  /** A human label for what this process IS — an argv rendering, not a shell-safe command. */
  readonly command: string;
  /** Where it was launched from — the worktree, usually. */
  readonly cwd: string;
  /** ISO timestamp of registration. */
  readonly startedAt: string;
}

/** A record found on disk that could not be parsed — reported, never silently dropped. */
export interface UnreadableRecord {
  readonly filePath: string;
  readonly reason: string;
}

/**
 * Parse a record, or say why not. Tolerant by design: the registry is written by processes that may
 * be killed mid-write, so a half-written file is a NORMAL finding and must never throw out of a read
 * that is inventorying everything else successfully.
 */
export function parseSpawnRecord(text: string): { record: SpawnRecord } | { reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { reason: "not valid JSON (a write that was interrupted looks like this)" };
  }
  if (typeof raw !== "object" || raw === null) return { reason: "not a JSON object" };
  const o = raw as Record<string, unknown>;
  const pid = o["pid"];
  const sessionId = o["sessionId"];
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return { reason: "no usable pid" };
  }
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return { reason: "no sessionId" };
  }
  return {
    record: {
      sessionId,
      pid,
      branch: typeof o["branch"] === "string" ? o["branch"] : "",
      command: typeof o["command"] === "string" ? o["command"] : "(unrecorded)",
      cwd: typeof o["cwd"] === "string" ? o["cwd"] : "",
      startedAt: typeof o["startedAt"] === "string" ? o["startedAt"] : "",
    },
  };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Whether a pid currently names a running process. `unknown` is a real answer, not a shrug: a probe
 * that cannot tell must not be folded into either bucket, or an inventory starts under-reporting
 * live work — the failure this file exists to fix.
 */
export type AliveProbe = (pid: number) => boolean | "unknown";

/**
 * What the registry can honestly say about one record.
 *
 *  - `live`   — the pid names a running process. See the pid-reuse limit in the header: this is what
 *               the probe saw, not proof that the recorded command is what is running.
 *  - `leaked` — the record survives but the process is gone, so it exited without de-registering,
 *               i.e. it was killed or it crashed.
 *  - `unknown`— the probe could not tell. Never a pass and never a clear.
 */
export type SpawnState = "live" | "leaked" | "unknown";

export interface ClassifiedSpawn {
  readonly record: SpawnRecord;
  readonly state: SpawnState;
  /** Milliseconds since registration, or `null` when `startedAt` is missing or unparseable. */
  readonly ageMs: number | null;
}

/** Classify one record against a liveness probe and a clock. */
export function classifySpawn(record: SpawnRecord, probe: AliveProbe, nowMs: number): ClassifiedSpawn {
  const alive = probe(record.pid);
  const started = Date.parse(record.startedAt);
  const ageMs = Number.isNaN(started) ? null : Math.max(0, nowMs - started);
  const state: SpawnState = alive === "unknown" ? "unknown" : alive ? "live" : "leaked";
  return { record, state, ageMs };
}

/** One session's inventory, split by what can honestly be said about each record. */
export interface OwnershipSummary {
  readonly sessionId: string;
  readonly live: readonly ClassifiedSpawn[];
  readonly leaked: readonly ClassifiedSpawn[];
  readonly unknown: readonly ClassifiedSpawn[];
  readonly unreadable: readonly UnreadableRecord[];
}

/**
 * THE predicate for "may this session declare itself inert?" (ADR-0271 closing leg). Deliberately
 * the only way to ask, and deliberately NOT `live.length === 0`: an `unknown` record is work that
 * may still be running, and reading it as absent is the same confident-false-terminal this arc was
 * filed about. Unreadable records do not block — a torn file is a failure to OBSERVE one process,
 * not evidence of a live one, and blocking on it would give a session no way to ever finish.
 */
export function holdsLiveWork(summary: OwnershipSummary): boolean {
  return summary.live.length > 0 || summary.unknown.length > 0;
}

/**
 * The same inventory with one pid removed — always the READER's own.
 *
 * The reader registers itself like every other invocation, so without this every `storytree own`
 * reports at least one live row: itself. That is not merely noise. The row it would add is the one
 * row that is certainly NOT outstanding work, and it would make the honest answer — "nothing is
 * running, this session may go inert" — unreachable by construction, which is the opposite of what
 * the command is for.
 */
export function withoutPid(summary: OwnershipSummary, pid: number): OwnershipSummary {
  const drop = (list: readonly ClassifiedSpawn[]) => list.filter((c) => c.record.pid !== pid);
  return {
    sessionId: summary.sessionId,
    live: drop(summary.live),
    leaked: drop(summary.leaked),
    unknown: drop(summary.unknown),
    unreadable: summary.unreadable,
  };
}

/** Fold classified records into the summary buckets. */
export function summarizeOwnership(
  sessionId: string,
  classified: readonly ClassifiedSpawn[],
  unreadable: readonly UnreadableRecord[],
): OwnershipSummary {
  return {
    sessionId,
    live: classified.filter((c) => c.state === "live"),
    leaked: classified.filter((c) => c.state === "leaked"),
    unknown: classified.filter((c) => c.state === "unknown"),
    unreadable,
  };
}

// ---------------------------------------------------------------------------
// The filesystem seam
// ---------------------------------------------------------------------------

/** The narrow filesystem the registry needs — injected, so every path above is testable offline. */
export interface SpawnRegistryIo {
  mkdirp(dir: string): void;
  writeText(filePath: string, text: string): void;
  readText(filePath: string): string;
  remove(filePath: string): void;
  /** Entry names in `dir`, or `[]` when it does not exist. Never throws for a missing directory. */
  listDir(dir: string): string[];
}

/** The real filesystem. Every method absorbs a missing path into an empty answer, never an throw. */
export function nodeSpawnRegistryIo(): SpawnRegistryIo {
  return {
    mkdirp: (dir) => {
      fs.mkdirSync(dir, { recursive: true });
    },
    writeText: (filePath, text) => {
      fs.writeFileSync(filePath, text, "utf8");
    },
    readText: (filePath) => fs.readFileSync(filePath, "utf8"),
    remove: (filePath) => {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // A record we cannot remove is reported by the next read as still present — which is true.
      }
    },
    listDir: (dir) => {
      try {
        return fs.readdirSync(dir);
      } catch {
        return [];
      }
    },
  };
}

/**
 * The default liveness probe. `kill(pid, 0)` sends no signal; it asks the kernel whether the pid
 * exists. `EPERM` means it exists and is not ours — still ALIVE, and reading it as dead would be the
 * under-report this file exists to prevent.
 */
export function nodeAliveProbe(pid: number): boolean | "unknown" {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Register / de-register / read
// ---------------------------------------------------------------------------

/**
 * Record that this process is running, and hand back the path to remove on exit.
 *
 * FAIL-SILENT: registration is instrumentation, so a read-only home directory or a full disk must
 * never break the command being registered. A `null` return means the run is simply uninventoried —
 * the same state every run was in before this existed.
 */
export function registerSpawn(
  record: SpawnRecord,
  io: SpawnRegistryIo = nodeSpawnRegistryIo(),
  root: string = defaultRegistryRoot(),
): string | null {
  try {
    const filePath = spawnRecordPath(root, record.sessionId, record.pid);
    io.mkdirp(path.dirname(filePath));
    io.writeText(filePath, formatSpawnRecord(record));
    return filePath;
  } catch {
    return null;
  }
}

/** Remove one record. Idempotent — a record already gone is the desired end state, not an error. */
export function deregisterSpawn(
  filePath: string,
  io: SpawnRegistryIo = nodeSpawnRegistryIo(),
): void {
  try {
    io.remove(filePath);
  } catch {
    // Nothing to escalate: the next read reports it as leaked, which is exactly what it is.
  }
}

/** Every session id the registry currently holds records for. */
export function listRegisteredSessions(
  io: SpawnRegistryIo,
  root: string = defaultRegistryRoot(),
): string[] {
  return io.listDir(root).sort();
}

/**
 * Read and classify one session's records. Never throws: a directory that does not exist is an
 * EMPTY inventory (the normal state of a session that has spawned nothing), and a file that cannot
 * be parsed is reported in `unreadable` rather than aborting the read of its siblings.
 */
export function readOwnership(
  sessionId: string,
  io: SpawnRegistryIo,
  probe: AliveProbe,
  nowMs: number,
  root: string = defaultRegistryRoot(),
): OwnershipSummary {
  const dir = path.join(root, sanitizeSessionId(sessionId));
  const classified: ClassifiedSpawn[] = [];
  const unreadable: UnreadableRecord[] = [];
  for (const entry of io.listDir(dir).sort()) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(dir, entry);
    let text: string;
    try {
      text = io.readText(filePath);
    } catch {
      unreadable.push({ filePath, reason: "could not be read" });
      continue;
    }
    const parsed = parseSpawnRecord(text);
    if ("reason" in parsed) {
      unreadable.push({ filePath, reason: parsed.reason });
      continue;
    }
    classified.push(classifySpawn(parsed.record, probe, nowMs));
  }
  return summarizeOwnership(sessionId, classified, unreadable);
}

export interface ClearExitedRecordsResult { cleared: number; keptLive: number; keptUnknown: number }

/**
 * Remove the records whose process is GONE, and report what was removed.
 *
 * It clears `leaked` ONLY. A `live` record is work still running — removing it would hide exactly
 * what the inventory exists to show — and an `unknown` one is a record the probe could not judge,
 * which is not the same as a record it judged dead. Both are left alone and both are counted, so a
 * clear that removed nothing says so rather than reading as "the inventory is empty now".
 */
export function clearExitedRecords(
  summary: OwnershipSummary,
  io: SpawnRegistryIo,
  root: string = defaultRegistryRoot(),
): ClearExitedRecordsResult {
  for (const entry of summary.leaked) {
    io.remove(spawnRecordPath(root, entry.record.sessionId, entry.record.pid));
  }
  return {
    cleared: summary.leaked.length,
    keptLive: summary.live.length,
    keptUnknown: summary.unknown.length,
  };
}
