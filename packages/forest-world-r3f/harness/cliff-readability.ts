// cliff-readability.ts — HOW MUCH OF THE CLIFF A READER CAN TELL FROM THE SEA.
//
// THE OWNER'S OWN METRIC, made an instrument. When PR #1792 shipped the shaded rock he did not
// read an anchor or a STRUCT; he looked at the frame and said the cliff "looks thinner", and
// sampling a vertical line through it confirmed him: 18 px of cliff band, 6 of them tellable from
// the water. Every statistic the skirt page carried had missed it, and one of them (the island's
// dark ANCHOR) had rewarded it, because it excludes the background and therefore scores a surface
// better the closer it gets to vanishing (`a-metric-scored-in-isolation-rewards-invisibility`).
//
// THIS MODULE ASKS THE QUESTION THOSE COULD NOT: of the pixels an arm's cliff occupies, how many
// does a reader see against the sea? A pixel is CLIFF when it differs from the arm's own control
// frame at all (the same touched-mask `SkirtRunner.cliffPixels` reports), and it is READABLE when
// its largest channel differs from the sea by more than ADR-0490 D6's bar — the one number this
// repo already credits a reader with seeing. The APPARENT HEIGHT is the per-column median of
// readable cliff pixels, which is the measurement the owner took by hand.
//
// ⚠ PURE AND BROWSER-FREE ON PURPOSE. It reads two RGBA buffers and returns numbers, so it is
// held by `cliff-readability.test.ts` under node with synthetic frames, and the runner merely
// hands it the frames it already captures. A reading that lived inside the renderer could not be
// red-green'd, and a metric nobody can make fail is the class of fault this arc keeps meeting.

import { VISIBLE_DELTA, channelMove, type Frame } from './visible-delta.js';
import type { Rgb255 } from '../src/shade-ladder.js';

export interface CliffReadability {
  /** Pixels this arm's cliff occupies — every pixel that differs from the control frame at all. */
  cliffPixels: number;
  /** Of those, the pixels whose largest channel sits more than `bar` from the sea. */
  readablePixels: number;
  /** `readablePixels / cliffPixels`; 0 when there is no cliff, never NaN. */
  readableFraction: number;
  /** Columns holding at least one cliff pixel — the cliff's width across the frame. */
  columns: number;
  /** The LOWER median, over those columns, of cliff pixels per column: the band's height in px. */
  medianBand: number;
  /** The LOWER median, over those columns, of READABLE cliff pixels per column — the apparent
   *  height, i.e. the number the owner sampled by hand (18 → 6 on the sunk rock). */
  medianReadable: number;
}

/** The lower median of a non-empty list; 0 for an empty one. Lower rather than averaged so the
 *  answer is always a count some column actually has. */
export function lowerMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** The largest single-channel distance between the pixel at byte offset `i` and the sea. */
export function seaMove(frame: Frame, i: number, sea: Rgb255): number {
  return Math.max(
    Math.abs(frame[i]! - sea.r),
    Math.abs(frame[i + 1]! - sea.g),
    Math.abs(frame[i + 2]! - sea.b),
  );
}

/**
 * Walk every column of an arm's frame against its control's, and count what a reader can see.
 *
 * @param arm the arm's RGBA frame
 * @param control the frame of the arm's own denominator (`ARM_CONTROL[arm]`), same size
 * @param w frame width in px; `h` follows from the buffer length
 * @param sea the scene background as the framebuffer holds it
 * @param bar the largest-channel move a reader is credited with seeing (ADR-0490 D6)
 */
export function cliffReadability(
  arm: Frame,
  control: Frame,
  w: number,
  sea: Rgb255,
  bar: number = VISIBLE_DELTA,
): CliffReadability {
  if (arm.length !== control.length) {
    throw new Error(`cliff-readability: the arm holds ${arm.length} bytes and its control ${control.length}`);
  }
  if (w <= 0 || arm.length % (w * 4) !== 0) {
    throw new Error(`cliff-readability: ${arm.length} bytes is not a whole number of rows ${w} px wide`);
  }
  const h = arm.length / (w * 4);
  const bandByColumn: number[] = [];
  const readableByColumn: number[] = [];
  let cliffPixels = 0;
  let readablePixels = 0;
  for (let x = 0; x < w; x += 1) {
    let band = 0;
    let readable = 0;
    for (let y = 0; y < h; y += 1) {
      const i = (y * w + x) * 4;
      if (channelMove(arm, control, i) === 0) continue;
      band += 1;
      if (seaMove(arm, i, sea) > bar) readable += 1;
    }
    if (band === 0) continue;
    bandByColumn.push(band);
    readableByColumn.push(readable);
    cliffPixels += band;
    readablePixels += readable;
  }
  return {
    cliffPixels,
    readablePixels,
    readableFraction: cliffPixels === 0 ? 0 : readablePixels / cliffPixels,
    columns: bandByColumn.length,
    medianBand: lowerMedian(bandByColumn),
    medianReadable: lowerMedian(readableByColumn),
  };
}
