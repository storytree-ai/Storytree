// mesh-kit.ts — the SHARED mesh primitives the live-render experiment's three generators
// (vegetation, UAT flowers, the story tree) all build out of. Pure, deterministic,
// browser-free, node:test-provable: it emits plain typed arrays and imports no three.js, so
// it sits inside the ADR-0123 provability firewall with the rest of the experiment's
// thinking half.
//
// WHY IT EXISTS AS ITS OWN MODULE. These primitives were `plant-geometry.ts`'s privates,
// and two more generators now need exactly them. This arc has already paid for the other
// answer once: it carries three ~700-line compositor copies and had to build a fork
// DETECTOR because nothing noticed they had diverged. So the geodesic lobe, the swept tube,
// the lathe and the footprint fit are extracted ONCE and imported, rather than pasted twice
// more. `plant-geometry.ts` re-exports what it used to own, so its callers are unchanged and
// its own determinism tests are the regression check on the move.
//
// THE ONE INVARIANT EVERYTHING HERE HOLDS. Normals are computed, never estimated. The banded
// material quantises a lighting scalar onto a four-rung ladder, so a normal that is wrong by
// a few degrees does not shade slightly wrong — it moves a visible rung BOUNDARY, and that
// reads as art rather than as a bug. Every generator below therefore carries the exact
// surface normal through whatever scaling or rotation it applies.

/** A generated mesh: interleaved-free plain arrays, ready to upload as GPU buffers. */
export interface GeneratedMesh {
  /** xyz triples. */
  positions: Float32Array;
  /** xyz triples, unit length — the banded material's lambert is only honest if they are. */
  normals: Float32Array;
  /** Triangle indices. */
  indices: Uint16Array;
  /** Triangles, for the perf budget. */
  triangles: number;
  /** The mesh's own bounding box, in world units. */
  bounds: { w: number; h: number; d: number };
}

/** A vector, as a plain tuple — the only shape this module speaks. */
export type Vec3 = [number, number, number];

/** An orthonormal frame: three axes, used to tilt a lobe or a lathe out of world alignment. */
export type Basis = [Vec3, Vec3, Vec3];

/**
 * A small deterministic PRNG (mulberry32) — the same generator family `scene.ts`'s own
 * `driftSpot` uses. `Math.random` is FORBIDDEN in this experiment: ADR-0380 D6 fence 2 says
 * determinism MOVES rather than disappearing, and a mesh whose shape changed between two
 * frames would take the scene graph's byte-reproducibility with it.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An accumulating triangle soup. Generators push into one and finish it once. */
export interface Raw {
  pos: number[];
  nrm: number[];
  idx: number[];
}

/** A fresh, empty accumulator. */
export function emptyRaw(): Raw {
  return { pos: [], nrm: [], idx: [] };
}

export function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * An orthonormal frame whose SECOND axis is `up`. The other two are any pair completing it —
 * which is all a radially-symmetric lobe or lathe needs, and it means a caller supplies one
 * direction rather than three that have to be mutually consistent.
 */
export function basisFromUp(up: Vec3): Basis {
  const u = norm(up);
  const seed: Vec3 = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = norm(cross(seed, u));
  const b = norm(cross(u, a));
  return [a, u, b];
}

function mid(a: Vec3, b: Vec3): Vec3 {
  return norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
}

/** An octahedron, the seed solid for the geodesic lobes. */
const OCTA_V: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const OCTA_F: [number, number, number][] = [
  [0, 2, 4],
  [2, 1, 4],
  [1, 3, 4],
  [3, 0, 4],
  [2, 0, 5],
  [1, 2, 5],
  [3, 1, 5],
  [0, 3, 5],
];

/**
 * A geodesic sphere at `detail` subdivisions, appended into `raw` at `centre`, scaled by
 * `radius` per axis. Normals are the unit sphere positions corrected for the per-axis scale
 * — exact, not estimated, which is what lets the banding read as curvature rather than as
 * noise.
 *
 * `basis` gives the lobe its own frame: absent means world-axis-aligned (a union-of-circles
 * silhouette), present means the lobe tilts. A basis is ORTHONORMAL, so it is its own
 * inverse-transpose and a normal rotates by the same matrix as a position, with no
 * correction term.
 */
export function addLobe(
  raw: Raw,
  centre: Vec3,
  radius: Vec3,
  detail: number,
  basis?: Basis,
): void {
  let verts: Vec3[] = OCTA_V.map(norm);
  let faces: [number, number, number][] = OCTA_F.map((f) => [...f] as [number, number, number]);

  for (let d = 0; d < detail; d++) {
    const cache = new Map<string, number>();
    const nextFaces: [number, number, number][] = [];
    const midpoint = (i: number, j: number): number => {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const m = mid(verts[i]!, verts[j]!);
      verts.push(m);
      const id = verts.length - 1;
      cache.set(key, id);
      return id;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      nextFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const base = raw.pos.length / 3;
  for (const v of verts) {
    const sx = v[0] * radius[0];
    const sy = v[1] * radius[1];
    const sz = v[2] * radius[2];
    // The true surface normal of a scaled ellipsoid is the sphere normal divided by the
    // radii, re-normalised — computed in the same local frame, then rotated identically.
    // Using the sphere normal directly would light a squashed lobe as if it were round, and
    // on a BANDED material that moves a visible rung boundary and reads as art.
    const ln = norm([v[0] / radius[0], v[1] / radius[1], v[2] / radius[2]]);
    let px = sx;
    let py = sy;
    let pz = sz;
    let nx = ln[0];
    let ny = ln[1];
    let nz = ln[2];
    if (basis) {
      const [u, w, t] = basis;
      px = sx * u[0] + sy * w[0] + sz * t[0];
      py = sx * u[1] + sy * w[1] + sz * t[1];
      pz = sx * u[2] + sy * w[2] + sz * t[2];
      nx = ln[0] * u[0] + ln[1] * w[0] + ln[2] * t[0];
      ny = ln[0] * u[1] + ln[1] * w[1] + ln[2] * t[1];
      nz = ln[0] * u[2] + ln[1] * w[2] + ln[2] * t[2];
    }
    raw.pos.push(centre[0] + px, centre[1] + py, centre[2] + pz);
    const n = norm([nx, ny, nz]);
    raw.nrm.push(n[0], n[1], n[2]);
  }
  for (const [a, b, c] of faces) raw.idx.push(base + a, base + b, base + c);
  verts = [];
}

/**
 * A swept tube through `spine`, with `radii[i]` at each spine point — a stalk, a trunk, a
 * branch. `segments` rings per cross-section.
 *
 * The frame at each spine point is derived from the LOCAL tangent, so a curved spine sweeps
 * without the cross-section shearing. A ring's normals point radially outward in that
 * frame, which is exact for a tube of slowly-varying radius and is what the banded material
 * needs to lay one rung along the lit side and another along the shaded one.
 */
export function addTube(
  raw: Raw,
  spine: readonly Vec3[],
  radii: readonly number[],
  segments = 7,
): void {
  if (spine.length < 2) return;
  const rings: number[] = [];
  for (let i = 0; i < spine.length; i++) {
    const here = spine[i]!;
    const prev = spine[Math.max(0, i - 1)]!;
    const next = spine[Math.min(spine.length - 1, i + 1)]!;
    const tangent = norm([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    const [a, , b] = basisFromUp(tangent);
    const r = radii[Math.min(i, radii.length - 1)] ?? 0;
    rings.push(raw.pos.length / 3);
    for (let s = 0; s < segments; s++) {
      const ang = (s / segments) * Math.PI * 2;
      const c = Math.cos(ang);
      const d = Math.sin(ang);
      const nx = a[0] * c + b[0] * d;
      const ny = a[1] * c + b[1] * d;
      const nz = a[2] * c + b[2] * d;
      raw.pos.push(here[0] + nx * r, here[1] + ny * r, here[2] + nz * r);
      raw.nrm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let s = 0; s < segments; s++) {
      const s2 = (s + 1) % segments;
      raw.idx.push(a + s, b + s, b + s2, a + s, b + s2, a + s2);
    }
  }
}

/**
 * A surface of revolution: `profile` is a half-outline in (radius, height) pairs, spun about
 * the frame's up axis at `centre`. This is how a shape whose SILHOUETTE is the thing being
 * said gets into 3D without being re-drawn by hand — the UAT bud is the case that forced it
 * (ADR-0226 D4 reads the verdict off the form, so the form is not free to drift).
 *
 * Normals come from the profile's own slope, so a lathe shades as the curve it is rather
 * than as the cylinder it is made of.
 */
export function addLathe(
  raw: Raw,
  profile: readonly { r: number; y: number }[],
  centre: Vec3,
  segments = 9,
  basis?: Basis,
): void {
  if (profile.length < 2) return;
  const rings: number[] = [];
  const rotate = (v: Vec3): Vec3 => {
    if (!basis) return v;
    const [u, w, t] = basis;
    return [
      v[0] * u[0] + v[1] * w[0] + v[2] * t[0],
      v[0] * u[1] + v[1] * w[1] + v[2] * t[1],
      v[0] * u[2] + v[1] * w[2] + v[2] * t[2],
    ];
  };
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i]!;
    const prev = profile[Math.max(0, i - 1)]!;
    const next = profile[Math.min(profile.length - 1, i + 1)]!;
    // The outward normal of a profile segment: perpendicular to (dr, dy) in the meridian
    // plane, pointing away from the axis.
    const dr = next.r - prev.r;
    const dy = next.y - prev.y;
    const mr = dy;
    const my = -dr;
    rings.push(raw.pos.length / 3);
    for (let s = 0; s < segments; s++) {
      const ang = (s / segments) * Math.PI * 2;
      const c = Math.cos(ang);
      const d = Math.sin(ang);
      const pos = rotate([p.r * c, p.y, p.r * d]);
      const n = norm(rotate(norm([mr * c, my, mr * d])));
      raw.pos.push(centre[0] + pos[0], centre[1] + pos[1], centre[2] + pos[2]);
      raw.nrm.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i + 1 < profile.length; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let s = 0; s < segments; s++) {
      const s2 = (s + 1) % segments;
      raw.idx.push(a + s, b + s, b + s2, a + s, b + s2, a + s2);
    }
  }
}

/** A cubic Bezier sampled at `t`, in the plane (x, y). */
export function cubicAt(
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

function bounds(raw: Raw): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < raw.pos.length; i += 3) {
    minX = Math.min(minX, raw.pos[i]!);
    maxX = Math.max(maxX, raw.pos[i]!);
    minY = Math.min(minY, raw.pos[i + 1]!);
    maxY = Math.max(maxY, raw.pos[i + 1]!);
    minZ = Math.min(minZ, raw.pos[i + 2]!);
    maxZ = Math.max(maxZ, raw.pos[i + 2]!);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Finish a raw soup AS AUTHORED — no scaling, no recentring. The form for a generator that
 * already works in world units (the UAT flowers and the story tree both read their sizes off
 * the scene, so re-fitting them to a box would throw away the very numbers they came for).
 */
export function finishRaw(raw: Raw): GeneratedMesh {
  const b = bounds(raw);
  return {
    positions: Float32Array.from(raw.pos),
    normals: Float32Array.from(raw.nrm),
    indices: Uint16Array.from(raw.idx),
    triangles: raw.idx.length / 3,
    bounds: {
      w: Number.isFinite(b.minX) ? b.maxX - b.minX : 0,
      h: Number.isFinite(b.minY) ? b.maxY - b.minY : 0,
      d: Number.isFinite(b.minZ) ? b.maxZ - b.minZ : 0,
    },
  };
}

/**
 * Scale + translate a raw mesh so its bounding box is exactly `width` x `height` in the
 * ground plane's x and the up axis y, standing on y = 0. THE MATCHED-FOOTPRINT CONTRACT that
 * makes a delivery comparison a claim about DETAIL rather than about SIZE — this arc nearly
 * shipped "hair delivers more pixels than the hand-modelled dome" when the truth was that
 * hair was a bigger object.
 */
export function fitToFootprint(raw: Raw, width: number, height: number): GeneratedMesh {
  const b = bounds(raw);
  const sx = b.maxX - b.minX || 1;
  const sy = b.maxY - b.minY || 1;
  const sz = b.maxZ - b.minZ || 1;
  const kx = width / sx;
  const ky = height / sy;
  // Depth follows the WIDTH scale, never its own: a plant is not squashed along the view
  // axis just because its 2D marks happened to be short. The footprint constrains what the
  // camera sees; the third axis stays proportionate to the first.
  const kz = kx;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;

  const positions = new Float32Array(raw.pos.length);
  for (let i = 0; i < raw.pos.length; i += 3) {
    positions[i] = (raw.pos[i]! - cx) * kx;
    positions[i + 1] = (raw.pos[i + 1]! - b.minY) * ky;
    positions[i + 2] = (raw.pos[i + 2]! - cz) * kz;
  }

  // A NON-UNIFORM scale changes the normals: the correct transform is the inverse
  // transpose, which for a diagonal scale is the reciprocal scale, re-normalised. Skipping
  // this is the classic silent shading bug — the mesh looks right in wireframe and lights
  // wrong, which on a banded material shows up as a rung boundary in the wrong place.
  const normals = new Float32Array(raw.nrm.length);
  for (let i = 0; i < raw.nrm.length; i += 3) {
    const nx = raw.nrm[i]! / kx;
    const ny = raw.nrm[i + 1]! / ky;
    const nz = raw.nrm[i + 2]! / kz;
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / l;
    normals[i + 1] = ny / l;
    normals[i + 2] = nz / l;
  }

  return {
    positions,
    normals,
    indices: Uint16Array.from(raw.idx),
    triangles: raw.idx.length / 3,
    bounds: { w: width, h: height, d: sz * kz },
  };
}

// ---------------------------------------------------------------------------
// FLAT-FACED PRIMITIVES — the BUILT half of the kit (ADR-0406)
// ---------------------------------------------------------------------------
//
// Everything above this line grows ORGANIC form: a lobe, a swept tube, a surface of
// revolution. All three sweep their normals continuously, which is right for a shrub and
// wrong for a wall — a dry-stone block, a fence rail, a paving slab and a roof are defined by
// their HARD EDGES, and an edge in this kit exists only where two faces do not share a vertex.
// There is no welding or smoothing-group pass anywhere, so a flat face is authored by pushing
// its own corners with one constant normal. `spriteQuad` in `plant-geometry.ts` is the one-off
// precedent; these are the general forms, put here rather than pasted per generator for the
// reason stated at the top of this file.
//
// ⚠ THE RUNG ARITHMETIC IS WHY THESE TAKE A BATTER AND A PITCH RATHER THAN BEING PLAIN BOXES,
// and it is the single most useful number to know before authoring any built prop. The
// authored light is `LIGHT_DIRECTION = norm(-0.45, 0.82, 0.35)` and the ladder is
// `SHADE_LEVELS = [0.78, 0.80, 0.90, 1.00]`, quantised from `dot(n, L) * 0.5 + 0.5`. Working
// the ladder's boundaries back through that gives the angle each rung needs:
//
//     rung 3 (x1.00)   dot >= 0.90    within 25.8 degrees of the light
//     rung 2 (x0.90)   dot 0.70-0.90  25.8 to 45.6 degrees
//     rung 1 (x0.80)   dot 0.58-0.70  45.6 to 54.6 degrees
//     rung 0 (x0.78)   dot <= 0.58    beyond 54.6 degrees
//
// The consequence that decides these signatures: EVERY VERTICAL FACE LANDS ON RUNG 0, at every
// compass orientation — the best a horizontal normal can reach is `hypot(0.451, 0.350) =
// 0.571`, which is short of rung 1. A horizontal top lands on rung 2. So an axis-aligned box
// delivers exactly TWO colours no matter how it is turned, and a wall built of them reads as a
// flat silhouette with a lid. That is not a shading bug to be fixed in the shader; it is what a
// closed four-rung ladder does to a shape with no tilted faces, and the fix is in the SHAPE:
//
//   - `batter` leans a box's sides. At slope 0.4 (about 22 degrees off vertical) the
//     light-facing side reaches dot 0.723 and lifts to rung 2, while the away-facing side falls
//     to 0.44 and stays on rung 0. One number turns a silhouette into a solid.
//   - `rise` on a gable roof is the strongest lever on the island: at a 30-degree pitch with
//     the ridge running along z, the up-light slope reaches dot 0.937 — rung 3, the only
//     full-strength entry a large surface can reach — while its twin sits on rung 0. Ridge the
//     other way and the same pitch delivers rung 2 against rung 0. A roof is therefore both the
//     brightest and the highest-contrast thing a prop can carry, which is why the reference
//     images all read from their roofs first.
//
// `rungOfNormal` in `palette-band.ts` reproduces the shader's decision exactly, so all of this
// is assertable in a node test rather than looked at.

/**
 * One flat quad, `a b c d` in order, wearing `normal` on all four corners.
 *
 * The corners are pushed unshared, which is the whole point: sharing them with a neighbouring
 * face would average nothing (there is no averaging pass) but would force one normal on both,
 * and the edge between them would vanish.
 *
 * Winding is taken AS GIVEN. The prop path merges through `mergeParts`, which makes every prop
 * material double-sided, so a reversed quad still draws — but these emitters wind consistently
 * anyway, because the day a prop wants a single-sided material is not the day to discover which
 * of two hundred quads is inside out.
 */
export function addQuad(raw: Raw, a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3): void {
  const base = raw.pos.length / 3;
  const n = norm(normal);
  for (const v of [a, b, c, d]) {
    raw.pos.push(v[0], v[1], v[2]);
    raw.nrm.push(n[0], n[1], n[2]);
  }
  raw.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** One flat triangle wearing `normal` — a gable end, and the odd cap a fan cannot reach. */
export function addTri(raw: Raw, a: Vec3, b: Vec3, c: Vec3, normal: Vec3): void {
  const base = raw.pos.length / 3;
  const n = norm(normal);
  for (const v of [a, b, c]) {
    raw.pos.push(v[0], v[1], v[2]);
    raw.nrm.push(n[0], n[1], n[2]);
  }
  raw.idx.push(base, base + 1, base + 2);
}

/** A yaw-only basis: rotate about the world up axis by `radians`. The form the prop generators
 *  want — a wall block is turned in plan, never tipped. Orthonormal, so a normal takes the same
 *  transform as a position with no correction term. */
export function yawBasis(radians: number): Basis {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [
    [c, 0, -s],
    [0, 1, 0],
    [s, 0, c],
  ];
}

function through(basis: Basis | undefined, v: Vec3): Vec3 {
  if (!basis) return v;
  const [u, w, t] = basis;
  return [
    v[0] * u[0] + v[1] * w[0] + v[2] * t[0],
    v[0] * u[1] + v[1] * w[1] + v[2] * t[1],
    v[0] * u[2] + v[1] * w[2] + v[2] * t[2],
  ];
}

/** How a box's sides lean. `batter` is a SLOPE — the horizontal inset per unit of height, so 0
 *  is a plain box and 0.4 leans each side about 22 degrees inward. See the rung table above for
 *  why a built prop wants one. */
export interface BoxOptions {
  /** Horizontal inset per unit of height, applied to the top face on all four sides. */
  batter?: number;
  /** Turn the box in plan, radians about the world up axis. */
  yaw?: number;
  /** Omit the bottom face. Anything sitting on the ground never shows it, and a merged island
   *  of two hundred blocks is a real triangle count. */
  skipBottom?: boolean;
}

/**
 * A box standing with its base at `centre[1]` and its top at `centre[1] + height`, `half` wide
 * and deep in plan. Six flat faces (five with `skipBottom`), each with its own corners and its
 * own constant normal.
 *
 * IT IS ANCHORED AT ITS BASE, NOT ITS CENTRE, and that is deliberate rather than a convention
 * flip for its own sake: every consumer places props by asking the land how high it is at a
 * ground point, so the number the caller already holds is where the prop's FOOT goes. A
 * centre-anchored box would have every call site adding half a height, and the day one of them
 * forgot, the prop would sink by half its own size — quietly, because a half-buried block still
 * looks like a block.
 */
export function addBox(
  raw: Raw,
  centre: Vec3,
  half: { x: number; z: number },
  height: number,
  opts: BoxOptions = {},
): void {
  const batter = opts.batter ?? 0;
  const basis = opts.yaw ? yawBasis(opts.yaw) : undefined;
  const inset = batter * height;
  const tx = Math.max(half.x * 0.05, half.x - inset);
  const tz = Math.max(half.z * 0.05, half.z - inset);
  const put = (lx: number, ly: number, lz: number): Vec3 => {
    const r = through(basis, [lx, ly, lz]);
    return [centre[0] + r[0], centre[1] + r[1], centre[2] + r[2]];
  };
  // The side normal of a battered face: horizontal outward, plus an upward term equal to the
  // slope. Derived rather than typed, so changing `batter` moves the shading with the shape — a
  // face that leaned without its normal following would light as a wall and read as a ramp.
  const sideN = (ox: number, oz: number): Vec3 => through(basis, norm([ox, batter, oz]));

  const b0 = put(-half.x, 0, -half.z);
  const b1 = put(half.x, 0, -half.z);
  const b2 = put(half.x, 0, half.z);
  const b3 = put(-half.x, 0, half.z);
  const t0 = put(-tx, height, -tz);
  const t1 = put(tx, height, -tz);
  const t2 = put(tx, height, tz);
  const t3 = put(-tx, height, tz);

  addQuad(raw, t0, t1, t2, t3, through(basis, [0, 1, 0]));
  if (!opts.skipBottom) addQuad(raw, b3, b2, b1, b0, through(basis, [0, -1, 0]));
  addQuad(raw, b0, b1, t1, t0, sideN(0, -1));
  addQuad(raw, b1, b2, t2, t1, sideN(1, 0));
  addQuad(raw, b2, b3, t3, t2, sideN(0, 1));
  addQuad(raw, b3, b0, t0, t3, sideN(-1, 0));
}

/**
 * A CONVEX polygon extruded from `y0` to `y1`: a wall run, a raised platform, a pond's stone
 * kerb, a paved apron. `profile` is a ground-space ring `{x, z}`; winding may be either way.
 *
 * CONVEX ONLY, AND SAID OUT LOUD RATHER THAN ASSUMED. The caps are triangle fans from the
 * centroid, which is correct for a convex ring and silently wrong for a concave one — it would
 * emit triangles outside the shape, and a fan that spilled would read as a rendering glitch
 * rather than as a caller error. There is no general triangulator in this package (the land's
 * own top faces use `triangulateFan` under the same restriction), so a concave footprint is
 * decomposed by the caller into convex pieces.
 *
 * Side normals are derived by dotting the edge perpendicular against the ring's CENTROID rather
 * than taken from the edge direction. That is the same correction `land-definition.ts` and the
 * island's rim wall already carry, and for the same measured reason: ground `(x, y)` maps to 3D
 * `(x, z)` and flips handedness, so "the left-hand perpendicular" is not reliably the outward
 * one, and a ring wound the other way would light every face from inside.
 */
export function addPrism(
  raw: Raw,
  profile: readonly { x: number; z: number }[],
  y0: number,
  y1: number,
  opts: { skipBottom?: boolean; skipTop?: boolean } = {},
): void {
  const n = profile.length;
  if (n < 3) return;
  let cx = 0;
  let cz = 0;
  for (const p of profile) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;

  for (let i = 0; i < n; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % n]!;
    let ox = -(b.z - a.z);
    let oz = b.x - a.x;
    // Flip toward "away from the centroid" — the reliable test, see the note above.
    const mx = (a.x + b.x) / 2 - cx;
    const mz = (a.z + b.z) / 2 - cz;
    if (ox * mx + oz * mz < 0) {
      ox = -ox;
      oz = -oz;
    }
    addQuad(
      raw,
      [a.x, y0, a.z],
      [b.x, y0, b.z],
      [b.x, y1, b.z],
      [a.x, y1, a.z],
      norm([ox, 0, oz]),
    );
  }

  const cap = (y: number, up: boolean): void => {
    const base = raw.pos.length / 3;
    raw.pos.push(cx, y, cz);
    raw.nrm.push(0, up ? 1 : -1, 0);
    for (const p of profile) {
      raw.pos.push(p.x, y, p.z);
      raw.nrm.push(0, up ? 1 : -1, 0);
    }
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      if (up) raw.idx.push(base, a, b);
      else raw.idx.push(base, b, a);
    }
  };
  if (!opts.skipTop) cap(y1, true);
  if (!opts.skipBottom) cap(y0, false);
}

/**
 * A GABLE ROOF: two pitched rectangles meeting at a ridge, plus the two gable triangles that
 * close the ends. `half` is the plan half-extent of the building it covers, `rise` the ridge's
 * height above the eaves, `overhang` how far the slopes project past the walls.
 *
 * THE RIDGE RUNS ALONG Z BY DEFAULT, AND THAT IS AN ART CALL WITH A NUMBER BEHIND IT rather
 * than an arbitrary axis choice — see the rung table above. Ridge along z puts the two slopes
 * facing -x and +x, which at a 30-degree pitch is rung 3 against rung 0: the brightest and the
 * darkest entries the island can deliver, on one object. Ridge along x and the same pitch gives
 * rung 2 against rung 0.
 */
export function addGableRoof(
  raw: Raw,
  centre: Vec3,
  half: { x: number; z: number },
  rise: number,
  opts: { overhang?: number; ridgeAlongX?: boolean; yaw?: number } = {},
): void {
  const over = opts.overhang ?? 0;
  const basis = opts.yaw ? yawBasis(opts.yaw) : undefined;
  const hx = half.x + over;
  const hz = half.z + over;
  const put = (lx: number, ly: number, lz: number): Vec3 => {
    const r = through(basis, [lx, ly, lz]);
    return [centre[0] + r[0], centre[1] + r[1], centre[2] + r[2]];
  };
  const nrm = (v: Vec3): Vec3 => through(basis, norm(v));

  if (opts.ridgeAlongX) {
    const e0 = put(-hx, 0, -hz);
    const e1 = put(hx, 0, -hz);
    const e2 = put(hx, 0, hz);
    const e3 = put(-hx, 0, hz);
    const r0 = put(-hx, rise, 0);
    const r1 = put(hx, rise, 0);
    addQuad(raw, e0, e1, r1, r0, nrm([0, hz, -rise]));
    addQuad(raw, e2, e3, r0, r1, nrm([0, hz, rise]));
    addTri(raw, e0, r0, e3, nrm([-1, 0, 0]));
    addTri(raw, e1, e2, r1, nrm([1, 0, 0]));
    return;
  }
  const e0 = put(-hx, 0, -hz);
  const e1 = put(-hx, 0, hz);
  const e2 = put(hx, 0, hz);
  const e3 = put(hx, 0, -hz);
  const r0 = put(0, rise, -hz);
  const r1 = put(0, rise, hz);
  // ⚠ THE SLOPE NORMAL IS THE PERPENDICULAR OF THE SLOPE, WHICH IS NOT (half, rise). The slope
  // runs from the eave `(-hx, 0)` to the ridge `(0, rise)`, so its direction is `(hx, rise)` and
  // its outward normal is `(-rise, hx)` — the two components SWAP. Writing `(-hx, rise)` looks
  // right and is the shape's own complement: it shades a roof as if its pitch were `90 - pitch`.
  //
  // This shipped once and was caught by measurement rather than by reading. At the 34.8-degree
  // pitch a cottage wears, the swapped normal delivers `dot = 0.839` (rung 2) where the true one
  // delivers `0.931` — RUNG 3. The error vanishes at 45 degrees, where the swap is the identity,
  // and grows without bound toward flat, so a shallow roof shades as a near-vertical WALL. Since
  // a pitched roof is the only surface on this island that can reach the ladder's top rung, the
  // bug quietly gave away the strongest lever in the whole vocabulary while looking like a
  // deliberately muted roof. The `ridgeAlongX` branch above was written correctly and this one
  // was not, which is exactly why the two are stated as perpendiculars now rather than as
  // remembered tuples.
  addQuad(raw, e0, e1, r1, r0, nrm([-rise, hx, 0]));
  addQuad(raw, e2, e3, r0, r1, nrm([rise, hx, 0]));
  addTri(raw, e0, r0, e3, nrm([0, 0, -1]));
  addTri(raw, e1, e2, r1, nrm([0, 0, 1]));
}

/** A regular ring in the ground plane — the profile `addPrism` wants for a well drum, a pond
 *  kerb or a round platform. Keep `sides` low enough that the result reads as BUILT rather than
 *  as a circle: a nine-sided well drum reads as masonry, a forty-sided one reads as a cylinder,
 *  and at 2 px per ground unit the extra sides deliver nothing but triangles. */
export function ringProfile(
  cx: number,
  cz: number,
  radius: number,
  sides: number,
  phase = 0,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = phase + (i / sides) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * radius, z: cz + Math.sin(a) * radius });
  }
  return out;
}
