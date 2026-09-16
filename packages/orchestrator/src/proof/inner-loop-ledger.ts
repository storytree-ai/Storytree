import {
  INNER_LOOP_EVENT_KIND,
  InnerLoopEventDoc,
  type InnerLoopEventDoc as InnerLoopEvent,
} from "@storytree/proof-protocol";
import type { Store, StoreEvent } from "@storytree/storage-protocol";
import { ATTEMPT_CEILING, decideAttempt, type AttemptDecision } from "./inner-loop-exit.js";

type AdjudicationEvent = Extract<InnerLoopEvent, { event: "adjudication" }>;
type GrantEvent = Extract<InnerLoopEvent, { event: "grant" }>;
type LedgerEvent = Pick<StoreEvent, "doc" | "id" | "kind" | "seq" | "type">;

export interface InnerLoopAttempt {
  readonly runId: string;
  readonly signed: boolean;
}

export interface InnerLoopLedger {
  readonly attempts: readonly InnerLoopAttempt[];
  readonly adjudications: readonly AdjudicationEvent[];
  readonly consecutiveFailures: number;
  readonly remainingGrantCount: number;
  readonly unresolvedSignedRuns: readonly string[];
  readonly policy: AttemptDecision;
}

interface ParsedLedgerEvent {
  readonly doc: InnerLoopEvent;
  readonly seq: number;
}

/** Canonical durable identity: one row per event family, unit, increment, and build run. */
export function innerLoopEventId(doc: InnerLoopEvent): string {
  return ["inner-loop", doc.event, doc.unitId, doc.incrementId, doc.runId]
    .map(encodeURIComponent)
    .join(":");
}

/** Strict, replayable ledger fold. History order is the Store's monotonic sequence, not array order. */
export function foldInnerLoopLedger(
  events: readonly LedgerEvent[],
  unitId: string,
  incrementId: string,
): InnerLoopLedger {
  const docs = parseLedgerEvents(events, unitId, incrementId);
  const attempts: Array<{ runId: string; signed: boolean }> = [];
  const attemptIndex = new Map<string, number>();
  const signed = new Set<string>();
  const settled = new Set<string>();
  const adjudications: AdjudicationEvent[] = [];
  let latestReopenedAttempt = -1;
  let remainingGrantCount = 0;
  let activeGrant: GrantEvent | undefined;
  let consecutiveFailures = 0;
  let terminalRun: string | undefined;

  for (const { doc } of docs) {
    if (doc.event === "attempt") {
      if (terminalRun !== undefined) {
        throw new Error(`landed signed pass ${terminalRun} closes the attempt loop`);
      }
      const unresolved = [...signed].find((runId) => !settled.has(runId));
      if (unresolved !== undefined) {
        throw new Error(`unresolved signed pass ${unresolved} blocks another attempt`);
      }
      if (attemptIndex.has(doc.runId)) throw new Error(`duplicate attempt run: ${doc.runId}`);
      attemptIndex.set(doc.runId, attempts.length);
      attempts.push({ runId: doc.runId, signed: false });
      consecutiveFailures++;
      if (remainingGrantCount > 0) {
        remainingGrantCount--;
        if (remainingGrantCount === 0) activeGrant = undefined;
      }
      continue;
    }

    const index = attemptIndex.get(doc.runId);
    if (index === undefined) throw new Error(`${doc.event} references no recorded attempt: ${doc.runId}`);

    if (doc.event === "signed-pass") {
      if (attempts.at(-1)?.runId !== doc.runId) {
        throw new Error(`signed pass must bind the latest attempt: ${doc.runId}`);
      }
      signed.add(doc.runId);
      attempts[index] = { runId: doc.runId, signed: true };
      consecutiveFailures = 0;
      remainingGrantCount = 0;
      activeGrant = undefined;
      continue;
    }

    if (doc.event === "grant") {
      if (attempts.at(-1)?.runId !== doc.runId) {
        throw new Error(`grant must bind the latest failed run: ${doc.runId}`);
      }
      if (consecutiveFailures < 3) throw new Error("grant is early: the decision point is three failures");
      if (remainingGrantCount > 0) throw new Error("grant overlaps a live grant");
      if (consecutiveFailures >= ATTEMPT_CEILING) {
        throw new Error(`grant exceeds the owner ceiling of ${ATTEMPT_CEILING} failures`);
      }
      remainingGrantCount = doc.attempts;
      activeGrant = doc;
      continue;
    }

    if (!signed.has(doc.runId)) throw new Error("adjudication requires a signed pass");
    adjudications.push(doc);
    settled.add(doc.runId);
    if (doc.disposition === "rework" || doc.disposition === "refuse") {
      latestReopenedAttempt = index;
    } else {
      terminalRun = doc.runId;
    }
  }

  const policyAttempts = attempts.slice(latestReopenedAttempt + 1);
  const policyHistory = policyAttempts.map(({ signed: attemptSigned }) => ({
    incrementId,
    signed: attemptSigned,
  }));
  const basePolicy =
    activeGrant === undefined
      ? decideAttempt({ unitId, attempts: policyHistory })
      : decideAttempt({
          unitId,
          attempts: policyHistory,
          grant: {
            attempts: remainingGrantCount,
            kind: activeGrant.kind,
            difference: activeGrant.difference,
          },
        });
  const policy: AttemptDecision = basePolicy;

  return {
    attempts,
    adjudications,
    consecutiveFailures: policy.consecutiveFailures,
    remainingGrantCount,
    unresolvedSignedRuns: attempts
      .filter(({ runId, signed: attemptSigned }) => attemptSigned && !settled.has(runId))
      .map(({ runId }) => runId),
    policy,
  };
}

function parseLedgerEvents(
  events: readonly LedgerEvent[],
  unitId: string,
  incrementId: string,
): ParsedLedgerEvent[] {
  const seen = new Map<string, string>();
  const parsed: ParsedLedgerEvent[] = [];
  const ordered = events
    .filter(({ kind }) => kind === INNER_LOOP_EVENT_KIND)
    .toSorted((a, b) => a.seq - b.seq);

  for (const event of ordered) {
    const scope = looseLedgerScope(event.doc);
    if (scope !== undefined && (scope.unitId !== unitId || scope.incrementId !== incrementId)) {
      continue;
    }
    const doc = InnerLoopEventDoc.parse(event.doc);
    if (event.type !== "created") {
      throw new Error(`inner-loop ledger event must be created: ${event.type}`);
    }
    const canonicalId = innerLoopEventId(doc);
    if (event.id !== canonicalId) {
      throw new Error(`noncanonical inner-loop identity: expected ${canonicalId}, received ${event.id}`);
    }
    const json = JSON.stringify(doc);
    const prior = seen.get(canonicalId);
    if (prior !== undefined) {
      if (prior !== json) throw new Error(`conflicting inner-loop identity: ${canonicalId}`);
      continue;
    }
    seen.set(canonicalId, json);
    parsed.push({ doc, seq: event.seq });
  }

  return parsed;
}

/**
 * Scope before strict parsing so corrupt history for another unit cannot poison this ledger.
 * A missing or non-string scope is deliberately ambiguous and reaches the strict validator.
 */
function looseLedgerScope(doc: unknown): { unitId: string; incrementId: string } | undefined {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return undefined;
  const { unitId, incrementId } = doc as Record<string, unknown>;
  if (
    typeof unitId !== "string" ||
    unitId.trim().length === 0 ||
    typeof incrementId !== "string" ||
    incrementId.trim().length === 0
  ) {
    return undefined;
  }
  return { unitId, incrementId };
}

export async function appendInnerLoopEvent(
  store: Store,
  input: InnerLoopEvent,
  actor?: string,
): Promise<StoreEvent> {
  const doc = InnerLoopEventDoc.parse(input);
  const id = innerLoopEventId(doc);
  const existing = (await store.readEvents({ id }))
    .filter(({ kind }) => kind === INNER_LOOP_EVENT_KIND)
    .toSorted((a, b) => a.seq - b.seq);

  if (existing.length > 0) {
    for (const event of existing) {
      const stored = InnerLoopEventDoc.parse(event.doc);
      if (event.type !== "created" || event.id !== innerLoopEventId(stored)) {
        throw new Error(`corrupt inner-loop identity: ${id}`);
      }
      if (JSON.stringify(stored) !== JSON.stringify(doc)) {
        throw new Error(`conflicting inner-loop identity: ${id}`);
      }
    }
    return existing[0]!;
  }

  if (actor === undefined) {
    return store.appendEvent({ id, kind: INNER_LOOP_EVENT_KIND, type: "created", doc });
  }
  return store.appendEvent({ id, kind: INNER_LOOP_EVENT_KIND, type: "created", doc, actor });
}

export async function readInnerLoopLedger(
  store: Store,
  unitId: string,
  incrementId: string,
): Promise<InnerLoopLedger> {
  return foldInnerLoopLedger(await store.readEvents(), unitId, incrementId);
}
