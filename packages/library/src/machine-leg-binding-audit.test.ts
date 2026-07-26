import test from "node:test";
import assert from "node:assert/strict";

import {
  auditMachineLegBindings,
  type MachineLegBindingAuditStory,
} from "./machine-leg-binding-audit.js";
import { parseUatTestCriteria } from "./uat-test-criteria.js";

const alpha: MachineLegBindingAuditStory = {
  storyId: "alpha",
  sourcePath: "stories/alpha/story.md",
  body: `# Alpha

## UAT Test Criteria

1. **Bound check:** (witness: machine) (proof-gate: alpha#gate-2)
2. **Operator check:** (witness: human)
3. **Undecided check:** (witness: either)

## Reliability Gates

1. **Unrelated observe:** (gate: observe) \`pnpm test:unrelated\`
2. **Exact observed check:** (gate: observe) \`pnpm --filter @storytree/library test\`
`,
};

const zeta: MachineLegBindingAuditStory = {
  storyId: "zeta",
  sourcePath: "stories/zeta/story.md",
  body: `# Zeta

## UAT Test Criteria

1. **No binding:** (witness: machine)
2. **Unknown binding:** (witness: machine) (proof-gate: zeta#gate-9)
3. **Ineligible binding:** (witness: machine) (proof-gate: zeta#gate-3)
4. **Commandless binding:** (witness: machine) (proof-gate: zeta#gate-4)
5. **Human control:** (witness: human)
6. **Either control:** (witness: either)

## Reliability Gates

1. **Unrelated observe:** (gate: observe) \`pnpm test:unrelated\`
2. **Another observe:** (gate: observe) \`pnpm test:another\`
3. **Build gate:** (gate: build-tests)
4. **Observe without a command:** (gate: observe)
`,
};

function machineCriterionCount(stories: readonly MachineLegBindingAuditStory[]): number {
  return stories.reduce(
    (count, story) =>
      count + parseUatTestCriteria(story.storyId, story.body).filter((criterion) => criterion.witness === "machine").length,
    0,
  );
}

test("machine-leg binding audit: emits one deterministic provenance-bearing row for every and only machine criterion", () => {
  const corpus = [zeta, alpha];
  const rows = auditMachineLegBindings(corpus);

  assert.equal(rows.length, machineCriterionCount(corpus));
  assert.deepEqual(rows, [
    {
      provenance: { storyId: "alpha", sourcePath: "stories/alpha/story.md" },
      outcome: {
        outcome: "evidence",
        criterionId: "alpha#uat-1",
        gateId: "alpha#gate-2",
        gateKind: "observe",
        proofCommand: "pnpm --filter @storytree/library test",
        adoptionInvocation: ["storytree", "adopt", "gate", "alpha#gate-2", "--pg"],
      },
    },
    {
      provenance: { storyId: "zeta", sourcePath: "stories/zeta/story.md" },
      outcome: { outcome: "refused", criterionId: "zeta#uat-1", reason: "missing-binding" },
    },
    {
      provenance: { storyId: "zeta", sourcePath: "stories/zeta/story.md" },
      outcome: {
        outcome: "refused",
        criterionId: "zeta#uat-2",
        reason: "unknown-gate",
        declaredGateId: "zeta#gate-9",
      },
    },
    {
      provenance: { storyId: "zeta", sourcePath: "stories/zeta/story.md" },
      outcome: {
        outcome: "refused",
        criterionId: "zeta#uat-3",
        reason: "ineligible-gate",
        declaredGateId: "zeta#gate-3",
      },
    },
    {
      provenance: { storyId: "zeta", sourcePath: "stories/zeta/story.md" },
      outcome: {
        outcome: "refused",
        criterionId: "zeta#uat-4",
        reason: "missing-command",
        declaredGateId: "zeta#gate-4",
      },
    },
  ]);

  assert.deepEqual(auditMachineLegBindings([...corpus].reverse()), rows, "corpus traversal order cannot alter the report");
});

test("machine-leg binding audit: a newly parsed unbound machine leg grows the report by one refusal", () => {
  const before = auditMachineLegBindings([alpha]);
  const extended: MachineLegBindingAuditStory = {
    ...alpha,
    body: alpha.body.replace(
      "2. **Operator check:** (witness: human)",
      "2. **New unbound machine check:** (witness: machine)\n3. **Operator check:** (witness: human)",
    ),
  };

  const after = auditMachineLegBindings([extended]);
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after[1], {
    provenance: { storyId: "alpha", sourcePath: "stories/alpha/story.md" },
    outcome: { outcome: "refused", criterionId: "alpha#uat-2", reason: "missing-binding" },
  });
});
