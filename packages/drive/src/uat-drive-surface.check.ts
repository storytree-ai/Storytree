/**
 * The surface-ownership check a UAT driver MUST run before it observes any HTTP surface.
 *
 * `judgeDriveSurface` has been landed, fail-closed and thoroughly tested since PR #1421 — and called
 * by NOTHING. The rule it encodes lived only as a sentence in the drive prompt, which
 * `auditDrivePrompt` checked for PRESENCE and never for EXECUTION. A driver that simply did not do it
 * could still walk a sibling worktree's studio on 5180 and report on the criterion as though it had
 * driven its own, which is the original measured failure. This is the verb that makes the judgement
 * RUN, and `requireOwnSurface` (read by the runner) is what makes running it non-optional.
 *
 * It has to be a verb the CHILD calls rather than something the runner does, and the reason is
 * structural: `uat-drive.run.ts` spawns the driver with `spawnSync`, so the runner is BLOCKED for the
 * whole walk and cannot probe a surface while one exists. By the time it reads the report, the studio
 * the child started has already died with it. So the evidence has to be LEFT BEHIND, in the drive's
 * out-of-tree scratch directory, while the surface is still up.
 *
 * Usage (the exact line the drive prompt hands the driver):
 *   pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-surface.check.ts <base-url>
 *
 * Exit 0 = this surface is yours, and an attestation now says so where the harness reads it.
 * Exit 1 = it is NOT yours (or cannot be proven to be) — do not walk it; report `fail` naming what
 * you found. Exit 2 = the check could not run at all (missing env), which is a harness fault.
 *
 * Deliberately NOT a `*.test.ts`: it needs a live surface. Everything decidable about it — the
 * judgement, the attestation shape, the requirement — is pure and lives in `uat-drive.ts`, where the
 * gate does exercise it.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  DriveSurfaceAttestation,
  judgeDriveSurface,
  UAT_DRIVE_COMMIT_ENV,
  UAT_DRIVE_SCRATCH_ENV,
  UAT_DRIVE_SURFACE_ATTESTATION_FILE,
} from "./uat-drive.js";

/** How long to wait for `/api/health`. Short: a studio that is up answers immediately. */
const HEALTH_TIMEOUT_MS = 10_000;

function usage(): number {
  console.error(
    "usage: uat-drive-surface.check.ts <base-url>\n" +
      "  e.g. uat-drive-surface.check.ts http://localhost:5312\n" +
      "  Run it from inside a UAT drive, against the surface you were reserved, while it is UP.",
  );
  return 2;
}

async function main(): Promise<number> {
  const url = process.argv[2];
  if (url === undefined || url.trim().length === 0) return usage();

  const scratchDir = process.env[UAT_DRIVE_SCRATCH_ENV];
  const commitSha = process.env[UAT_DRIVE_COMMIT_ENV];
  if (scratchDir === undefined || commitSha === undefined) {
    console.error(
      `uat-drive-surface: ${UAT_DRIVE_SCRATCH_ENV} and ${UAT_DRIVE_COMMIT_ENV} are not both set, so this is not ` +
        "running inside a UAT drive. The check writes its evidence into the drive's scratch directory " +
        "and has nowhere to put it — run it from the drive session that was given those variables.",
    );
    return 2;
  }

  let health: unknown;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    health = await res.json();
  } catch (e) {
    // A surface that does not answer is NOT proven foreign — but it is not proven yours either, and
    // fail-closed means "cannot tell" lands with "not mine". The attestation is still written, so the
    // runner sees a refusal rather than an absence and can say which of the two happened.
    console.error(`uat-drive-surface: /api/health on ${url} did not answer: ${(e as Error).message}`);
  }

  // `health` is left UNSET by the catch rather than assigned `null`, and normalised here: the
  // judge's contract is "null means it did not answer", and `?? null` says that once instead of
  // widening a known literal into `unknown` at the assignment.
  const judged = judgeDriveSurface(health ?? null, { commitSha, requireLiveStore: true });
  const attestation: DriveSurfaceAttestation = {
    url,
    ok: judged.ok,
    detail: judged.ok ? judged.note : judged.reason,
    at: new Date().toISOString(),
  };

  mkdirSync(scratchDir, { recursive: true });
  appendFileSync(
    path.join(scratchDir, UAT_DRIVE_SURFACE_ATTESTATION_FILE),
    `${JSON.stringify(DriveSurfaceAttestation.parse(attestation))}\n`,
    "utf8",
  );

  if (judged.ok) {
    console.log(`uat-drive-surface: ${url} is YOURS — ${judged.note}`);
    console.log("  attestation recorded; the harness will read it when your report names this surface.");
    return 0;
  }
  console.error(`uat-drive-surface: ${url} is NOT this drive's surface — ${judged.reason}`);
  console.error(
    "  Do NOT walk it. Start your own studio on the port this drive reserved for you, or report `fail`\n" +
      "  naming what you found instead. Walking somebody else's checkout produces a finding about their tree.",
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`uat-drive-surface: unexpected error: ${(e as Error).message}`);
    process.exit(2);
  },
);
