/**
 * Verdict glyph derivation for the storytree CLI tree view.
 *
 * Semantics (ADR-0033 owner decision 4):
 *   ✓  — latest signed verdict for the unit is a pass
 *   ✗  — latest signed verdict is a fail
 *   –  — store is readable but holds no verdict for this id (never built)
 *   "" — store is offline/unavailable (glyph column is absent)
 */

import { SIGNING_EVENT_KIND, Verdict } from "@storytree/verdict-contract";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VerdictGlyph = "✓" | "✗" | "–";

/**
 * Structural slice of PgWorkStore that this module consumes.
 * Everything is injected so the test never needs a real store or DB.
 */
export interface VerdictReaderLike {
  readEvents(): Promise<ReadonlyArray<{ kind: string; seq: number; doc: unknown }>>;
}

// ---------------------------------------------------------------------------
// Pure derivation
// ---------------------------------------------------------------------------

/**
 * Derive one verdict glyph per unitId from a raw event stream.
 *
 * Only `SIGNING_EVENT_KIND` events whose `doc` fully parses as a `Verdict`
 * are considered — a malformed signing doc grants nothing (conservative-parsing
 * discipline). Events are sorted by `seq`; the LAST verdict per unitId wins.
 */
export function deriveVerdictGlyphs(
  events: ReadonlyArray<{ kind: string; seq: number; doc: unknown }>,
): Map<string, VerdictGlyph> {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);

  const result = new Map<string, VerdictGlyph>();

  for (const event of sorted) {
    if (event.kind !== SIGNING_EVENT_KIND) continue;

    const parsed = Verdict.safeParse(event.doc);
    if (!parsed.success) continue;

    const verdict = parsed.data;
    const glyph: VerdictGlyph = verdict.outcome === "pass" ? "✓" : "✗";
    result.set(verdict.unitId, glyph);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Glyph lookup
// ---------------------------------------------------------------------------

/**
 * Look up the display glyph for a single unit.
 *
 *   glyphs === null  (offline)              → "" (column absent)
 *   map present, no entry for unitId        → "–" (never built)
 *   map present, entry found                → the stored glyph
 */
export function glyphFor(
  glyphs: ReadonlyMap<string, VerdictGlyph> | null,
  unitId: string,
): string {
  if (glyphs === null) return "";
  return glyphs.get(unitId) ?? "–";
}

// ---------------------------------------------------------------------------
// Async reader wrapper — the ONLY place the offline-silent contract lives
// ---------------------------------------------------------------------------

/**
 * Read verdict glyphs from the store, silently returning null when the store
 * is unavailable (null reader) or when the read fails for any reason.
 */
export async function readVerdictGlyphs(
  reader: VerdictReaderLike | null,
): Promise<Map<string, VerdictGlyph> | null> {
  if (reader === null) return null;

  try {
    const events = await reader.readEvents();
    return deriveVerdictGlyphs(events);
  } catch {
    return null;
  }
}
