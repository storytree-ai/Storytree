// cover.tsx — THE GROUND-COVER COMPARISON page (dev-only). The owner's own request, for the
// increment `wheat-and-yellow-grass-to-the-same-quality` on
// `adopt-the-land-into-the-shipped-map-arc`:
//
//   "land increments to model the comparisons to me, i'm sure its not that hard to do wheat
//    field or yellow grass to the same quality as we have done here"
//
// WHAT "THE SAME QUALITY" IS, CONCRETELY: the grain octave measured in PR #1665 — the treatment
// that raised pixel-scale contrast +183% on the green island while delivering only colours the
// palette already held. The question this page answers is whether that result was a property of
// the TREATMENT or of the green TOKEN it happened to be measured on. Nothing established which,
// because it had only ever been run on one colour.
//
// THE GRID IS A FACTORIAL AND EVERY AXIS MOVES ONE THING. Three ground covers across, two grain
// states down, at two zooms. Reading ACROSS a row shows the cover; reading DOWN a column shows
// the grain. Same fixture, same cells, same relief, same light, same camera, same orthographic
// projection, bare land throughout (no plants, no flowers, no tree). A difference between two
// panels is the axis it sits on and nothing else, which is what makes the delivered numbers a
// measurement rather than an impression.
//
// ⚠ ONLY THE GRAIN'S **NORMAL** HALF APPEARS HERE, and that is a deliberate narrowing rather
// than an omission. The colour half is off-palette by construction, so a page carrying it can
// say nothing about whether a cover keeps the palette closed — and palette closure is exactly
// the property this page has to establish for a NEW authored token. Every panel below is
// expected CLOSED, and `cover-measure.mjs` refuses if one is not.
//
// ⚠ THE TWO ZOOMS ARE THE RESEARCH'S OWN — 2 and 8 device px per ground unit, within 4% of the
// committed Cycles frames at 487 px and 1948 px, so a number taken here reads against that table.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import {
  SEPARATION_FLOOR,
  YELLOW_GRASS,
  coverVerdict,
  separationOf,
  worstStatusPair,
  type GroundCover,
} from './ground-cover.js';
import { GRAIN_NORMAL_STRENGTH } from './land-grain.js';
import { STATUS_TOKENS } from './palette-band.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

interface Cover {
  key: string;
  label: string;
  note: string;
  cover?: GroundCover;
}

const WHEAT = STATUS_TOKENS.get('healthy')!.wheat;

const COVERS: Cover[] = [
  {
    key: 'status',
    label: 'status green',
    note: `the control — every cell wears its capability's own token (${STATUS_TOKENS.get('healthy')!.top[0]})`,
  },
  {
    key: 'wheat',
    label: 'wheat field',
    note: `the app's own ${WHEAT} override, driven across the whole island`,
    cover: 'wheat',
  },
  {
    key: 'yellowgrass',
    label: 'yellow grass',
    note: `${YELLOW_GRASS} — authored here, against the separation measurement`,
    cover: 'yellowGrass',
  },
];

/** The three covers at one grain state and one zoom. Canvas TAGS stay computed — `data-st-tag`
 *  is resolved at runtime by the measurement script rather than scraped out of the source, so it
 *  carries none of the static-uniqueness obligation `data-st-panel` does. */
function CoverRow({ zoom, grained }: { zoom: number; grained: boolean }) {
  return (
    <div className="row">
      {COVERS.map((c) => (
        <IslandPanel
          key={c.key}
          label={c.label}
          note={c.note}
          tag={`cover-${c.key}-${grained ? 'grain' : 'flat'}-${zoom}px`}
          pxPerUnit={zoom}
          displayPxPerUnit={2}
          land="full"
          plants={false}
          flowers={false}
          tree={false}
          {...(c.cover ? { cover: c.cover } : {})}
          {...(grained ? { grain: { mode: 'normal' as const } } : {})}
        />
      ))}
    </div>
  );
}

/** The separation table, rendered from the same functions the measurement script prints — so
 *  the number a reader sees under the picture is the number the instrument computed, not a
 *  transcription of it. */
function SeparationTable() {
  // ⚠ WHEAT IS THE BAR, NOT A CANDIDATE. It is listed with its number and WITHOUT a verdict,
  // because scoring the reference against itself would print as this page having adjudicated a
  // colour the app already ships — which is the owner's open question, not this page's.
  const rows = [
    { name: 'wheat (shipped)', token: WHEAT, reference: true },
    { name: 'yellow grass', token: YELLOW_GRASS, reference: false },
  ];
  const worst = worstStatusPair();
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>cover</th>
          <th>token</th>
          <th>nearest status</th>
          <th>distance</th>
          <th>vs the bar</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const v = coverVerdict(r.token);
          return (
            <tr key={r.token}>
              <td>{r.name}</td>
              <td>
                <span className="swatch" style={{ background: r.token }} /> <code>{r.token}</code>
              </td>
              <td>{v.separation.nearest}</td>
              <td>{v.separation.distance.toFixed(2)}</td>
              {r.reference ? (
                <td className="ref">this is where the bar comes from</td>
              ) : (
                <td className={v.ok ? 'ok' : 'bad'}>
                  {v.ok ? '+' : ''}
                  {v.margin.toFixed(2)}
                </td>
              )}
            </tr>
          );
        })}
        <tr className="ref">
          <td>the bar</td>
          <td colSpan={2}>what the shipped wheat override already costs</td>
          {/* Three decimals, not two: the bar is 7.675, a TRUNCATION of the wheat row's
              7.6753 above it. Printed at two it reads 7.67 beside that row's 7.68 and looks
              like a second, disagreeing figure for the same thing. */}
          <td>{SEPARATION_FLOOR.toFixed(3)}</td>
          <td />
        </tr>
        <tr className="ref">
          <td>for scale</td>
          <td colSpan={2}>
            the closest two <em>different</em> statuses ({worst.a} vs {worst.b})
          </td>
          <td>{worst.distance.toFixed(2)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function App() {
  const yellow = separationOf(YELLOW_GRASS);
  return (
    <main>
      <header>
        <h1>A wheat field and a yellow grass, at the grain crossing&rsquo;s quality bar</h1>
        <p>
          PR&nbsp;#1665 measured the grain octave on ONE ground colour &mdash; the healthy
          island&rsquo;s green &mdash; and found it worth <strong>+183% MICRO</strong> at the
          zoom, for nothing at all in palette terms. This page asks whether that was a property of
          the treatment or of the token it happened to be measured on, by putting the identical
          treatment on two scenery covers and changing nothing else.
        </p>
        <p>
          <strong>The wheat field is not a new colour.</strong> <code>{WHEAT}</code> is already an
          authored token, transcribed verbatim from the shipped app&rsquo;s own{' '}
          <code>.hex-territory</code> rules, carried by every status, and already threaded through
          this renderer. It is an override nobody has driven properly, not an invention.
        </p>
        <p>
          <strong>The yellow grass is a new colour, and it was authored against a
          measurement.</strong> The land&rsquo;s colour is a capability&rsquo;s proof state, so a
          scenery colour that lands on a status family makes the map report a state no capability
          holds &mdash; the one way this work can do real harm. <code>{YELLOW_GRASS}</code> sits{' '}
          <strong>{yellow.distance.toFixed(2)}</strong> from the nearest status ({yellow.nearest})
          at matched condition, against the {SEPARATION_FLOOR.toFixed(3)} the shipped wheat
          override already costs.
        </p>
        <SeparationTable />
        <p className="numbers">
          bump strength {GRAIN_NORMAL_STRENGTH}, normal half only (palette CLOSED in every panel)
          &middot; bare land, no props &middot; identical fixture, relief, light and camera across
          all twelve panels &middot; distances in the quantiser&rsquo;s luma-weighted space, at
          matched condition &mdash; same face, same ladder rung
        </p>
      </header>

      {/* ⚠ THE FOUR SECTIONS ARE WRITTEN OUT RATHER THAN MAPPED, and that is a requirement rather
          than a style. `capture-panels.test.ts` scrapes `data-st-panel="..."` out of the page
          SOURCE to prove every capturable section carries a unique authored id — a computed
          `data-st-panel={...}` matches nothing, so the section would be dropped from an evidence
          capture without a word. */}
      <section data-st-panel="cover-flat-2px">
        <h2>2 px / ground unit &mdash; the overview, ungrained</h2>
        <p className="lede">
          The delivered scale on a 2880&times;1920 display. This row is the covers on their own,
          with no treatment at all: what changing the token buys before anything else happens.
        </p>
        <CoverRow zoom={2} grained={false} />
      </section>

      <section data-st-panel="cover-grain-2px">
        <h2>2 px / ground unit &mdash; the overview, grained</h2>
        <p className="lede">
          The same three covers wearing the grain. At this scale the research says contrast and
          silhouette carry and detail does not, so a large lift here would be the surprise.
        </p>
        <CoverRow zoom={2} grained />
      </section>

      <section data-st-panel="cover-flat-8px">
        <h2>8 px / ground unit &mdash; zoomed in, ungrained</h2>
        <p className="lede">
          The zoom the owner singled out, without the treatment. This is the row where the
          untreated ground reads as a flat wash.
        </p>
        <CoverRow zoom={8} grained={false} />
      </section>

      <section data-st-panel="cover-grain-8px">
        <h2>8 px / ground unit &mdash; zoomed in, grained</h2>
        <p className="lede">
          The comparison the increment is for: a wheat field and a yellow grass at the same
          quality bar the green island reached.
        </p>
        <CoverRow zoom={8} grained />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the same contract every other evidence page uses: the measurement
  // waits on this rather than sleeping, because this arc has twice captured evidence mid-draw.
  // Two rAFs, so the signal is raised after the browser has actually composited the frame the
  // panels drew rather than merely after React returned.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__stExperimentSettled = true;
    });
  });
}
