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
// graph (`dependsOn` over the corpus) keep their own authors, write paths and gates. This function
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
//   • 1,612 artifacts, 778 authored `dependsOn` pointers (390 `doc:` ADR sinks + 388 `asset:`,
//     all resolving). RAW stored rows and the RENDERED studio wire AGREED exactly on both — the
//     660-vs-554 disagreement that produced this increment's warning is not present today.
//   • 49 artifacts carry `cites` at all — 38 `story:`, 24 `capability:`, 14 `asset:` pointers.
//   • So the ANCHOR is 42 artifacts of 1,612 (2.6%), and every one of them is an `increment`.
//
// An artifact that is UNREACHABLE from any anchor is NOT the same as one that is VERY DEEP, and a
// surface that rendered the two alike would report the exact opposite of the health signal this
// exists to give. Hence {@link DepthFromWorkVerdict} reports both denominators, the way
// `evaluateDependsOnAcyclicity` does: "nothing was deep" and "nothing was measured" can never print
// the same way.
//
// ## WHY AN INCREMENT'S `asset:` CITES ARE AN OUTBOUND EDGE
//
// Measured, not assumed: **0 of the 42 anchors carry a literal `dependsOn` entry.** Seeded at the
// anchors and walked over `dependsOn` alone, the walk cannot move at all — 42 of 1,612 reached, every
// one of them at depth 0. That is not a thin signal, it is no signal.
//
// The `cites` field is where an increment's dependency edge actually lives. Its own schema says so
// verbatim: `cites` carries "the stories/capabilities this touches AND THE GUIDANCE IT STANDS ON"
// (ADR-0306 D2). So an `asset:` entry in `cites` IS a `dependsOn` edge wearing the increment tier's
// name, and it is walked as one. Both fields are read through {@link parseCiteRef} — the one place
// the pointer layout is defined — and never split on `:` by hand.
//
// ## THE WALK RUNS DOWN-TIER ONLY, AND THAT IS A DECISION WITH A MEASUREMENT BEHIND IT
//
// `dependsOn` points from the stander to the stood-on, i.e. toward the foundations. This walks it in
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
//
// ## THE WALK CONTINUES PAST A DECISION NOW — ON `amends` ONLY, BEHIND A SEAM (ADR-0403)
//
// `adrs-into-the-dag-arc` increment 09. Until 2026-08-22 every `doc:` pointer was a SINK: ADR-0223
// D4 made decisions tier-0 bedrock so the knowledge tree could not contain a loop, and this walk
// halted there. That is why the measure could only ever return 0, 1 or 2 — measured on the live
// corpus, 390 of 754 authored pointers terminate at a decision, which is precisely where it stopped.
// A ceiling that can never rise can never fail and can never warn.
//
// ADR-0403 dec 1 makes decisions ORDINARY Library artifacts, dec 4 retires the sink rule, and dec 5
// replaces D4's structural no-loop guarantee with a PROOF over the joined graph — discharged by
// `pnpm probe:combined-dag` (`adrs-into-the-dag-arc-inc-08`, ACYCLIC across 1,734 artifacts and 399
// decisions on 2026-08-22). So the walk may continue, and three things bind it:
//
//   • `amends` ONLY, NEVER SUMMED WITH `supersedes`, and the exclusion lives in the SHAPE of the
//     code — see `decision-amends-seam.ts`, which is the only door a decision's edges come through
//     and which has no `supersedesOf` and no edge-type parameter to get wrong.
//   • BOTH POINTER SPELLINGS RESOLVE (ADR-0403 dec 7), through the one parser in
//     `decision-pointer.ts`. A walk that resolved `doc:decisions/…` and not `doc:docs/decisions/…`
//     would silently drop 19 of 390 pointers and return a confident, plausible, wrong number.
//   • THE RESOLVER IS A SEAM (ADR-0403 dec 3), so the storage migration replaces the file-backed
//     half without touching this walk.
//
// **THE DECISION-AWARE READING IS OPT-IN, AND THAT IS THE FENCE, NOT AN OVERSIGHT.** Passing no
// resolver reproduces the pre-ADR-0403 behaviour exactly, byte for byte: every `doc:` pointer is
// bedrock and the ceiling reads 2. The studio's traversal panel takes that path deliberately —
// `traversal-panel-arc` is PARKED and its remaining owner LOOK is fenced, so carrying the new figure
// onto the panel is that arc's work when it unparks, not this one's.
//
// ## AND THE NUMBER IS A FLOOR, NOT A CEILING — SAY SO WHEREVER IT IS PRINTED
//
// Only 17 of the 390 decision-terminating pointers hang off an artifact reachable from the work at
// all; the other 373 are unmeasured and cannot move anything. The deepest landed-on decision
// (ADR-0348, 11 `amends` hops down) is reached only by unmeasured artifacts, so widening the anchor
// pushes the figure toward *that artifact's depth + 12*. A reader handed the bare number will quote
// the sample as the population — which is the same "unreachable is not shallow" error one layer up.

import { decisionNodeId, parseDecisionPointer } from "./decision-pointer.js";
import { type DecisionAmendsResolver } from "./decision-amends-seam.js";
import { readDependsOnPointers } from "./depends-on.js";

import { parseCiteRef } from "./knowledge.js";

/** The complete input surface for the depth-from-work projection. */
export interface DepthFromWorkNode {
  readonly id: string;
  /** Authored `dependsOn` pointers, exactly as stored (`asset:<id>` / `doc:<relpath>`). */
  readonly dependsOn: readonly string[];
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
  /** Artifact → artifact edges the walk could resolve (`dependsOn` + `cites` asset pointers). */
  readonly edgesScanned: number;
  /**
   * `doc:` pointers the walk did NOT continue through — bedrock.
   *
   * Before ADR-0403 that was every one of them (ADR-0223 D4). It now means: a `doc:` pointer at some
   * other repository file, plus — when no resolver was supplied — every decision pointer too.
   */
  readonly bedrockTargets: number;
  /** `asset:` pointers naming no artifact in this corpus. Counted, never silently dropped. */
  readonly danglingTargets: number;
  /** How many artifacts have a depth. */
  readonly reached: number;
  /** How many do not. The other half of the denominator pair — see the header. */
  readonly unreachable: number;
  /**
   * THE ONE NUMBER (ADR-0403 dec 4): the deepest thing reached, artifact or decision.
   *
   * `0` means only the anchors themselves were reached. With no resolver supplied this is
   * identical to {@link maxArtifactDepth}, which is what keeps every pre-ADR-0403 caller's reading
   * unchanged. Read it as a FLOOR — see the header.
   */
  readonly maxDepth: number;
  /** The deepest reached node's id, or `null` when nothing was reached past the anchors. */
  readonly deepestId: string | null;
  /** The reached ARTIFACT distribution, ascending by depth. Empty iff no artifact was reached. */
  readonly histogram: readonly DepthFromWorkBucket[];

  // --- The decision half. All zero, and the histogram empty, when no resolver was supplied. ------

  /** The deepest reached ARTIFACT. Kept apart from {@link maxDepth} so neither can hide the other. */
  readonly maxArtifactDepth: number;
  /** How many decisions the resolver could see — the denominator, so a thin read can never hide. */
  readonly decisionsScanned: number;
  /** THE JOIN: `doc:` pointers the walk resolved onto a decision and continued through. */
  readonly decisionEdges: number;
  /** `amends` edges between decisions the walk could resolve. NEVER summed with `supersedes`. */
  readonly amendsEdges: number;
  /** Decision pointers, and `amends` targets, naming a decision the resolver does not hold. */
  readonly decisionDanglingTargets: number;
  /** How many decisions have a depth — reachable from the work through some artifact. */
  readonly decisionsReached: number;
  /** The reached DECISION distribution, ascending by depth. */
  readonly decisionHistogram: readonly DepthFromWorkBucket[];
}

/** What one id's depth reading came to. Three states, and collapsing any two of them is the bug. */
export type DepthFromWorkReading =
  /** In the corpus and connected to the work: `depth` hops away. */
  | { readonly state: "reached"; readonly depth: number }
  /** In the corpus, but no chain of authored edges connects it to any work anchor. NOT "very deep". */
  | { readonly state: "unreachable" }
  /** Not a Library artifact at all — a story/capability id, a retired artifact, a CLI token. */
  | { readonly state: "absent" };

/** The `asset:` scheme is the only `dependsOn`/`cites` pointer that names a Library artifact. */
const ASSET_SCHEME = "asset";

/**
 * PURE: project stored corpus docs onto the {@link DepthFromWorkNode} graph the walk reads.
 *
 * TOTAL over untrusted input, for `dependsOnNodes`' reason: this runs over the LIVE corpus, so a row
 * written by an older schema — or by a branch that has a field this checkout does not — must project
 * as "no edges" rather than throw. Malformed docs are refused at the WRITE boundary
 * (`validateLibraryDoc`); a read-side projection is not where a surprise row should take a surface
 * down.
 */
export function depthFromWorkNodes(docs: readonly DepthFromWorkSource[]): DepthFromWorkNode[] {
  return docs.map((row) => {
    const payload = row.doc as { cites?: unknown } | null | undefined;
    return {
      id: row.id,
      dependsOn: readDependsOnPointers(row.doc),
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
 * The first id wins on a duplicate, matching `findDependsOnCycles`: re-pointing an id at a later row
 * would silently re-parent everything below it.
 */
export function evaluateDepthFromWork(
  nodes: readonly DepthFromWorkNode[],
  decisions?: DecisionAmendsResolver,
): DepthFromWorkVerdict {
  const byId = new Map<string, DepthFromWorkNode>();
  for (const node of nodes) if (!byId.has(node.id)) byId.set(node.id, node);

  // Held by NUMBER, because that is what a pointer and an `amends` target both name. Absent when no
  // resolver was supplied, which is what makes every `doc:` pointer bedrock again — see the header.
  const heldDecisions = new Set(decisions?.decisions ?? []);

  let anchorEdges = 0;
  let edgesScanned = 0;
  let bedrockTargets = 0;
  let danglingTargets = 0;
  let decisionEdges = 0;
  let amendsEdges = 0;
  let decisionDanglingTargets = 0;

  // The outbound edge set per node, resolved once: `dependsOn` plus the `asset:` half of `cites`
  // (see the header — an increment's dependency edge lives in `cites`, and 0 of the anchors carry
  // a literal `dependsOn`). Unresolvable targets are counted here rather than skipped silently.
  const outbound = new Map<string, string[]>();
  const anchorIds: string[] = [];

  for (const node of byId.values()) {
    const targets: string[] = [];
    let isAnchor = false;
    let assetCites = 0;

    for (const pointer of node.dependsOn) {
      const parsed = parseCiteRef(pointer);
      if (parsed !== null && parsed.scheme === ASSET_SCHEME) {
        if (!byId.has(parsed.id)) {
          danglingTargets += 1;
          continue;
        }
        targets.push(parsed.id);
        continue;
      }
      // Not an artifact pointer. Before ADR-0403 every one of these was bedrock, which is exactly
      // where 390 of the corpus's 754 authored pointers stopped. With a resolver in hand, the ones
      // naming a DECISION are walked through instead — both spellings, through the single parser.
      if (decisions !== undefined) {
        const decision = parseDecisionPointer(pointer);
        if (decision !== null) {
          if (!heldDecisions.has(decision.number)) {
            decisionDanglingTargets += 1;
            continue;
          }
          decisionEdges += 1;
          targets.push(decisionNodeId(decision.number));
          continue;
        }
      }
      // A `doc:` pointer at some other repository file, a scheme parseCiteRef refuses, or any
      // decision pointer when no resolver was supplied: a sink either way.
      bedrockTargets += 1;
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

  // The decision half of the adjacency, added only when a resolver was supplied. `amendsOf` is the
  // ONLY door — there is no `supersedesOf` to call and no edge-type flag to get wrong, which is how
  // ADR-0403 dec 6's never-sum rule is held by the shape of the code rather than by a comment.
  const decisionIds: string[] = [];
  for (const decisionNumber of heldDecisions) {
    const id = decisionNodeId(decisionNumber);
    // A decision node id carries a colon and an artifact id cannot (`asset:` pointers admit
    // `[A-Za-z0-9_-]+`), so the two id spaces are disjoint by construction — and `probe:combined-dag`
    // REFUSES over the live corpus if that ever stops being true, measured at 0 collisions on
    // 2026-08-22. This guard is the belt to that ADR-0403 dec 5 brace: on a collision the ARTIFACT's
    // own edges win rather than being silently re-parented onto a decision's, which keeps the
    // conservative pre-ADR-0403 reading instead of a plausible wrong one.
    if (outbound.has(id)) continue;
    decisionIds.push(id);
    const targets: string[] = [];
    for (const target of decisions?.amendsOf(decisionNumber) ?? []) {
      if (!heldDecisions.has(target)) {
        decisionDanglingTargets += 1;
        continue;
      }
      amendsEdges += 1;
      targets.push(decisionNodeId(target));
    }
    outbound.set(id, targets);
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

  // THE TWO POPULATIONS ARE COUNTED APART. `reached` / `unreachable` / `histogram` stay
  // ARTIFACT-scoped so the "unreachable is not deep" reading the studio panel depends on is
  // untouched — folding 399 mostly-unreached decisions into `unreachable` would swamp exactly the
  // denominator that exists to say "nothing was measured". `maxDepth` is the one number over both.
  const artifactCounts = new Map<number, number>();
  const decisionCounts = new Map<number, number>();
  let maxDepth = 0;
  let maxArtifactDepth = 0;
  let deepestId: string | null = null;
  let reached = 0;
  let decisionsReached = 0;

  for (const [id, value] of depthById) {
    const isArtifact = byId.has(id);
    if (isArtifact) {
      reached += 1;
      artifactCounts.set(value, (artifactCounts.get(value) ?? 0) + 1);
      if (value > maxArtifactDepth) maxArtifactDepth = value;
    } else {
      decisionsReached += 1;
      decisionCounts.set(value, (decisionCounts.get(value) ?? 0) + 1);
    }
    // Ties break toward the FIRST id seen so the named witness is stable run to run.
    if (value > maxDepth) {
      maxDepth = value;
      deepestId = id;
    }
  }

  const ascending = (counts: ReadonlyMap<number, number>): DepthFromWorkBucket[] =>
    [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([bucketDepth, count]) => ({ depth: bucketDepth, count }));

  return {
    depthById,
    // Decision node ids join `knownIds` so `depthFromWorkOf` can tell an UNREACHABLE decision from
    // one that is not in this graph at all — the same three-state distinction it draws for
    // artifacts, and for the same reason: collapsing any two of them is the bug.
    knownIds: new Set([...byId.keys(), ...decisionIds]),
    artifactsScanned: byId.size,
    anchors: anchorIds.length,
    anchorEdges,
    edgesScanned,
    bedrockTargets,
    danglingTargets,
    reached,
    unreachable: byId.size - reached,
    maxDepth,
    deepestId,
    histogram: ascending(artifactCounts),
    maxArtifactDepth,
    decisionsScanned: heldDecisions.size,
    decisionEdges,
    amendsEdges,
    decisionDanglingTargets,
    decisionsReached,
    decisionHistogram: ascending(decisionCounts),
  };
}

/**
 * The corpus size at or above which a decision-aware walk that resolved NO crossing pointer can only
 * mean the READER is blind. Calibrated with `VACUOUS_DEPENDS_ON_READ_FLOOR`, for its reason.
 */
export const VACUOUS_DECISION_WALK_FLOOR = 100;

/**
 * PURE: the ways a DECISION-AWARE reading could be a number that measured nothing. EMPTY means the
 * walk saw its subject; each entry names one thing it could not see.
 *
 * **ASK WHAT INPUT WOULD MAKE THIS RED.** A walk handed a resolver that resolves nothing returns
 * depth 2 — the same number the sink rule returned — and reads as "the ceiling did not move" rather
 * than as "the join was invisible". That is precisely the failure `check:library-dag-acyclic` shipped
 * as `PASS — no dependsOn cycle across 1701 artifacts (0 authored edges)`: an instrument reporting
 * success over a subject it could not see. The likeliest cause here is a pointer-spelling
 * regression, which is why `decision-pointer.ts` is the single resolution point.
 *
 * Returns reasons rather than a boolean because the causes have different remedies. It says nothing
 * about a walk given NO resolver: that is the deliberate pre-ADR-0403 reading, not a blind one.
 */
export function decisionWalkVacuity(verdict: DepthFromWorkVerdict): readonly string[] {
  if (verdict.decisionsScanned === 0) return [];
  const reasons: string[] = [];
  if (verdict.decisionEdges === 0 && verdict.artifactsScanned >= VACUOUS_DECISION_WALK_FLOOR) {
    reasons.push(
      `${verdict.artifactsScanned} artifacts resolved 0 pointers onto any of the ` +
        `${verdict.decisionsScanned} decisions, so the join was invisible and this depth is the ` +
        "pre-ADR-0403 sink reading wearing a new name",
    );
  }
  if (verdict.amendsEdges === 0 && verdict.decisionsScanned >= VACUOUS_DECISION_WALK_FLOOR) {
    reasons.push(
      `${verdict.decisionsScanned} decisions carry 0 resolvable \`amends\` edges, so the walk could ` +
        "not move past the first decision it reached",
    );
  }
  return reasons;
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
