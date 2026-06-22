import { effectiveUatWitness } from "@storytree/library";
import type { ProveResult } from "./prove-it-gate.js";
import type { NodeSpec } from "./node-spec.js";
import { resolveBuildConfig } from "./resolve-prove-spec.js";
import { runSequence } from "./sequence.js";

/**
 * Drive-machinery Phase E (plan §3): a THIN topo-ordered loop over a story's nodes — prove the
 * capabilities in dependency order, then the story itself (contracts → capability integration →
 * story UAT, ADR-0010's proof ladder walked bottom-up). Deliberately NOT a rewrite of any control
 * flow: the per-node walk stays {@link proveUnit} (injected as `buildNode` by the caller), and the
 * loop itself is {@link runSequence} — the proven fail-closed spine — so the hard-won
 * *halted-is-never-a-pass* guard is REUSED, not re-implemented. A node that fails closed halts the
 * story run at that node; later nodes never run and the run can never report `passed`.
 */

/** The outcome of one node's drive inside a story run. */
export interface StoryNodeOutcome {
  unitId: string;
  /** The prove-it-gate's result for this node (a signed pass on the ok arm). */
  result: Extract<ProveResult, { ok: true }>;
  /** SDK-reported spend for this node (0 for offline/scripted drives). */
  costUsd: number;
}

/** The per-node driver the caller injects: workspace + store + leaf wiring live with the caller. */
export type StoryNodeBuilder = (
  spec: NodeSpec,
  index: number,
  /** USD left under the run's total ceiling (undefined = no ceiling). Cap the leaf's slice budget with it. */
  remainingUsd: number | undefined,
) => Promise<{ result: ProveResult; costUsd?: number }>;

export interface StoryBuildArgs {
  /** The topo-ordered nodes (see {@link topoOrderStoryNodes}); driven strictly in this order. */
  order: readonly NodeSpec[];
  buildNode: StoryNodeBuilder;
  /**
   * TOTAL USD ceiling across every node in the run (the plan's Phase-0 per-node-budget call, at
   * the story grain). Checked fail-closed BEFORE each node: once spend reaches the ceiling, the
   * run halts with a typed budget-exhausted reason rather than starting another leaf.
   */
  budgetUsd?: number;
}

/** The outcome of {@link runStoryBuild}. `passed` is true iff EVERY node signed a pass. */
export interface StoryBuildRun {
  /** One outcome per node that signed a pass, in drive order (the successful prefix on a halt). */
  outcomes: StoryNodeOutcome[];
  /** True iff every node in `order` produced a signed pass. A halted run is NEVER `passed`. */
  passed: boolean;
  halted: boolean;
  /** Zero-based index into `order` of the node the run halted at. */
  haltedAt?: number;
  /** Why it halted: the node's fail-closed reason, or the budget-exhausted refusal. */
  reason?: string;
  /** Total SDK-reported spend across all nodes that ran (including a failed one's spend). */
  totalCostUsd: number;
}

/**
 * Drive a story's nodes through the gate in order, fail-closed. The loop is {@link runSequence}
 * verbatim — each node is one step; a node that fails closed (or a budget-exhausted refusal)
 * becomes the step's `{ ok:false }` result, which HALTS the sequence and can never be papered
 * over into a pass (sequence.ts's guard). The failure detail rides the StepResult's `detail`;
 * its `error` tag is the closest agent-vocabulary fit (`ModelError`), not a semantic claim.
 */
export async function runStoryBuild(args: StoryBuildArgs): Promise<StoryBuildRun> {
  const outcomes: StoryNodeOutcome[] = [];
  let spent = 0;

  const run = await runSequence<StoryNodeOutcome>((_prev, index) => async () => {
    const spec = args.order[index];
    if (spec === undefined) {
      return { ok: false, error: "ModelError", detail: `no node at order index ${index}` };
    }

    // Fail-closed budget wall BEFORE the node spends anything (plan §3 Phase E: "enforce the
    // per-node budget"). A run that dies here leaves the already-signed prefix standing.
    if (args.budgetUsd !== undefined && spent >= args.budgetUsd) {
      return {
        ok: false,
        error: "ModelError",
        detail:
          `budget exhausted: $${spent.toFixed(4)} of the $${args.budgetUsd.toFixed(2)} ceiling ` +
          `spent before "${spec.id}" could run`,
      };
    }
    const remaining = args.budgetUsd === undefined ? undefined : Math.max(0, args.budgetUsd - spent);

    const { result, costUsd } = await args.buildNode(spec, index, remaining);
    spent += costUsd ?? 0;

    if (!result.ok) {
      return {
        ok: false,
        error: "ModelError",
        detail: `${spec.id} failed closed at ${result.failedAt}: ${result.reason}`,
      };
    }
    const outcome: StoryNodeOutcome = { unitId: spec.id, result, costUsd: costUsd ?? 0 };
    outcomes.push(outcome);
    return {
      ok: true,
      output: `${spec.id}: signed ${result.verdict.outcome}`,
      structuredOutput: outcome,
      transcript: [],
    };
  }, args.order.length);

  const passed = !run.halted && outcomes.length === args.order.length;
  return {
    outcomes,
    passed,
    halted: run.halted,
    ...(run.haltedAt !== undefined ? { haltedAt: run.haltedAt } : {}),
    ...(run.failure !== undefined ? { reason: run.failure.detail ?? run.failure.error } : {}),
    totalCostUsd: spent,
  };
}

/** The result of {@link topoOrderStoryNodes}: the drive order, or a fail-closed refusal. */
export type TopoResult =
  | { ok: true; order: NodeSpec[] }
  | { ok: false; reason: string };

/**
 * Topo-order a story's nodes for the Phase-E drive: the capabilities sorted by their `depends_on`
 * edges (Kahn's algorithm, alphabetical tie-break so the order is DETERMINISTIC), then the story
 * itself LAST (its UAT integrates what the capabilities proved — ADR-0010's ladder).
 *
 * Fail-closed on every malformed input rather than guessing: a non-story root, a capability
 * listed in the story's frontmatter but not provided (or vice versa), a `depends_on` edge that
 * leaves the story's capability set, and a dependency cycle are all refusals.
 */
export function topoOrderStoryNodes(
  story: NodeSpec,
  capabilities: readonly NodeSpec[],
): TopoResult {
  if (story.tier !== "story") {
    return { ok: false, reason: `"${story.id}" is tier ${story.tier}, not a story` };
  }

  const provided = new Map<string, NodeSpec>();
  for (const cap of capabilities) {
    if (provided.has(cap.id)) {
      return { ok: false, reason: `capability "${cap.id}" provided twice` };
    }
    provided.set(cap.id, cap);
  }
  const listed = new Set(story.capabilities);
  for (const id of listed) {
    if (!provided.has(id)) {
      return { ok: false, reason: `story "${story.id}" lists capability "${id}" but no spec was loaded for it` };
    }
  }
  for (const cap of capabilities) {
    if (!listed.has(cap.id)) {
      return { ok: false, reason: `capability "${cap.id}" is not in story "${story.id}"'s capabilities list` };
    }
    for (const dep of cap.dependsOn) {
      if (!listed.has(dep)) {
        return {
          ok: false,
          reason: `capability "${cap.id}" depends on "${dep}", which is outside story "${story.id}"'s capability set`,
        };
      }
    }
  }

  // Kahn's algorithm with an alphabetical ready-queue: same inputs => same order, always.
  const remaining = new Map<string, Set<string>>();
  for (const cap of capabilities) {
    remaining.set(cap.id, new Set(cap.dependsOn));
  }
  const order: NodeSpec[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, deps]) => deps.size === 0)
      .map(([id]) => id)
      .sort();
    const next = ready[0];
    if (next === undefined) {
      const stuck = [...remaining.keys()].sort().join(", ");
      return { ok: false, reason: `dependency cycle among capabilities: ${stuck}` };
    }
    remaining.delete(next);
    for (const deps of remaining.values()) {
      deps.delete(next);
    }
    const spec = provided.get(next);
    if (spec !== undefined) order.push(spec);
  }

  order.push(story);
  return { ok: true, order };
}

/** The mode a whole-story build runs in (the CLI `storytree story build` mode words). */
export type StoryBuildMode = "live" | "real";

/**
 * The nodes a `story build <id>` would actually DRIVE: the topo-ordered capabilities (and the
 * story's own UAT node LAST) — but the story node is WITHHELD when the story is human-witnessed
 * (the ADR-0040 fail-closed default), because the gate refuses to drive or sign a human UAT. This
 * mirrors `storyBuild`'s `driveOrder` exactly, so any consumer (the studio's story-level Build
 * affordance) computes the SAME set the build will run, never a drifting guess. A topo refusal
 * (malformed story, missing/extra cap, out-of-set dep, cycle) propagates as `{ ok: false }`.
 */
export function storyDriveOrder(
  story: NodeSpec,
  capabilities: readonly NodeSpec[],
): TopoResult {
  const topo = topoOrderStoryNodes(story, capabilities);
  if (!topo.ok) return topo;
  const withheld = effectiveUatWitness(story.uatWitness) === "human";
  return { ok: true, order: withheld ? topo.order.slice(0, -1) : topo.order };
}

/**
 * Whether `story build <id> --<mode>` has real work to drive: a NON-EMPTY drive order
 * ({@link storyDriveOrder}) whose every driven node carries the proof config that mode needs —
 * `resolveBuildConfig != null` for `live`, and additionally a `real:` arm for `real`. This is the
 * SAME fail-closed determination `storyBuild`'s precheck makes, so the studio's story-level Build
 * affordance can never offer a build the gate would refuse, and never withhold one it would run.
 *
 * Honest by construction: a capless story (e.g. `agent`) or an all-unbuildable one (e.g.
 * `drive-machinery`) is NOT story-buildable; an all-real-buildable story (`notice-board`,
 * `binding-staleness`) is. A machine-witnessed story whose own UAT node lacks a `real:` arm (e.g.
 * `library` today — its node is driven, not withheld) is not `real`-buildable until that node can
 * be driven for real. The deeper per-node refusals (install⇒typecheck) still fire inside the build;
 * this answers only the affordance — "is there a real build to offer here?".
 */
export function isStoryBuildable(
  story: NodeSpec,
  capabilities: readonly NodeSpec[],
  mode: StoryBuildMode,
): boolean {
  const drive = storyDriveOrder(story, capabilities);
  if (!drive.ok || drive.order.length === 0) return false;
  return drive.order.every((node) => {
    const resolved = resolveBuildConfig(node);
    if (resolved === null) return false;
    return mode === "real" ? resolved.config.real !== undefined : true;
  });
}
