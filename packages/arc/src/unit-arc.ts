/**
 * WHICH ARC A UNIT ID BELONGS TO — `replay-answers-retrieval-ease-arc`, increment
 * `trace-rail-names-the-arc` (ADR-0541 D1).
 *
 * A traversal trace records the unit a session named for itself (`cut_for`), and that value is a
 * MIXED NAMESPACE: it holds arc ids (`website-refresh-arc`), increment ids of the generated shape
 * (`context-window-composition-arc-inc-01`) and bare increment slugs
 * (`the-cliffs-dark-base-must-read-against-the-sea`). None of those three can be told apart by
 * looking at the string, and every attempt to do so is a guess about a naming convention nobody
 * enforces. So the resolution is a LOOKUP against the corpus, never a pattern match: an increment
 * resolves through its own `arcRef` containment edge, an arc resolves to itself, and anything else
 * resolves to NOTHING.
 *
 * ⚠ "NOTHING" IS AN ANSWER, AND IT IS NOT THE SAME ANSWER AS "NOT RECORDED" (ADR-0541 D4). A unit
 * that resolves to no arc is a session that claimed real work belonging to no arc — 20% of the
 * measured September population, `r3f-world-spike` (renamed `forest-rendering-engine` and then split
 * into four lanes on 2026-09-12, ADR-0562 — the September trace rows still carry the ORIGINAL id, so
 * this recorded measurement keeps it) and 26 other unhomed units. Collapsing that into
 * "we don't know" reports known work as unknown and inflates the apparent unknown share from 13% to
 * 33%. This module therefore returns the units it was GIVEN alongside the arcs it resolved, so a
 * caller can tell an empty arc list over a non-empty unit list (worked on no arc) from an empty one
 * over no units at all (nothing recorded).
 *
 * ⚠ NOTHING HERE INFERS AN ARC FROM A WORKTREE SLOT, and that refusal is the decision rather than an
 * omission (ADR-0541 D3). `events.claim_event.session_id` is the pooled worktree SLOT, so joining a
 * trace to the claim ledger through it answers "every arc ever worked in this worktree" — one
 * sampled slot had accumulated five while its own session declared a sixth, ~1 in 10 wrong on n=11.
 * A guessed attribution is strictly worse than an absent one because a reader cannot tell them
 * apart, and the comparison this whole arc exists to enable is exactly what a silently mis-filed
 * session corrupts.
 *
 * The pure half takes an index and answers; the loader builds that index with two queries. Split so
 * the resolution rule is testable without a store, on the `arc-rollup.ts` precedent.
 */
import type { Store, StoredDoc } from "@storytree/storage-protocol";

import { arcRefOf } from "./arc-rollup.js";

/**
 * The corpus facts the resolution needs, and nothing else: which ids are increments (and which arc
 * each one names), and which ids are arcs.
 *
 * Two lookups rather than one merged map, because the two answers are different in kind — an
 * increment POINTS AT an arc, an arc IS one — and merging them would make a self-pointing arc
 * indistinguishable from an increment whose `arcRef` happened to name itself.
 */
export interface UnitArcIndex {
  /** Increment id → the arc it cites through `arcRef`. Absent = the increment cites no readable arc. */
  readonly incrementArcs: ReadonlyMap<string, string>;
  /** Every arc id in the corpus. A unit that IS an arc resolves to itself. */
  readonly arcs: ReadonlySet<string>;
}

/** What a set of recorded units resolves to. Both halves travel, for the D4 reason in the header. */
export interface UnitArcResolution {
  /**
   * The units as they were recorded, in first-seen order, deduped. Empty means the session recorded
   * nothing — which is a different fact from recording units that belong to no arc.
   */
  readonly units: readonly string[];
  /**
   * Every distinct arc the units resolve to, in first-seen order. SEVERAL ARE LISTED, never reduced
   * to one (ADR-0541 D4): a session that worked across two arcs worked across two arcs, and picking
   * a winner would be an editorial claim the record does not support.
   */
  readonly arcs: readonly string[];
}

/**
 * PURE: the arc one unit id belongs to, or null when the corpus does not place it on one.
 *
 * The increment lookup runs FIRST. An id that is both an increment and an arc cannot exist (ids are
 * the store's primary key), so the order is not a tie-break — it is stated so a reader knows the
 * question is asked once rather than merged.
 */
export function arcOfUnit(unit: string, index: UnitArcIndex): string | null {
  const viaIncrement = index.incrementArcs.get(unit);
  if (viaIncrement !== undefined) return viaIncrement;
  return index.arcs.has(unit) ? unit : null;
}

/**
 * PURE: resolve every recorded unit, keeping the units themselves so the caller can distinguish the
 * two empty-arc cases.
 *
 * Blank and duplicate units are dropped on the way in — a blank names nobody (the rule the trace's
 * own rider fold already applies) and a duplicate would make a two-line list of one unit read as two.
 */
export function resolveUnitArcs(
  units: readonly string[],
  index: UnitArcIndex,
): UnitArcResolution {
  const seenUnits: string[] = [];
  const arcs: string[] = [];
  for (const unit of units) {
    const trimmed = unit.trim();
    if (trimmed.length === 0 || seenUnits.includes(trimmed)) continue;
    seenUnits.push(trimmed);
    const arc = arcOfUnit(trimmed, index);
    if (arc !== null && !arcs.includes(arc)) arcs.push(arc);
  }
  return { units: seenUnits, arcs };
}

/**
 * PURE: build the index from already-loaded docs. Exported so a caller that has the child sets in
 * hand (an arc rollup load, a test) does not pay two more queries for them.
 */
export function buildUnitArcIndex(
  incrementDocs: readonly StoredDoc[],
  arcDocs: readonly StoredDoc[],
): UnitArcIndex {
  const incrementArcs = new Map<string, string>();
  for (const doc of incrementDocs) {
    const arc = arcRefOf(doc);
    // An increment whose `arcRef` is absent or unreadable is left OUT rather than mapped to a
    // placeholder: `arcOfUnit` then answers null for it, which is the honest "the corpus does not
    // place this on an arc" — the same answer a capability gets, and the correct one.
    if (arc !== null) incrementArcs.set(doc.id, arc);
  }
  return { incrementArcs, arcs: new Set(arcDocs.map((doc) => doc.id)) };
}

/**
 * The NARROW slice of the store this lookup needs — `queryDocs` and nothing else, the posture
 * `loadFloorHealthReading` already takes.
 *
 * Narrow on purpose rather than by accident: it is what lets a caller that cannot resolve
 * `@storytree/storage-protocol` at all — apps/desktop, under pnpm's strict isolation — satisfy the
 * seam with a fixture it can actually write, without a second spelling of the whole `Store`.
 */
export type UnitArcStore = Pick<Store, "queryDocs">;

/**
 * Load the index from the store — two queries, run together, exactly the pair `loadChildren` runs
 * for a rollup.
 *
 * It reads the store and nothing else: no `stories/` scan, no ADR metas, no clock. A caller with no
 * store (the offline json backend) must not call this and invent an empty index instead — an empty
 * index resolves every unit to nothing, which would report a recorded arc as "worked on no arc".
 * That distinction is the caller's to carry, and both HTTP surfaces carry it as a payload flag.
 */
export async function loadUnitArcIndex(store: UnitArcStore): Promise<UnitArcIndex> {
  const [incrementDocs, arcDocs] = await Promise.all([
    store.queryDocs({ kind: "increment" }),
    store.queryDocs({ kind: "arc" }),
  ]);
  return buildUnitArcIndex(incrementDocs, arcDocs);
}
