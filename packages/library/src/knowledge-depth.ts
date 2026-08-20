// DEPTH FROM THE WORK (ADR-0363 D2, `traversal-panel-arc` increment `standson-depth-from-work-join`)
// — how far a knowledge artifact sits from the actual work, as a pure function over the corpus.
//
// It is the sibling of `knowledge-dag.ts`, and deliberately shaped like it: the rule lives here as a
// total function that reports its own denominators, and every consumer (the studio's traversal panel,
// the `probe:depth-from-work` diagnostic) is a thin read around it.
//
// ## What the number is FOR
//
// The traversal panel annotates each artifact an agent actually reached with that artifact's depth,
// so the walk itself becomes a health signal. The hypothesis being tested, in the owner's words: in a
// healthy system an agent should NOT need to reach for very deep ADRs — it should get most of what it
// needs from the stories and the immediate decisions. A traversal whose reads skew deep says the
// near-work layer is under-serving and the agent had to go a long way from the work to find its
// answer.
//
// ## THE FENCE (ADR-0363 D2) — a READ-ONLY join at RENDER time
//
// Story nodes do NOT become tier 0, the two graphs are NOT merged, nothing in the corpus records the
// result, and NO GATE ENFORCES IT. The work graph (`depends_on` over `stories/**`) and the knowledge
// graph (`standsOn` over the corpus) keep their own authors, write paths and gates. This function
// projects one onto the other for a reader and stops there.
//
// **The accepted risk is stated rather than papered over:** because nothing enforces the join, the two
// graphs CAN drift and only the studio would notice. A depth this returns is a DERIVED READING of the
// corpus as it stands, never a guarantee. If the measure proves its worth, a full merge is a separate
// ADR.
//
// ## THE ANCHOR IS THIN, AND MEASURING IT IS HALF THE JOB
//
// Measured against the live corpus on 2026-08-20 — re-measure rather than inherit these, they moved
// once already when ADR-0373 widened the seed:
//
//   • 1,612 artifacts, 778 authored `standsOn` pointers (390 `doc:` ADR sinks + 388 `asset:`,
//     all resolving). RAW stored rows and the RENDERED studio wire AGREED exactly on both — the
//     660-vs-554 disagreement that produced this increment's warning is not present today.
//   • 49 artifacts carry `cites` at all — 38 `story:`, 24 `capability:`, 14 `asset:` pointers.
//   • So the ANCHOR is 42 artifacts of 1,612 (2.6%), and every one of them is an `increment`.
//
// An artifact that is UNREACHABLE from any anchor is NOT the same as one that is VERY DEEP, and a
// surface that rendered the two alike would report the exact opposite of the health signal this
// exists to give. Hence {@link DepthFromWorkVerdict} reports both denominators, the way
// `evaluateStandsOnAcyclicity` does: "nothing was deep" and "nothing was measured" can never print
// the same way.
//
// ## WHY AN INCREMENT'S `asset:` CITES ARE AN OUTBOUND EDGE
//
// Measured, not assumed: **0 of the 42 anchors carry a literal `standsOn` entry.** Seeded at the
// anchors and walked over `standsOn` alone, the walk cannot move at all — 42 of 1,612 reached, every
// one of them at depth 0. That is not a thin signal, it is no signal.
//
// The `cites` field is where an increment's dependency edge actually lives. Its own schema says so
// verbatim: `cites` carries "the stories/capabilities this touches AND THE GUIDANCE IT STANDS ON"
// (ADR-0306 D2). So an `asset:` entry in `cites` IS a `standsOn` edge wearing the increment tier's
// name, and it is walked as one. Both fields are read through {@link parseCiteRef} — the one place
// the pointer layout is defined — and never split on `:` by hand.
//
// ## THE WALK RUNS DOWN-TIER ONLY, AND THAT IS A DECISION WITH A MEASUREMENT BEHIND IT
//
// `standsOn` points from the stander to the stood-on, i.e. toward the foundations. This walks it in
// that direction and never in reverse. Walking it in BOTH directions reaches far more of the corpus
// (measured 2026-08-20: 232 artifacts against 46, and 118 of a real trace's 306 in-corpus reads
// against 3) — but it would make an `agent` artifact that STANDS ON a work-touching pattern read as
// "two steps deeper than the work", when it is the surface layer an operator meets first. That
// inverts the very signal this exists to give, which is precisely the failure mode the
// unreachable-is-not-deep rule above guards against. Reach is not worth an inverted axis.
//
// The consequence is that the instrument is, today, nearly blind — and it says so out loud rather
// than rendering blindness as health. That is the honest reading of a corpus where the near-work
// layer is barely wired to the knowledge graph at all, and it is itself the finding.

import { parseCiteRef } from "./knowledge.js";

/** The complete input surface for the depth-from-work projection. */
export interface DepthFromWorkNode {
  readonly id: string;
  /** Authored `standsOn` pointers, exactly as stored (`asset:<id>` / `doc:<relpath>`). */
  readonly standsOn: readonly string[];
  /** Authored `cites` pointers, exactly as stored (`story:` / `capability:` / `asset:`). */
  readonly cites: readonly string[];
}

/** The minimal stored-doc facts {@link depthFromWorkNodes} needs. Matches `StoredDoc` structurally. */
export interface DepthFromWorkSource {
  readonly id: string;
  readonly doc: unknown;
}

/** One bucket of the reached-depth distribution. */
export interface DepthFromWorkBucket {
  readonly depth: number;
  readonly count: number;
}

/** The corpus-wide depth-from-work projection, denominators and all. */
export interface DepthFromWorkVerdict {
  /** Depth per artifact id. An id ABSENT from this map was not reached — never treat it as deep. */
  readonly depthById: ReadonlyMap<string, number>;
  /** Every id this corpus holds — what separates "unreachable" from "not an artifact at all". */
  readonly knownIds: ReadonlySet<string>;
  /** How many artifacts were judged. A reading of 0 here is "nothing was measured", never "healthy". */
  readonly artifactsScanned: number;
  /** The seed: artifacts whose `cites` names a `story:` or `capability:` unit. */
  readonly anchors: number;
  /** The `asset:` pointers those anchors carry — the walk's only way out of the seed. */
  readonly anchorEdges: number;
  /** Artifact → artifact edges the walk could resolve (`standsOn` + `cites` asset pointers). */
  readonly edgesScanned: number;
  /** `doc:` pointers — ADR bedrock (ADR-0223 D4). Not artifacts, so never given a depth. */
  readonly bedrockTargets: number;
  /** `asset:` pointers naming no artifact in this corpus. Counted, never silently dropped. */
  readonly danglingTargets: number;
  /** How many artifacts have a depth. */
  readonly reached: number;
  /** How many do not. The other half of the denominator pair — see the header. */
  readonly unreachable: number;
  /** The deepest reached artifact. `0` means only the anchors themselves were reached. */
  readonly maxDepth: number;
  /** The reached distribution, ascending by depth. Empty iff nothing was reached. */
  readonly histogram: readonly DepthFromWorkBucket[];
}

/** What one id's depth reading came to. Three states, and collapsing any two of them is the bug. */
export type DepthFromWorkReading =
  /** In the corpus and connected to the work: `depth` hops away. */
  | { readonly state: "reached"; readonly depth: number }
  /** In the corpus, but no chain of authored edges connects it to any work anchor. NOT "very deep". */
  | { readonly state: "unreachable" }
  /** Not a Library artifact at all — a story/capability id, a retired artifact, a CLI token. */
  | { readonly state: "absent" };

/** The `asset:` scheme is the only `standsOn`/`cites` pointer that names a Library artifact. */
const ASSET_SCHEME = "asset";

/**
 * PURE: project stored corpus docs onto the {@link DepthFromWorkNode} graph the walk reads.
 *
 * TOTAL over untrusted input, for `standsOnNodes`' reason: this runs over the LIVE corpus, so a row
 * written by an older schema — or by a branch that has a field this checkout does not — must project
 * as "no edges" rather than throw. Malformed docs are refused at the WRITE boundary
 * (`validateLibraryDoc`); a read-side projection is not where a surprise row should take a surface
 * down.
 */
export function depthFromWorkNodes(docs: readonly DepthFromWorkSource[]): DepthFromWorkNode[] {
  return docs.map((row) => {
    const payload = row.doc as { standsOn?: unknown; cites?: unknown } | null | undefined;
    return {
      id: row.id,
      standsOn: stringsOf(payload?.standsOn),
      cites: stringsOf(payload?.cites),
    };
  });
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/**
 * PURE: compute every artifact's depth from the work, plus the denominators that make the answer
 * readable.
 *
 * Breadth-first from every anchor at once, so an artifact reachable by several chains takes the
 * SHORTEST — depth is "how far away is this", and the long way round is not the distance. A cycle
 * terminates by construction: an id keeps the first depth assigned to it and is never re-queued.
 *
 * The first id wins on a duplicate, matching `findStandsOnCycles`: re-pointing an id at a later row
 * would silently re-parent everything below it.
 */
export function evaluateDepthFromWork(
  nodes: readonly DepthFromWorkNode[],
): DepthFromWorkVerdict {
  const byId = new Map<string, DepthFromWorkNode>();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);

  let anchorEdges = 0;
  let edgesScanned = 0;
  let bedrockTargets = 0;
  let danglingTargets = 0;

  // The outbound edge set per node, resolved once: `standsOn` plus the `asset:` half of `cites`
  // (see the header — an increment's dependency edge lives in `cites`, and 0 of the anchors carry
  // a literal `standsOn`). Unresolvable targets are counted here rather than skipped silently.
  const outbound = new Map<string, string[]>();
  const anchorIds: string[] = [];

  for (const node of byId.values()) {
    const targets: string[] = [];
    let isAnchor = false;
    let assetCites = 0;

    for (const pointer of node.standsOn) {
      const parsed = parseCiteRef(pointer);
      // `doc:` and anything else parseCiteRef refuses is bedrock or noise — a sink either way, and
      // ADR-0223 D4 says so of ADRs explicitly: they carry no `standsOn` and cannot be walked past.
      if (parsed === null || parsed.scheme !== ASSET_SCHEME) {
        bedrockTargets += 1;
        continue;
      }
      if (!byId.has(parsed.id)) {
        danglingTargets += 1;
        continue;
      }
      targets.push(parsed.id);
    }

    for (const pointer of node.cites) {
      const parsed = parseCiteRef(pointer);
      if (parsed === null) continue;
      if (parsed.scheme === ASSET_SCHEME) {
        assetCites += 1;
        if (!byId.has(parsed.id)) {
          danglingTargets += 1;
          continue;
        }
        targets.push(parsed.id);
        continue;
      }
      // `story:` / `capability:` — the work pointer. THIS is what makes the artifact an anchor; the
      // unit it names lives in `stories/**` and is deliberately never resolved here (ADR-0363 D2:
      // the graphs are not merged).
      isAnchor = true;
    }

    outbound.set(node.id, targets);
    edgesScanned += targets.length;
    if (isAnchor) {
      anchorIds.push(node.id);
      anchorEdges += assetCites;
    }
  }

  const depthById = new Map<string, number>();
  let frontier: string[] = [];
  for (const id of anchorIds) {
    if (depthById.has(id)) continue;
    depthById.set(id, 0);
    frontier.push(id);
  }

  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of outbound.get(id) ?? []) {
        if (depthById.has(target)) continue;
        depthById.set(target, depth);
        next.push(target);
      }
    }
    frontier = next;
  }

  const counts = new Map<number, number>();
  let maxDepth = 0;
  for (const value of depthById.values()) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (value > maxDepth) maxDepth = value;
  }

  return {
    depthById,
    knownIds: new Set(byId.keys()),
    artifactsScanned: byId.size,
    anchors: anchorIds.length,
    anchorEdges,
    edgesScanned,
    bedrockTargets,
    danglingTargets,
    reached: depthById.size,
    unreachable: byId.size - depthById.size,
    maxDepth,
    histogram: [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketDepth, count]) => ({ depth: bucketDepth, count })),
  };
}

/**
 * PURE: what one id's depth reading came to — the three states, kept apart.
 *
 * A consumer that treats "absent" or "unreachable" as a large depth turns the health signal upside
 * down, which is why this returns a discriminated union rather than `number | null`.
 */
export function depthFromWorkOf(
  verdict: DepthFromWorkVerdict,
  id: string,
): DepthFromWorkReading {
  const depth = verdict.depthById.get(id);
  if (depth !== undefined) return { state: "reached", depth };
  if (verdict.knownIds.has(id)) return { state: "unreachable" };
  return { state: "absent" };
}
