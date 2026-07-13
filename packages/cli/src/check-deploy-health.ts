// Best-effort deploy-health signal (ADR-0194), wired into `pnpm gate` — NOT into CI.
//
// The hosted studio's CD (.github/workflows/deploy-studio.yml) is deliberately post-merge and never
// a PR check ("a deploy failure never blocks a merge"), so a red run had NO reader: it stayed red
// for 11+ consecutive runs over ~2 days while the member-facing studio served a stale image
// (friction-deploy-studio-red-is-silent). This check makes the latest deploy-studio conclusion loud
// at the one surface every session already reads — the local gate tail — in the ADR-0055
// check:agents-sync posture:
//
//   - gh reachable + newest completed run red   -> LOUD multi-line WARN (streak, red-since, newest
//     red run URL, the stale-image consequence, the forensics pointer).
//   - gh reachable + newest completed run green -> one quiet OK line (last green time; notes an
//     in-flight deploy above it).
//   - no completed runs in the page             -> one UNVERIFIED line (never claims healthy).
//   - gh missing / unauthenticated / offline / timeout -> print SKIP; offline gates unaffected.
//
// It ALWAYS exits 0 (WARN-only: a deploy failure must never block an unrelated landing — the
// workflow's own posture, kept). The classification + formatting is the PURE, contract-tested
// deploy-health.ts (the studio-cloud `deploy-health-signal` capability); this wrapper is
// un-asserted I/O glue (ADR-0158) — it shells gh, parses JSON, prints lines, nothing else.

import { execFile } from "node:child_process";

import { classifyDeployHealth, formatDeployHealth, type DeployRun } from "./deploy-health.js";

const TAG = "[check:deploy-health]";
/** Bound the gh call so a hung network can't stall the gate. */
const GH_TIMEOUT_MS = 15_000;

function ghRunList(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        "deploy-studio.yml",
        "--branch",
        "main",
        "--limit",
        "20",
        "--json",
        "status,conclusion,updatedAt,url,databaseId",
      ],
      { timeout: GH_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim().split("\n")[0] || err.message));
        else resolve(stdout);
      },
    );
  });
}

async function main(): Promise<void> {
  let raw: string;
  try {
    raw = await ghRunList();
  } catch (err) {
    console.log(
      `${TAG} SKIP — gh unavailable (${(err as Error).message}); deploy health unverified, offline gate unaffected.`,
    );
    return;
  }
  let runs: DeployRun[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("gh returned non-array JSON");
    runs = parsed as DeployRun[];
  } catch (err) {
    console.log(`${TAG} SKIP — unreadable gh output (${(err as Error).message}); deploy health unverified.`);
    return;
  }
  // The classifier is total over arbitrary input (contract deploy-health-no-signal-classifies-unknown),
  // so the loose cast above is safe: odd rows degrade the verdict, never crash the gate.
  const health = classifyDeployHealth(runs);
  const emit = health.verdict === "red" ? console.warn : console.log;
  for (const line of formatDeployHealth(health)) emit(line);
  // WARN-only: never sets a non-zero exit code.
}

main().catch((err: unknown) => {
  // Even an unexpected error is advisory only — never fail the gate on the deploy-health check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); deploy health unverified.`);
});
