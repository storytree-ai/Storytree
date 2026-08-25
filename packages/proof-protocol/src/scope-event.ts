import { z } from "zod";
import { BuildPhase } from "./work-event.js";
import { UsageSource } from "./usage-event.js";

/**
 * The write-scope WALL DATA shapes (ADR-0446): what the spine's phase fence did during one
 * authoring slice — the observability SIBLING stream to `events.verdict` and `events.usage_event`.
 *
 * ## Why this stream exists at all
 *
 * Two live fence mechanisms refuse out-of-scope writes today, and until ADR-0446 NEITHER recorded
 * the refusal anywhere that outlived the run: the owned loop's `WriteScopedToolExecutor` collected
 * `WriteViolation`s on the executor INSTANCE (its module doc claimed "the gate can assert the wall
 * held"; grepping the gate for "violation" returned nothing), and `ClaudeAgentAuthor`'s PreToolUse
 * hook returned its refusal TO THE MODEL. So "does the spine's write fence ever actually fire?" —
 * the question that decides whether the fence still earns its keep against better models — could be
 * argued but not measured. This stream is the sink that makes it a query.
 *
 * ## ONE ROW PER ARMED SLICE — a zero is not an absence
 *
 * The load-bearing property, and the reason this is NOT modelled as "a row per refusal": a slice
 * that armed the wall and never fired MUST be distinguishable from a slice nobody recorded. A
 * refusal-keyed stream makes "no rows" mean both at once, and a count that cannot go red converts an
 * unverified state into an authoritative one — this project's most-recorded fault class. So one row
 * is emitted per AUTHORING SLICE, carrying `refusals: []` when the wall held silently, and that row
 * is also the DENOMINATOR: a reading is "N refusals across M armed slices on runtime R over period
 * P", never a bare N.
 *
 * ## `noPathCalls` IS COUNTED SEPARATELY, DELIBERATELY
 *
 * A write-shaped call whose target path cannot be read is treated as a PASS-THROUGH by the owned
 * loop and as a fail-closed REFUSAL by the SDK hook. One of those is wrong. Folding it into
 * `refusals` would hide precisely the disagreement worth seeing, so it rides its own count plus an
 * explicit {@link NoPathDisposition} — STATED by the emitter, never inferred by a reader from
 * `source` (a reader that derives it goes silently wrong the day a mechanism changes its mind).
 *
 * ## DATA SHAPES ONLY (ADR-0068 §3)
 *
 * The COMPUTE that builds a scope event (`scopeEvent`) is the farmer organism's and lives in
 * `@storytree/orchestrator`; the mapping from each runtime's own violation shape lives in
 * `@storytree/drive`. proof-protocol depends on nothing.
 *
 * ## OBSERVABILITY ONLY
 *
 * Nothing here decides anything. `rollupStatus` ignores this kind entirely (an unknown kind grants
 * nothing), so a scope row can never move a unit's derived status, and no fence behaviour is
 * conditioned on it. Recording that the wall fired is not the same act as judging what that means —
 * the judgement is an owner fork on the evidence this accumulates.
 */

/** The store `kind` for per-slice write-scope events (the `events.scope_event` stream). */
export const SCOPE_EVENT_KIND = "scope";

/**
 * Which leaf runtime ARMED the wall for this slice. Deliberately the very same enum as
 * {@link UsageSource} rather than a parallel copy: a reading that wants "refusals per slice per
 * runtime" joins this stream to `events.usage_event` on exactly this vocabulary, and two enums that
 * must agree are two enums that will eventually disagree.
 */
export const ScopeSource = UsageSource;
export type ScopeSource = z.infer<typeof ScopeSource>;

/**
 * How a mechanism treats a write-shaped call whose target path it cannot read.
 *
 * `refused` = fail-closed (the SDK hook's PreToolUse decision); `passed-through` = allowed and
 * merely noted (the owned loop's `noPathCalls`). Those two are the live disagreement, and carrying
 * the disposition on every row is what makes it QUERYABLE rather than arguable.
 *
 * `not-applicable` is the third and is not a dodge: Codex never inspects a tool INPUT at all — it
 * observes the replica's filesystem diff after the leaf stops, so "a call whose path could not be
 * read" is not a state that mechanism can be in. Saying so beats folding it into `refused`, which
 * would report agreement that was never measured.
 */
export const NoPathDisposition = z.enum(["refused", "passed-through", "not-applicable"]);
export type NoPathDisposition = z.infer<typeof NoPathDisposition>;

/**
 * Why one refusal fired. `scope` = a path was read and the phase's write predicate denied it (the
 * wall proper — the leaf tried to write outside its phase's ownership). `outside-workspace` = the
 * path resolved outside the authoring workspace at all.
 *
 * The no-path case is deliberately NOT a member: it is not carried in `refusals` under any label
 * (see {@link ScopeEventDoc.noPathCalls}), so a reader summing `refusals` cannot fold it in by
 * accident.
 */
export const ScopeRefusalKind = z.enum(["scope", "outside-workspace"]);
export type ScopeRefusalKind = z.infer<typeof ScopeRefusalKind>;

/**
 * A call refused for THE TOOL IT IS, before any path was looked at — the pi leaf's SHELL WALL
 * (`pi-harness-admission-arc` increment 2). `decidePiToolCall` is an allowlist over
 * `PI_AUTHORING_TOOLS`, so `bash`, `powershell`, and any write-capable tool a future pi release or
 * a loaded extension adds are refused by default rather than silently admitted.
 *
 * IT IS NOT A `ScopeRefusalKind`, AND THAT IS THE WHOLE POINT. A tool-surface refusal CARRIES NO
 * PATH: nothing was resolved, nothing was compared against the phase predicate, and there is no
 * workspace-relative target to record. Admitting it as a fourth {@link ScopeRefusalKind} member
 * would force a fabricated `path` onto {@link ScopeRefusal} (whose `path` is required) and would
 * silently inflate every "how often did the write fence fire?" reading with events that are not
 * write-fence firings at all.
 *
 * So it takes the shape `noPathCalls` already took for the same reason (ADR-0446): separate
 * carriage, never folded into `refusals`. It rides as a LIST rather than a bare count because,
 * unlike a no-path call, the interesting datum is WHICH tool was reached for — "the leaf tried the
 * shell four times this slice" and "the leaf called one unknown tool" are different findings, and
 * a count cannot tell them apart.
 *
 * The other three mechanisms have no analogous hole and therefore emit an empty list: the Claude
 * leaf keeps Bash off `LEAF_TOOLS` but has no handler-level allowlist to refuse at, the owned loop
 * executes only the tools the spine registered, and Codex inspects no tool call at all. An empty
 * list from those is a measured zero of a wall they do not have, not a missing value.
 */
export const ScopeToolSurfaceRefusal = z
  .object({
    /** The tool whose call was refused for being off the authoring surface (`bash`, …). */
    tool: z.string(),
    /** The refusal text the mechanism produced, when it produced one. */
    reason: z.string().optional(),
  })
  .strict();
export type ScopeToolSurfaceRefusal = z.infer<typeof ScopeToolSurfaceRefusal>;

/** One fail-closed write refusal: the wall a write hit, and the write that hit it. */
export const ScopeRefusal = z
  .object({
    kind: ScopeRefusalKind,
    /** The tool whose call was refused (`write_file`, `Write`, `file_change`, …). */
    tool: z.string(),
    /** The workspace-relative path the call targeted. */
    path: z.string(),
    /** The refusal text the mechanism produced, when it produced one. */
    reason: z.string().optional(),
  })
  .strict();
export type ScopeRefusal = z.infer<typeof ScopeRefusal>;

/**
 * The doc carried by one per-slice write-scope event: what the wall did during ONE authoring slice
 * (one SDK `query()` / one owned-loop step / one Codex exec) of one gate run.
 *
 * `armed` is `true` on every row this stream admits and exists to be READ, not to be branched on: a
 * row asserts that a fence was in place for this slice, which is the claim that makes `refusals: []`
 * mean "held silently" rather than "unknown". It is a literal rather than a boolean because a `false`
 * would be a row claiming to describe a wall that was not there — there is no such measurement, and a
 * nullable flag would invite one.
 *
 * `.strict()` and that is load-bearing, with a scar to point at: `ModelTokenUsage` gained a field on
 * the emitting side without being admitted on the schema side, and every usage event silently failed
 * to persist for a full build while nothing went red. Capture here is fail-silent by the same design,
 * so a new field MUST be added here in the same change that starts emitting it.
 */
export const ScopeEventDoc = z
  .object({
    unitId: z.string(),
    runId: z.string(),
    phase: BuildPhase,
    source: ScopeSource,
    /** The ARMED marker — see above. A row exists because a fence was in place for this slice. */
    armed: z.literal(true),
    /**
     * Every scoped-path refusal this slice made, in order. EMPTY IS A MEASUREMENT: the wall was
     * armed and never fired. It is not the absence of one.
     */
    refusals: z.array(ScopeRefusal),
    /**
     * Write-shaped calls whose target path could not be read. NEVER folded into `refusals` — the two
     * mechanisms disagree about whether this should even refuse, and merging them would hide it.
     */
    noPathCalls: z.number().int().nonnegative(),
    /** What this mechanism DID with those calls — stated by the emitter, never inferred. */
    noPathDisposition: NoPathDisposition,
    /**
     * Calls refused for the TOOL they are rather than the path they targeted — the pi leaf's shell
     * wall. NEVER folded into `refusals`: these carry no path and are not write-fence firings, so
     * summing them into the refusal count would inflate exactly the number ADR-0446 exists to
     * measure. See {@link ScopeToolSurfaceRefusal}.
     *
     * REQUIRED, like `refusals`, and for the identical reason: an empty list is the measurement
     * "this slice's surface wall was in place and nothing hit it". An optional field would make
     * absent mean both that and "this emitter predates the field", which is the collapse the
     * per-armed-slice row shape exists to prevent. It could be made required without a migration
     * because `events.scope_event` held zero rows when it landed (verified 2026-08-25).
     */
    toolSurfaceRefusals: z.array(ScopeToolSurfaceRefusal),
    /** The configured leaf model, when the caller knows one (the coarse label, as usage carries it). */
    model: z.string().optional(),
  })
  .strict();
export type ScopeEventDoc = z.infer<typeof ScopeEventDoc>;
