import test from "node:test";
import assert from "node:assert/strict";

import {
  assembleBackstopResultEvidence,
  planBackstopPreservation,
} from "./backstop-preservation.js";
import type { BackstopRefusalObservation } from "./backstop-report.js";

const observation: BackstopRefusalObservation = {
  kind: "regression",
  result: "red",
  originalProcessResult: { stdout: "suite out", stderr: "suite err", exitCode: 1 },
  timeoutMs: 600_000,
};

const common = {
  baseSha: "base-sha",
  repoRoot: "C:/repo",
  unitId: "unit-a",
  runId: "run-1",
};

test("planBackstopPreservation covers no refusal, unchanged HEAD, and distinct authored HEAD", () => {
  assert.equal(planBackstopPreservation({ ...common, refusal: undefined }), undefined);
  assert.equal(
    planBackstopPreservation({
      ...common,
      refusal: { observation, authoredCommitSha: "base-sha" },
    }),
    undefined,
  );
  assert.deepEqual(
    planBackstopPreservation({
      ...common,
      refusal: { observation, authoredCommitSha: "authored-sha" },
    }),
    {
      repoRoot: "C:/repo",
      unitId: "unit-a",
      runId: "run-1",
      commitSha: "authored-sha",
      purpose: "unsigned-forensics",
      push: false,
    },
  );
});

test("assembleBackstopResultEvidence omits absent optional own-properties", () => {
  const evidence = assembleBackstopResultEvidence({
    backstopObservation: undefined,
    forensicPreservation: undefined,
  });

  assert.deepEqual(evidence, {});
  assert.equal(Object.hasOwn(evidence, "backstopObservation"), false);
  assert.equal(Object.hasOwn(evidence, "forensicPreservation"), false);
});

test("assembleBackstopResultEvidence attaches each defined optional property exactly", () => {
  const forensicPreservation = {
    branch: "claude/real/unit-a-run-1",
    commitSha: "authored-sha",
    pushed: false,
    detail: "push withheld — local branch kept for forensics",
  };

  assert.deepEqual(
    assembleBackstopResultEvidence({
      backstopObservation: observation,
      forensicPreservation: undefined,
    }),
    { backstopObservation: observation },
  );
  assert.deepEqual(
    assembleBackstopResultEvidence({
      backstopObservation: undefined,
      forensicPreservation,
    }),
    { forensicPreservation },
  );
  const both = assembleBackstopResultEvidence({
    backstopObservation: observation,
    forensicPreservation,
  });
  assert.deepEqual(both, { backstopObservation: observation, forensicPreservation });
  assert.equal(Object.hasOwn(both, "backstopObservation"), true);
  assert.equal(Object.hasOwn(both, "forensicPreservation"), true);
});
