import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type AdrMeta } from "@storytree/drive";
import { loadNodeSpec } from "@storytree/orchestrator";

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
 *
 * Three rungs RETIRED with the files, each with its reason: {@link RETIRED_ADR_CHECKS}.
 */

export const ADR_GATE_CHECKS: ReadonlySet<string> = new Set([
  "adr-frontmatter",
  "adr-number-identity",
  "adr-edge-integrity",
  "supersede-consistency",
  "story-decisions",
  "green-flip",
  "load-bearing-live",
]);

/**
 * THREE RUNGS RETIRED WHEN DECISIONS BECAME ROWS (ADR-0403 dec 1), each for a different reason, and
 * declared here rather than silently dropped — a retired check that leaves no record reads later as
 * a check nobody thought to write.
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
 * - `adr-link-integrity` — GONE, and this is the only one that was a real loss rather than a
 *   dissolved question. It guarded `](NNNN-slug.md)` cross-links between decision BODIES against
 *   rename rot (13 dead targets / 24 occurrences when it was added). A relative file link between
 *   two rows means nothing. Its ROT CLASS is rehomed rather than dropped: the migration loader lifts
 *   every body cross-link into `references` as `asset:adr-NNNN`, where `referential-integrity`
 *   already looks — and a number-based ref has no slug to rot, so the class cannot recur.
 */
export const RETIRED_ADR_CHECKS: ReadonlyMap<string, string> = new Map([
  ["adr-number-unique", "replaced by adr-number-identity — a row id is a primary key (ADR-0403 dec 1)"],
  ["supersedes-in-part-retired", "unreachable — the `adr` schema refuses the key (ADR-0139 + ADR-0403 dec 1)"],
  ["adr-link-integrity", "rehomed into `references` as `asset:adr-NNNN`, read by referential-integrity"],
]);

/** The story view the checks need — id, declared status, deciding ADR numbers. */
export interface StoryDecisionsView {
  readonly id: string;
  readonly status: string;
  readonly decisions: number[];
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
  readonly stories: StoryDecisionsView[];
  readonly guardrails: GuardrailView[];
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
  const { adrs, parseErrors, numberMismatches, stories, guardrails, pathExists } = inputs;
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

  // 2 adr-edge-integrity
  const dangling: string[] = [];
  for (const a of adrs) {
    for (const target of [...a.supersedes, ...a.amends]) {
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
