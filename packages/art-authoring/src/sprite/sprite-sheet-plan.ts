// sprite-sheet-plan — the PURE, dependency-free plan for a studio map sprite sheet (sprite-art-sheets
// spike, wave 2). AUTHOR-TIME ONLY, but carries no node/network deps so it is unit-testable offline.
//
// A "sheet" is a `manifest.json` + a set of sprite images under `apps/studio/public/art-sheets/<name>/`
// (the contract `@storytree/forest-world`'s `sprite-sheet.ts` parses). This module holds the DECLARATIVE
// plan the generator runs against: which distinct IMAGES to author (`SpriteImageJob`), and the map of
// manifest KEYS (`${kind}:${status}` or `${kind}`) → image file. It also builds the per-sprite generation
// PROMPT (from the locked style bible, `docs/research/grounded-art-concept/style-bible.md`) and assembles
// the final `manifest.json` object once the runner has measured each cut-out image's box.
//
// Nano-banana emits no true alpha, so every prompt asks for the asset on a plain flat WHITE background;
// the runner cuts that background to transparent (see ./cutout.ts) and measures the trimmed box, from
// which the manifest's on-map display `w`/`h` are derived (height fixed per kind, width from the art's
// own aspect so nothing is distorted). Anchors are bottom-centre (0.5, 1) — the ground-contact pivot
// every studio factory already draws its wrapper transform onto.

/** One distinct image to author. `file` is the basename (no extension) written into the sheet folder;
 *  `object` + `variant` compose the subject clause of the prompt; `targetHeight` is the on-map display
 *  height (SVG units) the manifest box uses for every key that points at this image. */
export interface SpriteImageJob {
  file: string;
  object: string;
  variant: string;
  targetHeight: number;
}

/** A named sheet plan: the images to author + the manifest key→file map + the sheet's human label and a
 *  per-sheet STYLE clause (the palette/light half of the prompt, so a warm sheet and a cool sheet share
 *  one subject roster but read differently). */
export interface SheetPlan {
  name: string;
  label: string;
  /** the palette/light clause spliced into every prompt (the visibly-different part between sheets). */
  styleClause: string;
  jobs: readonly SpriteImageJob[];
  /** manifest key (`tree:healthy`, `autumn-tree`, `flora:unhealthy`, …) → the `file` it renders. */
  keyToFile: Readonly<Record<string, string>>;
}

/** The measured, cut-out box of one authored image, in native pixels (post-trim). */
export interface MeasuredImage {
  file: string;
  pxWidth: number;
  pxHeight: number;
}

/** The warm cosy style clause — the locked style bible (sage greens, warm timber, terracotta, cream; no
 *  cool greys; one warm upper-left key light; gentle ~30° iso). */
export const COSY_STYLE_CLAUSE =
  "in a warm muted storybook style (sage greens, warm timber brown, soft terracotta and cream; " +
  'low saturation, low contrast, NO cool greys), a gentle 3/4 isometric view at about 30 degrees, ' +
  'lit by one soft warm key light from the upper-left with a soft short contact shadow beneath';

/** A deliberately DIFFERENT second style — a cool moonlit evening — to prove multi-sheet toggling with
 *  real art. The subject roster is the same; only palette/light change. */
export const EVENING_STYLE_CLAUSE =
  'in a cool moonlit-evening storybook style (dusky slate-blue, deep indigo-teal shadows and muted ' +
  'violet, with a warm amber glow only from any lit window), a gentle 3/4 isometric view at about 30 ' +
  'degrees, lit by soft silvery moonlight from the upper-left with a soft cool contact shadow beneath';

/**
 * Build the full generation prompt for one job under one style clause. The BACKGROUND is always a plain
 * flat pure-white field (independent of the sheet's palette) so the cutout stays reliable across styles.
 */
export function spritePrompt(job: SpriteImageJob, styleClause: string): string {
  const subject = job.variant ? `${job.object} ${job.variant}` : job.object;
  return (
    `A single cosy ${subject}, as a standalone hero asset ${styleClause}. ` +
    'Centred as one isolated object on a plain flat solid pure-white background — the background is ' +
    'pure white and is NOT part of the picture. No scene, no other objects, no ground plane, no border, ' +
    'no text, no watermark.'
  );
}

/** The exact manifest key roster the stub sheets ship (the sprite-sheet contract the studio mapper
 *  looks drawables up against). A real sheet's `keyToFile` must cover exactly these keys. */
export const STUB_SHEET_KEYS: readonly string[] = [
  'tree:healthy',
  'autumn-tree:healthy',
  'tree:unhealthy',
  'autumn-tree:unhealthy',
  'tree:proposed',
  'autumn-tree:proposed',
  'tree:mapped',
  'autumn-tree:mapped',
  'tree:unknown',
  'autumn-tree:unknown',
  'autumn-tree',
  'conifer',
  'flora',
  'flora:unhealthy',
  'tall-flower-proven',
  'tall-flower-pending',
  'tall-flower-failing',
  'cottage',
  'gazebo',
];

// ---------------------------------------------------------------------------
// The roster — the distinct images a FULL sheet authors.
// ---------------------------------------------------------------------------

const TREE_H = 70;
const CONIFER_H = 34;
const FLORA_H = 26;
const FLOWER_H = 30;
const COTTAGE_H = 52;
const GAZEBO_H = 50;

const TREE_BASE = 'broad round-canopy deciduous tree with a warm timber trunk';

/** The five per-status trees (ADR-0227 colourways) + conifer + living/dead flora + the three UAT
 *  flowers + the cottage and gazebo heroes — the full 13-image roster (autumn-tree keys reuse the tree
 *  images, exactly as the stubs do). */
export const FULL_ROSTER: readonly SpriteImageJob[] = [
  { file: 'tree-healthy', object: TREE_BASE, variant: 'with a full, lush green leafy crown', targetHeight: TREE_H },
  {
    file: 'tree-unhealthy',
    object: TREE_BASE,
    variant: 'with a sparse, half-bare crown of dry reddish-brown leaves and a few exposed branches',
    targetHeight: TREE_H,
  },
  { file: 'tree-proposed', object: TREE_BASE, variant: 'with a warm amber-gold autumn crown', targetHeight: TREE_H },
  { file: 'tree-mapped', object: TREE_BASE, variant: 'with a warm russet-brown crown', targetHeight: TREE_H },
  {
    file: 'tree-unknown',
    object: TREE_BASE,
    variant: 'with a muted, dusty grey-green crown (desaturated but still warm-toned, not lush)',
    targetHeight: TREE_H,
  },
  { file: 'conifer', object: 'small pointed evergreen conifer pine', variant: 'in muted forest green', targetHeight: CONIFER_H },
  { file: 'flora', object: 'small leafy green shrub tuft with a couple of tiny buds', variant: '', targetHeight: FLORA_H },
  { file: 'flora-dead', object: 'small withered dry brown plant tuft with shrivelled leaves', variant: '', targetHeight: FLORA_H },
  {
    file: 'flower-proven',
    object: 'single tall slender wildflower stem topped with an open cream-petalled, gold-centred daisy bloom',
    variant: '',
    targetHeight: FLOWER_H,
  },
  {
    file: 'flower-pending',
    object: 'single tall slender wildflower stem topped with a closed amber flower bud, not yet open',
    variant: '',
    targetHeight: FLOWER_H,
  },
  {
    file: 'flower-failing',
    object: 'single tall slender wildflower stem with a wilting, drooping deep-red bloom',
    variant: '',
    targetHeight: FLOWER_H,
  },
  {
    file: 'cottage',
    object:
      'little timber-plank cottage with a steep shingled roof, a small stone chimney, a round wooden door and one warm-lit window',
    variant: '',
    targetHeight: COTTAGE_H,
  },
  {
    file: 'gazebo',
    object: 'small open-sided timber garden gazebo with slender posts and a shingled hexagonal roof',
    variant: '',
    targetHeight: GAZEBO_H,
  },
];

/** The hero subset a SECOND sheet may cover (trees + cottage + gazebo + living flora) — everything else
 *  falls back to the vector body, which the sprite-sheet contract explicitly allows. */
export const HERO_ROSTER: readonly SpriteImageJob[] = FULL_ROSTER.filter((j) =>
  ['tree-healthy', 'tree-unhealthy', 'tree-proposed', 'tree-mapped', 'tree-unknown', 'flora', 'cottage', 'gazebo'].includes(
    j.file,
  ),
);

/** The full key→file map (covers exactly {@link STUB_SHEET_KEYS}). */
export const FULL_KEY_TO_FILE: Readonly<Record<string, string>> = {
  'tree:healthy': 'tree-healthy',
  'autumn-tree:healthy': 'tree-healthy',
  'autumn-tree': 'tree-healthy',
  'tree:unhealthy': 'tree-unhealthy',
  'autumn-tree:unhealthy': 'tree-unhealthy',
  'tree:proposed': 'tree-proposed',
  'autumn-tree:proposed': 'tree-proposed',
  'tree:mapped': 'tree-mapped',
  'autumn-tree:mapped': 'tree-mapped',
  'tree:unknown': 'tree-unknown',
  'autumn-tree:unknown': 'tree-unknown',
  conifer: 'conifer',
  flora: 'flora',
  'flora:unhealthy': 'flora-dead',
  'tall-flower-proven': 'flower-proven',
  'tall-flower-pending': 'flower-pending',
  'tall-flower-failing': 'flower-failing',
  cottage: 'cottage',
  gazebo: 'gazebo',
};

/** The hero-subset key→file map — only the keys the hero roster covers. */
export const HERO_KEY_TO_FILE: Readonly<Record<string, string>> = {
  'tree:healthy': 'tree-healthy',
  'autumn-tree:healthy': 'tree-healthy',
  'autumn-tree': 'tree-healthy',
  'tree:unhealthy': 'tree-unhealthy',
  'autumn-tree:unhealthy': 'tree-unhealthy',
  'tree:proposed': 'tree-proposed',
  'autumn-tree:proposed': 'tree-proposed',
  'tree:mapped': 'tree-mapped',
  'autumn-tree:mapped': 'tree-mapped',
  'tree:unknown': 'tree-unknown',
  'autumn-tree:unknown': 'tree-unknown',
  flora: 'flora',
  cottage: 'cottage',
  gazebo: 'gazebo',
};

/**
 * Assemble the final `manifest.json` object once every image has been cut out and measured. The on-map
 * display box is `h = the job's targetHeight`, `w = round(h * pxWidth / pxHeight)` — height fixed per
 * kind so the sheet's footprint matches the stubs, width from the art's own aspect so it is never
 * distorted. Anchors are bottom-centre. Throws if a keyed file was never measured (a plan/run mismatch).
 */
export function buildManifest(
  plan: SheetPlan,
  measured: readonly MeasuredImage[],
): { name: string; label: string; sprites: Record<string, { href: string; w: number; h: number; anchorX: number; anchorY: number }> } {
  const byFile = new Map(measured.map((m) => [m.file, m]));
  const jobByFile = new Map(plan.jobs.map((j) => [j.file, j]));
  const sprites: Record<string, { href: string; w: number; h: number; anchorX: number; anchorY: number }> = {};
  for (const [key, file] of Object.entries(plan.keyToFile)) {
    const m = byFile.get(file);
    const job = jobByFile.get(file);
    if (!m) throw new Error(`buildManifest: key "${key}" points at unmeasured file "${file}"`);
    if (!job) throw new Error(`buildManifest: key "${key}" points at file "${file}" with no job`);
    const h = job.targetHeight;
    const w = Math.max(1, Math.round((h * m.pxWidth) / m.pxHeight));
    sprites[key] = { href: `/art-sheets/${plan.name}/${file}.png`, w, h, anchorX: 0.5, anchorY: 1 };
  }
  return { name: plan.name, label: plan.label, sprites };
}

/** The two shipped wave-2 sheet plans. */
export const COSY_PLAN: SheetPlan = {
  name: 'cosy',
  label: 'Cosy — warm storybook',
  styleClause: COSY_STYLE_CLAUSE,
  jobs: FULL_ROSTER,
  keyToFile: FULL_KEY_TO_FILE,
};

export const EVENING_PLAN: SheetPlan = {
  name: 'evening',
  label: 'Evening — moonlit',
  styleClause: EVENING_STYLE_CLAUSE,
  jobs: HERO_ROSTER,
  keyToFile: HERO_KEY_TO_FILE,
};
