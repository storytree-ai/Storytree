import { z } from "zod";
import { Tier } from "./enums.js";

/**
 * The work-event DATA shapes (ADR-0006 / ADR-0020, published per ADR-0068 §3).
 *
 * DATA SHAPES + the two store `kind` literals ONLY — what a READER (the pg work store) parses
 * work events as. The COMPUTE that BUILDS a work event and DERIVES a unit's rollup status
 * (`workEvent`, `rollupStatus`, `rollupParitySuite`) is NOT here; it is the farmer organism's
 * ruler and lives in `@storytree/orchestrator`. Mirrors `@storytree/core/rollup.ts`'s shapes
 * field-for-field (a no-op re-point), shapes only — browser-safe, zod the only runtime dep.
 */

/** The store `kind` for lifecycle work events (the `events.work_event` stream, drive-machinery Phase A). */
export const WORK_EVENT_KIND = "work";

/** The store `kind` the prove-it-gate appends signed verdicts under (prove-it-gate.ts SIGNING_KIND). */
export const SIGNING_EVENT_KIND = "signing";

/**
 * The prove-it-gate's ordered phases (ADR-0020 §1), DUPLICATED here as wire DATA — like `Tier` /
 * `Status` (ADR-0068 §3), proof-protocol owns the MESSAGE FORMAT and stays dependency-free, so it
 * mirrors the `Phase` union the orchestrator's `phase-machine.ts` owns rather than importing it
 * (the contract is the bottom root; it depends on nothing). Carried on a `building` work-event so the
 * studio can colour the in-flight wisp by the live red→green phase (ADR-0048 §3 v2).
 */
export const BuildPhase = z.enum([
  "AUTHOR_TEST",
  "CONFIRM_RED",
  "IMPLEMENT",
  "CONFIRM_GREEN",
  "GATE",
]);
export type BuildPhase = z.infer<typeof BuildPhase>;

/**
 * The subagent COLOUR-STATE a `building` work-event was emitted under (ADR-0138 §5) — the wisp's
 * colour axis GENERALISED from the gate `phase` to what the orchestrator is doing on the claimed
 * story: `authoring` (story-author), `proving` (the red→green leaf — the old build-wisp, now a
 * colour *state*), `supplementing` (glue / non-leaf orchestration). Like `BuildPhase`, proof-protocol
 * owns this as wire DATA (the bottom root depends on nothing); `@storytree/drive`'s
 * `subagentColourState` maps a role/intent to one of these tokens and the phase writer stamps it.
 *
 * HONESTY WALL (ADR-0045 / ADR-0099): a colour-state is a CLAIM signal, NEVER a proof — `proving` is
 * not green. Only a signed PASS verdict paints the green bloom, so these tokens deliberately exclude
 * `green`/`bloom`; a claimed-but-not-proven wisp must render visibly distinct from a proven one.
 */
export const ColourState = z.enum(["authoring", "proving", "supplementing"]);
export type ColourState = z.infer<typeof ColourState>;

/**
 * The doc carried by a lifecycle work event. `event` is the lifecycle change (NOT the StoreEvent
 * `type`, which stays in the created/updated/deleted vocabulary); `runId` ties a `building` mark
 * to the run that picked the unit up; `tier` feeds the `events.work_event.tier` column when the
 * event lands in the pg work store (optional — old events have none).
 *
 * `phase` (ADR-0048 §3 v2) is the LIVE prove-it-gate phase a `building` mark was emitted at — the
 * wisp colours red (AUTHOR_TEST/CONFIRM_RED) → green (CONFIRM_GREEN/GATE) from it. It is NOT a new
 * lifecycle word (ADR-0048 "No new lifecycle word"): the `event` stays `building`; `phase` rides as
 * an extra field. Optional — absent on every pre-ADR-0048 `building` row (read as the coarse band).
 *
 * `colourState` (ADR-0138 §5) is the parallel SUBAGENT colour axis the phase writer stamps when a
 * spawned subagent's role/intent is known — authoring / proving / supplementing. Like `phase`, it
 * rides on the SAME `building` event (no new lifecycle word) and is optional (absent ⇒ the wisp falls
 * back to the coarse phase band). The honesty wall holds: it is never `green`/`bloom` (see ColourState).
 */
export const WorkEventDoc = z
  .object({
    unitId: z.string(),
    event: z.enum(["proposed", "building", "retired"]),
    runId: z.string().optional(),
    tier: Tier.optional(),
    phase: BuildPhase.optional(),
    colourState: ColourState.optional(),
  })
  .strict();
export type WorkEventDoc = z.infer<typeof WorkEventDoc>;
