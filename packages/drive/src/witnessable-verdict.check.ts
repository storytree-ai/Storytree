/**
 * Runnable entry for reliability gate `drive-machinery#gate-6` (ADR-0184, Story UAT leg 3 "The REAL
 * build"). The pure witness logic lives in `./witnessable-verdict.ts`; this is the thin wire the gate
 * runs: it reads the persisted signed verdicts from the live store (events.verdict) and asks whether at
 * least one genuine live-build proof still witnesses leg 3.
 *
 * Exit 0 = a spine-driven DRIVEN-tier passing verdict for a drive-machinery node exists, recent and an
 * ancestor of HEAD (a real `--real` build happened, landed non-squash, and is still fresh). Exit 1 =
 * none qualifies (the deliberate live run must be (re)invoked — until then the leg is honestly unproven,
 * ADR-0184 d.3), OR the live store is unreachable, OR a shallow clone that cannot verify ancestry. Run
 * by `storytree gate run drive-machinery#gate-6` against the live store in a full clone — deliberately
 * NOT a `*.test.ts`, so it never runs in CI's shallow, DB-free `pnpm -r test` (ADR-0010 §5: the
 * out-of-band artifact check, never on a gate pass).
 */
import { execFileSync } from "node:child_process";

import { closePool, createPool } from "@storytree/library/store";

import { loadLocalSecrets } from "./secrets.js";
import {
  selectWitnessableVerdict,
  type VerdictRow,
  type WitnessPolicy,
} from "./witnessable-verdict.js";

/**
 * The drive-machinery nodes whose driven `--real` verdicts count as leg-3 witnesses (the machinery's
 * own real-built nodes). Add a row when a new drive-machinery node earns a signed REAL verdict.
 */
const DRIVE_MACHINERY_NODE_IDS: readonly string[] = [
  "verdict-line",
  "node-resolve-report",
  "uat-machine-proof-binding",
  "uat-machine-gate-resolution",
  "uat-bound-command-adoption",
  "witnessable-verdict",
];

/**
 * Freshness floor (ADR-0016 ageing): a driven verdict older than this is too stale to witness a "we
 * STILL build for real" claim, forcing a deliberate periodic re-run (ADR-0184 d.3/d.5). 90 days = a
 * quarterly re-proof of the live build path.
 */
const FRESHNESS_DAYS = 90;

/** A raw events.verdict row (the scalar columns the witness check reads). */
interface RawVerdictRow {
  unit_id: string;
  proof_mode: string;
  outcome: string;
  signer: string;
  commit_sha: string;
  at: Date | string;
}

/** True when the checkout is a shallow clone (old proof-commit objects would be absent). */
function isShallowClone(): boolean {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() ===
      "true"
    );
  } catch {
    return false;
  }
}

/** True when `sha` is an ancestor of HEAD (throws-to-false, so a missing object reads as non-ancestor). */
function ancestorOfHead(sha: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  if (isShallowClone()) {
    console.error(
      "witnessable-verdict: SHALLOW clone — a landed proof commit's object may be absent, so ancestry\n" +
        "cannot be verified. Run this gate in a full clone (a local adoption checkout has full history);\n" +
        "CI checks out shallow by design, which is why this check is not part of `pnpm -r test`.",
    );
    return 1;
  }

  loadLocalSecrets(); // fill STORYTREE_DB_USER for the connector when the CLI did not (bare invocation)

  let handle: Awaited<ReturnType<typeof createPool>>;
  try {
    handle = await createPool();
  } catch (e) {
    console.error(
      `witnessable-verdict: could not open the live store (events.verdict): ${(e as Error).message}\n` +
        "Bring the DB up (pnpm db:up); STORYTREE_DB_USER auto-hydrates from ~/.storytree/secrets.json.",
    );
    return 1;
  }

  let rows: VerdictRow[];
  try {
    const res = await handle.pool.query(
      "SELECT unit_id, proof_mode, outcome, signer, commit_sha, at FROM events.verdict",
    );
    rows = (res.rows as RawVerdictRow[]).map((r) => ({
      unitId: r.unit_id,
      proofMode: r.proof_mode,
      outcome: r.outcome,
      signer: r.signer,
      commitSha: r.commit_sha,
      at: r.at instanceof Date ? r.at.toISOString() : new Date(r.at).toISOString(),
    }));
  } finally {
    await closePool(handle.pool, handle.connector);
  }

  const policy: WitnessPolicy = {
    driveMachineryNodeIds: DRIVE_MACHINERY_NODE_IDS,
    freshnessDays: FRESHNESS_DAYS,
  };
  const result = selectWitnessableVerdict(rows, policy, { ancestorOfHead, now: () => new Date() });
  if (result.ok) {
    const v = result.verdict;
    console.log(
      `witnessable-verdict: leg 3 witnessed — ${v.unitId} (${v.proofMode}) signed by ${v.signer} @ ` +
        `${v.commitSha.slice(0, 7)}, ${v.at} is a recent spine-driven DRIVEN verdict in main's ancestry.`,
    );
    return 0;
  }
  console.error("witnessable-verdict: NO live-build witness for Story UAT leg 3 (ADR-0184):");
  for (const reason of result.reasons) console.error(`  x ${reason}`);
  console.error(
    "\nRe-mint: run a live `storytree node build <drive-machinery-node> --real --store pg` and land it\n" +
      "non-squash (ADR-0184 d.3 — the live run produces the artifact; this gate only witnesses it).",
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`witnessable-verdict: unexpected error: ${(e as Error).message}`);
    process.exit(1);
  },
);
