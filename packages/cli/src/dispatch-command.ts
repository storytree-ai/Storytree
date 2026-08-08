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

import {
  describeReading,
  isVerdict,
  readDispatchHandle,
  type HandleIo,
} from "./dispatch-handle.js";
import type { Envelope } from "./envelope.js";

const realIo: HandleIo = {
  exists: (p) => fs.existsSync(p),
  readText: (p) => fs.readFileSync(p, "utf8"),
};

export function dispatchHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree dispatch <handle>  — read a backgrounded job's verdict ONCE (ADR-0328 D3).",
      "",
      "  <handle>   the log path OR the .exit path that `pnpm gate:bg` printed — either works.",
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
    ].join("\n"),
    next: ["storytree dispatch <handle>"],
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
