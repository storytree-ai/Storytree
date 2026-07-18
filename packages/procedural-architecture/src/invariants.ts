// invariants.ts — the physics gate.
//
// A pure `check(model) -> Violation[]`. Every physics error we have seen an agent
// author into raw SVG is named here as an invariant. Empty array = the building is
// physically coherent. This is what turns generated art into a red-green unit: the
// author iterates until this returns [], and the owner only ever attests something
// that is already structurally honest.
//
// The builder makes most FLOATING impossible by construction (a part's base z is
// derived from its parent's top). What survives is what the relation cannot see:
// a part balanced on a parent it barely overlaps, an aperture running off the end
// of its wall, two windows on top of each other, a door on the third floor.

import { apertureQuad, bbox } from './procedural-utils.js';
import type { BuildingModel, Part } from './procedural-utils.js';

const EPS = 1e-6;

/** The rules a model can break. One name per invariant, so a failure reads. */
export type ViolationRule =
  | 'support-path'
  | 'below-grade'
  | 'grounded'
  | 'support-overlap'
  | 'attachment-contact'
  | 'aperture-host'
  | 'aperture-containment'
  | 'aperture-collision'
  | 'door-reachable';

export interface Violation {
  rule: ViolationRule;
  part?: string;
  aperture?: string;
  detail: string;
}

export interface CheckOptions {
  /** required clear distance from an aperture to its facet edge */
  margin?: number;
  /** required fraction of a part's footprint that must overlap its support */
  minSupport?: number;
}

/**
 * @param model  the frozen output of building().model()
 */
export function check(model: BuildingModel, { margin = 0.6, minSupport = 0.55 }: CheckOptions = {}): Violation[] {
  const out: Violation[] = [];
  const byId = new Map<string, Part>(model.parts.map((p) => [p.id, p]));

  // --- 1. every part has a declared structural relation, and the chain reaches ground.
  for (const part of model.parts) {
    if (part.relation !== 'ground') {
      if (!part.parentId || !byId.has(part.parentId)) {
        out.push({ rule: 'support-path', part: part.id, detail: `relation '${part.relation}' names no live parent` });
        continue;
      }
    }
    let cur: Part | undefined = part;
    let hops = 0;
    while (cur && cur.relation !== 'ground') {
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
      if (++hops > model.parts.length) {
        out.push({ rule: 'support-path', part: part.id, detail: 'support chain is cyclic — never reaches z=0' });
        cur = undefined;
        break;
      }
    }
    if (part.relation !== 'ground' && !cur) {
      if (!out.some((v) => v.part === part.id && v.rule === 'support-path')) {
        out.push({ rule: 'support-path', part: part.id, detail: 'no support path down to z=0' });
      }
    }
  }

  // --- 2. nothing is underground, and a ground part actually touches the ground.
  for (const part of model.parts) {
    const b = bbox(part);
    if (b.min.z < -EPS - 1e-3) {
      out.push({ rule: 'below-grade', part: part.id, detail: `dips to z=${b.min.z.toFixed(2)} (below the ground plane)` });
    }
    if (part.relation === 'ground' && b.min.z > 0.05) {
      out.push({ rule: 'grounded', part: part.id, detail: `declared ground but its base floats at z=${b.min.z.toFixed(2)}` });
    }
  }

  // --- 3. a part resting ON a parent must actually be carried by it.
  //
  //     TWO tests, because one is not enough. An area-fraction test alone passes a
  //     mushroom cap slid right off its stem: the cap is far wider than the collar,
  //     so the collar stays fully covered while the cap visibly hangs in space.
  //     The physical invariant for an OVERHANGING part is not coverage, it is that
  //     its centre of mass stays over its support — otherwise it tips.
  for (const part of model.parts) {
    if (part.relation !== 'on') continue;
    const parent = part.parentId === null ? undefined : byId.get(part.parentId);
    if (!parent) continue;
    const a = bbox(part),
      p = bbox(parent);
    const ox = Math.min(a.max.x, p.max.x) - Math.max(a.min.x, p.min.x);
    const oy = Math.min(a.max.y, p.max.y) - Math.max(a.min.y, p.min.y);
    if (ox <= 0 || oy <= 0) {
      out.push({ rule: 'support-overlap', part: part.id, detail: `sits on '${parent.id}' but their footprints do not overlap at all` });
      continue;
    }

    // 3a. the tipping test — applies to EVERY supported part, overhanging or not.
    const cx = (a.min.x + a.max.x) / 2,
      cy = (a.min.y + a.max.y) / 2;
    if (cx < p.min.x - EPS || cx > p.max.x + EPS || cy < p.min.y - EPS || cy > p.max.y + EPS) {
      out.push({
        rule: 'support-overlap',
        part: part.id,
        detail: `its centre (${cx.toFixed(2)}, ${cy.toFixed(2)}) falls outside '${parent.id}' — it would tip`,
      });
      continue;
    }

    // 3b. the coverage test — only meaningful when the part is small enough to be
    //     carried outright. A deliberate overhang is exempt, guarded by 3a instead.
    const childArea = (a.max.x - a.min.x) * (a.max.y - a.min.y);
    const parentArea = (p.max.x - p.min.x) * (p.max.y - p.min.y);
    if (childArea <= parentArea + EPS) {
      const frac = (ox * oy) / Math.max(EPS, childArea);
      if (frac < minSupport) {
        out.push({
          rule: 'support-overlap',
          part: part.id,
          detail: `only ${(frac * 100).toFixed(0)}% of its footprint is carried by '${parent.id}' (needs ${(minSupport * 100).toFixed(0)}%)`,
        });
      }
    }
  }

  // --- 4. an ATTACHED part must genuinely touch what it claims to be fixed to.
  for (const part of model.parts) {
    if (part.relation !== 'attached') continue;
    const parent = part.parentId === null ? undefined : byId.get(part.parentId);
    if (!parent) continue;
    const a = bbox(part),
      p = bbox(parent);
    const gap = Math.max(
      Math.max(a.min.x - p.max.x, p.min.x - a.max.x),
      Math.max(a.min.y - p.max.y, p.min.y - a.max.y),
      Math.max(a.min.z - p.max.z, p.min.z - a.max.z),
    );
    if (gap > 0.05) {
      out.push({ rule: 'attachment-contact', part: part.id, detail: `claims attachment to '${parent.id}' but hangs ${gap.toFixed(2)} clear of it` });
    }
  }

  // --- 5. apertures: host resolves, fits its facet with margin, reaches no edge.
  for (const ap of model.apertures) {
    const host = byId.get(ap.host);
    if (!host) {
      out.push({ rule: 'aperture-host', aperture: ap.id, detail: `names unknown host part '${ap.host}'` });
      continue;
    }
    if (!host.shape.facets[ap.facet]) {
      out.push({
        rule: 'aperture-host',
        aperture: ap.id,
        detail: `facet ${ap.facet} does not exist on '${ap.host}' (it has ${host.shape.facets.length})`,
      });
      continue;
    }
    const q = apertureQuad(model, ap);
    // The two guards above already establish the host and its facet, so this cannot
    // fire — but the quad is nullable at the seam, and rule 7 below checks it too.
    if (!q) continue;
    const f = q.facet;

    if (ap.sill < margin - EPS && ap.kind !== 'door') {
      out.push({ rule: 'aperture-containment', aperture: ap.id, detail: `sill ${ap.sill} leaves no margin above the facet base` });
    }
    if (ap.sill + ap.h > f.height - margin + EPS) {
      out.push({
        rule: 'aperture-containment',
        aperture: ap.id,
        detail: `head reaches ${(ap.sill + ap.h).toFixed(2)} on a ${f.height.toFixed(2)}-tall facet (needs ${margin} clear)`,
      });
    }
    for (const t of [q.t0, q.t1]) {
      const half = q.widthAt(t) / 2;
      const reach = Math.abs(ap.cu) + ap.w / 2;
      if (reach > half - margin + EPS) {
        out.push({
          rule: 'aperture-containment',
          aperture: ap.id,
          detail: `spans to ${reach.toFixed(2)} from centre where the facet only offers ${(half - margin).toFixed(2)}`,
        });
        break;
      }
    }
  }

  // --- 6. two apertures may not collide on the same facet.
  for (let i = 0; i < model.apertures.length; i++) {
    for (let j = i + 1; j < model.apertures.length; j++) {
      const a = model.apertures[i],
        b = model.apertures[j];
      // Both indices are inside the loop bounds; the guard makes that provable.
      if (a === undefined || b === undefined) continue;
      if (a.host !== b.host || a.facet !== b.facet) continue;
      const dx = Math.abs(a.cu - b.cu) - (a.w + b.w) / 2;
      const dz = Math.abs(a.sill + a.h / 2 - (b.sill + b.h / 2)) - (a.h + b.h) / 2;
      if (dx < margin && dz < margin) {
        out.push({ rule: 'aperture-collision', aperture: a.id, detail: `collides with '${b.id}' on ${a.host} facet ${a.facet}` });
      }
    }
  }

  // --- 7. a door must be reachable: on a facet whose base sits on the ground.
  for (const ap of model.apertures) {
    if (ap.kind !== 'door') continue;
    const host = byId.get(ap.host);
    if (!host) continue;
    const q = apertureQuad(model, ap);
    if (!q) continue;
    const footZ = Math.min(q.pts[0].z, q.pts[1].z);
    if (footZ > 0.35) {
      out.push({ rule: 'door-reachable', aperture: ap.id, detail: `threshold sits at z=${footZ.toFixed(2)} with nothing to stand on` });
    }
  }

  return out;
}

/** Throwing wrapper for tests — prints every violation, not just the first. */
export function assertSound(model: BuildingModel, opts?: CheckOptions): void {
  const v = check(model, opts);
  if (v.length) {
    throw new Error(
      `${model.name}: ${v.length} physics violation(s)\n` +
        v.map((x) => `  [${x.rule}] ${x.part ?? x.aperture}: ${x.detail}`).join('\n'),
    );
  }
}
