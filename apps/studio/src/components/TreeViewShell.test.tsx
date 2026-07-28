// @vitest-environment jsdom
//
// Red-green of the desktop-layout owner feedback (2026-07-13, item B — routed out of the library
// arc to the forest/app-shell surface): the forest map at #/tree is FULL-BLEED — no `pad` padding
// ring around the world — and carries NO session counter above the map (the
// "N active sessions (+M aged)" toolbar was owner-cited clutter). Self-reported session presence
// has since retired outright (ADR-0200 D7 — the claim ledger is the one coordination signal), so
// the counter now has no data source either; this stays as the regression lock that no toolbar
// counter grows back over the map. The claims-only SessionDock stays, reachable through a story
// panel's claim rows. The visual result (the map actually filling the window edge-to-edge) is the
// owner-attested look leg (ADR-0070 stage 2).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataContext, type AppData } from '../lib/appData';
import { api } from '../api';
import { TreeView } from './TreeView';
import { SemanticGrowthDemo } from './SemanticGrowthDemo.js';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

vi.mock('../api', () => ({
  api: {
    tree: vi.fn(async () => ({
      stories: [
        {
          id: 'studio',
          title: 'Studio',
          outcome: 'the studio serves',
          status: 'healthy',
          proofMode: 'UAT',
          uatWitness: 'machine',
          dependsOn: [],
          consumedBy: [],
          capabilities: [],
        },
      ],
    })),
    activity: vi.fn(async () => ({ builds: null, claims: null })),
  },
}));

afterEach(cleanup);

const appData: AppData = {
  docs: [],
  docIds: new Set(),
  docTitles: new Map(),
  assets: [],
  assetsStatus: 'ready',
  assetsError: '',
  me: { email: 'owner@example.com', role: 'admin', status: 'active', member: true },
  refreshAssets: async () => {},
};

async function renderTree(): Promise<HTMLElement> {
  const { container } = render(
    <AppDataContext.Provider value={appData}>
      <TreeView focus={null} />
    </AppDataContext.Provider>,
  );
  // Flush the one-shot /api/tree load so the world has landed before asserting.
  await act(async () => {});
  expect(api.tree).toHaveBeenCalled();
  return container;
}

describe('TreeView shell — full-bleed map, no session counter (owner feedback 2026-07-13)', () => {
  it('asa-treeview-mounts-one-shared-world-view', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'TreeView.tsx'),
      'utf8',
    );

    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bWorldSceneView\b[\s\S]*?\}\s*from '@storytree\/app-surface'/,
    );
    expect(source).toMatch(/<WorldSceneView\b/);
    expect(source).not.toMatch(
      /import\s*\{[\s\S]*?\bSceneView\b[\s\S]*?\}\s*from '\.\/SceneView\.js'/,
    );
  });

  it('full-bleed-map: the tree wrap carries no `pad` padding ring around the world', async () => {
    const container = await renderTree();
    const wrap = container.querySelector('.tree-wrap');
    expect(wrap).toBeTruthy();
    expect(wrap!.classList.contains('pad')).toBe(false);
  });

  it('no-session-counter: active sessions render NO toolbar counter above the map', async () => {
    const container = await renderTree();
    expect(container.querySelector('.tree-toolbar')).toBeNull();
    expect(container.textContent).not.toMatch(/active session/i);
    expect(container.textContent).not.toMatch(/aged session/i);
  });
});

// ---------------------------------------------------------------------------------------------
// Shared CSS-choreography parsing (D/E below) — reads the shared, read-only app-surface stylesheet
// (packages/app-surface/src/semantic-growth.css) as dependency evidence, never edited from here and
// never widening this Studio gate's write scope. Ported verbatim from the equivalent audit already
// proven in packages/app-surface/src/SemanticGrowthWorldView.test.tsx (its own package-level proof),
// so Studio's INTEGRATION with that vocabulary is pinned independently at this seam too.
// ---------------------------------------------------------------------------------------------

const APP_SURFACE_SRC = resolve(process.cwd(), '..', '..', 'packages', 'app-surface', 'src');

function stripKeyframeBlocks(source: string): string {
  return source.replace(/@keyframes\s+[\w-]+\s*\{[\s\S]*?\n\}\n*/g, '');
}

function splitDecls(body: string): string[] {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

function endsWithSelectorSuffix(selector: string, suffix: string): boolean {
  if (selector === suffix) return true;
  if (!selector.endsWith(suffix)) return false;
  const before = selector[selector.length - suffix.length - 1];
  return before === undefined || before === ' ' || before === '>' || before === '~' || before === '+';
}

function findRules(nonKeyframeCss: string, suffix: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of nonKeyframeCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorList = (m[1] ?? '').split(',').map((s) => s.trim());
    const body = m[2] ?? '';
    for (const selector of selectorList) {
      if (endsWithSelectorSuffix(selector, suffix)) out.push({ selector, body });
    }
  }
  return out;
}

const TIMING_KEYWORDS = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
const FILL_KEYWORDS = new Set(['none', 'forwards', 'backwards', 'both']);
const DIRECTION_KEYWORDS = new Set(['normal', 'reverse', 'alternate', 'alternate-reverse']);
const PLAYSTATE_KEYWORDS = new Set(['running', 'paused']);

function tokenizeShorthand(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ' ' && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

interface AnimationParts {
  name?: string;
  duration?: string;
  easing?: string;
  delay?: string;
  iteration?: string;
  fill?: string;
}

function parseAnimationShorthand(value: string): AnimationParts {
  const tokens = tokenizeShorthand(value.trim());
  const out: AnimationParts = {};
  let sawDuration = false;
  for (const tok of tokens) {
    if (/^-?\d*\.?\d+m?s$/i.test(tok)) {
      if (!sawDuration) {
        out.duration = tok;
        sawDuration = true;
      } else {
        out.delay = tok;
      }
      continue;
    }
    if (tok === 'infinite') {
      out.iteration = 'infinite';
      continue;
    }
    if (/^\d+(\.\d+)?$/.test(tok)) {
      out.iteration = tok;
      continue;
    }
    if (TIMING_KEYWORDS.has(tok) || tok.startsWith('cubic-bezier(') || tok.startsWith('steps(')) {
      out.easing = tok;
      continue;
    }
    if (FILL_KEYWORDS.has(tok)) {
      out.fill = tok;
      continue;
    }
    if (DIRECTION_KEYWORDS.has(tok) || PLAYSTATE_KEYWORDS.has(tok)) continue;
    out.name = tok;
  }
  return out;
}

function toMs(value: string | undefined): number {
  if (value === undefined) return 0;
  const m = /^(-?\d*\.?\d+)(m?s)$/i.exec(value.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return (m[2] ?? 'ms').toLowerCase() === 's' ? n * 1000 : n;
}

interface ResolvedAnimation {
  name: string;
  durationMs: number;
  easing: string | undefined;
  delayMs: number;
  iteration: number | 'infinite';
  fill: string;
}

function resolvedAnimation(nonKeyframeCss: string, suffix: string): ResolvedAnimation | null {
  const rules = findRules(nonKeyframeCss, suffix);
  if (rules.length === 0) return null;
  let shorthand: AnimationParts = {};
  const longhand: AnimationParts = {};
  for (const rule of rules) {
    for (const decl of splitDecls(rule.body)) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (prop === 'animation') shorthand = { ...shorthand, ...parseAnimationShorthand(value) };
      else if (prop === 'animation-name') longhand.name = value;
      else if (prop === 'animation-duration') longhand.duration = value;
      else if (prop === 'animation-timing-function') longhand.easing = value;
      else if (prop === 'animation-delay') longhand.delay = value;
      else if (prop === 'animation-iteration-count') longhand.iteration = value;
      else if (prop === 'animation-fill-mode') longhand.fill = value;
    }
  }
  const merged: AnimationParts = { ...shorthand, ...longhand };
  if (!merged.name) return null;
  return {
    name: merged.name,
    durationMs: toMs(merged.duration),
    easing: merged.easing,
    delayMs: toMs(merged.delay),
    iteration:
      merged.iteration === undefined ? 1 : merged.iteration === 'infinite' ? 'infinite' : Number(merged.iteration),
    fill: merged.fill ?? 'none',
  };
}

function keyframeCanonical(fullCss: string, name: string): Map<number, string> | null {
  const re = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = fullCss.match(re);
  if (!m) return null;
  const body = (m[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const canonical = new Map<number, string>();
  for (const stop of body.matchAll(/([\w%.,\s]+?)\s*\{([^}]*)\}/g)) {
    const offsets = (stop[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .map((s) => (s === 'from' ? 0 : s === 'to' ? 100 : Number.parseFloat(s)));
    const decls = splitDecls(stop[2] ?? '')
      .map((d) => {
        const i = d.indexOf(':');
        return `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()}`;
      })
      .sort();
    const declString = decls.join(';');
    for (const off of offsets) canonical.set(off, declString);
  }
  return canonical;
}

function canonicalKeyframeString(map: Map<number, string> | null): string {
  if (!map) return '';
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([off, decl]) => `${off}%{${decl}}`)
    .join('|');
}

function keyframePropertySet(map: Map<number, string> | null): Set<string> {
  const props = new Set<string>();
  if (!map) return props;
  for (const decl of map.values()) {
    for (const pair of decl.split(';')) {
      if (!pair) continue;
      const i = pair.indexOf(':');
      if (i > 0) props.add(pair.slice(0, i));
    }
  }
  return props;
}

interface FullProfile extends ResolvedAnimation {
  keyframe: Map<number, string> | null;
}

function resolvedProfile(fullCss: string, nonKeyframeCss: string, suffix: string): FullProfile | null {
  const anim = resolvedAnimation(nonKeyframeCss, suffix);
  if (!anim) return null;
  return { ...anim, keyframe: keyframeCanonical(fullCss, anim.name) };
}

// semantic-growth-studio-demo (stories/app-surface/semantic-growth-studio-demo.md): an explicit
// `?semanticGrowth=demo` query flag mounts the public `SemanticGrowthWorldView` over one static,
// representative six-frame fixture; absent/empty/unknown values leave the clean Studio route byte-
// for-byte unchanged. `SemanticGrowthWorldView` stamps its current frame as
// `data-semantic-growth-frame` on its host <section> and exposes a `nav[aria-label="Semantic growth
// controls"]` with Back/Next/Replay buttons (packages/app-surface/src/SemanticGrowthWorldView.tsx) —
// this regression locks TreeView's wiring to that public contract without importing it, so a red here
// can only be TreeView ignoring the flag (today's actual behaviour), never a missing symbol.
describe('semantic-growth studio demo (`?semanticGrowth=demo`) — asa: sgsd-clean-studio-never-mounts-the-demo, sgsd-flag-mounts-one-public-six-frame-player', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('the clean route (and any unknown value) never mounts the demo; only the exact flag mounts one public six-frame player, steppable via its own Next control', async () => {
    // 1) Clean Studio (no `semanticGrowth` key at all): no semantic-growth fixture, no demo controls.
    const clean = await renderTree();
    expect(clean.querySelector('[data-semantic-growth-frame]')).toBeNull();
    expect(clean.querySelector('nav[aria-label="Semantic growth controls"]')).toBeNull();
    cleanup();

    // 2) An unknown value follows the same clean path byte-for-byte — no demo mount.
    window.history.pushState({}, '', '/?semanticGrowth=off#/tree');
    const unknown = await renderTree();
    expect(unknown.querySelector('[data-semantic-growth-frame]')).toBeNull();
    expect(unknown.querySelector('nav[aria-label="Semantic growth controls"]')).toBeNull();
    cleanup();

    // 3) `?semanticGrowth=demo#/tree`: mounts exactly one public SemanticGrowthWorldView player,
    // starting on the first of its six ordered frames (`empty`).
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const frames = flagged.querySelectorAll('[data-semantic-growth-frame]');
    expect(frames.length).toBe(1);
    expect(frames[0]?.getAttribute('data-semantic-growth-frame')).toBe('empty');

    // 4) Its Next control (the public component's own button, never a Studio-authored copy) steps
    // the visible frame forward through the fixture's real ordering (empty -> land).
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();
    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('land');
  });

  // sgsd-fixture-is-static-and-semantically-honest (stories/app-surface/semantic-growth-studio-demo.md
  // machine contract 3): "signed-proof remains proposed/non-healthy while carrying the proof bloom;
  // healthy appears only last" / "no pre-final frame may appear healthy". The `signed-proof` frame is
  // the FIFTH of six (index 4), not the final one — its underlying story must still wear the SAME
  // non-healthy status as the `proposed`/`claimed` frames (it only gains the real signed-proof bloom on
  // top), and only the sixth, final `healthy` frame may render with the `st-healthy` territory class.
  it('signed-proof stays proposed/non-healthy while carrying the proof bloom; healthy appears only last', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();

    // Walk empty -> land -> proposed -> claimed -> signed-proof (four Next clicks).
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        nextButton!.click();
      });
    }
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('signed-proof');

    const signedProofTerritory = flagged.querySelector('.hex-territory');
    expect(signedProofTerritory).toBeTruthy();
    expect(signedProofTerritory!.classList.contains('st-healthy')).toBe(false);
    // The real signed-proof bloom is still carried on this pre-final frame.
    expect(flagged.querySelector('.world-bloom')).toBeTruthy();

    // The sixth and FINAL Next reaches `healthy` — the only frame allowed to appear healthy.
    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('healthy');
    const healthyTerritory = flagged.querySelector('.hex-territory');
    expect(healthyTerritory).toBeTruthy();
    expect(healthyTerritory!.classList.contains('st-healthy')).toBe(true);
  });

  // sgsd-fixture-is-static-and-semantically-honest (stories/app-surface/semantic-growth-studio-demo.md
  // machine contract 3): "land has no story marker" — the second frame is claimed ground with no
  // story yet (the guidance's exact sequence is "empty, then land with no story marker, then a pale
  // proposed/non-healthy story…"). A story identity only enters the walk at the THIRD frame
  // (`proposed`); `land` itself must render no nameplate/tree identity for the fixture's story id.
  it('sgsd-land-has-no-story-marker: the second (`land`) frame is claimed ground with no nameplate/tree story identity', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(nextButton).toBeTruthy();

    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('land');

    // No nameplate (`.world-plate`, the story id/status card) may render on the `land` frame — a
    // story marker only belongs from `proposed` onward.
    expect(flagged.querySelector('.world-plate')).toBeNull();
  });

  // sgsd-bounded-in-map-host (stories/app-surface/semantic-growth-studio-demo.md): "it may size
  // within the available forest frame but may not expand the page, clip/cover its navigation or
  // place Back/Next/Replay behind the SVG." The live map's `.world-frame` is only given its
  // fill-the-frame sizing (`.tree-layout > .world-frame { flex: 1 1 auto; min-height: 0; … }`,
  // index.css) when it sits INSIDE `.tree-layout` — a bare `.tree-wrap > .world-frame` (no
  // `.tree-layout` between them) never matches that selector and the frame collapses to its
  // unconstrained intrinsic (zero) height instead of bounding to the forest frame. The demo's host
  // must reuse the SAME wrapping chain, not a shortened one.
  it('sgsd-bounded-in-map-host: the demo host wraps `.world-frame` inside `.tree-layout`, the same chain the live map relies on to bound the frame instead of collapsing it', async () => {
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    expect(flagged.querySelector('.tree-layout > .world-frame')).toBeTruthy();
  });

  // sgsd-composed-through-real-studio-world-pipeline (stories/app-surface/semantic-growth-studio-demo.md):
  // the fixture must be COMPOSED through the SAME real Studio pipeline the live map uses —
  // deterministic representative story/capability data enters `buildWorld`, its real draw tiles
  // enter `buildRelaxedCells`, and `worldToScene` (carrying the same permanent vegetation input)
  // feeds `buildScene` — never a demo-only hand-authored `SceneInput`, coast path, or hand-filled
  // empty `relaxedCells`/`drawTiles`/`decor`/`plants`. This is the ONE fail-closed composition red
  // the node spec asks for: source imports/calls, source literals, AND rendered output are checked
  // TOGETHER — a parcel-only rendered check alone is not sufficient proof of real composition.
  it('sgsd-composed-through-real-studio-world-pipeline: the fixture is folded through buildWorld -> buildRelaxedCells -> worldToScene -> buildScene, never a demo-only hand-authored SceneInput/COAST/empty geometry', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'SemanticGrowthDemo.tsx'),
      'utf8',
    );

    // 1) The real composition boundary is actually IMPORTED from the studio's own pipeline (never a
    // demo-only re-derivation of it).
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bbuildWorld\b[\s\S]*?\}\s*from '\.\/TreeView\.js'/,
    );
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bbuildRelaxedCells\b[\s\S]*?\}\s*from '\.\/TreeView\.js'/,
    );
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bworldToScene\b[\s\S]*?\}\s*from '\.\/TreeView\.js'/,
    );
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bbuildScene\b[\s\S]*?\}\s*from '@storytree\/forest-world'/,
    );

    // 2) ...and actually CALLED — an unused import would still leave a demo-only geometry builder
    // in place.
    expect(source).toMatch(/\bbuildWorld\s*\(/);
    expect(source).toMatch(/\bbuildRelaxedCells\s*\(/);
    expect(source).toMatch(/\bworldToScene\s*\(/);
    expect(source).toMatch(/\bbuildScene\s*\(/);

    // 3) No demo-only hand-authored `SceneInput`, coast path, or hand-filled EMPTY geometry arrays
    // — exactly the demo-only geometry builder this node forbids maintaining.
    expect(source).not.toMatch(/\)\s*:\s*SceneInput\b/);
    expect(source).not.toMatch(/\bCOAST\s*=\s*\[/);
    expect(source).not.toMatch(/relaxedCells\s*:\s*\[\]/);
    expect(source).not.toMatch(/drawTiles\s*:\s*\[\]/);
    expect(source).not.toMatch(/decor\s*:\s*\[\]/);
    expect(source).not.toMatch(/plants\s*:\s*\[\]/);

    // 4) The RENDERED `proposed` frame reuses the real composed geometry — non-empty relaxed
    // substrate, MULTIPLE capability parcels, and parcel flora (the real permanent vegetation this
    // world composes) — never an empty demo shell.
    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Next',
    );
    expect(nextButton).toBeTruthy();
    // empty -> land -> proposed (two Next clicks).
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        nextButton!.click();
      });
    }
    const proposedFrame = flagged.querySelector('[data-semantic-growth-frame="proposed"]');
    expect(proposedFrame).toBeTruthy();

    const substrate = proposedFrame!.querySelectorAll('.relaxed-tile, .relaxed-cell');
    expect(substrate.length).toBeGreaterThan(0);

    const parcels = proposedFrame!.querySelectorAll('.parcel');
    expect(parcels.length).toBeGreaterThan(1);

    const parcelFlora = proposedFrame!.querySelectorAll('.parcel-flora');
    expect(parcelFlora.length).toBeGreaterThan(0);

    // 5) The public player receives a stable COMPOSED framing derived from this world's real
    // bounds — never the fallback/magic 100x100 viewBox a nothing-to-frame world falls back to.
    const svg = flagged.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('viewBox')).not.toBe('0 0 100 100');
  });

  // sgsd-primary-selection-reuses-drawn-route-lanes (semantic-growth-studio-demo): "its primary
  // selection reuses the existing drawn route lanes while the clean Studio route remains
  // unchanged." Once the primary story's own identity narrates (`proposed` onward), the fixture
  // must derive that frame's one-hop selection with the SAME real helpers the live map uses —
  // `neighbourHighlightPlan` + `laneLayout` (both from `@storytree/app-surface`) over the world's
  // real trail network — and hand the result through as `WorldPresentationModel.neighbours` /
  // `.lanes` / `.laneMotion`, never a demo-local path, segment renderer, or CSS animation. That
  // real route must therefore reach the shared `SceneView` as `litRouteLanes` and render its
  // existing `.trail-lane.is-drawing` treatment. A frame with no primary identity yet (`empty`,
  // `land`) must carry no invented lane at all.
  it('sgsd-primary-selection-reuses-drawn-route-lanes: the primary\'s real trail route reaches the shared renderer as a lit, drawing lane once its identity narrates, and no frame invents one', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'SemanticGrowthDemo.tsx'),
      'utf8',
    );

    // 1) The real one-hop neighbour plan + lane-layout helpers are actually imported from the
    // shared app-surface seam (never re-derived locally) and actually called — an unused import
    // would still leave the live route unreused.
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\bneighbourHighlightPlan\b[\s\S]*?\}\s*from '@storytree\/app-surface'/,
    );
    expect(source).toMatch(
      /import\s*\{[\s\S]*?\blaneLayout\b[\s\S]*?\}\s*from '@storytree\/app-surface'/,
    );
    expect(source).toMatch(/\bneighbourHighlightPlan\s*\(/);
    expect(source).toMatch(/\blaneLayout\s*\(/);
    // No demo-local lane rendering — that class name belongs to the shared renderer alone.
    expect(source).not.toMatch(/trail-lane/);

    window.history.pushState({}, '', '/?semanticGrowth=demo#/tree');
    const flagged = await renderTree();
    const nav = flagged.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(nav).toBeTruthy();
    const nextButton = Array.from(nav!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Next',
    );
    expect(nextButton).toBeTruthy();

    // `empty`: no primary identity at all -> no invented lane.
    expect(flagged.querySelector('.trail-lane')).toBeNull();

    // `land`: real claimed ground, still no primary identity -> still no invented lane.
    await act(async () => {
      nextButton!.click();
    });
    expect(
      flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
    ).toBe('land');
    expect(flagged.querySelector('.trail-lane')).toBeNull();

    // `proposed` onward: the primary's identity narrates, and its real drawn route reaches the
    // shared renderer as a lit, one-shot-drawing lane — sourced from the real trail network, never
    // invented, never a static ink lane.
    for (const key of ['proposed', 'claimed', 'signed-proof', 'healthy']) {
      await act(async () => {
        nextButton!.click();
      });
      expect(
        flagged.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame'),
      ).toBe(key);
      const litLane = flagged.querySelector('.trail-lane.is-drawing');
      expect(litLane, `lit drawing lane missing @ ${key}`).toBeTruthy();
    }
  });

  // H — sgsd-companion-witness-territory (semantic-growth-studio-demo): the fixture must ALSO compose
  // a second, FIXED "companion" territory through the SAME real Studio pipeline as the primary — its
  // real draw tiles enter `buildRelaxedCells` alongside the primary's, and ONLY the companion's OWNED
  // cells are ever filtered out of that real `relaxedCells` output afterward (never a hand-authored
  // geometry replacement) — exercising the renderer's existing NO-PARCEL `buildTerritoryFlora` path so
  // the companion's own real capability renders as procedural `story-tree` + capability `garden-flora`
  // (`SceneVegetationInput`'s only field is optional `heroTrees`; `VEGETATION = {}` supplies none, so
  // the tree stays procedural, never a garden hero). The companion is BYTE-STABLE witness context
  // across all six frames — it never narrates the health walk and never carries a claim or a
  // signed-proof bloom — while the PRIMARY story (and only the primary) carries the six-state
  // narrative: no ground/identity at `empty`, real ground with no identity at `land`, the pale
  // non-healthy identity from `proposed`, presence-without-proof at `claimed`, the non-healthy
  // signed-proof bloom at `signed-proof`, and healthy only last. Exactly the render/source case
  // `real-ms22cssp` omitted (adding it alone, with no D/E CSS audit, is equally invalid).
  it('sgsd-companion-witness-territory: a fixed companion territory survives every frame (real story-tree + garden-flora, never claim/proof) while only the primary narrates the six-state walk, over both Vector and a Storybook sprite sheet', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'components', 'SemanticGrowthDemo.tsx'),
      'utf8',
    );

    // Source guardrails: `stripKind` must still exist but now be SOURCE-LOCAL / id-scoped (an extra
    // parameter beyond `(node, kind)`) — a bare 2-arg `stripKind(x, 'territory')` call would strip
    // EVERY territory it finds, including the companion's own identity group, which the DOM proof
    // below forbids. The fixture must never hand the companion a hero-tree colourway (VEGETATION
    // stays the permanent-vocabulary presence flag `{}` — supplying `heroTrees` replaces the
    // procedural tree, it does not add garden flora), and the companion's owned relaxed cells must be
    // FILTERED from the real `buildRelaxedCells` output (an owner-keyed removal), never hand-filled.
    const stripKindSig = /function\s+stripKind\s*\(([^)]*)\)/.exec(source);
    expect(stripKindSig, 'the stripKind helper must still exist').toBeTruthy();
    const stripKindParamCount = (stripKindSig?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0).length;
    expect(stripKindParamCount, 'stripKind must be scoped by more than (node, kind)').toBeGreaterThanOrEqual(3);
    expect(source).not.toMatch(/stripKind\(\s*[^,()]+,\s*'territory'\s*\)/);
    expect(source).not.toMatch(/heroTrees\s*:/);
    expect(source).toMatch(/\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*[^;]*?\.owner\b/);

    type TerritorySnap = { id: string; status: string | null };
    const territoriesIn = (container: HTMLElement): TerritorySnap[] =>
      Array.from(container.querySelectorAll('.hex-territory[data-story-id]')).map((el) => ({
        id: el.getAttribute('data-story-id') ?? '',
        status: [...el.classList].find((c) => c.startsWith('st-')) ?? null,
      }));
    const frameKeyOf = (container: HTMLElement): string | null =>
      container.querySelector('[data-semantic-growth-frame]')?.getAttribute('data-semantic-growth-frame') ?? null;
    const navOf = (container: HTMLElement): { next: HTMLElement; back: HTMLElement; replay: HTMLElement } => {
      const nav = container.querySelector('nav[aria-label="Semantic growth controls"]');
      expect(nav).toBeTruthy();
      const byText = (t: string): HTMLElement => {
        const btn = Array.from(nav!.querySelectorAll('button')).find((b) => b.textContent === t);
        expect(btn, `"${t}" control missing`).toBeTruthy();
        return btn as HTMLElement;
      };
      return { next: byText('Next'), back: byText('Back'), replay: byText('Replay') };
    };

    async function walk(container: HTMLElement, identity: { tree: string; flora: string }): Promise<void> {
      const { next, back, replay } = navOf(container);
      let companionId: string | null = null;
      let companionStatus: string | null = null;

      const assertCompanion = (label: string): void => {
        const list = territoriesIn(container);
        const companion = companionId ? list.find((t) => t.id === companionId) : list[0];
        expect(companion, `companion territory missing @ ${label}`).toBeTruthy();
        if (!companionId) {
          companionId = companion!.id;
          companionStatus = companion!.status;
        }
        expect(companion!.status, `companion status drifted @ ${label}`).toBe(companionStatus);
        const scope = container.querySelector(`.hex-territory[data-story-id="${companionId}"]`)!;
        expect(scope, `companion territory element missing @ ${label}`).toBeTruthy();
        expect(scope.querySelector(identity.tree), `companion story-tree missing @ ${label}`).toBeTruthy();
        expect(scope.querySelector(identity.flora), `companion garden-flora missing @ ${label}`).toBeTruthy();
        expect(scope.querySelector('.world-claim-wisp'), `companion must never claim @ ${label}`).toBeNull();
        expect(scope.querySelector('.world-bloom'), `companion must never carry proof @ ${label}`).toBeNull();
      };

      expect(frameKeyOf(container)).toBe('empty');
      expect(territoriesIn(container).length).toBe(1); // no primary land/story at all yet.
      assertCompanion('empty');

      await act(async () => {
        next.click();
      });
      expect(frameKeyOf(container)).toBe('land');
      expect(territoriesIn(container).length).toBe(1); // real ground claimed — still no primary marker.
      expect(container.querySelector('.world-plate')).toBeNull();
      assertCompanion('land');

      await act(async () => {
        next.click();
      });
      expect(frameKeyOf(container)).toBe('proposed');
      let list = territoriesIn(container);
      expect(list.length).toBe(2);
      const primaryId = list.find((t) => t.id !== companionId)?.id;
      expect(primaryId, 'a second, primary territory must appear at proposed').toBeTruthy();
      expect(list.find((t) => t.id === primaryId)!.status).toBe('st-proposed');
      assertCompanion('proposed');

      await act(async () => {
        next.click();
      });
      expect(frameKeyOf(container)).toBe('claimed');
      list = territoriesIn(container);
      expect(list.find((t) => t.id === primaryId)!.status).toBe('st-proposed'); // a claim never proves.
      const primaryScopeAtClaimed = container.querySelector(`.hex-territory[data-story-id="${primaryId}"]`)!;
      expect(primaryScopeAtClaimed.querySelector('.world-claim-wisp')).toBeTruthy();
      expect(primaryScopeAtClaimed.querySelector('.world-bloom')).toBeNull();
      assertCompanion('claimed');

      await act(async () => {
        next.click();
      });
      expect(frameKeyOf(container)).toBe('signed-proof');
      list = territoriesIn(container);
      expect(list.find((t) => t.id === primaryId)!.status).toBe('st-proposed'); // still non-healthy.
      expect(
        container.querySelector(`.hex-territory[data-story-id="${primaryId}"] .world-bloom`),
      ).toBeTruthy();
      assertCompanion('signed-proof');

      await act(async () => {
        next.click();
      });
      expect(frameKeyOf(container)).toBe('healthy');
      list = territoriesIn(container);
      expect(list.find((t) => t.id === primaryId)!.status).toBe('st-healthy'); // healthy only last.
      assertCompanion('healthy');

      await act(async () => {
        back.click();
      });
      expect(frameKeyOf(container)).toBe('signed-proof');
      assertCompanion('signed-proof (via Back)');

      await act(async () => {
        replay.click();
      });
      expect(frameKeyOf(container)).toBe('empty');
      expect(territoriesIn(container).length).toBe(1); // the primary vanishes again — only the companion.
      assertCompanion('empty (via Replay)');
    }

    // Explicit Vector (`spriteSheet={null}`) — the vector `.pop-motion-inner` seam.
    const vector = render(<SemanticGrowthDemo spriteSheet={null} artScale={1} />);
    await walk(vector.container, {
      tree: '.story-tree .pop-motion-inner',
      flora: '.garden-flora .pop-motion-inner',
    });
    vector.unmount();

    // A deterministic Storybook sheet covering BOTH roles — the same companion identity, this time as
    // direct sprite `<image>` hooks (never a second renderer, never Studio-authored motion).
    const storybookSheet: SpriteStyleSheet = {
      name: 'storybook-test',
      label: 'Storybook (test fixture)',
      sprites: {
        tree: { href: '/art-sheets/storybook/tree.svg', w: 40, h: 60, anchorX: 0.5, anchorY: 1 },
        flora: { href: '/art-sheets/storybook/flora.svg', w: 20, h: 20, anchorX: 0.5, anchorY: 1 },
      },
    };
    const storybook = render(<SemanticGrowthDemo spriteSheet={storybookSheet} artScale={1} />);
    await walk(storybook.container, { tree: 'image.story-tree', flora: 'image.garden-flora' });
    storybook.unmount();
  });

  // D — the complete shared-CSS resolved-profile/keyframe/property/timing/renderer/bloom audit. Reads
  // packages/app-surface/src/semantic-growth.css and packages/app-surface/src/SceneView.tsx as
  // READ-ONLY dependency evidence (never edited, never widening this gate's write scope), resolving
  // each role's CSS profile from selector hooks discovered on REAL rendered Studio output (never an
  // assumed animation name), over both the Vector seam and a Storybook sheet covering both roles.
  it('sgsd-css-resolved-choreography-audit: resolves the full cascaded animation profile (shorthand + longhand precedence, real @keyframes bodies) for every discovered Studio role hook and proves the authored bundle: a finite single bloom pulse, a non-equivalent parcel-boundary/parcel-flora pair, a translate-only plate settle, and the planted-first / boundary+100ms / parcel-flora+60ms-past-boundary / plate+180ms-past-planted stagger', async () => {
    const css = readFileSync(resolve(APP_SURFACE_SRC, 'semantic-growth.css'), 'utf8');
    const sceneView = readFileSync(resolve(APP_SURFACE_SRC, 'SceneView.tsx'), 'utf8');
    const nonKeyframeCss = stripKeyframeBlocks(css);

    const vector = render(<SemanticGrowthDemo spriteSheet={null} artScale={1} />);
    const vNav = vector.container.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(vNav).toBeTruthy();
    const vNext = Array.from(vNav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(vNext).toBeTruthy();
    await act(async () => {
      vNext!.click();
    });
    await act(async () => {
      vNext!.click();
    }); // empty -> land -> proposed
    expect(vector.container.querySelector('.story-tree .pop-motion-inner')).toBeTruthy();
    expect(vector.container.querySelector('.garden-flora .pop-motion-inner')).toBeTruthy();
    expect(vector.container.querySelector('.world-plate .pop-motion-inner')).toBeTruthy();
    expect(vector.container.querySelector('.parcel')).toBeTruthy();
    expect(vector.container.querySelector('.parcel-flora')).toBeTruthy();
    await act(async () => {
      vNext!.click();
    }); // -> claimed
    expect(vector.container.querySelector('.world-claim-wisp')).toBeTruthy();
    await act(async () => {
      vNext!.click();
    }); // -> signed-proof
    expect(vector.container.querySelector('.world-bloom')).toBeTruthy();
    vector.unmount();

    const treeProfile = resolvedProfile(css, nonKeyframeCss, '.story-tree .pop-motion-inner');
    const floraProfile = resolvedProfile(css, nonKeyframeCss, '.garden-flora .pop-motion-inner');
    const plateProfile = resolvedProfile(css, nonKeyframeCss, '.world-plate .pop-motion-inner');
    const boundaryProfile = resolvedProfile(css, nonKeyframeCss, '.parcel');
    const parcelFloraProfile = resolvedProfile(css, nonKeyframeCss, '.parcel-flora');
    const bloomProfile = resolvedProfile(css, nonKeyframeCss, '.world-bloom');
    const wispProfile = resolvedProfile(css, nonKeyframeCss, '.world-claim-wisp');

    const storybookSheet: SpriteStyleSheet = {
      name: 'storybook-test',
      label: 'Storybook (test fixture)',
      sprites: {
        tree: { href: '/art-sheets/storybook/tree.svg', w: 40, h: 60, anchorX: 0.5, anchorY: 1 },
        flora: { href: '/art-sheets/storybook/flora.svg', w: 20, h: 20, anchorX: 0.5, anchorY: 1 },
      },
    };
    const storybook = render(<SemanticGrowthDemo spriteSheet={storybookSheet} artScale={1} />);
    const sNav = storybook.container.querySelector('nav[aria-label="Semantic growth controls"]');
    expect(sNav).toBeTruthy();
    const sNext = Array.from(sNav!.querySelectorAll('button')).find((b) => b.textContent === 'Next');
    expect(sNext).toBeTruthy();
    await act(async () => {
      sNext!.click();
    });
    await act(async () => {
      sNext!.click();
    }); // empty -> land -> proposed
    expect(storybook.container.querySelector('image.story-tree')).toBeTruthy();
    expect(storybook.container.querySelector('image.garden-flora')).toBeTruthy();
    storybook.unmount();

    const spriteTreeProfile = resolvedProfile(css, nonKeyframeCss, 'image.story-tree');
    const spriteFloraProfile = resolvedProfile(css, nonKeyframeCss, 'image.garden-flora');

    for (const profile of [
      treeProfile,
      floraProfile,
      plateProfile,
      boundaryProfile,
      parcelFloraProfile,
      bloomProfile,
      wispProfile,
      spriteTreeProfile,
      spriteFloraProfile,
    ]) {
      expect(profile).toBeTruthy();
    }

    // bloom pulses exactly once (finite), never forever, and settles fully opaque/at rest scale.
    expect(bloomProfile!.iteration).toBe(1);
    expect(['forwards', 'both']).toContain(bloomProfile!.fill);
    const bloomOffsets = [...(bloomProfile!.keyframe?.keys() ?? [])].sort((a, b) => a - b);
    const bloomTerminalOffset = bloomOffsets[bloomOffsets.length - 1];
    const bloomTerminal =
      bloomTerminalOffset === undefined ? undefined : bloomProfile!.keyframe!.get(bloomTerminalOffset);
    expect(bloomTerminal).toMatch(/scale:\s*1(?:\.0+)?(?:;|$)/);
    expect(bloomTerminal).toMatch(/opacity:\s*1(?:\.0+)?(?:;|$)/);

    // parcel boundary is a ground reveal (opacity only, never scale); parcel flora is a rooted growth
    // (scale + opacity) — a real property-SET difference, never just differing numeric endpoints.
    const boundaryProps = keyframePropertySet(boundaryProfile!.keyframe);
    expect(boundaryProps.has('scale')).toBe(false);
    const floraProps = keyframePropertySet(parcelFloraProfile!.keyframe);
    expect(floraProps.has('scale')).toBe(true);
    expect(canonicalKeyframeString(boundaryProfile!.keyframe)).not.toBe(
      canonicalKeyframeString(parcelFloraProfile!.keyframe),
    );
    expect([...boundaryProps].sort()).not.toEqual([...floraProps].sort());

    // never grouped under one shared selector list.
    const flatSelectorGroups = [...nonKeyframeCss.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) =>
      (m[1] ?? '').split(',').map((s) => s.trim()),
    );
    const groupsBoundaryWithFlora = flatSelectorGroups.some(
      (selectors) =>
        selectors.some((s) => endsWithSelectorSuffix(s, '.parcel')) &&
        selectors.some((s) => endsWithSelectorSuffix(s, '.parcel-flora')),
    );
    expect(groupsBoundaryWithFlora).toBe(false);

    // plate settles with an individual vertical-only `translate:`, never a scale sweep.
    const plateProps = keyframePropertySet(plateProfile!.keyframe);
    expect(plateProps.has('scale')).toBe(false);
    const plateTranslateDecl = [...(plateProfile!.keyframe?.values() ?? [])].find((d) =>
      /(?:^|;)translate:/.test(d),
    );
    expect(plateTranslateDecl).toBeTruthy();
    expect(plateTranslateDecl).toMatch(/translate:\s*0(?:px)?\s+-?[\d.]+(?:px)?/);

    // resolved-delay stagger: planted first; parcel boundary >=100ms later; earliest parcel flora
    // >=60ms past boundary with per-item variation; plate >=180ms past planted.
    expect(boundaryProfile!.delayMs).toBeGreaterThanOrEqual(treeProfile!.delayMs + 100);
    expect(plateProfile!.delayMs).toBeGreaterThanOrEqual(treeProfile!.delayMs + 180);

    const perItemFloraDelays = [
      ...nonKeyframeCss.matchAll(
        /\.parcel-flora(?::nth-[\w-]+\([^)]*\)|\[[^\]]*(?:offset|stagger|delay)[^\]]*\])\s*\{([^}]*)\}/gi,
      ),
    ].map((m) => toMs(/animation-delay\s*:\s*([^;]+);/.exec(m[1] ?? '')?.[1]?.trim()));
    expect(perItemFloraDelays.length).toBeGreaterThan(0);
    expect(new Set(perItemFloraDelays).size).toBeGreaterThanOrEqual(2);
    expect(Math.min(...perItemFloraDelays)).toBeGreaterThanOrEqual(boundaryProfile!.delayMs + 60);

    // the claim's entrance stays local/non-spatial, riding alongside its real SVG orbit.
    const wispProps = keyframePropertySet(wispProfile!.keyframe);
    expect(wispProps.has('scale')).toBe(false);
    expect(sceneView).toMatch(/animateTransform/);

    // immediate, honest reduced semantics: no role hook ever carries a real (non-'none') animation
    // under `[data-motion='reduced']`.
    for (const suffix of [
      '.story-tree .pop-motion-inner',
      '.garden-flora .pop-motion-inner',
      '.world-plate .pop-motion-inner',
      '.parcel',
      '.parcel-flora',
      '.world-claim-wisp',
      '.world-bloom',
    ]) {
      const reducedRules = findRules(nonKeyframeCss, suffix).filter(
        (r) => /data-motion=['"]reduced['"]/.test(r.selector) && /animation(?:-name)?:\s*(?!none\b)/.test(r.body),
      );
      expect(reducedRules.length).toBe(0);
    }
  });

  // E — a separate exact-frame arrival-selector audit over the same shared, read-only CSS.
  it('sgsd-arrival-selector-audit: every full-motion arrival selector is qualified by the exact frame its role first enters — never the generic [data-semantic-growth-frame][data-motion="full"] targeting — and no arrival ever matches a later frame it must not narrate', () => {
    const css = readFileSync(resolve(APP_SURFACE_SRC, 'semantic-growth.css'), 'utf8');

    // the bare frame-key-less prefix every current arrival rule shares is red outright.
    expect(css).not.toMatch(/\[data-semantic-growth-frame\]\[data-motion=['"]full['"]\]/);

    const selectorsAnimatedBy = (animationName: string): string[] => {
      const re = new RegExp(`([^{}]+)\\{[^{}]*animation(?:-name)?:\\s*${animationName}\\b[^{}]*\\}`, 'g');
      return [...css.matchAll(re)]
        .flatMap((m) => (m[1] ?? '').split(','))
        .map((s) => s.trim());
    };
    const matchesFrame = (selector: string, key: string): boolean =>
      new RegExp(`\\[data-semantic-growth-frame=['"]${key}['"]\\]`).test(selector);

    const groundSelectors = selectorsAnimatedBy('arrive-ground');
    expect(groundSelectors.length).toBeGreaterThan(0);
    for (const selector of groundSelectors) {
      expect(matchesFrame(selector, 'land')).toBe(true);
      for (const forbidden of ['claimed', 'signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const popSelectors = selectorsAnimatedBy('arrive-pop');
    expect(popSelectors.length).toBeGreaterThan(0);
    for (const selector of popSelectors) {
      expect(matchesFrame(selector, 'proposed')).toBe(true);
      for (const forbidden of ['claimed', 'signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const wispSelectors = selectorsAnimatedBy('wisp-in');
    expect(wispSelectors.length).toBeGreaterThan(0);
    for (const selector of wispSelectors) {
      expect(matchesFrame(selector, 'claimed')).toBe(true);
      for (const forbidden of ['signed-proof', 'healthy']) {
        expect(matchesFrame(selector, forbidden)).toBe(false);
      }
    }

    const bloomSelectors = selectorsAnimatedBy('bloom-pulse');
    expect(bloomSelectors.length).toBeGreaterThan(0);
    for (const selector of bloomSelectors) {
      expect(matchesFrame(selector, 'signed-proof')).toBe(true);
      expect(matchesFrame(selector, 'healthy')).toBe(false);
    }
  });
});
