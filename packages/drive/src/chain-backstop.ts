import {
  resolveBuildConfig,
  runRegressionSuite,
  runWorktreeTypecheck,
} from "@storytree/orchestrator";
import type { NodeSpec, ShellCommand } from "@storytree/orchestrator";

/**
 * The REAL story chain's end-of-chain backstop (ADR-0031 at story grain), factored out of
 * `storyBuild` so the (latency-only) CONCURRENT observation can be proven in isolation. After a
 * green chain is stacked in ONE worktree, promotion re-observes each DISTINCT install-bearing
 * package's typecheck + regression suite over the final HEAD — a green leaf must not break its
 * package, and the proof ran under tsx (types stripped), so only a worktree `tsc` sees type-illegal
 * code. A red of ANY observation withholds the push.
 *
 * Those observations are READ-ONLY (each spawns a command and reads green/red off the exit code —
 * never a write) over INDEPENDENT packages, so they can run concurrently instead of strictly in
 * series. This split — {@link backstopJobs} (build the ordered, de-duplicated job list) then
 * {@link observeBackstop} (run them, bounded) — keeps the honesty of the serial loop (the `anyRed`
 * OR-fold, the report lines, their order) while overlapping the wait. LATENCY-ONLY: it changes when
 * observations run, never what red/green means or what the report says.
 */

/**
 * One backstop observation: a package typecheck or regression suite to re-run over the stacked HEAD,
 * plus how to render its report line. The `line` closure keeps the wording (and, via job order, the
 * ordering) byte-for-byte identical to the serial loop.
 */
export interface BackstopJob {
  /** Dedupe key — `tc:<file> <args>` for a typecheck, `suite:<file> <args>` for a suite. */
  readonly key: string;
  /** Which read-only observer runs the command. */
  readonly kind: "typecheck" | "regression";
  /** The command to spawn in the worktree (green/red off its exit code only — never a write). */
  readonly command: ShellCommand;
  /** Render this job's report line for an observed result (unchanged wording). */
  line(result: "green" | "red"): string;
}

/**
 * Build the de-duplicated, ordered backstop job list for a REAL story chain: each DISTINCT
 * install-bearing node contributes its package typecheck (when declared) THEN its regression suite,
 * de-duplicated by command across nodes (two nodes in one package share a single suite run). Pure —
 * no I/O; the observation happens in {@link observeBackstop}. Non-install nodes carry no worktree
 * backstop (a bare worktree has no node_modules), so they are skipped, exactly as the serial loop
 * skipped them. The order (drive order; typecheck before suite) and the line wording are the serial
 * loop's, verbatim.
 */
export function backstopJobs(driveOrder: readonly NodeSpec[]): BackstopJob[] {
  const jobs: BackstopJob[] = [];
  const seen = new Set<string>();
  for (const n of driveOrder) {
    const cfg = resolveBuildConfig(n)?.config;
    const rc = cfg?.real;
    if (cfg === undefined || rc?.install !== true) continue;
    if (rc.typecheck !== undefined) {
      const key = `tc:${rc.typecheck.file} ${rc.typecheck.args.join(" ")}`;
      if (!seen.has(key)) {
        seen.add(key);
        const command = rc.typecheck;
        const label = key.slice(3);
        jobs.push({
          key,
          kind: "typecheck",
          command,
          line: (result) => `typecheck:   ${label} ${result.toUpperCase()} at the stacked HEAD`,
        });
      }
    }
    const skey = `suite:${cfg.command.file} ${cfg.command.args.join(" ")}`;
    if (!seen.has(skey)) {
      seen.add(skey);
      const command = cfg.command;
      const label = skey.slice(6);
      jobs.push({
        key: skey,
        kind: "regression",
        command,
        line: (result) => `regression:  ${label} ${result.toUpperCase()} at the stacked HEAD`,
      });
    }
  }
  return jobs;
}

/** Injectable observers + concurrency for {@link observeBackstop} (tests pass fakes / a small limit). */
export interface BackstopObservers {
  runTypecheck?: (args: { command: ShellCommand; cwd: string }) => Promise<{ result: "green" | "red" }>;
  runRegression?: (args: { command: ShellCommand; cwd: string }) => Promise<{ result: "green" | "red" }>;
  /** Max observations in flight at once. Default {@link DEFAULT_BACKSTOP_CONCURRENCY}. */
  concurrency?: number;
}

/**
 * The bounded concurrency for the backstop (owner-flagged dev-box gate-OOM trap — several full
 * package suites at once spikes memory). CI already runs these same package suites concurrently via
 * `pnpm -r test`, so a small cap here is no riskier than the existing PR gate; the cap keeps a
 * many-package story from spawning an unbounded fan of suites on a memory-constrained laptop.
 */
export const DEFAULT_BACKSTOP_CONCURRENCY = 4;

/**
 * Observe the backstop jobs and fold them into the promotion decision — LATENCY-ONLY. The
 * observations are read-only over independent packages, so they run CONCURRENTLY with a bounded pool
 * instead of strictly in series. The honesty of the serial loop is preserved exactly:
 *   • `anyRed` is the OR over EVERY observation — one red in ANY package withholds the push, just as
 *     the serial loop decided; concurrency can never let a red slip past (a green is only a green).
 *   • a thrown observation PROPAGATES (the returned promise rejects) — a failed observation is never
 *     silently folded into a green, exactly as the serial `await` would have thrown.
 *   • `lines` keep the jobs' ORIGINAL order regardless of completion order (results are indexed by
 *     job position), so the report is byte-for-byte what the serial loop produced.
 */
export async function observeBackstop(
  jobs: readonly BackstopJob[],
  worktreeRoot: string,
  observers: BackstopObservers = {},
): Promise<{ anyRed: boolean; lines: string[] }> {
  const runTypecheck = observers.runTypecheck ?? runWorktreeTypecheck;
  const runRegression = observers.runRegression ?? runRegressionSuite;
  const limit = Math.max(1, observers.concurrency ?? DEFAULT_BACKSTOP_CONCURRENCY);

  // A tiny fixed-size worker pool: each worker pulls the next unclaimed index (`next++` is atomic
  // between awaits on the single JS thread), observes it, and stores the result at its own slot — so
  // at most `limit` observations are ever in flight, and every slot is filled exactly once.
  const results = new Array<"green" | "red">(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < jobs.length; i = next++) {
      const job = jobs[i]!;
      const run = job.kind === "typecheck" ? runTypecheck : runRegression;
      results[i] = (await run({ command: job.command, cwd: worktreeRoot })).result;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));

  const anyRed = results.some((r) => r === "red");
  const lines = jobs.map((job, i) => job.line(results[i]!));
  return { anyRed, lines };
}

/**
 * Convenience for the caller: build the jobs from the drive order and observe them. Equivalent to
 * `observeBackstop(backstopJobs(driveOrder), worktreeRoot, observers)`.
 */
export async function runChainBackstop(
  driveOrder: readonly NodeSpec[],
  worktreeRoot: string,
  observers?: BackstopObservers,
): Promise<{ anyRed: boolean; lines: string[] }> {
  return observeBackstop(backstopJobs(driveOrder), worktreeRoot, observers);
}
