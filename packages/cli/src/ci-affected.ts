// Affected-only PR test scope (ADR-0195, amends ADR-0022): the PURE classification logic behind
// `pnpm ci:affected` (ci-affected-main.ts is the thin CI shell). Given the PR's changed-file set and
// the workspace project list, decide whether CI may narrow `pnpm -r typecheck` / `pnpm -r test` to
// the changed projects PLUS their dependents (`--filter "...<name>"` — pnpm expands the dependents
// from the real workspace graph), or must run the full `-r` suite.
//
// The rules are deliberately CONSERVATIVE — anything the pnpm dependency graph cannot see forces the
// full run:
//  - A file outside `packages/*` / `apps/*` (stories/**, scripts/**, .github/**, pnpm-lock.yaml,
//    root tsconfig/package.json, CLAUDE.md, the `web` gitlink, …) → FULL. Several package test
//    suites read these root paths directly (cli's validate-corpus over stories/**, drive's
//    node-build tests over stories/**), and the pnpm graph cannot see any of it.
//    THE ONE EXCEPTION is {@link ROOT_PATH_READERS} (ADR-0394): a root path whose test-time readers
//    have been established MECHANICALLY narrows to those readers plus their dependents instead of
//    to everything. It is an exception to the ANSWER, never to the burden of proof — a root path
//    with no measured reader set is not in the map and still fails wide.
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
  /** Repo-root-relative posix prefix. The trailing slash makes it a DIRECTORY match, never a string one. */
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
 * every read resolving inside the real `docs/decisions` tree was logged with its owning process.
 * Two packages appeared and no others:
 *
 *   - `@storytree/cli`   — `adr-health.test.ts` (the `adr-number-unique` gate and the frontmatter
 *                          scans), `cli.test.ts`, and `story-build.test.ts`.
 *   - `@storytree/drive` — `chain-claims-drive.test.ts`, which never names the path: it calls
 *                          `storyBuild` over a tmp fixture, and `story-build.ts` resolves
 *                          `loadAdrMetas(rootDir/docs/decisions)` against the REAL repo root.
 *                          A grep for the literal path does not find this. The probe did.
 *
 * `apps/studio` and `packages/app-surface` are the two vitest suites; both were re-probed separately
 * (149 and 20 test files, all green) and read the tree zero times. studio is selected anyway as a
 * dependent of drive.
 *
 * WHAT THIS DOES NOT COVER, deliberately. The `check:*` rungs are not scoped by this classifier at
 * all — they run unconditionally in both `gate-order.ts` and `ci.yml` — so `check:web-grounding`,
 * which also reads `docs/decisions`, is unaffected by the map and needs no entry in it.
 *
 * ADDING AN ENTRY IS AN ADR-0394 AMENDMENT, and it costs a measurement, not an argument.
 */
const ROOT_PATH_READERS: readonly RootPathReaders[] = [
  {
    prefix: "docs/decisions/",
    projects: ["@storytree/cli", "@storytree/drive"],
    reason:
      "docs/decisions/** is read at test time by cli (the adr-health gates) and drive (story-build's ADR scan), and by no other project",
  },
];

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
      const readers = ROOT_PATH_READERS.find((r) => file.startsWith(r.prefix));
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
