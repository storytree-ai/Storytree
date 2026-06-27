import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type AdrMeta } from "@storytree/drive";
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
 *   3b supersede-in-part-note — the partial-supersession analogue of check 3: every
 *                            `supersedes_in_part` target carries the standardized INCOMING note
 *                            naming the superseding ADR (ADR-0037 §1 — incoming edges live as derived
 *                            `## Status` prose). A partially-overtaken ADR is NOT flipped to
 *                            superseded (it stays accepted, live in part), so check 3 structurally
 *                            never sees it; without this, a stale body with no incoming note is
 *                            gate-clean — the ADR-0011 §5 "DBOS stands" latent trap (GATE)
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
 */

export const ADR_GATE_CHECKS: ReadonlySet<string> = new Set([
  "adr-frontmatter",
  "adr-number-unique",
  "adr-edge-integrity",
  "supersede-consistency",
  "supersede-in-part-note",
  "story-decisions",
  "green-flip",
  "load-bearing-live",
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
  /** Each ADR's body text (post-frontmatter) by number — what `supersede-in-part-note` reads (ADR-0037 §1). */
  readonly adrBodies: ReadonlyMap<number, string>;
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

/**
 * Does an ADR body carry the standardized INCOMING note for being superseded-in-part by ADR-`n`?
 * Canonical form (ADR-0037 §1, owner-ratified): `**Superseded-in-part by [ADR-NNNN](file)** — …` in
 * the `## Status` section. The matcher is tolerant of case, of the hyphen/space in "in-part", and of
 * ADR-number zero-padding, but it REQUIRES the "superseded-in-part by" phrasing keyed to the
 * superseding ADR — the older "partially superseded by" wording is normalized to this, never matched.
 */
export function hasSupersededInPartNote(body: string, supersedingNumber: number): boolean {
  return new RegExp(`superseded[\\s-]in[\\s-]part by\\s*\\[?ADR-0*${supersedingNumber}\\b`, "i").test(
    body,
  );
}

function result(name: string, failLines: string[], cleanNote: string, warn = false): CheckResult {
  if (failLines.length === 0) return { name, level: "PASS", lines: [cleanNote] };
  return { name, level: warn ? "WARN" : "FAIL", lines: failLines };
}

export function adrHealth(inputs: AdrHealthInputs): CheckResult[] {
  const { adrs, parseErrors, adrBodies, stories, guardrails, pathExists } = inputs;
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

  // 3b supersede-in-part-note — the partial-supersession analogue of check 3. A `supersedes_in_part`
  // target is NOT flipped to superseded (it stays accepted, still live in part), so check 3 never
  // touches it. The consistency it owes instead: the partially-overtaken ADR must carry the
  // standardized INCOMING note naming the superseding ADR (ADR-0037 §1 — incoming edges are derived
  // `## Status` prose). Without it a stale body is gate-clean — the ADR-0011 §5 "DBOS stands" trap.
  const missingPartNotes: string[] = [];
  for (const a of adrs) {
    for (const target of a.supersedesInPart) {
      if (!byNumber.has(target)) continue; // dangling target → adr-edge-integrity (check 2) owns it
      const body = adrBodies.get(target) ?? "";
      if (!hasSupersededInPartNote(body, a.number)) {
        missingPartNotes.push(
          `ADR-${pad(target)} is superseded-in-part by ADR-${pad(a.number)} but carries no incoming note — ` +
            `add to its ## Status: "**Superseded-in-part by [ADR-${pad(a.number)}](${a.file})** — <what's overtaken>"`,
        );
      }
    }
  }
  results.push(
    result(
      "supersede-in-part-note",
      missingPartNotes,
      "every supersede-in-part target carries its incoming note",
    ),
  );

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

/**
 * Load each ADR's body text (everything after the frontmatter block) keyed by ADR number — the view
 * the `supersede-in-part-note` check reads. A file with no/unterminated frontmatter contributes its
 * whole content (the `adr-frontmatter` check owns that failure separately, so this stays fail-soft).
 */
export function loadAdrBodies(decisionsDir: string): Map<number, string> {
  const bodies = new Map<number, string>();
  for (const file of readdirSync(decisionsDir).sort()) {
    const m = /^(\d{4})-.*\.md$/.exec(file);
    if (m === null) continue;
    const content = readFileSync(path.join(decisionsDir, file), "utf8");
    const end = content.startsWith("---\n") ? content.indexOf("\n---", 4) : -1;
    bodies.set(Number(m[1]), end === -1 ? content : content.slice(end + 4));
  }
  return bodies;
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
