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
// Trails are HIDDEN BY DEFAULT (ADR-0169 §3/§4): this canvas has no island
// focus/selection concept yet, so the minimal reveal is the `showTrails` prop —
// nothing focused, nothing shown; opting in draws the whole network. Ghost
// (under-island) strips are never drawn here — the cave props carry that story.

import { Canvas } from '@react-three/fiber';
import { Instance, Instances, Line, MapControls } from '@react-three/drei';
import type { InstanceDescriptor, Descriptor3D } from './world-to-3d.js';

/** Status-variant → placeholder colour (spike palette, not art direction). */
const STATUS_COLOUR: Record<string, string> = {
  healthy: '#4f9d5d',
  mapped: '#5d8fa8',
  building: '#7f8fd1',
  proposed: '#c2b280',
  unhealthy: '#8a5a44',
  unknown: '#9a9a9a',
};

const colourOf = (material: string | undefined): string =>
  STATUS_COLOUR[material ?? 'unknown'] ?? STATUS_COLOUR['unknown']!;

const byKind = (descriptors: readonly Descriptor3D[], kind: InstanceDescriptor['kind']) =>
  descriptors.filter((d): d is InstanceDescriptor => d.kind === kind);

/** SVG-plane scale → world units. The core's 2D coordinates are SVG pixels
 *  (HEX_R ≈ 10s of units); render them 1:1 and size the camera instead. */
const HEX_RADIUS = 9;
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

/** Frame the whole world on load: the instance centroid is the MapControls target
 *  and the camera backs off proportionally to the world's spread. */
function frameWorld(instances: InstanceDescriptor[]): {
  target: [number, number, number];
  position: [number, number, number];
} {
  if (instances.length === 0) return { target: [0, 0, 0], position: [0, 260, 260] };
  let sx = 0;
  let sz = 0;
  for (const i of instances) {
    sx += i.transform.x;
    sz += i.transform.z;
  }
  const cx = sx / instances.length;
  const cz = sz / instances.length;
  let spread = 0;
  for (const i of instances) {
    spread = Math.max(spread, Math.abs(i.transform.x - cx), Math.abs(i.transform.z - cz));
  }
  const back = Math.max(260, spread * 2.6);
  return { target: [cx, 0, cz], position: [cx, back, cz + back] };
}

/**
 * The minimal R3F canvas of the spike: descriptors → placeholder meshes under drei
 * `MapControls` (pan / zoom / rotate a top-down-ish world map). Client-only
 * (`ssr:false` posture — the site lazy-loads this island after the inflection).
 */
export function ForestWorldCanvas({ descriptors, showTrails = false }: ForestWorldCanvasProps) {
  const grounds = byKind(descriptors, 'hex-ground');
  const trees = byKind(descriptors, 'story-tree');
  // trail-ghost-strip descriptors are deliberately not drawn (the surface's call —
  // the under-island run is told by the cave props, which render unconditionally
  // like the 2D scene's flora-layer props).
  const trails = showTrails ? byKind(descriptors, 'trail-strip') : [];
  const caves = byKind(descriptors, 'cave-arch');
  const wisps = byKind(descriptors, 'wisp-sprite');
  const frame = frameWorld(descriptors.filter((d): d is InstanceDescriptor => d.kind !== 'skipped'));
  return (
    <Canvas camera={{ position: frame.position, fov: 45, near: 1, far: 4000 }}>
      <color attach="background" args={['#101418']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[120, 300, 80]} intensity={1.1} />
      <HexGround tiles={grounds} />
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
      <MapControls makeDefault target={frame.target} />
    </Canvas>
  );
}
