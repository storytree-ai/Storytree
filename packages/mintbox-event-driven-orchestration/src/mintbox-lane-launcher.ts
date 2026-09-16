export const MINTBOX_TERRA_LANE_MODEL = "gpt-5.6-terra";
export const MINTBOX_ASTRA_COORDINATOR_MODEL = "gpt-6-astra";

export type MintboxTerraEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
export type MintboxLaneWorkload = "3d" | "gpu";

/** The coordinator's requested policy. The launcher must verify it before recording a decision. */
export interface MintboxCoordinatorLaunchContext {
  readonly decisionId: string;
  readonly model: string;
  readonly effort: string;
  readonly architectureDecisionId?: string;
}

export interface MintboxLaneCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface MintboxLaneClaimExpectation {
  readonly unitId: string;
  readonly sessionId: string;
}

/** Requested launch intent only. None of these fields is evidence that a process is occupied. */
export interface MintboxTerraLaunchIntent {
  readonly intentId: string;
  readonly laneId: string;
  readonly workload: MintboxLaneWorkload;
  readonly model: string;
  readonly effort: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly claim: MintboxLaneClaimExpectation;
  readonly command: MintboxLaneCommand;
}

export interface MintboxLaneLaunchRequest {
  readonly coordinator: MintboxCoordinatorLaunchContext;
  readonly intent: MintboxTerraLaunchIntent;
}

/** Independently process-reported facts obtained after the opaque spawn actuation. */
export interface MintboxObservedLaneProcess {
  readonly state: "running" | "exited" | "unknown";
  readonly handleId: string | null;
  readonly pid: number | null;
  readonly processGroupId: number | null;
  readonly host: string | null;
  readonly detached: boolean;
  readonly model: string | null;
  readonly effort: string | null;
}

export interface MintboxObservedLiveClaim {
  readonly unitId: string;
  readonly sessionId: string;
  readonly branch: string;
}

export interface MintboxRegisteredWorktree {
  readonly path: string;
  readonly branch: string;
}

export interface MintboxObservedLaneOccupant {
  readonly laneId: string;
  readonly pid: number;
  readonly processGroupId: number;
  readonly claimUnitId: string;
}

/** Current occupancy comes from an observer; requested launches never populate this snapshot. */
export interface MintboxLaneOccupancySnapshot {
  readonly threeD: readonly MintboxObservedLaneOccupant[];
  readonly gpu: MintboxObservedLaneOccupant | null;
}

export interface MintboxVerifiedCoordinatorPolicy {
  readonly model: typeof MINTBOX_ASTRA_COORDINATOR_MODEL;
  readonly effort: "high" | "xhigh";
  readonly architectureDecisionId?: string;
}

export interface MintboxVerifiedLaneHandle {
  readonly id: string;
  readonly pid: number;
  readonly processGroupId: number;
  readonly host: string;
  readonly detached: true;
  readonly model: typeof MINTBOX_TERRA_LANE_MODEL;
  readonly effort: MintboxTerraEffort;
  readonly worktreePath: string;
  readonly branch: string;
  readonly claim: MintboxObservedLiveClaim;
}

export type MintboxLaneLaunchDecision =
  | {
      readonly status: "occupied";
      readonly decisionId: string;
      readonly intentId: string;
      readonly laneId: string;
      readonly coordinator: MintboxVerifiedCoordinatorPolicy;
      readonly handle: MintboxVerifiedLaneHandle;
    }
  | {
      readonly status: "held";
      readonly decisionId: string;
      readonly intentId: string;
      readonly laneId: string;
      readonly coordinator: MintboxVerifiedCoordinatorPolicy;
      readonly reason: "three-d-capacity" | "gpu-busy";
    };

/**
 * PersistedIntent and SpawnToken are adapter-owned opaque values. Requiring the receipt as the
 * spawn input makes durable intent an explicit predecessor of the only effectful actuator.
 */
export interface MintboxLaneLauncherPorts<PersistedIntent, SpawnToken> {
  readonly persistIntent: (intent: MintboxTerraLaunchIntent) => Promise<PersistedIntent>;
  readonly spawn: (persistedIntent: PersistedIntent) => Promise<SpawnToken>;
  readonly observeProcess: (spawnToken: SpawnToken) => Promise<MintboxObservedLaneProcess>;
  readonly readLiveClaims: () => Promise<readonly MintboxObservedLiveClaim[]>;
  readonly readRegisteredWorktrees: () => Promise<readonly MintboxRegisteredWorktree[]>;
  readonly readOccupancy: () => Promise<MintboxLaneOccupancySnapshot>;
  readonly persistVerifiedDecision: (decision: MintboxLaneLaunchDecision) => Promise<void>;
}

/** Contract-bearing behavior is intentionally left to the real-build red/green leaf. */
export function launchMintboxTerraLane<PersistedIntent, SpawnToken>(
  request: MintboxLaneLaunchRequest,
  ports: MintboxLaneLauncherPorts<PersistedIntent, SpawnToken>,
): Promise<MintboxLaneLaunchDecision> {
  return launch(request, ports);
}

async function launch<PersistedIntent, SpawnToken>(
  request: MintboxLaneLaunchRequest,
  ports: MintboxLaneLauncherPorts<PersistedIntent, SpawnToken>,
): Promise<MintboxLaneLaunchDecision> {
  const coordinator = verifyCoordinator(request.coordinator);
  const driverEffort = verifyIntent(request.intent);

  const occupancy = await ports.readOccupancy();
  const heldReason = request.intent.workload === "3d"
    ? occupancy.threeD.length >= 3 ? "three-d-capacity" : undefined
    : occupancy.gpu === null ? undefined : "gpu-busy";
  if (heldReason !== undefined) {
    const decision: MintboxLaneLaunchDecision = {
      status: "held",
      decisionId: request.coordinator.decisionId,
      intentId: request.intent.intentId,
      laneId: request.intent.laneId,
      coordinator,
      reason: heldReason,
    };
    await ports.persistVerifiedDecision(decision);
    return decision;
  }

  const persistedIntent = await ports.persistIntent(request.intent);
  const process = await ports.observeProcess(await ports.spawn(persistedIntent));
  const [claims, worktrees] = await Promise.all([
    ports.readLiveClaims(),
    ports.readRegisteredWorktrees(),
  ]);
  const claim = claims.find((candidate) =>
    candidate.unitId === request.intent.claim.unitId
    && candidate.sessionId === request.intent.claim.sessionId
    && candidate.branch === request.intent.branch,
  );
  const worktree = worktrees.find((candidate) =>
    candidate.path === request.intent.worktreePath && candidate.branch === request.intent.branch,
  );
  if (
    process.state !== "running" || process.handleId === null || process.pid === null
    || process.processGroupId === null || process.host === null || !process.detached
    || process.model !== MINTBOX_TERRA_LANE_MODEL || process.effort !== driverEffort
    || claim === undefined || worktree === undefined
  ) {
    throw new Error("Mintbox Terra launch could not be verified");
  }

  const decision: MintboxLaneLaunchDecision = {
    status: "occupied",
    decisionId: request.coordinator.decisionId,
    intentId: request.intent.intentId,
    laneId: request.intent.laneId,
    coordinator,
    handle: {
      id: process.handleId,
      pid: process.pid,
      processGroupId: process.processGroupId,
      host: process.host,
      detached: true,
      model: MINTBOX_TERRA_LANE_MODEL,
      effort: driverEffort,
      worktreePath: worktree.path,
      branch: worktree.branch,
      claim,
    },
  };
  await ports.persistVerifiedDecision(decision);
  return decision;
}

function verifyCoordinator(context: MintboxCoordinatorLaunchContext): MintboxVerifiedCoordinatorPolicy {
  if (context.model !== MINTBOX_ASTRA_COORDINATOR_MODEL || (context.effort !== "high" && context.effort !== "xhigh")) {
    throw new Error("Mintbox launch requires the Astra coordinator policy");
  }
  if (context.effort === "xhigh" && context.architectureDecisionId === undefined) {
    throw new Error("Mintbox xhigh coordination requires an architecture decision");
  }
  return context.architectureDecisionId === undefined
    ? { model: MINTBOX_ASTRA_COORDINATOR_MODEL, effort: context.effort }
    : { model: MINTBOX_ASTRA_COORDINATOR_MODEL, effort: context.effort, architectureDecisionId: context.architectureDecisionId };
}

function verifyIntent(intent: MintboxTerraLaunchIntent): MintboxTerraEffort {
  if (intent.model !== MINTBOX_TERRA_LANE_MODEL || !isTerraEffort(intent.effort)) {
    throw new Error("Mintbox lane launch requires the Terra driver policy");
  }
  return intent.effort;
}

function isTerraEffort(effort: string): effort is MintboxTerraEffort {
  return effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh"
    || effort === "max" || effort === "ultra";
}
