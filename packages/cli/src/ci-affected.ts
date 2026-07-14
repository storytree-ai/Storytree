// Affected-only PR test scope (ADR-0195, amends ADR-0022): the PURE classification logic behind
// `pnpm ci:affected` (ci-affected-main.ts is the thin CI shell). Given the PR's changed-file set and
// the workspace project list, decide whether CI may narrow `pnpm -r typecheck` / `pnpm -r test` to
// the changed projects PLUS their dependents (`--filter "...<name>"` — pnpm expands the dependents
// from the real workspace graph), or must run the full `-r` suite.
//
// The rules are deliberately CONSERVATIVE — anything the pnpm dependency graph cannot see forces the
// full run:
//  - A file outside `packages/*` / `apps/*` (docs/decisions/**, stories/**, scripts/**, .github/**,
//    pnpm-lock.yaml, root tsconfig/package.json, CLAUDE.md, the `web` gitlink, …) → FULL. Several
//    package test suites read these root paths directly (cli's validate-corpus over stories/**, the
//    adr-health gates over docs/decisions/**, drive's node-build tests over stories/**).
//  - `apps/studio/data/**` (the corpus seed) → FULL, even though it sits inside an app: library's
//    store.test.ts and cli's corpus-build-check / surface-coverage tests read it across package
//    boundaries, which no dependency edge declares.
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

/** The corpus seed dir read across package boundaries by library + cli tests (trailing slash = prefix match). */
const CORPUS_SEED_DIR = "apps/studio/data/";

/** The workspace roots — mirrors pnpm-workspace.yaml's globs (that file is root-scoped, so a change to it forces FULL before this list could go stale). */
const WORKSPACE_ROOTS = ["packages", "apps"] as const;

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
  for (const file of files) {
    if (file === "package.json" || file.endsWith("/package.json")) {
      return { mode: "full", reason: `${file}: a package manifest is an input of the selection graph itself` };
    }
    if (file.startsWith(CORPUS_SEED_DIR)) {
      return { mode: "full", reason: `${file}: the corpus seed is read across package boundaries by library + cli tests` };
    }
    const owner = projects.find((p) => file.startsWith(`${p.dir}/`));
    if (owner === undefined) {
      return { mode: "full", reason: `${file}: outside the workspace dependency graph` };
    }
    selected.add(owner.name);
  }
  return {
    mode: "affected",
    projects: [...selected].sort(),
    reason: `all ${files.length} changed file(s) map to workspace projects`,
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
