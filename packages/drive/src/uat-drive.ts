/**
 * The model-driven UAT executor's PURE core (ADR-0295 D1, ordered and shaped by ADR-0348 D5).
 *
 * ADR-0295 D1 has said since 2026-08-03 that *"a model driving [a journey] headlessly or through a
 * browser is such a run, and its reported outcome is admissible as the verdict"* — and until now
 * nothing executed that sentence. ADR-0348 D5 both named the gap and fixed its shape: the executor is
 * the existing two-file house pattern (`dogfood-probe.run.ts` / `dogfood-witness.check.ts`), so that
 * `observeAndSign` and the whole signing path are reused **unchanged**.
 *
 * The three files, and the wall between them:
 *  - THIS module — the pure, offline-testable heart: the drive prompt, the report contract the model
 *    must answer in, and the witness selector. No store, no clock, no subprocess, no git.
 *  - `uat-drive.run.ts` — the deliberate, out-of-band, subscription-funded RUN. It spawns a fresh
 *    model session per criterion, and persists a {@link UatDriveRecord} to `events.uat_drive`. Never
 *    a `*.test.ts`, never on a gate pass (ADR-0010 §5).
 *  - `uat-drive-witness.check.ts` — the cheap, free `observe` command a flipped `machine` leg binds
 *    as its `(proof-gate:)`. It only WITNESSES the persisted record.
 *
 * **No model signs its own verdict, and this module is where that stays true.** A drive record is an
 * ARTIFACT, not proof: the record says what a model reported, and the only thing that ever mints a
 * {@link Verdict} is `observeAndSign`, over an exit code the SPINE watched out-of-band — exactly as
 * for a Playwright suite. ADR-0295 D2's prohibition holds in full: no `model` witness kind, no
 * eligibility tier, no rubric judge (`packages/model-uat*` stays retired).
 *
 * **What a flipped leg declares.** For the sibling flip increment, the binding shape is:
 *
 *   in `## UAT Test Criteria`  — the leg carries `_(witness: machine)_ _(proof-gate: <story>#gate-<n>)_`
 *   in `## Reliability Gates`  — a new numbered item tagged `_(gate: observe)_` whose first
 *                                backticked span after the tag is
 *                                `pnpm --filter @storytree/drive exec node --import tsx
 *                                src/uat-drive-witness.check.ts <story-id> <criterion-id>`
 *                                (a span wrapped across prose lines is collapsed by the parser).
 *
 * Two mechanics that bite. The gate id is POSITIONAL (`parseReliabilityGates`), so a gate is
 * APPENDED, never inserted — the `drive-machinery#gate-4` tombstone records what renumbering costs.
 * And the `(witness: …)` tag is inside the hashed canonical content, so flipping it without
 * recomputing the leg's `revision-id` makes `parseUatTestCriteria` THROW for that whole story.
 */

import type { ReliabilityGate, UatTestCriterionSource } from "@storytree/library";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Which legs this driver is responsible for
// ---------------------------------------------------------------------------

/**
 * The witness entry filename. A `machine` leg is MODEL-DRIVEN exactly when the observe gate it binds
 * runs this — the binding is self-describing, so nothing needs a second registry saying which legs a
 * model drives and which Playwright does, and the two can never disagree.
 */
export const UAT_DRIVE_WITNESS_ENTRY = "uat-drive-witness.check.ts";

/** The gate fields the target selector reads. */
export type DriveGate = Pick<ReliabilityGate, "id" | "kind" | "proofCommand">;

/** PURE: is this a command-bearing observe gate whose command is the UAT-drive witness? */
export function isModelDrivenGate(gate: DriveGate): boolean {
  return gate.kind === "observe" && (gate.proofCommand ?? "").includes(UAT_DRIVE_WITNESS_ENTRY);
}

/** One criterion the run will drive, with the journey text and the gate (if any) that will witness it. */
export interface DriveTarget {
  readonly criterionId: string;
  readonly revisionId: string;
  readonly title: string;
  readonly journey: string;
  /** The observe gate that will witness this drive, or `undefined` when the leg is not yet bound. */
  readonly gateId: string | undefined;
}

export interface DriveTargetSelection {
  readonly targets: DriveTarget[];
  /** Criterion ids named explicitly that the story does not declare. */
  readonly unknown: string[];
}

/**
 * PURE: which criteria this run drives.
 *
 * Two modes, and the difference is deliberate ordering support for ADR-0348 D5.
 *
 *  - **Named explicitly** (`only`) — drive exactly those, WHATEVER their current witness or binding.
 *    This is how the flip is bootstrapped without ever violating D5: a leg is driven first, its
 *    record lands, and only then is it flipped to `machine` in the same change that binds its gate.
 *    Flipping first would leave the story holding an unbound machine leg, which refuses signing for
 *    every sibling ("no partial verdict").
 *  - **Nothing named** — drive every `machine` leg already bound to a UAT-drive witness gate. This is
 *    the standing re-run, e.g. after a journey is re-authored and its old drive stops witnessing.
 */
export function selectDriveTargets(
  sources: readonly UatTestCriterionSource[],
  gates: readonly DriveGate[],
  only?: readonly string[],
): DriveTargetSelection {
  const target = (s: UatTestCriterionSource): DriveTarget => ({
    criterionId: s.criterion.criterionId,
    revisionId: s.criterion.revisionId,
    title: s.criterion.title,
    journey: s.source,
    gateId: s.criterion.proofGateId,
  });

  if (only !== undefined && only.length > 0) {
    const wanted = new Set(only);
    const targets = sources.filter((s) => wanted.has(s.criterion.criterionId)).map(target);
    const found = new Set(targets.map((t) => t.criterionId));
    return { targets, unknown: only.filter((id) => !found.has(id)) };
  }

  const driveGates = new Set(gates.filter(isModelDrivenGate).map((g) => g.id));
  const targets = sources
    .filter(
      (s) =>
        s.criterion.witness === "machine" &&
        s.criterion.proofGateId !== undefined &&
        driveGates.has(s.criterion.proofGateId),
    )
    .map(target);
  return { targets, unknown: [] };
}

// ---------------------------------------------------------------------------
// The persisted artifact
// ---------------------------------------------------------------------------

/** How one authored step of the journey came out, as the driver reports it. */
export const UAT_DRIVE_STEP_OUTCOMES = ["pass", "fail", "skipped"] as const;
export const UatDriveStepOutcome = z.enum(UAT_DRIVE_STEP_OUTCOMES);
export type UatDriveStepOutcome = z.infer<typeof UatDriveStepOutcome>;

/**
 * One step of the driven journey. The per-step log is ADR-0295 D4's "available, not required"
 * evidence retention taken at its cheapest: it costs the driver nothing to enumerate what it did,
 * and it is the only thing that distinguishes a run that performed the journey from one that
 * summarised it — the exact indistinguishability ADR-0295's Context names as the accepted risk.
 */
export const UatDriveStep = z
  .object({
    step: z.string().min(1),
    outcome: UatDriveStepOutcome,
    note: z.string().optional(),
  })
  .strict();
export type UatDriveStep = z.infer<typeof UatDriveStep>;

/**
 * What the MODEL authors at the end of a drive — the report contract, and the whole of what it is
 * trusted to say. Everything else on a {@link UatDriveRecord} (the identity, the pinned commit, the
 * clock) is stamped by the harness, never by the model.
 */
export const UatDriveReport = z
  .object({
    outcome: z.enum(["pass", "fail"]),
    summary: z.string().min(1),
    steps: z.array(UatDriveStep).default([]),
    /** ADR-0348 D4: the driver was itself unsure and raised an `open-question` rather than deciding. */
    escalated: z.boolean().default(false),
    /** The `open-question` artifact id, when `escalated`. */
    openQuestionId: z.string().min(1).optional(),
  })
  .strict();
export type UatDriveReport = z.infer<typeof UatDriveReport>;

/**
 * One persisted drive record — the artifact `uat-drive-witness.check.ts` witnesses.
 *
 * `revisionId` is the load-bearing field. It binds the record to the EXACT criterion content that
 * was driven (ADR-0253's content-bound revisions), so re-authoring the journey prose invalidates
 * every prior drive instead of silently carrying its green onto a different claim.
 */
export const UatDriveRecord = z
  .object({
    storyId: z.string().min(1),
    criterionId: z.string().min(1),
    revisionId: z.string().min(1),
    outcome: z.enum(["pass", "fail"]),
    /** The clean, committed HEAD the journey was driven against. */
    commitSha: z.string().min(1),
    runId: z.string().min(1),
    /** The runtime that drove it (e.g. `claude-code`) — provenance, never authority. */
    driver: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(UatDriveStep).default([]),
    escalated: z.boolean().default(false),
    openQuestionId: z.string().min(1).optional(),
    at: z.string().min(1),
  })
  .strict();
export type UatDriveRecord = z.infer<typeof UatDriveRecord>;

// ---------------------------------------------------------------------------
// The drive prompt
// ---------------------------------------------------------------------------

/** The fence tag the driver's machine-readable report must be wrapped in. */
export const UAT_DRIVE_REPORT_FENCE = "storytree-uat-drive";

/**
 * The honesty clause, verbatim. Pulled out as a constant so {@link auditDrivePrompt} can hold the
 * real prompt to it: this sentence is the only thing standing between "the journey ran" and "the
 * journey was summarised", and a prompt edit that drops it must red the suite rather than quietly
 * weaken every future green.
 */
export const UAT_DRIVE_HONESTY_CLAUSE =
  "A step you could not actually perform is a FAIL, never a pass. Do not report a pass for anything " +
  "you skipped, simulated, inferred, or assumed would work — report what happened.";

/**
 * ADR-0348 D4, verbatim in the prompt: the driver proceeds on its own judgment through spend and
 * outward-facing steps, and escalates only when IT is unsure. Deliberately looser than an approval
 * gate, and deliberately SCOPED — `asset:attempt-privileged-actions-approve-inline` continues to
 * govern privileged actions taken outside a UAT drive, which is why this text lives in the drive
 * prompt and nowhere else.
 */
export const UAT_DRIVE_AUTONOMY_CLAUSE =
  "Proceed on your own judgment. If a step of this journey spends subscription-funded model time, " +
  "opens a pull request, merges to main, or grants an in-app privilege, DO IT — do not stop to ask " +
  "for authorization step by step. Escalate only when YOU are genuinely unsure whether to continue: " +
  "in that case stop, raise an open-question against the owning arc " +
  "(`storytree question new --arc <arc-id> --title \"…\" --stakes … --statement … --pg`), and report " +
  "`escalated: true` with its id.";

/** Everything the prompt builder needs about the criterion being driven. */
export interface UatDriveSpec {
  readonly storyId: string;
  readonly storyTitle: string;
  /** The story's stated outcome — the goal the journey is a walkthrough of. */
  readonly storyOutcome: string;
  readonly criterionId: string;
  /**
   * The criterion's authored prose item, VERBATIM (`parseUatTestCriterionSources().source`). It is
   * handed to the model unedited: ADR-0295's own mitigation for a driver that would otherwise author
   * and judge its own assertions is that the claim being tested stays human-authored.
   */
  readonly journey: string;
}

/**
 * The drive task, parameterized by the criterion. It states the GOAL and hands over the authored
 * journey verbatim; it never restates, paraphrases, or decomposes the journey, because a paraphrase
 * is the driver quietly authoring its own acceptance claim.
 */
export function uatDriveTaskPrompt(spec: UatDriveSpec): string {
  return [
    `You are driving a user-acceptance journey for the storytree story "${spec.storyId}" — ${spec.storyTitle}.`,
    "",
    `The story's outcome: ${spec.storyOutcome}`,
    "",
    "Below is ONE acceptance criterion, exactly as a human authored it. It is a journey through a real",
    "surface, not a specification. Your job is to WALK IT, for real, end to end, against the real",
    "system — the real CLI, the real store, the real UI in a real browser — and then report what",
    "actually happened.",
    "",
    "--- THE JOURNEY (authored; do not reinterpret its claim) ---",
    spec.journey.trim(),
    "--- END OF JOURNEY ---",
    "",
    "How to drive it:",
    "",
    "  - Read CLAUDE.md first; it is the authoritative orientation for this repository.",
    "  - Use whatever this repository actually offers — shell commands, the storytree CLI, headless or",
    "    browser control of a running surface. Bring up what you need (the dev server, the database).",
    `  - The annotations in the journey — (witness: …), (proof-gate: …), (criterion-id: …),`,
    "    (revision-id: …) — are bookkeeping for the proof machinery. They are not steps. Ignore them.",
    "  - Do not edit repository source to make the journey pass. You are testing what is here, not",
    "    building what is missing. If the surface is broken, that is a FAIL and it is the finding.",
    "",
    UAT_DRIVE_AUTONOMY_CLAUSE,
    "",
    UAT_DRIVE_HONESTY_CLAUSE,
    "",
    "When you are done — whichever way it went — end your final message with EXACTLY one fenced block",
    "in this form and nothing after it:",
    "",
    "```" + UAT_DRIVE_REPORT_FENCE,
    "{",
    '  "outcome": "pass" | "fail",',
    '  "summary": "one paragraph: what you did and what you observed",',
    '  "steps": [',
    '    { "step": "what you attempted", "outcome": "pass" | "fail" | "skipped", "note": "what you saw" }',
    "  ],",
    '  "escalated": false',
    "}",
    "```",
    "",
    "`outcome` is `pass` only when every step of the authored journey above actually happened and the",
    "success condition it states was observed. Anything else — a step you skipped, a surface that did",
    "not come up, an assertion you could not check — is `fail`. There is no partial pass.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The prompt integrity audit
// ---------------------------------------------------------------------------

/** The outcome of {@link auditDrivePrompt} — `missing` names each property the prompt lost. */
export interface DrivePromptAudit {
  readonly ok: boolean;
  readonly missing: string[];
}

/**
 * PURE: does `prompt` still carry the three properties a drive prompt is only honest with?
 *
 * This is the analogue of gate-7's `auditUncoached`, and it exists for the same reason: the prompt is
 * the whole harness, an authoring property is easy to lose in an edit, and losing it is SILENT — a
 * weakened prompt still runs, still returns a report, and still greens legs. The three:
 *
 *  1. the authored journey appears VERBATIM (a paraphrase is the driver authoring its own claim,
 *     which is precisely the failure mode ADR-0295's Consequences names);
 *  2. the honesty clause is present (without it a summarised run and a driven run are the same text);
 *  3. the report contract is named, so an absent report is a MISS rather than an implied pass.
 *
 * The drive suite runs it against the real {@link uatDriveTaskPrompt}, so an edit that drops one
 * reds `pnpm -r test` instead of quietly degrading every later drive.
 */
export function auditDrivePrompt(prompt: string, journey: string): DrivePromptAudit {
  const missing: string[] = [];
  if (!prompt.includes(journey.trim())) missing.push("the authored journey prose, verbatim");
  if (!prompt.includes(UAT_DRIVE_HONESTY_CLAUSE)) missing.push("the honesty clause");
  if (!prompt.includes(UAT_DRIVE_REPORT_FENCE)) missing.push("the report contract fence");
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Reading the model's report
// ---------------------------------------------------------------------------

export type DriveReportParse =
  | { ok: true; report: UatDriveReport }
  | { ok: false; reason: string };

const FENCE = new RegExp("```" + UAT_DRIVE_REPORT_FENCE + "\\s*\\n([\\s\\S]*?)```", "g");

/**
 * PURE + FAIL-CLOSED: read the driver's machine-readable report out of its final text.
 *
 * Takes the LAST fenced block (a driver that corrects itself mid-run leaves earlier drafts behind).
 * Every failure path — no block, unparseable JSON, a shape that does not satisfy the contract —
 * returns a refusal, never a default. That asymmetry is the point: a run whose report cannot be read
 * did not pass, and the caller exits non-zero. An implied pass is the one outcome this parser can
 * never produce.
 */
export function parseDriveReport(text: string): DriveReportParse {
  const blocks = [...text.matchAll(FENCE)].map((m) => m[1] ?? "");
  const last = blocks.at(-1);
  if (last === undefined) {
    return {
      ok: false,
      reason: `the driver emitted no \`\`\`${UAT_DRIVE_REPORT_FENCE} report block — the run reported nothing readable, which is a MISS, not a pass`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch (e) {
    return { ok: false, reason: `the driver's report block is not valid JSON: ${(e as Error).message}` };
  }
  const parsed = UatDriveReport.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `the driver's report does not satisfy the contract: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "invalid"}`,
    };
  }
  return { ok: true, report: parsed.data };
}

// ---------------------------------------------------------------------------
// The witness selector
// ---------------------------------------------------------------------------

/** One `events.uat_drive` row, as the witness check reads it. */
export interface DriveRow {
  readonly criterionId: string;
  readonly revisionId: string;
  readonly outcome: string;
  readonly commitSha: string;
  readonly runId: string;
  readonly driver: string;
  /** ISO-8601. */
  readonly at: string;
}

export interface DriveWitnessPolicy {
  /** The criterion the bound leg names. */
  readonly criterionId: string;
  /** The criterion's CURRENT content-bound revision, read from the story prose at check time. */
  readonly revisionId: string;
  /** Freshness floor in days (ADR-0016 ageing). */
  readonly freshnessDays: number;
}

export interface DriveWitnessDeps {
  /** True when `sha` is an ancestor of HEAD. Injected → the selector stays pure and shallow-safe. */
  ancestorOfHead(sha: string): boolean;
  now(): Date;
}

export type DriveWitnessResult =
  | { ok: true; drive: DriveRow }
  | { ok: false; reasons: string[] };

const MS_PER_DAY = 86_400_000;

function disqualify(
  row: DriveRow,
  policy: DriveWitnessPolicy,
  deps: DriveWitnessDeps,
): string | null {
  if (row.criterionId !== policy.criterionId) {
    return `drive ${row.runId} is for criterion ${row.criterionId}, not ${policy.criterionId}`;
  }
  if (row.revisionId !== policy.revisionId) {
    return (
      `drive ${row.runId} drove revision ${row.revisionId}, but the criterion now reads ` +
      `${policy.revisionId} — the journey prose changed since it was driven, so the drive witnesses a claim that no longer exists (re-run the driver)`
    );
  }
  if (row.outcome !== "pass") {
    return `drive ${row.runId} reported outcome "${row.outcome}", not "pass"`;
  }
  const atMs = Date.parse(row.at);
  if (Number.isNaN(atMs)) return `drive ${row.runId} has an unparseable "at" timestamp: "${row.at}"`;
  const ageDays = (deps.now().getTime() - atMs) / MS_PER_DAY;
  if (ageDays > policy.freshnessDays) {
    return `drive ${row.runId} is stale: ${ageDays.toFixed(2)} days old, exceeds freshnessDays ${policy.freshnessDays}`;
  }
  if (!deps.ancestorOfHead(row.commitSha)) {
    return `drive ${row.runId} at commit ${row.commitSha.slice(0, 10)} is not an ancestor of HEAD`;
  }
  return null;
}

/**
 * PURE: the most recent drive record that honestly witnesses this criterion — a `pass`, over the
 * criterion's CURRENT revision, recent, at a commit in HEAD's ancestry. Mirrors
 * `selectWitnessableVerdict` (gate-6/gate-7's core) so the two witness checks cannot drift apart on
 * what "still counts" means.
 *
 * Total and fail-closed: with nothing qualifying it returns every disqualification reason, so the
 * check can tell an operator WHY it is red — a stale drive, a changed journey and an unlanded commit
 * are three different repairs.
 */
export function selectWitnessableDrive(
  rows: readonly DriveRow[],
  policy: DriveWitnessPolicy,
  deps: DriveWitnessDeps,
): DriveWitnessResult {
  if (rows.length === 0) {
    return {
      ok: false,
      reasons: [`no drive records for criterion ${policy.criterionId} — run the driver (uat-drive.run.ts)`],
    };
  }
  const reasons: string[] = [];
  let best: { row: DriveRow; atMs: number } | null = null;
  for (const row of rows) {
    const reason = disqualify(row, policy, deps);
    if (reason !== null) {
      reasons.push(reason);
      continue;
    }
    const atMs = Date.parse(row.at);
    if (best === null || atMs > best.atMs) best = { row, atMs };
  }
  return best !== null ? { ok: true, drive: best.row } : { ok: false, reasons };
}
