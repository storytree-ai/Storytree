/** The complete input surface for Library dependency-cycle detection. */
export interface KnowledgeDagNode {
  id: string;
  standsOn: readonly string[];
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
 * Find authored `standsOn` cycles as concrete closed paths.
 *
 * Targets absent from the supplied graph are leaves for this in-memory question. The function reads
 * no other fields, including `references`, and never mutates the caller's nodes or edge arrays.
 */
export function findStandsOnCycles(nodes: readonly KnowledgeDagNode[]): string[][] {
  const edgesById = new Map<string, readonly string[]>();
  for (const node of nodes) {
    if (!edgesById.has(node.id)) edgesById.set(node.id, node.standsOn);
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

/** The `asset:<id>` prefix a stored `standsOn` entry carries; stripped to reach the node id. */
const ASSET_PREFIX = "asset:";

/** The minimal stored-doc facts {@link standsOnNodes} needs. Matches `StoredDoc` structurally. */
export interface StandsOnSource {
  readonly id: string;
  readonly doc: unknown;
}

/**
 * PURE: project stored corpus docs onto the {@link KnowledgeDagNode} graph the detector walks.
 *
 * THE NORMALISATION IS THE WHOLE JOB, and skipping it would produce a detector that always passes.
 * A doc's `standsOn` entries are POINTERS (`asset:<id>` / `doc:<relpath>`, {@link
 * import("./knowledge.js").StandsOnRef}) while a node's identity is a BARE id. Handed the raw
 * pointers, {@link findStandsOnCycles} would find `asset:foo` absent from the graph, treat it as a
 * leaf, and report no cycles over any corpus whatsoever — green, permanently, for the wrong reason.
 *
 * `doc:` targets are carried through UNSTRIPPED and therefore stay absent from the graph, which is
 * exactly ADR-0223 D4's bedrock rule expressed in data: ADRs are not Library artifacts, carry no
 * `standsOn` of their own, and so are natural sinks that cannot close a cycle.
 *
 * TOTAL over untrusted input. It reads the stored `doc` payload defensively rather than through the
 * zod union, because this runs over the LIVE corpus: a row written by an older schema, or by a
 * branch that has the field where this checkout does not, must be projected as "no edges" rather
 * than throw. A malformed doc is refused at the WRITE boundary (`validateLibraryDoc`); the read side
 * of a fail-closed gate must not be the place a surprise row takes the gate down, because that
 * failure looks identical to a real cycle.
 */
export function standsOnNodes(docs: readonly StandsOnSource[]): KnowledgeDagNode[] {
  return docs.map((row) => {
    const payload = row.doc as { standsOn?: unknown } | null | undefined;
    const raw = Array.isArray(payload?.standsOn) ? payload.standsOn : [];
    const standsOn = raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => (entry.startsWith(ASSET_PREFIX) ? entry.slice(ASSET_PREFIX.length) : entry))
      .filter((entry) => entry !== "");
    return { id: row.id, standsOn };
  });
}

/** One cycle, rendered for a gate operator: the closed path and the edge count that closes it. */
export interface StandsOnCycleReport {
  /** The closed path, first id === last id — {@link findStandsOnCycles}'s output verbatim. */
  readonly path: readonly string[];
  /** The rendered line, e.g. `a → b → a`. */
  readonly line: string;
}

/** The corpus-wide acyclicity verdict. */
export interface StandsOnAcyclicityVerdict {
  /** True iff no authored cycle exists — the gate passes on this and nothing else. */
  readonly acyclic: boolean;
  /** How many docs were judged (the denominator, so a green can never hide an empty read). */
  readonly docsScanned: number;
  /** How many authored edges were judged. */
  readonly edgesScanned: number;
  /** Every distinct cycle, in the detector's order. Empty iff {@link acyclic}. */
  readonly cycles: readonly StandsOnCycleReport[];
}

/**
 * PURE: judge a whole corpus for authored `standsOn` acyclicity — ADR-0223 D3's fail-closed gate,
 * as a function. The `check:library-dag-acyclic` rung is a thin store read around this.
 *
 * It REPORTS the denominators as well as the verdict. A corpus-wide guard that answers only
 * pass/fail cannot distinguish "no cycles" from "read nothing", and those two must never print the
 * same way (the {@link StandsOnAcyclicityVerdict.docsScanned} field is what lets the rung say which
 * one it saw).
 */
export function evaluateStandsOnAcyclicity(
  docs: readonly StandsOnSource[],
): StandsOnAcyclicityVerdict {
  const nodes = standsOnNodes(docs);
  const cycles = findStandsOnCycles(nodes);
  return {
    acyclic: cycles.length === 0,
    docsScanned: nodes.length,
    edgesScanned: nodes.reduce((total, node) => total + node.standsOn.length, 0),
    cycles: cycles.map((path) => ({ path, line: path.join(" → ") })),
  };
}
