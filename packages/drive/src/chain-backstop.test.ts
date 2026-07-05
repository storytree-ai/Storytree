import test from "node:test";
import assert from "node:assert/strict";

import type { NodeBuildConfig, NodeSpec, ShellCommand } from "@storytree/orchestrator";

import {
  backstopJobs,
  observeBackstop,
  DEFAULT_BACKSTOP_CONCURRENCY,
} from "./chain-backstop.js";
import type { BackstopJob } from "./chain-backstop.js";

/**
 * The REAL story chain's end-of-chain backstop, factored out of `storyBuild` and made CONCURRENT
 * (latency-only, ADR-0031 honesty untouched). These offline tests pin the invariants a naive
 * parallelisation could break: a red in ANY package is never swallowed, a thrown observation
 * propagates (never silently a green), the report lines keep their original order regardless of
 * completion order, and the concurrency stays bounded (the dev-box gate-OOM trap).
 */

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

/** A synthetic job whose command carries its index and whose line is `L<i>:<result>`. */
function job(kind: "typecheck" | "regression", i: number): BackstopJob {
  return {
    key: `k${i}`,
    kind,
    command: { file: "c", args: [String(i)] },
    line: (result) => `L${i}:${result}`,
  };
}

/** An externally-resolvable promise, for deterministic control of observation completion order. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── observeBackstop: the concurrent core (the changed behaviour) ──────────────────────────────────

test("observeBackstop: all green → no red, lines in order, command+cwd passed through", async () => {
  const jobs = Array.from({ length: 3 }, (_, i) => job("regression", i));
  const calls: { file: string; arg: string; cwd: string }[] = [];
  const runner = async ({ command, cwd }: { command: ShellCommand; cwd: string }) => {
    calls.push({ file: command.file, arg: command.args[0] ?? "", cwd });
    return { result: "green" as const };
  };
  const { anyRed, lines } = await observeBackstop(jobs, "/my/wt", { runRegression: runner });
  assert.equal(anyRed, false);
  assert.deepEqual(lines, ["L0:green", "L1:green", "L2:green"]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.cwd === "/my/wt" && c.file === "c"));
});

test("observeBackstop with no jobs is a no-op (no red, no lines)", async () => {
  const { anyRed, lines } = await observeBackstop([], "/wt");
  assert.equal(anyRed, false);
  assert.deepEqual(lines, []);
});

// The load-bearing honesty wall: parallelism must not let a red slip past, wherever it lands.
for (const redAt of [0, 2, 4]) {
  test(`observeBackstop never swallows a red — red at job ${redAt} of 5`, async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job("regression", i));
    const runner = async ({ command }: { command: ShellCommand; cwd: string }) => ({
      result: (Number(command.args[0]) === redAt ? "red" : "green") as "green" | "red",
    });
    const { anyRed, lines } = await observeBackstop(jobs, "/wt", {
      runRegression: runner,
      concurrency: 3,
    });
    assert.equal(anyRed, true, "a red anywhere must set anyRed");
    assert.equal(lines[redAt], `L${redAt}:red`);
  });
}

test("observeBackstop keeps report lines in JOB order even when observations complete in REVERSE", async () => {
  const N = 4;
  const gates = Array.from({ length: N }, () => deferred<void>());
  const runner = async ({ command }: { command: ShellCommand; cwd: string }) => {
    await gates[Number(command.args[0])]!.promise;
    return { result: "green" as const };
  };
  const jobs = Array.from({ length: N }, (_, i) => job("regression", i));
  const p = observeBackstop(jobs, "/wt", { runRegression: runner, concurrency: N });
  // Complete the observations in the OPPOSITE order to the job list.
  for (let i = N - 1; i >= 0; i -= 1) gates[i]!.resolve();
  const { lines } = await p;
  assert.deepEqual(lines, ["L0:green", "L1:green", "L2:green", "L3:green"]);
});

test("observeBackstop bounds concurrency and genuinely reaches the cap", async () => {
  const N = 5;
  const LIMIT = 2;
  const gates = Array.from({ length: N }, () => deferred<void>());
  let active = 0;
  let maxActive = 0;
  const runner = async ({ command }: { command: ShellCommand; cwd: string }) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gates[Number(command.args[0])]!.promise;
    active -= 1;
    return { result: "green" as const };
  };
  const jobs = Array.from({ length: N }, (_, i) => job("regression", i));
  const p = observeBackstop(jobs, "/wt", { runRegression: runner, concurrency: LIMIT });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(active, LIMIT, "only `limit` observations run at once (not all 5)");
  for (const g of gates) g.resolve();
  const { anyRed } = await p;
  assert.equal(maxActive, LIMIT, "never exceeded the cap, and reached it (genuinely concurrent)");
  assert.equal(anyRed, false);
});

test("observeBackstop propagates a thrown observation (never silently a green)", async () => {
  const jobs = Array.from({ length: 3 }, (_, i) => job("regression", i));
  const boom = async (): Promise<{ result: "green" | "red" }> => {
    throw new Error("observer boom");
  };
  await assert.rejects(
    observeBackstop(jobs, "/wt", { runRegression: boom, concurrency: 2 }),
    /observer boom/,
  );
});

test("observeBackstop routes typecheck vs regression jobs to the right observer", async () => {
  const seen: string[] = [];
  const jobs = [job("typecheck", 0), job("regression", 1)];
  const { anyRed } = await observeBackstop(jobs, "/wt", {
    runTypecheck: async ({ command }) => {
      seen.push(`tc:${command.args[0]}`);
      return { result: "green" };
    },
    runRegression: async ({ command }) => {
      seen.push(`re:${command.args[0]}`);
      return { result: "green" };
    },
    concurrency: 2,
  });
  assert.equal(anyRed, false);
  assert.deepEqual(seen.sort(), ["re:1", "tc:0"]);
});

test("the default backstop concurrency is a small bounded cap (the OOM trap)", () => {
  assert.ok(DEFAULT_BACKSTOP_CONCURRENCY >= 1 && DEFAULT_BACKSTOP_CONCURRENCY <= 4);
});

// ── backstopJobs: the ordered, de-duplicated job builder (unchanged logic, now covered) ───────────

function mkSpec(id: string, buildConfig: NodeBuildConfig | undefined): NodeSpec {
  return {
    id,
    tier: "capability",
    title: id,
    outcome: id,
    status: "proposed",
    proofMode: "integration-test",
    uatWitness: undefined,
    story: "s",
    dependsOn: [],
    consumedBy: [],
    artifactEdges: [],
    capabilities: [],
    decisions: [],
    buildConfig,
    guidance: undefined,
    uatTests: [],
    reliabilityGates: [],
    contracts: [],
    file: `${id}.md`,
  };
}

function installCfg(pkg: string, opts: { typecheck?: boolean } = {}): NodeBuildConfig {
  const scope = { testGlobs: [`packages/${pkg}/x.test.ts`], sourceGlobs: [`packages/${pkg}/x.ts`] };
  return {
    command: { file: "pnpm", args: ["--filter", `@storytree/${pkg}`, "test"] },
    scope,
    real: {
      testFile: `packages/${pkg}/x.test.ts`,
      sourceFile: `packages/${pkg}/x.ts`,
      scope,
      install: true,
      ...(opts.typecheck === false
        ? {}
        : { typecheck: { file: "pnpm", args: ["--filter", `@storytree/${pkg}`, "typecheck"] } }),
    },
  };
}

function noInstallCfg(pkg: string): NodeBuildConfig {
  const scope = { testGlobs: [`packages/${pkg}/y.test.ts`], sourceGlobs: [`packages/${pkg}/y.ts`] };
  return {
    command: { file: "node", args: ["--version"] },
    scope,
    real: { testFile: `packages/${pkg}/y.test.ts`, sourceFile: `packages/${pkg}/y.ts`, scope },
  };
}

test("backstopJobs: install-bearing only, deduped by command, typecheck-before-suite, verbatim wording", () => {
  const jobs = backstopJobs([
    mkSpec("cap-a", installCfg("drive")), //   → typecheck(drive) + suite(drive)
    mkSpec("cap-b", installCfg("drive")), //   same package → both dedupe away
    mkSpec("cap-c", installCfg("cli")), //     → typecheck(cli) + suite(cli)
    mkSpec("cap-x", noInstallCfg("drive")), // non-install → no worktree backstop, skipped
    mkSpec("cap-none", undefined), //          no proof config → skipped
  ]);
  assert.deepEqual(
    jobs.map((j) => j.kind),
    ["typecheck", "regression", "typecheck", "regression"],
  );
  assert.deepEqual(
    jobs.map((j) => j.key),
    [
      "tc:pnpm --filter @storytree/drive typecheck",
      "suite:pnpm --filter @storytree/drive test",
      "tc:pnpm --filter @storytree/cli typecheck",
      "suite:pnpm --filter @storytree/cli test",
    ],
  );
  // The report wording is the serial loop's, byte-for-byte.
  assert.equal(
    jobs[0]!.line("green"),
    "typecheck:   pnpm --filter @storytree/drive typecheck GREEN at the stacked HEAD",
  );
  assert.equal(
    jobs[1]!.line("red"),
    "regression:  pnpm --filter @storytree/drive test RED at the stacked HEAD",
  );
});

test("backstopJobs: an install node without a typecheck contributes only its suite", () => {
  const jobs = backstopJobs([mkSpec("cap-a", installCfg("drive", { typecheck: false }))]);
  assert.deepEqual(
    jobs.map((j) => j.kind),
    ["regression"],
  );
  assert.equal(jobs[0]!.key, "suite:pnpm --filter @storytree/drive test");
});
