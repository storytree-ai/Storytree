/**
 * The organism-boundary analyser (ADR-0074). PURE — no I/O. The `check:boundaries` script
 * ({@link file://./check-boundaries.ts}) gathers the inputs from disk (package.json dep graph +
 * story `depends_on` + the ownership map); this module just JUDGES them, so the rule set is
 * exhaustively unit-testable offline.
 *
 * The invariant it gates (ADR-0010 §3/§4, ADR-0058, ADR-0068): the real cross-organism CODE
 * dependency graph must be a subgraph of the declared cross-story `depends_on` graph — with a small
 * blessed set of shared substrate/ports excepted. Because the studio forest renders `depends_on`,
 * forcing every code edge to be a declared edge also makes it UI-visible (one rule, both gaps).
 */

/** The three package classes (ADR-0074 §2). */
export type PackageClass = "organism" | "substrate" | "composition-root";

export interface Ownership {
  /** organism package name → the story id that owns it (the boundary rule applies between these). */
  organisms: Record<string, string>;
  /** shared substrate / port packages (no single owner; anyone may depend on them; held minimal). */
  substrate: string[];
  /** the wiring layer (store/cli/…) — may depend on anything; nothing may depend on it. */
  compositionRoots: string[];
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
}

export interface BoundaryResult {
  violations: string[];
}

/** Which class a package is in, or null if it is not classified at all (itself a violation). */
export function classOf(pkg: string, o: Ownership): PackageClass | null {
  if (Object.prototype.hasOwnProperty.call(o.organisms, pkg)) return "organism";
  if (o.substrate.includes(pkg)) return "substrate";
  if (o.compositionRoots.includes(pkg)) return "composition-root";
  return null;
}

/** Run every boundary rule over the gathered inputs and return the (possibly empty) violation list. */
export function checkBoundaries(input: BoundaryInput): BoundaryResult {
  const { ownership, packageDeps, storyGraph } = input;
  const violations: string[] = [];

  // 0. Every @storytree/* package that appears (as a key or an edge target) must be classified
  //    exactly once — so a new package can't slip in unowned, and a misfile is caught.
  const allPkgs = new Set<string>(Object.keys(packageDeps));
  for (const deps of Object.values(packageDeps)) for (const d of deps) allPkgs.add(d);
  for (const pkg of [...allPkgs].sort()) {
    if (classOf(pkg, ownership) === null) {
      violations.push(
        `unclassified package "${pkg}" — declare it in repo-manifest.json packageOwnership ` +
          `(organisms / substrate / compositionRoots)`,
      );
    }
  }
  for (const pkg of Object.keys(ownership.organisms)) {
    if (ownership.substrate.includes(pkg) || ownership.compositionRoots.includes(pkg)) {
      violations.push(`package "${pkg}" is classified in more than one category`);
    }
  }
  for (const pkg of ownership.substrate) {
    if (ownership.compositionRoots.includes(pkg)) {
      violations.push(`package "${pkg}" is classified in more than one category`);
    }
  }

  // 1. Edge rules (ADR-0074 §2).
  for (const [a, deps] of Object.entries(packageDeps)) {
    const ca = classOf(a, ownership);
    for (const b of deps) {
      const cb = classOf(b, ownership);
      if (ca === null || cb === null) continue; // already reported as unclassified
      if (ca === "composition-root") continue; // the wiring layer may depend on anything
      if (cb === "substrate") continue; // anyone may depend on the substrate/ports
      if (cb === "composition-root") {
        violations.push(
          `${ca} "${a}" depends on composition-root "${b}" — nothing may depend on the wiring ` +
            `layer (store/cli); invert the dependency`,
        );
        continue;
      }
      // cb === "organism" below
      if (ca === "substrate") {
        violations.push(
          `substrate "${a}" depends on organism "${b}" — substrate/ports stay minimal ` +
            `(zod/types only, ADR-0068 §4)`,
        );
        continue;
      }
      // ca === "organism", cb === "organism"
      const storyA = ownership.organisms[a];
      const storyB = ownership.organisms[b];
      if (storyA === undefined || storyB === undefined) continue;
      if (storyA === storyB) continue; // same organism owning multiple packages
      const declared = storyGraph[storyA] ?? [];
      if (!declared.includes(storyB)) {
        violations.push(
          `undeclared cross-story coupling: "${a}" (story ${storyA}) → "${b}" (story ${storyB}). ` +
            `Add "${storyB}" to stories/${storyA}/story.md depends_on (it will then show in the ` +
            `forest), or drop the dependency.`,
        );
      }
    }
  }

  // 2. The cross-story depends_on graph must be acyclic (ADR-0058).
  const cycle = findCycle(storyGraph);
  if (cycle) violations.push(`cross-story dependency cycle: ${cycle.join(" → ")}`);

  return { violations };
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
