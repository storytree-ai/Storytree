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
import fs from "node:fs";
import path from "node:path";

import {
  readTraversalSession,
  renderCoverageCaveats,
  renderTraversalSession,
  resolveTraversalDir,
  AGENT_DESCENT_CAVEATS,
  AGENT_DESCENT_COVERAGE,
} from "@storytree/context-traversal-capture";
import type {
  CoverageCaveat,
  TraversalRenderEnvelope,
  TraversalQueryOptions,
} from "@storytree/context-traversal-capture";
import {
  censusTraversalProvenance,
  describeHarnessIngest,
  HarnessIngestReceipt,
  harnessIngestReceiptFileName,
  PROVENANCE_PRECEDENCE,
} from "@storytree/context-traversal-telemetry";
import type {
  ContextTraversalCoverage,
  ContextTraversalEvent,
  ContextTraversalRelationship,
  ContextTraversalReplay,
  CoverageFeature,
  ModelContextEvent,
  ProvenanceCensus,
  TraversalProvenance,
} from "@storytree/context-traversal-telemetry";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";

/**
 * Replay one captured session declaring the union of every installed adapter's coverage
 * (currently the terminal CLI dispatch adapter and the build spawn boundary adapter). Reads only —
 * this composition writes nothing.
 *
 * The terminal declaration is the OUTERMOST composed constant — now `AGENT_DESCENT_COVERAGE`, which
 * composes `REVISIT_LINK_COVERAGE` → `observe-cli.ts`'s base. Each layer adds what the wired
 * composition genuinely emits: increment 6 added `field:prior_visit_id` (same-node revisits) and
 * increment 11 added `field:parent_visit_id` (an `agents <name>` render's floor-ref descent). This is
 * the one render the CLI actually calls, and declaring an inner layer here printed a field under
 * `omitted` on a trace that visibly carried it — the self-denial ADR-0235 clause 6 forbids, and the
 * shape the capacity render (#933), the prior-visit render (#944) and the candidate-set render
 * (#1003) each had to correct at this exact seam. When a further layer is composed, this import moves
 * to it — and the only way to know it moved is to walk the real binary, because the owning package's
 * own suite goes green either way.
 *
 * ⚠ ADR-0464 D1 moved it INWARD, which no earlier increment had done, so the seam now has a second
 * direction to fail in. Two outer layers were DELETED with the citation-derived offer surface:
 * `OFFER_CANDIDATE_SET_COVERAGE` (`event:candidate_set`, a `library artifact <id>` render's recorded
 * offer) and `FOLLOW_OFFER_EDGE_COVERAGE` (`event:followed_edge` + `field:candidate_follow_causality`,
 * an offer-carrying read declaring the edge it answered). Both kinds are back under `omitted`, which
 * is the truth: nothing writes them any more. Declaring a retired layer here would be the mirror of
 * the old failure — claiming an event the composition cannot produce — and it is the easier mistake to
 * make, because the constant still exists in git history and reads as the more complete one.
 *
 * The body also carries the terminal adapter's CAVEATS (ADR-0235 clause 6). The closed feature enum
 * can say those two kinds are omitted; it cannot say the omission is a DELIBERATE RETIREMENT rather
 * than an unbuilt adapter, nor that recovering the lost offer→follow causality by joining a read to an
 * earlier render is REFUSED rather than merely unimplemented — ADR-0260 D4's refusal outlives the
 * mechanism it was written for. `AGENT_DESCENT_CAVEATS` states both.
 */
export function showTraversalSessionAllAdapters(
  sessionId: string,
  opts?: TraversalQueryOptions,
): TraversalRenderEnvelope {
  const { replay, skipped, identity, slots, provenance } = composeReplay(sessionId, opts);
  const rendered = renderTraversalSession(replay, { skipped, identity, slots });
  const caveats = renderCoverageCaveats(AGENT_DESCENT_CAVEATS);
  return {
    ...rendered,
    // APPENDED, exactly as the caveats are: the chronological event lines above are left as they
    // were, and this is a header-class block that says which RECORDER wrote them. The per-line
    // alternative — tagging each visit — was not taken here because those lines are pinned verbatim
    // by the render's own capability and the block below already names every surface present with
    // its count, which is the reading a consumer actually needs.
    body: `${rendered.body}\n\n${renderProvenance(provenance)}\n\ncoverage-caveats:\n${caveats}`,
  };
}

/**
 * THE one place the installed-adapter coverage composition lives. Both the rendered replay above and
 * the structured view below read it, so a text reader and a UI reader can never be told different
 * things about what these adapters can observe — the drift the file header's `AGENT_DESCENT_COVERAGE`
 * note describes (each composition layer moved this import outward, and only walking the real binary
 * caught it) would otherwise now have TWO places to hide instead of one.
 */
function composeReplay(
  sessionId: string,
  opts: TraversalQueryOptions | undefined,
) {
  const dir = opts?.dir ?? resolveTraversalDir();
  // The identity classification is carried THROUGH rather than recomputed here: it is a property of
  // the bytes the reader walked (`linked-session-context-arc-inc-30`), and this composition widens
  // only which adapters' coverage is declared. Dropping it would leave the one render the CLI
  // actually calls unable to say whether its session id names a context window or a pooled slot —
  // which is the same outward-moving-composition trap the coverage constant above documents.
  const { replay, skipped, identity, slots } = readTraversalSession({ dir, sessionId });
  return {
    replay: { ...replay, coverage: [AGENT_DESCENT_COVERAGE, BUILD_SPAWN_BOUNDARY_COVERAGE] },
    skipped,
    identity,
    slots,
    provenance: composeProvenance(dir, sessionId, replay.events),
  };
}

// ---------------------------------------------------------------------------
// WHICH RECORDER WROTE THIS TRACE — ADR-0484 D5
// ---------------------------------------------------------------------------

/**
 * A trace holds TWO RECORDERS' work and, until this composition said so, nothing on either surface
 * that renders it did.
 *
 * `observeCliInvocation` records our own commands as they run. The harness scraper
 * (`@storytree/context-traversal-transcript`) reads the host's session transcript afterwards and
 * mints its own events into the same file — kept deliberately (ADR-0484 D5), because the transcript
 * is the only witness to what an agent did that was NOT a `storytree` command, and demoted
 * deliberately, because it is a SECONDARY source and must never be presented as the same tier.
 *
 * Both write `surfaceId` onto the same shape, so the two arrive indistinguishable on a render unless
 * something discriminates. `decision-read-coverage.ts` established the discipline before ADR-0464 D1
 * deleted it — it counted the two recorders APART rather than summing them — and this is that
 * discipline pushed out to the surfaces, which is deliverable 1's whole content: the label reaches
 * the point of use, not just the module that produces it.
 *
 * THE CENSUS IS COMPOSED HERE, ONCE, for the same reason the coverage declaration is: the text
 * render and the studio's structured view both read it, so a terminal reader and a panel reader can
 * never be told different things about which tier a trace's readings came from.
 */
export interface TraversalProvenanceView {
  /** The two recorders counted APART. Summing `own` and `harness` is the failure this prevents. */
  readonly census: ProvenanceCensus;
  /** Which tier wins where both saw one act. Carried verbatim, never paraphrased by a consumer. */
  readonly precedence: string;
  /**
   * Whether a harness ingest has ever run over this trace.
   *
   * FALSE IS NOT "NOTHING HAPPENED". Neither harness ingest is ambient and a run that recovers
   * nothing writes nothing, so with no receipt an empty harness census is UNMEASURED rather than
   * zero — the absence-versus-zero distinction the rest of this replay already keeps for capacity,
   * occupancy and skipped lines.
   */
  readonly ingestRan: boolean;
  /** One line a consumer renders verbatim: when each harness adapter last looked, or that none has. */
  readonly ingestNote: string;
}

/**
 * The vocabulary's own name for the surface field, as the shape every event either has or lacks.
 *
 * ONE PROPERTY READ RATHER THAN A KIND LIST, and that is a correction rather than a shortening. The
 * first version narrowed by kind — visit, then `search`, then `candidate_set` — which READ as a
 * runtime rule and was not one: `model_context`, `followed_edge` and the two spawn edges answer
 * `undefined` whichever branch they take, because they simply do not carry the field. The mutation
 * rung is what showed it: every branch in that chain was behaviourally inert, so the code was
 * asserting a distinction it did not make. Widening to the field's own shape says the true thing —
 * an event records a surface or it does not — and cannot fall behind a new event kind that carries
 * one.
 */
type SurfaceBearing = { readonly kind: string; readonly surfaceId?: string | undefined };

/**
 * The surface each event was recorded on, one entry per event — `undefined` where the kind has none.
 *
 * Events carrying no surface are counted by the census as `withoutSurface` rather than dropped, so
 * its total matches the replay's own length.
 */
function surfaceIdsOf(events: readonly ContextTraversalEvent[]): (string | undefined)[] {
  return events.map((event) => {
    const bearing: SurfaceBearing = event;
    return bearing.surfaceId;
  });
}

/**
 * Read this trace's harness ingest RECEIPT.
 *
 * ⚠ THE FILE'S NAME AND SHAPE ARE NOT SPELLED HERE. They come from
 * `@storytree/context-traversal-telemetry`, which is the one package this organism, the harness
 * adapter that WRITES the receipt, and the sink that owns the directory all three depend on. A
 * second spelling on the reading side is exactly how a reader and a writer in different packages
 * drift into two shapes of one file.
 *
 * TOLERANT, and in the safe direction: a missing file and an unreadable one both answer `null`,
 * which renders as never-run — under-claiming measurement rather than letting a corrupt sidecar
 * assert that somebody looked.
 */
function readIngestReceipt(dir: string, sessionId: string): HarnessIngestReceipt | null {
  try {
    // Stryker disable next-line StringLiteral: EQUIVALENT — an unrecognised encoding string is not
    // rejected by the runtime this suite runs on, so `"utf8"` -> `""` reads the same bytes. The
    // literal is kept because it states the intent; nothing observable distinguishes the two.
    const raw = fs.readFileSync(path.join(dir, harnessIngestReceiptFileName(sessionId)), "utf8");
    const parsed = HarnessIngestReceipt.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // ONE catch, not two. The first version split the read from the parse on `ship.ts`'s precedent —
    // but there the two answers DIFFER (a missing cursor is `null`, an unreadable one degrades to the
    // empty cursor), and here they are the same `null`. A split that returns the same answer twice is
    // a branch nothing can observe, which is how it read to the mutation rung.
    return null;
  }
}

function composeProvenance(
  dir: string,
  sessionId: string,
  events: readonly ContextTraversalEvent[],
): TraversalProvenanceView {
  const receipt = readIngestReceipt(dir, sessionId);
  const census = censusTraversalProvenance(surfaceIdsOf(events));
  return {
    census,
    precedence: PROVENANCE_PRECEDENCE,
    ingestRan: receipt !== null && Object.keys(receipt.runs).length > 0,
    // The harness count is handed over so the note can tell an un-ingested trace from one ingested
    // BEFORE receipts were kept — which is every harness-derived event already on disk. Saying
    // "never run" over a trace that visibly carries harness readings would deny an observation the
    // replay is showing.
    ingestNote: describeHarnessIngest(receipt, census.harness),
  };
}

/** The tier label as one line, so the block's header cannot drift between rows. */
function tierLabel(provenance: TraversalProvenance): string {
  if (provenance === "storytree-own") return "storytree-own ";
  if (provenance === "harness-derived") return "HARNESS-DERIVED";
  return "unclassified  ";
}

/**
 * The `provenance:` block, printed UNCONDITIONALLY on every replay.
 *
 * Unconditional for the same reason `REPLAY_PATHWAY_NOTE` is: a block that appeared only when a
 * harness event was present would be absent on exactly the traces a reader is most likely to
 * mistake for complete, and the never-run line — the one that says an empty harness census is
 * unmeasured rather than zero — would then never print at all.
 *
 * Each harness row carries its own SCOPE, which is deliverable 3: `host-transcript-file-read` reads
 * as general file capture and is nothing of the kind, so the narrowness is stated where the count
 * is, not in a module a reader would have to go and find.
 */
function renderProvenance(view: TraversalProvenanceView): string {
  const { census } = view;
  const lines = [
    "provenance: which recorder wrote these observations (ADR-0484 D5)",
    `  ${census.own} from storytree's own log · ${census.harness} harness-derived · ` +
      `${census.unclassified} unclassified · ${census.withoutSurface} carrying no surface — ` +
      `${census.total} observation(s) in total`,
    `  ${view.precedence}.`,
  ];

  if (census.surfaces.length === 0) {
    lines.push("  (no observation here carries a surface, so none can be attributed to a recorder)");
  }
  for (const surface of census.surfaces) {
    lines.push(`  [${tierLabel(surface.provenance)}] ${surface.surfaceId} x${surface.count}`);
    // The scope rides only the tiers a reader can get WRONG. Our own surfaces are one storytree verb
    // apiece and repeating that line twelve times would bury the four rows that matter.
    if (surface.provenance !== "storytree-own") {
      lines.push(`      ${surface.scope}`);
    }
    if (surface.overlaps !== undefined) {
      lines.push(
        `      OVERLAPS ${surface.overlaps}: our own log already recorded this act, so these are two ` +
          "events for one read — count distinct reads by surface, never by summing.",
      );
    }
  }

  lines.push(`  ${view.ingestNote}`);
  return lines.join("\n");
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
  /**
   * WHICH RECORDER THE SERIES CAME FROM, and it is always the harness (ADR-0484 D5).
   *
   * `residentInputTokens` has exactly one producer — the host-transcript adapter's explicit
   * `storytree traversal ingest` — so the plottable series is harness-derived in full, even though
   * {@link modelContextCount} mixes it with our own build-spawn observations, which carry billing
   * totals and no occupancy. Stated as a DECLARATION rather than derived, exactly as
   * {@link declared} is: it is a property of who writes the field, and a replay holding no
   * observation could not tell you.
   */
  readonly seriesProvenance: TraversalProvenance;
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
  "transcript's per-request occupancy (ADR-0248 D1). That series is HARNESS-DERIVED (ADR-0484 D5): " +
  "it is read back out of the host harness's transcript rather than recorded by storytree.";

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
  /**
   * WHICH RECORDER wrote these observations (ADR-0484 D5) — and whether the harness one ever ran.
   *
   * It rides the SAME payload as `skipped` and `occupancy` for the same reason they do: a picture
   * that mixes our own log with a secondary source and does not say so is over-reporting, so the
   * thing that makes it honest is not an optional extra fetch a consumer might skip.
   */
  readonly provenance: TraversalProvenanceView;
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
  const { replay, skipped, provenance } = composeReplay(sessionId, opts);

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
    coverageCaveats: AGENT_DESCENT_CAVEATS,
    skipped,
    partial: skipped > 0,
    occupancy: {
      // The one producer of `residentInputTokens` is the host-transcript adapter, so the series is
      // harness-derived whenever there is one — see the field's own note.
      seriesProvenance: "harness-derived",
      modelContextCount,
      observationCount,
      declared,
      note: occupancyNote(modelContextCount, observationCount, declared),
    },
    provenance,
  };
}
