// scene.ts — the framework-agnostic SCENE-GRAPH (ADR-0093, strategy C). The
// defining layer of the shared render core: a pure `buildScene(input)` that turns
// the structural per-island drawable data into a tree of typed *drawables* — `g`
// groups + resolved primitive shapes (`path`/`circle`/`ellipse`/`polygon`/`rect`/
// `text`). Both surfaces render FROM this through a thin per-surface mapper (the
// studio → React; the website → SVG strings).
//
// The boundary (ADR-0093 §4): the scene carries RESOLVED GEOMETRY plus an
// app-neutral semantic `kind` / `variant` / ALREADY-FOLDED visual `status`, and
// `data-id`/`data-from`/`data-to` hooks for the delegation surface — but **no app
// class strings, no live data, no React**. Each mapper owns the kind → class(es)
// translation and the behaviour (the studio binds per-node React handlers; the
// website uses `data-id` event delegation). Status arrives folded by the surface
// (the studio's `worldStatus.ts` provenStatus, etc.) — the data→visual-status fold
// never enters the core.
//
// Geometry is replicated FROM the studio's canonical drawables (TreeView.tsx:
// StoryTree / GardenPlant / DecorTree / LandingBloom / IslandGround / the signpost
// / the wisp orbit / the nameplate) — the studio wins where it diverges from the
// website's pure render (the seed of this extraction). Coordinates are formatted to
// one decimal place; the studio's inline JSX mixed raw + toFixed, so the mapper's
// output is VISUALLY identical (sub-pixel), not byte-identical — visual parity is
// operator-attested (ADR-0070), determinism + shape correctness is red-green here.

import { hash, rand01 } from './rng.js';
import {
  type Axial,
  type Pt,
  HEX_R,
  TILE_DEPTH,
  axialKey,
  hexCenter,
  hexPath,
  polyPath,
} from './hex.js';
import { crownRadius } from './sizing.js';
import {
  type TrailCave,
  type TrailNetwork,
  type TrailSegment,
  trailFillWidth,
} from './routing.js';
import type { DrawTile, RelaxedCell } from './substrate.js';

// ---------------------------------------------------------------------------
// The scene-graph IR
// ---------------------------------------------------------------------------

/** The visual status a drawable WEARS, already folded by the surface (the proof /
 *  live-data fold stays out of the core — ADR-0093 §4). */
export type SceneStatus =
  | 'healthy'
  | 'mapped'
  | 'proposed'
  | 'building'
  | 'unhealthy'
  | 'unknown';

/**
 * An app-neutral SEMANTIC role for a node — each mapper translates it to its own
 * class(es) (the studio's `story-tree`/`crown-lo`/…, the website's `tw-*`). The
 * core never names an app's classes; it names the ROLE the shape plays.
 */
export type SceneKind =
  // structural layers
  | 'world'
  | 'empties-layer'
  | 'coast-layer'
  | 'ground-mesh'
  | 'ground-hex'
  | 'trails-layer'
  | 'flora-layer'
  | 'hits-layer'
  // coast / ground
  | 'empty'
  | 'coast'
  | 'coast-shore'
  | 'ground'
  | 'cell'
  | 'cell-wheat'
  | 'tile'
  | 'tile-side'
  | 'tile-top'
  | 'tile-top-wheat'
  // the trail network (ADR-0169 §2) — full cased passes over shared segments, so a
  // merged trunk reads as ONE trail (the cartographic casing rule), plus the
  // non-visual per-edge reveal metadata and the cave-portal prop.
  | 'trail-shadow-pass'
  | 'trail-casing-pass'
  | 'trail-fill-pass'
  | 'trail-ghost-pass'
  | 'trail-shadow'
  | 'trail-casing'
  | 'trail-fill'
  | 'trail-ghost'
  | 'trail-edges'
  | 'trail-edge'
  | 'cave'
  | 'cave-apron'
  | 'cave-arch'
  | 'cave-rim'
  // a whole island's flora group
  | 'territory'
  // the central story tree
  | 'tree'
  | 'shadow'
  | 'trunk'
  | 'crown-lo'
  | 'crown-hi'
  | 'bare'
  | 'litter'
  // the human-witness signpost
  | 'sign-blank'
  | 'sign-pass'
  | 'sign-fail'
  | 'sign-post'
  | 'sign-head'
  // the UAT markers (forest-parcels inc 2; stones → tall flowers, grounded-art inc 7). The story's UAT
  // criteria as TALL-FLOWER markers scattered deterministically around the island. The owner rejected
  // the standing-stones as noisy/colliding (#832) and directed a cosy stand-in (2026-07-20): one soft,
  // flat flower per criterion, its STATE read from FORM — a bloomed daisy = proven, a closed bud =
  // pending, a wilted nodding head = failing (the `sign-blank/pass/fail` precedent). The WRAPPER kind
  // encodes the state + carries the criterion id; the body marks come from the `tallFlowerMarks` painter
  // on the child kinds below (+ the shared `shadow`). Colour stays CSS-side (ADR-0093 §4). No group
  // kind: each flower is its own y-sorted drawable inside the territory, so painter depth interleaves
  // with the tree + flora.
  | 'tall-flower-proven'
  | 'tall-flower-pending'
  | 'tall-flower-failing'
  | 'tall-flower-stem'
  | 'tall-flower-leaf'
  | 'tall-flower-petal'
  | 'tall-flower-center'
  | 'tall-flower-bud'
  | 'tall-flower-glow'
  // the cosy-island GARDEN's flat decorative accents (grounded-art inc 11 unit 3) — a lavender bed and
  // grass tufts in the attested tall-flower FLAT style (no isometric shading; colour is CSS-class,
  // ADR-0093 §4). Decorative only — they carry no verdict. R3F auto-skips them (the mapper's default).
  | 'garden-lavender-stem'
  | 'garden-lavender-head'
  | 'garden-grass-blade'
  // baked art in the shared scene (ADR-0218) — the fenced paint-carrying family, KEPT as dormant
  // reusable machinery. `baked-defs` is the once-per-scene definition LAYER (a mapper renders it into
  // `<defs>`, non-rendering); `baked-art` is a placement `<use>` referencing a def. The UAT-marker
  // stone that once produced these retired with the tall-flower markers (grounded-art inc 7); the
  // family stays wired through the mapper for a future baked object type (see `SceneInput.bakedStone`).
  | 'baked-defs'
  | 'baked-art'
  // a capability as garden flora
  | 'flora'
  | 'flora-hit'
  | 'dead-ground'
  | 'flora-bed'
  | 'flora-dark'
  | 'flora-light'
  | 'flora-core'
  | 'flora-stem'
  | 'flora-dead-stem'
  | 'flora-dead-head'
  | 'flora-dead-twig'
  | 'sapling-trunk'
  // conifer decor
  | 'conifer'
  | 'conifer-body'
  | 'conifer-snow'
  // capability PARCELS (forest-parcels inc 1) — a capability rendered as a parcel of the island's
  // existing relaxed-cell ground, tinted by the cap's status and surfaced by a `SurfaceTheme`. The
  // ground cells stay the existing `cell`/`cell-wheat` kinds (per-cell `status` now set) so no new
  // ground CSS is needed; `parcel` is a transparent identity/delegation `<g>` (carries the capId).
  // The flora marks are a small GENERIC vocabulary shared across themes — the theme reaches the
  // mapper via the node's `theme` field (a `theme-<t>` class), the parcel's status via `status`; the
  // colour itself stays CSS-side (ADR-0093 §4). `variant` distinguishes facets within a kind.
  | 'parcel' // per-capability ground group (transparent — cells inside carry the visible tint)
  | 'parcel-flora' // one placed flora item (a grass tuft / tree / shrub), positioned by transform
  | 'parcel-blade' // a grass blade / tussock / young sprout stroke
  | 'parcel-shrub' // a foliage blob — bush dome / tree crown
  | 'parcel-stem' // a woody stem / trunk / bare twig
  | 'parcel-flower' // a small accent disc — flower petal (variant 0) / core or berry (variant 1) / dead fleck
  // the recently-landed bloom
  | 'bloom-anchor'
  | 'bloom-crown'
  | 'bloom-plant'
  | 'bloom-ring'
  | 'bloom-spark'
  // the in-flight build wisp orbit
  | 'wisps'
  | 'wisp'
  | 'wisp-hit'
  | 'wisp-glow'
  | 'wisp-dot'
  // the story-CLAIM wisp orbit (ADR-0138 §5) — a session is working this story.
  // A DISTINCT drawable family from the build wisp: it carries a `colourState`
  // (authoring / proving / supplementing), NEVER a bloom, so the §5 honesty wall
  // holds at the kind level (a claim wisp can never be mistaken for a verdict bloom).
  | 'claim-wisps'
  | 'claim-wisp'
  | 'claim-wisp-hit'
  | 'claim-wisp-glow'
  | 'claim-wisp-dot'
  // the claim-GRADE drawable families (ADR-0200 D7) — which geometry a claim's grade selects.
  // `hover-wisp*`: an exploring claim window-shopping BESIDE the story tree — a small local orbit
  //   around a per-key rest spot (ADR-0212 reversed ADR-0200 D7's stationary rule; it carries a
  //   `phase` and the rest spot lives on a PARENT `g` so the mapper's rotate can't replace it).
  // `queue-wisp*`: a waiting claim in the visible queue line (index-placed in input order, stationary).
  // `departing-wisp*` (under the `departing-wisps` layer): a released claim fading out (`ageRatio`).
  // ALL are coordination drawables behind the same ADR-0138 §5 honesty wall as `claim-wisp*`:
  // never a bloom kind, never an `outcome` — a claim (or its departure) is not a proof.
  | 'hover-wisp'
  | 'hover-wisp-hit'
  | 'hover-wisp-glow'
  | 'hover-wisp-dot'
  | 'queue-wisp'
  | 'queue-wisp-hit'
  | 'queue-wisp-glow'
  | 'queue-wisp-dot'
  | 'departing-wisps'
  | 'departing-wisp'
  | 'departing-wisp-hit'
  | 'departing-wisp-glow'
  | 'departing-wisp-dot'
  // the nameplate
  | 'plate'
  | 'plate-bg'
  | 'plate-id'
  | 'plate-sub'
  // the delegation hit area (website)
  | 'hit';

/** The fields every drawable may carry — all optional, set only where the node
 *  needs it (so the mapper translates exactly what's present). */
export interface SceneNodeBase {
  /** The semantic role; absent on a structural-only `<g>` or an unclassed child. */
  kind?: SceneKind;
  /** A numeric variant suffix the mapper formats per role (cell `v-N`, conifer `c-N`). */
  variant?: number;
  /** The folded visual status; the mapper appends its `st-<status>` etc. */
  status?: SceneStatus;
  /** `data-id` — the unit this node belongs to (focus / hover / delegation). */
  id?: string;
  /** `data-from` — a trail edge's source story. */
  from?: string;
  /** `data-to` — a trail edge's target story. */
  to?: string;
  /** `data-usage` — distinct edges routed through a trail segment (drives width). */
  usage?: number;
  /** `data-edges` — comma-joined `from->to` keys through a trail segment / cave portal. */
  edges?: string;
  /** `data-spur` — a usage-1 trail fill (the mapper dashes it; a trunk stays solid). */
  spur?: boolean;
  /** `data-segments` — an edge's ordered segment chain, `id:F,id2:R,…` (F/R = orientation),
   *  so a surface drives reveal-on-focus without re-walking the graph (ADR-0169 §3). */
  segments?: string;
  /** `data-island` — the island a cave portal sits on. */
  island?: string;
  /** A `<title>` tooltip child (surface vocabulary, folded in by the surface). */
  title?: string;
  /** A `transform` attribute (already-formatted). */
  transform?: string;
  /** A resolved opacity. */
  opacity?: number;
  /** A resolved `stroke-width` (the dead-flora strokes). */
  strokeWidth?: number;
  /** An additive accent modifier (a node that wears a second semantic class). */
  accent?: boolean;
  /** A capability parcel's SURFACE THEME (forest-parcels inc 1) — the mapper appends its
   *  `theme-<t>` class so meadow / woodland / heath flora read as distinct country. Carried on the
   *  `parcel-flora` item group; the colour itself stays CSS-side (ADR-0093 §4). */
  theme?: SurfaceTheme;
  /** A bloom's verdict outcome (drives the mapper's `verdict-<outcome>`). */
  outcome?: 'pass' | 'fail';
  /** A wisp's orbit phase in degrees (the mapper drives the rotation from it). */
  phase?: number;
  /** A wisp's red→green BAND, folded from the live prove-it-gate phase (ADR-0048 §3 v2): `red`
   *  while authoring/confirming the failing test, `green` on the green observation/gate, `building`
   *  while implementing (and when no phase is known). A SEPARATE field from the orbit `phase`
   *  (location ⟂ form); the mapper appends its `band-<phaseBand>` class. */
  phaseBand?: WispPhaseBand;
  /** A story-CLAIM wisp's subagent colour-state (ADR-0138 §5) — what the orchestrator is doing on
   *  the claimed story: `authoring` (story-author), `proving` (red→green leaf), `supplementing`
   *  (glue). Carried on a `claim-wisp` node; the mapper appends its `state-<colourState>` class.
   *  GUARANTEED never to be `green`/`bloom` (the honesty wall) — a claim is not a proof. ALSO carried
   *  on a BUILD `wisp` when the live work-event stamped one (advisory role tint, additive to
   *  `phaseBand`). A SEPARATE field from `phase` (the orbit rotation) — location ⟂ form. */
  colourState?: ClaimColourState;
  /** A departing claim wisp's progress through the departure window, 0..1 (ADR-0200 D7) — the
   *  surface computes it; the mapper turns it into the fade (the opacity curve is mapper/CSS-side,
   *  the later operator-attested LOOK stage). Carried on a `departing-wisp` node. */
  ageRatio?: number;
}

/** The wisp's three visual bands (ADR-0048 §3 v2) — the mapper's `band-red`/`band-green`/
 *  `band-building` class suffix. */
export type WispPhaseBand = 'red' | 'green' | 'building';

/** The three ADR-0138 §5 subagent colour-states a story-CLAIM wisp wears — what the orchestrator is
 *  doing on the claimed story. DUPLICATED as the core's OWN input vocabulary (the scene-graph is a
 *  foundational root that depends on nothing — ADR-0093 §Open call 2), mirroring `@storytree/drive`'s
 *  `subagentColourState` output. GUARANTEED never `green`/`bloom`: a claim is a coordination signal,
 *  never a proof (only a signed verdict paints the green bloom — ADR-0045). The mapper appends its
 *  `state-<colourState>` class. */
export type ClaimColourState = 'authoring' | 'proving' | 'supplementing';

/** The three claim GRADES a story claim wears (ADR-0200 D2 / D7) — which drawable family the claim
 *  renders as: `exploring` hovers at rest beside the tree, `waiting` queues in the visible line,
 *  `work` orbits (today's claim wisp). DUPLICATED as the core's OWN input vocabulary (the
 *  scene-graph is a foundational root that depends on nothing — ADR-0093 §Open call 2), mirroring
 *  `@storytree/notice-board`'s `ClaimGrade` exactly as `ClaimColourState` mirrors the drive's. An
 *  ABSENT grade IS the work claim (the D2 back-compat default), so every pre-grade surface keeps
 *  today's orbit unchanged. */
export type ClaimGrade = 'exploring' | 'waiting' | 'work';

/** A capability parcel's SURFACE THEME (forest-parcels inc 1) — which per-theme surface function
 *  (`SURFACES[theme]`) paints its patch of ground + flora. DUPLICATED as the core's OWN input
 *  vocabulary (the scene-graph is a foundational root that depends on nothing — ADR-0093 §Open
 *  call 2), mirroring the surface swarm's theme set (meadow / woodland / heath) rather than importing
 *  it. The surface fold folds each capability's real theme into this. */
export type SurfaceTheme = 'meadow' | 'woodland' | 'heath';

/** A UAT criterion's proof state on the island's markers (forest-parcels inc 2; tall flowers,
 *  grounded-art inc 7) — how the criterion's flower reads BY FORM: `proven` is a bloomed daisy,
 *  `pending` a closed bud, `failing` a wilted nodding head. DUPLICATED as the core's OWN input
 *  vocabulary (the scene-graph is a foundational root that depends on nothing — ADR-0093 §Open call 2),
 *  mirroring the surface's folded per-criterion proof state rather than importing the proof machinery.
 *  Encoded in the marker WRAPPER's kind (`tall-flower-proven`/`-pending`/`-failing`), never as live data. */
export type MarkerState = 'proven' | 'pending' | 'failing';

/** The prove-it-gate's phases (ADR-0020 §1), DUPLICATED as the core's OWN input vocabulary — the
 *  scene-graph is a foundational root that depends on nothing (ADR-0093 §Open call 2), so it mirrors
 *  the union rather than importing the orchestrator or proof-protocol. The surface folds its live
 *  build phase into this when it has one. */
export type BuildPhase =
  | 'AUTHOR_TEST'
  | 'CONFIRM_RED'
  | 'IMPLEMENT'
  | 'CONFIRM_GREEN'
  | 'GATE';

/** Fold a gate phase → the wisp's red→green band (ADR-0048 §3 v2). `red` while the failing test is
 *  authored/confirmed, `green` once the implementation is observed green / at the gate, `building`
 *  while implementing — and the neutral default when no phase is known (a pre-ADR-0048 mark). */
export function wispBand(phase: BuildPhase | undefined): WispPhaseBand {
  switch (phase) {
    case 'AUTHOR_TEST':
    case 'CONFIRM_RED':
      return 'red';
    case 'CONFIRM_GREEN':
    case 'GATE':
      return 'green';
    case 'IMPLEMENT':
    default:
      return 'building';
  }
}

export interface SceneG extends SceneNodeBase {
  el: 'g';
  children: SceneNode[];
}
export interface ScenePath extends SceneNodeBase {
  el: 'path';
  d: string;
}
export interface SceneCircle extends SceneNodeBase {
  el: 'circle';
  cx: number;
  cy: number;
  r: number;
}
export interface SceneEllipse extends SceneNodeBase {
  el: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
export interface ScenePolygon extends SceneNodeBase {
  el: 'polygon';
  points: string;
}
export interface SceneRect extends SceneNodeBase {
  el: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
}
export interface SceneText extends SceneNodeBase {
  el: 'text';
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * A resolved-paint baked drawable (ADR-0218) — the procedural-architecture factory's `BakedNode`
 * vocabulary, DUPLICATED here because the scene-graph is a foundational root that depends on nothing
 * (ADR-0093 §Open call 2), exactly as it duplicates `ClaimGrade` / `SurfaceTheme` / the gate phases.
 *
 * THIS IS THE ONE SHAPE IN THE SCENE-GRAPH THAT CARRIES PAINT. It exists because a bake's fill is its
 * material colour modulated by N·L, so two facets of one solid differ and no CSS class can name them —
 * the exact case ADR-0093 §4's colour-is-class rule cannot cover, and the fenced exception ADR-0218
 * opens. It is confined to a `baked-def`'s `nodes`; `SceneNodeBase` stays colour-free.
 */
export type BakedPaintNode =
  | { el: 'polygon'; points: string; fill: string; stroke: string; strokeWidth: number; opacity?: number }
  | { el: 'path'; d: string; fill: string; stroke: string; strokeWidth: number; opacity?: number; fillRule?: 'evenodd' }
  | { el: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number };

/** A baked-art DEFINITION (ADR-0218): the paint-carrying drawable list, defined ONCE in the scene's
 *  `baked-defs` layer and referenced by every `SceneBakedUse`. Define-once-reference-many is the
 *  node-cost contract (ADR-0069): one def, N cheap uses, instead of the solid inlined per placement. */
export interface SceneBakedDef extends SceneNodeBase {
  el: 'baked-def';
  /** the id a `baked-use` references; the mapper stamps it as the SVG element `id` */
  defId: string;
  /** the resolved drawables, already in painter order — paint them in sequence */
  nodes: BakedPaintNode[];
}

/** A baked-art PLACEMENT (ADR-0218): a paint-FREE `<use>` of a `baked-def`. Carries only the ordinary
 *  semantic fields (its own `transform`, the marker `id` on its wrapper) — never colour. */
export interface SceneBakedUse extends SceneNodeBase {
  el: 'baked-use';
  defId: string;
}

export type SceneNode =
  | SceneG
  | ScenePath
  | SceneCircle
  | SceneEllipse
  | ScenePolygon
  | SceneRect
  | SceneText
  | SceneBakedDef
  | SceneBakedUse;

// ---------------------------------------------------------------------------
// The structural INPUT contract (ADR-0093 design fork → option b)
// ---------------------------------------------------------------------------
//
// `buildScene` takes its OWN minimal structural contract — NOT any surface's world
// type — so the core stays a foundational root that depends on nothing (the studio
// adapts its `HexWorld` into this; the website adapts its world). `buildWorld`
// itself stays surface-side: it is entangled with studio CHROME (solar layout,
// building stamps, bookshelf consumers) that must not enter the core, so option (a)
// (move `buildWorld` in) would drag the chrome with it. Option (b) keeps the
// boundary clean — the core owns the LOOK (shapes + hash-derived variants/jitter +
// layout of a drawable), the surface folds its data + chrome into this contract.

/** The routed `depends_on` trail network (ADR-0169) — `routeTrails`' output verbatim:
 *  shared segments (a trunk renders once), per-edge ordered segment chains (titles ride
 *  the edges), and forced cave portals. The surface routes; the core renders. */
export type SceneTrailsInput = TrailNetwork;

/** A capability rendered as garden flora — its id (the core derives the variant +
 *  jitter), folded status, position, tooltip, and an already-folded bloom. */
export interface ScenePlantInput {
  id: string;
  status: SceneStatus;
  x: number;
  y: number;
  title: string;
  /** A recently-landed bloom, folded by the surface (verdict.at + now → ageRatio);
   *  omitted when there is nothing to announce or the plant is withered. */
  bloom?: { ageRatio: number; outcome: 'pass' | 'fail' };
}

/** A capability rendered as a PARCEL of the island's ground (forest-parcels inc 1) — its id (the
 *  delegation/hover hook + the deterministic flora seed), its folded `status` (the per-cell ground
 *  tint), its `testCount` (drives the flora DENSITY, not the parcel's area — island size stays keyed
 *  to the caps count), the `theme` that surfaces it, and a `seed` position. The island's EXISTING
 *  relaxed substrate cells are sub-partitioned among the parcels by equal-weight Voronoi over the
 *  `seed` points (nearest seed wins); a parcel owns the cells nearest its seed. */
export interface SceneParcelInput {
  capId: string;
  status: SceneStatus;
  /** The capability's test-criteria count — the flora density knob (0 ⇒ bare ground). */
  testCount: number;
  theme: SurfaceTheme;
  /** The parcel's Voronoi seed point, in island/map space (the same space `relaxedCells[].poly` is in). */
  seed: Pt;
}

/** One island's drawable data — geometry the surface computed (centroid / treeSpot
 *  / coast / decor seeds), folded status, and the surface's folded marks (signpost
 *  presence, crown bloom, in-flight wisps) + nameplate box & text. */
export interface SceneTerritoryInput {
  id: string;
  /** The folded visual status (provenStatus); drives every island hue. */
  status: SceneStatus;
  /** Capability count — the core derives crown size + young/withered from it + status. */
  caps: number;
  centroid: Pt;
  radius: number;
  treeSpot: Pt;
  /** The nameplate baseline y (also the delegation hit's bottom). */
  labelY: number;
  coastPaths: string[];
  /** Conifer-clump seeds; the core expands each into 2–3 deterministic conifers.
   *  RETIRED for a parcels-present island (the parcel flora replaces the decorative conifers). */
  decor: { x: number; y: number; seed: number }[];
  plants: ScenePlantInput[];
  /** Capability PARCELS (forest-parcels inc 1). When PRESENT (and the island has relaxed substrate
   *  cells), the island's existing cells are sub-partitioned among these capabilities by equal-weight
   *  Voronoi over each parcel's `seed`, each cell tinted by its assigned cap's `status`, and each
   *  parcel's flora emitted through its `theme`'s surface function with density ∝ `testCount` — and
   *  the decorative conifers (`decor`) + the one-plant-per-cap ring (`plants`) are RETIRED for this
   *  island. OPTIONAL and back-compat: absent ⇒ today's ground + conifers + plant ring render
   *  byte-for-byte (the public website omits it entirely). */
  parcels?: SceneParcelInput[];
  /** The crown tooltip (surface vocabulary). */
  treeTitle: string;
  /** Present only for a human-witness story; `outcome` null = a blank (unsigned) seal. */
  signpost?: { outcome: 'pass' | 'fail' | null };
  /** The UAT markers (forest-parcels inc 2; tall flowers, grounded-art inc 7). When PRESENT and
   *  non-empty, the island grows ONE tall-flower marker per criterion, SCATTERED deterministically
   *  around the island (each spot is id-seeded with keep-outs for the tree well, the signpost, the
   *  nameplate band, and other flowers, and a keep-IN to the island's substrate land cells so no flower
   *  drifts into the water). Each criterion's `state` is encoded in its wrapper KIND
   *  (`tall-flower-proven`/`-pending`/`-failing`) and its `id` carried as the node id (the
   *  hover/delegation hook). The human-witness `signpost` seal is RETAINED unconditionally — the markers
   *  never replace it. OPTIONAL and back-compat: ABSENT ⇒ today's island renders BYTE-FOR-BYTE (the
   *  public website fold never sends it and must be unchanged). */
  uatCriteria?: { id: string; state: MarkerState }[];
  /** The crown bloom, folded by the surface; omitted when withered or none. */
  bloom?: { ageRatio: number; outcome: 'pass' | 'fail' };
  /** In-flight build wisps, folded from live builds (the core derives each orbit
   *  ROTATION from the runId — geometry, like the crown jitter). The optional
   *  `phase` is the live prove-it-gate phase the surface folds in (ADR-0048 §3 v2)
   *  — the core maps it to the wisp's red→green band. The optional `colourState`
   *  (ADR-0138 §5) is the live subagent role the work-event stamped — an additive
   *  role tint on the build wisp (absent → existing `phaseBand` look, unchanged).
   *  Empty when nothing builds. */
  wisps: { runId: string; title: string; phase?: BuildPhase; colourState?: ClaimColourState }[];
  /** In-flight story CLAIMS, folded from the live `events.node_claim` layer (ADR-0138 §5). One
   *  orbiting claim wisp per claim — a session is working this story (coordination), coloured by what
   *  the orchestrator is doing (`colourState`). The core derives the orbit ROTATION from `key` (a
   *  stable id — sessionId or unitId — geometry, like the build wisp's runId). DISTINCT from `wisps`
   *  AND from any bloom: a claim is never a proof (the §5 honesty wall). OPTIONAL and back-compat: a
   *  surface with no live-claim concept (the public website, which has no sessions) omits it entirely,
   *  so the claim layer is inert there — `buildClaimWisps` returns null and the render is unchanged.
   *  Absent/empty when nothing is claimed. The optional `grade` (ADR-0200 D2/D7) selects the
   *  drawable family — `exploring` hovers, `waiting` queues, `work` orbits; ABSENT means `work`
   *  (the D2 back-compat default: every pre-grade surface keeps today's orbit byte-for-byte).
   *  WAITING ORDER CONTRACT: waiters are placed by their INDEX in input order, so the surface sends
   *  them ordered by `claimedAt` (the queue order the claim ledger already keeps). */
  /*  The optional `phase` (ADR-0212) is the LIVE prove-it-gate phase of a build running on this story,
   *  folded onto the WORK-grade claim body — the first step of merging the separate build-wisp layer
   *  (ADR-0048) into the one-wisp-per-session lifecycle. The surface joins build → claim by STORY, not
   *  by session: `BuildActivity` carries no session identity, but the work claim is an exclusive mutex
   *  (ADR-0200 D2), so a story with a work claim AND a live build has exactly one possible actor.
   *  ABSENT ⇒ no band, and every pre-ADR-0212 surface renders BYTE-FOR-BYTE unchanged. Ignored on the
   *  `exploring`/`waiting` grades — only work builds. */
  claims?: {
    key: string;
    title: string;
    colourState: ClaimColourState;
    grade?: ClaimGrade;
    phase?: BuildPhase;
  }[];
  /** Recently-RELEASED story claims still fading out (ADR-0200 D7) — the departure drawable. The
   *  surface folds which departures sit inside the window and computes each `ageRatio` (0..1 — how
   *  far through the departure window); the core places a stationary `departing-wisp` whose
   *  geometry drifts upward with age (the "leaving" translation), and carries `ageRatio` on the
   *  node for the mapper's fade (the curve itself is the mapper/CSS's job — the later
   *  operator-attested LOOK stage). OPTIONAL and back-compat exactly like `claims`: a surface with
   *  no claim concept (the public website) omits it entirely and the render is unchanged. */
  departures?: { key: string; title: string; ageRatio: number }[];
  /** The nameplate box (surface chrome: the studio's `nameplateLayout`, the web's
   *  own sizing) + the text the surface chose. */
  plate: {
    w: number;
    h: number;
    rx: number;
    idY: number;
    subY: number;
    idText: string;
    subText: string;
    title: string;
  };
}

/** The whole scene's structural input. `territories` is in OWNER order — the same
 *  index `relaxedCells[].owner` / `drawTiles[].owner` / `wheatSets[i]` key on. */
export interface SceneInput {
  offset: Pt;
  width: number;
  height: number;
  /** Pale coast tiles (1–2 rings beyond claimed land). */
  empties: Axial[];
  /** Mesh substrate cells; `null` ⇒ the classic extruded-hex ground (`drawTiles`). */
  relaxedCells: RelaxedCell[] | null;
  /** Claimed tiles + owning-territory index (used when `relaxedCells` is null). */
  drawTiles: DrawTile[];
  /** Per-territory wheat key-sets (used when `relaxedCells` is null). */
  wheatSets: ReadonlySet<string>[];
  trails: SceneTrailsInput;
  territories: SceneTerritoryInput[];
  /** DORMANT ADR-0218 seam hook. The baked standing-stone once rode here (fed a `baked-defs` layer that
   *  every UAT marker's `baked-art` `<use>` referenced), but the stone-in-scene instance retired with
   *  the tall-flower markers (grounded-art inc 7) — `buildScene` no longer reads this field, so supplying
   *  it is a no-op. The field + the baked-art types/kinds/mapper handling are KEPT as reusable machinery
   *  (owner call: keep the seam) for a FUTURE baked object type; that type re-lights the emission in
   *  `buildScene`. `width`/`height` are the baked box (a future consumer scales the solid to its envelope). */
  bakedStone?: { nodes: BakedPaintNode[]; width: number; height: number };
  /** The cosy-island GARDEN composition (grounded-art inc 11, ADR-0221 / re-lit ADR-0218). PRESENT ⇒
   *  the island named by `garden.islandId` composes as the concept garden — the four heroes placed
   *  through the baked-art seam, decorative flora suppressed, the `autumn-tree` hero as its central
   *  tree. OPTIONAL and back-compat: ABSENT ⇒ every island renders BYTE-FOR-BYTE (the same lock as
   *  `parcels`/`uatCriteria`; the public website fold never sends it). */
  garden?: SceneGardenInput;
}

/** DORMANT: the scene-graph's def id the baked standing-stone once used (ADR-0218). No longer emitted
 *  (the stone-in-scene instance retired with the tall-flower markers, grounded-art inc 7); KEPT exported
 *  as the seam's documented def-id pattern for a future baked object type. */
export const BAKED_STONE_DEF = 'baked-standing-stone';

// ---------------------------------------------------------------------------
// the cosy-island GARDEN composition (grounded-art inc 11, ADR-0221 / re-lit ADR-0218)
// ---------------------------------------------------------------------------
//
// The first LIVE consumer of ADR-0218's fenced baked-art seam. When `SceneInput.garden` is present, the
// named exemplar island composes as the concept garden (docs/research/grounded-art-concept): the four
// inc-10 heroes (cottage, gazebo, autumn-tree, stepping-stone) placed as `baked-use` references to
// `baked-def`s the surface folds from procedural-architecture's `kit.json` `heroes`, with the island's
// decorative flora (conifers / capability plants / parcel flora / the 1:1 UAT-flower scatter) SUPPRESSED
// and the `autumn-tree` hero standing as the central tree (ADR-0221, studio flag path only). ABSENT ⇒
// every island renders BYTE-FOR-BYTE — the same absence lock as `parcels`/`uatCriteria`; the public
// website fold never sends it.

/** The four cosy-island hero ids, keyed to `kit.json`'s `heroes` array. */
export type GardenHeroId = 'cottage' | 'gazebo' | 'autumn-tree' | 'stepping-stone';

/** A baked hero's resolved-paint drawables + its baked box, folded by the SURFACE from
 *  procedural-architecture's `kit.json` `heroes` (the core imports nothing new — the def data is
 *  opaque surface-supplied data, exactly like `coastPaths`). One `baked-def` is emitted per hero
 *  (define-once, ADR-0069) and referenced by every placement `baked-use`. `width`/`height` are the
 *  baked box, so a placement scales the solid to a target on-island envelope. */
export interface SceneGardenHero {
  nodes: BakedPaintNode[];
  width: number;
  height: number;
}

/** The garden composition input (grounded-art inc 11, ADR-0221). PRESENT ⇒ the island whose id is
 *  `islandId` composes as the concept garden (heroes placed, flora suppressed, `autumn-tree` hero as
 *  the central tree). ABSENT ⇒ every island renders byte-for-byte (the public website never sends it). */
export interface SceneGardenInput {
  /** which territory id composes as a garden — the studio exemplar island (`studio`). */
  islandId: string;
  /** the four heroes' baked defs, keyed by their `kit.json` id. */
  heroes: Record<GardenHeroId, SceneGardenHero>;
}

// ---------------------------------------------------------------------------
// node factories — terse, drop-undefined construction
// ---------------------------------------------------------------------------

const f = (n: number): string => n.toFixed(1);
const EMPTY_KEYS: ReadonlySet<string> = new Set();

function g(children: SceneNode[], a: SceneNodeBase = {}): SceneG {
  return { el: 'g', children, ...a };
}
function path(d: string, a: SceneNodeBase = {}): ScenePath {
  return { el: 'path', d, ...a };
}
function circle(cx: number, cy: number, r: number, a: SceneNodeBase = {}): SceneCircle {
  return { el: 'circle', cx, cy, r, ...a };
}
function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a: SceneNodeBase = {},
): SceneEllipse {
  return { el: 'ellipse', cx, cy, rx, ry, ...a };
}
function polygon(points: string, a: SceneNodeBase = {}): ScenePolygon {
  return { el: 'polygon', points, ...a };
}
function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  a: SceneNodeBase = {},
): SceneRect {
  return { el: 'rect', x, y, width, height, rx, ...a };
}
function text(
  x: number,
  y: number,
  content: string,
  anchor: 'start' | 'middle' | 'end',
  a: SceneNodeBase = {},
): SceneText {
  return { el: 'text', x, y, text: content, anchor, ...a };
}

// ---------------------------------------------------------------------------
// the central story tree (StoryTree)
// ---------------------------------------------------------------------------

/** The central story tree — living canopy / withered skeleton / not-yet-full young
 *  form, with the crown blobs deterministically jittered by the story id. Includes
 *  the recently-landed crown bloom and the human-witness signpost as children
 *  (matching the studio's `story-tree` group). */
export function buildTree(t: SceneTerritoryInput): SceneG {
  const st = t.status;
  const caps = t.caps;
  const withered = st === 'unhealthy';
  // `proposed` hasn't earned full growth; a claimed-but-empty story (0 caps) wears
  // the SAME small form (owner 2026-06-21 — the sapling stage folded in).
  const young = !withered && (st === 'proposed' || caps === 0);
  const R = crownRadius(caps) * (young ? 0.62 : 1);
  const cy = -1.65 * R;

  const trunkD =
    `M -3.6 0 C -3.2 ${f(0.3 * cy)}, -2.4 ${f(0.65 * cy)}, -2.2 ${f(cy)} ` +
    `L 2.2 ${f(cy)} C 2.4 ${f(0.65 * cy)}, 3.2 ${f(0.3 * cy)}, 3.6 0 Q 0 2.4 -3.6 0 Z`;

  const children: SceneNode[] = [ellipse(2, 2, R * 0.78, R * 0.2, { kind: 'shadow' })];

  if (withered) {
    const bareBranches = [
      `M 0 ${f(-1.65 * R)} C 2 ${f(-2.07 * R)}, 1 ${f(-2.36 * R)}, ${f(0.21 * R)} ${f(-2.64 * R)}`,
      `M ${f(0.12 * R)} ${f(-2.29 * R)} L ${f(0.32 * R)} ${f(-2.43 * R)}`,
      `M -4 ${f(-1.79 * R)} C -9 ${f(-2.07 * R)}, -8 ${f(-2.25 * R)}, ${f(-0.46 * R)} ${f(-2.43 * R)}`,
      `M ${f(-0.31 * R)} ${f(-2.14 * R)} L ${f(-0.5 * R)} ${f(-2.18 * R)}`,
    ];
    children.push(
      path(trunkD, { kind: 'trunk' }),
      g([circle(0, cy + 0.15 * R, 0.78 * R), circle(-0.62 * R, cy + 0.36 * R, 0.49 * R)], {
        kind: 'crown-lo',
      }),
      g([circle(-0.21 * R, cy - 0.14 * R, 0.32 * R)], { kind: 'crown-hi', opacity: 0.7 }),
      g(
        bareBranches.map((d) => path(d)),
        { kind: 'bare' },
      ),
      ...([
        [-14, -2],
        [-6, 1],
        [8, -1],
        [16, -4],
      ] as const).map(([lx, ly]) => circle(lx, ly, 1.3, { kind: 'litter' })),
    );
  } else {
    const jb = (i: number, bcx: number, bcy: number, br: number): SceneCircle => {
      const k = hash(`${t.id}:crown:${i}`);
      return circle(
        bcx + (rand01(k) - 0.5) * 0.12 * R,
        bcy + (rand01(k + 1) - 0.5) * 0.1 * R,
        br * (0.94 + rand01(k + 2) * 0.12),
      );
    };
    const base = [
      circle(0, cy, R), // the central blob is never jittered
      jb(1, -0.62 * R, cy + 0.3 * R, 0.62 * R),
      jb(2, 0.62 * R, cy + 0.3 * R, 0.62 * R),
      jb(3, -0.4 * R, cy - 0.52 * R, 0.55 * R),
      jb(4, 0.42 * R, cy - 0.5 * R, 0.57 * R),
    ];
    const highlights = [
      jb(5, -0.15 * R, cy - 0.3 * R, 0.6 * R),
      jb(6, -0.55 * R, cy - 0.05 * R, 0.38 * R),
      jb(7, 0.3 * R, cy - 0.55 * R, 0.36 * R),
    ];
    children.push(
      path(trunkD, { kind: 'trunk' }),
      g(base, { kind: 'crown-lo' }),
      g(highlights, { kind: 'crown-hi' }),
    );
  }

  if (t.bloom) children.push(buildBloom(t.id, t.bloom, 0, cy, R * 1.18, 'crown'));
  if (t.signpost) children.push(buildSignpost(t.signpost, R));

  return g(children, {
    kind: 'tree',
    status: st,
    title: t.treeTitle,
    transform: `translate(${f(t.treeSpot.x)} ${f(t.treeSpot.y)})`,
  });
}

/** The human-witness signpost — a dashed-blank seal until the UAT verdict is
 *  signed, a filled seal (echoing the verdict's hue) after. The studio shows the
 *  state via the group class; the post + head shapes are the shared geometry. */
function buildSignpost(s: { outcome: 'pass' | 'fail' | null }, R: number): SceneG {
  const kind: SceneKind =
    s.outcome === null ? 'sign-blank' : s.outcome === 'pass' ? 'sign-pass' : 'sign-fail';
  return g(
    [
      ellipse(0.6, 0.8, 4, 1.6, { kind: 'shadow' }),
      rect(-1.3, -15, 2.6, 15, 1.1, { kind: 'sign-post' }),
      circle(0, -18, 6.5, { kind: 'sign-head' }),
    ],
    { kind, transform: `translate(${f(R * 0.7 + 9)} 0)` },
  );
}

// ---------------------------------------------------------------------------
// the UAT markers (forest-parcels inc 2; stones → tall flowers, grounded-art inc 7)
// ---------------------------------------------------------------------------
//
// A uatCriteria-present island grows ONE tall-flower marker per criterion, SCATTERED deterministically
// around the island. The standing-stones the placement first carried (owner call 2026-07-18) were
// rejected as noisy/colliding (#832) and replaced with a cosy stand-in (owner call 2026-07-20): a soft
// flat flower whose FORM reads the verdict. Each spot is id-seeded with keep-outs for the tree well
// (which also covers the signpost beside it), the nameplate band, and the other flowers — and a keep-IN
// to the island's substrate land cells (no flower in the water); every flower is its OWN y-sorted
// drawable so it interleaves honestly with the tree + flora in painter order. The human-witness signpost
// seal is RETAINED. Everything is seeded from the story id via the existing `hash`/`rand01` helpers —
// same input ⇒ byte-identical output.

/** THE MARKER-BODY PAINTER (grounded-art inc 7, superseding the ADR-0208 standing-stone splice seam):
 *  a soft, flat, colour-class-driven TALL FLOWER — the cosy stand-in the owner directed after rejecting
 *  the baked standing-stones as "messy and noisy rather than cosy" (#832, 2026-07-20). One flower per
 *  UAT criterion; the verdict is read from its FORM, not a glow: a bloomed daisy = proven, a closed bud
 *  = pending, a wilted nodding head = failing (the `sign-blank/pass/fail` precedent). Contract
 *  `(state, k) => SceneNode[]` — marks positioned with the flower's BASE at (0,0), growing UP in −y; `k`
 *  is a hash seed for deterministic jitter (`rand01(k + i)`, never Math.random), so a cluster reads
 *  natural not cloned (lean, height, petal count, rotation all seeded). The wrapper's KIND carries the
 *  state; the body child kinds map to CSS classes, colour stays CSS-side (ADR-0093 §4). Sibling in
 *  spirit of buildBloom/buildPlant — flat pastel fills, NO isometric shading — matching the island's
 *  existing flat look and the cosy-island concept (`docs/research/grounded-art-concept`). */
function tallFlowerMarks(state: MarkerState, k: number): SceneNode[] {
  const jx = (n: number): number => rand01(k + n) - 0.5; // per-marker jitter in [-0.5, 0.5)
  const j01 = (n: number): number => rand01(k + n); // per-marker roll in [0, 1)

  const height = 36 + j01(0) * 8; // 36–44u tall — a slender flower, a narrower footprint than the stone
  const lean = jx(1) * 7; // the whole stalk leans a touch off true vertical (base planted)

  // the upright head anchor; failing nods it over + sinks it (a wilted, bowed head).
  const upX = lean;
  const upY = -height;
  const nodSide = jx(2) < 0 ? -1 : 1;
  const failing = state === 'failing';
  const headX = failing ? upX + nodSide * 6.5 : upX;
  const headY = failing ? upY + 7 : upY;

  // the stalk: a gentle cubic from the planted base up to the head. Failing arcs OVER — the second
  // control point pulls above the sunken head so the tip bows down, reading as a wilted stem.
  const stemD = failing
    ? `M 0 0 C ${f(lean * 0.5)} ${f(-height * 0.5)}, ${f(upX)} ${f(upY - 5)}, ${f(headX)} ${f(headY)}`
    : `M 0 0 C ${f(lean * 0.5 + jx(3) * 2)} ${f(-height * 0.4)}, ${f(upX * 0.85)} ${f(-height * 0.78)}, ${f(headX)} ${f(headY)}`;

  const marks: SceneNode[] = [
    // a soft flat ground shadow (reuses the shared `shadow` kind the flora already map to `.flora-shadow`).
    ellipse(0.4, 0.6, 5.2, 1.7, { kind: 'shadow' }),
    path(stemD, { kind: 'tall-flower-stem', strokeWidth: 2.2 }),
  ];

  // two small leaves along the stalk, alternating sides, angled up-and-out — seeded so they vary.
  const firstSide = jx(4) < 0 ? -1 : 1;
  ([
    [0.34, firstSide],
    [0.6, -firstSide],
  ] as const).forEach(([t, side], i) => {
    const ly = -height * t;
    const lx = lean * t;
    marks.push(
      ellipse(lx + side * 3.4, ly, 4.0 + jx(10 + i) * 0.9, 1.8, {
        kind: 'tall-flower-leaf',
        transform: `rotate(${f(side * (34 + jx(12 + i) * 12))} ${f(lx)} ${f(ly)})`,
      }),
    );
  });

  if (state === 'proven') {
    // a soft warm glow behind the bloom — proven ONLY, low opacity, calm (no sparks: the owner's noise
    // complaint). Drawn first so the petals sit crisp on top.
    marks.push(
      circle(headX, headY, 10.5, { kind: 'tall-flower-glow', opacity: 0.1 }),
      circle(headX, headY, 6.8, { kind: 'tall-flower-glow', opacity: 0.16 }),
    );
    // 7–8 soft petals radiating around the centre disc — a full daisy (the concept's flower). Each petal
    // is a slender elongated ellipse rooted at the head centre and rotated into place; count + angle +
    // length are seeded so no two flowers are identical.
    const petals = 7 + (j01(5) > 0.5 ? 1 : 0);
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * 360 + jx(20 + i) * 10;
      const plen = 6.8 + jx(30 + i) * 1.1;
      marks.push(
        ellipse(headX, headY - plen, 2.15, plen, {
          kind: 'tall-flower-petal',
          transform: `rotate(${f(ang)} ${f(headX)} ${f(headY)})`,
        }),
      );
    }
    marks.push(circle(headX, headY, 3.4, { kind: 'tall-flower-center' }));
  } else if (failing) {
    // a wilted, nodding head: petals all droop into the lower arc, sitting low + to one side on the
    // bowed stem — the muted colour resolves CSS-side. No glow (dormant/failing is not a bloom).
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const ang = 112 + (i / (petals - 1)) * 136 + jx(20 + i) * 12; // 112–248°: hangs down + out
      const plen = 5.8 + jx(30 + i) * 1.0;
      marks.push(
        ellipse(headX, headY - plen, 1.95, plen, {
          kind: 'tall-flower-petal',
          transform: `rotate(${f(ang)} ${f(headX)} ${f(headY)})`,
        }),
      );
    }
    marks.push(circle(headX, headY, 2.9, { kind: 'tall-flower-center' }));
  } else {
    // pending: a closed teardrop bud — calm, unopened; dormant reads as the ABSENCE of bloom (the
    // stone's dark-rune precedent).
    const bx = headX;
    const by = headY;
    const budD =
      `M ${f(bx)} ${f(by - 10.5)} ` +
      `C ${f(bx - 3.7)} ${f(by - 7.5)}, ${f(bx - 3.5)} ${f(by - 1.5)}, ${f(bx)} ${f(by)} ` +
      `C ${f(bx + 3.5)} ${f(by - 1.5)}, ${f(bx + 3.7)} ${f(by - 7.5)}, ${f(bx)} ${f(by - 10.5)} Z`;
    marks.push(path(budD, { kind: 'tall-flower-bud' }));
  }

  return marks;
}

/** The flower's wrapper scale — kept at the stone's 0.6 so the scatter keep-outs (tree well, spacing,
 *  nameplate band) still hold against the same footprint they were tuned for. The whole marker scales
 *  at the WRAPPER (translate + scale — CSS only ever animates the glow-circle CHILDREN, so the wrapper
 *  transform is never clobbered). */
const MARKER_SCALE = 0.6;

/** Ray-cast point-in-polygon over a substrate cell ring. */
function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The island's UAT markers as INDIVIDUAL y-sorted drawables — one tall flower per criterion,
 *  scattered deterministically (owner call 2026-07-18: no path). Each flower is its own painter
 *  entry so it interleaves honestly with the tree + flora by depth. Placement: per-criterion
 *  id-seeded polar samples inside the island (radius 0.30–0.80·R, the wisp-orbit 0.7 y-squash),
 *  re-drawn up to 20 times to clear the tree well (which also covers the signpost beside it), the
 *  nameplate band, other flowers — and, when the island's relaxed substrate cells are provided, to
 *  land ON the island (the keep-IN, owner feedback 2026-07-18: the radius-only scatter drifted
 *  markers into the water on concave hex clusters). Deterministic rejection sampling: same input ⇒
 *  the same spots. Exhausting the draws SNAPS to the nearest free land-cell centroid (never the
 *  water) when cells are known, else keeps the last sample — every criterion ALWAYS renders.
 *  Empty/absent `uatCriteria` ⇒ nothing (the byte-for-byte absence path — the public website
 *  never sends it). */
function buildUatMarkers(
  t: SceneTerritoryInput,
  ownerCells: RelaxedCell[] | null,
): Array<{ y: number; node: SceneG }> {
  const criteria = t.uatCriteria ?? [];
  if (!criteria.length) return [];
  const land = ownerCells && ownerCells.length ? ownerCells : null;
  const onLand = (x: number, y: number): boolean =>
    !land || land.some((c) => pointInPoly(x, y, c.poly));
  const clearsSpacing = (placed: Pt[], x: number, y: number): boolean =>
    placed.every((p) => Math.hypot(x - p.x, y - p.y) > 15);
  const placed: Pt[] = [];
  const out: Array<{ y: number; node: SceneG }> = [];
  criteria.forEach((c) => {
    const k = hash(`${t.id}:marker:${c.id}`);
    let x = t.centroid.x;
    let y = t.centroid.y;
    let settled = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const ang = rand01(k + attempt * 2) * Math.PI * 2;
      const rr = (0.3 + rand01(k + attempt * 2 + 1) * 0.5) * t.radius;
      x = t.centroid.x + Math.cos(ang) * rr;
      y = t.centroid.y + Math.sin(ang) * rr * 0.7; // top-down squash, same as the wisp orbit
      const clearsTree = Math.hypot(x - t.treeSpot.x, y - t.treeSpot.y) > 36;
      const clearsPlate = y < t.labelY - 14;
      if (clearsTree && clearsPlate && clearsSpacing(placed, x, y) && onLand(x, y)) {
        settled = true;
        break;
      }
    }
    if (!settled && land) {
      // A hard-to-fit (concave) island exhausted its draws: snap to the nearest land-cell
      // centroid that keeps the stone spacing (nearest of all when every cell is crowded).
      const spots = land
        .map((cell) => cellCentroid(cell.poly))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      const free = spots.find((p) => clearsSpacing(placed, p.x, p.y)) ?? spots[0]!;
      x = free.x;
      y = free.y;
    }
    placed.push({ x, y });
    const kind: SceneKind =
      c.state === 'proven'
        ? 'tall-flower-proven'
        : c.state === 'failing'
          ? 'tall-flower-failing'
          : 'tall-flower-pending';
    out.push({
      y,
      node: g(tallFlowerMarks(c.state, k), {
        kind,
        id: c.id,
        transform: `translate(${f(x)} ${f(y)}) scale(${MARKER_SCALE})`,
      }),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// the recently-landed bloom (LandingBloom)
// ---------------------------------------------------------------------------

/** A transient, decaying halo + sparkle announcing a signed PASS. The positioning
 *  translate + age-decay opacity sit on the anchor; the animated pulse rides the
 *  inner group (so a CSS scale keyframe can't clobber the translate). Geometry is
 *  seeded by the unit id, so it never jitters between the surface's now-ticks. */
export function buildBloom(
  unitId: string,
  bloom: { ageRatio: number; outcome: 'pass' | 'fail' },
  cx: number,
  cy: number,
  r: number,
  kind: 'crown' | 'plant',
): SceneG {
  const ageOpacity = Number((0.3 + 0.65 * bloom.ageRatio).toFixed(2));
  const n = kind === 'crown' ? 4 : 3;
  const sparks: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand01(hash(`${unitId}:bloom:a${i}`)) * Math.PI * 2;
    const rr = r * (0.78 + rand01(hash(`${unitId}:bloom:r${i}`)) * 0.5);
    const sr = (kind === 'crown' ? 1.5 : 1) * (0.8 + rand01(hash(`${unitId}:bloom:s${i}`)) * 0.5);
    // top-down squash on y, same as the wisp orbit
    sparks.push(circle(Math.cos(a) * rr, Math.sin(a) * rr * 0.7, sr, { kind: 'bloom-spark' }));
  }
  const inner = g([circle(0, 0, r, { kind: 'bloom-ring' }), ...sparks], {
    kind: kind === 'crown' ? 'bloom-crown' : 'bloom-plant',
    outcome: bloom.outcome,
  });
  return g([inner], {
    kind: 'bloom-anchor',
    transform: `translate(${f(cx)} ${f(cy)})`,
    opacity: ageOpacity,
  });
}

// ---------------------------------------------------------------------------
// a capability as garden flora (GardenPlant)
// ---------------------------------------------------------------------------

/** A capability as a flower bed / berry bush / sapling (hash-picked variant),
 *  tinted by its folded status; `unhealthy` withers it to the matching dead
 *  silhouette. */
export function buildPlant(p: ScenePlantInput): SceneG {
  const variant = hash(`${p.id}:variant`) % 3;
  const dead = p.status === 'unhealthy';
  const children: SceneNode[] = [circle(0, 0, 9.5, { kind: 'flora-hit' })];
  if (dead) children.push(ellipse(0, 0.5, 8, 3.2, { kind: 'dead-ground' }));
  children.push(ellipse(1, 1, dead ? 6 : 8, dead ? 2.2 : 2.6, { kind: 'shadow' }));
  children.push(buildPlantBody(dead, variant));
  if (p.bloom) children.push(buildBloom(p.id, p.bloom, 0, -5, 8, 'plant'));
  return g(children, {
    kind: 'flora',
    status: p.status,
    // The capability id — the data hook each mapper keys interactivity on (the studio
    // wires onSelectCap from it; the website uses it as data-id for delegation).
    id: p.id,
    title: p.title,
    transform: `translate(${f(p.x)} ${f(p.y)})`,
  });
}

/** The variant-specific flora body, wrapped in a plain `<g>` (matching the studio's
 *  `body` group). Six silhouettes: dead flower-bed / dead bush / dead sapling, and
 *  the living flower-bed / berry-bush / sapling. */
function buildPlantBody(dead: boolean, variant: number): SceneG {
  if (dead && variant === 0) {
    return g([
      ellipse(0, 0.4, 8.5, 3, { kind: 'flora-bed', opacity: 0.7 }),
      path('M 0.5 0 C 0.6 -6 0.4 -10 2.6 -11.4 C 4.4 -12.4 5.8 -10.8 5.6 -9.2', {
        kind: 'flora-dead-stem',
        strokeWidth: 1.2,
      }),
      circle(5.6, -8.2, 1.7, { kind: 'flora-dead-head', accent: true }),
      path('M -3.5 0 C -4 -5 -4.5 -8.5 -2.5 -10 C -1 -11 0.5 -10 0.8 -8.4', {
        kind: 'flora-dead-stem',
        strokeWidth: 1.1,
      }),
      circle(0.8, -7.6, 1.4, { kind: 'flora-dead-head' }),
      path('M 4.2 0 L 4.8 -5.2 L 7.6 -7.4', { kind: 'flora-dead-stem', strokeWidth: 1.1 }),
      circle(-7, -0.5, 1, { kind: 'litter' }),
      circle(2.5, 1.2, 1, { kind: 'litter' }),
      circle(6.5, 0.2, 1, { kind: 'litter' }),
    ]);
  }
  if (dead && variant === 1) {
    return g([
      path(
        'M 0 0 L -1 -4.5 M -1 -4.5 L -5 -8.5 M -1 -4.5 L 1.5 -9.5 M 1.5 -9.5 L 4.5 -11.5 M 1.5 -9.5 L 0.5 -12.5 M 0 -2.5 L 4 -6',
        { kind: 'flora-dead-twig', strokeWidth: 1.1 },
      ),
      circle(-4.5, -8, 1.1, { kind: 'litter', accent: true }),
      circle(4, -11, 1.1, { kind: 'litter' }),
      circle(-2.5, 0.8, 1, { kind: 'litter' }),
    ]);
  }
  if (dead) {
    return g([
      path('M 0 0 C 0.4 -5 1.5 -9 3.5 -13 M 2 -8.5 L -1.5 -12 M 3 -11 L 6 -13.5', {
        kind: 'flora-dead-twig',
        strokeWidth: 1.4,
      }),
      circle(-3, 0.8, 1, { kind: 'litter' }),
      circle(1.5, 1.4, 1, { kind: 'litter' }),
      circle(5, 0.4, 1, { kind: 'litter', accent: true }),
    ]);
  }
  if (variant === 0) {
    const petals = [0, 1, 2, 3, 4].map((k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      return circle(0.2 + Math.cos(a) * 2.3, -13 + Math.sin(a) * 2.3, 1.5, { kind: 'flora-light' });
    });
    return g([
      ellipse(0, 0.4, 8.5, 3, { kind: 'flora-bed' }),
      path('M -1 0 Q -7 -3 -9 -7 Q -4.5 -5.5 -1 0 Z', { kind: 'flora-dark' }),
      path('M 1.5 0 Q 7.5 -2.5 9 -6 Q 5 -5 1.5 0 Z', { kind: 'flora-dark' }),
      path('M -4 0 C -4.4 -4 -4.8 -7 -5.2 -10', { kind: 'flora-stem' }),
      path('M 0 0 C 0.2 -5 0.3 -9 0.2 -13', { kind: 'flora-stem' }),
      path('M 4 0 C 4.5 -4 5 -6.5 5.6 -9', { kind: 'flora-stem' }),
      circle(-5.2, -10, 2.6, { kind: 'flora-light' }),
      circle(5.6, -9, 2.3, { kind: 'flora-light' }),
      ...petals,
      circle(0.2, -13, 1.3, { kind: 'flora-core' }),
    ]);
  }
  if (variant === 1) {
    return g([
      polygon('0,-12.5 5.5,-10.5 8.5,-5.5 7,-1 0,0.8 -7,-1 -8.5,-5.5 -5.5,-10.5', {
        kind: 'flora-dark',
      }),
      polygon('-1,-12.5 4.5,-10.8 6,-7 0.5,-5.6 -4.8,-7.4 -4.6,-10.6', { kind: 'flora-light' }),
      circle(-3.5, -4.5, 1.5, { kind: 'flora-core' }),
      circle(2, -7.5, 1.5, { kind: 'flora-core' }),
      circle(4.5, -3.5, 1.4, { kind: 'flora-core' }),
    ]);
  }
  return g([
    path('M -1.2 0 C -1 -4 -0.8 -7 -0.6 -9.5 L 0.9 -9.5 C 1 -7 1.2 -4 1.4 0 Z', {
      kind: 'sapling-trunk',
    }),
    polygon('0,-18.5 5.4,-15.4 6.6,-10.2 3.4,-7.2 -3.4,-7.2 -6.6,-10.2 -5.4,-15.4', {
      kind: 'flora-dark',
    }),
    polygon('-0.6,-18.3 3.8,-15.8 3.4,-12 -1.6,-11.4 -4.4,-14.2', { kind: 'flora-light' }),
  ]);
}

// ---------------------------------------------------------------------------
// conifer decor (DecorTree)
// ---------------------------------------------------------------------------

/** A small leaning conifer with a snow cap — deliberately small so the central
 *  story tree dominates the island. The colour band (`c-N`) comes from the seed. */
export function buildConifer(x: number, y: number, h: number, seed: number): SceneG {
  const lean = (rand01(seed) - 0.5) * 2;
  const w = h * 0.42;
  return g(
    [
      ellipse(1, 1, w * 0.9, 2.4, { kind: 'shadow' }),
      path(`M ${f(lean)} ${f(-h)} L ${f(w)} 0 L ${f(-w)} 0 Z`, {
        kind: 'conifer-body',
        variant: seed % 3,
      }),
      path(
        `M ${f(lean)} ${f(-h)} L ${f(lean + w * 0.45)} ${f(-h * 0.45)} L ${f(lean - w * 0.45)} ${f(-h * 0.45)} Z`,
        { kind: 'conifer-snow' },
      ),
    ],
    { kind: 'conifer', transform: `translate(${f(x)} ${f(y)})` },
  );
}

// ---------------------------------------------------------------------------
// the in-flight build wisps (the harness orbit)
// ---------------------------------------------------------------------------

/** The orbiting build-harness layer: a wisp orbits a story while a leaf agent is
 *  mechanically building one of its units. Live-data driven (the surface folds
 *  which builds are in-flight); the core derives each orbit phase from the runId
 *  and lays the glow/dot/hit at the orbit radius. The mapper drives the rotation
 *  (the studio's SMIL `animateTransform`, the website's CSS) from `phase`. */
function buildWisps(t: SceneTerritoryInput): SceneG | null {
  if (!t.wisps.length) return null;
  const orbitR = t.radius * 0.72 + 10;
  const wisps = t.wisps.map((w) => {
    const phase = rand01(hash(w.runId)) * 360;
    return g(
      [
        g(
          [
            circle(0, 0, 12, { kind: 'wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0)` },
        ),
      ],
      // `phase` is the orbit ROTATION (geometry); `phaseBand` is the red→green build state
      // (ADR-0048 §3 v2); `colourState` is the optional live subagent-role tint the work-event
      // stamped (ADR-0138 §5) — three independent fields (location ⟂ form).
      {
        kind: 'wisp',
        title: w.title,
        phase,
        phaseBand: wispBand(w.phase),
        ...(w.colourState ? { colourState: w.colourState } : {}),
      },
    );
  });
  return g(wisps, { kind: 'wisps', transform: `translate(${f(t.centroid.x)} ${f(t.centroid.y)})` });
}

// ---------------------------------------------------------------------------
// the story-CLAIM wisps (the coordination orbit, ADR-0138 §5)
// ---------------------------------------------------------------------------

/** The orbiting story-CLAIM layer: a wisp orbits a story while a SESSION is working it (someone is
 *  here — the coordination signal, distinct from "a proof is being driven"). Live-data driven (the
 *  surface folds which stories are claimed); the core derives each orbit phase from the claim `key`
 *  and lays the glow/dot/hit at the orbit radius. The mapper drives the rotation from `phase`.
 *
 *  §5 honesty wall (non-negotiable): a claim wisp is a DISTINCT drawable family (`claim-wisp*` kinds)
 *  carrying a `colourState` that is NEVER `green`/`bloom` — only a signed verdict paints the green
 *  bloom (ADR-0045). A claimed-but-not-proven story can therefore never render as a proven-green one.
 *  Orbits a touch wider than the build wisp so the two layers read as distinct when both are present. */
/** The window-shopping orbit radius (ADR-0212 channel 1): small and LOCAL — deliberately far tighter
 *  than the work stage's whole-island orbit, so the two stages read apart on position alone. */
const HOVER_ORBIT_R = 9;

function buildClaimWisps(t: SceneTerritoryInput): SceneG | null {
  // `claims` is OPTIONAL (a surface with no live-claim concept omits it) — absent/empty ⇒ no layer.
  const claims = t.claims ?? [];
  if (!claims.length) return null;
  const orbitR = t.radius * 0.72 + 22;
  // the hover rest spot is anchored above the story tree (the layer's frame is the centroid).
  const treeDx = t.treeSpot.x - t.centroid.x;
  const treeDy = t.treeSpot.y - t.centroid.y;
  let queueIndex = 0;
  const wisps = claims.map((c) => {
    // ADR-0200 D2: an ABSENT grade IS the work claim — every pre-grade surface keeps today's orbit.
    const grade = c.grade ?? 'work';
    if (grade === 'exploring') {
      // WINDOW SHOPPING (ADR-0200 D7, position channel restated by ADR-0212): a session is
      // reading/planning here — a SMALL LOCAL ORBIT beside/above the story tree, with a per-key
      // jitter on the rest spot so several hoverers never stack exactly. ADR-0212 REVERSES
      // ADR-0200 D7's "stationary by construction": window shopping now carries its own orbit
      // `phase`, so position alone separates it from the whole-island work orbit (a spinning hover
      // wisp is the DECISION — see ADR-0212 Consequences, not a regression).
      //
      // THREE nesting levels, and the split is load-bearing: an SVG `animateTransform` rotate
      // REPLACES the `transform` attribute on the node it animates, so the rest spot and the
      // rotation can never share one `g` — the dot would sweep the centroid instead of its rest
      // spot. Outer g = the rest spot; middle g = the kind-bearing node the mapper rotates;
      // innermost g = the small orbit radius.
      const k = hash(c.key);
      const hx = treeDx + (rand01(k + 1) - 0.5) * 18;
      const hy = treeDy - (orbitR + 12) + (rand01(k + 2) - 0.5) * 10;
      const phase = rand01(k) * 360;
      return g(
        [
          g(
            [
              g(
                [
                  circle(0, 0, 12, { kind: 'hover-wisp-hit' }),
                  circle(0, 0, 6.5, { kind: 'hover-wisp-glow' }),
                  circle(0, 0, 2.8, { kind: 'hover-wisp-dot' }),
                ],
                { transform: `translate(${f(HOVER_ORBIT_R)} 0)` },
              ),
            ],
            // `title` carries the claim's intent prose; NEVER an `outcome`/`bloom` (the §5 wall).
            { kind: 'hover-wisp', title: c.title, phase, colourState: c.colourState },
          ),
        ],
        { transform: `translate(${f(hx)} ${f(hy)})` },
      );
    }
    if (grade === 'waiting') {
      // QUEUED (ADR-0200 D7): a visible ordered line anchored just outside the orbit ring — each
      // waiter placed by its queue INDEX in INPUT order (the surface sends waiters ordered by
      // claimedAt — deterministic from array order, never hash-random) and stationary (no `phase`).
      const qx = orbitR + 14 + queueIndex * 16;
      queueIndex += 1;
      return g(
        [
          g(
            [
              circle(0, 0, 12, { kind: 'queue-wisp-hit' }),
              circle(0, 0, 6.5, { kind: 'queue-wisp-glow' }),
              circle(0, 0, 2.8, { kind: 'queue-wisp-dot' }),
            ],
            { transform: `translate(${f(qx)} 0)` },
          ),
        ],
        // NEVER carries an `outcome`/`bloom` (the §5 wall).
        { kind: 'queue-wisp', title: c.title, colourState: c.colourState },
      );
    }
    // WORK — today's orbiting claim wisp, unchanged (the ADR-0200 D2 regression lock).
    const phase = rand01(hash(c.key)) * 360;
    return g(
      [
        g(
          [
            circle(0, 0, 12, { kind: 'claim-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'claim-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'claim-wisp-dot' }),
          ],
          { transform: `translate(${f(orbitR)} 0)` },
        ),
      ],
      // `phase` is the orbit ROTATION (geometry); `colourState` is the subagent role (form) — two
      // independent fields (location ⟂ form). NEVER carries an `outcome`/`bloom` (the §5 wall).
      // `phaseBand` (ADR-0212) is the live build state folded onto this ONE body, replacing the
      // separate orbiting build wisp: colour stays INTENT (`colourState`, never green), the band is
      // the build phase. Absent when no build runs on this story — back-compat byte-for-byte.
      {
        kind: 'claim-wisp',
        title: c.title,
        phase,
        colourState: c.colourState,
        ...(c.phase ? { phaseBand: wispBand(c.phase) } : {}),
      },
    );
  });
  return g(wisps, {
    kind: 'claim-wisps',
    transform: `translate(${f(t.centroid.x)} ${f(t.centroid.y)})`,
  });
}

/** The DEPARTURE layer (ADR-0200 D7): a recently-released claim fading out — a stationary
 *  `departing-wisp` per departure, resting where the hover family rests and drifting UPWARD
 *  proportional to `ageRatio` (the "leaving" translation, encoded deterministically in geometry).
 *  `ageRatio` (0..1, surface-computed) rides the node for the mapper's fade — the curve itself is
 *  the mapper/CSS's job (the later operator-attested LOOK stage). Same §5 honesty wall as the claim
 *  families: a departure is a coordination trace, never a bloom, never an `outcome`. Absent/empty ⇒
 *  no layer (the website back-compat mirror of `buildClaimWisps`). */
function buildDepartingWisps(t: SceneTerritoryInput): SceneG | null {
  const departures = t.departures ?? [];
  if (!departures.length) return null;
  const orbitR = t.radius * 0.72 + 22;
  const treeDx = t.treeSpot.x - t.centroid.x;
  const treeDy = t.treeSpot.y - t.centroid.y;
  const wisps = departures.map((d) => {
    const k = hash(d.key);
    const x = treeDx + (rand01(k + 1) - 0.5) * 18;
    const y = treeDy - (orbitR + 12) - d.ageRatio * 24;
    return g(
      [
        g(
          [
            circle(0, 0, 12, { kind: 'departing-wisp-hit' }),
            circle(0, 0, 6.5, { kind: 'departing-wisp-glow' }),
            circle(0, 0, 2.8, { kind: 'departing-wisp-dot' }),
          ],
          { transform: `translate(${f(x)} ${f(y)})` },
        ),
      ],
      // stationary (no `phase`); `ageRatio` is the mapper's fade input. NEVER `outcome`/`bloom`.
      { kind: 'departing-wisp', title: d.title, ageRatio: d.ageRatio },
    );
  });
  return g(wisps, {
    kind: 'departing-wisps',
    transform: `translate(${f(t.centroid.x)} ${f(t.centroid.y)})`,
  });
}

// ---------------------------------------------------------------------------
// the nameplate (world-plate)
// ---------------------------------------------------------------------------

function buildPlate(t: SceneTerritoryInput): SceneG {
  const p = t.plate;
  return g(
    [
      rect(0, 0, p.w, p.h, p.rx, { kind: 'plate-bg' }),
      text(p.w / 2, p.idY, p.idText, 'middle', { kind: 'plate-id' }),
      text(p.w / 2, p.subY, p.subText, 'middle', { kind: 'plate-sub' }),
    ],
    {
      kind: 'plate',
      title: p.title,
      transform: `translate(${f(t.centroid.x - p.w / 2)} ${f(t.labelY)})`,
    },
  );
}

// ---------------------------------------------------------------------------
// capability PARCELS — the land IS the capability (forest-parcels inc 1)
// ---------------------------------------------------------------------------
//
// A parcels-present island sub-partitions its EXISTING relaxed substrate cells among its
// capabilities (equal-weight Voronoi over each parcel's seed), tints each cell by its assigned cap's
// status, and surfaces each parcel through its theme's `SurfaceFn`. THE SPLICE SEAM below (`SurfaceFn`
// + the `SURFACES` registry) is the contract a designer swarm plugs into (ADR-0208): each theme
// returns `{ ground, flora }` from the parcel's cells / status / testCount / a seeded rand. The three
// functions ported here are the INITIAL in-repo implementations — designer-refined ones splice over
// them later (the seam's shape + the kinds vocabulary are frozen; the craft is not). Everything is
// deterministic (a seeded rand stream, no Math.random).

/** One ground cell handed to a `SurfaceFn`: the resolved polygon + its centroid (the flora anchor).
 *  The spike's `{ poly, cx, cy }`; its `boundary` flag drove a per-cell hem stroke that would need
 *  NEW ground CSS, so it is dropped here — the ground reuses the existing `st-<status>` cell CSS. */
export interface ParcelCell {
  poly: Pt[];
  cx: number;
  cy: number;
}

/** One placed flora item a `SurfaceFn` emits — the spike's `{ y, svg }`, with `svg` now a SceneNode.
 *  `y` is the item's painter-anchor (the island y-sorts flora with the tree so southern art overlaps
 *  northern). */
export interface ParcelFloraMark {
  y: number;
  node: SceneNode;
}

/** THE SPLICE SEAM (ADR-0208): a per-theme surface painter. Frozen contract
 *  `(cells, status, testCount, rand) => { ground, flora }` — turns a capability parcel's cells into
 *  its tinted ground cell nodes + its placed flora marks. `rand` is a seeded STATEFUL stream (the
 *  core seeds it per parcel), so a `SurfaceFn` MUST stay deterministic — draw only from `rand`, never
 *  Math.random. A designer swarm ships refined implementations that splice into `SURFACES`. */
export type SurfaceFn = (
  cells: ParcelCell[],
  status: SceneStatus,
  testCount: number,
  rand: () => number,
) => { ground: SceneNode[]; flora: ParcelFloraMark[] };

/** A seeded mulberry32 STREAM `() => number` (a `SurfaceFn` draws many values). Mirrors the spike's
 *  `mulberry32(hash(seed))`; `rand01` in rng.ts is a single-STEP variant, so the stream lives here.
 *  Browser-safe, deterministic. */
function streamRand(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shared parcel GROUND: every cell reused as the existing `cell` kind carrying the parcel's
 *  folded status (so `st-<status>` colours it — ZERO new ground CSS) + a rand tone variant. */
function parcelGround(cells: ParcelCell[], status: SceneStatus, rand: () => number): SceneNode[] {
  return cells.map((c) =>
    path(polyPath(c.poly), { kind: 'cell', variant: Math.floor(rand() * 3), status }),
  );
}

// --- the three DESIGNER-AUTHORED theme surfaces (ADR-0208 splice) ------------------
//
// Ported faithfully from the designer swarm's `meadow.js` / `woodland.js` / `heath.js` (SVG-string
// medium → SceneNode). The designers' own GROUND passes + `cell.boundary` hems are DROPPED — the
// core's `parcelGround` owns the per-cell status-tinted ground (zero new ground CSS); only each
// theme's FLORA vocabulary is ported, verbatim in geometry / density / status-composition / placement.
// Every designer mark family maps onto the frozen generic kinds (`parcel-blade` / `parcel-shrub` /
// `parcel-stem` / `parcel-flower` + shared `shadow`); cel-shading faces and within-tier colour
// rotation ride `variant` (v0 light face, v1 dark face, v2+ rotation — a distinct sub-look like the
// woodland sapling canopy takes its own variants, never a new kind); COLOUR itself stays CSS-side
// (`apps/studio/src/index.css`, keyed `.parcel-flora.theme-<t>.st-<status>` × mark × `.v-<n>`). Each
// function consumes `rand` in the DESIGNER's exact order, so it stays pure + deterministic (the
// scene determinism test enforces identical output for identical input).

/** Wrap a theme's absolute-coord marks as one placed `parcel-flora` item at painter-anchor `y`. The
 *  capId is stamped later (in `buildTerritorySurface`, where the parcel identity is known). */
function parcelFloraItem(
  theme: SurfaceTheme,
  status: SceneStatus,
  y: number,
  marks: SceneNode[],
  opacity?: number,
): ParcelFloraMark {
  return {
    y,
    node: g(marks, {
      kind: 'parcel-flora',
      theme,
      status,
      ...(opacity != null ? { opacity } : {}),
    }),
  };
}

/** DRIFTS & CLEARINGS (the owner-directed vegetation refinement, 2026-07-18): every theme spends
 *  its density budget inside 1–2 seeded drift BEDS per parcel instead of an even all-cells
 *  scatter — massed vegetation with open lawn between reads as a garden, not static. The drift's
 *  AREA grows with the test count (spread = 7 + tests·0.55; two beds once tests ≥ 7), so density
 *  stays legible as "how big is the bed" while the counts themselves are untouched. Deterministic:
 *  anchors and every placement draw only from the parcel's seeded `rand`. The y-radius wears the
 *  same top-down squash the wisp orbit uses. */
function driftSpot(cells: ParcelCell[], tests: number, rand: () => number): () => Pt {
  const anchors: Pt[] = [];
  const n = tests >= 7 ? 2 : 1;
  for (let d = 0; d < n; d++) {
    const c = cells[Math.floor(rand() * cells.length)]!;
    anchors.push({ x: c.cx, y: c.cy });
  }
  const spread = 7 + Math.max(0, tests) * 0.55;
  return (): Pt => {
    const a = anchors[Math.floor(rand() * anchors.length)]!;
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * spread;
    return { x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr * 0.6 };
  };
}

/** MEADOW (meadow.js) — long-grass tufts are the density bulk, healthy ground crowned with 4-petal
 *  wildflowers (ONE species — the colour rotation retired with the drift refinement; hue is CSS's),
 *  amber sprouts while proposed/building, fallen twigs + wilt-red flecks when unhealthy. Budget is
 *  planted in drift beds (`driftSpot`), per-item ground shadows retired — the marks sit in massed
 *  beds, not as individually-shadowed objects. grass → `parcel-blade`, shrub → `parcel-shrub`,
 *  flower/bud/fleck → `parcel-flower`, flower-stem/sprout-stem/twig/wilt → `parcel-stem`. */
function meadowSurface(
  cells: ParcelCell[],
  status: SceneStatus,
  tests: number,
  rand: () => number,
): { ground: SceneNode[]; flora: ParcelFloraMark[] } {
  const ground = parcelGround(cells, status, rand);
  const flora: ParcelFloraMark[] = [];
  if (!cells.length) return { ground, flora };

  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('meadow', status, y, marks);

  // density budget (verbatim): grass is the ramp bulk; shrubs a "grown" mark only where standing bulk
  // grows (healthy/building/unhealthy); flowers a healthy (mapped-rare) accent.
  const shrubEligible = status === 'healthy' || status === 'building' || status === 'unhealthy';
  let grassCount: number;
  let shrubCount: number;
  let flowerCount: number;
  if (tests <= 0) {
    grassCount = Math.min(2, cells.length);
    shrubCount = 0;
    flowerCount = 0;
  } else {
    grassCount = Math.round(2 + tests * 1.9);
    shrubCount = shrubEligible ? Math.round(tests / 2.6) : 0;
    flowerCount =
      status === 'healthy'
        ? Math.round(Math.max(0, tests - 1) * 0.7)
        : status === 'mapped'
          ? tests >= 8
            ? 1
            : 0
          : 0;
  }
  if (status === 'unhealthy') shrubCount = Math.round(shrubCount * 0.7);
  if (status === 'unknown') grassCount = Math.round(grassCount * 0.6);
  if (status === 'mapped' || status === 'proposed') grassCount = Math.round(grassCount * 0.85);
  const lushBlade = (status === 'healthy' || status === 'building') && tests >= 6;

  // the drift beds: the whole budget plants inside them (open lawn is part of the drawing)
  const spot = driftSpot(cells, tests, rand);

  // mark: long grass tuft — 3-4 filled two-face blades (dark back-face v1 under a narrower light
  // front-face v0).
  const grassTuft = (x: number, y: number): SceneNode[] => {
    const n = status === 'unknown' ? 2 : lushBlade && rand() < 0.55 ? 4 : 3;
    const marks: SceneNode[] = [];
    for (let b = 0; b < n; b++) {
      const bx = x + (b - (n - 1) / 2) * 2.0 + (rand() - 0.5) * 0.7;
      const lean = (rand() - 0.5) * 3.4;
      const h = (status === 'unknown' ? 2.6 : 3.4) + rand() * 2.4;
      const tipx = bx + lean;
      const tipy = y - h;
      const midx = bx + lean * 0.45;
      const midy = y - h * 0.55;
      marks.push(
        path(
          `M ${f(bx - 0.75)} ${f(y)} Q ${f(midx - 0.5)} ${f(midy)} ${f(tipx)} ${f(tipy)} Q ${f(midx + 0.75)} ${f(midy)} ${f(bx + 0.75)} ${f(y)} Z`,
          { kind: 'parcel-blade', variant: 1 },
        ),
      );
      marks.push(
        path(
          `M ${f(bx - 0.28)} ${f(y)} Q ${f(midx - 0.16)} ${f(midy)} ${f(tipx)} ${f(tipy)} Q ${f(midx + 0.35)} ${f(midy)} ${f(bx + 0.45)} ${f(y)} Z`,
          { kind: 'parcel-blade', variant: 0 },
        ),
      );
    }
    return marks;
  };

  // mark: small shrub — 3 dark under-lobes (v1) set a bushy silhouette, 2 light crown lobes (v0), a
  // dark berry only when unhealthy (the healthy red-berry accent retired with the quiet palette).
  const shrub = (x: number, y: number): SceneNode[] => {
    const s = 1.1 + rand() * 0.4;
    const marks: SceneNode[] = [];
    const lobes: readonly (readonly [number, number, number])[] = [
      [-2.3, 0.9, 1.9],
      [2.1, 1.1, 2.0],
      [0.2, -0.6, 2.5],
    ];
    for (const [lx0, ly0, lr0] of lobes) {
      const lx = lx0 * s + (rand() - 0.5) * 0.8;
      const ly = ly0 * s + (rand() - 0.5) * 0.5;
      const lr = lr0 * s;
      marks.push(ellipse(x + lx, y + ly, lr, lr * 0.78, { kind: 'parcel-shrub', variant: 1 }));
    }
    marks.push(ellipse(x - 1.3 * s, y - 1.2 * s, 1.9 * s, 1.35 * s, { kind: 'parcel-shrub', variant: 0 }));
    marks.push(
      ellipse(x + 0.9 * s, y - 0.9 * s, 1.3 * s, 0.95 * s, { kind: 'parcel-shrub', variant: 0, opacity: 0.9 }),
    );
    if (status === 'unhealthy' && rand() < 0.7) {
      marks.push(circle(x + (rand() - 0.5) * 3.4 * s, y - rand() * 1.4 * s, 0.65 * s, { kind: 'parcel-flower', variant: 3 }));
    }
    return marks;
  };

  // mark: flower — stem (parcel-stem v1) + 4-petal blossom (ONE species: petal v0 — the island
  // agrees on a flower; the old 0/4/5/6 hue rotation read as confetti) + core (v1) + a speck (v2).
  const flower = (x: number, y: number): SceneNode[] => {
    const petalV = 0;
    const top = y - 4.6 - rand() * 1.6;
    const marks: SceneNode[] = [];
    marks.push(path(`M ${f(x)} ${f(y)} L ${f(x)} ${f(top + 1.0)}`, { kind: 'parcel-stem', variant: 1, strokeWidth: 0.9 }));
    for (const [dx, dy] of [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]] as const) {
      marks.push(circle(x + dx, top + dy, 1.35, { kind: 'parcel-flower', variant: petalV }));
    }
    marks.push(circle(x, top, 1.05, { kind: 'parcel-flower', variant: 1 }));
    marks.push(circle(x - 0.3, top - 0.3, 0.4, { kind: 'parcel-flower', variant: 2 }));
    return marks;
  };

  // mark: sprout (proposed = muted straw bud, building = amber active bud) — stem (parcel-stem v1) +
  // bud (dark v1 / light v0 / highlight v2) + two seed-leaves (parcel-stem v0).
  const sprout = (x: number, y: number): SceneNode[] => {
    const h = 3.4 + rand() * 2.0;
    const lean = (rand() - 0.5) * 2.0;
    const tipx = x + lean;
    const tipy = y - h;
    const marks: SceneNode[] = [];
    marks.push(path(`M ${f(x)} ${f(y)} Q ${f(x + lean * 0.4)} ${f(y - h * 0.55)} ${f(tipx)} ${f(tipy)}`, { kind: 'parcel-stem', variant: 1, strokeWidth: 1.0 }));
    marks.push(circle(tipx, tipy - 0.9, 1.45, { kind: 'parcel-flower', variant: 1 }));
    marks.push(circle(tipx - 0.35, tipy - 1.25, 0.8, { kind: 'parcel-flower', variant: 0 }));
    marks.push(circle(tipx - 0.55, tipy - 1.45, 0.32, { kind: 'parcel-flower', variant: 2 }));
    marks.push(path(`M ${f(x - 0.35)} ${f(y - 0.5)} Q ${f(x - 1.55)} ${f(y - 1.05)} ${f(x - 2.0)} ${f(y - 2.0)}`, { kind: 'parcel-stem', variant: 0, strokeWidth: 0.65, opacity: 0.85 }));
    marks.push(path(`M ${f(x + 0.35)} ${f(y - 0.6)} Q ${f(x + 1.4)} ${f(y - 1.0)} ${f(x + 1.8)} ${f(y - 1.8)}`, { kind: 'parcel-stem', variant: 0, strokeWidth: 0.55, opacity: 0.7 }));
    return marks;
  };

  // mark: unhealthy fallen twig (parcel-stem v0 + bright fleck v0) OR a drooping wilt stem (parcel-stem
  // v1 + dark fleck v1 + bright fleck v0).
  const wilt = (x: number, y: number): SceneNode[] => {
    if (rand() < 0.5) {
      const cw = 3.2 + rand() * 2.0;
      return [
        path(`M ${f(x - cw)} ${f(y)} L ${f(x - cw * 0.3)} ${f(y + 0.8)} L ${f(x + cw * 0.35)} ${f(y - 0.6)} L ${f(x + cw)} ${f(y + 0.6)}`, { kind: 'parcel-stem', variant: 0, strokeWidth: 1.0, opacity: 0.85 }),
        circle(x + cw * 0.35, y - 1.3, 0.7, { kind: 'parcel-flower', variant: 0 }),
      ];
    }
    const dir = rand() < 0.5 ? -1 : 1;
    const th = 3.6 + rand() * 1.6;
    return [
      path(`M ${f(x)} ${f(y)} Q ${f(x + dir * 0.5)} ${f(y - th)} ${f(x + dir * 2.3)} ${f(y - th + 1.6)}`, { kind: 'parcel-stem', variant: 1, strokeWidth: 1.0 }),
      circle(x + dir * 2.3, y - th + 1.6, 1.05, { kind: 'parcel-flower', variant: 1 }),
      circle(x + dir * 1.9, y - th + 1.3, 0.5, { kind: 'parcel-flower', variant: 0 }),
    ];
  };

  // assembly (counts verbatim): shrubs first (grass reads over them), then the grass bulk, then
  // the status-specific accent layer — all planted inside the drift beds.
  for (let k = 0; k < shrubCount; k++) {
    const ps = spot();
    flora.push(item(ps.y + 1, shrub(ps.x, ps.y)));
  }
  for (let k = 0; k < grassCount; k++) {
    const pg = spot();
    const marks = grassTuft(pg.x, pg.y);
    if (status === 'unhealthy' && rand() < 0.4) marks.push(...wilt(pg.x + 3, pg.y));
    flora.push(item(pg.y, marks));
  }
  if (status === 'healthy' || (status === 'mapped' && flowerCount)) {
    for (let k = 0; k < flowerCount; k++) {
      const pf = spot();
      flora.push(item(pf.y, flower(pf.x, pf.y)));
    }
  }
  if (status === 'proposed' || status === 'building') {
    const sproutCount = tests <= 0 ? 0 : Math.max(1, Math.round(tests * (status === 'building' ? 0.6 : 0.45)));
    for (let k = 0; k < sproutCount; k++) {
      const psp = spot();
      flora.push(item(psp.y, sprout(psp.x, psp.y)));
    }
  }
  if (status === 'unhealthy') {
    const wiltCount = tests <= 0 ? 0 : Math.max(1, Math.round(tests * 0.4));
    for (let k = 0; k < wiltCount; k++) {
      const pw = spot();
      flora.push(item(pw.y, wilt(pw.x, pw.y)));
    }
  }
  return { ground, flora };
}

/** WOODLAND (woodland.js) — a fern-frond understory (density bulk) with leafy undershrubs, anemone
 *  blooms, and a BONUS sapling canopy at high density; withered twigs + red flecks when unhealthy.
 *  fern → `parcel-blade`; undershrub → `parcel-shrub` (v0/v1); sapling CROWN → `parcel-shrub`
 *  (v2/v3 — the distinct canopy sub-look on its own variants, per the frozen vocab); flower →
 *  `parcel-flower`; flower-stem/trunk/twig → `parcel-stem` (twig v0 / flower-stem v1 / trunk v2). */
function woodlandSurface(
  cells: ParcelCell[],
  status: SceneStatus,
  tests: number,
  rand: () => number,
): { ground: SceneNode[]; flora: ParcelFloraMark[] } {
  const ground = parcelGround(cells, status, rand);
  const flora: ParcelFloraMark[] = [];
  if (!cells.length) return { ground, flora };

  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('woodland', status, y, marks);
  const fleck = (x: number, y: number): SceneNode => circle(x, y, 0.8, { kind: 'parcel-flower', variant: 0 });
  const distressed = status === 'unhealthy';

  const bladePath = (
    x: number,
    y: number,
    tipx: number,
    tipy: number,
    midx: number,
    midy: number,
    bw: number,
  ): string =>
    `M${f(x - bw * 0.5)} ${f(y)} Q${f(midx - bw * 0.4)} ${f(midy)} ${f(tipx)} ${f(tipy)} Q${f(midx + bw * 0.4)} ${f(midy)} ${f(x + bw * 0.5)} ${f(y)} Z`;

  // the drift beds: the whole budget plants inside them (the old spread-maximising pick retired —
  // massing is the point now).
  const spot = driftSpot(cells, tests, rand);

  // mark: fern tuft — each blade a dark back-half (v1) under a narrower light front-half (v0).
  const fern = (x: number, y: number): { y: number; marks: SceneNode[] } => {
    const s = 1.05 + rand() * 0.4;
    if (distressed) {
      const marks: SceneNode[] = [];
      marks.push(
        path(
          `M${f(x - 1.2 * s)} ${f(y)} L${f(x - 2.3 * s)} ${f(y - 3 * s)} M${f(x + 0.6 * s)} ${f(y)} L${f(x + 1.9 * s)} ${f(y - 3.4 * s)} M${f(x - 0.3 * s)} ${f(y)} L${f(x)} ${f(y - 3.9 * s)}`,
          { kind: 'parcel-stem', variant: 0, strokeWidth: 0.9 },
        ),
      );
      marks.push(fleck(x + 1.9 * s, y - 3.6 * s));
      return { y, marks };
    }
    const n = 3 + Math.floor(rand() * 2);
    const marks: SceneNode[] = [];
    for (let b = 0; b < n; b++) {
      const t = n === 1 ? 0.5 : b / (n - 1);
      const lean = (t - 0.5) * 5.6 * s;
      const h = 5.2 * s * (0.82 + rand() * 0.34);
      const tipx = x + lean;
      const tipy = y - h;
      const midx = x + lean * 0.55;
      const midy = y - h * 0.6;
      const bw = 2.0 * s;
      marks.push(path(bladePath(x, y, tipx, tipy, midx, midy, bw), { kind: 'parcel-blade', variant: 1 }));
      const lTipx = x + lean * 0.92 - bw * 0.16;
      const lTipy = y - h * 0.86;
      const lMidx = x + lean * 0.5 - bw * 0.12;
      const lMidy = y - h * 0.5;
      marks.push(path(bladePath(x, y, lTipx, lTipy, lMidx, lMidy, bw * 0.52), { kind: 'parcel-blade', variant: 0 }));
    }
    return { y, marks };
  };

  // mark: undershrub — side lump + main dome (dark v1) + upper-left highlight lobe (light v0).
  const shrub = (x: number, y: number): { y: number; marks: SceneNode[] } => {
    const s = 0.85 + rand() * 0.35;
    if (distressed) {
      const marks: SceneNode[] = [];
      marks.push(
        path(
          `M${f(x - 1.6 * s)} ${f(y)} L${f(x - 3.0 * s)} ${f(y - 3.6 * s)} M${f(x + 1.0 * s)} ${f(y)} L${f(x + 2.6 * s)} ${f(y - 4.2 * s)} M${f(x - 0.2 * s)} ${f(y)} L${f(x + 0.2 * s)} ${f(y - 4.8 * s)}`,
          { kind: 'parcel-stem', variant: 0, strokeWidth: 1 },
        ),
      );
      marks.push(fleck(x - 3.0 * s, y - 3.8 * s), fleck(x + 2.6 * s, y - 4.4 * s));
      return { y, marks };
    }
    const marks: SceneNode[] = [];
    const lumpSide = rand() < 0.5 ? -1 : 1;
    marks.push(ellipse(x + lumpSide * 2.6 * s, y + 0.7 * s, 2.3 * s, 1.7 * s, { kind: 'parcel-shrub', variant: 1 }));
    marks.push(ellipse(x, y, 3.8 * s, 2.7 * s, { kind: 'parcel-shrub', variant: 1 }));
    marks.push(ellipse(x - 1.3 * s, y - 1.0 * s, 2.1 * s, 1.4 * s, { kind: 'parcel-shrub', variant: 0 }));
    return { y: y + 2.5 * s, marks };
  };

  // mark: anemone bloom — stem (parcel-stem v1) + shadow petals (v1) + lit petals (v0) + core (v2).
  const flower = (x: number, y: number): { y: number; marks: SceneNode[] } | null => {
    if (distressed) return null;
    const stemH = 3.4 + rand() * 1.4;
    const top = y - stemH;
    const marks: SceneNode[] = [];
    marks.push(path(`M${f(x)} ${f(y)} Q${f(x + 0.4)} ${f(y - stemH * 0.6)} ${f(x)} ${f(top)}`, { kind: 'parcel-stem', variant: 1, strokeWidth: 0.6 }));
    const petals = 5;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass === 0 ? 0.5 : -0.15;
      const oy = pass === 0 ? 0.4 : -0.2;
      const variant = pass === 0 ? 1 : 0;
      for (let pt = 0; pt < petals; pt++) {
        const ang = (pt / petals) * Math.PI * 2 + rand() * 0.2;
        const px = x + ox + Math.cos(ang) * 1.5;
        const py = top + oy + Math.sin(ang) * 1.5;
        marks.push(circle(px, py, 1.0, { kind: 'parcel-flower', variant }));
      }
    }
    marks.push(circle(x, top, 0.75, { kind: 'parcel-flower', variant: 2 }));
    return { y, marks };
  };

  // mark: sapling — trunk (parcel-stem v2) + crown facet pair on its OWN variants (dark v3 / light v2).
  const sapling = (x: number, y: number): { y: number; marks: SceneNode[] } => {
    const s = 0.8 + rand() * 0.3;
    if (distressed) {
      const marks: SceneNode[] = [];
      marks.push(
        path(
          `M${f(x)} ${f(y)} L${f(x)} ${f(y - 9 * s)} M${f(x)} ${f(y - 4.5 * s)} L${f(x - 3.2 * s)} ${f(y - 8 * s)} M${f(x)} ${f(y - 6 * s)} L${f(x + 2.8 * s)} ${f(y - 9.5 * s)}`,
          { kind: 'parcel-stem', variant: 0, strokeWidth: 1.1 },
        ),
      );
      marks.push(fleck(x - 3.2 * s, y - 8.4 * s), fleck(x + 2.8 * s, y - 10 * s), fleck(x + 0.4 * s, y - 9.6 * s));
      return { y, marks };
    }
    const r = 4.4 * s;
    const trunkH = 4.4 * s;
    const cy0 = y - trunkH - r * 0.8;
    const marks: SceneNode[] = [];
    marks.push(path(`M${f(x)} ${f(y)} L${f(x)} ${f(y - trunkH - 1)}`, { kind: 'parcel-stem', variant: 2, strokeWidth: 1.4 }));
    marks.push(circle(x, cy0, r, { kind: 'parcel-shrub', variant: 3 }));
    marks.push(circle(x - r * 0.3, cy0 - r * 0.3, r * 0.75, { kind: 'parcel-shrub', variant: 2 }));
    return { y, marks };
  };

  // density: three tiers always present past 0, saplings a bonus top layer.
  const nFerns = tests <= 0 ? 1 : Math.min(cells.length, 2 + Math.round(tests * 0.85));
  const nShrubs = tests <= 0 ? 0 : Math.max(1, Math.round(tests * 0.45));
  const nFlowers = tests < 2 ? 0 : Math.max(1, Math.round(tests * 0.32));
  const nSaplings = Math.floor(tests / 4);

  for (let i = 0; i < nFerns; i++) {
    const p = spot();
    const m = fern(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nShrubs; i++) {
    const p = spot();
    const m = shrub(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nFlowers; i++) {
    const p = spot();
    const m = flower(p.x, p.y);
    if (m) flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < nSaplings; i++) {
    const p = spot();
    const m = sapling(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  return { ground, flora };
}

/** The per-status heath config (heath.js `heathStatusConfig`, colour-stripped) — the density/opacity
 *  knobs + whether each tier fires. Bell palette SIZES drive the healthy 2-colour bell rotation. */
interface HeathConf {
  scale: number;
  opacity: number;
  twiggy: boolean;
  spark: boolean;
  flowerBoost: number;
  altShrubChance: number;
  bloomChance: number;
  bellLight: number;
  bellDark: number;
}
function heathConf(status: SceneStatus): HeathConf {
  switch (status) {
    case 'healthy':
      return { scale: 1.0, opacity: 1, twiggy: false, spark: false, flowerBoost: 1, altShrubChance: 0.35, bloomChance: 0.4, bellLight: 2, bellDark: 2 };
    case 'mapped':
      return { scale: 0.82, opacity: 0.72, twiggy: false, spark: false, flowerBoost: 0.3, altShrubChance: 0, bloomChance: 0.05, bellLight: 1, bellDark: 1 };
    case 'proposed':
      return { scale: 0.8, opacity: 0.78, twiggy: false, spark: false, flowerBoost: 0.4, altShrubChance: 0, bloomChance: 0.1, bellLight: 1, bellDark: 1 };
    case 'building':
      return { scale: 0.96, opacity: 1, twiggy: false, spark: true, flowerBoost: 0.85, altShrubChance: 0, bloomChance: 0.3, bellLight: 1, bellDark: 1 };
    case 'unhealthy':
      return { scale: 0.92, opacity: 0.92, twiggy: true, spark: false, flowerBoost: 0.2, altShrubChance: 0, bloomChance: 0, bellLight: 1, bellDark: 1 };
    case 'unknown':
    default:
      return { scale: 0.68, opacity: 0.6, twiggy: false, spark: false, flowerBoost: 0, altShrubChance: 0, bloomChance: 0, bellLight: 0, bellDark: 0 };
  }
}

/** HEATH (heath.js) — quilted moor turf grows wiry grass tufts (bulk), heather/gorse scrub mounds (the
 *  density driver, two-face domes with a healthy gorse-olive alt lobe), and heather-bell racemes;
 *  distressed statuses go to bare twigs. tests drives every tier, status only recolours/mutes (a group
 *  opacity carries the mute). grass → `parcel-blade` (STROKED); mound → `parcel-shrub` (body v1 / hi v0,
 *  gorse alt v3/v2); bell/spark/fleck → `parcel-flower`; raceme-stem/twig → `parcel-stem`. */
function heathSurface(
  cells: ParcelCell[],
  status: SceneStatus,
  tests: number,
  rand: () => number,
): { ground: SceneNode[]; flora: ParcelFloraMark[] } {
  const ground = parcelGround(cells, status, rand);
  const flora: ParcelFloraMark[] = [];
  const conf = heathConf(status);
  if (!cells.length) return { ground, flora };

  const item = (y: number, marks: SceneNode[]): ParcelFloraMark =>
    parcelFloraItem('heath', status, y, marks, conf.opacity < 1 ? conf.opacity : undefined);
  // bell face variants: light index 0/1 → v0/v4, dark index 0/1 → v1/v5 (the healthy 2-colour rotation).
  const bellLightV = (idx: number): number => (idx === 1 ? 4 : 0);
  const bellDarkV = (idx: number): number => (idx === 1 ? 5 : 1);

  // one clean two-face domed lobe: a body-tone mound + an offset highlight cap.
  const mound = (cx: number, cy: number, s: number, bodyV: number, hiV: number): SceneNode[] => [
    ellipse(cx, cy, 3.3 * s, 2.7 * s, { kind: 'parcel-shrub', variant: bodyV }),
    ellipse(cx - 1.15 * s, cy - 1.05 * s, 1.85 * s, 1.5 * s, { kind: 'parcel-shrub', variant: hiV }),
  ];
  // a couple of small bells sitting on a mound's crown (bloom-in-flower).
  const bloomOnMound = (cx: number, cy: number, s: number): SceneNode[] => {
    if (!conf.bellLight) return [];
    const out: SceneNode[] = [];
    const n = 1 + Math.floor(rand() * 2);
    for (let bi = 0; bi < n; bi++) {
      const bx = cx + (rand() * 2 - 1) * 1.8 * s;
      const by = cy - 2.1 * s - rand() * 0.8 * s;
      const dv = bellDarkV(Math.floor(rand() * conf.bellDark));
      const lv = bellLightV(Math.floor(rand() * conf.bellLight));
      out.push(ellipse(bx, by, 0.75 * s, 1.0 * s, { kind: 'parcel-flower', variant: dv }));
      out.push(ellipse(bx - 0.3 * s, by - 0.25 * s, 0.55 * s, 0.75 * s, { kind: 'parcel-flower', variant: lv }));
    }
    return out;
  };

  // tier 1: long wiry moor-grass tufts (stroked blades, grassA dark v1 / grassB light v0 alternating).
  const grassTuft = (x: number, y: number): { y: number; marks: SceneNode[] } => {
    const s = conf.scale * (0.85 + rand() * 0.35);
    const n = 3 + Math.floor(rand() * 3);
    const marks: SceneNode[] = [];
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 1.15 * s;
      const h = (3.2 + rand() * 2.6) * s;
      const bend = dx * 1.1 + (rand() * 1.4 - 0.7) * s;
      const variant = i % 2 === 0 ? 1 : 0;
      marks.push(
        path(
          `M${f(x + dx)} ${f(y)} Q${f(x + dx + bend * 0.5)} ${f(y - h * 0.62)} ${f(x + dx + bend)} ${f(y - h)}`,
          { kind: 'parcel-blade', variant, strokeWidth: 0.7 * s },
        ),
      );
    }
    return { y, marks };
  };

  // tier 2: heather/gorse scrub mounds (density driver). A hero is a clump (companion + main mound);
  // distressed goes to bare wiry twigs + dead flecks.
  const shrub = (x: number, y: number, hero: boolean): { y: number; marks: SceneNode[] } => {
    const s = conf.scale * (hero ? 1.05 + rand() * 0.25 : 0.75 + rand() * 0.28);
    const useAlt = conf.altShrubChance > 0 && rand() < conf.altShrubChance;
    const bodyV = useAlt ? 3 : 1;
    const hiV = useAlt ? 2 : 0;
    const marks: SceneNode[] = [];

    if (conf.twiggy) {
      const tn = 3 + Math.floor(rand() * 2);
      for (let w = 0; w < tn; w++) {
        const wx = x + (w - (tn - 1) / 2) * 2.1 * s + (rand() * 1.4 - 0.7);
        const wh = (3.4 + rand() * 2.0) * s;
        const lean = (w - (tn - 1) / 2) * 1.3 + (rand() - 0.5);
        marks.push(
          path(`M${f(wx)} ${f(y + 1.0 * s)} q${f(lean)} ${f(-wh * 0.6)} ${f(lean * 1.7)} ${f(-wh)}`, {
            kind: 'parcel-stem',
            variant: 0,
            strokeWidth: 0.55 * s,
          }),
        );
      }
      const fn = 2 + Math.floor(rand() * 2);
      for (let d = 0; d < fn; d++) {
        marks.push(circle(x + (rand() * 2 - 1) * 3.4 * s, y - rand() * 3.4 * s, 0.6 * s, { kind: 'parcel-flower', variant: 0 }));
      }
      return { y: y + 2.7 * s, marks };
    }

    if (hero) {
      const side = rand() < 0.5 ? -1 : 1;
      const altCompanion = conf.altShrubChance > 0 && rand() < 0.6;
      const cBodyV = altCompanion ? 3 : bodyV;
      const cHiV = altCompanion ? 2 : hiV;
      marks.push(...mound(x + side * 3.1 * s, y + 0.75 * s, s * 0.6, cBodyV, cHiV));
    }
    marks.push(...mound(x, y, s, bodyV, hiV));

    if (conf.bloomChance && rand() < conf.bloomChance) {
      marks.push(...bloomOnMound(x, y, s));
    }
    if (conf.spark) {
      const sk = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < sk; k++) {
        marks.push(circle(x + (rand() * 2 - 1) * 2.6 * s, y - 1.4 * s - rand() * 1.6 * s, 0.5 * s, { kind: 'parcel-flower', variant: 6 }));
      }
    }
    return { y: y + 3.0 * s, marks };
  };

  // tier 3: heather-bell raceme — a stem (parcel-stem v0) up which bells (dark back v1/v5, light face
  // v0/v4, tiny core v2) climb.
  const bellCluster = (x: number, y: number): { y: number; marks: SceneNode[] } => {
    if (!conf.bellLight) return { y, marks: [] };
    const s = conf.scale * (1.0 + rand() * 0.3);
    const n = 3 + Math.floor(rand() * 3);
    const topY = y - (2.4 + n * 1.15) * s;
    const marks: SceneNode[] = [];
    marks.push(
      path(`M${f(x)} ${f(y)} Q${f(x + 0.5 * s)} ${f((y + topY) / 2)} ${f(x + 0.3 * s)} ${f(topY)}`, {
        kind: 'parcel-stem',
        variant: 0,
        strokeWidth: 0.65 * s,
      }),
    );
    for (let i = 0; i < n; i++) {
      const bx = x + 0.3 * s + (i % 2 === 0 ? -1 : 1) * 1.0 * s;
      const by = y - (2.0 + i * 1.15) * s;
      const dv = bellDarkV(Math.floor(rand() * conf.bellDark));
      const lv = bellLightV(Math.floor(rand() * conf.bellLight));
      marks.push(ellipse(bx, by, 1.0 * s, 1.35 * s, { kind: 'parcel-flower', variant: dv }));
      marks.push(ellipse(bx - 0.35 * s, by - 0.3 * s, 0.75 * s, 1.02 * s, { kind: 'parcel-flower', variant: lv }));
      marks.push(circle(bx - 0.3 * s, by + 0.55 * s, 0.32 * s, { kind: 'parcel-flower', variant: 2 }));
    }
    return { y, marks };
  };

  // the drift beds: the whole budget plants inside them (the all-cells spread retired).
  const next = driftSpot(cells, tests, rand);

  // density budget: tests drives every tier, status only recolours/mutes.
  const t = Math.max(0, tests | 0);
  const grassCount = cells.length ? Math.min(cells.length, t === 0 ? 4 : 4 + Math.round(t * 1.3)) : 0;
  const shrubCount = Math.round(t * 0.75);
  const flowerClusters = t < 2 ? 0 : Math.round((t - 1) * 0.3 * conf.flowerBoost);

  for (let i = 0; i < grassCount; i++) {
    const p = next();
    const m = grassTuft(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < shrubCount; i++) {
    const p = next();
    const m = shrub(p.x, p.y, i < 2);
    flora.push(item(m.y, m.marks));
  }
  for (let i = 0; i < flowerClusters; i++) {
    const p = next();
    const m = bellCluster(p.x, p.y);
    flora.push(item(m.y, m.marks));
  }
  return { ground, flora };
}

/** THE SURFACE REGISTRY (ADR-0208) — the splice point: theme → its `SurfaceFn`. These are the
 *  designer-authored surfaces (meadow / woodland / heath), spliced over the initial in-repo ports
 *  behind the frozen seam (the `SurfaceFn` shape + the kinds vocabulary are frozen; the craft is not). */
export const SURFACES: Record<SurfaceTheme, SurfaceFn> = {
  meadow: meadowSurface,
  woodland: woodlandSurface,
  heath: heathSurface,
};

// --- Voronoi assignment + the once-computed per-territory surface ---

function cellCentroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = poly.length || 1;
  return { x: x / n, y: y / n };
}

/** The equal-weight VORONOI assignment: a cell → the nearest parcel seed (ties → lowest index). */
function nearestParcel(centroid: Pt, seeds: readonly Pt[]): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]!;
    const d = (centroid.x - s.x) ** 2 + (centroid.y - s.y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** One parcels-present island's full surface, computed ONCE (buildScene threads the `ground` to
 *  `buildGround` and the `flora` to `buildTerritoryFlora`). Each parcel's ground cells are wrapped in
 *  a transparent `parcel` group carrying the capId (the hover/delegation hook). Returns null when the
 *  island has no parcels or no substrate cells (the feature needs the relaxed mesh), so every caller
 *  falls back to today's render. */
export interface ParcelSurface {
  ground: SceneNode[];
  flora: ParcelFloraMark[];
}
function buildTerritorySurface(t: SceneTerritoryInput, ownerCells: RelaxedCell[]): ParcelSurface | null {
  const parcels = t.parcels;
  if (!parcels || !parcels.length || !ownerCells.length) return null;
  const seeds = parcels.map((p) => p.seed);
  const groups: ParcelCell[][] = parcels.map(() => []);
  for (const c of ownerCells) {
    const cen = cellCentroid(c.poly);
    const idx = nearestParcel(cen, seeds);
    groups[idx]!.push({ poly: c.poly, cx: cen.x, cy: cen.y });
  }
  const ground: SceneNode[] = [];
  const flora: ParcelFloraMark[] = [];
  parcels.forEach((parcel, i) => {
    const cells = groups[i]!;
    if (!cells.length) return;
    const rand = streamRand(`parcel:${t.id}:${parcel.capId}`);
    const out = SURFACES[parcel.theme](cells, parcel.status, parcel.testCount, rand);
    ground.push(
      g(out.ground, { kind: 'parcel', id: parcel.capId, status: parcel.status, title: parcel.capId }),
    );
    // Stamp each flora item with its capId (the SurfaceFn is capId-agnostic, so attribution — the
    // hover-flora → capability hook — is added here, where the parcel identity is known).
    for (const fm of out.flora) {
      fm.node.id = parcel.capId;
      flora.push(fm);
    }
  });
  return { ground, flora };
}

// ---------------------------------------------------------------------------
// the cosy-island GARDEN — hero placement + the re-lit ADR-0218 baked-art seam (grounded-art inc 11)
// ---------------------------------------------------------------------------

/** The scene-graph def id a garden hero's `baked-use` references (ADR-0218 define-once). */
const gardenDefId = (id: GardenHeroId): string => `garden-hero-${id}`;

/** The heroes the garden emits a `baked-def` for (define-once) — kept in sync with what
 *  `buildGardenArt` places, so no def is an orphan `<use>`-less `<defs>` entry. `stepping-stone` is
 *  the garden PATH (unit 2 — one def, N cheap `<use>` stones threading the heroes to the landfall). */
const GARDEN_DEFINED_HEROES: GardenHeroId[] = ['autumn-tree', 'cottage', 'gazebo', 'stepping-stone'];

/** A hero's on-island target HEIGHT in map units, as a multiple of the island's crown radius so it
 *  scales with the story like the procedural tree it stands beside. Tuned against the concept render. */
const GARDEN_HERO_TARGET: Record<GardenHeroId, number> = {
  'autumn-tree': 2.6, // the central tree — matches the ~2.65·R procedural tree it replaces (ADR-0221)
  cottage: 1.7,
  gazebo: 1.5,
  'stepping-stone': 0.28, // small flat path stones — enough of them read as a path, not a few slabs
};

/** The island-size FIT bound (grounded-art inc 11 unit 2 — the owner's "buildings dont fully land within
 *  the island" fix). `crownRadius` saturates at 32 regardless of tile quota, so on a SMALL island the
 *  crown-scaled hero footprint spills past the shore. These caps hold a hero's scaled footprint inside
 *  the island: the scaled base HALF-WIDTH stays within `HALF·radius`, and the scaled HEIGHT within
 *  `HEIGHT·radius` so a hero never towers off a tiny island. On a big island (studio) the caps are slack
 *  and the crown-based target wins — the concept proportions are preserved where there is room. */
const GARDEN_FIT_HALF_FRAC = 0.42; // scaled base half-width ≤ 0.42·radius (full width ≤ 0.84·radius)
const GARDEN_FIT_HEIGHT_FRAC = 1.25; // scaled height ≤ 1.25·radius (a standing object may rise a little above)

/** The fitted scale for one hero on island `t`: the crown-based target height, CAPPED so the scaled
 *  footprint (base half-width and height) stays inside the island (see the FIT constants). Independent
 *  of the placement point, so a caller can derive the footprint half-width before it places the hero. */
function fittedHeroScale(id: GardenHeroId, hero: SceneGardenHero, t: SceneTerritoryInput): number {
  const sTarget = (crownRadius(t.caps) * GARDEN_HERO_TARGET[id]) / hero.height;
  const sCapW = (2 * GARDEN_FIT_HALF_FRAC * t.radius) / hero.width;
  const sCapH = (GARDEN_FIT_HEIGHT_FRAC * t.radius) / hero.height;
  return Math.min(sTarget, sCapW, sCapH);
}

/** Place ONE garden hero as a paint-free `baked-use` of its def at scale `s`, translated to (x, y): the
 *  hero's base sits at (x, y) and the solid rises in −y (the bake is centred on x=0, standing on y=0 —
 *  no flip). Kind `baked-art` is the existing ADR-0218 placement kind — the studio/website mappers
 *  already render it; R3F already skips it. `s` is the {@link fittedHeroScale} the caller computed. */
function gardenHeroUse(
  id: GardenHeroId,
  x: number,
  y: number,
  s: number,
  nodeId?: string,
): SceneBakedUse {
  return {
    el: 'baked-use',
    defId: gardenDefId(id),
    kind: 'baked-art',
    id: nodeId ?? `garden-${id}`,
    transform: `translate(${f(x)} ${f(y)}) scale(${f(s)})`,
  };
}

/** Deterministically place the free-standing garden heroes (cottage, gazebo) around the island — the
 *  same id-seeded rejection sampling the UAT-flower scatter uses: keep-outs for the tree well, the
 *  nameplate band and spacing from each other, and a keep-IN to the island's land cells (no hero in the
 *  water). Same input ⇒ the same spots; exhausting the draws snaps to the nearest free land-cell centroid. */
function placeGardenHeroes(
  t: SceneTerritoryInput,
  ids: GardenHeroId[],
  halfW: Map<GardenHeroId, number>,
  land: RelaxedCell[] | null,
): Map<GardenHeroId, Pt> {
  const onLand = (x: number, y: number): boolean =>
    !land || land.some((c) => pointInPoly(x, y, c.poly));
  // The WHOLE base footprint on land, not just the base point (grounded-art inc 11 unit 2 — the owner's
  // "buildings dont fully land within the island" fix). The base spans [x−hw, x+hw] at y, so both ends
  // AND the midpoint must sit on owned land before a spot is accepted.
  const footprintOnLand = (x: number, y: number, hw: number): boolean =>
    onLand(x, y) && onLand(x - hw, y) && onLand(x + hw, y);
  const placed: Pt[] = [];
  const out = new Map<GardenHeroId, Pt>();
  for (const id of ids) {
    const hw = halfW.get(id) ?? 0;
    const k = hash(`${t.id}:garden:${id}`);
    let x = t.centroid.x;
    let y = t.centroid.y;
    let settled = false;
    // Placed nearer the interior than the marker scatter (0.28–0.62·R vs 0.42–0.82) so a fitted
    // footprint clears the shore; the footprint check is the hard guarantee, this just seeds it well.
    for (let attempt = 0; attempt < 48; attempt++) {
      const ang = rand01(k + attempt * 2) * Math.PI * 2;
      const rr = (0.28 + rand01(k + attempt * 2 + 1) * 0.34) * t.radius;
      x = t.centroid.x + Math.cos(ang) * rr;
      y = t.centroid.y + Math.sin(ang) * rr * 0.7; // top-down squash, same as the marker scatter
      const clearsTree = Math.hypot(x - t.treeSpot.x, y - t.treeSpot.y) > t.radius * 0.5;
      const clearsPlate = y < t.labelY - 18;
      const clearsOthers = placed.every((p) => Math.hypot(x - p.x, y - p.y) > t.radius * 0.55);
      if (clearsTree && clearsPlate && clearsOthers && footprintOnLand(x, y, hw)) {
        settled = true;
        break;
      }
    }
    if (!settled && land) {
      // Snap to the land-cell centroid whose whole footprint fits and that clears the others; fall back
      // to the nearest free centroid, then the nearest centroid (a tiny island can't always do better).
      const spots = land
        .map((cell) => cellCentroid(cell.poly))
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      const clearsPlaced = (p: Pt): boolean =>
        placed.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > t.radius * 0.5);
      const free =
        spots.find((p) => clearsPlaced(p) && footprintOnLand(p.x, p.y, hw)) ??
        spots.find(clearsPlaced) ??
        spots[0]!;
      x = free.x;
      y = free.y;
    }
    placed.push({ x, y });
    out.set(id, { x, y });
  }
  return out;
}

/** The island's downward-shore LANDFALL (grounded-art inc 11 unit 2) — where the garden's stone path
 *  docks so it reads continuous with the inter-island trail. The concept's path exits at the island's
 *  bottom (toward the nameplate, the direction trails leave). March DOWN from the centroid and keep the
 *  furthest point still on owned land, so the dock sits on the shore, not in the water. */
function islandLandfall(t: SceneTerritoryInput, land: RelaxedCell[] | null): Pt {
  const onLand = (x: number, y: number): boolean =>
    !land || land.some((c) => pointInPoly(x, y, c.poly));
  let best: Pt = { x: t.centroid.x, y: t.centroid.y + t.radius * 0.2 };
  for (let d = 0.2; d <= 1.05; d += 0.05) {
    const p: Pt = { x: t.centroid.x, y: t.centroid.y + d * t.radius };
    if (onLand(p.x, p.y)) best = p;
  }
  return best;
}

/** The deterministic stepping-stone garden PATH (grounded-art inc 11 unit 2) — a seeded walk of small
 *  `stepping-stone` `baked-use`s threading the `waypoints` (landfall → cottage → tree → gazebo), one
 *  cheap `<use>` per stone off the ONE shared def. Purely ADDITIVE: `buildTrails` and the segment/casing
 *  system are untouched — these stones are garden art on the island, not trail segments. Seeded jitter
 *  gives a natural meander (never `Math.random`). Each stone is y-sorted so it interleaves in depth. */
function buildStonePath(
  t: SceneTerritoryInput,
  hero: SceneGardenHero,
  waypoints: Pt[],
): Array<{ y: number; node: SceneNode }> {
  const s = fittedHeroScale('stepping-stone', hero, t);
  const stoneW = s * hero.width; // scaled footprint width
  const spacing = Math.max(stoneW * 1.05, t.radius * 0.06); // stone-centre gap — close enough to read as a path
  const out: Array<{ y: number; node: SceneNode }> = [];
  for (let leg = 0; leg + 1 < waypoints.length; leg++) {
    const a = waypoints[leg]!;
    const b = waypoints[leg + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) continue;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy; // unit perpendicular, for the seeded meander
    const py = ux;
    // Interior stones only — leave a margin at each waypoint so a stone doesn't sit under a hero base.
    const margin = Math.min(stoneW * 0.8, len * 0.2);
    const usable = len - 2 * margin;
    if (usable <= 0) continue;
    const n = Math.max(1, Math.round(usable / spacing));
    for (let i = 0; i <= n; i++) {
      const dist = margin + (usable * i) / n;
      const k = hash(`${t.id}:stone:${leg}:${i}`);
      const wob = (rand01(k) - 0.5) * spacing * 0.35; // seeded meander in [−0.175, 0.175)·spacing
      const x = a.x + ux * dist + px * wob;
      const y = a.y + uy * dist + py * wob;
      out.push({ y, node: gardenHeroUse('stepping-stone', x, y, s, `garden-stone-${leg}-${i}`) });
    }
  }
  return out;
}

/** Pull a point onto owned land: if it is already on land keep it; otherwise walk it back toward the
 *  island centroid until it lands (a garden accent never sits in the water). */
function towardLand(p: Pt, centroid: Pt, land: RelaxedCell[] | null): Pt {
  const onLand = (x: number, y: number): boolean => !land || land.some((c) => pointInPoly(x, y, c.poly));
  if (onLand(p.x, p.y)) return p;
  for (let tt = 0.7; tt >= 0; tt -= 0.15) {
    const q: Pt = { x: centroid.x + (p.x - centroid.x) * tt, y: centroid.y + (p.y - centroid.y) * tt };
    if (onLand(q.x, q.y)) return q;
  }
  return centroid;
}

/** A flat LAVENDER clump (grounded-art inc 11 unit 3) — a few upright stems each topped with a short
 *  bud spike, in the concept's dusty muted purple. Base at (0,0), growing UP in −y; seeded so no two
 *  clumps clone. Decorative (carries no verdict), in the attested flat tall-flower style (colour CSS-side). */
function lavenderMarks(k: number): SceneNode[] {
  const marks: SceneNode[] = [ellipse(0.3, 0.6, 6, 1.8, { kind: 'shadow' })];
  const stems = 4 + Math.floor(rand01(k) * 3);
  for (let i = 0; i < stems; i++) {
    const dx = (rand01(k + i * 5 + 1) - 0.5) * 11;
    const h = 13 + rand01(k + i * 5 + 2) * 8;
    const lean = (rand01(k + i * 5 + 3) - 0.5) * 4;
    const topX = dx + lean;
    marks.push(
      path(`M ${f(dx)} 0 C ${f(dx + lean * 0.5)} ${f(-h * 0.5)}, ${f(topX)} ${f(-h * 0.8)}, ${f(topX)} ${f(-h)}`, {
        kind: 'garden-lavender-stem',
        strokeWidth: 1.3,
      }),
    );
    for (let b = 0; b < 4; b++) marks.push(ellipse(topX, -h + b * 2.6, 1.7, 2.3, { kind: 'garden-lavender-head' }));
  }
  return marks;
}

/** A flat GRASS tuft (grounded-art inc 11 unit 3) — a handful of thin arching blades, seeded. Base at
 *  (0,0), UP in −y; the concept's cosy filler between the hero objects. Decorative, no verdict. */
function grassMarks(k: number): SceneNode[] {
  const marks: SceneNode[] = [ellipse(0.3, 0.5, 5, 1.5, { kind: 'shadow' })];
  const blades = 5 + Math.floor(rand01(k) * 3);
  for (let i = 0; i < blades; i++) {
    const dx = (rand01(k + i * 3 + 1) - 0.5) * 9;
    const h = 9 + rand01(k + i * 3 + 2) * 8;
    const lean = (rand01(k + i * 3 + 3) - 0.5) * 9;
    marks.push(
      path(`M ${f(dx)} 0 Q ${f(dx + lean * 0.5)} ${f(-h * 0.6)}, ${f(dx + lean)} ${f(-h)}`, {
        kind: 'garden-grass-blade',
        strokeWidth: 1.5,
      }),
    );
  }
  return marks;
}

/** The UAT verdict as a MASSED daisy BED (grounded-art inc 11 unit 3 — the owner's few-hero-objects
 *  read). Instead of ONE tall-flower scattered per criterion across the whole island (the inc-7 render
 *  the owner flagged as busy), the criteria cluster into one bed near the garden — each flower KEEPING
 *  its per-criterion `state` (bloom=proven / bud=pending / wilted=failing — the FORM is the verdict) and
 *  `id` (the click-to-detail hook, unchanged). The human-witness signpost seal is retained separately.
 *  A phyllotactic (golden-angle) cluster reads as one dense bed. Empty criteria ⇒ no bed. */
function buildGardenUatBed(
  t: SceneTerritoryInput,
  land: RelaxedCell[] | null,
  anchor: Pt,
): Array<{ y: number; node: SceneNode }> {
  const criteria = t.uatCriteria ?? [];
  if (!criteria.length) return [];
  const out: Array<{ y: number; node: SceneNode }> = [];
  criteria.forEach((c, i) => {
    const k = hash(`${t.id}:bed:${c.id}`);
    const ang = i * 2.399963; // golden angle → an even, natural cluster
    const rr = 3 + Math.sqrt(i) * 8 + (rand01(k) - 0.5) * 3;
    const p = towardLand({ x: anchor.x + Math.cos(ang) * rr, y: anchor.y + Math.sin(ang) * rr * 0.7 }, anchor, land);
    const kind: SceneKind =
      c.state === 'proven' ? 'tall-flower-proven' : c.state === 'failing' ? 'tall-flower-failing' : 'tall-flower-pending';
    out.push({
      y: p.y,
      node: g(tallFlowerMarks(c.state, k), {
        kind,
        id: c.id,
        transform: `translate(${f(p.x)} ${f(p.y)}) scale(${f(MARKER_SCALE * 0.8)})`,
      }),
    });
  });
  return out;
}

/** The garden island's art drawables (grounded-art inc 11) — the `autumn-tree` hero at the tree spot
 *  (ADR-0221, replacing the procedural tree), the human-witness signpost RETAINED beside it, and the
 *  cottage + gazebo placed around the island. Each is a y-sorted `baked-use` so it interleaves in
 *  painter order with anything else on the island. The caller SUPPRESSES the decorative flora. */
function buildGardenArt(
  t: SceneTerritoryInput,
  garden: SceneGardenInput,
  ownerCells: RelaxedCell[] | null,
): Array<{ y: number; node: SceneNode }> {
  const land = ownerCells && ownerCells.length ? ownerCells : null;
  const crownR = crownRadius(t.caps);
  const out: Array<{ y: number; node: SceneNode }> = [];

  // the autumn-tree hero AS the central tree (ADR-0221) — at the story's tree spot, FITTED to the island
  // so its footprint lands within the shore on a small island (unit 2).
  const treeScale = fittedHeroScale('autumn-tree', garden.heroes['autumn-tree'], t);
  out.push({
    y: t.treeSpot.y,
    node: gardenHeroUse('autumn-tree', t.treeSpot.x, t.treeSpot.y, treeScale),
  });
  // the human-witness signpost is RETAINED beside the hero tree (the seal never leaves).
  if (t.signpost) {
    out.push({
      y: t.treeSpot.y,
      node: g([buildSignpost(t.signpost, crownR)], {
        transform: `translate(${f(t.treeSpot.x)} ${f(t.treeSpot.y)})`,
      }),
    });
  }
  // the free-standing garden heroes — cottage + gazebo: each FITTED to the island, then placed so the
  // whole fitted footprint sits on owned land (unit 2 — the owner's "fully land within the island" fix).
  const freeIds: GardenHeroId[] = ['cottage', 'gazebo'];
  const scales = new Map<GardenHeroId, number>(
    freeIds.map((id) => [id, fittedHeroScale(id, garden.heroes[id], t)]),
  );
  const halfW = new Map<GardenHeroId, number>(
    freeIds.map((id) => [id, (scales.get(id)! * garden.heroes[id].width) / 2]),
  );
  const spots = placeGardenHeroes(t, freeIds, halfW, land);
  for (const [id, p] of spots) {
    out.push({ y: p.y, node: gardenHeroUse(id, p.x, p.y, scales.get(id)!) });
  }
  // the stepping-stone garden PATH (unit 2): the concept's main path runs from the shore LANDFALL up to
  // the cottage door, then on past the tree to the gazebo — so it docks at the island's inter-island
  // trail and threads the heroes. Fixed order (landfall → cottage → tree → gazebo) keeps that
  // front-door leg prominent, matching the reference.
  const landfall = islandLandfall(t, land);
  const cottage = spots.get('cottage');
  const gazebo = spots.get('gazebo');
  const waypoints: Pt[] = [landfall];
  if (cottage) waypoints.push(cottage);
  waypoints.push({ x: t.treeSpot.x, y: t.treeSpot.y });
  if (gazebo) waypoints.push(gazebo);
  out.push(...buildStonePath(t, garden.heroes['stepping-stone'], waypoints));

  // flat decorative accents + the UAT verdict (unit 3): a lavender clump beside the cottage, the UAT
  // verdict as a MASSED daisy bed beside the gazebo, and a couple of grass tufts in the open — all flat,
  // seeded, clamped to owned land. This is the cosy garden read the concept has, and it folds the
  // per-criterion verdict into ONE bed instead of the busy 1:1 island-wide scatter.
  const cen = t.centroid;
  const accentScale = crownR / 26;
  if (cottage) {
    const a = towardLand({ x: cottage.x - crownR * 0.85, y: cottage.y + crownR * 0.4 }, cen, land);
    out.push({ y: a.y, node: g(lavenderMarks(hash(`${t.id}:lavender`)), { transform: `translate(${f(a.x)} ${f(a.y)}) scale(${f(accentScale)})` }) });
  }
  const bedAnchor = gazebo
    ? towardLand({ x: gazebo.x + crownR * 0.9, y: gazebo.y + crownR * 0.3 }, cen, land)
    : towardLand({ x: cen.x + crownR, y: cen.y + crownR * 0.5 }, cen, land);
  out.push(...buildGardenUatBed(t, land, bedAnchor));
  for (let i = 0; i < 3; i++) {
    const k = hash(`${t.id}:grass:${i}`);
    const ang = rand01(k) * Math.PI * 2;
    const rr = (0.4 + rand01(k + 1) * 0.32) * t.radius;
    const gp = towardLand({ x: cen.x + Math.cos(ang) * rr, y: cen.y + Math.sin(ang) * rr * 0.7 }, cen, land);
    out.push({ y: gp.y, node: g(grassMarks(k), { transform: `translate(${f(gp.x)} ${f(gp.y)}) scale(${f(accentScale)})` }) });
  }
  return out;
}

/** The garden's baked-art DEFINITIONS layer (grounded-art inc 11, re-lighting ADR-0218's dormant seam):
 *  one `baked-def` per hero the garden USES, define-once. Emitted into the scene so a mapper renders a
 *  `<defs>` block every placement `baked-use` references. Only USED heroes are defined — no orphan defs. */
function buildGardenDefs(garden: SceneGardenInput): SceneG {
  const defs: SceneBakedDef[] = GARDEN_DEFINED_HEROES.map((id) => ({
    el: 'baked-def',
    defId: gardenDefId(id),
    nodes: garden.heroes[id].nodes,
  }));
  return g(defs, { kind: 'baked-defs' });
}

// ---------------------------------------------------------------------------
// a whole island's flora layer (TerritoryFlora)
// ---------------------------------------------------------------------------

/** One island's flora group: conifers (expanded from the decor seeds), capability
 *  plants, and the central tree — all y-sorted so southern art overlaps northern —
 *  then the nameplate and the wisp orbit.
 *
 *  When `parcelFlora` is provided (a parcels-present island, forest-parcels inc 1), the decorative
 *  conifers (`decor`) and the one-plant-per-cap ring (`plants`) are RETIRED — the parcel surface
 *  flora replaces them, y-sorted into the same list as the tree so the interleave with the canopy
 *  still holds. Absent ⇒ today's conifer + plant render is byte-for-byte unchanged. */
export function buildTerritoryFlora(
  t: SceneTerritoryInput,
  parcelFlora?: ParcelFloraMark[] | null,
  ownerCells?: RelaxedCell[] | null,
  garden?: SceneGardenInput | null,
): SceneG {
  const drawables: { y: number; node: SceneNode }[] = [];

  if (garden) {
    // the cosy-island GARDEN (grounded-art inc 11, ADR-0221): the four heroes ARE this island's art.
    // The decorative flora (conifers / capability plants / parcel flora), the procedural central tree,
    // and the 1:1 UAT-flower scatter are ALL suppressed — the heroes replace them; the `autumn-tree`
    // hero stands as the central tree. The nameplate + session wisps/claims still layer on below.
    drawables.push(...buildGardenArt(t, garden, ownerCells ?? null));
  } else {
    if (parcelFlora) {
      // parcels-present: the parcel surface flora IS the island's flora (conifers + plant ring retired).
      for (const fm of parcelFlora) drawables.push({ y: fm.y, node: fm.node });
    } else {
      for (const d of t.decor) {
        const count = 2 + (d.seed % 2);
        for (let i = 0; i < count; i++) {
          const a = rand01(d.seed + i * 7) * Math.PI * 2;
          const rr = rand01(d.seed + i * 13) * HEX_R * 0.55;
          const x = d.x + Math.cos(a) * rr;
          const y = d.y + Math.sin(a) * rr * 0.8 + 4;
          drawables.push({ y, node: buildConifer(x, y, 7 + rand01(d.seed + i) * 4, d.seed + i) });
        }
      }
      for (const plant of t.plants) drawables.push({ y: plant.y, node: buildPlant(plant) });
    }
    drawables.push({ y: t.treeSpot.y, node: buildTree(t) });
    // the UAT markers (forest-parcels inc 2; tall flowers, grounded-art inc 7) — each scattered flower
    // is its OWN y-sorted drawable so it interleaves with the tree + flora by depth. The island's
    // substrate cells (when known) are the scatter's keep-in. Absent/empty uatCriteria ⇒ nothing (the lock).
    drawables.push(...buildUatMarkers(t, ownerCells ?? null));
  }
  drawables.sort((a, b) => a.y - b.y);

  const children: SceneNode[] = drawables.map((d) => d.node);
  children.push(buildPlate(t));
  const wisps = buildWisps(t);
  if (wisps) children.push(wisps);
  // ADR-0138 §5: the story-claim orbit ("a session is here") — a DISTINCT drawable family from the
  // build wisp, never a bloom. Layered after the build wisps so when both run the claim reads outside.
  const claimWisps = buildClaimWisps(t);
  if (claimWisps) children.push(claimWisps);
  // ADR-0200 D7: the departure layer ("a session just left") — after the claim layer, same
  // absent/empty ⇒ nothing rule, same §5 honesty wall (never a bloom).
  const departingWisps = buildDepartingWisps(t);
  if (departingWisps) children.push(departingWisps);

  return g(children, { kind: 'territory', status: t.status, id: t.id });
}

// ---------------------------------------------------------------------------
// the static layers (coast / ground / trails / empties / hits)
// ---------------------------------------------------------------------------

function isG(n: SceneG | null): n is SceneG {
  return n !== null;
}

function buildEmpties(input: SceneInput): SceneG {
  return g(
    input.empties.map((h) => {
      const c = hexCenter(h);
      return path(hexPath(c.x, c.y, HEX_R - 0.6), { kind: 'empty' });
    }),
    { kind: 'empties-layer' },
  );
}

function buildCoast(input: SceneInput): SceneG {
  const groups = input.territories
    .map((t): SceneG | null =>
      t.coastPaths.length
        ? g(
            t.coastPaths.map((d) => path(d, { kind: 'coast-shore' })),
            { kind: 'coast', status: t.status, id: t.id },
          )
        : null,
    )
    .filter(isG);
  return g(groups, { kind: 'coast-layer' });
}

function buildGround(input: SceneInput, surfaces: (ParcelSurface | null)[]): SceneG {
  if (input.relaxedCells) {
    const cells = input.relaxedCells;
    const groups = input.territories
      .map((t, owner): SceneG | null => {
        const owned = cells.filter((c) => c.owner === owner);
        if (!owned.length) return null;
        const surf = surfaces[owner];
        if (surf) {
          // parcels-present: the per-parcel, per-cell status-tinted ground replaces the plain cells
          // (the per-territory status tint that keyed today's ground moves down to per-cell cap status).
          return g(surf.ground, { kind: 'ground', status: t.status, id: t.id });
        }
        return g(
          owned.map((c) =>
            path(polyPath(c.poly), c.wheat ? { kind: 'cell-wheat' } : { kind: 'cell', variant: c.variant }),
          ),
          { kind: 'ground', status: t.status, id: t.id },
        );
      })
      .filter(isG);
    return g(groups, { kind: 'ground-mesh' });
  }
  // classic extruded-hex ground — each tile is its own group (the studio's hex-land).
  const tiles = input.drawTiles
    .map(({ h, owner }): SceneG | null => {
      const t = input.territories[owner];
      if (!t) return null;
      const c = hexCenter(h);
      const key = axialKey(h);
      const wheat = (input.wheatSets[owner] ?? EMPTY_KEYS).has(key);
      return g(
        [
          path(hexPath(c.x, c.y + TILE_DEPTH, HEX_R), { kind: 'tile-side' }),
          path(
            hexPath(c.x, c.y, HEX_R),
            wheat ? { kind: 'tile-top-wheat' } : { kind: 'tile-top', variant: hash(`tile:${key}`) % 3 },
          ),
        ],
        { kind: 'tile', status: t.status, id: t.id },
      );
    })
    .filter(isG);
  return g(tiles, { kind: 'ground-hex' });
}

/** One trail-segment path node — the segment id + `data-usage`/`data-edges` hooks, and
 *  the per-pass stroke width derived from the ONE width rule (`trailFillWidth`). */
function trailSegPath(
  s: TrailSegment,
  kind: SceneKind,
  widen: number,
  edgesOf: (id: string) => string,
  markSpur = false,
): ScenePath {
  return path(s.d, {
    kind,
    id: s.id,
    usage: s.usage,
    edges: edgesOf(s.id),
    strokeWidth: trailFillWidth(s.usage) + widen,
    // a spur (one edge) is a dashed footpath; a trunk (≥2) a solid road (ADR-0169 §2)
    ...(markSpur && s.usage === 1 ? { spur: true } : {}),
  });
}

/** The trail network as FULL cased passes (ADR-0169 §2): every visible segment drawn
 *  once per pass — shadow, then casing, then fill, then the under-island ghost runs —
 *  never interleaved per path, so merged trunks read as one trail (the cartographic
 *  casing rule). Ends with the non-visual per-edge reveal metadata (`trail-edges`).
 *  Default-hidden is the SURFACE's concern (§3): the core emits everything. */
export function buildTrails(input: SceneInput): SceneG {
  const net = input.trails;
  // Per-segment `from->to` keys, folded from the edge chains (a segment doesn't carry
  // them); edge-input order, first appearance wins — deterministic.
  const segEdges = new Map<string, string[]>();
  for (const e of net.edges) {
    const key = `${e.from}->${e.to}`;
    for (const ref of e.segments) {
      const list = segEdges.get(ref.id);
      if (!list) segEdges.set(ref.id, [key]);
      else if (!list.includes(key)) list.push(key);
    }
  }
  const edgesOf = (id: string): string => (segEdges.get(id) ?? []).join(',');
  const visible = net.segments.filter((s) => !s.hidden);
  const hidden = net.segments.filter((s) => s.hidden);
  return g(
    [
      g(visible.map((s) => trailSegPath(s, 'trail-shadow', 5, edgesOf)), { kind: 'trail-shadow-pass' }),
      g(visible.map((s) => trailSegPath(s, 'trail-casing', 2.5, edgesOf)), { kind: 'trail-casing-pass' }),
      g(visible.map((s) => trailSegPath(s, 'trail-fill', 0, edgesOf, true)), { kind: 'trail-fill-pass' }),
      g(hidden.map((s) => trailSegPath(s, 'trail-ghost', 0, edgesOf)), { kind: 'trail-ghost-pass' }),
      g(
        net.edges.map((e) =>
          g([], {
            kind: 'trail-edge',
            from: e.from,
            to: e.to,
            ...(e.title !== undefined ? { title: e.title } : {}),
            segments: e.segments.map((r) => `${r.id}:${r.reversed ? 'R' : 'F'}`).join(','),
          }),
        ),
        { kind: 'trail-edges' },
      ),
    ],
    { kind: 'trails-layer' },
  );
}

/** A cave portal prop (ADR-0169 §2) — where a forced route disappears under an island.
 *  Local frame after the group transform: +x is the outward rim normal (the bearing),
 *  so the flat side of the arch lies against the island wall (the local y axis) and the
 *  mouth bulges outward toward the arriving trail. Hue is the mapper's: `cave-arch` is
 *  the near-black of the island's shadow/side-wall family, keyed by the folded island
 *  `status` carried here (the same kind+status derivation every island hue uses);
 *  `cave-rim` the lit upper edge; `cave-apron` a multiply-darkened trampled patch. */
function buildCave(c: TrailCave, status: SceneStatus): SceneG {
  const hw = (c.width * 1.6) / 2; // arch mouth half-width, sized from the trail width
  const deg = (c.bearing * 180) / Math.PI;
  return g(
    [
      ellipse(hw * 0.5, 0, hw * 1.3, hw * 0.64, { kind: 'cave-apron' }),
      // flat-bottomed arch: a half-disc closed along the y-axis chord (the rim wall)
      path(`M 0 ${f(-hw)} A ${f(hw)} ${f(hw)} 0 0 1 0 ${f(hw)} Z`, { kind: 'cave-arch' }),
      // the lit rim arc on the upper edge of the mouth
      path(`M 0 ${f(-hw)} A ${f(hw)} ${f(hw)} 0 0 1 ${f(hw)} 0`, {
        kind: 'cave-rim',
        strokeWidth: 1.5,
      }),
    ],
    {
      kind: 'cave',
      status,
      island: c.islandId,
      edges: c.edgeIds.join(','),
      transform: `translate(${f(c.x)} ${f(c.y)}) rotate(${f(deg)})`,
    },
  );
}

/** Every cave portal, status-folded from its island's territory (an island with no
 *  territory — a decor-only obstacle — wears `unknown`). */
function buildCaves(input: SceneInput): SceneG[] {
  const statusOf = new Map(input.territories.map((t) => [t.id, t.status]));
  return input.trails.caves.map((c) => buildCave(c, statusOf.get(c.islandId) ?? 'unknown'));
}

function buildHits(input: SceneInput): SceneG {
  return g(
    input.territories.map((t) => {
      const crownR = crownRadius(t.caps);
      const top = t.treeSpot.y - (2.7 * crownR + 16);
      const hgt = t.labelY + t.plate.h - top;
      return rect(t.centroid.x - t.radius, top, t.radius * 2, hgt, 14, {
        kind: 'hit',
        id: t.id,
        title: t.plate.title,
      });
    }),
    { kind: 'hits-layer' },
  );
}

// ---------------------------------------------------------------------------
// buildScene — the whole drawable tree
// ---------------------------------------------------------------------------

/**
 * The whole forest world as a framework-agnostic drawable tree (ADR-0093). The
 * root is the offset group; its children are the layers in canonical studio order:
 * pale coast, the smoothed coastland, the ground (mesh or hex), the `depends_on`
 * trail network (above ground, below flora — ADR-0169), the per-island flora with
 * the cave-portal props appended (above flora, so an arch occludes the trail
 * disappearing under its island), and the delegation hit areas. Each surface walks
 * this and maps roles → its own classes + behaviour; the surface owns its own
 * `<svg>` shell + `<defs>`, plus any surface-only chrome (the studio's solar
 * spokes / Shared-Islands panel / building stamps; the website's hit delegation)
 * layered on top.
 */
export function buildScene(input: SceneInput): SceneG {
  // Compute each parcels-present island's surface ONCE (forest-parcels inc 1) — the ground threads to
  // `buildGround`, the flora to `buildTerritoryFlora`. Null (no parcels / no mesh cells) ⇒ today's
  // render on both seams, byte-for-byte.
  const cells = input.relaxedCells;
  // Each territory's substrate cells, computed once — the parcel surface AND the UAT-marker
  // keep-in both read them.
  const ownerCells: (RelaxedCell[] | null)[] = input.territories.map((_, owner) =>
    cells ? cells.filter((c) => c.owner === owner) : null,
  );
  const surfaces: (ParcelSurface | null)[] = input.territories.map((t, i) => {
    const own = ownerCells[i];
    return own ? buildTerritorySurface(t, own) : null;
  });
  // ADR-0218's fenced baked-art seam is RE-LIT here (grounded-art inc 11, ADR-0221): when `input.garden`
  // is present, its heroes' `baked-def`s are emitted once into a `baked-defs` layer that every hero
  // placement `baked-use` (in `buildGardenArt`) references. ABSENT ⇒ no defs layer, and every island
  // renders byte-for-byte (the same absence lock as `parcels`/`uatCriteria`; the public website never
  // sends `garden`). The heroes compose ONLY onto the island named by `garden.islandId`.
  const garden = input.garden ?? null;
  const layers: SceneNode[] = [
    ...(garden ? [buildGardenDefs(garden)] : []),
    buildEmpties(input),
    buildCoast(input),
    buildGround(input, surfaces),
    buildTrails(input),
    g(
      [
        ...input.territories.map((t, i) =>
          buildTerritoryFlora(
            t,
            surfaces[i]?.flora ?? null,
            ownerCells[i] ?? null,
            garden && garden.islandId === t.id ? garden : null,
          ),
        ),
        ...buildCaves(input),
      ],
      { kind: 'flora-layer' },
    ),
    buildHits(input),
  ];
  return g(layers, {
    kind: 'world',
    transform: `translate(${f(input.offset.x)} ${f(input.offset.y)})`,
  });
}
