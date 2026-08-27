// The REMOTE arm of `storytree dispatch --wait` — `dispatched-work-wakes-its-dispatcher-arc` inc 1.
//
// WHAT WAS MISSING. A session that hands an hour of work to another box cannot be TOLD when it
// finishes. Cross-session messaging does not reach another machine, and a `claude -p` batch session
// has no inbox at all, so the dispatched side cannot report back BY CONSTRUCTION. What the
// dispatching harness DOES have is a notification when its own local background task completes. So
// the instrument is a local watcher that blocks on a REMOTE condition and whose own completion IS
// the notification. Nothing is sent; the remote work only has to flip a state this can see.
//
// THIS IS NOT A SECOND WAITER. The loop, the bound and the exit mapping stay in `dispatch-wait.ts`,
// which is already correct and already proven against a fake clock. A remote handle changes only
// how `exists` / `readText` are ANSWERED, so what lives here is a {@link WaitIo} implementation —
// one `ssh` round trip per poll — plus the one thing the local seam genuinely cannot express.
//
// ⚠ THE LOAD-BEARING REQUIREMENT: "I COULD NOT TELL" IS ITS OWN STATE, WITH ITS OWN EXIT CODE.
// Locally, `exists() === false` is a fact — the sentinel is not there. Across a network the same
// `false` may mean the host never answered, and folding that into `not-dispatched` would let an
// unreachable host be waited out and then reported as a bound expiring, or worse be read as an
// answer about the job. The three honest non-answers are therefore kept apart, in the same idiom
// `spawn-registry.ts` uses for `SpawnState = "live" | "leaked" | "unknown"`:
//
//   UNREACHABLE  the probe itself failed — network, ssh, key, remote shell. Nothing about the job
//                was observed at all. {@link UNREACHABLE_EXIT} (69, EX_UNAVAILABLE).
//   VANISHED     the probe SUCCEEDED and reported that the remote process group is gone while no
//                sentinel exists. The job was killed or crashed without recording a status.
//                {@link VANISHED_EXIT} (76, EX_PROTOCOL — a remote end that broke the exchange).
//   UNKNOWN      the group could not be probed (no pid file, an unreadable one, a non-numeric one).
//                This NEVER becomes VANISHED. It keeps waiting and expires as the ordinary
//                UNVERIFIED 75, because "I have no way to look" is not evidence of death.
//
// WHY THOSE NUMBERS AND NOT 75. `UNVERIFIED_EXIT` (75) already means "MY bound expired" in
// `dispatch-wait.ts`, and `db:up` already spends 75 as EX_TEMPFAIL for "still warming". Giving a
// third meaning to the same number would take a distinction away from every caller instead of
// adding one. 69 and 76 are unused in this repo and both are sysexits codes whose standard meaning
// is the one wanted here.
//
// TWO TRAPS FROM THE DESKTOP PASS, both already paid for once and both encoded below:
//   - `setsid` makes the launched pid a process-GROUP id, so liveness must probe the GROUP
//     (`kill -0 -PGID`, with the leading minus). A bare-pid probe reports the parent only and
//     misses every blender/pnpm child.
//   - The remote parent's OWN cpu time is near zero while its children do the work (3 s after six
//     minutes). Parent CPU is NOT a liveness signal, which is why nothing here reads it. The log's
//     mtime is collected and REPORTED for the human, and deliberately never DECIDED on: an mtime
//     that has not moved does not prove death any more than `NO CPU PROGRESS` does.
//
// PURE BY INJECTION. Every decision — the probe parser, the strike machine, the script builder — is
// a function of its arguments, so all four failure branches are exercised with no host, no ssh and
// no sleeping. `pnpm -r test` stays credential-free.

import { spawnSync } from "node:child_process";

import { normalizeHandle } from "./dispatch-handle.js";
import type { WaitHalt, WaitIo } from "./dispatch-wait.js";

// ---------------------------------------------------------------------------
// The reserved exit codes
// ---------------------------------------------------------------------------

/**
 * The host could not be reached — sysexits `EX_UNAVAILABLE`. Nothing about the dispatched job was
 * observed, so this is not a fail, not a pass, and not a statement that the job is still running.
 */
export const UNREACHABLE_EXIT = 69;

/**
 * The remote process group is gone and it wrote no sentinel — sysexits `EX_PROTOCOL`, "a remote
 * error in protocol": the far end left the exchange without saying how it ended. Killed, OOM-ed, or
 * crashed. Emphatically NOT a pass, and not a fail either, because the job never reported one.
 */
export const VANISHED_EXIT = 76;

// ---------------------------------------------------------------------------
// One probe's worth of truth
// ---------------------------------------------------------------------------

/**
 * What can honestly be said about the remote process group.
 *
 *  - `live`    — `kill -0 -PGID` succeeded: at least one member of the group exists.
 *  - `gone`    — it failed: no member of the group exists (or none we may signal).
 *  - `unknown` — there was nothing to probe. Never folded into `gone`.
 */
export type RemoteGroupState = "live" | "gone" | "unknown";

/** One `ssh` round trip's answer. `reach` gates everything else: an unreachable probe saw nothing. */
export interface RemoteSnapshot {
  readonly reach: "reached" | "unreachable";
  /** Why the probe failed. Present only when `reach` is `unreachable`. */
  readonly reason?: string;
  /** Whether the remote log file exists — the `running` vs `not-dispatched` distinction. */
  readonly logExists: boolean;
  /** The sentinel's raw text, or `null` when there is no sentinel. Never `""` for "absent". */
  readonly sentinel: string | null;
  readonly group: RemoteGroupState;
  /** The log's mtime in epoch SECONDS, or `null`. Reported to the human; never decided on. */
  readonly logMtimeEpoch: number | null;
}

/** A snapshot that saw nothing, with the reason it saw nothing. */
export function unreachable(reason: string): RemoteSnapshot {
  return { reach: "unreachable", reason, logExists: false, sentinel: null, group: "unknown", logMtimeEpoch: null };
}

/** The seam: one round trip, synchronous because a blocking watcher has nothing else to do. */
export type RemoteProbe = () => RemoteSnapshot;

/** Where the dispatched run's state lives on the far side. */
export interface RemoteTarget {
  /** The ssh destination — `mint`, `user@host`, or any `ssh_config` alias. */
  readonly host: string;
  readonly logPath: string;
  readonly exitFile: string;
  /**
   * The remote file holding the process-GROUP id (`echo $! > /tmp/<slot>.pid` after a `setsid`).
   * OPTIONAL, and its absence is honest: without it {@link RemoteSnapshot.group} is `unknown`
   * forever and the VANISHED branch can never fire — the watcher waits and expires instead of
   * guessing that a job it cannot see is dead.
   */
  readonly pidFile?: string;
}

/** Build a target from the handle the dispatcher was given. */
export function remoteTarget(host: string, handle: string, pidFile?: string): RemoteTarget {
  const { logPath, exitFile } = normalizeHandle(handle);
  return pidFile === undefined || pidFile === ""
    ? { host, logPath, exitFile }
    : { host, logPath, exitFile, pidFile };
}

// ---------------------------------------------------------------------------
// The remote script and its reply
// ---------------------------------------------------------------------------

/** The first line of a well-formed reply. Its ABSENCE is what makes a garbled read unreachable. */
export const PROBE_MARKER = "storytree-remote-probe=1";

/**
 * POSIX-sh quoting for one value. The paths are embedded in the script text rather than passed as
 * argv because `ssh host sh -s -- a b c` re-parses the whole line in the REMOTE shell, where a path
 * containing a space would silently split into two — and a path that silently fails to exist reads
 * as "no sentinel", which is the exact wrong answer.
 */
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * The whole probe, as one script sent on stdin. ONE round trip answers everything: whether the log
 * exists, what the sentinel says, whether the process GROUP is alive, and when the log last moved.
 *
 * ⚠ The liveness line is `kill -0 -"$pgid"` — WITH THE LEADING MINUS. `setsid` made the recorded
 * pid a process-group id, and the children (pnpm, tsx, blender) are group members while the parent
 * sits at near-zero cpu. Dropping the minus probes the parent alone and reports a live render as
 * dead. Proven on the Mint desktop 2026-08-27.
 *
 * A pid file that is missing, unreadable or non-numeric yields `group=unknown` rather than
 * `group=gone`: the VANISHED branch must fire on evidence of death, never on absence of evidence.
 */
export function remoteProbeScript(target: RemoteTarget): string {
  return [
    "set -u",
    `log=${shQuote(target.logPath)}`,
    `exitfile=${shQuote(target.exitFile)}`,
    `pidfile=${shQuote(target.pidFile ?? "")}`,
    `printf '%s\\n' ${shQuote(PROBE_MARKER)}`,
    'if [ -e "$log" ]; then printf "log=1\\n"; else printf "log=0\\n"; fi',
    'if [ -e "$exitfile" ]; then',
    '  printf "sentinel=1\\n"',
    '  printf "sentinel-text=%s\\n" "$(tr -d \'\\r\\n\' < "$exitfile" 2>/dev/null)"',
    "else",
    '  printf "sentinel=0\\n"',
    "fi",
    'if [ -n "$pidfile" ] && [ -r "$pidfile" ]; then',
    '  pgid=$(tr -d \'\\r\\n\' < "$pidfile" 2>/dev/null)',
    '  case "$pgid" in',
    '    ""|*[!0-9]*) printf "group=unknown\\n" ;;',
    '    *) if kill -0 -"$pgid" 2>/dev/null; then printf "group=live\\n"; else printf "group=gone\\n"; fi ;;',
    "  esac",
    "else",
    '  printf "group=unknown\\n"',
    "fi",
    'if [ -e "$log" ]; then printf "mtime=%s\\n" "$(stat -c %Y "$log" 2>/dev/null || echo -)"; else printf "mtime=-\\n"; fi',
    "",
  ].join("\n");
}

/** What a spawn of `ssh` came back with, flattened so the parser below needs no child_process. */
export interface SshResult {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Set when the spawn itself failed — no ssh binary, for instance. */
  readonly spawnError?: string;
}

/** ssh's own "I could not get there" status. Anything it runs remotely would have to exit 255 too. */
const SSH_FAILURE_STATUS = 255;

/**
 * Turn one ssh result into a snapshot.
 *
 * EVERY way this can go wrong lands in `unreachable`, and that is the point: a probe that did not
 * complete has observed NOTHING about the job, so it must not contribute a fact about it. The
 * marker check is the one that matters most — a truncated or interleaved read would otherwise parse
 * as "log=0, sentinel absent", which is a confident, wrong statement about somebody's run.
 */
export function parseRemoteProbe(result: SshResult): RemoteSnapshot {
  if (result.spawnError !== undefined) {
    return unreachable(`the ssh probe could not be started (${result.spawnError})`);
  }
  if (result.signal !== null) {
    return unreachable(`the ssh probe was killed (${result.signal}) before it answered`);
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim().split("\n").slice(-1)[0] ?? "";
    const what =
      result.status === SSH_FAILURE_STATUS
        ? "ssh could not connect or authenticate"
        : `the remote shell exited ${String(result.status)}`;
    return unreachable(detail === "" ? what : `${what}: ${detail}`);
  }

  const fields = new Map<string, string>();
  for (const line of result.stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  if (fields.get("storytree-remote-probe") !== "1") {
    return unreachable("the probe answered, but not in its own protocol — the reply was not readable");
  }

  const sentinelPresent = fields.get("sentinel") === "1";
  const rawGroup = fields.get("group");
  const group: RemoteGroupState =
    rawGroup === "live" || rawGroup === "gone" ? rawGroup : "unknown";
  const rawMtime = fields.get("mtime") ?? "-";
  const mtime = /^\d+$/.test(rawMtime) ? Number(rawMtime) : null;

  return {
    reach: "reached",
    logExists: fields.get("log") === "1",
    sentinel: sentinelPresent ? (fields.get("sentinel-text") ?? "") : null,
    group,
    logMtimeEpoch: mtime,
  };
}

// ---------------------------------------------------------------------------
// The strike machine — the only place a halt is decided
// ---------------------------------------------------------------------------

export interface RemoteWatchLimits {
  /** Consecutive unreachable probes before the wait gives up. */
  readonly unreachableStrikes: number;
  /** Consecutive "group gone, no sentinel" probes before the wait calls it vanished. */
  readonly vanishStrikes: number;
}

/**
 * Both defaults are 3, and neither is a fudge factor.
 *
 * UNREACHABLE tolerates a blip because an eight-minute wait over ssh will meet one, and killing the
 * wait on a single dropped packet would make the verb useless without making it more honest — the
 * outcome is the same either way, only sooner.
 *
 * VANISHED tolerates a gap because there is a REAL race at the end of every healthy run: the
 * process exits, and only then does its wrapper write `<log>.exit`. For that instant the group is
 * gone and no sentinel exists — the exact fingerprint of a crash. Halting on the first sighting
 * would report a normal completion as a crash, which is a false terminal in the other direction.
 */
export const DEFAULT_REMOTE_LIMITS: RemoteWatchLimits = { unreachableStrikes: 3, vanishStrikes: 3 };

export interface RemoteWatchState {
  readonly unreachableStreak: number;
  readonly vanishedStreak: number;
}

export const INITIAL_REMOTE_WATCH: RemoteWatchState = { unreachableStreak: 0, vanishedStreak: 0 };

/** One fold of the strike machine: the state to carry, and whether the wait must stop. */
export interface RemoteWatchStep {
  readonly state: RemoteWatchState;
  /** `null` means keep waiting. Anything else ENDS the wait without a verdict. */
  readonly halt: WaitHalt | null;
}

/**
 * Fold one snapshot into the watch state, and say whether the wait must stop.
 *
 * Pure, and the ONLY place a halt is produced — so the four branches are exercised by calling this
 * with four snapshots, and a branch that stops firing stops being green.
 */
export function stepRemoteWatch(
  state: RemoteWatchState,
  snapshot: RemoteSnapshot,
  target: RemoteTarget,
  limits: RemoteWatchLimits = DEFAULT_REMOTE_LIMITS,
): RemoteWatchStep {
  if (snapshot.reach === "unreachable") {
    // A failed probe learned nothing about the job, so the vanish streak is RESET rather than
    // carried: counting a silence toward "the process is dead" would let a network fault graduate
    // into a claim about a process nobody looked at.
    const unreachableStreak = state.unreachableStreak + 1;
    const next = { unreachableStreak, vanishedStreak: 0 };
    if (unreachableStreak < limits.unreachableStrikes) return { state: next, halt: null };
    return {
      state: next,
      halt: {
        kind: "unreachable",
        exitCode: UNREACHABLE_EXIT,
        summary: `the host ${target.host} could not be reached`,
        detail: [
          `${String(unreachableStreak)} consecutive probes of ${target.host} failed.`,
          `  last reason : ${snapshot.reason ?? "unknown"}`,
          "",
          "NOTHING WAS OBSERVED about the dispatched run — it may well still be running. This is",
          "not a pass, not a fail, and not a statement that the job stopped. Fix the connection and",
          "wait again, or read the log on the host directly.",
        ],
      },
    };
  }

  if (snapshot.sentinel !== null) {
    // Something is there to read. Whether it PARSES is the handle reader's business, and an
    // unparseable sentinel keeps waiting exactly as it does locally — half-written is likelier
    // than broken. Either way the process is no longer the question.
    return { state: { unreachableStreak: 0, vanishedStreak: 0 }, halt: null };
  }

  if (snapshot.group !== "gone") {
    // `live` is plainly "keep waiting". `unknown` is ALSO "keep waiting", and that is the whole
    // point of the third bucket: with no pid file there is no way to look, and no way to look is
    // not evidence of death. It expires as the ordinary UNVERIFIED bound instead.
    return { state: { unreachableStreak: 0, vanishedStreak: 0 }, halt: null };
  }

  const vanishedStreak = state.vanishedStreak + 1;
  const next = { unreachableStreak: 0, vanishedStreak };
  if (vanishedStreak < limits.vanishStrikes) return { state: next, halt: null };
  return {
    state: next,
    halt: {
      kind: "vanished",
      exitCode: VANISHED_EXIT,
      summary: `the remote run is gone and wrote no status`,
      detail: [
        `The process group recorded in ${target.pidFile ?? "(no pid file)"} on ${target.host} has no`,
        `members, and ${target.exitFile} does not exist — checked ${String(vanishedStreak)} times in a row.`,
        "",
        "The run was killed or it crashed. It never recorded a status, so THERE IS NO VERDICT to",
        "report — this is not a failure of the work, it is the absence of any answer about it.",
        `Read ${target.logPath} on the host to see how far it got.`,
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// The WaitIo
// ---------------------------------------------------------------------------

/** The half of {@link WaitIo} the remote arm does not own — injected so tests keep a fake clock. */
export type WaitClock = Pick<WaitIo, "now" | "sleep">;

export interface RemoteWaitIo extends WaitIo {
  /** How many round trips were actually taken. Asserted, so "one probe per poll" cannot rot. */
  probeCount(): number;
  /** The most recent snapshot, for the diagnostics the command prints. `null` before the first. */
  lastSnapshot(): RemoteSnapshot | null;
}

/**
 * A {@link WaitIo} whose two reads are answered from ONE round trip per poll.
 *
 * The cache is invalidated by `sleep`, not by which path is asked first. Keying it on the sleep
 * makes it independent of the order `readDispatchHandle` happens to make its calls in — an ordering
 * this file has no business depending on, and one whose quiet change would turn one probe per poll
 * into three without anything failing.
 */
export function createRemoteWaitIo(
  target: RemoteTarget,
  probe: RemoteProbe,
  clock: WaitClock,
  limits: RemoteWatchLimits = DEFAULT_REMOTE_LIMITS,
): RemoteWaitIo {
  let snapshot: RemoteSnapshot | null = null;
  let state: RemoteWatchState = INITIAL_REMOTE_WATCH;
  let halt: WaitHalt | null = null;
  let probes = 0;

  const current = (): RemoteSnapshot => {
    if (snapshot === null) {
      const taken = probe();
      probes += 1;
      const stepped = stepRemoteWatch(state, taken, target, limits);
      state = stepped.state;
      halt = stepped.halt;
      snapshot = taken;
    }
    return snapshot;
  };

  return {
    exists: (filePath) => {
      const snap = current();
      if (filePath === target.exitFile) return snap.sentinel !== null;
      if (filePath === target.logPath) return snap.logExists;
      return false;
    },
    readText: (filePath) => {
      const snap = current();
      return filePath === target.exitFile ? (snap.sentinel ?? "") : "";
    },
    now: () => clock.now(),
    sleep: async (ms) => {
      snapshot = null;
      await clock.sleep(ms);
    },
    halt: () => halt,
    probeCount: () => probes,
    lastSnapshot: () => snapshot,
  };
}

// ---------------------------------------------------------------------------
// The real ssh
// ---------------------------------------------------------------------------

/** How long one probe may take before it counts as a failed probe rather than a slow one. */
export const DEFAULT_PROBE_TIMEOUT_MS = 20_000;
/** Passed to ssh as `ConnectTimeout`, in seconds — comfortably inside the probe timeout above. */
export const DEFAULT_CONNECT_TIMEOUT_SEC = 10;

export interface SshProbeOptions {
  readonly connectTimeoutSec?: number;
  readonly probeTimeoutMs?: number;
}

/** The ssh argv, split out so a test can read the flags without spawning anything. */
export function sshProbeArgs(target: RemoteTarget, options: SshProbeOptions = {}): string[] {
  const connect = options.connectTimeoutSec ?? DEFAULT_CONNECT_TIMEOUT_SEC;
  return [
    // BatchMode refuses every interactive prompt. Without it a missing key turns an eight-minute
    // wait into an ssh sitting on a password prompt nobody will ever see — a wait that hangs rather
    // than one that reports it could not get there.
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${String(connect)}`,
    target.host,
    "sh -s",
  ];
}

/** One real round trip. Synchronous on purpose: the caller is a blocking wait with nothing else to do. */
export function sshProbe(target: RemoteTarget, options: SshProbeOptions = {}): RemoteSnapshot {
  const result = spawnSync("ssh", sshProbeArgs(target, options), {
    input: remoteProbeScript(target),
    encoding: "utf8",
    timeout: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  let flattened: SshResult = {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
  if (result.error !== undefined) {
    flattened = { ...flattened, spawnError: result.error.message };
  }
  return parseRemoteProbe(flattened);
}
