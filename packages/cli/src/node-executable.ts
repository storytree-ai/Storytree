import { spawnSync } from "node:child_process";

/**
 * The node binary, NAMED rather than inferred from whatever runtime happens to be executing.
 *
 * Production is node. `pnpm storytree …` resolves to `node packages/cli/launch.mjs`; the five
 * spawned programs this package owns (`launch.mjs`, `definition-injection.mjs`,
 * `provision-worktree.mjs`, `worktree-health.mjs`, and `scripts/gate-bg.mjs`) open with
 * `#!/usr/bin/env node`, and `launch.mjs` additionally registers the tsx ESM loader and calls
 * node's own `module.enableCompileCache`. `check-mirror-conformance`'s probe spawn passes node's
 * `--import tsx` flag, which bun reads as something else entirely. `process.execPath` means "the
 * current runtime", which is node only while this package's test script is `node --test`.
 *
 * ⚠ THE HAZARD IS SILENCE, NOT FAILURE, and it is why this exists BEFORE the `bun test`
 * conversion rather than after it. `bun packages/cli/launch.mjs` RUNS (measured,
 * `bun-runtime-migration-arc` inc-06), so under `bun test` these suites would keep PASSING while
 * observing a program production never executes — tsx's ESM loader and node's compile cache both
 * bypassed. That is exactly what happened to `context-traversal-transcript`: five loud reds became
 * a quiet false green, which is the worse state. So this helper NEVER falls back to the runner —
 * it throws instead.
 *
 * The rule is NOT "never use `process.execPath`". Sites that spawn `-e` evals, or use the current
 * executable as a stand-in for "some absolute binary an administrator pinned", are legitimately
 * runtime-agnostic and are left alone (35 such sites repo-wide, swept at inc-06). This names the
 * ones that MEAN node.
 *
 * Copied deliberately from `packages/context-traversal-capture/src/node-executable.test-helpers.ts`
 * (inc-10), which carries the same finding; it lives in a plain source module here because
 * `check-mirror-conformance.ts` — a `check:*` rung rather than a test — is one of its callers.
 */
let cachedNodeExecutable: string | undefined;
export function nodeExecutable(): string {
  if (cachedNodeExecutable !== undefined) return cachedNodeExecutable;
  if (process.versions["bun"] === undefined) return (cachedNodeExecutable = process.execPath);
  const fromPackageManager = process.env["npm_node_execpath"];
  if (fromPackageManager !== undefined && fromPackageManager !== "") {
    return (cachedNodeExecutable = fromPackageManager);
  }
  const lookup = spawnSync(process.platform === "win32" ? "where" : "which", ["node"], {
    encoding: "utf8",
  });
  const first = (lookup.stdout ?? "").split(/\r?\n/).find((line) => line.trim() !== "");
  if (lookup.status !== 0 || first === undefined) {
    throw new Error(
      "this call spawns a program that must run under node, but no node binary was found on PATH " +
        `(runtime is bun ${String(process.versions["bun"])}) — it must not silently fall back ` +
        "to the runner, which would observe a program production never executes",
    );
  }
  return (cachedNodeExecutable = first.trim());
}
