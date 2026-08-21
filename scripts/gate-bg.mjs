// `pnpm gate:bg` entry point — DETACH the run, print its dispatch handle, and return at once.
//
// TWO THINGS THIS FILE DOES, AND THE SECOND IS NEW.
//
// (1) It resolves the bash that can actually run this checkout's scripts. `"gate:bg": "bash
//     scripts/gate-bg.sh"` named a shell it did not pin: on Windows with WSL installed, bare `bash`
//     is the WSL launcher, so the wrapper ran `pnpm gate` inside the Ubuntu distro. It did not fail;
//     it succeeded at the wrong thing. The measurement is in scripts/resolve-bash.mjs.
//
// (2) It DETACHES the run (`the-gate-costs-what-the-change-risks-arc` inc 6, item 1). It used to
//     `spawnSync` with inherited stdio, so `gate:bg` did not background anything by itself — it
//     relied on the CALLER backgrounding it. That works right up until the caller pipes it, which is
//     the natural thing to do: `pnpm gate:bg 2>&1 | tail -12` is how you read the banner it prints.
//     Measured 2026-08-20 — the pipe held the pipeline in the FOREGROUND for the full 600s tool
//     ceiling and survived only because the harness kept the pipe open; a sibling filing records the
//     same shape SIGTERMing the whole run. The trap was documented in agent memory AND in a friction
//     item, and was still hit on the session's first gate launch of the day, which is the evidence
//     that documentation was not the remedy.
//
//     FIXED AT THE WRITE, NOT DETECTED AT THE OUTCOME (ADR-0352). There is deliberately NO pipe
//     detection, no warning and nothing to override — the honest case (wanting to see the banner) is
//     the one a guard would trip. The child is spawned detached with its stdio bound to the log file
//     rather than inherited, and this launcher exits immediately whatever its own stdout is attached
//     to. Piping it is now simply fine.
//
// WHAT THIS LAUNCHER'S EXIT CODE MEANS NOW — READ THIS BEFORE TRUSTING IT. It reports THE LAUNCH,
// not the gate: 0 = dispatched, 1 = failed to dispatch. It cannot report the gate's verdict, because
// it returns before the gate has one. That verdict lives where it always did — in `<log>.exit`,
// written by scripts/gate-bg.sh from `${PIPESTATUS[0]}` — and is read with:
//
//   storytree dispatch <handle>          # once, honest about "not yet"
//   storytree dispatch <handle> --wait   # block until it settles, exit with THE GATE's own status
//
// The false-green this replaces cannot recur: a launcher that returns in under a second, printing
// "dispatched", is not something a reader mistakes for a ten-minute gate's verdict. The old shape —
// a command that ran for ten minutes and then reported a status — was.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoBash } from "./resolve-bash.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "gate-bg.sh");
// The gate must run in the REPO ROOT, not wherever the launcher was invoked from — `pnpm gate` is
// a root script. Derived from this file's own location so it holds however the script is reached.
const repoRoot = path.join(here, "..");

const cmd = process.argv.slice(2);
const describedCmd = cmd.length > 0 ? cmd.join(" ") : "pnpm gate";

/**
 * The log path, chosen HERE rather than inside the shell script.
 *
 * It has to be: the handle is printed before the child has produced anything, so the launcher must
 * know the path in advance. `GATE_BG_LOG` still wins — that is the pre-chosen path ADR-0328 D3's
 * handback contract depends on. The derivation otherwise matches the script's own (this worktree's
 * `.gate-logs/`, timestamp + pid), and is anchored to this file's location rather than the cwd
 * because an unprovisioned worktree husk resolves `git rev-parse` UP to the primary checkout, which
 * is how logs crossed worktrees in the first place.
 */
function chooseLogPath() {
  const override = process.env["GATE_BG_LOG"];
  if (override !== undefined && override !== "") return override;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return path.join(repoRoot, ".gate-logs", `gate-${stamp}-${String(process.pid)}.log`);
}

let bash;
try {
  bash = resolveRepoBash();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const log = chooseLogPath();
try {
  mkdirSync(path.dirname(log), { recursive: true });
} catch (err) {
  console.error(`gate:bg: cannot create the log directory for ${log}: ${String(err)}`);
  process.exit(1);
}

// `stdio: "ignore"` is what makes the detach independent of the parent's stdout: the child holds no
// handle the parent owns, so a pipe on the parent cannot keep it (or kill it). Nothing is lost —
// gate-bg.sh tees every byte into the log itself, which is the transcript a reader wants anyway.
const child = spawn(bash, [script, ...cmd], {
  cwd: repoRoot,
  detached: true,
  stdio: "ignore",
  env: { ...process.env, GATE_BG_LOG: log },
});

// A launch failure has to be caught SYNCHRONOUSLY. Once `unref()` runs there is nothing keeping the
// event loop alive, so node exits before an async `error` event could fire — a handler alone would
// let a failed dispatch exit 0 while printing a handle to a log nothing will ever write. `pid` is
// undefined exactly when no process was created, which is the check that cannot be outrun.
if (child.pid === undefined) {
  console.error(`gate:bg: failed to start ${bash} — nothing was dispatched.`);
  process.exit(1);
}

child.on("error", (err) => {
  console.error(`gate:bg: failed to start ${bash}: ${err.message}`);
  process.exit(1);
});

child.unref();

process.stdout.write(
  [
    `gate:bg dispatched:  ${describedCmd}`,
    `gate:bg pid:         ${String(child.pid ?? "unknown")}`,
    `gate:bg log:         ${log}`,
    `gate:bg exit-file:   ${log}.exit`,
    "",
    "This is a DISPATCH, not a verdict — the gate is still running and this command's exit code",
    "reports only that it started. Read the result with:",
    `  storytree dispatch ${log} --wait     (blocks, exits with the GATE's own status)`,
    `  storytree dispatch ${log}            (reads once, says RUNNING if it is not done)`,
    "",
  ].join("\n"),
);
