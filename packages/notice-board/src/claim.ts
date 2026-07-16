import { z } from "zod";

/**
 * The per-unit WRITE-CLAIM: the enforcing twin of presence (ADR-0033 §4 — the named
 * "typed-claims-with-refusal" upgrade path the notice board deferred until overlap conflicts
 * became routine; ADR-0009's claim row, finally built on plain Postgres now that DBOS is deferred,
 * ADR-0019). Presence *shows* overlap and swallows every failure; a CLAIM *refuses* it — two
 * sessions cannot hold the build-claim on one unit at once (the confirmed 2026-06-27
 * duplicate-build race).
 *
 * This module is the PURE half (no I/O, no clock reads — callers pass `now`), so the root barrel
 * stays browser-safe exactly like `presence.ts`. The Postgres half is `store/claim-store.ts`.
 *
 * Granularity is the unit id (story / capability / contract): a claim is keyed on `unitId`, so two
 * sessions building DIFFERENT units never contend (the existing per-id-row property), and two
 * building the SAME unit do — the hole this closes. `intent` is free prose (like presence's
 * `workingOn`): "real" / "live-smoke" / "edit" — informational, never load-bearing for the refusal.
 */

// ---------------------------------------------------------------------------
// Stale-reclaim threshold (ADR-0033's "staleness replaces release discipline",
// carried to claims): a holder that crashed never ran release(), so a claim
// self-heals once its heartbeat is older than this. Deliberately generous —
// LONGER than any single build — because the cost is asymmetric: reclaiming a
// still-live build re-opens the very duplicate-build hole this closes, while a
// dead session's claim merely wedges one unit until the window passes (and the
// pre-PR fetch still backstops the rare reclaim collision). A heartbeat that
// bumps `heartbeatAt` mid-build (so the threshold can shrink) is a named
// follow-on, mirroring presence's separate statusline heartbeat.
// ---------------------------------------------------------------------------

/** Elapsed ms after which an unreleased claim is reclaimable by another session. */
export const CLAIM_STALE_RECLAIM_MS = 2 * 60 * 60 * 1_000; // 2 hours

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** A non-blank string: empty/whitespace-only is a refusal, never a default. */
const nonBlankString = z.string().refine((s) => s.trim().length > 0, {
  message: "must be a non-blank, non-whitespace string",
});

/**
 * The claim GRADES (ADR-0200 D2 — the noticeboard is the claim ledger): the one claim row
 * generalises from the exclusive build/work mutex to three grades on the same ledger:
 * - `exploring` — shared (any number of sessions per unit), taken at session start; carries the
 *   intent prose ("what I'm thinking"). Renders as the hovering wisp.
 * - `waiting` — shared, ordered by `claimedAt`: the queue behind a work claim. On release the store
 *   promotes the oldest LIVE waiter ({@link oldestLiveWaiter} is the pure pick).
 * - `work` — the exclusive mutex, unchanged in semantics from ADR-0121/0138: one session per unit,
 *   hard refusal names the holder.
 */
export const ClaimGrade = z.enum(["exploring", "waiting", "work"]);

/** The inferred TypeScript type of a claim grade. */
export type ClaimGradeT = z.infer<typeof ClaimGrade>;

/**
 * The validated claim doc — the current holder of a unit's build-claim.
 *
 * Strict mode: unknown fields are rejected, not stripped (the same "derived, never stored"
 * discipline as `PresenceDeclaration`). Fail-closed on attribution: blank `unitId`, `sessionId`,
 * or `branch` is a refusal.
 */
export const ClaimDoc = z
  .object({
    /** The work-hierarchy id (story / capability / contract) this claim locks. */
    unitId: nonBlankString,
    /** The worktree-derived session identity holding the claim (ADR-0033's identity key). */
    sessionId: nonBlankString,
    /** The git branch the holder is building on — for the refusal message + audit. */
    branch: nonBlankString,
    /** Free prose: why the claim is held ("real" / "live-smoke" / "edit"). Not load-bearing.
     * For an `exploring` claim this is the "what I'm thinking" prose — ADR-0200 D2 puts the intent
     * prose ON the claim row (presence's `workingOn` folds in here as presence retires). */
    intent: z.string().default(""),
    /** The claim grade (ADR-0200 D2). Defaults to `work` so every pre-grade doc — and every
     * existing producer — parses unchanged as the exclusive work claim (no schema-version bump). */
    grade: ClaimGrade.default("work"),
    /** When the claim was first taken (ISO 8601). */
    claimedAt: z.string(),
    /** Last liveness bump (ISO 8601); reclaim is measured against this. */
    heartbeatAt: z.string(),
  })
  .strict();

/**
 * The inferred TypeScript type of a validated claim doc — except `grade`, which stays OPTIONAL at
 * the type level (ADR-0200 D2 back-compat): an ABSENT grade IS the work claim, so every pre-grade
 * producer (the store's row mapping, existing fixtures) keeps compiling unchanged while
 * `ClaimDoc.parse` stamps the default. Read the grade via {@link claimGrade}, never a raw
 * `doc.grade ?? …` sprinkle.
 */
export type ClaimDocT = Omit<z.infer<typeof ClaimDoc>, "grade"> & { grade?: ClaimGradeT };

/**
 * PURE: a doc's effective grade — `work` when absent (the pre-grade doc, ADR-0200 D2 back-compat;
 * the same default `ClaimDoc.parse` stamps).
 */
export function claimGrade(doc: Pick<ClaimDocT, "grade">): ClaimGradeT {
  return doc.grade ?? "work";
}

/** What a caller supplies to take a claim — the store stamps `claimedAt` / `heartbeatAt`. */
export interface ClaimRequest {
  unitId: string;
  sessionId: string;
  branch: string;
  /** Free prose; defaults to "" when omitted. */
  intent?: string;
  /** The claim grade (ADR-0200 D2); defaults to `work`, so every existing producer is unchanged. */
  grade?: ClaimGradeT;
}

/**
 * The outcome of a claim attempt — a discriminated union, the way the spine reads it:
 * `acquired: true` means this session now holds the unit (freshly, re-entrantly, or by reclaiming a
 * stale holder); `acquired: false` carries the live holder so the refusal can name who has it.
 *
 * The `queued` arm (ADR-0200 D2): under the grade ledger, a work claim blocked by a held work slot
 * is not a dead-end refusal — the session lands in the `waiting` queue behind the holder. It still
 * carries `acquired: false` (every pre-grade consumer switches on `acquired` and reads `heldBy` on
 * the false branch — both false arms carry it, so those call sites compile and behave unchanged);
 * grade-aware callers discriminate the queue with `"queued" in result`.
 */
export type ClaimResult =
  | { acquired: true; claim: ClaimDocT; reclaimed: boolean }
  | { acquired: false; heldBy: ClaimDocT }
  | { acquired: false; queued: true; waiting: ClaimDocT; heldBy: ClaimDocT };

// ---------------------------------------------------------------------------
// Pure reclaim predicate
// ---------------------------------------------------------------------------

/**
 * PURE: is an existing claim reclaimable by another session? True once its heartbeat is older than
 * `staleMs` (default {@link CLAIM_STALE_RECLAIM_MS}). No clock reads — the caller supplies `now`.
 *
 * The store enforces the same condition atomically in SQL; this is the testable mirror and the
 * shape any non-DB reasoning (a dry-run, a future in-memory claim store) reuses.
 */
export function isReclaimable(
  claim: Pick<ClaimDocT, "heartbeatAt">,
  now: Date,
  staleMs: number = CLAIM_STALE_RECLAIM_MS,
): boolean {
  return now.getTime() - new Date(claim.heartbeatAt).getTime() >= staleMs;
}

// ---------------------------------------------------------------------------
// Pure heartbeat bump (ADR-0138 §4) — the cheap mid-flight liveness refresh
// the header above named as a follow-on, made load-bearing by the wisp-claim:
// a live session's claim must NEVER age out, so the loops' own trace signals
// (SDK turn / tool-call / phase events) bump the heartbeat as they fire.
// ---------------------------------------------------------------------------

/**
 * PURE: refresh a claim's heartbeat to `now` WITHOUT the re-acquire/refuse path (cheaper than
 * {@link isReclaimable}'s store-side `claim()` round-trip). Returns a NEW claim identical to `claim`
 * except `heartbeatAt`, which becomes `now.toISOString()` — nothing else moves (not even
 * `claimedAt`). No clock read (the caller passes `now`), no store touch, no mutation of the input;
 * the store-side mirror that writes the bump is `PgClaimStore.bumpHeartbeat`.
 */
export function bumpHeartbeat(claim: ClaimDocT, now: Date): ClaimDocT {
  return { ...claim, heartbeatAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Work-time claim request (ADR-0138 §3) — the claim generalises from build-time
// ("real" / "live-smoke") to the outer loop's work ("edit" / "orchestrate"), so
// the orchestrator can hold a story-claim before it spawns any subagent.
// ---------------------------------------------------------------------------

/**
 * The work KINDS a work-time claim carries (ADR-0138 §3): an `edit` (a focused change) or an
 * `orchestrate` (a session holding a story while it spawns subagents). The kind becomes the claim's
 * `intent` — informational, never load-bearing for the refusal (like every other `intent`).
 */
export type WorkClaimKind = "edit" | "orchestrate";

/** What {@link workClaimRequest} needs to build a work-time {@link ClaimRequest}. */
export interface WorkClaimArgs {
  unitId: string;
  sessionId: string;
  branch: string;
  /** The work kind, stamped as the claim's `intent`. */
  kind: WorkClaimKind;
}

/**
 * PURE: build the work-time {@link ClaimRequest} for a unit, stamping `intent` from the work `kind`
 * (ADR-0138 §3 — generalising the claim beyond the build-only trigger). Builtins-only; the store
 * stamps `claimedAt` / `heartbeatAt` when the request is taken.
 */
export function workClaimRequest(args: WorkClaimArgs): ClaimRequest {
  return {
    unitId: args.unitId,
    sessionId: args.sessionId,
    branch: args.branch,
    intent: args.kind,
    grade: "work",
  };
}

// ---------------------------------------------------------------------------
// Graded claim requests (ADR-0200 D2) — the exploring and waiting halves of
// the ledger. Like workClaimRequest, these are PURE builders: builtins-only,
// the store stamps `claimedAt` / `heartbeatAt` when the request is taken.
// ---------------------------------------------------------------------------

/** What {@link exploringClaimRequest} needs to build an exploring {@link ClaimRequest}. */
export interface ExploringClaimArgs {
  unitId: string;
  sessionId: string;
  branch: string;
  /** The "what I'm thinking" free prose — ADR-0200 D2 carries it ON the claim row. */
  intent: string;
}

/**
 * PURE: build the exploring (shared, session-start) {@link ClaimRequest} for a unit, stamping
 * `grade: "exploring"` and carrying the intent prose — "someone is reading / planning here, and
 * this is what they're thinking" (ADR-0200 D2, the hovering wisp).
 */
export function exploringClaimRequest(args: ExploringClaimArgs): ClaimRequest {
  return {
    unitId: args.unitId,
    sessionId: args.sessionId,
    branch: args.branch,
    intent: args.intent,
    grade: "exploring",
  };
}

/** What {@link waitingClaimRequest} needs to build a waiting {@link ClaimRequest}. */
export interface WaitingClaimArgs {
  unitId: string;
  sessionId: string;
  branch: string;
  /** Free prose (what the waiter will do once promoted); defaults to "" when omitted. */
  intent?: string;
}

/**
 * PURE: build the waiting (queued-behind-a-work-holder) {@link ClaimRequest} for a unit, stamping
 * `grade: "waiting"` (ADR-0200 D2 — the queue, ordered by `claimedAt`; on release the store
 * promotes the oldest live waiter, {@link oldestLiveWaiter}).
 */
export function waitingClaimRequest(args: WaitingClaimArgs): ClaimRequest {
  const req: ClaimRequest = {
    unitId: args.unitId,
    sessionId: args.sessionId,
    branch: args.branch,
    grade: "waiting",
  };
  if (args.intent !== undefined) req.intent = args.intent;
  return req;
}

// ---------------------------------------------------------------------------
// Pure promotion pick (ADR-0200 D2) — "on release of the work claim the store
// atomically promotes the oldest live waiter". The store enforces this in SQL;
// this is the testable mirror, exactly like isReclaimable's split.
// ---------------------------------------------------------------------------

/**
 * PURE: given a unit's waiting claims, pick the one to promote — the oldest by `claimedAt`,
 * skipping stale waiters (a dead session never wins promotion; staleness is the SAME heartbeat
 * predicate as reclaim, {@link isReclaimable}). Returns `undefined` when no live waiter remains.
 * No clock reads — the caller supplies `now`. Ties on `claimedAt` break to the first-listed waiter.
 */
export function oldestLiveWaiter(
  waiters: readonly ClaimDocT[],
  now: Date,
  staleMs: number = CLAIM_STALE_RECLAIM_MS,
): ClaimDocT | undefined {
  let oldest: ClaimDocT | undefined;
  for (const w of waiters) {
    if (isReclaimable(w, now, staleMs)) continue; // stale — a dead waiter never promotes
    if (oldest === undefined || new Date(w.claimedAt).getTime() < new Date(oldest.claimedAt).getTime()) {
      oldest = w;
    }
  }
  return oldest;
}
