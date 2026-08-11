import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { STORY_REF_PREFIX } from "@storytree/library";

import { loadTitledAdrMetas, type TitledAdrMeta } from "./adr-metas.js";
import type { AdrStatus } from "./adr-frontmatter.js";
import {
  danglingCiteReasons,
  loadWorkHierarchyIndex,
  resolveCites,
  type WorkUnit,
} from "./work-hierarchy.js";

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
  /**
   * The typed work-hierarchy + guidance pointers this increment carries (ADR-0306 D2), VERBATIM and
   * in author order. Store-resident, so unlike {@link ArcRollup.stories} it is identical for every
   * session with no merge in the path.
   */
  cites?: string[];
  /**
   * The subset of `cites` this CHECKOUT cannot honour, as one-line reasons (ADR-0306 D1's report).
   * Work-hierarchy refs only — an `asset:` pointer is resolved by the store, not by a disk scan, and
   * `libraryHealth`'s referential-integrity leg is what fails a dangling one.
   *
   * Absent when everything lands. Present is NOT an error: the hierarchy is branch-dependent, so a
   * ref naming a story that exists only on another branch is legal and this is how it says so.
   */
  danglingCites?: string[];
  /** Present ⇔ `status` is `closed`: what happened, and why (ADR-0305 D5). */
  outcome?: { date?: string; pr?: string; note?: string };
}

/**
 * One story reachable from this arc through the STORE — an increment's `story:` citation
 * (ADR-0306 D2), joined here so ADR-0306 D4's second path has a shape of its own.
 *
 * Deliberately NOT merged into {@link ArcRollup.stories}, and that separation is the decision, not a
 * rendering nicety. The two edges answer different questions — the frontmatter stamp says *this arc
 * PRODUCED this story* and is a scan of whichever working tree the command ran in; the citation says
 * *an increment of this arc TOUCHED this story* and is the same for every session. D4: "a reader who
 * cannot tell a store-resident edge from a scan of the local working tree cannot tell whether a
 * story's absence means anything."
 */
export interface ArcRollupCitedStory {
  /** The cited story id — as authored, whether or not this checkout has it. */
  id: string;
  /** The increment ids citing it, sorted — so a reader can follow the edge back to its reason. */
  by: string[];
  /**
   * Whether a story of that id exists in THIS checkout. `false` is a REPORT (ADR-0306 D1): the id
   * stays listed, because dropping it would make the store-resident edge look branch-dependent too.
   */
  present: boolean;
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
  /**
   * Story directory names carrying this arc's frontmatter stamp (ADR-0183 D3) — a DISK SCAN of the
   * running checkout, so it is branch-dependent and always relative to one working tree.
   *
   * ADR-0306 D4 keeps this path and adds {@link citedStories} beside it. Neither subsumes the other
   * and **no surface may silently merge them** — see {@link ArcRollupCitedStory}.
   */
  stories: string[];
  /**
   * Stories reachable through the STORE — the `story:` citations on this arc's increments
   * (ADR-0306 D2/D4). Identical for every session, id-sorted. The half of the arc's
   * branch-dependence that IS removable; the ADR stamp above is the half that is not, because an ADR
   * is a file in `docs/decisions/` and no citation edge changes that.
   */
  citedStories: ArcRollupCitedStory[];
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
 * PURE: the `lifecycle` ADR-0335's rule derives for an arc from its OWN increment log — or `null`
 * when the log carries no signal to derive one from.
 *
 * THIS IS THE ONE PLACE THE RULE LIVES. `recomputeArcLifecycle` (the write-time trigger in
 * `packages/cli/src/arc.ts`) and {@link reconcileArcLifecycles} (the sweep) both call it, so the
 * trigger and the reconciler cannot answer differently for the same arc. A reconciler carrying its
 * own copy of the predicate would be a second truth about the same field, and the drift it reported
 * would be indistinguishable from its own divergence.
 *
 * `null` ON AN EMPTY LOG IS THE LOAD-BEARING CASE, AND IT IS NOT THE SAME AS "DRAINED". ADR-0335 D1
 * requires an arc to be born with a bundled first increment, but writes the arc doc BEFORE it (so
 * that an interruption leaves a recoverable arc rather than an orphan increment). That ordering
 * opens a real window in which an arc legitimately has zero increments, and it was observed live on
 * 2026-08-11: `traversal-panel-arc` held a lone `created` event and no increment, then carried six
 * about an hour later — one session part-way through chartering it. Deriving `closed` there would
 * assert a landing history the arc does not have and close an initiative on the day it was
 * chartered. "The question was not asked" is a third answer, and the caller must handle it.
 *
 * The trigger never reaches that branch — `arc increment add|new|close` each write their increment
 * before recomputing, so at least one always exists — so returning `null` changes no write-time
 * behaviour. Only a sweep over every arc can see an empty log.
 */
export function deriveArcLifecycle(
  increments: readonly { readonly status: string }[],
): "active" | "closed" | null {
  if (increments.length === 0) return null;
  return increments.some((i) => isForwardLooking(i.status)) ? "active" : "closed";
}

/** One arc whose stored `lifecycle` disagrees with the lifecycle its own increment log derives. */
export interface ArcLifecycleDrift {
  id: string;
  title: string;
  /** What the arc doc says today. */
  stored: "active" | "closed";
  /** What ADR-0335's rule derives from the increment log. */
  derived: "active" | "closed";
  /** `close` when a drained arc still reads active; `reopen` when open work sits on a closed arc. */
  action: "close" | "reopen";
  open: number;
  landed: number;
}

/** An arc whose increment log derives nothing — see {@link deriveArcLifecycle}'s `null` branch. */
export interface ArcLifecycleNoSignal {
  id: string;
  title: string;
  stored: "active" | "closed";
}

/** What one reconciliation sweep found. `agreed` is counted so a clean run is never a silent one. */
export interface ArcLifecycleReconciliation {
  drift: ArcLifecycleDrift[];
  noSignal: ArcLifecycleNoSignal[];
  agreed: number;
}

/**
 * PURE: every arc whose stored `lifecycle` has drifted from what its increment log derives.
 *
 * WHY A SWEEP EXISTS AT ALL. ADR-0335 shipped its rule as a write-time TRIGGER with no reconciler,
 * so an arc is only ever re-evaluated when somebody happens to write an increment on it. Measured
 * against the live store on 2026-08-11, that left 14 of 25 `active` arcs holding zero forward-looking
 * increments — twelve of them because their last increment write predates the trigger reaching main
 * (2026-08-09, PR #1254), so the rule had never once run on them. On the map's arcs lens those arcs
 * render `running`, which is exactly the promise ADR-0267 D7 makes and this drift breaks.
 *
 * IT IS SYMMETRIC, AND THAT IS DELIBERATE. Reopening a closed arc that has open work is the same
 * rule read the other way, and it is the behaviour the trigger already has (ADR-0335 D2's auto-reopen
 * — parking forward-looking work on a closed arc reopens it). A sweep that only ever closed would be
 * a different rule wearing the same name.
 *
 * WHAT IT DOES NOT KNOW: an arc reopened by `arc reopen` (ADR-0337) with nothing parked is reported
 * as drift and will be closed, because the mechanical rule genuinely cannot express "open because a
 * human said so". That is not an oversight in this function — it is the trade ADR-0337 already names
 * and `session-staleness-arc-inc-03` states in its own text ("the arc will re-close on the next
 * increment write unless work is parked"). The reopen increment stays in the log either way
 * (increments are durable, ADR-0305 D3), so the record of the judgement survives the flip, and
 * parking the work reopens the arc.
 */
export function reconcileArcLifecycles(
  rollups: readonly ArcRollup[],
): ArcLifecycleReconciliation {
  const drift: ArcLifecycleDrift[] = [];
  const noSignal: ArcLifecycleNoSignal[] = [];
  let agreed = 0;
  for (const arc of rollups) {
    const derived = deriveArcLifecycle(arc.increments);
    if (derived === null) {
      noSignal.push({ id: arc.id, title: arc.title, stored: arc.lifecycle });
      continue;
    }
    if (derived === arc.lifecycle) {
      agreed += 1;
      continue;
    }
    const open = arc.increments.filter((i) => isForwardLooking(i.status)).length;
    drift.push({
      id: arc.id,
      title: arc.title,
      stored: arc.lifecycle,
      derived,
      action: derived === "closed" ? "close" : "reopen",
      open,
      landed: arc.increments.length - open,
    });
  }
  return { drift, noSignal, agreed };
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
  /**
   * This checkout's work-hierarchy units, keyed by id ({@link loadWorkHierarchyIndex}) — what turns
   * an increment's `story:`/`capability:` citation into a resolution verdict (ADR-0306 D1).
   *
   * OPTIONAL, and an omitted index means "do not resolve", never "nothing resolves". A caller with
   * no stories tree to scan (a pure unit test, a surface that only wants the store-resident half)
   * would otherwise report every ref as dangling — reading a missing SCANNER as a missing STORY is
   * exactly the falsified-absence error this edge exists to avoid.
   */
  workUnits?: ReadonlyMap<string, WorkUnit> | undefined;
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
      // The typed citation edge (ADR-0306 D2), read defensively like every other leg here. The refs
      // are carried VERBATIM; resolution is a separate, optional field, so a surface that only wants
      // to know what was authored never has to consult a checkout to find out.
      const cites = Array.isArray(pd["cites"])
        ? (pd["cites"] as unknown[]).filter((c): c is string => typeof c === "string")
        : [];
      if (cites.length > 0) {
        row.cites = cites;
        if (input.workUnits !== undefined) {
          const dangling = danglingCiteReasons(resolveCites(cites, input.workUnits));
          if (dangling.length > 0) row.danglingCites = dangling;
        }
      }
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

  // ADR-0306 D4's SECOND path, built from the increments above and kept beside `stories`, never
  // folded into it. One story may be cited by several increments, so the citers are collected rather
  // than the last one winning — the edge's value is being able to follow it back to the reason.
  const citedBy = new Map<string, Set<string>>();
  for (const inc of increments) {
    for (const ref of inc.cites ?? []) {
      if (!ref.startsWith(STORY_REF_PREFIX)) continue;
      const storyId = ref.slice(STORY_REF_PREFIX.length);
      if (storyId === "") continue;
      const set = citedBy.get(storyId);
      if (set) set.add(inc.id);
      else citedBy.set(storyId, new Set([inc.id]));
    }
  }
  const citedStories: ArcRollupCitedStory[] = [...citedBy.entries()]
    .map(([storyId, by]) => ({
      id: storyId,
      by: [...by].sort(),
      // With no index injected the question was not asked, so it is answered the way an unasked
      // question has to be: `true` (nothing observed the story to be missing). Reporting `false`
      // here would manufacture an absence out of a caller that simply had no tree to look at.
      present: input.workUnits === undefined ? true : input.workUnits.get(storyId)?.tier === "story",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

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
    citedStories,
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
    // Scanned ONCE per load alongside the stamps, and for the same reason: a multi-arc rollup must
    // not re-walk the tree per arc.
    workUnits: loadWorkHierarchyIndex(deps.storiesDir),
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
