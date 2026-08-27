// baseline.tsx — WHAT THE SHIPPED FOREST MAP DRAWS TODAY, on real pixels.
//
// THE INCREMENT: `adopt-the-land-into-the-shipped-map-arc-inc-01`. The arc's end state asks
// what the new land COSTS, and a cost is a difference — but nothing in this repo records what
// the SHIPPED renderer costs now. Every picture this arc has ever shown came from `harness/`,
// which is a different renderer that is deliberately not adopted (ADR-0380 D6). This page puts
// the two side by side on one screen, on one GPU, in one run.
//
// ⚠⚠ THE LEFT-HAND PANELS ARE THE REAL SHIPPED COMPONENT, IMPORTED FROM `../src/`. It is not a
// re-creation of it and must never become one: the whole value of this baseline is that a later
// session can trust the number belongs to the file that ships. The harness may import `src/`;
// the reverse is fenced (`scope-fence.test.ts`), so nothing here reaches the public mirror.
//
// ⚠ HOW THE DRAW COUNTS ARE TAKEN, and why not from `renderer.info`. `<ForestWorldCanvas>`
// owns its own R3F renderer and exposes it to nobody, so reading three's counters would mean
// changing the shipped file to suit its own measurement — the shape of instrument this arc has
// twice been burned by. Instead `WebGL2RenderingContext.prototype.drawElements*` is wrapped
// BEFORE anything mounts, so the count is of GL calls the driver actually received. That is
// renderer-agnostic, works identically for the raw-three harness panels, and cannot be
// satisfied by a component that quietly stopped drawing.
//
// ⚠ THE SHIPPED CANVAS IS PERSPECTIVE (fov 45, `ForestWorldCanvas.tsx:174`) WHILE THE HARNESS
// IS ORTHOGRAPHIC. So "px per ground unit" is not one number on the shipped path — it varies
// across the frame. The page reports the scale at the framing target AND the near/far spread,
// because a baseline that quoted a single figure would be quoting the centre and calling it
// the picture.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { buildScene, hexCenter, type SceneG } from '@storytree/forest-world';

import { ForestWorldCanvas } from '../src/ForestWorldCanvas.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { IslandPanel } from './IslandView.js';
import { ISLAND_TILES, islandScene } from './island-fixture.js';
import {
  BEFORE_THE_CELL_CASE,
  SHIPPED_STATUSES,
  SHIPPED_STATUS_COLOUR,
  authoredTriangles,
  cellGroundTrianglesFor,
  classicHexScene,
  type AuthoredCount,
} from './shipped-baseline.js';
import { STATUS_TOKENS } from './palette-band.js';
import {
  deliveredScale,
  perspectiveSpreadPct,
  type Mat4,
  type ProjectionKind,
} from './projection-probe.js';

interface BaselineReport {
  renderer: string;
  vendor: string;
  timerQuery: boolean;
  census: Record<string, number>;
  /** The parcel triangle total, summed per ring. ⚠ It cannot be derived from the census the way
   *  every other family can — a parcel is an arbitrary polygon, so its cost is a property of the
   *  SCENE. The driver's authored-vs-measured refusal needs it or it compares the ground against
   *  a total that never counted the ground. */
  cellGroundTriangles: number;
  census_before: Record<string, number>;
  /** Parcel counts by status on the MIXED island — the evidence that the restored ground still
   *  REPORTS rather than merely draws. */
  mixedMaterials: Record<string, number>;
  authored: AuthoredCount;
  panels: Record<string, PanelReading>;
}

interface PanelReading {
  widthPx: number;
  heightPx: number;
  devicePixelRatio: number;
  calls: number;
  triangles: number;
  /** Renders the panel performed inside the measurement window — the divisor. */
  frames: number;
  /** Delivered px per ground unit at the framing target, and across the island — computed from
   *  the projection and view matrices this panel's own context was GIVEN, never from a
   *  transcription of the shipped camera (`projection-probe.ts` says why). */
  scaleAtTarget: number;
  scaleNear: number;
  scaleFar: number;
  /** How the uploaded projection matrix classified. ⚠ Carried beside the numbers so no report can
   *  quote a spread without saying which projection produced it — and so a panel that filed no
   *  matrix at all reports `indeterminate` rather than a plausible zero. */
  projection: ProjectionKind;
  /** The near/far spread as a percentage. 0 for an orthographic projection BY MEASUREMENT. */
  spreadPct: number;
}

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
    __stBaseline?: BaselineReport;
  }
}

/* ── the GL-call counter, installed before any canvas mounts ───────────────────────────────
   ⚠ IT IS KEYED BY CONTEXT, AND THE FIRST VERSION OF THIS FILE WAS NOT — that version's own
   refusal is what caught it. A page-global tally cannot attribute a draw to a panel: four
   canvases are live here, two of them R3F canvases rendering CONTINUOUSLY on their own rAF
   loops, so a "delta across one frame" read from a fifth rAF callback picks up whatever
   happened to run before it, which on the first run was nothing at all. Every count below
   belongs to ONE WebGL context, and `canvas.getContext('webgl2')` returns the very context the
   component created, so a panel can ask for its own.

   ⚠ FRAMES ARE COUNTED FROM `clear`, not from rAF. Three calls `clear()` once per
   `renderer.render()` with `autoClear` on, so dividing by clears yields a PER-RENDER cost even
   when the component renders at a cadence of its own choosing. Dividing by elapsed rAFs would
   silently report half the cost for a component that renders every other frame. */
interface ContextTally {
  calls: number;
  triangles: number;
  clears: number;
  /** ⚠ THE PROJECTION AS THE DRIVER RECEIVED IT, not as this page believes it to be. Captured
   *  from the `uniformMatrix4fv` upload three.js makes to the location it got back for the name
   *  `projectionMatrix` — the same wrap-the-prototype route the draw counts use, and it has the
   *  same property: a component that quietly stopped doing the thing cannot satisfy it. */
  projection: Mat4 | null;
}

const TALLIES = new WeakMap<WebGL2RenderingContext, ContextTally>();

function tallyFor(gl: WebGL2RenderingContext): ContextTally {
  let t = TALLIES.get(gl);
  if (!t) {
    t = { calls: 0, triangles: 0, clears: 0, projection: null };
    TALLIES.set(gl, t);
  }
  return t;
}

/** Module-local rather than a flag stamped on the prototype: the prototype route needs an
 *  assertion chain to write a property TypeScript does not know about, and `anti-slop`'s
 *  no-chained-type-assertions is right that discarding the type evidence buys nothing here. */
let counterInstalled = false;

function installCounter(): void {
  if (counterInstalled) return;
  counterInstalled = true;

  const de = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function patched(mode, count, type, offset) {
    const t = tallyFor(this);
    t.calls += 1;
    if (mode === this.TRIANGLES) t.triangles += count / 3;
    return de.call(this, mode, count, type, offset);
  };
  const dei = WebGL2RenderingContext.prototype.drawElementsInstanced;
  WebGL2RenderingContext.prototype.drawElementsInstanced = function patched(mode, count, type, offset, instances) {
    const t = tallyFor(this);
    t.calls += 1;
    if (mode === this.TRIANGLES) t.triangles += (count / 3) * instances;
    return dei.call(this, mode, count, type, offset, instances);
  };
  const da = WebGL2RenderingContext.prototype.drawArrays;
  WebGL2RenderingContext.prototype.drawArrays = function patched(mode, first, count) {
    const t = tallyFor(this);
    t.calls += 1;
    if (mode === this.TRIANGLES) t.triangles += count / 3;
    return da.call(this, mode, first, count);
  };
  const dai = WebGL2RenderingContext.prototype.drawArraysInstanced;
  WebGL2RenderingContext.prototype.drawArraysInstanced = function patched(mode, first, count, instances) {
    const t = tallyFor(this);
    t.calls += 1;
    if (mode === this.TRIANGLES) t.triangles += (count / 3) * instances;
    return dai.call(this, mode, first, count, instances);
  };
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function patched(mask) {
    if ((mask & this.COLOR_BUFFER_BIT) !== 0) tallyFor(this).clears += 1;
    return clear.call(this, mask);
  };

  /* ── ⚠⚠ THE PROJECTION, TAKEN OFF THE WIRE ────────────────────────────────────────────────
     Locations are opaque objects, so the only way to know WHICH uniform an upload is for is to
     remember what three.js asked for by NAME. `getUniformLocation` is wrapped to record the two
     names that matter, per context; `uniformMatrix4fv` then records the value uploaded to them.

     ⚠ A LOCATION IS NOT PORTABLE BETWEEN PROGRAMS OR CONTEXTS, so the map is keyed by context and
     holds locations, never names.

     ⚠⚠ THERE IS NO VIEW MATRIX ON THE WIRE AT ALL, and establishing that cost two runs rather
     than an assumption. three declares `viewMatrix` in its shader chunks, but nothing in
     `meshStandardMaterial` reads it, so the GLSL compiler eliminates it and `getUniformLocation`
     returns null. The obvious fallback — recover it from the `modelViewMatrix` uploaded beside an
     IDENTITY `modelMatrix`, which is what the merged ground mesh has — was BUILT and then
     REMOVED, because a census of the actual uploads refuted it: 570 `modelViewMatrix` uploads
     across the page against just 2 identity `modelMatrix` uploads and ZERO non-identity ones
     (RTX 2060, 2026-08-28). `modelMatrix` is eliminated from the standard-material programs too;
     the two survivors belong to other materials entirely. So there is no pairing to key on.

     ⚠ THAT COSTS THIS PAGE NOTHING, which is why the fallback is gone rather than patched.
     `deliveredScale` needs a view matrix only on the PERSPECTIVE branch, and an orthographic
     matrix delivers ONE scale at every depth — which is the whole property being established.
     What a perspective canvas gets here is `indeterminate` and a refusal naming it, never a
     plausible number; the retired camera's 5.1% spread is committed evidence (PR #1679), taken
     with the transcribed instrument this one replaces. */
  const named = new WeakMap<WebGL2RenderingContext, Map<WebGLUniformLocation, 'projection'>>();
  const CAPTURED = new Map<string, 'projection'>([['projectionMatrix', 'projection']]);

  const gul = WebGL2RenderingContext.prototype.getUniformLocation;
  WebGL2RenderingContext.prototype.getUniformLocation = function patched(program, name) {
    const loc = gul.call(this, program, name);
    const which = CAPTURED.get(name);
    if (loc && which) {
      let m = named.get(this);
      if (!m) {
        m = new Map();
        named.set(this, m);
      }
      m.set(loc, which);
    }
    return loc;
  };

  const um4 = WebGL2RenderingContext.prototype.uniformMatrix4fv;
  WebGL2RenderingContext.prototype.uniformMatrix4fv = function patched(location, transpose, data, ...rest) {
    const which = location ? named.get(this)?.get(location) : undefined;
    if (which && !transpose) {
      // ⚠ COPIED, not retained. three reuses one scratch array across every upload, so keeping the
      // reference would hand the reader whatever the LAST draw happened to leave in it.
      const flat = Array.from(data as ArrayLike<number>).slice(0, 16);
      if (flat.length === 16) tallyFor(this)[which] = flat;
    }
    return um4.call(this, location, transpose, data as never, ...(rest as []));
  };
}
installCounter();

/* ── the scene, once ───────────────────────────────────────────────────────────────────── */

const SCENE = islandScene();
const DESCRIPTORS: readonly Descriptor3D[] = worldTo3D(SCENE);

function census(ds: readonly Descriptor3D[]) {
  const c: Record<string, number> = {};
  for (const d of ds) c[d.kind] = (c[d.kind] ?? 0) + 1;
  return c;
}

const CENSUS = census(DESCRIPTORS);
const CELL_TRIANGLES = cellGroundTrianglesFor(DESCRIPTORS);

/* ── THE BEFORE, RECONSTRUCTED EXACTLY ───────────────────────────────────────────────────────
   ⚠ IT IS THE CURRENT MAPPER WITH ONE FAMILY REMOVED, not a copy of the old one and not a flag
   in `src/`. Before the `cell` case existed, every one of these parcels came back as
   `{ kind: 'skipped', sceneKind: 'cell' }` — and a skip is not drawn. So the DRAWABLE set the
   old mapper produced is exactly today's minus `cell-ground`, which makes this reconstruction
   exact rather than approximate. `baseline-measure.mjs` refuses the run unless this panel draws
   the 144 triangles over 2 draw calls that PR #1679 measured on this same GPU, so the claim is
   checked against a number taken before the fix existed rather than asserted here.

   Reconstructing it this way is also what keeps `src/ForestWorldCanvas.tsx` free of a
   draw-the-old-way switch — a flag added to a shipped file to serve its own evidence page is
   the shape of instrument this arc has twice been burned by. */
const BEFORE_DESCRIPTORS: readonly Descriptor3D[] = DESCRIPTORS.filter((d) => d.kind !== 'cell-ground');
const BEFORE_CENSUS = census(BEFORE_DESCRIPTORS);

/* ── THE MIXED ISLAND — the fence, not the look ──────────────────────────────────────────────
   ⚠ THE ONE WAY THIS ARC CAN DO REAL HARM is a land that reads beautifully and MISREPORTS a
   capability's proof state (ADR-0392 D5 / ADR-0398 D7). Restoring the ground is the first time
   anything on the shipped canvas has had to carry that, and the all-healthy fixture cannot show
   it: 164 parcels in one colour is equally consistent with a ground that ignores status entirely.
   So one capability is given a foreign status, exactly the labelled deviation `island-fixture.ts`
   provides for. The parcels must come back in TWO colours, and they must be the RIGHT twelve. */
const MIXED_ODD_ONE_OUT = { index: 3, status: 'unhealthy' as const };
const MIXED_DESCRIPTORS: readonly Descriptor3D[] = worldTo3D(islandScene({ oddOneOut: MIXED_ODD_ONE_OUT }));
const MIXED_MATERIALS: Record<string, number> = {};
for (const d of MIXED_DESCRIPTORS) {
  if (d.kind === 'cell-ground') MIXED_MATERIALS[d.material ?? '?'] = (MIXED_MATERIALS[d.material ?? '?'] ?? 0) + 1;
}

/* ── the CONTROL scene ──────────────────────────────────────────────────────────────────────
   ⚠ The mesh-substrate island above yields the shipped canvas NO GROUND AT ALL — its `tile`
   case (`world-to-3d.ts:207`) has no counterpart for the `cell` nodes the relaxed mesh
   emits, so 164 of them fall to the default skip. That is the finding, and on its own it is
   equally consistent with a mapper that is simply broken. The classic-substrate control below
   is the same mapper on `relaxedCells: null` (`scene.ts:658`), and it draws ground — which is
   what makes the finding "pointed at a representation the product no longer produces" rather
   than "broken". It is also the only way to SHOW what the shipped land looks like at all. */
// ⚠ THE SAME THIRTEEN TILES the mesh fixture uses, imported rather than re-listed: the
// control is only a control if the two panels are the same island in two representations.
const CLASSIC_SCENE = classicHexScene(buildScene as never, hexCenter, ISLAND_TILES) as SceneG;
const CLASSIC_DESCRIPTORS: readonly Descriptor3D[] = worldTo3D(CLASSIC_SCENE);
const CLASSIC_CENSUS = census(CLASSIC_DESCRIPTORS);

/** The island's world extent, from the drawable instances themselves. */
function extent(ds: readonly Descriptor3D[]) {
  const inst = ds.filter((d): d is InstanceDescriptor => d.kind !== 'skipped');
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const i of inst) {
    minX = Math.min(minX, i.transform.x);
    maxX = Math.max(maxX, i.transform.x);
    minZ = Math.min(minZ, i.transform.z);
    maxZ = Math.max(maxZ, i.transform.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const spread = Math.max(maxX - cx, maxZ - cz, cx - minX, cz - minZ);
  return { minX, maxX, minZ, maxZ, cx, cz, spread };
}


/** The report shell, so the two panels and the settle hook cannot disagree about its shape. */
function emptyReport(): BaselineReport {
  return {
    renderer: '',
    vendor: '',
    timerQuery: false,
    census: CENSUS,
    cellGroundTriangles: CELL_TRIANGLES,
    census_before: BEFORE_CENSUS,
    mixedMaterials: MIXED_MATERIALS,
    authored: authoredTriangles(CENSUS, CELL_TRIANGLES),
    panels: {},
  };
}

type Extent = ReturnType<typeof extent>;

/* ── ⚠⚠ THE DELIVERED SCALE IS NOW MEASURED, NOT TRANSCRIBED ──────────────────────────────────
   Until 2026-08-28 this file carried a `shippedCamera()` "⚠ Transcribed from
   ForestWorldCanvas.tsx:158-168" and a `pxPerUnitAt(d, h, fovDeg = 45)` beside it, and the whole
   perspective-spread finding rested on them. They are DELETED rather than updated, and the reason
   is the reason this increment exists at all: an expectation derived from its subject cannot fail.
   Point the shipped canvas at an orthographic camera and a transcribed fov-45 formula goes on
   reporting the retired camera's 5.1% spread; transcribe the NEW camera instead and the same
   formula reports 0.0% whether or not the shipped file ever changed. Either way the headline is a
   restatement of what this page believes, wearing the authority of a measurement.

   `projection-probe.ts` reads the projection and view matrices off the GL uniform uploads the
   panel's own context received, and `deliveredScale` divides by depth only when the matrix it was
   handed actually carries a depth term. So 0.0% is a property of the matrix the driver was given.
   The line numbers that comment cited had already moved by the time anyone read it, which is its
   own small argument. */

/* ── the shipped panel ─────────────────────────────────────────────────────────────────── */

interface ShippedPanelProps {
  tag: string;
  label: string;
  note: string;
  width: number;
  height: number;
  descriptors: readonly Descriptor3D[];
}

/** One mount of the REAL shipped component, sized to a chosen delivered scale, with the GL
 *  calls it costs measured around its own settle. */
function ShippedPanel({ tag, label, note, width, height, descriptors }: ShippedPanelProps) {
  const own = extent(descriptors);
  const host = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState<PanelReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    /** How many rendered frames the reading is averaged over. One frame is a sample of one,
     *  and this arc has already published a physical impossibility off a single sample
     *  (`the-hardware-floor-can-fail-on-frame-time`). */
    const WINDOW_FRAMES = 30;

    const settle = () => {
      if (cancelled) return;
      const canvas = host.current?.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') ?? null;
      if (!canvas || !gl) {
        requestAnimationFrame(settle);
        return;
      }
      const t = TALLIES.get(gl);
      if (!t) {
        // The context exists but has drawn nothing yet — wait for the component's first render
        // rather than recording a zero, which would read as a cheap panel.
        requestAnimationFrame(settle);
        return;
      }
      const before = { calls: t.calls, triangles: t.triangles, clears: t.clears };
      let waited = 0;
      const collect = () => {
        if (cancelled) return;
        const frames = t.clears - before.clears;
        if (frames < WINDOW_FRAMES && waited < 600) {
          waited += 1;
          requestAnimationFrame(collect);
          return;
        }
        // ⚠ OFF THIS PANEL'S OWN CONTEXT. Four canvases are live on this page and they do not
        // share a projection — the harness mounts are orthographic and always were — so a
        // page-global read would attribute one panel's camera to another.
        const scales = deliveredScale(t.projection, null, own, canvas.height);
        const divisor = Math.max(1, frames);
        const r: PanelReading = {
          widthPx: canvas.width,
          heightPx: canvas.height,
          devicePixelRatio: window.devicePixelRatio,
          calls: (t.calls - before.calls) / divisor,
          triangles: (t.triangles - before.triangles) / divisor,
          frames,
          scaleAtTarget: scales.target,
          scaleNear: scales.near,
          scaleFar: scales.far,
          projection: scales.kind,
          spreadPct: perspectiveSpreadPct(scales),
        };
        setReading(r);
        const report = (window.__stBaseline ??= emptyReport());
        report.panels[tag] = r;
      };
      requestAnimationFrame(collect);
    };
    requestAnimationFrame(() => requestAnimationFrame(settle));
    return () => {
      cancelled = true;
    };
  }, [tag, own]);

  return (
    <figure className="panel">
      <figcaption>
        <strong>{label}</strong>
        <span>{note}</span>
      </figcaption>
      <div className="stage" style={{ width, height }} data-st-tag={tag} ref={host}>
        <ForestWorldCanvas descriptors={descriptors} />
      </div>
      <p className="numbers small">
        {reading
          ? `${reading.widthPx}x${reading.heightPx} px · ${reading.calls.toFixed(1)} draw calls/frame · ${Math.round(
              reading.triangles,
            )} triangles/frame · averaged over ${reading.frames} frames · ${reading.scaleAtTarget.toFixed(
              2,
            )} px/unit at target (${reading.scaleNear.toFixed(2)}–${reading.scaleFar.toFixed(
              2,
            )} across the island) · ${reading.projection.toUpperCase()}, spread ${reading.spreadPct.toFixed(1)}%`
          : 'measuring…'}
      </p>
    </figure>
  );
}

/* ── the page ──────────────────────────────────────────────────────────────────────────── */

/** The two palettes side by side. ⚠ The DIVERGENCE is the finding: `ForestWorldCanvas.tsx`
 *  carries its own six-colour spike map, while ADR-0462 settled the vocabulary at five colours
 *  over six states in `palette-band.ts` / `apps/studio/src/index.css`. The shipped canvas has
 *  never been moved onto it. */
function PaletteDivergence() {
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>status</th>
          <th>what the SHIPPED canvas draws</th>
          <th>the settled vocabulary (ADR-0462)</th>
        </tr>
      </thead>
      <tbody>
        {SHIPPED_STATUSES.map((s) => {
          const shipped = SHIPPED_STATUS_COLOUR.get(s)!;
          const settled = STATUS_TOKENS.get(s)?.top[0] ?? '(none)';
          return (
            <tr key={s}>
              <td>{s}</td>
              <td>
                <span className="swatch" style={{ background: shipped }} /> <code>{shipped}</code>
              </td>
              <td>
                <span className="swatch" style={{ background: settled }} /> <code>{settled}</code>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function App() {
  const meshExtent = extent(DESCRIPTORS);
  const authored = authoredTriangles(CENSUS);
  const classicAuthored = authoredTriangles(CLASSIC_CENSUS);
  return (
    <main>
      <header>
        <h1>What the shipped forest map draws today</h1>
        <p>
          Every picture this arc has shown came out of <code>harness/</code>. What actually ships
          is <code>src/ForestWorldCanvas.tsx</code>. When it was first photographed, on 2026-08-28,
          it drew <strong>no ground at all</strong> for the substrate the studio ships &mdash; its
          mapper had a case for the classic extruded-hex <code>tile</code> only, and the product
          emits <code>cell</code> parcels. This page now shows that gap and its fix side by side.
          Same fixture, same island, same GPU, same run.
        </p>
        <p className="numbers">
          island extent {meshExtent.spread.toFixed(1)} units from centre &middot; projection read
          off each panel&rsquo;s own uniform uploads &middot; authored triangles{' '}
          {authored.triangles} &middot; drawables{' '}
          {Object.entries(CENSUS)
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ')}
        </p>
        <PaletteDivergence />
      </header>

      <section data-st-panel="baseline-before-after">
        <h2>The fix, as a picture</h2>
        <p className="lede">
          The same component, the same island, the same run &mdash; differing in exactly one
          thing: whether the mapper has a case for the <code>cell</code> parcels the studio
          emits. <strong>Left</strong> is what shipped until 2026-08-28, reconstructed by taking
          today&rsquo;s mapper output and removing the one family it gained; every parcel used to
          come back as a skip, and a skip is not drawn, so the reconstruction is exact rather
          than a re-creation. <strong>Right</strong> is the same component today.
        </p>
        <p className="lede">
          &#9888; <strong>The camera differs, and that is part of the finding rather than a
          confound.</strong> <code>frameWorld</code> derives the framing from the drawables it is
          given (<code>ForestWorldCanvas.tsx:158-168</code>), so with one story tree and nothing
          else the world has no extent to frame &mdash; it backs off its 260-unit floor and the
          island-that-is-not-there occupies a corner. Restoring the ground restores the framing
          with it. The tree sits at the same world position in both panels.
        </p>
        <div className="row">
          <ShippedPanel
            tag="shipped-before"
            label="BEFORE — no case for `cell`"
            note={`${BEFORE_THE_CELL_CASE.skippedCells} parcels skipped · one story tree · ${BEFORE_THE_CELL_CASE.triangles} triangles`}
            width={640}
            height={420}
            descriptors={BEFORE_DESCRIPTORS}
          />
          <ShippedPanel
            tag="shipped-overview"
            label="AFTER — the parcels are drawn"
            note={`${CENSUS['cell-ground'] ?? 0} parcels in ONE merged mesh · ${CELL_TRIANGLES} ground triangles`}
            width={640}
            height={420}
            descriptors={DESCRIPTORS}
          />
        </div>
      </section>

      <section data-st-panel="baseline-reports-status">
        <h2>&#9888; The restored ground still REPORTS</h2>
        <p className="lede">
          The fixture is the all-healthy research surface, so every panel above draws 164 parcels
          in one colour &mdash; which is equally consistent with a ground that has stopped reading
          the status at all. This row gives ONE capability a foreign state. The left panel is the
          island above; the right is the same island with that one capability{' '}
          <code>unhealthy</code>. Same geometry, same triangle count, same draw calls &mdash; the
          only difference is what the map is asserting.
        </p>
        <p className="lede">
          &#9888; The parcels carry the status <strong>per capability</strong>, not per island:
          the plain relaxed cell has no status of its own and the core stamps it one level up, so
          a mapper that read only the cell would draw the whole island <code>unknown</code>. That
          would be a map that had stopped reporting, which ADR-0392 D5 / ADR-0398 D7 put beyond an
          art call, and it is the failure this row exists to make visible.{' '}
          {Object.entries(MIXED_MATERIALS).map(([k, v]) => `${v} ${k}`).join(' · ')}.
        </p>
        <div className="row">
          <ShippedPanel
            tag="shipped-uniform"
            label="ALL HEALTHY — the research surface"
            note={`${CENSUS['cell-ground'] ?? 0} parcels, one state`}
            width={900}
            height={560}
            descriptors={DESCRIPTORS}
          />
          <ShippedPanel
            tag="shipped-mixed"
            label="ONE CAPABILITY UNHEALTHY — the same island"
            note={Object.entries(MIXED_MATERIALS).map(([k, v]) => `${v} ${k}`).join(' · ')}
            width={900}
            height={560}
            descriptors={MIXED_DESCRIPTORS}
          />
        </div>
      </section>

      <section data-st-panel="baseline-overview-harness">
        <h2>The overview, against where this arc is going</h2>
        <p className="lede">
          The restored ground is the PLACEHOLDER ground &mdash; a flat prism per parcel wearing
          the parcel&rsquo;s folded status colour, which is exactly the fidelity the classic
          substrate always had. It is deliberately not the treatment on the right: no relief, no
          grain, no coast, no skirt. Closing a representation gap and adopting a treatment are
          separate events (ADR-0380 D6 / ADR-0406 D2), and this is the first.
        </p>
        <div className="row">
          <ShippedPanel
            tag="shipped-overview-2"
            label="SHIPPED — the placeholder ground, restored"
            note="flat parcel prisms, meshStandardMaterial, perspective fov 45"
            width={640}
            height={420}
            descriptors={DESCRIPTORS}
          />
          <IslandPanel
            label="HARNESS — the experiment"
            note="per-cell mesh, analytic relief, banded ShaderMaterial, rim skirt"
            tag="harness-overview"
            pxPerUnit={2}
            displayPxPerUnit={2}
            land="full"
          />
        </div>
      </section>

      <section data-st-panel="baseline-zoom">
        <h2>Zoomed in</h2>
        <p className="lede">
          The zoom the owner singled out. The shipped panel is the same component at four times
          the canvas, which is the only zoom control it has; the harness panel is 8&nbsp;px per
          ground unit.
        </p>
        <div className="row">
          <ShippedPanel
            tag="shipped-zoom"
            label="SHIPPED — ForestWorldCanvas"
            note="the same component, 4x the canvas"
            width={1280}
            height={840}
            descriptors={DESCRIPTORS}
          />
          <IslandPanel
            label="HARNESS — the experiment"
            note="8 px / ground unit"
            tag="harness-zoom"
            pxPerUnit={8}
            displayPxPerUnit={2}
            land="full"
          />
        </div>
      </section>

      <section data-st-panel="baseline-classic-control">
        <h2>The control &mdash; the same canvas on the CLASSIC substrate</h2>
        <p className="lede">
          &#9888; <strong>The control is what says the fix ADDED a representation rather than
          swapping one for another.</strong> The shipped canvas has always mapped ground from a
          scene node of kind <code>tile</code> &mdash; the classic extruded-hex island &mdash; and
          it still does. A mapper that had simply been re-pointed at <code>cell</code> would draw
          the island above and nothing here, which is the same defect facing the other way. This
          row is the same component and the same code path on a classic hex island, and it draws
          its {CLASSIC_CENSUS['hex-ground'] ?? 0} hexes exactly as before.
        </p>
        <p className="lede">
          It is also the row that shows the two substrates now agree about what the placeholder
          land LOOKS like: flat, untextured, one colour per parcel from the status. The panel
          beside it is where this arc is going.
        </p>
        <div className="row">
          <ShippedPanel
            tag="shipped-classic"
            label="SHIPPED — the placeholder land, drawn"
            note={`classic hex substrate · ${classicAuthored.triangles} triangles`}
            width={1900}
            height={1200}
            descriptors={CLASSIC_DESCRIPTORS}
          />
          <IslandPanel
            label="HARNESS — where this arc is going"
            note="the treatment the owner approved, at 8 px / ground unit"
            tag="harness-classic-compare"
            pxPerUnit={8}
            displayPxPerUnit={8}
            land="full"
          />
        </div>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the same contract every other evidence page on this arc uses. The
  // extra delay is because the shipped panels take their reading across rAFs of their own and
  // the driver must not read `__stBaseline` before both have filed.
  const waitForPanels = (tries: number) => {
    const filed = Object.keys(window.__stBaseline?.panels ?? {}).length;
    if (filed >= 7 || tries <= 0) {
      const gl = document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info') ?? null;
      const report = (window.__stBaseline ??= emptyReport());
      report.renderer = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)';
      report.vendor = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)';
      report.timerQuery = gl?.getExtension('EXT_disjoint_timer_query_webgl2') != null;
      window.__stExperimentSettled = true;
      return;
    }
    setTimeout(() => waitForPanels(tries - 1), 100);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => waitForPanels(150)));
}
