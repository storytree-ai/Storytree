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
 *
 * ★★ TUNED BY ADR-0499 D1 (2026-09-01): 400K/500K → 700K/850K, under ADR-0411 D3's own tunability
 * clause. On the 1M window that shipped, the old pair sat at 40%/50% and had never been re-derived
 * against it. ADR-0499 D6 keeps them tunable and says outright that what was measured is the HARM
 * from the old pair, not the onset of degradation — which nobody has measured.
 */

/**
 * The SOFT mark: past this, take on no NEW increment — finish what you hold, then hand over.
 *
 * The tilde in "~700K" is about when the reading is CHECKED (at an increment boundary, ADR-0411 D5),
 * not about the number being approximate.
 */
export const SOFT_MARK_TOKENS = 700_000;

/**
 * The HARD mark: land what is green, write the handover onto the owning arc, release claims, and
 * let a fresh session continue. ~150K is left above it on a 1M window to do exactly that.
 */
export const HARD_MARK_TOKENS = 850_000;

/**
 * What a mark ASKS FOR — ADR-0499 D2–D4, stated once beside the numbers rather than in either
 * surface.
 *
 * ★ THIS IS THE HALF THAT MATTERS, AND IT IS WHY D1 ALONE WAS INSUFFICIENT. The measured failure was
 * not a session hitting a mark. It was a session at 324K writing "~76k of headroom, so I'll be
 * economical" — 324K + 76K = the old soft mark exactly — and then reading the decisions it was
 * reasoning about through 20-line windows, stopping one section short of its answer in one of them.
 * It read a SCHEDULING boundary as a SPEND BUDGET. Raising the numbers alone moves that behaviour to
 * 620K; it does not remove it.
 */
export const MARKS_GOVERN_THE_NEXT_UNIT =
  "The marks govern whether you take the NEXT unit, never how carefully you do THIS one. If" +
  " finishing the unit in hand properly crosses a mark, cross it — that is the expected case, not a" +
  " failure. Below the soft mark there is no economy to practise, and economising on the very" +
  " artifact you are deciding about is always wrong: if the window cannot hold what your conclusion" +
  " rests on, hand over or fan out to a subagent whose window is its own, never read it partially.";

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
 *
 * ★ IT SPEAKS ABOUT THE NEXT UNIT ONLY. Each band names what to do at the next increment boundary —
 * never how to conduct the one in hand. {@link MARKS_GOVERN_THE_NEXT_UNIT} is the long form, and the
 * short forms here must never drift into advice about pace, economy or depth (ADR-0499 D2).
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
