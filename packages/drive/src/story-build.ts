import path from "node:path";

import type { ClaudeAgentAuthor, PhaseAuthor } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { AdrMeta } from "./adr-frontmatter.js";
import type { Store } from "@storytree/storage-protocol";
import { effectiveUatWitness } from "@storytree/library";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  promoteRealPass,
  registeredNodeIds,
  resolveBuildConfig,
  resolveSignerFromEnv,
  rollupStatus,
  rollupStoryGreen,
  rollupStoryUat,
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
import type { ClaimStoreLike } from "./node-build.js";
import { PgCommentStore, PgLibraryStore, closePool, createPool } from "@storytree/library/store";

import { loadAdrMetas } from "./adr-metas.js";
import {
  CURATOR_ACTOR,
  ScriptedCuratorRunner,
  SdkCuratorRunner,
  renderCuratorPrompt,
  runCurationPass,
} from "./curate.js";
import type { CommentSink, CuratorRunner } from "./curate.js";
import { deriveIdentity } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";
import { oqHygieneGate, type OqGateDeps } from "./oq-gate.js";
import { emitWisp, gateEmitWisp } from "./wisp-smoke.js";
import type { EmitWispDeps } from "./wisp-smoke.js";

/**
 * ADR-0082: the story's OWN UAT crown rolled up from its per-test signed verdicts, as a report line.
 * Pure — the AND over each per-test verdict (`rollupStoryUat`). A story's UAT greens ONLY when every
 * declared per-test verdict passes (signed by each test's witness); this build chain proves the
 * capabilities, the per-test verdicts come from `storytree uat attest` / machine proofs.
 */
function storyUatProofLine(
  tests: readonly { readonly id: string }[],
  events: readonly { kind: string; seq: number; doc: unknown }[],
): string {
  const rolled = rollupStoryUat(tests, events);
  const n = tests.length;
  const word =
    rolled === "healthy"
      ? "GREEN — every per-test UAT verdict passed (the story's UAT is proven)"
      : rolled === "unhealthy"
        ? "WITHERED — a proven per-test UAT verdict regressed to a signed fail"
        : "unproven — not every per-test UAT verdict is a signed pass yet";
  return `${word} (per-test roll-up of ${n} test${n === 1 ? "" : "s"}, ADR-0082)`;
}

/**
 * ADR-0083 Fork A: the story CROWN rolled up from BOTH necessary clauses — (every declared capability
 * proven `healthy`) AND (the per-test UAT roll-up green) — as a report line. Pure (`rollupStoryGreen`).
 * Capabilities-green is a necessary condition (the glossary dependency rule), refining ADR-0082's
 * UAT-only crown: six green plants are still not sufficient, but a crown can never be green while any
 * capability is red or unproven. A story with zero capabilities (a foundational port) satisfies the
 * capability clause vacuously — its green derives entirely from the per-test UAT.
 */
function storyGreenLine(
  capabilityIds: readonly string[],
  tests: readonly { readonly id: string }[],
  events: readonly { kind: string; seq: number; doc: unknown }[],
  coverage: readonly { readonly id: string; readonly covers?: readonly string[] }[] = [],
): string {
  const rolled = rollupStoryGreen(capabilityIds, tests, events, coverage);
  const word =
    rolled === "healthy"
      ? "GREEN — all capabilities proven healthy AND every per-test UAT verdict passed"
      : rolled === "unhealthy"
        ? "WITHERED — a capability or a proven per-test UAT verdict is a signed fail"
        : "unproven — a capability is not yet proven healthy, or not every per-test UAT verdict is a signed pass yet";
  const capNote =
    capabilityIds.length === 0 ? " (no capabilities — vacuous; green is the UAT alone)" : "";
  return `${word}${capNote} (ADR-0083 Fork A)`;
}

/**
 * `storytree story build <story-id>` (drive-machinery Phase E): a THIN topo-ordered loop over a
 * story's nodes — every capability in `depends_on` order, then the story itself — each driven
 * through the SAME single-node prove-it-gate walk `node build` uses ({@link driveNode}), over ONE
 * shared store and runId so the rollup derives every node's status from one event log. The loop
 * is the orchestrator's {@link runStoryBuild} (runSequence underneath): a node that fails closed
 * HALTS the story, later nodes never run, and a halted run is NEVER a pass.
 *
 * Live/real runs carry NO USD budget ceiling by default (ADR-0130): the leaf is subscription-funded
 * (ADR-0030), so a metered dollar cap is a phantom — the per-slice TURN cap is the runaway brake. An
 * operator may still opt into a TOTAL ceiling with `--budget <usd>`, checked fail-closed before each
 * node; when set, each slice may draw the remaining total (no artificial per-slice sub-cap).
 *
 * The story's own UAT node is driven only when the story declares `uat_witness: machine`
 * (ADR-0040). Absent or `human` — the fail-closed default — the gate builds the capabilities and
 * WITHHOLDS the story node: a machine never drives or signs a human-witnessed ceremony.
 */

const HONEST_FRAMING_STORY_DRY =
  "honest framing: a story dry-run proves the CHAINING — capabilities topo-ordered from depends_on,\n" +
  "each walked through the gate, the story's UAT node last, halt-is-never-a-pass, per-node rollups\n" +
  "derived from ONE event log — NOT the nodes' actual proofs: every leaf is scripted and every\n" +
  "red→green synthetic in a temp workspace. Authored statuses are untouched; the verdicts landed\n" +
  "in an in-memory store and are gone.";

function honestFramingStoryLive(persisted: boolean): string {
  return (
    "honest framing: a live story build proves the CHAIN with a REAL Claude Agent SDK leaf per node\n" +
    "(ADR-0030, subscription-funded; no USD ceiling by default — the turn cap is the brake, ADR-0130)\n" +
    "— genuine authoring, hook-held write walls, spine-observed red→green per node. The TASK per node\n" +
    "is still the synthetic add(2,3) pair in a temp workspace (`node build --real` is the per-node real\n" +
    "path; chaining REAL builds is later work). Authored statuses are untouched; " +
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

/**
 * ADR-0067 — the LIVE curation pass for `--live`/`--real`: spawn the SDK librarian-curator against
 * the live library + comment stores. Entirely best-effort: it opens its OWN pool (the verdict store
 * keeps its own), renders the agent from the seed, runs ONE read-only SDK session, enacts kind-fenced
 * — and any failure (unrenderable agent, unreachable store, SDK error) returns a single `skipped`
 * line, NEVER a thrown build. Curation runs only after the gate has already signed green.
 */
async function runLiveCuration(
  story: NodeSpec,
  driveOrder: NodeSpec[],
  rootDir: string,
  model: string | undefined,
): Promise<string[]> {
  const prompt = await renderCuratorPrompt();
  if (!prompt.ok) {
    return [`curation:    skipped — could not render the librarian-curator agent (${prompt.reason})`];
  }
  let pool: Awaited<ReturnType<typeof createPool>>["pool"];
  let connector: Awaited<ReturnType<typeof createPool>>["connector"];
  try {
    ({ pool, connector } = await createPool());
  } catch (e) {
    return [`curation:    skipped — live store unreachable (${(e as Error).message})`];
  }
  try {
    let curatorCostUsd = 0;
    const runner = new SdkCuratorRunner({
      systemPrompt: prompt.systemPrompt,
      ...(model !== undefined ? { model } : {}),
      onResult: (r) => {
        curatorCostUsd += r.costUsd;
      },
    });
    let adrs: AdrMeta[] = [];
    try {
      adrs = loadAdrMetas(path.join(rootDir, "docs", "decisions")).adrs;
    } catch {
      adrs = [];
    }
    const lines = await runCurationPass({
      runner,
      library: new PgLibraryStore(pool),
      comments: new PgCommentStore(pool),
      context: {
        storyId: story.id,
        nodeIds: driveOrder.map((n) => n.id),
        decisions: story.decisions,
        adrs,
      },
      actor: CURATOR_ACTOR,
    });
    return curatorCostUsd > 0
      ? [...lines, `             curator spend: $${curatorCostUsd.toFixed(4)} SDK-reported`]
      : lines;
  } finally {
    await closePool(pool, connector);
  }
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
  /**
   * `--budget` — OPTIONAL TOTAL USD ceiling across every node (live/real only). Default: NONE — no USD
   * ceiling (ADR-0130); the per-slice turn cap is the runaway brake. Set it to opt into a total cap.
   */
  budgetUsd?: number;
  /** `--max-turns` — per-authoring-slice turn ceiling, SDK-enforced (live/real only). */
  maxTurns?: number;
  /** `--actor` — the signer chain's flag tier. */
  actor?: string;
  /**
   * `--store` — the verdict store. For `--live`/`--real` it resolves to `pg` and ALWAYS persists (the
   * build owns the DB, ADR-0060). For `--dry-run`, absent = in-memory and `pg` is refused (ADR-0020).
   * `"memory"` is NOT a CLI option (ADR-0081 removed it); it survives only as the internal
   * test-injection seam the offline chain tests pass directly.
   */
  verdictStore?: string;
  /**
   * Injectable for tests (ADR-0060): the live-store preflight for a persisting `--live`/`--real`
   * chain. Default = {@link ensureLiveDb} (probe → `db:up` + wait when the instance is down).
   */
  ensureDb?: (log: (message: string) => void) => Promise<EnsureDbResult>;
  /**
   * `--emit-wisp` (ADR-0080) — the dry-run wisp SMOKE: append ONE transient `building` mark for the
   * STORY unit to the live store, dwell, then hard-delete it (never a verdict). Dry-run-only;
   * REQUIRES the live DB. Verifies the in-flight-build wisp pipeline without a billed build.
   */
  emitWisp?: boolean;
  /** `--dwell <sec>` — how long the wisp smoke holds the mark (default 75s, spans the 30s poll). */
  dwellSec?: number;
  /** Injectable for tests (ADR-0080): the wisp-smoke deps (fake ensureDb / store / clock). */
  wispDeps?: EmitWispDeps;
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
  /**
   * Open a NON-DRAFT PR for a green, pushed `--real` chain so CI auto-merges it to trunk (ADR-0022),
   * instead of printing a `gh pr create` suggestion. The studio's UI-driven build sets this (clicking
   * Build IS the approval to land); a terminal `storytree story build --real` leaves it false and runs
   * its own merge ceremony. Reported back as the PR URL in the envelope. Requires an authed `gh`.
   */
  openPr?: boolean;
  /** PR title for `openPr` (defaults to `real: <story-id> proven via the gate`). */
  prTitle?: string;
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
  /**
   * Injectable for tests (ADR-0121): the per-unit write-claim store. Default = the `--store pg`
   * pool's claim store (null in-memory). Identity is SHARED with `presence` (the worktree session).
   */
  claim?: { store?: ClaimStoreLike | null };
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
        "              no USD ceiling by default — the turn cap brakes each slice (--budget opts into one)\n" +
        "  --real      ADR-0057 §3 expansion D: chain node build --real over the WHOLE story —\n" +
        "              each node authored for real in ONE shared worktree in dependency order, signed,\n" +
        "              the proven chain promoted ONCE at the stacked HEAD (a halt parks the prefix\n" +
        "              local-only). Subscription-funded; no USD ceiling by default (--budget opts into one)",
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

  // ADR-0080: `--emit-wisp` is the dry-run wisp SMOKE — it short-circuits the chained gate walk and
  // instead lights a transient `building` mark for the STORY unit in the live store, dwells, then
  // hard-deletes it (never a verdict). It is a DRY-RUN-only smoke that REQUIRES the live DB.
  if (opts.emitWisp === true) {
    const gate = gateEmitWisp({
      dryRun: opts.dryRun,
      ...(opts.dwellSec !== undefined ? { dwellSec: opts.dwellSec } : {}),
      retryCmd: `storytree story build ${story.id} --dry-run --emit-wisp`,
    });
    if (!gate.ok) return gate.refusal;
    return emitWisp(
      {
        unitId: story.id,
        ...(story.tier !== undefined ? { tier: story.tier } : {}),
        runId: `wisp-smoke-${Date.now().toString(36)}`,
        signer: signer.signer,
        dwellSec: gate.dwellSec,
        retryCmd: `storytree story build ${story.id} --dry-run --emit-wisp`,
      },
      opts.wispDeps ?? {},
    );
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

  // ADR-0060/0081, narrowed by ADR-0099-B: only a REAL driven chain OWNS the database and persists —
  // `--store` resolves to `pg` for `--real`, and the preflight ENSURES the instance is up (probe →
  // `db:up` + wait if down) BEFORE anything that touches it: the oq-hygiene gate's live loader composes
  // the PgLibraryStore, and the verdict store is pg. A SYNTHETIC chain (`--dry-run`, or a `--live`
  // add(2,3) smoke) is untouched (in-memory, never the DB) — a synthetic PASS must never persist a green.
  const retryCmd = `storytree story build ${story.id} ${real ? "--real" : "--live"}`;
  const effectiveStore = effectiveVerdictStore(opts.verdictStore, mode !== "real");
  // The instance must be up to PERSIST verdicts AND to run any db-backed proof in the chain
  // (ADR-0064: the proof connects to the test DB on this instance), so ensure it for either reason.
  const needsDb = (effectiveStore === "pg" && mode === "real") || anyDb;
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
        // ADR-0081: no --store memory escape — a live/real build always persists; bring the DB up.
        next: ["pnpm db:status"],
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

  const storeChoice = await resolveVerdictStore(effectiveStore, mode !== "real", retryCmd);
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

  // The per-unit write-claim around the WHOLE story build (ADR-0121): a second concurrent
  // `story build <same> --real` is hard-refused, keyed on the story id (the node-build claim covers a
  // lone `node build`; this covers the story chain). Live exactly when verdicts persist (--store pg)
  // and identity is worktree-derivable.
  const claimStore = opts.claim?.store !== undefined ? opts.claim.store : storeChoice.claim;
  const claimIdentity = ambient.identity;

  const runId = `story-${mode}-${Date.now().toString(36)}`;
  // ADR-0130: no USD ceiling by default — `--budget` is opt-in. Unset → undefined → runStoryBuild
  // runs unbounded (the per-slice turn cap is the brake). A dry-run never carries a budget.
  const budgetUsd = live || real ? opts.budgetUsd : undefined;

  // The verdict store (and its pg pool/connector) is already open; cut the worktree INSIDE the try
  // so its `finally` ALWAYS closes the store — `createBuildWorktree` can throw (a failed `git
  // worktree add`, or a `pnpm install` failure it tears down and rethrows), and a throw before this
  // try would leak the Cloud SQL pool for the process lifetime.
  let worktree: BuildWorktree | undefined;
  let claimHeld = false;
  try {
    // Refuse a duplicate concurrent story build before cutting a worktree or spending (ADR-0121) —
    // the ENFORCING twin of presence; a second `story build <same>` on the shared store is refused.
    if (claimStore !== null && claimIdentity !== null) {
      const claimRes = await claimStore.claim({
        unitId: story.id,
        sessionId: claimIdentity.sessionId,
        branch: claimIdentity.branch,
        intent: `story:${mode}`,
      });
      if (!claimRes.acquired) {
        const held = claimRes.heldBy;
        return {
          ok: false,
          body: [
            `story "${story.id}" is already being built by another live session — REFUSED (ADR-0121).`,
            "",
            `held by:     ${held.sessionId} (branch ${held.branch})`,
            `claimed at:  ${held.claimedAt}`,
            "",
            "Two sessions building one story race to promote duplicate branches. The claim refuses the",
            "second rather than letting both spend and promote. Coordinate via the notice board, or wait",
            "for the claim to be released on completion (or to age out if the holder died).",
          ].join("\n"),
          next: ["storytree noticeboard --pg", `storytree story build <other-id> ${real ? "--real" : "--live"}`],
        };
      }
      claimHeld = true;
    }

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
            // ADR-0130: a slice draws the remaining total when `--budget` is set; unbounded otherwise.
            ...(remainingUsd !== undefined ? { budgetUsd: remainingUsd } : {}),
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
          // ADR-0130: a live slice draws the remaining total when `--budget` is set; unbounded otherwise.
          ...(live && remainingUsd !== undefined ? { budgetUsd: remainingUsd } : {}),
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
          // ADR-0090 (the local loop's land step): when the caller asks to land (the studio's
          // UI-driven build), a GREEN, backstop-clean chain opens its own NON-DRAFT PR so CI
          // auto-merges it to trunk (ADR-0022) — no manual `gh pr create`. A red backstop withholds
          // the push, so openPr can't fire on it.
          ...(opts.openPr === true && !anyRed ? { openPr: true } : {}),
          ...(opts.prTitle !== undefined ? { prTitle: opts.prTitle } : {}),
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
      `budget:      ${
        budgetUsd !== undefined
          ? `$${budgetUsd.toFixed(2)} total ceiling (operator-set; each slice may draw the remaining total)`
          : real || live
            ? "none — no USD ceiling (ADR-0130: subscription-funded; the turn cap is the brake)"
            : "none — a dry-run spends nothing"
      }`,
      `order:       ${order.map((n) => n.id).join(" → ")}`,
      `             (${capabilities.length} capabilities topo-ordered from depends_on, then the story's UAT node)`,
      `uat witness: ${witness}${story.uatWitness === undefined ? " (undeclared — the fail-closed default, ADR-0040)" : " (declared)"}${storyWithheld ? " — the story UAT node is withheld from the gate" : ""}`,
      ...hygiene.lines,
      "",
      ...nodeLines,
      "",
      `nodes:       ${run.outcomes.length}/${driveOrder.length} signed passes${storyWithheld ? " (the story UAT node awaits its human witness)" : ""}`,
      // ADR-0082: the story's OWN UAT greens from the AND-roll-up of its per-test verdicts (signed by
      // each test's declared witness — `storytree uat attest` for human tests, a machine proof for
      // machine tests), NOT from this build chain. ADR-0083 Fork A: the CROWN additionally requires
      // every capability proven healthy. Surface both so the report reflects the real crown.
      // ADR-0097: a would-be (aspirational) UAT leg is not a hard obligation; the reliability gates are
      // both own-proof obligations AND per-cap coverage. The crown is over the witnessable obligations.
      ...((): string[] => {
        const hardUat = story.uatTests.filter((t) => !t.wouldBe);
        const wouldBeCount = story.uatTests.length - hardUat.length;
        const obligations = [...hardUat, ...story.reliabilityGates];
        if (obligations.length === 0) return [];
        const uatLine =
          hardUat.length > 0
            ? `uat proof:   ${storyUatProofLine(hardUat, events)}`
            : `uat proof:   would-be — ${wouldBeCount} aspirational leg(s), no scripted test yet (ADR-0097)`;
        return [
          uatLine,
          `story green: ${storyGreenLine(story.capabilities, obligations, events, story.reliabilityGates)}`,
        ];
      })(),
      `total cost:  $${run.totalCostUsd.toFixed(4)} SDK-reported`,
      ...(real && worktree !== undefined
        ? [`worktree:    ${worktree.root} (ONE shared worktree, stacked commits in dependency order, removed after)`]
        : []),
      ...backstopLines,
      ...(promotion !== undefined
        ? [`promoted:    ${promotion.branch} @ ${promotion.commitSha.slice(0, 7)} (${promotion.detail})`]
        : []),
      ...(promotion?.prUrl !== undefined
        ? [`landed:      ${promotion.prUrl} — opened; CI auto-merges to trunk on green (NON-SQUASH, ADR-0031)`]
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
    let curationLines: string[];
    const curationInjected = opts.curationStores !== undefined || opts.curatorRunner !== undefined;
    if (!curationInjected && (live || real)) {
      // Live/real default: the SDK-spawned librarian-curator against the live library/comment stores.
      curationLines = await runLiveCuration(story, driveOrder, rootDir, opts.model);
    } else {
      // Dry-run default exercises the GLUE against a fresh in-memory store; tests inject the stores +
      // a scripted/SDK runner. Load the ADR context only when there is a library (best-effort: a
      // fixture repo may have no docs/decisions — a missing dir is no ADR context, never a throw).
      const curationLibrary: Store | null =
        opts.curationStores?.library !== undefined
          ? opts.curationStores.library
          : mode === "dry-run"
            ? new InMemoryStore()
            : null;
      let curationAdrs: AdrMeta[] = [];
      if (curationLibrary !== null) {
        try {
          curationAdrs = loadAdrMetas(opts.decisionsDir ?? path.join(rootDir, "docs", "decisions")).adrs;
        } catch {
          curationAdrs = [];
        }
      }
      curationLines = await runCurationPass({
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
          ...curationLines,
          "",
          framing,
        ].join("\n"),
        next: [
          // A --real chain's capabilities are real-built + promoted even though the story UAT is
          // withheld — surface the landing candidate (this is the main --real success shape, since a
          // story UAT node has no real: arm). When openPr already opened the PR, point at it (CI
          // auto-merges) instead of suggesting `gh pr create`.
          ...(promotion?.prUrl !== undefined
            ? [`gh pr checks ${promotion.prUrl}   (the PR is open; CI auto-merges it to trunk on green)`]
            : real && promotion !== undefined && promotion.pushed
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
        ...(promotion?.prUrl !== undefined
          ? [`gh pr checks ${promotion.prUrl}   (the PR is open; CI auto-merges it to trunk on green)`]
          : real && promotion !== undefined && promotion.pushed
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
    // Release the story claim (ADR-0121); swallow failures (it ages out via stale-reclaim).
    if (claimHeld && claimStore !== null && claimIdentity !== null) {
      try {
        await claimStore.release(story.id, claimIdentity.sessionId);
      } catch {
        // swallow
      }
    }
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
      "      TASK per node is still the synthetic add(2,3) pair. No USD ceiling by default (ADR-0130) —",
      "      the per-slice turn cap is the brake; --budget opts into a TOTAL ceiling across every node.",
      "",
      "  storytree story build <story-id> --real [--budget <usd>] [--model <id>] [--max-turns <n>] [--actor <email>]",
      "      ADR-0057 §3 expansion D — chain node build --real over the WHOLE story: each node",
      "      authored for real in ONE shared worktree in dependency order (a later node builds on",
      "      earlier nodes' committed source), signed, the proven chain promoted ONCE at the stacked",
      "      HEAD (land via a NON-SQUASH PR). A node failing closed HALTS the chain; the proven prefix",
      "      is parked LOCAL-ONLY (never pushed). Every driven node must be REAL-buildable (a real:",
      "      arm). No USD ceiling by default (ADR-0130); --budget opts into a total ceiling. The turn",
      "      cap (--max-turns, default 16) is the runaway brake.",
      "",
      "  --store     (--live/--real) ALWAYS pg (ADR-0060/0081): the build owns the DB — it persists",
      "      building marks + signed verdicts (events.work_event/events.verdict) so real work feeds",
      "      the studio's wisp/bloom, auto-starting the instance (db:up) and waiting if it is down.",
      "      There is no run-without-persisting mode (--store memory was removed, ADR-0081). For",
      "      --dry-run the store is in-memory and pg is refused (forged-healthy guard, ADR-0020).",
      "",
      "  storytree story build <story-id> --dry-run --emit-wisp [--dwell <sec>]",
      "      the wisp SMOKE (ADR-0080): light a transient teal wisp for the story in the studio to",
      "      verify the in-flight-build pipeline (ADR-0048) WITHOUT a billed build. Appends ONE",
      "      building mark (never a verdict), dwells ~75s (--dwell) to span the studio's 30s poll,",
      "      then HARD-DELETES the row — durable history left pristine. Requires the live DB. Dry-run-only.",
      "",
      "buildable stories: those whose story + capabilities all have registry entries (today: library).",
      "",
      "  brownfield ADOPTION (mapped → proposed) is its own area now (ADR-0097): `storytree adopt <story>`",
      "      runs it, `storytree adopt plan <story>` classifies the coverage. `story` drives only builds.",
    ].join("\n"),
    next: ["storytree story build library --dry-run", "storytree adopt plan library"],
  };
}
