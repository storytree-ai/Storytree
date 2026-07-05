// Rebuild core (ADR-0164 Phase 1 — the desktop app self-restarts to APPLY a landed fix).
//
// WHY THIS EXISTS: a fix the desktop orchestrator lands (ADR-0152) does NOT take effect until someone
// rebuilds (`pnpm --filter studio build` + `build:electron`) and relaunches the app — the
// studio-version-skew trap. ADR-0164 turns the existing git-HEAD-drift DETECTION into an ACTION,
// executed by the Electron MAIN process (Rail 1 — never the sidecar, which cannot restart the process
// it runs in). This module is the CI-provable core of that action: the ordered rebuild steps + a
// fail-closed runner over an INJECTED step-runner seam, so a node:test drives every branch without a
// real `pnpm` spawn. The Electron glue that consumes it (main.ts's IPC handler + `app.relaunch()`) is
// operator-attested (ADR-0070) — the owner witnesses the app relaunch onto the new build.
//
// FAIL-CLOSED (ADR-0164 Consequences): the steps run in order and STOP on the first non-zero exit,
// returning the failing step + its output. The caller relaunches ONLY on `{ ok: true }`, so a failed
// rebuild leaves the app on the OLD working build with the error surfaced — never a half-applied state.

import { execFile } from "node:child_process";

/** One rebuild command: a program + its argument vector (no shell interpolation). */
export interface RebuildStep {
  /** Human-readable label surfaced to the operator when this step fails. */
  label: string;
  /** The program to spawn (e.g. `pnpm`). */
  cmd: string;
  /** The argument vector — a vector so an argument can never inject a flag. */
  args: readonly string[];
}

/**
 * The ordered rebuild recipe ADR-0164 names: rebuild the compiled studio bundle Vite serves, then the
 * bundled Electron main/preload. Both run from the desktop package dir (`apps/desktop`): `--filter
 * studio` resolves the workspace target from any subdir, and `run build:electron` is this package's own
 * script. The relaunch is the caller's job — this list is data, exercised directly by the unit test.
 */
export const REBUILD_STEPS: readonly RebuildStep[] = [
  { label: "build studio bundle", cmd: "pnpm", args: ["--filter", "studio", "build"] },
  { label: "build electron main/preload", cmd: "pnpm", args: ["run", "build:electron"] },
];

/** The captured result of running one step — its exit code plus combined output tail. */
export interface StepResult {
  /** The exit code. Non-zero (or a spawn failure folded to non-zero) is a failure. */
  code: number;
  /** The step's combined stdout+stderr tail — surfaced to the operator on failure. */
  output: string;
}

/**
 * The injected step-runner seam: run one {@link RebuildStep} and resolve with its {@link StepResult}.
 * NEVER rejects — a process that cannot even spawn resolves to a non-zero `code` with the error in
 * `output` (fail-closed). The test injects a recording double; production uses {@link spawnStepRunner}.
 */
export type StepRunner = (step: RebuildStep) => Promise<StepResult>;

/** The outcome of a full rebuild: every step passed, or the FIRST step that failed (later steps skipped). */
export type RebuildResult =
  | { ok: true }
  | { ok: false; step: string; code: number; output: string };

/** Max characters of a failing step's output surfaced to the operator (the actionable tail). */
const MAX_OUTPUT_CHARS = 4_000;

/** Keep the last `max` characters — a build failure's cause is at the end of the log. */
export function tailOutput(text: string, max = MAX_OUTPUT_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}

/**
 * Run the {@link REBUILD_STEPS} in order through the injected `run`, STOPPING on the first non-zero
 * exit (fail-closed — later steps never run once one fails, so a broken studio build can't be followed
 * by a stale electron rebuild). Returns `{ ok: true }` only when EVERY step exits 0; otherwise the
 * first failing step's label + code + output tail. Never throws: the runner is contractually
 * non-rejecting, so a spawn failure is already a non-zero {@link StepResult}.
 */
export async function runRebuild(
  run: StepRunner,
  steps: readonly RebuildStep[] = REBUILD_STEPS,
): Promise<RebuildResult> {
  for (const step of steps) {
    const { code, output } = await run(step);
    if (code !== 0) {
      return { ok: false, step: step.label, code, output: tailOutput(output) };
    }
  }
  return { ok: true };
}

/** Generous buffer so a full build log is captured, not truncated by the child pipe. */
const MAX_EXEC_BUFFER = 32 * 1024 * 1024;

/**
 * The production {@link StepRunner}: spawn the real command via `execFile` (no shell), capturing
 * stdout+stderr and resolving with the exit code. NEVER rejects — a non-zero exit or a spawn failure
 * both resolve to a captured {@link StepResult} (fail-closed).
 *
 * Windows note: `pnpm` is a `.cmd` shim `execFile` cannot spawn directly (no shell), so on win32 it is
 * wrapped as `cmd.exe /d /s /c pnpm …` — the same recipe @storytree/drive's `defaultExec` uses. This is
 * the operator-attested glue: not unit-tested (it spawns a real minutes-long build); the CI-proven core
 * is {@link runRebuild} over the injected seam.
 */
export function spawnStepRunner(cwd: string): StepRunner {
  return (step) =>
    new Promise<StepResult>((resolve) => {
      let file = step.cmd;
      let argv: readonly string[] = step.args;
      if (process.platform === "win32" && step.cmd === "pnpm") {
        file = process.env["ComSpec"] ?? "cmd.exe";
        argv = ["/d", "/s", "/c", "pnpm", ...step.args];
      }
      execFile(
        file,
        [...argv],
        { cwd, maxBuffer: MAX_EXEC_BUFFER, encoding: "utf8" as const },
        (error, stdout, stderr) => {
          const combined = `${stdout}\n${stderr}`;
          if (error === null) {
            resolve({ code: 0, output: combined });
            return;
          }
          // Fail closed: a non-zero exit carries error.code; a spawn failure (ENOENT) has no numeric
          // code, so fold it to 1 with the message appended. Never reject.
          const code = typeof error.code === "number" ? error.code : 1;
          resolve({ code, output: `${combined}\n${error.message}` });
        },
      );
    });
}
