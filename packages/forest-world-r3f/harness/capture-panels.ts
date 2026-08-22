// capture-panels.ts — decides WHICH section becomes WHICH evidence file, by authored
// identity rather than by position on the page.
//
// THE DEFECT THIS REPLACES, because it is the reason the module exists at all. `capture.mjs`
// used to zip `ST_PANEL_NAMES` against `page.$$('section')` by index:
//
//     for (let i = 0; i < sections.length && i < names.length; i++)
//       await sections[i].screenshot({ path: `panel-${names[i]}.png` });
//
// So inserting a section ANYWHERE above the ones being photographed silently re-pointed every
// later filename at a different picture, and the run still exited 0 and still printed PALETTE
// CLOSED. Measured on the chapter2 island page 2026-08-20: after four sections were added for
// the land's definition, `ST_PANEL_NAMES=defn,delivered-defn` wrote `panel-defn.png` holding
// section 1 (the sprite/live pair) and `panel-delivered-defn.png` holding section 2 (the zoom
// ladder) — neither of the two sections those names describe (friction
// `capture-panel-names-bind-to-section-order`).
//
// WHY THAT IS WORSE THAN A CRASH. This arc's whole currency is evidence pictures filed under
// names a README then cites, so a misfiled panel is a picture arguing for a claim it does not
// show — the arc has already had to correct five instrument errors of the shape "the
// measurement was right about the WRONG OBJECT", and this one arrives without any signal at
// all. The repair is the same one the tagged-canvas screenshots already use one block further
// down in `capture.mjs`: the name travels WITH the element that carries it, so the page can be
// reordered, extended or cut and every existing filename still names the same picture.
//
// EVERY DISAGREEMENT IS A REFUSAL, never a best effort. A requested panel that is not on the
// page, two sections claiming one id, a blank id, the same id asked for twice, or a page with
// nothing authored at all — each of those is a run that would otherwise produce a plausible,
// silently-wrong set of files, which is exactly the failure being removed. This module decides
// and returns the refusal; `capture.mjs` prints it and exits non-zero.
//
// It is pure, so it is provable under `node:test` without a browser. The DOM read that feeds
// it (`section.getAttribute('data-st-panel')`) is two lines in the driver.

/** The authored attribute a `<section>` carries to become capturable. */
export const PANEL_ID_ATTRIBUTE = 'data-st-panel';

/** One `<section>` as the page presents it, in document order. */
export interface PanelSection {
  /** Document-order index of this `<section>` among the page's sections. */
  readonly index: number;
  /**
   * The section's authored `data-st-panel`. `null` when the attribute is ABSENT — such a
   * section is simply not capturable and is skipped without complaint. An attribute that is
   * PRESENT but blank is a different thing (an authoring mistake) and is refused.
   */
  readonly id: string | null;
}

/** One resolved capture: which section is photographed, under which file name. */
export interface PanelCapture {
  /** Document-order index of the `<section>` to photograph. */
  readonly index: number;
  /** The authored id that named it. */
  readonly id: string;
  /** The evidence file, relative to the run's output directory. */
  readonly file: string;
}

export type PanelPlan =
  | { readonly ok: true; readonly captures: readonly PanelCapture[] }
  | { readonly ok: false; readonly refusal: string };

/** The one place the evidence file name is formed, so a test can pin its shape. */
export function panelFileName(id: string): string {
  return `panel-${id}.png`;
}

/**
 * Parse `ST_PANEL_NAMES` into a request.
 *
 * UNSET means "every authored panel on the page", which is the shape that cannot go stale: a
 * page that gains a section gains its picture, and no operator has to remember to extend a
 * comma list. An explicit empty string is NOT read as unset — it is a request naming nothing,
 * and it is refused downstream rather than quietly capturing everything.
 */
export function parseRequestedPanels(raw: string | undefined): readonly string[] | null {
  if (raw === undefined) return null;
  return raw.split(',');
}

/**
 * Resolve the sections on the page against the request.
 *
 * @param sections every `<section>` on the page, in document order.
 * @param requested the ids asked for, or `null` for "every authored panel".
 */
export function planPanelCaptures(
  sections: readonly PanelSection[],
  requested: readonly string[] | null,
): PanelPlan {
  // --- what the PAGE offers ---------------------------------------------------------------
  const byId = new Map<string, PanelSection>();
  for (const section of sections) {
    if (section.id === null) continue;
    const id = section.id.trim();
    if (id === '') {
      return {
        ok: false,
        refusal:
          `section ${section.index} carries an empty ${PANEL_ID_ATTRIBUTE} — a blank id names ` +
          `no file, so it is an authoring mistake rather than an opt-out (omit the attribute ` +
          `entirely for a section that should not be photographed)`,
      };
    }
    const clash = byId.get(id);
    if (clash !== undefined) {
      // Two sections with one id would have the second file silently overwrite the first —
      // the same class of error as the positional names, arriving by a different route.
      return {
        ok: false,
        refusal:
          `sections ${clash.index} and ${section.index} both carry ` +
          `${PANEL_ID_ATTRIBUTE}=${JSON.stringify(id)} — one picture would silently overwrite ` +
          `the other`,
      };
    }
    byId.set(id, { index: section.index, id });
  }

  const available = [...byId.keys()];
  if (available.length === 0) {
    return {
      ok: false,
      refusal:
        `this page has ${sections.length} <section> element(s) and none carries a ` +
        `${PANEL_ID_ATTRIBUTE} — panel names bind to authored identity now, so an unlabelled ` +
        `page captures nothing rather than capturing the wrong things`,
    };
  }

  // --- what was ASKED for -----------------------------------------------------------------
  if (requested === null) {
    // Document order, so a contact sheet of the files reads down the page.
    const captures = [...byId.values()]
      .sort((a, b) => a.index - b.index)
      .map((s) => ({ index: s.index, id: s.id as string, file: panelFileName(s.id as string) }));
    return { ok: true, captures };
  }

  const seen = new Set<string>();
  const captures: PanelCapture[] = [];
  for (let i = 0; i < requested.length; i++) {
    const id = (requested[i] ?? '').trim();
    if (id === '') {
      return {
        ok: false,
        refusal:
          `requested panel ${i + 1} of ${requested.length} is blank — an empty entry in ` +
          `ST_PANEL_NAMES is a typo (a stray comma), not a request`,
      };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        refusal: `panel ${JSON.stringify(id)} was requested twice — the second capture would ` +
          `overwrite the first, so one of them is a mistake`,
      };
    }
    const section = byId.get(id);
    if (section === undefined) {
      return {
        ok: false,
        refusal:
          `no section on this page carries ${PANEL_ID_ATTRIBUTE}=${JSON.stringify(id)} — ` +
          `available: ${available.map((a) => JSON.stringify(a)).join(', ')}`,
      };
    }
    seen.add(id);
    captures.push({ index: section.index, id, file: panelFileName(id) });
  }
  return { ok: true, captures };
}
