// landView.ts — the studio's LAND VIEW: the working map's own scene graph, drawn a second time
// through the 3D land pipeline, BESIDE the map rather than instead of it.
//
// WHAT IT IS AND WHY IT IS HERE. `mount-the-land-on-a-real-surface-arc`'s
// `a-land-view-beside-the-working-map`, which is ADR-0530 route C staged as its first half: the
// whole island treatment eventually mounts UNDER the studio's interactive SVG layer, and this is
// that land standing up where it can be looked at without touching the layer everybody works in.
// The owner's remaining question is exactly what it answers — does the approved look survive the
// app's constraints, on the real forest, at the real status mix, in the product rather than in a
// dev page (ADR-0550 settled that mounting proceeds now).
//
// ⚠⚠ IT IS A VIEW, SO IT ASSERTS NOTHING, and that is the whole reason it needs no fence lifted.
// ADR-0418 D5's texture fence binds a surface that makes a CLAIM about proof state; this one draws
// the same scene the map draws, adds no signal of its own, and is not the map. The moment it is
// read AS the map — a second surface a member steers by — the fence binds it and this comment is
// what a reader should find. ADR-0530's D3 semantic question for PROPS is on route C's critical
// path and is not answered here either; nothing about opening a second window answers it.
//
// ⚠ ITS DATA IS THE STUDIO'S LIVE SCENE, never the published snapshot. The snapshot is a website
// artefact, so a view built from it would answer a question about the website.
//
// ⚠ THE SCENE IT IS HANDED IS A 2D DRAWING, and the conversion is not optional. `buildWorld` packs
// the islands so they do not overlap ON SCREEN and snaps that packing to the lattice through
// `pixelToHex`, so the studio's tile set is legitimately a function of its camera and asking
// `buildScene` for a plan-view surface would be asking for a DIFFERENT LAYOUT rather than the same
// one upright. So the drawing is un-projected at this reader
// (`@storytree/forest-world-r3f`'s `landStreamFromDrawing`, which owns the three steps and their
// order). Teaching the layout to hand over ground coordinates is `forest-geometry-rebuild-arc`'s
// own item and is what deletes this conversion everywhere at once.
//
// ⚠ THE FOREST READS SPARSE AT THE WIDE VIEW AND THAT IS A SEPARATE THREAD (ADR-0550 D2). The real
// forest is a thin ribbon — 661 x 3524 ground units — because the 2D map's own layout is, and no
// mounting unit may fix that as a side effect. The obvious lever is the layout everybody already
// reads, so it is its own change with its own picture.

import type { SceneG } from '@storytree/forest-world';
import { landStreamFromDrawing, type Descriptor3D } from '@storytree/forest-world-r3f';

/** The query key that opens the view. */
export const LAND_VIEW_PARAM = 'landView';

/**
 * `?landView=1` — the exact, default-off gate that opens the land view beside the map.
 *
 * ⚠ DEFAULT-OFF IS A PAYLOAD DECISION AS WELL AS A PRODUCT ONE. The 3D canvas pulls three.js, R3F
 * and the bought kit — ~1.7 MB compressed, about 24x three.js itself — and the map's own history is
 * the warning: the dependency hover-highlight was removed in July because it made the map lag. The
 * component behind this flag is `React.lazy`, so nothing of that reaches a member who has not asked
 * for it, and this reader is what decides.
 *
 * `on` / `1` / `true` all open it, matching `?buildings`' own vocabulary rather than inventing a
 * third; anything else — including an empty value — leaves the map byte-for-byte unchanged.
 */
export function readLandView(search: string): boolean {
  const v = new URLSearchParams(search).get(LAND_VIEW_PARAM);
  return v === 'on' || v === '1' || v === 'true';
}

/** What the view could not draw, and why — reported rather than thrown, because a land view that
 *  cannot build is a panel with a message in it and never a map that stopped rendering. */
export interface LandViewFailure {
  readonly ok: false;
  readonly reason: string;
}

/** The 3D stream the canvas draws, on true ground and sized per capability. */
export interface LandViewStream {
  readonly ok: true;
  readonly descriptors: readonly Descriptor3D[];
}

export type LandViewResult = LandViewStream | LandViewFailure;

/**
 * THE MAP'S SCENE, AS THE 3D LAND — the whole of this module's compute, and deliberately total.
 *
 * ⚠ IT RETURNS A FAILURE RATHER THAN THROWING, and the reason is where it is called from. The
 * mapper REFUSES outright on a classic extruded-hex scene (`world-to-3d.ts`'s `case 'tile'`), and
 * the land-per-capability sizing refuses an island whose scale factor is an arithmetic fault. Both
 * are correct refusals and both would, uncaught, unmount the route the working map lives on — so a
 * second view that cannot build must never be able to take the first one down with it. The reason
 * is carried through to the panel and shown.
 */
export function landViewStream(scene: SceneG): LandViewResult {
  try {
    const descriptors = landStreamFromDrawing(scene);
    if (descriptors.every((d) => d.kind === 'skipped')) {
      return { ok: false, reason: 'the map’s scene carries no land the 3D view can draw' };
    }
    return { ok: true, descriptors };
  } catch (err: unknown) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
