/** One signed-verdict row read from events.verdict (only the fields the witness check reads). */
export interface VerdictRow {
  readonly unitId: string;
  readonly proofMode: string; // contract | capability | story | operator-attested | adopted
  readonly outcome: string; // pass | fail
  readonly signer: string;
  readonly commitSha: string;
  readonly at: string; // ISO-8601 timestamp
}

/** The DRIVEN proof modes — the three tiers' automated red→green ladders (ADR-0007). */
export const DRIVEN_PROOF_MODES = ["contract", "capability", "story"] as const;

export interface WitnessPolicy {
  /** The drive-machinery node ids a witnessing verdict's unitId must be one of. */
  readonly driveMachineryNodeIds: readonly string[];
  /** Freshness floor: a verdict older than this many days is too stale to witness (ADR-0016). */
  readonly freshnessDays: number;
}

export interface WitnessDeps {
  /** True when commitSha is an ancestor of HEAD (git merge-base --is-ancestor). Injected → shallow-safe test. */
  ancestorOfHead(sha: string): boolean;
  /** The current time (injected → deterministic test). */
  now(): Date;
}

export type WitnessResult =
  | { ok: true; verdict: VerdictRow }
  | { ok: false; reasons: string[] };

const MS_PER_DAY = 86_400_000;

function disqualifyReason(row: VerdictRow, policy: WitnessPolicy, deps: WitnessDeps): string | null {
  if (row.outcome !== "pass") {
    return `verdict for ${row.unitId} has outcome "${row.outcome}", not "pass"`;
  }
  if (!(DRIVEN_PROOF_MODES as readonly string[]).includes(row.proofMode)) {
    return `verdict for ${row.unitId} has proofMode "${row.proofMode}", not a driven red-green (${DRIVEN_PROOF_MODES.join(", ")})`;
  }
  if (!policy.driveMachineryNodeIds.includes(row.unitId)) {
    return `unitId "${row.unitId}" is not a drive-machinery node`;
  }
  const atMs = Date.parse(row.at);
  if (Number.isNaN(atMs)) {
    return `verdict for ${row.unitId} has an unparseable "at" timestamp: "${row.at}"`;
  }
  const ageDays = (deps.now().getTime() - atMs) / MS_PER_DAY;
  if (ageDays > policy.freshnessDays) {
    return `verdict for ${row.unitId} is stale: ${ageDays.toFixed(2)} days old, exceeds freshnessDays ${policy.freshnessDays}`;
  }
  if (!deps.ancestorOfHead(row.commitSha)) {
    return `verdict for ${row.unitId} at commit ${row.commitSha} is not an ancestor of HEAD`;
  }
  return null;
}

export function selectWitnessableVerdict(
  rows: readonly VerdictRow[],
  policy: WitnessPolicy,
  deps: WitnessDeps,
): WitnessResult {
  if (rows.length === 0) {
    return { ok: false, reasons: ["no verdict rows were supplied to witness against"] };
  }

  const reasons: string[] = [];
  let best: { row: VerdictRow; atMs: number } | null = null;

  for (const row of rows) {
    const reason = disqualifyReason(row, policy, deps);
    if (reason !== null) {
      reasons.push(reason);
      continue;
    }
    const atMs = Date.parse(row.at);
    if (best === null || atMs > best.atMs) {
      best = { row, atMs };
    }
  }

  if (best !== null) {
    return { ok: true, verdict: best.row };
  }
  return { ok: false, reasons };
}
