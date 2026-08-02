// The proposal-drain ceiling — the PURE, DB-free core of `check:proposal-drain` (ADR-0287 D3).
//
// ADR-0287 closed the `tool` route's delivery gap by making it EMIT a `proposal` and cite it (D1/D2,
// built in PR #1088). D3 is the other half. Without it the proposal tier inherits precisely the
// failure the ADR measured on the route it replaced: `tool` archived a friction item the moment it
// was routed, which SATISFIED `check:friction-drain` — the loop's only fail-closed gate — while
// building nothing (6 of 125 delivered, measured 2026-08-02). A parked proposal nothing ever reads
// would be that same dead end one artifact further along.
//
// THE CEILING IS RECURRENCE-DRIVEN, NOT A COUNT (D3, owner call). A proposal is PARKED BY DESIGN —
// its own KIND_SPECS: "the decision is made, only the EXECUTION is deferred" — so a count ceiling
// would fight the kind's own purpose and force premature builds. A WARN-only worklist is refuted by
// ADR-0168's own cited evidence: the graduation queue "grew 31→58 in one session and drained
// nothing". So the pressure is metered in REAL COST instead (`asset:meter-fail-closed-caps-in-real-cost`,
// the ADR-0130 turn-cap precedent):
//
//   An open proposal goes RED when its source friction gains a reinforcement dated AFTER the
//   proposal was created — i.e. when the trap demonstrably bit someone again.
//
// A parked proposal nobody is hitting stays quiet indefinitely; one that keeps costing sessions
// escalates on its own. That is deliberately silent on a genuinely costly trap nobody happens to
// re-hit — ADR-0287's explicitly accepted risk, failing in the quiet direction rather than the noisy
// one.
//
// THERE IS NO TUNABLE NUMBER HERE, and that is a property rather than an omission. Every sibling
// ceiling (`friction-drain`, `graduation-drain`, `surface-coverage-drain`) is a count, so a red is
// always dischargeable by editing one integer — which is the whole reason ADR-0269 had to fence WHEN
// a ceiling may rise at all. A recurrence ceiling has no integer to edit. The only discharges are the
// two real ones, and both are existing verbs (see {@link ProposalDrainVerdict.recurrences}).
//
// NO CLOCK AND NO SESSION IDENTITY ARE INJECTED, unlike `friction-drain`'s ctx. The rule compares two
// STORED dates against each other, never against today, so the verdict is a pure function of the
// corpus. That also disposes of the sibling's "no marking your own homework" exclusion structurally
// rather than by a branch check: the comparison is day-granular and strictly `>`, so a proposal can
// never be redded by a reinforcement from the session that created it — that session's reinforcements
// are same-day at the latest, and same-day is a WARN. The session that REINFORCES is deliberately NOT
// excluded: a trap biting the current session is the strongest form of the signal this gate exists to
// carry.
//
// PURE by construction: no `node:` import, no DB, no clock — the live read lives in the thin
// `check-proposal-drain.ts` shell. Deliberately unlike its sibling, this core returns STRUCTURED hits
// rather than pre-formatted breach strings: a hit is a (proposal, friction, day, branch) tuple the
// report renders more than one way, and a test asserting on structure beats one regexing prose.

import { lifecycleOf } from "@storytree/library";

import { citedAssetIds } from "./proposal-citation.js";

/**
 * The minimal projection of a `proposal` doc the ceiling needs — deliberately decoupled from the
 * full schema so this core (and its test) carry no doc-shape dependency. The shell projects live
 * `StoredDoc`s down to this.
 */
export interface ProposalRecord {
  id: string;
  title?: string | undefined;
  /** The ISO timestamp `proposal new` stamps. Its DATE PART is the comparison point. */
  createdAt?: string | undefined;
  /**
   * The lifecycle-bearing fields, read through the UNIVERSAL projection (ADR-0196 D4: "any new
   * stateful kind MUST route through it — a second ad-hoc status surface is the failure mode this
   * ADR exists to end"), never re-derived here.
   *
   * Today `lifecycleOf("proposal", …)` returns `open` unconditionally — the tier has no closure
   * state, which is why "an OPEN proposal" in ADR-0287 D3 means every proposal in it. Routing
   * through the projection anyway costs one call and makes this check follow a closure state for
   * free the day one lands, instead of silently keeping a built proposal red forever.
   */
  status?: string | null | undefined;
  lifecycle?: string | null | undefined;
}

/** One entry of a friction item's recurrence log (`reinforcedBy`). */
export interface ReinforcementRecord {
  /** The branch (session) that re-hit the trap. */
  branch?: string | undefined;
  /** When, as the `YYYY-MM-DD` day stamp `friction reinforce` writes. */
  date?: string | undefined;
}

/**
 * The minimal projection of a `friction` doc — the SOURCE side of the citation edge. The gate scans
 * every friction item because the edge only exists there (ADR-0287 D1 puts no reverse pointer on the
 * proposal).
 */
export interface FrictionCitation {
  id: string;
  /** The raw `references` array as stored — parsed by {@link citedAssetIds}, never re-parsed here. */
  references?: unknown;
  /**
   * The delivery stamp written by `friction route --discharged-by`: the routed remedy LANDED (a PR /
   * ADR / `asset:` ref). This is the loop's ONE existing "delivered" signal and therefore this
   * gate's discharge — see {@link ProposalDrainVerdict.deliveredCount}.
   */
  dischargedBy?: string | undefined;
  /** The recurrence log — ADR-0168 D2's "testimony the adjudicator weighs, never a threshold". */
  reinforcedBy?: readonly ReinforcementRecord[] | undefined;
}

/** One reinforcement measured against the proposal it post-dates — the gate's unit of evidence. */
export interface RecurrenceHit {
  proposalId: string;
  proposalTitle: string;
  /** The proposal's creation DAY (`YYYY-MM-DD`) — the comparison point. */
  createdDay: string;
  /** The friction item that cites the proposal and carries this reinforcement. */
  frictionId: string;
  /** The reinforcement's day. */
  day: string;
  /** The branch (session) the trap bit again; `"?"` when the entry predates branch stamping. */
  branch: string;
}

/** The computed verdict — `level` drives the gate: `red` ⇒ non-zero exit ⇒ the remedy is owed. */
export interface ProposalDrainVerdict {
  level: "ok" | "warn" | "red";
  /** Every proposal read. */
  total: number;
  /** Open per the universal projection — today, all of them. */
  openCount: number;
  /** Non-open per the universal projection — today always 0 (the tier has no closure state). */
  closedCount: number;
  /**
   * Open proposals NO friction cites. Unreachable by the recurrence signal and quiet by design: a
   * proposal authored outside the `tool` route has no source friction to be reinforced, so it can
   * never red. Reported so an empty signal is visibly an empty signal (ADR-0095: no silent caps).
   */
  uncitedCount: number;
  /**
   * Open proposals whose every source friction carries `dischargedBy` — the remedy landed, so the
   * delivery obligation ADR-0287 opened is met and its reinforcements stop pressing.
   *
   * This is the gate's DISCHARGE, and it is an existing verb rather than a new one: `friction route
   * <id> --route tool --reason "…" --discharged-by "<ref>" --pg`. ADR-0287 D1 deliberately fenced on
   * the CITATION rather than the flag precisely so this re-run stays open for an item that already
   * cites its proposal. The cost is stated rather than hidden: a premature stamp silences the gate,
   * exactly as `route: nothing` can tombstone a live friction item. Both rest on honest adjudication
   * and both demand a reviewable ref.
   */
  deliveredCount: number;
  /** Reinforcements post-dating their proposal — the breach. One hit per (proposal, friction, entry). */
  recurrences: RecurrenceHit[];
  /**
   * SAME-DAY reinforcements. `reinforcedBy.date` is a day stamp and `createdAt` is a timestamp, so
   * on the shared day their order is genuinely unknowable. Surfaced as a WARN rather than resolved
   * silently in either direction: red would punish the ADR-0287 D4 backfill for parking a proposal
   * on the day it read the recurrence, and silence would swallow a real hit.
   */
  sameDay: RecurrenceHit[];
  /**
   * Proposals/reinforcements carrying no usable date, named. Never red — an unevaluable row is a
   * substrate gap, and this ceiling is fail-closed on the queue, fail-open on the substrate.
   */
  undated: string[];
}

/** The `YYYY-MM-DD` day of an ISO timestamp OR a bare day stamp; `null` when unusable. */
function dayOf(iso: string | undefined): string | null {
  if (typeof iso !== "string") return null;
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** True when the delivery stamp is present and meaningful (an empty string is not a delivery). */
function isDelivered(f: FrictionCitation): boolean {
  return typeof f.dischargedBy === "string" && f.dischargedBy.trim() !== "";
}

/**
 * Evaluate the proposal-drain ceiling over the live tier and the friction worklist that cites it.
 * Pure — both sides are injected, and the rule compares stored dates only.
 *
 * The join runs friction → proposal because that is the only direction the edge exists in (ADR-0287
 * D1): a friction item's `references` carry `asset:<proposal-id>`, and the proposal points back at
 * nothing.
 */
export function evaluateProposalDrain(
  proposals: readonly ProposalRecord[],
  frictions: readonly FrictionCitation[],
): ProposalDrainVerdict {
  const open = new Map<string, ProposalRecord>();
  let closedCount = 0;
  for (const p of proposals) {
    const life = lifecycleOf("proposal", { status: p.status, lifecycle: p.lifecycle });
    if (life === "open") open.set(p.id, p);
    else closedCount += 1;
  }

  // Resolve the edge once, against the in-memory open-proposal set — the bulk-scan half of the
  // shared token rule in `proposal-citation.ts`.
  const sources = new Map<string, FrictionCitation[]>();
  for (const f of frictions) {
    for (const id of citedAssetIds(f.references)) {
      if (!open.has(id)) continue;
      const bucket = sources.get(id);
      if (bucket === undefined) sources.set(id, [f]);
      else bucket.push(f);
    }
  }

  const recurrences: RecurrenceHit[] = [];
  const sameDay: RecurrenceHit[] = [];
  const undated: string[] = [];
  let uncitedCount = 0;
  let deliveredCount = 0;

  for (const [id, proposal] of open) {
    const srcs = sources.get(id) ?? [];
    if (srcs.length === 0) {
      uncitedCount += 1;
      continue;
    }
    // Delivered on every source: the obligation is met, so its recurrences no longer press. A trap
    // that recurs AFTER a landed remedy is new friction to file and re-adjudicate, not a claim about
    // this proposal — and `dischargedBy` carries no date to compare against anyway.
    const pending = srcs.filter((f) => !isDelivered(f));
    if (pending.length === 0) {
      deliveredCount += 1;
      continue;
    }
    const createdDay = dayOf(proposal.createdAt);
    if (createdDay === null) {
      undated.push(`proposal ${id} carries no usable createdAt, so no recurrence can be dated against it`);
      continue;
    }
    for (const f of pending) {
      for (const r of f.reinforcedBy ?? []) {
        const day = dayOf(r.date);
        if (day === null) {
          undated.push(`friction ${f.id} carries a reinforcement with no usable date (proposal ${id})`);
          continue;
        }
        if (day < createdDay) continue; // the historical pressure that justified parking it — quiet.
        const hit: RecurrenceHit = {
          proposalId: id,
          proposalTitle: proposal.title ?? "",
          createdDay,
          frictionId: f.id,
          day,
          branch: r.branch ?? "?",
        };
        if (day > createdDay) recurrences.push(hit);
        else sameDay.push(hit);
      }
    }
  }

  const level: ProposalDrainVerdict["level"] =
    recurrences.length > 0 ? "red" : sameDay.length > 0 || undated.length > 0 ? "warn" : "ok";

  return {
    level,
    total: proposals.length,
    openCount: open.size,
    closedCount,
    uncitedCount,
    deliveredCount,
    recurrences,
    sameDay,
    undated,
  };
}
