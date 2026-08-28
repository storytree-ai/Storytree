// palette.tsx — THE SHIPPED GROUND+CROWN PALETTE, before and after, on the REAL component.
//
// THE INCREMENT this page evidences: `src/ForestWorldCanvas.tsx`'s single `STATUS_COLOUR` lookup
// (one map painting BOTH the ground and the story tree's crown) was split into `GROUND_COLOUR`
// and `CROWN_COLOUR` — the decided vocabulary — replacing a private six-colour "spike palette,
// not art direction" that disagreed with every land-colour decision this project has made
// (ADR-0392 D5 / ADR-0398 D7 / ADR-0461 / ADR-0462 / ADR-0470).
//
// ⚠⚠ THIS PAGE MOUNTS THE REAL `ForestWorldCanvas`, IMPORTED FROM `../src/`, NEVER A
// RE-CREATION. That is the whole value of the picture — a later reader can trust the swatch
// belongs to the file that ships. The harness may import `src/`; the reverse is fenced
// (`scope-fence.test.ts`).
//
// ⚠ THE "BEFORE" ARM IS NOT A PROP. There is no `palette` toggle on the shipped component and
// this page adds none — the instructions for this evidence page are explicit that no prop may be
// added to `ForestWorldCanvas` to fake a before/after. Instead the SAME page is photographed
// twice, against two states of `src/ForestWorldCanvas.tsx` on disk (the driver's job, not this
// page's): once as the working tree stands (AFTER), and once with the file temporarily rolled
// back to `git show HEAD` (BEFORE, restored byte-identical immediately after capture). This page
// therefore carries no branching logic of its own — it is one honest render of whatever
// `ForestWorldCanvas` currently is.
//
// ONE ISLAND PER STATE, ALL SIX, EACH CARRYING ITS STORY TREE. `islandScene({ status })` puts the
// whole island — every parcel AND the territory itself — into one status, which is what lets a
// panel show a clean, uncontaminated ground colour rather than the five-colours-in-one-picture a
// mixed island would show (`island-fixture.ts`'s own `oddOneOut` doc explains why: shape and
// neighbourhood confound a colour comparison across a mixed island in a way a uniform one does
// not). The story tree is drawn automatically — `islandScene` always sets a `treeSpot` — so the
// crown is visible in every panel without any extra option.
//
// TWO STAGE SIZES ARE THE ONLY ZOOM CONTROL. `ForestWorldCanvas` fits its own orthographic camera
// to whatever CSS box it is given (`camera-framing.ts`'s `orthographicZoomFor`), so a bigger stage
// delivers more pixels per world unit for the SAME framed island — there is no separate "zoom"
// input to add. `OVERVIEW` and `ZOOM` below are that control.

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ForestWorldCanvas } from '../src/ForestWorldCanvas.js';
import { worldTo3D, type Descriptor3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';
// ⚠ The report shape is DECLARED ONCE, in the module the driver reads it through — see its
// header. Importing it is also what puts `__stPalette` on `window` for this file.
import type { PaletteReport, PanelReading } from './palette-report.js';
import './palette-report.js';
import { deliveredScale, perspectiveSpreadPct, type Mat4, type ProjectionKind } from './projection-probe.js';

/** The six states, in `shipped-baseline.ts`'s `SHIPPED_STATUSES` order. */
const STATES = ['healthy', 'mapped', 'proposed', 'building', 'unhealthy', 'unknown'] as const;
type Status = (typeof STATES)[number];

/** Two zoom labels — see the header note: the stage SIZE is the only zoom control this canvas
 *  offers, so there is no third axis to add. */
const ZOOMS = ['overview', 'zoom'] as const;
type ZoomLabel = (typeof ZOOMS)[number];

/** The overview stage — roughly what the map is read at when it is not the thing you are
 *  looking closely at. */
const OVERVIEW = { width: 480, height: 320 };
/** The zoomed stage — 2.5x the overview's linear size, so the delivered px/unit figures separate
 *  cleanly rather than by a marginal nudge, and the driver can assert the separation instead of
 *  taking the two labels on trust. It is not larger than that on purpose: twelve simultaneous
 *  WebGL contexts is already near what a browser will hand out, and six 1440-wide canvases on a
 *  software rasteriser turn a ~30 s capture into a multi-minute one. */
const ZOOM = { width: 1200, height: 800 };

/** `satisfies` rather than a `Record<...>` ANNOTATION: the annotation would widen the two known
 *  stages back to an open dictionary and discard what this literal already proves
 *  (`anti-slop/no-known-value-widening`). The check that both labels are covered is kept; the
 *  knowledge that there are exactly two, with these values, is not thrown away. */
const STAGE_BY_ZOOM = {
  overview: OVERVIEW,
  zoom: ZOOM,
} satisfies Record<ZoomLabel, { width: number; height: number }>;

/** One all-`status` island's descriptors, built once per status and reused by both the
 *  overview and the zoomed panel of that status — the fixture is identical, only the stage
 *  differs.
 *
 *  A `ReadonlyMap` for the same reason `ForestWorldCanvas`'s own palettes are one: this is a
 *  LOOKUP built by iterating `STATES`, so an object with a `Record<Status, …>` annotation is the
 *  widening the house rules refuse, and the Map states the same thing while adding an
 *  immutability fence the object never had. */
function buildDescriptorsByStatus(): ReadonlyMap<Status, readonly Descriptor3D[]> {
  return new Map(STATES.map((st) => [st, worldTo3D(islandScene({ status: st }))] as const));
}
const DESCRIPTORS = buildDescriptorsByStatus();

/** The island's world extent, from its own drawable instances — mirrors `baseline.tsx`'s
 *  `extent`, which `projection-probe.ts`'s `deliveredScale` is written against. */
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
  return { minX, maxX, minZ, maxZ, cx, cz };
}

/* ── the projection-matrix tap, installed before any canvas mounts ─────────────────────────
   Trimmed from `baseline.tsx`'s counter to the one thing this page needs: WHICH matrix each
   panel's own GL context was actually given, keyed by context so twelve simultaneous canvases
   cannot cross-attribute. `clear()` is tallied too, purely as the settle signal — one call per
   `renderer.render()` with `autoClear` on, so "has this panel painted yet" is answered by counting
   it rather than by a fixed timeout. */
interface ContextTally {
  clears: number;
  projection: Mat4 | null;
}
const TALLIES = new WeakMap<WebGL2RenderingContext, ContextTally>();
function tallyFor(gl: WebGL2RenderingContext): ContextTally {
  let t = TALLIES.get(gl);
  if (!t) {
    t = { clears: 0, projection: null };
    TALLIES.set(gl, t);
  }
  return t;
}

let counterInstalled = false;
function installCounter(): void {
  if (counterInstalled) return;
  counterInstalled = true;

  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function patched(mask) {
    if ((mask & this.COLOR_BUFFER_BIT) !== 0) tallyFor(this).clears += 1;
    return clear.call(this, mask);
  };

  // Locations are opaque, so the only way to know WHICH uniform an upload targets is to
  // remember what three.js asked for BY NAME, per context.
  const named = new WeakMap<WebGL2RenderingContext, Set<WebGLUniformLocation>>();
  const gul = WebGL2RenderingContext.prototype.getUniformLocation;
  WebGL2RenderingContext.prototype.getUniformLocation = function patched(program, name) {
    const loc = gul.call(this, program, name);
    if (loc && name === 'projectionMatrix') {
      let s = named.get(this);
      if (!s) {
        s = new Set();
        named.set(this, s);
      }
      s.add(loc);
    }
    return loc;
  };

  const um4 = WebGL2RenderingContext.prototype.uniformMatrix4fv;
  WebGL2RenderingContext.prototype.uniformMatrix4fv = function patched(location, transpose, data, ...rest) {
    const isProjection = location ? (named.get(this)?.has(location) ?? false) : false;
    if (isProjection && !transpose) {
      // COPIED, not retained — three reuses one scratch array across every upload.
      const flat = Array.from(data as ArrayLike<number>).slice(0, 16);
      if (flat.length === 16) tallyFor(this).projection = flat;
    }
    return um4.call(this, location, transpose, data as never, ...(rest as []));
  };
}
installCounter();

/** The report shell, so the settle hook and every panel agree on its shape. */
function emptyReport(): PaletteReport {
  return { renderer: '', vendor: '', panels: {} };
}

interface PanelProps {
  tag: string;
  label: string;
  note: string;
  width: number;
  height: number;
  descriptors: readonly Descriptor3D[];
}

/** One mount of the REAL shipped component, at a chosen stage size, stamped `data-st-panel` so
 *  the driver can find it and its own delivered scale read off the GL uniform it actually got. */
function PalettePanel({ tag, label, note, width, height, descriptors }: PanelProps) {
  const own = extent(descriptors);
  const host = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState<PanelReading | null>(null);

  useEffect(() => {
    let cancelled = false;
    /** Frames the reading is confirmed over — small, because unlike `baseline.tsx` this page
     *  needs no per-frame COST average, only proof that at least one post-fit frame painted. */
    const WINDOW_FRAMES = 3;

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
        requestAnimationFrame(settle);
        return;
      }
      const startClears = t.clears;
      let waited = 0;
      const collect = () => {
        if (cancelled) return;
        const frames = t.clears - startClears;
        if (frames < WINDOW_FRAMES && waited < 600) {
          waited += 1;
          requestAnimationFrame(collect);
          return;
        }
        const scales = deliveredScale(t.projection, null, own, canvas.height);
        const r: PanelReading = {
          widthPx: canvas.width,
          heightPx: canvas.height,
          devicePixelRatio: window.devicePixelRatio,
          frames,
          scaleAtTarget: scales.target,
          scaleNear: scales.near,
          scaleFar: scales.far,
          projection: scales.kind,
          spreadPct: perspectiveSpreadPct(scales),
        };
        setReading(r);
        const report = (window.__stPalette ??= emptyReport());
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
    <figure className="panel" data-st-panel={tag}>
      <figcaption>
        <strong>{label}</strong>
        <span>{note}</span>
      </figcaption>
      <div className="stage" style={{ width, height }} ref={host}>
        <ForestWorldCanvas descriptors={descriptors} />
      </div>
      <p className="numbers small">
        {reading
          ? `${width}x${height} css · ${reading.widthPx}x${reading.heightPx} px · dpr ${reading.devicePixelRatio} · ${reading.scaleAtTarget.toFixed(
              2,
            )} px/unit at target · ${reading.projection}, spread ${reading.spreadPct.toFixed(1)}%`
          : 'measuring…'}
      </p>
    </figure>
  );
}

function StatusRow({ zoom }: { zoom: ZoomLabel }) {
  const stage = STAGE_BY_ZOOM[zoom];
  return (
    <div className="row">
      {STATES.map((st) => (
        <PalettePanel
          key={st}
          tag={`${st}-${zoom}`}
          label={st}
          note={`${stage.width}x${stage.height} css stage`}
          width={stage.width}
          height={stage.height}
          descriptors={DESCRIPTORS.get(st)!}
        />
      ))}
    </div>
  );
}

function App() {
  return (
    <main>
      <header>
        <h1>The shipped ground+crown palette — before / after</h1>
        <p>
          <code>src/ForestWorldCanvas.tsx</code> used to paint the ground and the story tree&rsquo;s
          crown from ONE lookup, a private six-colour &ldquo;spike palette, not art direction&rdquo;
          that disagreed with every land-colour decision on all six states. It is now split into a
          decided <code>GROUND_COLOUR</code> and a decided <code>CROWN_COLOUR</code>. Every panel
          below is the REAL <code>ForestWorldCanvas</code>, one uniformly-coloured island per
          status, its story tree drawn automatically so the crown is visible too.
        </p>
        <p className="numbers">
          six states · two stages: overview {OVERVIEW.width}x{OVERVIEW.height}, zoom {ZOOM.width}x
          {ZOOM.height} · stage size is the only zoom control — no prop was added to the
          shipped component to fake it
        </p>
      </header>

      <section data-st-panel="palette-overview">
        <h2>Overview — {OVERVIEW.width}x{OVERVIEW.height} stage</h2>
        <StatusRow zoom="overview" />
      </section>

      <section data-st-panel="palette-zoom">
        <h2>Zoomed — {ZOOM.width}x{ZOOM.height} stage</h2>
        <StatusRow zoom="zoom" />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  const EXPECTED_PANELS = STATES.length * ZOOMS.length;
  const waitForPanels = (tries: number) => {
    const filed = Object.keys(window.__stPalette?.panels ?? {}).length;
    if (filed >= EXPECTED_PANELS || tries <= 0) {
      const gl = document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info') ?? null;
      const report = (window.__stPalette ??= emptyReport());
      report.renderer = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)';
      report.vendor = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)';
      window.__stExperimentSettled = true;
      return;
    }
    setTimeout(() => waitForPanels(tries - 1), 100);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => waitForPanels(200)));
}
