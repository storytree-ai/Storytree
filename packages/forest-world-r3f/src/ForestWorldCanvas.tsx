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

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Instance, Instances, Line, MapControls } from '@react-three/drei';
import { Color, OrthographicCamera } from 'three';
import type { InstanceDescriptor, Descriptor3D } from './world-to-3d.js';
import { frameWorld, orthographicZoomFor } from './camera-framing.js';
import { cellGroundGeometry, type LinearRgb } from './cell-ground-geometry.js';

/** Status-variant → placeholder colour (spike palette, not art direction).
 *
 *  A `ReadonlyMap` rather than a `Record<string, string>`: `InstanceDescriptor.material` is an open
 *  `string`, so this is a LOOKUP with a computed key and the key type carries no knowledge to
 *  discard — which is what `anti-slop/no-known-value-widening` fires on. The Map states the same
 *  thing without the widening annotation AND adds an immutability fence the object literal never
 *  had; the rule's classifier does not treat `ReadonlyMap` as a widening target. */
const STATUS_COLOUR: ReadonlyMap<string, string> = new Map([
  ['healthy', '#4f9d5d'],
  ['mapped', '#5d8fa8'],
  ['building', '#7f8fd1'],
  ['proposed', '#c2b280'],
  ['unhealthy', '#8a5a44'],
  ['unknown', '#9a9a9a'],
]);

const UNKNOWN_COLOUR = '#9a9a9a';

const colourOf = (material: string | undefined): string =>
  STATUS_COLOUR.get(material ?? 'unknown') ?? UNKNOWN_COLOUR;

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
          color={colourOf(t.material)}
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
 *  (ADR-0392 D5 / ADR-0398 D7). Going through the same class is what makes that unrepresentable. */
const linearColourOf = (material: string | undefined): LinearRgb => {
  const c = new Color(colourOf(material));
  return { r: c.r, g: c.g, b: c.b };
};

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
 *  colour survives as a vertex attribute. */
function CellGround({ cells }: { cells: InstanceDescriptor[] }) {
  const geo = useMemo(() => cellGroundGeometry({ cells, resolve: linearColourOf }), [cells]);
  if (geo.triangles === 0) return null;
  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geo.positions, 3]} />
        <bufferAttribute attach="attributes-normal" args={[geo.normals, 3]} />
        <bufferAttribute attach="attributes-color" args={[geo.colors, 3]} />
      </bufferGeometry>
      {/* `vertexColors` is what carries the per-parcel status through the merge; the material is
          otherwise the same placeholder `meshStandardMaterial` the classic prisms wear. */}
      <meshStandardMaterial vertexColors />
    </mesh>
  );
}

function StoryTree({ tree }: { tree: InstanceDescriptor }) {
  const { x, y, z } = tree.transform;
  const colour = colourOf(tree.material);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[1.2, 1.6, 8]} />
        <meshStandardMaterial color="#6b4f35" />
      </mesh>
      <mesh position={[0, 12, 0]}>
        <coneGeometry args={[7, 14, 8]} />
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
  const cells = byKind(descriptors, 'cell-ground');
  const trees = byKind(descriptors, 'story-tree');
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
    <Canvas orthographic camera={{ position: frame.position, near: 1, far: 4000 }}>
      <color attach="background" args={['#101418']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[120, 300, 80]} intensity={1.1} />
      <HexGround tiles={grounds} />
      <CellGround cells={cells} />
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
