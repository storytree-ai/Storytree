/**
 * Pure replay renderers (ADR-0023 envelope shape, ADR-0235 clause 3/4/7, ADR-0241 D5), story
 * `context-traversal-capture`, capability `traversal-session-query`.
 *
 * No filesystem, no clock, no store: these functions take the values `traversal-trace-sink`'s
 * reader already returns (a session summary list, or one session's `ContextTraversalReplay`) and
 * produce envelope-shaped bodies with ADR-0023 `next:` pointers. The thin CLI dispatch that calls
 * these belongs to `terminal-capture-activation`, not here.
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextTraversalReplay,
  ContextVisitEvent,
} from "@storytree/context-traversal-telemetry";

import { describeTraceIdentity } from "./session-identity.js";
import type { TraceIdentityKind } from "./session-identity.js";
import type { TraversalSessionSummary } from "./sink.js";

/**
 * The one place this codebase admits that a FILE read is unobserved. Shared so the surfaces that
 * state it cannot drift apart in wording.
 *
 * Re-homed here by ADR-0464 D1, which deleted `offer-observability-share.ts`. It arrived there
 * because the offer-observability block was the first surface to need it; it was never about offers.
 * Its sibling `PATHWAY_CAVEAT` — which scoped the same clause to the offer block's ratio — DID die
 * with that block, and the difference is the reason this one had to be kept: that caveat qualified a
 * DENOMINATOR, this note qualifies the WHOLE REPLAY.
 */
export const FILE_READS_OBSERVE_NOTHING = "file reads observe nothing";

/**
 * What the REPLAY AS A WHOLE observes and does not — `adrs-into-the-dag-arc-inc-03`.
 *
 * Printed UNCONDITIONALLY on every replay, and that is the property that had to survive ADR-0464 D1.
 * The offer-observability block that used to carry the same admission rendered the empty string when
 * a replay recorded no offer — so on exactly the sparse traces most likely to be misread as "this
 * session read lightly", the admission was not printed at all. After the offer surface's retirement
 * EVERY trace is such a trace, so had this note gone with its old home the replay would have lost its
 * only statement of what it cannot see, on every session, permanently. The replay's worst property is
 * not that it under-reports; it is that it under-reports SILENTLY while looking complete.
 *
 * NO STATISTIC IS CARRIED HERE, deliberately. Dated corpus measurements start rotting the day they
 * ship; the FACT is durable and belongs here, the NUMBERS belong on the arc where they carry their
 * date and population.
 *
 * Under-reporting is the accepted failure mode for this capture — acceptable only while it is
 * declared, and declaring it is this constant's whole job.
 *
 * THE EXAMPLE MOVED ON 2026-08-22, AND THE FACT DID NOT (`decision-log-readers-arc-inc-04`). It read
 * "a decision record opened from `docs/decisions/`", chosen because decision pointers were the
 * largest unobserved class. ADR-0403 dec 1 deleted that directory and made a decision an ordinary
 * Library row, so the sentence became false twice over: the path no longer exists, and a decision is
 * now reached by `storytree library artifact adr-NNNN`, which the allowlist DOES observe. A caveat
 * illustrating its own opposite is worse than none, because a reader trusts the concrete half. The
 * shared clause it composes is untouched and still true, so only the EXAMPLE changed: a story spec
 * opened straight from `stories/` still leaves no trace.
 */
export const REPLAY_PATHWAY_NOTE =
  "observes: storytree CLI reads only, by an allowlist whose default answer is no event; " +
  `${FILE_READS_OBSERVE_NOTHING}, so a story spec opened straight from stories/ leaves no trace ` +
  "here — this replay covers one pathway, not all of this session's navigation";

/** The local envelope shape (ADR-0023): a body plus optional `next:` pointers. */
export interface TraversalRenderEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly next?: readonly string[];
}

function readStrengthLabel(kind: ContextVisitEvent["kind"]): string {
  return kind === "front_matter_read" ? "front-matter" : "full-payload";
}

/**
 * One line for a visit event. Read strength (front-matter vs full-payload) stays visibly distinct
 * (ADR-0235 clause 3). A revisit is rendered as a NEW forward visit that names the earlier visit it
 * links to ONLY because `priorVisitId` is actually present on this event — never inferred from
 * adjacency, ordering, or timestamp proximity.
 */
function renderVisitLine(event: ContextVisitEvent): string {
  const strength = readStrengthLabel(event.kind);
  const surface = event.surfaceId ?? "unknown-surface";
  const base = `  [${strength}] visit=${event.visitId} node=${event.nodeId} surface=${surface}`;
  // Both links are rendered when both are present, and each ONLY because the field is actually on
  // the event — never inferred from adjacency, ordering, or timestamp proximity (ADR-0235 clause 3).
  // A descent is the DEPTH axis (this visit hangs beneath an earlier one); a revisit is the TIME
  // axis (this visit repeats an earlier one). They are independent, so neither may hide the other.
  const suffixes: string[] = [];
  if (event.parentVisitId !== undefined) {
    suffixes.push(`(descended from visit=${event.parentVisitId})`);
  }
  if (event.priorVisitId !== undefined) {
    suffixes.push(`(revisit of visit=${event.priorVisitId})`);
  }
  return suffixes.length > 0 ? `${base} ${suffixes.join(" ")}` : base;
}

function renderEventLine(event: ContextTraversalEvent): string {
  if (isContextVisitEvent(event)) {
    return renderVisitLine(event);
  }
  switch (event.kind) {
    case "search":
      return `  [search] search=${event.searchId} surface=${event.surfaceId} operation=${event.operation}`;
    case "candidate_set":
      return `  [candidate-set] set=${event.candidateSetId} surface=${event.surfaceId} candidates=${event.candidateNodeIds.length}`;
    case "followed_edge":
      return `  [followed-edge] edge=${event.edgeId} from=${event.fromVisitId} to=${event.toVisitId}`;
    case "model_context":
      return `  [model-context] model=${event.modelId ?? "unknown"} cumulative=${event.cumulativeInputTokens}`;
    case "spawn_handoff":
      return `  [spawn-handoff] edge=${event.edgeId} child=${event.childSessionId}`;
    case "result_return":
      return `  [result-return] edge=${event.edgeId} child=${event.childSessionId}`;
    default:
      return "  [unknown-event]";
  }
}

/**
 * Finds the chronologically-last `model_context` event in an already-ordered event list. Capacity
 * is a property of the LATEST observation, not an aggregate.
 */
function findLatestModelContext(
  events: readonly ContextTraversalEvent[],
): Extract<ContextTraversalEvent, { kind: "model_context" }> | undefined {
  let latest: Extract<ContextTraversalEvent, { kind: "model_context" }> | undefined;
  for (const event of events) {
    if (event.kind === "model_context") latest = event;
  }
  return latest;
}

/**
 * Capacity is UNKNOWN unless a `model_context` event actually carried a capacity — never a default, a
 * fabricated gauge, or the owner-selected 500k display-only threshold (ADR-0235 clause 4/7).
 *
 * The two ways capacity goes unknown are DIFFERENT facts and must render differently: no
 * `model_context` was observed at all, versus one WAS observed and carried no capacity — because its
 * source declared none, or declared nothing this render may honestly collapse into a single number.
 * Which shapes reach which branch varies by boundary and shifts as adapters learn to read more, so
 * neither branch is any boundary's permanent "always". Reusing the no-observation wording for the
 * second case denies an observation the replay just rendered.
 *
 * `capacity: unknown` leads either way, and capacity is never inferred, defaulted, or estimated to
 * avoid saying unknown.
 */
function renderCapacityLine(events: readonly ContextTraversalEvent[]): string {
  const latest = findLatestModelContext(events);
  if (latest === undefined) {
    return "capacity: unknown (no model_context observation at this boundary)";
  }
  if (latest.contextWindowCapacity === undefined) {
    return "capacity: unknown (observed, but this boundary declares no window capacity)";
  }
  return `capacity: ${latest.contextWindowCapacity} tokens (model=${latest.modelId ?? "unknown"})`;
}

/** Always prints every declared coverage — supported AND omitted — never just one side. */
function renderCoverageBlock(coverage: readonly ContextTraversalCoverage[]): string {
  if (coverage.length === 0) {
    return "coverage: none declared";
  }
  return coverage
    .map(
      (declaration) =>
        `coverage: adapter=${declaration.adapterId} supported=[${declaration.supported.join(", ")}] omitted=[${declaration.omitted.join(", ")}]`,
    )
    .join("\n");
}

/**
 * Renders the session index: session ids with their event counts and last-observed time, newest
 * first, so an owner can find the session they just ran without knowing its id.
 */
export function renderTraversalSessions(list: readonly TraversalSessionSummary[]): TraversalRenderEnvelope {
  if (list.length === 0) {
    return { ok: true, body: "No captured sessions found." };
  }

  const sorted = [...list].sort((a, b) => {
    if (a.lastObservedAt === undefined && b.lastObservedAt === undefined) return 0;
    if (a.lastObservedAt === undefined) return 1;
    if (b.lastObservedAt === undefined) return -1;
    return b.lastObservedAt.localeCompare(a.lastObservedAt);
  });

  const lines = sorted.map((session) => {
    const observed = session.lastObservedAt ?? "unknown";
    const slots = session.slots.length > 0 ? ` — slot ${session.slots.join(", ")}` : "";
    return `- ${session.sessionId} — ${session.eventCount} event(s) — last observed ${observed} — identity: ${session.identity}${slots}`;
  });

  // WHY EVERY ROW CARRIES ITS IDENTITY KIND, and why the legacy note is CONDITIONAL
  // (`linked-session-context-arc-inc-30`). Before window identity existed, a session id here was the
  // worktree SLOT — pooled across the parent session, its subagents, and every later session handed
  // the same slot, at a measured median of 2 windows and a p90 of 8. Those traces still sit in this
  // index and cannot be retrofitted: nothing on disk records which window wrote which line. Listing
  // them unlabelled beside window-keyed ones is the silent mixing this label exists to prevent, and
  // the note is printed only when at least one such row is actually present, so a clean index does
  // not grow a paragraph announcing an absence.
  const legacy = sorted.filter((session) => session.identity === "slot" || session.identity === "mixed");
  const notice =
    legacy.length === 0
      ? []
      : [
          "",
          `note: ${legacy.length} of ${sorted.length} session(s) above are keyed wholly or partly by the`,
          "worktree SLOT rather than by one context window. A slot pools every window that ran in it,",
          "so a per-session count taken over one of those is not one session's. They are NOT",
          "retrofittable — no line records which window wrote it — so they are labelled here rather",
          "than merged with the window-keyed ones.",
        ];

  const body = ["Captured sessions (newest observed first):", "", ...lines, ...notice].join("\n");
  const next = sorted.map(
    (session) => `storytree context-traversal session ${session.sessionId} — replay this session`,
  );

  return { ok: true, body, next };
}

/**
 * Renders one session's chronological replay: one line per event (read strength visibly distinct
 * for visits, a revisit named only when `priorVisitId` is present), the coverage block the adapter
 * declared, an honest capacity line, and — whenever the reader skipped anything — an explicit
 * partial-read notice. Always succeeds: a corrupt or crash-truncated trace still renders, it never
 * throws (ADR-0241 D5).
 */
export function renderTraversalSession(
  replay: ContextTraversalReplay,
  opts: {
    readonly skipped: number;
    /**
     * What this session's id names, from the reader (`linked-session-context-arc-inc-30`). Optional
     * so a caller holding only a replay still renders; absent means the identity line is omitted
     * rather than guessed, which is the same posture `capacity:` takes toward an unobserved window.
     */
    readonly identity?: TraceIdentityKind;
    /** The worktree slot(s) the session's lines recorded — a grouping attribute, not an identity. */
    readonly slots?: readonly string[];
  },
): TraversalRenderEnvelope {
  const lines: string[] = [];

  const sessionIds = [...new Set(replay.events.map((event) => event.sessionId))];
  const sessionLabel = sessionIds.length > 0 ? sessionIds.join(", ") : "unknown";
  lines.push(`session: ${sessionLabel}`);

  // WHAT THE SESSION ID ABOVE ACTUALLY NAMES, said on the picture rather than left to the id's
  // shape (`linked-session-context-arc-inc-30`). It sits directly under `session:` because it
  // qualifies that line and nothing else: a `slot`-keyed replay is the union of every context
  // window that ran in one pooled worktree — the parent session, its subagents, and every later
  // session handed the same slot — so its repeat counts are not one session's, and it is not
  // retrofittable to window identity because no line records which window wrote it.
  //
  // Printed only for a replay that HAS events: a session with nothing in it has no lines to
  // classify, and labelling an empty trace would be asserting an era over a file that is not there.
  if (opts.identity !== undefined && replay.events.length > 0) {
    lines.push(`identity: ${opts.identity} — ${describeTraceIdentity(opts.identity)}`);
  }
  if (opts.slots !== undefined && opts.slots.length > 0) {
    lines.push(`worktree slot: ${opts.slots.join(", ")} (a grouping attribute, never the identity)`);
  }

  if (opts.skipped > 0) {
    lines.push(`partial replay: ${opts.skipped} event line(s) skipped (unreadable or corrupt)`);
  }

  lines.push(renderCapacityLine(replay.events));
  lines.push(renderCoverageBlock(replay.coverage));

  // WHAT THIS PICTURE DOES AND DOES NOT OBSERVE, stated on the picture itself
  // (`adrs-into-the-dag-arc-inc-03`). It sits beside `capacity:` and `coverage:` because those are
  // the render's other honesty lines: what it knows about the window, what the adapter declared,
  // and now which pathway it can see at all.
  //
  // UNCONDITIONAL, which is the whole point. Until now the only statement of this fact anywhere in
  // the codebase was `PATHWAY_CAVEAT`, printed on the offer-observability block alone — so it
  // qualified a ratio rather than the picture, AND it vanished entirely on a replay that recorded no
  // offer, i.e. on exactly the sparse traces a reader is most likely to mistake for "this session
  // read lightly". A picture that shows one pathway while looking complete is worse than one that
  // shows nothing, and the accepted failure mode here is under-reporting ONLY while it is declared.
  //
  // Note what this does NOT do: it states what the replay observes, it does not redraw it. The
  // drawn grammar (ADR-0354) and every verbatim-pinned event line are untouched — this is a header
  // line, appended for the same reason the decision and observability blocks are appended.
  lines.push(REPLAY_PATHWAY_NOTE);

  lines.push("");
  lines.push("visits:");
  if (replay.events.length === 0) {
    lines.push("  (no events observed)");
  } else {
    for (const event of replay.events) {
      lines.push(renderEventLine(event));
    }
  }

  // TWO DERIVED BLOCKS USED TO BE APPENDED HERE, and ADR-0464 D1 deleted both with their subject.
  // The DECISION-POINT view (capability `decision-point-playback`, ADR-0260) named every offer a
  // render made and what became of it; the OBSERVABILITY denominator beneath it (capability
  // `offer-observability-share`, ADR-0312 D1) said how much of that offer set a follow could ever
  // have been observed on. Both read `candidate_set` and `followed_edge`, and nothing emits either
  // kind any more.
  //
  // They are DELETED rather than left in place, and that is the point rather than tidiness. Each
  // rendered the empty string for a replay holding no offers — so left standing they would have gone
  // on running forever over a population that is now empty by construction, printing nothing and
  // reporting no error. A reader of `traversal show` would have seen a clean render and had no way to
  // tell "this session followed nothing" from "this instrument stopped having a subject". That is the
  // vacuous-green shape, and the honest repair for an instrument whose subject is retired is to
  // retire the instrument in the same landing.
  //
  // The chronological `visits:` lines above are UNCHANGED and still carry the whole raw record. A
  // trace captured BEFORE this landing still replays its `[candidate-set]` and `[followed-edge]`
  // lines verbatim — the event vocabulary is deliberately kept (ADR-0464 D1 retires the RECORDING,
  // not the ability to read what was already recorded), so no historical trace becomes unreadable.
  return { ok: true, body: lines.join("\n") };
}
