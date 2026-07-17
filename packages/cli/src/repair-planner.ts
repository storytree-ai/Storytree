/**
 * The explorer-onboarding REPAIR PLANNER — the machine-provable core of ADR-0207 D6's TOP layer.
 *
 * D6 has two layers. The BOTTOM layer ({@link ./doctor.ts}) probes each setup invariant and emits a
 * structured {@link DoctorReport}. The TOP layer is the guide's conversational repair loop: run
 * doctor -> explain a failure plainly -> propose the fix -> dev confirms -> re-run the corresponding
 * idempotent D1 installer step -> re-doctor. This module is the deterministic HEART of that loop: a
 * PURE function {@link planRepairs} that turns a {@link DoctorReport} into an ORDERED repair plan the
 * guide can narrate and enact. It carries no filesystem, process, or model — the guide (the desktop
 * conversational surface, a follow-on) imports {@link planRepairs} directly, exactly as doctor's shell
 * imports {@link runDoctor}, and never re-derives the policy from scraped text.
 *
 * Two load-bearing ADR-0207 invariants are enforced HERE, not just in doctor:
 *   • D6 REPAIR-VOCABULARY: repair is NOT new machinery — it is an idempotent D1 installer step
 *     re-invoked. So a repairable failure becomes an {@link InstallerStepAction} naming the exact
 *     `infra/install.ps1` `# @step:<name>` marker (carried forward from the probe's `fixStep`); the
 *     guide re-runs THAT step. The step names never drift from the installer (asserted in the test,
 *     against the same install.ps1 the doctor test reads).
 *   • D3 NEVER-HANDLE-CREDENTIALS: the `claude-login` failure is NOT executable by storytree. It
 *     becomes an {@link InstructionAction} carrying NO installer step and `executable: false` — the
 *     guide INSTRUCTS the dev to sign in with their own subscription and storytree never runs or
 *     captures the credential. The detect-and-instruct boundary is a structural property of the plan.
 *
 * Scope (slow-growth, minimum-to-green): the plan targets FAILing probes — the genuinely-unmet
 * invariants the guide must repair before onboarding proceeds. WARNs (offline-undetermined remote,
 * a behind-by-N checkout) are advisory and non-blocking, so they are NOT repair actions; the guide
 * surfaces them from the report directly. A healthy report therefore yields an EMPTY plan. The
 * escalation path (access revoked / subscription lapsed -> a secrets-redacted diagnostic blob for the
 * owner, ADR-0207 D6) is a later increment, not planned here.
 */

import type { DoctorReport, Probe } from "./doctor.js";

/** A repair enacted by re-running an idempotent `infra/install.ps1` step (D6 repair vocabulary). */
export interface InstallerStepAction {
  readonly kind: "installer-step";
  /** The probe this action repairs. */
  readonly probe: string;
  /** The `infra/install.ps1` `# @step:<name>` the guide re-invokes. Always present for this kind. */
  readonly step: string;
  /** The plain-language proposal the guide narrates before the dev confirms. */
  readonly instruction: string;
  /** Always true — an installer step storytree may re-run on the dev's confirmation. */
  readonly executable: true;
}

/**
 * A repair storytree can only INSTRUCT, never enact — the dev must act themselves. Covers the D3
 * `claude-login` case (sign in with your own subscription; storytree never handles the credential).
 */
export interface InstructionAction {
  readonly kind: "instruction";
  readonly probe: string;
  /** What the guide tells the dev to do. */
  readonly instruction: string;
  /** Always false — storytree instructs; it never executes-and-captures (D3). No installer step. */
  readonly executable: false;
}

export type RepairAction = InstallerStepAction | InstructionAction;

/** The ordered repair plan for a doctor report. `empty` iff there is nothing to repair. */
export interface RepairPlan {
  /** Repair actions in the report's probe order — which is dependency order (git -> node -> ...). */
  readonly actions: RepairAction[];
  /** True iff no repair is needed (a healthy report, or one whose only non-PASS probes are WARNs). */
  readonly empty: boolean;
}

/** Build the repair action for one FAILing probe, preserving the D6/D3 boundary. */
function actionFor(probe: Probe): RepairAction {
  const instruction = probe.fixHint ?? `resolve: ${probe.detail}`;
  // A fixStep => an idempotent installer step the guide re-runs (D6). No fixStep => a dev instruction
  // storytree only narrates, never executes (the D3 claude-login boundary, and any future dev action).
  if (probe.fixStep !== undefined) {
    return { kind: "installer-step", probe: probe.name, step: probe.fixStep, instruction, executable: true };
  }
  return { kind: "instruction", probe: probe.name, instruction, executable: false };
}

/**
 * PURE: turn a doctor report into an ordered repair plan. Only FAILing probes become actions (WARNs
 * are advisory, non-blocking); the report's probe order — deliberately dependency order — is
 * preserved so the guide repairs prerequisites first (git before clone, node before provision).
 */
export function planRepairs(report: DoctorReport): RepairPlan {
  const actions = report.probes.filter((p) => p.level === "FAIL").map(actionFor);
  return { actions, empty: actions.length === 0 };
}

/**
 * PURE: render a plan as stable, greppable lines the guide (or a CLI surface) can show. Each action is
 * a numbered step; installer steps name their `@step`, instructions are marked as dev actions.
 */
export function formatRepairPlan(plan: RepairPlan): string {
  if (plan.empty) return "No repairs needed — setup is healthy.";
  const lines = ["Repair plan (ADR-0207 D6):", ""];
  plan.actions.forEach((a, i) => {
    const tag = a.kind === "installer-step" ? `install.ps1 @step:${a.step}` : "you do this (storytree can't)";
    lines.push(`  ${i + 1}. [${a.probe}] ${a.instruction}`);
    lines.push(`       ${tag}`);
  });
  return lines.join("\n");
}
