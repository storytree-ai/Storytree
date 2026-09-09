/**
 * The deterministic half of Mintbox's unattended coordinator.  This module intentionally has no
 * process-spawning or transcript-reading code: the on-box adapter persists this small state, owns
 * the OS handles, and acts on the returned wake request.  Keeping that adapter thin means a
 * supervisor restart cannot turn a replayed notification into another coordinator.
 */

export const MINTBOX_COORDINATOR_MODEL = "gpt-6-astra";
export const MINTBOX_COORDINATOR_DEFAULT_EFFORT = "high";
export const MINTBOX_PROGRESS_INTERVAL_MS = 3 * 60 * 60 * 1_000;
const DIGEST_TEXT_LIMIT = 280;
const DIGEST_LIST_LIMIT = 8;

export type MintboxEventKind =
  | "completion"
  | "failure"
  | "dependency-release"
  | "empty-ready-worker"
  | "owner-attestation-gate";

export type MintboxHandleRole = "coordinator" | "worker" | "renderer";
export type MintboxHandleHealth = "running" | "finished" | "failed" | "blocked";
export type CoordinatorEffort = "high" | "xhigh";

/** A durable, OS-addressable process record.  It deliberately has no log or conversation field. */
export interface MintboxDetachedHandle {
  readonly id: string;
  readonly role: MintboxHandleRole;
  readonly pid: number;
  readonly host: string;
  readonly detached: true;
  readonly startedAt: string;
  readonly health: MintboxHandleHealth;
  /** The runtime-reported identity, never a role-derived guess. */
  readonly model: string;
  readonly effort: string;
  /** Required evidence when the coordinator consumed the exceptional xhigh allowance. */
  readonly architecture?: true;
  readonly lane?: string;
  /** A bounded operational fact, not process output. */
  readonly outcome?: string;
}

export interface MintboxProgrammeFacts {
  readonly rendererId?: string;
  readonly rendererHealth?: MintboxHandleHealth;
  readonly rendererBlocker?: string;
  readonly ready3dLanes: readonly string[];
  readonly blocked3dLanes: readonly string[];
  readonly parallelSessionCount: number;
  readonly lastOutcome?: string;
}

export interface MintboxSupervisorState {
  readonly version: 1;
  readonly handles: readonly MintboxDetachedHandle[];
  /** Dedupe keys are persisted before an adapter starts the coordinator. */
  readonly wakeKeys: readonly string[];
  readonly facts: MintboxProgrammeFacts;
  readonly lastWeeklyUsagePercent?: number;
  readonly lastReportAt?: string;
}

export interface MintboxSupervisorEvent {
  readonly kind: MintboxEventKind;
  /** Stable programme object identifier (worker, dependency, or owner gate). */
  readonly subject: string;
  /** The producer's stable delivery id; retries must preserve it. */
  readonly deliveryId: string;
  readonly occurredAt: string;
  readonly summary?: string;
  /** xhigh is a deliberate architecture decision, never a routine default. */
  readonly architecture?: boolean;
}

export interface MintboxCoordinatorDigest {
  readonly event: {
    readonly kind: MintboxEventKind;
    readonly subject: string;
    readonly occurredAt: string;
    readonly summary?: string;
  };
  readonly coordinatorHealth: MintboxHandleHealth | "none";
  readonly workers: readonly MintboxWorkerSummary[];
  readonly renderer: { readonly id: string | null; readonly health: MintboxHandleHealth | "unknown"; readonly blocker: string | null };
  readonly ready3dLanes: readonly string[];
  readonly blocked3dLanes: readonly string[];
  readonly parallelSessionCount: number;
  readonly lastOutcome: string | null;
}

export interface MintboxWorkerSummary {
  readonly id: string;
  readonly health: MintboxHandleHealth;
  readonly model: string;
  readonly effort: string;
  readonly lane?: string;
}

export interface MintboxWakeRequest {
  readonly id: string;
  readonly dedupeKey: string;
  readonly model: typeof MINTBOX_COORDINATOR_MODEL;
  readonly effort: CoordinatorEffort;
  readonly architecture: boolean;
  readonly digest: MintboxCoordinatorDigest;
}

export interface MintboxCoordinatorPolicy {
  readonly model: typeof MINTBOX_COORDINATOR_MODEL;
  readonly effort: CoordinatorEffort;
}

export interface MintboxProgressDecision {
  readonly state: MintboxSupervisorState;
  readonly report: MintboxProgressReport;
}

export type MintboxEventDecision =
  | { readonly state: MintboxSupervisorState; readonly wake: MintboxWakeRequest }
  | { readonly state: MintboxSupervisorState; readonly wake: null };

export interface MintboxProgressReport {
  readonly at: string;
  readonly coordinatorHealth: MintboxHandleHealth | "none";
  readonly workerHealth: readonly MintboxWorkerSummary[];
  readonly lanes: { readonly ready3d: readonly string[]; readonly blocked3d: readonly string[] };
  readonly lastOutcome: string | null;
  readonly rendererBlocker: string | null;
  readonly parallelSessionCount: number;
  readonly weeklyUsagePercent: number;
  readonly weeklyUsageDelta: number | null;
  readonly action: string;
}

export function createMintboxSupervisorState(facts: MintboxProgrammeFacts): MintboxSupervisorState {
  return { version: 1, handles: [], wakeKeys: [], facts: normalizeFacts(facts) };
}

/** The only accepted coordinator configuration: Astra/high, or an explicitly marked Astra/xhigh. */
export function verifyMintboxCoordinatorPolicy(input: {
  readonly model?: string;
  readonly effort?: CoordinatorEffort;
  readonly architecture?: boolean;
}): MintboxCoordinatorPolicy {
  const model = input.model ?? MINTBOX_COORDINATOR_MODEL;
  const effort = input.effort ?? MINTBOX_COORDINATOR_DEFAULT_EFFORT;
  if (model !== MINTBOX_COORDINATOR_MODEL) throw new Error(`Mintbox coordinator must use ${MINTBOX_COORDINATOR_MODEL}, got ${model}`);
  if (effort === "xhigh" && input.architecture !== true) throw new Error("Mintbox coordinator xhigh requires architecture: true");
  return { model: MINTBOX_COORDINATOR_MODEL, effort };
}

/**
 * Record a handle exactly as the on-box launcher observed it.  This observes a renderer too; it
 * has no stop/restart operation, so registering the existing rendering proof cannot interrupt it.
 */
export function recordMintboxDetachedHandle(
  state: MintboxSupervisorState,
  handle: MintboxDetachedHandle,
): MintboxSupervisorState {
  validateHandle(handle);
  if (handle.role === "coordinator") {
    const effort = asCoordinatorEffort(handle.effort);
    const policyInput: MintboxCoordinatorPolicyInput = {
      model: handle.model,
      effort,
    };
    policyInput.architecture = handle.architecture === true;
    verifyMintboxCoordinatorPolicy(policyInput);
  }
  if (state.handles.some((existing) => existing.id === handle.id)) return state;
  return { ...state, handles: [...state.handles, boundedHandle(handle)] };
}

/** Update programme facts without admitting logs or unbounded lists into durable supervisor state. */
export function updateMintboxProgrammeFacts(state: MintboxSupervisorState, facts: MintboxProgrammeFacts): MintboxSupervisorState {
  return { ...state, facts: normalizeFacts(facts) };
}

/** Persist the wake key before returning the adapter action; replay and restart therefore no-op. */
export function decideMintboxSupervisorEvent(
  state: MintboxSupervisorState,
  event: MintboxSupervisorEvent,
): MintboxEventDecision {
  validateEvent(event);
  const dedupeKey = mintboxEventDedupeKey(event);
  if (state.wakeKeys.includes(dedupeKey)) return { state, wake: null };
  const architecture = event.architecture === true;
  const policy = verifyMintboxCoordinatorPolicy({
    architecture,
    effort: architecture ? "xhigh" : "high",
  });
  const next = { ...state, wakeKeys: [...state.wakeKeys, dedupeKey] };
  return {
    state: next,
    wake: {
      id: `mintbox-coordinator:${dedupeKey}`,
      dedupeKey,
      ...policy,
      architecture,
      digest: buildMintboxCoordinatorDigest(next, event),
    },
  };
}

export function mintboxEventDedupeKey(event: Pick<MintboxSupervisorEvent, "kind" | "subject" | "deliveryId">): string {
  return `${event.kind}:${event.subject}:${event.deliveryId}`;
}

/** A bounded, transcript-free handoff for the compact coordinator. */
export function buildMintboxCoordinatorDigest(state: MintboxSupervisorState, event: MintboxSupervisorEvent): MintboxCoordinatorDigest {
  const coordinator = latestHandle(state.handles, "coordinator");
  const workers = mintboxWorkerSummaries(state.handles);
  const digestEvent: MutableDigestEvent = {
    kind: event.kind,
    subject: bounded(event.subject),
    occurredAt: event.occurredAt,
  };
  if (event.summary !== undefined) digestEvent.summary = bounded(event.summary);
  return {
    event: digestEvent,
    coordinatorHealth: coordinator?.health ?? "none",
    workers,
    renderer: {
      id: state.facts.rendererId === undefined ? null : bounded(state.facts.rendererId),
      health: state.facts.rendererHealth ?? "unknown",
      blocker: state.facts.rendererBlocker === undefined ? null : bounded(state.facts.rendererBlocker),
    },
    ready3dLanes: state.facts.ready3dLanes,
    blocked3dLanes: state.facts.blocked3dLanes,
    parallelSessionCount: state.facts.parallelSessionCount,
    lastOutcome: state.facts.lastOutcome === undefined ? null : bounded(state.facts.lastOutcome),
  };
}

export function isMintboxProgressReportDue(state: MintboxSupervisorState, now: Date): boolean {
  if (state.lastReportAt === undefined) return true;
  return now.getTime() - Date.parse(state.lastReportAt) >= MINTBOX_PROGRESS_INTERVAL_MS;
}

/** Create and persist a compact three-hour report, including weekly percentage and delta. */
export function recordMintboxProgressReport(
  state: MintboxSupervisorState,
  input: { readonly at: string; readonly weeklyUsagePercent: number; readonly action: string },
): MintboxProgressDecision {
  assertDate(input.at, "report at");
  assertPercent(input.weeklyUsagePercent);
  if (input.action.trim() === "") throw new Error("Mintbox progress report needs an action");
  const workers = mintboxWorkerSummaries(state.handles);
  const report: MintboxProgressReport = {
    at: input.at,
    coordinatorHealth: latestHandle(state.handles, "coordinator")?.health ?? "none",
    workerHealth: workers,
    lanes: { ready3d: state.facts.ready3dLanes, blocked3d: state.facts.blocked3dLanes },
    lastOutcome: state.facts.lastOutcome === undefined ? null : bounded(state.facts.lastOutcome),
    rendererBlocker: state.facts.rendererBlocker === undefined ? null : bounded(state.facts.rendererBlocker),
    parallelSessionCount: state.facts.parallelSessionCount,
    weeklyUsagePercent: input.weeklyUsagePercent,
    weeklyUsageDelta: state.lastWeeklyUsagePercent === undefined ? null : input.weeklyUsagePercent - state.lastWeeklyUsagePercent,
    action: bounded(input.action),
  };
  return { state: { ...state, lastReportAt: input.at, lastWeeklyUsagePercent: input.weeklyUsagePercent }, report };
}

function normalizeFacts(facts: MintboxProgrammeFacts): MintboxProgrammeFacts {
  if (!Number.isInteger(facts.parallelSessionCount) || facts.parallelSessionCount < 0) throw new Error("parallelSessionCount must be a non-negative integer");
  const normalized: MutableProgrammeFacts = {
    ready3dLanes: boundedList(facts.ready3dLanes),
    blocked3dLanes: boundedList(facts.blocked3dLanes),
    parallelSessionCount: facts.parallelSessionCount,
  };
  if (facts.rendererId !== undefined) normalized.rendererId = bounded(facts.rendererId);
  if (facts.rendererHealth !== undefined) normalized.rendererHealth = facts.rendererHealth;
  if (facts.rendererBlocker !== undefined) normalized.rendererBlocker = bounded(facts.rendererBlocker);
  if (facts.lastOutcome !== undefined) normalized.lastOutcome = bounded(facts.lastOutcome);
  return normalized;
}

function boundedHandle(handle: MintboxDetachedHandle): MintboxDetachedHandle {
  const extras: MintboxHandleExtras = {};
  if (handle.lane !== undefined) extras.lane = bounded(handle.lane);
  if (handle.outcome !== undefined) extras.outcome = bounded(handle.outcome);
  return { ...handle, ...extras };
}
function mintboxWorkerSummaries(handles: readonly MintboxDetachedHandle[]): readonly MintboxWorkerSummary[] {
  const workers: MintboxWorkerSummary[] = [];
  for (const handle of handles) {
    if (handle.role !== "worker") continue;
    const { id, health, model, effort, lane } = handle;
    workers.push(lane === undefined ? { id, health, model, effort } : { id, health, model, effort, lane });
  }
  return workers.slice(-DIGEST_LIST_LIMIT);
}
interface MintboxCoordinatorPolicyInput { model?: string; effort?: CoordinatorEffort; architecture?: boolean }
interface MutableDigestEvent { kind: MintboxEventKind; subject: string; occurredAt: string; summary?: string }
interface MutableProgrammeFacts { ready3dLanes: readonly string[]; blocked3dLanes: readonly string[]; parallelSessionCount: number; rendererId?: string; rendererHealth?: MintboxHandleHealth; rendererBlocker?: string; lastOutcome?: string }
interface MintboxHandleExtras { lane?: string; outcome?: string }
function boundedList(values: readonly string[]): readonly string[] { return values.slice(0, DIGEST_LIST_LIMIT).map(bounded); }
function bounded(value: string): string { return value.slice(0, DIGEST_TEXT_LIMIT); }
function latestHandle(handles: readonly MintboxDetachedHandle[], role: MintboxHandleRole): MintboxDetachedHandle | undefined { return [...handles].reverse().find((handle) => handle.role === role); }
function asCoordinatorEffort(effort: string): CoordinatorEffort { if (effort === "high" || effort === "xhigh") return effort; throw new Error(`invalid Mintbox coordinator effort: ${effort}`); }
function assertDate(value: string, label: string): void { if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO-compatible timestamp`); }
function assertPercent(value: number): void { if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("weekly usage percent must be between 0 and 100"); }
function validateEvent(event: MintboxSupervisorEvent): void { if (event.subject.trim() === "" || event.deliveryId.trim() === "") throw new Error("Mintbox event subject and deliveryId are required"); assertDate(event.occurredAt, "event occurredAt"); }
function validateHandle(handle: MintboxDetachedHandle): void { if (!handle.detached || !Number.isInteger(handle.pid) || handle.pid <= 0) throw new Error("Mintbox handle must record a positive detached pid"); if (handle.id.trim() === "" || handle.host.trim() === "" || handle.model.trim() === "" || handle.effort.trim() === "") throw new Error("Mintbox handle identity is required"); assertDate(handle.startedAt, "handle startedAt"); }
