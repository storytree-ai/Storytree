/**
 * `storytree adopt plan <id>` — the Layer-2 ADOPTION-PLAN report (ADR-0097 Layer 2).
 *
 * Pressing Adopt (Layer 1) flips a brownfield story `mapped → proposed` and observe-and-signs its
 * already-green `observe` gates — but it does not say what the UNTESTED pockets still need. This command
 * answers that in two depths:
 *
 *  - WITHOUT readings (offline, the default): the pure {@link classifyAdoption} covers-diff (the
 *    structural Fork-1 compute) rendered as the per-capability covered/uncovered classification — the
 *    mechanical hand-off the story-author agent reads to do the deeper observe/R1/R2 analysis.
 *  - WITH agent readings (`--readings <file>`): the FULL adoption proposal ({@link assembleProposal}) —
 *    each uncovered pocket stamped with its observe/R1/R2 class, a recommend-only reliability-gate stanza
 *    per classified pocket, and the surfaced design forks partitioned escalated-vs-routine (the
 *    "decisions I need from you" surface ADR-0097 d.3/d.4 names). This is the JUDGMENT half of Layer 2.
 *
 * Read-only and OFFLINE: it reads the spec off disk + the readings the caller injects, and classifies in
 * memory — no DB, no `--pg`, no spend. Recommend-only: it greens nothing and authors nothing (ADR-0097
 * d.4 — the machine never writes the authored spec). Pure-by-injection (the story loader + the readings
 * are seams), so the whole command is offline-testable with a fixture loader.
 */

import {
  assembleProposal,
  classifyAdoption,
  renderProposedGate,
  type AdoptionProposal,
  type CapAdoption,
  type ClassifierGate,
  type DecisionSweep,
  type PocketReading,
  type ProposedGate,
} from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/** A story's adoptable facts the plan classifies: its status + declared caps + reliability gates. */
export interface AdoptPlanStory {
  /** The story's authored status (for the report's framing — `mapped` / `proposed` / …). */
  status: string;
  /** The story's declared capability ids (`NodeSpec.capabilities`), in declared order. */
  capabilities: string[];
  /** The story's parsed `## Reliability Gates` (`NodeSpec.reliabilityGates`) — only id/kind/covers read. */
  gates: ClassifierGate[];
}

export interface AdoptPlanDeps {
  /** Load a story's adoptable facts; null for a missing/odd spec or a non-story tier. Injectable for tests. */
  loadStory: (storyId: string) => AdoptPlanStory | null;
}

/** Plan-mode options. `readings` switches the report from the mechanical covers-diff to the full proposal. */
export interface AdoptPlanOpts {
  /**
   * The agent's per-pocket readings (ADR-0098 d.1), keyed by capability id. When present the plan renders
   * the ENRICHED proposal (stamped observe/R1/R2 classes + recommended gate stanzas + the decision sweep);
   * absent → the mechanical covers-diff. An uncovered cap absent from the map stays `unclassified`.
   */
  readings?: Readonly<Record<string, PocketReading>>;
}

/** Render the covering gates for a covered cap: `library#gate-1 (observe)`, comma-joined. */
function coveredByLine(cap: CapAdoption): string {
  return cap.coveredBy.map((g) => `${g.gateId} (${g.kind})`).join(", ");
}

/** The covered/uncovered classification rendered as report lines (shows the stamped pocket class). */
function classificationLines(proposal: AdoptionProposal): string[] {
  const lines: string[] = [];
  const idWidth = Math.max(1, ...proposal.capabilities.map((c) => c.capId.length));
  for (const cap of proposal.capabilities) {
    if (cap.covered) {
      lines.push(`  ✓ ${cap.capId.padEnd(idWidth)}  COVERED    by ${coveredByLine(cap)}`);
    } else {
      lines.push(
        `  ○ ${cap.capId.padEnd(idWidth)}  UNCOVERED  owes real work — pocket: ${cap.pocket ?? "unclassified"}`,
      );
    }
  }
  return lines;
}

/** The recommend-only reliability-gate stanzas (enriched only) — pasteable `## Reliability Gates` items. */
function proposedGatesLines(gates: ProposedGate[]): string[] {
  if (gates.length === 0) return [];
  const lines = [
    "",
    `Recommended reliability gates (${gates.length}) — RECOMMEND-ONLY: paste under the story's`,
    "`## Reliability Gates` and review. Nothing greens until adopted (`observe`) or driven",
    "(`storytree gate run <story>#gate-<n> --real --pg`, `build-tests`):",
    "",
  ];
  gates.forEach((g, i) => lines.push(`  ${i + 1}. ${renderProposedGate(g)}`));
  return lines;
}

/** The "decisions I need from you" surface (enriched only) — escalated (owner) vs routine (leaf). */
function decisionsLines(sweep: DecisionSweep): string[] {
  if (sweep.decisions.length === 0) return [];
  const lines = ["", "Decisions I need from you (the owner-fork bar, ADR-0098 d.5):", ""];
  if (sweep.escalated.length > 0) {
    lines.push(`  ESCALATED — your call (${sweep.escalated.length}):`);
    for (const f of sweep.escalated) {
      lines.push(`    • ${f.question}  [${f.id}]${f.resolved ? "  ✓ resolved" : "  ⧗ unresolved"}`);
    }
  } else {
    lines.push("  ESCALATED — your call: none");
  }
  if (sweep.routine.length > 0) {
    lines.push("", `  ROUTINE — the leaf decides (${sweep.routine.length}):`);
    for (const f of sweep.routine) lines.push(`    · ${f.question}  [${f.id}]`);
  }
  if (!sweep.clear) {
    lines.push(
      "",
      `  ⧗ ${sweep.blocked.length} escalated fork(s) unresolved — a build-tests drive HALTS until you resolve them.`,
    );
  }
  return lines;
}

/**
 * `storytree adopt plan <story-id>` — classify what bringing a brownfield story into the fold takes.
 * With `opts.readings` it renders the full ADR-0097-Layer-2 proposal; without, the mechanical covers-diff.
 */
export async function adoptPlanCommand(
  storyId: string | undefined,
  deps: AdoptPlanDeps,
  opts: AdoptPlanOpts = {},
): Promise<Envelope> {
  if (storyId === undefined || storyId.trim().length === 0) {
    return {
      ok: false,
      body: "adopt plan needs a story id: storytree adopt plan <story-id>",
      next: ["storytree tree"],
    };
  }
  const id = storyId.trim();
  const story = deps.loadStory(id);
  if (story === null) {
    return {
      ok: false,
      body: `no story "${id}" (looked for stories/${id}/story.md, or its spec did not load / is not a story).`,
      next: ["storytree tree"],
    };
  }

  if (story.capabilities.length === 0 && story.gates.length === 0) {
    return {
      ok: true,
      body: `Story "${id}" declares no capabilities and no \`## Reliability Gates\` — nothing to classify (a pure port greens from its gates; a story owes per-cap coverage).`,
      next: [`storytree gate list ${id} --pg`, `storytree tree ${id}`],
    };
  }

  // The ENRICHED proposal (typed) only when readings are injected; else undefined. Kept as its own
  // typed handle (rather than `in`-narrowing a union) because `AdoptionProposalEnriched` is a subtype of
  // `AdoptionProposal`, so the union collapses and the narrowing would lose `proposedGates` / `sweep`.
  const enrichedProposal =
    opts.readings !== undefined
      ? assembleProposal({
          storyId: id,
          capabilityIds: story.capabilities,
          gates: story.gates,
          readings: opts.readings,
        })
      : undefined;
  const enriched = enrichedProposal !== undefined;
  const proposal: AdoptionProposal =
    enrichedProposal ??
    classifyAdoption({ storyId: id, capabilityIds: story.capabilities, gates: story.gates });

  const total = proposal.capabilities.length;
  const lines: string[] = [
    enriched
      ? `Adoption proposal for "${id}" (status: ${story.status}) — ADR-0097 Layer 2 (agent readings applied)`
      : `Adoption plan for "${id}" (status: ${story.status}) — ADR-0097 Layer 2`,
    "",
    `capabilities: ${total}  (${proposal.covered.length} covered, ${proposal.uncovered.length} uncovered)`,
    "",
    ...classificationLines(proposal),
  ];

  // The enriched sections (only when `assembleProposal` ran): the recommended gates + the decision sweep.
  if (enrichedProposal !== undefined) {
    lines.push(
      ...proposedGatesLines(enrichedProposal.proposedGates),
      ...decisionsLines(enrichedProposal.sweep),
    );
  }

  if (proposal.danglingCovers.length > 0) {
    lines.push(
      "",
      `⚠ dangling (covers:) — ${proposal.danglingCovers.length} cap id(s) named in a gate's \`(covers:)\` but NOT declared`,
      `  by this story (a mis-declaration — fix the tag or add the capability): ${proposal.danglingCovers.join(", ")}`,
    );
  }

  if (enriched) {
    lines.push(
      "",
      "RECOMMEND-ONLY (ADR-0097 d.4): this proposal authors nothing and greens nothing. Paste the gates",
      "you accept under the story's `## Reliability Gates`, resolve the escalated forks, then `storytree",
      "adopt <story> --pg` (observe) / `gate run <gate> --real --pg` (build-tests) earns the green.",
    );
  } else {
    lines.push(
      "",
      "COVERED = a declared `(covers:)` reliability gate names the cap (structural — Fork 1 trusts the",
      "declaration; coverage MEASUREMENT is named follow-on). An `observe` gate makes it adopt-able as-is;",
      "a `build-tests`/`integrate` gate declares a path earned by real work.",
      "UNCOVERED = no gate covers it; it owes real `build-tests` work and holds the crown at `proposed`",
      "(ADR-0097 d.5). The finer per-cap call — characterize / behavioural-red / refactor-for-testability —",
      "is the story-author's analysis (ADR-0098 §5); re-run with `--readings <file>` to apply it.",
    );
  }

  return {
    ok: true,
    // ok stays true even with uncovered caps — the plan is an honest report, not a gate. Dangling
    // covers are a surfaced warning, not a failure (the spec still classifies).
    body: lines.join("\n"),
    next: enriched
      ? [`storytree adopt ${id} --pg`, `storytree gate run ${id}#gate-1 --real --pg`]
      : [`storytree gate list ${id} --pg`, `storytree tree ${id} --pg`],
  };
}
