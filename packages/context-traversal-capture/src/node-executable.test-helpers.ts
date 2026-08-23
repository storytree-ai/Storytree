import { spawnSync } from "node:child_process";

/**
 * The node binary, NAMED rather than inferred from whatever runtime happens to run this suite.
 *
 * Production is node — `pnpm storytree …` resolves to `node packages/cli/launch.mjs`, and both
 * spawned programs in this package (`launch.mjs` and `fixture-door.mjs`) open with
 * `#!/usr/bin/env node`, register the tsx ESM loader, and in `launch.mjs`'s case call node's own
 * `module.enableCompileCache`. `process.execPath` means "the current runtime", which is node only
 * while this package's test script is `node --test`.
 *
 * ⚠ THE HAZARD IS SILENCE, NOT FAILURE, and it is why this exists BEFORE the conversion rather than
 * after it. `bun packages/cli/launch.mjs` RUNS (measured, `bun-runtime-migration-arc` inc-06), so
 * under `bun test` these suites would keep PASSING while observing a program production never
 * executes — tsx's ESM loader and node's compile cache both bypassed. That is exactly what happened
 * to `context-traversal-transcript`: five loud reds became a quiet false green, which is the worse
 * state. A green that exercised the wrong binary is worse than a red, so the binary is named here
 * rather than left to whoever chose the runner, and this helper NEVER falls back to the runner — it
 * throws instead. Copied deliberately from `transcript-ingest.uat.test.ts`, whose docblock carries
 * the same finding.
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
      "this suite spawns the production CLI under node, but no node binary was found on PATH " +
        `(runtime is bun ${String(process.versions["bun"])}) — it must not silently fall back ` +
        "to the runner, which would observe a program production never executes",
    );
  }
  return (cachedNodeExecutable = first.trim());
}
