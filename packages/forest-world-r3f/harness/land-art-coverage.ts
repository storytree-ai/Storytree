// land-art-coverage.ts — WHAT THE ART RUNG MUST HAVE AUDITED, so its green means something.
//
// ADR-0418 D4 required that `capture.mjs` carry a check that can still FAIL once the closed
// palette is lifted, and increment `replace-the-palette-closure-check` (PR #1673) built all three
// parts and mutation-tested them by hand. That work is sound and none of it is repeated here.
//
// This module exists because of the residue that increment recorded about itself, verbatim:
//
//   "Worth knowing because the `undeclared` refusal is UNCONDITIONAL and `capture.mjs` is a manual
//    tool, not a gate rung: a manifest entry disagreeing with a page breaks the next person's run
//    and nothing in CI would notice."
//
// An instrument that CAN fail, that no build ever runs, cannot fail A BUILD — which is arc fence
// 3's literal words. `land-art-check.ts` is the rung that runs it; this module is the part of that
// rung that is pure, and therefore the part that can be unit-tested without a browser.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// THE FAILURE THIS IS ACTUALLY GUARDING, WHICH IS NOT "THE ART IS WRONG".
//
// `capture.mjs` already refuses when the art is wrong. What it does NOT refuse is being pointed at
// a page that proves nothing. Measured on this branch, one run per page:
//
//   grain.html        8 canvases   5,242,624 px    0 prop islands    4 continuous canvases
//   island.html      44 canvases  29,085,906 px    7 prop islands    0 continuous canvases
//   directions.html  12 canvases     987,118 px   10 prop islands    0 continuous canvases
//   compare.html     22 canvases      46,576 px    0 prop islands    0 continuous canvases
//
// Every one of those exits 0. Three of the four print a line saying, in terms, that a whole half of
// ADR-0418 D4 checked nothing on them — "NO PROP DECLARATIONS ON THIS PAGE" or "NO CONTINUOUS
// CANVASES ON THIS PAGE". A rung driving any single page would therefore be half vacuous on its
// first day, and would go quietly MORE vacuous later: a renamed tag, a deleted panel or a manifest
// entry that stopped resolving all reduce what was audited without moving an exit code. That is the
// shape recorded in `moving-a-write-target-makes-old-readers-vacuously-green` — a reader that starts
// asserting over nothing passes forever, and passes LOUDER than it did when it worked.
//
// So the rung declares what each page must have DELIVERED, and refuses a page that delivered less,
// even when `capture.mjs` itself was satisfied.
//
// ⚠ WHY THESE NUMBERS ARE HAND-AUTHORED AND THAT IS NOT THE "PICKED NUMBER" FAULT. There is a real
// rule in this harness that a threshold is read off a control in the same run and never chosen
// (`colour-spread.ts`'s bar, `frame-budget.ts`'s control arm). It governs MEASUREMENTS OF THE ART,
// and none of these are that. These are COVERAGE floors: they say how much the instrument must have
// been ASKED, not what the answer must be. Deriving them from the run would be the actual fault —
// it is `prop-presence.ts`'s reason for a hand-authored manifest, stated there at length: "a
// manifest derived from `buildDressing` would stop expecting a wall at the same moment the wall
// stopped being built." A coverage floor computed from the page it audits cannot ever notice the
// page shrinking. Each figure below is therefore STRUCTURAL — what the page is built to contain —
// and never a measured value with a margin shaved off it.

/** What one page in the rung's set is there to prove, and the floor it must clear to have proved it. */
export interface PageCoverage {
  /** The harness page, relative to the vite root. */
  readonly page: string;
  /** Why this page is in the set at all — the half of ADR-0418 D4 it carries. */
  readonly why: string;
  /**
   * Continuous canvases the colour-spread band must have JUDGED (ADR-0418 D4 part 2).
   * Zero is legitimate and means "this page carries no continuous surface" — the declaration-level
   * check below is what stops every page declaring zero.
   */
  readonly minContinuousChecked: number;
  /** Islands whose declared props must have been verified present (ADR-0418 D4 part 1). */
  readonly minPropIslands: number;
  /**
   * Opaque pixels that must still have been HELD TO THE PALETTE CLOSURE — page total minus whatever
   * a `continuous` declaration exempted.
   *
   * ⚠ THIS IS THE ONE THAT CLOSES A HOLE `capture.mjs` DOES NOT COVER. The exemption is granted by
   * declaration, and `colour-spread.ts`'s manifest is the only thing that grants it — which is
   * exactly right, and is proved by PR #1673's mutation M4. But nothing downstream puts a FLOOR on
   * what is left over. Flip every declaration on a page to `continuous` and the palette refusal has
   * no pixels left to refuse: `capture.mjs` prints "PALETTE CLOSED ON THE GPU (…N px exempt by
   * declaration)" and exits 0, having closed a palette over nothing. This floor is what makes that
   * a red.
   */
  readonly minPaletteHeldPixels: number;
}

/**
 * THE PAGES THE ART RUNG DRIVES.
 *
 * Deliberately not "every page in the harness". Several pages are owned by their own bespoke
 * measure script and are undeclared in `colour-spread.ts`'s manifest ON PURPOSE — `cover.html` is
 * the recorded example, where pointing `capture.mjs` at it correctly refuses with "declare these
 * first". Adding a page here without a manifest entry turns the rung red for a reason that has
 * nothing to do with the art.
 */
export const LAND_ART_PAGES: readonly PageCoverage[] = [
  {
    page: 'grain.html',
    why:
      "the ONLY page carrying continuously-shaded canvases, so the only one on which ADR-0418 D4's " +
      'replacement band bites at all. Four continuous panels, each against its own banded control.',
    minContinuousChecked: 4,
    minPropIslands: 0,
    // The four `none` controls are banded and stay under the closure. Structural: the page is built
    // as four continuous panels beside four banded ones, so roughly half its pixels are held.
    minPaletteHeldPixels: 1_000_000,
  },
  {
    page: 'island.html',
    why:
      'the dressed islands at delivered size — the largest banded surface in the harness, and where ' +
      "the per-prop non-vacuity floor (ADR-0418 D4 part 1) has the most to check.",
    minContinuousChecked: 0,
    minPropIslands: 7,
    minPaletteHeldPixels: 10_000_000,
  },
  {
    page: 'directions.html',
    why:
      'the land-direction comparison strip — a second, independent set of prop declarations, so a ' +
      "single page's manifest going stale cannot take the whole prop half of the rung with it.",
    minContinuousChecked: 0,
    minPropIslands: 10,
    minPaletteHeldPixels: 500_000,
  },
];

/** A coverage shortfall, named so the rung can print which half stopped being audited. */
export interface CoverageFault {
  readonly page: string;
  readonly dimension: 'continuous' | 'props' | 'palette-held';
  readonly declared: number;
  readonly delivered: number;
  readonly detail: string;
}

/** The subset of `capture-report.json` this module reads. Narrow on purpose — see `readCoverage`. */
export interface CaptureCoverage {
  readonly opaquePixels: number;
  readonly exemptFromPaletteOpaquePixels: number;
  readonly continuousChecked: number;
  readonly propIslandsWithProps: number;
}

/**
 * Pull the four coverage figures out of a parsed `capture-report.json`.
 *
 * ⚠ IT THROWS ON A MISSING FIELD RATHER THAN DEFAULTING TO ZERO, AND THAT DIRECTION IS THE WHOLE
 * POINT. A `?? 0` here would mean that renaming a report field — which is an ordinary refactor
 * nobody would think to check — silently turns every delivered figure into 0. That reds the rung
 * rather than greening it, so it is the safe direction... except for `exemptFromPaletteOpaquePixels`,
 * where 0 is the GENEROUS reading and would hide the exemption hole above. Both are handled by
 * refusing to guess: if the report does not carry the field, the rung cannot make its claim and says
 * so, instead of making a weaker claim in the same words.
 */
export function readCoverage(report: unknown): CaptureCoverage {
  const r = report as Record<string, Record<string, unknown>> | null;
  if (!r || typeof r !== 'object') throw new Error('capture report is not an object');

  const num = (path: string, v: unknown): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(
        `capture report has no numeric \`${path}\` — the rung reads coverage from that field, so ` +
          'it cannot state what was audited. If the report shape moved, move this reader with it; ' +
          'do not default it, or the rung starts asserting over nothing.',
      );
    }
    return v;
  };

  return {
    opaquePixels: num('palette.opaquePixels', r['palette']?.['opaquePixels']),
    exemptFromPaletteOpaquePixels: num(
      'colourSpread.exemptFromPaletteOpaquePixels',
      r['colourSpread']?.['exemptFromPaletteOpaquePixels'],
    ),
    continuousChecked: num('colourSpread.continuousChecked', r['colourSpread']?.['continuousChecked']),
    propIslandsWithProps: num('propPresence.islandsWithProps', r['propPresence']?.['islandsWithProps']),
  };
}

/** Did this page deliver the coverage it is declared to prove? */
export function checkPageCoverage(
  declared: PageCoverage,
  delivered: CaptureCoverage,
): readonly CoverageFault[] {
  const faults: CoverageFault[] = [];

  if (delivered.continuousChecked < declared.minContinuousChecked) {
    faults.push({
      page: declared.page,
      dimension: 'continuous',
      declared: declared.minContinuousChecked,
      delivered: delivered.continuousChecked,
      detail:
        'the colour-spread band judged fewer continuous canvases than this page is built to carry. ' +
        "ADR-0418 D4's replacement did not run on what it was pointed at.",
    });
  }

  if (delivered.propIslandsWithProps < declared.minPropIslands) {
    faults.push({
      page: declared.page,
      dimension: 'props',
      declared: declared.minPropIslands,
      delivered: delivered.propIslandsWithProps,
      detail:
        'fewer islands had their declared props verified than this page is built to carry. A tag ' +
        'that stopped resolving reduces this without moving any exit code.',
    });
  }

  const held = delivered.opaquePixels - delivered.exemptFromPaletteOpaquePixels;
  if (held < declared.minPaletteHeldPixels) {
    faults.push({
      page: declared.page,
      dimension: 'palette-held',
      declared: declared.minPaletteHeldPixels,
      delivered: held,
      detail:
        `${delivered.exemptFromPaletteOpaquePixels} of ${delivered.opaquePixels} opaque px were ` +
        'exempted from the palette closure by declaration, leaving too few for the closure to be a ' +
        'claim about this page. A palette closed over nothing is the most on-palette result there is.',
    });
  }

  return faults;
}

/** A gap in the declared SET itself — a half of ADR-0418 D4 that no page in the rung proves. */
export interface DeclarationFault {
  readonly half: string;
  readonly detail: string;
}

/**
 * THE INSTRUMENT'S OWN COVERAGE, one level up — and this is the check that a rung like this one
 * usually lacks.
 *
 * Every fault above is a page failing to deliver what it declared. None of them fires if the
 * DECLARATION is the thing that shrank. Delete `grain.html` from the set and the remaining two pages
 * pass perfectly, the rung goes green, and nothing anywhere audits a continuously-shaded surface
 * again — which is the entire half of ADR-0418 D4 that the lifted fence made necessary in the first
 * place. `capture.mjs`'s author met the same trap one level down and wrote the same guard
 * (`ST_EXPECT_PROP_CANVASES`, "if the page's tags stopped resolving … the run would go green having
 * verified nothing about any prop").
 *
 * So the set is held to the three parts ADR-0418 D4 names. This is checkable without a browser, so
 * it is unit-tested rather than only mutation-tested.
 */
export function checkDeclarationCoverage(
  pages: readonly PageCoverage[] = LAND_ART_PAGES,
): readonly DeclarationFault[] {
  const faults: DeclarationFault[] = [];

  if (pages.length === 0) {
    return [{ half: 'all', detail: 'the rung declares no pages at all, so it audits nothing.' }];
  }

  if (!pages.some((p) => p.minContinuousChecked > 0)) {
    faults.push({
      half: 'ADR-0418 D4 part 2 — the colour-spread band',
      detail:
        'no page in the set is declared to carry a continuous canvas, so the band that REPLACED the ' +
        'lifted palette fence would judge nothing on any run. This is the half that only exists ' +
        'because ADR-0418 D3 lifted fence 3; a set without it has quietly returned to the state the ' +
        'ADR refused to leave behind.',
    });
  }

  if (!pages.some((p) => p.minPropIslands > 0)) {
    faults.push({
      half: 'ADR-0418 D4 part 1 — per-prop non-vacuity',
      detail:
        'no page in the set is declared to verify a prop, so a prop that stopped drawing entirely ' +
        'would pass. Both opaque floors are blind to it — props are drawn over ground that is ' +
        'already opaque, measured, not assumed.',
    });
  }

  const totalHeld = pages.reduce((s, p) => s + p.minPaletteHeldPixels, 0);
  if (totalHeld < 1_000_000) {
    faults.push({
      half: 'the palette closure',
      detail:
        `the set declares only ${totalHeld} px held to the authored closure across every page. The ` +
        'closure is the check ADR-0418 D2/D3 lifted on continuous surfaces ONLY; it still binds ' +
        'everywhere else and a set this small has stopped asserting it.',
    });
  }

  return faults;
}
