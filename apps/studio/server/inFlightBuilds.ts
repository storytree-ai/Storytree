// inFlightBuilds — the pure row → BuildActivity[] fold the pg backend applies after its
// `WITH latest_building … SELECT DISTINCT ON (unit_id) … ORDER BY seq DESC` query (ADR-0048).
//
// Why a standalone module: the LIVE SQL needs a DB (exercised by the activityApi integration test +
// the operator-attested deep-link), but the TTL filter and the ADR-0048 §3 v2 PHASE surfacing are
// pure data math — red-green here (inFlightBuilds.test.ts) without a DB. The query already takes the
// NEWEST `building` row per unit, so `doc->>'phase'` is the LIVE phase the wisp colours from.

import { BUILD_IN_FLIGHT_TTL_MS } from '../src/types';
import type { BuildActivity, BuildPhase, SubagentColourState } from '../src/types';

/** One raw row from the `inFlightBuilds` query (the scalar projection of `events.work_event`). */
export interface BuildRow {
  unit_id: string;
  tier: string;
  run_id: string;
  at: Date | string;
  /** `doc->>'phase'` — the live gate phase, or null for a pre-ADR-0048 `building` mark. */
  phase?: string | null;
  /** `doc->>'colourState'` — the live subagent role (ADR-0138 §5), or null for a pre-ADR-0138 mark. */
  colour_state?: string | null;
}

const GATE_PHASES: ReadonlySet<string> = new Set<BuildPhase>([
  'AUTHOR_TEST',
  'CONFIRM_RED',
  'IMPLEMENT',
  'CONFIRM_GREEN',
  'GATE',
]);

/** The three ADR-0138 §5 subagent colour-states — guards the advisory `doc->>'colourState'` read so a
 *  malformed value (or the §5-forbidden "green"/"bloom") can never reach the wisp. */
const COLOUR_STATES: ReadonlySet<string> = new Set<SubagentColourState>([
  'authoring',
  'proving',
  'supplementing',
]);

/** Narrow a raw `doc->>'phase'` value to a recognised {@link BuildPhase}, or undefined. */
function toPhase(raw: string | null | undefined): BuildPhase | undefined {
  return raw != null && GATE_PHASES.has(raw) ? (raw as BuildPhase) : undefined;
}

/** Narrow a raw `doc->>'colourState'` value to a recognised {@link SubagentColourState}, or undefined
 *  (ADR-0138 §5). A pre-ADR-0138 row (null) or a malformed/forbidden value yields undefined → the build
 *  wisp keeps its plain `phaseBand` look (back-compat). */
function toColourState(raw: string | null | undefined): SubagentColourState | undefined {
  return raw != null && COLOUR_STATES.has(raw) ? (raw as SubagentColourState) : undefined;
}

/**
 * Fold the query rows into the wire shape: normalise `at` to ISO, DROP a row past the in-flight TTL
 * (a dangling/hard-killed build clears in minutes — ADR-0048 §2, mirrors classifyPresence), and
 * surface a recognised gate `phase` when present (omitted otherwise, so a pre-ADR-0048 mark reads as
 * the coarse band). Pure: rows + now in, BuildActivity[] out.
 */
export function rowsToBuildActivity(rows: readonly BuildRow[], now: Date): BuildActivity[] {
  const out: BuildActivity[] = [];
  for (const row of rows) {
    const at = row.at instanceof Date ? row.at.toISOString() : new Date(row.at).toISOString();
    if (now.getTime() - new Date(at).getTime() >= BUILD_IN_FLIGHT_TTL_MS) continue;
    const phase = toPhase(row.phase);
    const colourState = toColourState(row.colour_state);
    out.push({
      unitId: row.unit_id,
      tier: row.tier,
      runId: row.run_id,
      at,
      ...(phase !== undefined ? { phase } : {}),
      ...(colourState !== undefined ? { colourState } : {}),
    });
  }
  return out;
}
