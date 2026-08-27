// grain.tsx — the GRAIN COMPARISON page (dev-only). The crossing probe for
// `the-grain-octave-in-the-live-renderer` on `adopt-the-land-into-the-shipped-map-arc`.
//
// ⚠⚠ WHY THIS IS A PAGE OF ITS OWN RATHER THAN TWO MORE PANELS ON `island.html`. Two of the
// four variants below wear the grain's COLOUR half, which is off-palette by construction, and
// `capture.mjs` refuses an off-palette pixel and exits non-zero (PR #1511). Adding them to a
// page that audit runs over would red the audit for a reason that is not a defect — and the
// only ways out of that would be to weaken the palette check or to skip the variant, both of
// which would cost more than a second page. ADR-0418 D2/D3 permit continuous shading on
// `harness/`; the INSTRUMENT has not caught up, and buying it back is
// `replace-the-palette-closure-check`'s job, not this increment's.
//
// THE FOUR VARIANTS ARE THE ONLY THING THAT DIFFERS. Same fixture, same cells, same relief,
// same token, same light, same camera, same orthographic projection, bare land throughout
// (no plants, no flowers, no tree). A difference between two panels is the grain and nothing
// else — which is what makes the delivered numbers a measurement rather than an impression.
//
// THE TWO ZOOMS ARE THE RESEARCH'S OWN. The island is 233.8 ground units on its long axis, so
// the committed Cycles frames at 487 px and 1948 px are 2.08 and 8.33 device px per ground
// unit. Rendering at 2 and 8 puts this page's panels within 4% of the frames whose numbers it
// is being read against.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import type { GrainMode } from './banded-material.js';
import { GRAIN_COLOUR_MIX, GRAIN_LATTICE, GRAIN_NORMAL_STRENGTH, grainFeaturePeriod } from './land-grain.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

interface Variant {
  key: string;
  label: string;
  note: string;
  grain?: { mode: GrainMode };
}

const VARIANTS: Variant[] = [
  {
    key: 'none',
    label: 'no grain',
    note: 'the control — the land exactly as it renders today',
  },
  {
    key: 'normal',
    label: 'normal half',
    note: `bump only, strength ${GRAIN_NORMAL_STRENGTH} — palette CLOSED`,
    grain: { mode: 'normal' },
  },
  {
    key: 'colour',
    label: 'colour half',
    note: `mix only, fac ${GRAIN_COLOUR_MIX} — palette OPEN`,
    grain: { mode: 'colour' },
  },
  {
    key: 'both',
    label: 'both halves',
    note: 'what Cycles actually did — palette OPEN',
    grain: { mode: 'both' },
  },
];

/** The four variants at one zoom. The canvas TAGS stay computed — `data-st-tag` is resolved at
 *  runtime by the measurement script, not scraped out of the source, so it carries none of the
 *  static-uniqueness obligation `data-st-panel` does. */
function ZoomRow({ zoom }: { zoom: number }) {
  return (
    <div className="row">
      {VARIANTS.map((v) => (
        <IslandPanel
          key={v.key}
          label={v.label}
          note={v.note}
          tag={`grain-${v.key}-${zoom}px`}
          pxPerUnit={zoom}
          displayPxPerUnit={2}
          land="full"
          plants={false}
          flowers={false}
          tree={false}
          {...(v.grain ? { grain: v.grain } : {})}
        />
      ))}
    </div>
  );
}

function App() {
  return (
    <main>
      <header>
        <h1>Does the grain octave survive the crossing into WebGL?</h1>
        <p>
          Everything this arc has proven about the land came out of Cycles &mdash; an offline path
          tracer, on a desktop GPU, with no frame budget. This is the same treatment&rsquo;s{' '}
          <strong>grain octave</strong> running in the live renderer, which nothing on this arc has
          ever done. The grain is the component the research says is not optional: it is worth{' '}
          <strong>+54% MICRO</strong> on bare land at 1948&nbsp;px and is the only lever measured
          that makes the ground survive being zoomed into.
        </p>
        <p>
          The Cycles grain is <em>two</em> mechanisms, and on a banded palette they land on
          opposite sides of the fence. The <strong>normal half</strong> perturbs the surface
          normal before the lighting is quantised, so every delivered pixel is still an authored
          ramp entry. The <strong>colour half</strong> mixes a noise-driven ramp into the
          delivered colour, which no closed palette can contain. Both are drawn here; only one of
          them is capturable by the instrument this project currently has.
        </p>
        <p className="numbers">
          lattice {GRAIN_LATTICE} ground units &middot; delivered feature ~
          {grainFeaturePeriod().toFixed(1)} units &middot; 2 octaves &middot; bare land, no props
          &middot; identical fixture, relief, token, light and camera across all eight panels
        </p>
      </header>

      {/* ⚠ THE TWO SECTIONS ARE WRITTEN OUT RATHER THAN MAPPED, and that is a requirement rather
          than a style. `capture-panels.test.ts` scrapes `data-st-panel="..."` out of the page
          SOURCE to prove every capturable section carries a unique authored id — a computed
          `data-st-panel={...}` matches nothing, so the section would be dropped from an evidence
          capture without a word. The guard caught exactly that here. */}
      <section data-st-panel="grain-2px">
        <h2>2 px / ground unit &mdash; the overview, where contrast carries</h2>
        <p className="lede">
          The delivered scale on a 2880&times;1920 display. Grain that reads as texture here is
          over-detailing.
        </p>
        <ZoomRow zoom={2} />
      </section>

      <section data-st-panel="grain-8px">
        <h2>8 px / ground unit &mdash; zoomed in, where detail carries</h2>
        <p className="lede">
          The zoom the owner singled out. This is where the control reads as a watercolour wash
          beside props that are crisply painted.
        </p>
        <ZoomRow zoom={8} />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the same contract every other evidence page uses: the capture waits
  // on this rather than sleeping, because this arc has twice captured evidence mid-draw. Two
  // rAFs, so the signal is raised after the browser has actually composited the frame the
  // panels drew rather than merely after React returned.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__stExperimentSettled = true;
    });
  });
}
