/**
 * The organism-boundary analyser (ADR-0074). PURE — no I/O. The `check:boundaries` script
 * ({@link file://./check-boundaries.ts}) gathers the inputs from disk (package.json dep graph +
 * each story's `depends_on`/`consumed_by` + the ownership map); this module just JUDGES them, so
 * the rule set is exhaustively unit-testable offline.
 *
 * The invariant it gates (ADR-0010 §3/§4, ADR-0058, ADR-0068, ADR-0074): every real cross-organism
 * CODE dependency edge must be COVERED by a declaration on one of its endpoints — consumer-side in
 * the consumer's `depends_on`, OR provider-side in the provider's `consumed_by` — with a small
 * blessed set of shared substrate/ports always allowed. Because the studio forest renders
 * `depends_on`, declaring every code edge also makes it UI-visible (one rule, both gaps).
 *
 * **The source-import scan (ADR-0074 §"does NOT decide" → the v2 import scan).** The dep-graph rule
 * above reads `package.json` `dependencies`, which two couplings slip past:
 *   - **(a) the cross-package RELATIVE-import escape** — `import … from "../../<other>/src/foo.js"`
 *     sidesteps BOTH the `package.json` declaration AND the `exports` barrel (which only blocks
 *     `@storytree/x/src/…` subpath imports, not relative paths). The scan flags any relative import in
 *     a package's source that escapes its own package dir.
 *   - **(b) the devDep-evasion** — a RUNTIME (non-test) source file value-importing `@storytree/x`
 *     where `x` is only a `devDependency` (or undeclared), so it never appears in the runtime dep
 *     graph yet is a real runtime coupling. The scan flags it.
 * Test files (`*.test.ts`) and parity suites are sanctioned scaffolding (ADR-0010 §5) and are
 * skipped, so the existing test-only parity reuses (proof-protocol↔library, store→orchestrator,
 * base `./parity`) are never flagged. Type-only imports (`import type …`) are erased and are not
 * runtime couplings, so rule (b) skips them.
 *
 * **One class + the foundational subset, ADR-0075 (collapse the substrate class).** Earlier
 * increments carried a second `substrate` class for the shared ports (`base`/`proof-protocol`):
 * anyone could depend on them with NO declared edge (an EXEMPTION). ADR-0075 removes that exemption —
 * the same "visibility over exemption" call ADR-0074 §2 made for the cli/store hubs. There is now
 * ONE package class: `organism` (every package, the ports included, is owned by exactly one story,
 * and the boundary rule applies between all of them). The ports are ordinary **root organisms** —
 * each owns a story with `depends_on: []` (or `[proof-protocol]`), and every consumer DECLARES the
 * edge exactly like the `library` trunk — so a dependency on a port is a VISIBLE declared+rendered
 * edge, not an invisible exemption. To keep the ports browser-safe (zod-only, no node/pg) the
 * manifest still marks them as the `foundational` subset, carrying ONE explicit minimality rule: a
 * foundational organism may only depend on other foundational organisms — an offline, fast-fail
 * browser-safety canary, belt-and-suspenders over acyclicity (the ports are bottom sinks, so any
 * port→organism reach already closes a cycle) and over the studio browser build (the real backstop
 * for the external node-only npm imports the gate cannot see).
 */

/**
 * Two package classes (ADR-0075 collapsed the substrate class — the ports are organisms too; ADR-0100
 * added `surface`). An `organism` is a reusable `packages/*` bounded context owned by one story; a
 * `surface` is a CONSUMING node that wires organisms together — an `apps/*` app (the studio) or the
 * public-website subrepo — a SINK at the top of the order (nothing depends on it). The boundary
 * coverage rule applies to a surface's outbound edges exactly like an organism's; the difference is a
 * surface is never `foundational` and is not itself depended on.
 */
export type PackageClass = "organism" | "surface";

export interface Ownership {
  /** organism package name → the story id that owns it (the boundary rule applies between all of these). */
  organisms: Record<string, string>;
  /**
   * The foundational ROOT organisms — the ports `base`/`proof-protocol` (ADR-0075). A SUBSET of
   * `organisms`, NOT a separate class: they are depended on like any organism (declared edges), but
   * carry one extra minimality rule — a foundational organism may only depend on other foundational
   * organisms — which keeps them zod-only / node+pg-free so the studio's browser bundle works.
   */
  foundational: string[];
  /**
   * Consuming SURFACES (ADR-0100): package/app name → the story id that owns it. A surface is an
   * `apps/*` app (e.g. `studio`) — a sink that consumes organisms but is consumed by nothing. Its
   * outbound code edges (its `package.json` `@storytree/*` deps) are covered by the SAME rule as an
   * organism's (declared in the surface's own story `depends_on`), so the studio's real wiring is
   * enforced + rendered — but it is never `foundational` and draws no inbound edge. Optional (default
   * `{}`) so the organism-only tests need not declare it. (The public-website subrepo is also a
   * consuming surface, but it ships no workspace package — its forest-world edge is a declared story
   * node backed by the `check:web-engine` drift gate, not a package scanned here.)
   */
  surfaces?: Record<string, string>;
}

export interface BoundaryInput {
  ownership: Ownership;
  /**
   * package name → its RUNTIME `@storytree/*` dependencies (from `dependencies`, NOT
   * `devDependencies` — a test reusing another organism's parity suite is scaffolding, never a
   * dependency edge, ADR-0010 §5).
   */
  packageDeps: Record<string, string[]>;
  /** story id → its declared `depends_on` story ids — EVERY story (the acyclicity check needs all). */
  storyGraph: Record<string, string[]>;
  /**
   * story id → its declared `consumed_by` story ids (ADR-0074 §4, provider-side inbound edges): the
   * stories that consume this one. `B`'s `consumed_by` listing `A` declares the edge `A → B` just as
   * `A`'s `depends_on` listing `B` would — the gate accepts either endpoint. Optional per story
   * (default `[]`); only the spokes feeding the cli/store hubs populate it in practice.
   */
  consumedBy?: Record<string, string[]>;
  /**
   * The cross-package source-import findings (ADR-0074 §"does NOT decide", the v2 import scan). One
   * record per import/export specifier found in a `packages/<x>/src` file. The disk scanner
   * ({@link file://./check-boundaries.ts}) emits records for EVERY `.ts` file (test files included);
   * the judge skips the sanctioned scaffolding itself via {@link isTestScaffolding} so the exclusion
   * is unit-testable here. Optional (default `[]`) so the dep-graph rules run standalone.
   */
  sourceImports?: SourceImport[];
}

/** One import/export specifier found in a package's source file (the input to the v2 scan). */
export interface SourceImport {
  /** the `@storytree/*` package that owns the importing file. */
  importer: string;
  /** repo-relative POSIX path of the importing file, e.g. `packages/orchestrator/src/foo.ts`. */
  file: string;
  /** the raw module specifier, e.g. `@storytree/library`, `../../store/src/foo.js`, `./bar.js`. */
  specifier: string;
  /** `true` for `import type …` / `export type …` — erased at compile, not a runtime coupling. */
  typeOnly: boolean;
}

export interface BoundaryResult {
  violations: string[];
}

/** The class of a package — organism or consuming surface — or null if unclassified (a violation). */
export function classOf(pkg: string, o: Ownership): PackageClass | null {
  if (Object.prototype.hasOwnProperty.call(o.organisms, pkg)) return "organism";
  if (o.surfaces && Object.prototype.hasOwnProperty.call(o.surfaces, pkg)) return "surface";
  return null;
}

/**
 * The story that owns a package — an organism OR a consuming surface (ADR-0100). The coverage rule
 * reads this for both endpoints so a surface's outbound edge is checked exactly like an organism's.
 */
export function storyOf(pkg: string, o: Ownership): string | undefined {
  return o.organisms[pkg] ?? o.surfaces?.[pkg];
}

/** Whether a package is a foundational root port (held minimal so it stays browser-safe, ADR-0075). */
export function isFoundational(pkg: string, o: Ownership): boolean {
  return o.foundational.includes(pkg);
}

/**
 * Merge the consumer-side (`depends_on`) and provider-side (`consumed_by`) declarations into ONE
 * directed story graph: `A → B` is present iff `A`'s `depends_on` lists `B` OR `B`'s `consumed_by`
 * lists `A`. This is both the membership oracle for edge coverage and the graph the acyclicity check
 * runs over — so a cycle can't be smuggled in through `consumed_by`.
 */
export function mergeDeclaredGraph(
  storyGraph: Record<string, string[]>,
  consumedBy: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, Set<string>> = {};
  const add = (a: string, b: string): void => {
    (merged[a] ??= new Set<string>()).add(b);
  };
  // Keep every story as a node even if it has no outbound edge (so findCycle visits it).
  for (const a of Object.keys(storyGraph)) merged[a] ??= new Set<string>();
  for (const [a, deps] of Object.entries(storyGraph)) for (const b of deps) add(a, b);
  for (const [b, consumers] of Object.entries(consumedBy)) for (const a of consumers) add(a, b);
  const out: Record<string, string[]> = {};
  for (const [a, set] of Object.entries(merged)) out[a] = [...set].sort();
  return out;
}

/** Run every boundary rule over the gathered inputs and return the (possibly empty) violation list. */
export function checkBoundaries(input: BoundaryInput): BoundaryResult {
  const { ownership, packageDeps } = input;
  const consumedBy = input.consumedBy ?? {};
  const declared = mergeDeclaredGraph(input.storyGraph, consumedBy);
  const violations: string[] = [];

  // 0. Every @storytree/* package that appears (as a key or an edge target) must be a classified
  //    organism — so a new package can't slip in unowned. (ADR-0075: one class; the ports are
  //    organisms too.)
  const allPkgs = new Set<string>(Object.keys(packageDeps));
  for (const deps of Object.values(packageDeps)) for (const d of deps) allPkgs.add(d);
  for (const pkg of [...allPkgs].sort()) {
    if (classOf(pkg, ownership) === null) {
      violations.push(
        `unclassified package "${pkg}" — declare it in repo-manifest.json packageOwnership ` +
          `organisms (a reusable package; if a browser-safe root port, also in foundational) or ` +
          `surfaces (an apps/* consuming surface, ADR-0100)`,
      );
    }
  }
  // The foundational subset must be a subset of organisms (ADR-0075): a port is a root ORGANISM, so
  // a foundational entry that is not an organism is a misconfiguration.
  for (const pkg of ownership.foundational) {
    if (classOf(pkg, ownership) === null) {
      violations.push(
        `foundational package "${pkg}" is not an organism — every foundational port must also be ` +
          `listed in repo-manifest.json packageOwnership organisms`,
      );
    }
  }

  // 1. Edge rules (ADR-0075: one class — EVERY cross-organism edge needs a declaration, the ports
  //    get no exemption; PLUS the foundational-minimality rule, a port may only depend on a port).
  for (const [a, deps] of Object.entries(packageDeps)) {
    const ca = classOf(a, ownership);
    for (const b of deps) {
      const cb = classOf(b, ownership);
      if (ca === null || cb === null) continue; // already reported as unclassified

      // The foundational-minimality rule (ADR-0075): a foundational root port may only depend on
      // another foundational port — keeps base/proof-protocol zod-only so the browser bundle works.
      if (isFoundational(a, ownership) && !isFoundational(b, ownership)) {
        violations.push(
          `foundational port "${a}" depends on non-foundational organism "${b}" — a root port may ` +
            `only depend on other foundational ports (it stays zod/types-only so the studio browser ` +
            `bundle works, ADR-0075 / ADR-0068 §4).`,
        );
      }

      // Coverage: every cross-story code edge must be a declared cross-story edge (no port exemption).
      // storyOf resolves an organism OR a consuming surface (ADR-0100), so a surface's outbound edge
      // (e.g. studio → forest-world) is covered by the same rule as an organism's.
      const storyA = storyOf(a, ownership);
      const storyB = storyOf(b, ownership);
      if (storyA === undefined || storyB === undefined) continue;
      if (storyA === storyB) continue; // same organism owning multiple packages
      if (!(declared[storyA]?.includes(storyB) ?? false)) {
        violations.push(
          `undeclared cross-story coupling: "${a}" (story ${storyA}) → "${b}" (story ${storyB}). ` +
            `Declare the edge on either endpoint — add "${storyB}" to stories/${storyA}/story.md ` +
            `depends_on, OR add "${storyA}" to stories/${storyB}/story.md consumed_by — so it shows ` +
            `in the forest; or drop the dependency.`,
        );
      }
    }
  }

  // 2. The merged (depends_on ∪ consumed_by) cross-story graph must be acyclic (ADR-0058).
  const cycle = findCycle(declared);
  if (cycle) violations.push(`cross-story dependency cycle: ${cycle.join(" → ")}`);

  // 3. The source-import scan (ADR-0074's v2 hole): relative cross-package escapes (a) and
  //    devDep/undeclared runtime @storytree imports (b). The dep-graph rules above can't see either.
  checkSourceImports(input.sourceImports ?? [], packageDeps, violations);

  return { violations };
}

/**
 * Rules (a) + (b) over the source-import findings. Pure: classifies each non-scaffolding specifier
 * and appends a fix-pointing violation. Sanctioned scaffolding ({@link isTestScaffolding}) and the
 * blessed substrate/ports are skipped; same-package imports are ignored.
 */
function checkSourceImports(
  sourceImports: SourceImport[],
  packageDeps: Record<string, string[]>,
  violations: string[],
): void {
  for (const { importer, file, specifier, typeOnly } of sourceImports) {
    if (isTestScaffolding(file)) continue; // tests + parity suites are sanctioned (ADR-0010 §5)

    if (isRelativeSpecifier(specifier)) {
      // (a) a relative import must stay within the importing file's own package dir.
      const ownDir = packageDirOf(file);
      if (ownDir === null) continue; // not under packages/<x>/ — out of the boundary surface
      const resolved = resolveRelative(file, specifier);
      if (resolved.startsWith(`${ownDir}/`)) continue; // stays in-package — fine
      const otherDir = resolved.startsWith("packages/") ? resolved.split("/")[1] : undefined;
      const barrel = otherDir !== undefined ? `@storytree/${otherDir}` : "the package's barrel";
      violations.push(
        `cross-package relative import: "${file}" imports "${specifier}" (resolves to "${resolved}"), ` +
          `escaping its own package — relative imports must stay in-package. Import "${barrel}" through ` +
          `its package barrel and declare the dependency (ADR-0074 §5; the exports barrel, ADR-0068).`,
      );
      continue;
    }

    if (specifier.startsWith(STORYTREE_PREFIX)) {
      // (b) a runtime value-import of an organism must be backed by a runtime `dependencies` entry.
      // (ADR-0075: the ports are organisms too — a runtime port import must be a declared dep, no
      // special skip; every real port importer already declares it, so this stays green.)
      const target = scopePackage(specifier);
      if (target === importer) continue; // same package
      if (typeOnly) continue; // erased — not a runtime coupling (ADR-0010 §5 spirit)
      if ((packageDeps[importer] ?? []).includes(target)) continue; // declared runtime dep — covered above
      const dir = packageDirOf(file);
      const where = dir !== null ? `${dir}/package.json` : `${importer}'s package.json`;
      violations.push(
        `devDep/undeclared runtime import: "${file}" value-imports "${target}", which is NOT a runtime ` +
          `dependency of "${importer}" (a devDependency or undeclared). devDeps are test-only scaffolding ` +
          `(ADR-0010 §5), so this runtime coupling is invisible to the gate. Add "${target}" to ` +
          `${where} "dependencies" and declare the cross-story edge, or make the import type-only / ` +
          `move it into a *.test.ts.`,
      );
    }
    // a bare external specifier (node:*, zod, …) — out of scope.
  }
}

/**
 * Return one directed cycle in the graph (the node sequence, first repeated at the end) or null.
 * Edges to nodes absent from the graph are ignored (a depends_on referencing an unknown story is
 * out of scope here — the existence check is elsewhere).
 */
export function findCycle(graph: Record<string, string[]>): string[] | null {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color: Record<string, number> = {};
  const stack: string[] = [];
  let found: string[] | null = null;

  const visit = (n: string): void => {
    if (found) return;
    color[n] = GREY;
    stack.push(n);
    for (const m of graph[n] ?? []) {
      if (found) return;
      if (color[m] === GREY) {
        found = [...stack.slice(stack.indexOf(m)), m];
        return;
      }
      if ((color[m] ?? WHITE) === WHITE && Object.prototype.hasOwnProperty.call(graph, m)) visit(m);
    }
    stack.pop();
    color[n] = BLACK;
  };

  for (const n of Object.keys(graph)) {
    if ((color[n] ?? WHITE) === WHITE) visit(n);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------------
// The source-import scan helpers (ADR-0074's v2 import scan) — all pure, all unit-tested.
// ---------------------------------------------------------------------------------------------------

const STORYTREE_PREFIX = "@storytree/";

/**
 * `true` for sanctioned test scaffolding — `*.test.ts` files and parity suites — which may reuse
 * another organism's test surface across the boundary (ADR-0010 §5). Parity suites are matched by
 * name (`parity.ts` / `*-parity.ts`) and by a `parity/` path segment.
 */
export function isTestScaffolding(file: string): boolean {
  if (/\.test\.tsx?$/.test(file)) return true;
  const base = file.split("/").pop() ?? file;
  if (base === "parity.ts" || /-parity\.ts$/.test(base)) return true;
  return file.split("/").includes("parity");
}

/** A relative module specifier (`.` / `..` rooted) — the only kind that can escape the package. */
function isRelativeSpecifier(spec: string): boolean {
  return spec === "." || spec === ".." || spec.startsWith("./") || spec.startsWith("../");
}

/** The `packages/<dir>` prefix of a repo-relative POSIX file path, or null if it is not under one. */
function packageDirOf(file: string): string | null {
  const parts = file.split("/");
  if (parts[0] !== "packages" || parts.length < 3) return null;
  return `${parts[0]}/${parts[1]}`;
}

/** Resolve a relative specifier against the importing file's dir (pure POSIX path math). */
function resolveRelative(file: string, spec: string): string {
  const stack = file.split("/").slice(0, -1); // the importing file's directory
  for (const seg of spec.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

/** Reduce a `@storytree/x` / `@storytree/x/sub/path` specifier to the bare package name `@storytree/x`. */
function scopePackage(spec: string): string {
  return spec.split("/").slice(0, 2).join("/");
}

/**
 * Strip line + block comments from TS source while preserving string/template literals intact (so a
 * commented-out `import … from "x"` never registers as a real import, but a real specifier survives).
 * Pure; quote-aware. Template-literal interpolations are treated as opaque string content — good
 * enough for import-statement extraction.
 */
export function stripComments(src: string): string {
  let out = "";
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    const c2 = src[i + 1];
    if (mode === "code") {
      if (c === "/" && c2 === "/") { mode = "line"; i++; continue; }
      if (c === "/" && c2 === "*") { mode = "block"; i++; continue; }
      out += c;
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; }
      continue;
    }
    if (mode === "block") {
      if (c === "*" && c2 === "/") { mode = "code"; i++; }
      else if (c === "\n") out += c; // keep newlines so line context is unchanged
      continue;
    }
    // string/template modes — copy verbatim, honour escapes, detect the closing quote.
    out += c;
    if (c === "\\") { if (i + 1 < src.length) out += src[++i]; continue; }
    if (mode === "sq" && c === "'") mode = "code";
    else if (mode === "dq" && c === '"') mode = "code";
    else if (mode === "tpl" && c === "`") mode = "code";
  }
  return out;
}

const FROM_RE = /\b(import|export)\b([\w\s{},*]*?)\bfrom\s*(['"])([^'"]+)\3/g;
const BARE_RE = /\bimport\s*(['"])([^'"]+)\1/g; // side-effect `import "x"`
const DYN_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1/g; // dynamic `import("x")`

/**
 * Extract every static/side-effect/dynamic import (+ re-export-from) specifier from TS source, with a
 * `typeOnly` flag for `import type` / `export type`. Comments are stripped first. Pure.
 */
export function extractImports(src: string): { specifier: string; typeOnly: boolean }[] {
  const code = stripComments(src);
  const found: { specifier: string; typeOnly: boolean }[] = [];
  for (const m of code.matchAll(FROM_RE)) {
    found.push({ specifier: m[4]!, typeOnly: /^\s*type\b/.test(m[2] ?? "") });
  }
  for (const m of code.matchAll(BARE_RE)) found.push({ specifier: m[2]!, typeOnly: false });
  for (const m of code.matchAll(DYN_RE)) found.push({ specifier: m[2]!, typeOnly: false });
  return found;
}

// ===================================================================================================
// The declared-edge DRIFT report (ADR-0115) — a NON-BLOCKING sibling to {@link checkBoundaries}.
//
// `checkBoundaries` REFUSES an undeclared real coupling; this only REPORTS the inverse asymmetries it
// cannot see: declared cross-story edges that NO code import backs (drift candidates), and real code
// edges with no declaration. The blocking gate maps packages → stories via the ownership map, so it is
// blind to a VIRTUAL story (one that owns no package — e.g. `headless-orchestrator`, whose code is
// physically hosted in OTHER stories' packages) and to IoC-injected / build-artifact / subprocess seams
// (no import specifier at all). For a virtual story this DERIVES the real cross-story edges from its
// units' `proof.real.sourceFile` text (read by the disk gatherer, passed in here) via the SAME
// {@link extractImports} the blocking scan uses — skipping type-only imports (erased) and test
// scaffolding, exactly as rule (b) does. It NEVER fails the gate: a declared-but-unbacked edge is
// frequently a LEGITIMATE honesty edge (a build-artifact consumption or an injected-runner coupling),
// indistinguishable from drift to a machine — so the report SURFACES candidates for human /
// librarian-curator review, it does not auto-classify them (ADR-0115 d.3/d.4).
// ===================================================================================================

/** One unit source file gathered for a VIRTUAL story's edge derivation (the gatherer reads the text). */
export interface VirtualStorySource {
  /** the virtual story (owns no package) whose capability/contract owns this source file. */
  story: string;
  /** repo-relative POSIX path — provenance, and the {@link isTestScaffolding} input. */
  file: string;
  /** the raw TS source text; {@link declaredEdgeDriftReport} runs {@link extractImports} over it. */
  content: string;
}

/** Inputs to {@link declaredEdgeDriftReport}. Pure DATA — the disk read is the gatherer's job. */
export interface DriftReportInput {
  ownership: Ownership;
  /**
   * EVERY story id → its declared `depends_on`. Every story must appear (so a virtual story with no
   * package is still considered); edge TARGETS need not be keys.
   */
  storyGraph: Record<string, string[]>;
  /** story id → its `consumed_by` (provider-side inbound edges, ADR-0074 §4). Optional (default `{}`). */
  consumedBy?: Record<string, string[]>;
  /**
   * package name → its runtime `@storytree/*` deps — the REAL code edges for a PACKAGE-OWNING story
   * (projected through the ownership map, exactly as the blocking gate reads them).
   */
  packageDeps: Record<string, string[]>;
  /**
   * Per VIRTUAL story, the raw text of its units' `proof.real.sourceFile`s (and any LITERAL
   * `sourceGlobs`). The derivation runs over these; a record whose story OWNS a package is ignored
   * (defensive). Optional (default `[]`).
   */
  virtualStorySources?: VirtualStorySource[];
}

/** Per-story asymmetry between the declared graph and the real code-edge graph (ADR-0115). */
export interface StoryEdgeDrift {
  /** the story owns NO package — its real edges were DERIVED from unit `sourceFile` imports. */
  virtual: boolean;
  /** declared edges (`depends_on` ∪ inverse(`consumed_by`)) with NO backing code import — drift candidates. */
  declaredButUnbacked: string[];
  /** real code edges with NO declaration (a hard gate violation for a package-owning story). */
  backedButUndeclared: string[];
}

/** The non-blocking declared-edge drift report (ADR-0115): story id → its asymmetries. */
export interface DeclaredEdgeDriftReport {
  /** only stories with at least one asymmetry appear. */
  byStory: Record<string, StoryEdgeDrift>;
}

/**
 * Compute the per-story declared-vs-code edge drift (ADR-0115). PURE: no I/O, never throws, never
 * fails a gate — the result is a report for review. For each story it diffs the DECLARED cross-story
 * graph (`depends_on` ∪ inverse(`consumed_by`), via {@link mergeDeclaredGraph}) against the REAL
 * code-edge graph: `packageDeps` projected through ownership for a package-owning story, or the
 * `@storytree/*` RUNTIME imports of its units' `sourceFile` text for a VIRTUAL one.
 */
export function declaredEdgeDriftReport(input: DriftReportInput): DeclaredEdgeDriftReport {
  const { ownership, packageDeps } = input;
  const declared = mergeDeclaredGraph(input.storyGraph, input.consumedBy ?? {});

  // Stories that OWN a package (an organism or a consuming surface, ADR-0100) take their real edges
  // from packageDeps; every other story is VIRTUAL and derives them from unit sourceFile imports.
  const ownedStories = new Set<string>([
    ...Object.values(ownership.organisms),
    ...Object.values(ownership.surfaces ?? {}),
  ]);

  const real: Record<string, Set<string>> = {};
  const addReal = (from: string, to: string): void => {
    if (from === to) return; // intra-organism / self edge — never a cross-story coupling
    (real[from] ??= new Set<string>()).add(to);
  };

  // Package-owning stories: project the real runtime @storytree/* dep graph through ownership.
  for (const [pkg, deps] of Object.entries(packageDeps)) {
    const from = storyOf(pkg, ownership);
    if (from === undefined) continue;
    for (const dep of deps) {
      const to = storyOf(dep, ownership);
      if (to !== undefined) addReal(from, to);
    }
  }

  // Virtual stories: derive real edges from the @storytree/* RUNTIME imports in their units' source
  // files (ADR-0115 §1). Reuse extractImports; skip type-only (erased) + sanctioned test scaffolding.
  for (const { story, file, content } of input.virtualStorySources ?? []) {
    if (ownedStories.has(story)) continue; // only virtual stories derive (defensive)
    if (isTestScaffolding(file)) continue;
    for (const { specifier, typeOnly } of extractImports(content)) {
      if (typeOnly) continue;
      if (!specifier.startsWith(STORYTREE_PREFIX)) continue;
      const to = storyOf(scopePackage(specifier), ownership);
      if (to !== undefined) addReal(story, to);
    }
  }

  // Per-story set difference. Every story is a declared node (storyGraph carries all of them); also
  // include any story that only appears as a real-edge source.
  const stories = new Set<string>([...Object.keys(declared), ...Object.keys(real)]);
  const byStory: Record<string, StoryEdgeDrift> = {};
  for (const story of [...stories].sort()) {
    const declaredSet = declared[story] ?? [];
    const realSet = real[story] ?? new Set<string>();
    const declaredButUnbacked = declaredSet.filter((t) => !realSet.has(t)).sort();
    const backedButUndeclared = [...realSet].filter((t) => !declaredSet.includes(t)).sort();
    if (declaredButUnbacked.length === 0 && backedButUndeclared.length === 0) continue;
    byStory[story] = { virtual: !ownedStories.has(story), declaredButUnbacked, backedButUndeclared };
  }
  return { byStory };
}

/**
 * Render {@link declaredEdgeDriftReport}'s result as the human WARN text the gatherer prints. PURE
 * (returns the string; the gatherer does the `console.warn`). Explicitly marks the report as
 * NON-BLOCKING and that it does not auto-classify legitimate-vs-drift (ADR-0115).
 */
export function formatDriftReport(report: DeclaredEdgeDriftReport): string {
  const header =
    "[check:boundaries] ADR-0115 declared-edge drift report (NON-BLOCKING — review, never fails the gate)";
  const stories = Object.keys(report.byStory).sort();
  if (stories.length === 0) {
    return `${header}: no declared-vs-code edge drift detected.`;
  }
  const lines = [`${header}:`];
  for (const story of stories) {
    const d = report.byStory[story]!;
    const kind = d.virtual
      ? "virtual story — real edges derived from unit sourceFile imports"
      : "package-owning story";
    lines.push(`  story "${story}" (${kind}):`);
    if (d.declaredButUnbacked.length > 0) {
      lines.push(
        `    declared but code-unbacked (drift candidate — confirm a build-artifact/IoC honesty edge, ` +
          `else remove the declaration): ${d.declaredButUnbacked.join(", ")}`,
      );
    }
    if (d.backedButUndeclared.length > 0) {
      lines.push(
        `    backed but undeclared (a real code import with no declared edge — declare it or drop the ` +
          `coupling): ${d.backedButUndeclared.join(", ")}`,
      );
    }
  }
  lines.push(
    "  These are review candidates, not failures — a machine cannot tell a legitimate honesty edge " +
      "from drift (ADR-0115); a human / librarian-curator decides.",
  );
  return lines.join("\n");
}
