/**
 * Runnable entry for reliability gate `drive-machinery#gate-7` (ADR-0184, Story UAT leg 7 "An agent
 * actually USES it end to end"). The cold-start probe (`dogfood-probe.run.ts`) spawns a fresh,
 * uncoached Claude Code session that — onboarding from CLAUDE.md alone — discovers the inner loop and
 * drives a `dogfood-probe-*` node to a REAL signed verdict. This gate is the cheap standing WITNESS of
 * that persisted artifact: it reuses leg 3's pure core (`selectWitnessableVerdict`), scoped to the
 * dogfood-probe node namespace.
 *
 * Exit 0 = a spine-driven DRIVEN-tier passing verdict for a `dogfood-probe-*` node exists in
 * events.verdict, recent (≤90d), on a commit in HEAD's ancestry (the probe's proof reached main
 * non-squash). Exit 1 = none qualifies (re-run the probe — until then leg 7 is honestly unproven,
 * ADR-0184 d.3/d.5), OR the store is unreachable, OR a shallow clone that cannot verify ancestry.
 *
 * Provenance note (ADR-0184 d.4): the "a FRESH UNCOACHED agent produced it" property is guaranteed by
 * the harness's construction — its task prompt names no inner-loop mechanic (`auditUncoached`, proven
 * by `dogfood-probe.test.ts`) and is code-reviewed once. This gate does NOT re-judge that per run; it
 * witnesses the signed artifact the harness produced. Deliberately NOT a `*.test.ts` (needs the live
 * store + a full clone), like gate-5/gate-6.
 */
import { execFileSync } from "node:child_process";

import { closePool, createPool } from "@storytree/library/store";

import { PROBE_NODE_PREFIX } from "./dogfood-probe.js";
import { loadLocalSecrets } from "./secrets.js";
import { selectWitnessableVerdict, type VerdictRow, type WitnessPolicy } from "./witnessable-verdict.js";

/**
 * Freshness floor (ADR-0016 ageing): a dogfood-probe verdict older than this is too stale to witness
 * a "a cold agent can STILL discover the machinery" claim, forcing a deliberate periodic re-run. 90
 * days matches gate-6 (a quarterly cold-start re-proof).
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
      "dogfood-witness: SHALLOW clone — the probe's proof commit object may be absent, so ancestry\n" +
        "cannot be verified. Run this gate in a full clone; CI checks out shallow by design, which is\n" +
        "why this check is not part of `pnpm -r test`.",
    );
    return 1;
  }

  loadLocalSecrets(); // fill STORYTREE_DB_USER for the connector when the CLI did not (bare invocation)

  let handle: Awaited<ReturnType<typeof createPool>>;
  try {
    handle = await createPool();
  } catch (e) {
    console.error(
      `dogfood-witness: could not open the live store (events.verdict): ${(e as Error).message}\n` +
        "Bring the DB up (pnpm db:up); STORYTREE_DB_USER auto-hydrates from ~/.storytree/secrets.json.",
    );
    return 1;
  }

  let rows: VerdictRow[];
  try {
    // Auto-discover the probe namespace by prefix — no per-run id pinning. Every dogfood-probe verdict
    // is a candidate; the pure core does the DRIVEN/pass/fresh/ancestor filtering.
    const res = await handle.pool.query(
      "SELECT unit_id, proof_mode, outcome, signer, commit_sha, at FROM events.verdict WHERE unit_id LIKE $1",
      [`${PROBE_NODE_PREFIX}%`],
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

  // Scope the id-membership check to exactly the probe namespace we queried — every candidate row is a
  // `dogfood-probe-*` id, so the core's id check passes and its DRIVEN/pass/fresh/ancestor rules decide.
  const policy: WitnessPolicy = {
    driveMachineryNodeIds: [...new Set(rows.map((r) => r.unitId))],
    freshnessDays: FRESHNESS_DAYS,
  };
  const result = selectWitnessableVerdict(rows, policy, { ancestorOfHead, now: () => new Date() });
  if (result.ok) {
    const v = result.verdict;
    console.log(
      `dogfood-witness: leg 7 witnessed — a fresh uncoached agent drove ${v.unitId} (${v.proofMode}) ` +
        `to a signed verdict @ ${v.commitSha.slice(0, 7)}, ${v.at} (in main's ancestry, recent).`,
    );
    return 0;
  }
  console.error("dogfood-witness: NO cold-start-probe witness for Story UAT leg 7 (ADR-0184):");
  if (rows.length === 0) {
    console.error(`  x no ${PROBE_NODE_PREFIX}* verdicts in events.verdict — run the probe harness (dogfood-probe.run.ts)`);
  }
  for (const reason of result.reasons) console.error(`  x ${reason}`);
  console.error(
    "\nRe-run the probe: a fresh uncoached agent must reach a signed verdict (ADR-0184 d.4) — the\n" +
      "harness PRODUCES the artifact out-of-band; this gate only witnesses it.",
  );
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`dogfood-witness: unexpected error: ${(e as Error).message}`);
    process.exit(1);
  },
);
