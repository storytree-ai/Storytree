/**
 * `storytree tree [<story-id>]` command (tree-view capability, stories/notice-board).
 *
 * Bare view  — all stories: id, title, status, capability count; active-session summary when live.
 * Focused view — one story's hierarchy, build surface, dependency edges, and the presence block.
 *
 * Offline by default; presence is advisory and silently absent on null / errors.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { classifyPresence } from "@storytree/notice-board";
import type { UatTest, ReliabilityGate } from "@storytree/library";
import { loadNodeSpec, rollupStatus, rollupStoryGreen, rollupStoryUat } from "@storytree/orchestrator";

import type { PresenceStoreLike } from "./noticeboard.js";
import type { Envelope } from "./envelope.js";
import {
  deriveVerdictGlyphs,
  glyphFor,
  readVerdictEvents,
  type VerdictReaderLike,
} from "./tree-verdicts.js";
import {
  attestationMark,
  readAttestations,
  type AttestationReaderLike,
} from "./tree-attestations.js";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface TreeDeps {
  storiesDir: string;
  /** Registry seam: non-null = registered; `.real !== undefined` = REAL-buildable. */
  lookupConfig: (id: string) => { real?: unknown } | null;
  presence: PresenceStoreLike | null;
  /**
   * The verdict event log (verdict-glyphs capability): the live work-store slice when --pg;
   * absent/null offline — glyphs are then silently absent, never an error.
   */
  verdicts?: VerdictReaderLike | null;
  /**
   * The attestation log (ADR-0044 `attestation-surface`): the live store when --pg; null/absent
   * offline — the per-UAT-test marks are then silently absent (the UAT-test list still renders,
   * parsed from the spec; only the mark column drops, like the verdict glyphs).
   */
  attestations?: AttestationReaderLike | null;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface StoryEntry {
  id: string;
  dir: string;
}

function discoverStories(storiesDir: string): StoryEntry[] {
  if (!existsSync(storiesDir)) return [];
  const result: StoryEntry[] = [];
  for (const entry of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const storyFile = path.join(storiesDir, entry.name, "story.md");
    if (existsSync(storyFile)) {
      result.push({ id: entry.name, dir: path.join(storiesDir, entry.name) });
    }
  }
  return result;
}

function buildMark(
  id: string,
  lookupConfig: (id: string) => { real?: unknown } | null,
): string {
  const cfg = lookupConfig(id);
  if (cfg === null) return "unregistered";
  if (cfg.real !== undefined) return "REAL-buildable";
  return "registered";
}

function formatAge(lastSeenAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(lastSeenAt).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

// ---------------------------------------------------------------------------
// treeCommand
// ---------------------------------------------------------------------------

export async function treeCommand(
  storyId: string | undefined,
  deps: TreeDeps,
): Promise<Envelope> {
  const stories = discoverStories(deps.storiesDir);

  // Verdict glyphs (verdict-glyphs capability): one signed-verdict glyph per node row —
  // ✓ proven / ✗ last run failed / – never built. The raw events are read ONCE: `glyphs` is the
  // per-unit latest-verdict map (null offline / on any read error → `mark` is the empty string, the
  // column simply absent), and the same events feed the per-test UAT roll-up below (ADR-0082). A
  // capability/legacy row's glyph is its own unit id; a story crown rolls its per-test UAT up.
  const verdictEvents = await readVerdictEvents(deps.verdicts ?? null);
  const glyphs = verdictEvents === null ? null : deriveVerdictGlyphs(verdictEvents);
  const mark = (unitId: string): string => {
    const g = glyphFor(glyphs, unitId);
    return g === "" ? "" : ` ${g}`;
  };
  // The PROVEN glyph for one unit derived from the SIGNED verdicts (✓ pass / ✗ fail / – none) — the
  // gate verdict, distinct from the ADR-0044 attestation vouch marks. Offline (no events) → "".
  const provenMark = (unitId: string): string => {
    if (verdictEvents === null) return "";
    const s = rollupStatus(unitId, verdictEvents);
    return s === "healthy" ? "✓" : s === "unhealthy" ? "✗" : "–";
  };

  // -------------------------------------------------------------------------
  // Bare view (no storyId)
  // -------------------------------------------------------------------------
  if (storyId === undefined) {
    const lines: string[] = ["Stories:"];

    for (const { id, dir } of stories) {
      const storyFile = path.join(dir, "story.md");
      let title = "(unknown)";
      let status = "(unknown)";
      let capCount = 0;
      try {
        const spec = loadNodeSpec(storyFile);
        title = spec.title;
        status = spec.status;
        capCount = spec.capabilities.length;
      } catch {
        // tolerate load failures — still list the story
      }
      lines.push(`  ${id}${mark(id)}  ${title}  status=${status}  caps=${capCount}`);
    }

    if (deps.presence !== null) {
      try {
        const active = await deps.presence.listActive();
        lines.push(`\nActive sessions: ${active.length}`);
      } catch {
        // silently absent
      }
    }

    const next: string[] = stories.map(({ id }) => `storytree tree ${id}`);
    return { ok: true, body: lines.join("\n"), next };
  }

  // -------------------------------------------------------------------------
  // Focused view (storyId given)
  // -------------------------------------------------------------------------
  const storyEntry = stories.find((s) => s.id === storyId);
  if (storyEntry === undefined) {
    return {
      ok: false,
      body: `Unknown story "${storyId}". Available: ${
        stories.map((s) => s.id).join(", ") || "(none)"
      }`,
      next: stories.map((s) => `storytree tree ${s.id}`),
    };
  }

  const storyFile = path.join(storyEntry.dir, "story.md");
  let storyTitle = "(unknown)";
  let storyStatus = "(unknown)";
  let storyOutcome = "(unknown)";
  let capIds: string[] = [];
  let uatTests: UatTest[] = [];
  let reliabilityGates: ReliabilityGate[] = [];
  try {
    const spec = loadNodeSpec(storyFile);
    storyTitle = spec.title;
    storyStatus = spec.status;
    storyOutcome = spec.outcome;
    capIds = spec.capabilities;
    uatTests = spec.uatTests;
    reliabilityGates = spec.reliabilityGates;
  } catch {
    // tolerate — render what we can
  }

  interface CapRow {
    id: string;
    title: string;
    status: string;
    dependsOn: string[];
    mark: string;
  }

  const capRows: CapRow[] = [];
  for (const capId of capIds) {
    const capFile = path.join(storyEntry.dir, `${capId}.md`);
    let title = "(spec missing)";
    let status = "(spec missing)";
    let dependsOn: string[] = [];
    if (existsSync(capFile)) {
      try {
        const spec = loadNodeSpec(capFile);
        title = spec.title;
        status = spec.status;
        dependsOn = spec.dependsOn;
      } catch {
        // tolerate
      }
    }
    capRows.push({
      id: capId,
      title,
      status,
      dependsOn,
      mark: buildMark(capId, deps.lookupConfig),
    });
  }

  // The story crown's PROVEN state (ADR-0083 Fork A + ADR-0085): a story greens from the AND of TWO
  // necessary clauses — every capability proven healthy AND the story's OWN-PROOF obligations all
  // proven (rollupStoryGreen) — never the story's own unit-id verdict. Own-proof obligations are the
  // UNION of the per-test UAT tests (ADR-0082) AND the `## Reliability Gates` (ADR-0085, the
  // brownfield obligation set). Capabilities-green is necessary (the dependency rule), refining
  // ADR-0082's UAT-only crown. The UAT and gate clauses are each surfaced below as sub-signals. A
  // legacy story with NEITHER keeps the own-unit glyph. Offline (no verdict events) there is no column.
  // ADR-0097: a WOULD-BE (aspirational, unscripted) UAT leg is NOT a hard crown obligation — it must
  // not wedge the story until a real test backs it. The hard own-proof set is the witnessable UAT legs
  // (would-be filtered out) UNION the reliability gates.
  const hardUatTests = uatTests.filter((t) => !t.wouldBe);
  const ownObligations = [...hardUatTests, ...reliabilityGates];
  const storyUatRollup =
    hardUatTests.length > 0 && verdictEvents !== null
      ? rollupStoryUat(hardUatTests, verdictEvents)
      : undefined;
  const storyGatesRollup =
    reliabilityGates.length > 0 && verdictEvents !== null
      ? rollupStoryUat(reliabilityGates, verdictEvents)
      : undefined;
  const storyGreen =
    ownObligations.length > 0 && verdictEvents !== null
      ? // ADR-0097: the reliability gates double as per-cap COVERAGE — a brownfield cap with no driven
        // verdict greens via an adopted gate that `(covers:)` it.
        rollupStoryGreen(capIds, ownObligations, verdictEvents, reliabilityGates)
      : undefined;
  const crownMark = (): string => {
    if (ownObligations.length === 0) return mark(storyId); // legacy: the story's own UAT-node verdict
    if (verdictEvents === null) return ""; // offline: no proof column
    const g = storyGreen === "healthy" ? "✓" : storyGreen === "unhealthy" ? "✗" : "–";
    return ` ${g}`;
  };

  const lines: string[] = [
    `Story: ${storyId}${crownMark()}`,
    `  title:   ${storyTitle}`,
    `  status:  ${storyStatus}`,
    `  outcome: ${storyOutcome}`,
  ];
  if (hardUatTests.length > 0 && verdictEvents !== null) {
    const word =
      storyUatRollup === "healthy"
        ? "GREEN — every UAT test has a signed pass (the story's UAT is proven, ADR-0082)"
        : storyUatRollup === "unhealthy"
          ? "WITHERED — a proven UAT test regressed to a signed fail"
          : "unproven — not every UAT test has a signed pass yet (under-claims)";
    lines.push(`  UAT proof: ${word}`);
  } else if (uatTests.length > 0 && verdictEvents !== null) {
    // ADR-0097: a `## Story UAT (would-be)` section is the aspirational journey — recorded, not
    // green-blocking. Surface it honestly rather than as "unproven".
    lines.push(`  UAT proof: would-be — ${uatTests.length} aspirational leg(s), no scripted test yet (ADR-0097)`);
  }
  if (reliabilityGates.length > 0 && verdictEvents !== null) {
    // The brownfield reliability-gate sub-signal (ADR-0085): the author-declared obligation set that
    // flips a brownfield/foundational story green, distinct from UAT (an `observe` gate is adopted).
    const word =
      storyGatesRollup === "healthy"
        ? "GREEN — every reliability gate has a signed pass (the brownfield obligations are met, ADR-0085)"
        : storyGatesRollup === "unhealthy"
          ? "WITHERED — a proven reliability gate regressed to a signed fail"
          : "unproven — not every reliability gate has a signed pass yet (under-claims)";
    lines.push(`  reliability gates: ${word}`);
  }
  if (ownObligations.length > 0 && verdictEvents !== null) {
    // The CROWN (ADR-0083 Fork A + ADR-0085): green = (all capabilities proven healthy) AND (the
    // story's own-proof obligations — its UAT tests AND its reliability gates — all proven). A story
    // with zero capabilities (a foundational port) satisfies the capability clause vacuously.
    const capNote = capIds.length === 0 ? " (no capabilities — vacuous; green is the own-proof alone)" : "";
    const greenWord =
      storyGreen === "healthy"
        ? "GREEN — all capabilities proven healthy AND the story's own-proof obligations are proven"
        : storyGreen === "unhealthy"
          ? "WITHERED — a capability or a proven obligation is a signed fail"
          : "unproven — a capability is not yet proven healthy, or an obligation is not yet proven (under-claims)";
    lines.push(`  story green: ${greenWord}${capNote} (ADR-0083 Fork A + ADR-0085)`);
  }
  lines.push("", "Capabilities:");
  for (const row of capRows) {
    lines.push(
      `  ${row.id}${mark(row.id)}  ${row.title}  status=${row.status}  build=${row.mark}  depends_on=[${row.dependsOn.join(", ")}]`,
    );
  }

  const edges: string[] = [];
  for (const row of capRows) {
    for (const dep of row.dependsOn) {
      edges.push(`${dep} → ${row.id}`);
    }
  }
  if (edges.length > 0) {
    lines.push("", "Dependency edges:");
    for (const edge of edges) {
      lines.push(`  ${edge}`);
    }
  }

  // UAT-tests block (ADR-0044 attestation-surface + ADR-0082 per-test proof): the story's addressable
  // UAT tests, each with TWO distinct, never-conflated signals — `proven=` is the SIGNED verdict
  // (✓/✗/– the gate proof, ADR-0082, present only with --pg) and the trailing mark (◉/▣) is the
  // lower-rigor ADR-0044 attestation VOUCH. Both drop silently offline (the test list still renders
  // from the spec). The vouch never rolls up to the story; the verdicts do (rollupStoryUat above).
  if (uatTests.length > 0) {
    const marks = await readAttestations(deps.attestations ?? null);
    lines.push("", "UAT tests:");
    const idWidth = Math.max(...uatTests.map((t) => t.id.length));
    for (const t of uatTests) {
      const proven = provenMark(t.id);
      const provenCol = proven === "" ? "" : `  proven=${proven}`;
      const vouch = attestationMark(marks, t.id);
      const vouchCol = vouch === "" ? "" : `  ${vouch}`;
      lines.push(
        `  ${t.id.padEnd(idWidth)}  witness=${t.witness.padEnd(7)}${provenCol}  ${t.title}${vouchCol}`,
      );
    }
  }

  // Presence block — advisory, never throws, silently absent when empty or on error
  const relevantNodes = new Set<string>([storyId, ...capIds]);
  if (deps.presence !== null) {
    try {
      const active = await deps.presence.listActive();
      const matching = active.filter((doc) =>
        doc.nodes.some((n) => relevantNodes.has(n)),
      );
      if (matching.length > 0) {
        lines.push("", "sessions here:");
        const now = deps.now();
        for (const doc of matching) {
          const band = classifyPresence(doc.lastSeenAt, now);
          const age = formatAge(doc.lastSeenAt, now);
          lines.push(`  ${doc.sessionId}  [${band}]  ${age}  ${doc.workingOn}`);
        }
      }
    } catch {
      // silently absent — the view still renders ok: true
    }
  }

  // Next pointers
  const next: string[] = [
    `storytree noticeboard declare --working-on <prose> --node ${storyId} --pg`,
  ];
  const realCap = capRows.find((r) => r.mark === "REAL-buildable");
  if (realCap !== undefined) {
    next.push(`storytree node build ${realCap.id} --real`);
  }
  next.push("storytree tree");

  return { ok: true, body: lines.join("\n"), next };
}
