/**
 * `storytree ownership` — the SOURCE-OWNERSHIP report (ADR-0317 D2), and the disk-walk half of the
 * totality check.
 *
 * The judge is pure and lives next door ({@link file://./source-ownership.ts}); this module is the
 * gatherer — the same split `check-boundaries.ts` / `boundaries.ts` uses, and for the same reason:
 * the rule set stays exhaustively unit-testable offline while the I/O glue stays dumb and total.
 *
 * THE WALK IS THE POINT. `packageOwnership` does not decay because a procedure walks the disk and
 * demands every package be classified. The map one grain down had no such procedure, so it did not
 * decay either — it never existed. {@link gatherSourceFiles} is that missing procedure: it enumerates
 * every non-test `.ts`/`.tsx` under `packages/*` and `apps/*` and the judge names each one that falls
 * under no declared subtree. The denominator deliberately matches the one `first-class-edges-arc`
 * measured (519 files at HEAD `7115c899`), so this report's numbers are comparable with the arc's
 * rather than a fresh measure nobody can line up against.
 *
 * REPORT-ONLY: the envelope is `ok: true` even when most of the tree is unowned. That is not
 * softness — at authoring the map is a hand-verified seed, so a blocking rung would red the repo on
 * day one (ADR-0310 D3, carried forward by ADR-0317 D2). ADR-0311 retired sixteen gate rungs for want
 * of evidence; a blocking version of this must earn its place on this report's own numbers first,
 * which is why the trend line exists.
 *
 * OFFLINE and read-only: disk only. No DB, no `--pg`, no spend.
 *
 * WHAT IT DOES NOT READ. Not `proof.real.sourceFile` and not `scope.sourceGlobs` — the first is a
 * unit→file build target that cannot be inverted into ownership, the second is a write fence broader
 * than what a unit owns (ADR-0317 D1). Both are untouched, so the prove-it-gate carries zero risk
 * from this command.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { Envelope } from "./envelope.js";
import {
  formatSourceOwnershipReport,
  judgeSourceOwnership,
  type FormatOptions,
  type OwnershipBaseline,
  type SubtreeDeclaration,
} from "./source-ownership.js";

/** Build output and vendored trees — never source anyone owns. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vite",
  "playwright-report",
  "test-results",
]);

/** The workspace roots the totality rule covers. */
const SOURCE_ROOTS = ["packages", "apps"];

/** Everything the judge needs, gathered from disk (or supplied by a fixture in tests). */
export interface OwnershipFacts {
  readonly files: readonly string[];
  readonly declarations: readonly SubtreeDeclaration[];
  readonly knownUnitIds: readonly string[];
  readonly storyIds: readonly string[];
  readonly baseline?: OwnershipBaseline;
}

/** Pure-by-injection: the command takes its facts, so it is offline-testable with a fixture. */
export interface OwnershipDeps {
  readonly gather: () => OwnershipFacts;
}

/** Is this a source file the totality rule covers? Tests are excluded; `.d.ts` is not. */
function isSourceFile(name: string): boolean {
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

/** Every source file under `dir`, recursively, as repo-relative POSIX paths. */
function walk(repoRoot: string, dir: string, out: string[]): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(repoRoot, join(dir, ent.name), out);
    } else if (ent.isFile() && isSourceFile(ent.name)) {
      out.push(relative(repoRoot, join(dir, ent.name)).split(sep).join("/"));
    }
  }
}

/** THE DISK WALK — the procedure that makes the declared map falsifiable. */
export function gatherSourceFiles(repoRoot: string): string[] {
  const out: string[] = [];
  for (const root of SOURCE_ROOTS) {
    const full = join(repoRoot, root);
    if (existsSync(full)) walk(repoRoot, full, out);
  }
  return out.sort();
}

/**
 * The declared map, read from `repo-manifest.json` `sourceOwnership.subtrees`.
 *
 * DECLARATION ORDER IS SIGNIFICANT and is the JSON's key order: the first matching entry wins, so a
 * specific subtree must be declared before a broader one that also covers it. The judge reports every
 * overlap regardless, so a mis-ordering surfaces rather than silently re-attributing files.
 */
export function gatherDeclarations(repoRoot: string): {
  declarations: SubtreeDeclaration[];
  baseline: OwnershipBaseline | undefined;
} {
  const file = join(repoRoot, "repo-manifest.json");
  if (!existsSync(file)) return { declarations: [], baseline: undefined };
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const block = (manifest["sourceOwnership"] ?? {}) as Record<string, unknown>;
  const subtrees = (block["subtrees"] ?? {}) as Record<string, unknown>;

  const declarations: SubtreeDeclaration[] = [];
  for (const [subtree, owner] of Object.entries(subtrees)) {
    if (subtree.startsWith("$") || typeof owner !== "string") continue;
    declarations.push({ subtree, owner });
  }

  const raw = block["baseline"];
  let baseline: OwnershipBaseline | undefined;
  if (raw !== null && typeof raw === "object") {
    const b = raw as Record<string, unknown>;
    if (typeof b["date"] === "string" && typeof b["files"] === "number" && typeof b["unowned"] === "number") {
      baseline = { date: b["date"], files: b["files"], unowned: b["unowned"] };
    }
  }
  return { declarations, baseline };
}

/**
 * The addressable-object namespace, read off the disk-canonical hierarchy by the filename convention
 * (`stories/<story>/story.md` is the story id; every other `<unit>.md` beside it is a unit id) — the
 * same convention `storytree coverage` resolves against.
 *
 * DELIBERATELY ADVISORY. The typed, resolvable claim namespace is ADR-0310 D2's job (increment 2, a
 * sibling session); this report does not wait on it and does not pretend to be it. It answers only
 * "does this declared owner name anything at all", which is what makes a phantom owner visible
 * without asserting the stronger property increment 2 will own.
 */
export function gatherUnitIds(repoRoot: string): { knownUnitIds: string[]; storyIds: string[] } {
  const storiesDir = join(repoRoot, "stories");
  const knownUnitIds = new Set<string>();
  const storyIds: string[] = [];
  if (!existsSync(storiesDir)) return { knownUnitIds: [], storyIds: [] };

  for (const ent of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const storyDir = join(storiesDir, ent.name);
    if (!existsSync(join(storyDir, "story.md"))) continue;
    storyIds.push(ent.name);
    knownUnitIds.add(ent.name);
    for (const unit of readdirSync(storyDir, { withFileTypes: true })) {
      if (!unit.isFile() || !unit.name.endsWith(".md") || unit.name === "story.md") continue;
      knownUnitIds.add(unit.name.slice(0, -".md".length));
    }
  }
  return { knownUnitIds: [...knownUnitIds].sort(), storyIds: storyIds.sort() };
}

/** Gather every fact from a real checkout. */
export function gatherFromDisk(repoRoot: string): OwnershipFacts {
  const { declarations, baseline } = gatherDeclarations(repoRoot);
  const { knownUnitIds, storyIds } = gatherUnitIds(repoRoot);
  return {
    files: gatherSourceFiles(repoRoot),
    declarations,
    knownUnitIds,
    storyIds,
    ...(baseline !== undefined ? { baseline } : {}),
  };
}

/**
 * `storytree ownership [--all] [--package <p>]` — render the report.
 *
 * Envelope `ok` is TRUE regardless of how much is unowned: this REPORTS, it does not gate. The one
 * false case is a checkout with no source files at all, which means the walk found nothing and the
 * report would be a vacuous green over an empty denominator.
 */
export function ownershipCommand(deps: OwnershipDeps, options: FormatOptions & { pkg?: string } = {}): Envelope {
  const facts = deps.gather();

  if (facts.files.length === 0) {
    return {
      ok: false,
      body:
        "no source files found under packages/ or apps/ — the disk walk came back empty, so any " +
        "coverage verdict would be vacuous. Is this a storytree checkout?",
      next: ["storytree doctor"],
    };
  }

  // A package filter narrows BOTH sides, so the percentages stay honest for the slice being read.
  const files =
    options.pkg === undefined
      ? facts.files
      : facts.files.filter((f) => f === options.pkg || f.startsWith(`${options.pkg}/`));

  if (options.pkg !== undefined && files.length === 0) {
    return {
      ok: false,
      body: `no source files under "${options.pkg}". Pass a workspace path like packages/cli or apps/studio.`,
      next: ["storytree ownership"],
    };
  }

  const report = judgeSourceOwnership({
    files,
    declarations: facts.declarations,
    knownUnitIds: facts.knownUnitIds,
    storyIds: facts.storyIds,
    // A baseline measured over the WHOLE tree cannot be compared against one package's slice.
    ...(facts.baseline !== undefined && options.pkg === undefined ? { baseline: facts.baseline } : {}),
  });

  const body = formatSourceOwnershipReport(report, options);
  const next = [
    "storytree ownership --all",
    "storytree ownership packages/cli",
    "storytree library artifact capability-coverage-report-and-claimable-substrate --pg",
  ];
  return { ok: true, body, next };
}

/** The operator-facing help. */
export function ownershipHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree ownership — which source subtrees carry a declared owner (ADR-0317 D2)",
      "",
      "  storytree ownership                  the summary + the unowned-subtree backlog",
      "  storytree ownership --all            every unowned file, grouped by subtree",
      "  storytree ownership <package-path>   narrow to one workspace package",
      "",
      "REPORT ONLY — it names what is undeclared and fails nothing. The map is",
      "`repo-manifest.json` → `sourceOwnership.subtrees` (globs permitted; it binds no verdict).",
      "It does NOT read `proof.real.sourceFile` or `scope.sourceGlobs`, which are a build target",
      "and a write fence — not ownership (ADR-0317 D1).",
    ].join("\n"),
    next: ["storytree ownership", "storytree ownership --all"],
  };
}
