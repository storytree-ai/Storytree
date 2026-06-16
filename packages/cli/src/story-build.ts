import path from "node:path";

import type { ClaudeAgentAuthor, PhaseAuthor } from "@storytree/agent";
import { InMemoryStore, effectiveUatWitness, resolveSignerFromEnv, rollupStatus } from "@storytree/core";
import type { AdrMeta, Store } from "@storytree/core";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  promoteRealPass,
  registeredNodeIds,
  resolveBuildConfig,
  runRegressionSuite,
  runStoryBuild,
  runWorktreeTypecheck,
  topoOrderStoryNodes,
} from "@storytree/orchestrator";
import type {
  AddDepsGroup,
  BuildWorktree,
  LeafPhasePrompts,
  NodeSpec,
  PromotionResult,
  ProveResult,
} from "@storytree/orchestrator";

import type { AmbientDeps } from "./ambient-presence.js";
import { effectiveVerdictStore, ensureLiveDb } from "./db-control.js";
import type { EnsureDbResult } from "./db-control.js";
import type { Envelope } from "./envelope.js";
import {
  buildNodeReal,
  driveNode,
  realConfigRefusal,
  renderLeafPhasePrompts,
  repoRoot,
  rel,
  resolveAddDepsGroup,
  resolveDbProofEnv,
  resolveVerdictStore,
} from "./node-build.js";
import { loadAdrMetas } from "./adr-health.js";
import { CURATOR_ACTOR, ScriptedCuratorRunner, runCurationPass } from "./curate.js";
import type { CommentSink, CuratorRunner } from "./curate.js";
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

function honestFramingStoryReal(persisted: boolean, promotion: PromotionResult | undefined): string {
  const landing =
    promotion === undefined
      ? "nothing was promoted (see the promotion line above)"
      : promotion.pushed
        ? `the whole proven chain is PARKED on ${promotion.branch} and pushed — land it via ONE\nNON-SQUASH PR (every node's verdict commit must stay an ancestor of main, ADR-0031)`
        : `the proven chain is PARKED LOCAL-ONLY on ${promotion.branch} (not pushed — ${promotion.detail});\na partial/halted or backstop-red chain is preserved for forensics, never offered as a landing candidate`;
  return (
    "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node was driven through the\n" +
    "FULL prove-it-gate for real — the leaf authored its REAL test/impl at real paths under\n" +
    "hook-enforced write scope, the spine observed the genuine red→green and committed the authored\n" +
    "files — in ONE shared worktree in dependency order, so each node built on the committed result of\n" +
    "the nodes before it (the story grows). Halt-is-never-a-pass holds: a node failing closed halts the\n" +
    `chain and later nodes never run. ${landing}.` +
    (persisted
      ? "\nThe signed verdicts PERSISTED to the shared store (events.verdict — the rollup derives each\nnode's status across sessions)."
      : "\nThe verdicts landed in an in-memory store and are gone.")
  );
}

export interface StoryBuildOpts {
  dryRun: boolean;
  /** `--live` — a real SDK leaf per node, subscription-funded, under the total budget ceiling. */
  live?: boolean;
  /**
   * `--real` (ADR-0057 §3 expansion D) — chain `node build --real` over the WHOLE story: each node
   * authored for real in ONE shared worktree in dependency order, signed, then the proven chain
   * promoted ONCE at the stacked HEAD. Subscription-funded, under the total budget ceiling.
   */
  real?: boolean;
  /** `--model` — the SDK leaf's model (live/real only). */
  model?: string;
  /** `--budget` — TOTAL USD ceiling across every node (live/real only). Default: 10. */
  budgetUsd?: number;
  /** `--max-turns` — per-authoring-slice turn ceiling, SDK-enforced (live/real only). */
  maxTurns?: number;
  /** `--actor` — the signer chain's flag tier. */
  actor?: string;
  /**
   * `--store` — the verdict store. For `--live`/`--real` it DEFAULTS to `pg` (the build owns the DB,
   * ADR-0060); `memory` opts out. For `--dry-run`, absent = in-memory and `pg` is refused (ADR-0020).
   */
  verdictStore?: string;
  /**
   * Injectable for tests (ADR-0060): the live-store preflight for a persisting `--live`/`--real`
   * chain. Default = {@link ensureLiveDb} (probe → `db:up` + wait when the instance is down).
   */
  ensureDb?: (log: (message: string) => void) => Promise<EnsureDbResult>;
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
  /** Injectable repo root for `--real` worktree + promotion (tests use a fixture repo); defaults to repoRoot(). */
  repoRoot?: string;
  /**
   * Injectable per-node leaf factory for OFFLINE `--real` tests (a scripted {@link PhaseAuthor} per
   * node, via the resolver's authorOverride seam); defaults to the live SDK leaf. Receives the
   * shared worktree root so the scripted author can write into it (the worktree is cut inside this
   * function, so the test cannot construct the author beforehand).
   */
  authorOverride?: (spec: NodeSpec, worktreeRoot: string) => PhaseAuthor | undefined;
  /**
   * Promote a green `--real` chain (default true). Tests that exercise the chain WITHOUT touching a
   * remote pass `false` (drive + sign + commit, no branch/push); the promotion path is proven
   * separately against a fixture bare-origin repo.
   */
  promote?: boolean;
  /** Injectable OQ-hygiene row loader for tests (ADR-0037 §5); defaults to the live store. */
  oqGateDeps?: OqGateDeps;
  /**
   * ADR-0067 — the post-green curation pass. `curatorRunner` defaults to a no-op
   * {@link ScriptedCuratorRunner} (the live SDK-spawned librarian-curator lands in a follow-up
   * slice). `curationStores.library` is what the pass reads OQs/proposals from and enacts against:
   * absent on a `--dry-run` defaults to a fresh in-memory store (the offline GLUE proof); absent on
   * `--live`/`--real` defaults to `null` (deferred — the live runner wires the live stores). Tests
   * inject both to exercise enactment. `decisionsDir` feeds the ADR context (defaults to the repo's).
   */
  curatorRunner?: CuratorRunner;
  curationStores?: { library: Store | null; comments?: CommentSink | null };
  decisionsDir?: string;
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
      body: "story build needs a story id: storytree story build <story-id> --dry-run | --live | --real",
      next: ["storytree story build library --dry-run"],
    };
  }
  const live = opts.live === true;
  const real = opts.real === true;
  const picked = [opts.dryRun, live, real].filter(Boolean).length;
  if (picked !== 1) {
    return {
      ok: false,
      body:
        "pick exactly one mode:\n" +
        "  --dry-run   offline scripted walk of every node, topo-ordered (zero cost)\n" +
        "  --live      a real Claude Agent SDK leaf per node (subscription-funded), SYNTHETIC task,\n" +
        "              under a TOTAL budget ceiling (--budget, default $10; each slice capped at $1)\n" +
        "  --real      ADR-0057 §3 expansion D: chain node build --real over the WHOLE story —\n" +
        "              each node authored for real in ONE shared worktree in dependency order, signed,\n" +
        "              the proven chain promoted ONCE at the stacked HEAD (a halt parks the prefix\n" +
        "              local-only). Subscription-funded; same total budget ceiling",
      next: [
        `storytree story build ${storyId} --dry-run`,
        `storytree story build ${storyId} --live`,
        `storytree story build ${storyId} --real`,
      ],
    };
  }
  const mode = real ? "real" : live ? "live" : "dry-run";
  const rootDir = opts.repoRoot ?? repoRoot();

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

  // Build-config precheck for every node the run will DRIVE, fail-closed before any node runs (and
  // before any spend): declaring how to prove a node is the deliberate act that makes it driveable.
  // Spec-borne first (ADR-0057), registry fallback — same resolver the build path uses, so a story
  // of self-registered nodes (spec `proof:` blocks, no registry entries) is no longer falsely
  // refused here. A withheld story UAT node needs no proof config — the gate never drives it.
  const unregistered = driveOrder
    .filter((n) => resolveBuildConfig(n) === null)
    .map((n) => n.id);
  if (unregistered.length > 0) {
    return {
      ok: false,
      body:
        `story "${story.id}" has nodes with no proof config: ${unregistered.join(", ")}\n` +
        `declare a \`proof:\` block in each node's spec (ADR-0057) or register it. ` +
        `registered: ${registeredNodeIds().join(", ")}`,
      next: ["storytree node build <id> --dry-run"],
    };
  }

  // REAL mode additionally requires every DRIVEN node to be real-buildable (a `real:` arm, and
  // install⇒typecheck), checked before any worktree is cut — the SAME realConfigRefusal node build
  // --real uses. NOTE: a `uat_witness: machine` story whose story node lacks a `real:` arm is
  // refused HERE (its UAT is not a test-file red→green — that is gate-as-proof, expansion E), so D
  // refuses rather than pretends.
  if (real) {
    for (const n of driveOrder) {
      const refusal = realConfigRefusal(n, resolveBuildConfig(n)?.config ?? null, storiesDir);
      if (refusal !== null) return refusal;
    }
  }

  // ADR-0064: if any driven node is db-backed, compute + assert the isolated test-DB env ONCE for the
  // chain (fail-closed against prod) before any worktree, and require the instance up below.
  let dbProofEnv: Record<string, string> | undefined;
  const anyDb = real && driveOrder.some((n) => resolveBuildConfig(n)?.config.real?.db === true);
  if (anyDb) {
    const resolvedDb = resolveDbProofEnv();
    if (!resolvedDb.ok) return resolvedDb.refusal;
    dbProofEnv = resolvedDb.env;
  }

  // ADR-0064 §2: aggregate spine-driven dep-add groups across the chain's nodes (resolved BEFORE any
  // worktree; the ONE shared worktree gets every group). Fail-closed if any node's target package
  // can't be derived from its sourceFile.
  const addDepsGroups: AddDepsGroup[] = [];
  if (real) {
    for (const n of driveOrder) {
      const r = resolveBuildConfig(n)?.config.real;
      if (r === undefined) continue;
      const resolvedDeps = resolveAddDepsGroup(r);
      if (!resolvedDeps.ok) return resolvedDeps.refusal;
      if (resolvedDeps.group !== null) addDepsGroups.push(resolvedDeps.group);
    }
  }

  // ADR-0060: a live/real story chain OWNS the database — `--store` defaults to `pg`, and the
  // preflight ENSURES the instance is up (probe → `db:up` + wait if down) BEFORE anything that
  // touches it: the oq-hygiene gate's live loader composes the PgLibraryStore, and the verdict store
  // is pg. `--store memory` opts out; `--dry-run` is untouched (in-memory, never the DB).
  const retryCmd = `storytree story build ${story.id} ${real ? "--real" : "--live"}`;
  const effectiveStore = effectiveVerdictStore(opts.verdictStore, mode === "dry-run");
  // The instance must be up to PERSIST verdicts (--store pg) AND to run any db-backed proof in the
  // chain (ADR-0064: the proof connects to the test DB on this instance even with --store memory).
  const needsDb = (effectiveStore === "pg" && mode !== "dry-run") || anyDb;
  if (needsDb) {
    const ensureDb = opts.ensureDb ?? ensureLiveDb;
    const ready = await ensureDb((m) => console.error(`[db] ${m}`));
    if (!ready.ok) {
      return {
        ok: false,
        body:
          (anyDb
            ? `this build runs a db-backed proof (real.db:true), but the database could not be brought up:\n`
            : `this build persists to the live store, but the database could not be brought up:\n`) +
          ready.reason,
        next: [
          "pnpm db:status",
          ...(anyDb
            ? []
            : [`${retryCmd} --store memory   (run WITHOUT persisting — no studio wisp/bloom)`]),
        ],
      };
    }
  }

  // ADR-0037 §5: open-question hygiene gates a LIVE/REAL build, before any store setup or spend.
  // An unprocessed operator answer on a deciding ADR's OQ refuses the run; offline never refuses.
  const hygiene = await oqHygieneGate(story, live || real, opts.oqGateDeps ?? {});
  if (hygiene.refusal !== null) return hygiene.refusal;

  // ADR-0051 §4: assemble the live SDK leaf's per-phase system prompt from the Library once for the
  // whole chain (red-builder → AUTHOR_TEST, green-builder → IMPLEMENT). Fail-loud before any spend —
  // a live/real build runs the Library agent, never a generic. The dry-run owned loop needs no prompt.
  let phasePrompts: LeafPhasePrompts | undefined;
  if (live || real) {
    const rendered = await renderLeafPhasePrompts();
    if (!rendered.ok) return rendered.refusal;
    phasePrompts = rendered.prompts;
  }

  const storeChoice = await resolveVerdictStore(effectiveStore, mode === "dry-run", retryCmd);
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
  const budgetUsd = live || real ? (opts.budgetUsd ?? DEFAULT_STORY_BUDGET_USD) : undefined;

  // The verdict store (and its pg pool/connector) is already open; cut the worktree INSIDE the try
  // so its `finally` ALWAYS closes the store — `createBuildWorktree` can throw (a failed `git
  // worktree add`, or a `pnpm install` failure it tears down and rethrows), and a throw before this
  // try would leak the Cloud SQL pool for the process lifetime.
  let worktree: BuildWorktree | undefined;
  try {
    // REAL mode: ONE shared worktree for the whole chain — each node authors + commits into it in
    // dependency order, so a later node sees earlier nodes' spine-committed source (intra-story deps
    // resolve; a fresh-per-node worktree off HEAD could not). Installed once iff ANY driven node
    // declares install (story-grain). Removed in this `finally` — AFTER the end-of-chain promotion,
    // whose branch lives in the shared object store and survives the worktree's removal.
    if (real) {
      const anyInstall = driveOrder.some(
        (n) => resolveBuildConfig(n)?.config.real?.install === true,
      );
      worktree = await createBuildWorktree(rootDir, {
        ...(anyInstall ? { install: true } : {}),
        ...(addDepsGroups.length > 0 ? { addDeps: addDepsGroups } : {}),
      });
    }

    // Per-node side data for the report (the loop itself only sees ProveResults + costs).
    const leaves = new Map<string, ClaudeAgentAuthor>();
    const failures = new Map<string, Extract<ProveResult, { ok: false }>>();
    // The REAL chain's stacked HEAD: advances to each node's verdict commit as it passes, so the
    // next node builds on top. Promotion at chain end points at THIS, not the stale worktree cut.
    let currentHead = worktree?.headSha ?? "";

    const run = await runStoryBuild({
      order: driveOrder,
      ...(budgetUsd !== undefined ? { budgetUsd } : {}),
      buildNode: async (spec, _index, remainingUsd) => {
        if (real) {
          // The REAL per-node build in the SHARED worktree (promote:false — the chain promotes once
          // at the end). Each node walks the full prove-it-gate; honesty walls are per node.
          const cfg = resolveBuildConfig(spec)?.config ?? null;
          if (cfg === null || cfg.real === undefined || worktree === undefined || phasePrompts === undefined) {
            // Unreachable past the real precheck + prompt assembly, but stays fail-closed.
            const result: ProveResult = {
              ok: false,
              failedAt: "AUTHOR_TEST",
              reason: `real build prerequisites missing for "${spec.id}"`,
              phasesVisited: [],
            };
            failures.set(spec.id, result);
            return { result };
          }
          // Resolve the test-only scripted leaf ONCE (a stateful factory must not be called twice).
          const override = opts.authorOverride?.(spec, worktree.root);
          const built = await buildNodeReal({
            spec,
            worktree,
            baseSha: currentHead,
            buildConfig: cfg,
            realConfig: cfg.real,
            store,
            runId,
            signer: signer.signer,
            phasePrompts,
            presence: ambient,
            repoRoot: rootDir,
            promote: false,
            ...(dbProofEnv !== undefined ? { dbProofEnv } : {}),
            ...(override !== undefined ? { authorOverride: override } : {}),
            ...(opts.model !== undefined ? { model: opts.model } : {}),
            budgetUsd: Math.min(SLICE_BUDGET_USD, remainingUsd ?? SLICE_BUDGET_USD),
            ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
          });
          if (built.liveAuthor !== undefined) leaves.set(spec.id, built.liveAuthor);
          if (!built.result.ok) failures.set(spec.id, built.result);
          // Advance the stacked HEAD only on a pass (commitSha is set iff result.ok; equals baseSha
          // when nothing was authored, which is a harmless no-op advance).
          if (built.commitSha !== undefined) currentHead = built.commitSha;
          return {
            result: built.result,
            ...(built.liveAuthor !== undefined ? { costUsd: built.liveAuthor.totalCostUsd } : {}),
          };
        }
        const drive = await driveNode(spec, {
          mode: live ? "live-smoke" : "dry-run",
          store,
          runId,
          signer: signer.signer,
          presence: ambient,
          ...(phasePrompts !== undefined ? { phasePrompts } : {}),
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

    // REAL chain-end promotion (ADR-0031 at story grain): ONE branch at the stacked HEAD.
    let promotion: PromotionResult | undefined;
    let promotionSkipped: string | undefined;
    const backstopLines: string[] = [];
    if (real && worktree !== undefined) {
      if (currentHead === worktree.headSha) {
        promotionSkipped = run.passed
          ? "nothing authored across the chain — every verdict attests the unchanged HEAD"
          : "the chain halted before any node signed a commit — nothing to park";
      } else if (run.passed && (opts.promote ?? true)) {
        // Backstop ONCE at the final stacked HEAD: re-observe each DISTINCT install-bearing node's
        // typecheck + package suite over the whole stack (tsx strips types — only tsc sees them; a
        // green leaf must not break its package). A red of either keeps the branch LOCAL-ONLY.
        let anyRed = false;
        const seen = new Set<string>();
        for (const n of driveOrder) {
          const cfg = resolveBuildConfig(n)?.config;
          const rc = cfg?.real;
          if (cfg === undefined || rc?.install !== true) continue;
          if (rc.typecheck !== undefined) {
            const key = `tc:${rc.typecheck.file} ${rc.typecheck.args.join(" ")}`;
            if (!seen.has(key)) {
              seen.add(key);
              const tc = (await runWorktreeTypecheck({ command: rc.typecheck, cwd: worktree.root })).result;
              if (tc === "red") anyRed = true;
              backstopLines.push(`typecheck:   ${key.slice(3)} ${tc.toUpperCase()} at the stacked HEAD`);
            }
          }
          const skey = `suite:${cfg.command.file} ${cfg.command.args.join(" ")}`;
          if (!seen.has(skey)) {
            seen.add(skey);
            const reg = (await runRegressionSuite({ command: cfg.command, cwd: worktree.root })).result;
            if (reg === "red") anyRed = true;
            backstopLines.push(`regression:  ${skey.slice(6)} ${reg.toUpperCase()} at the stacked HEAD`);
          }
        }
        promotion = await promoteRealPass({
          repoRoot: rootDir,
          unitId: story.id,
          runId,
          commitSha: currentHead,
          ...(anyRed ? { push: false } : {}),
        });
      } else if (!run.passed) {
        // HALT with a proven prefix: park LOCAL-ONLY (preservation over loss, ADR-0031), NEVER
        // pushed — a partial story is never a landing candidate (no `gh pr create` next-line below).
        promotion = await promoteRealPass({
          repoRoot: rootDir,
          unitId: story.id,
          runId,
          commitSha: currentHead,
          push: false,
        });
      }
    }

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
      ...(real && worktree !== undefined
        ? [`worktree:    ${worktree.root} (ONE shared worktree, stacked commits in dependency order, removed after)`]
        : []),
      ...backstopLines,
      ...(promotion !== undefined
        ? [`promoted:    ${promotion.branch} @ ${promotion.commitSha.slice(0, 7)} (${promotion.detail})`]
        : []),
      ...(promotionSkipped !== undefined ? [`promotion:   skipped — ${promotionSkipped}`] : []),
    ];
    const framing = real
      ? honestFramingStoryReal(persisted, promotion)
      : live
        ? honestFramingStoryLive(persisted)
        : HONEST_FRAMING_STORY_DRY;

    if (!run.passed) {
      return {
        ok: false,
        body: [
          ...header,
          `outcome:     HALTED at node ${(run.haltedAt ?? 0) + 1}/${driveOrder.length} — ${run.reason ?? "failed closed"}`,
          ...(real && promotion !== undefined
            ? [`             the proven prefix is parked LOCAL-ONLY (${promotion.branch}) — not a landing candidate`]
            : []),
          "",
          framing,
        ].join("\n"),
        next: [`storytree story build ${story.id} ${real ? "--real" : live ? "--live" : "--dry-run"}`],
      };
    }

    // ADR-0067: the curation pass runs ONLY after a green build (never on a halt) and is advisory —
    // runCurationPass never throws, so it can never fail or block the build (never-bypass-the-gate
    // holds: curation happens AFTER the gate signed). Dry-run exercises the GLUE against an in-memory
    // library store; --live/--real defer to the live SDK curator (follow-up slice) unless stores are
    // injected. A scoped librarian-curator judges the story's open-questions / proposals.
    const curationLibrary: Store | null =
      opts.curationStores?.library !== undefined
        ? opts.curationStores.library
        : mode === "dry-run"
          ? new InMemoryStore()
          : null;
    // Load the ADR context ONLY when there is a library to curate (a deferred run never uses it), and
    // best-effort: a `--real` build runs in a fixture/worktree repo that may have no docs/decisions —
    // a missing dir means no ADR context, never a thrown build.
    let curationAdrs: AdrMeta[] = [];
    if (curationLibrary !== null) {
      try {
        curationAdrs = loadAdrMetas(opts.decisionsDir ?? path.join(rootDir, "docs", "decisions")).adrs;
      } catch {
        curationAdrs = [];
      }
    }
    const curationLines = await runCurationPass({
      runner: opts.curatorRunner ?? new ScriptedCuratorRunner(),
      library: curationLibrary,
      comments: opts.curationStores?.comments ?? null,
      context: {
        storyId: story.id,
        nodeIds: driveOrder.map((n) => n.id),
        decisions: story.decisions,
        adrs: curationAdrs,
      },
      actor: CURATOR_ACTOR,
    });

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
          ...curationLines,
          "",
          framing,
        ].join("\n"),
        next: [
          // A --real chain's capabilities are real-built + promoted even though the story UAT is
          // withheld — surface the landing candidate (this is the main --real success shape, since a
          // story UAT node has no real: arm).
          ...(real && promotion !== undefined && promotion.pushed
            ? [
                `gh pr create --head ${promotion.branch} --title "real: ${story.id} capabilities proven via the gate"   (merge NON-SQUASH — every node's verdict commit must stay an ancestor of main)`,
              ]
            : []),
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
        ...curationLines,
        "",
        framing,
      ].join("\n"),
      next: [
        ...(real && promotion !== undefined && promotion.pushed
          ? [
              `gh pr create --head ${promotion.branch} --title "real: ${story.id} story proven via the gate"   (merge NON-SQUASH — every node's verdict commit must stay an ancestor of main)`,
            ]
          : []),
        ...(real
          ? []
          : [`storytree story build ${story.id} --real   (chain the WHOLE story for real)`]),
        "storytree node build <id> --real   (one node's REAL proof in a fresh worktree)",
      ],
    };
  } finally {
    if (worktree !== undefined) await worktree.remove();
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
      "      the same chain with a REAL Claude Agent SDK leaf per node (subscription-funded), but the",
      "      TASK per node is still the synthetic add(2,3) pair. --budget is the TOTAL ceiling across",
      "      every node (default $10), enforced fail-closed before each node; each slice capped at $1.",
      "",
      "  storytree story build <story-id> --real [--budget <usd>] [--model <id>] [--max-turns <n>] [--actor <email>]",
      "      ADR-0057 §3 expansion D — chain node build --real over the WHOLE story: each node",
      "      authored for real in ONE shared worktree in dependency order (a later node builds on",
      "      earlier nodes' committed source), signed, the proven chain promoted ONCE at the stacked",
      "      HEAD (land via a NON-SQUASH PR). A node failing closed HALTS the chain; the proven prefix",
      "      is parked LOCAL-ONLY (never pushed). Every driven node must be REAL-buildable (a real:",
      "      arm). Same total budget ceiling. The default $10 may be low for a multi-node real chain.",
      "",
      "  --store     (--live/--real) DEFAULTS to pg (ADR-0060): the build owns the DB — it persists",
      "      building marks + signed verdicts (events.work_event/events.verdict) so real work feeds",
      "      the studio's wisp/bloom, auto-starting the instance (db:up) and waiting if it is down.",
      "      --store memory opts out. For --dry-run the default is in-memory and pg is refused",
      "      (forged-healthy guard, ADR-0020).",
      "",
      "buildable stories: those whose story + capabilities all have registry entries (today: library).",
    ].join("\n"),
    next: ["storytree story build library --dry-run"],
  };
}
