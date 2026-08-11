import test from "node:test";
import assert from "node:assert/strict";

import type { UatTestCriterionSource } from "@storytree/library";

import {
  auditDrivePrompt,
  isModelDrivenGate,
  parseDriveReport,
  selectDriveTargets,
  selectWitnessableDrive,
  uatDriveTaskPrompt,
  UAT_DRIVE_AUTONOMY_CLAUSE,
  UAT_DRIVE_HONESTY_CLAUSE,
  UAT_DRIVE_REPORT_FENCE,
  UAT_DRIVE_WITNESS_ENTRY,
  UatDriveRecord,
  type DriveGate,
  type DriveRow,
  type DriveWitnessDeps,
  type DriveWitnessPolicy,
  type UatDriveSpec,
} from "./uat-drive.js";

// The offline half of ADR-0295 D1's executor. The RUN is deliberately out-of-band (it spends
// subscription-funded model time, ADR-0010 §5); everything decidable without spending is decided
// here, exactly as `dogfood-probe.test.ts` does for gate-7.

const JOURNEY = [
  "1. **The map shows the story** _(witness: machine)_ _(proof-gate: demo#gate-1)_: open the studio at",
  "   `/`, find the story's flower, click it. _(criterion-id: uatc_0123456789abcdef01234567)_",
  "   **Success —** the traversal panel opens on that story.",
].join("\n");

const SPEC: UatDriveSpec = {
  storyId: "demo",
  storyTitle: "The demo story",
  storyOutcome: "A reader can walk from the map into a story.",
  criterionId: "uatc_0123456789abcdef01234567",
  journey: JOURNEY,
};

// ── which legs this driver owns ──────────────────────────────────────────────

function src(over: {
  id: string;
  witness?: "human" | "machine" | "either";
  proofGateId?: string;
}): UatTestCriterionSource {
  return {
    criterion: {
      criterionId: over.id,
      revisionId: `uatr1:${over.id.slice(-16)}`,
      title: `leg ${over.id}`,
      witness: over.witness ?? "either",
      wouldBe: false,
      ...(over.proofGateId !== undefined ? { proofGateId: over.proofGateId } : {}),
    },
    source: `1. **leg ${over.id}** journey prose`,
  };
}

const DRIVE_GATE: DriveGate = {
  id: "demo#gate-2",
  kind: "observe",
  proofCommand: `pnpm --filter @storytree/drive exec node --import tsx src/${UAT_DRIVE_WITNESS_ENTRY} demo uatc_aaaaaaaaaaaaaaaaaaaaaaaa`,
};
const SUITE_GATE: DriveGate = {
  id: "demo#gate-1",
  kind: "observe",
  proofCommand: "pnpm --filter @storytree/studio test",
};

test("isModelDrivenGate: only a command-bearing observe gate running the witness entry", () => {
  assert.equal(isModelDrivenGate(DRIVE_GATE), true);
  assert.equal(isModelDrivenGate(SUITE_GATE), false);
  assert.equal(isModelDrivenGate({ id: "demo#gate-3", kind: "build-tests" }), false);
  assert.equal(isModelDrivenGate({ id: "demo#gate-4", kind: "observe" }), false, "no command → not ours");
});

test("selectDriveTargets: with nothing named, drives exactly the bound model-driven machine legs", () => {
  const sources = [
    src({ id: "uatc_aaaaaaaaaaaaaaaaaaaaaaaa", witness: "machine", proofGateId: "demo#gate-2" }),
    src({ id: "uatc_bbbbbbbbbbbbbbbbbbbbbbbb", witness: "machine", proofGateId: "demo#gate-1" }),
    src({ id: "uatc_cccccccccccccccccccccccc", witness: "human" }),
    src({ id: "uatc_dddddddddddddddddddddddd", witness: "machine" }),
  ];
  const sel = selectDriveTargets(sources, [DRIVE_GATE, SUITE_GATE]);
  assert.deepEqual(
    sel.targets.map((t) => t.criterionId),
    ["uatc_aaaaaaaaaaaaaaaaaaaaaaaa"],
    "a suite-bound machine leg, a human leg and an unbound leg are all somebody else's business",
  );
  assert.deepEqual(sel.unknown, []);
});

test("selectDriveTargets: a NAMED criterion is driven even though it is not flipped or bound yet", () => {
  // ADR-0348 D5's ordering: drive first, then flip the witness and bind the gate in ONE change. If
  // this required a binding, the flip would have to come first and every sibling machine leg in the
  // story would stop signing ("no partial verdict").
  const unflipped = src({ id: "uatc_eeeeeeeeeeeeeeeeeeeeeeee", witness: "human" });
  const sel = selectDriveTargets([unflipped], [], ["uatc_eeeeeeeeeeeeeeeeeeeeeeee"]);
  assert.equal(sel.targets.length, 1);
  assert.equal(sel.targets[0]?.gateId, undefined);
  assert.equal(sel.targets[0]?.journey, unflipped.source);
});

test("selectDriveTargets: a criterion id the story does not declare is reported, not ignored", () => {
  const sel = selectDriveTargets([src({ id: "uatc_ffffffffffffffffffffffff" })], [], ["uatc_000000000000000000000000"]);
  assert.deepEqual(sel.targets, []);
  assert.deepEqual(sel.unknown, ["uatc_000000000000000000000000"]);
});

// ── the prompt ───────────────────────────────────────────────────────────────

test("uatDriveTaskPrompt: carries the authored journey VERBATIM (never a paraphrase)", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(
    prompt.includes(JOURNEY.trim()),
    "the journey must be handed over unedited — a paraphrase is the driver authoring its own acceptance claim",
  );
  assert.match(prompt, /demo/);
  assert.match(prompt, /A reader can walk from the map into a story\./);
});

test("uatDriveTaskPrompt: carries ADR-0348 D4's autonomy clause (no per-step authorization)", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_AUTONOMY_CLAUSE));
  // The two things D4 actually changes, asserted as behaviour rather than as a quoted blob.
  assert.match(prompt, /do not stop to ask\s+for authorization step by step/i);
  assert.match(prompt, /open-question/i);
});

test("uatDriveTaskPrompt: forbids editing source to make the journey pass", () => {
  assert.match(uatDriveTaskPrompt(SPEC), /Do not edit repository source to make the journey pass/i);
});

test("auditDrivePrompt: the REAL prompt keeps all three integrity properties", () => {
  const audit = auditDrivePrompt(uatDriveTaskPrompt(SPEC), JOURNEY);
  assert.equal(audit.ok, true, `drive prompt lost: ${audit.missing.join(", ")}`);
  assert.deepEqual(audit.missing, []);
});

test("auditDrivePrompt: a prompt that PARAPHRASES the journey fails the audit (the teeth)", () => {
  const paraphrased = [
    "Click the flower and check the panel opens.",
    UAT_DRIVE_HONESTY_CLAUSE,
    "```" + UAT_DRIVE_REPORT_FENCE,
  ].join("\n");
  const audit = auditDrivePrompt(paraphrased, JOURNEY);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.missing, ["the authored journey prose, verbatim"]);
});

test("auditDrivePrompt: dropping the honesty clause or the report fence each fails", () => {
  const noHonesty = [JOURNEY, "```" + UAT_DRIVE_REPORT_FENCE].join("\n");
  assert.deepEqual(auditDrivePrompt(noHonesty, JOURNEY).missing, ["the honesty clause"]);

  const noFence = [JOURNEY, UAT_DRIVE_HONESTY_CLAUSE].join("\n");
  assert.deepEqual(auditDrivePrompt(noFence, JOURNEY).missing, ["the report contract fence"]);
});

// ── the report contract ──────────────────────────────────────────────────────

function fenced(body: string): string {
  return ["I walked the journey.", "```" + UAT_DRIVE_REPORT_FENCE, body, "```"].join("\n");
}

test("parseDriveReport: reads a well-formed report", () => {
  const res = parseDriveReport(
    fenced(
      JSON.stringify({
        outcome: "pass",
        summary: "Opened the studio, clicked the flower, the panel opened.",
        steps: [{ step: "click the flower", outcome: "pass", note: "panel opened" }],
      }),
    ),
  );
  assert.equal(res.ok, true);
  assert.ok(res.ok);
  assert.equal(res.report.outcome, "pass");
  assert.equal(res.report.steps.length, 1);
  assert.equal(res.report.escalated, false, "escalated defaults false");
});

test("parseDriveReport: takes the LAST block (a driver that redrafts mid-run)", () => {
  const text = [
    fenced(JSON.stringify({ outcome: "pass", summary: "first draft" })),
    fenced(JSON.stringify({ outcome: "fail", summary: "on re-reading, step 2 never happened" })),
  ].join("\n\n");
  const res = parseDriveReport(text);
  assert.ok(res.ok);
  assert.equal(res.report.outcome, "fail");
  assert.equal(res.report.summary, "on re-reading, step 2 never happened");
});

test("parseDriveReport: NO report is a refusal, never an implied pass", () => {
  const res = parseDriveReport("Everything worked great! The journey passes.");
  assert.equal(res.ok, false);
  assert.ok(!res.ok);
  assert.match(res.reason, /MISS, not a pass/);
});

test("parseDriveReport: unreadable JSON and an off-contract shape both refuse", () => {
  const broken = parseDriveReport(fenced("{ outcome: pass,,, }"));
  assert.ok(!broken.ok);
  assert.match(broken.reason, /not valid JSON/);

  const offContract = parseDriveReport(fenced(JSON.stringify({ outcome: "maybe", summary: "eh" })));
  assert.ok(!offContract.ok);
  assert.match(offContract.reason, /does not satisfy the contract/);

  const noSummary = parseDriveReport(fenced(JSON.stringify({ outcome: "pass" })));
  assert.ok(!noSummary.ok, "a report with no summary is off-contract");
});

test("parseDriveReport: an escalation (ADR-0348 D4) round-trips with its question id", () => {
  const res = parseDriveReport(
    fenced(
      JSON.stringify({
        outcome: "fail",
        summary: "unsure whether to merge the PR the journey asks for; asked the owner",
        escalated: true,
        openQuestionId: "oq-should-the-drive-merge",
      }),
    ),
  );
  assert.ok(res.ok);
  assert.equal(res.report.escalated, true);
  assert.equal(res.report.openQuestionId, "oq-should-the-drive-merge");
});

// ── the record shape ─────────────────────────────────────────────────────────

test("UatDriveRecord: rejects an unknown field (nothing forgeable rides along)", () => {
  const base = {
    storyId: "demo",
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:deadbeefdeadbeef",
    outcome: "pass",
    commitSha: "abc1234",
    runId: "uat-drive:1",
    driver: "claude-code",
    summary: "walked it",
    at: "2026-08-12T00:00:00.000Z",
  };
  assert.ok(UatDriveRecord.safeParse(base).success);
  assert.equal(
    UatDriveRecord.safeParse({ ...base, proofMode: "story", signer: "spine" }).success,
    false,
    "a drive record must never be shaped like a signed verdict — no model signs its own proof",
  );
});

// ── the witness selector ─────────────────────────────────────────────────────

const NOW = new Date("2026-08-12T00:00:00.000Z");
const POLICY: DriveWitnessPolicy = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:deadbeefdeadbeef",
  freshnessDays: 90,
};
const DEPS: DriveWitnessDeps = { ancestorOfHead: () => true, now: () => NOW };

function row(over: Partial<DriveRow> = {}): DriveRow {
  return {
    criterionId: POLICY.criterionId,
    revisionId: POLICY.revisionId,
    outcome: "pass",
    commitSha: "abc1234def",
    runId: "uat-drive:1",
    driver: "claude-code",
    at: "2026-08-10T00:00:00.000Z",
    ...over,
  };
}

test("selectWitnessableDrive: a fresh landed pass over the current revision witnesses", () => {
  const res = selectWitnessableDrive([row()], POLICY, DEPS);
  assert.ok(res.ok);
  assert.equal(res.drive.runId, "uat-drive:1");
});

test("selectWitnessableDrive: no rows at all names the repair (run the driver)", () => {
  const res = selectWitnessableDrive([], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /run the driver/);
});

test("selectWitnessableDrive: a re-authored journey INVALIDATES the drive (the honesty wall)", () => {
  const res = selectWitnessableDrive([row({ revisionId: "uatr1:0000000000000000" })], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /the journey prose changed since it was driven/);
});

test("selectWitnessableDrive: a fail, a stale pass, and an unlanded commit each disqualify", () => {
  const failed = selectWitnessableDrive([row({ outcome: "fail" })], POLICY, DEPS);
  assert.ok(!failed.ok);
  assert.match(failed.reasons.join("\n"), /outcome "fail", not "pass"/);

  const stale = selectWitnessableDrive([row({ at: "2026-01-01T00:00:00.000Z" })], POLICY, DEPS);
  assert.ok(!stale.ok);
  assert.match(stale.reasons.join("\n"), /is stale/);

  const unlanded = selectWitnessableDrive([row()], POLICY, { ...DEPS, ancestorOfHead: () => false });
  assert.ok(!unlanded.ok);
  assert.match(unlanded.reasons.join("\n"), /not an ancestor of HEAD/);
});

test("selectWitnessableDrive: a drive for a DIFFERENT criterion never witnesses this one", () => {
  const res = selectWitnessableDrive([row({ criterionId: "uatc_ffffffffffffffffffffffff" })], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /is for criterion uatc_ffffffffffffffffffffffff/);
});

test("selectWitnessableDrive: picks the LATEST qualifying pass, past disqualified siblings", () => {
  const res = selectWitnessableDrive(
    [
      row({ runId: "old", at: "2026-08-01T00:00:00.000Z" }),
      row({ runId: "failed", outcome: "fail", at: "2026-08-11T00:00:00.000Z" }),
      row({ runId: "newest", at: "2026-08-09T00:00:00.000Z" }),
    ],
    POLICY,
    DEPS,
  );
  assert.ok(res.ok);
  assert.equal(res.drive.runId, "newest");
});
