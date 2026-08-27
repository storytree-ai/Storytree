// `storytree dispatch <handle>` — the caller's half of the ADR-0328 D3 handback.
//
// The DISPATCH half already exists and is deliberately not rebuilt: `pnpm gate:bg <command…>` runs
// an arbitrary command in the background, tees to a log (pre-choosable via `GATE_BG_LOG`) and writes
// `<log>.exit` with the command's real status. It PRINTS both paths — that printed pair IS the
// handle an agent hands back when the work will outlive what it can honestly wait for.
//
// This is the read: once, no loop, and honest about not-yet. The decision lives in the pure
// `dispatch-handle.ts`; this file only supplies the filesystem and formats the envelope.

import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import {
  describeReading,
  isVerdict,
  readDispatchHandle,
  type HandleIo,
} from "./dispatch-handle.js";
import {
  DEFAULT_TIMEOUT_MS,
  UNVERIFIED_EXIT,
  describeWait,
  parseTimeoutSeconds,
  waitExitCode,
  waitForDispatchHandle,
  type WaitIo,
} from "./dispatch-wait.js";
import {
  UNREACHABLE_EXIT,
  VANISHED_EXIT,
  createRemoteWaitIo,
  remoteTarget,
  sshProbe,
  type RemoteWaitIo,
} from "./dispatch-remote.js";
import type { Envelope } from "./envelope.js";

const realIo: HandleIo = {
  exists: (p) => fs.existsSync(p),
  readText: (p) => fs.readFileSync(p, "utf8"),
};

const realWaitIo: WaitIo = {
  ...realIo,
  now: () => Date.now(),
  sleep: (ms) => delay(ms),
};

export function dispatchHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree dispatch <handle>  — read a backgrounded job's verdict ONCE (ADR-0328 D3).",
      "",
      "  <handle>   the log path OR the .exit path that `pnpm gate:bg` printed — either works.",
      "",
      "  --wait               block until the job settles, then exit with THE JOB'S own status",
      `  --timeout <seconds>  bound the wait (default ${String(DEFAULT_TIMEOUT_MS / 1000)}s, ceiling 540s)`,
      "  --host <target>      wait on a run on ANOTHER HOST over ssh (an ssh alias, or user@host)",
      "  --pid-file <path>    the REMOTE file holding that run's process-GROUP id (from `setsid`)",
      "",
      "Dispatch a job (any command, not just the gate) with:",
      "  GATE_BG_LOG=<path> pnpm gate:bg <command…>",
      "…then hand the printed handle back to whoever can read it later. It stays valid after the",
      "dispatching agent is gone, which is the point: a job that outlives your turn is HANDED BACK,",
      "never stalled on and never guessed at.",
      "",
      "Answers, and only these:",
      "  PASS        the command exited 0",
      "  FAIL        the command exited non-zero (the real code is reported)",
      "  RUNNING     dispatched, not finished — UNVERIFIED, never a pass",
      "  UNVERIFIED  nothing dispatched here, or the sentinel carries no status",
      "",
      "RUNNING and UNVERIFIED are not verdicts. A dispatched check nobody read is unverified",
      "rather than passed (`asset:unrun-check-is-unverified-not-refuted`).",
      "",
      "--wait is for the OTHER half of the same problem: a session that must not proceed until the",
      "verdict lands, and would otherwise hand-roll `until ls *.exit; do sleep 45; done` — or, worse,",
      "grep the log for GATE GREEN / GATE RED, which appear inside TEST NAMES and so read a verdict",
      "the gate never gave. It exits with the job's own code (the gate's 3=SKIP and 4=PARTIAL survive),",
      `and with ${String(UNVERIFIED_EXIT)} — a code the gate never returns — if the bound expires first.`,
      "",
      "--host arms the same wait on a run on ANOTHER machine, so a session that dispatched work",
      "there is NOTIFIED when it lands instead of polling for it. One ssh round trip per poll reads",
      "the remote sentinel, the remote log and the remote process GROUP:",
      "",
      "  storytree dispatch /tmp/<slot>.jsonl --wait --host mint --pid-file /tmp/<slot>.pid",
      "",
      "Each way it can fail to know carries its OWN status, and none of them reads as finished:",
      `  ${String(UNREACHABLE_EXIT)}  the host could not be reached — NOTHING about the run was observed`,
      `  ${String(VANISHED_EXIT)}  the remote process group is gone and wrote no sentinel — killed or crashed`,
      `  ${String(UNVERIFIED_EXIT)}  this watcher's own bound expired — the run may well still be going`,
      "",
      "Without --pid-file the process group cannot be probed, so a dead remote run cannot be told",
      `from a slow one and the wait expires as ${String(UNVERIFIED_EXIT)} instead. That is deliberate: no way to look`,
      "is not evidence of death.",
      "",
      "⚠ ON WINDOWS, CALL IT FROM POWERSHELL, NOT GIT BASH. MSYS rewrites a POSIX-looking argument",
      "into a Windows path before it ever reaches this command, so `/tmp/run.log` arrives as",
      "`C:/Users/…/Temp/run.log` and every probe of the real host looks for a file that is not there.",
      "The wait then honestly reports UNVERIFIED rather than guessing — but it waits out its whole",
      "bound first. The printed `log:` line shows the path actually used; read it if a wait surprises",
      "you. (`MSYS_NO_PATHCONV=1` also works.)",
    ].join("\n"),
    next: [
      "storytree dispatch <handle>",
      "storytree dispatch <handle> --wait",
      "storytree dispatch <handle> --wait --host <host> --pid-file <remote-pid-file>",
    ],
  };
}

/**
 * `storytree dispatch <handle> --wait` — block on the sentinel, then report THE JOB's verdict.
 *
 * The decision, the bound and the exit mapping are all in the pure `dispatch-wait.ts`; this shell
 * supplies the real clock, the real sleep and the real filesystem, and formats the envelope. The
 * envelope carries `exitCode` because the status being reported is the JOB's and not this command's.
 */
export interface DispatchWaitOptions {
  /** `--host` — arm the wait against another machine over ssh instead of this filesystem. */
  readonly host?: string;
  /** `--pid-file` — the REMOTE path holding the dispatched run's process-GROUP id. */
  readonly pidFile?: string;
}

export async function dispatchWaitCommand(
  args: readonly string[],
  timeoutRaw: string | undefined,
  options: DispatchWaitOptions = {},
): Promise<Envelope> {
  const handle = args[0];
  if (handle === undefined || handle === "") {
    return {
      ok: false,
      body: "storytree dispatch --wait needs a handle — the log path or .exit path `pnpm gate:bg` printed.",
      next: ["storytree dispatch --help"],
    };
  }

  const bound = parseTimeoutSeconds(timeoutRaw);
  if ("error" in bound) {
    // Refused, never clamped: a silently-shortened bound is the harness behaviour ADR-0328
    // measured and is exactly what leaves a waiter believing it held a wait it did not hold.
    return { ok: false, body: bound.error, next: ["storytree dispatch --help"] };
  }

  // The REMOTE arm is the same wait with a different observer — the loop, the bound and the exit
  // mapping are untouched, which is what keeps one failure vocabulary rather than two.
  const target =
    options.host === undefined
      ? null
      : remoteTarget(options.host, handle, options.pidFile);
  const remoteIo: RemoteWaitIo | null =
    target === null
      ? null
      : createRemoteWaitIo(target, () => sshProbe(target), {
          now: realWaitIo.now,
          sleep: realWaitIo.sleep,
        });

  const outcome = await waitForDispatchHandle(handle, remoteIo ?? realWaitIo, {
    timeoutMs: bound.ms,
  });
  const { reading, halt } = outcome;
  const exitCode = waitExitCode(outcome);
  const settled = halt === undefined && isVerdict(reading) && !outcome.timedOut;
  const where = target === null ? "" : `${target.host}:`;
  const lines = [
    halt === undefined ? describeReading(reading) : `UNVERIFIED — ${halt.summary}.`,
    `  waited    : ${describeWait(outcome)}`,
    "",
    ...(target === null ? [] : [`  host      : ${target.host}`]),
    `  log       : ${where}${reading.logPath}`,
    `  exit-file : ${where}${reading.exitFile}`,
    ...(target?.pidFile === undefined ? [] : [`  pid-file  : ${where}${target.pidFile}`]),
    `  exit code : ${String(exitCode)} — ${settled ? "the JOB's own status" : "UNVERIFIED, not a verdict"}`,
  ];

  if (remoteIo !== null) {
    const snapshot = remoteIo.lastSnapshot();
    // The log's mtime is REPORTED and never decided on: an mtime that has not moved does not prove
    // the run is dead, exactly as the gate's own `NO CPU PROGRESS` line proves nothing on its own.
    const mtime = snapshot?.logMtimeEpoch;
    lines.push(
      `  probes    : ${String(remoteIo.probeCount())} ssh round trips`,
      `  remote    : group=${snapshot?.group ?? "unknown"} · log last written ${
        mtime === undefined || mtime === null ? "(unknown)" : new Date(mtime * 1000).toISOString()
      }`,
    );
  }

  if (halt !== undefined) {
    lines.push("", ...halt.detail);
  } else if (outcome.timedOut) {
    lines.push(
      "",
      "The BOUND expired; the job did not. It is still running and nothing about it has been",
      "decided. Wait again, or hand the handle on — but do not report this as a pass or a fail.",
    );
  }

  const rearm =
    target === null
      ? `storytree dispatch ${reading.logPath} --wait`
      : `storytree dispatch ${reading.logPath} --wait --host ${target.host}` +
        (target.pidFile === undefined ? "" : ` --pid-file ${target.pidFile}`);

  return {
    ok: exitCode === 0,
    body: lines.join("\n"),
    exitCode,
    next:
      outcome.timedOut || halt !== undefined
        ? [rearm]
        : [target === null ? `cat ${reading.logPath}` : `ssh ${target.host} cat ${reading.logPath}`],
  };
}

export function dispatchCommand(args: readonly string[]): Envelope {
  const handle = args[0];
  if (handle === undefined || handle === "") {
    return {
      ok: false,
      body: "storytree dispatch needs a handle — the log path or .exit path `pnpm gate:bg` printed.",
      next: ["storytree dispatch --help"],
    };
  }

  const reading = readDispatchHandle(handle, realIo);
  const lines = [
    describeReading(reading),
    "",
    `  log       : ${reading.logPath}`,
    `  exit-file : ${reading.exitFile}`,
  ];

  if (!isVerdict(reading)) {
    // Say it in as many words. The caller's next move differs entirely from a FAIL, and the whole
    // failure this command exists to prevent is these two being confused.
    lines.push(
      "",
      "This is NOT a verdict. Do not report it as a pass or a fail — read the handle again later,",
      "or say plainly that the check was dispatched and is still unread.",
    );
  }

  return {
    ok: reading.state === "passed" || reading.state === "running",
    body: lines.join("\n"),
    next:
      reading.state === "running"
        ? [`storytree dispatch ${reading.logPath}`]
        : [`cat ${reading.logPath}`],
  };
}
