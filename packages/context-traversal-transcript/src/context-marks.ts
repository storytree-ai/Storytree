/**
 * ADR-0411 D3's two marks on a session's own context window, and the band a reading falls in.
 *
 * PURE AND BROWSER-SAFE ON PURPOSE, and reachable without the barrel. The rest of this package
 * reads real transcript bytes and is node-only by construction, so it is never bundled by the
 * studio; these two integers have to reach a browser anyway, because the meter widget draws the
 * same bands the CLI prints. The `./marks` subpath export exists for exactly that — it imports
 * nothing, so pulling it into the renderer's bundle drags no `node:` module behind it.
 *
 * ★ ONE COPY, DELIBERATELY. The numbers lived in `apps/studio/src/lib/contextWindowMeter.ts` when
 * the meter was the only reader. `storytree context` is the second, and the CLI must not import
 * `apps/studio` — so the choice was one shared home or two copies of a number ADR-0411 D8 says
 * out loud may be TUNED. Two copies of a tunable constant is how one surface comes to say "soft"
 * while the other says "calm" about the same window.
 */

/**
 * The SOFT mark: past this, take on no NEW increment — finish what you hold, then hand over.
 *
 * `~400K` in ADR-0411 D3's own words. The tilde is about when the reading is CHECKED (at an
 * increment boundary, D5), not about the number being approximate.
 */
export const SOFT_MARK_TOKENS = 400_000;

/**
 * The HARD mark: land what is green, write the handover onto the owning arc, release claims, and
 * let a fresh session continue. The owner's own number.
 */
export const HARD_MARK_TOKENS = 500_000;

/** Which of ADR-0411 D3's bands a reading falls in. `calm` is below both marks. */
export type ContextBand = "calm" | "soft" | "hard";

export function bandOf(residentTokens: number): ContextBand {
  if (residentTokens >= HARD_MARK_TOKENS) return "hard";
  if (residentTokens >= SOFT_MARK_TOKENS) return "soft";
  return "calm";
}

/**
 * The plain-language consequence of a reading — ADR-0411 D3's own instruction, not a paraphrase.
 *
 * This is the sentence that makes the number worth having: the quantity says how full, and a
 * session's actual question is what to do about it. It sits beside the marks rather than in either
 * surface, because the widget and `storytree context` must not tell a session two different things
 * about one reading.
 *
 * It ADVISES and never enforces (ADR-0411 D8 keeps the marks reversible and live): nothing here
 * stops a session, and nothing here should grow into a refusal.
 */
export function bandGuidance(band: ContextBand): string {
  switch (band) {
    case "hard":
      return "past the hard mark — land what is green, write the handover, let a fresh session continue";
    case "soft":
      return "past the soft mark — take on no new increment; finish what is held, then hand over";
    default:
      return "below both marks — room for another increment";
  }
}
