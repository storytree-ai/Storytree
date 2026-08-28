// clay.tsx — THE BROWN COMPARISON page (dev-only).
//
// The owner's standing instruction on `adopt-the-land-into-the-shipped-map-arc`, verbatim:
// *"land increments to model the comparisons to me"*. This page is that comparison for the one
// change the increment `pull-the-four-land-colours-apart-in-hue` makes: `mapped`'s ground family
// stops being a warm tan and becomes a tilled clay.
//
// ⚠⚠ EXACTLY ONE THING DIFFERS BETWEEN THE TWO ARMS, AND THE DRIVER PROVES IT RATHER THAN
// CLAIMING IT. `clay-measure.mjs` hashes every panel's canvas pixels and refuses the whole run
// unless BOTH of these hold:
//
//   - the `mapped` pair DIFFERS  — else the page ignored its `palette` prop and the BEFORE arm is
//     secretly the AFTER one, which reports "no change" with the authority of a measurement;
//   - the OTHER FIVE pairs are BYTE-IDENTICAL — else something other than the brown varies with
//     the palette, and every figure taken off this page is confounded.
//
// That is the same refusal ADR-0462's page used ("the two AFTER yellows must match AND the two
// BEFORE ones must differ"), pointed at the axis this change moves.
//
// ⚠ THE BEFORE ARM IS `pre-clay`, NOT `legacy`. `legacy` is the pre-ADR-0462 palette and would
// show TWO changes at once — the merge and the slate as well as the brown. This page's question is
// only about the brown, so its BEFORE is the palette ADR-0462 actually shipped.
//
// ⚠ NO GRAIN, NO PLANTS, NO TREE, deliberately, for the reason `status.tsx` records: they are
// second variables and this page has one question. Bare, ungrained, palette CLOSED in every panel.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import { STATUS_TOKENS } from './palette-band.js';
import {
  ADR0462_STATUS_TOKENS,
  colourPairs,
  foreignColourReads,
  vocabularySeparation,
} from './status-vocabulary.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The six states, in the order the vocabulary reads them. */
const STATES = ['proposed', 'building', 'mapped', 'healthy', 'unhealthy', 'unknown'] as const;

const NOTE = {
  proposed: 'unstarted greenfield — its two darkest rungs were the ones reading as brown',
  building: 'work in flight; shares proposed’s token exactly',
  mapped: 'inherited brownfield — THE ONE FAMILY THIS CHANGE MOVES',
  healthy: 'a current signed pass',
  unhealthy: 'a signed failure',
  unknown: 'no data, or error',
} satisfies Record<(typeof STATES)[number], string>;

function StateRow({ palette, zoom }: { palette: 'live' | 'pre-clay'; zoom: number }) {
  const families = palette === 'pre-clay' ? ADR0462_STATUS_TOKENS : STATUS_TOKENS;
  return (
    <div className="row">
      {STATES.map((st) => (
        <IslandPanel
          key={st}
          label={st}
          note={`${families.get(st)!.top[0]} — ${NOTE[st]}`}
          tag={`clay-${palette}-${st}-${zoom}px`}
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

/** Every pair of DISTINCT colours against its own bar, before and after — ranked by RATIO, which
 *  is the ordering the bar makes meaningful and not the one `colourPairs` returns. */
function SeparationTable() {
  const before = new Map(colourPairs(ADR0462_STATUS_TOKENS).map((p) => [`${p.a}/${p.b}`, p]));
  const rows = [...colourPairs()].sort((x, y) => x.distance / x.step - y.distance / y.step);
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>pair</th>
          <th>before &divide; bar</th>
          <th>after &divide; bar</th>
          <th>verdict</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const b = before.get(`${p.a}/${p.b}`) ?? before.get(`${p.b}/${p.a}`);
          const ok = p.distance > p.step;
          return (
            <tr key={`${p.a}/${p.b}`}>
              <td>
                {p.a} / {p.b}
              </td>
              <td className={b && b.distance > b.step ? 'ref' : 'bad'}>
                {b ? `${b.distance.toFixed(2)} / ${b.step.toFixed(2)} = ${(b.distance / b.step).toFixed(3)}x` : '—'}
              </td>
              <td className={ok ? 'ok' : 'bad'}>
                {p.distance.toFixed(2)} / {p.step.toFixed(2)} = {(p.distance / p.step).toFixed(3)}x
              </td>
              <td className={ok ? 'ok' : 'bad'}>{ok ? 'clears' : 'COLLIDES'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function App() {
  const beforeReads = foreignColourReads(ADR0462_STATUS_TOKENS);
  const afterReads = foreignColourReads();
  const beforeV = vocabularySeparation(ADR0462_STATUS_TOKENS);
  const afterV = vocabularySeparation();
  return (
    <main>
      <header>
        <h1>a tilled clay in place of the tan &mdash; the land&rsquo;s last colour clash</h1>
        <p className="lede">
          One family moves. <code>mapped</code>&rsquo;s ground goes{' '}
          <code>{ADR0462_STATUS_TOKENS.get('mapped')!.top[0]}</code> &rarr;{' '}
          <code>{STATUS_TOKENS.get('mapped')!.top[0]}</code>, and nothing else in the vocabulary is
          touched. Reading DOWN a pair is the change; reading ACROSS a row is the vocabulary. Five
          of the six pairs are expected to be identical pixel for pixel, and the driver refuses the
          run if they are not &mdash; that is what stops this page reporting a difference it did
          not draw.
        </p>
        <p className="numbers">
          <strong>before &mdash; {beforeReads.length} misreads:</strong>{' '}
          {beforeReads.join(' · ') || 'none'}
          <br />
          <strong>after &mdash; {afterReads.length} misreads:</strong>{' '}
          {afterReads.join(' · ') || 'none'}
          <br />
          tightest pair {beforeV.tightest.pair} {beforeV.tightest.ratio.toFixed(3)}x &rarr;{' '}
          {afterV.tightest.pair} {afterV.tightest.ratio.toFixed(3)}x &middot; the rule the colour
          was picked by: the minimal move at which brown stops being the vocabulary&rsquo;s weakest
          link &mdash; the tightest pair no longer involves brown at all
        </p>
        <SeparationTable />
        <p className="numbers">
          the bar is read off a control in the same run, never picked: two DIFFERENT colours must
          stay further apart, across the whole lighting ladder, than ONE lighting step moves a
          single token &middot; distances in the quantiser&rsquo;s luma-weighted space &middot;
          ladder {`[0.78, 0.80, 0.90, 1.00]`}, bare ungrained land, palette CLOSED in every panel
        </p>
      </header>

      <section data-st-panel="clay-pre-clay-2px">
        <h2>2 px / ground unit &mdash; BEFORE, the overview the map is read at</h2>
        <p className="lede">
          The tan. At its two darkest lighting steps, <code>proposed</code>&rsquo;s yellow delivers
          a pixel the reader model takes for this brown &mdash; unproven greenfield reported as
          inherited brownfield.
        </p>
        <StateRow palette="pre-clay" zoom={2} />
      </section>

      <section data-st-panel="clay-live-2px">
        <h2>2 px / ground unit &mdash; AFTER</h2>
        <p className="lede">
          The clay. No delivered land pixel on any lighting rung now reads as a colour other than
          its own.
        </p>
        <StateRow palette="live" zoom={2} />
      </section>

      <section data-st-panel="clay-pre-clay-8px">
        <h2>8 px / ground unit &mdash; BEFORE, zoomed in</h2>
        <StateRow palette="pre-clay" zoom={8} />
      </section>

      <section data-st-panel="clay-live-8px">
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
