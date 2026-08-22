// Affected-only PR test scope (ADR-0195, amends ADR-0022): the PURE classification logic behind
// `pnpm ci:affected` (ci-affected-main.ts is the thin CI shell). Given the PR's changed-file set and
// the workspace project list, decide whether CI may narrow `pnpm -r typecheck` / `pnpm -r test` to
// the changed projects PLUS their dependents (`--filter "...<name>"` — pnpm expands the dependents
// from the real workspace graph), or must run the full `-r` suite.
//
// The rules are deliberately CONSERVATIVE — anything the pnpm dependency graph cannot see forces the
// full run:
//  - A file outside `packages/*` / `apps/*` (scripts/**, .github/**, infra/**, pnpm-lock.yaml,
//    root tsconfig/package.json, the `web` gitlink, …) → FULL. Several package test suites read
//    these root paths directly, and the pnpm graph cannot see any of it.
//    THE ONE EXCEPTION is {@link ROOT_PATH_READERS} (ADR-0394): a root path whose test-time readers
//    have been established MECHANICALLY narrows to those readers plus their dependents instead of
//    to everything. It is an exception to the ANSWER, never to the burden of proof — a root path
//    with no measured reader set is not in the map and still fails wide. `scripts/**` and
//    `tsconfig.base.json` are the instructive non-entries: both WERE measured, and both are read by
//    every project at test time (`scripts/tsx-cache-off.mjs` is preloaded by all 25 test scripts),
//    so mapping them would express the full run in a longer form.
//  - `apps/studio/data/**` (the studio's shared data dir) → FULL, even though it sits inside an app:
//    its files are read across package boundaries by no declared dependency edge — `comments.json` by
//    library's `loadComments`, `unit-status.json` by the studio off a cli generator. It held the
//    corpus seed until ADR-0302 D1 deleted it, which is why the rule exists; the remaining files
//    still justify it, and the rule only ever fails WIDE.
//  - Any `package.json` → FULL: workspace manifests are the selection graph's own inputs (and
//    node-build resolves `packages/<dir>/package.json` across packages at runtime); filtering by a
//    graph the diff is mutating is the classic under-selection footgun.
//  - A file under `packages/` / `apps/` that maps to no known project (e.g. `packages/README.md`, or
//    a deleted package's leftovers) → FULL.
// Any refinement of these rules is an ADR-0195 amendment, not a quiet edit.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** One workspace project: its package name and its repo-root-relative posix dir. */
export interface WorkspaceProject {
  name: string;
  /** e.g. `packages/library` or `apps/studio` — no trailing slash. */
  dir: string;
}

/** The scope decision: run everything, or the named projects + their dependents. */
export type AffectedScope =
  | { mode: "full"; reason: string }
  | { mode: "affected"; projects: string[]; reason: string };

/** The studio data dir, read across package boundaries by no declared edge (trailing slash = prefix match). */
const CORPUS_SEED_DIR = "apps/studio/data/";

/** The workspace roots — mirrors pnpm-workspace.yaml's globs (that file is root-scoped, so a change to it forces FULL before this list could go stale). */
const WORKSPACE_ROOTS = ["packages", "apps"] as const;

/** One root path whose test-time readers are known: the prefix, who reads it, and the evidence. */
interface RootPathReaders {
  /**
   * Repo-root-relative posix path. A TRAILING SLASH means a directory prefix; without one the entry
   * matches that file EXACTLY.
   *
   * The exact form is load-bearing, not tidiness: a bare `startsWith("CLAUDE.md")` would also claim
   * `CLAUDE.md.bak` or `CLAUDE.md.orig`, silently narrowing a path nobody measured. Matching is
   * LONGEST-FIRST, so `.claude/agents/` wins over `.claude/` regardless of the order entries are
   * written in.
   */
  readonly prefix: string;
  /** The workspace projects whose suites read it. Dependents are pnpm's job (`--filter ...<name>`). */
  readonly projects: readonly string[];
  /** Why these and no others — the measurement, so a later reader can re-run it rather than re-guess. */
  readonly reason: string;
}

/**
 * ROOT PATHS WHOSE READERS ARE PROVEN (ADR-0394, amending ADR-0304 D1).
 *
 * Fail-wide is the correct DEFAULT and is not what this weakens. What it removes is charging the
 * whole monorepo for a path whose consumers are few and KNOWN. Measured on PR #1438: a single ADR
 * body edit classified `mode=full` and ran 25 of 26 workspace projects — 14m29s in the local test
 * step alone under contention, for a file two packages read.
 *
 * HOW THE MAP WAS ESTABLISHED, AND HOW TO RE-ESTABLISH IT. Not by grep and not by intuition, both of
 * which UNDER-SELECT here — an under-selection merges untested code, so it is the one direction that
 * must not be guessed. The reader set was measured at the FILESYSTEM layer: every `node:fs` read was
 * wrapped via `NODE_OPTIONS=--import`, `pnpm -r --no-bail test` was run across all 25 projects, and
 * every read resolving inside the real docs tree was logged with its owning process.
 *
 * ⚠ THE `docs/decisions/` ENTRY IS GONE, and its absence is the decision rather than an omission
 * (ADR-0403 dec 1, whose Consequences named this). The directory no longer exists: decisions are rows,
 * so a decision edit is not a file change and affects no test scope at all. What remains mapped is
 * `docs/`, which now covers the whole tree — the measurement below is that tree's, and the two
 * projects it names still read it. Historical, kept because it is what a re-measurement is compared
 * against: the decisions entry named `@storytree/cli` and `@storytree/drive`.
 *
 *   - `@storytree/cli`   — `cli.test.ts`, `story-build.test.ts` (and, until the decision log moved,
 *                          `adr-health.test.ts`'s real-tree gate).
 *   - `@storytree/drive` — `chain-claims-drive.test.ts`, which never names the path: it calls
 *                          `storyBuild` over a tmp fixture, and `story-build.ts` resolved
 *                          `loadAdrMetas(rootDir/docs/decisions)` against the REAL repo root.
 *                          A grep for the literal path did not find this. The probe did.
 *                          (That call is now a store read; drive stays selected for `docs/`
 *                          because it stats the docs tree on the same path.)
 *
 * `apps/studio` and `packages/app-surface` are the two vitest suites; both were re-probed separately
 * (149 and 20 test files, all green) and read the tree zero times. studio is selected anyway as a
 * dependent of drive.
 *
 * THE MAP WAS WIDENED 2026-08-21 (ADR-0399) BY THE SAME PROBE, run once over EVERY root path rather
 * than over one guessed prefix: all 25 projects ran green (both vitest suites included — a suite that
 * short-circuits reads zero and is UNOBSERVED, not clean), and every read outside `packages/`/`apps/`
 * was attributed to its owning project. The entries below are that measurement. Two root paths were
 * measured and deliberately NOT added, which is the more instructive half: `scripts/**` is read by 25
 * of 25 projects (every test script preloads `scripts/tsx-cache-off.mjs`) and `tsconfig.base.json` by
 * 26 of 26, so an entry would express the full run in a longer form.
 *
 * COUNT WORK, NEVER PROJECTS — the correction inc-01 had to make to itself, and it decides which of
 * these entries is worth anything. Summed per-project test durations from the same instrumented run
 * (618.0s across 25 reporting projects; a work measure, so box contention cannot distort it):
 *
 *   `@storytree/cli` alone            1 of 26 projects   214.4s   34.7%   <- the guidance projections
 *   cli + drive                       9 of 26            533.5s   86.3%   <- docs/, docs/decisions/
 *   the seven `stories/` readers     14 of 26            591.0s   95.6%
 *
 * So the guidance-projection entries are the prize: `CLAUDE.md`, `AGENTS.md` and the five harness
 * agent directories select ONE project and cut ~65% of the test leg, on the most common non-package
 * change shape in the repo (611 path-touches across 800 commits). The `stories/` entry saves ~4.4% of
 * work and is kept for a different reason — it removes 12 projects from the set that can red a
 * story-only branch, and a narrowing makes a verdict MEAN more as well as cost less.
 *
 * WHAT THIS DOES NOT COVER, deliberately. The `check:*` rungs are not scoped by this classifier at
 * all — they run unconditionally in both `gate-order.ts` and `ci.yml` — so `check:web-grounding`,
 * which also reads the decision log, is unaffected by the map and needs no entry in it. That is also
 * why `.cursor/`, `.gemini/` and `.opencode/` measured ZERO readers: `check:agents` covers them.
 *
 * ADDING AN ENTRY IS AN ADR-0394 AMENDMENT, and it costs a measurement, not an argument.
 */
const ROOT_PATH_READERS: readonly RootPathReaders[] = [
  {
    prefix: "docs/",
    projects: ["@storytree/cli", "@storytree/drive", "@storytree/app-surface"],
    reason:
      "docs/ outside docs/decisions is read at test time by cli (a friction-inbox scan) and app-surface (a chapter-2 render-registration fixture); drive is carried because it stats the docs tree on the same path",
  },
  {
    prefix: "stories/",
    projects: [
      "studio",
      "@storytree/cli",
      "@storytree/context-traversal-capture",
      "@storytree/drive",
      "@storytree/library",
      "@storytree/model-uat-pilot",
      "@storytree/orchestrator",
    ],
    reason:
      "stories/** is read at test time by seven projects — cli's validate-corpus and the story readers, drive/orchestrator's build paths, library, capture, model-uat-pilot, and studio — and by no other",
  },
  // THE GENERATED GUIDANCE PROJECTIONS. These move together, whenever an agent artifact is edited
  // and `build:guidance` / `build:agents` are re-run — 611 path-touches across 800 commits, the
  // single most common non-package change shape in the repo — and every one of them bought the
  // whole monorepo until now.
  {
    prefix: "CLAUDE.md",
    projects: ["@storytree/cli"],
    reason: "CLAUDE.md is read at test time by cli alone (the guidance-projection suites)",
  },
  {
    prefix: "AGENTS.md",
    projects: ["@storytree/cli"],
    reason: "AGENTS.md is read at test time by cli alone (the guidance-projection suites)",
  },
  {
    prefix: ".claude/agents/",
    projects: ["@storytree/cli"],
    reason:
      ".claude/agents/** — the Claude harness projection — is read at test time by cli alone (build-agents, guidance-verb-ordering, projection-drift-diagnosis)",
  },
  {
    prefix: ".codex/",
    projects: ["@storytree/cli"],
    reason: ".codex/agents/** — the Codex harness projection — is read at test time by cli alone",
  },
  // ZERO MEASURED READERS, MAPPED UP RATHER THAN DOWN. The probe recorded no test-time read of these
  // three at all — `check:agents` covers them, and it is an unconditional gate step this classifier
  // never scopes. They are mapped to cli anyway, which is OVER-selection and therefore safe, rather
  // than to an empty project list. That choice is the answer to the "a path with no readers cannot
  // be expressed" gap, and it is deliberate: an empty scope would be a SECOND terminal state that
  // runs nothing, whose failure mode is a branch gating green having tested nothing, and the measured
  // payoff for it is nil — every root path with genuinely zero test readers (README.md,
  // .editorconfig, .env.example, .nvmrc, .gitattributes) changed at most ONCE in 800 commits, and
  // these three never appear in a commit without `.claude/` or CLAUDE.md beside them anyway.
  {
    prefix: ".cursor/",
    projects: ["@storytree/cli"],
    reason:
      ".cursor/agents/** is written by cli's build-agents and read by no test; mapped to its writer rather than to an empty scope",
  },
  {
    prefix: ".gemini/",
    projects: ["@storytree/cli"],
    reason:
      ".gemini/agents/** is written by cli's build-agents and read by no test; mapped to its writer rather than to an empty scope",
  },
  {
    prefix: ".opencode/",
    projects: ["@storytree/cli"],
    reason:
      ".opencode/agent/** is written by cli's build-agents and read by no test; mapped to its writer rather than to an empty scope",
  },
  {
    prefix: ".claude/",
    projects: ["@storytree/cli", "@storytree/drive"],
    reason:
      ".claude/settings*.json is read at test time by cli and by drive (the write-authority and noticeboard suites); the agents subtree is narrower and matches first",
  },
];

/**
 * The map entry that governs `file`, or undefined when none does (→ the fail-wide default).
 *
 * LONGEST MATCH WINS, computed rather than relying on the order entries happen to be written in.
 * `.claude/agents/` and `.claude/` name different reader sets, and a first-match-wins scan would
 * silently hand a file the wider set the day someone re-sorted the array. (`docs/decisions/` over
 * `docs/` was the original worked example; it stopped being one when that entry went, but the rule
 * it illustrated is unchanged and any future nested pair depends on it.) An entry WITHOUT a
 * trailing slash matches its path exactly — never
 * as a string prefix, which would let `CLAUDE.md.bak` inherit `CLAUDE.md`'s measured readers.
 */
function readerMapEntryFor(file: string): RootPathReaders | undefined {
  let best: RootPathReaders | undefined;
  for (const entry of ROOT_PATH_READERS) {
    const hit = entry.prefix.endsWith("/") ? file.startsWith(entry.prefix) : file === entry.prefix;
    if (hit && (best === undefined || entry.prefix.length > best.prefix.length)) best = entry;
  }
  return best;
}

/**
 * Scan the workspace for projects: every `<root>/<dir>/package.json` under {@link WORKSPACE_ROOTS}
 * with a string `name`. Dirs without a readable manifest are skipped (classification then treats
 * their files as unmapped → FULL, the conservative direction).
 */
export function discoverWorkspaceProjects(repoRoot: string): WorkspaceProject[] {
  const projects: WorkspaceProject[] = [];
  for (const root of WORKSPACE_ROOTS) {
    let entries;
    try {
      entries = readdirSync(path.join(repoRoot, root), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(
          readFileSync(path.join(repoRoot, root, entry.name, "package.json"), "utf8"),
        ) as { name?: unknown };
        if (typeof manifest.name === "string" && manifest.name !== "") {
          projects.push({ name: manifest.name, dir: `${root}/${entry.name}` });
        }
      } catch {
        // No manifest / unparseable → not a project; its files classify as unmapped.
      }
    }
  }
  return projects.sort((a, b) => (a.dir < b.dir ? -1 : 1));
}

/** Classify a PR's changed files against the workspace projects — see the header for the rules. */
export function classifyChangedFiles(
  changedFiles: string[],
  projects: WorkspaceProject[],
): AffectedScope {
  const files = changedFiles
    .map((f) => f.replace(/\\/g, "/").replace(/^\.\//, "").trim())
    .filter((f) => f !== "");
  if (files.length === 0) {
    return { mode: "full", reason: "empty change set (unexpected) — running the full suite" };
  }
  const selected = new Set<string>();
  let viaReaderMap = 0;
  for (const file of files) {
    if (file === "package.json" || file.endsWith("/package.json")) {
      return { mode: "full", reason: `${file}: a package manifest is an input of the selection graph itself` };
    }
    if (file.startsWith(CORPUS_SEED_DIR)) {
      return { mode: "full", reason: `${file}: the studio data dir is read across package boundaries by no declared edge` };
    }
    const owner = projects.find((p) => file.startsWith(`${p.dir}/`));
    if (owner === undefined) {
      // A root path the pnpm graph cannot see. It narrows only if its readers were MEASURED
      // (ADR-0394); otherwise the fail-wide default stands, unchanged.
      const readers = readerMapEntryFor(file);
      if (readers === undefined) {
        return { mode: "full", reason: `${file}: outside the workspace dependency graph` };
      }
      // The map names package NAMES, and a rename would silently turn a narrow scope into an empty
      // one. Fail wide instead — the map having gone stale is exactly when it must not be trusted.
      const missing = readers.projects.filter((name) => !projects.some((p) => p.name === name));
      if (missing.length > 0) {
        return {
          mode: "full",
          reason: `${file}: the reader map names ${missing.join(", ")}, absent from this workspace`,
        };
      }
      for (const name of readers.projects) selected.add(name);
      viaReaderMap += 1;
      continue;
    }
    selected.add(owner.name);
  }
  return {
    mode: "affected",
    projects: [...selected].sort(),
    reason:
      viaReaderMap === 0
        ? `all ${files.length} changed file(s) map to workspace projects`
        : `all ${files.length} changed file(s) map to workspace projects (${viaReaderMap} via the root-path reader map)`,
  };
}

/** Package names we are willing to splice into a workflow `run:` line unquoted. */
const SAFE_NAME = /^[A-Za-z0-9@/_.-]+$/;

/**
 * Render the scope as the argument string CI splices between `pnpm` and `typecheck`/`test`:
 * `-r` for a full run, else a `--filter "...<name>"` chain (dependents-inclusive). A name that
 * would need shell quoting falls back to `-r` — full is always safe.
 */
export function pnpmArgsFor(scope: AffectedScope): string {
  if (scope.mode === "full") return "-r";
  if (scope.projects.length === 0 || scope.projects.some((n) => !SAFE_NAME.test(n))) return "-r";
  return scope.projects.map((n) => `--filter ...${n}`).join(" ");
}
