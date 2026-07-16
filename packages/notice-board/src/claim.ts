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

// ---------------------------------------------------------------------------
// Pure by-session fold (ADR-0200 D7) — "views, not stores": the ONE grouping
// every ledger view (the CLI board, the studio dock) renders through, so the
// session-grouping semantics live once. Browser-safe like everything above.
// ---------------------------------------------------------------------------

/** One claim inside a {@link SessionClaimGroup} — the view-facing slice of a claim doc. */
export interface SessionClaimEntry {
  unitId: string;
  grade: ClaimGradeT;
  intent: string;
  /** Elapsed ms since `claimedAt` at the caller-supplied `now` (clamped to >= 0). */
  ageMs: number;
  /** When the claim was taken (ISO 8601) — kept so a view can render absolute times too. */
  claimedAt: string;
}

/** One session's live claims — the board/dock rendering unit (ADR-0200 D7). */
export interface SessionClaimGroup {
  sessionId: string;
  branch: string;
  claims: SessionClaimEntry[];
}

/** Within a session, the strongest signal renders first: work > waiting > exploring. */
const GRADE_RANK: Record<ClaimGradeT, number> = { work: 0, waiting: 1, exploring: 2 };

/**
 * PURE: fold claim docs into session groups for a ledger view (ADR-0200 D7). Stale claims are
 * DROPPED (the same {@link isReclaimable} heartbeat predicate — a dead session's claims are not a
 * view's business); the rest group by `sessionId` (branch taken from the session's oldest claim).
 * Deterministic ordering: groups by their oldest `claimedAt` ascending (longest-running session
 * first), ties on `sessionId`; within a group by grade rank (work > waiting > exploring), then
 * `claimedAt`, then `unitId`. No clock reads — the caller supplies `now`.
 */
// ---------------------------------------------------------------------------
// Pure overlap-delta digest (ADR-0200 D4) — cursor-once deltas ride outputs
// the agent already reads. The store half (per-session cursor over the
// sequenced claim_event log) is PgClaimStore.pullOverlapDeltas; this is the
// ONE rendering fold every delivery surface (the CLI envelope footer, the
// worktree-create payload) shares, so "someone else is exploring your story"
// reads identically everywhere. Browser-safe like everything above.
// ---------------------------------------------------------------------------

/**
 * One claim event delivered to a session because it touches a unit the session holds a live claim
 * on (ADR-0200 D4). Written by ANOTHER session — a session is never told about its own events.
 * `grade`/`intent` come from the event's claim doc when it carries them (a `conflict-refused`
 * event's doc is the BLOCKING holder, so the fold ignores them there).
 */
export interface OverlapDelta {
  /** The event's position in the sequenced claim_event log. */
  seq: number;
  unitId: string;
  /** claimed | reclaimed | released | conflict-refused | upgraded | downgraded | queued | promoted */
  type: string;
  /** The acting session (the one that claimed/released/queued/…). */
  sessionId: string;
  grade?: ClaimGradeT;
  intent?: string;
  /** When the event was written (ISO 8601). */
  at: string;
}

/** The one-event phrase — "is exploring <unit>", "took the WORK claim on <unit>", … */
function deltaPhrase(d: OverlapDelta): string {
  const intent = d.intent !== undefined && d.intent.trim().length > 0 ? ` ("${d.intent}")` : "";
  switch (d.type) {
    case "claimed": {
      const grade = d.grade ?? "work";
      if (grade === "exploring") return `is exploring ${d.unitId}${intent}`;
      if (grade === "waiting") return `is waiting on ${d.unitId}`;
      return `took the WORK claim on ${d.unitId}`;
    }
    case "reclaimed":
      return `RECLAIMED the work claim on ${d.unitId} (stale holder evicted)`;
    case "upgraded":
      return `upgraded to the WORK claim on ${d.unitId}`;
    // The residual types beyond D4's named set, mapped explicitly (never silence — an event on a
    // unit you hold is worth one line, whatever its type):
    case "downgraded":
      return `downgraded to ${d.grade ?? "a shared grade"} on ${d.unitId}`;
    case "queued":
      return `queued for the work slot on ${d.unitId}`;
    case "promoted":
      return `was promoted to the WORK claim on ${d.unitId}`;
    case "released":
      return `released ${d.unitId}`;
    case "conflict-refused":
      return `tried to take the WORK claim on ${d.unitId} (refused — slot held)`;
    default:
      // Forward-compat: an unknown event type still speaks, it never silently drops.
      return `${d.type} on ${d.unitId}`;
  }
}

/**
 * PURE: fold overlap deltas into the human digest lines a delivery surface prints (ADR-0200 D4).
 * One line per event — `session <id> <phrase>` — except when SEVERAL events accumulated on one
 * unit, which collapse to a single digest line ("<unit>: N claim events — latest: …") so a busy
 * unit never floods the footer. Units keep first-seen (seq) order; empty in → empty out. No clock
 * reads, no I/O.
 */
export function digestOverlapDeltas(deltas: readonly OverlapDelta[]): string[] {
  const byUnit = new Map<string, OverlapDelta[]>();
  for (const d of deltas) {
    const bucket = byUnit.get(d.unitId);
    if (bucket === undefined) byUnit.set(d.unitId, [d]);
    else bucket.push(d);
  }
  const lines: string[] = [];
  for (const [unitId, events] of byUnit) {
    const latest = events[events.length - 1] as OverlapDelta;
    if (events.length === 1) {
      lines.push(`session ${latest.sessionId} ${deltaPhrase(latest)}`);
    } else {
      lines.push(
        `${unitId}: ${events.length} claim events — latest: session ${latest.sessionId} ${deltaPhrase(latest)}`,
      );
    }
  }
  return lines;
}

export function groupClaimsBySession(
  claims: readonly ClaimDocT[],
  now: Date,
  staleMs: number = CLAIM_STALE_RECLAIM_MS,
): SessionClaimGroup[] {
  const bySession = new Map<string, { branch: string; oldestMs: number; docs: ClaimDocT[] }>();
  for (const doc of claims) {
    if (isReclaimable(doc, now, staleMs)) continue; // stale — dropped, never rendered
    const claimedMs = new Date(doc.claimedAt).getTime();
    const group = bySession.get(doc.sessionId);
    if (group === undefined) {
      bySession.set(doc.sessionId, { branch: doc.branch, oldestMs: claimedMs, docs: [doc] });
    } else {
      group.docs.push(doc);
      if (claimedMs < group.oldestMs) {
        group.oldestMs = claimedMs;
        group.branch = doc.branch; // branch follows the session's oldest claim
      }
    }
  }

  const groups = [...bySession.entries()].sort(
    ([aId, a], [bId, b]) => a.oldestMs - b.oldestMs || (aId < bId ? -1 : aId > bId ? 1 : 0),
  );

  return groups.map(([sessionId, group]) => ({
    sessionId,
    branch: group.branch,
    claims: group.docs
      .slice()
      .sort(
        (a, b) =>
          GRADE_RANK[claimGrade(a)] - GRADE_RANK[claimGrade(b)] ||
          new Date(a.claimedAt).getTime() - new Date(b.claimedAt).getTime() ||
          (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0),
      )
      .map((doc) => ({
        unitId: doc.unitId,
        grade: claimGrade(doc),
        intent: doc.intent,
        ageMs: Math.max(0, now.getTime() - new Date(doc.claimedAt).getTime()),
        claimedAt: doc.claimedAt,
      })),
  }));
}

// ---------------------------------------------------------------------------
// Pure departure fold (ADR-0200 D7 — wisp-out legibility): a wisp that just
// released reads as GONE on the board, indistinguishable from a lost claim
// (the friction-released-build-wisp-reads-as-lost-claim item). The store half
// is PgClaimStore.recentDepartures (the window-bounded `released` read over
// claim_event); this is the ONE rendering fold every view shares, so "this
// session just left" reads identically everywhere. Browser-safe like
// everything above.
// ---------------------------------------------------------------------------

/**
 * Window inside which a released claim still renders as a DEPARTURE (ms). A Stage-1 default —
 * 2 minutes, long enough for a board glance to catch the exit, short enough that the departed wisp
 * never reads as still-held — the owner attests the felt duration at Stage-2.
 */
export const DEPARTURE_WINDOW_MS = 120_000; // 2 minutes

/**
 * One raw `released` row off the claim_event log, as `PgClaimStore.recentDepartures` returns it.
 * `doc` is the released claim doc the store appended (ClaimDocT-shaped jsonb) — carried as
 * `unknown` and read TOLERANTLY by the fold (a departure feed never fail-closes a courtesy read
 * the way the claim paths do; same discipline as {@link OverlapDelta}'s lenient lift).
 */
export interface ClaimDeparture {
  unitId: string;
  sessionId: string;
  /** The released claim doc (read via {@link foldDepartures}'s tolerant grade extract). */
  doc: unknown;
  /** When the release was written (ISO 8601). */
  at: string;
}

/** One departed claim, folded for rendering — the view-facing slice of a departure. */
export interface DepartedClaim {
  unitId: string;
  sessionId: string;
  /** The grade the claim held when released — `work` when the doc doesn't say (pre-grade/odd docs). */
  grade: ClaimGradeT;
  /** Elapsed ms since the release at the caller-supplied `now` (clamped to >= 0). */
  ageMs: number;
  /** When the release was written (ISO 8601) — kept so a view can render absolute times too. */
  at: string;
}

/** Tolerant grade extract off a released doc — malformed/absent degrades to `work`, never throws. */
function departedGrade(doc: unknown): ClaimGradeT {
  if (doc !== null && typeof doc === "object") {
    const grade = ClaimGrade.safeParse((doc as Record<string, unknown>)["grade"]);
    if (grade.success) return claimGrade({ grade: grade.data });
  }
  return claimGrade({});
}

/**
 * PURE: fold raw departure rows into the departed claims a view renders (ADR-0200 D7). The
 * window bound is the STORE's job (SQL); the fold additionally DROPS any row older than
 * `windowMs` — defense in depth, so a stale feed can never resurrect an old exit. Deterministic
 * order: newest first (`at` DESC), ties on `unitId`. Empty in → empty out. No clock reads — the
 * caller supplies `now`.
 */
export function foldDepartures(
  rows: readonly ClaimDeparture[],
  now: Date,
  windowMs: number = DEPARTURE_WINDOW_MS,
): DepartedClaim[] {
  const out: DepartedClaim[] = [];
  for (const row of rows) {
    const ageMs = Math.max(0, now.getTime() - new Date(row.at).getTime());
    if (ageMs > windowMs) continue; // aged out — dropped, never rendered
    out.push({
      unitId: row.unitId,
      sessionId: row.sessionId,
      grade: departedGrade(row.doc),
      ageMs,
      at: row.at,
    });
  }
  return out.sort(
    (a, b) =>
      new Date(b.at).getTime() - new Date(a.at).getTime() ||
      (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0),
  );
}
