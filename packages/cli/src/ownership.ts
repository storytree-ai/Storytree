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
 * every non-test `.ts`/`.tsx`/`.mts`/`.cts`/`.mjs`/`.cjs` file under `packages/*` and `apps/*` and the
 * judge names each one that falls under no declared subtree.
 *
 * THE APERTURE WIDENED ONCE, DELIBERATELY (`ownership-walk-extension-aperture`, 2026-08-18). The walk
 * originally covered only `.ts`/`.tsx`, which made it blind to `.mts`/`.cts`/`.mjs` source — a file
 * added or edited in one of those extensions was invisible to `check:ownership-totality` even though
 * that rung blocks on this walk's output. The extension set now matches "source, not test" rather than
 * "TypeScript, not JavaScript": `.mts`/`.cts` are real source on the same terms as `.ts`/`.tsx`; `.mjs`
 * harness entrypoints and e2e specs are executed code and belong in too. `.d.ts` declaration files were
 * NEVER excluded here (only the `.test.ts`/`.test.tsx` suffix is), so `.d.mts`/`.d.cts` are included on
 * the same precedent — excluding them now would be the inconsistent move, not the consistent one. The
 * original denominator deliberately matched the one `first-class-edges-arc` measured (519 files at HEAD
 * `7115c899`); this aperture change moved it again, on purpose, per ADR-0269 ("a drain ceiling rises
 * only when the measured population enlarges") — read the CURRENT number from `repo-manifest.json` →
 * `sourceOwnership.baseline`, never from this comment, which will drift the moment the map is re-walked.
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

import { readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { readSourceOwnershipMap } from "@storytree/drive";

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
  /** Story id → the unit ids it declares — classifies each story-grain declaration. */
  readonly unitsByStory?: ReadonlyMap<string, readonly string[]>;
  readonly baseline?: OwnershipBaseline;
}

/** Pure-by-injection: the command takes its facts, so it is offline-testable with a fixture. */
export interface OwnershipDeps {
  readonly gather: () => OwnershipFacts;
}

/**
 * Every extension the totality rule treats as "source" — TypeScript AND JavaScript, ESM and CJS
 * module-scoped variants included. `.d.ts`/`.d.mts`/`.d.cts` are not listed separately: they end in
 * one of these suffixes and are never excluded, matching the walk's original (undocumented-until-now)
 * treatment of `.d.ts`.
 */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

/**
 * Is this a source file the totality rule covers? Tests are excluded for every extension — mirroring
 * the original `.test.ts`/`.test.tsx` exclusion — declaration files (`.d.ts`, `.d.mts`, `.d.cts`, …)
 * are not.
 */
function isSourceFile(name: string): boolean {
  for (const ext of SOURCE_EXTENSIONS) {
    if (!name.endsWith(ext)) continue;
    return !name.endsWith(`.test${ext}`);
  }
  return false;
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
 * DELEGATED, not re-implemented: `readSourceOwnershipMap` in `@storytree/drive` is the ONE reader of
 * this block, because the claim namespace turns the same declarations into claimable objects
 * (ADR-0317 D3, `claim-universe.ts`) and two readers could disagree about what is declared. It lives
 * in `drive` only because `cli` may import `drive` and never the reverse; this remains the report's
 * gatherer.
 *
 * DECLARATIONS ARE DISJOINT, so order carries no meaning here — corrected in place 2026-08-06 after
 * the map was authored in full. The earlier guidance said to declare a specific subtree before a
 * broader one, but {@link judgeSourceOwnership} collects EVERY match and reports a second as
 * CONTESTED regardless of key order, so that shape would have lit the warning permanently over 350+
 * files and destroyed the one signal separating an authoring mistake from a design choice. The
 * manifest's own `$comment` carries the authoring rules.
 *
 * An unreadable map yields an EMPTY declaration list here, which the report renders as "everything
 * unowned" — loud, and the right answer for an instrument whose job is naming what is undeclared.
 * The claim namespace reads the same failure the opposite way and stands down; see that module.
 */
export function gatherDeclarations(repoRoot: string): {
  declarations: SubtreeDeclaration[];
  baseline: OwnershipBaseline | undefined;
} {
  const map = readSourceOwnershipMap(join(repoRoot, "repo-manifest.json"));
  return {
    declarations: map.subtrees.map((d) => ({ subtree: d.subtree, owner: d.owner })),
    baseline: map.baseline,
  };
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
export function gatherUnitIds(repoRoot: string): {
  knownUnitIds: string[];
  storyIds: string[];
  /**
   * Story id → the unit ids it declares. What lets the report say WHY a story-grain declaration is
   * at story grain: a story declaring NO units has nothing finer to name (the root-port case), while
   * one that declares capabilities may have a finer owner already sitting there.
   */
  unitsByStory: Map<string, string[]>;
} {
  const storiesDir = join(repoRoot, "stories");
  const knownUnitIds = new Set<string>();
  const storyIds: string[] = [];
  const unitsByStory = new Map<string, string[]>();
  if (!existsSync(storiesDir)) return { knownUnitIds: [], storyIds: [], unitsByStory };

  for (const ent of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const storyDir = join(storiesDir, ent.name);
    if (!existsSync(join(storyDir, "story.md"))) continue;
    storyIds.push(ent.name);
    knownUnitIds.add(ent.name);
    const units: string[] = [];
    for (const unit of readdirSync(storyDir, { withFileTypes: true })) {
      if (!unit.isFile() || !unit.name.endsWith(".md") || unit.name === "story.md") continue;
      const id = unit.name.slice(0, -".md".length);
      knownUnitIds.add(id);
      units.push(id);
    }
    unitsByStory.set(ent.name, units.sort());
  }
  return { knownUnitIds: [...knownUnitIds].sort(), storyIds: storyIds.sort(), unitsByStory };
}

/** Gather every fact from a real checkout. */
export function gatherFromDisk(repoRoot: string): OwnershipFacts {
  const { declarations, baseline } = gatherDeclarations(repoRoot);
  const { knownUnitIds, storyIds, unitsByStory } = gatherUnitIds(repoRoot);
  return {
    files: gatherSourceFiles(repoRoot),
    declarations,
    knownUnitIds,
    storyIds,
    unitsByStory,
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
    ...(facts.unitsByStory !== undefined ? { unitsByStory: facts.unitsByStory } : {}),
    // A baseline measured over the WHOLE tree cannot be compared against one package's slice.
    ...(facts.baseline !== undefined && options.pkg === undefined ? { baseline: facts.baseline } : {}),
  });

  const body = formatSourceOwnershipReport(report, options);
  const next = [
    "storytree ownership --all",
    "storytree ownership packages/cli",
    // Every key in this map is a claim id (ADR-0317 D3) — quoted, because a glob key would
    // otherwise be expanded by the shell before storytree saw it.
    "storytree noticeboard claim '<subtree-key>' --grade work --pg",
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
      "",
      "Every KEY in that map is also a CLAIM id (ADR-0317 D3) — claim the subtree you are writing",
      "with `storytree noticeboard claim '<subtree-key>' --grade work --pg`, exactly as keyed and",
      "quoted. A claim on the subtree does not contend with one on its declared owner.",
    ].join("\n"),
    next: ["storytree ownership", "storytree ownership --all"],
  };
}
