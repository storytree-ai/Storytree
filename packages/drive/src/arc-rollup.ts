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

/** One landed increment as stored on the arc doc (schema-validated upstream; read defensively). */
export interface ArcRollupIncrement {
  date?: string;
  pr?: string;
  outcome?: string;
}

/**
 * One PARKED unit of work on the arc (ADR-0298 D1) — the successor to the retired `proposal` kind.
 * Read defensively like every other leg here: the schema validates on WRITE, this view never throws
 * on a malformed row.
 *
 * Deliberately projected SEPARATELY from `increments` rather than merged into one timeline: the two
 * have opposite lifecycles (parked vs landed), and a surface that showed them together would present
 * unbuilt intentions as things that happened (ADR-0298 D4).
 */
export interface ArcRollupProposal {
  id?: string;
  title?: string;
  /** When it was parked — the delivery ceiling's comparison point (ADR-0298 D3). */
  parked?: string;
  summary?: string;
  /** The source friction ids — the ceiling's join. */
  frictionRefs?: string[];
  /** Present ⇒ the work landed and the entry no longer presses. */
  realized?: { date?: string; pr?: string; note?: string };
}

/** A plan that cites this arc (`plan.arcRef`, ADR-0183 D3). */
export interface ArcRollupPlan {
  id: string;
  title: string;
  /** The plan's lifecycle (`draft`/`ready`/`consumed`/…); `"?"` when a doc predates or omits it. */
  status: string;
  /** The git anchor's short sha, or `"?"` when unreadable — the freshness check's subject. */
  anchorSha: string;
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
  /** The durable residue: the append-at-landing log (ADR-0183 D1), in authored order. */
  increments: ArcRollupIncrement[];
  /** The parked work the arc owns (ADR-0298 D1), in authored order — unbuilt, never a landing. */
  proposals: ArcRollupProposal[];
  plans: ArcRollupPlan[];
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
  /** EVERY plan doc — filtered here by `arcRef`, so a caller never re-implements the predicate. */
  planDocs: readonly StoredDoc[];
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

  const increments = Array.isArray(doc["increments"])
    ? (doc["increments"] as ArcRollupIncrement[])
    : [];

  const proposals = Array.isArray(doc["proposals"])
    ? (doc["proposals"] as ArcRollupProposal[])
    : [];

  const plans = input.planDocs
    .filter((p) => arcRefOf(p) === id)
    .map((p) => {
      const pd = bagOf(p);
      const anchor = pd["anchor"];
      const sha =
        typeof anchor === "object" && anchor !== null && typeof (anchor as Record<string, unknown>)["sha"] === "string"
          ? ((anchor as Record<string, unknown>)["sha"] as string).slice(0, 9)
          : "?";
      return {
        id: p.id,
        title: str(pd, "title"),
        status: typeof pd["status"] === "string" ? (pd["status"] as string) : "?",
        anchorSha: sha,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

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
    proposals,
    plans,
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
  const [planDocs, questionDocs] = await Promise.all([
    deps.store.queryDocs({ kind: "plan" }),
    deps.store.queryDocs({ kind: "open-question" }),
  ]);
  return {
    planDocs,
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
