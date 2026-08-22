// prop-presence.ts — THE PRESENCE FLOOR. A prop that stops drawing must fail the run.
//
// WHY THIS EXISTS, STATED AS THE FAILURE IT CATCHES AND THE ONE IT DOES NOT REPLACE.
//
// `capture.mjs` already carries a non-vacuity guard, and it is a good one: every canvas must
// deliver at least a handful of OPAQUE pixels, because the failure it was written for — a
// browser silently losing the oldest of sixteen WebGL contexts — delivers precisely zero. That
// guard stays exactly as it is.
//
// It is also INVARIANT UNDER PROP DISAPPEARANCE, and that was measured rather than reasoned
// about (friction `opaque-pixel-floor-cannot-see-a-prop-that-stopped-drawing`): two capture runs
// either side of a real geometry change reported `opaque px : 11250412` — identical to the
// digit. Every prop on this island is drawn OVER ground that is already opaque, so a prop can
// change, shrink, or vanish entirely without moving the number the guard reads. Losing every
// flower, every wall or every tree on the island would still print `PALETTE CLOSED ON THE GPU`
// over a picture missing the thing the pass was about — the same shape as the arc's earlier
// six-blank-panels run, which reported a clean closure it had never tested.
//
// THE FIX IS A DIFFERENT QUESTION ASKED OF THE SAME PIXELS. Not "did this canvas deliver
// anything", but "did each thing this island is DECLARED to be built from deliver anything of
// its own". Because the palette is closed and every material is an authored token, a prop's
// presence is answerable exactly: the token's own delivered colours either appear in the
// histogram or they do not.
//
// ⚠ THE DECLARATION IS HAND-AUTHORED AND DELIBERATELY NOT DERIVED FROM `buildDressing`.
// This is the whole load-bearing design decision here, and getting it wrong would rebuild the
// vacuous green in a new place. If the expected-token list were read off the dressing's own
// output, then a generator that stopped emitting walls would also stop expecting them, the
// check would pass, and it would pass for exactly the reason it exists to catch. So
// {@link DRESSING_MUST_DELIVER} is written by hand, upstream of the generator: removing a prop
// from an island is then a VISIBLE two-place edit rather than a silent one-place regression.
//
// ⚠ AND THE EXPECTATION IS RESOLVED FROM THE CANVAS TAG HERE, NOT READ OFF THE PAGE. An earlier
// sketch had the page stamp its own expectation onto the element as a `data-` attribute, in the
// style of `data-st-tag`. That would have made the instrument blindable by the very layer it
// audits: a page that stopped rendering its props would very plausibly also stop stamping what
// it owed, and the run would go green having checked nothing. The tag is already load-bearing
// (it names the evidence files), and resolving through it keeps the declaration inside the
// capture's own module graph.
//
// COVERAGE IS TOTAL OVER BOTH EVIDENCE PAGES, and mechanically so. Two manifests —
// {@link DRESSING_MUST_DELIVER} for the dressed islands and `PANEL_MUST_DELIVER` for the
// flowers-and-tree page — between them declare every tagged canvas the harness draws, and
// `prop-presence.test.ts` reads the tags off the pages themselves and refuses any that resolves
// to nothing. Without that, adding a sixth island or renaming a tag would silently shrink what
// is checked while every test here stayed green, which is this module's own failure arriving one
// level up. At run time `ST_EXPECT_PROP_CANVASES` covers the same hole from the other side.

import {
  MARKER_TOKENS,
  PROP_TOKENS,
  SHARED_TOKENS,
  TREE_TOKENS,
  landTokens,
  toHex,
} from './palette-band.js';
import { shadowRamp } from './shadow-ladder.js';
import type { DressingName } from './island-dressing.js';

/** A name in {@link PROP_TOKENS} — the manifest names tokens rather than transcribing hexes, so
 *  a token whose colour is retuned cannot silently stop being the thing that was declared. */
export type PropTokenName = keyof typeof PROP_TOKENS;

/**
 * WHAT EACH DRESSING MUST PUT ON THE ISLAND, by authored token.
 *
 * Read this as the composition's own claim about itself: `walled` says it is a place with stone,
 * a laid path, timber, pots and trees, so an island tagged `walled` that delivers no stone is not
 * a walled garden however opaque its ground is.
 *
 * ⚠ EVERY ENTRY IS MEASURED, NOT ASPIRED TO — AND THE FIRST DRAFT OF THIS LIST WAS WRONG TWICE.
 * It is tempting to declare every token the generator emits. Two of those deliver ZERO pixels on
 * a correct picture at the 2 px per ground unit these islands are captured at: `walled` builds a
 * `stoneDark` wall footing that is entirely behind the wall body, and `shrine` builds `woodLight`
 * rails whose lit faces the 50-degree camera never sees. Declared, they would have refused an
 * island that is exactly right — the same mistake `capture.mjs`'s own floor comment records
 * making once, where "the floor was wrong, not the panels".
 *
 * The counts below are from a live capture of `directions.html` on 2026-08-22, and they are
 * written down so the MARGIN is visible rather than remembered. Every run records them again in
 * `capture-report.json` under `propPresence`, which is what makes "the wall is still drawing but
 * has shrunk to four pixels" a diff rather than a hunch.
 *
 * ⚠ IT IS A `Record<DressingName, ...>`, WHICH IS THE POINT. A sixth dressing cannot be added
 * without declaring what it must deliver — the compiler asks. A dressing that genuinely builds
 * nothing declares an empty list and says why, which is a decision on the record rather than an
 * omission.
 */
export const DRESSING_MUST_DELIVER: Readonly<Record<DressingName, readonly PropTokenName[]>> = {
  /** An enclosed plot: the containing wall and its coping, the paved ring, timber and pots, and
   *  the orchard quarters' trees.
   *  Delivered: stone 6270 · stoneLight 12765 · paving 12359 · wood 60 · woodLight 643 ·
   *  terracotta 996 · canopy 7457. `stoneDark` is built and delivers 0 — see the header. */
  walled: ['stone', 'stoneLight', 'paving', 'wood', 'woodLight', 'terracotta', 'canopy'],
  /** A place people live: cottages with tiled roofs and doorways, the gravel worn between them,
   *  fenced yards, the well, and shelter trees round the yards.
   *  Delivered: stone 2090 · stoneLight 710 · stoneDark 300 · gravel 1586 · roofTile 4163 ·
   *  doorway 10 · wood 144 · woodLight 846 · canopy 9100.
   *  ⚠ `doorway` is the thinnest declaration on the page at TEN pixels — three cottage doorways,
   *  three or four pixels each. It is kept because a hamlet without doorways is not a hamlet, and
   *  the number is recorded here so a future refusal on it is diagnosable rather than mysterious. */
  hamlet: ['stone', 'stoneLight', 'stoneDark', 'gravel', 'roofTile', 'doorway', 'wood', 'woodLight', 'canopy'],
  /** Worked ground: the retaining walls the parcel boundaries became, their steps, the stone
   *  water channel, and the trees kept off the terraces and at the margins.
   *  Delivered: stone 2497 · stoneLight 10365 · gravel 1922 · wood 117 · woodLight 1022 ·
   *  water 1416 · canopy 8398. */
  terrace: ['stone', 'stoneLight', 'gravel', 'wood', 'woodLight', 'water', 'canopy'],
  /** A monument, approached: the raised platform, the timber pavilion, the gate, the lanterns,
   *  the raked gravel court, and the avenue of the darker species.
   *  Delivered: stone 3293 · stoneLight 481 · stoneDark 21 · gravel 15900 · wood 240 ·
   *  lantern 37 · canopyDark 7422. `woodLight` is built and delivers 0 — see the header. */
  shrine: ['stone', 'stoneLight', 'stoneDark', 'gravel', 'wood', 'lantern', 'canopyDark'],
  /** Nothing built: the sand apron rounding the coast, rock outcrops, the stone-rimmed pool, the
   *  beached boat, and the thickets of the warm species.
   *  Delivered: stone 2529 · stoneLight 471 · stoneDark 122 · sand 17275 · water 445 · wood 75 ·
   *  woodLight 213 · canopyRust 14147. */
  wild: ['stone', 'stoneLight', 'stoneDark', 'sand', 'water', 'wood', 'woodLight', 'canopyRust'],
};

/**
 * The evidence page draws each dressing twice — once small in the choice row, once whole in its
 * own section — and tags the two `row-<name>` and `<name>`. Both are the same island and owe the
 * same props, so the prefix is stripped rather than the manifest duplicated.
 */
export const ROW_TAG_PREFIX = 'row-';

/** Tags that are on an evidence page, carry no dressing, and therefore owe nothing. Listed so
 *  that "this tag expects nothing" is a statement rather than the absence of one. */
const NO_PROPS_EXPECTED: readonly string[] = ['today', 'row-today'];

/**
 * THE OTHER EVIDENCE PAGE — `island.html`, the flowers-and-tree page, WHERE THE FRICTION WAS
 * ACTUALLY FOUND.
 *
 * This is not an extension for symmetry. The measurement that started all of this was taken here:
 * `FAILING_HEAD_TILT_DEG` was changed from 118 to 105, visibly re-posing every wilted flower head
 * on three panels, and the capture reported the same opaque total to the digit either side of it.
 * An instrument that covered the newer dressed-island page and not this one would close the
 * friction everywhere except where it was observed.
 *
 * WHAT THESE PANELS OWE. Every tagged canvas on that page draws the UAT flowers and the hero
 * story tree — `bare-lit` and `bare-shadow` set `plants={false}`, which removes the shrubs and
 * leaves both of these standing, which is the whole point of those two panels.
 *
 * ⚠ THE FAILING FLOWER MATERIALS AND `bud` ARE DELIBERATELY NOT DECLARED. The fixture's criteria
 * are all `proven` on the tagged panels, so a bud or a wilted head is legitimately absent from
 * them; declaring either would refuse a panel for being correct. A flower's verdict is its FORM
 * rather than its colour (ADR-0226 D4), so the presence of the PROVEN materials is what says the
 * flowers drew at all — which is the question this module asks.
 *
 * Measured on a live capture of `island.html`, 2026-08-22, at the two scales the page uses:
 *
 *                    stem  leaf  petal  centre   crown  trunk
 *   zoom-* (8 px)    2402  2403  16816    2432  227480   2711
 *   delivered (2 px)  151   149   1055     151   14231    172
 *
 * The delivered-size row is the thin one and it is the one that matters: about 150 pixels of
 * stem across ten flowers is what a real regression would take to zero.
 */
const PANEL_MUST_DELIVER: Readonly<Record<string, readonly string[]>> = (() => {
  // Every tagged panel on that page draws the same two components, so the list is written once
  // rather than transcribed seven times — a transcription is where six of seven quietly drift.
  const flowersAndTree: readonly string[] = [
    MARKER_TOKENS.stem,
    MARKER_TOKENS.leaf,
    MARKER_TOKENS.petalProven,
    MARKER_TOKENS.centreProven,
    TREE_TOKENS['healthy']!.crown,
    SHARED_TOKENS.storyTrunk,
  ];
  const tags = [
    'zoom-lit',
    'zoom-terrain',
    'zoom-shadow',
    'bare-lit',
    'bare-shadow',
    'delivered-lit',
    'delivered-shadow',
  ];
  return Object.fromEntries(tags.map((t) => [t, flowersAndTree]));
})();

/**
 * What the canvas carrying this tag must deliver, as authored token hexes — or `null` when the
 * tag names no island this module knows about, which is every tag on the other evidence page.
 *
 * `null` means UNCHECKED, and the capture reports its coverage for exactly that reason: a run
 * whose tags stopped resolving would otherwise check nothing and say nothing about it.
 */
export function expectedPropTokens(tag: string): readonly string[] | null {
  if (NO_PROPS_EXPECTED.includes(tag)) return [];
  const panel = PANEL_MUST_DELIVER[tag];
  if (panel) return panel;
  const name = (tag.startsWith(ROW_TAG_PREFIX) ? tag.slice(ROW_TAG_PREFIX.length) : tag) as DressingName;
  const names = DRESSING_MUST_DELIVER[name];
  if (!names) return null;
  return names.map((n) => PROP_TOKENS[n]);
}

/** Authored token hex to the name it was authored under — so a refusal reads `stem` or
 *  `crown:healthy`, not `#6f9257`. A verdict that names only a colour makes the reader go and
 *  look up which thing stopped drawing, which is exactly the ten minutes the friction behind this
 *  module recorded losing. */
function tokenNames(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(PROP_TOKENS)) out.set(v, k);
  for (const [k, v] of Object.entries(MARKER_TOKENS)) out.set(v, k);
  for (const [k, v] of Object.entries(SHARED_TOKENS)) out.set(v, k);
  for (const [status, fam] of Object.entries(TREE_TOKENS)) {
    // Several statuses share a crown colour (`building` falls through to `unknown`'s grey), so
    // the first name wins rather than the last — a stable label instead of an accident of order.
    if (!out.has(fam.crown)) out.set(fam.crown, `crown:${status}`);
  }
  return out;
}

const discriminating = new Map<string, string[]>();

/**
 * The colours that PROVE this token drew — its own delivered ramp, minus every colour any OTHER
 * authored token on the island can deliver.
 *
 * THE SUBTRACTION IS WHAT MAKES A COUNT MEAN SOMETHING. A presence floor read on colours a
 * token shares with the ground would be satisfied by the ground, which is precisely the failure
 * being repaired — one vacuous instrument replaced by a subtler one. Measured on the current
 * palette, all 21 prop tokens have all five of their delivered colours to themselves across the
 * 60 authored land tokens, so nothing is lost to the subtraction today; it is computed rather
 * than asserted so that the day a new token collides, the answer changes instead of the claim.
 */
export function discriminatingColours(
  token: string,
  /** The token universe to subtract from. Defaults to every token the island can wear. It is a
   *  parameter so the subtraction ITSELF is testable: the current palette has no collision to
   *  demonstrate it with, and a subtraction that has never removed anything is a line nobody has
   *  watched work. Only the default is memoised. */
  among?: readonly string[],
): string[] {
  const universe = among ?? landTokens();
  const hit = among === undefined ? discriminating.get(token) : undefined;
  if (hit) return hit;
  const others = new Set<string>();
  for (const t of universe) {
    if (t === token) continue;
    for (const c of shadowRamp(t)) others.add(toHex(c));
  }
  const own = [...new Set(shadowRamp(token).map(toHex))];
  const out = own.filter((h) => !others.has(h));
  if (among === undefined) discriminating.set(token, out);
  return out;
}

/** One canvas as the capture reads it back: its tag, how many opaque pixels it delivered, and its
 *  colour histogram. The shape `capture.mjs` already builds, narrowed to what this needs. */
export interface DeliveredCanvas {
  tag: string | null;
  opaque: number;
  colours: readonly (readonly [string, number])[];
}

/**
 * THE FLOOR, AND WHY IT IS ONE PIXEL.
 *
 * The failure this exists to catch delivers precisely ZERO — a prop that stopped being generated
 * contributes nothing at all, exactly as a lost WebGL context does. One pixel is therefore the
 * floor that catches it, and any number above one is a number chosen to make today's picture
 * pass. That is the mistake `capture.mjs`'s own floor comment records having made once already:
 * an earlier draft set the per-canvas floor at 20 and condemned four panels that were correct.
 *
 * Antialiasing cannot manufacture a false pixel here — the renderer is built with
 * `antialias: false` and only fully-opaque pixels are counted, so every counted pixel is a colour
 * the shader chose rather than one a compositor blended. The MARGIN is not left to trust either:
 * the per-token counts go into the report, so "the wall is still drawing but has become four
 * pixels" is a question a reader can answer from the evidence rather than a floor that has to
 * anticipate it.
 */
export const PROP_PRESENCE_FLOOR = 1;

export interface TokenPresence {
  /** The authored token hex. */
  token: string;
  /** Its name in {@link PROP_TOKENS}, when it has one — so a failure reads `stone`, not `#a29a8c`. */
  name: string | null;
  /** How many colours could have proved it. Zero means the declaration is unprovable. */
  provableBy: number;
  /** Delivered pixels on those colours. */
  deliveredPx: number;
  present: boolean;
}

export interface CanvasPresence {
  tag: string;
  opaque: number;
  tokens: TokenPresence[];
  /** Declared, provable, and delivered nothing — the finding. */
  missing: TokenPresence[];
  /** Declared but indistinguishable from something else on the island. The instrument refuses
   *  rather than reporting a presence it cannot actually see. */
  unprovable: string[];
  ok: boolean;
}

export interface PresenceReport {
  /** Canvases whose tag resolved to a declaration, empty declarations included. */
  checked: number;
  /**
   * Canvases that actually had a prop verified — a resolved declaration with something in it.
   *
   * THIS IS THE COVERAGE NUMBER, and it is separate from `checked` for a reason worth stating.
   * The control island declares nothing on purpose, so it resolves and contributes a verdict
   * without any prop having been examined. A coverage floor read against `checked` would
   * therefore be satisfied by two control panels, which is a floor that can be met by canvases
   * on which the instrument did nothing.
   */
  withProps: number;
  /** Tagged canvases whose tag resolved to nothing — reported so a run that stopped checking
   *  says so out loud. */
  unresolvedTags: string[];
  canvases: CanvasPresence[];
  failures: CanvasPresence[];
  floor: number;
  ok: boolean;
}

/**
 * Run the presence floor over a capture's readback.
 *
 * Canvases with no tag, and tagged canvases whose tag names no declaration, are passed over —
 * the opaque floor in `capture.mjs` still covers them. What this adds is a verdict for every
 * canvas that DID declare what it is made of.
 */
export function checkPropPresence(
  delivered: readonly DeliveredCanvas[],
  opts: {
    floor?: number;
    /** A TEST SEAM, in the same spirit as `clearDressingCache`, and it exists for the same
     *  reason: without it the `unprovable` branch below is unreachable from a test, because the
     *  current palette has no collision to reach it with. An instrument whose fail-closed branch
     *  has never been executed is a branch nobody knows works. Nothing in the capture passes it. */
    discriminatorsOf?: (token: string) => readonly string[];
  } = {},
): PresenceReport {
  const floor = opts.floor ?? PROP_PRESENCE_FLOOR;
  const discriminatorsOf = opts.discriminatorsOf ?? discriminatingColours;
  const nameOf = tokenNames();
  const canvases: CanvasPresence[] = [];
  const unresolvedTags: string[] = [];

  for (const c of delivered) {
    if (!c.tag) continue;
    const expect = expectedPropTokens(c.tag);
    if (expect === null) {
      unresolvedTags.push(c.tag);
      continue;
    }
    const counts = new Map(c.colours.map(([hex, n]) => [hex, n] as const));
    const tokens: TokenPresence[] = expect.map((token) => {
      const cols = discriminatorsOf(token);
      let px = 0;
      for (const hex of cols) px += counts.get(hex) ?? 0;
      return {
        token,
        name: nameOf.get(token) ?? null,
        provableBy: cols.length,
        deliveredPx: px,
        present: cols.length > 0 && px >= floor,
      };
    });
    const unprovable = tokens.filter((t) => t.provableBy === 0).map((t) => t.name ?? t.token);
    const missing = tokens.filter((t) => t.provableBy > 0 && !t.present);
    canvases.push({
      tag: c.tag,
      opaque: c.opaque,
      tokens,
      missing,
      unprovable,
      ok: missing.length === 0 && unprovable.length === 0,
    });
  }

  const failures = canvases.filter((c) => !c.ok);
  return {
    checked: canvases.length,
    withProps: canvases.filter((c) => c.tokens.length > 0).length,
    unresolvedTags,
    canvases,
    failures,
    floor,
    ok: failures.length === 0,
  };
}

/** The refusal message, built from the verdict so the run names the token and the island rather
 *  than reporting that something was wrong. */
export function describePresenceFailure(report: PresenceReport): string {
  const parts = report.failures.map((c) => {
    const gone = c.missing.map((t) => `${t.name ?? t.token} (${t.token})`).join(', ');
    const blind = c.unprovable.length ? `; indistinguishable: ${c.unprovable.join(', ')}` : '';
    return `${c.tag} delivered ${c.opaque} opaque px but nothing from ${gone}${blind}`;
  });
  return (
    `${report.failures.length} of ${report.checked} declared islands are missing a prop they are ` +
    `built from: ${parts.join(' | ')}. Opaque ground cannot substitute for a prop, so this run ` +
    'would have reported a closed palette over a picture missing the thing it is about.'
  );
}
