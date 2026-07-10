// Rebuild core (ADR-0164 Phase 1 — the desktop app self-restarts to APPLY a landed fix; ADR-0181 —
// the rebuild targets a pinned-`main` runtime worktree, fast-forward-enforced).
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
// ADR-0181 — RAIL 2 ENFORCED BY CONSTRUCTION: when the desktop serves a dedicated runtime worktree,
// the rebuild PREPENDS `git fetch origin` → `git merge --ff-only origin/main` → a frozen install. The
// `--ff-only` refuses anything that is not a fast-forward, so the runtime can ONLY ever advance to
// merged, CI-proven `main` — never sideways onto a branch or WIP (the observed bug). ADR-0164 Rail 2
// stops being aspirational prose and becomes a git-enforced invariant.
//
// FAIL-CLOSED (ADR-0164 Consequences): the steps run in order and STOP on the first non-zero exit,
// returning the failing step + its output. A non-fast-forward `git merge --ff-only` is a non-zero exit,
// so it stops the rebuild before any build runs. The caller relaunches ONLY on `{ ok: true }`, so a
// failed rebuild leaves the app on the OLD working build with the error surfaced — never a
// half-applied state, and never a relaunch onto un-merged code.

import { execFile } from "node:child_process";

/** One rebuild command: a program + its argument vector (no shell interpolation), in a given dir. */
export interface RebuildStep {
  /** Human-readable label surfaced to the operator when this step fails. */
  label: string;
  /** The program to spawn (e.g. `pnpm`, `git`). */
  cmd: string;
  /** The argument vector — a vector so an argument can never inject a flag. */
  args: readonly string[];
  /** The working directory this step runs in — the runtime worktree (ADR-0181). */
  cwd: string;
}

/** How to build the ordered rebuild recipe: the root it runs in, and whether to enforce ff-to-main. */
export interface RebuildPlan {
  /**
   * The root the rebuild runs in — the pinned-`main` runtime worktree (`ffToMain: true`) or, in the
   * dev-convenience fallback, the launch checkout (`ffToMain: false`). ADR-0181.
   */
  root: string;
  /**
   * True → prepend `git fetch origin` + `git merge --ff-only origin/main` + a frozen install, so the
   * rebuild can only apply merged `main` (Rail 2 enforced). False → the dev fallback: build whatever
   * the launch checkout already holds, no git advance (a developer iterating on the shell).
   */
  ffToMain: boolean;
}

/**
 * The ordered rebuild recipe (ADR-0164 / ADR-0181). The build tail is always the compiled studio
 * bundle Vite serves, then the bundled Electron main/preload — both via `--filter` so every step runs
 * from `plan.root` (the runtime worktree). When `plan.ffToMain`, the recipe is led by a fetch +
 * fast-forward-only advance to `origin/main` + a frozen install, so the build compiles pinned merged
 * `main` and nothing else. The relaunch is the caller's job — this list is data, exercised by the unit
 * test.
 */
export function rebuildSteps(plan: RebuildPlan): RebuildStep[] {
  const steps: RebuildStep[] = [];
  if (plan.ffToMain) {
    steps.push(
      { label: "fetch origin", cmd: "git", args: ["fetch", "origin"], cwd: plan.root },
      {
        label: "fast-forward to origin/main",
        cmd: "git",
        args: ["merge", "--ff-only", "origin/main"],
        cwd: plan.root,
      },
      // Frozen install: reconcile node_modules to the (just-advanced) committed lockfile. Idempotent —
      // a no-op when already satisfied — and fail-closed: it errors loudly on lockfile drift rather
      // than building against a stale dependency tree.
      { label: "install dependencies", cmd: "pnpm", args: ["install", "--frozen-lockfile"], cwd: plan.root },
    );
  }
  steps.push(
    { label: "build studio bundle", cmd: "pnpm", args: ["--filter", "studio", "build"], cwd: plan.root },
    {
      label: "build electron main/preload",
      cmd: "pnpm",
      args: ["--filter", "desktop", "run", "build:electron"],
      cwd: plan.root,
    },
  );
  return steps;
}

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
 * Run the rebuild `steps` (from {@link rebuildSteps}) in order through the injected `run`, STOPPING on
 * the first non-zero exit (fail-closed — later steps never run once one fails, so a non-fast-forward
 * `git merge --ff-only` halts the rebuild before any build, and a broken studio build can't be followed
 * by a stale electron rebuild). Returns `{ ok: true }` only when EVERY step exits 0; otherwise the
 * first failing step's label + code + output tail. Never throws: the runner is contractually
 * non-rejecting, so a spawn failure is already a non-zero {@link StepResult}.
 */
export async function runRebuild(
  run: StepRunner,
  steps: readonly RebuildStep[],
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
 * wrapped as `cmd.exe /d /s /c pnpm …` — the same recipe @storytree/drive's `defaultExec` uses. `git`
 * is a real `.exe`, spawned directly. Every step runs in its OWN `step.cwd` (the runtime worktree,
 * ADR-0181), and `windowsHide` keeps the git/pnpm spawns from popping a console the Electron main has
 * no window for. This is the operator-attested glue: not unit-tested (it spawns a real minutes-long
 * build); the CI-proven core is {@link runRebuild} + {@link rebuildSteps} over the injected seam.
 */
export function spawnStepRunner(): StepRunner {
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
        { cwd: step.cwd, maxBuffer: MAX_EXEC_BUFFER, encoding: "utf8" as const, windowsHide: true },
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
