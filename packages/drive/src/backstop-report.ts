import type { PromotionResult } from "@storytree/orchestrator";

/** Maximum rendered size of each captured package-command stream. */
export const BACKSTOP_STREAM_LIMIT = 4_000;

/**
 * Which package command the backstop observed. The package typecheck is the only one a build runs:
 * the regression-suite kind left with ADR-0580 D2, and package-suite regression now belongs to the
 * landing gate and CI.
 */
export type BackstopKind = "typecheck";

/** The process fact returned by an install-bearing package command. */
export interface BackstopCommandObservation {
  result: "green" | "red";
  originalProcessResult: {
    stdout: string;
    stderr: string;
    exitCode: number | null;
  };
  timeoutMs: number;
}

/** The package command whose observed red refused a REAL-build signature. */
export interface BackstopRefusalObservation {
  kind: BackstopKind;
  result: "red";
  originalProcessResult: BackstopCommandObservation["originalProcessResult"];
  timeoutMs: number;
}

export interface BackstopRefusal {
  observation: BackstopRefusalObservation;
  ok: false;
  reason: string;
}

function truncationMarker(omitted: number): string {
  return `\n... [truncated ${String(omitted)} characters] ...\n`;
}

/**
 * Bound one captured stream without hiding either end.
 *
 * The omitted count names the input characters actually removed, including the room occupied by
 * the marker itself. Its digit count affects the marker width. Two bounded substitutions are
 * sufficient: adding the marker can cross at most one decimal-width boundary, and the second
 * substitution incorporates that extra digit without an unbounded convergence loop. The returned
 * value is exactly {@link BACKSTOP_STREAM_LIMIT} characters when truncated.
 */
export function boundBackstopStream(value: string): string {
  if (value.length === 0) return "(empty)";
  if (value.length <= BACKSTOP_STREAM_LIMIT) return value;

  const baseOmitted = value.length - BACKSTOP_STREAM_LIMIT;
  const onceAdjusted = baseOmitted + truncationMarker(baseOmitted).length;
  const omitted = baseOmitted + truncationMarker(onceAdjusted).length;
  const marker = truncationMarker(omitted);

  const retained = BACKSTOP_STREAM_LIMIT - marker.length;
  const head = Math.floor(retained / 2);
  const tail = retained - head;
  return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}

/** Render the exact captured package-command red without spawning a diagnostic retry. */
export function renderBackstopRefusalObservation(
  observation: BackstopRefusalObservation,
): string {
  const process = observation.originalProcessResult;
  const exit =
    process.exitCode === null
      ? `none (killed or timed out after ${String(observation.timeoutMs)}ms)`
      : String(process.exitCode);
  return (
    `backstop observation (${observation.kind}): exit ${exit}; effective timeout ${String(observation.timeoutMs)}ms\n` +
    `stdout:\n${boundBackstopStream(process.stdout)}\n` +
    `stderr:\n${boundBackstopStream(process.stderr)}`
  );
}

/** Build the structured refusal and the gate outcome from the same observed process fact. */
export function makeBackstopRefusal(
  kind: BackstopKind,
  observed: BackstopCommandObservation & { result: "red" },
): BackstopRefusal {
  const observation: BackstopRefusalObservation = {
    kind,
    result: "red",
    originalProcessResult: observed.originalProcessResult,
    timeoutMs: observed.timeoutMs,
  };
  const headline =
    "the package typecheck is RED in the worktree (the proof run is tsx-driven — types stripped — so only the typecheck sees type-illegal code)";
  return {
    observation,
    ok: false,
    reason: `${headline}\n${renderBackstopRefusalObservation(observation)}`,
  };
}

/** An unsigned local ref is diagnosis, never promotion or a landing. */
export function renderForensicPreservation(preservation: PromotionResult | undefined): string[] {
  if (preservation === undefined) return [];
  return [
    `forensics:   UNSIGNED authored commit retained locally at ${preservation.branch} @ ${preservation.commitSha} ` +
      `(${preservation.detail}); never pushed, promoted, or landable without a later signed proof`,
  ];
}
