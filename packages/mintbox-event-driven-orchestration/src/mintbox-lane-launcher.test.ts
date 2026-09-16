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
  type MintboxObservedLaneProcess,
  type MintboxObservedLiveClaim,
  type MintboxRegisteredWorktree,
  type MintboxTerraLaunchIntent,
} from "./index.js";

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

const runningProcess: MintboxObservedLaneProcess = {
  state: "running",
  handleId: "terra-handle-1",
  pid: 4101,
  processGroupId: 5101,
  host: "mintbox",
  detached: true,
  model: MINTBOX_TERRA_LANE_MODEL,
  effort: "high",
};

function fixture(overrides: {
  readonly request?: Partial<MintboxLaneLaunchRequest>;
  readonly occupancy?: MintboxLaneOccupancySnapshot;
  readonly process?: Partial<MintboxObservedLaneProcess>;
  readonly claims?: readonly MintboxObservedLiveClaim[];
  readonly worktrees?: readonly MintboxRegisteredWorktree[];
} = {}) {
  const persisted: MintboxTerraLaunchIntent[] = [];
  const decisions: MintboxLaneLaunchDecision[] = [];
  const events: string[] = [];
  const spawnInputs: Array<{ readonly receiptId: string }> = [];
  let spawnCount = 0;
  const request: MintboxLaneLaunchRequest = {
    coordinator,
    intent,
    ...overrides.request,
  };
  const receipt = { receiptId: `persisted-${request.intent.intentId}` };
  const ports: MintboxLaneLauncherPorts<{ readonly receiptId: string }, { readonly launch: number }> = {
    persistIntent: async (nextIntent) => {
      events.push("persist-intent");
      persisted.push(nextIntent);
      return receipt;
    },
    spawn: async (persistedIntent) => {
      events.push("spawn");
      spawnInputs.push(persistedIntent);
      return { launch: ++spawnCount };
    },
    observeProcess: async (token) => {
      events.push("observe-process");
      return {
        ...runningProcess,
        handleId: `terra-handle-${token.launch}`,
        pid: 4100 + token.launch,
        processGroupId: 5100 + token.launch,
        ...overrides.process,
      };
    },
    readLiveClaims: async () => {
      events.push("read-live-claims");
      return overrides.claims ?? [{
        unitId: request.intent.claim.unitId,
        sessionId: request.intent.claim.sessionId,
        branch: request.intent.branch,
      }];
    },
    readRegisteredWorktrees: async () => {
      events.push("read-worktrees");
      return overrides.worktrees ?? [{ path: request.intent.worktreePath, branch: request.intent.branch }];
    },
    readOccupancy: async () => {
      events.push("read-occupancy");
      return overrides.occupancy ?? emptyOccupancy;
    },
    persistVerifiedDecision: async (decision) => {
      events.push("persist-decision");
      decisions.push(decision);
    },
  };
  return { request, ports, persisted, decisions, events, receipt, spawnInputs, get spawnCount() { return spawnCount; } };
}

async function observeLaunch(fixtureResult: ReturnType<typeof fixture>) {
  try {
    return await launchMintboxTerraLane(fixtureResult.request, fixtureResult.ports);
  } catch {
    return null;
  }
}

async function expectLaunchRejected(fixtureResult: ReturnType<typeof fixture>, message: string) {
  await assert.rejects(
    launchMintboxTerraLane(fixtureResult.request, fixtureResult.ports),
    { name: "Error", message },
  );
}

test("the Mintbox Terra launcher and pinned role models are reachable through the public package barrel", () => {
  assert.equal(typeof launchMintboxTerraLane, "function");
  assert.equal(MINTBOX_ASTRA_COORDINATOR_MODEL, "gpt-6-astra");
  assert.equal(MINTBOX_TERRA_LANE_MODEL, "gpt-5.6-terra");
});

test("the coordinator policy rejects every unverified role or xhigh request before reading occupancy", async () => {
  const cases: ReadonlyArray<{
    readonly label: string;
    readonly coordinator: MintboxLaneLaunchRequest["coordinator"];
    readonly message: string;
  }> = [
    {
      label: "wrong coordinator model",
      coordinator: { ...coordinator, model: MINTBOX_TERRA_LANE_MODEL },
      message: "Mintbox launch requires the Astra coordinator policy",
    },
    {
      label: "unsupported coordinator effort",
      coordinator: { ...coordinator, effort: "medium" },
      message: "Mintbox launch requires the Astra coordinator policy",
    },
    {
      label: "xhigh without an architecture decision",
      coordinator: { ...coordinator, effort: "xhigh" },
      message: "Mintbox xhigh coordination requires an architecture decision",
    },
  ];

  for (const entry of cases) {
    const launch = fixture({ request: { coordinator: entry.coordinator } });
    await expectLaunchRejected(launch, entry.message);
    assert.deepEqual(launch.events, [], entry.label);
    assert.deepEqual(launch.persisted, [], entry.label);
    assert.deepEqual(launch.decisions, [], entry.label);
    assert.equal(launch.spawnCount, 0, entry.label);
  }
});

test("the Terra driver policy accepts every pinned effort and rejects every unsupported effort before occupancy", async () => {
  const supportedEfforts = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;
  for (const effort of supportedEfforts) {
    const launchIntent = { ...intent, intentId: `terra-${effort}`, effort };
    const launch = fixture({ request: { intent: launchIntent }, process: { effort } });

    const decision = await launchMintboxTerraLane(launch.request, launch.ports);

    assert.equal(decision.status, "occupied", effort);
    if (decision.status === "occupied") {
      assert.equal(decision.handle.effort, effort, effort);
    }
  }

  for (const effort of ["none", "minimal", "turbo", ""] as const) {
    const launch = fixture({ request: { intent: { ...intent, effort } } });
    await expectLaunchRejected(launch, "Mintbox lane launch requires the Terra driver policy");
    assert.deepEqual(launch.events, [], effort);
    assert.equal(launch.spawnCount, 0, effort);
  }

  const wrongModel = fixture({
    request: { intent: { ...intent, model: MINTBOX_ASTRA_COORDINATOR_MODEL } },
  });
  await expectLaunchRejected(wrongModel, "Mintbox lane launch requires the Terra driver policy");
  assert.deepEqual(wrongModel.events, []);
});

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
  assert.deepEqual(launch.spawnInputs, [launch.receipt]);
  assert.deepEqual(launch.events, [
    "read-occupancy",
    "persist-intent",
    "spawn",
    "observe-process",
    "read-live-claims",
    "read-worktrees",
    "persist-decision",
  ]);
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
  assert.deepEqual(threeDLaunch.persisted, []);
  assert.deepEqual(gpuLaunch.persisted, []);
  assert.deepEqual(threeDLaunch.events, ["read-occupancy", "persist-decision"]);
  assert.deepEqual(gpuLaunch.events, ["read-occupancy", "persist-decision"]);
  assert.deepEqual(threeDLaunch.decisions, [threeDDecision]);
  assert.deepEqual(gpuLaunch.decisions, [gpuDecision]);
});

test("a free GPU slot launches while the fourth 3D lane and an occupied GPU slot remain held", async () => {
  const gpuIntent = { ...intent, intentId: "terra-gpu-free", laneId: "gpu-free", workload: "gpu" as const };
  const launch = fixture({ request: { intent: gpuIntent } });

  const decision = await launchMintboxTerraLane(launch.request, launch.ports);

  assert.equal(decision.status, "occupied");
  assert.equal(launch.spawnCount, 1);
  assert.deepEqual(launch.persisted, [gpuIntent]);
  assert.deepEqual(launch.decisions, [decision]);
});

test("every independently observed process field fails closed with the exact launch diagnostic", async () => {
  const cases: ReadonlyArray<readonly [string, Partial<MintboxObservedLaneProcess>]> = [
    ["state", { state: "exited" }],
    ["handle id", { handleId: null }],
    ["pid", { pid: null }],
    ["process group", { processGroupId: null }],
    ["host", { host: null }],
    ["detachment", { detached: false }],
    ["observed model", { model: MINTBOX_ASTRA_COORDINATOR_MODEL }],
    ["observed effort", { effort: "medium" }],
  ];

  for (const [label, process] of cases) {
    const launch = fixture({ process });
    await expectLaunchRejected(launch, "Mintbox Terra launch could not be verified");
    assert.equal(launch.spawnCount, 1, label);
    assert.deepEqual(launch.persisted, [intent], label);
    assert.deepEqual(launch.decisions, [], label);
    assert.deepEqual(launch.events, [
      "read-occupancy",
      "persist-intent",
      "spawn",
      "observe-process",
      "read-live-claims",
      "read-worktrees",
    ], label);
  }
});

test("a live claim must match the requested unit, session, and branch independently", async () => {
  const cases: ReadonlyArray<readonly [string, MintboxObservedLiveClaim]> = [
    ["unit", { unitId: "other-unit", sessionId: intent.claim.sessionId, branch: intent.branch }],
    ["session", { unitId: intent.claim.unitId, sessionId: "other-session", branch: intent.branch }],
    ["branch", { unitId: intent.claim.unitId, sessionId: intent.claim.sessionId, branch: "other-branch" }],
  ];

  for (const [label, claim] of cases) {
    const launch = fixture({ claims: [claim] });
    await expectLaunchRejected(launch, "Mintbox Terra launch could not be verified");
    assert.equal(launch.spawnCount, 1, label);
    assert.deepEqual(launch.persisted, [intent], label);
    assert.deepEqual(launch.decisions, [], label);
  }

  const noClaim = fixture({ claims: [] });
  await expectLaunchRejected(noClaim, "Mintbox Terra launch could not be verified");
  assert.deepEqual(noClaim.decisions, []);
});

test("a registered worktree must match the requested path and branch independently", async () => {
  const cases: ReadonlyArray<readonly [string, MintboxRegisteredWorktree]> = [
    ["path", { path: "/mintbox/worktrees/other", branch: intent.branch }],
    ["branch", { path: intent.worktreePath, branch: "other-branch" }],
  ];

  for (const [label, worktree] of cases) {
    const launch = fixture({ worktrees: [worktree] });
    await expectLaunchRejected(launch, "Mintbox Terra launch could not be verified");
    assert.equal(launch.spawnCount, 1, label);
    assert.deepEqual(launch.persisted, [intent], label);
    assert.deepEqual(launch.decisions, [], label);
  }

  const noWorktree = fixture({ worktrees: [] });
  await expectLaunchRejected(noWorktree, "Mintbox Terra launch could not be verified");
  assert.deepEqual(noWorktree.decisions, []);
});
