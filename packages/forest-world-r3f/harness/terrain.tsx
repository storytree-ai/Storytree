// terrain.tsx — THE STATES AS TERRAINS (ADR-0461 D1), on a whole island at delivered size.
//
// THE DECISION THIS SHOWS. A capability's state is carried by a NAMED TERRAIN, not by a tint.
// Colour stays one channel of the signal; it stops being the only one.
//
// ⚠⚠ THE PAIR THAT PROVES THE MOST IS `proposed` / `building`, AND THAT IS WHY IT IS FIRST ON
// THE PAGE. ADR-0462 settled the colour vocabulary at FIVE colours over SIX states: those two
// share one yellow. So on the BEFORE row they are the same picture — not similar, the same
// token, the same field, the same light — and colour cannot tell them apart at all, however
// good it is. Every difference on the AFTER row is the terrain, because there is nothing else
// left for it to be.
//
// ⚠ ONLY THREE OF THE SIX MAPPINGS ARE THE OWNER'S. He named `forest`, `swamp` and
// `wheatfield`; ADR-0461 D5 leaves the rest undecided. `fallow`, `heath` and `scree` are
// authored here as a PROPOSAL and are labelled as such in the table, because the difference
// between "he said this" and "a session proposed this" is exactly what he needs to see in
// order to answer.
//
// ⚠ BARE LAND THROUGHOUT — no plants, no flowers, no tree. `heathConf()` already varies
// vegetation per status, so a dressed island would show a difference that is partly the
// existing vegetation table and partly the new terrain, and nothing on the page could say
// which. The vegetation is a REAL second carrier and belongs in the vocabulary later; it is
// held out here so this page measures one thing.
//
// ⚠ THE GRAIN'S NORMAL HALF ONLY. The colour half is off-palette by construction, and palette
// closure is exactly the property a new per-state treatment has to keep — a terrain that
// reported a colour no status owns would be the art asserting a state the work does not hold.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import { separationOf } from './ground-cover.js';
import { grainFeaturePeriod } from './land-grain.js';
import { TERRAINS, terrainFeature, type Terrain } from './terrain-vocabulary.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The colour-blind pair, first, because it is the one colour cannot help with. */
const PAIR = TERRAINS.filter((t) => t.state === 'proposed' || t.state === 'building');
const REST = TERRAINS.filter((t) => !PAIR.includes(t));

function TerrainPanel({ t, zoom, terrain }: { t: Terrain; zoom: number; terrain: boolean }) {
  const f = terrainFeature(t, grainFeaturePeriod());
  return (
    <IslandPanel
      label={terrain ? `${t.state} — ${t.name}` : `${t.state} — colour only`}
      note={
        terrain
          ? `${t.token} · features ${f.along.toFixed(1)} x ${f.across.toFixed(1)} ground units`
          : `${t.token} · the isotropic grain, no terrain`
      }
      tag={`terrain-${t.state}-${terrain ? 'on' : 'off'}-${zoom}px`}
      pxPerUnit={zoom}
      displayPxPerUnit={zoom === 8 ? 4 : 2}
      land="full"
      plants={false}
      flowers={false}
      tree={false}
      island={{ status: t.state as never }}
      grain={{ mode: 'normal' as const }}
      {...(terrain ? { terrain: true } : {})}
    />
  );
}

function Row({ terrains, zoom, terrain }: { terrains: readonly Terrain[]; zoom: number; terrain: boolean }) {
  return (
    <div className="row">
      {terrains.map((t) => (
        <TerrainPanel key={`${t.state}-${terrain}`} t={t} zoom={zoom} terrain={terrain} />
      ))}
    </div>
  );
}

/** The vocabulary as a table, with PROVENANCE shown — the owner's three and this increment's
 *  three, so the thing he is being asked to accept is visibly separated from the thing he
 *  already said. */
function VocabularyTable() {
  const base = grainFeaturePeriod();
  return (
    <table className="sep">
      <thead>
        <tr>
          <th>state</th>
          <th>terrain</th>
          <th>what it is</th>
          <th>colour</th>
          <th>feature (along × across)</th>
          <th>whose name</th>
        </tr>
      </thead>
      <tbody>
        {TERRAINS.map((t) => {
          const f = terrainFeature(t, base);
          const sep = separationOf(t.token);
          return (
            <tr key={t.state}>
              <td>{t.state}</td>
              <td>
                <strong>{t.name}</strong>
              </td>
              <td>{t.character}</td>
              <td>
                <span className="swatch" style={{ background: t.token }} /> <code>{t.token}</code>
                <span style={{ color: '#8fa0aa' }}> ({sep.nearest} {sep.distance.toFixed(2)})</span>
              </td>
              <td>
                {f.along.toFixed(1)} × {f.across.toFixed(1)}
              </td>
              <td className={t.provenance === 'owner' ? 'ok' : 'ref'}>
                {t.provenance === 'owner' ? 'the owner named it' : 'proposed here — your call'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function App() {
  return (
    <main>
      <header>
        <h1>The states as terrains</h1>
        <p>
          A capability&rsquo;s state is carried by a <strong>named terrain</strong> &mdash; a
          place, not a tint. Colour stays one channel of the signal; it stops being the only
          one. Six states, six terrains, and the colour vocabulary settled yesterday gives two
          of them <em>the same yellow</em>.
        </p>
        <p>
          <strong>Which is why the first row below is the one that matters.</strong>{' '}
          <code>proposed</code> and <code>building</code> wear the identical token. In the
          BEFORE pair they are not merely similar &mdash; they are the same picture. Anything
          that separates them in the AFTER pair is the terrain, because there is nothing else
          left for it to be.
        </p>
        <VocabularyTable />
        <p className="numbers">
          bare land, no plants or flowers or tree &middot; the grain&rsquo;s NORMAL half only
          (palette CLOSED in every panel) &middot; identical fixture, relief, light and camera
          across every panel &middot; a terrain is a rotation and a squeeze of the grain&rsquo;s
          sample space &mdash; no second noise, no new texture, no new vertex attribute, no new
          dependency &middot; colour distances are matched-condition, in the
          quantiser&rsquo;s luma-weighted space
        </p>
      </header>

      <section data-st-panel="terrain-pair-before-8px">
        <h2>The pair colour cannot separate &mdash; BEFORE</h2>
        <p className="lede">
          <code>proposed</code> and <code>building</code> on the settled palette, with the
          isotropic grain and no terrain. Two states, one picture.
        </p>
        <Row terrains={PAIR} zoom={8} terrain={false} />
      </section>

      <section data-st-panel="terrain-pair-after-8px">
        <h2>The pair colour cannot separate &mdash; AFTER</h2>
        <p className="lede">
          The same two states wearing <strong>fallow</strong> (ploughed and set out, nothing
          grown in it yet) and <strong>wheatfield</strong> (the crop standing while the work is
          in flight). Same colour, same light, same island. Four times apart in feature scale.
        </p>
        <Row terrains={PAIR} zoom={8} terrain />
      </section>

      <section data-st-panel="terrain-pair-after-2px">
        <h2>The same pair at the overview</h2>
        <p className="lede">
          2&nbsp;px per ground unit &mdash; the delivered scale on a 2880&times;1920 display.
          The question this row asks is whether a terrain survives being small, which is where
          a treatment that only works zoomed in gets found out.
        </p>
        <Row terrains={PAIR} zoom={2} terrain />
      </section>

      <section data-st-panel="terrain-rest-after-8px">
        <h2>The other four states</h2>
        <p className="lede">
          <strong>forest</strong> and <strong>swamp</strong> are the owner&rsquo;s own names.{' '}
          <strong>heath</strong> and <strong>scree</strong> are proposed here and are his call.
        </p>
        <Row terrains={REST} zoom={8} terrain />
      </section>

      <section data-st-panel="terrain-rest-before-8px">
        <h2>The other four states, before</h2>
        <p className="lede">
          The same four with colour alone. These four are already separated by hue, so the
          terrain is an enrichment here rather than the carrier &mdash; which is the honest
          claim, and the reason the pair above leads the page.
        </p>
        <Row terrains={REST} zoom={8} terrain={false} />
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the contract every evidence page on this arc uses. Two rAFs, so it
  // is raised after the browser has composited the frame the panels drew rather than merely
  // after React returned.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__stExperimentSettled = true;
    });
  });
}
