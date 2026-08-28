// theme-measure.mjs — DOES EACH THEME STILL REPORT, ON DELIVERED PIXELS?
//
// THE QUESTION, from `themes-clear-the-separation-floor` on `adopt-the-land-into-the-shipped-map-arc`.
// ADR-0461 D3 permits themes and holds every one of them to the same separation floor. `land-theme.ts`
// answers the pure half — do the AUTHORED numbers keep two states apart. This answers the half that
// cannot be pure: do the PIXELS.
//
// ⚠⚠ IT IS NOT A SECOND OPINION ON THE PURE HALF, IT IS THE OTHER HALF. The pure check reads what was
// written down; `readTerrain` reads what a browser drew. Authored geometry being distinct is
// NECESSARY and NOT SUFFICIENT — a theme could differentiate two lands by a number that survives no
// rasteriser. This is where that gets found out.
//
// ⚠⚠ THE REFUSED THEMES ARE MEASURED TOO, AND THE RUN FAILS IF THEY LOOK FINE. `levelled-fields` is
// authored so two states share a colour AND a land; if its pair comes back SEPARATED on pixels, then
// either the theme did not reach the renderer or this instrument cannot tell two identical lands
// apart — and both of those are the instrument being broken, not the theme being good. That
// cross-check is the whole reason the bad themes are on the page.
//
// USAGE:
//   pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5242 --strictPort
//   DISPLAY=:0 ST_THEME_GPU=1 ST_THEME_URL=http://localhost:5242/theme.html \
//     pnpm --filter @storytree/forest-world-r3f measure-theme
//
// ⚠ PALETTE CLOSURE IS PER THEME. A theme's colours are foreign to `landPalette()` by construction,
// so auditing against the shipped palette would refuse every theme for being a theme. Each panel is
// closed over the ramp of the theme it was drawn with — which is the claim that actually matters: a
// theme may not deliver a colour ITS OWN vocabulary does not authorise.
//
// ⚠ THE GPU FLAGS ARE NOT INTERCHANGEABLE AND ONE OF THEM LIES. `--use-gl=egl` falls back to
// SwiftShader silently on this box, and so does omitting DISPLAY even headless. `ST_THEME_GPU=1`
// REFUSES a software context rather than reporting a plausible number as a GPU one.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { familylessTokens, paletteImageOfToken, toHex } from './palette-band.ts';
import { pairVerdict, readTerrain } from './terrain-separation.ts';
import { REFUSED_THEMES, THEMES, resolveTheme, themeSeparation, themeVerdictLine } from './land-theme.ts';
import { grainFeaturePeriod } from './land-grain.ts';
import { TERRAINS } from './terrain-vocabulary.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = process.env['ST_THEME_URL'] ?? 'http://localhost:5242/theme.html';
const OUT = process.env['ST_THEME_OUT'] ?? join(HERE, '..', '..', '..', '.theme-measure');
const WANT_GPU = process.env['ST_THEME_GPU'] === '1';
const GPU_ARGS = ['--use-gl=angle', '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'];
const BASE = grainFeaturePeriod();

let failures = 0;
function refuse(msg) {
  console.error(`\nREFUSED: ${msg}`);
  failures++;
}

// ⚠ `vite.config.ts` pins strictPort 5184 for EVERY worktree — the default port may be a sibling
// worktree's server, and a wrong-tree measurement produces a NUMBER rather than a missing file.
if (/:5184\b/.test(URL) && !process.env['ST_THEME_ALLOW_DEFAULT_PORT']) {
  console.error(`REFUSED: ${URL} is the harness's shared default port. Start vite on a free one.`);
  process.exit(2);
}

/** Every colour a theme's own ramp may deliver — the closure of (its tokens x the ladder), plus the
 *  family-less tokens no theme owns (the shared overrides and markers). */
function themePalette(theme) {
  const resolved = resolveTheme(theme);
  const tokens = new Set(familylessTokens());
  for (const fam of resolved.tokens.values()) for (const t of [...fam.top, fam.wheat, fam.side]) tokens.add(t);
  const out = new Set();
  for (const t of tokens) for (const c of paletteImageOfToken(t)) out.add(toHex(c));
  return out;
}

const ALL = [
  ...THEMES.map((t) => ({ theme: t, offered: true })),
  ...REFUSED_THEMES.map((t) => ({ theme: t, offered: false })),
];

const browser = await chromium.launch(WANT_GPU ? { args: GPU_ARGS } : {});
const page = await browser.newPage({ viewport: { width: 2400, height: 1700 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });

// PROVE THE TREE before trusting a number. A page that served but is not this branch's theme page
// would still render islands and still produce plausible figures.
const title = await page.evaluate(() => document.title);
if (!/themes and the separation floor/.test(title)) {
  console.error(`REFUSED: ${URL} served "${title}" — that is not this branch's theme page.`);
  await browser.close();
  process.exit(2);
}

await page.waitForFunction(() => window.__stExperimentSettled === true, null, { timeout: 300_000 });

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return { renderer: '(no webgl2)', vendor: '' };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)',
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)',
  };
});
if (WANT_GPU && /swiftshader|llvmpipe|software/i.test(renderer.renderer)) {
  console.error(`REFUSED: ST_THEME_GPU=1 asked for hardware and got ${renderer.renderer}.`);
  await browser.close();
  process.exit(2);
}
console.log(`renderer: ${renderer.renderer}`);
console.log(`vendor:   ${renderer.vendor}\n`);

const tags = await page.evaluate(() =>
  [...document.querySelectorAll('canvas[data-st-tag]')].map((c) => c.getAttribute('data-st-tag')),
);
if (tags.length === 0) {
  console.error('REFUSED: the page published no tagged canvases — nothing to measure.');
  await browser.close();
  process.exit(2);
}
// ⚠ A DECLARED PANEL THAT NEVER ARRIVED IS A SHRINKING MEASUREMENT THAT STILL READS AS A PASS.
// The expected set is authored HERE, upstream of the page, rather than read off the page's own
// canvases — an expectation the subject supplies vanishes with the subject.
const expected = [];
for (const { theme } of ALL) for (const t of TERRAINS) for (const z of [8, 2]) expected.push(`theme-${theme.id}-${t.state}-${z}px`);
const missing = expected.filter((t) => !tags.includes(t));
if (missing.length) {
  console.error(`REFUSED: ${missing.length} declared panel(s) never rendered: ${missing.slice(0, 4).join(', ')}`);
  await browser.close();
  process.exit(2);
}
console.log(`${tags.length} tagged canvases, all ${expected.length} declared panels present\n`);

mkdirSync(OUT, { recursive: true });
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

const panels = new Map();
for (const tag of tags) {
  const shot = await page.evaluate((t) => {
    const c = document.querySelector(`canvas[data-st-tag="${t}"]`);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: d.width, h: d.height, data: [...d.data], png: c.toDataURL('image/png') };
  }, tag);
  if (!shot) {
    refuse(`canvas ${tag} yielded no pixels`);
    continue;
  }
  const data = Uint8Array.from(shot.data);
  const reading = readTerrain(data, shot.w, shot.h);
  if (!reading) {
    refuse(`canvas ${tag} is ${shot.w}x${shot.h} and carries too little opaque land to measure`);
    continue;
  }
  panels.set(tag, { ...reading, w: shot.w, h: shot.h, data, png: shot.png });
  writeFileSync(join(OUT, `${tag}.png`), Buffer.from(shot.png.split(',')[1], 'base64'));
}
if (consoleErrors.length) refuse(`the page logged ${consoleErrors.length} error(s): ${consoleErrors[0]}`);

// ── palette closure, per theme ───────────────────────────────────────────────────────────────
console.log('PALETTE CLOSURE — each theme against ITS OWN ramp');
for (const { theme } of ALL) {
  const allowed = themePalette(theme);
  let off = 0;
  const offenders = new Map();
  let opaque = 0;
  for (const t of TERRAINS) {
    for (const z of [8, 2]) {
      const p = panels.get(`theme-${theme.id}-${t.state}-${z}px`);
      if (!p) continue;
      for (let i = 0; i < p.w * p.h; i++) {
        if (p.data[i * 4 + 3] < 128) continue;
        opaque++;
        const h = hex(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]);
        if (!allowed.has(h)) {
          off++;
          offenders.set(h, (offenders.get(h) ?? 0) + 1);
        }
      }
    }
  }
  if (off > 0) {
    const worst = [...offenders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    refuse(`${theme.id}: ${off} px outside its own ramp (worst: ${worst.map(([h, n]) => `${h} x${n}`).join(', ')})`);
  } else {
    console.log(`  ${theme.id.padEnd(16)} CLOSED — ${opaque.toLocaleString()} opaque px, every one an entry of its own ramp`);
  }
}

// ── the verdicts ─────────────────────────────────────────────────────────────────────────────
const results = [];
for (const { theme, offered } of ALL) {
  const pure = themeSeparation(theme, BASE);
  const resolved = resolveTheme(theme);
  console.log(`\n${'─'.repeat(96)}\n${theme.id.toUpperCase()}  (${offered ? 'offered' : 'AUTHORED TO BE REFUSED'})`);
  console.log(`  pure:  ${themeVerdictLine(pure)}`);

  // The colour-blind pair, at both zooms. ⚠ THE PREMISE FIRST: these two states really do share a
  // token under this theme, so colour has nothing to say and everything below is the land.
  const blind = [];
  for (let i = 0; i < resolved.terrains.length; i++) {
    for (let j = i + 1; j < resolved.terrains.length; j++) {
      const a = resolved.terrains[i];
      const b = resolved.terrains[j];
      if (a.token === b.token) blind.push([a, b]);
    }
  }
  if (blind.length === 0) {
    refuse(`${theme.id}: no colour-blind pair on the page — the pixel verdict would be vacuous`);
    continue;
  }
  const themeRows = [];
  for (const [a, b] of blind) {
    for (const z of [8, 2]) {
      const pa = panels.get(`theme-${theme.id}-${a.state}-${z}px`);
      const pb = panels.get(`theme-${theme.id}-${b.state}-${z}px`);
      if (!pa || !pb) {
        refuse(`${theme.id}: panels for ${a.state}/${b.state} at ${z}px are missing`);
        continue;
      }
      const v = pairVerdict(pa, pb);
      themeRows.push({ pair: `${a.name}/${b.name}`, zoom: z, ...v });
      console.log(
        `  ${a.name}/${b.name} @${z}px — same token ${a.token} · direction ${v.between.toFixed(4)}/${v.bar.toFixed(4)} · ` +
          `scale ${v.betweenFineness.toFixed(3)}/${v.barFineness.toFixed(3)} → ` +
          `${v.separated ? `SEPARATED, ${v.margin.toFixed(1)}x its bar` : 'NOT SEPARATED'}`,
      );
    }
  }
  // ⚠ THE CROSS-CHECK, AND IT CUTS BOTH WAYS.
  const at8 = themeRows.filter((r) => r.zoom === 8);
  const allSep8 = at8.length > 0 && at8.every((r) => r.separated);
  if (offered) {
    if (!allSep8) {
      refuse(
        `${theme.id} is OFFERED and its colour-blind pair is not distinguishable as land at 8 px. ` +
          'Two states are indistinguishable on the map, which is the one thing the vocabulary exists to prevent.',
      );
    }
  } else if (pure.geometry.pass === false) {
    // The theme was refused BY THE LAND HALF. The pixels must agree, or the pure half is asserting
    // something the renderer does not do.
    if (allSep8) {
      refuse(
        `${theme.id} was refused for collapsing two LANDS, yet the delivered pixels come back ` +
          'SEPARATED. Either the theme never reached the renderer or this instrument cannot tell two ' +
          'identical lands apart — either way the run does not support a claim.',
      );
    } else {
      console.log('  ✓ the pixels AGREE with the refusal — two states, one colour, one land, nothing left.');
    }
  } else {
    // Refused by the COLOUR half; its land is untouched, so the pixels must still separate it.
    if (!allSep8) {
      refuse(`${theme.id} was refused on COLOUR only, so its land must still separate — it does not.`);
    } else {
      console.log('  ✓ its land is untouched and still separates — the refusal really is about colour.');
    }
  }
  results.push({
    theme: theme.id,
    offered,
    pure: { pass: pure.pass, colour: pure.colour.pass, geometry: pure.geometry.pass, line: themeVerdictLine(pure) },
    pairs: themeRows,
  });
}

// ── ⚠ THE THEMES REALLY ARE DIFFERENT PICTURES ───────────────────────────────────────────────
// NON-VACUITY over the whole page. Three OFFERED themes that rendered the same pixels would pass
// every check above and would say nothing whatever about theming.
//
// ⚠⚠ IT ASKS THE OFFERED THEMES ONLY, AND THE FIRST RUN OF THIS DRIVER PROVED WHY. Asking it of
// ALL five refused the run five times over, correctly: `levelled-fields` IS high summer's palette
// with one land changed, so five of its six states are byte-identical to high summer BY
// CONSTRUCTION. That is the fixture doing its job — it isolates the LAND half by holding colour
// fixed — and a distinctness rule applied to it was the instrument misreading the fixture rather
// than the fixture being wrong. The right question of a refusal fixture is the one below it.
console.log(`\n${'─'.repeat(96)}\nDO THE OFFERED THEMES ACTUALLY LOOK DIFFERENT?`);
const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
for (const t of TERRAINS) {
  const seen = [];
  for (const { theme } of ALL.filter((x) => x.offered)) {
    const p = panels.get(`theme-${theme.id}-${t.state}-8px`);
    if (!p) continue;
    const twin = seen.find((s) => bytesEqual(s.p.data, p.data));
    if (twin) refuse(`${theme.id} and ${twin.id} draw ${t.state} BYTE-IDENTICALLY — one of them is not a theme`);
    seen.push({ id: theme.id, p });
  }
  console.log(`  ${t.state.padEnd(11)} ${seen.length} offered themes, all distinct pictures`);
}

// ── ⚠⚠ THE LAND-COLLAPSE FIXTURE CHANGES EXACTLY WHAT IT SAYS IT CHANGES ─────────────────────
// `levelled-fields` differs from `high-summer` in ONE authored field: `fallow`'s land. If it
// differed anywhere else, its refusal could be coming from something other than the collapse it
// names — and if it differed NOWHERE, the theme never reached the renderer and the whole page is
// one picture drawn five times. Both failures are silent; this is what makes them loud.
console.log('\nTHE LAND-COLLAPSE FIXTURE — it must differ from its own base in ONE state and no other');
const changed = [];
const same = [];
for (const t of TERRAINS) {
  const a = panels.get(`theme-high-summer-${t.state}-8px`);
  const b = panels.get(`theme-levelled-fields-${t.state}-8px`);
  if (!a || !b) continue;
  (bytesEqual(a.data, b.data) ? same : changed).push(t.state);
}
console.log(`  differs in: ${changed.join(', ') || '(nothing)'} · identical in: ${same.join(', ') || '(nothing)'}`);
if (changed.length !== 1 || changed[0] !== 'proposed') {
  refuse(
    `levelled-fields should differ from high-summer in 'proposed' ALONE; it differs in ` +
      `[${changed.join(', ')}]. Either the theme did not reach the renderer or it moved something it does not declare.`,
  );
} else {
  console.log('  ✓ exactly one state moved, and it is the one the fixture levels.');
}

writeFileSync(
  join(OUT, 'theme-measure.json'),
  `${JSON.stringify(
    {
      url: URL,
      renderer,
      base: BASE,
      results,
      panels: Object.fromEntries(
        [...panels].map(([k, p]) => [
          k,
          {
            w: p.w,
            h: p.h,
            signature: p.signature,
            anisotropy: p.anisotropy,
            fineness: p.fineness,
            withinSpread: p.withinSpread,
            withinFineness: p.withinFineness,
          },
        ]),
      ),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwrote ${OUT}`);

await browser.close();
if (failures > 0) {
  console.error(`\n${failures} REFUSAL(S) — this run does not support a claim.`);
  process.exit(1);
}
console.log('\nEVERY OFFERED THEME CLEARS THE FLOOR ON DELIVERED PIXELS, AND EVERY REFUSED ONE IS REFUSED BY THE PIXELS TOO.');
