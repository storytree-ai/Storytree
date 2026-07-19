// render-svg.ts — the ONLY file that knows what an SVG DOCUMENT is.
//
// The geometry is gone from here. `./bake.ts` runs the pipeline — shade, cull, cut,
// order, project — and returns resolved drawables in painter order; this file turns
// those into elements, wraps them in a viewBox, and stops. It culls nothing, sorts
// nothing, shades nothing.
//
// That split is what lets a second backend exist without a second pipeline. The island
// composes the SAME baked nodes this file prints, so a building on a contact sheet and
// the same building on the map cannot drift apart — there is one bake and two printers.
// A three.js backend would still replace exactly this file.

import type { BuildingModel } from './procedural-utils.js';
import { bakeBuilding } from './bake.js';
import type { BakedNode, Paint, RenderOptions } from './bake.js';
import type { DrawOrderStats, OrderPoly } from './draw-order.js';

// The palette lives with the bake (it is an input to shading, not to printing), but it
// is re-exported here because every building module reaches for `THEMES` through this
// path and the material vocabulary is not what moved.
export { THEMES, themeFor } from './bake.js';
export type { Palette, ThemeName, RenderOptions } from './bake.js';

/** What a render produced, beyond the markup itself. */
export interface RenderResult {
  svg: string;
  /** what station 3 cost — `output - input` is the split inflation, ADR-0069's watch */
  order: DrawOrderStats;
  /** the ordered world-space polygons, so a test can hold the ORDER to account
   *  directly rather than inferring it from the markup */
  polys: OrderPoly<Paint>[];
}

/** One baked node as markup. The only place element names and attribute spelling live. */
function element(n: BakedNode, strokeWidth: number): string {
  const op = n.opacity !== undefined ? ` opacity="${n.opacity}"` : '';
  if (n.el === 'ellipse') {
    return `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.rx}" ry="${n.ry}" fill="${n.fill}"${op}/>`;
  }
  const stroked = `fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${op}`;
  if (n.el === 'polygon') {
    return `<polygon points="${n.points}" ${stroked}/>`;
  }
  // The two path shapes: a pierced wall (even-odd, filled) and a split fragment's
  // inherited outline (unfilled, round-capped so a short run does not read as a tick).
  if (n.fillRule === 'evenodd') {
    return `<path d="${n.d}" fill-rule="evenodd" ${stroked}/>`;
  }
  return `<path d="${n.d}" fill="none" stroke="${n.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${op}/>`;
}

/** Render, and report what the draw-order pass did. `render` is this without the receipt. */
export function renderDetailed(model: BuildingModel, opts: RenderOptions = {}): RenderResult {
  const { width = 640, pad = 6, background = null, strokeWidth = 0.35 } = opts;
  const baked = bakeBuilding(model, opts);

  const minX = baked.minX - pad;
  const minY = baked.minY - pad;
  const vw = baked.width + pad * 2;
  const vh = baked.height + pad * 2;
  const height = Math.round((width * vh) / vw);

  const body = baked.nodes.map((n) => element(n, strokeWidth)).join('\n  ');

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(minX)} ${f(minY)} ${f(vw)} ${f(vh)}" width="${width}" height="${height}" role="img" aria-label="${esc(model.name)}">`,
    background ? `  <rect x="${f(minX)}" y="${f(minY)}" width="${f(vw)}" height="${f(vh)}" fill="${background}"/>` : '',
    '  ' + body,
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');

  return { svg, order: baked.order, polys: baked.polys };
}

/** Render a model to SVG. */
export const render = (model: BuildingModel, opts: RenderOptions = {}): string => renderDetailed(model, opts).svg;

const f = (n: number): number => Number(n.toFixed(3));

const ENTITIES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };
const esc = (s: string): string => String(s).replace(/[<>&"]/g, (c) => ENTITIES[c] ?? c);
