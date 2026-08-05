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
