import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type AdrMeta } from "@storytree/drive";
import { loadNodeSpec } from "@storytree/orchestrator";

import { findDecisionFileLinks, findRepoPathLinks, rootedRepoPath } from "./adr-body-links.js";
import type { CheckResult } from "./health.js";

/**
 * The decision-binding health checks (ADR-0037 §3–4) — the module that fires the errors when a
 * claim about a decision drifts. ONE pure core (`adrHealth`) over injected views, mirroring
 * `health.ts`'s shape.
 *
 * ★ IT READS ROWS NOW, AND THAT MOVED WHERE IT RUNS (ADR-0403 dec 1). It used to be fired against
 * the real `docs/decisions` tree by `adr-health.test.ts` inside `pnpm -r test`, which is deliberately
 * credential-free (ADR-0302 D3) — so the moment its subject became a database, the check could not
 * stay there. It is a `check:*` rung instead (`check-adr-health.ts`, declared in `gate-order.ts`),
 * which ADR-0307 D4 permits to hold a store connection. The PURE core is unchanged and its unit
 * tests stayed exactly where they were; only the real-corpus case moved.
 *
 * Checks:
 *   1 adr-frontmatter      — every decision row reads with a known status (GATE)
 *   1b adr-number-identity — a row's stored `number` agrees with the number in its id, which is what
 *                            the ADR-0050 allocator reserved (GATE). Successor to `adr-number-unique`
 *                            — see {@link RETIRED_ADR_CHECKS} for why that question dissolved.
 *   1c adr-description-identity — a row's stored `description` agrees with what the write path
 *                            derives from its title (GATE). Same shape of question as 1b: a field
 *                            the push DERIVES and a field-scoped `--set title=` can move out from
 *                            under it (ADR-0352), with nothing comparing the two.
 *   2 adr-edge-integrity   — every supersedes / amends target exists (GATE)
 *   3 supersede-consistency — X.supersedes ∋ Y ⇔ Y.status = superseded, both directions (GATE)
 *   4 story-decisions      — every story `decisions` entry resolves, and none names a FULLY
 *                            superseded ADR as deciding (GATE)
 *   5 green-flip           — a `healthy` story whose deciding ADR is still `proposed` (GATE;
 *                            resolve by flipping the ADR `proposed → accepted` — an agent MAY now
 *                            perform that green flip, ADR-0084, so this is self-resolvable, not an
 *                            escalation; the librarian-curator MAY also flip to `superseded`, ADR-0086)
 *   6 load-bearing-live    — a `load_bearing: true` ADR (ADR-0086 current-state tag) must be
 *                            `accepted`: a proposed one isn't yet current state, a superseded one is
 *                            dead, so neither may carry the calibrate-to-these tag (GATE)
 *   7 enforced-by-anchors  — backtick path tokens in guardrail `enforcedBy` resolve on disk
 *                            (WARN — enforcedBy stays prose; oq-artifact-code-backing → B)
 *   8 adr-body-links       — no decision body addresses anything by a markdown link that only
 *                            resolved from `docs/decisions/`: a sibling decision FILE
 *                            (`](NNNN-slug.md)`, deleted by PR #1546) or a REPO PATH reached by
 *                            `../`. A row has no location, so neither has a base (GATE)
 *
 * Two rungs RETIRED with the files, each with its reason, and one REPLACED by rung 8:
 * {@link RETIRED_ADR_CHECKS}.
 */

export const ADR_GATE_CHECKS: ReadonlySet<string> = new Set([
  "adr-frontmatter",
  "adr-number-identity",
  "adr-description-identity",
  "adr-edge-integrity",
  "supersede-consistency",
  "story-decisions",
  "green-flip",
  "load-bearing-live",
  "adr-body-links",
]);

/**
 * THREE RUNGS LEFT THE PLAN WHEN DECISIONS BECAME ROWS (ADR-0403 dec 1), each for a different
 * reason, and declared here rather than silently dropped — a retired check that leaves no record
 * reads later as a check nobody thought to write. Two of the three have a SUCCESSOR asking the
 * question that stayed answerable in the row world (`adr-number-identity`, `adr-body-links`); only
 * `supersedes-in-part-retired` guards a state nothing can reach any more.
 *
 * - `adr-number-unique` — REPLACED, not deleted, by `adr-number-identity`. Two FILES could share a
 *   number; two ROWS cannot, because the id is the primary key, so the old question is now
 *   structurally unanswerable and a check asking it would be a permanent vacuous green. The
 *   reachable failure moved: a row's `number` FIELD drifting from its id. See
 *   `loadTitledAdrMetasFromStore`.
 * - `supersedes-in-part-retired` — GONE. ADR-0139 retired the `supersedes_in_part` edge and this
 *   rung caught files still carrying the key in raw frontmatter. A row has no frontmatter, the `adr`
 *   schema declares no such field, and `parseAdrDocument` REFUSES the key outright — so the state it
 *   guarded cannot be reached at all, by anyone.
 * - `adr-link-integrity` — REPLACED by `adr-body-links` (rung 8), after a spell as a genuine hole.
 *   It guarded `](NNNN-slug.md)` cross-links between decision BODIES against rename rot (13 dead
 *   targets / 24 occurrences when it was added). A relative file link between two rows means
 *   nothing, so the rung could not survive as written.
 *
 *   ITS RETIREMENT NOTE CLAIMED MORE THAN WAS TRUE, and this is the correction (ADR-0139: an
 *   accepted decision's prose is corrected in place). The note said the rot class was rehomed —
 *   "the migration loader lifts every body cross-link into `references` as `asset:adr-NNNN`, where
 *   `referential-integrity` already looks — and a number-based ref has no slug to rot, so the class
 *   cannot recur." Two of those three clauses hold. Measured against the live store on 2026-08-22:
 *   3,294 of 3,300 body cross-links did have their target present in `references`, so the POINTER
 *   GRAPH was preserved exactly as claimed, and a number-based ref indeed has no slug to rot.
 *
 *   What the rehoming never covered was the BODY TEXT — 3,300 dead links across 318 of 412 rows,
 *   still rendering as links to files deleted in PR #1546 — and the lifting was a ONE-SHOT rather
 *   than an invariant: `store/load-decisions.ts` ran once and has since been deleted, so no body
 *   cross-link authored after it has been lifted by anything. The remaining 6 hits are exactly that:
 *   three edges (adr-0085 → adr-0395, adr-0222 → adr-0395, adr-0395 → adr-0085) written into bodies
 *   by ADR-0395's own landing sessions AFTER the migration, absent from `references` for no other
 *   reason. So "the class cannot recur" was false for the prose half, which is why rung 8 exists.
 */
export const RETIRED_ADR_CHECKS: ReadonlyMap<string, string> = new Map([
  ["adr-number-unique", "replaced by adr-number-identity — a row id is a primary key (ADR-0403 dec 1)"],
  ["supersedes-in-part-retired", "unreachable — the `adr` schema refuses the key (ADR-0139 + ADR-0403 dec 1)"],
  ["adr-link-integrity", "replaced by adr-body-links — the pointer half rehomed into `references`, the prose half did not"],
]);

/** The story view the checks need — id, declared status, deciding ADR numbers. */
export interface StoryDecisionsView {
  readonly id: string;
  readonly status: string;
  readonly decisions: number[];
}

/**
 * The decision-body view for `adr-body-links` — number + the body prose.
 *
 * SEPARATE from {@link AdrMeta}, which carries only the queryable half (status / edges / tags) and
 * is shared with the build drivers. The bodies are the largest field in the tier, so widening
 * `AdrMeta` would charge every caller of it for a field only this rung reads.
 */
export interface DecisionBodyView {
  readonly number: number;
  readonly body: string;
}

/** The guardrail view for the anchor check — id + the `enforcedBy` prose. */
export interface GuardrailView {
  readonly id: string;
  readonly enforcedBy: string;
}

export interface AdrHealthInputs {
  readonly adrs: AdrMeta[];
  /** Parse failures from loading the decisions dir (each line one file's error). */
  readonly parseErrors: string[];
  /**
   * Pre-computed FAIL lines for `adr-number-identity` — one per row whose stored `number` disagrees
   * with its own id (`loadTitledAdrMetasFromStore`). See {@link RETIRED_ADR_CHECKS} for what this
   * replaced and why the old question stopped being answerable.
   */
  readonly numberMismatches: string[];
  /**
   * Pre-computed FAIL lines for `adr-description-identity` — one per row whose stored `description`
   * disagrees with what `adr push` derives from its title (`loadTitledAdrMetasFromStore`).
   *
   * REQUIRED rather than optional-and-defaulted, for the same reason `decisionBodies` is: a rung
   * whose input silently defaults to `[]` reports PASS on a caller that forgot to wire it, which is
   * the vacuous green {@link RETIRED_ADR_CHECKS} exists to prevent.
   */
  readonly descriptionMismatches: string[];
  readonly stories: StoryDecisionsView[];
  readonly guardrails: GuardrailView[];
  /**
   * Every decision's body prose, for `adr-body-links`. REQUIRED rather than optional and defaulted:
   * an optional view that falls back to `[]` makes the rung report PASS on a caller that forgot to
   * pass it, which is the vacuous-green shape `RETIRED_CHECKS` exists to prevent. The rung carries
   * its own blind-read floor besides (see rung 8).
   */
  readonly decisionBodies: DecisionBodyView[];
  /** Resolve a repo-relative path (file OR directory) on disk. */
  readonly pathExists: (relpath: string) => boolean;
}

/** Backtick-quoted repo-path-shaped tokens (`packages/...`, `apps/...`, ...); `:line` suffixes dropped. */
const PATH_TOKEN = /`((?:packages|apps|docs|stories|infra|scripts|\.github)\/[^`\s]+)`/g;

export function extractPathTokens(prose: string): string[] {
  const tokens: string[] = [];
  for (const m of prose.matchAll(PATH_TOKEN)) {
    const raw = m[1];
    if (raw === undefined) continue;
    const cleaned = raw.split(":")[0];
    if (cleaned !== undefined && cleaned.length > 0) tokens.push(cleaned);
  }
  return tokens;
}

function result(name: string, failLines: string[], cleanNote: string, warn = false): CheckResult {
  if (failLines.length === 0) return { name, level: "PASS", lines: [cleanNote] };
  return { name, level: warn ? "WARN" : "FAIL", lines: failLines };
}

export function adrHealth(inputs: AdrHealthInputs): CheckResult[] {
  const {
    adrs,
    parseErrors,
    numberMismatches,
    descriptionMismatches,
    stories,
    guardrails,
    decisionBodies,
    pathExists,
  } = inputs;
  const byNumber = new Map(adrs.map((a) => [a.number, a]));
  const results: CheckResult[] = [];

  // 1 adr-frontmatter
  results.push(
    result("adr-frontmatter", parseErrors, `${adrs.length} ADRs parsed, statuses known`),
  );

  // 1b adr-number-identity — a row's `number` field must agree with the number in its id.
  //
  // This is `adr-number-unique`'s successor, not its rename. Two FILES sharing a number was the
  // parallel-authoring collision ADR-0050's allocator prevents; two ROWS cannot share one, so that
  // question is now structurally unanswerable and asking it would be a permanent vacuous green. The
  // failure that IS reachable is drift between the two places a decision's number is written — the
  // id (what the allocator reserved, and what every reader addresses it by) and the field. See
  // {@link RETIRED_ADR_CHECKS}.
  results.push(
    result(
      "adr-number-identity",
      numberMismatches,
      `${adrs.length} decisions, every stored number agrees with its id`,
    ),
  );

  // 1c adr-description-identity — a row's `description` must be the title carrying its label.
  //
  // The sibling of 1b, and reachable for the same structural reason: `description` is DERIVED by the
  // write path (`adr push` writes `adrDescriptionOf(number, <H1>)`) but is an ordinary field a
  // field-scoped `--set title=` can move independently since ADR-0352. Three rows were found drifted
  // this way, and what repaired them was an unrelated body push that happened to pass through — so
  // the population being clean today is luck, not a mechanism.
  //
  // It GATES rather than warning because `description` is what `adr list` and every artifact card
  // show: a row describing itself by a superseded title reads as a different decision than it is,
  // and there is no honest reading of that as cosmetic.
  results.push(
    result(
      "adr-description-identity",
      descriptionMismatches,
      `${adrs.length} decisions, every description agrees with its title`,
    ),
  );

  // 2 adr-edge-integrity
  const dangling: string[] = [];
  for (const a of adrs) {
    for (const target of a.supersedes) {
      if (!byNumber.has(target)) {
        dangling.push(`ADR-${pad(a.number)} names ADR-${pad(target)}, which does not exist`);
      }
    }
  }
  results.push(result("adr-edge-integrity", dangling, "every edge target exists"));

  // 3 supersede-consistency (both directions)
  const inconsistent: string[] = [];
  const fullySupersededTargets = new Set<number>();
  for (const a of adrs) {
    for (const target of a.supersedes) {
      fullySupersededTargets.add(target);
      const t = byNumber.get(target);
      if (t !== undefined && t.status !== "superseded") {
        inconsistent.push(
          `ADR-${pad(a.number)} supersedes ADR-${pad(target)}, but its status is "${t.status}" (flip it to superseded)`,
        );
      }
    }
  }
  for (const a of adrs) {
    if (a.status === "superseded" && !fullySupersededTargets.has(a.number)) {
      inconsistent.push(
        `ADR-${pad(a.number)} is superseded, but no ADR records superseding it (add the outgoing edge)`,
      );
    }
  }
  results.push(result("supersede-consistency", inconsistent, "supersedes ⇔ superseded holds"));

  // 4 story-decisions
  const badDecisions: string[] = [];
  for (const s of stories) {
    for (const n of s.decisions) {
      const a = byNumber.get(n);
      if (a === undefined) {
        badDecisions.push(`story "${s.id}" names ADR-${pad(n)}, which does not exist`);
      } else if (a.status === "superseded") {
        badDecisions.push(
          `story "${s.id}" names ADR-${pad(n)} as deciding, but it is superseded (re-point or drop)`,
        );
      }
    }
  }
  results.push(result("story-decisions", badDecisions, "every story decision resolves"));

  // 5 green-flip
  const drifted: string[] = [];
  for (const s of stories) {
    if (s.status !== "healthy") continue;
    for (const n of s.decisions) {
      const a = byNumber.get(n);
      if (a !== undefined && a.status === "proposed") {
        drifted.push(
          `story "${s.id}" is healthy but its deciding ADR-${pad(n)} is still proposed (accept it or fix the link)`,
        );
      }
    }
  }
  results.push(result("green-flip", drifted, "no healthy story rests on a proposed ADR"));

  // 6 load-bearing-live — the ADR-0086 current-state tag may only sit on an accepted ADR. A proposed
  // one isn't yet current state; a superseded one is dead. Either way it would mislead the
  // `adr list --load-bearing` view (the CLI replacement for the hand-maintained CLAUDE.md list).
  const mistagged: string[] = [];
  for (const a of adrs) {
    if (a.loadBearing && a.status !== "accepted") {
      mistagged.push(
        `ADR-${pad(a.number)} is load_bearing but its status is "${a.status}" — only an accepted ADR may be load-bearing (untag it or accept it).`,
      );
    }
  }
  results.push(result("load-bearing-live", mistagged, "every load-bearing ADR is accepted"));

  // 7 enforced-by-anchors (WARN-class)
  const rotted: string[] = [];
  for (const g of guardrails) {
    for (const token of extractPathTokens(g.enforcedBy)) {
      if (!pathExists(token)) {
        rotted.push(`guardrail "${g.id}" enforcedBy names ${token}, which is gone`);
      }
    }
  }
  results.push(
    result("enforced-by-anchors", rotted, "every enforcedBy path anchor resolves", true),
  );

  // 8 adr-body-links — no decision body carries a markdown link that only ever resolved from
  // `docs/decisions/`. TWO classes, ONE rung, because they are one defect: a row has no location,
  // so a relative link in a body has no base to resolve from.
  //
  // The successor to `adr-link-integrity` (see {@link RETIRED_ADR_CHECKS} for what its retirement
  // note got right and what it did not). The old rung asked whether a link's TARGET FILE existed;
  // since PR #1546 none of them do, so the answerable question is whether the link exists at all.
  //
  // The finder is `findDecisionFileLinks`, the SAME function `delinkDecisionFileLinks` is built on,
  // so a link the fixer would not touch cannot read as clean here.
  const deadLinks: string[] = [];
  for (const d of decisionBodies) {
    for (const link of findDecisionFileLinks(d.body)) {
      deadLinks.push(
        `ADR-${pad(d.number)} body links to ADR-${pad(link.number)} as a FILE — ${link.raw} — ` +
          "and docs/decisions/ was deleted by PR #1546 (ADR-0403 dec 1). De-link it: the number is " +
          `the address now, and "storytree library artifact adr-${pad(link.number)}" opens it.`,
      );
    }
    // The REPO-PATH class. Whether the target still exists is deliberately NOT asked: all 230 were
    // `../`-relative to a directory that no longer exists, so a live target is the same broken link
    // as a dead one. `findRepoPathLinks` is the SAME finder `delinkRepoPathLinks` is built on.
    for (const link of findRepoPathLinks(d.body)) {
      deadLinks.push(
        `ADR-${pad(d.number)} body links to a repo path as ${link.raw} — that \`../\` resolved from ` +
          "docs/decisions/, which PR #1546 deleted, and a row has no location to resolve it from. " +
          `De-link it to the rooted path: \`${rootedRepoPath(link.target)}\`.`,
      );
    }
  }
  // A BLIND READ IS NOT A CLEAN ONE. Decisions always have bodies, so zero of them alongside a
  // non-empty `adrs` means the caller wired no view — the shape that reports PASS having examined
  // nothing. Named as a failure of the READER, since there is no corpus repair to prescribe.
  if (decisionBodies.length === 0 && adrs.length > 0) {
    deadLinks.push(
      `adr-body-links read 0 decision bodies while ${String(adrs.length)} decisions were loaded — ` +
        "this run verified NOTHING. The `decisionBodies` view is unwired, not the corpus clean.",
    );
  }
  results.push(
    result(
      "adr-body-links",
      deadLinks,
      `${decisionBodies.length} decision bodies carry no link that resolved only from docs/decisions/`,
    ),
  );

  return results;
}

/** Only the GATE-class FAILs (a WARN never gates) — same contract as health.ts's gateFailures. */
export function adrGateFailures(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => r.level === "FAIL" && ADR_GATE_CHECKS.has(r.name));
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

// ---------------------------------------------------------------------------
// fs-backed loaders (the thin shell around the pure core)
// ---------------------------------------------------------------------------
// NOTE: `loadAdrMetas` moved to `@storytree/drive` (the drive extraction) so the build drivers
// can consume it without pulling cli's `adr-health` (and its `health.ts` `CheckResult` dep). Import
// it from `@storytree/drive` if you need it here.

/*
 * `loadRetiredInPartEdges` and `loadDeadAdrLinks` stood here. Both were RAW SCANS of the
 * `docs/decisions` FILES — one hunting the ADR-0139-retired `supersedes_in_part` frontmatter key,
 * the other resolving `](NNNN-slug.md)` cross-links between decision bodies — and both went with
 * their checks when decisions became rows (ADR-0403 dec 1). {@link RETIRED_ADR_CHECKS} carries the
 * per-check reason; what matters here is that neither had a store-backed successor to write: the
 * first guarded a state the `adr` schema now refuses outright, and the second's rot class is
 * rehomed into `references`, where `referential-integrity` already reads it.
 */

/** Load every story's decision view from `stories/<id>/story.md` (the node-spec light loader). */
export function loadStoryDecisions(storiesDir: string): StoryDecisionsView[] {
  const out: StoryDecisionsView[] = [];
  for (const entry of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(storiesDir, entry.name, "story.md");
    if (!existsSync(file)) continue;
    const spec = loadNodeSpec(file);
    out.push({ id: spec.id, status: spec.status, decisions: spec.decisions });
  }
  return out;
}
