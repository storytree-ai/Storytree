import type { Tier } from "@storytree/model-uat";

import type { JudgeOutcome } from "./judge-result.js";

/**
 * The `model-escalation-ladder` capability (ADR-0209 D4): structured outcomes
 * route by the locked ladder without laundering FAIL into human green.
 */

export type EscalationAction =
  | "sign"
  | "build"
  | "escalate-frontier"
  | "escalate-human"
  | "hold";

export interface EscalationInput {
  readonly outcome: JudgeOutcome;
  /** The criterion's required minimum tier. */
  readonly requiredTier: Tier;
  /** Whether an available frontier judge exists for advanced INCONCLUSIVE escalation. */
  readonly frontierAvailable: boolean;
  /**
   * Explicit override attempt (tests FAIL-laundering). When true with FAIL, the
   * classifier hard-refuses rather than yielding escalate-human.
   */
  readonly attemptHumanOverride?: boolean;
}

export type EscalationResult =
  | { status: "ok"; action: EscalationAction }
  | { status: "refused"; reason: string };

/**
 * PURE: classify the next honest action for a structured model-judge outcome.
 */
export function classifyEscalation(input: EscalationInput): EscalationResult {
  if (input.attemptHumanOverride === true && input.outcome === "FAIL") {
    return {
      status: "refused",
      reason: "FAIL cannot be laundered into human green (ADR-0209 D4)",
    };
  }

  switch (input.outcome) {
    case "PASS":
      return { status: "ok", action: "sign" };
    case "FAIL":
      // Locked: FAIL → build. Never escalate-human.
      return { status: "ok", action: "build" };
    case "INCONCLUSIVE":
      if (input.requiredTier === "advanced") {
        if (input.frontierAvailable) {
          return { status: "ok", action: "escalate-frontier" };
        }
        return { status: "ok", action: "hold" };
      }
      // frontier INCONCLUSIVE → exceptional human
      return { status: "ok", action: "escalate-human" };
  }
}
