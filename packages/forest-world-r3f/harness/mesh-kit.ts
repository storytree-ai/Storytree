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
