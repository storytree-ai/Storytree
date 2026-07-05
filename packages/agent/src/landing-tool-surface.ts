/**
 * Landing tool surface builder (landing-tool-surface capability, ADR-0152).
 *
 * Builds the desktop orchestrator's scoped LANDING MCP tools — `run_gate`, `open_landing_pr`, and
 * `poll_pr_checks` — the merge-ceremony surface the terminal session-orchestrator already has: run
 * the gate, then commit → push → open a NON-DRAFT PR (CI re-proves green on the merge and
 * auto-merges, ADR-0022), then WATCH CI to green. This lifts ADR-0137 decision 3's "the human's
 * button + merge are the direct gates" for the desktop orchestrator, completing ADR-0108's
 * whole-loop authority for the desktop-chat path.
 *
 * The third tool, `poll_pr_checks` (ADR-0163 Gap B2), closes the retro gap where the landing surface
 * could OPEN a PR but had no eyes on it — so after opening, the orchestrator believed it was done,
 * violating the session-orchestrator discipline "a PR is not done until CI is green — WATCH it."
 * It also unblocks ADR-0164 Phase 2 (self-restart to apply a merged fix), which must know when the
 * PR actually MERGED. It only OBSERVES CI state; it signs nothing (the spine still signs, CI is
 * still the independent gate — ADR-0091 / ADR-0020 / ADR-0022).
 *
 * Mirrors {@link import("./spawn-tool-surface.js").buildSpawnTools} exactly:
 *   - OPTIONAL: absent from HeadlessOrchestratorArgs → this module is never consulted → the session
 *     is byte-identical to the propose+spawn surface (the ADR-0108 §7 scale-down mirror). Present →
 *     the landing tools mount on the landing MCP server; `tools: []` stays on the chat session.
 *   - FAIL CLOSED: every handler is wrapped so a thrown error (a gate subprocess that won't spawn, a
 *     `gh` that errors) folds to conversation TEXT the orchestrator can read — never a throw into the
 *     SDK loop, never a half-signal.
 *   - THE SPINE STILL SIGNS (ADR-0091 / ADR-0020): `run_gate` OBSERVES a pass/fail from a real
 *     subprocess exit code (reported by the injected handler), `poll_pr_checks` OBSERVES CI state —
 *     neither authors a "healthy"; and no landing tool carries a verdict-shaped payload. The chat
 *     runs the gate, opens the PR, and watches CI; the spine signs the verdict out-of-band and CI
 *     re-proves before the trunk.
 *   - SCOPED, NOT RAW SHELL (ADR-0137 d.1): each tool is a single named action (run the gate; open
 *     the landing PR; poll its checks), never a general `Bash`/`Write` surface.
 *
 * The REAL deps (shelling `pnpm gate` / `git` / `gh` behind an injected exec seam) are composed in
 * @storytree/drive's landing-deps follow-on and threaded through `orchestrate()`; this module owns
 * only the tool SHAPE + the fail-closed wrap.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Result shapes (returned by the injected handlers)
// ---------------------------------------------------------------------------

/** The outcome of running the gate — a pass/fail flag plus a human-readable summary (the output tail). */
export interface LandingGateResult {
  /** True when the gate passed (observed from the real subprocess exit code). */
  passed: boolean;
  /** Human-readable summary the orchestrator surfaces (typically the tail of the gate output). */
  summary: string;
}

/** The outcome of the merge ceremony — commit → push → open a non-draft PR. */
export interface LandingPrResult {
  /** True when the PR was opened (or the branch already had an open PR). */
  ok: boolean;
  /** Human-readable summary the orchestrator surfaces. */
  summary: string;
  /** The opened PR's URL, when available. */
  prUrl?: string;
}

/**
 * The observed CI state of a landing PR (a single poll, never a blocking watch):
 *   - `pending`  — checks are still running; poll again shortly.
 *   - `passed`   — every required check is green but the PR is not yet merged (awaiting auto-merge).
 *   - `failed`   — at least one check failed, or the PR was closed unmerged; recover, then re-land.
 *   - `merged`   — CI auto-merged the PR (ADR-0022): the unit is LANDED.
 *   - `unknown`  — the CI state could not be determined (e.g. `gh` errored, or a PR with no checks).
 */
export type LandingPollStatus = "pending" | "passed" | "failed" | "merged" | "unknown";

/** The outcome of polling a landing PR's CI checks — an OBSERVED status the orchestrator reads. */
export interface LandingPollResult {
  /** The observed CI state (see {@link LandingPollStatus}). */
  status: LandingPollStatus;
  /**
   * Human-readable summary the orchestrator surfaces — typically the per-check names + conclusions,
   * or the merge state. On `failed`, it carries which check(s) failed so the orchestrator can recover.
   */
  summary: string;
}

// ---------------------------------------------------------------------------
// LandingSurfaceDeps
// ---------------------------------------------------------------------------

/**
 * The deps the caller injects to mount the landing tool surface on a headless-orchestrator session.
 * Both handlers are required: the surface provides no ungated or default path. In production the
 * handlers shell `pnpm gate` / `git` / `gh` (the @storytree/drive composition); in tests they are
 * recording stubs (no real subprocess).
 */
export interface LandingSurfaceDeps {
  /** Run the gate (`pnpm gate`) and report the observed pass/fail + a summary. */
  runGate: () => Promise<LandingGateResult>;
  /**
   * Run the merge ceremony: commit the working tree with `commitMessage`, push the branch, and open a
   * NON-DRAFT PR titled `prTitle` with body `prBody`. Never `gh pr merge`s — CI auto-merges (ADR-0022).
   */
  openLandingPr: (args: {
    commitMessage: string;
    prTitle: string;
    prBody: string;
  }) => Promise<LandingPrResult>;
  /**
   * Poll a landing PR's CI checks ONCE and report the OBSERVED state (pending / passed / failed /
   * merged / unknown). Read-only: it observes CI, it signs nothing (the spine signs, CI is the
   * independent gate — ADR-0091 / ADR-0020 / ADR-0022). A SINGLE poll, never a blocking watch — the
   * orchestrator loops by calling it again (the watch-to-green loop; ADR-0163 Gap B2). In production
   * it shells `gh pr view <pr> --json state,statusCheckRollup` (the @storytree/drive composition);
   * in tests it is a recording stub.
   */
  pollPrChecks: (args: { pr: string }) => Promise<LandingPollResult>;
}

// ---------------------------------------------------------------------------
// MCP server name
// ---------------------------------------------------------------------------

/** The in-process MCP server name the landing tools live under (`mcp__landing__<tool>`). */
export const LANDING_SERVER = "landing";

// ---------------------------------------------------------------------------
// Surface builder
// ---------------------------------------------------------------------------

/**
 * Build the two landing MCP tool definitions, each fail-closed.
 *
 * Called by headless-orchestrator when landing deps are present (the §7 scale-down mirror: absent
 * deps → this function is never called → no dead stubs advertised to the model). The returned
 * definitions are passed directly to createSdkMcpServer.
 */
export function buildLandingTools(deps: LandingSurfaceDeps) {
  const runGateTool = tool(
    "run_gate",
    "Run the project gate (`pnpm gate`: typecheck + tests + build + manifest) and report whether it " +
      "passed. Use this to CONFIRM the working tree is green before landing. Read-only side effects " +
      "only (it runs tests, it does not commit or push). The result reports the OBSERVED pass/fail " +
      "from the real gate — a red gate is surfaced as a failure, never rewritten to a pass.",
    {},
    async () => {
      try {
        const result = await deps.runGate();
        const verdict = result.passed ? "gate PASSED" : "gate FAILED";
        return {
          content: [{ type: "text" as const, text: `${verdict}\n\n${result.summary}` }],
        };
      } catch (e) {
        // Fail closed: a gate that could not even run is a readable failure, never a thrown crash.
        return {
          content: [
            {
              type: "text" as const,
              text: `Could not run the gate: ${(e as Error).message}`,
            },
          ],
        };
      }
    },
  );

  const openLandingPrTool = tool(
    "open_landing_pr",
    "Run the merge ceremony for a unit you have driven to green: commit the working tree, push the " +
      "branch, and open a NON-DRAFT pull request. CI re-proves green on the merge with main and " +
      "auto-merges (ADR-0022) — do NOT merge it yourself. Confirm the gate is green (run_gate) first. " +
      "This opens a change for the independent CI gate; it does NOT sign a verdict (the spine signs).",
    {
      commitMessage: z
        .string()
        .describe("The commit message for the working-tree changes (conventional-commit style)."),
      prTitle: z.string().describe("The pull request title."),
      prBody: z.string().describe("The pull request body (what landed and why)."),
    },
    async ({ commitMessage, prTitle, prBody }) => {
      try {
        const result = await deps.openLandingPr({ commitMessage, prTitle, prBody });
        const url = result.prUrl !== undefined ? `\n\n${result.prUrl}` : "";
        return {
          content: [{ type: "text" as const, text: `${result.summary}${url}` }],
        };
      } catch (e) {
        // Fail closed: a ceremony step that threw is a readable failure the orchestrator can act on.
        return {
          content: [
            {
              type: "text" as const,
              text: `Could not open the landing PR: ${(e as Error).message}`,
            },
          ],
        };
      }
    },
  );

  const pollPrChecksTool = tool(
    "poll_pr_checks",
    "Poll a landing PR's CI checks ONCE and report the OBSERVED state: `pending` (checks still " +
      "running — call again shortly), `passed` (all checks green, awaiting auto-merge), `failed` (a " +
      "check failed or the PR was closed unmerged — recover, then re-land), `merged` (CI auto-merged " +
      "it, ADR-0022 — the unit is LANDED), or `unknown` (state could not be determined). Read-only: " +
      "it OBSERVES CI, it signs nothing (the spine signs; CI is the independent gate). A PR is not " +
      "done until CI is green — WATCH it: after open_landing_pr, poll until `merged`, or recover on " +
      "`failed`. This is a SINGLE poll, not a blocking watch; call it again to keep watching.",
    {
      pr: z
        .string()
        .describe("The PR to poll — its number or URL (whichever `open_landing_pr` returned)."),
    },
    async ({ pr }) => {
      try {
        const result = await deps.pollPrChecks({ pr });
        return {
          content: [
            {
              type: "text" as const,
              text: `PR checks: ${result.status.toUpperCase()}\n\n${result.summary}`,
            },
          ],
        };
      } catch (e) {
        // Fail closed: a poll that could not even run is a readable failure, never a thrown crash.
        return {
          content: [
            {
              type: "text" as const,
              text: `Could not poll the PR checks: ${(e as Error).message}`,
            },
          ],
        };
      }
    },
  );

  return [runGateTool, openLandingPrTool, pollPrChecksTool];
}
