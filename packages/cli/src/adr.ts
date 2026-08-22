import { extractAdrTitle, loadTitledAdrMetasFromStore, type AdrMeta, type AdrStatus, type TitledAdrMeta } from "@storytree/drive";
import type { Store } from "@storytree/storage-protocol";

import { defaultCliActor } from "./cli-actor.js";

import { adrPull, adrPush, type AdrRoundTripDeps } from "./adr-round-trip.js";
import type { Envelope } from "./envelope.js";

/**
 * `storytree adr new` (ADR-0050): allocate the next ADR number ATOMICALLY from the live store and
 * write the decision as the `adr-NNNN` row (ADR-0403 dec 1), so two parallel sessions can never pick
 * the same number (the recurring collision). The DB allocator is the proactive prevention;
 * `check:adr-health` is the backstop that makes any slip un-mergeable.
 *
 *   storytree adr new --title "..." [--supersedes 42] [--amends 42,43] --pg
 *   storytree adr next --pg                          reserve a number only (author the decision later)
 *
 * BOTH VERBS REQUIRE --pg, and there is no offline path left. The old `max-on-disk + 1` fallback read
 * `docs/decisions/`, which no longer exists; it is deliberately NOT replaced by a store-backed
 * equivalent, because a session that cannot reach the store cannot write the decision either, and a
 * number reserved but never written is a number burned for nothing.
 */

/** The store seam — `PgAdrStore.allocate` when --pg; null offline. */
export interface AdrAllocatorLike {
  allocate(a: {
    localMax: number;
    slug: string;
    branch: string;
    actor: string;
  }): Promise<{ number: number }>;
}

export interface AdrCommandDeps {
  /** The live allocator; null when this invocation is read-only (no --pg). */
  allocator: AdrAllocatorLike | null;
  /** The git branch the allocation is recorded against (audit only); best-effort. */
  branch: string;
  /** Recorded as the allocation `actor`. */
  actor: string;
  /** Today as `YYYY-MM-DD` — the `decided:` date of an owner-directed scaffold (injected; ADR-0110). */
  today: string;
  /**
   * The store-backed half (ADR-0403 dec 9): what `adr pull` / `adr push` need. OPTIONAL, because
   * every other subcommand here reads `docs/decisions` off disk and must keep working with no
   * connection at all — `adr list` / `next` are on the session-start orientation path.
   */
  roundTrip?: AdrRoundTripDeps | undefined;
}

export interface AdrCommandOpts {
  /**
   * The decision NUMBER a round-trip subcommand names (`adr pull 403`) — the third positional,
   * threaded through opts rather than added as a parameter so every existing caller is untouched.
   */
  number?: string | undefined;
  /** `--out <path>`: where `adr pull` writes the document. REQUIRED there; there is no stdout form. */
  out?: string | undefined;
  /** `--file <path>`: the edited document `adr push` reads back. */
  file?: string | undefined;
  title?: string | undefined;
  supersedes?: string | undefined;
  amends?: string | undefined;
  /**
   * `--decided` (ADR-0110): the owner DIRECTED this decision in conversation, so scaffold it born
   * `accepted` + `decided: <today>` instead of `proposed` — design-time alignment IS ratification, no
   * second end-of-flow ask. Absent = the born-`proposed` default for a still-thinking ADR (ADR-0050).
   */
  decided?: boolean | undefined;
  /**
   * `--arc <id>` (ADR-0183 D3): the Library `arc` artifact this decision was produced under.
   * Stamped into the scaffold's frontmatter at creation and immutable thereafter — provenance,
   * never authority. The arc's ADR view is derived from these child stamps (`storytree arc show`).
   */
  arc?: string | undefined;
  /** `adr list` filters (ADR-0086). */
  current?: boolean | undefined;
  loadBearing?: boolean | undefined;
  status?: string | undefined;
}

// PURE: kebab-case slug from a title, capped so filenames stay sane. Defined in `@storytree/library`
// since `arc-tier-extraction-arc` moved the arc verbs out of this package — `arc new` and
// `question new` derive their ids with the same function `adr new` derives a filename slug with, and
// they no longer share a building. Re-exported here so every existing `./adr.js` importer is
// unchanged.
import { adrDocId, kebabSlug } from "@storytree/library";
export { kebabSlug };

/*
 * `maxAdrNumber` stood here: a `readdirSync` of `docs/decisions` behind the offline `max + 1`
 * allocation fallback. It went with the directory (ADR-0403 dec 1). The fallback went with it and
 * is NOT replaced by a store-backed equivalent, deliberately — it existed to unblock a session with
 * no database, and under ADR-0302 D2's online-or-nothing posture a session with no database cannot
 * write the decision either. Reserving a number it could not then use would be a number burned for
 * nothing. `adr new` / `adr next` refuse without `--pg` and say so.
 */


/** PURE: parse a `--supersedes 42,43` / `--amends 7` value into a positive-int list (drops junk). */
export function parseEdges(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

const pad = (n: number): string => String(n).padStart(4, "0");

/**
 * PURE: the ADR numbers the store has already handed out that sit below the one just reserved —
 * every number strictly between the highest decision this run observed and the one just reserved.
 *
 * EXACT, not heuristic. The allocator reserves `GREATEST(localMax, max-ever-handed-out) + 1`
 * (ADR-0050, `PgAdrStore.allocate`), so a number more than one above this checkout's max is PROOF
 * that the store's own max was ahead of us — i.e. other sessions took the numbers in between. Nothing
 * else can produce that gap, so every number reported was genuinely allocated elsewhere.
 *
 * WHY it is worth saying (2026-08-09): ADR-0335 and ADR-0337 were decided the same day in parallel
 * sessions, neither aware of the other, and partially CONTRADICTED each other — 0335 made arc
 * `lifecycle` derived and said there should be no bare reopen verb; 0337 added exactly that verb. The
 * 0337 session's pre-PR `git fetch origin && git merge origin/main` reported "Already up to date",
 * because 0335's PR had not merged yet — so nothing in the ceremony saw it. `pnpm gate` is
 * branch-local, and CI would have surfaced it only as a MERGE CONFLICT after both designs were
 * settled, at which point the natural move is to resolve the hunks and thereby silently override an
 * accepted, owner-directed decision. It was caught by luck.
 *
 * The allocator already KNEW: when it handed that session 0337 it had 0335 and 0336 on file. This
 * turns the number it was throwing away into the warning, at the one moment the session can still act
 * on it cheaply — before the prose is written.
 *
 * A number here may also be a BURNED allocation (an abandoned branch's number is never reused, see
 * `adr-store.ts`), which is why this is a heads-up and not a gate: the claim it makes — "allocated
 * elsewhere, not in this checkout" — stays true either way, and the reader decides.
 */
export function parallelAllocations(localMax: number, reserved: number): number[] {
  // No ADRs on disk at all means the decisions dir is missing or unreadable (`maxAdrNumber` returns 0
  // for both) — a broken checkout, not a parallel-allocation signal. Reporting every number below the
  // reservation there would be loud and wrong, so stay silent and let the real problem surface.
  if (localMax <= 0) return [];
  const out: number[] = [];
  for (let n = localMax + 1; n < reserved; n++) out.push(n);
  return out;
}

/** Enumerate at most this many numbers inline; a very stale checkout gets a count, not a wall. */
const MAX_LISTED_PARALLEL = 8;

export interface ParallelAllocationNoteResult {
  lines: string[];
  next: string[];
}

/**
 * PURE: render {@link parallelAllocations} as envelope lines + `next:` steps. Empty in, empty out —
 * FAIL QUIET (a session whose checkout is current sees nothing at all, and this never reddens
 * anything). Guidance at the point of use, in the tool's own output rather than in any agent prompt:
 * the ADR-0023 pull model, the shape ADR-0239 D4 chose for its closure hint, whose stated virtue is
 * zero context cost for every session that is not doing this.
 *
 * The `next:` steps fetch rather than assume: the contradicting ADR is typically NOT on `origin/main`
 * yet (that is exactly why the ordinary merge missed it), so they look across ALL fetched refs — the
 * sibling session's branch included.
 */
export function parallelAllocationNote(missing: readonly number[]): ParallelAllocationNoteResult {
  const first = missing[0];
  if (first === undefined) return { lines: [], next: [] };
  const listed = missing.slice(0, MAX_LISTED_PARALLEL).map(pad).join(", ");
  const more = missing.length > MAX_LISTED_PARALLEL ? `, +${missing.length - MAX_LISTED_PARALLEL} more` : "";
  const one = missing.length === 1;
  return {
    lines: [
      "",
      one
        ? `⚠️  ADR-${listed} was allocated by another session.`
        : `⚠️  ADR-${listed}${more} were allocated by other sessions.`,
      `    A decision written in parallel can CONTRADICT yours. If ${one ? "it touches" : "any of them touches"} your area,`,
      "    READ it BEFORE you write your Decision.",
      "",
      "    Since ADR-0403 dec 1 they are ROWS, so reading one is immediate and needs no archaeology —",
      "    a sibling's decision is visible the moment they write it, where it used to sit on their",
      "    branch until merge and surface as a conflict whose hunks silently overrode an accepted",
      "    decision. What survives is the GAP: a number can be reserved and not yet written.",
    ],
    next: [
      `storytree library artifact ${adrDocId(first)}   (an empty answer means reserved, not yet written)`,
    ],
  };
}

/**
 * PURE: the scaffold body for a fresh ADR — frontmatter + H1 + the standard sections.
 *
 * Default (no `decided`): born `proposed` (ADR-0050) — the scaffold for a still-thinking ADR, left for
 * the author to fill in. When `decided` (an ISO `YYYY-MM-DD`) is supplied, the ADR is instead born
 * `accepted` with `decided: <date>` and a `## Status` line recording the owner's design-time directive:
 * the OWNER-DIRECTED path of ADR-0110 (Option A) — when the owner explicitly directs a decision in a
 * design conversation, alignment IS ratification, so there is no second end-of-flow ratification ask.
 * Amends ADR-0050's unconditionally-born-`proposed` scaffold (the mechanical root of the double-ask).
 */
export function scaffold(
  n: number,
  title: string,
  edges: { supersedes: number[]; amends: number[] },
  decided?: string,
  arc?: string,
): string {
  const ownerDirected = decided !== undefined && decided !== "";
  const fm = ["---", `status: ${ownerDirected ? "accepted" : "proposed"}`];
  if (ownerDirected) fm.push(`decided: ${decided}`);
  if (edges.supersedes.length > 0) fm.push(`supersedes: [${edges.supersedes.join(", ")}]`);
  if (edges.amends.length > 0) fm.push(`amends: [${edges.amends.join(", ")}]`);
  // The ADR-0183 D3 provenance stamp: "arc X produced me" — set at creation, never edited.
  if (arc !== undefined && arc !== "") fm.push(`arc: ${arc}`);
  fm.push("---", "");
  const edgeProse =
    edges.supersedes.length > 0 || edges.amends.length > 0
      ? [
          edges.supersedes.length > 0
            ? `**Supersedes** ${edges.supersedes.map((e) => `ADR-${pad(e)}`).join(", ")} — <why; flip their status to superseded>.`
            : "",
          edges.amends.length > 0
            ? `**Amends** ${edges.amends.map((e) => `ADR-${pad(e)}`).join(", ")} — <what this extends/narrows, without overturning>.`
            : "",
        ].filter((s) => s !== "")
      : [];
  const statusLine = ownerDirected
    ? `accepted (${decided}) — decided/directed by the owner in conversation on ${decided}. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.`
    : "proposed — <one line: who decided / when / why>.";
  const body = [
    `# ADR-${pad(n)}: ${title}`,
    "",
    "## Status",
    "",
    statusLine,
    ...(edgeProse.length > 0 ? ["", ...edgeProse] : []),
    "",
    "## Context",
    "",
    "<the problem and the forces in play>.",
    "",
    "## Decision",
    "",
    "<what we are doing>.",
    "",
    "## Consequences",
    "",
    "<what follows — good and bad>.",
    "",
    "## References",
    "",
    "- <related ADRs / code / docs>.",
    "",
  ];
  return fm.join("\n") + body.join("\n");
}

/**
 * The highest decision number the STORE holds — the allocator's `localMax` input.
 *
 * `null` when the log could not be READ, which is NOT the same as "the log holds nothing" and must
 * not be flattened into 0. `loadTitledAdrMetasFromStore` returns `unreadable` for exactly this
 * reason (see its docstring): a caller that ignores it turns an outage into a confident zero.
 *
 * Why it matters more here than the old "a stale value only ever costs a gap" note admitted. That
 * is true of `PgAdrStore.allocate` ALONE — it reserves `GREATEST(localMax, MAX(number)) + 1`, so a
 * low `localMax` can only widen a gap. But the allocator's `MAX` reads the NUMBER LEDGER while the
 * decision it is about to write lives in the ARTIFACT table, and nothing backfilled the ledger for
 * the migrated decisions. So a `localMax` that under-reads the artifact table can hand back a
 * number a row already occupies, and `scaffoldRow` would then upsert straight over it. The gap is
 * cheap; the collision is a destroyed decision. Refuse instead of guessing.
 */
async function storeMaxAdrNumber(deps: AdrCommandDeps): Promise<number | null> {
  if (deps.roundTrip === undefined) return 0;
  const { adrs, unreadable } = await loadTitledAdrMetasFromStore(deps.roundTrip.store);
  if (unreadable) return null;
  return adrs.reduce((max, a) => (a.number > max ? a.number : max), 0);
}

/** The refusal shared by both allocating verbs when the decision log could not be read at all. */
function unreadableLog(verb: string): Envelope {
  return {
    ok: false,
    body: [
      `storytree adr ${verb} cannot reserve a number: the decision log could not be READ.`,
      "",
      "That is not the same as an empty log, and it is not safe to treat it as one. The number is",
      "reserved against the ledger, but the decision is written into the artifact table — so a",
      "number chosen while that table is unreadable can land on a decision that already exists.",
      "Bring the store up and try again.",
    ].join("\n"),
    next: ["pnpm db:up", `storytree adr ${verb} --pg`],
  };
}

/** The refusal both allocating verbs share once there is no offline path left to fall back to. */
function needsPg(verb: string): Envelope {
  return {
    ok: false,
    body: [
      `storytree adr ${verb} needs --pg.`,
      "",
      "The number is reserved transactionally from the store (ADR-0050) and the decision itself is a",
      "ROW there (ADR-0403 dec 1). The old offline `max-on-disk + 1` fallback read `docs/decisions/`,",
      "which no longer exists — and reserving a number a session cannot then write would burn it.",
    ].join("\n"),
    next: ["pnpm db:up", `storytree adr ${verb} --title "..." --pg`],
  };
}

async function adrNew(opts: AdrCommandOpts, deps: AdrCommandDeps): Promise<Envelope> {
  const title = opts.title?.trim() ?? "";
  if (!title) {
    return {
      ok: false,
      body: 'adr new needs a title:  storytree adr new --title "Short imperative title" --pg',
      next: ["storytree adr new --title \"...\" --pg"],
    };
  }
  const slug = kebabSlug(title);
  if (!slug) {
    return { ok: false, body: `could not derive a slug from "${title}" — use letters/numbers.`, next: [] };
  }
  if (!deps.allocator) return needsPg("new");
  const localMax = await storeMaxAdrNumber(deps);
  if (localMax === null) return unreadableLog("new");
  const edges = { supersedes: parseEdges(opts.supersedes), amends: parseEdges(opts.amends) };

  let n: number;
  {
    try {
      const r = await deps.allocator.allocate({ localMax, slug, branch: deps.branch, actor: deps.actor });
      n = r.number;
    } catch (e) {
      return {
        ok: false,
        body:
          `couldn't reserve an ADR number from the DB: ${(e as Error).message}\n` +
          "bring the store up (pnpm db:up) and try again.",
        next: ["pnpm db:up", 'storytree adr new --title "..." --pg'],
      };
    }
  }

  // --decided (ADR-0110): the owner directed this in conversation → born accepted with today's date.
  const decided = opts.decided === true ? deps.today : undefined;
  const scaffolded = scaffold(n, title, edges, decided, opts.arc?.trim() || undefined);

  // ONE WRITE NOW, and the dual-write that stood here is gone with the files (ADR-0403 dec 1). It
  // scaffolded `docs/decisions/NNNN-slug.md` AND the row, because `adr list` read rows while the
  // files were still canonical for other readers; there is no second source left to keep in step.
  const id = adrDocId(n);
  const rowWrite = await scaffoldRow(n, scaffolded, deps);
  if (rowWrite.failed) {
    return {
      ok: false,
      body: [
        `ADR-${pad(n)} was RESERVED but the decision was not written: ${rowWrite.reason}`,
        "",
        "The number is spent either way — reservation is transactional and does not roll back — so",
        "re-running `adr new` takes the NEXT number and leaves a gap. Fix the store and author the",
        `decision at ${id} instead, or accept the gap.`,
      ].join("\n"),
      next: ["pnpm db:up", `storytree library artifact ${id} --pg`],
    };
  }

  const lines = [
    `ADR-${pad(n)} reserved in the DB and written as ${id}`,
    "",
    `# ADR-${pad(n)}: ${title}`,
    decided !== undefined
      ? `Scaffolded ACCEPTED (owner-directed, decided ${decided} — ADR-0110) — fill in Context / Decision / Consequences.`
      : "Scaffolded with proposed status — fill in Status / Context / Decision / Consequences.",
    "",
    "Author it as a whole document — pull it to a file, edit it with ordinary tools, push it back:",
    `  storytree adr pull ${String(n)} --out ${id}.md`,
    `  storytree adr push ${String(n)} --file ${id}.md --pg`,
  ];
  const parallel = parallelAllocationNote(parallelAllocations(localMax, n));
  lines.push(...parallel.lines);
  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree adr pull ${String(n)} --out ${id}.md`, ...parallel.next],
  };
}

async function adrNext(deps: AdrCommandDeps): Promise<Envelope> {
  if (!deps.allocator) return needsPg("next");
  const localMax = await storeMaxAdrNumber(deps);
  if (localMax === null) return unreadableLog("next");
  try {
    const r = await deps.allocator.allocate({
      localMax,
      slug: "(reserved via adr next)",
      branch: deps.branch,
      actor: deps.actor,
    });
    // Same heads-up as `adr new` — `adr next` reserves for a hand-authored file, so its author is in
    // exactly the position the note is for: about to write prose against numbers it cannot see.
    const parallel = parallelAllocationNote(parallelAllocations(localMax, r.number));
    return {
      ok: true,
      body: [
        `ADR-${pad(r.number)} reserved — nothing is written yet. \`adr new --title\` scaffolds the ` +
          `decision at ${adrDocId(r.number)}; this verb only holds the number.`,
        ...parallel.lines,
      ].join("\n"),
      next: ['storytree adr new --title "..." --pg', ...parallel.next],
    };
  } catch (e) {
    return {
      ok: false,
      body: `couldn't reserve an ADR number from the DB: ${(e as Error).message}`,
      next: ["pnpm db:up", "storytree adr next --pg"],
    };
  }
}

// ---------------------------------------------------------------------------
// `storytree adr list` — the SEARCHABLE current-state view (ADR-0086, directive A)
// ---------------------------------------------------------------------------
//
// Replaces the hand-maintained `CLAUDE.md` "Load-bearing ADRs" + "reversals" sections with a query
// derived from the live frontmatter, so the list can never drift from the files. Two cuts:
//   --current        every accepted, non-superseded ADR (the derived backbone — honest by construction)
//   --load-bearing   the calibrate-to-these set: the curated `load_bearing: true` seed, CLOSED over
//                    accepted `amends` edges (see `loadBearingReach`)
// Outgoing edges (supersedes / amends — binary since ADR-0139 retired supersedes-in-part) and BOTH
// derived back-edges (`superseded by` / `amended by`) are shown inline so the reversal story reads off
// the graph, not off prose. Both directions matter on `--load-bearing`: ADR-0139 frames `amends` as
// strictly additive, but in practice an amending ADR can retire a clause of its target (ADR-0271 does,
// to ADR-0142 §3) — without the back-edge a session calibrating on this view reads the retired leg
// unqualified. Read-only + offline (it reads docs/decisions on disk) — no DB, no API key.
//
// A back-edge to a non-accepted ADR is LABELLED with that status. Rendered bare, an undecided or a
// dead amendment reads exactly like a live one: ★0020 listed `amended by 0080, …, 0265` with 0265
// still `proposed`, and ★0011's sole amender (0177) is `superseded`. The first OVERSTATES the current
// set (a derived view must never promote an undecided edge); the second resurrects a dead decision.

/** A parsed ADR for the `list` view: frontmatter meta + the H1 title. */
export interface AdrListing {
  meta: AdrMeta;
  title: string;
}

/** The `adr list` filters; absent = no filter (show everything). */
export interface AdrListFilter {
  current?: boolean;
  loadBearing?: boolean;
  status?: AdrStatus;
}

// The title extractor moved to `@storytree/drive` (next to `parseAdrFrontmatter`, its natural home)
// when the arc rollup began needing ADR titles too — one implementation, re-exported here so this
// module's existing importers and suite keep their path.
export { extractAdrTitle };

/**
 * Invert one outgoing edge kind into `target -> [sources]`, deduped and ascending. Computed from the
 * FULL listing set by every caller (see {@link renderAdrList}) — never from the filtered view.
 */
function backEdges(
  listings: readonly AdrListing[],
  edge: (m: AdrMeta) => readonly number[],
): Map<number, number[]> {
  const byTarget = new Map<number, Set<number>>();
  for (const l of listings) {
    for (const t of edge(l.meta)) {
      const set = byTarget.get(t) ?? new Set<number>();
      set.add(l.meta.number);
      byTarget.set(t, set);
    }
  }
  return new Map([...byTarget].map(([t, s]) => [t, [...s].sort((a, b) => a - b)]));
}

/**
 * PURE: the set `--load-bearing` renders — the curated `load_bearing: true` seed, closed transitively
 * over ACCEPTED `amends` edges pointing into it.
 *
 * The curated tag alone made this view CONFIDENTLY INCOMPLETE. `storytree adr list --load-bearing` is
 * the exact surface CLAUDE.md sends every new session to calibrate on, yet an accepted ADR that amends
 * a load-bearing one — which under ADR-0139 means the target STAYS current but is no longer wholly
 * self-describing — appeared nowhere in it unless someone remembered a second, hand-maintained tag.
 * ADR-0271 landed exactly that way (accepted, `amends: [142]`, untagged) and was caught a day later by
 * a librarian pass, by accident. A consumer of the view cannot detect the omission from the view.
 *
 * So reach is DERIVED from the edge that already exists in the frontmatter (ADR-0037) rather than from
 * a parallel tag. That is what makes it tractable, what keeps it honest by construction, and what
 * keeps it working when ADR-0139 retires the `load_bearing` tag (at which point the seed shrinks and
 * this closure carries the view).
 *
 * TRANSITIVE, not one hop: 0288 amends 0275 amends 0271 amends ★0142, and each link overtakes part of
 * the one below. Stopping at one hop would re-create the reported gap one level out — the same
 * undetectable-from-the-surface omission, just further along the chain.
 *
 * Only `accepted` edges propagate. A `proposed` amender is undecided, so promoting it would OVERSTATE
 * the current set (the inverse error); a `superseded` one is dead. Both are still SHOWN as labelled
 * back-edges on their target — excluded from the set, never hidden from the reader.
 */
export function loadBearingReach(listings: readonly AdrListing[]): Set<number> {
  const reach = new Set<number>();
  for (const l of listings) if (l.meta.loadBearing) reach.add(l.meta.number);
  // Fixpoint over the amends graph. Each pass either grows the set or terminates, and the set is
  // bounded by the corpus, so this converges (2 passes on the real corpus as of 2026-08-03).
  for (;;) {
    const before = reach.size;
    for (const l of listings) {
      if (l.meta.status !== "accepted" || reach.has(l.meta.number)) continue;
      if (l.meta.amends.some((t) => reach.has(t))) reach.add(l.meta.number);
    }
    if (reach.size === before) return reach;
  }
}

/**
 * PURE: filter + format the listing rows. Derived `superseded by` / `amended by` back-edges are
 * computed from the FULL set (before the display filter), so a row's reversal or amendment is shown
 * even when the superseding / amending ADR is filtered out of view — e.g. a still-`proposed` amender,
 * whose row `--load-bearing` drops but whose pointer the amended ADR must still carry.
 *
 * `★` marks a hand-curated `load_bearing` ADR, `☆` one reached through the amends graph
 * ({@link loadBearingReach}). Two marks, not one, because deriving reach GROWS the set (96 curated →
 * 137 on the 2026-08-03 corpus) and a view that lists too much is its own calibration failure — the
 * split keeps that growth attributable at a glance, and each ☆ row prints the `amends` edge that put
 * it there. The right response to a set that grows too large is ADR-0139's consolidation pass, never a
 * filter that hides edges.
 */
export function renderAdrList(listings: readonly AdrListing[], filter: AdrListFilter): string[] {
  const supersededBy = backEdges(listings, (m) => m.supersedes);
  const amendedBy = backEdges(listings, (m) => m.amends);
  const reach = loadBearingReach(listings);
  const statusOf = new Map(listings.map((l) => [l.meta.number, l.meta.status]));
  /** `0271` for an accepted ADR, `0265 (proposed)` for anything else — never a bare live-looking ref. */
  const label = (n: number): string => {
    const s = statusOf.get(n);
    return s === undefined || s === "accepted" ? pad(n) : `${pad(n)} (${s})`;
  };
  const sorted = [...listings].sort((a, b) => a.meta.number - b.meta.number);
  const rows: string[] = [];
  for (const l of sorted) {
    const m = l.meta;
    if (filter.current === true && m.status !== "accepted") continue;
    if (filter.loadBearing === true && !reach.has(m.number)) continue;
    if (filter.status !== undefined && m.status !== filter.status) continue;
    const mark = m.loadBearing ? "★" : reach.has(m.number) ? "☆" : " ";
    rows.push(`${mark} ${pad(m.number)}  ${m.status.padEnd(10)} ${l.title}`);
    const edges: string[] = [];
    if (m.supersedes.length > 0) edges.push(`supersedes ${m.supersedes.map(pad).join(", ")}`);
    if (m.amends.length > 0) edges.push(`amends ${m.amends.map(pad).join(", ")}`);
    if (m.arc !== undefined) edges.push(`arc ${m.arc}`);
    const back = supersededBy.get(m.number);
    if (back !== undefined && back.length > 0) edges.push(`superseded by ${back.map(label).join(", ")}`);
    const amended = amendedBy.get(m.number);
    if (amended !== undefined && amended.length > 0) edges.push(`amended by ${amended.map(label).join(", ")}`);
    for (const e of edges) rows.push(`            ${e}`);
  }
  return rows;
}

/**
 * Write the freshly-scaffolded decision as a ROW as well as a file — the dual-source window.
 *
 * Returns the lines to append to the envelope, so the caller reports what actually happened rather
 * than assuming. THREE outcomes and each is said out loud:
 *
 *   - written — both sources carry it, `adr list` will show it;
 *   - NOT written because the invocation is read-only (no `--pg`) — a LOUD warning, because the file
 *     now exists and the orientation surface will not show it until someone reconciles;
 *   - NOT written because the write FAILED — the same warning with the cause.
 *
 * Silence on the second and third would be the bad kind: the command would report success and the
 * decision would be missing from the only surface anyone reads.
 */
async function scaffoldRow(
  n: number,
  scaffolded: string,
  deps: AdrCommandDeps,
): Promise<{ failed: false } | { failed: true; reason: string }> {
  if (deps.roundTrip === undefined || !deps.roundTrip.writable) {
    return { failed: true, reason: "this invocation is read-only (no --pg)" };
  }
  try {
    const { parseAdrDocument, adrDocId, adrDescriptionOf } = await import("@storytree/library/adr-doc");
    const { upcastAndValidate } = await import("@storytree/library");
    const fields = parseAdrDocument(n, scaffolded);
    const id = adrDocId(n);
    const now = new Date().toISOString();
    const doc = upcastAndValidate({
      kind: "adr",
      id,
      title: fields.title === "" ? id : fields.title,
      description: adrDescriptionOf(n, fields.title),
      body: fields.body,
      number: n,
      status: fields.status,
      amends: [...fields.amends],
      supersedes: [...fields.supersedes],
      loadBearing: fields.loadBearing,
      references: [],
      createdAt: fields.decided === undefined ? now : `${fields.decided}T00:00:00.000Z`,
      updatedAt: now,
      ...(fields.decided === undefined ? {} : { decided: fields.decided }),
      ...(fields.arc === undefined ? {} : { arcRef: `asset:${fields.arc}` }),
    });
    // REFUSE rather than upsert over an occupied id. `newArtifact` (the generic verb) has always
    // done this; `adr new` used to get it from `existsSync(file)`, and that guard went with the
    // files. Without it the write is an UPSERT onto a number the allocator believes is free — and
    // the allocator's `MAX` reads the number LEDGER while the decision lives in the ARTIFACT table,
    // which nothing backfilled for the migrated decisions. Any path that mints an `adr-NNNN` row
    // without reserving (`library artifact new --file` accepts kind `adr` with a hand-chosen id)
    // leaves the two disagreeing, and the loser of that disagreement was a destroyed decision
    // reported as `ok: true`. Cheap to ask, and it fails the ONE way that cannot lose a decision.
    if (await deps.roundTrip.store.getDoc(id)) {
      return {
        failed: true,
        reason:
          `${id} ALREADY EXISTS and was not overwritten. The allocator handed out a number the ` +
          `decision log already holds, which means the number ledger and the stored decisions ` +
          `disagree. Read ${id} before doing anything else — do not re-run to get past this.`,
      };
    }
    await deps.roundTrip.store.upsertDoc({
      id,
      kind: "adr",
      doc: doc as Record<string, unknown>,
      actor: deps.actor ?? defaultCliActor(),
    });
    return { failed: false };
  } catch (e) {
    return { failed: true, reason: (e as Error).message };
  }
}

export interface LoadAdrListingsResult {
  listings: AdrListing[];
  parseErrors: string[];
}

/**
 * PURE: reshape decision metas into the nested `{meta, title}` listing {@link renderAdrList} expects.
 *
 * Split out from the loader when the source moved from files to rows (ADR-0403 dec 1), so the RESHAPE
 * stays pure and testable and only the fetch is async.
 */
export function adrListingsOf(adrs: readonly TitledAdrMeta[]): AdrListing[] {
  return adrs.map(({ title, ...meta }) => ({ meta, title }));
}

/**
 * Read every decision ROW into a listing; unreadable rows are collected rather than thrown.
 *
 * ★ THE OFFLINE PROPERTY THIS COMMAND ADVERTISED IS GONE, and that is the named accepted cost of
 * ADR-0403, not a regression: `adr list` read `docs/decisions` from disk with no database, which is
 * why it, `doctor` and the help surfaces touched no store. Session-start orientation on the decision
 * log now needs the DB up. Accepted under ADR-0302 D2's online-or-nothing posture, with the instance
 * running 24/7. The help text was corrected in the same change — a command that still advertised
 * "read-only + offline" would be lying about itself.
 */
export async function loadAdrListings(store: Store): Promise<LoadAdrListingsResult> {
  const { adrs, parseErrors } = await loadTitledAdrMetasFromStore(store);
  return { listings: adrListingsOf(adrs), parseErrors };
}

const STATUS_WORDS: ReadonlySet<string> = new Set(["proposed", "accepted", "superseded"]);

async function adrList(opts: AdrCommandOpts, deps: AdrCommandDeps): Promise<Envelope> {
  if (opts.status !== undefined && !STATUS_WORDS.has(opts.status)) {
    return {
      ok: false,
      body: `unknown --status "${opts.status}". use one of: proposed, accepted, superseded.`,
      next: ["storytree adr list --current", "storytree adr list --load-bearing"],
    };
  }
  if (deps.roundTrip === undefined) {
    return {
      ok: false,
      body: "adr list reads the decision log from the store, which this invocation was not given.",
      next: ["pnpm db:up"],
    };
  }
  const { listings, parseErrors } = await loadAdrListings(deps.roundTrip.store);
  if (listings.length === 0) {
    return {
      ok: false,
      body:
        parseErrors.length > 0
          ? `no decisions read:\n${parseErrors.join("\n")}`
          : "no decisions in the store. (they live there since ADR-0403 — is the DB up?)",
      next: ["pnpm db:up", 'storytree adr new --title "..." --pg'],
    };
  }
  const filter: AdrListFilter = {};
  if (opts.current === true) filter.current = true;
  if (opts.loadBearing === true) filter.loadBearing = true;
  if (opts.status !== undefined) filter.status = opts.status as AdrStatus;
  const rows = renderAdrList(listings, filter);
  const cut = opts.loadBearing
    ? "load-bearing current-state"
    : opts.current
      ? "current (accepted, not superseded)"
      : opts.status !== undefined
        ? opts.status
        : "all";
  const lines = [
    `storytree adr — ${rows.filter((r) => !r.startsWith(" ".repeat(12))).length} ADRs [${cut}]` +
      `   ★ = curated load-bearing · ☆ = reached via an amends edge`,
  ];
  if (opts.loadBearing === true) {
    // Name the split, so the growth deriving reach causes is visible on the surface itself rather
    // than being something a reader has to know about.
    const reach = loadBearingReach(listings);
    const curated = listings.filter((l) => l.meta.loadBearing).length;
    lines.push(
      `  ${curated} curated ★ + ${reach.size - curated} reached ☆ — an accepted ADR amending the set is IN it (ADR-0037 edges, ADR-0139 semantics).`,
    );
  }
  lines.push("", ...(rows.length > 0 ? rows : ["  (none match)"]));
  if (parseErrors.length > 0) {
    lines.push("", `⚠️  ${parseErrors.length} file(s) failed to parse:`, ...parseErrors.map((e) => `  ${e}`));
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      "storytree adr list --load-bearing   (the calibrate-to-these set)",
      "storytree adr list --current        (every accepted, non-superseded ADR)",
    ],
  };
}

export function adrHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree adr — search the decision log + allocate ADR numbers without collisions (ADR-0050/0086).",
      "",
      "  storytree adr list [--current | --load-bearing | --status <s>]   the searchable current-state view",
      '  storytree adr new --title "..." [--decided] [--supersedes 42] [--amends 42,43] [--arc <id>] --pg   reserve + scaffold',
      "  storytree adr next --pg                                                  reserve a number only",
      "",
      "  storytree adr pull <n> --out <path>                the decision as an ordinary markdown document",
      "  storytree adr push <n> --file <path> --pg          the edited document, written back",
      "",
      "`pull` / `push` are the round trip for the tier with the longest prose (ADR-0403 dec 9). Edit the",
      "whole document with ordinary tools: the `## Status` prose and the `status` field are one text, so",
      "they cannot drift apart inside a single edit. A no-op round trip is byte-identical.",
      "  Both legs are CLI-owned writes — `--out` on the pull, `--file` on the push, never a `>` redirect,",
      "  which captures pnpm's run banner as the document's first bytes (ADR-0361).",
      "  A push is a REPLACE of the whole document, so two sessions pushing the SAME decision are",
      "  last-write-wins with no detector. For a targeted change prefer the field-scoped",
      "  `storytree library artifact adr-NNNN --set <field>=<value> --pg` (ADR-0352); reach for the round",
      "  trip when you are genuinely rewriting the prose.",
      "",
      "  --decided   the owner DIRECTED this in conversation → scaffold born `accepted` + `decided: <today>`",
      "              (design-time alignment IS ratification, no second end-of-flow ask; ADR-0110). Omit it",
      "              for the born-`proposed` default of a still-thinking ADR.",
      "  --arc <id>  the ADR-0183 D3 provenance stamp: the Library `arc` this decision was produced under.",
      "              Immutable once scaffolded; the arc's ADR view derives from these child stamps",
      "              (storytree arc show <id>). Omit for arc-less work.",
      "",
      "`list` is read-only and reads the LIVE STORE (ADR-0403 dec 1 — decisions are rows now; the",
      "offline read this used to advertise is the named accepted cost, so bring the DB up):",
      "  --current        every accepted, non-superseded ADR (the derived backbone)",
      "  --load-bearing   the calibrate-to-these set (the CLAUDE.md list, now live): the curated ★",
      "                   `load_bearing: true` seed CLOSED over accepted `amends` edges — an accepted",
      "                   ADR that amends the set is ☆ IN it, transitively. Under ADR-0139 an amends",
      "                   edge means the target stays current but is no longer wholly self-describing,",
      "                   so the amendment belongs on the calibration surface. Derived from the edge,",
      "                   not a second hand-kept tag, so it survives ADR-0139 retiring `load_bearing`.",
      "                   A proposed or superseded amender is NEVER pulled in (that would overstate the",
      "                   current set) — it still shows as a status-labelled back-edge on its target.",
      "  --status <s>     filter to proposed | accepted | superseded",
      "",
      "new/next BOTH need --pg (bring the DB up first: pnpm db:up). There is no offline path: the",
      "number is reserved transactionally and the decision is a row, so a session that cannot reach the",
      "store cannot write the decision either — reserving a number it could not use would burn it.",
      "",
      "A reserved number more than one above the highest decision this run saw means other sessions",
      "allocated the numbers in between — `new`/`next` name them, because a decision written in",
      "parallel can CONTRADICT yours. Read it with `storytree library artifact adr-NNNN` (an empty",
      "answer means reserved, not yet written). A heads-up, never a gate.",
    ].join("\n"),
    next: ["storytree adr list --load-bearing", 'storytree adr new --title "..." --pg'],
  };
}

/** Dispatch the `adr` area: `new` (reserve + scaffold) | `next` (reserve only) | help. */
export async function adrCommand(
  sub: string | undefined,
  opts: AdrCommandOpts,
  deps: AdrCommandDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return adrHelp();
  if (sub === "list") return await adrList(opts, deps);
  if (sub === "new") return adrNew(opts, deps);
  if (sub === "next") return adrNext(deps);
  // The round trip (ADR-0403 dec 9). Both legs need the STORE, which the file-reading subcommands
  // above do not — so they are refused with the reason rather than crashing on an absent dep, which
  // is what a partially-wired composition root would otherwise produce.
  if (sub === "pull" || sub === "push") {
    if (deps.roundTrip === undefined) {
      return {
        ok: false,
        body: "adr pull/push need the live store, which this invocation was not given.",
        next: ["pnpm db:up", "storytree adr list --current"],
      };
    }
    return sub === "pull"
      ? adrPull(opts.number, opts.out, deps.roundTrip)
      : adrPush(opts.number, opts.file, deps.roundTrip);
  }
  return {
    ok: false,
    body: `unknown adr command "${sub}". try: storytree adr list  |  storytree adr new --title "..." --pg`,
    next: ["storytree adr list --load-bearing", 'storytree adr new --title "..." --pg'],
  };
}
