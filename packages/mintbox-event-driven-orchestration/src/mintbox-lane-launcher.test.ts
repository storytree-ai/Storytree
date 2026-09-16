import test from "node:test";
import assert from "node:assert/strict";
import {
  launchMintboxTerraLane,
  MINTBOX_ASTRA_COORDINATOR_MODEL,
  MINTBOX_TERRA_LANE_MODEL,
  type MintboxLaneLaunchDecision,
  type MintboxLaneLaunchRequest,
  type MintboxLaneLauncherPorts,
  type MintboxLaneOccupancySnapshot,
  type MintboxTerraLaunchIntent,
} from "./mintbox-lane-launcher.js";

const coordinator = {
  decisionId: "astra-terra-launch-1",
  model: MINTBOX_ASTRA_COORDINATOR_MODEL,
  effort: "high",
};

const intent = {
  intentId: "terra-canopy-1",
  laneId: "canopy",
  workload: "3d" as const,
  model: MINTBOX_TERRA_LANE_MODEL,
  effort: "high",
  worktreePath: "/mintbox/worktrees/canopy",
  branch: "mintbox/terra-canopy",
  claim: { unitId: "canopy-lane", sessionId: "terra-session-1" },
  command: { executable: "codex", args: ["exec", "drive canopy"], cwd: "/mintbox/worktrees/canopy" },
};

const emptyOccupancy: MintboxLaneOccupancySnapshot = { threeD: [], gpu: null };

function fixture(overrides: {
  readonly request?: Partial<MintboxLaneLaunchRequest>;
  readonly occupancy?: MintboxLaneOccupancySnapshot;
} = {}) {
  const persisted: MintboxTerraLaunchIntent[] = [];
  const decisions: MintboxLaneLaunchDecision[] = [];
  let spawnCount = 0;
  const request: MintboxLaneLaunchRequest = {
    coordinator,
    intent,
    ...overrides.request,
  };
  const ports: MintboxLaneLauncherPorts<MintboxTerraLaunchIntent, { readonly launch: number }> = {
    persistIntent: async (nextIntent) => {
      persisted.push(nextIntent);
      return nextIntent;
    },
    spawn: async () => ({ launch: ++spawnCount }),
    observeProcess: async (token) => ({
      state: "running",
      handleId: `terra-handle-${token.launch}`,
      pid: 4100 + token.launch,
      processGroupId: 5100 + token.launch,
      host: "mintbox",
      detached: true,
      model: MINTBOX_TERRA_LANE_MODEL,
      effort: "high",
    }),
    readLiveClaims: async () => [{ unitId: intent.claim.unitId, sessionId: intent.claim.sessionId, branch: intent.branch }],
    readRegisteredWorktrees: async () => [{ path: intent.worktreePath, branch: intent.branch }],
    readOccupancy: async () => overrides.occupancy ?? emptyOccupancy,
    persistVerifiedDecision: async (decision) => { decisions.push(decision); },
  };
  return { request, ports, persisted, decisions, get spawnCount() { return spawnCount; } };
}

async function observeLaunch(fixtureResult: ReturnType<typeof fixture>) {
  try {
    return await launchMintboxTerraLane(fixtureResult.request, fixtureResult.ports);
  } catch {
    return null;
  }
}

test("mintbox-role-model-effort-is-verified: an architecture-marked Astra coordinator alone may use xhigh while its Terra driver keeps the Terra model", async () => {
  const launch = fixture({
    request: {
      coordinator: {
        ...coordinator,
        effort: "xhigh",
        architectureDecisionId: "ADR-terraform-xhigh",
      },
    },
  });

  const decision = await observeLaunch(launch);

  assert.deepEqual(decision, {
    status: "occupied",
    decisionId: coordinator.decisionId,
    intentId: intent.intentId,
    laneId: intent.laneId,
    coordinator: {
      model: MINTBOX_ASTRA_COORDINATOR_MODEL,
      effort: "xhigh",
      architectureDecisionId: "ADR-terraform-xhigh",
    },
    handle: {
      id: "terra-handle-1",
      pid: 4101,
      processGroupId: 5101,
      host: "mintbox",
      detached: true,
      model: MINTBOX_TERRA_LANE_MODEL,
      effort: "high",
      worktreePath: intent.worktreePath,
      branch: intent.branch,
      claim: { unitId: intent.claim.unitId, sessionId: intent.claim.sessionId, branch: intent.branch },
    },
  });
});

test("mintbox-launch-binds-handle-and-claim: an observed detached Terra process and its live lane claim are persisted as one occupied decision", async () => {
  const launch = fixture();

  const decision = await observeLaunch(launch);

  assert.deepEqual(launch.persisted, [intent]);
  assert.equal(launch.spawnCount, 1);
  assert.deepEqual(launch.decisions, [decision]);
  assert.deepEqual(decision, {
    status: "occupied",
    decisionId: coordinator.decisionId,
    intentId: intent.intentId,
    laneId: intent.laneId,
    coordinator: { model: MINTBOX_ASTRA_COORDINATOR_MODEL, effort: "high" },
    handle: {
      id: "terra-handle-1",
      pid: 4101,
      processGroupId: 5101,
      host: "mintbox",
      detached: true,
      model: MINTBOX_TERRA_LANE_MODEL,
      effort: "high",
      worktreePath: intent.worktreePath,
      branch: intent.branch,
      claim: { unitId: intent.claim.unitId, sessionId: intent.claim.sessionId, branch: intent.branch },
    },
  });
});

test("mintbox-3d-capacity-and-gpu-serialization-hold: a fourth 3D lane and a concurrent GPU lane are held without spawning", async () => {
  const occupiedThreeD = [{ laneId: "a", pid: 1, processGroupId: 11, claimUnitId: "a" }, { laneId: "b", pid: 2, processGroupId: 12, claimUnitId: "b" }, { laneId: "c", pid: 3, processGroupId: 13, claimUnitId: "c" }];
  const threeDLaunch = fixture({ occupancy: { threeD: occupiedThreeD, gpu: null } });
  const gpuLaunch = fixture({
    request: { intent: { ...intent, intentId: "terra-gpu-1", laneId: "gpu-terrain", workload: "gpu" } },
    occupancy: { threeD: [], gpu: { laneId: "gpu-existing", pid: 9, processGroupId: 19, claimUnitId: "gpu-existing" } },
  });

  const [threeDDecision, gpuDecision] = await Promise.all([observeLaunch(threeDLaunch), observeLaunch(gpuLaunch)]);

  assert.deepEqual(threeDDecision, {
    status: "held", decisionId: coordinator.decisionId, intentId: intent.intentId, laneId: intent.laneId,
    coordinator: { model: MINTBOX_ASTRA_COORDINATOR_MODEL, effort: "high" }, reason: "three-d-capacity",
  });
  assert.deepEqual(gpuDecision, {
    status: "held", decisionId: coordinator.decisionId, intentId: "terra-gpu-1", laneId: "gpu-terrain",
    coordinator: { model: MINTBOX_ASTRA_COORDINATOR_MODEL, effort: "high" }, reason: "gpu-busy",
  });
  assert.equal(threeDLaunch.spawnCount, 0);
  assert.equal(gpuLaunch.spawnCount, 0);
  assert.deepEqual(threeDLaunch.decisions, [threeDDecision]);
  assert.deepEqual(gpuLaunch.decisions, [gpuDecision]);
});
