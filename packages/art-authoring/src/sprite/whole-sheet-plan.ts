// whole-sheet-plan — the PURE, dependency-free plan for a COHERENT studio map sprite sheet
// (sprite-art-sheets arc, wave 3). AUTHOR-TIME ONLY, but carries no node/network deps so it is
// unit-testable offline.
//
// THE PROBLEM this replaces. Wave-2 authored every sprite — and every per-status tree — as its OWN
// nano-banana call (see ./sprite-sheet-plan.ts `FULL_ROSTER`). With no seed and no cross-call memory the
// model cannot hold a shape or a palette steady between calls, so tree SHAPE drifts across statuses and
// objects drift in style — the known generative-consistency wall (ADR-0230 "cross-asset consistency is
// the known risk").
//
// THE FIX (this module's half). Author every MASTER object in ONE image on a neutral white field — one
// call, so the model holds one angle, one light, one palette across the whole roster. A downstream
// content-aware slicer (./blob-slice.ts) cuts the masters back out, and a crown-recolor (./crown-recolor.ts)
// derives the per-status trees from ONE master tree (status is a CODE recolour, not another generation).
// This module owns the DECLARATIVE inputs to that runner: the master roster + reading-order layout, the
// per-style palette clauses, and the one whole-sheet PROMPT.
//
// The OUTPUT files a run writes are byte-for-byte the same set wave-2 wrote (`tree-healthy`,
// `tree-unhealthy`, …, `conifer`, `cottage`, …), so the studio manifest contract is UNCHANGED — the
// manifest is still assembled by ./sprite-sheet-plan.ts `buildManifest` against `FULL_ROSTER` /
// `FULL_KEY_TO_FILE`. Only the GENERATION METHOD (one call + slice + recolour) is new.

/** One master object authored into the whole sheet, in reading order (the slicer assigns detected blobs
 *  to this array by position). `file` is the sliced-PNG basename; `subject` is the object's clause inside
 *  the one big prompt; `role` steers the runner:
 *   - `base-tree`  — the ONE authored tree; the runner hue-recolours its crown into every `tree:<status>`
 *                    PNG (./crown-recolor.ts). Its own slice is the healthy/base master.
 *   - `comparison` — authored only for the owner's look-pick (the withered unhealthy FORM); NOT wired into
 *                    the manifest — shown in the contact sheet beside the recoloured red-crown tree so the
 *                    owner can settle "red crown, same shape" vs "withered shape".
 *   - `object`     — a plain sliced sprite written straight to `${file}.png`. */
export interface MasterObject {
  file: string;
  subject: string;
  role: 'base-tree' | 'comparison' | 'object';
}

/** The master roster authored in ONE image, in the exact left-to-right / top-to-bottom order the prompt
 *  lays them out (a 2×5 grid — see {@link WHOLE_SHEET_COLS}). The base tree + the withered comparison lead
 *  so the two tree forms sit side by side; the structural heroes fill row 1; the small flora/flowers fill
 *  row 2. Everything the studio manifest needs is covered EXCEPT the per-status tree recolours, which the
 *  runner derives from the single `base-tree` master. */
export const WHOLE_SHEET_ROSTER: readonly MasterObject[] = [
  // Row 1 — the two tree forms + the structural heroes.
  {
    file: 'tree-healthy',
    role: 'base-tree',
    subject:
      'a broad round-canopy deciduous tree with a warm timber-brown trunk and a FULL, LUSH, uniformly GREEN leafy crown',
  },
  {
    file: 'tree-withered',
    role: 'comparison',
    subject:
      'the SAME broad deciduous tree but withered and dying — a sparse, half-bare crown of a few dry brown leaves clinging to exposed dark bare branches, the same warm timber-brown trunk',
  },
  {
    file: 'conifer',
    role: 'object',
    subject: 'a small pointed evergreen conifer pine in muted forest green',
  },
  {
    file: 'cottage',
    role: 'object',
    subject:
      'a little timber-plank cottage with a steep shingled roof, a small stone chimney, a round wooden door and one warm-lit window',
  },
  {
    file: 'gazebo',
    role: 'object',
    subject: 'a small open-sided timber garden gazebo with slender posts and a shingled hexagonal roof',
  },
  // Row 2 — the small flora + the three UAT flowers.
  {
    file: 'flora',
    role: 'object',
    subject: 'a small leafy green shrub tuft with a couple of tiny buds',
  },
  {
    file: 'flora-dead',
    role: 'object',
    subject: 'a small withered dry brown plant tuft with shrivelled leaves',
  },
  {
    file: 'flower-proven',
    role: 'object',
    subject:
      'a single tall slender wildflower stem topped with an open cream-petalled, gold-centred daisy bloom',
  },
  {
    file: 'flower-pending',
    role: 'object',
    subject: 'a single tall slender wildflower stem topped with a closed amber flower bud, not yet open',
  },
  {
    file: 'flower-failing',
    role: 'object',
    subject: 'a single tall slender wildflower stem with a wilting, drooping deep-red bloom',
  },
];

/** The grid width the prompt lays the roster out in (2 rows of 5). The slicer does NOT rely on this being
 *  a pixel-exact grid — it blob-detects actual positions and sorts into reading order — but the prompt
 *  asks for a tidy grid so the model draws the objects in a predictable order with clear gaps. */
export const WHOLE_SHEET_COLS = 5;

/** A named whole-sheet style: only the palette / light-quality clause varies between styles; the roster,
 *  the isometric angle, the layout and the white field are shared (so four sheets read as four palettes of
 *  ONE world). `name` is the sheet id (its `art-sheets/<name>/` folder + `artStyle` option value); `label`
 *  is the human-facing gear-panel name. */
export interface WholeSheetStyle {
  name: string;
  label: string;
  /** the palette / light-quality clause spliced into the one whole-sheet prompt. */
  styleClause: string;
}

/** The four candidate directions authored for the owner's look-pick (ADR-0070 stage 2). `storybook` is a
 *  clean one-go rebuild of the proven `cosy` anchor; the other three are distinct cohesive palettes of the
 *  same world. All four are authored default-off and land only on the owner's pick. */
export const WHOLE_SHEET_STYLES: readonly WholeSheetStyle[] = [
  {
    name: 'storybook',
    label: 'Storybook — warm (cosy rebuilt)',
    styleClause:
      'a warm muted storybook palette (sage greens, warm timber brown, soft terracotta and cream; low ' +
      'saturation, low contrast, NO cool greys), a gentle 3/4 isometric view at about 30 degrees, lit by ' +
      'one soft warm key light from the upper-left',
  },
  {
    name: 'daylight',
    label: 'Daylight — bright midday',
    styleClause:
      'a bright cheerful daytime storybook palette (clear fresh greens, warm sunlit timber, crisp clean ' +
      'colours with a little more saturation and gentle contrast under a bright midday sun), a gentle 3/4 ' +
      'isometric view at about 30 degrees, lit by strong warm sunlight from the upper-left',
  },
  {
    name: 'watercolor',
    label: 'Watercolour — soft washed',
    styleClause:
      'a soft hand-painted watercolour storybook style (gently washed pastel greens and earthy browns, ' +
      'delicate soft paper-textured edges, muted low-saturation tones, a light airy feel), a gentle 3/4 ' +
      'isometric view at about 30 degrees, lit by soft diffuse light from the upper-left',
  },
  {
    name: 'moonlit',
    label: 'Moonlit — cool evening',
    styleClause:
      'a cool moonlit-evening storybook palette (dusky slate-blue, deep indigo-teal shadows and muted ' +
      'violet, with a warm amber glow only from any lit window), a gentle 3/4 isometric view at about 30 ' +
      'degrees, lit by soft silvery moonlight from the upper-left',
  },
];

/** Look a whole-sheet style up by name (the runner's `--style` flag). */
export function wholeSheetStyle(name: string): WholeSheetStyle | undefined {
  return WHOLE_SHEET_STYLES.find((s) => s.name === name);
}

/**
 * Build the ONE whole-sheet prompt: every master object drawn on a single white field in a tidy grid,
 * evenly spaced with generous gaps (so the blob slicer can separate them), in a fixed reading order (so
 * the slicer can assign detected blobs to the roster by position), all at ONE isometric angle under ONE
 * key light in ONE palette. The white field is stated independently of the palette so the cutout stays
 * reliable across styles.
 */
export function wholeSheetPrompt(
  roster: readonly MasterObject[],
  styleClause: string,
  cols: number = WHOLE_SHEET_COLS,
): string {
  const numbered = roster.map((m, i) => `${i + 1}. ${m.subject}`).join('; ');
  return (
    `A single wide reference sheet of cosy storybook map objects, ALL drawn in ONE consistent style: ` +
    `${styleClause}. Arrange them in a neat grid of ${cols} columns, evenly spaced with GENEROUS empty ` +
    `white gaps between every object so that NO two objects touch or overlap. In this exact order, ` +
    `left-to-right then top-to-bottom: ${numbered}. Each object is a standalone hero asset, upright and ` +
    `centred in its own cell, drawn at the SAME 3/4 isometric angle and lit by the SAME key light from the ` +
    `upper-left, each with its own soft short contact shadow directly beneath it. Keep consistent relative ` +
    `scale (a tree is taller than a flower). Plain flat solid pure-white background — the background is ` +
    `pure white and is NOT part of the picture. No scene, no ground plane, no border, no frame, no text, ` +
    `no labels, no numbering, no watermark.`
  );
}
