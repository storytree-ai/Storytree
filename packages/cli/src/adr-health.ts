import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseAdrFrontmatter, type AdrMeta } from "./adr-frontmatter.js";
import { loadNodeSpec } from "@storytree/orchestrator";

import type { CheckResult } from "./health.js";

/**
 * The decision-binding health checks (ADR-0037 §3–4) — the module that fires the errors when a
 * claim about a decision drifts. ONE pure core (`adrHealth`) over injected views, with thin
 * fs-backed loaders, mirroring `health.ts`'s shape. Enforced through the ADR-0022 CI gate by
 * `adr-health.test.ts`'s real-repo case: a GATE-class FAIL here is a red `pnpm -r test`.
 *
 * Checks:
 *   1 adr-frontmatter      — every docs/decisions file parses with a known status (GATE)
 *   1b adr-number-unique   — no two ADR files share a number (the parallel-authoring collision the
 *                            DB allocator + this gate close, ADR-0050) (GATE)
 *   2 adr-edge-integrity   — every supersedes / supersedes_in_part / amends target exists (GATE)
 *   3 supersede-consistency — X.supersedes ∋ Y ⇔ Y.status = superseded, both directions (GATE)
 *   4 story-decisions      — every story `decisions` entry resolves, and none names a FULLY
 *                            superseded ADR as deciding (GATE)
 *   5 green-flip           — a `healthy` story whose deciding ADR is still `proposed` (GATE;
 *                            resolve by flipping the ADR `proposed → accepted` — an agent MAY now
 *                            perform that green flip, ADR-0084, so this is self-resolvable, not an
 *                            escalation; flipping to `superseded` stays a human call)
 *   6 enforced-by-anchors  — backtick path tokens in guardrail `enforcedBy` resolve on disk
 *                            (WARN — enforcedBy stays prose; oq-artifact-code-backing → B)
 */

export const ADR_GATE_CHECKS: ReadonlySet<string> = new Set([
  "adr-frontmatter",
  "adr-number-unique",
  "adr-edge-integrity",
  "supersede-consistency",
  "story-decisions",
  "green-flip",
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
  const { adrs, parseErrors, stories, guardrails, pathExists } = inputs;
  const byNumber = new Map(adrs.map((a) => [a.number, a]));
  const results: CheckResult[] = [];

  // 1 adr-frontmatter
  results.push(
    result("adr-frontmatter", parseErrors, `${adrs.length} ADRs parsed, statuses known`),
  );

  // 1b adr-number-unique — two files sharing a number is the parallel-authoring collision (ADR-0050).
  // The DB allocator (`storytree adr new`) prevents it proactively; this makes any slip un-mergeable:
  // CI runs on the PR's merge-into-main ref, so a number already on main fails the PR, and a
  // concurrent pair fails the gate on main the moment the second lands (it can never silently stay).
  const byNumberFiles = new Map<number, string[]>();
  for (const a of adrs) {
    const arr = byNumberFiles.get(a.number);
    if (arr) arr.push(a.file);
    else byNumberFiles.set(a.number, [a.file]);
  }
  const collisions: string[] = [];
  for (const [num, files] of byNumberFiles) {
    if (files.length > 1) {
      collisions.push(
        `ADR-${pad(num)} is claimed by ${files.length} files: ${[...files].sort().join(", ")} ` +
          `— renumber all but one (\`storytree adr new\` reserves a free number).`,
      );
    }
  }
  results.push(result("adr-number-unique", collisions, `${byNumberFiles.size} ADR numbers, all unique`));

  // 2 adr-edge-integrity
  const dangling: string[] = [];
  for (const a of adrs) {
    for (const target of [...a.supersedes, ...a.supersedesInPart, ...a.amends]) {
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

  // 6 enforced-by-anchors (WARN-class)
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

/** Parse every `NNNN-*.md` under a decisions dir; parse failures become check-1 lines, not throws. */
export function loadAdrMetas(decisionsDir: string): { adrs: AdrMeta[]; parseErrors: string[] } {
  const adrs: AdrMeta[] = [];
  const parseErrors: string[] = [];
  for (const file of readdirSync(decisionsDir).sort()) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      adrs.push(parseAdrFrontmatter(file, readFileSync(path.join(decisionsDir, file), "utf8")));
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { adrs, parseErrors };
}

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
