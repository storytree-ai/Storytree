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
    ].join("\n"),
    next: ["storytree dispatch <handle>", "storytree dispatch <handle> --wait"],
  };
}

/**
 * `storytree dispatch <handle> --wait` — block on the sentinel, then report THE JOB's verdict.
 *
 * The decision, the bound and the exit mapping are all in the pure `dispatch-wait.ts`; this shell
 * supplies the real clock, the real sleep and the real filesystem, and formats the envelope. The
 * envelope carries `exitCode` because the status being reported is the JOB's and not this command's.
 */
export async function dispatchWaitCommand(
  args: readonly string[],
  timeoutRaw: string | undefined,
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

  const outcome = await waitForDispatchHandle(handle, realWaitIo, { timeoutMs: bound.ms });
  const { reading } = outcome;
  const exitCode = waitExitCode(outcome);
  const lines = [
    describeReading(reading),
    `  waited    : ${describeWait(outcome)}`,
    "",
    `  log       : ${reading.logPath}`,
    `  exit-file : ${reading.exitFile}`,
    `  exit code : ${String(exitCode)} — ${isVerdict(reading) && !outcome.timedOut ? "the JOB's own status" : "UNVERIFIED, not a verdict"}`,
  ];

  if (outcome.timedOut) {
    lines.push(
      "",
      "The BOUND expired; the job did not. It is still running and nothing about it has been",
      "decided. Wait again, or hand the handle on — but do not report this as a pass or a fail.",
    );
  }

  return {
    ok: exitCode === 0,
    body: lines.join("\n"),
    exitCode,
    next: outcome.timedOut
      ? [`storytree dispatch ${reading.logPath} --wait`]
      : [`cat ${reading.logPath}`],
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
