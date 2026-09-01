/**
 * WHICH RECORDER WROTE AN OBSERVATION, AND THEREFORE WHICH TIER OF EVIDENCE IT IS — ADR-0484 D5,
 * story `context-traversal-telemetry`, capability `traversal-event-vocabulary`.
 *
 * ## WHY THIS IS A DECLARATION RATHER THAN A CONVENTION
 *
 * Two recorders write into one trace and they are NOT the same tier.
 *
 *   - **storytree's own log** — `observeCliInvocation` runs INSIDE our own CLI process and records a
 *     read as the command runs. Ours, synchronous with the act, and authoritative.
 *   - **the harness transcript scraper** — `packages/context-traversal-transcript` reads the host
 *     harness's own session transcript AFTERWARDS and mints events from what it can recover there.
 *     It is kept deliberately (ADR-0484 D5) because the transcript is the only witness to what an
 *     agent did that was NOT a `storytree` command — but it is a SECONDARY source and must never be
 *     presented as the same tier as the log above.
 *
 * Both write `surfaceId` onto the same event shape, into the same session file, replayed by the same
 * reader. So on every surface that renders a trace the two arrive INDISTINGUISHABLE unless something
 * says otherwise, and until this module existed nothing did: the tier was recoverable only by knowing
 * that a surface id beginning `host-transcript-` came from the scraper, i.e. by reading its source.
 * ADR-0484 D5's requirement is the opposite — the label reaches the POINT OF USE.
 *
 * ## AND THE SCRAPER'S NARROWNESS IS THE HALF A READER GETS WRONG
 *
 * It mints three tool-shaped surfaces (`-file-read`, `-grep`, `-shell`) and one CLI-shaped one, which
 * reads like general tool capture. It is not, and never has been: every one of them is *an agent
 * opening a DECISION RECORD*, four different ways. A source file read, a gate run, a story spec —
 * never captured, by construction. Anyone counting `host-transcript-file-read` as "files the agent
 * read" is wrong by construction, so each row below carries its own {@link SurfaceProvenance.scope}
 * and the render prints it where the count is printed.
 *
 * ## THE OVERLAP IS DECLARED, NOT HIDDEN — AND IT IS ONE ROW, NOT FOUR
 *
 * `observeCliInvocation` sees `storytree library artifact adr-NNNN`, because a decision is an
 * ordinary artifact; the scraper reads that SAME invocation back out of the transcript and mints its
 * own event. Those are two events for one act, so `host-transcript-cli-read` names
 * {@link SurfaceProvenance.overlaps} and a consumer counting DISTINCT reads discriminates on surface.
 * The other three overlap NOTHING — they recover a `docs/decisions/…` file read our own observer has
 * never been able to see — which is precisely where the secondary source earns its keep. Stating the
 * overlap per row rather than for the tier is what keeps "ours wins" from reading as "theirs is
 * redundant".
 *
 * ## PURE, TOTAL, AND UNKNOWN IS ITS OWN ANSWER
 *
 * No I/O and no clock: this is a table plus a fold over surface ids. {@link traversalProvenanceOf} is
 * TOTAL and answers {@link UNCLASSIFIED_SURFACE} for an id it does not know — never `storytree-own`.
 * That direction is deliberate and is the same absence-vs-zero rule the rest of this vocabulary
 * keeps: a surface minted by an adapter nobody classified must read as unclassified, because the
 * failure this whole module exists to prevent is a secondary reading presented as a primary one.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// The tier
// ---------------------------------------------------------------------------

/**
 * Which recorder an observation came from.
 *
 * `unclassified` is a first-class answer, not an error state: a surface this table does not name is
 * one nobody has told a reader how to weigh, and saying so is strictly better than defaulting it into
 * either tier. It is what a new adapter's surface reads as until it is declared here.
 */
export type TraversalProvenance = "storytree-own" | "harness-derived" | "unclassified";

/** What one surface is, in the two terms a reader needs before trusting a count taken over it. */
export interface SurfaceProvenance {
  readonly surfaceId: string;
  readonly provenance: TraversalProvenance;
  /** WHO wrote it and WHEN relative to the act — the sentence that makes the tier legible. */
  readonly recorder: string;
  /** What this surface can observe AT ALL. The narrowness clause (ADR-0484 D5 deliverable 3). */
  readonly scope: string;
  /**
   * The storytree-own surface that records the SAME act, when one does.
   *
   * Absent means this surface answers where our own log cannot, which is the opposite claim and must
   * not be collapsed with it — see the header.
   */
  readonly overlaps?: string;
}

/**
 * The one sentence every surface that renders a mixed trace must be able to print (ADR-0484 D5).
 *
 * It states the PRECEDENCE, not a preference: where both recorders saw one act, the storytree log is
 * the record and the harness event is a second sighting of it.
 */
export const PROVENANCE_PRECEDENCE =
  "the storytree log is authoritative wherever both recorded the same act; a harness-derived reading " +
  "is a SECONDARY source, kept for what we cannot record ourselves and never counted as our own";

/** The answer for a surface id this table does not name. Its own row, so callers get one shape. */
export const UNCLASSIFIED_SURFACE: SurfaceProvenance = {
  surfaceId: "",
  provenance: "unclassified",
  recorder: "unknown — no adapter has declared this surface's recorder",
  scope:
    "unknown: this surface is not in the provenance table, so nothing here says which recorder wrote " +
    "it or what it can observe. Weigh it as neither tier until its adapter declares it.",
};

// ---------------------------------------------------------------------------
// storytree's own surfaces — the live CLI observer
// ---------------------------------------------------------------------------

/**
 * The recorder sentence shared by every own surface. One string rather than twelve: they differ in
 * WHICH verb they observe, not in who recorded them or when.
 */
const OWN_RECORDER =
  "storytree's own CLI, recorded by `observeCliInvocation` in our own process as the command ran";

const OWN_SCOPE =
  "one `storytree` read verb, recorded at the moment it ran — the argv shape IS the observation, so " +
  "no text matching and no after-the-fact recovery is involved";

/**
 * Every surface id the live observer mints (`CLI_READ_VERBS` and the `agents` descent, both in
 * `@storytree/context-traversal-capture`).
 *
 * ⚠ THIS LIST IS A SECOND SPELLING OF THOSE IDS AND CANNOT IMPORT THE FIRST — this package is the
 * root the capture organism depends on, so the edge only runs the other way. The drift that buys is
 * held where BOTH are visible: `replay-adapters.test.ts` in `@storytree/context-traversal-spawn`
 * asserts every `CLI_READ_VERBS` surface classifies `storytree-own` here, so a surface added there
 * and not here reds rather than quietly reading as unclassified.
 */
const OWN_SURFACE_IDS = [
  "library-dashboard",
  "library-artifact",
  "library-search",
  "library-query",
  "library-tree-focus",
  "library-inbound",
  "tree",
  "agents",
  "arc",
  "adr",
  "open-question",
  "increment",
  "friction",
] as const;

// ---------------------------------------------------------------------------
// the harness transcript scraper's surfaces
// ---------------------------------------------------------------------------

const HARNESS_RECORDER =
  "the host harness's own session transcript, read back AFTERWARDS by `storytree traversal ingest` " +
  "— never ambient, so a trace is only as current as the last ingest";

/**
 * The four scraper surfaces, each with the narrowness a reader would otherwise get wrong.
 *
 * ⚠ SPELLED HERE AND MINTED IN `DECISION_READ_SURFACES`
 * (`@storytree/context-traversal-transcript`), for the same root-package reason as
 * {@link OWN_SURFACE_IDS}. The drift is held in `ingest-decision-reads.test.ts`, which asserts every
 * surface that ingest mints classifies `harness-derived` here.
 */
const HARNESS_SURFACES: readonly SurfaceProvenance[] = [
  {
    surfaceId: "host-transcript-file-read",
    provenance: "harness-derived",
    recorder: HARNESS_RECORDER,
    scope:
      "a DECISION RECORD opened with the harness's file tool, and NOTHING ELSE — not general file " +
      "capture. `docs/decisions/` was deleted whole (ADR-0403 dec 1), so this surface is historical " +
      "recovery and can only be empty for anything since.",
  },
  {
    surfaceId: "host-transcript-grep",
    provenance: "harness-derived",
    recorder: HARNESS_RECORDER,
    scope:
      "a DECISION RECORD named as the exact path of a harness grep. A grep over a directory names no " +
      "file and is invisible here. Historical, for the same reason as the file read.",
  },
  {
    surfaceId: "host-transcript-shell",
    provenance: "harness-derived",
    recorder: HARNESS_RECORDER,
    scope:
      "a DECISION RECORD path scraped out of an opaque shell command that led with a read verb. " +
      "Deliberately conservative, so it under-reports; historical, as above.",
  },
  {
    surfaceId: "host-transcript-cli-read",
    provenance: "harness-derived",
    recorder: HARNESS_RECORDER,
    scope:
      "a `storytree` read verb naming a decision, scraped from a shell command — the only shape a " +
      "post-`docs/decisions/` session can produce, and the one surface here that DUPLICATES an act " +
      "our own log already recorded.",
    overlaps: "library-artifact",
  },
];

/**
 * Every surface any adapter mints today, keyed by id. Both tiers in ONE table on purpose: the
 * question a reader asks is "which tier is this?", and a table holding only one tier can only ever
 * answer half of it.
 */
export const TRAVERSAL_SURFACE_PROVENANCE: Readonly<Record<string, SurfaceProvenance>> =
  Object.freeze({
    ...Object.fromEntries(
      OWN_SURFACE_IDS.map((surfaceId) => [
        surfaceId,
        { surfaceId, provenance: "storytree-own", recorder: OWN_RECORDER, scope: OWN_SCOPE },
      ]),
    ),
    ...Object.fromEntries(HARNESS_SURFACES.map((row) => [row.surfaceId, row])),
  } satisfies Record<string, SurfaceProvenance>);

/**
 * TOTAL: what a surface id is, or {@link UNCLASSIFIED_SURFACE} carrying the id it was asked about.
 *
 * An absent id (an event kind that carries no surface at all) is unclassified too, and deliberately
 * not a separate throw: a caller folding a mixed event list must be able to ask about every event.
 */
export function traversalProvenanceOf(surfaceId: string | undefined): SurfaceProvenance {
  if (surfaceId === undefined) return UNCLASSIFIED_SURFACE;
  const row = TRAVERSAL_SURFACE_PROVENANCE[surfaceId];
  if (row !== undefined) return row;
  return { ...UNCLASSIFIED_SURFACE, surfaceId };
}

// ---------------------------------------------------------------------------
// the census a surface renders
// ---------------------------------------------------------------------------

/** One surface actually present in a trace, with the count and the narrowness that qualifies it. */
export interface ProvenanceSurfaceCount {
  readonly surfaceId: string;
  readonly count: number;
  readonly provenance: TraversalProvenance;
  readonly scope: string;
  readonly overlaps: string | undefined;
}

/**
 * What one trace holds, by recorder — the shape every surface renders the label from.
 *
 * {@link withoutSurface} is carried rather than dropped so the three counts are an HONEST
 * denominator: `model_context` and the spawn edges carry no `surfaceId` at all, so a census that
 * silently excluded them would report a total smaller than the replay visibly shows. Occupancy in
 * particular is harness-derived and cannot be said so here — it is stated on its own declaration,
 * where the reader who cares about it is already looking.
 */
export interface ProvenanceCensus {
  /** Every observation folded, including the ones carrying no surface. */
  readonly total: number;
  readonly own: number;
  readonly harness: number;
  readonly unclassified: number;
  readonly withoutSurface: number;
  /** Only the surfaces actually PRESENT, most-frequent first then by id. Never the whole table. */
  readonly surfaces: readonly ProvenanceSurfaceCount[];
}

/**
 * Fold a trace's surface ids into a census. PURE, and it counts what it was given: an `undefined`
 * entry is a real observation carrying no surface, never a hole to skip.
 *
 * NO EMPTY-INPUT SHORTCUT, deliberately. One stood here and returned a frozen zero census; the loop
 * below produces exactly that for an empty list, so the branch was an optimisation dressed as a
 * rule, and the mutation rung is what named it — nothing could observe it being taken or not.
 */
export function censusTraversalProvenance(
  surfaceIds: readonly (string | undefined)[],
): ProvenanceCensus {
  const counts = new Map<string, number>();
  let own = 0;
  let harness = 0;
  let unclassified = 0;
  let withoutSurface = 0;

  for (const surfaceId of surfaceIds) {
    if (surfaceId === undefined) {
      withoutSurface += 1;
      continue;
    }
    counts.set(surfaceId, (counts.get(surfaceId) ?? 0) + 1);
    const row = traversalProvenanceOf(surfaceId);
    if (row.provenance === "storytree-own") own += 1;
    else if (row.provenance === "harness-derived") harness += 1;
    else unclassified += 1;
  }

  const surfaces: ProvenanceSurfaceCount[] = [...counts.entries()]
    .map(([surfaceId, count]) => {
      const row = traversalProvenanceOf(surfaceId);
      return {
        surfaceId,
        count,
        provenance: row.provenance,
        scope: row.scope,
        overlaps: row.overlaps,
      };
    })
    .sort((a, b) => b.count - a.count || a.surfaceId.localeCompare(b.surfaceId));

  return { total: surfaceIds.length, own, harness, unclassified, withoutSurface, surfaces };
}

// ---------------------------------------------------------------------------
// did the harness ingest actually run? (ADR-0484 D5 deliverable 4)
// ---------------------------------------------------------------------------

/**
 * The two harness ingests, named apart because they observe genuinely different things at one
 * boundary: one reads `usage` off assistant lines, the other reads `tool_use` blocks. The ids match
 * the `adapterId` each already declares in its own `ContextTraversalCoverage`.
 */
export const HARNESS_INGEST_ADAPTERS = [
  "host-transcript-occupancy",
  "host-transcript-decision-read",
] as const;
export type HarnessIngestAdapter = (typeof HARNESS_INGEST_ADAPTERS)[number];

/** One adapter's last run over one session. */
export const HarnessIngestRun = z
  .object({
    /** When it last ran, ISO-8601, carried from the caller — this module owns no clock. */
    at: z.string().min(1),
    /** What it recovered for this session that run. Zero is a MEASURED zero, which is the point. */
    observed: z.number().int().nonnegative(),
    /** What it appended — below `observed` on a re-ingest, which is the idempotence property. */
    appended: z.number().int().nonnegative(),
  })
  .strict();
export type HarnessIngestRun = z.infer<typeof HarnessIngestRun>;

/**
 * THE RECEIPT: whether a harness ingest has ever run for one session, and what it found.
 *
 * IT EXISTS BECAUSE A TRACE CANNOT ANSWER THIS ABOUT ITSELF. Neither ingest is ambient — both need an
 * explicit `storytree traversal ingest`, and a run that recovers nothing writes nothing — so a trace
 * carrying no harness-derived event is EXACTLY as consistent with "this session read no decision" as
 * with "nobody ever looked". Those are the two answers this codebase refuses to let print the same
 * way everywhere else, and the replay was printing them the same way here.
 *
 * `runs` is an open record rather than a closed one over {@link HARNESS_INGEST_ADAPTERS} so a receipt
 * written by a LATER adapter still parses on an older reader: a receipt is a compatibility record,
 * and refusing to read one because it names an adapter you have not heard of loses the whole file to
 * learn nothing.
 */
export const HarnessIngestReceipt = z
  .object({
    runs: z.record(z.string(), HarnessIngestRun),
  })
  .strict();
export type HarnessIngestReceipt = z.infer<typeof HarnessIngestReceipt>;

/** The receipt sits BESIDE the trace, on the `.ship.json` cursor's precedent. */
export const HARNESS_INGEST_RECEIPT_EXT = ".ingest.json";

/** `<sessionId>.ingest.json` — the ONE spelling, so the writer and the reader cannot disagree. */
export function harnessIngestReceiptFileName(sessionId: string): string {
  return `${sessionId}${HARNESS_INGEST_RECEIPT_EXT}`;
}

/**
 * Merge one run into a receipt. PURE — the caller supplies the clock and does the writing.
 *
 * Last run WINS per adapter rather than accumulating a history: the question is "has this been
 * looked at, and what did the last look find", and a growing log beside every trace would be a second
 * durable record nobody asked for.
 */
export function mergeHarnessIngestRun(
  receipt: HarnessIngestReceipt | null,
  adapter: HarnessIngestAdapter,
  run: HarnessIngestRun,
): HarnessIngestReceipt {
  return { runs: { ...(receipt?.runs ?? {}), [adapter]: run } };
}

/**
 * The line a surface prints VERBATIM.
 *
 * THREE ANSWERS, NOT TWO, and the third is the one a receipt-shaped design gets wrong. A trace with
 * no receipt is usually one nobody ever ingested — but it may also be one ingested BEFORE receipts
 * were kept, which is every harness-derived event already on disk. Printing "never run" over a trace
 * that visibly carries harness readings would deny an observation the replay is showing, which is the
 * ADR-0235 clause 6 self-denial this codebase refuses; printing "measured" would date a look that was
 * never recorded. So the honest third answer says the readings are there and their last look cannot
 * be dated.
 *
 * @param harnessObservations how many harness-derived observations the trace actually holds. Zero is
 *   the ordinary case and the parameter is optional so a caller that has not counted still gets the
 *   never-run reading, which is the conservative one.
 */
export function describeHarnessIngest(
  receipt: HarnessIngestReceipt | null,
  harnessObservations = 0,
): string {
  const runs = receipt?.runs ?? {};
  const ran = HARNESS_INGEST_ADAPTERS.filter((adapter) => runs[adapter] !== undefined);

  if (ran.length === 0) {
    if (harnessObservations > 0) {
      return (
        `harness ingest: NO RECEIPT, but this trace holds ${harnessObservations} harness-derived ` +
        "reading(s) — it was ingested before receipts were kept, so WHEN it was last looked at cannot " +
        "be dated. Re-running `storytree traversal ingest <sessionId>` is what dates it."
      );
    }
    return (
      "harness ingest: NEVER RUN for this session — so the absence of any harness-derived reading " +
      "above is UNMEASURED, not zero. `storytree traversal ingest <sessionId>` is what measures it."
    );
  }

  const parts = HARNESS_INGEST_ADAPTERS.map((adapter) => {
    const run = runs[adapter];
    if (run === undefined) return `${adapter} never run`;
    return `${adapter} last ran ${run.at} (observed ${run.observed}, appended ${run.appended})`;
  });
  return `harness ingest: ${parts.join("; ")}.`;
}
