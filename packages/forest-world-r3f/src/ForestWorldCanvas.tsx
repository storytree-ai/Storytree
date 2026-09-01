// ForestWorldCanvas.tsx — the thin R3F shell over the pure descriptor mapping
// (the r3f-world-spike capability's visible half). Browser-only by design: this
// file imports React / three / @react-three/fiber / @react-three/drei and is
// exported via the `./canvas` subpath, NEVER from the pure root barrel — the
// provability firewall (world-to-3d.ts stays importable under bare node:test).
//
// Spike scale, no art direction (ADR-0070: the look is witnessed, not
// machine-judged; the painterly pass arrives with the experience caps): each
// descriptor family gets a placeholder mesh — instanced hex prisms for the
// ground, a cone-on-trunk for the story tree, a ground ribbon-line for a trail
// segment, a dark rim disc for a cave portal, an emissive sprite-ball for a
// wisp — coloured by the folded status variant.
//
// THE PROJECTION IS ORTHOGRAPHIC AND THE VIEW DOES NOT ROTATE (ADR-0380 D6 fence 4). This
// canvas shipped for months as a PerspectiveCamera under a rotate-capable orbit control, which
// the fence does not license — the spike authored the camera, the ADR later fenced the
// projection, and nobody reconciled the two (`the-shipped-canvas-meets-the-isometric-fence`).
// ⚠ ZOOM AND PAN ARE UNTOUCHED and must stay that way: the fence names the PROJECTION and the
// free ROTATION, never the ability to get closer, and the owner affirmed zoom explicitly
// (2026-08-22, ADR-0415 D1). Zoom on an orthographic camera is `camera.zoom`, which is exactly
// what `MapControls` already drives — see {@link FitOrthographicFraming} for the one wrinkle
// that creates.
//
// Trails are HIDDEN BY DEFAULT (ADR-0169 §3/§4): this canvas has no island
// focus/selection concept yet, so the minimal reveal is the `showTrails` prop —
// nothing focused, nothing shown; opting in draws the whole network. Ghost
// (under-island) strips are never drawn here — the cave props carry that story.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Instance, Instances, Line, MapControls } from '@react-three/drei';
import { Color, OrthographicCamera, type Mesh } from 'three';
import type { InstanceDescriptor, Descriptor3D } from './world-to-3d.js';
import { frameWorld, orthographicZoomFor } from './camera-framing.js';
import {
  cellGroundGeometry,
  type CellGroundGeometryInput,
  type LinearRgb,
} from './cell-ground-geometry.js';
import { SHIPPED_COAST, clipToCoast } from './coast-clip.js';
import { LAND_RELIEF_AMPLITUDE } from './land-relief.js';
import { SHIPPED_SHORE, shoreRelief } from './shore-fall.js';
import { shoreArmRingPlan } from './shore-ring.js';
import {
  atlasOriginResolver,
  buildAtlasOcclusion,
  type AtlasField,
} from './shadow-atlas.js';
import { groundBounds, groundCasters, STORY_TREE_CROWN, STORY_TREE_TRUNK } from './ground-casters.js';
import type { ShadowCaster } from './land-shadow.js';
import { kitMeshes, loadEmbeddedKit, roleFootprints, type LoadedKit } from './kit-mesh.js';
import { dressMapFromKit } from './map-dressing.js';
import { LIGHT_DIRECTION } from './shade-ladder.js';
import { EXACT_COLOUR_CANVAS_PROPS } from './exact-colour.js';
import { calibrateLights, intensitiesFor } from './light-calibration.js';
import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundAtlasTexture,
  type BandedGroundMaterialOptions,
} from './banded-ground-material.js';

/** THE DECIDED GROUND VOCABULARY — five colours over six states.
 *
 *  ⚠ THIS FILE USED TO CARRY A SEVENTH, PRIVATE PALETTE, and it disagreed with the decisions on
 *  ALL SIX STATES rather than by a shade: `mapped` was a BLUE `#5d8fa8` where ADR-0470 settled a
 *  tilled clay, `unhealthy` a BROWN `#8a5a44` where the decision says a charred near-black, and
 *  `building` still owned a periwinkle after ADR-0462 merged it into `proposed`'s yellow. Its own
 *  comment called it a "spike palette, not art direction", which was true when nothing mounted
 *  this canvas and stopped being true on 2026-08-28, when the public site's chapter 2 began
 *  opening on the real forest through this very component. THE LAND'S COLOUR IS A CAPABILITY'S
 *  PROOF STATE (ADR-0392 D5 / ADR-0398 D7, as amended by ADR-0461), so a palette no decision
 *  authorises is the map REPORTING STATES IT WAS NEVER TOLD TO REPORT — not a cosmetic lag.
 *
 *  The values are the authoring surface's own: `apps/studio/src/index.css`'s
 *  `.hex-territory.st-<status>` blocks, of which `harness/palette-band.ts`'s `STATUS_TOKENS` is
 *  the declared transcription. THIS IS THE THIRD COPY AND IT IS NOW HELD MECHANICALLY —
 *  `pnpm check:palette-transcription` (and `harness/palette-transcription.test.ts`) reads all
 *  three off disk and refuses any disagreement. The harness cannot simply be imported here: the
 *  web sync mirrors `src/` into the public site and copies nothing from `harness/`, so an import
 *  across that line would dangle in the published tree (`harness/scope-fence.test.ts`).
 *
 *  FIVE COLOURS, SIX STATES (ADR-0462): `proposed` and `building` deliberately share the yellow —
 *  the live-work signal is the orbiting WISP (ADR-0200 / ADR-0142), never the ground, so the land
 *  was spending a sixth colour saying something it was not the one saying. Each family's three
 *  authored `--hex-top-*` variants collapse to the FIRST here, because this canvas draws one
 *  colour per parcel and has no per-cell variant hash to pick between them.
 *
 *  A `ReadonlyMap` rather than a `Record<string, string>`: `InstanceDescriptor.material` is an open
 *  `string`, so this is a LOOKUP with a computed key and the key type carries no knowledge to
 *  discard — which is what `anti-slop/no-known-value-widening` fires on. The Map states the same
 *  thing without the widening annotation AND adds an immutability fence the object literal never
 *  had; the rule's classifier does not treat `ReadonlyMap` as a widening target. */
const GROUND_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#8cb85e'],
  ['mapped', '#b7684e'],
  ['building', '#d8c069'],
  ['proposed', '#d8c069'],
  ['unhealthy', '#57544a'],
  ['unknown', '#9ca3af'],
]);

/** THE DECIDED CROWN VOCABULARY — the story tree's canopy, per status.
 *
 *  ⚠ IT IS A SEPARATE TABLE ON PURPOSE, AND THAT IS WHY THIS UNIT IS A SPLIT RATHER THAN A
 *  FIND-AND-REPLACE. One lookup used to paint the ground AND the crowns, so swapping it wholesale
 *  would have fixed the land and quietly repainted every canopy with a ground colour. Ground and
 *  crown legitimately differ, and most visibly for `building`: the app authors no
 *  `--crown-building-*` pair, so a building story's crown falls through to `unknown`'s slate while
 *  its GROUND wears `proposed`'s yellow. A single table cannot hold both facts.
 *
 *  Transcribed from `apps/studio/src/index.css`'s `--crown-<status>-lo` custom properties — what
 *  `.story-tree .crown-lo circle` actually fills with — mirrored in `harness/palette-band.ts` as
 *  `TREE_TOKENS`, and held to both by the same check as {@link GROUND_COLOUR}. The lighter
 *  `--crown-<status>-hi` is deliberately not transcribed: it is the flat SVG standing in for a
 *  light it does not have, and this canvas has a real `directionalLight`.
 *
 *  `building` is in any case unreachable on the shipped map — `worldStatus` folds it to `proposed`
 *  before anything is stamped (ADR-0038) — so both its entries describe what a surface that does
 *  NOT fold would draw. Transcribing what the app DELIVERS rather than harmonising the two is the
 *  same rule the harness follows: inventing the missing amber here would put a colour on the map
 *  that the authoring surface has never drawn. */
const CROWN_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#2f6b3f'],
  ['mapped', '#7d5f3b'],
  ['building', '#6b7280'],
  ['proposed', '#b06a24'],
  ['unhealthy', '#9f2d22'],
  ['unknown', '#6b7280'],
]);

/** The fallback both lookups share: an unrecognised material is UNKNOWN, which is the one state
 *  that means "no data". Falling back to any other status would have the map assert something
 *  about work it could not classify. */
const UNKNOWN_STATUS = 'unknown';

/** GROUND colour for a status variant — the two ground substrates only (the classic hex prisms
 *  and the relaxed-mesh parcels). */
const groundColourOf = (material: string | undefined): string =>
  GROUND_COLOUR.get(material ?? UNKNOWN_STATUS) ?? GROUND_COLOUR.get(UNKNOWN_STATUS)!;

/** CROWN colour for a status variant — the story tree's canopy cone, and nothing else. */
const crownColourOf = (material: string | undefined): string =>
  CROWN_COLOUR.get(material ?? UNKNOWN_STATUS) ?? CROWN_COLOUR.get(UNKNOWN_STATUS)!;

const byKind = (descriptors: readonly Descriptor3D[], kind: InstanceDescriptor['kind']) =>
  descriptors.filter((d): d is InstanceDescriptor => d.kind === kind);

/** SVG-plane scale → world units. The core's 2D coordinates are SVG pixels
 *  (HEX_R ≈ 10s of units); render them 1:1 and size the camera instead. */
const HEX_RADIUS = 9;
// ⚠ Held equal to `CELL_GROUND_DEPTH` by `shipped-baseline.test.ts` — the two ground substrates
// are the same ground in two representations and must not drift to different thicknesses. It stays
// a literal because that same test parses this file's source for it.
const TILE_HEIGHT = 3;

function HexGround({ tiles }: { tiles: InstanceDescriptor[] }) {
  if (tiles.length === 0) return null;
  return (
    <Instances limit={Math.max(tiles.length, 1)}>
      {/* a 6-segment cylinder IS the extruded hex prism */}
      <cylinderGeometry args={[HEX_RADIUS, HEX_RADIUS, TILE_HEIGHT, 6]} />
      <meshStandardMaterial />
      {tiles.map((t, i) => (
        <Instance
          key={i}
          position={[t.transform.x, t.transform.y - TILE_HEIGHT / 2, t.transform.z]}
          color={groundColourOf(t.material)}
        />
      ))}
    </Instances>
  );
}

/** Status variant → LINEAR colour, using three's OWN sRGB transfer function rather than a
 *  transcription of it. `<Instance color="#4f9d5d" />` puts the hex through `THREE.Color` on its
 *  way into the instanced attribute, so a vertex-colour buffer built any other way would draw the
 *  same status token at a visibly different lightness from the classic prisms — the two substrates
 *  would stop agreeing about what a colour MEANS, which on this surface is what the map reports
 *  (ADR-0392 D5 / ADR-0398 D7). Going through the same class is what makes that unrepresentable.
 *
 *  ⚠ THE BANDED GROUND NO LONGER READS THIS, and it is kept because the comparison instrument
 *  does: `harness/shipped-land-scene.ts` builds the pre-adoption arms — the map as it drew on
 *  2026-08-29 and again on 2026-08-30 — from the same function with the same resolver, which is
 *  what makes those arms the shipped map rather than a reconstruction of it. */
const linearColourOf = (material: string | undefined): LinearRgb => {
  const c = new Color(groundColourOf(material));
  return { r: c.r, g: c.g, b: c.b };
};

/** THE RAMP ROWS, IN ONE ORDER, DERIVED FROM ONE MAP. `GROUND_TOKENS[i]` is the authored token a
 *  vertex carrying `statusIndex === i` wears, and {@link groundRowOf} is the inverse. Both come
 *  off {@link GROUND_COLOUR}'s own insertion order rather than from two hand-kept lists that
 *  agree today: a geometry indexing one order and a material uploading another would paint every
 *  parcel a DIFFERENT status's colour — the one failure this surface may never have. */
const GROUND_TOKENS: readonly string[] = [...GROUND_COLOUR.values()];
const GROUND_ROWS: ReadonlyMap<string, number> = new Map(
  [...GROUND_COLOUR.keys()].map((status, i) => [status, i]),
);

/** The ramp ROW for a status variant. An unrecognised material is `unknown`'s row, exactly as
 *  {@link groundColourOf} falls back to `unknown`'s colour — the one state that means "no data".
 *  Falling back to any other row would have the map assert something about work it could not
 *  classify, and it would do it in the form hardest to notice: a plausible colour. */
const groundRowOf = (material: string | undefined): number =>
  GROUND_ROWS.get(material ?? UNKNOWN_STATUS) ?? GROUND_ROWS.get(UNKNOWN_STATUS)!;

/** The ONE banded ground material, built once for the module rather than per canvas: it holds
 *  only the authored ramp, the authored light and the authored grain, all of which are constants,
 *  so a second instance would be a second copy of the same 24 colours with a second chance to
 *  disagree.
 *
 *  ⚠ IT WEARS THE GRAIN'S NORMAL HALF, UNCONDITIONALLY AND WITH NO FLAG (2026-08-30) — the third
 *  component of the approved treatment to cross, and the rest of the owner's "improve the ground
 *  texture". The ladder gave the land authored zones; the grain is what gives those zones an EDGE
 *  at the zoomed read, which is the component the research measured as worth +54% of the bare
 *  land's micro-contrast and the only lever that makes the ground survive being zoomed into.
 *
 *  ⚠⚠ AND IT IS THE NORMAL HALF ONLY, WHICH IS A MEASUREMENT RATHER THAN A CAUTION. The Cycles
 *  grain is two mechanisms. The normal half perturbs the lambert BEFORE the quantiser, so the
 *  fragment still writes an authored ramp entry and this material's whole guarantee — every
 *  delivered land pixel is one of 20 authored `(token x level)` colours — is untouched. The
 *  COLOUR half mixes a noise ramp into the delivered colour, and
 *  `harness/grain-status-reading.ts` drove all six ground tokens through that mix and found its
 *  authored fac of 0.13 INADMISSIBLE: the `proposed`/`building` yellow at the ladder's two
 *  darkest rungs walks into `healthy`'s green under the house reader model, which is an
 *  ADR-0392 D5 / ADR-0398 D7 failure rather than a matter of taste. The largest fac every reading
 *  survives is 0.031. That fork is the owner's and is open;
 *  `oq-the-grain-s-colour-half-is-inadmissible-on-the-shipped-pa` carries it. */
/**
 * The ONE banded ground material for a scene.
 *
 * ⚠ IT USED TO BE A MODULE-SCOPE SINGLETON and stopped being one when the shadow arrived
 * (2026-08-30). The ramp, the light and the grain are all constants, so one instance for the
 * module was right; the OCCLUSION FIELD is not a constant — it is built over this island's own
 * ground bounds from this island's own casters — so a shared material would hand every canvas
 * the first one's shadow. It is memoised per parcel set instead, which keeps the "one material,
 * one copy of the 24 colours" property that mattered.
 *
 * ⚠ IT WEARS THE OCCLUSION FIELD UNCONDITIONALLY AND WITH NO FLAG, like the relief, the ladder
 * and the grain before it — the arc's end-state item 6 is explicit that a flag nobody flips is
 * not adoption. The owner asked for shadows by name on 2026-08-29.
 *
 * ⚠⚠ AND THE RUNG IT DARKENS TO IS DERIVED, NOT CHOSEN. `shadowLadderFor` sweeps the ladder
 * downward asking whether every authored ground token still reads as ITSELF, and hands back the
 * deepest level at which they all do — 0.77 on this palette, against a flat-ground rung of 0.90,
 * so a shadowed parcel is about 14% darker than a lit one. One rung below that, the
 * `proposed`/`building` yellow reads as `healthy` green: a merely-proposed capability reporting
 * as signed-off, which is an ADR-0392 D5 / ADR-0398 D7 failure rather than a matter of taste. The
 * headroom is 3.0 weighted channel units and it is the PALETTE's tightness, not the shadow's
 * greed — the same wall the grain's colour half met.
 */
function buildGroundMaterial(field: AtlasField | null) {
  const opts: BandedGroundMaterialOptions = { tokens: GROUND_TOKENS, grain: 'normal' };
  const shadow = field === null ? null : groundAtlasTexture(field);
  if (shadow !== null) opts.shadowAtlas = shadow;
  return { material: createBandedGroundMaterial(opts), shadow };
}

/**
 * THE OCCLUSION FIELD, PACKED OVER THE ISLANDS — adopted 2026-08-31, unconditionally and with no
 * flag, like the relief, the ladder, the grain and the shadow itself before it.
 *
 * ⚠⚠ IT REPLACED A FIELD ALLOCATED OVER THE GROUND'S RECT, and the reason is a measurement
 * rather than a preference. `occlusionGres` is `min(SHADOW_GRES, SHADOW_TEXTURE_MAX / widestSpan)`,
 * so ONE island (234 ground units) got the authored 3.000 samples per ground unit and a real
 * thirty-five-island forest (~3,500) got 0.585 — 5.1x coarser, against parcels whose mean
 * diameter is 16.57. The contact pool under a story tree lost 5.5% of its area and 15.3% of its
 * pixels moved: a soft round shadow became a lumpy one, precisely when the map became the real
 * map. Packed over the islands themselves it is the authored resolution at every map size, and a
 * SINGLE island is byte-identical to what it was (measured: 0.000% of the frame moved).
 *
 * ⚠ A PARCEL SET THAT BOUNDS NOTHING GETS NO FIELD, rather than a one-texel one every fragment
 * then samples. `groundBounds` returns null rather than a degenerate rect precisely so this branch
 * has to be written down.
 *
 * The costing of all three remedies — raising the texture cap (26x the memory, a 10,498-texel
 * edge), a field and a material PER ISLAND (35 draw calls with the whole forest on screen), and
 * this one — is `docs/research/chapter2-shipped-shadow-2026-08-31/`.
 */
function buildGroundOcclusionField(
  cells: readonly InstanceDescriptor[],
  casters: readonly ShadowCaster[],
): AtlasField | null {
  if (groundBounds(cells) === null) return null;
  return buildAtlasOcclusion({ cells, relief: LAND_RELIEF_AMPLITUDE, casters });
}

/** The RELAXED-MESH ground: every parcel on the island in ONE merged, flat-shaded buffer.
 *
 *  ⚠ THIS IS THE SUBSTRATE THE STUDIO ACTUALLY SHIPS, and until 2026-08-28 this canvas drew
 *  nothing for it — the mapper had a case for the classic `tile` hex only, so 164 parcels fell
 *  through to a skip and a real island rendered as one story tree over empty space (measured and
 *  pictured by `adopt-the-land-into-the-shipped-map-arc-inc-01`, PR #1679).
 *
 *  ⚠ ONE MESH, NOT ONE PER PARCEL. Parcels are arbitrary polygons, so they cannot share a
 *  geometry and `<Instances>` is unavailable; 164 separate meshes would cost 164 draw calls to
 *  draw ground the classic substrate drew in one. The merge keeps it at one, and per-parcel status
 *  colour survives as a vertex attribute.
 *
 *  ⚠ IT STANDS ON THE RELIEF FIELD, UNCONDITIONALLY AND WITH NO FLAG (2026-08-30). The owner
 *  authorised adoption on 2026-08-29 and the arc's end-state item 6 is explicit that a flag
 *  nobody flips is not adoption. `landRelief` costs no triangles, no draw call and no attribute
 *  channel — the vertices this mesh already emits simply stand where the land is and face the way
 *  it turns. The before/after is taken by calling `cellGroundGeometry` with and without it, which
 *  is why the field is an INPUT rather than something this file reaches for internally.
 *
 *  ⚠ AND IT WEARS THE BANDED LADDER, ALSO UNCONDITIONALLY AND FOR THE SAME REASON (2026-08-30).
 *  Relief alone arrives through `meshStandardMaterial` as a SMOOTH lambert gradient, which is not
 *  what the approved research renders show — they show four authored zones. Relief was the
 *  precondition (a ladder over a flat plane has one rung to quantise onto); this is the ladder.
 *  What changes for the map's honesty is a TIGHTENING rather than a risk: the smooth material
 *  could deliver any lightness the scene lights produced, where every pixel this one can emit is
 *  one of the 24 authored `(token x level)` products, floored at 0.78 of the token.
 *
 *  ⚠ AND IT WEARS THE GRAIN'S NORMAL HALF, ALSO UNCONDITIONALLY AND FOR THE SAME REASON
 *  (2026-08-30). See {@link BANDED_GROUND} for why only that half of the grain ships.
 *
 *  ⚠ AND IT IS CLIPPED TO ITS COAST, ALSO UNCONDITIONALLY AND FOR THE SAME REASON (2026-09-01).
 *  The relaxed substrate pins its outer vertices to the hexes it was built from, so an island used
 *  to end in 120° corners and read as a cluster of tiles. It now ends on the story-seeded,
 *  Chaikin-rounded coast the studio's 2D map has drawn all along — the same `smoothCoast` machinery,
 *  imported rather than transcribed, so the two renderers agree about where an island ends.
 *  {@link SHIPPED_COAST} names which of the three shapes ships and why; `src/coast-clip.ts` carries
 *  the fork, and `docs/research/chapter2-shipped-coast-2026-09-01/` carries the pictures.
 *
 *  ⚠⚠ WHAT IT COSTS THE MAP'S HONESTY IS NOTHING, AND THAT IS A MEASURED CLAIM RATHER THAN AN
 *  ASSUMPTION. Every parcel keeps its own capability, its own island and its own status colour; the
 *  only thing that moves is where the outermost ones end. And the clip is CAPPED so that no parcel
 *  crosses itself — which it would otherwise do, because the coast the 2D panel draws
 *  self-intersects twice on this very island and an SVG fill hides what a triangulated ground
 *  cannot.
 *
 *  ⚠ SO THE COLOUR ATTRIBUTE IS GONE FROM THE UPLOAD, and `statusIndex` is what replaces it. The
 *  buffer still CARRIES `colors` — the comparison instrument builds the pre-adoption arms out of
 *  it — but uploading an attribute no material reads would be payload the map draws nothing
 *  with. */
function CellGround({
  cells,
  casters,
}: {
  cells: InstanceDescriptor[];
  casters: readonly ShadowCaster[];
}) {
  const built = useMemo(() => {
    // ⚠⚠ THE COAST IS CLIPPED FIRST, AND EVERYTHING DOWNSTREAM READS THE CLIPPED PARCELS.
    // The occlusion atlas is packed over the ground's own bounds, so packing it over the PRE-clip
    // island would leave the new shore outside every tile: the beach would read the atlas's edge
    // texel and wear whatever shadow happened to sit there. Ordering it here makes that
    // impossible rather than merely unlikely.
    //
    // ⚠ AND IT IS THE GROUND ALONE. `dressMapFromKit` (below) still reads the mapper's own
    // descriptors, so a tree stands where its parcel put it and the beach grows underneath it.
    // Moving the props with the shore would have been a second change wearing this one's name.
    const clipped = clipToCoast(cells, SHIPPED_COAST);
    // ⚠ THE FIELD IS BUILT FIRST AND THE GEOMETRY READS ITS PACKING, which is what makes "the
    // mesh and the material agree about where each island's tile is" true by construction rather
    // than by two calls happening to pack the same way. They disagree silently: every island would
    // read some other island's corner of the atlas, and the map would wear a perfectly ordinary
    // set of shadows belonging to the wrong land.
    const field = buildGroundOcclusionField(clipped, casters);
    const input: CellGroundGeometryInput = {
      cells: clipped,
      resolve: linearColourOf,
      index: groundRowOf,
      // ⚠⚠ THE SHORE FALL READS THE CLIPPED PARCELS, AND THAT ORDERING IS THE COMPONENT.
      // After `clipToCoast` the boundary of this mesh IS the coast, so the distance to the
      // mesh's own rim is the distance to the shore — one coastline, not two to keep in step.
      // Handed the pre-clip descriptors it would measure to the hex silhouette and put the
      // waterline a beach's width inland of the water.
      //
      // ⚠ IT IS A STRICT EXTENSION OF `landRelief`, WHICH IS WHY THIS LINE REPLACES IT RATHER
      // THAN JOINING IT. Inland of the band the field returns `landHeight` to the last bit, so
      // the whole interior of every island draws exactly what it drew before; only the beach
      // the coast clip added is new ground, and only there does the land move.
      relief: shoreRelief(clipped, SHIPPED_SHORE),
      // ⚠⚠ THE SAME ARM SUPPLIES THE MESH, AND IT HAS TO. The shore fall is an analytic field; the
      // ring is the vertices that let a triangulation carry its shape. Reading the band from one
      // arm and the ring from another would draw a falloff bending through chains placed for a
      // different band, and nothing downstream could tell.
      //
      // ⚠ ON AN ARM WITH NO RINGS THIS RESOLVES TO EVERY PARCEL'S OWN RING, so the line is the
      // pre-ring buffer verbatim — which is what keeps `SHIPPED_SHORE` a single switch over the
      // whole comparison rather than two that could disagree.
      decompose: shoreArmRingPlan(clipped, SHIPPED_SHORE).decompose,
    };
    // By statement rather than a conditional spread: under `exactOptionalPropertyTypes` an absent
    // `atlasOrigin` and an `atlasOrigin: undefined` are different inputs, and only the first
    // leaves the emitted buffer the one every pre-adoption figure was taken on.
    if (field !== null) input.atlasOrigin = atlasOriginResolver(field);
    const geo = cellGroundGeometry(input);
    return { geo, ...buildGroundMaterial(field) };
  }, [cells, casters]);
  // ⚠ THE MATERIAL AND ITS TEXTURE ARE DISPOSED, WHICH THE MODULE-SCOPE SINGLETON NEVER NEEDED
  // TO BE. The occlusion field is about 107 KB of GPU memory for one island, and a canvas that
  // re-mounts on every navigation would strand one copy per visit — a leak that grows with use
  // and is invisible until a long session runs out of texture memory.
  useEffect(
    () => () => {
      built.material.dispose();
      built.shadow?.texture.dispose();
    },
    [built],
  );
  if (built.geo.triangles === 0) return null;
  return (
    <mesh material={built.material}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[built.geo.positions, 3]} />
        <bufferAttribute attach="attributes-normal" args={[built.geo.normals, 3]} />
        <bufferAttribute
          attach={`attributes-${GROUND_STATUS_ATTRIBUTE}`}
          args={[built.geo.statuses, 1]}
        />
        {/* The island's tile corner in the packed occlusion atlas. Absent when the parcel set
            bounds nothing and therefore wears no field — the shader declares no attribute in that
            case either, so an empty buffer here would be one nothing reads. */}
        {built.geo.atlasOrigins.length > 0 && (
          <bufferAttribute
            attach={`attributes-${GROUND_ATLAS_ATTRIBUTE}`}
            args={[built.geo.atlasOrigins, 2]}
          />
        )}
      </bufferGeometry>
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// THE BOUGHT KIT — one object per capability (ADR-0475)
// ---------------------------------------------------------------------------

/**
 * THE KIT, PARSED ONCE FOR THE WHOLE PAGE.
 *
 * ⚠ A MODULE-SCOPE PROMISE RATHER THAN PER-MOUNT STATE, and it is the right singleton here for
 * the reason the ground material is NOT one: the kit is a constant — the same asset, the same
 * geometry, the same three materials, whatever island is on screen — where the occlusion field is
 * built from THIS island's own casters. Parsing it per mount would decode the same textures again
 * on every navigation and hold a second copy of them on the GPU.
 */
let kitPromise: Promise<LoadedKit> | null = null;
const kit = (): Promise<LoadedKit> => (kitPromise ??= loadEmbeddedKit());

/**
 * ONE BOUGHT OBJECT PER CAPABILITY, ITS SPECIES AND LEAF TINT CARRYING THAT CAPABILITY'S STATE.
 *
 * The owner settled this vocabulary on 2026-08-29 (ADR-0475) and authorised the crossing the same
 * day. Until now the shipped map drew ONE of the 1,089 things the semantic scene puts on its
 * ground: the story tree, and nothing else.
 *
 * ⚠⚠ THE BLOOMS ARE DRAWN PER ISLAND, AND THE WHOLE-MAP CALL THAT PRECEDED IT WAS THE HAZARD. The
 * vocabulary's sixth entry is one flower per UAT criterion the owner has signed (ADR-0226 D4), and
 * it is a claim about a STORY rather than about a capability. This component used to hand every
 * `cell-ground` descriptor on the map to `dressIslandFromKit` in ONE call — correct while the map
 * held one island, and a misreport the moment it held two, because a bloom is scattered over every
 * cell it is given. So the count was pinned at zero until `worldTo3D` learned the island id.
 * `dressMapFromKit` now spends each story's signatures on that story's own ground; a cell the
 * substrate cannot attribute still grows its capabilities' trees and never a bloom.
 *
 * ⚠ IT TAKES THE WHOLE DESCRIPTOR STREAM rather than the ground slice, because the signatures are
 * IN it: one `uat-bloom` per signed criterion. Counting them anywhere else would be a second
 * opinion about proof state, and two sources is how a map comes to disagree with itself.
 *
 * ⚠ THE FOOTPRINTS ARE READ OFF THE LOADED KIT, never declared here. A pine's canopy is as wide
 * as its own geometry says once scaled to 18 ground units, and a number restated in the canvas
 * would drift the first time the asset is re-exported.
 */
function KitProps({ descriptors }: { descriptors: readonly Descriptor3D[] }) {
  const [loaded, setLoaded] = useState<LoadedKit | null>(null);
  useEffect(() => {
    let live = true;
    // A kit that fails to parse must not take the MAP down with it: the ground is the thing that
    // reports proof state, and it reports it correctly with no props on it. The refusal is loud
    // in the console and the island simply stands bare.
    kit().then(
      (k) => {
        if (live) setLoaded(k);
      },
      (err: unknown) => {
        console.error('ForestWorldCanvas: the bought kit did not load, so no props are drawn', err);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const meshes = useMemo(() => {
    if (!loaded) return [];
    return kitMeshes(
      loaded,
      dressMapFromKit(descriptors, {
        relief: LAND_RELIEF_AMPLITUDE,
        footprint: roleFootprints(loaded),
      }),
    );
  }, [loaded, descriptors]);

  // ⚠ THE MERGED GEOMETRY IS DISPOSED, THE KIT'S OWN IS NOT. `kitMeshes` clones every part and
  // bakes its transform in, so each mesh here owns geometry nothing else refers to; the kit's
  // source geometry and its materials are the module singleton's and outlive every mount.
  useEffect(
    () => () => {
      for (const m of meshes) m.geometry.dispose();
    },
    [meshes],
  );

  return (
    <>
      {meshes.map((m: Mesh, i: number) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

function StoryTree({ tree }: { tree: InstanceDescriptor }) {
  const { x, y, z } = tree.transform;
  const colour = crownColourOf(tree.material);
  return (
    /* ⚠ THE DIMENSIONS COME FROM `ground-casters.ts`, NOT FROM LITERALS HERE. The occlusion
       field derives this tree's shadow from the same two constants, so a tree that grew and a
       shadow that did not is unrepresentable — the argument `bandGlsl` makes about the ladder,
       applied to a silhouette. */
    <group position={[x, y, z]}>
      <mesh position={[0, STORY_TREE_TRUNK.height / 2, 0]}>
        <cylinderGeometry
          args={[STORY_TREE_TRUNK.radiusTop, STORY_TREE_TRUNK.radiusBottom, STORY_TREE_TRUNK.height]}
        />
        <meshStandardMaterial color="#6b4f35" />
      </mesh>
      <mesh position={[0, STORY_TREE_CROWN.centreY, 0]}>
        <coneGeometry
          args={[STORY_TREE_CROWN.radius, STORY_TREE_CROWN.height, STORY_TREE_CROWN.segments]}
        />
        <meshStandardMaterial color={colour} />
      </mesh>
    </group>
  );
}

function TrailStrip({ strip }: { strip: InstanceDescriptor }) {
  const pts = strip.points ?? [];
  if (pts.length < 2) return null;
  return (
    <Line
      points={pts.map((p) => [p.x, p.y + 0.2, p.z] as [number, number, number])}
      color="#b0a48e"
      // width from the ONE shared rule (trailFillWidth, baked into the descriptor)
      lineWidth={strip.width ?? 3}
    />
  );
}

function CaveArch({ cave }: { cave: InstanceDescriptor }) {
  const { x, y, z } = cave.transform;
  const hw = ((cave.width ?? 4) * 1.6) / 2; // arch mouth half-width (matches the 2D prop)
  return (
    // -bearing about +Y points local +x along the outward rim normal (SVG y → 3D z
    // flips handedness); the unlit dark disc faces outward — ADR-0169 §4.
    <group position={[x, y, z]} rotation={[0, -(cave.bearing ?? 0), 0]}>
      <mesh position={[0, hw * 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[hw, 24]} />
        <meshBasicMaterial color="#171310" />
      </mesh>
    </group>
  );
}

function WispSprite({ wisp }: { wisp: InstanceDescriptor }) {
  const { x, y, z } = wisp.transform;
  return (
    <mesh position={[x, y + 20, z]}>
      <sphereGeometry args={[2.2, 12, 12]} />
      <meshStandardMaterial color="#ffe9a8" emissive="#ffd75e" emissiveIntensity={1.4} />
    </mesh>
  );
}

export interface ForestWorldCanvasProps {
  /** The pure mapping's output (`worldTo3D(buildScene(input))`). Skips are ignored
   *  here — they are audit records, not drawables. */
  descriptors: readonly Descriptor3D[];
  /** Opt the trail network visible. Trails are HIDDEN BY DEFAULT (ADR-0169 §3): with
   *  no focus concept on this canvas yet, the honest minimal reveal is all-or-nothing —
   *  a future focus feature filters strips by their `edges` metadata instead. */
  showTrails?: boolean;
}

/** Apply the framing to the orthographic camera — and PRESERVE THE VIEWER'S OWN ZOOM across a
 *  resize, which is the one wrinkle the projection change creates.
 *
 *  ⚠ `camera.zoom` is doing two jobs at once: it is how the island is framed on load, AND it is
 *  the property `MapControls` mutates when the viewer zooms in. Recomputing the fit on every
 *  resize would therefore silently throw the viewer's zoom away every time the window changed —
 *  taking away, by a side door, exactly the zoom the fence was careful not to touch. So the fit is
 *  applied as a RATIO against the previous fit: the first pass sets it outright, and every later
 *  one rescales whatever the viewer has since chosen by how much the fit itself moved. */
function FitOrthographicFraming({ halfHeight }: { halfHeight: number }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const appliedFit = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    const fit = orthographicZoomFor(halfHeight, Math.min(width, height));
    const previous = appliedFit.current;
    camera.zoom = previous === null || previous <= 0 ? fit : camera.zoom * (fit / previous);
    appliedFit.current = fit;
    camera.updateProjectionMatrix();
  }, [camera, halfHeight, width, height]);
  return null;
}

/**
 * THE MAP'S TWO LIGHTS, at the strengths a probe of this renderer says they should be.
 *
 * ⚠⚠ THE INTENSITIES ARE READ OFF THE LADDER, and they were `0.7` / `1.1` until 2026-08-30. That
 * pair was chosen when every lit object here was a flat placeholder cone or cylinder whose own
 * colour WAS the picture; for those, 1.8 of total intensity is merely bright. The bought kit is
 * the first thing on this map with a TEXTURE, and 1.8 saturates it — the first dressed frame
 * delivered pale grey needles on PINK trunks, which reads as a broken asset and is an overexposed
 * one. So a fully lit white face lands on the ladder's TOP rung and an unlit one on its FLOOR: the
 * same range the ground beside it is quantised into, by derivation rather than by eye.
 *
 * ⚠⚠ AND SINCE 2026-08-31 THE PAIR IS MEASURED RATHER THAN MERELY DERIVED. `calibrateLights`
 * renders a white, fully rough, fully lit standard face in THIS context, reads it back, and scales
 * both intensities by `target / probe` — the specular term a real `MeshStandardMaterial` carries is
 * not something the arithmetic on this side can predict. Until then the canvas ran no probe and
 * hung the authored intent, which is the smaller half of why its crowns did not match
 * `docs/research/chapter2-vocabulary-2026-08-29/island-kit-8px.png`. The larger half is the
 * transfer function itself and lives in `exact-colour.ts`.
 *
 * ⚠ IT DELIBERATELY DOES NOT RE-CONFIGURE THE RENDERER, IT ASSERTS. `calibrateLights` REFUSES a
 * renderer that is not in exact-colour mode, because `target / probe` is a one-shot solve that is
 * exact only where the delivered value is linear in intensity. @react-three/fiber's `configure`
 * pass runs before children render — `render(children)` awaits it — so by here the `<Canvas>`
 * spread has already taken. Re-applying it would paper over an ordering change instead of failing
 * on one.
 *
 * ⚠⚠ THE KEY LIGHT IS AIMED ALONG THE LAND'S OWN AUTHORED SUN, and it was not until 2026-08-30.
 * It sat at `[120, 300, 80]`, which normalises to (+0.36, +0.90, +0.24) — the OPPOSITE SIDE IN X
 * from `LIGHT_DIRECTION`'s (-0.45, +0.83, +0.35). So every lit object on this map was lit from the
 * east while the ground beside it was banded, and — once the shadow crossing landed — CAST ITS
 * SHADOWS from the west. A prop lit from one side and throwing its shadow toward the same side is
 * the incoherence that reads as "wrong" before anyone can say why, and the bought kit is what made
 * it matter: the story tree could carry it alone, a stand of trees cannot. It is DERIVED rather
 * than chosen — the same constant `banded-ground-material.ts` shades with and `land-shadow.ts`
 * casts along, so the three cannot drift apart. The distance is arbitrary (a directional light has
 * a direction, not a position) and is large enough to sit outside any world.
 */
function CalibratedLights() {
  const gl = useThree((s) => s.gl);
  // The probe renders one 8x8 frame and restores the canvas size. Memoised on the renderer, so it
  // runs once per mount rather than once per frame.
  const lit = useMemo(() => intensitiesFor(calibrateLights(gl)), [gl]);
  return (
    <>
      <ambientLight intensity={lit.ambient} />
      <directionalLight
        position={[LIGHT_DIRECTION.x * 400, LIGHT_DIRECTION.y * 400, LIGHT_DIRECTION.z * 400]}
        intensity={lit.directional}
      />
    </>
  );
}

/**
 * The minimal R3F canvas of the spike: descriptors → placeholder meshes under drei
 * `MapControls` (pan / zoom a top-down-ish world map — NOT rotate; the projection is fixed
 * 2.5D isometric per ADR-0380 D6 fence 4). Client-only
 * (`ssr:false` posture — the site lazy-loads this island after the inflection).
 */
export function ForestWorldCanvas({ descriptors, showTrails = false }: ForestWorldCanvasProps) {
  const grounds = byKind(descriptors, 'hex-ground');
  // The relaxed-mesh parcels. A scene carries ONE substrate or the other (`scene.ts:658`), so in
  // practice exactly one of `grounds` / `cells` is ever non-empty — but both are drawn
  // unconditionally rather than switched on, because a mapper that started emitting both would
  // then show it rather than silently drop one.
  // ⚠ MEMOISED ON `descriptors` RATHER THAN RECOMPUTED PER RENDER, which `byKind` alone was.
  // The parcel slice is what `CellGround` keys its own memo on, and that memo now builds a 107 KB
  // occlusion field and uploads a texture: a fresh array identity every render would rebuild and
  // re-upload both on every frame the canvas re-rendered for any reason at all.
  const cells = useMemo(() => byKind(descriptors, 'cell-ground'), [descriptors]);
  const trees = useMemo(() => byKind(descriptors, 'story-tree'), [descriptors]);
  // Everything that stands on the land and therefore darkens it. Derived from the WHOLE
  // descriptor set rather than from `trees` alone, because cave portals cast too and a caller
  // reading this list should see one place that answers "what casts a shadow here".
  const casters = useMemo(() => groundCasters(descriptors), [descriptors]);
  // trail-ghost-strip descriptors are deliberately not drawn (the surface's call —
  // the under-island run is told by the cave props, which render unconditionally
  // like the 2D scene's flora-layer props).
  const trails = showTrails ? byKind(descriptors, 'trail-strip') : [];
  const caves = byKind(descriptors, 'cave-arch');
  const wisps = byKind(descriptors, 'wisp-sprite');
  const frame = frameWorld(descriptors.filter((d): d is InstanceDescriptor => d.kind !== 'skipped'));
  return (
    /* ⚠ `orthographic` is the fence (ADR-0380 D6 fence 4), and `fov` is GONE rather than merely
       unused: R3F reads the presence of `fov` as a request for a PerspectiveCamera, so leaving it
       beside `orthographic` is the one way to write this that silently keeps the old projection.
       `near`/`far` now clip along the view direction rather than radially, and the eye sits
       `back * √2` away, so the same 1/4000 range still contains the whole world. */
    <Canvas
      orthographic
      {...EXACT_COLOUR_CANVAS_PROPS}
      camera={{ position: frame.position, near: 1, far: 4000 }}
    >
      <color attach="background" args={['#101418']} />
      <CalibratedLights />
      <HexGround tiles={grounds} />
      <CellGround cells={cells} casters={casters} />
      <KitProps descriptors={descriptors} />
      {trees.map((t, i) => (
        <StoryTree key={i} tree={t} />
      ))}
      {trails.map((t, i) => (
        <TrailStrip key={i} strip={t} />
      ))}
      {caves.map((c, i) => (
        <CaveArch key={i} cave={c} />
      ))}
      {wisps.map((w, i) => (
        <WispSprite key={i} wisp={w} />
      ))}
      <FitOrthographicFraming halfHeight={frame.halfHeight} />
      {/* ⚠ `enableRotate={false}` is the second half of fence 4 — an orthographic camera the
          viewer can still swing around is still a free camera, and the banded land treatment this
          arc is carrying in is authored against a FIXED light direction that would slide across
          static geometry under one. Pan (left drag) and zoom (wheel / pinch) are untouched. */}
      <MapControls makeDefault target={frame.target} enableRotate={false} />
    </Canvas>
  );
}
