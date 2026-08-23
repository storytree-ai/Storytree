/**
 * THE PROOF-ROUTE CLASSIFIER (`custom-proof-command-red-accounting` on `parallel-red-green-arc`).
 *
 * ONE place decides what a node's declared proof command IS — the arc's standing instruction, because
 * the custom-`proofCommand` population is implicated in several separate findings and a second
 * classifier would let them disagree. This module answers exactly one question about that command, at
 * RESOLVE time and before any authoring turn is spent:
 *
 *   can the ADR-0211 assert-oracle MEASURE this node's red and green — and if not, is that because no
 *   oracle was WIRED, or because none is POSSIBLE?
 *
 * THE GAP IT CLOSES. {@link import("../resolve-prove-spec.js").realProofCommand} returned
 * `accounted: false` for EVERY declared `real.proofCommand`, so the whole custom route was
 * exit-code-only: no green cross-check and no measured red kind. That was recorded as a documented
 * narrowing, but it was applied by ROUTE (custom vs default) rather than by CAPABILITY, and the two
 * are not the same set — a custom command that runs `node --test` over the node's OWN test file is
 * byte-for-byte the shape the guard was built for, and lost accounting only for declaring itself.
 * Measured 2026-08-09 across the 100 real-buildable nodes carrying a declared command: 2 are exactly
 * that shape (a `--test-force-exit` live-DB file), and both silently opted out.
 *
 * WHY "SINGLE FILE" IS THE LINE, and it is MEASURED, not argued (Node 24.15, 2026-08-09). The guard's
 * report is ONE file that each instrumented process OVERWRITES on exit. Under `node --test` with the
 * default process isolation the RUNNER parent outlives its children, so it writes LAST:
 *
 *   node --import guard --test a.test.mjs                → {"assertions":3}   (runs in-process)
 *   node --import guard --test a.test.mjs b.test.mjs     → {"assertions":0}   (parent clobbers)
 *
 * So a SUITE-scoped command does not merely dilute the count — it reports ZERO, which
 * {@link import("./oracle-accounting.js").verifyOracleExercised} refuses as a hollow green. Wiring the
 * oracle onto a suite would false-RED every one of the 46 suite-scoped nodes. That is what makes
 * "no oracle possible" a fact about the command rather than a preference: for a suite the report cannot
 * attribute anything to this node's test, and the honest posture is the exit-code-only one it already
 * has — now DISCLOSED at resolve time instead of discovered on the verdict.
 *
 * THE REFUSAL is deliberately narrow: it fires only where the classifier can PROVE the command cannot
 * observe the authored test — it identified the single explicit test file the command runs, and that
 * file is NOT the one AUTHOR_TEST writes. The leaf would author a test the spine never runs, so
 * CONFIRM_RED is unreachable by construction and every authoring turn is spent before the halt. Zero
 * nodes are in that state today (all 48 single-file commands name their own `testFile`) — it is a
 * fail-closed fence, not a migration. A command the classifier merely cannot READ is a different
 * thing — unverified, not broken — and is disclosed rather than refused, because the route's honesty
 * does not depend on the answer: it stays exit-code-only and stamps its green unvetted either way.
 *
 * WHAT IS DELIBERATELY *NOT* REFUSED: the suite-scoped and foreign-runner routes. ADR-0098's R2
 * `refactorForTests` arm is STRUCTURALLY suite-scoped — its schema refine REQUIRES a `proofCommand`
 * because the whole package suite IS its regression wall — so a blanket refusal of the unaccounted
 * route would make every R2 node unbuildable. "No oracle possible" is a disclosure, never a refusal.
 *
 * THE PACKAGE-SCRIPT SUITE IS ACCOUNTABLE TOO, when it is provably a node:test suite
 * (`custom-proof-command-red-accounting`'s residual fork, closed here). Every declared package-script
 * command in this corpus is `pnpm --filter <pkg> test` — a `--import` splice into ITS args never
 * reaches the underlying `node` process pnpm spawns for the target package's OWN `scripts.test`, so
 * that population stayed exit-code-only even after `custom-node-test-own-file` started wiring the
 * guard onto declared commands generally. Measured 2026-08-09: EVERY declared package-script command
 * in the corpus is bare `pnpm --filter <pkg> test` (no direct `node --test <glob>` invocation exists
 * today), and of those, five target packages (`studio`, `@storytree/app-surface`) whose OWN
 * `scripts.test` is `vitest run` — a package this classifier would otherwise wrongly assume is
 * node:test-shaped merely because pnpm hides the real runner inside the target's manifest. So this
 * route READS the target package's `package.json` (the one piece of information the token stream
 * cannot carry) and only wires the guard when that read PROVES the inner script is a bare node:test
 * invocation; an unresolvable target, an unreadable manifest, or a resolved-but-foreign inner runner
 * all fall through to the existing generic "suite-scoped" disclosure UNCHANGED — never a guess.
 * Wiring is via `NODE_OPTIONS` (env), not an arg splice: pnpm does not forward extra node flags to
 * the script it runs, but it does inherit and forward the parent's environment, and `--import` via
 * `NODE_OPTIONS` is respected by every node process pnpm spawns, including the node:test workers it
 * forks per file (verified empirically, Node 24.15, 2026-08-09).
 *
 * THE SAME MULTI-PROCESS PROBLEM THIS ENTRY EXISTS TO CLOSE also applies once wired: a package suite
 * still isolates each test file in its own child process, so the report file this route's guard
 * writes must be per-process and aggregated — see {@link import("./oracle-accounting.js")}'s
 * `readAssertionCount` / `resetOracleReport`, which sum every process's report rather than trusting
 * one shared file the last-exiting process would otherwise clobber with its own (parent) count of
 * zero.
 */

import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

import type { RealProofConfig } from "../proof-config.js";

/** Why a route landed where it did — the vocabulary every consumer of this classifier reads. */
export type ProofRouteBasis =
  /** No declared command: the spine's own `node --import tsx --import guard --test <testFile>`. */
  | "default-node-test"
  /** A declared `node --test` over exactly this node's own `testFile` — the guard applies verbatim. */
  | "custom-node-test-own-file"
  /**
   * A declared `node --test` over MORE than this node's own `testFile` (a glob, several files, or no
   * explicit file) — a WHOLE-SUITE node:test invocation, run DIRECTLY (never through a package
   * manager). The guard applies via the same args splice as `custom-node-test-own-file`; what makes
   * it accountable at all is the per-process report aggregation in `oracle-accounting.ts`.
   */
  | "direct-node-test-suite"
  /**
   * A declared `pnpm --filter <pkg> test` whose TARGET package's own `scripts.test` is provably a
   * bare node:test invocation (read from that package's `package.json`) — the whole-package suite is
   * this node's regression wall (ADR-0098 R2), and the guard is wired via `NODE_OPTIONS` since an arg
   * splice on the pnpm invocation never reaches the node process it spawns.
   */
  | "package-script-node-test-suite"
  /** A declared command that observes MORE than this node's test file (a package script, a glob, >1 file). */
  | "suite-scoped"
  /** A declared command whose runner does not assert through `node:assert` (vitest, jest, mocha, …). */
  | "foreign-runner"
  /** A declared command the resolver cannot read: no recognised runner, no identifiable observed file. */
  | "unrecognised-runner"
  /** A declared command that runs ONE explicit test file — and it is not the one AUTHOR_TEST writes. */
  | "observes-another-file";

/**
 * The classified route. Three postures, and the middle one is the point: an unaccounted route is now
 * distinguishable from an unclassifiable one, so the resolver can wire, disclose, or refuse rather than
 * treating "custom" as a single undifferentiated opt-out.
 */
export type ProofRoute =
  | {
      accounting: "oracle";
      basis:
        | "default-node-test"
        | "custom-node-test-own-file"
        | "direct-node-test-suite"
        | "package-script-node-test-suite";
      /**
       * Where `--import <guardUrl>` must be spliced into the DECLARED `proofCommand.args` (before the
       * platform shim). `null` on the default route, whose command the resolver builds itself with the
       * guard already in place, AND on `package-script-node-test-suite`, which is wired via
       * `NODE_OPTIONS` instead (an arg splice on the pnpm invocation never reaches the spawned node
       * process) — the resolver distinguishes the two by `basis`, not by this field alone.
       */
      guardArgIndex: number | null;
    }
  | {
      accounting: "none";
      basis: "suite-scoped" | "foreign-runner" | "unrecognised-runner";
      /** Stamped on the verdict's green and printed at resolve time — WHY no oracle is possible here. */
      disclosure: string;
    }
  | {
      accounting: "refused";
      basis: "observes-another-file";
      /** Names the oracle-accounted remedy; the resolver refuses with this BEFORE any authoring turn. */
      reason: string;
    };

/**
 * The node binary, NAMED — what a command that means NODE must carry as its `file`.
 *
 * ⚠ `process.execPath` does NOT mean node; it means "whatever runtime is running this process". That
 * was node for as long as every package's test script was `node --test`, but under `bun test` it is
 * `bun.exe` — whose basename is in {@link PACKAGE_MANAGERS} below, so a proof command the spine
 * BUILT ITSELF got classified as an opaque package-manager invocation and routed away from the
 * oracle-accounted node-runner branch. That single substitution accounted for 25 of the 26 residual
 * `bun test` failures across `orchestrator` and `drive` (`bun-runtime-migration-arc` inc-09/inc-10),
 * and it is the same fault class inc-06 fixed for `agent` and `context-traversal-transcript`.
 *
 * The rule is NOT "never use `process.execPath`". A `-e` eval, or a stand-in for "some absolute
 * executable an administrator pinned", is correctly runtime-agnostic and must stay as it is. Only a
 * command whose flags are node's own (`--test`, `--import`) or whose child is a node program means
 * node, and only those name it here.
 */
export const NODE_BINARY = "node";

/**
 * Package managers whose bare `<script>` invocation runs a package's own script (a suite).
 *
 * `bun` belongs here — `bun test <pkg>` really is an opaque suite invocation — and its presence is
 * exactly why a command the spine builds must name {@link NODE_BINARY} rather than inherit its own
 * runtime; see that constant for the failure it caused.
 */
const PACKAGE_MANAGERS = new Set(["pnpm", "npm", "yarn", "npx", "bun"]);

/** Runners that assert through APIs the `node:assert` guard does not count. */
const FOREIGN_RUNNERS = new Set(["vitest", "jest", "mocha", "playwright", "ava", "tap"]);

/**
 * Node flags that CONSUME the following token, so the token is a flag VALUE and never a test path.
 * Only the ones a proof command plausibly carries — an unknown `--flag value` pair degrades to
 * "value looks like a path", which can only ever push a route toward the conservative side.
 */
const NODE_FLAGS_TAKING_A_VALUE = new Set([
  "--import",
  "--require",
  "-r",
  "--loader",
  "--experimental-loader",
  "--conditions",
  "-C",
  "--test-reporter",
  "--test-reporter-destination",
  "--test-name-pattern",
  "--test-skip-pattern",
  "--test-concurrency",
  "--test-shard",
  "--test-timeout",
  "--env-file",
]);

/** A path spec that can match more than one file — never a single-file run. */
function isGlob(spec: string): boolean {
  return /[*?[\]{}]/.test(spec);
}

/**
 * The `--filter <target>` value out of a `pnpm` token stream — the workspace package name pnpm's
 * invocation names (`--filter <name>` or `--filter=<name>`). Undefined when no filter is present, in
 * which case {@link readWorkspaceTestScript} is never called (there is nothing to look up).
 */
function extractPnpmFilterTarget(tokens: readonly string[]): string | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token === "--filter") return tokens[i + 1];
    if (token.startsWith("--filter=")) return token.slice("--filter=".length);
  }
  return undefined;
}

/** The workspace roots this repo's `pnpm-workspace.yaml` declares (`packages/*`, `apps/*`). */
const WORKSPACE_ROOTS = ["packages", "apps"];

/**
 * Resolve a workspace package NAME (a pnpm `--filter` target, e.g. `@storytree/library` or `studio`)
 * to its declared `scripts.test` string, by scanning `<workspaceRoot>/{packages,apps}/*\/package.json`
 * for a matching `name` field — the one piece of ground truth a `pnpm --filter <pkg> test` token
 * stream cannot itself carry (pnpm hides the real runner inside the target's own manifest).
 *
 * Undefined/empty `workspaceRoot`, an unresolvable name, an unreadable/malformed manifest, or a
 * manifest with no `test` script all collapse to `undefined` — every "cannot verify this" case, so
 * the caller degrades to the existing conservative disclosure rather than guessing. Never throws.
 * Empty string is treated the same as undefined DELIBERATELY: `resolveReport`
 * (`@storytree/drive`'s free, read-only `node resolve` preview) calls `realProofCommand` with `""` —
 * no real worktree exists at that point — and that call site's own contract is "pure, no I/O"; reading
 * `path.join("", "packages")` would resolve relative to `process.cwd()` instead, a cwd-dependent
 * accident this guards against rather than relying on.
 */
function readWorkspaceTestScript(
  workspaceRoot: string | undefined,
  pkgName: string | undefined,
): { script: string; pkgDir: string } | undefined {
  if (workspaceRoot === undefined || workspaceRoot === "" || pkgName === undefined) return undefined;
  for (const root of WORKSPACE_ROOTS) {
    let entries: string[];
    try {
      entries = readdirSync(path.join(workspaceRoot, root));
    } catch {
      continue;
    }
    for (const entry of entries) {
      let manifest: unknown;
      try {
        manifest = JSON.parse(readFileSync(path.join(workspaceRoot, root, entry, "package.json"), "utf8"));
      } catch {
        continue;
      }
      if (typeof manifest !== "object" || manifest === null) continue;
      const name = (manifest as { name?: unknown }).name;
      if (name !== pkgName) continue;
      const script = (manifest as { scripts?: Record<string, unknown> }).scripts?.test;
      return typeof script === "string" ? { script, pkgDir: `${root}/${entry}` } : undefined;
    }
  }
  return undefined;
}

/**
 * Classify a package's OWN `scripts.test` string (as opposed to the outer `classifyProofRoute`,
 * which classifies the pnpm invocation that runs it). Reuses the same runner vocabulary — a foreign
 * runner named anywhere in the script wins (a script can invoke `node` merely to shim its own
 * runner), else a bare node:test invocation is recognised by the `node` + `--test` pair. Anything
 * else is "unknown": deliberately not a "node-test" guess, since guessing wrong here is exactly the
 * false-red hazard this whole lookup exists to avoid.
 */
function classifyInnerScript(script: string): "node-test" | "foreign" | "unknown" {
  const tokens = script.trim().split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
  if (tokens.some((t) => FOREIGN_RUNNERS.has(executableName(t)))) return "foreign";
  if (tokens.some(isNodeExecutable) && tokens.includes("--test")) return "node-test";
  return "unknown";
}

/** Does the node's repo-relative `testFile` actually live under the resolved package's directory? */
function testFileUnderPackage(testFile: string, pkgDir: string): boolean {
  const t = normalisePath(testFile);
  return t === pkgDir || t.startsWith(`${pkgDir}/`);
}

/** Normalise a declared path for comparison: forward slashes, no leading `./`. */
function normalisePath(p: string): string {
  return p.split(path.win32.sep).join("/").replace(/^\.\//, "");
}

/**
 * Does `arg` name the SAME file as the node's repo-relative `testFile`? A declared command often runs
 * inside a package (`pnpm --filter <pkg> exec node --test src/x.test.ts`), so the argument is
 * package-relative while `testFile` is repo-relative. A path-boundary SUFFIX match is what relates the
 * two without the classifier having to resolve `--filter` to a directory.
 */
export function namesTestFile(arg: string, testFile: string): boolean {
  const a = normalisePath(arg);
  const t = normalisePath(testFile);
  return t === a || t.endsWith(`/${a}`);
}

/** The basename of an executable token, lower-cased and stripped of a `.exe`/`.cmd` suffix. */
function executableName(token: string): string {
  const base = normalisePath(token).split("/").pop() ?? token;
  return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, "");
}

function isNodeExecutable(token: string): boolean {
  return executableName(token) === "node";
}

/**
 * The explicit path-looking positional arguments after `startIndex` — the files a runner was pointed
 * at. Flag VALUES are skipped so `--import <url>` never reads as a test path, and only tokens with a
 * JS/TS test extension count, so a `--filter @storytree/library` package name cannot masquerade as one.
 */
function explicitTestPaths(tokens: readonly string[], startIndex: number): string[] {
  const paths: string[] = [];
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.startsWith("-")) {
      if (NODE_FLAGS_TAKING_A_VALUE.has(token) && !token.includes("=")) i += 1;
      continue;
    }
    if (/\.(m|c)?[jt]sx?$/.test(token) || isGlob(token)) paths.push(token);
  }
  return paths;
}

/**
 * The workspace lookup {@link classifyProofRoute} needs to see INSIDE a `pnpm --filter <pkg> test`
 * invocation — resolve `workspaceRoot`. Passed by the resolver, which already holds a real git
 * worktree checkout (a full clone of repo HEAD, including every `package.json`, present before any
 * authoring turn runs) — never the leaf's write scope.
 */
export interface ClassifyProofRouteOpts {
  workspaceRoot?: string;
}

/**
 * Classify a node's REAL proof route. Total — every declared command lands in exactly one posture,
 * and each one carries its OWN reason. That is the conflation this closes: "custom, therefore
 * unaccounted" was a single undifferentiated opt-out covering a shape the guard measures perfectly, two
 * shapes it provably cannot, and one that cannot observe the authored test at all. Pure but for the ONE
 * optional read `opts.workspaceRoot` enables (the target package's `package.json`, needed only to
 * resolve a `pnpm --filter <pkg> test` route) — omitting it degrades that one route to its prior,
 * conservative "suite-scoped, unaccounted" posture rather than guessing.
 */
export function classifyProofRoute(
  real: RealProofConfig,
  opts: ClassifyProofRouteOpts = {},
): ProofRoute {
  const declared = real.proofCommand;
  if (declared === undefined) {
    return { accounting: "oracle", basis: "default-node-test", guardArgIndex: null };
  }

  const tokens = [declared.file, ...declared.args];
  const nodeIndex = tokens.findIndex(isNodeExecutable);
  const foreignIndex = tokens.findIndex((t) => FOREIGN_RUNNERS.has(executableName(t)));

  // A foreign runner is checked FIRST: `pnpm exec vitest run <file>` carries no node token, but a
  // hypothetical `node …/vitest.mjs` would carry both, and the runner is what decides the assert API.
  if (foreignIndex !== -1) {
    const runner = executableName(tokens[foreignIndex] ?? "");
    const paths = explicitTestPaths(tokens, foreignIndex + 1);
    const single = paths.length === 1 ? paths[0] : undefined;
    if (single !== undefined && !isGlob(single) && !namesTestFile(single, real.testFile)) {
      return unobservableTestFile(single, real);
    }
    return {
      accounting: "none",
      basis: "foreign-runner",
      disclosure:
        `no oracle is POSSIBLE on this route: the proof runs ${runner}, which asserts through an API ` +
        `the ADR-0211 guard does not count (it instruments node:assert only). The green is honest ` +
        `exit-code evidence and the red kind is a text heuristic, never a measurement.`,
    };
  }

  if (nodeIndex !== -1) {
    const paths = explicitTestPaths(tokens, nodeIndex + 1);
    const single = paths.length === 1 ? paths[0] : undefined;
    if (single !== undefined && !isGlob(single)) {
      if (!namesTestFile(single, real.testFile)) return unobservableTestFile(single, real);
      // The one shape the guard was built for, reached by a declared command instead of the default
      // one. `--import <guard>` goes immediately after the node token (`tokens[nodeIndex]`), so it
      // precedes every other node flag; since `tokens[0]` is `file`, that index is ALSO the insertion
      // point in `args`, for both `file: "node"` (0 → 0) and `pnpm … exec node …` (k → k).
      return { accounting: "oracle", basis: "custom-node-test-own-file", guardArgIndex: nodeIndex };
    }
    if (tokens.includes("--test")) {
      // `custom-proof-command-red-accounting` residual: a WHOLE-SUITE node:test run isolates each
      // file in its own child process, so the naive single shared report file is overwritten LAST by
      // the runner PARENT's own count of zero (measured, Node 24) — that was the reason this route
      // stayed unaccounted. It no longer is: `oracle-accounting.ts`'s report is now PER-PROCESS and
      // aggregated, so a direct `node --test <glob>` invocation is wired exactly like
      // `custom-node-test-own-file` (the guard reaches the real process either way; only the
      // package-manager route below needs the env-based detour).
      return { accounting: "oracle", basis: "direct-node-test-suite", guardArgIndex: nodeIndex };
    }
    // A node command that is neither the test runner nor pointed at one identifiable file: the spine
    // cannot say what it observes, so it cannot say whose red it reports. Fall through to the refusal.
  }

  if (PACKAGE_MANAGERS.has(executableName(declared.file))) {
    // `custom-proof-command-red-accounting` residual: can this package-manager invocation be PROVEN
    // to run a node:test suite under the hood? The token stream alone cannot say — it names `pnpm`
    // and a `--filter` target, never the target's OWN `scripts.test`. Reading that manifest is the
    // one piece of ground truth that distinguishes a node:test package (accountable, once its report
    // is aggregated per-process) from a package whose `test` script is itself a foreign runner
    // (`studio`, `@storytree/app-surface` both run `vitest run` — wiring the guard onto THOSE would
    // false-red every green, since vitest does not exercise `node:assert` the way this guard counts).
    // An unresolvable target or an unreadable manifest is NOT a foreign-runner finding — it falls
    // through to the same conservative disclosure this route has always carried.
    const resolved = readWorkspaceTestScript(opts.workspaceRoot, extractPnpmFilterTarget(tokens));
    if (
      resolved !== undefined &&
      classifyInnerScript(resolved.script) === "node-test" &&
      testFileUnderPackage(real.testFile, resolved.pkgDir)
    ) {
      return { accounting: "oracle", basis: "package-script-node-test-suite", guardArgIndex: null };
    }
    return {
      accounting: "none",
      basis: "suite-scoped",
      disclosure:
        `no oracle is POSSIBLE on this route: the proof runs a package script ` +
        `(\`${declared.file} ${declared.args.join(" ")}\`), which is a whole suite. Its assertion ` +
        `report is written last by the runner parent and cannot be attributed to this node's test ` +
        `file, so the route stays exit-code-only. This is the ADR-0098 R2 shape (the package suite IS ` +
        `the regression wall) and is a disclosure, never a defect.`,
    };
  }

  // The residue: a command this spine cannot read (an inline `node -e` probe, a shell script, a make
  // target). It is DISCLOSED, not refused, and the line between the two is deliberate: the refusal
  // above fires on something the classifier can PROVE is broken (it identified the one file the command
  // runs, and that file is not the one being authored), whereas this bucket is only unVERIFIED. Refusing
  // the unverified would fence off a shape the schema explicitly contemplates — "use a node-based
  // command for an install-free proof" — to protect an honesty property that is not actually at risk:
  // the route stays exit-code-only and its green is stamped unvetted either way, so the verdict tells
  // no lie. Fail-closed belongs where a wrong answer would be believed; here there is no answer to
  // believe.
  return {
    accounting: "none",
    basis: "unrecognised-runner",
    disclosure:
      `no oracle is POSSIBLE on this route: the declared command ` +
      `\`${declared.file} ${declared.args.join(" ")}\` names no runner this spine can read, so it ` +
      `cannot tell whether the assertions in a report belong to \`${real.testFile}\`. Red/green is ` +
      `honest exit-code evidence only. The oracle-accounted alternatives are a node:test command over ` +
      `\`${real.testFile}\`, or no real.proofCommand at all (the default ` +
      `\`node --import tsx --test ${real.testFile}\`).`,
  };
}

/** The refusal for a single-file command pointed at a file the leaf is not authoring. */
function unobservableTestFile(observed: string, real: RealProofConfig): ProofRoute {
  return {
    accounting: "refused",
    basis: "observes-another-file",
    reason:
      `the declared real.proofCommand runs exactly one test file, \`${observed}\`, but AUTHOR_TEST ` +
      `writes \`${real.testFile}\` — the spine would never run the authored test, so CONFIRM_RED can ` +
      `never observe its red and every authoring turn would be spent before the halt. Point the ` +
      `command at \`${real.testFile}\`, or drop real.proofCommand for the default oracle-accounted ` +
      `route (\`node --import tsx --test ${real.testFile}\`).`,
  };
}

/**
 * Splice `--import <guardUrl>` into a declared command's arg vector at the classified index. Returns a
 * NEW array — the declared config is never mutated, so the display string and the registry-parity
 * deepEqual both still read the author's own command.
 */
export function withOracleGuard(
  args: readonly string[],
  guardArgIndex: number,
  guardUrl: string,
): string[] {
  return [...args.slice(0, guardArgIndex), "--import", guardUrl, ...args.slice(guardArgIndex)];
}

/**
 * The `package-script-node-test-suite` counterpart to {@link withOracleGuard}: compose a
 * `NODE_OPTIONS` value that preloads the guard, for wiring where an ARG splice cannot reach the node
 * process (a `pnpm --filter <pkg> test` invocation never forwards extra node flags to the script it
 * runs, but it does inherit and forward `NODE_OPTIONS`, and every node process pnpm spawns for that
 * script — including the node:test workers it forks per file — reads it, Node 20.6+). Preserves any
 * value already present (there is none today — `real.proofCommand`'s schema accepts no `env` — kept
 * robust against a future caller that merges one in first) rather than overwriting it.
 */
export function withOracleGuardEnv(existing: string | undefined, guardUrl: string): string {
  const importFlag = `--import ${guardUrl}`;
  return existing === undefined || existing.trim() === "" ? importFlag : `${existing} ${importFlag}`;
}
