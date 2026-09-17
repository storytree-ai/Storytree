// The paid-build entry's before-spend preflight (ADR-0576, implementing ADR-0575 D1 and ADR-0563
// D1/D4/D5). PURE over its two injected read handles: resolving the increment a build is filed
// under, and preflighting every unit the build will drive against the attempt ledger — refusing a
// missing or closed increment, a unit past its decision point or ceiling, an unresolved signed
// pass, a rebuild under a landed increment, and a mispaired grant, before any spend happens.
//
// Wiring this into `nodeBuild` / `storyBuild` / the gate build driver is later units' work — this
// module reads nothing on its own and writes nothing at all.

import { INNER_LOOP_EVENT_KIND } from "@storytree/proof-protocol";
import type { Store, StoreEvent } from "@storytree/storage-protocol";
import {
  ATTEMPT_CEILING,
  ATTEMPT_DECISION_POINT,
  foldInnerLoopLedger,
  type InnerLoopLedger,
} from "@storytree/orchestrator";

// ── the refusal vocabulary ──────────────────────────────────────────────────────────────────────

export type InnerLoopRefusalKind =
  | "increment-missing"
  | "increment-unknown"
  | "increment-wrong-kind"
  | "increment-closed"
  | "increment-unreadable"
  | "ledger-unreadable"
  | "unresolved-signed-pass"
  | "landed-under-increment"
  | "owner-ceiling"
  | "decision-point"
  | "grant-kind-mismatch";

/** One refusal before spend. `runId` is carried only by `unresolved-signed-pass`. */
export interface InnerLoopRefusal {
  readonly kind: InnerLoopRefusalKind;
  readonly reason: string;
  readonly unitId?: string;
  readonly runId?: string;
}

/** ADR-0576 D8: the one entry-state union every outcome of a paid build's preflight renders through. */
export type InnerLoopEntryState =
  | { readonly state: "refused"; readonly refusals: readonly InnerLoopRefusal[] }
  | {
      readonly state: "attempt-failed";
      readonly unitId: string;
      readonly runId: string;
      readonly consecutiveFailures: number;
      readonly remainingGrantCount: number;
    }
  | { readonly state: "signed"; readonly unitId: string; readonly runId: string }
  | { readonly state: "not-attempted"; readonly unitId: string };

export type InnerLoopRefusedState = Extract<InnerLoopEntryState, { state: "refused" }>;

/** The `ok: false` arm every pre-spend check returns: the refused entry state it would render. */
export interface InnerLoopRefusalResult {
  readonly ok: false;
  readonly state: InnerLoopRefusedState;
}

function refused(kind: InnerLoopRefusalKind, reason: string): InnerLoopRefusalResult {
  return { ok: false, state: { state: "refused", refusals: [{ kind, reason }] } };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── resolveBuildIncrement (ADR-0576 D1/D2) ──────────────────────────────────────────────────────

function readIncrementStatus(doc: unknown): "proposal" | "ready" | "active" | "closed" {
  if (typeof doc !== "object" || doc === null) return "proposal";
  const status = (doc as Record<string, unknown>).status;
  if (status === "ready" || status === "active" || status === "closed") {
    return status;
  }
  // `proposal` is both the schema default and every other value's answer, so it needs no case of its own.
  return "proposal";
}

/**
 * Resolve a paid build's `--increment` id to an existing, unclosed increment row — the ONLY thing a
 * build's increment may resolve to (ADR-0576's `a-paid-build-names-a-live-increment`). Every other
 * answer is a named refusal, reads fail closed (D1), and an absent status defaults to `proposal`,
 * the schema's default.
 */
export async function resolveBuildIncrement(
  corpus: Pick<Store, "getDoc">,
  incrementId: string | undefined,
): Promise<
  | { ok: true; incrementId: string; status: "proposal" | "ready" | "active" }
  | { ok: false; state: InnerLoopRefusedState }
> {
  if (incrementId === undefined || incrementId.trim().length === 0) {
    return refused(
      "increment-missing",
      "a paid REAL build needs --increment <id>: the increment this attempt is filed under (ADR-0575 D1)",
    );
  }
  const id = incrementId;

  let doc;
  try {
    doc = await corpus.getDoc(id);
  } catch (err) {
    return refused(
      "increment-unreadable",
      `--increment "${id}" could not be looked up: ${errorMessage(err)} (ADR-0576 D1)`,
    );
  }

  if (doc === null) {
    return refused("increment-unknown", `--increment "${id}" names no row in the Library (ADR-0576 D2)`);
  }

  if (doc.kind !== "increment") {
    return refused(
      "increment-wrong-kind",
      `--increment "${id}" names a ${doc.kind}, not an increment (ADR-0576 D2)`,
    );
  }

  const status = readIncrementStatus(doc.doc);
  if (status === "closed") {
    return refused(
      "increment-closed",
      `--increment "${id}" is closed, and a closed increment is never reopened, so work filed under it would be filed nowhere (ADR-0576 D2)`,
    );
  }

  return { ok: true, incrementId: id, status };
}

// ── preflightInnerLoop (ADR-0563 D4/D5, ADR-0576 D1/D4/D6) ─────────────────────────────────────

export interface PreflightInnerLoopInput {
  readonly ledger: Pick<Store, "readEvents">;
  readonly incrementId: string;
  readonly unitIds: readonly string[];
  readonly revise?: boolean;
}

/** The kinds `foldInnerLoopLedger`'s `adjudications` disposition names as a genuine landing. */
const LANDING_DISPOSITIONS = new Set(["land", "land-and-measure", "land-and-declare-gap"]);

/** The LAST `grant` event by `seq`, for this unit — always the live grant's, since grants never overlap. */
function latestGrantKind(events: readonly StoreEvent[], unitId: string): string | undefined {
  let latestSeq = -Infinity;
  let latestKind: string | undefined;
  for (const event of events) {
    if (event.kind !== INNER_LOOP_EVENT_KIND) continue;
    // Every inner-loop doc here is an object: the unit's own fold already parsed each doc it did not
    // skip as another unit's (and skipping needs an object carrying a unitId), and a doc that fails
    // to parse refuses the preflight as ledger-unreadable before this runs.
    const record = event.doc as Record<string, unknown>;
    if (record.event !== "grant" || record.unitId !== unitId) continue;
    // Stryker disable next-line EqualityOperator: EQUIVALENT (the `>=` replacement) for every real store — each appended event gets a unique seq, so two grants never compare equal
    if (event.seq > latestSeq) {
      latestSeq = event.seq;
      // A grant doc parsed in the fold, so its kind is already a string.
      latestKind = String(record.kind);
    }
  }
  return latestKind;
}

/** The first applicable refusal for one unit, in the order ADR-0576 D1/D4/D6 fix, or `undefined`. */
function judgeUnit(
  fold: InnerLoopLedger,
  unitId: string,
  incrementId: string,
  events: readonly StoreEvent[],
  revise: boolean | undefined,
): InnerLoopRefusal | undefined {
  if (fold.unresolvedSignedRuns.length > 0) {
    const runId = fold.unresolvedSignedRuns[0]!;
    return {
      kind: "unresolved-signed-pass",
      unitId,
      runId,
      reason: `${unitId} holds an unresolved signed pass on run ${runId}: a signed verdict is a pass and lands (ADR-0563 D1), so adjudicate it before another attempt`,
    };
  }

  const landedHere = fold.adjudications.some(
    (a) => LANDING_DISPOSITIONS.has(a.disposition) && a.incrementId === incrementId,
  );
  if (landedHere) {
    return {
      kind: "landed-under-increment",
      unitId,
      reason: `${unitId} already landed a signed pass under increment ${incrementId}: new work on a landed unit names a new increment (ADR-0576 D4)`,
    };
  }

  if (fold.policy.disposition === "escalate") {
    return { kind: "owner-ceiling", unitId, reason: fold.policy.reason };
  }

  if (fold.policy.disposition === "stop-and-decide") {
    return { kind: "decision-point", unitId, reason: fold.policy.reason };
  }

  if (fold.remainingGrantCount > 0) {
    // Stryker disable next-line StringLiteral: EQUIVALENT — an unreachable fallback: a live grant count means this unit's ledger holds a grant
    const grantKind = latestGrantKind(events, unitId) ?? "unknown";
    const wantsRevise = revise === true;
    if (grantKind === "revised-test" && !wantsRevise) {
      return {
        kind: "grant-kind-mismatch",
        unitId,
        reason: `${unitId} holds a live revised-test grant, so this attempt must be a --revise-test run (ADR-0576 D6)`,
      };
    }
    if (grantKind !== "revised-test" && wantsRevise) {
      return {
        kind: "grant-kind-mismatch",
        unitId,
        reason: `${unitId} holds a live ${grantKind} grant, and a --revise-test run consumes only a revised-test grant (ADR-0576 D6)`,
      };
    }
  }

  return undefined;
}

/**
 * Preflight every unit a paid build will drive against the attempt ledger, reading it ONCE for the
 * whole call regardless of unit count. Any refusing unit refuses the whole call, with one refusal
 * per refusing unit in `unitIds` order; a passing unit may still carry a relabel WARNING (ADR-0575
 * D2), which is never a refusal and is dropped the moment any unit refuses.
 */
export async function preflightInnerLoop(
  input: PreflightInnerLoopInput,
): Promise<
  | { ok: true; warnings: readonly string[]; ledgers: ReadonlyMap<string, InnerLoopLedger> }
  | { ok: false; state: InnerLoopRefusedState }
> {
  const { ledger, incrementId, unitIds, revise } = input;

  let events: StoreEvent[];
  try {
    events = await ledger.readEvents();
  } catch (err) {
    return refused(
      "ledger-unreadable",
      `the attempt ledger could not be read: ${errorMessage(err)} (ADR-0576 D1)`,
    );
  }

  const refusals: InnerLoopRefusal[] = [];
  const warnings: string[] = [];
  const ledgers = new Map<string, InnerLoopLedger>();

  for (const unitId of unitIds) {
    let fold: InnerLoopLedger;
    try {
      fold = foldInnerLoopLedger(events, unitId);
    } catch (err) {
      refusals.push({
        kind: "ledger-unreadable",
        unitId,
        reason: `the attempt ledger for ${unitId} could not be folded: ${errorMessage(err)} (ADR-0576 D1)`,
      });
      continue;
    }

    const refusal = judgeUnit(fold, unitId, incrementId, events, revise);
    if (refusal !== undefined) {
      refusals.push(refusal);
      continue;
    }

    if (fold.policy.disposition !== "signed" && fold.policy.increments.some((id) => id !== incrementId)) {
      warnings.push(
        `${unitId}: its open loop was filed under ${fold.policy.increments.join(", ")}, and this build names ${incrementId} — ADR-0563 D5: a retry reuses its own increment`,
      );
    }

    ledgers.set(unitId, fold);
  }

  if (refusals.length > 0) {
    return { ok: false, state: { state: "refused", refusals } };
  }

  return { ok: true, warnings, ledgers };
}

// ── renderInnerLoopEntryState (ADR-0576 D8) ─────────────────────────────────────────────────────

const ARC_LIST_CMD = "storytree arc list --pg";
const DB_PROBE_CMD = "pnpm db:probe";

function grantCommand(unitId: string): string {
  return `storytree node grant ${unitId} --attempts <n> --kind <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg`;
}

function adjudicateCommand(unitId: string, runId: string): string {
  return `storytree node adjudicate ${unitId} --run ${runId} --pg`;
}

/** The `next` command a refusal of this kind points at, or `undefined` when it names nothing. */
function nextForRefusal(r: InnerLoopRefusal): string | undefined {
  switch (r.kind) {
    case "increment-missing":
    case "increment-unknown":
    case "increment-wrong-kind":
    case "increment-closed":
    case "landed-under-increment":
      return ARC_LIST_CMD;
    case "increment-unreadable":
    case "ledger-unreadable":
      return DB_PROBE_CMD;
    case "decision-point":
      // Stryker disable next-line StringLiteral: EQUIVALENT — an unreachable fallback: judgeUnit stamps the unit id on every unit refusal
      return grantCommand(r.unitId ?? "");
    case "unresolved-signed-pass":
      // Stryker disable next-line StringLiteral: EQUIVALENT — unreachable fallbacks: judgeUnit stamps the unit id and run id on an unresolved-signed-pass refusal
      return adjudicateCommand(r.unitId ?? "", r.runId ?? "");
    default:
      // owner-ceiling and grant-kind-mismatch point at no command: the next call is the owner's, or a rerun of the right shape.
      return undefined;
  }
}

/** An entry state rendered for an envelope: the body lines and the next-step commands. */
export interface RenderedInnerLoopEntryState {
  readonly lines: readonly string[];
  readonly next: readonly string[];
}

/**
 * The ONE renderer every {@link InnerLoopEntryState} outcome goes through — the only place these
 * strings live (ADR-0576 D8). Entries never re-type them.
 */
export function renderInnerLoopEntryState(state: InnerLoopEntryState): RenderedInnerLoopEntryState {
  switch (state.state) {
    case "refused": {
      const lines = state.refusals.map((r) =>
        r.unitId !== undefined
          ? `refused before spend (${r.kind}): ${r.unitId} — ${r.reason}`
          : `refused before spend (${r.kind}): ${r.reason}`,
      );
      const next: string[] = [];
      for (const r of state.refusals) {
        const cmd = nextForRefusal(r);
        if (cmd !== undefined && !next.includes(cmd)) next.push(cmd);
      }
      return { lines, next };
    }

    case "attempt-failed": {
      const { unitId, runId, consecutiveFailures, remainingGrantCount } = state;
      let step: string;
      let next: readonly string[];
      if (consecutiveFailures >= ATTEMPT_CEILING) {
        step = `at or above the ceiling of ${ATTEMPT_CEILING}, the next call is the owner's (ADR-0563 D4)`;
        next = [];
      } else if (remainingGrantCount > 0) {
        step = `${remainingGrantCount} granted attempt(s) remain`;
        next = [];
      } else if (consecutiveFailures >= ATTEMPT_DECISION_POINT) {
        step = "at the decision point: record a grant before another attempt (ADR-0563 D4)";
        next = [grantCommand(unitId)];
      } else {
        step = "another attempt may proceed under the same increment";
        next = [];
      }
      return {
        lines: [`attempt failed: ${unitId} run ${runId} — ${consecutiveFailures} consecutive failure(s); ${step}`],
        next,
      };
    }

    case "signed": {
      const { unitId, runId } = state;
      return {
        lines: [
          `signed: ${unitId} run ${runId} — a signed verdict is a pass and lands (ADR-0563 D1); adjudicate it before this unit is built again`,
        ],
        next: [adjudicateCommand(unitId, runId)],
      };
    }

    case "not-attempted":
      return { lines: [`not attempted: ${state.unitId} — an earlier unit halted the run`], next: [] };
  }
}
