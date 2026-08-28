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
  COLD_SEASON_THEME,
  HIGH_SUMMER_THEME,
  REFUSED_THEMES,
  SHIPPED_THEME,
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

/** The two refusal fixtures, looked up by id rather than by index. ⚠ A missing one throws at module
 *  load — the page refuses to render rather than quietly dropping the row that proves the floor can
 *  say no, which is the row a reader most needs. */
function refusedById(id: string): LandTheme {
  const t = REFUSED_THEMES.find((x) => x.id === id);
  if (t === undefined) throw new Error(`theme.tsx: no refusal fixture '${id}' — the page cannot show the floor refusing`);
  return t;
}
const DUSK_FLATS = refusedById('dusk-flats');
const LEVELLED_FIELDS = refusedById('levelled-fields');

/**
 * ⚠⚠ EVERY THEME THE MODULE OFFERS MUST BE ON THIS PAGE, and this is what says so.
 *
 * The sections below are authored by hand rather than mapped, so a theme added to `THEMES` would
 * simply not appear — and the page would still render, still measure, and still report a clean
 * pass over the themes it happened to draw. That is a SHRINKING evidence set that reads as a
 * growing one, which is the same fault class the section-id guard exists for. Refusing at
 * module load makes it loud: the page does not render at all.
 */
const ON_THE_PAGE: readonly LandTheme[] = [
  SHIPPED_THEME,
  HIGH_SUMMER_THEME,
  COLD_SEASON_THEME,
  DUSK_FLATS,
  LEVELLED_FIELDS,
];
const unshown = [...THEMES, ...REFUSED_THEMES].filter((t) => !ON_THE_PAGE.includes(t));
if (unshown.length > 0) {
  throw new Error(
    `theme.tsx: ${unshown.map((t) => t.id).join(', ')} exist but are not on this page. Author a ` +
      'section for each, or the evidence silently covers fewer themes than the module offers.',
  );
}

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

/** One theme's heading, floor reading and both zoom rows.
 *
 * ⚠ IT DOES NOT OWN ITS SECTION ELEMENT, AND THAT IS DELIBERATE. `capture-panels.test.ts` scans
 * this file's SOURCE for a literal `data-st-panel="..."` on every section opening tag, because a
 * source scan is the only thing that catches a section somebody forgot to label — an id built from
 * a prop is invisible to it and would be skipped rather than checked, which is the fault class
 * that guard exists for. So each section is authored by hand below, one per theme.
 *
 * ⚠ AND DO NOT WRITE A LITERAL SECTION TAG IN A COMMENT IN THIS FILE. The guard's scan is a
 * regex over the source, so a tag inside prose is counted as a real one and reported as
 * unlabelled — a check tripping on its own rationale, which cost a gate run here.
 */
function ThemeBody({ theme, refused }: { theme: LandTheme; refused: boolean }) {
  return (
    <>
      <h2 className={refused ? 'bad' : undefined}>
        {theme.title}
        {refused ? ' — this one must NOT ship' : ''}
      </h2>
      <p className="lede">{theme.character}</p>
      <FloorReading theme={theme} />
      <ThemeRow theme={theme} zoom={8} />
      <p className="numbers">the same six states at the overview — 2 px per ground unit</p>
      <ThemeRow theme={theme} zoom={2} />
    </>
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

      <section data-st-panel="theme-shipped">
        <ThemeBody theme={SHIPPED_THEME} refused={false} />
      </section>

      <section data-st-panel="theme-high-summer">
        <ThemeBody theme={HIGH_SUMMER_THEME} refused={false} />
      </section>

      <section data-st-panel="theme-cold-season">
        <ThemeBody theme={COLD_SEASON_THEME} refused={false} />
      </section>

      <section data-st-panel="theme-refusals-lede">
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

      <section data-st-panel="theme-dusk-flats">
        <ThemeBody theme={DUSK_FLATS} refused />
      </section>

      <section data-st-panel="theme-levelled-fields">
        <ThemeBody theme={LEVELLED_FIELDS} refused />
      </section>
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
