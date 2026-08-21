/**
 * The model-driven UAT DRIVE RUN (ADR-0295 D1, shaped by ADR-0348 D5) — the deliberate, out-of-band,
 * live-only run that PRODUCES the artifact `uat-drive-witness.check.ts` witnesses.
 *
 * It is NOT a `*.test.ts` and never runs on a gate pass: each criterion spawns a fresh,
 * subscription-funded Codex session in the repo root, so ADR-0010 §5 keeps it out-of-band —
 * exactly as `dogfood-probe.run.ts` is. The driving session inherits whatever tools the local Codex
 * install actually has (shell and the storytree CLI always; browser / headless control only
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
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseUatTestCriterionSources } from "@storytree/library";
import { applySchema, closePool, createPool } from "@storytree/library/store";
import { loadNodeSpec } from "@storytree/orchestrator";

import { ensureLiveDb } from "./db-control.js";
import { deriveIdentity } from "./noticeboard.js";
import { loadLocalSecrets } from "./secrets.js";
import {
  assertDriveIsolated,
  auditDriveReportTiming,
  auditDrivePrompt,
  classifyDriveEnd,
  classifyDriveResidue,
  CODEX_CHATGPT_SUBSCRIPTION_DRIVER,
  claudeSubscriptionChildEnv,
  codexExecArguments,
  codexSubscriptionChildEnv,
  createDriveTiming,
  driveScratchDir,
  driveReportObservedAt,
  driveSurfacePorts,
  driveSurfaceUrl,
  mintDriveSessionId,
  parseDriveReport,
  parsePorcelain,
  parseSurfaceAttestations,
  requireOwnSurface,
  selectDriveTargets,
  uatDriveTaskPrompt,
  UatDriveRecord,
  UAT_DRIVE_SURFACE_ATTESTATION_FILE,
  type DriveIsolation,
  type DriveSurfaceAttestation,
  type DriveTarget,
  type UatDriveSpec,
  resolveUatDriveProvider,
  STORYTREE_UAT_DRIVE_PROVIDER_ENV,
  STORYTREE_CODEX_EXECUTABLE_ENV,
  type UatDriveProvider,
  verifyCodexSubscriptionAuth,
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
const CODEX_DRIVER = CODEX_CHATGPT_SUBSCRIPTION_DRIVER;
const CLAUDE_DRIVER = "claude-code-subscription";

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

interface DriverRuntime {
  readonly provider: UatDriveProvider;
  readonly driver: string;
  readonly executable: string;
  readonly executableArgs: readonly string[];
}

/** The pinned official wrapper keeps its matching code-mode host alongside its native binary. */
function resolvePinnedCodexEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex/package.json");
  return path.join(path.dirname(packageJson), "bin", "codex.js");
}

/** Resolve and prove the runtime once, before a drive can spend subscription time. */
function verifyCodexRuntime(): DriverRuntime | null {
  const explicit = process.env[STORYTREE_CODEX_EXECUTABLE_ENV]?.trim();
  if (explicit !== undefined && !path.isAbsolute(explicit)) {
    console.error(`[uat-drive] REFUSED: ${STORYTREE_CODEX_EXECUTABLE_ENV} must name an absolute executable.`);
    return null;
  }
  // The project-pinned official wrapper has the code-mode host that the Desktop sandbox copy lacks.
  const executableArgs = explicit === undefined ? [resolvePinnedCodexEntrypoint()] : [];
  // The Desktop app's delegated shell exposes this copied CLI while its app-alias executable is
  // deliberately not invokable by the sandbox. Outside that host, ordinary PATH resolution remains
  // the default. An explicit override is only a locator — authentication is still checked below.
  const executable = explicit ?? process.execPath;
  const authIsolation: DriveIsolation = {
    sessionId: "uat-drive~auth~0",
    surfacePort: 0,
    commitSha: "auth-check",
    scratchDir: tmpdir(),
    ceilingMinutes: DRIVE_TIMEOUT_MIN,
    ...createDriveTiming(Date.now(), DRIVE_TIMEOUT_MIN),
  };
  const env = codexSubscriptionChildEnv(process.env, authIsolation);
  try {
    const login = spawnSync(executable, [...executableArgs, "login", "status"], {
      encoding: "utf8",
      env,
    });
    if (login.status !== 0 || login.error !== undefined) {
      throw login.error ?? new Error(login.stderr || `Codex login status exited ${login.status}`);
    }
    const status = `${login.stdout ?? ""}\n${login.stderr ?? ""}`;
    const verified = verifyCodexSubscriptionAuth(status, env);
    if (!verified.ok) {
      console.error(
        `[uat-drive] REFUSED: ${verified.detail}. Log in to Codex with the owner's ChatGPT subscription; ` +
          "API-key and Anthropic fallback are disabled.",
      );
      return null;
    }
    log(`provider: ${CODEX_DRIVER} — ${verified.detail} (${executable})`);
    return { provider: "codex", driver: CODEX_DRIVER, executable, executableArgs };
  } catch (e) {
    const detail = (e as { stderr?: string }).stderr?.trim() || (e as Error).message;
    console.error(
      `[uat-drive] REFUSED: could not verify the Codex ChatGPT subscription with ${executable}: ${detail}\n` +
        `  Set ${STORYTREE_CODEX_EXECUTABLE_ENV} only when the Desktop runtime is outside PATH. ` +
        "No API-key or Anthropic fallback exists.",
    );
    return null;
  }
}

/** Claude remains an explicit subscription choice; API-key credentials never satisfy this check. */
function verifyClaudeRuntime(): DriverRuntime | null {
  const token = process.env["CLAUDE_CODE_OAUTH_TOKEN"]?.trim();
  if (token === undefined || token.length === 0) {
    console.error("[uat-drive] REFUSED: Claude was selected but no Claude subscription token is available.");
    return null;
  }
  log(`provider: ${CLAUDE_DRIVER} — explicit ${STORYTREE_UAT_DRIVE_PROVIDER_ENV}=claude selection`);
  return { provider: "claude", driver: CLAUDE_DRIVER, executable: "claude", executableArgs: [] };
}

/** The Codex CLI's final-answer file is the report; stdout is only a diagnostic fallback. */
function readCodexFinalMessage(finalMessagePath: string, stdout: string, stderr: string): string {
  try {
    return readFileSync(finalMessagePath, "utf8");
  } catch {
    return finalText([stdout, stderr].filter((text) => text.length > 0).join("\n"));
  }
}

async function main(): Promise<number> {
  const [storyId, ...only] = process.argv.slice(2);
  if (storyId === undefined || storyId.trim().length === 0) {
    console.error("usage: node --import tsx src/uat-drive.run.ts <story-id> [criterion-id…]");
    return 2;
  }

  // The driver authenticates through the owner's Codex subscription. Do not hydrate an Anthropic
  // credential merely because the record store needs its own user credential.
  loadLocalSecrets(process.env, ["STORYTREE_DB_USER"]);

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

  // The record pins the commit the journey was driven against, so a dirty tree would record a claim
  // about a commit nobody can reconstruct (the `uat attest` / `observeAndSign` posture). It is read
  // BEFORE the prompts because every prompt now carries the pinned commit: it is what a drive checks
  // `/api/health` against to prove the surface it found is its OWN checkout's.
  const commitSha = git(["rev-parse", "HEAD"], toplevel);
  const treeBefore = parsePorcelain(git(["status", "--porcelain"], toplevel));
  if (treeBefore.length > 0) {
    console.error(
      "[uat-drive] REFUSED: the working tree is DIRTY. A drive record pins the commit that was driven;\n" +
        "recording against uncommitted edits would claim a commit that does not match what was walked.\n" +
        "Commit (or stash) first, then drive the clean commit.\n" +
        `  dirty: ${treeBefore.map((e) => e.path).join(", ")}`,
    );
    return 1;
  }

  const preference = resolveUatDriveProvider(process.env[STORYTREE_UAT_DRIVE_PROVIDER_ENV]);
  if (!preference.ok) {
    console.error(`[uat-drive] REFUSED: ${preference.reason}`);
    return 1;
  }
  if (preference.provider === "claude") loadLocalSecrets(process.env, ["CLAUDE_CODE_OAUTH_TOKEN"]);
  const runtime = preference.provider === "codex" ? verifyCodexRuntime() : verifyClaudeRuntime();
  if (runtime === null) return 1;

  const runId = `uat-drive:${storyId}:${commitSha.slice(0, 10)}:${process.pid}`;

  // ISOLATION, decided before any spend. A drive is a GUEST in this checkout: its own notice-board
  // identity (so its tidy-up can never release the LAUNCHING session's claims), its own reserved
  // surface port (so it cannot walk a sibling worktree's studio), and its own out-of-tree scratch
  // directory (so what it leaves behind cannot refuse the next drive).
  const launching = deriveIdentity();
  const ports = await reserveDrivePorts(selection.targets.length, process.pid);
  if (ports === null) {
    console.error(
      `[uat-drive] REFUSED: no free port in the reserved drive band — every candidate is in use.\n` +
        "  A drive must OWN its surface; attaching to whatever is already listening is how a drive\n" +
        "  ends up measuring a sibling worktree's checkout. Free a port and re-run.",
    );
    return 1;
  }
  const scratchDir = driveScratchDir(tmpdir().replace(/\\/g, "/"), runId);
  mkdirSync(scratchDir, { recursive: true });

  // Fail-closed before any model spend: every drive identity must be distinct. Absolute time is
  // intentionally NOT stamped in this preflight: criteria run one at a time, so stamping them all
  // here would make a later criterion spend the earlier criterion's ceiling while it waited.
  for (const t of selection.targets) {
    const sessionId = mintDriveSessionId({ criterionId: t.criterionId, pid: process.pid });
    const refusal = assertDriveIsolated(launching, sessionId);
    if (refusal !== null) {
      console.error(`[uat-drive] ${refusal}`);
      return 1;
    }
  }
  log(
    `isolated — each drive gets its own notice-board session, its own port (${ports.join(", ")}) and\n` +
      `  scratch at ${scratchDir}. The launching session ` +
      `(${launching?.sessionId ?? "none — primary checkout"}) keeps every claim it holds.`,
  );

  log(`bringing the live store up (the record persists to events.uat_drive)…`);
  const ready = await ensureLiveDb((m) => console.error(`[db] ${m}`));
  if (!ready.ok) {
    console.error(`[uat-drive] the database could not be brought up: ${ready.reason}`);
    return 1;
  }

  log(
    `driving ${selection.targets.length} criterion(s) of "${storyId}" @ ${commitSha.slice(0, 10)} — ` +
      `each is a fresh subscription-funded session (ADR-0010 §5, out-of-band), ceiling ${DRIVE_TIMEOUT_MIN} min.`,
  );

  const handle = await createPool();
  const findings: string[] = [];
  const harnessEnds: string[] = [];
  try {
    await applySchema(handle.pool);

    for (const [i, t] of selection.targets.entries()) {
      // Stamp THIS criterion's runner-owned clock immediately before its prompt is created. The
      // prompt audit then refuses before this criterion can spend, and the next criterion receives
      // a fresh full ceiling only after this synchronous one has ended.
      const isolation: DriveIsolation = {
        sessionId: mintDriveSessionId({ criterionId: t.criterionId, pid: process.pid }),
        surfacePort: ports[i]!,
        commitSha,
        scratchDir,
        ceilingMinutes: DRIVE_TIMEOUT_MIN,
        ...createDriveTiming(Date.now(), DRIVE_TIMEOUT_MIN),
      };
      const driveSpec: UatDriveSpec = {
        storyId,
        storyTitle: spec.title,
        storyOutcome: spec.outcome,
        criterionId: t.criterionId,
        journey: t.journey,
        platform: t.platform,
        isolation,
      };
      const prompt = uatDriveTaskPrompt(driveSpec);
      const audit = auditDrivePrompt(prompt, driveSpec);
      if (!audit.ok) {
        const line = `${t.criterionId} — prompt audit refused: lost ${audit.missing.join(", ")}`;
        console.error(`[uat-drive] REFUSED: ${line}`);
        harnessEnds.push(line);
        continue;
      }
      const outcome = await driveOne(t, prompt, {
        storyId,
        commitSha,
        runId,
        cwd: toplevel,
        pool: handle.pool,
        isolation,
        runtime,
      });
      if (outcome !== null) (outcome.harness ? harnessEnds : findings).push(outcome.line);
    }
  } finally {
    await closePool(handle.pool, handle.connector);
  }

  sweepResidue(toplevel, treeBefore);

  // THE TWO REDS ARE DIFFERENT REPAIRS, so they are reported and EXITED differently. A journey that
  // reported `fail` is a finding about the product; a drive the harness cut off, or one whose session
  // ended mid-walk, says nothing at all about the product — reporting them as one number is what made
  // a MISS read as a red the product had earned. A real finding still outranks a harness end, so the
  // exit code never gets quieter than the worst thing that happened.
  if (harnessEnds.length > 0) {
    console.error(`\n[uat-drive] ${harnessEnds.length} drive(s) did not finish — HARNESS ends, NOT product findings:`);
    for (const h of harnessEnds) console.error(`  ~ ${h}`);
  }
  if (findings.length > 0) {
    console.error(`\n[uat-drive] ${findings.length} of ${selection.targets.length} criterion(s) reported a FAIL:`);
    for (const f of findings) console.error(`  x ${f}`);
    console.error(
      "\nA failed journey is a real finding, not a flaky harness — read the record's summary in\n" +
        "events.uat_drive before re-running. The witness gate stays honestly red until a pass lands.",
    );
    return 1;
  }
  if (harnessEnds.length > 0) {
    console.error(
      `\nNothing above is a claim about the product: nothing was observed to be wrong, and NOTHING was\n` +
        `persisted. Exit ${EXIT_HARNESS} says exactly that — do not read it as a red the product earned.`,
    );
    return EXIT_HARNESS;
  }
  log(`SUCCESS — every driven criterion passed and its record persisted. The witness gate can now see them:`);
  for (const t of selection.targets) {
    log(`  pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts ${storyId} ${t.criterionId}`);
  }
  return 0;
}

/**
 * The exit code for "no drive reported a FAIL, but at least one never got to report at all".
 *
 * Distinct from 1 on purpose: 1 means a journey was walked and the product came up short, and reading
 * a cut-off walk as that is the misattribution this closes. Distinct from 3 too, which this house
 * reserves for a gate step DECLARING it had nothing to check (`gate-run.ts`) — a drive that ran out
 * of clock did have something to check, and did not get to it.
 */
const EXIT_HARNESS = 4;

/**
 * Is `port` free to bind on loopback right now? A real bind, because that is the only honest answer:
 * a connect-probe cannot distinguish "nothing is listening" from "something is listening but refused
 * me", and the drive needs the port it can actually SERVE from.
 */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

/**
 * Reserve `count` DISTINCT free ports from the drive band, or null when the band is exhausted.
 *
 * "Reserve" is honest about what it is: the socket is closed again before the child starts, so this
 * is a probe, not a lock. It buys the thing that was actually missing — the drive is TOLD a port that
 * was free moments ago, instead of being left to discover a listener and walk somebody else's
 * checkout. The residual race is covered on the other side: the prompt requires `--strictPort`, so a
 * collision fails loudly, and `/api/health` ownership ({@link judgeDriveSurface}) refuses a foreign
 * server even when one does answer.
 */
async function reserveDrivePorts(count: number, seed: number): Promise<number[] | null> {
  const chosen: number[] = [];
  for (const port of driveSurfacePorts(seed)) {
    if (chosen.length === count) break;
    if (await portFree(port)) chosen.push(port);
  }
  return chosen.length === count ? chosen : null;
}

/**
 * Read back the surface-ownership evidence the child left in its scratch directory.
 *
 * An unreadable or absent file yields NO attestations, which {@link requireOwnSurface} then treats
 * as "the check never ran" — the fail-closed direction. Reading this must never throw: a drive that
 * walked its own surface correctly and then hit a filesystem hiccup on the way out should be refused
 * with a reason, not crash the whole run and lose the other criteria's results with it.
 */
function readSurfaceAttestations(scratchDir: string): DriveSurfaceAttestation[] {
  try {
    return parseSurfaceAttestations(
      readFileSync(path.join(scratchDir, UAT_DRIVE_SURFACE_ATTESTATION_FILE), "utf8"),
    );
  } catch {
    return [];
  }
}

/**
 * Remove what THIS run left in the tree, and say so.
 *
 * The next drive refuses against a dirty tree, so an orphaned driver's screenshot does not merely
 * litter — it blocks the next drive, which is exactly how one invented harness cost three of them.
 * Only UNTRACKED paths that appeared during this run are swept: they did not exist when the run
 * started (the cleanliness check above proves it), so removing them destroys nothing. A change to a
 * TRACKED file is never touched — that is a drive that edited repository source, which the prompt
 * forbids, and deleting it would destroy work and hide the violation at once.
 */
function sweepResidue(toplevel: string, before: readonly ReturnType<typeof parsePorcelain>[number][]): void {
  let after;
  try {
    after = parsePorcelain(git(["status", "--porcelain"], toplevel));
  } catch {
    return; // a git hiccup on the way out must never change a drive's outcome
  }
  const residue = classifyDriveResidue(before, after);
  for (const p of residue.sweep) {
    try {
      rmSync(path.join(toplevel, p), { recursive: true, force: true });
      log(`swept drive residue: ${p} (untracked, created during this run — it would refuse the next drive)`);
    } catch (e) {
      console.error(`[uat-drive] could not sweep residue ${p}: ${(e as Error).message} — remove it before the next drive.`);
    }
  }
  if (residue.blocking.length > 0) {
    console.error(
      `[uat-drive] this drive changed TRACKED files, which the drive prompt forbids: ${residue.blocking.join(", ")}\n` +
        "  They are NOT swept — that would destroy work and hide the violation. Review them by hand.",
    );
  }
}

interface DriveContext {
  storyId: string;
  commitSha: string;
  runId: string;
  cwd: string;
  pool: { query(text: string, values?: unknown[]): Promise<unknown> };
  /** This drive's separation from the launching session — the only thing the child inherits ON PURPOSE. */
  isolation: DriveIsolation;
  /** A subscription-authenticated provider executable, checked before any model time is spent. */
  runtime: DriverRuntime;
}

/** A drive that did not pass, and whether it says anything about the PRODUCT at all. */
interface DriveNonPass {
  readonly line: string;
  /** True = a harness end (cut off, or the session ran out before the walk did): never a finding. */
  readonly harness: boolean;
}

/** Drive ONE criterion and persist its record. Returns a non-pass, or `null` on a clean pass. */
async function driveOne(target: DriveTarget, prompt: string, ctx: DriveContext): Promise<DriveNonPass | null> {
  log(`— ${target.criterionId}: ${target.title}`);
  log(`  as session "${ctx.isolation.sessionId}" on port ${ctx.isolation.surfacePort}`);
  const t0 = Date.now();
  const remainingMs = Math.max(1, Date.parse(ctx.isolation.deadlineAt) - t0);
  const finalMessagePath = path.join(ctx.isolation.scratchDir, `${target.criterionId}.codex-final.md`);
  const res =
    ctx.runtime.provider === "codex"
      ? spawnSync(ctx.runtime.executable, [...ctx.runtime.executableArgs, ...codexExecArguments(finalMessagePath)], {
          cwd: ctx.cwd,
          input: prompt,
          encoding: "utf8",
          timeout: remainingMs,
          maxBuffer: 256 * 1024 * 1024,
          env: codexSubscriptionChildEnv(process.env, ctx.isolation),
        })
      : spawnSync("claude", ["-p", "--permission-mode", "bypassPermissions", "--output-format", "json"], {
          cwd: ctx.cwd,
          input: prompt,
          encoding: "utf8",
          shell: true,
          timeout: remainingMs,
          maxBuffer: 256 * 1024 * 1024,
          env: claudeSubscriptionChildEnv(process.env, ctx.isolation),
        });
  const receivedAtMs = Date.now();
  const finalMessageMtimeMs =
    ctx.runtime.provider === "codex" && existsSync(finalMessagePath)
      ? statSync(finalMessagePath).mtimeMs
      : undefined;
  const reportObservedAt = driveReportObservedAt(receivedAtMs, finalMessageMtimeMs);
  const elapsedMinutes = (receivedAtMs - t0) / 60_000;
  const timedOut = res.error !== undefined && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT";

  const text =
    ctx.runtime.provider === "codex"
      ? readCodexFinalMessage(finalMessagePath, res.stdout ?? "", res.stderr ?? "")
      : finalText(res.stdout ?? "");
  const parsed = parseDriveReport(text);
  const end = classifyDriveEnd({
    timedOut,
    reportReadable: parsed.ok,
    ceilingMinutes: DRIVE_TIMEOUT_MIN,
    elapsedMinutes,
  });
  log(
    end.kind === "reported"
      ? `  the drive session finished after ${elapsedMinutes.toFixed(1)}m (exit ${res.status}).`
      : `  ${end.kind.toUpperCase()} after ${elapsedMinutes.toFixed(1)}m — ${end.reason}`,
  );

  if (!parsed.ok) {
    // A run whose report cannot be read did NOT pass, and nothing is PERSISTED — an unreadable run
    // must leave no trace a later witness could mistake for evidence. But "persists nothing" was
    // over-read as "says nothing": the model's whole account of the run was discarded too, so a MISS
    // arrived as one line with no way to tell a driver that hit a wall from one that ended a turn
    // early, and diagnosing it cost a second paid drive. The tail below is DIAGNOSTIC OUTPUT, not
    // evidence — it reaches stderr and never `events.uat_drive`, so the witness gate cannot see it.
    console.error(`  ~ ${target.criterionId}: ${parsed.reason}`);
    console.error(`  --- the driver's last ${UNREADABLE_TAIL_CHARS} chars (diagnostic only; nothing was persisted) ---`);
    console.error(text.length > 0 ? indentTail(text) : "  (the driver produced no output at all)");
    console.error("  --- end of unreadable output ---");
    return { line: `${target.criterionId} — ${end.reason}`, harness: end.harness };
  }
  const report = parsed.report;

  // The typed report says WHY a fail stopped. A deadline reason is admissible only after the
  // runner-owned UTC boundary. Codex's final-message mtime is used instead of provider return time,
  // because the wrapper can remain alive after the report was already authored. Refusal persists
  // nothing: an objectively premature stop is a harness end, never a red the product earned.
  const timingAudit = auditDriveReportTiming(report, {
    reportBy: ctx.isolation.reportBy,
    reportObservedAt,
  });
  if (!timingAudit.ok) {
    console.error(`  ~ ${target.criterionId}: deadline timing REFUSED — ${timingAudit.reason}`);
    console.error(
      "  Nothing was persisted. The runner's UTC lease was still live, so this is a harness refusal,\n" +
        "  not a product finding.",
    );
    return { line: `${target.criterionId} — deadline timing refused: ${timingAudit.reason}`, harness: true };
  }

  // SURFACE OWNERSHIP, enforced rather than instructed. `judgeDriveSurface` ran inside the child (the
  // runner is blocked in `spawnSync` for the whole walk and cannot probe a live surface itself), and
  // left its answer in the scratch directory. This is where a drive that never ran the check, or ran
  // it against somebody else's studio, stops being a pass. A refusal is a HARNESS end: nothing is
  // persisted, and it says nothing about the product.
  const surfaceOwnership = requireOwnSurface({
    reportedSurface: report.surface,
    reservedUrl: driveSurfaceUrl(ctx.isolation.surfacePort),
    attestations: readSurfaceAttestations(ctx.isolation.scratchDir),
  });
  if (!surfaceOwnership.ok) {
    console.error(`  ~ ${target.criterionId}: surface ownership REFUSED — ${surfaceOwnership.reason}`);
    console.error(
      "  Nothing was persisted. This is a harness refusal, not a product red: it says the walk cannot be\n" +
        "  attributed to this checkout's surface, not that the journey failed.",
    );
    return {
      line: `${target.criterionId} — surface ownership refused: ${surfaceOwnership.reason}`,
      harness: true,
    };
  }
  log(`  surface: ${surfaceOwnership.note}`);

  const record = UatDriveRecord.parse({
    storyId: ctx.storyId,
    criterionId: target.criterionId,
    revisionId: target.revisionId,
    outcome: report.outcome,
    ...(report.failureCause !== undefined ? { failureCause: report.failureCause } : {}),
    commitSha: ctx.commitSha,
    runId: ctx.runId,
    driver: ctx.runtime.driver,
    summary: report.summary,
    steps: report.steps,
    escalated: report.escalated,
    ...(report.openQuestionId !== undefined ? { openQuestionId: report.openQuestionId } : {}),
    // Carried onto the record so a later reader can see WHICH server a green was earned against.
    // Only reached once `requireOwnSurface` has already accepted it, so the record never stores a
    // surface the harness refused.
    ...(report.surface !== undefined ? { surface: report.surface } : {}),
    reportBy: ctx.isolation.reportBy,
    reportObservedAt,
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
  return record.outcome === "pass"
    ? null
    : {
        line: `${target.criterionId} — the journey reported FAIL: ${record.summary.slice(0, 200)}`,
        harness: false,
      };
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`[uat-drive] unexpected error: ${(e as Error).message}`);
    process.exit(1);
  },
);
