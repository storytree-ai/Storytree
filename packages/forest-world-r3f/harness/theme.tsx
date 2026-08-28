// theme.tsx — THE SAME ISLAND UNDER EVERY THEME, WITH EACH THEME'S FLOOR READING BESIDE IT.
//
// THE DECISION THIS SHOWS. ADR-0461 D3: themes are permitted, and every theme is held to the SAME
// separation floor. A theme may move every hue on the map; it may not let one state read as
// another. This page is what that sentence looks like — three themes that are unmistakably
// different pictures and all still report correctly, and two more that do NOT, refused with the
// reason printed under them.
//
// ⚠⚠ THE ROWS THAT MATTER MOST ARE THE REFUSED ONES, AND THEY ARE ON THE PAGE ON PURPOSE. A floor
// that passes everything it is shown is indistinguishable from no floor, and the difference is not
// visible in a green run. `dusk-flats` and `levelled-fields` are authored to be refused, are never
// offered as themes, and are drawn here so the refusal is a picture rather than a number's word.
// Each breaks exactly ONE half of the floor — one the colour, one the land — because if they broke
// the same half, a floor that had silently lost the other would still refuse both and read healthy.
//
// ⚠ BARE LAND THROUGHOUT — no plants, no flowers, no tree, and the grain's NORMAL half only. The
// same holdout `terrain.tsx` makes and for the same reason: `heathConf()` varies vegetation per
// status, so a dressed island would show a difference that is partly the vegetation table and
// partly the theme, and nothing on the page could say which.
//
// ⚠ PALETTE CLOSURE IS PER THEME, NOT AGAINST `landPalette()`. A theme's colours are authored
// entries of ITS OWN ramp and are foreign to the shipped one by construction, so auditing them
// against the shipped palette would refuse every theme for being a theme. `theme-measure.mjs`
// closes each panel over the theme it was drawn with.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import { grainFeaturePeriod } from './land-grain.js';
import {
  REFUSED_THEMES,
  THEMES,
  resolveTheme,
  themeSeparation,
  type LandTheme,
} from './land-theme.js';
import { TERRAINS, terrainFeature } from './terrain-vocabulary.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

const BASE = grainFeaturePeriod();

/** The colour-blind pair leads every row: `proposed` and `building` wear one token under every
 *  theme (ADR-0462), so they are the two states a theme can destroy and colour cannot save. */
const ORDER = ['proposed', 'building', 'healthy', 'mapped', 'unhealthy', 'unknown'];
const STATES = [...TERRAINS].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));

function ThemeRow({ theme, zoom }: { theme: LandTheme; zoom: number }) {
  const resolved = resolveTheme(theme);
  return (
    <div className="row">
      {STATES.map((base) => {
        const t = resolved.terrainByState.get(base.state)!;
        const f = terrainFeature(t, BASE);
        return (
          <IslandPanel
            key={`${theme.id}-${base.state}-${zoom}`}
            label={`${t.state} — ${t.name}`}
            note={`${t.token} · ${f.along.toFixed(1)} × ${f.across.toFixed(1)} ground units`}
            tag={`theme-${theme.id}-${base.state}-${zoom}px`}
            pxPerUnit={zoom}
            displayPxPerUnit={zoom === 8 ? 4 : 2}
            land="full"
            plants={false}
            flowers={false}
            tree={false}
            island={{ status: base.state as never }}
            grain={{ mode: 'normal' as const }}
            terrain
            theme={theme}
          />
        );
      })}
    </div>
  );
}

/** The floor reading, printed beside the picture it is about — never in a log a reader of this
 *  page will not open. */
function FloorReading({ theme }: { theme: LandTheme }) {
  const v = themeSeparation(theme, BASE);
  const tightestLand = v.geometry.pairs[0]!;
  return (
    <table className="sep">
      <tbody>
        <tr>
          <td>verdict</td>
          <td className={v.pass ? 'ok' : 'bad'}>
            <strong>{v.pass ? 'CLEARS THE FLOOR' : 'REFUSED'}</strong>
          </td>
        </tr>
        <tr>
          <td>colour — tightest pair</td>
          <td className={v.colour.pass ? 'ok' : 'bad'}>
            {v.colour.tightest.pair} at {v.colour.tightest.distance.toFixed(2)} against a same-run
            bar of {v.colour.tightest.bar.toFixed(2)} ({v.colour.tightest.ratio.toFixed(2)}×)
          </td>
        </tr>
        <tr>
          <td>colour — pixels reading as another colour</td>
          <td className={v.colour.foreignReads.length === 0 ? 'ok' : 'bad'}>
            {v.colour.foreignReads.length === 0 ? 'none' : v.colour.foreignReads.join(', ')}
          </td>
        </tr>
        <tr>
          <td>land — the pair colour cannot help with</td>
          <td className={v.geometry.pass ? 'ok' : 'bad'}>
            {tightestLand.pair} at {tightestLand.distance.carried.toFixed(2)} octaves against{' '}
            {v.geometry.bar.toFixed(2)} read off <code>{v.geometry.barFrom}</code> in the shipped
            land ({tightestLand.ratio.toFixed(2)}×)
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ThemeSection({ theme, refused }: { theme: LandTheme; refused: boolean }) {
  return (
    <section data-st-panel={`theme-${theme.id}`}>
      <h2 className={refused ? 'bad' : undefined}>
        {theme.title}
        {refused ? ' — this one must NOT ship' : ''}
      </h2>
      <p className="lede">{theme.character}</p>
      <FloorReading theme={theme} />
      <ThemeRow theme={theme} zoom={8} />
      <p className="numbers">the same six states at the overview — 2 px per ground unit</p>
      <ThemeRow theme={theme} zoom={2} />
    </section>
  );
}

function App() {
  return (
    <main>
      <header>
        <h1>Themes, and the floor none of them may cross</h1>
        <p>
          A <strong>theme</strong> is a set of substitutions keyed on the six land names &mdash;{' '}
          <code>forest</code>, <code>heath</code>, <code>fallow</code>, <code>wheatfield</code>,{' '}
          <code>swamp</code>, <code>scree</code>, all six of them settled. A theme may move every
          hue on the map, and may move the land itself. What it may <em>not</em> do is let one
          state read as another &mdash; and that is a rule about the <em>distance between</em> two
          things rather than about any particular colour, which is exactly why it survives theming
          where a fixed palette could not.
        </p>
        <p>
          <strong>Every row below is the same island, the same relief, the same light and the same
          camera.</strong> The only thing that changes is the theme. Each theme&rsquo;s reading
          against the floor is printed above its pictures, so &ldquo;does it still report
          correctly&rdquo; is answered next to &ldquo;does it look different&rdquo;.
        </p>
        <p className="numbers">
          bare land, no plants or flowers or tree &middot; the grain&rsquo;s NORMAL half only
          &middot; the colour bar is one lighting step on the two families being compared, measured
          in the same call &middot; the land bar is the shipped vocabulary&rsquo;s own weakest link
          between any two of its lands, computed in the same run &middot; neither is a number
          anybody chose
        </p>
      </header>

      {THEMES.map((t) => (
        <ThemeSection key={t.id} theme={t} refused={false} />
      ))}

      <section>
        <h2 className="bad">The two that are refused</h2>
        <p className="lede">
          These are authored to fail and are never offered. They are here because a floor that
          passes everything it is shown is indistinguishable from no floor at all, and that
          difference is invisible in a green run. Each breaks exactly one half: the first collapses
          two <em>colours</em> until the light can slide one onto the other, and its land is
          untouched; the second keeps a palette that clears the floor and gives the ploughed field
          the standing crop&rsquo;s own land, so two states that already share a colour now share
          everything.
        </p>
      </section>

      {REFUSED_THEMES.map((t) => (
        <ThemeSection key={t.id} theme={t} refused />
      ))}
    </main>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
  // The SETTLED SIGNAL, on the contract every evidence page on this arc uses. Two rAFs, so it is
  // raised after the browser has composited the frame the panels drew rather than merely after
  // React returned.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__stExperimentSettled = true;
    });
  });
}
