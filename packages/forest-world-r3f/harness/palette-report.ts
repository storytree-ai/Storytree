// palette-report.ts — the ONE declaration of what `palette.html` files on `window`, shared by the
// page that writes it and the driver that reads it.
//
// ⚠ IT IS A SHARED MODULE RATHER THAN TWO MATCHING DECLARATIONS ON PURPOSE, and the reason is the
// increment this file was written for: the whole defect being fixed here is a table transcribed
// into three places that nothing compared. A driver holding its own idea of the page's report
// shape is the same mistake one size down — it would keep compiling while the page moved under it,
// and the first sign would be a verdict computed from `undefined`.
//
// Two consequences worth knowing. The page ASSIGNS into `panels`, so the value type is not
// optional there; the driver READS by a computed tag, so it must treat a miss as a refusal — which
// is why the map's value type carries `| undefined` and `palette-measure.ts` funnels every read
// through one `panelOf()` that refuses. And the global augmentation lives HERE, so importing this
// module is what gives a file `window.__stPalette` at all.

/** One panel's own reading, taken inside the page off the projection matrix its GL context
 *  actually received — never a transcription of the camera. `projection-probe.ts` explains why
 *  that distinction is load-bearing: a formula copied from the camera it describes cannot fail
 *  when the camera drifts. */
export interface PanelReading {
  widthPx: number;
  heightPx: number;
  devicePixelRatio: number;
  /** Frames this panel is confirmed to have painted. Zero is a blank rectangle, which
   *  photographs beautifully and means nothing. */
  frames: number;
  /** Delivered pixels per ground unit at the framing target. */
  scaleAtTarget: number;
  scaleNear: number;
  scaleFar: number;
  projection: string;
  spreadPct: number;
}

/** The whole report, keyed by `<status>-<zoom>` panel tag. */
export interface PaletteReport {
  renderer: string;
  vendor: string;
  panels: Record<string, PanelReading | undefined>;
}

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
    __stPalette?: PaletteReport;
  }
}
