/**
 * ADR-0098 (U2) — the gate→loop wiring: drive a `build-tests` reliability gate through the REAL
 * prove-it-gate and sign a DRIVEN verdict FOR THE GATE id.
 *
 * A `build-tests` gate (ADR-0085, resolving ADR-0083 Fork B) is brownfield code with no test-first
 * coverage — earned ONLY by a genuine red→green build, never observe-and-sign. ADR-0098 names the
 * two honest brownfield reds (R1 behavioural / `editsExisting`; R2 refactor-for-testability /
 * `refactorForTests`) and wires them here: the gate carries a `(build: <node-id>)` annotation
 * ({@link ReliabilityGate.buildNode}), the driver resolves that node's {@link RealProofConfig},
 * RENAMES the spec id to the gate id (`gateSpec = { ...referencedNodeSpec, id: gateId }`), and runs
 * the SAME {@link buildNodeReal} machinery `node build --real` uses — so the signed verdict attributes
 * to the GATE id. `rollupStatus(gateId)` then reads `healthy`, and `rollupStoryGreen`'s `(covers:)`
 * annotation greens the covered brownfield capability.
 *
 * The verdict's `proofMode` is the referenced node's DRIVEN tier (`mapProofMode` → `capability` /
 * `story` / `contract`), NEVER `adopted` (ADR-0098 d.4): a build-tests green carries the strong driven
 * provenance that distinguishes pockets that got REAL coverage from those merely observed.
 *
 * Pure-by-injection like the rest of the build surface: `storiesDir` / `repoRoot` / the verdict-store
 * flag / an `authorOverride` scripted leaf / `ensureDb` / `promote` are all injectable, so the whole
 * R2 walk is offline-testable over a throwaway git fixture (no DB, no API key). The honesty walls are
 * unchanged — `buildNodeReal` orchestrates the spine's own red→green observation + commit; this module
 * just resolves the referenced node and renames the unit.
 */

import type { PhaseAuthor } from "@storytree/agent";
import type { ReliabilityGate } from "@storytree/library";
import type { Store } from "@storytree/storage-protocol";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  mapProofMode,
  resolveBuildConfig,
  resolveSignerFromEnv,
  rollupStatus,
  verdictLine,
} from "@storytree/orchestrator";
import type {
  AddDepsGroup,
  BuildWorktree,
  NodeSpec,
  PromotionResult,
} from "@storytree/orchestrator";

import type { AmbientDeps } from "./ambient-presence.js";
import { effectiveVerdictStore, ensureLiveDb } from "./db-control.js";
import type { EnsureDbResult } from "./db-control.js";
import type { Envelope } from "./envelope.js";
import { deriveIdentity } from "./noticeboard.js";
import type { PresenceStoreLike, SessionIdentity } from "./noticeboard.js";
import {
  buildNodeReal,
  realConfigRefusal,
  rel,
  renderLeafPhasePrompts,
  resolveAddDepsGroup,
  resolveDbProofEnv,
  resolveVerdictStore,
} from "./node-build.js";

/** Seams a real build-tests-gate drive needs, all injectable so the R2 walk is offline-testable. */
export interface GateBuildDriverDeps {
  /** The stories dir the referenced `(build:)` node spec is resolved from. */
  storiesDir: string;
  /** The repo root the worktree is cut from + promotion targets (a fixture repo in offline tests). */
  repoRoot: string;
  /**
   * The `--store` flag. A REAL gate build OWNS the DB and ALWAYS persists — absent resolves to `pg`
   * (ADR-0060/0081). `"memory"` is NOT a CLI option (refused at dispatch); it survives only as the
   * internal injection seam the offline driver test passes to exercise the walk without a DB.
   */
  verdictStore?: string;
  /**
   * Offline test seam: the verdict store the driver writes to (and reads the rollup off). When present
   * the driver uses it directly — no `ensureDb`, no pg resolution — so the test OWNS the store and can
   * assert `rollupStatus(gateId)` / `rollupStoryGreen` on its events. Absent = the production path
   * (resolve to pg, ensure the instance is up).
   */
  store?: Store;
  /** Injectable live-store preflight (default {@link ensureLiveDb}); probe → `db:up` + wait if down. */
  ensureDb?: (log: (message: string) => void) => Promise<EnsureDbResult>;
  /**
   * Offline test seam: a scripted {@link PhaseAuthor} over the cut worktree (default = the live SDK
   * leaf). Receives the gate's renamed spec + the worktree root (cut inside this function, so the
   * test cannot build the author beforehand).
   */
  authorOverride?: (spec: NodeSpec, worktreeRoot: string) => PhaseAuthor | undefined;
  /** Promote a green proof (default true). Offline tests pass false (no remote to push to). */
  promote?: boolean;
  /** SDK leaf model (live build only). */
  model?: string;
  /** Per-authoring-slice USD ceiling (live build only). */
  budgetUsd?: number;
  /** Per-authoring-slice turn ceiling (live build only). */
  maxTurns?: number;
  /** Injectable presence (ADR-0033 Decision 3); null on either side makes presence a no-op. */
  presence?: { store?: PresenceStoreLike | null; identity?: SessionIdentity | null };
}

const HONEST_FRAMING_GATE_REAL =
  "honest framing: a REAL build-tests gate drive (ADR-0098). The referenced node's REAL test/impl\n" +
  "were authored at their real repo paths by the leaf under hook-enforced write scope, the spine\n" +
  "observed the genuine red→green (R2: a structural seam red → the WHOLE package suite green — the\n" +
  "regression wall), committed the authored files, and signed a DRIVEN-tier verdict FOR THE GATE id\n" +
  "(never `adopted`). The gate's covered capability greens via its `(covers:)` annotation only because\n" +
  "this signed verdict is real.";

/**
 * Drive a `build-tests` reliability gate through the REAL gate and sign a driven verdict for the gate
 * id (ADR-0098 U2). Returns a fully-formed {@link Envelope}; fail-closed at every seam (no build
 * reference, an unresolvable / non-real-buildable referenced node, a blank signer, an unreachable
 * store, or a red walk) refuses cleanly and signs nothing.
 */
export async function driveBuildTestsGate(
  gate: ReliabilityGate,
  signerFlag: string | undefined,
  deps: GateBuildDriverDeps,
): Promise<Envelope> {
  const retryCmd = `storytree gate run ${gate.id} --real --pg`;

  // 1. The gate must name a node to borrow a real: build config from (the `(build:)` annotation).
  //    gate.ts already guards this for the CLI; re-check here so the driver is honest standalone.
  const buildNode = gate.buildNode?.trim();
  if (buildNode === undefined || buildNode.length === 0) {
    return {
      ok: false,
      body:
        `build-tests gate "${gate.id}" names no build to drive — add a \`(build: <node-id>)\` ` +
        `annotation (ADR-0098 U2) pointing at the buildable node whose seam this gate proves.`,
      next: [`storytree gate list ${storyOf(gate.id)} --pg`],
    };
  }

  // 2. Resolve the referenced node spec + its real-proof config (spec-borne first, registry fallback).
  const refFile = findNodeSpecFile(deps.storiesDir, buildNode);
  if (refFile === null) {
    return {
      ok: false,
      body:
        `build-tests gate "${gate.id}" references build node "${buildNode}", but no spec for it ` +
        `exists under ${deps.storiesDir} (looked for <story>/${buildNode}.md and ${buildNode}/story.md).`,
      next: [`storytree gate list ${storyOf(gate.id)} --pg`],
    };
  }
  let referenced: NodeSpec;
  try {
    referenced = loadNodeSpec(refFile);
  } catch (e) {
    return {
      ok: false,
      body: `build node spec ${rel(refFile)} failed to load:\n${(e as Error).message}`,
      next: [retryCmd],
    };
  }
  const buildConfig = resolveBuildConfig(referenced)?.config ?? null;
  // The referenced node must be REAL-buildable (a `real:` arm; install⇒typecheck) — the SAME refusal
  // `node build --real` uses, so a gate can never drive a node that isn't real-buildable.
  const refusal = realConfigRefusal(referenced, buildConfig, deps.storiesDir);
  if (refusal !== null) return refusal;
  // realConfigRefusal === null guarantees both are present; narrow for the type system.
  if (buildConfig === null || buildConfig.real === undefined) {
    return { ok: false, body: `internal: real config missing for build node "${buildNode}"`, next: [] };
  }
  const realConfig = buildConfig.real;

  // 3. The verdict attributes to the GATE id: build the referenced node's config under the gate id.
  const gateSpec: NodeSpec = { ...referenced, id: gate.id };

  // 4. Fail-closed before any worktree or spend: the verdict must be attributable.
  const signer = resolveSignerFromEnv(signerFlag !== undefined ? { flag: signerFlag } : {});
  if (!signer.ok) {
    return {
      ok: false,
      body: `no signer resolved — a verdict must be attributable.\n${signer.error}`,
      next: [`storytree gate run ${gate.id} --real --signer <email> --pg`],
    };
  }

  // 5. ADR-0064: a db-backed referenced proof gets an ISOLATED test-DB env (fail-closed against prod),
  //    and spine-driven dep-adds are resolved (the `--filter` target) — both BEFORE any worktree.
  let dbProofEnv: Record<string, string> | undefined;
  if (realConfig.db === true) {
    const resolvedDb = resolveDbProofEnv();
    if (!resolvedDb.ok) return resolvedDb.refusal;
    dbProofEnv = resolvedDb.env;
  }
  let addDepsGroup: AddDepsGroup | null = null;
  const resolvedDeps = resolveAddDepsGroup(realConfig);
  if (!resolvedDeps.ok) return resolvedDeps.refusal;
  addDepsGroup = resolvedDeps.group;

  // 6. Assemble the live SDK leaf's per-phase system prompts from the Library (offline-safe — reads
  //    the seed). Fail-loud before any spend; the offline driver test injects authorOverride, but the
  //    prompts are still rendered (a missing red-builder/green-builder agent must refuse, not degrade).
  const rendered = await renderLeafPhasePrompts();
  if (!rendered.ok) return rendered.refusal;
  const phasePrompts = rendered.prompts;

  // 7. Resolve the verdict store. A REAL gate build OWNS the DB and ALWAYS persists (ADR-0060/0081) —
  //    the production path resolves to pg and ensures the instance is up. The offline driver test
  //    injects an in-memory store (it then owns the events to roll up); `--store memory` is never a
  //    CLI option (refused at dispatch).
  const dbBacked = realConfig.db === true;
  let store: Store;
  let persisted: boolean;
  let storeLabel: string;
  let presenceStore: PresenceStoreLike | null;
  let closeStore: () => Promise<void>;
  if (deps.store !== undefined) {
    store = deps.store;
    persisted = false;
    storeLabel = "in-memory (injected — nothing persists past this run)";
    presenceStore = null;
    closeStore = async () => {};
  } else {
    const effectiveStore = effectiveVerdictStore(deps.verdictStore, false);
    const needsDb = effectiveStore === "pg" || dbBacked;
    if (needsDb) {
      const ensureDb = deps.ensureDb ?? ensureLiveDb;
      const ready = await ensureDb((m) => console.error(`[db] ${m}`));
      if (!ready.ok) {
        return {
          ok: false,
          body:
            (dbBacked
              ? `gate run --real runs a db-backed proof (real.db:true), but the database could not be brought up:\n`
              : `gate run --real persists to the live store, but the database could not be brought up:\n`) +
            ready.reason,
          next: ["pnpm db:status"],
        };
      }
    }
    const storeChoice = await resolveVerdictStore(effectiveStore, false, retryCmd);
    if (!storeChoice.ok) return storeChoice.refusal;
    store = storeChoice.store;
    persisted = storeChoice.persisted;
    storeLabel = storeChoice.label;
    presenceStore = storeChoice.presence;
    closeStore = storeChoice.close;
  }

  const ambient: AmbientDeps = {
    store: deps.presence?.store !== undefined ? deps.presence.store : presenceStore,
    identity: deps.presence?.identity !== undefined ? deps.presence.identity : deriveIdentity(),
    now: () => new Date(),
  };

  const runId = `gate-real-${Date.now().toString(36)}`;
  let worktree: BuildWorktree | undefined;
  try {
    // The fresh detached worktree of this repo (the referenced node's real source at its real paths).
    worktree = await createBuildWorktree(deps.repoRoot, {
      ...(realConfig.install === true ? { install: true } : {}),
      ...(addDepsGroup !== null ? { addDeps: [addDepsGroup] } : {}),
    });
    const override = deps.authorOverride?.(gateSpec, worktree.root);
    const built = await buildNodeReal({
      spec: gateSpec,
      worktree,
      baseSha: worktree.headSha,
      buildConfig,
      realConfig,
      store,
      runId,
      signer: signer.signer,
      phasePrompts,
      presence: ambient,
      repoRoot: deps.repoRoot,
      promote: deps.promote ?? true,
      ...(dbProofEnv !== undefined ? { dbProofEnv } : {}),
      ...(override !== undefined ? { authorOverride: override } : {}),
      ...(deps.model !== undefined ? { model: deps.model } : {}),
      ...(deps.budgetUsd !== undefined ? { budgetUsd: deps.budgetUsd } : {}),
      ...(deps.maxTurns !== undefined ? { maxTurns: deps.maxTurns } : {}),
    });

    const events = await store.readEvents();
    const derived = rollupStatus(gate.id, events);
    const header = [
      `gate run ${gate.id} — BUILD-TESTS (REAL)`,
      "",
      `gate:        ${gate.id}${gate.covers.length > 0 ? `  (covers: ${gate.covers.join(", ")})` : ""}`,
      `build node:  ${buildNode} (borrows its real: build config — the verdict signs FOR the gate id)`,
      `proof mode:  ${referenced.proofMode} → ${mapProofMode(referenced.proofMode)} (a DRIVEN tier, never adopted — ADR-0098 d.4)`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      `store:       ${storeLabel}`,
      `worktree:    ${worktree.root} (detached @ ${worktree.headSha.slice(0, 7)}${realConfig.install === true ? ", deps installed (lockfile-only)" : ""}, removed after)`,
    ];
    const promotionLines = buildPromotionLines(built.regression, built.typecheck, built.promotion, built.promotionSkipped);

    if (!built.result.ok) {
      return {
        ok: false,
        body: [
          ...header,
          `verdict:     NONE — failed closed at ${built.result.failedAt}: ${built.result.reason}`,
          `rollup:      ${derived ?? "(no derived status)"}`,
          "",
          HONEST_FRAMING_GATE_REAL,
        ].join("\n"),
        next: [retryCmd],
      };
    }
    return {
      ok: true,
      body: [
        ...header,
        `verdict:     ${verdictLine(built.result.verdict)}`,
        `evidence:    ${built.result.verdict.evidence.map((e) => e.kind).join(", ")}`,
        ...promotionLines,
        `rollup:      ${derived} (the gate's signed verdict — events.verdict; ${persisted ? "PERSISTED" : "in-memory"})`,
        "",
        HONEST_FRAMING_GATE_REAL,
      ].join("\n"),
      next: [
        ...(built.promotion !== undefined && built.promotion.pushed
          ? [
              `gh pr create --head ${built.promotion.branch} --title "real: ${gate.id} proven via the build-tests gate"   (merge NON-SQUASH — the verdict's commit must stay an ancestor)`,
            ]
          : []),
        `storytree gate list ${storyOf(gate.id)} --pg`,
        `storytree tree ${storyOf(gate.id)} --pg`,
      ],
    };
  } finally {
    if (worktree !== undefined) await worktree.remove();
    await closeStore();
  }
}

/** The promotion/backstop report lines, shared with `node build --real`'s shape (when promoting). */
function buildPromotionLines(
  regression: "green" | "red" | undefined,
  typecheck: "green" | "red" | undefined,
  promotion: PromotionResult | undefined,
  promotionSkipped: string | undefined,
): string[] {
  return [
    ...(typecheck !== undefined
      ? [`typecheck:   package typecheck ${typecheck.toUpperCase()} in the worktree${typecheck === "red" ? " — push withheld" : ""}`]
      : []),
    ...(regression !== undefined
      ? [`regression:  package suite ${regression.toUpperCase()} in the worktree${regression === "red" ? " — push withheld" : ""}`]
      : []),
    ...(promotion !== undefined
      ? [`promoted:    ${promotion.branch} @ ${promotion.commitSha.slice(0, 7)} (${promotion.detail})`]
      : []),
    ...(promotionSkipped !== undefined ? [`promotion:   skipped — ${promotionSkipped}`] : []),
  ];
}

/** The story id a gate belongs to (`<story>#gate-<n>` → `<story>`). */
function storyOf(gateId: string): string {
  const hash = gateId.indexOf("#");
  return hash > 0 ? gateId.slice(0, hash) : gateId;
}
