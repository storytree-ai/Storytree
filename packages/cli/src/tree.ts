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

import { classifyPresence } from "@storytree/core";
import type { UatTest } from "@storytree/library";
import { loadNodeSpec } from "@storytree/orchestrator";

import type { PresenceStoreLike } from "./noticeboard.js";
import type { Envelope } from "./envelope.js";
import { glyphFor, readVerdictGlyphs, type VerdictReaderLike } from "./tree-verdicts.js";
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
  // ✓ proven / ✗ last run failed / – never built. `glyphs` is null offline (or on any read
  // error), and `mark` is then the empty string: the column simply does not exist. A story
  // row's glyph is looked up under the STORY's own unit id — never a child roll-up.
  const glyphs = await readVerdictGlyphs(deps.verdicts ?? null);
  const mark = (unitId: string): string => {
    const g = glyphFor(glyphs, unitId);
    return g === "" ? "" : ` ${g}`;
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
  try {
    const spec = loadNodeSpec(storyFile);
    storyTitle = spec.title;
    storyStatus = spec.status;
    storyOutcome = spec.outcome;
    capIds = spec.capabilities;
    uatTests = spec.uatTests;
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

  const lines: string[] = [
    `Story: ${storyId}${mark(storyId)}`,
    `  title:   ${storyTitle}`,
    `  status:  ${storyStatus}`,
    `  outcome: ${storyOutcome}`,
    "",
    "Capabilities:",
  ];
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

  // UAT-tests block (attestation-surface, ADR-0044): the story's addressable UAT tests with their
  // per-test attestation marks — human seal / machine mark / – never built, or "" offline (the mark
  // column drops, like the verdict glyphs; the test list itself still renders from the spec). The
  // marks are a VOUCH, not the gate-proven ✓/✗, and never roll up to the story (d.3).
  if (uatTests.length > 0) {
    const marks = await readAttestations(deps.attestations ?? null);
    lines.push("", "UAT tests:");
    const idWidth = Math.max(...uatTests.map((t) => t.id.length));
    for (const t of uatTests) {
      const mark = attestationMark(marks, t.id);
      const markCol = mark === "" ? "" : `  ${mark}`;
      lines.push(`  ${t.id.padEnd(idWidth)}  witness=${t.witness.padEnd(7)}  ${t.title}${markCol}`);
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
