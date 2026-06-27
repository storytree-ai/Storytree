/**
 * `storytree adopt plan <id>` — the Layer-2 ADOPTION-PLAN report (ADR-0097 Layer 2).
 *
 * Pressing Adopt (Layer 1) flips a brownfield story `mapped → proposed` and observe-and-signs its
 * already-green `observe` gates — but it does not say what the UNTESTED pockets still need. This command
 * answers that: it loads a story's spec and runs the pure {@link classifyAdoption} covers-diff (the
 * structural Fork-1 compute), then renders the per-capability covered/uncovered classification as DATA —
 * the hand-off the story-author agent (and the orchestrator session) reads to do the deeper observe/R1/R2
 * analysis (ADR-0098 §5's batch decision-sweep — the same surface viewed from Layer 3; built as one
 * `adopt-plan`, not two).
 *
 * Read-only and OFFLINE: it reads the spec off disk and classifies in memory — no DB, no `--pg`, no
 * spend. Pure-by-injection (the story loader is a seam), so it is offline-testable with a fixture loader.
 */

import {
  classifyAdoption,
  type AdoptionProposal,
  type CapAdoption,
  type ClassifierGate,
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

/** Render the covering gates for a covered cap: `library#gate-1 (observe)`, comma-joined. */
function coveredByLine(cap: CapAdoption): string {
  return cap.coveredBy.map((g) => `${g.gateId} (${g.kind})`).join(", ");
}

/** The covered/uncovered classification rendered as report lines. */
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

/**
 * `storytree adopt plan <story-id>` — classify what bringing a brownfield story into the fold takes.
 */
export async function adoptPlanCommand(
  storyId: string | undefined,
  deps: AdoptPlanDeps,
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

  const proposal = classifyAdoption({
    storyId: id,
    capabilityIds: story.capabilities,
    gates: story.gates,
  });

  const total = proposal.capabilities.length;
  const lines: string[] = [
    `Adoption plan for "${id}" (status: ${story.status}) — ADR-0097 Layer 2`,
    "",
    `capabilities: ${total}  (${proposal.covered.length} covered, ${proposal.uncovered.length} uncovered)`,
    "",
    ...classificationLines(proposal),
  ];

  if (proposal.danglingCovers.length > 0) {
    lines.push(
      "",
      `⚠ dangling (covers:) — ${proposal.danglingCovers.length} cap id(s) named in a gate's \`(covers:)\` but NOT declared`,
      `  by this story (a mis-declaration — fix the tag or add the capability): ${proposal.danglingCovers.join(", ")}`,
    );
  }

  lines.push(
    "",
    "COVERED = a declared `(covers:)` reliability gate names the cap (structural — Fork 1 trusts the",
    "declaration; coverage MEASUREMENT is named follow-on). An `observe` gate makes it adopt-able as-is;",
    "a `build-tests`/`integrate` gate declares a path earned by real work.",
    "UNCOVERED = no gate covers it; it owes real `build-tests` work and holds the crown at `proposed`",
    "(ADR-0097 d.5). The finer per-cap call — characterize / behavioural-red / refactor-for-testability —",
    "is the story-author's analysis (ADR-0098 §5, proposed); this report is the mechanical hand-off.",
  );

  return {
    ok: true,
    // ok stays true even with uncovered caps — the plan is an honest report, not a gate. Dangling
    // covers are a surfaced warning, not a failure (the spec still classifies).
    body: lines.join("\n"),
    next: [`storytree gate list ${id} --pg`, `storytree tree ${id} --pg`],
  };
}
