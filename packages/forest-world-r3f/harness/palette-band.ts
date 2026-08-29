// palette-band.ts — the LOCKED-PALETTE SHADER CONTRACT (chapter2 live-render experiment,
// ADR-0380 D6 fence 3). Pure, browser-free, node:test-provable.
//
// WHAT STAYS IN `harness/` IS THE VOCABULARY, AND THAT IS A SCOPE DECISION, NOT A FILING
// ACCIDENT. `packages/forest-world-r3f/src` is MIRRORED into the public website repo by
// `pnpm sync:web-engine`, which copies every non-test file it finds and offers no way to
// exclude one. The tokens below are the EXPERIMENT's vocabulary — its props, its flowers, its
// ground covers — and nothing about them ships, so they stay outside the synced tree. The
// LADDER did ship, on 2026-08-30, and moving it into `src/` was part of that adoption; see the
// bridge below.
//
// THE QUESTION THIS ANSWERS. ADR-0380 D6 reopened a live-rendered land, but only behind
// four binding fences, and the third is that a live render stays banded to the LOCKED
// PALETTE in the shader rather than shipping as a generic 3D render. The palette
// discipline is ADR-0214 §4 (NOT ADR-0145 — that mis-citation was repeated across this
// whole track and is corrected here and on the arc).
//
// THE CONSTRUCTION ITSELF — why the palette is a closure rather than a snap — is now stated
// where it lives, in `src/shade-ladder.ts`. What this file adds on top of it is the token
// vocabulary and the palette QUERIES built over that closure: `landTokens` (every token an
// island may wear), `landPalette` (the closed set `capture.mjs` refuses a pixel outside), and
// `statusFamilyOf` (which status a delivered colour reports, the foreign-status instrument).
//
// THE TOKENS ARE COPIES, NOT NEW ART. They are read from the same source the author-time
// track reads — the app's `.hex-territory.st-<status>` blocks in `apps/studio/src/index.css`,
// transcribed by `docs/research/chapter2-land-interior-fork-2026-08-15/compose.py`. ADR-0367
// D4 requires the land's render to pass through the island's EXISTING palette, so a live
// renderer inherits it exactly as the compositor does. If the app's tokens move, BOTH copies
// move — `pnpm check:palette-transcription` reads all three off disk and refuses a drift.

// ⚠⚠ THE LADDER HAS CROSSED — IT IS `src/shade-ladder.ts` NOW, AND THIS FILE RE-EXPORTS IT.
//
// Everything the shipped map's ground needs to quantise its lighting — `SHADE_LEVELS`,
// `LIGHT_DIRECTION`, `bandShade` / `bandLevelIndex` / `deliveredForLevel` / `tokenRamp`, the
// `SHADE_KEYS` mix and `bandGlsl` — moved into `src/` on 2026-08-30, when the owner's
// authorisation ("This looks better, stamp it", 2026-08-29) let the banded ladder onto
// `ForestWorldCanvas`. It MOVED rather than being copied, and the twenty-odd importers below
// are untouched because this file re-exports it: the experiment and the product now quantise
// through one implementation by construction, which is the whole point of the
// `harness/scope-fence.test.ts` ADOPTED ledger.
//
// WHAT STAYED HERE, and why the split falls where it does: the experiment's VOCABULARY — which
// tokens exist, which family each belongs to, and the palette queries built over them. Those
// are claims about the harness island's props, flowers and covers, none of which ships. The
// ladder is arithmetic every surface shares; the vocabulary is not.
//
// ⚠ ONE CONSEQUENCE OF THE SPLIT, AND IT IS FENCED RATHER THAN TRUSTED. `SHADE_KEYS` is keyed on
// three PROP token hexes, and `PROP_TOKENS` stayed here — so the crossed copy carries those
// three hexes as literals. `palette-band.test.ts` asserts the keys are exactly
// `PROP_TOKENS.canopy` / `canopyDark` / `canopyRust`, so retuning a prop token cannot silently
// orphan its shade key and leave the canopy shading on `token x level` while a reader believes
// it rotates.
import {
  type Rgb255,
  paletteImageOfToken,
  toHex,
} from '../src/shade-ladder.js';

export {
  SHADE_KEYS,
  SHADE_KEY_FLOOR,
  SHADE_LEVELS,
  LIGHT_DIRECTION,
  rungOfNormal,
  parseHex,
  toHex,
  bandShade,
  bandedColour,
  deliveredForLevel,
  bandLevelIndex,
  tokenRamp,
  paletteImageOfToken,
  bandGlsl,
} from '../src/shade-ladder.js';
export type { Rgb255 } from '../src/shade-ladder.js';

/** ONE STATUS'S AUTHORED GROUND FAMILY: the three `top` variants a cell hash-picks between, the
 *  shared `wheat` override, and the `side` flank a wall face wears.
 *
 *  It is a NAMED contract rather than an inline shape because more than one binding is typed by
 *  it — `STATUS_TOKENS`'s values, the shared {@link YELLOW_FAMILY}, and every caller that passes
 *  an alternate token table (`shadow-ladder.ts`'s reader, `status-vocabulary.ts`'s frozen
 *  pre-ADR-0462 palette). Three anonymous copies of one shape is how they drift. */
export interface StatusFamily {
  top: readonly string[];
  wheat: string;
  side: string;
}

/**
 * THE YELLOW `proposed` AND `building` BOTH WEAR — ONE OBJECT, SHARED BY TWO KEYS.
 *
 * Owner-directed 2026-08-27, verbatim: *"if something is building just color it yellow because
 * its basicly the same as proposed, theres no value add, we can already see if wisps are working
 * on it or not."* The land stopped carrying a separate orange-gold for live work; the wisp is the
 * live-work signal and always was (ADR-0200 / ADR-0142 — a work claim IS the orbiting wisp).
 *
 * IT IS THE SAME OBJECT RATHER THAN TWO EQUAL LITERALS, and that is the whole point: "two states,
 * one token" is then a fact about the code that no later edit can half-apply. Two copies would
 * agree today and drift the first time somebody retuned one of them.
 */
const YELLOW_FAMILY: StatusFamily = {
  top: ['#d8c069', '#ccb258', '#e2cf7e'],
  wheat: '#d6b271',
  side: '#a8914a',
};

/** The per-status authored tokens. Verbatim from the app's `.hex-territory.st-<status>`
 *  blocks via chapter2-land-interior-fork-2026-08-15/compose.py `STATUS_TOKENS`. `top` is
 *  the three-variant ground family (`substrate.ts:237` hash-picks one per cell), `wheat`
 *  the override, `side` the wall/side-face family.
 *
 *  SIX STATES, FIVE COLOURS (ADR-0462). `proposed` and `building` share {@link YELLOW_FAMILY};
 *  the other four each own one. `status-vocabulary.ts` carries the mapping as data, the
 *  separation instrument, and the frozen pre-2026-08-27 table this one replaced. */
export const STATUS_TOKENS: ReadonlyMap<string, StatusFamily> = new Map([
  ["proposed", YELLOW_FAMILY],
  ["building", YELLOW_FAMILY],
  ["healthy", { top: ['#8cb85e', '#7dab50', '#9ac570'], wheat: '#d6b271', side: '#648244' }],
  // `mapped` is a TILLED CLAY, not the warm tan it was until 2026-08-28, and it was picked by a
  // stated rule rather than by eye: the MINIMAL move from the authored colour at which brown stops
  // being the vocabulary's weakest link — the tightest pair no longer involves brown at all. Not
  // "clears by N%", which is a margin nobody could justify. 29 of 7,337 candidates satisfy it and
  // this is the closest to what was already authored (hue -20, saturation x1.40, value x1.02;
  // moved 38.2 in the arc's own luma-weighted space). It removed the last two foreign colour reads
  // on the land — `proposed`'s two darkest lighting rungs had been reading as this family, unproven
  // greenfield as inherited brownfield — and took `SHADOW_RUNG` from 0.81 to 0.77 with it. The
  // search is `hue-frontier.ts`; the palette it searched is frozen as `ADR0462_STATUS_TOKENS`.
  ["mapped", { top: ['#b7684e', '#a95539', '#c1795e'], wheat: '#d6b271', side: '#883d24' }],
  ["unhealthy", { top: ['#57544a', '#4a473e', '#635f52'], wheat: '#6f6852', side: '#37352c' }],
  // `unknown` GAINED a colour here; it did not have one before. It used to fall through to the
  // base grass family, which is why it sat 3.33 from `healthy` — a parcel asserting NOTHING and
  // a parcel asserting a SIGNED PASS were the same colour to a reader, and two of its four lit
  // rungs read as `healthy` outright. The slate is not new art: `#9ca3af` is the app's own
  // `--crown-unknown-hi` and `#6b7280` its `--crown-unknown-lo` / `--st-unknown`, already drawn
  // for every unknown crown, tree-card strip and badge. The land now says what the rest of the
  // app already said. The two intermediate `top` variants are the family's own 0.93x / 1.07x
  // bounds, matching how the other families' variants are spaced.
  //
  // ⚠ THE FLANK IS `#70757e`, NOT THE APP'S `--st-unknown` `#6b7280`, AND THE ONE HEX OF
  // DIFFERENCE IS DELIBERATE. `#6b7280` is already a CROWN token here — it is what a `building`
  // story's tree falls through to (see {@link TREE_TOKENS}) as well as an `unknown` one's — so
  // handing it to the ground family as well would put one hex in two token sets and leave
  // `statusFamilyOf`'s first-match search naming `building` for four of `unknown`'s own rungs.
  // `#70757e` is the same slate at the flank ratio every other family uses (0.72x its own top,
  // against healthy's 0.71x), so it is kin to the crown exactly the way `mapped`'s `#85683f`
  // flank is kin to its `#7d5f3b` crown — near neighbours, never the same entry.
  ["unknown", { top: ['#9ca3af', '#9198a3', '#a7aebb'], wheat: '#d6b271', side: '#70757e' }],
]);

/** The STORY TREE's authored crown token, per status. Verbatim from the app's
 *  `.story-tree .crown-lo circle` rules — `--crown-<status>-lo` — with `--story-trunk` as the
 *  shared bole (see {@link SHARED_TOKENS}).
 *
 *  `--crown-<status>-hi` IS DELIBERATELY NOT TRANSCRIBED, and the reason is the difference
 *  between the two renderers rather than taste. The SVG crown is two overlapping circle sets:
 *  five `crown-lo` blobs and three lighter `crown-hi` blobs clustered up-and-left. The lighter
 *  fill is the flat surface STANDING IN for a light it does not have — it paints a highlight
 *  where a highlight would fall. A live crown has the light: `LIGHT_DIR` comes from up-left-
 *  forward, which is where those three blobs already sit, so the banded material lands them on
 *  a brighter rung on its own. Grow both lobe groups (their silhouette is authored and real),
 *  paint them one token, and the highlight is said ONCE.
 *
 *  The consequence for the palette is the reason this is written down rather than just done: an
 *  authored token the renderer can never emit would enlarge the closed palette with an entry
 *  nothing delivers, and a fence with unreachable entries reads as more coverage than it has. */
export const TREE_TOKENS: ReadonlyMap<string, { crown: string }> = new Map([
  ["proposed", { crown: '#b06a24' }],
  // `building` has NO `.story-tree.st-building` rule and no `--crown-building-*` pair in the
  // app, so a building story's tree falls through to the unset default, which is `unknown`.
  // Transcribed as what the app DELIVERS rather than as the amber the ground family would
  // suggest — inventing the missing pair here would put a colour on an island that the shipped
  // renderer never draws.
  //
  // ⚠ IT DID NOT MOVE WITH THE GROUND, AND THAT IS THE SAME RULE RATHER THAN AN EXCEPTION
  // (ADR-0462). The GROUND families merged because the app's `.hex-territory` blocks merged;
  // the crowns did not, because the app's `--crown-*` pairs did not. This file transcribes,
  // it does not harmonise — a `building` crown wearing `proposed`'s `#b06a24` here would be
  // this module authoring a colour the app has never drawn. The state is unreachable on the
  // shipped map either way: `worldStatus` folds `building` to `proposed` before anything is
  // stamped (ADR-0038), so no island has ever worn either crown.
  ["building", { crown: '#6b7280' }],
  ["healthy", { crown: '#2f6b3f' }],
  ["mapped", { crown: '#7d5f3b' }],
  ["unhealthy", { crown: '#9f2d22' }],
  ["unknown", { crown: '#6b7280' }],
]);

/** The UAT FLOWERS' authored tokens. Verbatim from the app's `--flower-*` custom properties,
 *  which `.tall-flower-stem/-leaf/-bud/-petal/-center` resolve against.
 *
 *  THEY CARRY NO STATUS AND THAT IS THE POINT (ADR-0226 D4). A flower's verdict is read from
 *  its FORM — a bloomed daisy is proven, a closed bud is pending, a wilted nodding head is
 *  failing — so the colour is a MATERIAL, not a channel. That is why they are their own record
 *  rather than a sixth field on {@link STATUS_TOKENS}, and why {@link statusFamilyOf} must go
 *  on reporting `null` for them: a flower colour genuinely belongs to no status family, and
 *  making one up would be the art asserting a state the work does not hold (ADR-0367 D5).
 *
 *  `--flower-glow-proven` is DELIBERATELY ABSENT. The glow is drawn at opacity 0.10/0.16 over
 *  whatever is behind it, and a blend of two entries is a colour on NEITHER — the one thing a
 *  closed palette cannot represent. It is dropped rather than approximated; the bloom says
 *  "proven" with its petals, which is what ADR-0226 D4 asked of it in the first place. */
export const MARKER_TOKENS = {
  stem: '#6f9257',
  leaf: '#7ea363',
  bud: '#7f9d5c',
  petalProven: '#fbf3e0',
  centreProven: '#eab94e',
  petalFailing: '#b9b3a7',
  centreFailing: '#8f8672',
} as const;

/** Authored tokens shared by EVERY status, so they discriminate none: the wheat override and
 *  the story tree's bole. They are palette entries like any other — {@link landPalette} closes
 *  over them — but they are excluded from {@link statusFamilyOf}'s family test, because a token
 *  every family carries can answer "which family is this" for none of them. */
export const SHARED_TOKENS = {
  wheat: '#d6b271',
  storyTrunk: '#6e533d',
} as const;

/**
 * THE PROP MATERIALS — stone, wood, fired clay, water, and the vegetation accents (ADR-0406).
 *
 * WHY THEY EXIST AT ALL, because it is a scope decision rather than a palette expansion for its
 * own sake. The arc counted its island against the owner's four references and found FOUR kinds
 * of object against eight to fifteen, and exactly ONE material — matte green — against stone AND
 * wood AND brick AND paving AND water. Every reference image reads as a place; ours reads as a
 * field. The gap the count names is CONTENT and MATERIALS, not rendering: the simplest reference
 * has no cast shadow, no ambient occlusion, no relief and no bevels, and still reads better than
 * an island carrying all three.
 *
 * WHY THEY ARE ALLOWED, which is the half a later reader will want. ADR-0406 D1: the harness
 * island REPRESENTS NOTHING. It asserts no capability's proof state and no UAT verdict, so there
 * is no state a decorative material can misreport and ADR-0367 D5 has nothing to bite on. That
 * licence is scoped to this surface — ADR-0406 D2 leaves the product map exactly as it was, and
 * the shipped half of `oq-may-the-island-carry-things-that-mean-nothing-and-may-veg` is still
 * open.
 *
 * WHY THIS DOES NOT BREACH THE LOCKED-PALETTE FENCE (ADR-0380 D6 fence 3, read by ADR-0406 D3).
 * The fence's property is that every delivered pixel is an authored `(token x level)` closure
 * entry — which is what lets `capture.mjs` REFUSE rather than merely report. That property is
 * indifferent to how many tokens the vocabulary holds; the shadow rung already grew the closure
 * by 39 entries inside it. So a prop material is added by AUTHORING ITS TOKEN and letting the
 * same banded shader select among the same authored ladder. What stays forbidden is unchanged:
 * free continuous shading, a gradient, a texture, a nearest-entry snap, or an exception in the
 * checker.
 *
 * ⚠ THEY ARE FAMILY-LESS BY CONSTRUCTION AND MUST STAY THAT WAY (ADR-0406 D4). A stone belongs
 * to no status, exactly as a flower's petal material belongs to none (ADR-0226 D4) — so they
 * join {@link familylessTokens}, and `prop-tokens.test.ts` asserts that NO delivered colour of
 * any prop token equals a delivered colour of any status family, on the shadow ladder as well as
 * the lit one. That test is the load-bearing one: a paving slab that delivered `healthy` green
 * would be an ornament indistinguishable from a status read, which is the one thing this licence
 * must not produce even on a surface that asserts nothing — because a human judges this island
 * and carries what he learns to the map.
 *
 * THE COLOURS ARE CHOSEN AGAINST THE REFERENCES, and the two rules behind them are worth stating
 * because they are what makes the set read as materials rather than as a swatch card. FIRST,
 * every one is well off the green/ochre/brown axis the status families occupy — stone is
 * deliberately COOL and desaturated, water is the only teal on the island, and the accents are
 * the reference's own pink/orange rather than a hue picked to be far away. SECOND, each material
 * that has a lit top and a shaded flank gets TWO tokens rather than relying on the ladder: at
 * `LIGHT_DIRECTION` every vertical face lands on rung 0 and every horizontal one on rung 2, so a
 * one-token wall delivers exactly two colours and reads as a silhouette. A separate `-Light`
 * coping or `-Dark` base is what gives built things their edge.
 */
export const PROP_TOKENS = {
  /** Wall coping and the sunlit top course — the lightest built colour on the island. */
  stoneLight: '#c9c2b4',
  /** The body of a dry-stone wall, a well drum, a step. Cool and desaturated on purpose. */
  stone: '#a29a8c',
  /** A wall's footing and the joints between blocks — the built palette's dark end. */
  stoneDark: '#6b675e',
  /** A laid slab. Warmer than `stone` so a path and a wall separate in the same picture. */
  paving: '#bdae97',
  /** Loose gravel and a raked court — a path that is a surface rather than a set of slabs. */
  gravel: '#cbbfa8',
  /** Sawn timber in shade: fence posts, a pergola's uprights, a bridge's deck. */
  wood: '#8b5e39',
  /** The same timber lit — rails, planks, a lit beam. */
  woodLight: '#c08b52',
  /** Fired clay: pots, planters, a chimney pot. The reference's warmest accent. */
  terracotta: '#c8714b',
  /** Roof tile — a deeper clay, so a roof reads as a roof rather than as a large pot. */
  roofTile: '#a94f38',
  /** Still water, lit. The only teal on the island; nothing else can be mistaken for it. */
  water: '#5eb0c4',
  /** Water in shadow, and the depth under a rim. */
  waterDeep: '#37788f',
  /** A shore apron — where the grass stops and the island's edge begins. */
  sand: '#e0d3ac',
  /** A lantern's lit pane. The brightest entry in the whole palette, used sparingly. */
  lantern: '#f5e2a4',
  /** A doorway, a window, the inside of an arch — a void rather than a surface. */
  doorway: '#3c3a47',
  /** A clipped hedge: a deeper, cooler green than any status family's vegetation. */
  hedge: '#4d7a45',
  /** Blossom. An accent colour, not a status (ADR-0406 D1 — this island represents nothing). */
  blossom: '#e493b0',
  /** Marigold — the orange the owner's well-garden reference scatters through its beds. */
  marigold: '#f0a03c',
  /** Thatch and dry reed, for a roof that is not tiled. */
  thatch: '#cba15c',
  /** A SMALL TREE's canopy — the ordinary green one, and the island's commonest object once
   *  the hero tree is gone. Deeper than any status ground family, so a grove reads as a mass
   *  standing ON the land rather than as a patch OF it. */
  canopy: '#5c9147',
  /** The second species in a mixed grove: a deeper, cooler tree. Two silhouettes in one grove
   *  is what the reference does; two COLOURS is not (see `SHADE_KEYS`). */
  canopyDark: '#3d6b3f',
  /** A warm-scheme canopy — the reference's autumn island recolours its trees rather than
   *  adding a species. ADR-0406 D1 makes a tree any colour on this surface. */
  canopyRust: '#a8622f',
} as const;

/** Every authored token an ISLAND may wear, deduped, in a stable order — the ground and wall
 *  families, the story tree's crowns and bole, and the UAT flowers' materials.
 *
 *  IT GREW WHEN THE ISLAND DID, AND THAT IS WHAT KEEPS THE FENCE A FENCE. The palette is the
 *  closure of (authored token x authored level), and `capture.mjs` refuses any delivered pixel
 *  outside it. An island that grows flowers and a tree therefore either declares their authored
 *  tokens here — same provenance, same transcription, same app CSS — or delivers colours the
 *  check has to be told to ignore. The first is a palette; the second is a palette with an
 *  exception, and an exception is how a closed palette stops being closed. */
export function landTokens(): string[] {
  const out: string[] = [];
  const push = (t: string): void => {
    if (!out.includes(t)) out.push(t);
  };
  for (const st of [...STATUS_TOKENS.keys()].sort()) {
    const fam = STATUS_TOKENS.get(st)!;
    for (const t of [...fam.top, fam.wheat, fam.side]) push(t);
  }
  for (const st of [...TREE_TOKENS.keys()].sort()) push(TREE_TOKENS.get(st)!.crown);
  for (const t of Object.values(SHARED_TOKENS)) push(t);
  for (const t of Object.values(MARKER_TOKENS)) push(t);
  // The prop materials close over the same ladder as everything else (ADR-0406 D3). They are
  // last so the pre-prop prefix of this list is unchanged, which is what lets the palette tests
  // assert a STRICT SUPERSET rather than a new set of the same size.
  for (const t of Object.values(PROP_TOKENS)) push(t);
  return out;
}

/** The tokens that belong to no single status: the shared overrides, every flower material, and
 *  every PROP material (ADR-0406 D4). {@link statusFamilyOf} reports `null` for their delivered
 *  colours BY DESIGN, so a caller auditing foreign-status reads needs this set to tell
 *  "family-less on purpose" from "in the palette and unaccounted for". Without it a wheat cell,
 *  a daisy petal or a paving slab reads as a defect — an instrument failing for a reason other
 *  than the one it names, which is a failure this track has paid for repeatedly. */
export function familylessTokens(): string[] {
  return [
    ...Object.values(SHARED_TOKENS),
    ...Object.values(MARKER_TOKENS),
    ...Object.values(PROP_TOKENS),
  ];
}

/** Every colour the family-less tokens can deliver — the set a foreign-status audit subtracts
 *  before asking {@link statusFamilyOf} anything. */
export function familylessPalette(): string[] {
  const set = new Set<string>();
  for (const token of familylessTokens()) {
    for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  }
  return [...set].sort();
}

/** The CLOSED palette a live-rendered land may emit: the full closure of
 *  (authored token x authored level), as `#rrggbb`, sorted. The count is the number the
 *  experiment reports against the shipped land-only 86 / dressed 132 entries. */
export function landPalette(): string[] {
  const set = new Set<string>();
  for (const token of landTokens()) {
    for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  }
  return [...set].sort();
}

/** Which authored status family a delivered colour belongs to, or `null` when it is not a
 *  palette entry at all. The FOREIGN-STATUS instrument: a live material is honest only if
 *  every pixel it draws for a `healthy` instance reports `healthy`.
 *
 *  `wheat` is deliberately EXCLUDED from the family test — it is one shared override token
 *  every status carries, so it belongs to all of them and can discriminate none. Including
 *  it would make the instrument report a collision on every island and read as a defect. */
export function statusFamilyOf(colour: Rgb255): string | null {
  const hex = toHex(colour);
  for (const st of [...STATUS_TOKENS.keys()]) {
    const fam = STATUS_TOKENS.get(st)!;
    const tree = TREE_TOKENS.get(st);
    // The tree's crown IS status-bearing — `--crown-healthy-lo` says healthy as surely as the
    // ground does — so it joins the family test rather than sitting outside it. The BOLE does
    // not: `--story-trunk` is one shared brown every status wears, so it is family-less with the
    // wheat override (see `familylessTokens`).
    const tokens = tree ? [...fam.top, fam.side, tree.crown] : [...fam.top, fam.side];
    for (const token of tokens) {
      for (const c of paletteImageOfToken(token)) if (toHex(c) === hex) return st;
    }
  }
  return null;
}
