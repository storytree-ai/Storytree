/**
 * `pnpm check:boundaries` — the organism-boundary gate (ADR-0074). Sibling to
 * `scripts/check-manifest.mjs`, wired into `pnpm gate` and the CI `verify` job.
 *
 * It gathers the inputs from disk and hands them to the pure {@link checkBoundaries} judge
 * ({@link file://./boundaries.ts}):
 *   1. the package↔story ownership map (repo-manifest.json `packageOwnership`: organisms + the
 *      foundational subset — ADR-0075 collapsed the substrate class, so the ports base/verdict-contract
 *      are now ordinary root organisms held minimal, not an exempt class),
 *   2. the real runtime cross-package dependency graph (each `packages/<x>/package.json`
 *      `dependencies`; `devDependencies` are EXCLUDED — a test reusing another organism's parity
 *      suite is scaffolding, never a dependency edge, ADR-0010 §5),
 *   3. the declared cross-story edges of every `stories/<x>/story.md` (via the canonical
 *      `loadNodeSpec`): the consumer-side `depends_on` AND the provider-side `consumed_by`
 *      (ADR-0074 §4) — a code edge is covered when EITHER endpoint declares it.
 *   4. every cross-package import in `packages/<x>/src/**.ts` (the v2 source-import scan, ADR-0074
 *      §"does NOT decide"): the raw findings, classified by the pure judge into the relative-escape
 *      (Gap A') and devDep-evasion (Gap B') rules.
 *
 * Exits non-zero listing every violation, so an undeclared cross-organism coupling (Gap A) — or a
 * cross-story cycle (ADR-0058), or a relative-import / devDep escape — fails the gate. Because the
 * studio forest renders `depends_on`, forcing every code edge to be a declared edge also keeps the
 * coupling UI-visible (Gap B).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { loadNodeSpec } from "@storytree/orchestrator";

import { checkBoundaries, extractImports, type Ownership, type SourceImport } from "./boundaries.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const STORYTREE_SCOPE = "@storytree/";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** The runtime @storytree/* dependencies of every workspace package under packages/*. */
function readPackageDeps(): Record<string, string[]> {
  const packagesDir = join(repoRoot, "packages");
  const graph: Record<string, string[]> = {};
  for (const ent of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const pkgFile = join(packagesDir, ent.name, "package.json");
    if (!existsSync(pkgFile)) continue;
    const pkg = readJson(pkgFile);
    const name = typeof pkg.name === "string" ? pkg.name : null;
    if (name === null || !name.startsWith(STORYTREE_SCOPE)) continue;
    const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
    graph[name] = Object.keys(deps)
      .filter((d) => d.startsWith(STORYTREE_SCOPE) && d !== name)
      .sort();
  }
  return graph;
}

/**
 * Every story's declared cross-story edges (id = the stories/<dir> name, matching the forest):
 * the consumer-side `depends_on` and the provider-side `consumed_by` (ADR-0074 §4).
 */
function readStoryGraphs(): {
  storyGraph: Record<string, string[]>;
  consumedBy: Record<string, string[]>;
} {
  const storiesDir = join(repoRoot, "stories");
  const storyGraph: Record<string, string[]> = {};
  const consumedBy: Record<string, string[]> = {};
  if (!existsSync(storiesDir)) return { storyGraph, consumedBy };
  for (const ent of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const storyFile = join(storiesDir, ent.name, "story.md");
    if (!existsSync(storyFile)) continue;
    const spec = loadNodeSpec(storyFile);
    storyGraph[ent.name] = spec.dependsOn;
    consumedBy[ent.name] = spec.consumedBy;
  }
  return { storyGraph, consumedBy };
}

/** Every `.ts` file under a directory, recursively (repo-relative POSIX paths). */
function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTs(full));
    else if (ent.isFile() && ent.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * Every cross-package import found in `packages/<x>/src` (the v2 source-import scan). Emits a record
 * for EVERY `.ts` file — test files included — so the pure judge owns (and unit-tests) the sanctioned
 * scaffolding skip ({@link isTestScaffolding}). The judge also ignores same-package and substrate
 * specifiers, so we keep the gather dumb and total.
 */
function readSourceImports(): SourceImport[] {
  const packagesDir = join(repoRoot, "packages");
  const imports: SourceImport[] = [];
  for (const ent of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const pkgFile = join(packagesDir, ent.name, "package.json");
    const srcDir = join(packagesDir, ent.name, "src");
    if (!existsSync(pkgFile) || !existsSync(srcDir)) continue;
    const name = readJson(pkgFile).name;
    if (typeof name !== "string" || !name.startsWith(STORYTREE_SCOPE)) continue;
    for (const full of walkTs(srcDir)) {
      const file = relative(repoRoot, full).split(sep).join("/");
      for (const { specifier, typeOnly } of extractImports(readFileSync(full, "utf8"))) {
        imports.push({ importer: name, file, specifier, typeOnly });
      }
    }
  }
  return imports;
}

function readOwnership(): Ownership {
  const manifest = readJson(join(repoRoot, "repo-manifest.json"));
  const po = (manifest.packageOwnership ?? {}) as Record<string, unknown>;
  return {
    organisms: (po.organisms ?? {}) as Record<string, string>,
    foundational: (po.foundational ?? []) as string[],
  };
}

function main(): void {
  const { storyGraph, consumedBy } = readStoryGraphs();
  const { violations } = checkBoundaries({
    ownership: readOwnership(),
    packageDeps: readPackageDeps(),
    storyGraph,
    consumedBy,
    sourceImports: readSourceImports(),
  });
  if (violations.length > 0) {
    console.error(`✗ organism boundary (ADR-0074): ${violations.length} violation(s)`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error(
      "\nThe cross-organism code graph must be a subgraph of the declared cross-story depends_on " +
        "graph.\nDeclare the edge in the owning story (it then shows in the forest) or remove the coupling.",
    );
    process.exit(1);
  }
  console.log("✓ organism boundary (ADR-0074): the code dependency graph matches the declared story graph");
}

main();
