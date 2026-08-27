// colour-spread.ts — THE CHECK THAT SURVIVES THE PALETTE FENCE BEING LIFTED.
//
// ADR-0418 D3 lifted ADR-0380 D6 fence 3 on `packages/forest-world-r3f/harness/`: a live render
// there need no longer stay banded to an authored palette. D4 committed to REPLACING the check
// that lift removes rather than deleting it, and named the replacement's second part — "a
// colour-spread band: bins-to-cover-90% must land inside a stated range rather than at a single
// authored set". This module is that band. `capture.mjs` is where it refuses.
//
// ⚠⚠ IT IS WEAKER THAN WHAT IT REPLACES, AND ADR-0418 D4 SAYS SO OUT LOUD: it says "roughly in
// range" where the palette check said "exactly right or not". That sentence is repeated here
// rather than paraphrased because the temptation on landing a replacement is to write it up as an
// equivalent. It is not one. Concretely: this band catches a continuous surface that has
// COLLAPSED back onto the authored ladder. It does NOT catch a continuous surface that has merely
// degraded — the measured margin below is 23x, so a grain at half strength sails through. That is
// the cost ADR-0418 accepted knowingly, not a defect to be quietly fixed by tightening a number.
//
// ⚠ AND IT DOES NOT WEAKEN THE PALETTE REFUSAL. Every canvas declared `banded` here is still held
// to `capture.mjs`'s off-palette refusal exactly as before, unchanged. This band applies to
// canvases declared `continuous` — the surface where the fence is already lifted and where, until
// now, no automatic instrument could fail a build at all.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHY THE BAND IS RELATIVE TO A CONTROL AND NOT AN ABSOLUTE RANGE. THIS IS THE DESIGN DECISION.
//
// ADR-0418 D4 states the band with three absolute anchors: "below the band is our current 9-17,
// above it is the ~4,000 of an unmodified photoreal render, and the reference the owner named
// sits at 474". `docs/research/chapter2-land-idiom-2026-08-27/README.md` §6 then measured all
// three against seven land treatments and found every one of them unusable, and the increment
// `replace-the-palette-closure-check` carries that finding forward as the thing to read before
// building. Restated, because a later reader will otherwise re-derive it:
//
//   1. The APPROVED render sits AT the stated ceiling, not inside it — the island the owner
//      called good enough to flip the previous ADRs measures 3,978 against a ceiling of ~4,000.
//   2. Every land treatment worth having is FURTHER above it: the recommended `combined` land is
//      18,077 at 487 px, 4.5x the approved render and 38x the named 474 reference. The reason is
//      structural — 474 was measured on a FLAT-SHADED game render and the owner has approved a
//      CONTINUOUSLY SHADED ground, which cannot approach 474 without being re-quantised, which is
//      the very thing the fence was lifted to permit.
//   3. bins90 is resolution-dependent on a path-traced frame and the band names no size. The same
//      island moves 3,974 -> 5,413 between the two delivered sizes, and not even monotonically:
//      the control's bare land goes 327 -> 236, DOWN, because a smooth gradient gains no new
//      colours from more pixels.
//
// A fourth problem is not in that list and is the one that decides the shape.
// `grain-picture-is-renderer-specific`, measured 2026-08-27 across SwiftShader and an RTX 2060:
// the palette fence holds identically on both (0 off-palette pixels, twelve panels), but 24.5% of
// GRAINED pixels land on a different ladder rung, because `fract(sin(...))`'s argument reduction
// differs by vendor. So an absolute pixel figure committed as a threshold is one machine's
// figure, and reds on any other. That finding is why nothing here is an absolute number.
//
// SO THE BAR IS MEASURED IN THE SAME RUN, ON THE SAME PAGE, BY THE SAME RENDERER: a canvas
// declared `continuous` must deliver a 90%-mass colour count STRICTLY GREATER than the total
// colour count its declared BANDED CONTROL delivered. Read as a sentence: *this picture needs
// more colours to cover nine tenths of itself than the entire authored ladder beside it has*.
// That is exactly the claim "it is not expressible by the ladder", and it is the claim the lifted
// fence gave up the ability to make.
//
// Every one of the four problems above dissolves rather than being argued around: there is no
// absolute anchor to be wrong (1, 2), the control is at the same delivered size by construction
// (3), and both arms are drawn by one renderer in one run (4). It is also the house pattern
// rather than a new invention — `frame-budget.ts` states every cost against a control with the
// feature off, `capture.mjs`'s interior-holes instrument reads against the flat control on the
// same page, and `cover-measure.mjs` refuses arms that are secretly the same scene.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// THE MARGIN, MEASURED, SO THE BAR'S PLACEMENT IS CHECKABLE RATHER THAN ASSERTED.
//
// From `docs/research/chapter2-grain-crossing-2026-08-27/grain-measure.json` — bare land, one
// status, browser-delivered pixels, the same `binsToCover` arithmetic this module calls:
//
//   | panel              | distinct | bins90 | off-palette |
//   |--------------------|---------:|-------:|------------:|
//   | grain-none-2px     |        4 |      3 |           0 |
//   | grain-normal-2px   |        4 |      3 |           0 |
//   | grain-colour-2px   |      184 |     94 |      77,008 |
//   | grain-both-2px     |      184 |    104 |      77,008 |
//   | grain-none-8px     |        4 |      3 |           0 |
//   | grain-normal-8px   |        4 |      3 |           0 |
//   | grain-colour-8px   |      186 |     94 |   1,234,059 |
//   | grain-both-8px     |      186 |    104 |   1,234,059 |
//
// The bar for a continuous panel on that page is its control's `distinct` = 4; the continuous
// panels deliver bins90 94-104. **A 23x margin.** Two things follow that are worth stating:
//
//   - THE BAR IS NOT A NUMBER PICKED TO MAKE THE ANSWER COME OUT. A number picked to pass would
//     sit just under 94. This one sits at 4, and it is not chosen at all — it is read off the
//     control in the same run. `hardware-floor.mjs`'s own history is why that distinction is
//     worth this much prose: an earlier version of it scored rungs against `16.7 * 1.35`, "a
//     number picked to make the answer come out", and that is recorded there as a defect.
//   - bins90 IS RESOLUTION-INVARIANT ON THIS RENDERER, which land-idiom §6's problem 3 could not
//     have predicted. 3 at both zooms banded; 94 / 104 at both zooms continuous, across sixteen
//     times the pixels. A quantised ladder gains no entries from more pixels, and neither, here,
//     does the noise field's own delivered set. The path-traced dependence §6 measured is a
//     property of 128 samples and a denoiser, not of a single-sample rasteriser. The bar does not
//     RELY on this — the control is at the same delivered size regardless — but it is why the
//     pairing below is a safety rail rather than the whole mechanism.

import { binsToCover } from './pixel-metrics.js';

/**
 * What a canvas claims about how its colour is produced.
 *
 * - `banded` — quantised to an authored ladder. Still held to `capture.mjs`'s off-palette
 *   refusal, unchanged; this module only reads it, as the bar for its continuous siblings.
 * - `continuous` — shading that is not quantised to an authored ladder (ADR-0418 D2/D3). Exempt
 *   from the palette refusal and held to the band instead.
 */
export type ColourRegime = 'banded' | 'continuous';

/** What one canvas declares: its regime, and — when continuous — the control it is read against. */
export interface SpreadDeclaration {
  readonly regime: ColourRegime;
  /**
   * The `data-st-tag` of the BANDED canvas this one is measured against. Required for
   * `continuous`, forbidden for `banded`.
   *
   * ⚠ NAMED RATHER THAN DERIVED FROM THE TAG STRING. Pairing `grain-colour-8px` with
   * `grain-none-8px` by splitting on hyphens works until a tag is renamed, at which point the
   * pairing silently resolves to something else or to nothing. `cover-measure.mjs` does exactly
   * that surgery (`tag.split('-')`) and is fragile for it. An explicit name is one more line and
   * a missing control is then a refusal rather than a guess.
   */
  readonly control?: string;
}

/**
 * WHAT EACH TAGGED CANVAS DECLARES ITSELF TO BE.
 *
 * ⚠ HAND-AUTHORED AND DELIBERATELY NOT DERIVED FROM THE PAGE, for the reason `prop-presence.ts`
 * records at length and which applies here without change: if the declaration were read off the
 * page's own props, a page that stopped applying its continuous term would also stop claiming
 * one, the check would pass, and it would pass for exactly the reason it exists to catch. The
 * page is the thing under audit; it does not get to say what it owes.
 *
 * ⚠ AND THE EXPECTATION IS RESOLVED FROM THE CANVAS TAG, NOT FROM A `data-` ATTRIBUTE THE PAGE
 * STAMPS. Same reason, arriving one level down. The tag is already load-bearing — it names the
 * evidence files — so resolving through it keeps the declaration inside `capture.mjs`'s own
 * module graph.
 *
 * Absent from this manifest means UNDECLARED, which is a refusal and not a skip — see
 * {@link checkColourSpread}. Every tagged canvas on every page `capture.mjs` drives must appear
 * here, including the banded ones it was already auditing, because a manifest that only knows
 * about continuous canvases cannot tell "this page has none" from "this page's declarations
 * stopped resolving".
 */
export const SPREAD_MANIFEST = {
  // --- grain.html: the crossing page, and the first page carrying continuous panels ----------
  //
  // The two `colour` variants perturb the ground's COLOUR after quantisation, so they deliver
  // pixels that are not authored ramp entries — legal on this surface under ADR-0418 D2/D3, and
  // the reason `capture.mjs` could not audit this page at all until now. The `normal` variant
  // perturbs the surface NORMAL before the lighting is quantised, so it stays banded; that is
  // measured, not assumed (0 off-palette px on both zooms), and it is why `normal` is a control
  // rather than a continuous panel.
  'grain-none-2px': { regime: 'banded' },
  'grain-normal-2px': { regime: 'banded' },
  'grain-colour-2px': { regime: 'continuous', control: 'grain-none-2px' },
  'grain-both-2px': { regime: 'continuous', control: 'grain-none-2px' },
  'grain-none-8px': { regime: 'banded' },
  'grain-normal-8px': { regime: 'banded' },
  'grain-colour-8px': { regime: 'continuous', control: 'grain-none-8px' },
  'grain-both-8px': { regime: 'continuous', control: 'grain-none-8px' },

  // --- island.html: the audited island page, entirely banded ---------------------------------
  //
  // Declared so this page reads as "checked, and it has no continuous panels" rather than as
  // "the declarations did not resolve". Nothing about these canvases changes: they remain under
  // the off-palette refusal exactly as before.
  'zoom-lit': { regime: 'banded' },
  'zoom-terrain': { regime: 'banded' },
  'zoom-shadow': { regime: 'banded' },
  'bare-lit': { regime: 'banded' },
  'bare-shadow': { regime: 'banded' },
  'delivered-lit': { regime: 'banded' },
  'delivered-shadow': { regime: 'banded' },

  // --- directions.html: the five dressed islands and their overview row, entirely banded -------
  'row-today': { regime: 'banded' },
  'row-walled': { regime: 'banded' },
  'row-hamlet': { regime: 'banded' },
  'row-terrace': { regime: 'banded' },
  'row-shrine': { regime: 'banded' },
  'row-wild': { regime: 'banded' },
  today: { regime: 'banded' },
  walled: { regime: 'banded' },
  hamlet: { regime: 'banded' },
  terrace: { regime: 'banded' },
  shrine: { regime: 'banded' },
  wild: { regime: 'banded' },

  // ⚠ `cover.html`'s twelve panels are deliberately ABSENT. `capture.mjs` does not drive that
  // page — `cover-measure.mjs` does, with its own refusals — and declaring canvases nobody
  // audits is how a manifest goes stale without anything noticing. Pointing the driver at that
  // page therefore refuses with `undeclared`, which is the correct answer rather than a gap:
  // it says "declare these first", loudly, instead of checking nothing quietly.
  //
  // `as const satisfies` rather than an annotation, per `docs/typescript-standard.md`'s
  // `no-known-value-widening` remedy and matching `prop-presence.ts`'s own manifest: every entry
  // is checked against the contract while the keys stay known, so a tag that is declared here is
  // visible to the compiler rather than dissolved into `string`.
} as const satisfies Record<string, SpreadDeclaration>;

/**
 * The fewest opaque pixels a canvas may deliver and still have its 90%-mass colour count read as
 * a fact about the MATERIAL rather than about the sample.
 *
 * ⚠ THIS IS A PLACEMENT INSIDE A MARGIN, NOT A DERIVED QUANTITY, and it is said plainly because
 * every other threshold in this module is derived and a reader is entitled to know which is
 * which. Below roughly a thousand pixels, `bins90 > control.distinct` starts being satisfiable by
 * having few enough pixels rather than by having a continuous material. The smallest real
 * continuous panel measured is 77,008 opaque pixels, so this sits 77x below every picture it will
 * ever see.
 *
 * It is deliberately far below the real panels, following the lesson `capture.mjs`'s own blank
 * floor records: an earlier draft of that floor was set at 20 and condemned four legitimate
 * panels, and "the floor was wrong, not the panels". A floor raised until real evidence passes is
 * how an instrument stops measuring anything.
 */
export const SPREAD_OPAQUE_FLOOR = 1000;

/** One canvas as `capture.mjs`'s readback presents it: a tag, an opaque count, a histogram. */
export interface DeliveredCanvas {
  readonly tag: string | null;
  readonly opaque: number;
  /** `[hex, count]` pairs over fully-opaque pixels only. */
  readonly colours: ReadonlyArray<readonly [string, number]>;
}

/** Why one canvas failed, or `null` when it passed. Every value is a refusal. */
export type SpreadFault =
  | 'undeclared'
  | 'vacuous'
  | 'control-missing'
  | 'control-not-banded'
  | 'mask-mismatch'
  | 'collapsed';

/** The verdict for one canvas. */
export interface SpreadCanvasVerdict {
  readonly tag: string;
  readonly regime: ColourRegime | null;
  readonly opaque: number;
  /** Distinct exact colours delivered on opaque pixels. */
  readonly distinct: number;
  /** Colours needed to cover 90% of the opaque pixels. */
  readonly bins90: number;
  /** The control this was read against, when continuous and resolvable. */
  readonly control: string | null;
  /** The bar it had to clear — the control's `distinct`. `null` when there was no bar to clear. */
  readonly bar: number | null;
  readonly fault: SpreadFault | null;
  /** Human-readable detail for the refusal; empty when it passed. */
  readonly detail: string;
}

/** The verdict for a page. */
export interface SpreadVerdict {
  readonly ok: boolean;
  /** Tagged canvases that resolved to a declaration. */
  readonly checked: number;
  /** Of those, how many are declared `continuous` — the ones the band can actually refuse. */
  readonly continuousChecked: number;
  readonly canvases: ReadonlyArray<SpreadCanvasVerdict>;
  /** Tagged canvases with no declaration at all. Their own verdicts carry `undeclared`. */
  readonly unresolvedTags: ReadonlyArray<string>;
}

/** The two figures a colour histogram alone can answer — see `pixel-metrics.ts`'s note on why
 *  MICRO and STRUCT are not among them. */
interface ColourSpreadFigures {
  readonly distinct: number;
  readonly bins90: number;
}

/** Distinct colours and the 90%-mass count, from a histogram alone. */
function spreadOf(canvas: DeliveredCanvas): ColourSpreadFigures {
  const counts = canvas.colours.map(([, n]) => n);
  return {
    distinct: counts.length,
    bins90: canvas.opaque === 0 ? 0 : binsToCover(counts, canvas.opaque, 0.9),
  };
}

/**
 * Judge every tagged canvas on a page against {@link SPREAD_MANIFEST}.
 *
 * Untagged canvases are ignored: they carry no identity to declare against, and `capture.mjs`'s
 * per-canvas blank floor already covers them. A TAGGED canvas with no declaration is refused —
 * see the manifest's note on why an unrecognised tag must not read as a skip.
 */
export function checkColourSpread(
  delivered: ReadonlyArray<DeliveredCanvas>,
  manifest: Readonly<Record<string, SpreadDeclaration>> = SPREAD_MANIFEST,
): SpreadVerdict {
  const byTag = new Map<string, DeliveredCanvas>();
  for (const c of delivered) if (c.tag) byTag.set(c.tag, c);

  const canvases: SpreadCanvasVerdict[] = [];
  const unresolvedTags: string[] = [];

  for (const c of delivered) {
    if (!c.tag) continue;
    const tag = c.tag;
    const spread = spreadOf(c);
    const declaration = manifest[tag];

    if (!declaration) {
      unresolvedTags.push(tag);
      canvases.push({
        tag,
        regime: null,
        opaque: c.opaque,
        ...spread,
        control: null,
        bar: null,
        fault: 'undeclared',
        detail:
          'no colour-spread declaration. A tagged canvas the manifest does not know about is ' +
          'unchecked, and an unchecked canvas that reads as a skip is how this instrument would ' +
          'quietly stop covering the page it was added to audit.',
      });
      continue;
    }

    // A banded canvas is READ, not judged: `capture.mjs`'s off-palette refusal is what holds it,
    // unchanged. A second rung here saying "its colours are within the authored closure" would be
    // implied by the rung already present and would be a vacuous green wearing a second name —
    // the fault class this arc has met more than any other.
    if (declaration.regime === 'banded') {
      canvases.push({
        tag,
        regime: 'banded',
        opaque: c.opaque,
        ...spread,
        control: null,
        bar: null,
        fault: null,
        detail: '',
      });
      continue;
    }

    const controlTag = declaration.control ?? null;
    const control = controlTag === null ? undefined : byTag.get(controlTag);
    const base = {
      tag,
      regime: 'continuous' as const,
      opaque: c.opaque,
      ...spread,
      control: controlTag,
    };

    if (controlTag === null || !control) {
      canvases.push({
        ...base,
        bar: null,
        fault: 'control-missing',
        detail:
          controlTag === null
            ? 'declared continuous with no control named. The bar is the control, so there is no ' +
              'bar and nothing was measured.'
            : `its declared control ${JSON.stringify(controlTag)} is not on this page. The bar is ` +
              'read off the control in the same run, so without it this canvas is unjudged — ' +
              'which must not read as a pass.',
      });
      continue;
    }

    if (manifest[controlTag]?.regime !== 'banded') {
      canvases.push({
        ...base,
        bar: null,
        fault: 'control-not-banded',
        detail:
          `its control ${JSON.stringify(controlTag)} is not declared banded. The bar means ` +
          '"more colours than the authored ladder has"; against a control that is itself ' +
          'continuous it means nothing.',
      });
      continue;
    }

    const bar = spreadOf(control).distinct;

    if (c.opaque < SPREAD_OPAQUE_FLOOR) {
      canvases.push({
        ...base,
        bar,
        fault: 'vacuous',
        detail:
          `${c.opaque} opaque px is below the ${SPREAD_OPAQUE_FLOOR}-px floor a 90%-mass colour ` +
          'count needs to be about the material rather than about the sample.',
      });
      continue;
    }

    // THE ARMS MUST BE THE SAME ISLAND. `cover-measure.mjs`'s refusal 3, and it is here for the
    // reason recorded there: same island, different materials — if the opaque counts move, the
    // two panels are not a comparison and no difference between them is attributable to the
    // material. Measured on the crossing page, all four panels at a zoom deliver the identical
    // count (1,234,059 at 8 px/unit), so this is an equality and not a tolerance.
    if (c.opaque !== control.opaque) {
      canvases.push({
        ...base,
        bar,
        fault: 'mask-mismatch',
        detail:
          `delivers ${c.opaque} opaque px against its control's ${control.opaque}. Same island, ` +
          'different materials — a mask that moved means these two panels are not a comparison, ' +
          'so the spread difference is not attributable to the shading.',
      });
      continue;
    }

    if (spread.bins90 <= bar) {
      canvases.push({
        ...base,
        bar,
        fault: 'collapsed',
        detail:
          `bins90 ${spread.bins90} does not exceed its control's ${bar} delivered colours. This ` +
          'picture is expressible by the authored ladder beside it, so the continuous term did ' +
          'not reach delivered pixels.',
      });
      continue;
    }

    canvases.push({ ...base, bar, fault: null, detail: '' });
  }

  const checked = canvases.filter((c) => c.regime !== null).length;
  return {
    ok: canvases.every((c) => c.fault === null),
    checked,
    continuousChecked: canvases.filter((c) => c.regime === 'continuous').length,
    canvases,
    unresolvedTags,
  };
}

/** The refusal text `capture.mjs` prints. */
export function describeSpreadFailure(verdict: SpreadVerdict): string {
  const failed = verdict.canvases.filter((c) => c.fault !== null);
  if (failed.length === 0) return '';
  return failed.map((c) => `${c.tag} [${c.fault}] ${c.detail}`).join('\n    ');
}
