// status.tsx — THE STATUS-VOCABULARY COMPARISON page (dev-only).
//
// The owner's standing instruction on `adopt-the-land-into-the-shipped-map-arc`, verbatim:
// *"land increments to model the comparisons to me"*. A colour-vocabulary change has no
// comparison at all unless the renderer can still draw the vocabulary it replaced, which is what
// `LEGACY_STATUS_TOKENS` and `IslandView`'s `palette` prop are for.
//
// THE GRID IS A FACTORIAL AND EVERY AXIS MOVES ONE THING. Six STATES across, BEFORE above and
// AFTER below, at two zooms. Same fixture, same cells, same relief, same light, same camera, same
// orthographic projection, bare ungrained land throughout (no plants, no flowers, no tree, no
// grain). Reading ACROSS a row is the vocabulary; reading DOWN a pair is the change.
//
// ⚠ ONE ISLAND PER STATE, WHICH IS THE WHOLE REASON THIS IS A NEW PAGE. Every island the arc has
// rendered is `healthy` with at most ONE foreign parcel. A mixed island shows five colours at five
// different sizes, in five different neighbourhoods, against five different neighbours — so a
// reader comparing two of them is comparing shape and placement as much as colour, and that is the
// comparison a colour decision must NOT be made on.
//
// ⚠ `proposed` AND `building` ARE BOTH DRAWN, AND THE AFTER PAIR IS EXPECTED BYTE-IDENTICAL.
// That is not redundancy, it is the proof: `status-measure.mjs` hashes the two and REFUSES if they
// differ, so "two states, one token" is established by delivered pixels rather than by reading the
// source. The same two panels in the BEFORE row are required to DIFFER, which is what stops the
// identity being satisfied by a page that ignored its `palette` prop.
//
// ⚠ NO GRAIN, DELIBERATELY. The grain octave is proven (PR #1665) and is part of the treatment,
// but it is a second variable and this page has one question. Bare, ungrained, palette CLOSED in
// every panel — so a colour difference between two panels is the vocabulary and nothing else.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import { STATUS_TOKENS } from './palette-band.js';
import {
  LAND_COLOURS,
  LEGACY_STATUS_TOKENS,
  colourPairs,
  foreignColourReads,
  statusesWearing,
  worstColourPair,
  type LandColour,
} from './status-vocabulary.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The six states, in the order the vocabulary reads them. */
const STATES = ['proposed', 'building', 'mapped', 'healthy', 'unhealthy', 'unknown'] as const;

const NOTE = {
  proposed: 'unstarted greenfield — and everything unproven falls through to it',
  building: 'work in flight. The wisp says so; the land no longer repeats it',
  mapped: 'inherited brownfield, awaiting or completing adoption',
  healthy: 'a current signed pass — the only source of green',
  unhealthy: 'a signed failure',
  unknown: 'no data, or error',
} satisfies Record<(typeof STATES)[number], string>;

function StateRow({ palette, zoom }: { palette: 'live' | 'legacy'; zoom: number }) {
  const families = palette === 'legacy' ? LEGACY_STATUS_TOKENS : STATUS_TOKENS;
  return (
    <div className="row">
      {STATES.map((st) => (
        <IslandPanel
          key={st}
          label={st}
          note={`${families.get(st)!.top[0]} — ${NOTE[st]}`}
          tag={`status-${palette}-${st}-${zoom}px`}
          palette={palette}
          pxPerUnit={zoom}
          displayPxPerUnit={2}
          land="full"
          plants={false}
          flowers={false}
          tree={false}
          island={{ status: st, flowers: false }}
        />
      ))}
    </div>
  );
}

/** The vocabulary, as a legend a reader can check the pictures against. */
function VocabularyTable() {
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>colour</th>
          <th>token</th>
          <th>states</th>
          <th>was</th>
        </tr>
      </thead>
      <tbody>
        {LAND_COLOURS.map((c: LandColour) => {
          const states = statusesWearing(c);
          const token = STATUS_TOKENS.get(states[0]!)!.top[0]!;
          const before = states.map((s) => LEGACY_STATUS_TOKENS.get(s)!.top[0]!);
          const moved = before.some((t) => t !== token);
          return (
            <tr key={c}>
              <td>{c}</td>
              <td>
                <span className="swatch" style={{ background: token }} /> <code>{token}</code>
              </td>
              <td>{states.join(' + ')}</td>
              <td className={moved ? '' : 'ref'}>
                {moved ? (
                  <>
                    {before.map((t, i) => (
                      <span key={t}>
                        {i > 0 ? ', ' : ''}
                        <span className="swatch" style={{ background: t }} /> <code>{t}</code>
                      </span>
                    ))}
                  </>
                ) : (
                  'unchanged'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Every pair of DISTINCT colours, closest first, against the lighting-step bar. */
function SeparationTable() {
  const after = colourPairs();
  const before = new Map(colourPairs(LEGACY_STATUS_TOKENS).map((p) => [`${p.a}/${p.b}`, p]));
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>pair</th>
          <th>before</th>
          <th>after</th>
          <th>bar (one lighting step)</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {after.map((p) => {
          const b = before.get(`${p.a}/${p.b}`) ?? before.get(`${p.b}/${p.a}`);
          const ok = p.distance > p.step;
          return (
            <tr key={`${p.a}/${p.b}`}>
              <td>
                {p.a} / {p.b}
              </td>
              <td className="ref">{b ? b.distance.toFixed(2) : '—'}</td>
              <td>{p.distance.toFixed(2)}</td>
              <td className="ref">{p.step.toFixed(2)}</td>
              <td className={ok ? 'ok' : 'bad'}>{ok ? 'clears' : 'UNDER'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function App() {
  const before = foreignColourReads(LEGACY_STATUS_TOKENS);
  const after = foreignColourReads();
  const worstBefore = worstColourPair(LEGACY_STATUS_TOKENS);
  const worstAfter = worstColourPair();
  return (
    <main>
      <header>
        <h1>Five colours over six states</h1>
        <p>
          The land&rsquo;s colour is a capability&rsquo;s status, so a reader who cannot tell two
          of them apart is being told a proof state no capability holds. This page is the whole
          vocabulary at once, before and after &mdash; one island per state, so the only thing
          that differs between two pictures is the colour.
        </p>
        <p>
          <strong>Two states now share one colour deliberately.</strong> <code>proposed</code> and{' '}
          <code>building</code> wear the same yellow: work in flight is already signalled by the
          wisp orbiting the island, so the land was spending a colour to say something it was not
          the one saying. The two <em>after</em> panels below are expected to be pixel-identical,
          and the measurement refuses if they are not.
        </p>
        <p>
          <strong>One state gained a colour it never had.</strong> <code>unknown</code> &mdash; no
          data, or an error &mdash; used to fall through to the base grass, four degrees of hue
          from <code>healthy</code>, which asserts a signed pass. A parcel asserting{' '}
          <em>nothing</em> and a parcel asserting <em>proven</em> were {worstBefore.distance.toFixed(2)}{' '}
          apart; they are now {colourPairs().find((p) => [p.a, p.b].sort().join('/') === 'green/grey')!.distance.toFixed(2)}.
        </p>
        <VocabularyTable />
        <h2 style={{ marginTop: 26 }}>Can a reader be told the wrong thing?</h2>
        <p className="lede">
          Each colour&rsquo;s own ground token, delivered at every rung of the shader&rsquo;s
          lighting ladder, handed to the reader model ported from the author-time compositor. A
          result naming a different colour is the map misreporting.
        </p>
        <p className="numbers">
          <strong>before &mdash; {before.length} misreads:</strong> {before.join(' · ')}
          <br />
          <strong>after &mdash; {after.length} misreads:</strong> {after.join(' · ')}
          <br />
          What is left is one pair on two rungs: unproven greenfield read as inherited brownfield
          at the two darkest lighting steps. It is the entire remaining scope of the sibling row{' '}
          <code>pull-the-four-land-colours-apart-in-hue</code>, which this change narrows rather
          than absorbs.
        </p>
        <SeparationTable />
        <p className="numbers">
          the bar is read off a control in the same run, never picked: two DIFFERENT colours must
          stay further apart, across the whole ladder, than ONE lighting step moves a single token
          &middot; distances in the quantiser&rsquo;s luma-weighted space &middot; worst pair{' '}
          {worstBefore.a}/{worstBefore.b} {worstBefore.distance.toFixed(2)} &rarr; {worstAfter.a}/
          {worstAfter.b} {worstAfter.distance.toFixed(2)} &middot; pairs under the bar 3 &rarr; 1
          &middot; ladder {`[0.78, 0.80, 0.90, 1.00]`}, bare ungrained land, palette CLOSED in
          every panel
        </p>
      </header>

      <section data-st-panel="status-legacy-2px">
        <h2>2 px / ground unit &mdash; BEFORE, the overview the map is read at</h2>
        <p className="lede">
          The vocabulary as it stood. <code>building</code>&rsquo;s orange-gold is its own colour;{' '}
          <code>unknown</code> is the base grass.
        </p>
        <StateRow palette="legacy" zoom={2} />
      </section>

      <section data-st-panel="status-live-2px">
        <h2>2 px / ground unit &mdash; AFTER</h2>
        <p className="lede">
          <code>building</code> is now <code>proposed</code>, exactly; <code>unknown</code> is a
          cool slate that no lighting step can slide onto the charred <code>unhealthy</code>.
        </p>
        <StateRow palette="live" zoom={2} />
      </section>

      <section data-st-panel="status-legacy-8px">
        <h2>8 px / ground unit &mdash; BEFORE, zoomed in</h2>
        <StateRow palette="legacy" zoom={8} />
      </section>

      <section data-st-panel="status-live-8px">
        <h2>8 px / ground unit &mdash; AFTER, zoomed in</h2>
        <StateRow palette="live" zoom={8} />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the same contract every other evidence page uses: the measurement
  // waits on this rather than sleeping, because this arc has twice captured evidence mid-draw.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__stExperimentSettled = true;
    });
  });
}
