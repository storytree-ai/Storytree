/**
 * `storytree tree [<story-id>]` command (tree-view capability, stories/notice-board).
 *
 * Bare view  — all stories: id, title, status, capability count.
 * Focused view — one story's hierarchy, build surface, and dependency edges.
 *
 * Offline by default. The old presence block is RETIRED (ADR-0200 D7 — the claim ledger is the one
 * session surface; `storytree noticeboard --pg` is where sessions render now).
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import type { UatTestCriterion, ReliabilityGate } from "@storytree/library";
import {
  activeReliabilityGates,
  crownObligations,
  crownUatCriteria,
  unsignableUatCriteria,
} from "@storytree/library";
import type { StoryCapabilityRef } from "@storytree/orchestrator";
import {
  expansionBeyondBaseline,
  isUndertakenCapability,
  loadNodeSpec,
  rollupCapStatus,
  rollupCriterionStatus,
  rollupStatus,
  rollupStoryGreen,
  rollupStoryUat,
  storyBaselineOf,
} from "@storytree/orchestrator";

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
  /** Clock seam (injectable for tests). Unused since the presence block retired (ADR-0200 D7). */
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
  let uatTestCriteria: UatTestCriterion[] = [];
  let reliabilityGates: ReliabilityGate[] = [];
  try {
    const spec = loadNodeSpec(storyFile);
    storyTitle = spec.title;
    storyStatus = spec.status;
    storyOutcome = spec.outcome;
    capIds = spec.capabilities;
    uatTestCriteria = spec.uatTestCriteria;
    reliabilityGates = spec.reliabilityGates;
  } catch {
    // tolerate — render what we can
  }

  interface CapRow {
    id: string;
    title: string;
    status: string;
    /**
     * The AUTHORED status as a parsed `Status`, or `undefined` when the spec could not be read —
     * distinct from the `status` DISPLAY string above, which carries the "(spec missing)" placeholder.
     * ADR-0443 D1's undertaken test reads this, and an unreadable spec must reach it as `undefined`
     * (⇒ counted, crown held) rather than as a string that is not a status at all.
     */
    authoredStatus: StoryCapabilityRef["status"];
    dependsOn: string[];
    mark: string;
  }

  const capRows: CapRow[] = [];
  for (const capId of capIds) {
    const capFile = path.join(storyEntry.dir, `${capId}.md`);
    let title = "(spec missing)";
    let status = "(spec missing)";
    let authoredStatus: StoryCapabilityRef["status"];
    let dependsOn: string[] = [];
    if (existsSync(capFile)) {
      try {
        const spec = loadNodeSpec(capFile);
        title = spec.title;
        status = spec.status;
        authoredStatus = spec.status;
        dependsOn = spec.dependsOn;
      } catch {
        // tolerate
      }
    }
    capRows.push({
      id: capId,
      title,
      status,
      authoredStatus,
      dependsOn,
      mark: buildMark(capId, deps.lookupConfig),
    });
  }

  // The story crown's PROVEN state (ADR-0083 Fork A + ADR-0085): a story greens from the AND of TWO
  // necessary clauses — every capability proven healthy AND the story's OWN-PROOF obligations all
  // proven (rollupStoryGreen) — never the story's own unit-id verdict. Own-proof obligations are the
  // UNION of the per-test UAT test criteria (ADR-0082) AND the `## Reliability Gates` (ADR-0085, the
  // brownfield obligation set). Capabilities-green is necessary (the dependency rule), refining
  // ADR-0082's UAT-only crown. The UAT and gate clauses are each surfaced below as sub-signals. A
  // legacy story with NEITHER keeps the own-unit glyph. Offline (no verdict events) there is no column.
  // ADR-0436: a gate RETIRED IN PLACE keeps its ordinal but is no longer an obligation, so it is
  // filtered out of the union, the gates sub-signal AND the `(covers:)` coverage argument. The
  // DISPLAY list below stays the full parse — a burned ordinal must remain visible.
  const activeGates = activeReliabilityGates(reliabilityGates);
  // The crown's own-proof obligation set (ADR-0085), with all three drops applied in ONE place
  // (`crownObligations`): would-be legs (ADR-0097), gates retired in place (ADR-0436), and legs that
  // can never be signed as authored (ADR-0443 D2 — a `machine` leg naming no proof gate).
  const hardUatTestCriteria = crownUatCriteria(uatTestCriteria, reliabilityGates);
  const unsignable = unsignableUatCriteria(uatTestCriteria, reliabilityGates);
  const ownObligations = crownObligations(uatTestCriteria, reliabilityGates);
  // ADR-0443 D1: the crown's capability clause reads each cap's AUTHORED status alongside its id, so
  // a `proposed` capability nobody has begun is declared intent rather than a withheld green.
  const capRefs: StoryCapabilityRef[] = capRows.map((row) => ({
    id: row.id,
    status: row.authoredStatus,
  }));
  const storyUatRollup =
    hardUatTestCriteria.length > 0 && verdictEvents !== null
      ? rollupStoryUat(hardUatTestCriteria, verdictEvents)
      : undefined;
  const storyGatesRollup =
    activeGates.length > 0 && verdictEvents !== null
      ? rollupStoryUat(activeGates, verdictEvents)
      : undefined;
  // ADR-0443 D2/D3: the crown is computed whenever the proof layer is readable, NOT only when the
  // story declares an obligation. A story whose every obligation is unsignable — or which declares
  // none — now greens on its proven capabilities, and D3's vacuity floor inside `rollupStoryGreen` is
  // what stops that being a free green. Gating on `ownObligations.length > 0` here would have
  // silently re-imposed the very abstain ADR-0443 D2 removes.
  const storyGreen =
    verdictEvents !== null
      ? // ADR-0097: the reliability gates double as per-cap COVERAGE — a brownfield cap with no driven
        // verdict greens via an adopted gate that `(covers:)` it.
        rollupStoryGreen(capRefs, ownObligations, verdictEvents, activeGates)
      : undefined;
  // ADR-0416 D2/D6: the second fact a durable green must carry — what has been declared since the
  // proven baseline and is not proven yet. Absent until a story-baseline verdict has been signed.
  const expansion =
    verdictEvents === null
      ? undefined
      : expansionBeyondBaseline(storyBaselineOf(storyId, verdictEvents), {
          capabilities: capRefs,
          obligations: ownObligations,
        });
  const crownMark = (): string => {
    if (verdictEvents === null) return ""; // offline: no proof column
    // A LEGACY story that declares no own-proof obligations AND no capabilities has nothing for the
    // crown roll-up to read; its own UAT-node verdict is the only signal it ever had.
    if (ownObligations.length === 0 && capRefs.length === 0 && storyGreen === null) {
      return mark(storyId);
    }
    const g = storyGreen === "healthy" ? "✓" : storyGreen === "unhealthy" ? "✗" : "–";
    return ` ${g}`;
  };
  // The PROVEN glyph for a CAPABILITY row, COVERAGE-aware (ADR-0097 §5; owner Option A, 2026-06-25): a
  // brownfield cap with no own driven verdict wears the SAME ✓ as an own-driven cap when a healthy
  // reliability gate `(covers:)` it — so the crown and its plants tell ONE story (no ✓ crown over `–`
  // plants). The fold is the orchestrator's `rollupCapStatus`, the SAME compute the crown's capability
  // clause uses (rollupStoryGreen), so they can never diverge. Coverage never masks a cap's own signed
  // fail (rollupCapStatus → unhealthy → ✗). Mirrors `mark`'s contract: leading space, "" offline.
  const capMark = (capId: string): string => {
    if (verdictEvents === null) return "";
    const s = rollupCapStatus(capId, verdictEvents, activeGates);
    const g = s === "healthy" ? "✓" : s === "unhealthy" ? "✗" : "–";
    return ` ${g}`;
  };

  const lines: string[] = [
    `Story: ${storyId}${crownMark()}`,
    `  title:   ${storyTitle}`,
    `  status:  ${storyStatus}`,
    `  outcome: ${storyOutcome}`,
  ];
  if (hardUatTestCriteria.length > 0 && verdictEvents !== null) {
    const word =
      storyUatRollup === "healthy"
        ? "GREEN — every UAT test has a signed pass (the story's UAT is proven, ADR-0082)"
        : storyUatRollup === "unhealthy"
          ? "WITHERED — a proven UAT test regressed to a signed fail"
          : "unproven — not every UAT test has a signed pass yet (under-claims)";
    lines.push(`  UAT proof: ${word}`);
  } else if (uatTestCriteria.length > unsignable.length && verdictEvents !== null) {
    // ADR-0097: a `## UAT Test Criteria (would-be)` section is the aspirational journey — recorded, not
    // green-blocking. Surface it honestly rather than as "unproven". Guarded so a story whose hard set
    // is empty because its legs are UNSIGNABLE (ADR-0443 D2) is not mislabelled "aspirational": those
    // legs are real journey steps nothing can witness, and the `unsignable:` line below names them.
    const aspirational = uatTestCriteria.length - unsignable.length;
    lines.push(`  UAT proof: would-be — ${aspirational} aspirational leg(s), no scripted test yet (ADR-0097)`);
  }
  if (activeGates.length > 0 && verdictEvents !== null) {
    // The brownfield reliability-gate sub-signal (ADR-0085): the author-declared obligation set that
    // flips a brownfield/foundational story green, distinct from UAT (an `observe` gate is adopted).
    // Guarded on the ACTIVE gates (ADR-0436), so a story whose only gates are retired prints no gate
    // line at all rather than a permanent "unproven" over an empty obligation set.
    const word =
      storyGatesRollup === "healthy"
        ? "GREEN — every reliability gate has a signed pass (the brownfield obligations are met, ADR-0085)"
        : storyGatesRollup === "unhealthy"
          ? "WITHERED — a proven reliability gate regressed to a signed fail"
          : "unproven — not every reliability gate has a signed pass yet (under-claims)";
    lines.push(`  reliability gates: ${word}`);
  }
  if (verdictEvents !== null && storyGreen !== undefined) {
    // The CROWN (ADR-0083 Fork A + ADR-0085, narrowed by ADR-0443): green = (every UNDERTAKEN
    // capability proven healthy) AND (the story's signable own-proof obligations all proven) AND
    // (at least one of those was actually discharged — D3's vacuity floor). A story with zero
    // undertaken capabilities satisfies the capability clause vacuously.
    // Counted through the REAL predicate, not the authored word: a `proposed` capability carrying a
    // signed verdict IS undertaken, and reporting it as "declared intent" beside its own ✓ plant
    // would contradict the glyph on the very next line.
    const notCounted =
      verdictEvents === null
        ? 0
        : capRefs.filter((c) => !isUndertakenCapability(c, verdictEvents, activeGates)).length;
    const capNote =
      capRefs.length === 0
        ? " (no capabilities — vacuous; green is the own-proof alone)"
        : notCounted > 0
          ? ` (${notCounted} of ${capRefs.length} capabilities are declared intent, not yet begun — not counted, ADR-0443 D1)`
          : "";
    const greenWord =
      storyGreen === "healthy"
        ? "GREEN — every undertaken capability is proven AND every signable own-proof obligation is signed"
        : storyGreen === "unhealthy"
          ? "WITHERED — an undertaken capability or a proven obligation is a signed fail"
          : "unproven — an undertaken capability is not yet proven, or a signable obligation is not yet signed (under-claims)";
    lines.push(`  story green: ${greenWord}${capNote} (ADR-0083 Fork A + ADR-0085 + ADR-0443)`);
  }
  // ADR-0443 D2 — a dropped obligation is announced, never silently subtracted. The crown no longer
  // waits on these, and saying so is what keeps a shrinking checklist visible rather than a quiet
  // green (the abuse ADR-0443's Consequences leave to author judgment rather than to a gate).
  if (unsignable.length > 0 && verdictEvents !== null) {
    lines.push(
      `  unsignable: ${unsignable.length} acceptance step(s) name no proof and can never be signed as ` +
        `authored — recorded, NOT crown obligations (ADR-0443 D2): ${unsignable.map((t) => t.criterionId).join(", ")}`,
    );
  }
  // ADR-0416 D2 — "silence is not acceptable": a durable green must show what it does NOT yet cover.
  if (expansion?.expanded === true) {
    const parts: string[] = [];
    if (expansion.capabilityIds.length > 0) parts.push(`${expansion.capabilityIds.length} capability(ies)`);
    if (expansion.obligationIds.length > 0) parts.push(`${expansion.obligationIds.length} obligation(s)`);
    lines.push(
      `  expanding: ${parts.join(" + ")} declared beyond the proven baseline, not proven yet ` +
        `(the baseline stands — ADR-0416 D2): ${[...expansion.capabilityIds, ...expansion.obligationIds].join(", ")}`,
    );
  }
  lines.push("", "Capabilities:");
  for (const row of capRows) {
    lines.push(
      `  ${row.id}${capMark(row.id)}  ${row.title}  status=${row.status}  build=${row.mark}  depends_on=[${row.dependsOn.join(", ")}]`,
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

  // UAT-test-criteria block (ADR-0044 attestation-surface + ADR-0082 per-test proof): the story's addressable
  // UAT test criteria, each with TWO distinct, never-conflated signals — `proven=` is the SIGNED verdict
  // (✓/✗/– the gate proof, ADR-0082, present only with --pg) and the trailing mark (◉/▣) is the
  // lower-rigor ADR-0044 attestation VOUCH. Both drop silently offline (the test list still renders
  // from the spec). The vouch never rolls up to the story; the verdicts do (rollupStoryUat above).
  if (uatTestCriteria.length > 0) {
    const marks = await readAttestations(deps.attestations ?? null);
    lines.push("", "UAT test criteria:");
    const idWidth = Math.max(...uatTestCriteria.map((t) => t.criterionId.length));
    for (const t of uatTestCriteria) {
      const status = verdictEvents === null ? null : rollupCriterionStatus(t, verdictEvents);
      const proven =
        verdictEvents === null
          ? ""
          : status === "healthy"
            ? "✓"
            : status === "unhealthy"
              ? "✗"
              : "–";
      const provenCol = proven === "" ? "" : `  proven=${proven}`;
      const vouch = attestationMark(marks, t.criterionId);
      const vouchCol = vouch === "" ? "" : `  ${vouch}`;
      lines.push(
        `  ${t.criterionId.padEnd(idWidth)}  witness=${t.witness.padEnd(7)}${provenCol}  ${t.title}${vouchCol}`,
      );
    }
  }

  // Reliability-gates block (ADR-0118: `tree` absorbs gate INSPECTION — was `gate list`). The
  // brownfield obligation set rendered per-gate — id, kind, and the SIGNED-verdict glyph — so the
  // story's full reliability surface reads here on the orientation surface, not only in the standalone
  // `gate list` (kept as a back-compat alias). Mirrors the UAT-test-criteria block: `proven=` (✓/✗/–) is the
  // gate verdict, present only with --pg; the rows still render offline (parsed from the spec).
  if (reliabilityGates.length > 0) {
    lines.push("", "Reliability gates:");
    const idWidth = Math.max(...reliabilityGates.map((g) => g.id.length));
    for (const g of reliabilityGates) {
      // ADR-0436: a RETIRED gate renders with its ordinal and WITHOUT a proof verdict — it is no
      // longer an obligation, so a `proven=–` beside it would read as "not yet earned" when the
      // honest reading is "nothing left to earn". The row itself stays so the burned ordinal is
      // visible to the next author, who must APPEND rather than reuse it.
      if (g.retired) {
        lines.push(`  ${g.id.padEnd(idWidth)}  kind=${g.kind.padEnd(11)}  RETIRED   ${g.title}`);
        continue;
      }
      const proven = provenMark(g.id);
      const provenCol = proven === "" ? "" : `  proven=${proven}`;
      lines.push(`  ${g.id.padEnd(idWidth)}  kind=${g.kind.padEnd(11)}${provenCol}  ${g.title}`);
    }
  }

  // Next pointers (the presence block that used to render here is retired, ADR-0200 D7 — live
  // sessions render on the claim-ledger board: `storytree noticeboard --pg`).
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
