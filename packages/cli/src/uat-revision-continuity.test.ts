import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SIGNING_EVENT_KIND,
  type Verdict,
} from "@storytree/proof-protocol";

import {
  judgeUatRevisionContinuity,
  type UatRevisionContinuityInputs,
} from "./uat-revision-continuity.js";

const OLD = "uatr1:380a683e4995990d";
const CURRENT = "uatr1:c05dad8de498513d";
const CRITERION = "uatc_027e3e8ad2253d327fc15c07";

function criterion(criterionId = CRITERION, revisionId = OLD) {
  return {
    criterionId,
    revisionId,
    title: "Codex is the default runtime",
    witness: "machine" as const,
  };
}

function snapshot(revisionId = OLD, extraCriteria: readonly ReturnType<typeof criterion>[] = []) {
  return {
    schemaVersion: 1,
    commitSha: "a".repeat(40),
    storiesTreeSha: "b".repeat(40),
    generatedAt: "2026-09-09T00:00:00.000Z",
    generator: "test",
    stories: [
      {
        id: "agent",
        title: "Agent",
        outcome: "Agents build Storytree.",
        status: "proposed",
        proofMode: "story",
        uatWitness: "machine",
        dependsOn: [],
        consumedBy: [],
        decisions: [560],
        building: false,
        capabilities: [],
        uatTestCriteria: [criterion(CRITERION, revisionId), ...extraCriteria],
        reliabilityGates: [],
      },
    ],
    capabilities: [],
  };
}

function signedCriterion(
  revisionId: string,
  outcome: Verdict["outcome"] = "pass",
  seq = 1,
) {
  const doc: Verdict = {
    unitId: CRITERION,
    criterionId: CRITERION,
    revisionId,
    proofMode: "adopted",
    outcome,
    commitSha: "c".repeat(40),
    signer: "ci@example.com",
    runId: `run-${String(seq)}`,
    outputVersion: "v1",
    evidence: [],
    at: "2026-09-09T00:00:00.000Z",
  };
  return { seq, kind: SIGNING_EVENT_KIND, doc };
}

function inputs(over: Partial<UatRevisionContinuityInputs> = {}): UatRevisionContinuityInputs {
  return {
    base: snapshot(OLD),
    candidate: snapshot(CURRENT),
    events: [signedCriterion(OLD)],
    baseRef: "merge-base(origin/main, HEAD)",
    ...over,
  };
}

describe("PR #1892: changing Agent's existing criterion revision cannot silently land unproved", () => {
  it("reds on the stale old-revision witness and names the exact story, criterion and transition", () => {
    const verdict = judgeUatRevisionContinuity(inputs());

    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.changes, [
      {
        storyId: "agent",
        criterionId: CRITERION,
        oldRevisionId: OLD,
        newRevisionId: CURRENT,
        witnessed: false,
      },
    ]);
    assert.match(verdict.lines.join("\n"), /agent/);
    assert.match(verdict.lines.join("\n"), new RegExp(CRITERION));
    assert.match(
      verdict.lines.join("\n"),
      new RegExp(`${OLD.replace(":", "\\:")}.*${CURRENT.replace(":", "\\:")}`),
    );
  });

  it("greens only after the candidate revision has a current signed pass", () => {
    const verdict = judgeUatRevisionContinuity(
      inputs({ events: [signedCriterion(OLD), signedCriterion(CURRENT, "pass", 2)] }),
    );

    assert.equal(verdict.ok, true, verdict.lines.join("\n"));
    assert.equal(verdict.changes[0]?.witnessed, true);
  });

  it("keeps a later signed failure red even when the candidate revision passed earlier", () => {
    const verdict = judgeUatRevisionContinuity(
      inputs({
        events: [
          signedCriterion(CURRENT, "pass", 1),
          signedCriterion(CURRENT, "fail", 2),
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.changes[0]?.witnessed, false);
  });
});

it("a newly added criterion id is additive expansion and needs no replacement witness", () => {
  const added = criterion("uatc_aaaaaaaaaaaaaaaaaaaaaaaa", "uatr1:aaaaaaaaaaaaaaaa");
  const verdict = judgeUatRevisionContinuity(
    inputs({ base: snapshot(OLD), candidate: snapshot(OLD, [added]), events: [] }),
  );

  assert.equal(verdict.ok, true, verdict.lines.join("\n"));
  assert.deepEqual(verdict.changes, []);
});

describe("the continuity decision fails closed when an input cannot establish identity or proof", () => {
  it("refuses an unreadable merge-base hierarchy", () => {
    const verdict = judgeUatRevisionContinuity(inputs({ base: null }));
    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /base.*unreadable/i);
  });

  it("refuses an unreadable candidate hierarchy", () => {
    const verdict = judgeUatRevisionContinuity(inputs({ candidate: null }));
    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /candidate.*unreadable/i);
  });

  it("refuses an unavailable signed-verdict store, even when no revision changed", () => {
    const verdict = judgeUatRevisionContinuity(
      inputs({ base: snapshot(OLD), candidate: snapshot(OLD), events: null }),
    );
    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /verdict store.*unavailable/i);
  });

  it("refuses a criterion identity duplicated across stories", () => {
    const duplicate = snapshot(CURRENT);
    duplicate.stories.push({
      ...duplicate.stories[0]!,
      id: "another-story",
      title: "Another story",
    });
    const verdict = judgeUatRevisionContinuity(inputs({ candidate: duplicate }));

    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /ambiguous.*criterion/i);
    assert.match(verdict.lines.join("\n"), new RegExp(CRITERION));
  });

  it("refuses a stable criterion id that moved to another story", () => {
    const moved = snapshot(CURRENT);
    moved.stories[0] = { ...moved.stories[0]!, id: "different-owner" };
    const verdict = judgeUatRevisionContinuity(inputs({ candidate: moved }));

    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /changed owner.*agent.*different-owner/i);
  });

  it("refuses a malformed candidate revision instead of treating it as a change", () => {
    const malformed = snapshot(CURRENT);
    malformed.stories[0]!.uatTestCriteria[0]!.revisionId = "latest";
    const verdict = judgeUatRevisionContinuity(inputs({ candidate: malformed }));

    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /candidate.*unreadable|revisionId/i);
  });

  it("refuses a hierarchy projection from an unknown schema version", () => {
    const unknownSchema = { ...snapshot(CURRENT), schemaVersion: 99 };
    const verdict = judgeUatRevisionContinuity(inputs({ candidate: unknownSchema }));

    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /schema version 99/i);
  });

  it("refuses a malformed event that claims the changed criterion identity", () => {
    const malformed = {
      seq: 9,
      kind: SIGNING_EVENT_KIND,
      doc: {
        unitId: CRITERION,
        criterionId: CRITERION,
        revisionId: CURRENT,
        outcome: "pass",
      },
    };
    const verdict = judgeUatRevisionContinuity(inputs({ events: [malformed] }));

    assert.equal(verdict.ok, false);
    assert.match(verdict.lines.join("\n"), /malformed.*signed witness/i);
  });
});
