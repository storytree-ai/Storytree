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
 */

import * as path from "node:path";

import type { RealProofConfig } from "../proof-config.js";

/** Why a route landed where it did — the vocabulary every consumer of this classifier reads. */
export type ProofRouteBasis =
  /** No declared command: the spine's own `node --import tsx --import guard --test <testFile>`. */
  | "default-node-test"
  /** A declared `node --test` over exactly this node's own `testFile` — the guard applies verbatim. */
  | "custom-node-test-own-file"
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
      basis: "default-node-test" | "custom-node-test-own-file";
      /**
       * Where `--import <guardUrl>` must be spliced into the DECLARED `proofCommand.args` (before the
       * platform shim). `null` on the default route, whose command the resolver builds itself with the
       * guard already in place.
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

/** Package managers whose bare `<script>` invocation runs a package's own script (a suite). */
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
 * Classify a node's REAL proof route. Pure and total — every declared command lands in exactly one
 * posture, and each one carries its OWN reason. That is the conflation this closes: "custom, therefore
 * unaccounted" was a single undifferentiated opt-out covering a shape the guard measures perfectly, two
 * shapes it provably cannot, and one that cannot observe the authored test at all.
 */
export function classifyProofRoute(real: RealProofConfig): ProofRoute {
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
      return {
        accounting: "none",
        basis: "suite-scoped",
        disclosure:
          `no oracle is POSSIBLE on this route: the proof runs node:test over ${
            paths.length === 0 ? "no explicit file" : `${paths.length} path spec(s)`
          }, so node:test isolates each file in a child process and the RUNNER PARENT overwrites the ` +
          `assertion report LAST with its own count of zero (measured, Node 24). A count read back ` +
          `from a multi-file run says nothing about this node's test, so the route stays ` +
          `exit-code-only.`,
      };
    }
    // A node command that is neither the test runner nor pointed at one identifiable file: the spine
    // cannot say what it observes, so it cannot say whose red it reports. Fall through to the refusal.
  }

  if (PACKAGE_MANAGERS.has(executableName(declared.file))) {
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
