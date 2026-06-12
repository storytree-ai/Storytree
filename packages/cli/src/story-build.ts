import path from "node:path";

import type { ClaudeAgentAuthor } from "@storytree/agent";
import { effectiveUatWitness, resolveSignerFromEnv, rollupStatus } from "@storytree/core";
import {
  findNodeSpecFile,
  loadNodeSpec,
  lookupNodeBuildConfig,
  registeredNodeIds,
  runStoryBuild,
  topoOrderStoryNodes,
} from "@storytree/orchestrator";
import type { NodeSpec, ProveResult } from "@storytree/orchestrator";

import type { AmbientDeps } from "./ambient-presence.js";
import type { Envelope } from "./envelope.js";
import { driveNode, repoRoot, rel, resolveVerdictStore } from "./node-build.js";
import { deriveIdentity } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";
import { oqHygieneGate, type OqGateDeps } from "./oq-gate.js";

/**
 * `storytree story build <story-id>` (drive-machinery Phase E): a THIN topo-ordered loop over a
 * story's nodes — every capability in `depends_on` order, then the story itself — each driven
 * through the SAME single-node prove-it-gate walk `node build` uses ({@link driveNode}), over ONE
 * shared store and runId so the rollup derives every node's status from one event log. The loop
 * is the orchestrator's {@link runStoryBuild} (runSequence underneath): a node that fails closed
 * HALTS the story, later nodes never run, and a halted run is NEVER a pass.
 *
 * Live runs carry a TOTAL budget ceiling (default $10), checked fail-closed before each node;
 * each authoring slice is additionally capped at min($1, remaining) via the SDK's own enforcement.
 *
 * The story's own UAT node is driven only when the story declares `uat_witness: machine`
 * (ADR-0040). Absent or `human` — the fail-closed default — the gate builds the capabilities and
 * WITHHOLDS the story node: a machine never drives or signs a human-witnessed ceremony.
 */

/** The default TOTAL ceiling for a live story run (ADR-0005's per-node budget, at story grain). */
const DEFAULT_STORY_BUDGET_USD = 10;
/** The per-authoring-slice cap inside a story run (the `node build --live` default). */
const SLICE_BUDGET_USD = 1;

const HONEST_FRAMING_STORY_DRY =
  "honest framing: a story dry-run proves the CHAINING — capabilities topo-ordered from depends_on,\n" +
  "each walked through the gate, the story's UAT node last, halt-is-never-a-pass, per-node rollups\n" +
  "derived from ONE event log — NOT the nodes' actual proofs: every leaf is scripted and every\n" +
  "red→green synthetic in a temp workspace. Authored statuses are untouched; the verdicts landed\n" +
  "in an in-memory store and are gone.";

function honestFramingStoryLive(persisted: boolean): string {
  return (
    "honest framing: a live story build proves the CHAIN with a REAL Claude Agent SDK leaf per node\n" +
    "(ADR-0030, subscription-funded) under the total budget ceiling — genuine authoring, hook-held\n" +
    "write walls, spine-observed red→green per node. The TASK per node is still the synthetic\n" +
    "add(2,3) pair in a temp workspace (`node build --real` is the per-node real path; chaining\n" +
    "REAL builds is later work). Authored statuses are untouched; " +
    (persisted
      ? "the signed verdicts PERSISTED to\nthe shared store (events.verdict)."
      : "the verdicts landed in an\nin-memory store and are gone.")
  );
}

export interface StoryBuildOpts {
  dryRun: boolean;
  /** `--live` — a real SDK leaf per node, subscription-funded, under the total budget ceiling. */
  live?: boolean;
  /** `--model` — the SDK leaf's model (live only). */
  model?: string;
  /** `--budget` — TOTAL USD ceiling across every node (live only). Default: 10. */
  budgetUsd?: number;
  /** `--actor` — the signer chain's flag tier. */
  actor?: string;
  /** `--store` — the verdict store: absent = in-memory, `pg` = the live work tables (live only). */
  verdictStore?: string;
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
  /** Injectable OQ-hygiene row loader for tests (ADR-0037 §5); defaults to the live store. */
  oqGateDeps?: OqGateDeps;
  /**
   * Injectable for tests (ADR-0033 Decision 3). Defaults: `store` = the `--store pg` pool's
   * presence board (null in-memory), `identity` = the enclosing session worktree (null in a
   * plain checkout) — null on either side makes presence a silent no-op.
   */
  presence?: { store?: PresenceStoreLike | null; identity?: SessionIdentity | null };
}

/** `storytree story build <story-id>` — the whole Phase-E walk, returned as one envelope. */
export async function storyBuild(
  storyId: string | undefined,
  opts: StoryBuildOpts,
): Promise<Envelope> {
  if (storyId === undefined) {
    return {
      ok: false,
      body: "story build needs a story id: storytree story build <story-id> --dry-run | --live",
      next: ["storytree story build library --dry-run"],
    };
  }
  const live = opts.live === true;
  const picked = [opts.dryRun, live].filter(Boolean).length;
  if (picked !== 1) {
    return {
      ok: false,
      body:
        "pick exactly one mode:\n" +
        "  --dry-run   offline scripted walk of every node, topo-ordered (zero cost)\n" +
        "  --live      a real Claude Agent SDK leaf per node (subscription-funded) under a TOTAL\n" +
        "              budget ceiling (--budget, default $10; each slice capped at $1)",
      next: [
        `storytree story build ${storyId} --dry-run`,
        `storytree story build ${storyId} --live`,
      ],
    };
  }
  const mode = live ? "live" : "dry-run";

  // Fail-closed before any work: a verdict must be attributable.
  const signer = resolveSignerFromEnv(
    opts.actor !== undefined ? { flag: opts.actor } : {},
  );
  if (!signer.ok) {
    return {
      ok: false,
      body: `no signer resolved — a verdict must be attributable.\n${signer.error}`,
      next: [`storytree story build ${storyId} --dry-run --actor <email>`],
    };
  }

  // Load the story spec, then every capability it lists.
  const storiesDir = opts.storiesDir ?? path.join(repoRoot(), "stories");
  const storyFile = findNodeSpecFile(storiesDir, storyId);
  if (storyFile === null) {
    return {
      ok: false,
      body: `no story spec "${storyId}" under ${storiesDir} (looked for ${storyId}/story.md).`,
      next: ["storytree story build library --dry-run"],
    };
  }
  let story: NodeSpec;
  const capabilities: NodeSpec[] = [];
  try {
    story = loadNodeSpec(storyFile);
    for (const capId of story.capabilities) {
      const capFile = findNodeSpecFile(storiesDir, capId);
      if (capFile === null) {
        return {
          ok: false,
          body: `story "${story.id}" lists capability "${capId}" but no spec file exists for it under ${storiesDir}.`,
          next: [`storytree story build ${story.id} --dry-run`],
        };
      }
      capabilities.push(loadNodeSpec(capFile));
    }
  } catch (e) {
    return {
      ok: false,
      body: `a node spec failed to load:\n${(e as Error).message}`,
      next: ["storytree story build <story-id> --dry-run"],
    };
  }

  const topo = topoOrderStoryNodes(story, capabilities);
  if (!topo.ok) {
    return {
      ok: false,
      body: `the story's nodes cannot be ordered: ${topo.reason}`,
      next: [`storytree story build ${story.id} --dry-run`],
    };
  }
  const order = topo.order;

  // ADR-0040: a story's UAT is a HUMAN-witnessed ceremony unless the story declares
  // `uat_witness: machine` — the gate refuses to drive or sign it. The capability nodes still
  // build; the story node (always last in the topo order) is WITHHELD from the chain, so a
  // machine run can never mint the story's own verdict. Absent = human, fail-closed.
  const witness = effectiveUatWitness(story.uatWitness);
  const storyWithheld = witness === "human";
  const driveOrder = storyWithheld ? order.slice(0, -1) : order;

  // Registry precheck for every node the run will DRIVE, fail-closed before any node runs (and
  // before any spend): registration is the deliberate act that makes a node driveable. A
  // withheld story UAT node needs no registry entry — the gate never drives it.
  const unregistered = driveOrder
    .filter((n) => lookupNodeBuildConfig(n.id) === null)
    .map((n) => n.id);
  if (unregistered.length > 0) {
    return {
      ok: false,
      body:
        `story "${story.id}" has nodes with no test-command registry entry: ${unregistered.join(", ")}\n` +
        `register how to prove them first. registered: ${registeredNodeIds().join(", ")}`,
      next: ["storytree node build <id> --dry-run"],
    };
  }

  // ADR-0037 §5: open-question hygiene gates a LIVE build, before any store setup or spend.
  // An unprocessed operator answer on a deciding ADR's OQ refuses the run; offline never refuses.
  const hygiene = await oqHygieneGate(story, live, opts.oqGateDeps ?? {});
  if (hygiene.refusal !== null) return hygiene.refusal;

  const storeChoice = await resolveVerdictStore(
    opts.verdictStore,
    mode === "dry-run",
    `storytree story build ${story.id} --live`,
  );
  if (!storeChoice.ok) return storeChoice.refusal;
  const { store, persisted } = storeChoice;

  // The presence board around each node (ADR-0033 Decision 3, spine-side — no hooks): one
  // declaration doc per session, re-declared per node as the chain advances; every board failure
  // swallowed by withPresence inside driveNode — presence can never halt a story.
  const ambient: AmbientDeps = {
    store: opts.presence?.store !== undefined ? opts.presence.store : storeChoice.presence,
    identity:
      opts.presence?.identity !== undefined ? opts.presence.identity : deriveIdentity(),
    now: () => new Date(),
  };

  const runId = `story-${mode}-${Date.now().toString(36)}`;
  const budgetUsd = live ? (opts.budgetUsd ?? DEFAULT_STORY_BUDGET_USD) : undefined;

  try {
    // Per-node side data for the report (the loop itself only sees ProveResults + costs).
    const leaves = new Map<string, ClaudeAgentAuthor>();
    const failures = new Map<string, Extract<ProveResult, { ok: false }>>();

    const run = await runStoryBuild({
      order: driveOrder,
      ...(budgetUsd !== undefined ? { budgetUsd } : {}),
      buildNode: async (spec, _index, remainingUsd) => {
        const drive = await driveNode(spec, {
          mode: live ? "live-smoke" : "dry-run",
          store,
          runId,
          signer: signer.signer,
          presence: ambient,
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(live
            ? { budgetUsd: Math.min(SLICE_BUDGET_USD, remainingUsd ?? SLICE_BUDGET_USD) }
            : {}),
        });
        if (!drive.resolved) {
          // Unreachable past the precheck, but stays fail-closed rather than trusting it.
          const result: ProveResult = {
            ok: false,
            failedAt: "AUTHOR_TEST",
            reason: drive.reason,
            phasesVisited: [],
          };
          return { result };
        }
        if (drive.liveAuthor !== undefined) leaves.set(spec.id, drive.liveAuthor);
        if (!drive.result.ok) failures.set(spec.id, drive.result);
        return {
          result: drive.result,
          ...(drive.liveAuthor !== undefined ? { costUsd: drive.liveAuthor.totalCostUsd } : {}),
        };
      },
    });

    // Per-node report lines off the ONE shared event log.
    const events = await store.readEvents();
    const width = Math.max(...order.map((n) => n.id.length));
    const nodeLines = order.map((spec, i) => {
      const label = `${String(i + 1).padStart(2)}. ${spec.id.padEnd(width)}`;
      const leaf = leaves.get(spec.id);
      const cost = leaf !== undefined ? `  $${leaf.totalCostUsd.toFixed(4)}` : "";
      if (storyWithheld && spec.tier === "story") {
        return `  ${label}  WITHHELD — uat_witness: human${story.uatWitness === undefined ? " (the default)" : ""}: a human must witness this UAT; the gate refuses to drive or sign it`;
      }
      if (i < run.outcomes.length) {
        const derived = rollupStatus(spec.id, events);
        return `  ${label}  PASS   rollup: ${derived ?? "(none)"}${cost}`;
      }
      if (run.halted && i === run.haltedAt) {
        const failure = failures.get(spec.id);
        const where = failure !== undefined ? ` at ${failure.failedAt}` : "";
        return `  ${label}  HALT${where} — ${run.reason ?? "failed closed"}${cost}`;
      }
      return `  ${label}  —      never ran (the run halted earlier; halt is never a pass)`;
    });

    const header = [
      `story build ${story.id} — ${mode.toUpperCase()}`,
      "",
      `spec:        ${rel(storyFile)}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      `store:       ${storeChoice.label}`,
      `budget:      ${budgetUsd !== undefined ? `$${budgetUsd.toFixed(2)} total ceiling (each slice capped at $${SLICE_BUDGET_USD.toFixed(2)})` : "none — a dry-run spends nothing"}`,
      `order:       ${order.map((n) => n.id).join(" → ")}`,
      `             (${capabilities.length} capabilities topo-ordered from depends_on, then the story's UAT node)`,
      `uat witness: ${witness}${story.uatWitness === undefined ? " (undeclared — the fail-closed default, ADR-0040)" : " (declared)"}${storyWithheld ? " — the story UAT node is withheld from the gate" : ""}`,
      ...hygiene.lines,
      "",
      ...nodeLines,
      "",
      `nodes:       ${run.outcomes.length}/${driveOrder.length} signed passes${storyWithheld ? " (the story UAT node awaits its human witness)" : ""}`,
      `total cost:  $${run.totalCostUsd.toFixed(4)} SDK-reported`,
    ];
    const framing = live ? honestFramingStoryLive(persisted) : HONEST_FRAMING_STORY_DRY;

    if (!run.passed) {
      return {
        ok: false,
        body: [
          ...header,
          `outcome:     HALTED at node ${(run.haltedAt ?? 0) + 1}/${driveOrder.length} — ${run.reason ?? "failed closed"}`,
          "",
          framing,
        ].join("\n"),
        next: [`storytree story build ${story.id} ${live ? "--live" : "--dry-run"}`],
      };
    }
    if (storyWithheld) {
      return {
        ok: true,
        body: [
          ...header,
          `outcome:     capabilities PASSED (${run.outcomes.length}/${driveOrder.length} signed); the story's UAT node was WITHHELD —`,
          `             uat_witness is human${story.uatWitness === undefined ? " (the undeclared default)" : ""}, so the gate refuses to drive or sign the story UAT.`,
          `             The story stays unproven until a human witnesses its UAT; declare`,
          `             uat_witness: machine in the story frontmatter to let the gate drive it.`,
          "",
          framing,
        ].join("\n"),
        next: [
          `storytree node build <id> --real   (one node's REAL proof in a fresh worktree)`,
        ],
      };
    }
    return {
      ok: true,
      body: [
        ...header,
        `outcome:     PASSED — every node signed (capabilities in dependency order, story last)`,
        "",
        framing,
      ].join("\n"),
      next: [
        `storytree story build ${story.id} --live   (a real SDK leaf per node, budget-ceilinged)`,
        "storytree node build <id> --real   (one node's REAL proof in a fresh worktree)",
      ],
    };
  } finally {
    await storeChoice.close();
  }
}

export function storyHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree story — drive a WHOLE story through the prove-it-gate (drive-machinery Phase E).",
      "",
      "  storytree story build <story-id> --dry-run [--actor <email>]",
      "      topo-order the story's capabilities from depends_on, walk each through",
      "      AUTHOR_TEST → … → GATE with a scripted model, then the story's UAT node last.",
      "      One shared event log; a node that fails closed HALTS the run (never a pass).",
      "      Zero API cost, no live DB.",
      "",
      "  uat_witness (ADR-0040): a story's UAT node is driven only when the story frontmatter",
      "      declares uat_witness: machine. Absent (or human) = a human must witness the UAT —",
      "      the gate builds the capabilities and WITHHOLDS the story node, fail-closed.",
      "",
      "  storytree story build <story-id> --live [--budget <usd>] [--model <id>] [--actor <email>]",
      "      the same chain with a REAL Claude Agent SDK leaf per node (subscription-funded).",
      "      --budget is the TOTAL ceiling across every node (default $10), enforced fail-closed",
      "      before each node; each authoring slice is additionally capped at $1.",
      "",
      "  --store pg   (--live only) persist building marks + signed verdicts to the live work",
      "      tables (events.work_event/events.verdict). Refused for --dry-run (forged-healthy guard).",
      "",
      "buildable stories: those whose story + capabilities all have registry entries (today: library).",
    ].join("\n"),
    next: ["storytree story build library --dry-run"],
  };
}
