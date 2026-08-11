/**
 * The multi-adapter replay composition (story `context-traversal-spawn`, capability
 * `multi-adapter-replay`, ADR-0235 / ADR-0241 / ADR-0192).
 *
 * Increment 2's `showTraversalSession` hardcodes the single terminal adapter's coverage
 * declaration, because at the time the terminal was the only producer. A session's trace can now
 * also hold `spawn_handoff` / `model_context` / `result_return` events from the build spawn
 * boundary adapter — rendering those under a coverage block that omits them would tell the reader
 * the trace could not contain what it is visibly showing (ADR-0235 clause 6).
 *
 * This composition reads through increment 2's `readTraversalSession` and renders through its
 * `renderTraversalSession`, unchanged — it only widens which adapters' coverage declarations are
 * attached to the render. Coverage is a per-adapter CAPABILITY statement, not an emission claim:
 * every INSTALLED adapter's declaration is declared, regardless of whether it actually emitted into
 * this particular session.
 */
import {
  readTraversalSession,
  renderCoverageCaveats,
  renderTraversalSession,
  resolveTraversalDir,
  FOLLOW_OFFER_EDGE_CAVEATS,
  FOLLOW_OFFER_EDGE_COVERAGE,
} from "@storytree/context-traversal-capture";
import type {
  CoverageCaveat,
  TraversalRenderEnvelope,
  TraversalQueryOptions,
} from "@storytree/context-traversal-capture";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextTraversalRelationship,
  ContextTraversalReplay,
  CoverageFeature,
  ModelContextEvent,
} from "@storytree/context-traversal-telemetry";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";

/**
 * Replay one captured session declaring the union of every installed adapter's coverage
 * (currently the terminal CLI dispatch adapter and the build spawn boundary adapter). Reads only —
 * this composition writes nothing.
 *
 * The terminal declaration is the OUTERMOST composed constant — now `FOLLOW_OFFER_EDGE_COVERAGE`,
 * which composes `OFFER_CANDIDATE_SET_COVERAGE` → `AGENT_DESCENT_COVERAGE` → `REVISIT_LINK_COVERAGE`
 * → `observe-cli.ts`'s base. Each layer adds what the wired composition genuinely emits: increment 6
 * added `field:prior_visit_id` (same-node revisits), increment 11 added `field:parent_visit_id` (an
 * `agents <name>` render's floor-ref descent), `context-decision-tree-arc`'s first build increment
 * added `event:candidate_set` (a `library artifact <id>` render's recorded offer, ADR-0260 D1), and
 * its second adds `event:followed_edge` + `field:candidate_follow_causality` (an offer-carrying read
 * declaring the edge it answered, ADR-0260 D3). This is the one render the CLI actually calls, and
 * declaring an inner layer here printed a field under `omitted` on a trace that visibly carried it —
 * the self-denial ADR-0235 clause 6 forbids, and the shape the capacity render (#933), the
 * prior-visit render (#944) and the candidate-set render (#1003) each had to correct at this exact
 * seam. When a further layer is composed, this import moves to it — and the only way to know it
 * moved is to walk the real binary, because the owning package's own suite goes green either way.
 *
 * The body also carries the terminal adapter's CAVEATS (ADR-0260 D7). The closed feature enum can say
 * `event:followed_edge` is emitted; it cannot say why the resulting picture will still be thin — that
 * a `doc:` offer can never be observed as followed, that a follow is recorded only when the agent
 * re-uses the offered form CARRYING the offer id, and that an unanswered offer is indistinguishable
 * from a bypassed mechanism. ADR-0260 D4 forbids repairing any of those gaps by inference, so saying
 * so in the same body is the only mitigation there is.
 */
export function showTraversalSessionAllAdapters(
  sessionId: string,
  opts?: TraversalQueryOptions,
): TraversalRenderEnvelope {
  const { replay, skipped } = composeReplay(sessionId, opts);
  const rendered = renderTraversalSession(replay, { skipped });
  const caveats = renderCoverageCaveats(FOLLOW_OFFER_EDGE_CAVEATS);
  return { ...rendered, body: `${rendered.body}\n\ncoverage-caveats:\n${caveats}` };
}

/**
 * THE one place the installed-adapter coverage composition lives. Both the rendered replay above and
 * the structured view below read it, so a text reader and a UI reader can never be told different
 * things about what these adapters can observe — the drift the file header's `FOLLOW_OFFER_EDGE_COVERAGE`
 * note describes (each composition layer moved this import outward, and only walking the real binary
 * caught it) would otherwise now have TWO places to hide instead of one.
 */
function composeReplay(
  sessionId: string,
  opts: TraversalQueryOptions | undefined,
): { readonly replay: ContextTraversalReplay; readonly skipped: number } {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  return {
    replay: { ...replay, coverage: [FOLLOW_OFFER_EDGE_COVERAGE, BUILD_SPAWN_BOUNDARY_COVERAGE] },
    skipped,
  };
}

/**
 * The `CoverageFeature` naming per-request WINDOW OCCUPANCY — `residentInputTokens`, the one quantity
 * the traversal panel's playhead bar may plot (ADR-0248 D1). Typed as the closed enum, so a rename in
 * the vocabulary fails this to compile rather than silently answering `declared: false` forever.
 */
const OCCUPANCY_FEATURE: CoverageFeature = "field:resident_input_tokens";

/**
 * What this session's trace can say about window OCCUPANCY — a DECLARATION, never a series of zeros.
 *
 * Occupancy is optional on `model_context` and only the host-transcript adapter populates it, which
 * is NOT ambient: it is read by an explicit `storytree traversal ingest <sessionId>` (ADR-0248 D1 —
 * `traversalIngest` in `packages/cli/src/traversal.ts`). So a never-ingested session has no series, and a
 * consumer that filled the gap with zeros would draw a bar reading "empty window" for a session that
 * was never measured — the ADR-0235 clause 4 fabrication the whole vocabulary exists to prevent.
 *
 * {@link declared} is computed from the coverage declarations actually composed above, never asserted
 * here: today no adapter this composition installs claims {@link OCCUPANCY_FEATURE} (the terminal and
 * build-spawn boundaries both omit it, and the host-transcript adapter's `HOST_TRANSCRIPT_COVERAGE` is
 * not yet part of this composition — `traversalIngest` records why it prints that declaration itself). A
 * trace can therefore carry occupancy that no declaration here covers, and `declared: false` beside a
 * non-zero {@link observationCount} is exactly that fact rather than a contradiction to smooth over.
 */
export interface TraversalOccupancy {
  /** How many `model_context` events were observed at all. */
  readonly modelContextCount: number;
  /** How many of them carried `residentInputTokens` — the plottable series' true length. */
  readonly observationCount: number;
  /** Does any coverage declaration on this replay name `field:resident_input_tokens` as supported? */
  readonly declared: boolean;
  /** One line a reader can render verbatim: what was observed, and why absence is absence. */
  readonly note: string;
}

const INGEST_HINT =
  "Absence is unobserved, never zero — run `storytree traversal ingest <sessionId>` to read the host " +
  "transcript's per-request occupancy (ADR-0248 D1).";

function occupancyNote(modelContextCount: number, observationCount: number, declared: boolean): string {
  if (observationCount > 0) {
    const counted = `${observationCount} of ${modelContextCount} model_context observation(s) carry residentInputTokens`;
    return declared
      ? `${counted}.`
      : `${counted}, but no coverage declaration on this replay names ${OCCUPANCY_FEATURE} — the adapter that produced them is not among the declarations here.`;
  }
  if (modelContextCount > 0) {
    return `no occupancy series: ${modelContextCount} model_context observation(s) recorded, none carrying residentInputTokens. ${INGEST_HINT}`;
  }
  return `no occupancy series: no model_context observation was recorded for this session. ${INGEST_HINT}`;
}

/**
 * One session's replay as STRUCTURE rather than text, carrying its own honesty (ADR-0241 D5 /
 * ADR-0235 clause 6): the coverage declarations, the caveats the closed feature enum cannot state,
 * the reader's skipped-line count, and what may be said about occupancy.
 *
 * There is deliberately NO per-lane copy of the events. `ContextTraversalReplay.sessions` is derived
 * by filtering the same list by `sessionId`, and a replay scoped to ONE session has exactly one lane —
 * so serving it would double the payload to restate `events`. A consumer draws a child lane by
 * following a `spawn_handoff`'s `childSessionId` and replaying THAT session, which is the only way the
 * child's own events are reachable at all.
 */
export interface TraversalReplayView {
  /** The session that was ASKED for — not derived from the events, which may be empty. */
  readonly sessionId: string;
  /** Chronological by each event's own `at`, exactly as the trace replays it. */
  readonly events: readonly ContextTraversalEvent[];
  /** Only relationships an explicit id on an event already carried — never adjacency-inferred. */
  readonly relationships: readonly ContextTraversalRelationship[];
  /** Every INSTALLED adapter's capability statement — supported AND omitted, never one side. */
  readonly coverage: readonly ContextTraversalCoverage[];
  /** The gaps the closed feature enum cannot express (ADR-0260 D7). */
  readonly coverageCaveats: readonly CoverageCaveat[];
  /** Lines the tolerant reader could not use — corrupt, truncated, or duplicate-identity. */
  readonly skipped: number;
  /** `skipped > 0`: this replay is honestly PARTIAL and must never render as complete. */
  readonly partial: boolean;
  readonly occupancy: TraversalOccupancy;
}

/**
 * Replay one captured session as STRUCTURE, under the same installed-adapter coverage
 * {@link showTraversalSessionAllAdapters} renders. Reads only — this composition writes nothing.
 *
 * Its consumer is a UI that draws the traversal instead of printing it (the studio's `/api/traversal`
 * read route, `apps/studio/server/traversalApi.ts`). It shares {@link composeReplay} with the text
 * render rather than re-deriving coverage, because a second composition is precisely how a surface
 * ends up declaring an inner layer that denies what its own picture shows.
 *
 * A session with no file replays EMPTY with `skipped: 0` — the caller decides whether that is a 404 or
 * an empty picture; nothing here fabricates one.
 */
export function replayTraversalSessionAllAdapters(
  sessionId: string,
  opts?: TraversalQueryOptions,
): TraversalReplayView {
  const { replay, skipped } = composeReplay(sessionId, opts);

  const modelContext = replay.events.filter(
    (event): event is ModelContextEvent => event.kind === "model_context",
  );
  const modelContextCount = modelContext.length;
  const observationCount = modelContext.filter((event) => event.residentInputTokens !== undefined).length;
  const declared = replay.coverage.some((declaration) => declaration.supported.includes(OCCUPANCY_FEATURE));

  return {
    sessionId,
    events: replay.events,
    relationships: replay.relationships,
    coverage: replay.coverage,
    coverageCaveats: FOLLOW_OFFER_EDGE_CAVEATS,
    skipped,
    partial: skipped > 0,
    occupancy: {
      modelContextCount,
      observationCount,
      declared,
      note: occupancyNote(modelContextCount, observationCount, declared),
    },
  };
}
