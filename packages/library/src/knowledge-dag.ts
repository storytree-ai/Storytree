import { readDependsOnPointers } from "./depends-on-compat.js";

/** The complete input surface for Library dependency-cycle detection. */
export interface KnowledgeDagNode {
  id: string;
  dependsOn: readonly string[];
}

function comparePaths(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const comparison = left[index]!.localeCompare(right[index]!);
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
}

/** Give rotations of the same directed cycle one stable identity without altering the returned path. */
function cycleKey(closedPath: readonly string[]): string {
  const cycle = closedPath.slice(0, -1);
  let canonical = cycle;

  for (let offset = 1; offset < cycle.length; offset += 1) {
    const rotation = [...cycle.slice(offset), ...cycle.slice(0, offset)];
    if (comparePaths(rotation, canonical) < 0) canonical = rotation;
  }

  return JSON.stringify(canonical);
}

/**
 * Find authored `dependsOn` cycles as concrete closed paths.
 *
 * Targets absent from the supplied graph are leaves for this in-memory question. The function reads
 * no other fields, including `references`, and never mutates the caller's nodes or edge arrays.
 */
export function findDependsOnCycles(nodes: readonly KnowledgeDagNode[]): string[][] {
  const edgesById = new Map<string, readonly string[]>();
  for (const node of nodes) {
    if (!edgesById.has(node.id)) edgesById.set(node.id, node.dependsOn);
  }

  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();
  const cycles: string[][] = [];

  const visit = (id: string, path: readonly string[]): void => {
    state.set(id, "visiting");

    for (const target of edgesById.get(id) ?? []) {
      if (!edgesById.has(target)) continue;

      const targetState = state.get(target);
      if (targetState === "visiting") {
        const cycleStart = path.indexOf(target);
        const cycle = [...path.slice(cycleStart), target];
        const key = cycleKey(cycle);
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(cycle);
        }
      } else if (targetState === undefined) {
        visit(target, [...path, target]);
      }
    }

    state.set(id, "done");
  };

  for (const id of edgesById.keys()) {
    if (state.get(id) === undefined) visit(id, [id]);
  }

  return cycles;
}

/** The `asset:<id>` prefix a stored `dependsOn` entry carries; stripped to reach the node id. */
const ASSET_PREFIX = "asset:";

/** The minimal stored-doc facts {@link dependsOnNodes} needs. Matches `StoredDoc` structurally. */
export interface DependsOnSource {
  readonly id: string;
  readonly doc: unknown;
}

/**
 * PURE: project stored corpus docs onto the {@link KnowledgeDagNode} graph the detector walks.
 *
 * THE NORMALISATION IS THE WHOLE JOB, and skipping it would produce a detector that always passes.
 * A doc's `dependsOn` entries are POINTERS (`asset:<id>` / `doc:<relpath>`, {@link
 * import("./knowledge.js").DependsOnRef}) while a node's identity is a BARE id. Handed the raw
 * pointers, {@link findDependsOnCycles} would find `asset:foo` absent from the graph, treat it as a
 * leaf, and report no cycles over any corpus whatsoever — green, permanently, for the wrong reason.
 *
 * `doc:` targets are carried through UNSTRIPPED and therefore stay absent from the graph, which is
 * exactly ADR-0223 D4's bedrock rule expressed in data: ADRs are not Library artifacts, carry no
 * `dependsOn` of their own, and so are natural sinks that cannot close a cycle.
 *
 * TOTAL over untrusted input. It reads the stored `doc` payload defensively rather than through the
 * zod union, because this runs over the LIVE corpus: a row written by an older schema, or by a
 * branch that has the field where this checkout does not, must be projected as "no edges" rather
 * than throw. A malformed doc is refused at the WRITE boundary (`validateLibraryDoc`); the read side
 * of a fail-closed gate must not be the place a surprise row takes the gate down, because that
 * failure looks identical to a real cycle.
 */
export function dependsOnNodes(docs: readonly DependsOnSource[]): KnowledgeDagNode[] {
  return docs.map((row) => {
    // ADR-0402 read tolerance, TEMPORARY — remove after the batch drain (depends-on-compat.ts).
    const dependsOn = readDependsOnPointers(row.doc)
      .map((entry) => (entry.startsWith(ASSET_PREFIX) ? entry.slice(ASSET_PREFIX.length) : entry))
      .filter((entry) => entry !== "");
    return { id: row.id, dependsOn };
  });
}

/** One cycle, rendered for a gate operator: the closed path and the edge count that closes it. */
export interface DependsOnCycleReport {
  /** The closed path, first id === last id — {@link findDependsOnCycles}'s output verbatim. */
  readonly path: readonly string[];
  /** The rendered line, e.g. `a → b → a`. */
  readonly line: string;
}

/** The corpus-wide acyclicity verdict. */
export interface DependsOnAcyclicityVerdict {
  /** True iff no authored cycle exists — the gate passes on this and nothing else. */
  readonly acyclic: boolean;
  /** How many docs were judged (the denominator, so a green can never hide an empty read). */
  readonly docsScanned: number;
  /** How many authored edges were judged. */
  readonly edgesScanned: number;
  /** Every distinct cycle, in the detector's order. Empty iff {@link acyclic}. */
  readonly cycles: readonly DependsOnCycleReport[];
}

/**
 * PURE: judge a whole corpus for authored `dependsOn` acyclicity — ADR-0223 D3's fail-closed gate,
 * as a function. The `check:library-dag-acyclic` rung is a thin store read around this.
 *
 * It REPORTS the denominators as well as the verdict. A corpus-wide guard that answers only
 * pass/fail cannot distinguish "no cycles" from "read nothing", and those two must never print the
 * same way (the {@link DependsOnAcyclicityVerdict.docsScanned} field is what lets the rung say which
 * one it saw).
 */
export function evaluateDependsOnAcyclicity(
  docs: readonly DependsOnSource[],
): DependsOnAcyclicityVerdict {
  const nodes = dependsOnNodes(docs);
  const cycles = findDependsOnCycles(nodes);
  return {
    acyclic: cycles.length === 0,
    docsScanned: nodes.length,
    edgesScanned: nodes.reduce((total, node) => total + node.dependsOn.length, 0),
    cycles: cycles.map((path) => ({ path, line: path.join(" → ") })),
  };
}

/**
 * The corpus size at or above which ZERO authored edges can only mean the READER is blind.
 *
 * It is a threshold, not a proof, and the honest reading of it is: below the floor, "this corpus
 * genuinely has no authored edges yet" is a plausible truth (a hermetic fixture, a freshly seeded
 * store); at or above it, that explanation has run out. Calibrated against the two corpora that
 * actually exist — the frozen hermetic fixture is 20 artifacts with no edges by design, and the live
 * store measured 1,701 artifacts carrying ~778 authored pointers on 2026-08-21 — so 100 sits an
 * order of magnitude above the one that may legitimately read zero and an order of magnitude below
 * the one that may not.
 */
export const VACUOUS_DEPENDS_ON_READ_FLOOR = 100;

/**
 * True when a verdict is VACUOUS: a corpus large enough to be the real one, and not one edge seen.
 *
 * WHY THIS IS A RULE AND NOT A PRINTED NUMBER. {@link DependsOnAcyclicityVerdict} already reports its
 * denominators precisely so "no cycles" and "read nothing" cannot print alike — but a rung that
 * prints the zero and then EXITS 0 has collapsed them anyway, which is what happened on 2026-08-21:
 * `check:library-dag-acyclic PASS — no dependsOn cycle across 1701 artifacts (0 authored edges)`,
 * a green from an instrument that could see none of its subject. An instrument that cannot see its
 * subject must not report success.
 *
 * Deliberately NOT folded into {@link DependsOnAcyclicityVerdict.acyclic}. Vacuity is a fact about
 * the READ, not about the graph: a corpus with no edges genuinely has no cycles, and saying
 * otherwise would make the judge lie in the other direction. The caller decides what an unverifiable
 * read costs it.
 */
export function isVacuousDependsOnRead(verdict: DependsOnAcyclicityVerdict): boolean {
  return verdict.edgesScanned === 0 && verdict.docsScanned >= VACUOUS_DEPENDS_ON_READ_FLOOR;
}
