/**
 * The inspect-deps composition (ADR-0173 — the read-only CI/git inspection surface):
 * assembles the REAL {@link InspectSurfaceDeps} the desktop orchestrator's inspect tool surface
 * consumes — the thin drive-side shell that turns `gh`/`git` READS into the injected-handler shape
 * `@storytree/agent`'s `buildInspectTools` mounts.
 *
 * Mirrors {@link import("./landing-deps.js").buildLandingDeps} exactly, but READ-ONLY:
 *   - INJECTED, TIME-BOXED EXEC SEAM (ADR-0010 §5 + ADR-0173 invariant "time-box the shell"): every
 *     subprocess runs through an injected {@link import("./landing-deps.js").ExecFn} — the SAME
 *     `(cmd, args, opts?) => Promise<{code,stdout,stderr}>` seam the landing composition proves
 *     offline — defaulted to {@link defaultInspectExec} (a `child_process` spawn with a hard timeout
 *     so a slow/rate-limited `gh` can't hang the turn) and replaced by a recording stub in tests.
 *   - FAIL CLOSED, NEVER A THROW: the default exec never rejects; a non-zero exit (or a timeout, or a
 *     spawn failure) resolves to a readable `{ ok: false, summary }` — never an exception into the
 *     SDK loop.
 *   - OBSERVATION ONLY / READ-ONLY MEANS READ-ONLY (ADR-0173 invariant 1 & 4): the surface never
 *     merges, pushes, syncs, or bumps a pin. `git_inspect` allowlists only the read verbs
 *     (status / log / ls-tree / rev-parse / show) and REFUSES any other verb BEFORE any shelling; the
 *     id-taking tools (`view_ci_run`, `view_pr_checks`) refuse a flag-like id so a `gh` argument can
 *     never be smuggled into a mutating subcommand. Each tool shells a FIXED command shape
 *     (`gh run view …` / `gh pr checks …` / `git <read-verb> …`) — never a passthrough of an arbitrary
 *     subcommand — so `gh pr merge` / `git commit` are structurally unreachable.
 *
 * NO import from @storytree/cli (ADR-0112 hard invariant: drive reaches agent, never CLI). The exec
 * seam type is reused from ./landing-deps (a sibling drive module), not re-declared.
 */

import { execFile } from "node:child_process";

import type { InspectSurfaceDeps, InspectResult } from "@storytree/agent";

import type { ExecFn, ExecResult } from "./landing-deps.js";

// Re-exported so drive-side consumers (orchestrate.ts, the desktop sidecar) have a named, stable
// type off this module rather than a deep reach into @storytree/agent.
export type { InspectSurfaceDeps } from "@storytree/agent";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max characters of combined output surfaced in a summary (the tail — the actionable end). */
const MAX_SUMMARY_CHARS = 8_000;
/** Generous buffer so a full failing-job log is captured, not truncated by the child pipe. */
const MAX_EXEC_BUFFER = 32 * 1024 * 1024;
/**
 * Hard wall-clock ceiling per read (ADR-0173: "time-box the shell so a slow `gh` can't hang the
 * turn"). On expiry the child is killed and the read resolves fail-closed to a readable timeout
 * summary — the turn cap (ADR-0130/0131) remains the outer runaway brake.
 */
const INSPECT_TIMEOUT_MS = 60_000;

/**
 * The read-only git verbs `git_inspect` permits (ADR-0173 decision). Any verb outside this set —
 * commit, push, merge, checkout, reset, rebase, add, rm, fetch, pull, tag, clean, … — is REFUSED
 * before any shelling: the surface never mutates the tree. These five never mutate regardless of
 * their arguments, so the verb allowlist IS the read-only fence.
 */
const READ_ONLY_GIT_VERBS = new Set(["status", "log", "ls-tree", "rev-parse", "show"]);

// ---------------------------------------------------------------------------
// Default exec (time-boxed; win32-aware for completeness — we shell gh/git only)
// ---------------------------------------------------------------------------

/**
 * The default {@link ExecFn} for the inspect surface: spawn the real command via `execFile` (no
 * shell — `args` is a vector, so an argument can never inject a flag into another command), capturing
 * stdout/stderr and resolving with the exit code. NEVER rejects — a non-zero exit, a TIMEOUT (child
 * killed after {@link INSPECT_TIMEOUT_MS}), or a spawn failure all resolve to a captured
 * {@link ExecResult} so the composition stays fail-closed.
 *
 * We shell only `gh` and `git` (real executables), so no `.cmd` shim wrapping is needed on win32 —
 * unlike landing's `pnpm` case. The `opts.cwd` is honoured so the reads run in the repo checkout.
 */
export const defaultInspectExec: ExecFn = (cmd, args, opts) =>
  new Promise<ExecResult>((resolve) => {
    execFile(
      cmd,
      [...args],
      {
        ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
        maxBuffer: MAX_EXEC_BUFFER,
        timeout: INSPECT_TIMEOUT_MS,
        killSignal: "SIGTERM",
        encoding: "utf8" as const,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        // Fail closed: a non-zero exit carries error.code; a spawn failure (ENOENT) or a timeout
        // (error.killed === true, no numeric code) folds to 1 with the message on stderr. Never reject.
        const code = typeof error.code === "number" ? error.code : 1;
        const killed = (error as { killed?: boolean }).killed === true;
        const base = stderr.length > 0 ? stderr : error.message;
        const errText = killed ? `timed out after ${INSPECT_TIMEOUT_MS}ms\n${base}` : base;
        resolve({ code, stdout, stderr: errText });
      },
    );
  });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What {@link buildInspectDeps} composes the real inspect deps from. */
export interface BuildInspectDepsArgs {
  /** The repo checkout the reads run in (the desktop sidecar's cwd). */
  cwd: string;
  /** Injected exec seam for offline tests (ADR-0010 §5); omit for a live run (the real spawn). */
  exec?: ExecFn;
}

/** Typed result — a composition failure is an error BEFORE any deps are built, never a throw. */
export type BuildInspectDepsResult =
  | { ok: true; deps: InspectSurfaceDeps }
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

/**
 * Reject a flag-like or otherwise-unsafe id (a run id / PR ref). A CI run id is numeric and a PR ref
 * is a number or a github URL — neither contains leading `-`, whitespace, or is empty. Refusing these
 * BEFORE shelling means a mutating token (`--foo`, `; gh pr merge`) can never ride in as an id (the
 * command shape is fixed, but this is the belt to the fixed-shape suspenders). Returns the refusal
 * reason, or `undefined` when the id is safe.
 */
function refuseFlaglikeId(kind: string, value: string): string | undefined {
  const v = value.trim();
  if (v === "") return `refused: blank ${kind} — nothing to inspect (read-only surface, fail-closed).`;
  if (v.startsWith("-")) {
    return `refused: ${kind} '${value}' looks like a flag — a mutating argument may not ride in as an id (ADR-0173).`;
  }
  if (/\s/.test(v)) {
    return `refused: ${kind} '${value}' contains whitespace — expected a single id/URL token (ADR-0173).`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Assemble the real inspect deps: `viewCiRun` shells `gh run view <runId> [--log-failed]`,
 * `viewPrChecks` shells `gh pr checks <pr>` + `gh pr view <pr> --json …`, and `gitInspect` shells
 * `git <read-verb> [...args]` — all behind the injected, time-boxed exec seam and fail-closed on any
 * non-zero exit. READ-ONLY: `gitInspect` refuses a non-allowlisted verb before any shelling, and the
 * id-taking tools refuse a flag-like id — so no mutating `gh`/`git` command is reachable. Never
 * throws: a blank cwd is a typed `{ ok: false, error }`.
 */
export function buildInspectDeps(args: BuildInspectDepsArgs): BuildInspectDepsResult {
  // Fail-closed identity: a blank cwd would run the reads in an undefined directory. Refuse before
  // building any deps, never default (the landing composition's identity-wall discipline).
  if (args.cwd.trim() === "") {
    return {
      ok: false,
      error: "inspect deps refused: blank cwd — the inspection directory is fail-closed, never defaulted.",
    };
  }

  const exec = args.exec ?? defaultInspectExec;
  const { cwd } = args;

  const deps: InspectSurfaceDeps = {
    viewCiRun: async ({ runId, logFailed }): Promise<InspectResult> => {
      const refusal = refuseFlaglikeId("runId", runId);
      if (refusal !== undefined) return { ok: false, summary: refusal };

      // FIXED command shape — always `gh run view <runId> [--log-failed]`. `runId` is a single
      // vector element, so it can never inject a different subcommand (`gh pr merge` is unreachable).
      const argv = ["run", "view", runId.trim(), ...(logFailed === true ? ["--log-failed"] : [])];
      const result = await exec("gh", argv, { cwd });
      if (result.code !== 0) {
        return { ok: false, summary: `gh run view failed:\n${summarise(result)}` };
      }
      return { ok: true, summary: summarise(result) };
    },

    viewPrChecks: async ({ pr }): Promise<InspectResult> => {
      const refusal = refuseFlaglikeId("pr", pr);
      if (refusal !== undefined) return { ok: false, summary: refusal };

      const ref = pr.trim();
      // `gh pr checks` prints the per-check name + conclusion + the run link; `gh pr view --json`
      // adds the PR state and the rollup. Both are READS. `gh pr checks` exits non-zero when a check
      // FAILED (that is data, not an error), so we surface its output regardless of exit code and
      // lean on `gh pr view` for the hard-error signal.
      const checks = await exec("gh", ["pr", "checks", ref], { cwd });
      const view = await exec(
        "gh",
        ["pr", "view", ref, "--json", "number,state,statusCheckRollup,url"],
        { cwd },
      );
      if (view.code !== 0 && checks.code !== 0) {
        // Both reads failed (bad ref, auth, network) — a readable fail-closed observation.
        return { ok: false, summary: `gh pr view/checks failed:\n${summarise(view)}\n${summarise(checks)}` };
      }
      const parts = [
        checks.stdout.trim().length > 0 ? `checks:\n${checks.stdout.trim()}` : "",
        view.stdout.trim().length > 0 ? `view:\n${view.stdout.trim()}` : "",
      ].filter((s) => s.length > 0);
      const combined = parts.join("\n\n");
      const summary = combined.length > MAX_SUMMARY_CHARS ? combined.slice(-MAX_SUMMARY_CHARS) : combined;
      return { ok: true, summary: summary.length > 0 ? summary : "no check data reported" };
    },

    gitInspect: async ({ verb, args: verbArgs }): Promise<InspectResult> => {
      const v = verb.trim();
      // THE READ-ONLY FENCE (ADR-0173 invariant 1 & 4): refuse any verb outside the allowlist BEFORE
      // shelling. A mutating verb (commit, push, merge, checkout, reset, …) never reaches `git`.
      if (!READ_ONLY_GIT_VERBS.has(v)) {
        return {
          ok: false,
          summary:
            `refused: '${verb}' is not a read-only git verb — git_inspect permits only ` +
            `${[...READ_ONLY_GIT_VERBS].join(" / ")} (ADR-0173: this surface never mutates the tree).`,
        };
      }
      // FIXED shape: `git <read-verb> [...args]`. The verb is allowlisted; the extra args are the
      // verb's own options/paths (e.g. `--porcelain`, `HEAD web`) — passed as a vector (no shell).
      const argv = [v, ...(verbArgs ?? [])];
      const result = await exec("git", argv, { cwd });
      if (result.code !== 0) {
        return { ok: false, summary: `git ${v} failed:\n${summarise(result)}` };
      }
      const summary = summarise(result);
      return { ok: true, summary: summary.length > 0 ? summary : `(git ${v}: no output)` };
    },
  };

  return { ok: true, deps };
}
