/**
 * `storytree adopt` command (ADR-0097 / ADR-0106) — the brownfield ADOPTION surface.
 *
 * Bringing a `mapped` (brownfield) story INTO the fold is a PROVING PROCESS entered by a deliberate
 * human adoption decision (ADR-0097: brown → proposed → green, earned not flipped) — not a flip to
 * green. This area is the agent-facing driver for it, with two actions:
 *
 *   storytree adopt <story-id> --pg     RUN the adoption — observe-and-sign the story's `observe`
 *                                       reliability gates (ADR-0085) and its machine UAT legs
 *                                       (ADR-0106) to `adopted` verdicts, then flip its status
 *                                       `mapped → proposed` ("adoption underway", ADR-0097). The SAME
 *                                       engine the studio's Adopt button drives.
 *   storytree adopt plan <story-id>     PLAN — the read-only adoption-plan classification (ADR-0097
 *                                       Layer 2): which capabilities a declared `(covers:)` gate covers
 *                                       vs which still owe real `build-tests` work. Offline, no spend.
 *
 * The RUN engine is drive's pure-by-injection {@link runAdopt}: every honesty wall (only a brownfield
 * story is adoptable, an `observe` gate to sign, a resolved human approver, the live `--pg` store, a
 * clean committed HEAD) lives there and is tested in `@storytree/drive` (`adopt.test.ts`). The PLAN is
 * {@link adoptPlanCommand}. This module is the thin area DISPATCHER + help the CLI wires the live seams
 * into — pure-by-injection so the ROUTING is offline-testable (`adopt.test.ts`), mirroring `gate` / `uat`.
 *
 * Why `adopt` is its own area and is NOT a home for `gate` (ADR-0098): an `observe` gate is EARNED by
 * adoption (observe-and-sign), but a `build-tests` gate is earned by a real red→green BUILD — NOT
 * adoption — so `gate` spans both the adoption and the build surface and stays its own area. `adopt`
 * nests only the two genuinely-adoption actions (run + plan).
 */

import { runAdopt, type AdoptDeps, type AdoptOpts } from "@storytree/drive";
import type { PocketReading } from "@storytree/orchestrator";

import { adoptPlanCommand, type AdoptPlanStory } from "./adopt-plan.js";
import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

/**
 * Every seam the `adopt` area touches — the RUN seams (drive's {@link AdoptDeps}: the verdict store,
 * the story loader, git state, the observe runner, the approver resolver, the status-flip writer, the
 * clock) PLUS the PLAN's own story loader (it projects DIFFERENT fields off the same spec — caps +
 * gates, not gates + UAT legs). One deps object per area, wired with the live seams in `commands.ts`
 * and with fakes in tests, exactly like `GateDeps` / `UatDeps`.
 */
export interface AdoptDispatchDeps extends AdoptDeps {
  /** The plan classifier's story loader (status + declared caps + gates); null for a missing/odd spec. */
  loadPlanStory: (storyId: string) => AdoptPlanStory | null;
}

export interface AdoptInvocation {
  /** `run` adopts the story (writes verdicts + flips status); `plan` is the read-only classification. */
  mode: "run" | "plan";
  /** The story id for both modes. */
  target: string | undefined;
  /**
   * Plan mode only: the agent's per-pocket readings (ADR-0098 d.1, parsed from `--readings <file>`). When
   * present the plan renders the ENRICHED proposal; absent → the mechanical covers-diff. The file IO lives
   * in the live wiring (`commands.ts`); this carries the already-parsed map so routing stays offline-testable.
   */
  readings?: Readonly<Record<string, PocketReading>>;
}

export function adoptHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree adopt — bring a brownfield (`mapped`) story INTO the fold (ADR-0097): adoption is a",
      "PROVING PROCESS entered by a deliberate human decision (brown → proposed → green), not a flip to green.",
      "",
      "  storytree adopt <story-id> --pg     RUN the adoption — observe-and-sign the story's `observe`",
      "                                      reliability gates + machine UAT legs to `adopted` verdicts",
      "                                      and flip its status mapped → proposed (adoption underway)",
      "  storytree adopt plan <story-id>     PLAN — classify which capabilities a declared `(covers:)`",
      "                                      gate covers vs which still owe real build-tests work (offline)",
      "  storytree adopt gate <story>#gate-<n> --pg   observe-and-sign ONE `observe` reliability gate",
      "                                      (ADR-0118; was `gate run`, kept as a back-compat alias). A",
      "                                      build-tests gate is NOT adoption — earn it with `build gate --real`.",
      "",
      "adopt RUN signs real `adopted` verdicts (events.verdict; signer = the spine principal that witnessed",
      "the green, approvedBy = who decided to adopt). It refuses a non-brownfield status, a story with no",
      "`observe` gate, a blank signer, the offline store, and a DIRTY tree (an adopted verdict pins the clean",
      "commit it observed) — then the flip dirties the tree with one `status:` line for YOU to commit. It",
      "GREENS NOTHING on its own: covered capabilities green via coverage; a `build-tests` pocket holds the",
      "crown at `proposed` until a real red→green earns it (`storytree build gate <story>#gate-<n> --real --pg`,",
      "ADR-0098). The signer chain is fail-closed: --signer/--actor → STORYTREE_SIGNER → git email.",
    ].join("\n"),
    next: ["storytree adopt plan <story-id>", "storytree adopt gate <story>#gate-<n> --pg", "storytree adopt <story-id> --pg"],
  };
}

// ---------------------------------------------------------------------------
// adoptCommand
// ---------------------------------------------------------------------------

/**
 * Dispatch the `adopt` area: `plan` routes to the offline classifier; anything else RUNS the adoption
 * through drive's {@link runAdopt} (the honesty walls + the signing live there). Thin by design —
 * routing only — so it is offline-testable with injected fakes.
 */
export async function adoptCommand(
  inv: AdoptInvocation,
  opts: AdoptOpts,
  deps: AdoptDispatchDeps,
): Promise<Envelope> {
  if (inv.mode === "plan") {
    return adoptPlanCommand(
      inv.target,
      { loadStory: deps.loadPlanStory },
      inv.readings !== undefined ? { readings: inv.readings } : {},
    );
  }
  return runAdopt(inv.target, opts, deps);
}
