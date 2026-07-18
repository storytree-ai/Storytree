// procedural-utils.ts — the pure procedural core.
//
// No DOM, no SVG, no rendering, no randomness-by-default. Node + browser safe.
//
// THE CENTRAL IDEA: an author never types a coordinate. They declare PARTS and the
// STRUCTURAL RELATION each part has to another part (`on` = rests on top of,
// `attached` = rigidly fixed to). Positions are DERIVED from that relation, so
// "the roof floats above the wall" is not a bug you can write — it is not expressible.
//
// What the relation cannot guarantee (a part resting on a parent but hanging off its
// edge, a window running past the end of a wall, two windows overlapping) is caught
// by ./invariants.ts against the same model. Between the two, every physics error we
// have seen from raw-SVG authoring is either impossible or mechanically detected.
//
// Coordinates: RIGHT-HANDED, Z IS UP. x = east, y = south, z = up. A shape is authored
// in LOCAL space with its base centred on the origin and extending toward +z.

export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// vec3
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a: Vec3): number => Math.sqrt(dot3(a, a));
export const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Newell's method — a stable face normal for any planar polygon, convex or not. */
export function faceNormal(pts: readonly Vec3[]): Vec3 {
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    // Both indices are in range by construction (`i` walks the array, the successor
    // wraps). The guard is what makes that provable rather than merely true.
    if (a === undefined || b === undefined) continue;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return norm3(v3(nx, ny, nz));
}

export function centroid(pts: readonly Vec3[]): Vec3 {
  const c = pts.reduce((acc, p) => add3(acc, p), v3(0, 0, 0));
  return scale3(c, 1 / pts.length);
}

// ---------------------------------------------------------------------------
// Isometric projection — the ONE place 3D becomes 2D (ADR-style single seam).
// ---------------------------------------------------------------------------

const COS30 = Math.cos(30 * DEG);
const SIN30 = Math.sin(30 * DEG);

/** A point on the 2D output surface. Screen y grows DOWNWARD (SVG convention). */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Strict 30-degree isometric projection. Screen y grows DOWNWARD (SVG convention),
 * so +z (up in world) subtracts from screen y.
 *   x2d = (x - y) * cos30
 *   y2d = (x + y) * sin30 - z
 */
export function project(p: Vec3): Vec2 {
  return { x: (p.x - p.y) * COS30, y: (p.x + p.y) * SIN30 - p.z };
}

/** The unit vector pointing from the scene TOWARD the camera, for this projection.
 *  A face is visible iff its outward normal has a positive dot with this. */
export const VIEW = norm3(v3(1, 1, 1));

/** Painter's-algorithm depth key: distance along the view axis. Larger = nearer the
 *  camera, so faces sorted ASCENDING draw far-to-near. This is the whole of what a
 *  3D engine gives you for free and SVG does not — ~4 lines, not a reason to swap. */
export const depthKey = (p: Vec3): number => dot3(p, VIEW);

// ---------------------------------------------------------------------------
// Lighting — N · L, per the integration checklist.
// ---------------------------------------------------------------------------

/**
 * Build a light direction from an azimuth (degrees, 0 = from +x/east, growing toward
 * +y/south) and an elevation (degrees above the horizon).
 * Returns the unit vector pointing FROM the surface TOWARD the light.
 */
export function lightVector(azimuthDeg: number, elevationDeg = 50): Vec3 {
  const a = azimuthDeg * DEG;
  const e = elevationDeg * DEG;
  return norm3(v3(Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)));
}

export interface ShadeOptions {
  ambient?: number;
  diffuse?: number;
}

/** Lambertian term with an ambient floor. Returns a 0..1 brightness multiplier. */
export function shade(normal: Vec3, light: Vec3, { ambient = 0.42, diffuse = 0.58 }: ShadeOptions = {}): number {
  return ambient + diffuse * Math.max(0, dot3(normal, light));
}

// ---------------------------------------------------------------------------
// Shape generators — each returns a LOCAL-space mesh, base centred at (0,0,0).
//
// A Shape is:
//   { height, radius, verts: Vec3[], faces: Face[], facets: Facet[] }
// A Face is { idx: number[], kind }        — kind drives material colour.
// A Facet is a side quad that MAY HOST APERTURES: { bl, br, tr, tl, wBottom, wTop,
//   height, normal, bearing } — bearing is the outward compass angle in degrees.
// ---------------------------------------------------------------------------

/** The material class of a face. Resolves to a base colour through the theme. */
export type FaceKind = 'roof' | 'floor' | 'wall' | 'gable' | 'soffit';

export interface Face {
  /** Indices into the owning shape's `verts`, in winding order. */
  idx: number[];
  kind: FaceKind;
  /** Part of a CURVED surface: the renderer suppresses its outline (see `dome`). */
  smooth?: boolean;
}

/** A side quad that may host apertures. */
export interface Facet {
  bl: Vec3;
  br: Vec3;
  tr: Vec3;
  tl: Vec3;
  wBottom: number;
  wTop: number;
  height: number;
  normal: Vec3;
  /** the outward compass angle in degrees */
  bearing: number;
}

export interface Shape {
  height: number;
  radius: number;
  verts: Vec3[];
  faces: Face[];
  facets: Facet[];
}

/**
 * Resolve a face's vertex indices against the vertex array they index into.
 * A shape generator emits `idx` alongside the very `verts` it points at, so an
 * out-of-range index is a generator bug — worth a loud throw, not a silent hole.
 */
export function facePoints(verts: readonly Vec3[], face: Face): Vec3[] {
  return face.idx.map((i) => {
    const p = verts[i];
    if (p === undefined) throw new Error(`face index ${i} is out of range (${verts.length} verts)`);
    return p;
  });
}

function quadFacet(bl: Vec3, br: Vec3, tr: Vec3, tl: Vec3): Facet {
  const c = centroid([bl, br, tr, tl]);
  return {
    bl,
    br,
    tr,
    tl,
    wBottom: len3(sub3(br, bl)),
    wTop: len3(sub3(tr, tl)),
    height: Math.max(tl.z - bl.z, tr.z - br.z),
    normal: faceNormal([bl, br, tr, tl]),
    bearing: (Math.atan2(c.y, c.x) / DEG + 360) % 360,
  };
}

export interface BoxParams {
  w: number;
  d: number;
  h: number;
}

/** An axis-aligned box. Four hostable side facets, bearings 0/90/180/270. */
export function box({ w, d, h }: BoxParams): Shape {
  const hw = w / 2,
    hd = d / 2;
  // Named corners rather than an array of eight: the facets below are built from the
  // corners themselves, so no index can point at the wrong one.
  const b0 = v3(-hw, -hd, 0),
    b1 = v3(hw, -hd, 0),
    b2 = v3(hw, hd, 0),
    b3 = v3(-hw, hd, 0);
  const t0 = v3(-hw, -hd, h),
    t1 = v3(hw, -hd, h),
    t2 = v3(hw, hd, h),
    t3 = v3(-hw, hd, h);
  const verts = [b0, b1, b2, b3, t0, t1, t2, t3];
  const faces: Face[] = [
    { idx: [4, 5, 6, 7], kind: 'roof' },
    { idx: [3, 2, 1, 0], kind: 'floor' },
    { idx: [0, 1, 5, 4], kind: 'wall' }, // -y (north)
    { idx: [1, 2, 6, 5], kind: 'wall' }, // +x (east)
    { idx: [2, 3, 7, 6], kind: 'wall' }, // +y (south)
    { idx: [3, 0, 4, 7], kind: 'wall' }, // -x (west)
  ];
  const facets = [
    quadFacet(b1, b2, t2, t1),
    quadFacet(b2, b3, t3, t2),
    quadFacet(b3, b0, t0, t3),
    quadFacet(b0, b1, t1, t0),
  ];
  return { height: h, radius: Math.max(hw, hd), verts, faces, facets };
}

export interface FrustumParams {
  sides?: number;
  r0: number;
  r1?: number;
  h: number;
  rot?: number;
}

/**
 * A regular n-gon frustum: radius r0 at the base tapering to r1 at height h.
 * This one generator covers cylinders (r0===r1), cones (r1===0), tapered windmill
 * towers, and mushroom stems. `rot` spins the polygon so a facet can be aimed at
 * the camera. Radii are CIRCUMRADII.
 */
export function frustum({ sides = 12, r0, r1 = r0, h, rot = 0 }: FrustumParams): Shape {
  // The ring point is a pure function of (index, radius, height), so the facet
  // corners below are RECOMPUTED rather than looked up — the same numbers, with no
  // index that could stray out of the array.
  const ringPoint = (i: number, r: number, z: number): Vec3 => {
    const a = rot * DEG + (i / sides) * Math.PI * 2;
    return v3(Math.cos(a) * r, Math.sin(a) * r, z);
  };
  const verts: Vec3[] = [];
  for (let i = 0; i < sides; i++) verts.push(ringPoint(i, r0, 0));
  for (let i = 0; i < sides; i++) verts.push(ringPoint(i, r1, h));
  const faces: Face[] = [];
  const facets: Facet[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const bl = ringPoint(i, r0, 0),
      br = ringPoint(j, r0, 0),
      tr = ringPoint(j, r1, h),
      tl = ringPoint(i, r1, h);
    if (r1 === 0) {
      faces.push({ idx: [i, j, sides], kind: 'wall' });
    } else {
      faces.push({ idx: [i, j, sides + j, sides + i], kind: 'wall' });
      facets.push(quadFacet(bl, br, tr, tl));
    }
  }
  if (r1 > 0) faces.push({ idx: Array.from({ length: sides }, (_, i) => sides + i), kind: 'roof' });
  faces.push({ idx: Array.from({ length: sides }, (_, i) => sides - 1 - i), kind: 'floor' });
  return { height: h, radius: Math.max(r0, r1), verts, faces, facets };
}

export interface DomeParams {
  r: number;
  h: number;
  sides?: number;
  rings?: number;
  bulge?: number;
  kind?: FaceKind;
}

/**
 * A domed cap: widest at the base (radius r) curving to a rounded crown at height h.
 * `bulge` > 0 pushes the profile outward past r partway up — a mushroom's overhang.
 * The underside is emitted as a `soffit` face so the cap reads as a solid, not a shell.
 */
export function dome({ r, h, sides = 20, rings = 6, bulge = 0, kind = 'roof' }: DomeParams): Shape {
  const verts: Vec3[] = [];
  const ringRadius = (t: number): number => {
    const base = Math.cos((t * Math.PI) / 2); // 1 at base -> 0 at crown
    return r * base + bulge * Math.sin(t * Math.PI) * base;
  };
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / rings;
    const rr = ringRadius(t);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      verts.push(v3(Math.cos(a) * rr, Math.sin(a) * rr, t * h));
    }
  }
  const crown = verts.length;
  verts.push(v3(0, 0, h));
  // `smooth` marks a face as part of a CURVED surface: the renderer suppresses its
  // outline so the facets read as one shell shaded by N·L, not as a tiled parasol.
  // Faceting is a discretisation artefact, not a design feature.
  const faces: Face[] = [];
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = ring * sides,
        b = (ring + 1) * sides;
      faces.push({ idx: [a + i, a + j, b + j, b + i], kind, smooth: true });
    }
  }
  const last = (rings - 1) * sides;
  for (let i = 0; i < sides; i++) {
    faces.push({ idx: [last + i, last + ((i + 1) % sides), crown], kind, smooth: true });
  }
  faces.push({ idx: Array.from({ length: sides }, (_, i) => sides - 1 - i), kind: 'soffit' });
  return { height: h, radius: r + bulge, verts, faces, facets: [] };
}

export interface GableParams {
  w: number;
  d: number;
  h: number;
}

/**
 * A gabled roof prism: eaves at z=0 spanning `w` on x and `d` on y, rising to a ridge
 * at height h. The ridge runs along the y axis. Rotate the PART to run it along x.
 */
export function gable({ w, d, h }: GableParams): Shape {
  const hw = w / 2,
    hd = d / 2;
  const verts = [
    v3(-hw, -hd, 0),
    v3(hw, -hd, 0),
    v3(hw, hd, 0),
    v3(-hw, hd, 0),
    v3(0, -hd, h),
    v3(0, hd, h),
  ];
  const faces: Face[] = [
    { idx: [0, 4, 5, 3], kind: 'roof' },
    { idx: [1, 2, 5, 4], kind: 'roof' },
    { idx: [0, 1, 4], kind: 'gable' },
    { idx: [3, 5, 2], kind: 'gable' },
    { idx: [3, 2, 1, 0], kind: 'floor' },
  ];
  return { height: h, radius: Math.max(hw, hd), verts, faces, facets: [] };
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export type Axis = 'x' | 'y' | 'z';

export interface Rotation {
  axis: Axis;
  deg: number;
}

function rotatePoint(p: Vec3, axis: Axis, deg: number): Vec3 {
  const a = deg * DEG,
    c = Math.cos(a),
    s = Math.sin(a);
  if (axis === 'x') return v3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
  if (axis === 'y') return v3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
  return v3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

// ---------------------------------------------------------------------------
// The builder — parts, relations, apertures.
// ---------------------------------------------------------------------------

/** How a part is held up. Every part has exactly one, and it is never a coordinate. */
export type RelationKind = 'ground' | 'on' | 'attached';

/** The relation an author declares when adding a part. */
export interface PartRelation {
  /** base sits at z = 0 */
  ground?: boolean;
  /** base sits EXACTLY on the named parent's top — derived */
  on?: string;
  /** rigidly fixed to the named parent */
  attached?: string;
  /** z offset from an `attached` parent's base */
  dz?: number;
  /** lateral offset from the parent's centre (0,0 for ground) */
  at?: { dx?: number; dy?: number };
  /** lowers the part into its parent (a chimney seated through a roof) */
  sink?: number;
  rotate?: Rotation;
  /** material key, resolved against the theme by the renderer */
  material?: string;
}

/** A placed part: local shape + the derived world-space position it sits at. */
export interface Part {
  id: string;
  shape: Shape;
  relation: RelationKind;
  parentId: string | null;
  baseZ: number;
  origin: Vec3;
  rotate: Rotation | null;
  material: string;
  world: Vec3[];
  worldFacets: Facet[];
  topZ: number;
}

export type ApertureKind = 'window' | 'door';

/** A hole cut into one facet of a part. */
export interface Aperture {
  id: string;
  host: string;
  facet: number;
  /** horizontal offset from the facet's centre */
  cu: number;
  /** height above the facet's bottom edge */
  sill: number;
  w: number;
  h: number;
  kind: ApertureKind;
}

export interface ApertureSpec {
  host: string;
  facet?: number;
  cu?: number;
  sill: number;
  w: number;
  h: number;
  kind?: ApertureKind;
}

/** The frozen model both the checker and the renderer consume. */
export interface BuildingModel {
  name: string;
  style: string;
  lightAngle: number;
  parts: Part[];
  apertures: Aperture[];
}

export interface BuildingParams {
  name: string;
  style?: string;
  lightAngle?: number;
}

export interface Building {
  name: string;
  style: string;
  lightAngle: number;
  add(id: string, shape: Shape, rel?: PartRelation): string;
  aperture(id: string, spec: ApertureSpec): string;
  facetAtBearing(hostId: string, bearingDeg: number): number;
  part(id: string): Part;
  model(): BuildingModel;
}

/**
 * Start a building. Every part is added through `on` / `attached` / `ground`, so a
 * part's base z is always DERIVED. Returns a plain model object that ./invariants.ts
 * checks and ./render-svg.ts draws — neither imports the other.
 */
export function building({ name, style = 'timber', lightAngle = 135 }: BuildingParams): Building {
  const parts = new Map<string, Part>();
  const apertures: Aperture[] = [];

  function resolve(id: string): Part {
    const p = parts.get(id);
    if (!p) throw new Error(`unknown part '${id}' — declare it before referencing it`);
    return p;
  }

  const api: Building = {
    name,
    style,
    lightAngle,

    /**
     * Add a part.
     *  - `{ ground: true }`           base sits at z = 0
     *  - `{ on: 'parentId' }`         base sits EXACTLY on the parent's top — derived
     *  - `{ attached: 'parentId', dz }` rigidly fixed to a parent at a z offset
     * `at: {dx, dy}` offsets laterally from the parent's centre (0,0 for ground).
     * `sink` lowers the part into its parent (a chimney seated through a roof).
     */
    add(id, shape, rel = {}) {
      if (parts.has(id)) throw new Error(`duplicate part id '${id}'`);
      const { dx = 0, dy = 0 } = rel.at ?? {};
      const sink = rel.sink ?? 0;

      let baseZ: number;
      let relation: RelationKind;
      let parent: Part | null = null;
      if (rel.on) {
        parent = resolve(rel.on);
        baseZ = parent.baseZ + parent.shape.height - sink; // <- the invariant, by construction
        relation = 'on';
      } else if (rel.attached) {
        parent = resolve(rel.attached);
        baseZ = parent.baseZ + (rel.dz ?? 0);
        relation = 'attached';
      } else {
        baseZ = 0 - sink;
        relation = 'ground';
      }

      const origin = v3((parent?.origin.x ?? 0) + dx, (parent?.origin.y ?? 0) + dy, baseZ);
      const rot = rel.rotate ?? null;

      const toWorld = (p: Vec3): Vec3 => add3(rot ? rotatePoint(p, rot.axis, rot.deg) : p, origin);
      const world = shape.verts.map(toWorld);
      const worldFacets = shape.facets.map((f) => ({
        ...f,
        bl: toWorld(f.bl),
        br: toWorld(f.br),
        tr: toWorld(f.tr),
        tl: toWorld(f.tl),
        normal: rot ? rotatePoint(f.normal, rot.axis, rot.deg) : f.normal,
      }));

      const part: Part = {
        id,
        shape,
        relation,
        parentId: parent?.id ?? null,
        baseZ,
        origin,
        rotate: rot,
        material: rel.material ?? 'wall',
        world,
        worldFacets,
        topZ: baseZ + shape.height,
      };
      parts.set(id, part);
      return id;
    },

    /**
     * Cut an aperture into one facet of a part.
     * `cu` is the horizontal offset from the facet's centre; `sill` the height above
     * the facet's bottom edge. Both are checked for containment and collision.
     */
    aperture(id, { host, facet = 0, cu = 0, sill, w, h, kind = 'window' }) {
      apertures.push({ id, host, facet, cu, sill, w, h, kind });
      return id;
    },

    /** Aim at a compass bearing instead of counting facets. */
    facetAtBearing(hostId, bearingDeg) {
      const p = resolve(hostId);
      let best = 0,
        bestD = Infinity;
      p.shape.facets.forEach((f, i) => {
        const d = Math.abs(((f.bearing - bearingDeg + 540) % 360) - 180);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    },

    part: resolve,

    /** Freeze into the plain model both the checker and the renderer consume. */
    model() {
      return { name, style, lightAngle, parts: [...parts.values()], apertures };
    },
  };
  return api;
}

/** The world-space quad of an aperture, plus the facet parameters it was cut with. */
export interface ApertureQuad {
  facet: Facet;
  /** bottom-left, bottom-right, top-right, top-left */
  pts: [Vec3, Vec3, Vec3, Vec3];
  t0: number;
  t1: number;
  widthAt: (t: number) => number;
}

/** World-space corner points of an aperture, bilinear on its (possibly trapezoidal)
 *  host facet. Shared by the checker and the renderer so they can never disagree. */
export function apertureQuad(model: BuildingModel, ap: Aperture): ApertureQuad | null {
  const part = model.parts.find((p) => p.id === ap.host);
  if (!part) return null;
  const f = part.worldFacets[ap.facet];
  if (!f) return null;
  const widthAt = (t: number): number => f.wBottom + (f.wTop - f.wBottom) * t;
  const t0 = ap.sill / f.height;
  const t1 = (ap.sill + ap.h) / f.height;
  const at = (cu: number, t: number): Vec3 => {
    const s = 0.5 + cu / widthAt(t);
    return lerp3(lerp3(f.bl, f.br, s), lerp3(f.tl, f.tr, s), t);
  };
  return {
    facet: f,
    pts: [
      at(ap.cu - ap.w / 2, t0),
      at(ap.cu + ap.w / 2, t0),
      at(ap.cu + ap.w / 2, t1),
      at(ap.cu - ap.w / 2, t1),
    ],
    t0,
    t1,
    widthAt,
  };
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Axis-aligned bounds of a part in world space. */
export function bbox(part: Part): Bounds {
  const xs = part.world.map((p) => p.x),
    ys = part.world.map((p) => p.y),
    zs = part.world.map((p) => p.z);
  return {
    min: v3(Math.min(...xs), Math.min(...ys), Math.min(...zs)),
    max: v3(Math.max(...xs), Math.max(...ys), Math.max(...zs)),
  };
}
