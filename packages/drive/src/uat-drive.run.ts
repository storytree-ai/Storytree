/**
 * The model-driven UAT DRIVE RUN (ADR-0295 D1, shaped by ADR-0348 D5) — the deliberate, out-of-band,
 * live-only run that PRODUCES the artifact `uat-drive-witness.check.ts` witnesses.
 *
 * It is NOT a `*.test.ts` and never runs on a gate pass: each criterion spawns a fresh,
 * subscription-funded Claude Code session in the repo root, so ADR-0010 §5 keeps it out-of-band —
 * exactly as `dogfood-probe.run.ts` is. The driving session inherits whatever tools the local Claude
 * Code install actually has (shell and the storytree CLI always; browser / headless control only
 * where that MCP is configured), which is a property of the machine, not of this harness — a journey
 * through a surface the local session cannot reach is a `fail` with that named as the reason, not a
 * silent pass.
 *
 * What it does, per criterion: hand the model the criterion's AUTHORED journey prose verbatim
 * (`uatDriveTaskPrompt`), let it walk the journey for real against the real system, read back its
 * machine-readable report (`parseDriveReport`, fail-closed — no report is a MISS, never an implied
 * pass), and append a {@link UatDriveRecord} to `events.uat_drive`.
 *
 * **It signs nothing.** The record is an artifact: it says what a model reported. The verdict is
 * still minted by `observeAndSign` over an exit code the SPINE watched — the witness check's — so
 * ADR-0295 D2's "no verdict a model signs for itself" holds without the signing path changing a line.
 *
 * **ADR-0348 D4 is in force inside the prompt, and only there.** The driver proceeds on its own
 * judgment through steps that spend subscription-funded model time or that are outward-facing, and
 * raises an `open-question` only when IT is unsure. That widening is scoped to a UAT drive;
 * `asset:attempt-privileged-actions-approve-inline` is untouched everywhere else.
 *
 * Fail-closed before any spend: a dirty tree refuses (the record pins the commit the journey was
 * driven against), an unreachable store refuses (a record that does not persist witnesses nothing),
 * and a prompt that has lost the authored journey, the honesty clause, or the report contract refuses
 * (`auditDrivePrompt`).
 *
 * Usage:
 *   pnpm --filter @storytree/drive exec node --import tsx src/uat-drive.run.ts <story-id> [criterion-id…]
 *
 * With no criterion ids it drives every `machine` leg already bound to a UAT-drive witness gate. Name
 * ids explicitly to drive a leg that is not bound yet — which is how ADR-0348 D5's ordering is
 * honoured: drive first, then flip the witness and bind the gate in one change.
 * (DB up + subscription auth in ~/.storytree/secrets.json; a laptop/full clone, not a 443-only remote.)
 *
 * `STORYTREE_UAT_DRIVE_TIMEOUT_MIN=<minutes>` raises the per-criterion wall-clock ceiling from its
 * 30-min default, for a journey that CONTAINS a long operation (see {@link DRIVE_TIMEOUT_MIN}).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseUatTestCriterionSources } from "@storytree/library";
import { applySchema, closePool, createPool } from "@storytree/library/store";
import { loadNodeSpec } from "@storytree/orchestrator";

import { ensureLiveDb } from "./db-control.js";
import { loadLocalSecrets } from "./secrets.js";
import {
  auditDrivePrompt,
  parseDriveReport,
  selectDriveTargets,
  uatDriveTaskPrompt,
  UatDriveRecord,
  type DriveTarget,
} from "./uat-drive.js";

/**
 * Wall-clock ceiling for ONE criterion's drive (bring up a surface, walk it, report), in minutes.
 *
 * 30 was calibrated on the first slice's journeys, which measured 4–14 min. It is NOT enough for
 * every journey, and the failure is expensive and silent-looking: a criterion whose walk CONTAINS a
 * long operation — `studio-build` leg 10's walk is a real `story build --real` that authors every
 * capability and opens a PR, which routinely exceeds 30 min on its own — is cut off mid-run, emits
 * no report block, and is recorded as a MISS. A MISS is correctly not a pass, but it is also not a
 * finding about the product: the gate goes red for a HARNESS reason, which is exactly the outcome
 * ADR-0348's flip increment says to keep distinct from a real red.
 *
 * So the ceiling is an env override rather than a constant. It stays a CEILING — a drive that needs
 * one is telling you its journey is long, not that the limit is wrong to have.
 */
const DRIVE_TIMEOUT_MIN = readTimeoutMinutes();
const DRIVE_TIMEOUT_MS = DRIVE_TIMEOUT_MIN * 60_000;

/** `STORYTREE_UAT_DRIVE_TIMEOUT_MIN`, when it is a positive finite number; else the 30-min default. */
function readTimeoutMinutes(): number {
  const raw = process.env["STORYTREE_UAT_DRIVE_TIMEOUT_MIN"];
  if (raw === undefined || raw.trim().length === 0) return 30;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(
      `[uat-drive] ignoring STORYTREE_UAT_DRIVE_TIMEOUT_MIN="${raw}" — not a positive number; using the 30-min default.`,
    );
    return 30;
  }
  return parsed;
}

/** Provenance stamped on the record — which runtime drove it. Never authority; the spine still signs. */
const DRIVER = "claude-code";

/** How much of an unreadable run's final text to echo for diagnosis. Never persisted, never evidence. */
const UNREADABLE_TAIL_CHARS = 4000;

/** The last {@link UNREADABLE_TAIL_CHARS} of `text`, indented so it cannot be mistaken for run output. */
function indentTail(text: string): string {
  const tail = text.length > UNREADABLE_TAIL_CHARS ? text.slice(-UNREADABLE_TAIL_CHARS) : text;
  return tail
    .split("\n")
    .map((line) => `  | ${line}`)
    .join("\n");
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function log(msg: string): void {
  console.log(`[uat-drive] ${msg}`);
}

/** The model's whole final text — the SDK's JSON result when parseable, else raw stdout. */
function finalText(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    if (typeof parsed.result === "string") return parsed.result;
  } catch {
    /* not JSON — fall through to the raw stream */
  }
  return stdout;
}

async function main(): Promise<number> {
  const [storyId, ...only] = process.argv.slice(2);
  if (storyId === undefined || storyId.trim().length === 0) {
    console.error("usage: node --import tsx src/uat-drive.run.ts <story-id> [criterion-id…]");
    return 2;
  }

  loadLocalSecrets(); // CLAUDE_CODE_OAUTH_TOKEN (the driver) + STORYTREE_DB_USER (the record store)

  const toplevel = git(["rev-parse", "--show-toplevel"], process.cwd());
  const storyFile = path.join(toplevel, "stories", storyId, "story.md");
  if (!existsSync(storyFile)) {
    console.error(`[uat-drive] no such story: ${storyFile}`);
    return 1;
  }

  const spec = loadNodeSpec(storyFile);
  const body = readFileSync(storyFile, "utf8").replace(/\r\n/g, "\n");
  const sources = parseUatTestCriterionSources(storyId, body);
  const selection = selectDriveTargets(sources, spec.reliabilityGates, only);
  if (selection.unknown.length > 0) {
    console.error(
      `[uat-drive] story "${storyId}" declares no criterion ${selection.unknown.join(", ")}.\n` +
        `  declared: ${sources.map((s) => s.criterion.criterionId).join(", ")}`,
    );
    return 1;
  }
  if (selection.targets.length === 0) {
    console.error(
      `[uat-drive] nothing to drive for "${storyId}": no machine leg is bound to a UAT-drive witness gate.\n` +
        "  Name the criterion ids explicitly to drive legs that are not bound yet (ADR-0348 D5: drive first, flip second).",
    );
    return 1;
  }

  // Fail-closed BEFORE any spend: every prompt must still carry the authored journey verbatim, the
  // honesty clause, and the report contract. The standing test (`uat-drive.test.ts`) proves this of
  // the builder; asserting it per run means a drive can never spend against a weakened prompt.
  const prompts = new Map<string, string>();
  for (const t of selection.targets) {
    const prompt = uatDriveTaskPrompt({
      storyId,
      storyTitle: spec.title,
      storyOutcome: spec.outcome,
      criterionId: t.criterionId,
      journey: t.journey,
    });
    const audit = auditDrivePrompt(prompt, t.journey);
    if (!audit.ok) {
      console.error(`[uat-drive] REFUSED: the drive prompt for ${t.criterionId} lost ${audit.missing.join(", ")}`);
      return 1;
    }
    prompts.set(t.criterionId, prompt);
  }

  // The record pins the commit the journey was driven against, so a dirty tree would record a claim
  // about a commit nobody can reconstruct (the `uat attest` / `observeAndSign` posture).
  const commitSha = git(["rev-parse", "HEAD"], toplevel);
  if (git(["status", "--porcelain"], toplevel).length > 0) {
    console.error(
      "[uat-drive] REFUSED: the working tree is DIRTY. A drive record pins the commit that was driven;\n" +
        "recording against uncommitted edits would claim a commit that does not match what was walked.\n" +
        "Commit (or stash) first, then drive the clean commit.",
    );
    return 1;
  }

  log(`bringing the live store up (the record persists to events.uat_drive)…`);
  const ready = await ensureLiveDb((m) => console.error(`[db] ${m}`));
  if (!ready.ok) {
    console.error(`[uat-drive] the database could not be brought up: ${ready.reason}`);
    return 1;
  }

  const runId = `uat-drive:${storyId}:${commitSha.slice(0, 10)}:${process.pid}`;
  log(
    `driving ${selection.targets.length} criterion(s) of "${storyId}" @ ${commitSha.slice(0, 10)} — ` +
      `each is a fresh subscription-funded session (ADR-0010 §5, out-of-band), ceiling ${DRIVE_TIMEOUT_MIN} min.`,
  );

  const handle = await createPool();
  const failures: string[] = [];
  try {
    await applySchema(handle.pool);

    for (const t of selection.targets) {
      const outcome = await driveOne(t, prompts.get(t.criterionId)!, {
        storyId,
        commitSha,
        runId,
        cwd: toplevel,
        pool: handle.pool,
      });
      if (outcome !== null) failures.push(outcome);
    }
  } finally {
    await closePool(handle.pool, handle.connector);
  }

  if (failures.length > 0) {
    console.error(`[uat-drive] ${failures.length} of ${selection.targets.length} criterion(s) did NOT pass:`);
    for (const f of failures) console.error(`  x ${f}`);
    console.error(
      "\nA failed journey is a real finding, not a flaky harness — read the record's summary in\n" +
        "events.uat_drive before re-running. The witness gate stays honestly red until a pass lands.",
    );
    return 1;
  }
  log(`SUCCESS — every driven criterion passed and its record persisted. The witness gate can now see them:`);
  for (const t of selection.targets) {
    log(`  pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts ${storyId} ${t.criterionId}`);
  }
  return 0;
}

interface DriveContext {
  storyId: string;
  commitSha: string;
  runId: string;
  cwd: string;
  pool: { query(text: string, values?: unknown[]): Promise<unknown> };
}

/** Drive ONE criterion and persist its record. Returns a failure line, or `null` on a clean pass. */
async function driveOne(target: DriveTarget, prompt: string, ctx: DriveContext): Promise<string | null> {
  log(`— ${target.criterionId}: ${target.title}`);
  const t0 = Date.now();
  const res = spawnSync("claude", ["-p", "--permission-mode", "bypassPermissions", "--output-format", "json"], {
    cwd: ctx.cwd,
    input: prompt,
    encoding: "utf8",
    shell: true,
    timeout: DRIVE_TIMEOUT_MS,
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  const mins = ((Date.now() - t0) / 60_000).toFixed(1);
  if (res.error !== undefined && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    log(
      `  hit the ${DRIVE_TIMEOUT_MIN}-min ceiling (${mins}m) — reading whatever it reported…\n` +
        "  NOTE: a run cut off here usually emits no report, which records as a MISS. A MISS is not a\n" +
        "  pass, but it is also NOT a finding about the product — re-run with\n" +
        "  STORYTREE_UAT_DRIVE_TIMEOUT_MIN=<minutes> before reading its red as a real one.",
    );
  } else {
    log(`  the drive session finished after ${mins}m (exit ${res.status}).`);
  }

  const text = finalText(res.stdout ?? "");
  const parsed = parseDriveReport(text);
  if (!parsed.ok) {
    // A run whose report cannot be read did NOT pass, and nothing is PERSISTED — an unreadable run
    // must leave no trace a later witness could mistake for evidence. But "persists nothing" was
    // over-read as "says nothing": the model's whole account of the run was discarded too, so a MISS
    // arrived as one line with no way to tell a driver that hit a wall from one that ended a turn
    // early, and diagnosing it cost a second paid drive. The tail below is DIAGNOSTIC OUTPUT, not
    // evidence — it reaches stderr and never `events.uat_drive`, so the witness gate cannot see it.
    console.error(`  x ${target.criterionId}: ${parsed.reason}`);
    console.error(`  --- the driver's last ${UNREADABLE_TAIL_CHARS} chars (diagnostic only; nothing was persisted) ---`);
    console.error(text.length > 0 ? indentTail(text) : "  (the driver produced no output at all)");
    console.error("  --- end of unreadable output ---");
    return `${target.criterionId} — ${parsed.reason}`;
  }
  const report = parsed.report;

  const record = UatDriveRecord.parse({
    storyId: ctx.storyId,
    criterionId: target.criterionId,
    revisionId: target.revisionId,
    outcome: report.outcome,
    commitSha: ctx.commitSha,
    runId: ctx.runId,
    driver: DRIVER,
    summary: report.summary,
    steps: report.steps,
    escalated: report.escalated,
    ...(report.openQuestionId !== undefined ? { openQuestionId: report.openQuestionId } : {}),
    at: new Date().toISOString(),
  });

  await ctx.pool.query(
    `INSERT INTO events.uat_drive (story_id, criterion_id, revision_id, outcome, commit_sha, run_id, driver, doc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      record.storyId,
      record.criterionId,
      record.revisionId,
      record.outcome,
      record.commitSha,
      record.runId,
      record.driver,
      JSON.stringify(record),
    ],
  );
  log(`  recorded ${record.outcome} (${record.steps.length} step(s)) — ${record.summary.slice(0, 160)}`);
  if (record.escalated) {
    log(`  the driver ESCALATED (ADR-0348 D4): open-question ${record.openQuestionId ?? "(unnamed)"}`);
  }
  return record.outcome === "pass" ? null : `${target.criterionId} — the journey reported FAIL: ${record.summary.slice(0, 200)}`;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[uat-drive] unexpected error: ${(e as Error).message}`);
    process.exit(1);
  },
);
