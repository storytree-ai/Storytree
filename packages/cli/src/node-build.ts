import * as fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ClaudeAgentAuthor, PhaseAuthor } from "@storytree/agent";
import type { Store } from "@storytree/core";
import {
  InMemoryStore,
  resolveSignerFromEnv,
  rollupStatus,
  verdictLine,
  workEvent,
} from "@storytree/core";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  mapProofMode,
  promoteRealPass,
  proveUnit,
  realBuildableNodeIds,
  realProofCommand,
  registeredNodeIds,
  resolveBuildConfig,
  resolveProveSpec,
  runRegressionSuite,
  runWorktreeTypecheck,
} from "@storytree/orchestrator";
import type {
  BuildWorktree,
  NodeBuildConfig,
  NodeSpec,
  PromotionResult,
  ProveResult,
  RealProofConfig,
  ResolveOptions,
} from "@storytree/orchestrator";
import type { LeafPhasePrompts } from "@storytree/orchestrator";
import {
  applySchema,
  closePool,
  createPool,
  loadCorpus,
  PgPresenceStore,
  PgWorkStore,
} from "@storytree/store";

import { renderAgentPrompt } from "./agents.js";
import { withPresence } from "./ambient-presence.js";
import type { AmbientDeps } from "./ambient-presence.js";
import type { Envelope } from "./envelope.js";
import { resolveReport } from "./resolve-report.js";
import { deriveIdentity } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C): drive a REAL node spec through
 * the prove-it-gate end-to-end, offline. The walk is the prove-it-gate.e2e.test.ts wiring —
 * a scripted phase-aware model + real file writes + a real Node test run in a fresh temp
 * workspace — parameterized by the real spec (real id, real prompts, real proof mode), against an
 * InMemoryStore by default. `--store pg` (PR #29's parked decision 4) swaps the VERDICT store for
 * the live `PgWorkStore` (`events.work_event` + `events.verdict`) on `--live`/`--real` only — a
 * scripted dry-run PASS persisted to the shared store would be a forged healthy (ADR-0020).
 *
 * HONEST FRAMING (repeated in the envelope): a dry-run proves the GLUE — spec → ProveSpec → gate →
 * signed verdict → rollup — not the node's actual proofs. The model is scripted and the red→green
 * is synthetic. `--live` is the ADR-0030 SDK smoke (subscription-funded, SDK-enforced budget).
 */

const HONEST_FRAMING_DRY =
  "honest framing: a dry-run proves the GLUE (spec → ProveSpec → gate → verdict → rollup), NOT the\n" +
  "node's actual proofs — the model is scripted and the red→green is synthetic in a temp workspace.\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

function honestFramingLive(persisted: boolean): string {
  return (
    "honest framing: a live smoke proves the LIVE LOOP through the gate — a real Claude Agent SDK leaf\n" +
    "(ADR-0030, subscription-funded) genuinely authored the test and impl under hook-enforced write\n" +
    "scope, and the spine observed the genuine red→green those writes caused. The TASK is still the\n" +
    "synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\n" +
    `The node's authored status is untouched; ${verdictFate(persisted)}.`
  );
}

function honestFramingReal(
  persisted: boolean,
  promotion: PromotionResult | undefined,
  regression: "green" | "red" | undefined,
  typecheck: "green" | "red" | undefined,
): string {
  const commitFate =
    promotion !== undefined
      ? `the authored commit is PARKED on ${promotion.branch}\n(landing rides the PR/CI gate — merge NON-SQUASH so the verdict's commit stays an ancestor of main)`
      : "the authored commit was not promoted (see the promotion line above)";
  const suiteClause =
    regression === undefined
      ? "only the\nnode's registered proof command ran (not the full package suite — no-install worktree,\nbuiltins-only target)"
      : typecheck === undefined
        ? `the node's proof command ran AND the package regression suite was observed ${regression.toUpperCase()}\nin the installed worktree`
        : `the node's proof command ran AND the package regression suite was observed ${regression.toUpperCase()}\nand the package typecheck ${typecheck.toUpperCase()} in the installed worktree (the proof run is\ntsx-driven — types stripped — so only the typecheck sees type-illegal code)`;
  return (
    "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\n" +
    "node's REAL test/impl files at their real repo paths authored by a live Claude Agent SDK leaf\n" +
    "under hook-enforced write scope, the node's declared REAL proof command run by the spine for\n" +
    "both red and green, a spine-side commit of the authored files, and a GATE that read genuine\n" +
    `\`git status\` off that worktree. ${commitFate}` +
    (persisted ? "" : "; the verdict\nlanded in an in-memory store and is gone") +
    `; and ${suiteClause}.` +
    (persisted
      ? "\nWhat DID persist: the signed verdict — events.verdict in the shared store (the rollup can\nderive from it across sessions)."
      : "")
  );
}

function verdictFate(persisted: boolean): string {
  return persisted
    ? "the signed verdict PERSISTED to the shared store (events.verdict — the rollup can derive from it across sessions)"
    : "the verdict landed in an in-memory store and is gone";
}

/** The repo root, resolved from this file's location (packages/cli/src → four dirs up). */
export function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/** Repo-relative display path (forward slashes, stable across platforms). */
export function rel(file: string): string {
  return path.relative(repoRoot(), file).replace(/\\/g, "/");
}

/**
 * The buildable node ids for CLI discovery: the registry ids UNION the SPEC-BORNE ids scanned from
 * `storiesDir` (ADR-0057 keystone A). A node whose own spec carries a `proof:` block is buildable by
 * authoring alone, with NO registry entry — but the registry-only `registeredNodeIds()` /
 * `realBuildableNodeIds()` never listed it, so a self-registered node was invisible to discovery (a
 * gap the blind dogfood test surfaced). This merges them so authoring a node makes it *visible*, not
 * just buildable. Best-effort: a malformed spec is SKIPPED in the listing (it fails LOUD when you
 * actually build it), so one bad spec never blanks the list.
 */
export function buildableNodeIds(storiesDir: string): { buildable: string[]; realBuildable: string[] } {
  const buildable = new Set(registeredNodeIds());
  const realBuildable = new Set(realBuildableNodeIds());
  if (existsSync(storiesDir)) {
    for (const story of readdirSync(storiesDir, { withFileTypes: true })) {
      if (!story.isDirectory()) continue;
      const dir = path.join(storiesDir, story.name);
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".md")) continue;
        try {
          const spec = loadNodeSpec(path.join(dir, f));
          if (spec.buildConfig !== undefined) {
            buildable.add(spec.id);
            if (spec.buildConfig.real !== undefined) realBuildable.add(spec.id);
          }
        } catch {
          // A malformed spec is skipped in the LISTING; it fails loud on an actual build (loadNodeSpec
          // wraps the throw with the file path). Discovery must never blank on one bad file.
        }
      }
    }
  }
  return { buildable: [...buildable].sort(), realBuildable: [...realBuildable].sort() };
}

/** The stories dir for discovery scans (overridable in tests via the same default as nodeBuild). */
function defaultStoriesDir(): string {
  return path.join(repoRoot(), "stories");
}

// ── The live SDK leaf's per-phase system prompt = the rendered Library agent (ADR-0051 §4) ──

/** The Library agent that drives the red phase (AUTHOR_TEST): writes the one failing test, stops. */
export const RED_BUILDER_AGENT = "red-builder";
/** The Library agent that drives the green phase (IMPLEMENT): minimum source to pass, stops. */
export const GREEN_BUILDER_AGENT = "green-builder";

export type LeafPhasePromptResult =
  | { ok: true; prompts: LeafPhasePrompts }
  | { ok: false; refusal: Envelope };

/**
 * Assemble the live SDK leaf's per-phase system prompts from the Library (ADR-0051 §4): the
 * `red-builder` agent IS the AUTHOR_TEST system prompt, the `green-builder` agent IS the IMPLEMENT
 * system prompt. Offline by construction — `loadCorpus` seeds an in-memory store, the same seed
 * every other read command uses — so live/real builds run the LIBRARY agent, never a hard-coded
 * generic (the SDK leaf's old `SYSTEM_PROMPT_BASE`). Fail-loud is the anti-blindside guarantee: a
 * missing agent or a dangling manifest ref REFUSES the build, never degrades it silently.
 */
export async function renderLeafPhasePrompts(): Promise<LeafPhasePromptResult> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const problems: string[] = [];
  const rendered: Partial<Record<keyof LeafPhasePrompts, string>> = {};
  for (const [phase, agentId] of [
    ["AUTHOR_TEST", RED_BUILDER_AGENT],
    ["IMPLEMENT", GREEN_BUILDER_AGENT],
  ] as const) {
    const res = await renderAgentPrompt(store, agentId);
    if (!res.ok) {
      problems.push(`agent "${agentId}" (${phase}) did not render: ${res.reason}`);
    } else if (res.agent.missingRefs.length > 0) {
      problems.push(`agent "${agentId}" (${phase}) has dangling refs: ${res.agent.missingRefs.join(", ")}`);
    } else {
      rendered[phase] = res.agent.prompt;
    }
  }
  if (problems.length > 0 || rendered.AUTHOR_TEST === undefined || rendered.IMPLEMENT === undefined) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          "the live SDK leaf's system prompt could not be assembled from the Library (ADR-0051 §4):\n" +
          problems.join("\n") +
          "\nA live build runs the Library agent as the leaf's system prompt — fix the red-builder /\n" +
          "green-builder agent artifact (live store / knowledge.json), it must not fall back to a generic.",
        next: [
          `storytree agents ${RED_BUILDER_AGENT}`,
          `storytree agents ${GREEN_BUILDER_AGENT}`,
        ],
      },
    };
  }
  return { ok: true, prompts: { AUTHOR_TEST: rendered.AUTHOR_TEST, IMPLEMENT: rendered.IMPLEMENT } };
}

// ── The verdict store seam (`--store pg`, PR #29 parked decision 4) ─────────

export type VerdictStoreChoice =
  | {
      ok: true;
      store: Store;
      persisted: boolean;
      label: string;
      /**
       * The presence board over the SAME pool (ADR-0033 Decision 3): live exactly when the
       * verdicts persist, null in-memory — a null store makes withPresence a silent no-op.
       */
      presence: PresenceStoreLike | null;
      close: () => Promise<void>;
    }
  | { ok: false; refusal: Envelope };

/**
 * Resolve the verdict store for a build: in-memory by default; `--store pg` swaps in the
 * {@link PgWorkStore} over the live Cloud SQL tables. Fail-closed twice over: any value other
 * than `pg` is refused, and `pg` is refused for SCRIPTED walks — a dry-run's PASS is synthetic
 * by construction, and persisting it would plant a forged `healthy` in the shared event log
 * (exactly what ADR-0020 exists to prevent).
 */
export async function resolveVerdictStore(
  flag: string | undefined,
  scripted: boolean,
  retryCmd: string,
): Promise<VerdictStoreChoice> {
  if (flag === undefined) {
    return {
      ok: true,
      store: new InMemoryStore(),
      persisted: false,
      label: "in-memory (nothing persists past this run)",
      presence: null,
      close: async () => {},
    };
  }
  if (flag !== "pg") {
    return {
      ok: false,
      refusal: {
        ok: false,
        body: `unknown --store "${flag}" — the only persistent verdict store is "pg" (events.work_event + events.verdict).`,
        next: [`${retryCmd} --store pg`],
      },
    };
  }
  if (scripted) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          "--store pg is refused for a scripted (dry-run) walk: its PASS is synthetic by construction,\n" +
          "and persisting it would plant a forged `healthy` in the shared event log (ADR-0020 — proof is\n" +
          "non-authorable). Persist verdicts only from --live or --real builds.",
        next: [`${retryCmd} --store pg`],
      },
    };
  }
  try {
    const { pool, connector } = await createPool();
    await applySchema(pool); // idempotent CREATE IF NOT EXISTS — self-heals a pre-Phase-A live DB
    return {
      ok: true,
      store: new PgWorkStore(pool),
      persisted: true,
      label: "pg — events.work_event + events.verdict (PERSISTED to the shared store)",
      presence: new PgPresenceStore(pool),
      close: () => closePool(pool, connector),
    };
  } catch (e) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          `--store pg could not reach the live store: ${(e as Error).message}\n` +
          "the instance is STOPPED by default — bring it up and set the IAM user first.",
        next: ["pnpm db:up", "STORYTREE_DB_USER=<iam-email>", retryCmd + " --store pg"],
      },
    };
  }
}

// ── The single-node drive (shared by `node build` and `story build`) ────────

export interface DriveNodeArgs {
  mode: "dry-run" | "live-smoke";
  /** The event store the building mark + signed verdict land in (shared across a story run). */
  store: Store;
  runId: string;
  /** The resolved signer (also the work-event actor). */
  signer: string;
  /** SDK leaf model (live only). */
  model?: string;
  /** Per-authoring-slice USD ceiling, SDK-enforced (live only). */
  budgetUsd?: number;
  /** Per-authoring-slice turn ceiling, SDK-enforced (live only). Default: 16. */
  maxTurns?: number;
  /**
   * The rendered red-builder/green-builder system prompts the live SDK leaf runs on (ADR-0051 §4),
   * assembled once by the caller and passed down. Required for live-smoke; the dry-run owned loop
   * ignores it.
   */
  phasePrompts?: LeafPhasePrompts;
  /**
   * The ambient presence deps (ADR-0033 Decision 3): when present, the leaf run is wrapped in
   * {@link withPresence} — declare before, done in a finally, every failure swallowed. Absent =
   * no presence surface (the offline default).
   */
  presence?: AmbientDeps;
}

export type DriveNodeResult =
  | { resolved: true; result: ProveResult; liveAuthor?: ClaudeAgentAuthor }
  | { resolved: false; reason: string; registered: string[] };

/**
 * Drive ONE node through the gate in a fresh temp workspace: append the `building` lifecycle
 * mark, resolve the spec into a ProveSpec (dry-run: scripted owned loop; live-smoke: the SDK
 * leaf), walk `proveUnit`, and clean the workspace up. The caller owns the store, the runId and
 * the signer — that is what lets `story build` chain nodes over ONE store/run.
 */
export async function driveNode(spec: NodeSpec, args: DriveNodeArgs): Promise<DriveNodeResult> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-node-build-"));
  try {
    await args.store.appendEvent(
      workEvent(
        { unitId: spec.id, event: "building", runId: args.runId, tier: spec.tier },
        args.signer,
      ),
    );
    const sdkOpts = {
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.budgetUsd !== undefined ? { maxBudgetUsd: args.budgetUsd } : {}),
      ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
    };
    const resolveOptions: ResolveOptions =
      args.mode === "live-smoke"
        ? {
            mode: "live-smoke",
            workspace,
            store: args.store,
            runId: args.runId,
            signerInputs: { flag: args.signer },
            ...(args.phasePrompts !== undefined ? { phasePrompts: args.phasePrompts } : {}),
            ...sdkOpts,
          }
        : {
            mode: "dry-run",
            workspace,
            store: args.store,
            runId: args.runId,
            signerInputs: { flag: args.signer },
          };
    const resolved = resolveProveSpec(spec, resolveOptions);
    if (!resolved.ok) {
      return { resolved: false, reason: resolved.reason, registered: resolved.registered };
    }
    // Presence around the leaf (ADR-0033 Decision 3): advisory by construction — withPresence
    // swallows every board failure, so the walk's result is identical with a dead board.
    const prove = (): Promise<ProveResult> => proveUnit(resolved.spec);
    const result =
      args.presence !== undefined
        ? await withPresence(
            args.presence,
            { nodeId: spec.id, runId: args.runId, mode: args.mode },
            prove,
          )
        : await prove();
    return {
      resolved: true,
      result,
      ...(resolved.liveAuthor !== undefined ? { liveAuthor: resolved.liveAuthor } : {}),
    };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** The per-node leaf summary lines shared by the node and story envelopes. */
export function liveLeafLines(liveAuthor: ClaudeAgentAuthor): string[] {
  return [
    `leaf:        Claude Agent SDK (${liveAuthor.runs.map((r) => `${r.phase}: ${r.subtype}, ${r.turns} turns`).join("; ") || "no slices ran"})`,
    `cost:        $${liveAuthor.totalCostUsd.toFixed(4)} SDK-reported (subscription-billed)`,
    `scope walls: ${liveAuthor.violations.length === 0 ? "no write refusals" : liveAuthor.violations.map((v) => `${v.phase}:${v.path}`).join(", ")}`,
    ...(liveAuthor.feedbackRuns.length > 0
      ? [
          `feedback:    ${liveAuthor.feedbackRuns.length} bounded run(s) — ${liveAuthor.feedbackRuns.map((f) => `${f.phase}:${f.tool}=${f.code === 0 ? "green" : `exit ${f.code ?? "none"}`}`).join(", ")} (feedback only; the spine's own observations decided)`,
        ]
      : []),
  ];
}

// ── The single-node REAL build (shared by `node build --real` and `story build --real`) ────────

/**
 * The two REAL-mode fail-closed prechecks, shared by `node build --real` and the `story build --real`
 * chain so both refuse IDENTICALLY before any worktree is cut: the node must carry a `real:` arm
 * (spec-borne, ADR-0057, or registry), and an install-bearing arm must register a typecheck (tsx
 * strips types — only a worktree `tsc --noEmit` catches type-illegal-but-runtime-green code). Returns
 * a refusal Envelope, or null when the node is real-buildable.
 */
export function realConfigRefusal(
  spec: NodeSpec,
  buildConfig: NodeBuildConfig | null,
  storiesDir: string = defaultStoriesDir(),
): Envelope | null {
  const realConfig = buildConfig?.real;
  if (realConfig === undefined) {
    // Discovery includes spec-borne real nodes (ADR-0057 A), not just the registry.
    const buildable = buildableNodeIds(storiesDir).realBuildable;
    return {
      ok: false,
      body:
        `node "${spec.id}" is not REAL-buildable — its proof config has no \`real:\` arm ` +
        `(real.testFile/sourceFile/scope). Add one to the node's spec \`proof:\` block (ADR-0057) ` +
        `or its registry entry.\nREAL-buildable nodes: ${buildable.join(", ") || "(none yet)"}`,
      next: buildable.map((id) => `storytree node build ${id} --real`),
    };
  }
  if (realConfig.install === true && realConfig.typecheck === undefined) {
    return {
      ok: false,
      body:
        `node "${spec.id}" has install:true but no real.typecheck command — an installed worktree's ` +
        `promotion requires the package typecheck observed green (tsx strips types; the proof run ` +
        `cannot see type errors). Add real.typecheck to the node's spec \`proof:\` block (ADR-0057) ` +
        `or its registry entry. (A spec \`proof:\` block fails LOUD at load if install:true lacks typecheck.)`,
      next: [],
    };
  }
  return null;
}

/** Inputs to {@link buildNodeReal} — the caller owns the worktree, store, runId, and signer. */
export interface RealBuildArgs {
  spec: NodeSpec;
  /** Caller-owned worktree — `buildNodeReal` NEVER cuts or removes it (that is the caller's lifecycle). */
  worktree: BuildWorktree;
  /**
   * The HEAD this node builds ON TOP of: the prior node's commit in a chain, or `worktree.headSha`
   * for a single build / the first chain node. "Nothing authored" is measured against THIS, never
   * the stale original cut (`worktree.headSha`) — the chain bug-trap.
   */
  baseSha: string;
  /** The node's build config (for the package regression command) and its resolved real arm. */
  buildConfig: NodeBuildConfig;
  realConfig: RealProofConfig;
  store: Store;
  runId: string;
  signer: string;
  phasePrompts: LeafPhasePrompts;
  presence: AmbientDeps;
  repoRoot: string;
  model?: string;
  budgetUsd?: number;
  maxTurns?: number;
  /** Offline test seam: a scripted {@link PhaseAuthor}; defaults to the live SDK leaf. */
  authorOverride?: PhaseAuthor;
  /**
   * Promote a signed pass (default true). The story chain passes `false`: it drives + signs +
   * commits each node into the shared worktree, then promotes ONCE at the stacked HEAD (so a halt
   * never leaves a pushed partial story). `false` also skips the per-node typecheck/regression
   * backstop — the chain re-observes it once at the final HEAD.
   */
  promote?: boolean;
}

/** Outcome of {@link buildNodeReal}: the gate result plus the promotion/backstop facts (when promoting). */
export interface RealBuildResult {
  result: ProveResult;
  liveAuthor?: ClaudeAgentAuthor;
  /** The verdict's commit (= the new worktree HEAD) on a pass that authored; undefined otherwise. */
  commitSha?: string;
  promotion?: PromotionResult;
  promotionSkipped?: string;
  regression?: "green" | "red";
  typecheck?: "green" | "red";
}

/**
 * Drive ONE node through the REAL gate in a caller-owned worktree: append `building`, resolve the
 * REAL ProveSpec (the leaf authors the node's real test/impl at real paths under hook-enforced
 * scope), walk `proveUnit` (the spine observes red/green and commits the authored files itself), and
 * — when `promote !== false` — re-observe the package typecheck + suite (install-bearing) and park
 * the proven commit on a `claude/real/<id>-<run>` branch (ADR-0031). Honesty walls are unchanged:
 * one `unitId`, one `PathWriteScope`, the spine's own observation; `buildNodeReal` orchestrates, it
 * never reaches inside `proveUnit`.
 */
export async function buildNodeReal(args: RealBuildArgs): Promise<RealBuildResult> {
  const { spec, worktree, baseSha, buildConfig, realConfig, store, runId, signer } = args;
  await store.appendEvent(
    workEvent({ unitId: spec.id, event: "building", runId, tier: spec.tier }, signer),
  );
  const resolveOptions: ResolveOptions = {
    mode: "real",
    workspace: worktree.root,
    store,
    runId,
    signerInputs: { flag: signer },
    phasePrompts: args.phasePrompts,
    ...(args.authorOverride !== undefined ? { authorOverride: args.authorOverride } : {}),
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.budgetUsd !== undefined ? { maxBudgetUsd: args.budgetUsd } : {}),
    ...(args.maxTurns !== undefined ? { maxTurns: args.maxTurns } : {}),
  };
  const resolved = resolveProveSpec(spec, resolveOptions);
  if (!resolved.ok) {
    // The caller prechecked real-buildability, so this is belt-and-braces; surface it as a
    // fail-closed ProveResult so a chain HALTS honestly rather than throwing.
    return {
      result: { ok: false, failedAt: "AUTHOR_TEST", reason: resolved.reason, phasesVisited: [] },
    };
  }
  const result = await withPresence(args.presence, { nodeId: spec.id, runId, mode: "real" }, () =>
    proveUnit(resolved.spec),
  );
  const out: RealBuildResult = {
    result,
    ...(resolved.liveAuthor !== undefined ? { liveAuthor: resolved.liveAuthor } : {}),
  };
  if (!result.ok) return out;
  out.commitSha = result.verdict.commitSha;

  // Nothing authored — the verdict attests the unchanged HEAD this node entered at (baseSha, NOT the
  // stale original cut). No promotion (there is nothing new to park).
  if (result.verdict.commitSha === baseSha) {
    out.promotionSkipped = "nothing authored — the verdict attests the unchanged HEAD";
    return out;
  }
  // The chain defers the backstop + promotion to ONE pass at the stacked HEAD.
  if (args.promote === false) return out;

  // node build --real: the ADR-0031 backstop (install-bearing) + single-node promotion. The worktree
  // is installed iff the node declared install, so realConfig.install governs the backstop here.
  let regression: "green" | "red" | undefined;
  let typecheck: "green" | "red" | undefined;
  if (realConfig.install === true) {
    if (realConfig.typecheck !== undefined) {
      typecheck = (
        await runWorktreeTypecheck({ command: realConfig.typecheck, cwd: worktree.root })
      ).result;
      out.typecheck = typecheck;
    }
    regression = (await runRegressionSuite({ command: buildConfig.command, cwd: worktree.root }))
      .result;
    out.regression = regression;
  }
  out.promotion = await promoteRealPass({
    repoRoot: args.repoRoot,
    unitId: spec.id,
    runId,
    commitSha: result.verdict.commitSha,
    ...(regression === "red" || typecheck === "red" ? { push: false } : {}),
  });
  return out;
}

// ── `storytree node build` ───────────────────────────────────────────────────

export interface NodeBuildOpts {
  dryRun: boolean;
  /** `--live` — the ADR-0030 live smoke: a real Claude Agent SDK leaf authors through the gate. */
  live?: boolean;
  /** `--real` — Phase F: the leaf authors the node's REAL proof in a fresh git worktree. */
  real?: boolean;
  /** `--model` — the SDK leaf's model (live/real only). Default: claude-sonnet-4-6. */
  model?: string;
  /** `--budget` — per-authoring-slice USD ceiling, SDK-enforced (live/real only). Default: 1. */
  budgetUsd?: number;
  /** `--max-turns` — per-authoring-slice turn ceiling, SDK-enforced (live/real only). Default: 16. */
  maxTurns?: number;
  /** `--actor` — the signer chain's flag tier (flag → STORYTREE_SIGNER → git email). */
  actor?: string;
  /** `--store` — the verdict store: absent = in-memory, `pg` = the live work tables (live/real only). */
  verdictStore?: string;
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
  /**
   * Injectable for tests (ADR-0033 Decision 3). Defaults: `store` = the `--store pg` pool's
   * presence board (null in-memory), `identity` = the enclosing session worktree (null in a
   * plain checkout) — null on either side makes presence a silent no-op.
   */
  presence?: { store?: PresenceStoreLike | null; identity?: SessionIdentity | null };
}

/** `storytree node build <id>` — the full walk in one envelope (dry-run | live smoke | real). */
export async function nodeBuild(
  unitId: string | undefined,
  opts: NodeBuildOpts,
): Promise<Envelope> {
  if (unitId === undefined) {
    return {
      ok: false,
      body: "node build needs an id: storytree node build <id> --dry-run | --live",
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
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
        "  --dry-run   offline scripted walk (zero cost)\n" +
        "  --live      ADR-0030 live smoke: a real Claude Agent SDK leaf authors the SYNTHETIC\n" +
        "              add(2,3) pair through the gate (subscription-funded; needs Claude Code\n" +
        "              auth / CLAUDE_CODE_OAUTH_TOKEN)\n" +
        "  --real      Phase F: the leaf authors the node's REAL test/impl in a fresh git\n" +
        "              worktree; the spine runs the node's REAL proof command and commits the\n" +
        "              authored files before the GATE reads the real tree",
      next: [
        `storytree node build ${unitId} --dry-run`,
        `storytree node build ${unitId} --live`,
        `storytree node build ${unitId} --real`,
      ],
    };
  }
  const mode = real ? "real" : live ? "live-smoke" : "dry-run";

  // Fail-closed before any work: a verdict must be attributable (flag → env → git email).
  const signer = resolveSignerFromEnv(
    opts.actor !== undefined ? { flag: opts.actor } : {},
  );
  if (!signer.ok) {
    return {
      ok: false,
      body: `no signer resolved — a verdict must be attributable.\n${signer.error}`,
      next: [`storytree node build ${unitId} --dry-run --actor <email>`],
    };
  }

  const storiesDir = opts.storiesDir ?? path.join(repoRoot(), "stories");
  const specFile = findNodeSpecFile(storiesDir, unitId);
  if (specFile === null) {
    return {
      ok: false,
      body: `no node spec "${unitId}" under ${storiesDir} (looked for <story>/${unitId}.md and ${unitId}/story.md).`,
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  let spec: NodeSpec;
  try {
    spec = loadNodeSpec(specFile);
  } catch (e) {
    return {
      ok: false,
      body: `node spec ${specFile} failed to load:\n${(e as Error).message}`,
      next: ["storytree node build <id> --dry-run"],
    };
  }

  // REAL mode fail-closed precheck BEFORE any worktree is cut: the node must carry a real-proof
  // config — spec-borne first (ADR-0057), registry fallback (the resolver re-checks this; the
  // precheck just keeps the refusal cheap). Using the same resolver as the build path is what lets
  // a self-registered node (a spec `proof:` block, no registry entry) actually build via the CLI.
  // The two refusals (no real arm; install-without-typecheck) are SHARED with `story build --real`
  // via realConfigRefusal, so both surfaces refuse identically.
  const buildConfig = resolveBuildConfig(spec)?.config ?? null;
  const realConfig = buildConfig?.real;
  if (real) {
    const refusal = realConfigRefusal(spec, buildConfig, storiesDir);
    if (refusal !== null) return refusal;
  }

  // ADR-0051 §4: the live SDK leaf's per-phase system prompt IS the rendered Library agent
  // (red-builder → AUTHOR_TEST, green-builder → IMPLEMENT). Assemble it offline and fail-loud on a
  // missing agent / dangling ref BEFORE any spend or worktree — a live build runs the Library agent,
  // never the SDK's old hard-coded generic (the anti-blindside guarantee). The dry-run owned loop
  // needs no leaf prompt, so only live/real renders it.
  let phasePrompts: LeafPhasePrompts | undefined;
  if (live || real) {
    const rendered = await renderLeafPhasePrompts();
    if (!rendered.ok) return rendered.refusal;
    phasePrompts = rendered.prompts;
  }

  const modeFlag = real ? "--real" : live ? "--live" : "--dry-run";
  const storeChoice = await resolveVerdictStore(
    opts.verdictStore,
    mode === "dry-run",
    `storytree node build ${spec.id} ${modeFlag}`,
  );
  if (!storeChoice.ok) return storeChoice.refusal;
  const { store, persisted } = storeChoice;

  // The presence board around the build (ADR-0033 Decision 3, spine-side — no hooks): declare
  // before the leaf runs, done in a finally, EVERY failure swallowed by withPresence — a board
  // write failure must never fail a build. Live exactly when the verdicts persist (--store pg).
  const ambient: AmbientDeps = {
    store: opts.presence?.store !== undefined ? opts.presence.store : storeChoice.presence,
    identity:
      opts.presence?.identity !== undefined ? opts.presence.identity : deriveIdentity(),
    now: () => new Date(),
  };

  const runId = `${mode}-${Date.now().toString(36)}`;
  try {
    let result: ProveResult;
    let liveAuthor: ClaudeAgentAuthor | undefined;
    let worktree: BuildWorktree | undefined;
    let promotion: PromotionResult | undefined;
    let promotionSkipped: string | undefined;
    let regression: "green" | "red" | undefined;
    let typecheck: "green" | "red" | undefined;

    if (real) {
      // The REAL walk: a fresh DETACHED git worktree of this repo (the node's real source at
      // real paths); the spine commits the authored files before the GATE reads the real tree.
      worktree = await createBuildWorktree(
        repoRoot(),
        realConfig?.install === true ? { install: true } : {},
      );
      try {
        // The single-node real lifecycle (resolve → proveUnit → spine commit → ADR-0031 backstop +
        // promotion) is buildNodeReal — the same function story build --real chains. baseSha is the
        // worktree cut (a single node builds on HEAD), promote: true (the default).
        if (buildConfig === null || realConfig === undefined || phasePrompts === undefined) {
          // Unreachable past realConfigRefusal + the live/real prompt assembly, but fail-closed.
          return { ok: false, body: `internal: real build prerequisites missing for "${spec.id}"`, next: [] };
        }
        const built = await buildNodeReal({
          spec,
          worktree,
          baseSha: worktree.headSha,
          buildConfig,
          realConfig,
          store,
          runId,
          signer: signer.signer,
          phasePrompts,
          presence: ambient,
          repoRoot: repoRoot(),
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.budgetUsd !== undefined ? { budgetUsd: opts.budgetUsd } : {}),
          ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
        });
        result = built.result;
        liveAuthor = built.liveAuthor;
        promotion = built.promotion;
        promotionSkipped = built.promotionSkipped;
        regression = built.regression;
        typecheck = built.typecheck;
      } finally {
        await worktree.remove();
      }
    } else {
      const drive = await driveNode(spec, {
        mode: live ? "live-smoke" : "dry-run",
        store,
        runId,
        signer: signer.signer,
        presence: ambient,
        ...(phasePrompts !== undefined ? { phasePrompts } : {}),
        ...(opts.model !== undefined ? { model: opts.model } : {}),
        ...(opts.budgetUsd !== undefined ? { budgetUsd: opts.budgetUsd } : {}),
        ...(opts.maxTurns !== undefined ? { maxTurns: opts.maxTurns } : {}),
      });
      if (!drive.resolved) {
        return {
          ok: false,
          body: `${drive.reason}\n(spec loaded fine: ${rel(specFile)})`,
          next: drive.registered.map((id) => `storytree node build ${id} --dry-run`),
        };
      }
      result = drive.result;
      liveAuthor = drive.liveAuthor;
    }

    const derived = rollupStatus(spec.id, await store.readEvents());
    const header = [
      `node build ${spec.id} — ${mode.toUpperCase()}`,
      "",
      `spec:        ${rel(specFile)}`,
      `proof mode:  ${spec.proofMode} → ${mapProofMode(spec.proofMode)}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      `store:       ${storeChoice.label}`,
      ...(real && worktree !== undefined && realConfig !== undefined
        ? [
            `worktree:    ${worktree.root} (detached @ ${worktree.headSha.slice(0, 7)}${realConfig.install === true ? ", deps installed (lockfile-only)" : ""}, removed after)`,
            // Single source of the display (avoids drift/double-spaces vs the spawned command):
            // the same realProofCommand the resolver uses, with a (declared) marker for a spec command.
            `real proof:  ${realProofCommand(realConfig, worktree.root).display}${realConfig.proofCommand !== undefined ? " (declared)" : ""}`,
          ]
        : []),
      ...(liveAuthor !== undefined ? liveLeafLines(liveAuthor) : []),
      "",
      `phase trail: ${result.phasesVisited.join(" → ")}`,
    ];
    const promotionLines = [
      ...(typecheck !== undefined
        ? [
            `typecheck:   package typecheck ${typecheck.toUpperCase()} in the worktree${typecheck === "red" ? " — push withheld (tsx strips types; only tsc sees type-illegal code)" : ""}`,
          ]
        : []),
      ...(regression !== undefined
        ? [
            `regression:  package suite ${regression.toUpperCase()} in the worktree${regression === "red" ? " — push withheld (a green leaf must not break its package)" : ""}`,
          ]
        : []),
      ...(promotion !== undefined
        ? [
            `promoted:    ${promotion.branch} @ ${promotion.commitSha.slice(0, 7)} (${promotion.detail})`,
          ]
        : []),
      ...(promotionSkipped !== undefined ? [`promotion:   skipped — ${promotionSkipped}`] : []),
    ];
    const framing = real
      ? honestFramingReal(persisted, promotion, regression, typecheck)
      : live
        ? honestFramingLive(persisted)
        : HONEST_FRAMING_DRY;

    if (!result.ok) {
      return {
        ok: false,
        body: [
          ...header,
          `verdict:     NONE — failed closed at ${result.failedAt}: ${result.reason}`,
          `rollup:      ${derived ?? "(no derived status)"} (authored status stands: ${spec.status})`,
          "",
          framing,
        ].join("\n"),
        next: [`storytree node build ${spec.id} ${modeFlag}`],
      };
    }

    return {
      ok: true,
      body: [
        ...header,
        `verdict:     ${verdictLine(result.verdict)}`,
        `evidence:    ${result.verdict.evidence.map((e) => e.kind).join(", ")}`,
        ...promotionLines,
        `rollup:      ${derived} (derived from the event log: building → signed pass; authored status in the spec stays ${spec.status})`,
        "",
        framing,
      ].join("\n"),
      next: [
        ...(promotion !== undefined && promotion.pushed
          ? [
              `gh pr create --head ${promotion.branch} --title "real: ${spec.id} proven via the gate"   (merge NON-SQUASH — the verdict's commit must stay an ancestor)`,
            ]
          : []),
        `storytree node build <id> ${modeFlag}   (any registered node)`,
        `storytree library artifact ${spec.id}   (if it has a Library artifact)`,
      ],
    };
  } finally {
    await storeChoice.close();
  }
}

// ── `storytree node resolve` (free, read-only — ADR-0057 A discoverability) ──────────────────────

export interface NodeResolveOpts {
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
}

/**
 * `storytree node resolve <id>` — show how a node spec RESOLVES, without building or spending
 * anything. It loads the spec and resolves it the SAME way a build does ({@link resolveReport} →
 * {@link resolveBuildConfig}), then renders an honest report: provenance (`source: spec` vs
 * `registry` vs not-buildable), the proof command + per-phase write scope, and the `real:` arm
 * (incl. the resolved REAL proof command display). The gap it closes (blind dogfood, 2026-06-15):
 * an agent authoring a self-registering node had no FREE, dry way to confirm it resolved correctly
 * before committing to a paid `--real` build. Fail-closed (mirroring {@link nodeBuild}): an unknown
 * id, a malformed spec, or a node with no proof config refuses cleanly, naming what is wrong.
 */
export function nodeResolve(unitId: string | undefined, opts: NodeResolveOpts = {}): Envelope {
  const storiesDir = opts.storiesDir ?? defaultStoriesDir();
  const discover = (): string[] =>
    buildableNodeIds(storiesDir).buildable.map((id) => `storytree node resolve ${id}`);

  if (unitId === undefined) {
    return {
      ok: false,
      body: "node resolve needs an id: storytree node resolve <id>",
      next: discover(),
    };
  }
  const specFile = findNodeSpecFile(storiesDir, unitId);
  if (specFile === null) {
    return {
      ok: false,
      body: `no node spec "${unitId}" under ${storiesDir} (looked for <story>/${unitId}.md and ${unitId}/story.md).`,
      next: discover(),
    };
  }
  let spec: NodeSpec;
  try {
    spec = loadNodeSpec(specFile);
  } catch (e) {
    return {
      ok: false,
      body: `node spec ${rel(specFile)} failed to load:\n${(e as Error).message}`,
      next: [`storytree node resolve ${unitId}`],
    };
  }

  const report = resolveReport(spec);
  const head = [
    `spec:          ${rel(specFile)}`,
    `tier:          ${report.tier}`,
    `proof mode:    ${report.proofModeWord} → ${report.proofMode}`,
  ];

  // Not buildable — fail-closed, naming BOTH routes out (mirrors the resolveProveSpec refusal).
  if (!report.buildable) {
    return {
      ok: false,
      body: [
        `node resolve ${report.id} — NOT BUILDABLE`,
        "",
        ...head,
        "",
        `node "${report.id}" has no proof config — it cannot be driven through the gate, even dry.`,
        "Declare how to prove it by either:",
        `  - authoring a 'proof:' block in its spec (${rel(specFile)}) — ADR-0057 keystone A; or`,
        "  - adding an entry to the test-command registry (packages/orchestrator/src/test-command-registry.ts).",
      ].join("\n"),
      next: [`storytree node resolve ${report.id}   (re-run after declaring how to prove it)`],
    };
  }

  // command/scope are non-null whenever buildable (resolveReport's invariant).
  const command = report.command;
  const scope = report.scope;
  const provenance =
    report.source === "spec"
      ? "spec-borne proof: block — ADR-0057 A; authoring it is what made the node buildable"
      : "the test-command registry fallback";
  const lines = [
    `node resolve ${report.id}`,
    "",
    ...head,
    `buildable:     yes — source: ${report.source} (${provenance})`,
    `proof command: ${command?.display ?? "(none)"}`,
    `write scope:   test   ${scope?.testGlobs.join(", ") ?? "(none)"}`,
    `               source ${scope?.sourceGlobs.join(", ") ?? "(none)"}`,
  ];
  if (report.real !== null) {
    const r = report.real;
    lines.push(
      "",
      "REAL-buildable: yes (`--real` authors the node's real proof in a fresh worktree)",
      `  test file:    ${r.testFile}`,
      `  source file:  ${r.sourceFile}`,
      `  install:      ${r.install} (lockfile-only worktree install)`,
      `  edits source: ${r.editsExisting} (false = net-new file pair; true = edit-existing regression)`,
      `  typecheck:    ${r.typecheck ?? "(none — builtins-only, no install)"}`,
      `  proof cmd:    ${r.proofCommand ?? "(default: node:test on the test file)"}`,
      `  real proof:   ${r.proofDisplay}`,
    );
  } else {
    lines.push(
      "",
      "REAL-buildable: no — the config has no `real:` arm (dry-run / live-smoke buildable only).",
      "                add a real.testFile/sourceFile/scope arm to make it `--real`-buildable.",
    );
  }

  const next = [`storytree node build ${report.id} --dry-run   (free — prove the glue, scripted walk)`];
  if (report.realBuildable) {
    next.push(
      `storytree node build ${report.id} --real   (paid — the live leaf authors the node's real proof)`,
    );
  }
  return { ok: true, body: lines.join("\n"), next };
}

export function nodeHelp(storiesDir: string = defaultStoriesDir()): Envelope {
  // Discovery includes SPEC-BORNE nodes (ADR-0057 A), not just the registry — authoring a node makes
  // it visible here, not only buildable.
  const { buildable, realBuildable } = buildableNodeIds(storiesDir);
  return {
    ok: true,
    body: [
      "storytree node — drive a node through the prove-it-gate (ADR-0020).",
      "",
      "  storytree node resolve <id>",
      "      FREE, read-only: show how a node spec RESOLVES (source: spec vs registry vs",
      "      not-buildable, the proof command + write scope, the real: arm, REAL-buildability)",
      "      without building or spending anything. Run this before a paid --real build.",
      "",
      "  storytree node build <id> --dry-run [--actor <email>]",
      "      walk a real node spec through AUTHOR_TEST → … → GATE with a scripted model in a",
      "      temp workspace: zero API cost, no live DB. Proves the drive-machinery glue, not",
      "      the node's actual proofs.",
      "",
      "  storytree node build <id> --live [--model <id>] [--budget <usd>] [--actor <email>]",
      "      the ADR-0030 live smoke: a REAL Claude Agent SDK leaf (subscription-funded) authors",
      "      the synthetic red→green pair through the gate under hook-enforced write scope.",
      "      Needs Claude Code auth (CLAUDE_CODE_OAUTH_TOKEN). Default budget: $1/slice.",
      "",
      "  storytree node build <id> --real [--model <id>] [--budget <usd>] [--max-turns <n>] [--actor <email>]",
      "      Phase F — the REAL build: a fresh git worktree of this repo, the leaf authors the",
      "      node's REAL test/impl at their real paths, the spine runs the node's REAL proof",
      "      command for red/green, commits the authored files, and the GATE reads genuine git",
      "      state. Needs Claude Code auth. A signed PASS is PROMOTED (ADR-0031): the proven",
      "      commit is parked on claude/real/<id>-<run> and pushed when origin exists — land it",
      "      via PR with a NON-SQUASH merge. Registry nodes with real.install get a lockfile-only",
      "      pnpm install in the worktree plus a package typecheck (tsx strips types; tsc must",
      "      agree) and a package-suite regression run — a red of either withholds the push.",
      "",
      "  --store pg   (--live/--real only) persist the building mark + signed verdict to the",
      "      live work tables (events.work_event/events.verdict) instead of an in-memory store.",
      "      Needs the DB up (pnpm db:up) and STORYTREE_DB_USER. Refused for --dry-run — a",
      "      scripted PASS persisted to the shared store would be a forged healthy (ADR-0020).",
      "",
      `buildable nodes (registry + spec-borne): ${buildable.join(", ")}`,
      `REAL-buildable nodes:                    ${realBuildable.join(", ") || "(none yet)"}`,
    ].join("\n"),
    next: ["storytree node build library-cli --dry-run", "storytree story build library --dry-run"],
  };
}
