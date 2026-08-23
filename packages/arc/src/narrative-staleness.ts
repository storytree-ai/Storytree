import type { StoreEvent } from "@storytree/storage-protocol";

import type { ArcRollupIncrement } from "./arc-rollup.js";

/**
 * THE ARC NARRATIVE STALENESS SIGNAL — does an arc's authored prose predate its own landings?
 * (`arc-narrative-staleness-signal` on `session-ambition-arc`, from the friction
 * `arc-narrative-fields-have-no-staleness-signal`.)
 *
 * ## The asymmetry this exists to close
 *
 * An arc has two halves and only one of them can keep itself honest. The increment log is append-only
 * rows whose lifecycle is recomputed mechanically on every write (ADR-0335), and the ADR/story views
 * are derived from child frontmatter stamps — none of those can drift. `intent` and `endState` are
 * free prose with **no producer, no derivation and no reader that could notice**, so they record the
 * world as it stood at chartering time and nothing ever says otherwise.
 *
 * Measured: `arc show chapter2-code-generated-organic-art-arc` on 2026-08-14 rendered an intent
 * pitching custom crown-proxy normals as "the strongest candidate in the whole summary", and listed
 * the increment that BUILT them (PR #1108, 2026-08-03) eleven days earlier in the log immediately
 * below. The arc rendered its own contradiction in one screen and flagged nothing. The cost is not
 * cosmetic: a session — or a `planner` agent — orienting on that arc is told by the arc's own
 * authoritative surface to spend a render on work already done.
 *
 * ## What it claims, and what it refuses to claim
 *
 * It compares DATES, never MEANING. The claim is exactly: *this field was last written on day D, and
 * these increments landed after D* — a mechanical fact with a mechanical refutation. It does not
 * decide that a landing contradicts the prose, because nothing here can read prose; it names the
 * candidates and leaves the reading to the reader. That is the {@link ../cli/src/artifact-history}
 * discipline applied again: report the sizes and the actor, render no verdict, because a signal that
 * cries wolf is one the reader learns to skim past.
 *
 * It also never rewrites prose. The increment is explicit that the instrument "may report rather than
 * rewrite" — a correct-in-place edit is an authoring act (ADR-0139), and a tool that silently
 * re-worded an owner's intent would be a worse defect than the one it fixed.
 *
 * ## Why the ARC DOC'S OWN `updatedAt` IS NOT THE SOURCE
 *
 * The obvious cheap answer — compare `arc.updatedAt` against the landings — is a false-negative
 * machine, and would have been quietly wrong forever. `recomputeArcLifecycle` (`arc.ts`) patches
 * `{ lifecycle, updatedAt }` on the ARC every time an increment write changes the derived lifecycle
 * (ADR-0335). So the very landings this signal is looking for are the events that refresh the stamp
 * it would be reading: the more an arc lands, the fresher its narrative would look. The source is
 * therefore the append-only history (`Store.readEvents`), folded to *the last write whose value for
 * this field DIFFERED from the previous one* — the same fold `library artifact history --field` reads
 * (ADR-0361 D6). `narrative-staleness.test.ts` pins that distinction with a lifecycle-only patch that
 * must NOT refresh the stamp.
 *
 * ## The population is a QUERY, and the edge only points one way
 *
 * The landings compared against are the arc's own increments as {@link deriveArcRollup} derived them
 * — i.e. every increment whose OWN `arcRef` names this arc (ADR-0183 D3 puts every containment edge
 * on the child). Nothing here reads a list authored on the ARC, and there is none to read. That
 * matters because the arc graph's edges genuinely do point one way: a fence lives on the arc that
 * CARES about a block, so a blocked increment can truthfully print "NOTHING BLOCKS THIS" when the
 * fence is recorded elsewhere. A signal built on a reverse edge would inherit exactly that hole. This
 * one cannot: an increment re-homed to another arc leaves this arc's population by the same query
 * that put it there, with no second record to fall out of step.
 *
 * ## How often it fires — measured, and why there is no lifecycle filter
 *
 * Swept over all 91 live arcs on 2026-08-22, the day this landed. On the population that matters —
 * the ACTIVE worklist a session orients on — it fires on **2 of 12**: 6 arcs come back explicitly
 * current and 4 have no landings to be stale against. So it DISCRIMINATES; a signal that fired on
 * everything would be a banner, and one that fired on nothing would be the repo's commonest fault.
 * The two it names are the long-running multi-increment arcs the friction predicted would rot
 * (`linked-session-context-arc`, 24 of 26 landings unseen; `uat-journey-surgery-arc`, 53 of 55).
 *
 * CLOSED arcs fire at 56 of 76 and PARKED at 3 of 3, and neither is filtered out. A lifecycle filter
 * was considered and declined: ADR-0239 D3 already has `arc show` render any arc and say which it
 * is, a parked arc is precisely one that gets picked back up (the friction's own case was parked),
 * and a closed arc's prose is exactly what later gets quoted as history. Suppressing there would be
 * a rule with nothing behind it.
 *
 * ## Clockless, and per-arc by design
 *
 * Nothing here reads a clock: both sides of the comparison are stored timestamps, so unlike
 * `questionStalenessLine` this needs no `nowIso` and no injection to be deterministic. It is
 * deliberately NOT part of {@link deriveArcRollup}: the rollup's inputs are three whole-kind queries
 * shared across every arc, and folding an event read into it would make `loadArcRollups` (and so
 * `GET /api/arcs`) pay one history read PER ARC. `arcShow` reads the one arc's events and calls this;
 * the list surfaces do not compute it at all, which is a stated boundary rather than an oversight.
 */

/** The authored narrative fields of an arc — the two with no producer to keep them honest. */
export const NARRATIVE_FIELDS = ["intent", "endState"] as const;

export type NarrativeField = (typeof NARRATIVE_FIELDS)[number];

/** How each field is spelled to a reader (`endState` is the schema key, not the English). */
const FIELD_LABEL = { intent: "intent", endState: "end state" } as const satisfies Record<NarrativeField, string>;

/** One landing recorded after the narrative was last written — a candidate the prose has not seen. */
export interface UnseenLanding {
  readonly id: string;
  readonly title: string;
  /** The authored landing date (`outcome.date`, `YYYY-MM-DD`) — always set by `increment close`. */
  readonly date: string;
  /** The landing ref when the closure carried one; absent for a closure explained by `--note`. */
  readonly pr?: string;
}

/** One narrative field's verdict. */
export interface NarrativeFieldStaleness {
  readonly field: NarrativeField;
  /**
   * The `at` of the write that last CHANGED this field's value. `undefined` means the history could
   * not say — a store with no events for this arc, never "it is current".
   */
  readonly lastWrittenAt?: string;
  /** Landings strictly after {@link lastWrittenAt}'s DAY, newest first. Empty when up to date. */
  readonly unseen: readonly UnseenLanding[];
}

/** The whole signal for one arc. */
export interface ArcNarrativeStaleness {
  /**
   * One entry per narrative field the arc actually carries, in {@link NARRATIVE_FIELDS} order. A
   * field the arc leaves empty is omitted: there is no prose to have gone stale.
   */
  readonly fields: readonly NarrativeFieldStaleness[];
  /** Every closed increment on the arc, newest first — the population the fields are compared against. */
  readonly landings: readonly UnseenLanding[];
  /**
   * Closed increments carrying no `outcome.date`, by id. They cannot enter the comparison, so they
   * are NAMED rather than dropped (ADR-0095's no-silent-caps rule): a landing excluded in silence is
   * indistinguishable from one that was checked and cleared.
   */
  readonly undatedLandings: readonly string[];
  /** At least one field has an unseen landing — the report fires. */
  readonly stale: boolean;
  /**
   * There are landings to compare against, but NO field could be dated at all. The honest third
   * state: unknown is not fresh, and a surface that rendered nothing here would say "fresh" by
   * omission.
   */
  readonly undatable: boolean;
}

/** A string field off an untyped event doc; `undefined` when absent or non-string. */
function stringField(doc: unknown, field: string): string | undefined {
  if (typeof doc !== "object" || doc === null) return undefined;
  const v = (doc as Record<string, unknown>)[field];
  return typeof v === "string" ? v : undefined;
}

/**
 * PURE: when `field` last CHANGED value across this doc's history, or `null` when the history holds
 * no event at all.
 *
 * "Changed" includes first appearance and disappearance — a field that goes absent has been written
 * to as much as one that was re-worded. A write that left the value byte-identical (a lifecycle
 * recompute, a sibling's patch of some other key) is NOT a change and does not refresh the stamp;
 * that is the entire point, see the module header.
 *
 * Events are sorted by `seq` here rather than trusted: `readEvents`' ordering is a backend detail,
 * and a fold that silently depended on it would be a parity trap the seam's own suite need not catch.
 */
export function narrativeLastChangedAt(events: readonly StoreEvent[], field: string): string | null {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let previous: string | undefined;
  let seen = false;
  let at: string | null = null;
  for (const e of ordered) {
    const value = stringField(e.doc, field);
    if (!seen || value !== previous) at = e.at;
    previous = value;
    seen = true;
  }
  return at;
}

/** `YYYY-MM-DD` from an ISO timestamp or a bare date — the granularity both sides share. */
function day(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The closed increments split by whether a landing DATE could be read off them — the two halves
 * every staleness verdict below is computed from.
 */
interface ArcLandings {
  /** Landings carrying a readable date, newest first. */
  dated: UnseenLanding[];
  /** Increment ids that closed with no datable field at all — the honest third answer. */
  undated: string[];
}

/** The closed increments, newest first, as landing rows. */
function landingsOf(increments: readonly ArcRollupIncrement[]): ArcLandings {
  const dated: UnseenLanding[] = [];
  const undated: string[] = [];
  for (const i of increments) {
    // `closed` is the ONLY terminal status (ADR-0305 D2 collapsed the lifecycle to
    // proposal → ready → active → closed), so a landing is exactly a closed row. Forward-looking
    // entries are intentions and can never be something the prose failed to notice.
    if (i.status !== "closed") continue;
    const date = i.outcome?.date;
    if (date === undefined || date === "") {
      undated.push(i.id);
      continue;
    }
    dated.push(
      i.outcome?.pr !== undefined && i.outcome.pr !== ""
        ? { id: i.id, title: i.title, date: day(date), pr: i.outcome.pr }
        : { id: i.id, title: i.title, date: day(date) },
    );
  }
  dated.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
  undated.sort();
  return { dated, undated };
}

/**
 * PURE: the staleness signal for one arc, from its own write history and its own increment log.
 *
 * ## The comparison is at DAY granularity, and the same day is quiet
 *
 * A landing carries an authored `YYYY-MM-DD` (`increment close`'s `--date`, defaulted to the closing
 * day); a narrative write carries a full ISO instant. There is no honest way to order two events
 * inside the same day across those, so `>` on the day string is the comparison and a landing recorded
 * on the very day the prose was written does NOT fire. That is the conservative direction on purpose:
 * on the same day the prose plausibly already accounts for the landing, and a signal whose first
 * impression is a false positive is one the next reader disables.
 */
export function deriveArcNarrativeStaleness(input: {
  readonly intent: string;
  readonly endState: string;
  readonly increments: readonly ArcRollupIncrement[];
  readonly events: readonly StoreEvent[];
}): ArcNarrativeStaleness {
  const { dated, undated } = landingsOf(input.increments);
  const fields: NarrativeFieldStaleness[] = [];
  for (const field of NARRATIVE_FIELDS) {
    const prose = field === "intent" ? input.intent : input.endState;
    if (prose.trim() === "") continue;
    const lastWrittenAt = narrativeLastChangedAt(input.events, field);
    const unseen = lastWrittenAt === null ? [] : dated.filter((l) => l.date > day(lastWrittenAt));
    fields.push(lastWrittenAt !== null ? { field, lastWrittenAt, unseen } : { field, unseen });
  }
  const datable = fields.filter((f) => f.lastWrittenAt !== undefined);
  return {
    fields,
    landings: dated,
    undatedLandings: undated,
    stale: fields.some((f) => f.unseen.length > 0),
    // "Undatable" is only a claim worth making when there is something to be stale AGAINST. An arc
    // with no landings at all is neither stale nor unknown — it is simply young, and saying anything
    // there would train the reader to ignore the block.
    undatable: fields.length > 0 && datable.length === 0 && (dated.length > 0 || undated.length > 0),
  };
}

/** How many landings are named inline before the block defers to the log below it. */
export const NAMED_LANDING_CAP = 5;

/**
 * PURE: the `arc show` block — `[]` when there is nothing honest to say.
 *
 * It renders BEFORE the prose, not after. The friction's whole shape is that the intent was
 * "confident and specific enough to be believed", so a caveat printed underneath it arrives after the
 * reader has already formed the belief. `arcId` is carried only to spell the correct-in-place command
 * a reader will want next.
 *
 * `noLog` is the caller's `--no-log`, and it changes exactly one sentence: the overflow line points a
 * reader at "the increment log below", which under `--no-log` is collapsed to a single summary line
 * and does NOT carry them. Pointing at a list that is not on screen is the small dishonesty this
 * block exists to stop, one tier down.
 */
export function renderNarrativeStaleness(
  s: ArcNarrativeStaleness,
  arcId: string,
  opts: { readonly noLog?: boolean } = {},
): string[] {
  if (s.undatable) {
    const landings = s.landings.length + s.undatedLandings.length;
    return [
      `⚠ NARRATIVE FRESHNESS UNKNOWN — this arc has ${landings} landing${landings === 1 ? "" : "s"} on its increment log,`,
      "  but its write history holds no record of when the prose was last written, so whether the prose",
      "  predates them could not be established. UNKNOWN IS NOT FRESH — read the log before trusting it" +
        (opts.noLog === true ? " (drop --no-log to see it)." : "."),
      "",
    ];
  }
  if (!s.stale) return [];

  const lines: string[] = [
    "⚠ NARRATIVE STALENESS — the prose below was last written BEFORE landings on this arc's own log.",
  ];
  // The two fields' unseen sets OVERLAP almost always — whichever prose was written later has a
  // subset of the other's landings — so rendering both in full repeats up to five identical rows on
  // the surface whose SIZE is already a measured cost (the reason `--no-log` exists). A field whose
  // landings are entirely among ones already named says so in one line and points at that list.
  // Naming the count is what keeps this a narrowing rather than a silent drop: the reader still
  // learns that this field is stale and by how much.
  const covered = new Set<string>();
  let coveredBy: { field: NarrativeField; count: number } | undefined;
  for (const f of s.fields) {
    if (f.unseen.length === 0) continue;
    const n = f.unseen.length;
    const written = day(f.lastWrittenAt ?? "");
    const lead = `  ${FIELD_LABEL[f.field]}: last written ${written} — ${n} increment${n === 1 ? "" : "s"} landed since`;
    if (coveredBy !== undefined && f.unseen.every((l) => covered.has(l.id))) {
      // "among the intent's 24 above" refers to the COUNTED set, not to the five rows printed — the
      // overflow line under that set already says where the rest are.
      lines.push(`${lead}, all of them within the ${FIELD_LABEL[coveredBy.field]}'s ${coveredBy.count} above.`);
      continue;
    }
    lines.push(`${lead}:`);
    coveredBy ??= { field: f.field, count: n };
    for (const l of f.unseen) covered.add(l.id);
    for (const l of f.unseen.slice(0, NAMED_LANDING_CAP)) {
      // The SAME row shape the increment log below uses (`date  pr  id  — title`), deliberately: a
      // reader scanning both blocks on one screen is matching rows between them, and two spellings
      // of one landing is friction for nothing.
      lines.push(`    - ${l.date}${l.pr === undefined ? "" : `  ${l.pr}`}  ${l.id}  — ${l.title}`.trimEnd());
    }
    // Never a silent cap (ADR-0095): the overflow says how many it did not name and where they are.
    if (n > NAMED_LANDING_CAP) {
      lines.push(
        `    … and ${n - NAMED_LANDING_CAP} more — ` +
          (opts.noLog === true
            ? "drop --no-log to read the full increment log below."
            : "every landing is in the increment log below."),
      );
    }
  }
  if (s.undatedLandings.length > 0) {
    lines.push(
      `  not compared (closed with no date): ${s.undatedLandings.join(", ")} — they may be newer than the prose too.`,
    );
  }
  lines.push(
    "  This compares DATES, not meaning: a named landing may well be consistent with the prose. Read them",
    "  against each other, then correct the prose in place if it no longer holds (ADR-0139):",
    `    storytree arc edit ${arcId} --intent @intent.txt --end-state @end-state.txt --pg`,
    "",
  );
  return lines;
}
