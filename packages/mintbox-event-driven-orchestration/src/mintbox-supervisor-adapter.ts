import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { CodexRateLimitSnapshot } from "@storytree/agent";
import type { PgClaimStore } from "@storytree/notice-board/store";
import {
  MINTBOX_COORDINATOR_DIGEST_MAX_BYTES,
  MINTBOX_COORDINATOR_MODEL,
  MINTBOX_DIGEST_LIST_LIMIT,
  MINTBOX_DIGEST_TEXT_LIMIT,
  createMintboxSupervisorState,
  decideMintboxSupervisorEvent,
  isMintboxRendererReleased,
  recordMintboxDetachedHandle,
  recordMintboxProgressReport,
  updateMintboxProgrammeFacts,
  type MintboxDetachedHandle,
  type MintboxHandleHealth,
  type MintboxProgrammeFacts,
  type MintboxProgressReport,
  type MintboxSupervisorEvent,
  type MintboxSupervisorState,
  type MintboxWakeRequest,
} from "./mintbox-supervisor.js";

export interface MintboxCoordinatorCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export type MintboxHandleProbe = MintboxHandleHealth | "missing" | "unknown";

/** Deliberately observation-only: no stop, restart, replace, or migrate port exists. */
export interface MintboxSupervisorRuntime {
  readonly probeHandle: (handle: MintboxDetachedHandle) => Promise<MintboxHandleProbe>;
  readonly ensureCoordinator: (
    id: string,
    wake: MintboxWakeRequest,
    command: MintboxCoordinatorCommand,
  ) => Promise<MintboxDetachedHandle>;
}

export interface MintboxProtectedRenderer {
  readonly handleId: string;
  readonly terminal: "active" | "green" | "failure" | "disappeared";
  readonly claim: "held" | "released";
}

/** The observation-only claim-ledger slice used to verify a renderer's claim transition. */
export type MintboxClaimLedgerReader = Pick<PgClaimStore, "claimsFor" | "history">;

/** The notice-board claim row that belongs to the protected renderer. */
export interface MintboxRendererClaimIdentity {
  readonly unitId: string;
  readonly sessionId: string;
  readonly claimedAt?: string;
}

export interface MintboxSupervisorEnvelope {
  readonly version: 1;
  readonly state: MintboxSupervisorState;
  readonly pendingWake: MintboxWakeRequest | null;
  readonly protectedRenderer: MintboxProtectedRenderer | null;
  readonly latestProgressReport?: MintboxProgressReport;
}

export interface FileMintboxSupervisorAdapterOptions {
  readonly statePath: string;
  readonly coordinatorCommand: MintboxCoordinatorCommand;
  readonly initialFacts: MintboxProgrammeFacts;
  readonly runtime: MintboxSupervisorRuntime;
  /** Optional until callers adopt ledger-backed release evidence; supply with rendererClaimIdentity. */
  readonly claimLedger?: MintboxClaimLedgerReader;
  /** Explicit mapping from the protected renderer to its notice-board claim. */
  readonly rendererClaimIdentity?: MintboxRendererClaimIdentity;
}

const SQLITE_LOCK_TIMEOUT_MS = 5_000;
const transitionTails = new Map<string, Promise<void>>();

/** Read-only process-local queue visibility for health checks and focused concurrency proof. */
export function mintboxSupervisorTransitionQueueSize(): number {
  return transitionTails.size;
}

/**
 * The crash boundary around the pure supervisor reducer. Every transition is serialized, and a
 * complete pending wake is atomically durable before the injected runtime can act on it.
 */
export class FileMintboxSupervisorAdapter {
  readonly #statePath: string;
  readonly #command: MintboxCoordinatorCommand;
  readonly #runtime: MintboxSupervisorRuntime;
  readonly #initialState: MintboxSupervisorState;
  readonly #claimLedger: MintboxClaimLedgerReader | undefined;
  readonly #rendererClaimIdentity: MintboxRendererClaimIdentity | undefined;

  constructor(options: FileMintboxSupervisorAdapterOptions) {
    if (options.statePath.trim() === "") throw new Error("Mintbox supervisor statePath is required");
    if (options.coordinatorCommand.executable.trim() === "") throw new Error("Mintbox coordinator executable is required");
    if (options.coordinatorCommand.args.some((argument) => typeof argument !== "string")) throw new Error("Mintbox coordinator arguments must be strings");
    this.#statePath = path.resolve(options.statePath);
    this.#command = options.coordinatorCommand.cwd === undefined
      ? { executable: options.coordinatorCommand.executable, args: [...options.coordinatorCommand.args] }
      : { executable: options.coordinatorCommand.executable, args: [...options.coordinatorCommand.args], cwd: options.coordinatorCommand.cwd };
    this.#runtime = options.runtime;
    this.#initialState = createMintboxSupervisorState(options.initialFacts);
    this.#claimLedger = options.claimLedger;
    this.#rendererClaimIdentity = options.rendererClaimIdentity;
  }

  handleEvent(event: MintboxSupervisorEvent): Promise<MintboxSupervisorEnvelope> {
    return this.#serialize(async () => {
      let envelope = await this.#prepare();
      const decision = decideMintboxSupervisorEvent(envelope.state, event);
      if (decision.wake === null) return envelope;
      const protectedRenderer = releaseOrRefreshProtection(
        envelope.protectedRenderer,
        event,
        this.#claimLedger !== undefined && this.#rendererClaimIdentity !== undefined,
      );
      envelope = {
        ...envelope,
        state: decision.state,
        pendingWake: decision.wake,
        protectedRenderer,
      };
      await this.#save(envelope);
      return this.#drainPending(envelope);
    });
  }

  recover(): Promise<MintboxSupervisorEnvelope> {
    return this.#serialize(() => this.#prepare());
  }

  recordHandle(handle: MintboxDetachedHandle): Promise<MintboxSupervisorEnvelope> {
    return this.#serialize(async () => {
      const envelope = await this.#prepare();
      const state = recordMintboxDetachedHandle(envelope.state, handle);
      if (state === envelope.state) return envelope;
      const next = { ...envelope, state };
      await this.#save(next);
      return next;
    });
  }

  observeProtectedRenderer(handle: MintboxDetachedHandle): Promise<MintboxSupervisorEnvelope> {
    return this.#serialize(async () => {
      if (handle.role !== "renderer") throw new Error("A protected Mintbox renderer must have renderer role");
      const envelope = await this.#prepare();
      if (envelope.protectedRenderer !== null && envelope.protectedRenderer.handleId !== handle.id) {
        throw new Error(`Mintbox protected renderer ${envelope.protectedRenderer.handleId} cannot be replaced by ${handle.id}`);
      }
      let state = recordMintboxDetachedHandle(envelope.state, handle);
      state = updateMintboxProgrammeFacts(state, {
        ...state.facts,
        rendererId: handle.id,
        rendererHealth: handle.health,
      });
      const protectedRenderer = envelope.protectedRenderer ?? {
        handleId: handle.id,
        terminal: "active" as const,
        claim: "held" as const,
      };
      const next = { ...envelope, state, protectedRenderer };
      await this.#save(next);
      return next;
    });
  }

  /** Persist a compact reader-produced account observation without creating a coordinator. */
  recordProgressReport(
    snapshot: CodexRateLimitSnapshot,
    input: { readonly at: string; readonly action: string },
  ): Promise<{ readonly state: MintboxSupervisorState; readonly report: MintboxProgressReport }> {
    return this.#serialize(async () => {
      const envelope = await this.#prepare();
      const decision = recordMintboxProgressReport(envelope.state, {
        ...input,
        weeklyUsage: weeklyUsageFromSnapshot(snapshot),
      });
      await this.#save({ ...envelope, state: decision.state, latestProgressReport: decision.report });
      return decision;
    });
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = transitionTails.get(this.#statePath) ?? Promise.resolve();
    const run = async (): Promise<T> => {
      using _lock = await acquireMintboxStateLock(this.#statePath);
      return await operation();
    };
    const result = previous.then(run, run);
    const tail = result.then(() => undefined, () => undefined);
    transitionTails.set(this.#statePath, tail);
    void tail.then(() => {
      if (transitionTails.get(this.#statePath) === tail) transitionTails.delete(this.#statePath);
    });
    return result;
  }

  async #prepare(): Promise<MintboxSupervisorEnvelope> {
    const loaded = await this.#load();
    let envelope: MintboxSupervisorEnvelope = loaded ?? {
      version: 1,
      state: this.#initialState,
      pendingWake: null,
      protectedRenderer: null,
    };
    if (loaded === null) await this.#save(envelope);
    const reconciled = await this.#reconcileHandles(envelope);
    if (reconciled !== envelope) {
      envelope = reconciled;
      await this.#save(envelope);
    }
    const claimReconciled = await this.#reconcileRendererClaim(envelope);
    if (claimReconciled !== envelope) {
      envelope = claimReconciled;
      await this.#save(envelope);
    }
    return this.#drainPending(envelope);
  }

  async #reconcileHandles(envelope: MintboxSupervisorEnvelope): Promise<MintboxSupervisorEnvelope> {
    let state = envelope.state;
    for (const handle of envelope.state.handles) {
      const probe = await this.#runtime.probeHandle(handle);
      if (probe === "unknown") continue;
      const health: MintboxHandleHealth = probe === "missing" ? "failed" : probe;
      state = recordMintboxDetachedHandle(state, { ...handle, health });
      if (handle.role === "renderer" && (state.facts.rendererId === handle.id || envelope.protectedRenderer?.handleId === handle.id)) {
        state = updateMintboxProgrammeFacts(state, { ...state.facts, rendererHealth: health });
      }
    }
    return state === envelope.state ? envelope : { ...envelope, state };
  }

  async #reconcileRendererClaim(envelope: MintboxSupervisorEnvelope): Promise<MintboxSupervisorEnvelope> {
    const protectedRenderer = envelope.protectedRenderer;
    const ledger = this.#claimLedger;
    const identity = this.#rendererClaimIdentity;
    if (protectedRenderer === null || ledger === undefined || identity === undefined) return envelope;
    const claims = await ledger.claimsFor(identity.unitId);
    const held = claims.some((claim) => claim.sessionId === identity.sessionId
      && (identity.claimedAt === undefined || claim.claimedAt === identity.claimedAt));
    if (held) {
      return protectedRenderer.claim === "held"
        ? envelope
        : { ...envelope, protectedRenderer: { ...protectedRenderer, claim: "held" } };
    }
    if (protectedRenderer.terminal === "green") return { ...envelope, protectedRenderer: null };
    return protectedRenderer.claim === "released"
      ? envelope
      : { ...envelope, protectedRenderer: { ...protectedRenderer, claim: "released" } };
  }

  async #drainPending(envelope: MintboxSupervisorEnvelope): Promise<MintboxSupervisorEnvelope> {
    const wake = envelope.pendingWake;
    if (wake === null) return envelope;
    const handle = await this.#runtime.ensureCoordinator(wake.id, wake, this.#command);
    const architectureMatches = (handle.architecture === true) === wake.architecture;
    if (handle.id !== wake.id
      || handle.role !== "coordinator"
      || handle.model !== wake.model
      || handle.effort !== wake.effort
      || !architectureMatches) {
      throw new Error(`Mintbox ensureCoordinator returned a handle that does not match wake ${wake.id}`);
    }
    const state = recordMintboxDetachedHandle(envelope.state, handle);
    const next: MintboxSupervisorEnvelope = { ...envelope, state, pendingWake: null };
    await this.#save(next);
    return next;
  }

  async #load(): Promise<MintboxSupervisorEnvelope | null> {
    let encoded: string;
    try {
      // Stryker disable next-line StringLiteral: EQUIVALENT — JSON.parse applies the same UTF-8 string coercion when Node returns a Buffer for an empty encoding.
      encoded = await fs.readFile(this.#statePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw invalidDurableState(error);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(encoded);
    } catch (error) {
      throw invalidDurableState(error);
    }
    const parsed = envelopeSchema.safeParse(decoded);
    if (!parsed.success) throw invalidDurableState(parsed.error);
    return parsed.data as MintboxSupervisorEnvelope;
  }

  async #save(envelope: MintboxSupervisorEnvelope): Promise<void> {
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) throw invalidDurableState(parsed.error);
    const parent = path.dirname(this.#statePath);
    await fs.mkdir(parent, { recursive: true });
    const temporaryPath = path.join(parent, `.${path.basename(this.#statePath)}.${process.pid}.${randomUUID()}.tmp`);
    let temporary: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      temporary = await fs.open(temporaryPath, "wx", 0o600);
      await temporary.writeFile(`${JSON.stringify(envelope)}\n`);
      await temporary.sync();
      await temporary.close();
      temporary = undefined;
      await fs.rename(temporaryPath, this.#statePath);
    } finally {
      await temporary?.close().catch(() => undefined);
      await fs.unlink(temporaryPath).catch(() => undefined);
    }
  }
}

function releaseOrRefreshProtection(
  current: MintboxProtectedRenderer | null,
  event: MintboxSupervisorEvent,
  ledgerBacked: boolean,
): MintboxProtectedRenderer | null {
  const evidence = event.rendererEvidence;
  if (current === null || evidence === undefined || evidence.rendererId !== current.handleId) return current;
  if (isMintboxRendererReleased(evidence, current.handleId) && (!ledgerBacked || current.claim === "released")) return null;
  if (isMintboxRendererReleased(evidence, current.handleId)) {
    return { handleId: current.handleId, terminal: evidence.terminal, claim: "held" };
  }
  return { handleId: current.handleId, terminal: evidence.terminal, claim: evidence.claim };
}

const isoDateSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const healthSchema = z.enum(["running", "finished", "failed", "blocked"]);
const boundedTextSchema = z.string().max(MINTBOX_DIGEST_TEXT_LIMIT);
const nonBlankTextSchema = z.string().refine((value) => value.trim() !== "");
const boundedIdentitySchema = nonBlankTextSchema.refine((value) => value.length <= MINTBOX_DIGEST_TEXT_LIMIT);
const handleSchema = z.object({
  id: nonBlankTextSchema,
  role: z.enum(["coordinator", "worker", "renderer"]),
  pid: z.number().int().positive(),
  host: nonBlankTextSchema,
  detached: z.literal(true),
  startedAt: isoDateSchema,
  health: healthSchema,
  model: nonBlankTextSchema,
  effort: nonBlankTextSchema,
  architecture: z.literal(true).optional(),
  lane: boundedTextSchema.optional(),
  outcome: boundedTextSchema.optional(),
}).strict().superRefine((handle, context) => {
  if (handle.role !== "coordinator") return;
  if (handle.model !== MINTBOX_COORDINATOR_MODEL) context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid coordinator model" });
  if (handle.effort !== "high" && handle.effort !== "xhigh") context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid coordinator effort" });
  if (handle.effort === "xhigh" && handle.architecture !== true) context.addIssue({ code: z.ZodIssueCode.custom, message: "xhigh coordinator lacks architecture evidence" });
});
const factsSchema = z.object({
  rendererId: boundedTextSchema.optional(),
  rendererHealth: healthSchema.optional(),
  rendererBlocker: boundedTextSchema.optional(),
  ready3dLanes: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT),
  blocked3dLanes: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT),
  parallelSessionCount: z.number().int().nonnegative(),
  lastOutcome: boundedTextSchema.optional(),
}).strict();
const supervisorStateSchema = z.object({
  version: z.literal(1),
  handles: z.array(handleSchema),
  wakeKeys: z.array(nonBlankTextSchema),
  facts: factsSchema,
  lastWeeklyUsagePercent: z.number().min(0).max(100).optional(),
  lastReportAt: isoDateSchema.optional(),
}).strict().superRefine((state, context) => {
  if (new Set(state.handles.map((handle) => handle.id)).size !== state.handles.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate handle id" });
  }
  if (new Set(state.wakeKeys).size !== state.wakeKeys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate wake key" });
  }
});
const workerSummarySchema = z.object({
  id: boundedIdentitySchema,
  health: healthSchema,
  model: boundedIdentitySchema,
  effort: boundedIdentitySchema,
  lane: boundedTextSchema.optional(),
}).strict();
const digestSchema = z.object({
  event: z.object({
    kind: z.enum(["completion", "failure", "dependency-release", "empty-ready-worker", "owner-attestation-gate"]),
    subject: boundedIdentitySchema,
    occurredAt: isoDateSchema,
    summary: boundedTextSchema.optional(),
    rendererEvidence: z.object({
      rendererId: boundedIdentitySchema,
      terminal: z.enum(["green", "failure", "disappeared"]),
      claim: z.enum(["held", "released"]),
    }).strict().optional(),
  }).strict(),
  coordinatorHealth: z.union([healthSchema, z.literal("none")]),
  workers: z.array(workerSummarySchema).max(MINTBOX_DIGEST_LIST_LIMIT),
  renderer: z.object({
    id: boundedTextSchema.nullable(),
    health: z.union([healthSchema, z.literal("unknown")]),
    blocker: boundedTextSchema.nullable(),
  }).strict(),
  ready3dLanes: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT),
  blocked3dLanes: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT),
  parallelSessionCount: z.number().int().nonnegative(),
  lastOutcome: boundedTextSchema.nullable(),
}).strict().refine(
  (digest) => Buffer.byteLength(JSON.stringify(digest)) <= MINTBOX_COORDINATOR_DIGEST_MAX_BYTES,
);
const wakeSchema = z.object({
  id: nonBlankTextSchema,
  dedupeKey: nonBlankTextSchema,
  model: z.literal(MINTBOX_COORDINATOR_MODEL),
  effort: z.enum(["high", "xhigh"]),
  architecture: z.boolean(),
  digest: digestSchema,
}).strict().superRefine((wake, context) => {
  if (wake.id !== `mintbox-coordinator:${wake.dedupeKey}`) context.addIssue({ code: z.ZodIssueCode.custom, message: "wake id does not match dedupe key" });
  if ((wake.effort === "xhigh") !== wake.architecture) context.addIssue({ code: z.ZodIssueCode.custom, message: "wake effort does not match architecture evidence" });
});
const protectedRendererSchema = z.object({
  handleId: nonBlankTextSchema,
  terminal: z.enum(["active", "green", "failure", "disappeared"]),
  claim: z.enum(["held", "released"]),
}).strict();
const envelopeSchema = z.object({
  version: z.literal(1),
  state: supervisorStateSchema,
  pendingWake: wakeSchema.nullable(),
  protectedRenderer: protectedRendererSchema.nullable(),
  latestProgressReport: z.object({
    at: isoDateSchema,
    coordinatorHealth: z.union([healthSchema, z.literal("none")]),
    workerHealth: z.array(workerSummarySchema).max(MINTBOX_DIGEST_LIST_LIMIT),
    lanes: z.object({ ready3d: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT), blocked3d: z.array(boundedTextSchema).max(MINTBOX_DIGEST_LIST_LIMIT) }).strict(),
    lastOutcome: boundedTextSchema.nullable(),
    rendererBlocker: boundedTextSchema.nullable(),
    parallelSessionCount: z.number().int().nonnegative(),
    weeklyUsage: z.union([
      z.object({ status: z.literal("available"), percent: z.number().min(0).max(100) }).strict(),
      z.object({ status: z.literal("unavailable"), reason: z.string() }).strict(),
    ]),
    weeklyUsagePercent: z.number().min(0).max(100).optional(),
    weeklyUsageDelta: z.number().nullable(),
    action: boundedTextSchema,
  }).strict().optional(),
}).strict().superRefine((envelope, context) => {
  if (envelope.pendingWake !== null && !envelope.state.wakeKeys.includes(envelope.pendingWake.dedupeKey)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "pending wake lacks persisted dedupe key" });
  }
  if (envelope.protectedRenderer !== null && !envelope.state.handles.some(
    // Stryker disable next-line OptionalChaining: EQUIVALENT — the enclosing non-null branch proves protectedRenderer exists for every predicate invocation.
    (handle) => handle.id === envelope.protectedRenderer?.handleId && handle.role === "renderer",
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "protected renderer lacks its durable handle" });
  }
  if (envelope.protectedRenderer?.terminal === "green" && envelope.protectedRenderer.claim === "released") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "released renderer cannot remain protected" });
  }
});

function weeklyUsageFromSnapshot(snapshot: CodexRateLimitSnapshot): import("./mintbox-supervisor.js").MintboxWeeklyUsage {
  if (snapshot.status !== "available") return { status: "unavailable", reason: snapshot.reason };
  // The public reader represents a missing weekly window as not-reported. At the supervisor
  // boundary that is an unusable observation, so retain the conservative malformed status.
  if (snapshot.weekly.status !== "available") return { status: "unavailable", reason: "malformed" };
  return { status: "available", percent: snapshot.weekly.usedPercent };
}

function invalidDurableState(cause: unknown): Error {
  return new Error("Invalid Mintbox supervisor durable state", { cause });
}

async function acquireMintboxStateLock(statePath: string): Promise<DatabaseSync> {
  const lockPath = `${statePath}.lock.sqlite`;
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(lockPath);
    database.exec(`PRAGMA busy_timeout = ${SQLITE_LOCK_TIMEOUT_MS}`);
    database.exec("BEGIN IMMEDIATE");
    return database;
  } catch (error) {
    database?.close();
    throw new Error(`Unable to acquire Mintbox supervisor lock ${lockPath}`, { cause: error });
  }
}
