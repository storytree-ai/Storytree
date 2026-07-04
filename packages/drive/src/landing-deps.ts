/**
 * The landing-deps composition (ADR-0152, Unit 2 of the desktop-orchestrator full-autonomy arc):
 * assembles the REAL {@link LandingSurfaceDeps} the desktop orchestrator's landing tool surface
 * consumes — the thin drive-side shell that turns the merge-ceremony mechanisms (`pnpm gate`,
 * `git`, `gh`) into the injected-handler shape `@storytree/agent`'s `buildLandingTools` mounts.
 *
 * Mirrors {@link import("./spawn-deps.js").buildSpawnDeps} exactly:
 *   - INJECTED EXEC SEAM (ADR-0010 §5): every subprocess runs through an injected {@link ExecFn}
 *     `(cmd, args, opts?) => Promise<{code,stdout,stderr}>`, defaulted to a real `child_process`
 *     spawn for production and replaced by a recording stub in tests — so the command sequence
 *     (gate; then git add/commit/push; then a NON-DRAFT `gh pr create`) is proven fully offline,
 *     with no real subprocess and no live spend.
 *   - FAIL CLOSED, NEVER A THROW: the default exec never rejects (a subprocess that won't even
 *     spawn resolves to a non-zero code with the error text in stderr), and both handlers map any
 *     non-zero exit to a readable `{ ok/passed: false, summary }` — never an exception into the
 *     SDK loop. A blank identity (cwd / branch) is a typed `{ ok: false, error }` BEFORE any deps
 *     are built, exactly like the spawn composition's ClaimDoc wall.
 *   - THE SPINE STILL SIGNS (ADR-0091 / ADR-0020 / ADR-0152): `runGate` reports the OBSERVED
 *     pass/fail from a real exit code — it never authors a "healthy"; `openLandingPr` opens a
 *     NON-DRAFT PR (never `gh pr merge`, never `--draft`) so CI re-proves green on the merge with
 *     main and auto-merges (ADR-0022). No landing tool carries a verdict-shaped payload.
 *
 * WHICH GATE: `runGate` shells `pnpm gate` — the SAME canonical gate the terminal
 * session-orchestrator runs at the merge ceremony (typecheck + tests + build + manifest, plus the
 * best-effort DB-up WARNs). One command, one exit code = the honest red/green. It can OOM under
 * local memory pressure ([[gate-oom-on-dev-box]]); the orchestrator reads the surfaced summary and
 * CI is authoritative regardless, so a single exec keeps the seam simple rather than reassembling
 * the gate's sub-steps here.
 *
 * The desktop sidecar (apps/desktop/electron/backend-entry.ts) builds {@link BuildLandingDepsArgs}
 * from its live pieces (the repo cwd, the session branch) and threads the result through
 * orchestrate({ landing }) / startChatStream({ landing }) — Unit 3's operator-attested glue; this
 * module keeps that glue thin (like buildSpawnDeps).
 *
 * NO import from @storytree/cli (ADR-0112 hard invariant: drive reaches agent, never CLI).
 */

import { execFile } from "node:child_process";

import type { LandingSurfaceDeps, LandingPrResult } from "@storytree/agent";

// Re-exported so drive-side consumers (orchestrate.ts, the desktop sidecar) have a named, stable
// type off this module rather than a deep reach into @storytree/agent.
export type { LandingSurfaceDeps } from "@storytree/agent";

// ---------------------------------------------------------------------------
// Exec seam
// ---------------------------------------------------------------------------

/** The captured result of one subprocess run — the exit code plus its stdout/stderr text. */
export interface ExecResult {
  /** The process exit code. Non-zero (or a spawn failure mapped to non-zero) is a failure. */
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * The injected exec seam: run `cmd` with `args` (no shell interpolation — `args` is a vector, so an
 * argument can never inject a flag) and resolve with the captured {@link ExecResult}. NEVER rejects
 * — a process that cannot even spawn resolves to a non-zero `code` with the error in `stderr`
 * (fail-closed). Tests inject a recording double; production defaults to {@link defaultExec}.
 */
export type ExecFn = (
  cmd: string,
  args: readonly string[],
  opts?: { cwd?: string },
) => Promise<ExecResult>;

/** Max characters of combined output surfaced in a summary (the tail — the actionable end). */
const MAX_SUMMARY_CHARS = 4_000;
/** Generous buffer so a full gate log is captured, not truncated by the child pipe. */
const MAX_EXEC_BUFFER = 32 * 1024 * 1024;

/**
 * The default {@link ExecFn}: spawn the real command via `execFile` (no shell), capturing
 * stdout/stderr and resolving with the exit code. NEVER rejects — a non-zero exit or a spawn
 * failure both resolve to a captured {@link ExecResult} so the composition stays fail-closed.
 *
 * Windows note: `pnpm` is a `.cmd` shim `execFile` cannot spawn directly (no shell), so on win32 it
 * is wrapped as `cmd.exe /d /s /c pnpm …` (the {@link import("@storytree/orchestrator")}
 * platformShellCommand pattern). `git` / `gh` are real executables and pass through.
 */
export const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise<ExecResult>((resolve) => {
    let file = cmd;
    let argv: readonly string[] = args;
    if (process.platform === "win32" && cmd === "pnpm") {
      file = process.env["ComSpec"] ?? "cmd.exe";
      argv = ["/d", "/s", "/c", "pnpm", ...args];
    }
    execFile(
      file,
      [...argv],
      {
        ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
        maxBuffer: MAX_EXEC_BUFFER,
        encoding: "utf8" as const,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        // Fail closed: a non-zero exit carries error.code; a spawn failure (ENOENT, etc.) has no
        // numeric code, so fold it to 1 with the message on stderr. Never reject.
        const code = typeof error.code === "number" ? error.code : 1;
        const errText = stderr.length > 0 ? stderr : error.message;
        resolve({ code, stdout, stderr: errText });
      },
    );
  });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What {@link buildLandingDeps} composes the real landing deps from. */
export interface BuildLandingDepsArgs {
  /** The repo checkout the gate + merge ceremony run in (the desktop sidecar's cwd). */
  cwd: string;
  /** The branch `openLandingPr` pushes (`git push -u origin <branch>`) — the session's own branch. */
  branch: string;
  /** Injected exec seam for offline tests (ADR-0010 §5); omit for a live run (the real spawn). */
  exec?: ExecFn;
}

/** Typed result — a composition failure is an error BEFORE any deps are built, never a throw. */
export type BuildLandingDepsResult =
  | { ok: true; deps: LandingSurfaceDeps }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Combine stdout + stderr (stderr carries the failure detail) and return the actionable tail. */
function summarise(result: ExecResult): string {
  const combined = [result.stdout, result.stderr]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n");
  return combined.length > MAX_SUMMARY_CHARS ? combined.slice(-MAX_SUMMARY_CHARS) : combined;
}

/** Extract the opened PR's URL from `gh pr create` stdout (it prints the PR URL). */
function parsePrUrl(stdout: string): string | undefined {
  const match = /https:\/\/github\.com\/\S+\/pull\/\d+/.exec(stdout);
  return match !== null ? match[0] : undefined;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Assemble the real landing deps: `runGate` shells `pnpm gate` (exit 0 → passed), `openLandingPr`
 * shells the merge ceremony (`git add -A` → `git commit` → `git push -u origin <branch>` → a
 * NON-DRAFT `gh pr create`), all behind the injected exec seam and fail-closed on any non-zero
 * exit. Never throws: a blank identity is a typed `{ ok: false, error }`.
 */
export function buildLandingDeps(args: BuildLandingDepsArgs): BuildLandingDepsResult {
  // Fail-closed identity: a blank cwd would run the ceremony in an undefined directory; a blank
  // branch would push nowhere. Refuse before building any deps, never default (the spawn
  // composition's identity-wall discipline).
  if (args.cwd.trim() === "") {
    return {
      ok: false,
      error: "landing deps refused: blank cwd — the merge ceremony directory is fail-closed, never defaulted.",
    };
  }
  if (args.branch.trim() === "") {
    return {
      ok: false,
      error: "landing deps refused: blank branch — the push target is fail-closed, never defaulted.",
    };
  }

  const exec = args.exec ?? defaultExec;
  const { cwd, branch } = args;

  const deps: LandingSurfaceDeps = {
    runGate: async () => {
      const result = await exec("pnpm", ["gate"], { cwd });
      return { passed: result.code === 0, summary: summarise(result) };
    },

    openLandingPr: async ({ commitMessage, prTitle, prBody }): Promise<LandingPrResult> => {
      // The merge ceremony, step by step — each step must exit 0 to proceed. A non-zero exit is a
      // fail-closed `{ ok: false }` naming the failing step; never a throw (exec never rejects).
      const steps: Array<{ label: string; cmd: string; args: string[] }> = [
        { label: "git add", cmd: "git", args: ["add", "-A"] },
        { label: "git commit", cmd: "git", args: ["commit", "-m", commitMessage] },
        { label: "git push", cmd: "git", args: ["push", "-u", "origin", branch] },
        // NON-DRAFT (never `--draft`): CI re-proves and auto-merges (ADR-0022). Never `gh pr merge`.
        {
          label: "gh pr create",
          cmd: "gh",
          args: ["pr", "create", "--title", prTitle, "--body", prBody],
        },
      ];

      let lastStdout = "";
      for (const step of steps) {
        const result = await exec(step.cmd, step.args, { cwd });
        if (result.code !== 0) {
          return { ok: false, summary: `${step.label} failed:\n${summarise(result)}` };
        }
        lastStdout = result.stdout;
      }

      // The final step's stdout is the `gh pr create` output carrying the PR URL.
      const prUrl = parsePrUrl(lastStdout);
      return {
        ok: true,
        summary: `landing PR opened for ${branch} (non-draft — CI re-proves and auto-merges, ADR-0022)`,
        ...(prUrl !== undefined ? { prUrl } : {}),
      };
    },
  };

  return { ok: true, deps };
}
