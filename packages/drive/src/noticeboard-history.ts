/**
 * `storytree noticeboard history` — the READ VERB over the claim audit log (`events.claim_event`),
 * ADR-0310 D1 / increment 1 of `first-class-edges-arc`. The third sibling of `noticeboard.ts`
 * (declare/done) and `noticeboard-claims.ts` (the graded ledger verbs), and the only one that reads
 * TRANSITIONS rather than STATE.
 *
 * WHY A SEPARATE VERB AND NOT A WIDER `claims`. `claims <unit>` renders the unit's live rows: a
 * point-in-time board. It CANNOT distinguish "conflict-refused and about to queue" from "never
 * claimed at all" — the two look identical from the outside and the gap between them is minutes
 * wide. On 2026-08-04 that gap produced a wrong report to the owner (a board snapshot read as a
 * dispatch wave resolving into silence; the sessions were mid-refusal) which had to be retracted.
 * A refusal leaves NO state behind — only an audit row — so no widening of a state read can answer
 * it. And every number in ADR-0310 and in this arc's intent came from a hand-written one-shot `tsx`
 * script for want of this verb.
 *
 * Read-only: the log is append-only and this module touches no write path. The store seam
 * ({@link ClaimHistoryStoreLike}) keeps it offline-testable — the CLI injects `PgClaimStore` when
 * `--pg`, null otherwise, and the verb then refuses with the `db:up` guidance like its siblings.
 */
import type { ClaimAuditQuery, ClaimAuditRow } from "@storytree/notice-board";
import {
  CLAIM_REFUSED_TYPE,
  foldHoldings,
  foldRefusals,
  summarizeClaimHistory,
  type ClaimHolding,
} from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Seams + options
// ---------------------------------------------------------------------------

/** The history slice of the claim store this verb drives. Satisfied by `PgClaimStore`. */
export interface ClaimHistoryStoreLike {
  auditHistory(query: ClaimAuditQuery): Promise<ClaimAuditRow[]>;
}

export interface ClaimHistoryDeps {
  /** The audit-log store (--pg); null offline — the verb then refuses with the db:up guidance. */
  history: ClaimHistoryStoreLike | null;
  now: () => Date;
}

/** The verb's flags, as the CLI hands them over (strings straight off argv — parsed here). */
export interface ClaimHistoryOpts {
  /** Window in days (default {@link DEFAULT_HISTORY_DAYS}); `all` reads the whole log. */
  days?: string;
  /** Scope to one session id. */
  session?: string;
  /** Scope to one transition type, e.g. `released`. */
  type?: string;
  /** Cap the rows read, taking the most recent n (default {@link DEFAULT_HISTORY_LIMIT}). */
  limit?: string;
  /** Only refusals — the `--type conflict-refused` shorthand, and the question asked most. */
  refusals?: boolean;
  /** Render hold spans (who held what, for how long) instead of the timeline. */
  holdings?: boolean;
}

/**
 * The default window: thirty days. Not arbitrary — it is exactly the window this arc's binding
 * falsifier reads ("after the read verb ships, thirty days of claim history are read once"), so the
 * default invocation IS the falsifier's read.
 */
export const DEFAULT_HISTORY_DAYS = 30;

/**
 * The default row cap. The whole log was 1,864 events at 40 days (measured 2026-08-05), so this
 * does not truncate a normal read; it is the guard against an unbounded dump once the log grows.
 * A truncated read is always ANNOUNCED in the header — never silently narrowed.
 */
export const DEFAULT_HISTORY_LIMIT = 2_000;

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Flag parsing — refusals, not silent coercions
// ---------------------------------------------------------------------------

/** A parsed flag, or the refusal text explaining what was wrong with it. */
type Parsed<T> = { ok: true; value: T } | { ok: false; body: string };

/**
 * PURE: the window in ms. `all` (or `0`) means the whole log — undefined, which the store reads as
 * no `at` filter. A non-numeric or negative value is REFUSED rather than silently defaulted: a
 * typo'd window that quietly read 30 days would be reported as a 30-day answer.
 */
export function parseHistoryDays(raw: string | undefined): Parsed<number | undefined> {
  if (raw === undefined) return { ok: true, value: DEFAULT_HISTORY_DAYS * MS_PER_DAY };
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "all") return { ok: true, value: undefined };
  // `Number("")` is 0, so a BLANK value would otherwise widen the read to the whole log and be
  // reported as a deliberate `all` — the exact class of silent coercion this parser exists to refuse.
  const days = trimmed.length === 0 ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(days) || days < 0) {
    return {
      ok: false,
      body: `--days must be a non-negative number of days, or "all" for the whole log (got "${raw}").`,
    };
  }
  return { ok: true, value: days === 0 ? undefined : Math.round(days * MS_PER_DAY) };
}

/** PURE: the row cap. `all` / `0` lifts it. A non-numeric or negative value is refused. */
export function parseHistoryLimit(raw: string | undefined): Parsed<number | undefined> {
  if (raw === undefined) return { ok: true, value: DEFAULT_HISTORY_LIMIT };
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "all") return { ok: true, value: undefined };
  // Blank is a refusal, not an uncapped read — see {@link parseHistoryDays}.
  const limit = trimmed.length === 0 ? Number.NaN : Number(trimmed);
  if (!Number.isInteger(limit) || limit < 0) {
    return {
      ok: false,
      body: `--limit must be a non-negative whole number, or "all" for no cap (got "${raw}").`,
    };
  }
  return { ok: true, value: limit === 0 ? undefined : limit };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** A duration in the board's own mm/hh idiom, extended with days for the long spans a log holds. */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** `2026-08-05T02:11:43.000Z` → `2026-08-05 02:11` — a log reads in minutes, not milliseconds. */
export function formatStamp(iso: string): string {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso; // an unparseable stamp prints as stored, never as "Invalid Date"
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function quoteIntent(intent: string | undefined): string {
  return intent !== undefined && intent.trim().length > 0 ? `  "${intent.trim()}"` : "";
}

/**
 * The intent prose off a raw audit doc, read TOLERANTLY — the same discipline the pure folds use. A
 * timeline row renders whatever the writer put there; an odd or absent doc simply carries no prose,
 * and never turns a history read into a failure.
 */
function docIntent(doc: unknown): string | undefined {
  if (doc === null || typeof doc !== "object") return undefined;
  const intent = (doc as Record<string, unknown>)["intent"];
  return typeof intent === "string" ? intent : undefined;
}

function renderHoldingLine(h: ClaimHolding): string {
  const closed = h.stillHeld ? "still held" : `→ ${h.closedBy}`;
  return (
    `  - ${h.unitId}  [${h.grade}]  ${h.sessionId}  ` +
    `${formatStamp(h.openedAt)} ${h.openedBy} → ${formatDuration(h.durationMs)} (${closed})` +
    quoteIntent(h.intent)
  );
}

/** The header every render carries: what was actually read, so no answer overstates its window. */
function renderScope(
  rowCount: number,
  query: ClaimAuditQuery,
  limit: number | undefined,
  days: number | undefined,
): string[] {
  const filters: string[] = [];
  if (query.unitId !== undefined) filters.push(`unit=${query.unitId}`);
  if (query.sessionId !== undefined) filters.push(`session=${query.sessionId}`);
  if (query.type !== undefined) filters.push(`type=${query.type}`);
  const window = days === undefined ? "the whole log" : `the last ${Math.round(days / MS_PER_DAY)}d`;
  const lines = [
    `Claim audit log (events.claim_event) — ${rowCount} event${rowCount === 1 ? "" : "s"} over ${window}` +
      (filters.length > 0 ? `, ${filters.join(" ")}` : ""),
  ];
  if (limit !== undefined && rowCount === limit) {
    // The read hit its cap, so this is a TAIL, not the window. Say so — a capped read presented as
    // a complete one is the same class of error the board snapshot made.
    lines.push(
      `  ⚠ the ${limit}-row cap was hit: these are the MOST RECENT ${limit} events in the window, ` +
        "not all of them. Pass --limit all (or a larger --limit) to read the rest.",
    );
  }
  return lines;
}

const EMPTY_NEXT = [
  "storytree noticeboard history --refusals --pg",
  "storytree noticeboard history <unit-id> --pg",
  "storytree noticeboard --pg",
];

// ---------------------------------------------------------------------------
// claimHistoryCommand
// ---------------------------------------------------------------------------

/**
 * Render the audit log. Four views over ONE read, chosen by what was asked:
 *  - `--refusals`  the refused attempts + who blocked each — invisible to any state read.
 *  - `--holdings`  hold spans with durations — "who held what and for how long".
 *  - `<unit-id>`   that unit's transition timeline, with its hold spans as a tail.
 *  - (bare)        the whole-window summary: totals, the type breakdown, the hot spots.
 */
export async function claimHistoryCommand(
  unitId: string | undefined,
  opts: ClaimHistoryOpts,
  deps: ClaimHistoryDeps,
): Promise<Envelope> {
  if (deps.history === null) {
    return {
      ok: false,
      body:
        "history requires the live store (--pg) — the audit log lives in Cloud SQL " +
        "(events.claim_event). Bring the DB up and pass --pg.",
      next: ["pnpm db:up", "storytree noticeboard history --pg"],
    };
  }

  const days = parseHistoryDays(opts.days);
  if (!days.ok) return { ok: false, body: days.body, next: EMPTY_NEXT };
  const limit = parseHistoryLimit(opts.limit);
  if (!limit.ok) return { ok: false, body: limit.body, next: EMPTY_NEXT };

  // `--refusals` IS `--type conflict-refused`; an explicit --type wins, so the two never disagree
  // silently (asking for both an explicit type and --refusals reads as the explicit type).
  const type = opts.type ?? (opts.refusals === true ? CLAIM_REFUSED_TYPE : undefined);
  const query: ClaimAuditQuery = {
    ...(unitId !== undefined && unitId.trim().length > 0 ? { unitId: unitId.trim() } : {}),
    ...(opts.session !== undefined ? { sessionId: opts.session } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(days.value !== undefined ? { sinceMs: days.value } : {}),
    ...(limit.value !== undefined ? { limit: limit.value } : {}),
  };

  const rows = await deps.history.auditHistory(query);
  const header = renderScope(rows.length, query, limit.value, days.value);

  if (rows.length === 0) {
    return {
      ok: true,
      body: [
        ...header,
        "",
        "No matching transitions. An EMPTY history is a real answer, not a missing one: nothing was",
        "claimed, refused or released here in this window. Widen it with --days all before reading",
        "it as 'never happened'.",
      ].join("\n"),
      next: EMPTY_NEXT,
    };
  }

  const now = deps.now();

  // -------------------------------------------------------------------------
  // --refusals — the view a state read cannot produce at all
  // -------------------------------------------------------------------------
  if (opts.refusals === true && opts.type === undefined) {
    const refusals = foldRefusals(rows);
    const lines = [...header, "", `Refusals (${refusals.length}), newest first:`];
    for (const r of refusals) {
      const blocker =
        r.blockedBy === null
          ? "(the row carried no readable holder)"
          : `held by ${r.blockedBy.sessionId ?? "?"}` +
            (r.blockedBy.grade !== undefined ? ` [${r.blockedBy.grade}]` : "") +
            (r.blockedBy.branch !== undefined ? ` branch=${r.blockedBy.branch}` : "") +
            quoteIntent(r.blockedBy.intent);
      lines.push(`  - ${formatStamp(r.at)}  ${r.unitId}  ${r.sessionId} REFUSED — ${blocker}`);
    }
    const byUnit = summarizeClaimHistory(rows).hottestByRefusal;
    if (byUnit.length > 1) {
      lines.push(
        "",
        "By unit:",
        ...byUnit.map((t) => `  - ${t.name}  ${t.count}`),
      );
    }
    return { ok: true, body: lines.join("\n"), next: EMPTY_NEXT };
  }

  // -------------------------------------------------------------------------
  // --holdings — who held what, and for how long
  // -------------------------------------------------------------------------
  if (opts.holdings === true) {
    const fold = foldHoldings(rows, now);
    const lines = [
      ...header,
      "",
      `Hold spans (${fold.holdings.length}), newest first — unit [grade] session  opened → duration:`,
      ...fold.holdings.map(renderHoldingLine),
    ];
    if (fold.unmatchedCloses > 0) lines.push("", unmatchedNote(fold.unmatchedCloses));
    return { ok: true, body: lines.join("\n"), next: EMPTY_NEXT };
  }

  // -------------------------------------------------------------------------
  // <unit-id> — the transition timeline, with the unit's hold spans as a tail
  // -------------------------------------------------------------------------
  if (query.unitId !== undefined) {
    const lines = [...header, "", `Transitions on "${query.unitId}", oldest first:`];
    for (const row of rows) {
      const intent = quoteIntent(docIntent(row.doc));
      lines.push(`  - ${formatStamp(row.at)}  #${row.seq}  ${row.type}  ${row.sessionId}${intent}`);
    }
    const fold = foldHoldings(rows, now);
    if (fold.holdings.length > 0) {
      lines.push("", "Hold spans:", ...fold.holdings.map(renderHoldingLine));
    }
    if (fold.unmatchedCloses > 0) lines.push("", unmatchedNote(fold.unmatchedCloses));
    return {
      ok: true,
      body: lines.join("\n"),
      next: [
        `storytree noticeboard claims ${query.unitId} --pg`,
        `storytree noticeboard history ${query.unitId} --holdings --pg`,
        "storytree noticeboard history --refusals --pg",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // bare — the whole-window summary
  // -------------------------------------------------------------------------
  const summary = summarizeClaimHistory(rows);
  const lines = [
    ...header,
    "",
    `  span:      ${summary.firstAt === null ? "—" : formatStamp(summary.firstAt)} → ` +
      `${summary.lastAt === null ? "—" : formatStamp(summary.lastAt)}`,
    `  units:     ${summary.distinctUnits} distinct claimed ids`,
    `  sessions:  ${summary.distinctSessions} distinct`,
    `  refusals:  ${summary.refusals}`,
    "",
    "By transition:",
    ...summary.byType.map((t) => `  - ${t.name}  ${t.count}`),
  ];
  if (summary.hottestByRefusal.length > 0) {
    lines.push(
      "",
      "Contention hot spots (units by refusal):",
      ...summary.hottestByRefusal.slice(0, 10).map((t) => `  - ${t.name}  ${t.count}`),
    );
  }
  lines.push(
    "",
    "Busiest units (by events):",
    ...summary.hottestByEvent.slice(0, 10).map((t) => `  - ${t.name}  ${t.count}`),
    "",
    "Claimed ids are free TEXT with no foreign key, so some of the ids above may resolve to nothing",
    "in the story tree (26 such ids over the log's first 40 days). They are counted, not hidden —",
    "that is the evidence for the typed-namespace increment (ADR-0310 D2).",
  );
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      "storytree noticeboard history --refusals --pg",
      "storytree noticeboard history --holdings --pg",
      "storytree noticeboard history <unit-id> --pg",
    ],
  };
}

/** The truncated-window note — spans whose opening transition sits before what was read. */
function unmatchedNote(count: number): string {
  return (
    `⚠ ${count} release${count === 1 ? "" : "s"} had no opening transition in this read: the span ` +
    "started before the window (or before the --limit cap). Their durations are NOT shown rather " +
    "than back-dated to the window edge — widen with --days all to see them whole."
  );
}

// ---------------------------------------------------------------------------
// Dispatch predicate — the CLI routes on this
// ---------------------------------------------------------------------------

/** The verb this module owns. Separate from CLAIM_LEDGER_VERBS: it needs no identity, only a read. */
export const CLAIM_HISTORY_VERB = "history";

export function isClaimHistoryVerb(sub: string | undefined): sub is "history" {
  return sub === CLAIM_HISTORY_VERB;
}
