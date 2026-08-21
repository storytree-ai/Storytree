/**
 * `pnpm probe:adr-graph` — the decision log's edge census BY TYPE, its acyclicity verdicts, and the
 * `amends`-only ladder. `adrs-into-the-dag-arc` increment 02 (the cycle census).
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG, and deliberately so** — the `probe:depth-from-work` precedent
 * exactly. The increment's fence says this measures and writes nothing: no corpus write, no ADR
 * edit, no decision changed, and NO GATE ENFORCES THE RESULT. A `check:` name would be picked up by
 * the gate plan's unplanned-check guard, which is the concrete reason the verb is `probe:`.
 *
 * ## THE TRAP THIS FILE EXISTS TO HOLD
 *
 * `supersedes` and `amends` mean OPPOSITE things and must never be summed. `supersedes` points a new
 * decision back at the one it REPLACED, so a long supersedes chain measures how many times a thing
 * was re-decided — archaeology, not distance from the work. `amends` means "still standing, and
 * rests on this", and that is the edge that means DEPTH. Any output reporting one combined figure
 * has already failed; the 495-edge / 17-deep figures measured 2026-08-20 spanned both types together
 * and are therefore not numbers this arc can claim.
 *
 * **The exclusion is enforced by the SHAPE of the code, not by a comment.** {@link AmendsRow} and
 * {@link SupersedesRow} each expose ONE edge field, so a ladder builder literally cannot see the
 * other; {@link AmendsLadder} and {@link SupersedesLadder} are branded on `edge`, so TypeScript
 * refuses to hand one to the other's walk. There is no edge-type parameter anywhere — a walk that
 * took a flag would eventually be called with the wrong one. The single place both lists appear
 * together is {@link unionCycles}, whose return type is cycles and ONLY cycles: it is structurally
 * incapable of emitting a combined count or a combined depth.
 *
 * ## CYCLE CHECK BEFORE ANY DEPTH WALK
 *
 * ADR-0223 D4 made ADRs the bedrock nothing sits below, specifically so the knowledge tree could not
 * loop. Walking INTO them re-opens that question, and the ADR graph has never been checked. A depth
 * walk over a cyclic graph hangs or silently truncates, and a silently truncated depth is worse than
 * the flat number it replaced because it looks like an answer. So: acyclicity is judged first, by the
 * corpus's EXISTING detector (`findDependsOnCycles`, artifact `library-dag-acyclic-core`) rather than
 * a second implementation — and {@link longestPathOver} is independently incapable of hanging
 * (explicit `visiting` colour marking) and THROWS rather than truncating if it ever meets a loop.
 *
 * If a cycle IS found, the cycle is the deliverable. Nothing here repairs the decision log to make a
 * walk succeed — a loop in the log is a fact about the log that the owner needs to see.
 *
 * ## WHAT A LIBRARY POINTER TERMINATING AT AN ADR WOULD COST
 *
 * The last section reads the live corpus and characterises the `doc:` pointers that land on an ADR
 * (390 of 778 authored `dependsOn` pointers, measured 2026-08-20). It reports the ceiling under BOTH
 * candidate resolutions of the owner's open question and RECOMMENDS NEITHER — the choice is the
 * owner's, and this increment only supplies the arithmetic.
 *
 * Exit 0 when the census completed; 1 when a graph is cyclic, an invariant fails, or the corpus half
 * could not be read. `--adrs-only` skips the corpus half (the disk census needs no database).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdrMetas, openCorpusStore, type AdrMeta } from "@storytree/drive";
import {
  depthFromWorkNodes,
  evaluateDepthFromWork,
  findDependsOnCycles,
  readDependsOnPointers,
  REPO_ROOT_ENV,
  resolveRepoRoot,
} from "@storytree/library";

const TAG = "probe:adr-graph";

/** The repo root — a PARAMETER (ADR-0246), not a derivation from this file's own location. */
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
}).root;

const DECISIONS_DIR = path.join(repoRoot, "docs", "decisions");

/** How an ADR number renders in every line and every cycle path this probe prints. */
function label(adr: number): string {
  return `ADR-${String(adr).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// THE TWO EDGE TYPES, KEPT APART BY TYPE
// ---------------------------------------------------------------------------------------------

/**
 * The ONLY view of an ADR an `amends` question is allowed to see.
 *
 * `supersedes` is absent from the type, so {@link buildAmendsLadder} cannot read it even by mistake.
 * `AdrMeta` is assignable here (it has the field), which is the point: the caller passes the whole
 * record and the callee's parameter type is what performs the exclusion.
 */
export interface AmendsRow {
  readonly number: number;
  readonly amends: readonly number[];
}

/** The ONLY view of an ADR a `supersedes` question is allowed to see. `amends` is out of scope. */
export interface SupersedesRow {
  readonly number: number;
  readonly supersedes: readonly number[];
}

/**
 * A ladder over ONE edge type, branded on `edge` so the two cannot be interchanged.
 *
 * Every count is per-EDGE except {@link Ladder.filesCarrying}, which is per-FILE. Reporting only one
 * of those two is how "283 ADRs carry `amends`" gets quietly read as "283 amends edges".
 */
interface Ladder<E extends "amends" | "supersedes"> {
  /** The brand. Its literal type is what makes {@link AmendsLadder} unassignable to a supersedes walk. */
  readonly edge: E;
  /** Adjacency over RESOLVABLE targets only (a target with no file on disk cannot be walked into). */
  readonly out: ReadonlyMap<number, readonly number[]>;
  /** How many ADR files were judged — the denominator, so a clean verdict can never hide an empty read. */
  readonly nodes: number;
  /** How many FILES carry at least one edge of this type. */
  readonly filesCarrying: number;
  /** How many EDGES of this type exist in total, dangling ones included. */
  readonly edgesTotal: number;
  /** How many of those name an ADR that is actually on disk. */
  readonly edgesResolvable: number;
  /** Targets naming no ADR file here. Counted and named, never silently dropped. */
  readonly danglingTargets: readonly { readonly from: number; readonly to: number }[];
  /** ADR numbers seen more than once (the `adr-number-unique` gate's failure mode). First row wins. */
  readonly duplicateNumbers: readonly number[];
}

export type AmendsLadder = Ladder<"amends">;
export type SupersedesLadder = Ladder<"supersedes">;

/**
 * Build the `amends` ladder. This function NEVER SEES `supersedes` — its parameter type does not
 * carry the field, so the exclusion survives a later edit that forgets why it mattered.
 *
 * Deliberately duplicated rather than shared with {@link buildSupersedesLadder} through a
 * field-selecting parameter: a selector IS the edge-type flag this file exists to avoid, and the
 * duplication is fifteen lines against a class of error that has already cost this project a
 * confident, meaningless number.
 */
export function buildAmendsLadder(rows: readonly AmendsRow[]): AmendsLadder {
  const known = new Set(rows.map((row) => row.number));
  const out = new Map<number, readonly number[]>();
  const danglingTargets: { from: number; to: number }[] = [];
  const duplicateNumbers: number[] = [];
  let filesCarrying = 0;
  let edgesTotal = 0;
  let edgesResolvable = 0;

  for (const row of rows) {
    if (out.has(row.number)) {
      duplicateNumbers.push(row.number);
      continue; // First row wins, matching `findDependsOnCycles`' duplicate rule.
    }
    if (row.amends.length > 0) filesCarrying += 1;
    edgesTotal += row.amends.length;
    const targets: number[] = [];
    for (const target of row.amends) {
      if (known.has(target)) targets.push(target);
      else danglingTargets.push({ from: row.number, to: target });
    }
    edgesResolvable += targets.length;
    out.set(row.number, targets);
  }

  return {
    edge: "amends",
    out,
    nodes: out.size,
    filesCarrying,
    edgesTotal,
    edgesResolvable,
    danglingTargets,
    duplicateNumbers,
  };
}

/** Build the `supersedes` ladder. This function NEVER SEES `amends` — see {@link buildAmendsLadder}. */
export function buildSupersedesLadder(rows: readonly SupersedesRow[]): SupersedesLadder {
  const known = new Set(rows.map((row) => row.number));
  const out = new Map<number, readonly number[]>();
  const danglingTargets: { from: number; to: number }[] = [];
  const duplicateNumbers: number[] = [];
  let filesCarrying = 0;
  let edgesTotal = 0;
  let edgesResolvable = 0;

  for (const row of rows) {
    if (out.has(row.number)) {
      duplicateNumbers.push(row.number);
      continue;
    }
    if (row.supersedes.length > 0) filesCarrying += 1;
    edgesTotal += row.supersedes.length;
    const targets: number[] = [];
    for (const target of row.supersedes) {
      if (known.has(target)) targets.push(target);
      else danglingTargets.push({ from: row.number, to: target });
    }
    edgesResolvable += targets.length;
    out.set(row.number, targets);
  }

  return {
    edge: "supersedes",
    out,
    nodes: out.size,
    filesCarrying,
    edgesTotal,
    edgesResolvable,
    danglingTargets,
    duplicateNumbers,
  };
}

// ---------------------------------------------------------------------------------------------
// ACYCLICITY — REUSED, NOT REBUILT
// ---------------------------------------------------------------------------------------------

/** One cycle as the operator reads it: the closed path of ADR labels. */
export type CyclePath = readonly string[];

/**
 * Cycles over one ladder, judged by the corpus's existing detector rather than a second one.
 *
 * `findDependsOnCycles` (`packages/library/src/knowledge-dag.ts`, artifact `library-dag-acyclic-core`)
 * already answers exactly this question with the three-colour walk and the rotation-canonical dedupe;
 * ADR numbers are simply rendered as ids so its output reads as ADR labels.
 */
function cyclesOver(ladder: AmendsLadder | SupersedesLadder): CyclePath[] {
  const nodes = [...ladder.out.entries()].map(([adr, targets]) => ({
    id: label(adr),
    dependsOn: targets.map(label),
  }));
  return findDependsOnCycles(nodes);
}

/** Is the `amends` graph ALONE acyclic? Typed so a supersedes ladder cannot be asked this. */
export function amendsCycles(ladder: AmendsLadder): CyclePath[] {
  return cyclesOver(ladder);
}

/** Is the `supersedes` graph ALONE acyclic? Typed so an amends ladder cannot be asked this. */
export function supersedesCycles(ladder: SupersedesLadder): CyclePath[] {
  return cyclesOver(ladder);
}

/**
 * THE ONE PLACE BOTH EDGE LISTS APPEAR TOGETHER — and it answers ONLY "is the union acyclic?".
 *
 * The union is a legitimate and DIFFERENT question from the amends-only one: the two answers can
 * disagree, and a loop that exists only across the two types is still a loop anything walking both
 * would meet. What is never legitimate is a combined COUNT or a combined DEPTH, so this returns
 * cycles and nothing else — the return type makes a summed figure unrepresentable rather than merely
 * discouraged, and no ladder is ever built over the union.
 */
export function unionCycles(rows: readonly AdrMeta[]): CyclePath[] {
  const known = new Set(rows.map((row) => row.number));
  const seen = new Set<number>();
  const nodes: { id: string; dependsOn: string[] }[] = [];
  for (const row of rows) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    nodes.push({
      id: label(row.number),
      dependsOn: [...row.amends, ...row.supersedes].filter((t) => known.has(t)).map(label),
    });
  }
  return findDependsOnCycles(nodes);
}

// ---------------------------------------------------------------------------------------------
// THE LADDER WALK — INCAPABLE OF HANGING, AND LOUD RATHER THAN TRUNCATING
// ---------------------------------------------------------------------------------------------

/** One bucket of the depth distribution. */
export interface DepthBucket {
  readonly depth: number;
  readonly count: number;
}

/** What one ladder's longest-path walk came to. `maxDepth` counts EDGES, not nodes. */
export interface LadderDepth {
  /** The longest directed path in the ladder, in EDGES. A ladder with no edges reads 0. */
  readonly maxDepth: number;
  /** Per-ADR longest downward path. Every judged ADR has an entry, including the isolated ones at 0. */
  readonly depthByNode: ReadonlyMap<number, number>;
  /** The deepest path itself, top ADR first, bedrock last — `maxDepth + 1` entries. */
  readonly deepestChain: readonly number[];
  /** How many ADRs sit at each depth, ascending. Sums to the ladder's node count. */
  readonly histogram: readonly DepthBucket[];
}

/**
 * Longest downward path per node over ONE ladder's adjacency.
 *
 * STRUCTURALLY INCAPABLE OF HANGING: memoised DFS with an explicit three-state colour map. Re-entry
 * into a `visiting` node THROWS, naming the loop — it never returns the truncated number, because a
 * silently truncated depth is worse than the flat figure it replaced.
 *
 * Private, and reached only through {@link longestAmendsChain} / {@link longestSupersedesChain}: it
 * takes a whole branded ladder rather than a bare adjacency plus an edge-type flag, so there is no
 * parameter here that a caller could get wrong.
 */
function longestPathOver(ladder: AmendsLadder | SupersedesLadder): LadderDepth {
  const { out } = ladder;
  const depth = new Map<number, number>();
  const deepestChild = new Map<number, number>();
  const state = new Map<number, "visiting" | "done">();

  const visit = (node: number, stack: readonly number[]): number => {
    const memo = depth.get(node);
    if (memo !== undefined) return memo;
    if (state.get(node) === "visiting") {
      const start = stack.lastIndexOf(node);
      const loop = [...stack.slice(start === -1 ? 0 : start), node].map(label).join(" → ");
      throw new Error(
        `${TAG}: the depth walk met a cycle on \`${ladder.edge}\` — ${loop}. ` +
          `Refusing to report a truncated depth; the cycle is the finding.`,
      );
    }
    state.set(node, "visiting");

    let best = 0;
    let bestChild: number | undefined;
    for (const target of out.get(node) ?? []) {
      const candidate = 1 + visit(target, [...stack, target]);
      // Ties break toward the LOWER ADR number so the named chain is stable run to run.
      if (candidate > best || (candidate === best && bestChild !== undefined && target < bestChild)) {
        best = candidate;
        bestChild = target;
      }
    }

    state.set(node, "done");
    depth.set(node, best);
    if (bestChild !== undefined) deepestChild.set(node, bestChild);
    return best;
  };

  for (const node of out.keys()) visit(node, [node]);

  let maxDepth = 0;
  let deepestTop: number | undefined;
  for (const [node, value] of depth) {
    if (value > maxDepth || (value === maxDepth && deepestTop !== undefined && node < deepestTop)) {
      maxDepth = value;
      deepestTop = node;
    }
  }

  const deepestChain: number[] = [];
  if (deepestTop !== undefined && maxDepth > 0) {
    let cursor: number | undefined = deepestTop;
    while (cursor !== undefined) {
      deepestChain.push(cursor);
      cursor = deepestChild.get(cursor);
    }
  }

  const counts = new Map<number, number>();
  for (const value of depth.values()) counts.set(value, (counts.get(value) ?? 0) + 1);

  return {
    maxDepth,
    depthByNode: depth,
    deepestChain,
    histogram: [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketDepth, count]) => ({ depth: bucketDepth, count })),
  };
}

/** The `amends`-only ladder depth — THE number this arc can honestly claim. */
export function longestAmendsChain(ladder: AmendsLadder): LadderDepth {
  return longestPathOver(ladder);
}

/**
 * The `supersedes`-only ladder depth — ARCHAEOLOGY: how many times a decision was re-decided.
 * It is NOT a distance from the work and must never be reported beside the amends figure as if the
 * two measured the same axis.
 */
export function longestSupersedesChain(ladder: SupersedesLadder): LadderDepth {
  return longestPathOver(ladder);
}

/**
 * Assert the reported chain is REAL: every consecutive pair is an actual edge of this ladder, and
 * the chain's length agrees with the reported depth.
 *
 * The chain is the one output a human is asked to spot-check by hand, so the probe checks its own
 * arithmetic before printing it. A mismatch throws rather than printing a plausible fiction.
 */
function assertChainIsReal(ladder: AmendsLadder | SupersedesLadder, walk: LadderDepth): void {
  const { deepestChain, maxDepth } = walk;
  if (maxDepth === 0) {
    if (deepestChain.length !== 0) {
      throw new Error(`${TAG}: a depth of 0 reported a non-empty chain on \`${ladder.edge}\`.`);
    }
    return;
  }
  if (deepestChain.length !== maxDepth + 1) {
    throw new Error(
      `${TAG}: \`${ladder.edge}\` depth ${maxDepth} but the named chain has ${deepestChain.length} ` +
        `entries (expected ${maxDepth + 1}).`,
    );
  }
  for (let index = 0; index + 1 < deepestChain.length; index += 1) {
    const from = deepestChain[index]!;
    const to = deepestChain[index + 1]!;
    if (!(ladder.out.get(from) ?? []).includes(to)) {
      throw new Error(
        `${TAG}: the named \`${ladder.edge}\` chain claims ${label(from)} → ${label(to)}, which is ` +
          `not an edge of this ladder.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// WHAT A LIBRARY POINTER TERMINATING AT AN ADR RESOLVES TO
// ---------------------------------------------------------------------------------------------

/** The `dependsOn` scheme that names an ADR (`DependsOnRef`: `doc:<relpath>`). */
const DOC_PREFIX = "doc:";
/** The `dependsOn` scheme that names a Library artifact. */
const ASSET_PREFIX = "asset:";

/**
 * PURE: the ADR number a `doc:` pointer lands on, or null when the pointer is not ADR-shaped.
 *
 * **BOTH PREFIX SPELLINGS ARE LIVE IN THE CORPUS AND BOTH ARE ACCEPTED HERE** — measured, not
 * assumed: authors write `doc:decisions/NNNN-….md` overwhelmingly and `doc:docs/decisions/NNNN-….md`
 * in a minority of rows, and the two name the same file. A parser matching only the repo-relative
 * spelling silently reclassifies the majority as "not an ADR" and reports a censured graph as a
 * sparse one — which is exactly the shape of failure this increment exists to avoid. The split is
 * counted and reported rather than normalised away, because an inconsistent pointer spelling is
 * itself a finding for whoever settles the sink rule.
 *
 * Total and non-throwing. A `doc:` pointer at some other file is a real thing an author may write,
 * so it is returned as null and COUNTED separately rather than coerced into an ADR number.
 */
export function adrNumberOfDocPointer(pointer: string): number | null {
  if (!pointer.startsWith(DOC_PREFIX)) return null;
  const rel = pointer.slice(DOC_PREFIX.length).replace(/\\/g, "/");
  const match = /(?:^|\/)decisions\/(\d{4})-[^/]*\.md$/.exec(rel);
  return match ? Number(match[1]) : null;
}

/** Which of the two live spellings a `doc:` ADR pointer used. Reported, never normalised silently. */
function docPointerSpelling(pointer: string): "docs/decisions" | "decisions" {
  return pointer.slice(DOC_PREFIX.length).replace(/\\/g, "/").startsWith("docs/")
    ? "docs/decisions"
    : "decisions";
}

/** Cap a listing so one malformed field cannot bury the census in its own output. */
function capped(lines: readonly string[], limit = 8): string[] {
  if (lines.length <= limit) return [...lines];
  return [...lines.slice(0, limit), `… and ${lines.length - limit} more`];
}

/** The corpus-side census of pointers that terminate at an ADR. */
interface PointerCensus {
  readonly artifactsScanned: number;
  readonly dependsOnTotal: number;
  readonly assetPointers: number;
  readonly docPointers: number;
  readonly adrPointers: number;
  /** The two live spellings, counted separately — see {@link adrNumberOfDocPointer}. */
  readonly spellings: ReadonlyMap<string, number>;
  readonly nonAdrDocPointers: readonly string[];
  readonly adrPointersResolving: number;
  readonly adrPointersDangling: readonly string[];
  /** ADR number → how many artifacts point at it. */
  readonly landedOn: ReadonlyMap<number, number>;
  /** One row per (artifact, ADR) pointer that resolves, with the artifact's own depth from the work. */
  readonly edges: readonly {
    readonly artifact: string;
    readonly adr: number;
    /** The pointing artifact's depth from the work, or null when it is unreachable from any anchor. */
    readonly libraryDepth: number | null;
  }[];
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** PURE: census the corpus's ADR-terminating pointers, given each artifact's depth from the work. */
function censusPointers(
  docs: readonly { readonly id: string; readonly doc: unknown }[],
  depthById: ReadonlyMap<string, number>,
  adrsOnDisk: ReadonlySet<number>,
): PointerCensus {
  const nonAdrDocPointers: string[] = [];
  const adrPointersDangling: string[] = [];
  const spellings = new Map<string, number>();
  const landedOn = new Map<number, number>();
  const edges: { artifact: string; adr: number; libraryDepth: number | null }[] = [];
  let dependsOnTotal = 0;
  let assetPointers = 0;
  let docPointers = 0;
  let adrPointers = 0;
  let adrPointersResolving = 0;

  for (const row of docs) {
    // ADR-0402 read tolerance, TEMPORARY — remove after the batch drain (depends-on-compat.ts).
    for (const pointer of readDependsOnPointers(row.doc)) {
      dependsOnTotal += 1;
      if (pointer.startsWith(ASSET_PREFIX)) {
        assetPointers += 1;
        continue;
      }
      if (!pointer.startsWith(DOC_PREFIX)) continue;
      docPointers += 1;
      const adr = adrNumberOfDocPointer(pointer);
      if (adr === null) {
        nonAdrDocPointers.push(`${row.id} → ${pointer}`);
        continue;
      }
      adrPointers += 1;
      const spelling = docPointerSpelling(pointer);
      spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
      if (!adrsOnDisk.has(adr)) {
        adrPointersDangling.push(`${row.id} → ${pointer}`);
        continue;
      }
      adrPointersResolving += 1;
      landedOn.set(adr, (landedOn.get(adr) ?? 0) + 1);
      edges.push({ artifact: row.id, adr, libraryDepth: depthById.get(row.id) ?? null });
    }
  }

  return {
    artifactsScanned: docs.length,
    dependsOnTotal,
    assetPointers,
    docPointers,
    adrPointers,
    spellings,
    nonAdrDocPointers,
    adrPointersResolving,
    adrPointersDangling,
    landedOn,
    edges,
  };
}

// ---------------------------------------------------------------------------------------------
// THE RUN
// ---------------------------------------------------------------------------------------------

function reportLadder(
  title: string,
  ladder: AmendsLadder | SupersedesLadder,
  cycles: readonly CyclePath[],
): void {
  console.log("");
  console.log(`  ${title}`);
  console.log(
    `    files carrying at least one \`${ladder.edge}\`: ${ladder.filesCarrying} of ${ladder.nodes}`,
  );
  console.log(
    `    \`${ladder.edge}\` EDGES: ${ladder.edgesTotal} total ` +
      `(${ladder.edgesResolvable} resolving to an ADR on disk, ${ladder.danglingTargets.length} dangling)`,
  );
  for (const line of capped(
    ladder.danglingTargets.map(({ from, to }) => `${label(from)} ${ladder.edge} ${label(to)} — no such file`),
  )) {
    console.log(`      dangling: ${line}`);
  }
  if (ladder.duplicateNumbers.length > 0) {
    console.log(`      ⚠ duplicate ADR numbers: ${ladder.duplicateNumbers.map(label).join(", ")}`);
  }
  console.log(
    `    acyclic: ${cycles.length === 0 ? "YES" : `NO — ${cycles.length} cycle(s)`}` +
      ` (over ${ladder.nodes} ADRs / ${ladder.edgesResolvable} walkable edges)`,
  );
  for (const cycle of cycles) console.log(`      cycle: ${cycle.join(" → ")}`);
}

function reportWalk(what: string, walk: LadderDepth): void {
  console.log(`    longest chain: ${walk.maxDepth} edge${walk.maxDepth === 1 ? "" : "s"} (${what})`);
  console.log(
    `    distribution: ${walk.histogram.map((bucket) => `${bucket.count}@${bucket.depth}`).join("  ")}`,
  );
  if (walk.deepestChain.length > 0) {
    console.log(`    the deepest chain, top first:`);
    console.log(`      ${walk.deepestChain.map(label).join(" → ")}`);
  }
}

async function censusCorpus(
  amendsWalk: LadderDepth,
  adrsOnDisk: ReadonlySet<number>,
): Promise<void> {
  const corpus = await openCorpusStore(TAG);
  try {
    // ONE bulk read for a whole-corpus question — the shape `probe:depth-from-work` uses.
    const docs = await corpus.store.queryDocs();
    const workVerdict = evaluateDepthFromWork(depthFromWorkNodes(docs));
    const census = censusPointers(docs, workVerdict.depthById, adrsOnDisk);

    console.log("");
    console.log(`  5. LIBRARY POINTERS THAT TERMINATE AT AN ADR — a FINDING, not a decision`);
    console.log(
      `    corpus: ${census.artifactsScanned} artifacts, ${census.dependsOnTotal} authored \`dependsOn\` ` +
        `pointers (${census.assetPointers} \`asset:\`, ${census.docPointers} \`doc:\`)`,
    );
    console.log(
      `    of the \`doc:\` pointers, ${census.adrPointers} are ADR-shaped — ` +
        `${census.adrPointersResolving} land on an ADR on disk, ` +
        `${census.adrPointersDangling.length} dangle; ` +
        `${census.nonAdrDocPointers.length} \`doc:\` pointer(s) name something other than an ADR`,
    );
    console.log(
      `    pointer spelling (both live, both accepted): ${[...census.spellings.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([spelling, count]) => `${count} \`doc:${spelling}/…\``)
        .join(", ")}`,
    );
    for (const line of capped(census.adrPointersDangling)) console.log(`      dangling: ${line}`);
    for (const line of capped(census.nonAdrDocPointers)) console.log(`      non-ADR doc: ${line}`);
    console.log(
      `    distinct ADRs landed on: ${census.landedOn.size} of ${adrsOnDisk.size} on disk`,
    );
    const topTargets = [...census.landedOn.entries()]
      .sort((left, right) => right[1] - left[1] || left[0] - right[0])
      .slice(0, 8);
    console.log(
      `    most-landed-on: ${topTargets
        .map(([adr, count]) => `${label(adr)}×${count}`)
        .join(", ")}`,
    );

    // How deep the LANDED-ON ADRs sit in the amends ladder — the population that matters, which is
    // not the same as the ladder's overall shape.
    const landedDepths = new Map<number, number>();
    for (const adr of census.landedOn.keys()) landedDepths.set(adr, amendsWalk.depthByNode.get(adr) ?? 0);
    const landedHistogram = new Map<number, number>();
    for (const depth of landedDepths.values()) {
      landedHistogram.set(depth, (landedHistogram.get(depth) ?? 0) + 1);
    }
    let deepestLanded = 0;
    let deepestLandedAdr: number | undefined;
    // Ties break toward the LOWER ADR number so the named witness is stable run to run.
    for (const [adr, depth] of [...landedDepths].sort((left, right) => left[0] - right[0])) {
      if (depth > deepestLanded || deepestLandedAdr === undefined) {
        deepestLanded = depth;
        deepestLandedAdr = adr;
      }
    }
    console.log(
      `    their amends depth: ${[...landedHistogram.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([depth, count]) => `${count}@${depth}`)
        .join("  ")}` +
        (deepestLandedAdr === undefined
          ? ""
          : `   (deepest landed-on: ${label(deepestLandedAdr)} at ${deepestLanded})`),
    );

    // Candidate A — the ADR is an ordinary hop and COSTS a hop.
    let candidateA = workVerdict.maxDepth;
    let witness = "";
    let reachedPointers = 0;
    for (const edge of census.edges) {
      if (edge.libraryDepth === null) continue;
      reachedPointers += 1;
      const total = edge.libraryDepth + 1 + (amendsWalk.depthByNode.get(edge.adr) ?? 0);
      if (total > candidateA) {
        candidateA = total;
        witness =
          `${edge.artifact} (depth ${edge.libraryDepth}) → ${label(edge.adr)} ` +
          `+ ${amendsWalk.depthByNode.get(edge.adr) ?? 0} amends hop(s)`;
      }
    }

    console.log("");
    console.log(`    today's library ceiling (depth from the work): ${workVerdict.maxDepth}`);
    console.log(
      `      measured over ${workVerdict.reached} reached of ${workVerdict.artifactsScanned} artifacts ` +
        `(${workVerdict.unreachable} unreachable — NOT deep, just unmeasured)`,
    );
    console.log(
      `      ${reachedPointers} of ${census.edges.length} ADR-terminating pointers hang off a REACHED artifact; ` +
        `the rest are unmeasured and cannot move a ceiling`,
    );
    console.log(
      `    CANDIDATE A — the ADR is an ordinary hop and costs a hop: ceiling becomes ${candidateA}` +
        (witness === "" ? " (no pointer beats today's ceiling)" : ""),
    );
    if (witness !== "") console.log(`      witness: ${witness}`);
    // ⚠ THE SAMPLE, NOT THE POPULATION. Candidate A can only be computed where the pointing artifact
    // HAS a depth, and the work anchor is nearly blind today (knowledge-depth.ts says so out loud).
    // Reporting the figure without its denominator would let a 4%-sample number read as a settled
    // ceiling, which is the same "unreachable is not shallow" error one layer up.
    console.log(
      `      ⚠ a FLOOR, not a settled ceiling: computed over the ${reachedPointers} pointer(s) whose ` +
        `artifact is reachable from the work at all. Widen the anchor and it rises.`,
    );
    console.log(
      `      worst case regardless of reachability: ${
        deepestLandedAdr === undefined ? "n/a" : label(deepestLandedAdr)
      } sits ${deepestLanded} amends hops down, so any artifact reaching it would read at its own ` +
        `depth + ${deepestLanded + 1}.`,
    );
    console.log(
      `    CANDIDATE B — the boundary crossing costs no hop, the two depths reported as a PAIR: ` +
        `(library ${workVerdict.maxDepth}, ADR ${deepestLanded})`,
    );
    console.log(
      `      i.e. no single number moves; the deepest reading becomes "${workVerdict.maxDepth} from the work, ` +
        `then ${deepestLanded} more inside the decision log".`,
    );
    console.log(
      `    This probe RECOMMENDS NEITHER — ADR-0223 D4's sink rule is the owner's question on this arc.`,
    );
  } finally {
    await corpus.close();
  }
}

async function main(): Promise<void> {
  const adrsOnly = process.argv.slice(2).includes("--adrs-only");

  const { adrs, parseErrors } = loadAdrMetas(DECISIONS_DIR);
  if (parseErrors.length > 0) {
    // Fail-closed: a census over a decision log that did not fully parse is a census of an unknown
    // population, and reporting it as a clean count would understate every figure below.
    console.error(`${TAG} — ${parseErrors.length} ADR file(s) failed to parse:`);
    for (const line of parseErrors) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} — ${adrs.length} ADR files under ${path.relative(repoRoot, DECISIONS_DIR)}`);
  const byStatus = new Map<string, number>();
  for (const adr of adrs) byStatus.set(adr.status, (byStatus.get(adr.status) ?? 0) + 1);
  console.log(
    `  by status: ${[...byStatus.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([status, count]) => `${count} ${status}`)
      .join(", ")}`,
  );
  console.log("");
  console.log(
    `  ⚠ The two edge types are NEVER summed. \`supersedes\` points a new decision at the dead one it` +
      ` replaced (archaeology); \`amends\` means "still standing, and rests on this" (depth).`,
  );

  // 1 + 2 — the census and the acyclicity verdicts, per type, BEFORE anything walks.
  const amends = buildAmendsLadder(adrs);
  const supersedes = buildSupersedesLadder(adrs);
  const amendsLoops = amendsCycles(amends);
  const supersedesLoops = supersedesCycles(supersedes);
  const unionLoops = unionCycles(adrs);

  console.log("");
  console.log(`  1 + 2. EDGE CENSUS AND ACYCLICITY, BY TYPE`);
  reportLadder("`amends` — the edge that means DEPTH", amends, amendsLoops);
  reportLadder("`supersedes` — the edge that means ARCHAEOLOGY", supersedes, supersedesLoops);
  console.log("");
  console.log(`  the UNION (amends + supersedes), for the acyclicity question ONLY`);
  console.log(
    `    acyclic: ${unionLoops.length === 0 ? "YES" : `NO — ${unionLoops.length} cycle(s)`}` +
      ` — a different question from the two above, and it can answer NO while they answer YES`,
  );
  for (const cycle of unionLoops) console.log(`      cycle: ${cycle.join(" → ")}`);
  console.log(`    (no count and no depth is ever taken over the union — see the file header)`);

  if (amendsLoops.length > 0 || supersedesLoops.length > 0) {
    console.error("");
    console.error(
      `${TAG} FAIL — a per-type graph is CYCLIC, so no depth is reported. The cycle above IS the ` +
        `finding: do not repair the decision log to make a walk succeed.`,
    );
    process.exitCode = 1;
    return;
  }

  // 3 + 4 — the ladders, only now that both are proved acyclic.
  const amendsWalk = longestAmendsChain(amends);
  assertChainIsReal(amends, amendsWalk);
  const supersedesWalk = longestSupersedesChain(supersedes);
  assertChainIsReal(supersedes, supersedesWalk);

  console.log("");
  console.log(`  3. THE \`amends\`-ONLY LADDER — the honest depth this arc can claim`);
  reportWalk("amends alone; NOT comparable to the 17 measured 2026-08-20 over both types", amendsWalk);

  console.log("");
  console.log(`  4. THE \`supersedes\`-ONLY LADDER — ARCHAEOLOGY, not depth`);
  console.log(`     (how many times a decision was re-decided; never a distance from the work)`);
  reportWalk("supersedes alone", supersedesWalk);

  if (adrsOnly) {
    console.log("");
    console.log(`${TAG} — --adrs-only: the corpus pointer census (5) was NOT measured.`);
    return;
  }

  const onDisk = new Set(adrs.map((adr) => adr.number));
  await censusCorpus(amendsWalk, onDisk);

  console.log("");
  console.log(`${TAG} — census complete. Nothing was written; no gate reads this.`);
}

main().catch((err: unknown) => {
  // Fail-closed for `check:library-dag-acyclic`'s reason: a claim about a graph nobody could read
  // is not a passing one. `--adrs-only` runs the disk half without a database.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
