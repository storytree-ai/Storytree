import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Store, StoredDoc } from "@storytree/storage-protocol";

import { loadTitledAdrMetas, type TitledAdrMeta } from "./adr-metas.js";
import type { AdrStatus } from "./adr-frontmatter.js";

/**
 * The ARC ROLLUP — the derived initiative view (ADR-0183 D3) as DATA rather than as rendered text.
 *
 * ADR-0183 D3 puts every containment edge on the CHILD — a plan's `arcRef`, an open question's
 * `arcRef` (ADR-0267 D4), an ADR's frontmatter `arc:` stamp, a story's frontmatter `arc:` stamp — so
 * an arc's children are always a QUERY and can never drift from them. This module is the ONE place
 * that query lives.
 *
 * It sits in `drive` rather than in `cli` because BOTH readers must share it and they cannot share
 * cli: the studio server does not depend on `@storytree/cli` (and must not — `drive` is the package
 * the cli, the studio worker and the desktop backend already have in common). ADR-0267's Consequences
 * name the fork this prevents: *"there is no arc view in the studio beyond a flat artifact card, and
 * the derived arc → children join is CLI-only."* `packages/cli/src/arc.ts` renders this rollup into
 * an ADR-0023 envelope; the studio server serves the same value as JSON. Neither joins anything
 * itself — the hard invariant is that `drive` never imports `cli`, so the arrow only points this way.
 */

/**
 * One increment of arc work, projected from its own row (ADR-0305 D1).
 *
 * It used to be THREE shapes — `ArcRollupIncrement` (a landing, read out of `arc.increments[]`),
 * `ArcRollupProposal` (parked work, out of `arc.proposals[]`) and `ArcRollupPlan` (a `plan` doc
 * citing the arc). They described one thing at three stages of its life, so they are one shape now,
 * distinguished by `status`.
 *
 * Read defensively like every other leg here: the schema validates on WRITE, this view never throws
 * on a malformed row.
 */
export interface ArcRollupIncrement {
  id: string;
  title: string;
  /** The one-sentence lead — what this increment delivers. */
  objective: string;
  /** `proposal` | `ready` | `active` | `closed` (ADR-0305 D2); `"?"` when a doc omits it. */
  status: string;
  /** When it was parked — the delivery ceiling's comparison point (ADR-0298 D3 / ADR-0305 D6). */
  parked?: string;
  /** The source friction ids — the ceiling's join. */
  frictionRefs?: string[];
  /** The git anchor's short sha, when it has one — the freshness check's subject. */
  anchorSha?: string;
  /** Present ⇔ `status` is `closed`: what happened, and why (ADR-0305 D5). */
  outcome?: { date?: string; pr?: string; note?: string };
}

/** A decision stamped to this arc (frontmatter `arc:`, ADR-0183 D3). */
export interface ArcRollupAdr {
  number: number;
  status: AdrStatus;
  title: string;
}

/** An open question waiting on this arc (`open-question.arcRef`, ADR-0267 D4). */
export interface ArcRollupQuestion {
  id: string;
  title: string;
  /** The one-line summary — enough to know what is being asked without opening the artifact. */
  description: string;
  /**
   * The question's `stakes` lead field — *what breaks if this stays unsettled*. Carried because
   * ADR-0267 is explicit that questions are "part of the payload, not a separate feature": a surface
   * that lists questions but forces a re-onboarding round-trip to answer them "has not moved the
   * problem". Empty string when the doc omits it.
   */
  stakes: string;
}

/**
 * One arc plus everything derived from its children. The shape both surfaces read.
 *
 * ADR-0267 D7 names the states the surface must distinguish — running, `waiting`, and `blocked`.
 * Only `waiting` is DEFINED there ("they have open questions"), so only `waiting` is computed here.
 * **`blocked` is deliberately absent**: D7 leaves what qualifies as blocked to the mock round and
 * says outright that a session which "invents a `blocked` predicate to close the gap" has exceeded
 * the decision. A later increment adds it once the owner defines it.
 */
export interface ArcRollup {
  id: string;
  title: string;
  description: string;
  /** ADR-0239 D1's stored closure flag — what makes D7's "currently running" answerable. */
  lifecycle: "active" | "closed";
  intent: string;
  endState: string;
  /**
   * Every increment citing this arc (`increment.arcRef`, ADR-0183 D3 / ADR-0305 D1), in ONE list —
   * ordered by {@link INCREMENT_STATUS_RANK}, so the FORWARD-LOOKING entries come first.
   *
   * That order is a requirement, not a preference. `renderArcRollup` used to emit the landing log
   * before the parked section, which put the newest unbuilt intentions LAST: on
   * `verification-integrity-arc` the parked block sat at line 998 of 1069, and a truncated read once
   * made a session conclude that two entries it had been sent to read did not exist. Chronological
   * order over one merged list would reproduce that exactly, so it is deliberately not chronological
   * at the top level.
   *
   * Every SURFACE that renders this must still separate the not-yet-started from the landed
   * (ADR-0305 D7). Ordering makes forward work reachable; it does not make it distinguishable, and a
   * reader who saw the two merged would read unbuilt intentions as things that happened.
   */
  increments: ArcRollupIncrement[];
  adrs: ArcRollupAdr[];
  /** Story directory names carrying this arc's frontmatter stamp. */
  stories: string[];
  questions: ArcRollupQuestion[];
  /** ADR-0267 D7's one defined state: the arc has open questions waiting on the owner. */
  waiting: boolean;
}

/** Read a string field off an untyped stored doc body ("" when absent). */
function str(doc: Record<string, unknown>, key: string): string {
  const v = doc[key];
  return typeof v === "string" ? v : "";
}

/** The body of a stored doc as an untyped bag (never throws on a malformed row). */
function bagOf(stored: StoredDoc): Record<string, unknown> {
  return typeof stored.doc === "object" && stored.doc !== null
    ? (stored.doc as Record<string, unknown>)
    : {};
}

/**
 * The sort rank of each increment status — FORWARD-LOOKING WORK FIRST.
 *
 * This is the ordering rule ADR-0305's fold left unspecified and the parked entry
 * `increment-tier-is-addressable-at-entry-grain` named as the one thing the fold does NOT address on
 * its own. "One ordered increment list" says nothing about the order, and the obvious choice —
 * chronological — reproduces the defect the fold was meant to remove: on `verification-integrity-arc`
 * the parked block sat at line 998 of 1069 because 34 landings were emitted ahead of it, and a
 * truncated read made a session report that entries it had been sent to read did not exist. Under a
 * merged chronological list the newest unbuilt work would again be last, which is worse, not better.
 *
 * A status rank is not merely a nicer sort: it is the same separation ADR-0298 D4 built structurally
 * out of two arrays, preserved as data now that there is one list. Renderers read it to keep the two
 * halves visibly apart (ADR-0305 D7) rather than interleaving them.
 *
 * An unrecognised status ranks with the forward-looking half rather than the landed one — a row this
 * code does not understand stays VISIBLE at the top instead of sinking into a long history where the
 * original defect hid it.
 */
const INCREMENT_STATUS_RANK: Readonly<Record<string, number>> = {
  proposal: 0,
  ready: 1,
  active: 2,
  closed: 4,
};
const UNKNOWN_STATUS_RANK = 3;

/** True when this status is one of the not-yet-landed ones — the split every arc surface must show. */
export function isForwardLooking(status: string): boolean {
  return (INCREMENT_STATUS_RANK[status] ?? UNKNOWN_STATUS_RANK) < INCREMENT_STATUS_RANK["closed"]!;
}

/**
 * PURE: the arc's one ordered increment list — status rank first, then OLDEST FIRST within a rank.
 *
 * Oldest-first is deliberate on both halves and means different things on each. Among forward-looking
 * entries it surfaces the LONGEST-WAITING remedy at the top, which is the same thing the delivery
 * ceiling measures off `parked`. Among closed entries it is the chronological landing log the arc has
 * always printed, unchanged. Ties fall back to `id` so the order is total and a render is stable
 * between runs.
 */
function compareIncrements(a: ArcRollupIncrement, b: ArcRollupIncrement): number {
  const ra = INCREMENT_STATUS_RANK[a.status] ?? UNKNOWN_STATUS_RANK;
  const rb = INCREMENT_STATUS_RANK[b.status] ?? UNKNOWN_STATUS_RANK;
  if (ra !== rb) return ra - rb;
  const ka = a.outcome?.date ?? a.parked ?? "";
  const kb = b.outcome?.date ?? b.parked ?? "";
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/**
 * PURE: the arc a doc cites via `arcRef: "asset:<id>"`, or null when absent/unreadable. Shared by
 * the plan leg (ADR-0183 D3) and the open-question leg (ADR-0267 D4) — the two kinds carry the
 * IDENTICAL edge, so they resolve it identically.
 */
export function arcRefOf(stored: StoredDoc): string | null {
  const ref = str(bagOf(stored), "arcRef");
  return ref.startsWith("asset:") ? ref.slice("asset:".length) : null;
}

/**
 * PURE: an arc's stored closure state (ADR-0239 D1), read defensively off an untyped doc. Only the
 * exact `"closed"` the schema enum fences is closure — an absent, empty, or unrecognised value is an
 * arc still IN FLIGHT, so a doc this code doesn't understand stays in the worklist instead of
 * silently vanishing from it (`lifecycleOf`'s fail-open arc branch, applied at the render surface).
 */
export function arcIsClosed(stored: StoredDoc): boolean {
  return bagOf(stored)["lifecycle"] === "closed";
}

/**
 * PURE: the `arc:` stamps across a stories tree — `stories/<dir>/story.md` frontmatter carrying
 * `arc: <id>` (ADR-0183 D3: the story-side provenance stamp). Stories without the stamp are simply
 * absent; a missing/unreadable file never throws (the view stays derivable on a partial checkout).
 */
export function storyArcStamps(storiesDir: string): { story: string; arc: string }[] {
  const out: { story: string; arc: string }[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(storiesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return out;
  }
  for (const dir of dirs) {
    const file = path.join(storiesDir, dir, "story.md");
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.startsWith("---")) continue;
    const end = content.indexOf("\n---", 3);
    if (end === -1) continue;
    const fm = content.slice(0, end);
    const m = /^arc:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m.exec(fm);
    if (m && m[1] !== undefined) out.push({ story: dir, arc: m[1] });
  }
  return out;
}

/** The already-loaded children `deriveArcRollup` joins. Loading is the caller's; the JOIN is here. */
export interface ArcRollupInput {
  /** The arc doc itself. */
  arc: StoredDoc;
  /** EVERY increment doc — filtered here by `arcRef`, so a caller never re-implements the predicate. */
  incrementDocs: readonly StoredDoc[];
  /** EVERY open-question doc — filtered here by `arcRef` (ADR-0267 D4). */
  questionDocs: readonly StoredDoc[];
  /** Every parsed ADR — filtered here by the frontmatter `arc:` stamp. */
  adrs: readonly TitledAdrMeta[];
  /** Every story stamp from {@link storyArcStamps} — filtered here by arc. */
  storyStamps: readonly { story: string; arc: string }[];
}

/**
 * PURE: join one arc to its children. No I/O, no store, no fs — every input arrives as data, which
 * is what lets the CLI and the studio server share one join while loading it differently (the CLI
 * from the live `--pg` store or the offline seed, the server from its configured backend).
 */
export function deriveArcRollup(input: ArcRollupInput): ArcRollup {
  const { arc } = input;
  const doc = bagOf(arc);
  const id = arc.id;

  const increments = input.incrementDocs
    .filter((p) => arcRefOf(p) === id)
    .map((p): ArcRollupIncrement => {
      const pd = bagOf(p);
      const anchor = pd["anchor"];
      const sha =
        typeof anchor === "object" && anchor !== null && typeof (anchor as Record<string, unknown>)["sha"] === "string"
          ? ((anchor as Record<string, unknown>)["sha"] as string).slice(0, 9)
          : undefined;
      const outcome = pd["outcome"];
      const refs = Array.isArray(pd["frictionRefs"])
        ? (pd["frictionRefs"] as unknown[]).filter((r): r is string => typeof r === "string")
        : undefined;
      const row: ArcRollupIncrement = {
        id: p.id,
        title: str(pd, "title"),
        objective: str(pd, "objective"),
        status: typeof pd["status"] === "string" ? (pd["status"] as string) : "?",
      };
      if (typeof pd["parked"] === "string") row.parked = pd["parked"] as string;
      if (refs !== undefined && refs.length > 0) row.frictionRefs = refs;
      if (sha !== undefined) row.anchorSha = sha;
      if (typeof outcome === "object" && outcome !== null) {
        row.outcome = outcome as NonNullable<ArcRollupIncrement["outcome"]>;
      }
      return row;
    })
    .sort(compareIncrements);

  const questions = input.questionDocs
    .filter((q) => arcRefOf(q) === id)
    .map((q) => {
      const qd = bagOf(q);
      return {
        id: q.id,
        title: str(qd, "title"),
        description: str(qd, "description"),
        stakes: str(qd, "stakes"),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const adrs = input.adrs
    .filter((a) => a.arc === id)
    .map((a) => ({ number: a.number, status: a.status, title: a.title }))
    .sort((a, b) => a.number - b.number);

  const stories = input.storyStamps.filter((s) => s.arc === id).map((s) => s.story);

  return {
    id,
    title: str(doc, "title"),
    description: str(doc, "description"),
    lifecycle: arcIsClosed(arc) ? "closed" : "active",
    intent: str(doc, "intent"),
    endState: str(doc, "endState"),
    increments,
    adrs,
    stories,
    questions,
    waiting: questions.length > 0,
  };
}

/** What {@link loadArcRollup} / {@link loadArcRollups} need to read the children from. */
export interface ArcRollupDeps {
  /** The doc store — the live store under `--pg` (arcs/plans live only there), the seed offline. */
  store: Store;
  /** `docs/decisions` — scanned for frontmatter `arc:` stamps. */
  decisionsDir: string;
  /** `stories/` — each `<id>/story.md` frontmatter scanned for an `arc:` stamp. */
  storiesDir: string;
}

/** Load the three child sets once — so a multi-arc rollup does not re-scan per arc. */
async function loadChildren(deps: ArcRollupDeps): Promise<Omit<ArcRollupInput, "arc">> {
  const [incrementDocs, questionDocs] = await Promise.all([
    deps.store.queryDocs({ kind: "increment" }),
    deps.store.queryDocs({ kind: "open-question" }),
  ]);
  return {
    incrementDocs,
    questionDocs,
    adrs: loadTitledAdrMetas(deps.decisionsDir).adrs,
    storyStamps: storyArcStamps(deps.storiesDir),
  };
}

/**
 * One arc's rollup, or null when `id` names nothing or names a doc of another kind. The caller
 * decides how to report the miss — the CLI with an ADR-0023 envelope, the server with a 404.
 */
export async function loadArcRollup(deps: ArcRollupDeps, id: string): Promise<ArcRollup | null> {
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "arc") return null;
  return deriveArcRollup({ arc: stored, ...(await loadChildren(deps)) });
}

/**
 * Every arc's rollup, id-sorted — the studio's list read (ADR-0267 D7: "which arcs are currently
 * running... which are waiting"). Loads the child sets ONCE and joins each arc against them, so the
 * cost is one query per kind rather than one per arc.
 *
 * Returns ALL arcs including closed ones; filtering to ADR-0239 D3's active-only default is the
 * caller's, because the CLI list and the studio surface may want different defaults.
 */
export async function loadArcRollups(deps: ArcRollupDeps): Promise<ArcRollup[]> {
  const arcs = await deps.store.queryDocs({ kind: "arc" });
  const children = await loadChildren(deps);
  return arcs
    .map((arc) => deriveArcRollup({ arc, ...children }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
