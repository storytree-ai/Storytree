/**
 * THE COHORT SPLIT — the named groups `unlinked-corpus-half-arc` puts to the owner, and the read
 * record each one carries.
 *
 * ## A COHORT IS A JUDGMENT, AND THIS IS THE JUDGMENT
 *
 * The increment says so outright: tier is the obvious first cut, but age, lifecycle and authoring
 * source may cut across it. What the measurement found is that ONE cut explains almost everything
 * and it is not tier — it is WHY the row carries no edge, which {@link EdgeFreeReason} already
 * derives mechanically from the schema and the row. So the cohorts are built on that, with tier as
 * the secondary key, and each cohort is a group for which a single disposition (LINK / RETIRE /
 * LEAVE AND FIX THE DENOMINATOR) is coherent. A cohort mixing two dispositions is a cohort drawn
 * wrong.
 *
 * ## THE READ RECORD IS JOINED, NOT SUMMED
 *
 * Two records observe reads and they OVERLAP by construction — the live CLI observer mints an event
 * as `storytree library artifact <id>` runs, and the same invocation is also in the host transcript
 * that recorded the command. `probe:decision-baseline` resolves this by taking reads from ONE
 * source; this one needs both, because the trace store reaches back further and sees the `agents`
 * and `tree` surfaces while the transcript sweep reaches sessions the observer never identified.
 *
 * So they are reported SIDE BY SIDE and never added. The only merged figure is
 * {@link CohortReadRecord.observedNodes} — "was this ever seen being read", a union over a boolean,
 * which no amount of overlap can inflate.
 */

import type { EdgeFreeReason, LinkageNode } from "./corpus-linkage.js";
import type { ReadRecord } from "./corpus-read-record.js";

/** The record tiers — rows logging what a session DID, as against what is true. */
export const RECORD_TIERS: ReadonlySet<string> = new Set([
  "friction",
  "increment",
  "arc",
  "open-question",
  "template",
]);

/** One cohort's read record, from one source. Both denominators, always. */
export interface CohortReadRecord {
  /** Nodes seen read by THIS source. */
  readonly readNodes: number;
  /** Raw read events. Never added across sources — see the header. */
  readonly reads: number;
  /** DISTINCT sessions (trace) or context windows (transcript) that read any member. */
  readonly sessions: number;
  /** Empty when nothing in the cohort was ever observed being read. */
  readonly lastAt: string;
}

/** One named cohort, its membership and everything measured about it. */
export interface Cohort {
  readonly key: string;
  /** The mechanical reason every member carries no walkable edge. */
  readonly reason: EdgeFreeReason;
  readonly tierClass: "record" | "knowledge";
  readonly nodes: readonly LinkageNode[];
  readonly trace: CohortReadRecord;
  readonly transcript: CohortReadRecord;
  /** Seen read by EITHER source — a union over a boolean, so the overlap cannot inflate it. */
  readonly observedNodes: number;
  /** Members named in an agent's assembled manifest: injected into a prompt, minting no read. */
  readonly inAgentManifest: number;
}

function foldSource(
  nodes: readonly LinkageNode[],
  record: ReadonlyMap<string, ReadRecord>,
): CohortReadRecord {
  let readNodes = 0;
  let reads = 0;
  let lastAt = "";
  // UNIONED, never summed: one session that read four members of a cohort is one session. Summing
  // the per-artifact counts would report four, and "how many sessions consult this cohort" is the
  // only form of the number that argues anything.
  const sessions = new Set<string>();
  for (const node of nodes) {
    const hit = record.get(node.rowId);
    if (hit === undefined) continue;
    readNodes += 1;
    reads += hit.reads;
    for (const session of hit.sessions) sessions.add(session);
    // Stryker disable next-line EqualityOperator: EQUIVALENT — on two EQUAL timestamps the strict and
    // the non-strict comparison both leave the same string in `lastAt`.
    if (hit.lastAt > lastAt) lastAt = hit.lastAt;
  }
  // No empty-case branch: with nothing read, every counter is already zero and `lastAt` is already
  // the empty string a caller prints as NEVER OBSERVED. A separate constant for that case would be
  // a branch indistinguishable from this one.
  return { readNodes, reads, sessions: sessions.size, lastAt };
}

/**
 * PURE: split the unlinked nodes into cohorts and join every measurement onto each.
 *
 * LINKED nodes are excluded by construction — this classifies the unlinked half, which is the
 * question. The caller reports the linked population as the denominator beside it.
 */
export function buildCohorts(
  nodes: readonly LinkageNode[],
  traceReads: ReadonlyMap<string, ReadRecord>,
  transcriptReads: ReadonlyMap<string, ReadRecord>,
  agentManifest: ReadonlySet<string>,
): readonly Cohort[] {
  const groups = new Map<string, LinkageNode[]>();
  for (const node of nodes) {
    if (node.edgeFreeReason === null) continue;
    const tierClass = RECORD_TIERS.has(node.kind) ? "record" : "knowledge";
    // AGENT-MANIFEST MEMBERSHIP SPLITS THE COHORT, and it is the one cut that is not about the
    // schema. An artifact an agent's `context`/`rules`/`antiPatterns` names is assembled into that
    // agent's system prompt on every run: the relationship EXISTS and the dependency graph simply
    // fails to record it, which is a known answer (LINK) rather than a question. Leaving these
    // mixed in with their tier would put ten already-reached artifacts in front of the owner to
    // adjudicate, and would break this module's own rule that a cohort mixing two dispositions is
    // drawn wrong. Raised by the `traversal-panel-arc` session holding the instrument.
    const suffix = agentManifest.has(node.rowId) ? "/IN-AGENT-MANIFEST" : "";
    const key = `${tierClass}/${node.kind}/${node.edgeFreeReason}${suffix}`;
    let members = groups.get(key);
    if (members === undefined) {
      members = [];
      groups.set(key, members);
    }
    members.push(node);
  }

  return [...groups.entries()]
    .map(([key, members]) => {
      const first = members[0]!;
      const observedNodes = members.filter(
        (node) => traceReads.has(node.rowId) || transcriptReads.has(node.rowId),
      ).length;
      return {
        key,
        reason: first.edgeFreeReason as EdgeFreeReason,
        tierClass: RECORD_TIERS.has(first.kind) ? ("record" as const) : ("knowledge" as const),
        nodes: members,
        trace: foldSource(members, traceReads),
        transcript: foldSource(members, transcriptReads),
        observedNodes,
        inAgentManifest: members.filter((node) => agentManifest.has(node.rowId)).length,
      };
    })
    .sort(bySizeThenKey);
}

/**
 * Order the cohorts: the biggest population first, ties by key.
 *
 * Named for `byUnlinkedThenKind`'s reason — SIZE is the reading a reader acts on, and the key is
 * only there to keep two equal cohorts in a stable order.
 */
function bySizeThenKey(a: Cohort, b: Cohort): number {
  const bySize = b.nodes.length - a.nodes.length;
  return bySize === 0 ? a.key.localeCompare(b.key) : bySize;
}

/**
 * PURE: what else was read in the same session as a member of this cohort.
 *
 * PURPOSE IS READ OFF CO-OCCURRENCE, NEVER GUESSED FROM THE TITLE (the increment's step 3). An
 * unlinked artifact that always appears beside the same three neighbours has a relationship the
 * graph is failing to record; one that appears alone and rarely is a different finding entirely.
 *
 * The neighbour must be a DIFFERENT artifact and the co-read is counted once per session, so a
 * session that opened one artifact forty times cannot manufacture a relationship on its own.
 */
export function coReadNeighbours(
  memberIds: ReadonlySet<string>,
  sessionReads: ReadonlyMap<string, ReadonlySet<string>>,
  limit: number,
): readonly { readonly id: string; readonly sessions: number }[] {
  const tally = new Map<string, number>();
  for (const ids of sessionReads.values()) {
    let touchesCohort = false;
    for (const id of ids) {
      if (memberIds.has(id)) {
        touchesCohort = true;
        break;
      }
    }
    if (!touchesCohort) continue;
    for (const id of ids) {
      if (memberIds.has(id)) continue;
      tally.set(id, (tally.get(id) ?? 0) + 1);
    }
  }
  return [...tally.entries()]
    .map(([id, sessions]) => ({ id, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.id.localeCompare(b.id))
    .slice(0, limit);
}
