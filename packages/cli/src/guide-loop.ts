/**
 * The explorer-onboarding GUIDE REPAIR LOOP — the sequencing core of ADR-0207 D6's conversational
 * guide, composing the three single-shot D6 primitives into the actual repair CONVERSATION.
 *
 * D6 landed three pure primitives, each single-shot:
 *   • {@link ./doctor.ts | runDoctor}(obs) -> a {@link DoctorReport} (probe each setup invariant),
 *   • {@link ./repair-planner.ts | planRepairs}(report) -> a {@link RepairPlan} (what to fix, in order),
 *   • {@link ./escalation-blob.ts | buildEscalationBlob}(report) -> an {@link EscalationBlob} (what only
 *     the owner can unblock).
 * What none of them does is DRIVE the loop the ADR describes: *run doctor -> explain a failure -> propose
 * the fix -> dev confirms -> re-run the idempotent installer step -> re-doctor*, escalating to the owner
 * only when the loop runs out of self-repairs. This module is that driver: a PURE state machine
 * ({@link startGuide} / {@link stepGuide}) that composes the three primitives into an ordered sequence of
 * turns. Like its three predecessors it carries NO filesystem, process, or model — the caller runs the
 * effects (doctor, the installer step, the dev's own login) and feeds their outcomes back as
 * {@link GuideEvent}s; the reducer only DECIDES the next turn. The desktop conversational surface (a
 * follow-on, operator-attested per ADR-0070) renders {@link GuideDirective}s and reports events; it never
 * re-derives the loop policy. So the machine BEHAVIOUR of the repair conversation is proven here (Stage-1),
 * leaving only the conversational FEEL for the owner (Stage-2).
 *
 * The two load-bearing ADR-0207 invariants ride through unchanged, now enforced at the loop level too:
 *   • D6 REPAIR-VOCABULARY: a confirmed installer repair emits a {@link RunInstallerStep} directive naming
 *     the exact `infra/install.ps1` `# @step:<name>` (carried from the plan, from the probe's fixStep) —
 *     the loop never invents a repair; it re-runs an idempotent installer step.
 *   • D3 NEVER-HANDLE-CREDENTIALS: the `claude-login` failure is an INSTRUCTION, never an installer step.
 *     The loop proposes it, and on confirm emits an {@link InstructInstruction} directive (the dev signs in
 *     out of band) — it NEVER emits a RunInstallerStep for login, so storytree still never executes or
 *     captures the credential. If login is still absent after the dev's own attempt, THAT is when it
 *     escalates (a lapsed subscription is the owner's to hear about).
 *
 * Termination is guaranteed: every proposed probe (confirmed-and-enacted, or declined) is recorded in
 * `attempted`, and a probe is never proposed twice. So an installer step that does NOT clear its probe is
 * tried once, then the loop moves on — to the owner (escalate) if the residue is owner-side, or to a
 * `stuck` terminal otherwise. The loop's success condition is stricter than doctor's own `ok`: a report
 * with no FAILs but an owner-side WARN (repo access refused) is NOT healthy — it escalates — so a dev
 * whose GitHub Read was revoked is never told "you're all set".
 */

import type { DoctorReport } from "./doctor.js";
import { planRepairs, type RepairAction, type RepairPlan } from "./repair-planner.js";
import { buildEscalationBlob, type EscalationBlob } from "./escalation-blob.js";

// ---------------------------------------------------------------------------
// Events — outcomes the caller feeds back after performing an effect.
// ---------------------------------------------------------------------------

/**
 * A caller-supplied outcome that advances the loop. The caller performs the effect the current
 * {@link GuideDirective} asked for (run doctor, run an installer step, let the dev sign in) and reports
 * the result here; the reducer never performs an effect itself.
 */
export type GuideEvent =
  /** A doctor run completed; here is its report. Answers a {@link RunDoctor} directive. */
  | { readonly type: "doctored"; readonly report: DoctorReport }
  /** The dev confirmed the currently-proposed repair. Answers a {@link Propose} directive. */
  | { readonly type: "confirm" }
  /** The dev declined / cannot do the currently-proposed repair. Answers a {@link Propose} directive. */
  | { readonly type: "decline" }
  /** The effect finished (installer step re-run, or the dev completed their own sign-in) — re-doctor next. */
  | { readonly type: "acted" };

// ---------------------------------------------------------------------------
// Directives — what the caller should do next (and narrate). One per state.
// ---------------------------------------------------------------------------

/** Run `storytree doctor` and feed back a `doctored` event. */
export interface RunDoctor {
  readonly kind: "run-doctor";
}
/** Setup is healthy (no FAILs, no owner-side block) — narrate success. Terminal. */
export interface SayHealthy {
  readonly kind: "say-healthy";
  readonly report: DoctorReport;
}
/** Narrate this repair proposal and await the dev's `confirm` / `decline`. */
export interface Propose {
  readonly kind: "propose";
  readonly action: RepairAction;
}
/** The dev confirmed an idempotent installer repair — re-run this `install.ps1` @step, then `acted` (D6). */
export interface RunInstallerStep {
  readonly kind: "run-installer-step";
  readonly step: string;
  readonly action: RepairAction;
}
/** A dev-only action (the D3 Claude sign-in) — show the instruction; the dev acts, then `acted`/`decline`. */
export interface InstructInstruction {
  readonly kind: "instruct-dev";
  readonly action: RepairAction;
}
/** An owner-side block remains — show the secrets-redacted blob for the dev to paste to the owner. Terminal. */
export interface Escalate {
  readonly kind: "escalate";
  readonly blob: EscalationBlob;
}
/** FAILs remain that are neither self-repairable nor owner-escalatable — a dead end (defensive). Terminal. */
export interface Stuck {
  readonly kind: "stuck";
  readonly report: DoctorReport;
}

export type GuideDirective =
  | RunDoctor
  | SayHealthy
  | Propose
  | RunInstallerStep
  | InstructInstruction
  | Escalate
  | Stuck;

// ---------------------------------------------------------------------------
// State — where the conversation is. `attempted` guarantees termination.
// ---------------------------------------------------------------------------

export type GuidePhase =
  | "need-doctor" // waiting for a doctor run
  | "proposing" // a repair is on the table; awaiting confirm/decline
  | "acting" // an installer step is being re-run; awaiting `acted`
  | "awaiting-dev" // a dev instruction is in flight (login); awaiting `acted`/`decline`
  | "healthy" // terminal: setup good
  | "escalated" // terminal: owner-side block
  | "stuck"; // terminal: unrepairable, non-owner residue

/** The reducer state. Immutable; every transition returns a fresh state. */
export interface GuideState {
  readonly phase: GuidePhase;
  /** Probe names already proposed (enacted or declined) — never re-proposed, so the loop terminates. */
  readonly attempted: readonly string[];
  /** The most recent doctor report (once one exists). */
  readonly report?: DoctorReport;
  /** The repair plan derived from `report` (in the phases that carry one). */
  readonly plan?: RepairPlan;
  /** The action currently on the table (proposing/acting/awaiting-dev). */
  readonly action?: RepairAction;
  /** The escalation blob (escalated phase only). */
  readonly blob?: EscalationBlob;
}

/** One turn of the loop: the state to hold, and what the caller should do/narrate next. */
export interface GuideTurn {
  readonly state: GuideState;
  readonly directive: GuideDirective;
}

// ---------------------------------------------------------------------------
// Directive derivation — one directive per state (keeps transitions total).
// ---------------------------------------------------------------------------

/** PURE: the directive a state implies. Total, so unexpected events can no-op to the current turn. */
export function directiveFor(state: GuideState): GuideDirective {
  switch (state.phase) {
    case "need-doctor":
      return { kind: "run-doctor" };
    case "proposing":
      return { kind: "propose", action: state.action! };
    case "acting":
      return { kind: "run-installer-step", step: installerStep(state.action!), action: state.action! };
    case "awaiting-dev":
      return { kind: "instruct-dev", action: state.action! };
    case "healthy":
      return { kind: "say-healthy", report: state.report! };
    case "escalated":
      return { kind: "escalate", blob: state.blob! };
    case "stuck":
      return { kind: "stuck", report: state.report! };
  }
}

/** The `install.ps1` @step an installer-step action names (D6 repair vocabulary). */
function installerStep(action: RepairAction): string {
  return action.kind === "installer-step" ? action.step : "";
}

const turn = (state: GuideState): GuideTurn => ({ state, directive: directiveFor(state) });

// ---------------------------------------------------------------------------
// The loop.
// ---------------------------------------------------------------------------

/** Start a guide session: the caller runs doctor and feeds back the report. */
export function startGuide(): GuideTurn {
  return turn({ phase: "need-doctor", attempted: [] });
}

/**
 * PURE: advance from a fresh doctor report. Success is stricter than `report.ok`: a report with no FAILs
 * but an owner-side block (repo access refused, a WARN) is NOT healthy — it escalates. Otherwise it
 * proposes the first not-yet-attempted repair; when the plan is exhausted it escalates if the residue is
 * owner-side, else it is stuck.
 */
function advance(report: DoctorReport, attempted: readonly string[]): GuideTurn {
  const escalationNeeded = buildEscalationBlob(report).needed;
  if (report.ok && !escalationNeeded) {
    return turn({ phase: "healthy", attempted, report });
  }

  const plan = planRepairs(report);
  const action = plan.actions.find((a) => !attempted.includes(a.probe));
  if (action !== undefined) {
    return turn({ phase: "proposing", attempted, report, plan, action });
  }

  // Nothing left to try. Owner-side residue -> escalate; anything else is a defensive dead end.
  if (escalationNeeded) {
    const blob = buildEscalationBlob(report, { plan });
    return turn({ phase: "escalated", attempted, report, plan, blob });
  }
  return turn({ phase: "stuck", attempted, report, plan });
}

/** PURE: step the loop. Unhandled (state, event) pairs no-op to the current turn (terminal states, etc.). */
export function stepGuide(state: GuideState, event: GuideEvent): GuideTurn {
  switch (state.phase) {
    case "need-doctor":
      if (event.type === "doctored") return advance(event.report, state.attempted);
      return turn(state);

    case "proposing": {
      const action = state.action!;
      if (event.type === "confirm") {
        // D3: a login instruction is NEVER an installer step — the dev signs in themselves.
        const phase = action.kind === "installer-step" ? "acting" : "awaiting-dev";
        return turn({ ...state, phase });
      }
      if (event.type === "decline") {
        // Skip this probe permanently and re-decide over the same report.
        return advance(state.report!, [...state.attempted, action.probe]);
      }
      return turn(state);
    }

    case "acting":
    case "awaiting-dev": {
      const action = state.action!;
      if (event.type === "acted") {
        // The effect ran (installer step re-run, or the dev's own sign-in) — record it and re-doctor.
        return turn({ phase: "need-doctor", attempted: [...state.attempted, action.probe] });
      }
      if (event.type === "decline") {
        // The dev could not complete their own action — record it and re-decide (likely -> escalate).
        return advance(state.report!, [...state.attempted, action.probe]);
      }
      return turn(state);
    }

    default: // healthy / escalated / stuck are terminal.
      return turn(state);
  }
}

// ---------------------------------------------------------------------------
// Rendering — a stable one-line narration per directive (mirrors the other D6 modules' format*).
// ---------------------------------------------------------------------------

/** PURE: a stable, greppable one-line rendering of what the guide would say/do for a directive. */
export function formatGuideDirective(directive: GuideDirective): string {
  switch (directive.kind) {
    case "run-doctor":
      return "Running the setup check…";
    case "say-healthy":
      return "Your setup is healthy — you're all set to explore.";
    case "propose":
      return directive.action.kind === "installer-step"
        ? `I can fix "${directive.action.probe}" for you: ${directive.action.instruction} (OK to run it?)`
        : `You'll need to handle "${directive.action.probe}" yourself: ${directive.action.instruction}`;
    case "run-installer-step":
      return `Re-running install.ps1 @step:${directive.step} to repair "${directive.action.probe}"…`;
    case "instruct-dev":
      return `Over to you: ${directive.action.instruction} — tell me when you're done and I'll re-check.`;
    case "escalate":
      return "I can't fix this from here — paste the block below to the owner.";
    case "stuck":
      return "Setup is still incomplete and I've run out of repairs I can make — please review the doctor report.";
  }
}
