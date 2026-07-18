/**
 * `storytree guide` — the terminal surface of ADR-0207 D6's repair loop.
 *
 * D6's guide is "run doctor -> explain plainly -> propose the idempotent fix -> dev confirms ->
 * re-run the installer step -> re-doctor -> escalate what it can't fix". Every piece of that now
 * exists as a tested unit:
 *   • {@link ./doctor.ts | runDoctor} probes the invariants,
 *   • {@link ./repair-planner.ts | planRepairs} turns failures into installer-step actions,
 *   • {@link ./escalation-blob.ts | buildEscalationBlob} builds the owner escalation,
 *   • {@link ./guide-loop.ts | startGuide}/{@link ./guide-loop.ts | stepGuide} sequence the conversation,
 *   • `infra/install.ps1 -Step <name>` enacts one idempotent repair.
 * This module is the thin shell that WIRES them into a command a dev can actually run. It is the
 * same shape as doctor's shell — a pure driver ({@link driveGuide}) over INJECTED effects, plus a
 * thin {@link guideCommand} that supplies the real ones — so the whole conversation is fixture-testable
 * with no filesystem, no process, and no installer.
 *
 * Two modes, and the split IS the D6 "dev confirms" boundary:
 *   • `storytree guide` (default) — PREVIEW. Runs doctor, narrates the conversation up to the first
 *     proposed repair, and stops without enacting anything. The dev sees exactly what would happen.
 *   • `storytree guide --fix` — ENACT. The dev has seen the preview and opted in, so each installer
 *     repair is confirmed and re-run, re-doctoring after each, until the setup is healthy, escalated,
 *     or stuck. `--fix` is the confirmation; there is no per-step prompt to mis-answer.
 *
 * D3 (never handle credentials) survives the shell intact: the Claude login is an INSTRUCTION action,
 * so even under `--fix` the guide prints what the dev must do and STOPS (`needs-dev`). storytree never
 * runs `claude` login and never touches the credential — the dev signs in with their own subscription
 * and re-runs the guide.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { Envelope } from "./envelope.js";
import { gatherObservations, runDoctor, formatDoctorReport, type DoctorObservations } from "./doctor.js";
import { formatRepairPlan, planRepairs } from "./repair-planner.js";
import { buildEscalationBlob, formatEscalationBlob } from "./escalation-blob.js";
import { formatGuideDirective, startGuide, stepGuide, type GuideTurn } from "./guide-loop.js";

/** How the guided conversation ended. */
export type GuideOutcome =
  /** Every invariant met — the dev is ready to explore. */
  | "healthy"
  /** Repairs are needed and were only PREVIEWED (default mode); `--fix` would enact them. */
  | "preview"
  /** Stopped on an action only the dev can take (the D3 Claude sign-in). Re-run after doing it. */
  | "needs-dev"
  /** An owner-side block (access revoked / subscription lapsed) — a blob to paste to the owner. */
  | "escalated"
  /** Failures remain that are neither self-repairable nor owner-escalatable. */
  | "stuck";

/** The result of one guided run: the narration, how it ended, and what was actually enacted. */
export interface GuideRun {
  readonly lines: string[];
  readonly outcome: GuideOutcome;
  /** `install.ps1` @steps actually re-run (empty in preview mode). */
  readonly stepsRun: string[];
}

/** The effects the driver needs. Injected so the whole conversation is testable without a machine. */
export interface GuideEffects {
  /** Gather the raw doctor observations for a checkout. */
  readonly observe: (checkoutDir: string) => DoctorObservations | Promise<DoctorObservations>;
  /** Enact one idempotent `install.ps1` @step. Only called in `--fix` mode. */
  readonly runStep: (step: string, checkoutDir: string) => void;
  readonly checkoutDir: string;
  /** False = preview only (never enact); true = the dev opted in with `--fix`. */
  readonly fix: boolean;
}

/**
 * A hard ceiling on conversation turns. The controller already terminates (its `attempted` guard
 * never re-proposes a probe), so this is a belt-and-braces backstop against a future controller
 * change looping — never the primary termination mechanism.
 */
const MAX_TURNS = 64;

/**
 * PURE (over injected effects): drive the D6 conversation to a terminal outcome, collecting the
 * narration. Every effect — probing, enacting a step — goes through {@link GuideEffects}, so this is
 * fully fixture-testable; the loop policy itself lives in guide-loop and is not re-derived here.
 */
export async function driveGuide(fx: GuideEffects): Promise<GuideRun> {
  const lines: string[] = [];
  const stepsRun: string[] = [];
  let turn: GuideTurn = startGuide();

  for (let i = 0; i < MAX_TURNS; i++) {
    const { state, directive } = turn;

    switch (directive.kind) {
      case "run-doctor": {
        lines.push(formatGuideDirective(directive));
        const report = runDoctor(await fx.observe(fx.checkoutDir));
        turn = stepGuide(state, { type: "doctored", report });
        continue;
      }

      case "say-healthy": {
        lines.push(formatGuideDirective(directive), "", formatDoctorReport(directive.report));
        return { lines, outcome: "healthy", stepsRun };
      }

      case "propose": {
        lines.push(formatGuideDirective(directive));
        if (!fx.fix) {
          // PREVIEW: show the full remaining plan and stop — nothing is enacted without `--fix`.
          const plan = planRepairs(state.report!);
          lines.push("", formatRepairPlan(plan), "", "Re-run with `storytree guide --fix` and I'll make the repairs I can.");
          return { lines, outcome: "preview", stepsRun };
        }
        turn = stepGuide(state, { type: "confirm" });
        continue;
      }

      case "run-installer-step": {
        lines.push(formatGuideDirective(directive));
        fx.runStep(directive.step, fx.checkoutDir);
        stepsRun.push(directive.step);
        turn = stepGuide(state, { type: "acted" });
        continue;
      }

      case "instruct-dev": {
        // D3: storytree instructs and STOPS — it never performs the dev's sign-in.
        lines.push(
          formatGuideDirective(directive),
          "",
          "storytree never handles your Claude credential — you sign in with your own subscription.",
          "Once you're done, re-run `storytree guide --fix` and I'll pick up where we left off.",
        );
        return { lines, outcome: "needs-dev", stepsRun };
      }

      case "escalate": {
        lines.push(formatGuideDirective(directive), "", formatEscalationBlob(directive.blob));
        return { lines, outcome: "escalated", stepsRun };
      }

      case "stuck": {
        lines.push(formatGuideDirective(directive), "", formatDoctorReport(directive.report));
        return { lines, outcome: "stuck", stepsRun };
      }
    }
  }

  // Unreachable while the controller terminates; kept so a future regression fails loudly here
  // rather than hanging a dev's terminal.
  lines.push(`The guide gave up after ${MAX_TURNS} turns without settling — please report this.`);
  return { lines, outcome: "stuck", stepsRun };
}

// ---------------------------------------------------------------------------
// The shell: the real effects.
// ---------------------------------------------------------------------------

/** Repo root: packages/cli/src/guide.ts → four dirs up (the doctor.ts repoRoot pattern). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/**
 * Enact one idempotent installer step for real: `install.ps1 -Step <name>`. Windows-first (D1) —
 * on another platform this fails loudly rather than pretending a repair happened, because a silent
 * no-op would make the guide re-doctor, see the same failure, and report `stuck` for the wrong reason.
 */
export function runInstallerStep(step: string, checkoutDir: string): void {
  if (process.platform !== "win32") {
    throw new Error(
      `cannot run install.ps1 @step:${step} on ${process.platform} — the D1 installer is Windows-first ` +
        "(the sh variant is a follow-on). Repair this step manually, then re-run `storytree guide`.",
    );
  }
  const script = path.join(checkoutDir, "infra", "install.ps1");
  execFileSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", script, "-Step", step, "-CheckoutDir", checkoutDir], {
    stdio: "inherit",
    timeout: 15 * 60_000,
  });
}

export function guideHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree guide — the guided explorer setup repair loop (ADR-0207 D6).",
      "",
      "  storytree guide",
      "      run the setup check and show what needs repairing, plainly — enacts NOTHING.",
      "",
      "  storytree guide --fix",
      "      the same conversation, but make the repairs: each failing invariant is fixed by",
      "      re-running its idempotent `infra/install.ps1` step, re-checking after each, until",
      "      the setup is healthy, blocked on you, or needs the owner.",
      "",
      "Your Claude sign-in is never automated: storytree detects a logged-in CLI and tells you what",
      "to do, but never runs the login or handles the credential (ADR-0207 D3).",
    ].join("\n"),
    next: ["storytree guide", "storytree guide --fix", "storytree doctor"],
  };
}

/**
 * The `storytree guide` dispatch. `argv` is the positionals AFTER the "guide" area word. Effects are
 * injectable for tests; the defaults are the real ones.
 */
export async function guideCommand(
  argv: readonly string[],
  deps: Partial<Pick<GuideEffects, "observe" | "runStep" | "checkoutDir" | "fix">> = {},
): Promise<Envelope> {
  const [sub] = argv;
  if (sub === "help") return guideHelp();

  const checkoutDir = deps.checkoutDir ?? repoRoot();
  const run = await driveGuide({
    observe: deps.observe ?? gatherObservations,
    runStep: deps.runStep ?? runInstallerStep,
    checkoutDir,
    fix: deps.fix ?? false,
  });

  return {
    ok: run.outcome === "healthy",
    body: run.lines.join("\n"),
    next: nextFor(run.outcome),
  };
}

/** Where the dev goes from each outcome. */
function nextFor(outcome: GuideOutcome): string[] {
  switch (outcome) {
    case "healthy":
      return ["storytree library", "storytree tree"];
    case "preview":
      return ["storytree guide --fix"];
    case "needs-dev":
      return ["claude", "storytree guide --fix"];
    case "escalated":
      return ["storytree doctor"];
    case "stuck":
      return ["storytree doctor", "infra/install.md"];
  }
}
