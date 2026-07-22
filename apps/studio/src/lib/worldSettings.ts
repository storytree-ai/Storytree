// worldSettings — the SINGLE SOURCE OF TRUTH for the user-facing forest-map dials
// (the gear settings panel at #/tree, owner ask 2026-06-18) and their param↔URL
// binding.
//
// Why a standalone, framework-free module:
//   • One source of truth. The TreeView readers (readSubstrateMode / readRiverTuning)
//     and the gear panel BOTH consume the defaults + clamps declared here, so a default
//     or a clamp can never drift between "what the world renders" and "what the panel
//     shows / writes".
//   • Byte-identical default world. Writing a control AT its default REMOVES the param
//     (setControlValue), and resetControls drops every managed param — so an untouched
//     world's URL stays clean and the geometry is unchanged by construction.
//   • Pure string/URL math (no React, no DOM) so the contract is unit-testable in the
//     node-env vitest suite (worldSettings.test.ts) — Stage-1 red-green of the gear.
//
// The clamps here MIRROR the TreeView parser (readRiverTuning, readSubstrateMode).
// When the panel writes a value it is already UI-bounded; on READ
// the value is re-clamped to the parser's open-ended clamp, exactly as the URL path is.

/** A select option: the stored URL token and its human label. */
export interface SelectOption {
  /** The value the panel binds to and the URL token written for it (except the
   *  DEFAULT option, whose token is the param's absence). */
  value: string;
  label: string;
}

interface ControlBase {
  /** The URL query key (e.g. `deltaCone`). Unique across CONTROLS. */
  key: string;
  /** Human label shown in the panel. */
  label: string;
  /** Grouping section in the panel. */
  group: string;
  /** Optional one-line help (tooltip / sub-label). */
  hint?: string;
}

/** A numeric slider control. UI min/max/step bound the slider; clampMin/clampMax
 *  mirror the TreeView parser's open-ended re-clamp on read (may be looser than the
 *  slider — the parser re-clamps regardless of how the value arrived). */
export interface NumberControl extends ControlBase {
  kind: 'number';
  default: number;
  /** Slider lower bound (UI only). */
  min: number;
  /** Slider upper bound (UI only). */
  max: number;
  /** Slider step. */
  step: number;
  /** Parser clamp lower bound (mirrors readRiverTuning). */
  clampMin: number;
  /** Parser clamp upper bound; `null` = open (no upper clamp). */
  clampMax: number | null;
  /** Round to an integer on read (mirrors `Math.round` in the parser). */
  integer?: boolean;
}

/** A boolean toggle. `default` is the world's default state; turning it to the
 *  NON-default state writes `key=offToken` (default ON) or `key=onToken` (default
 *  OFF); returning to the default REMOVES the param. */
export interface ToggleControl extends ControlBase {
  kind: 'toggle';
  default: boolean;
  /** The token written when the value is OFF and OFF is non-default (default-ON
   *  toggles). */
  offToken: string;
  /** The token written when the value is ON and ON is non-default (default-OFF
   *  toggles). */
  onToken: string;
  /** Tokens that READ as OFF (mirrors the parser's off-spellings). */
  offReads: readonly string[];
}

/** A select / segmented control. The option whose value === `default` writes NO
 *  param (the byte-identical default); every other option writes `key=<value>`. */
export interface SelectControl extends ControlBase {
  kind: 'select';
  default: string;
  options: readonly SelectOption[];
  /** Map a raw URL token → a canonical option value (mirrors the parser's aliases,
   *  e.g. substrate `none`/`default`/`classic` → `hex`). Unknown → default. */
  normalize: (raw: string | null) => string;
}

export type ControlSpec = NumberControl | ToggleControl | SelectControl;

/** The value a control resolves to (kind-dependent). */
export type ControlValue = number | boolean | string;

// ---------------------------------------------------------------------------
// The schema. Defaults + clamps MIRROR TreeView's RIVER_TUNING / the readers.
// ---------------------------------------------------------------------------

const GROUP_GROUND = 'Ground';
const GROUP_LAYOUT = 'Layout';
const GROUP_COSY = 'World art';
const GROUP_ART = 'Art style';

/** artStyle aliases (sprite-art-sheets spike). Only the sheet names the studio actually ships resolve;
 *  an absent/unknown/typo'd value is the `vector` default — the byte-identical procedural render — so a
 *  bad `?artStyle=` param can never silently break the map. Wave 2 appends more sheet names here as more
 *  sheets ship; it never needs to touch the reader / mapper, only this list + the CONTROLS options below. */
const ART_STYLE_NAMES = ['stub-a', 'stub-b', 'cosy', 'evening'] as const;
function normalizeArtStyle(raw: string | null): string {
  return (ART_STYLE_NAMES as readonly string[]).includes(raw ?? '') ? (raw as string) : 'vector';
}

/** substrate aliases, mirroring readSubstrateMode. */
function normalizeSubstrate(raw: string | null): string {
  if (raw === 'hex' || raw === 'none' || raw === 'default' || raw === 'classic') return 'hex';
  if (raw === 'relaxed-hex') return 'relaxed-hex';
  if (raw === 'relaxed-quad' || raw === 'relaxed') return 'relaxed-quad';
  // 'mesh' | 'path-b' | unknown | null → mesh (the default world).
  return 'mesh';
}

/** layout aliases, mirroring readLayoutMode. Default = `dag` (ADR-0229, owner-directed 2026-07-23,
 *  amends ADR-0171): an absent/unknown param renders the DAG rows. `?layout=stress` opts into the
 *  dependency-aware trail-shortening placement; `?layout=solar` the radial hub world. */
function normalizeLayout(raw: string | null): string {
  if (raw === 'solar' || raw === 'solar-system' || raw === 'radial') return 'solar';
  // explicit opt-in to the dependency-aware stress-majorization placement (shortens trails)
  if (raw === 'stress' || raw === 'stress-majorization' || raw === 'force') return 'stress';
  // ADR-0229 (amends ADR-0171): DAG rows are the default again —
  // 'dag' | 'rows' | 'tree' | unknown | null → dag.
  return 'dag';
}

// The forest-map dials (owner ask 2026-06-18). Since the river-trail road system was
// retired (ADR-0076: connections are thin perimeter-docked lines with nothing to tune),
// the road-routing knobs are GONE — only Layout (DAG vs solar) and Ground (tiling) remain.
// Each control's `hint` is the visible plain-English description shown UNDER the control.
export const CONTROLS: readonly ControlSpec[] = [
  // ---- Layout ----
  // ADR-0229 (owner-directed 2026-07-23, amends ADR-0171): DAG rows are the DEFAULT again — a clean
  // URL renders the layered rows (which read cleanly against the pathways-only map, ADR-0228). The
  // dependency-aware `stress` placement and the radial `solar` world (ADR-0074 §6: cli/store hubs at
  // the centre) stay in the picker — `?layout=stress` / `?layout=solar` opt into them.
  {
    kind: 'select',
    key: 'layout',
    label: 'Layout',
    group: GROUP_LAYOUT,
    hint: 'How islands are arranged — DAG rows (default), a dependency-aware layout that shortens trails, or a solar-system with the cli/store hubs at the centre.',
    default: 'dag',
    options: [
      { value: 'dag', label: 'DAG rows' },
      { value: 'stress', label: 'Dependency-aware' },
      { value: 'solar', label: 'Solar system' },
    ],
    normalize: normalizeLayout,
  },

  // ---- Ground ----
  {
    kind: 'select',
    key: 'substrate',
    label: 'Ground tiling',
    group: GROUP_GROUND,
    hint: 'How the island ground is tiled.',
    default: 'mesh',
    options: [
      { value: 'mesh', label: 'Mesh' },
      { value: 'hex', label: 'Hex' },
      { value: 'relaxed-quad', label: 'Relaxed quad' },
      { value: 'relaxed-hex', label: 'Relaxed hex' },
    ],
    normalize: normalizeSubstrate,
  },

  // ADR-0088 (Shared Islands panel, amends ADR-0076 §2): the `buildingIsland` gear TOGGLE was
  // REMOVED. The building-class islands now live in a PERMANENT left "Shared Islands" panel —
  // there is no on/off to dial, so the gear no longer carries a Panels section. The distributed
  // consumer stamp is still controlled by the `?buildings=off` URL escape (read by TreeView,
  // not a gear control).

  // ---- World art (grounded-art arc) ----
  // ADR-0228 retired the default-OFF `garden` and `cosy` toggles (the cosy-island garden composition
  // and the cosy palette lift). The unified vegetation vocabulary below is the promoted DEFAULT — the
  // one grounded-art world-art switch that remains, surfaced as a gear toggle whose `?veg=off` escape
  // returns the pre-ADR-0226 world.
  {
    kind: 'toggle',
    key: 'veg',
    label: 'Vegetation vocabulary',
    group: GROUP_COSY,
    hint: 'The unified world-art vegetation vocabulary (ADR-0226): grass = a capability’s tests, small flowers = the story’s UAT, dead grass = an unhealthy capability, the human-witness signpost retired, and the autumn-tree hero as every island’s central tree. Studio-only; ON by default — turn off to see the pre-ADR-0226 world.',
    default: true,
    offToken: 'off',
    onToken: 'on',
    offReads: ['off', '0', 'false'],
  },

  // ---- Art style (sprite-art-sheets spike) ----
  // A default-off render-mode swap: instead of drawing an object's procedural vector body, the studio
  // mapper can re-skin it from a sprite STYLE SHEET — a manifest of images keyed by drawable kind (+
  // status), fetched from `apps/studio/public/art-sheets/<name>/manifest.json` (see the studio's
  // `./sprite-sheet.ts` for the manifest contract). `vector` (default, absence)
  // fetches nothing and renders byte-identical to today; each other option re-skins every COVERED kind
  // and leaves everything uncovered as vector, so a sheet may cover only some kinds. Today's two options
  // are prototype-quality STUBS proving the swap mechanism; wave 2 replaces them with real sheets under
  // the same contract (new entries here, no reader/mapper change).
  {
    kind: 'select',
    key: 'artStyle',
    label: 'Art style',
    group: GROUP_ART,
    hint: 'Re-skin the map from a sprite style sheet instead of the procedural vector shapes. Vector is the default (byte-identical); the stub sheets are placeholder art, and Cosy / Evening are real nano-banana sprite sheets (warm storybook vs cool moonlit) proving the swap with finished art.',
    default: 'vector',
    options: [
      { value: 'vector', label: 'Vector (default)' },
      { value: 'stub-a', label: 'Stub A' },
      { value: 'stub-b', label: 'Stub B' },
      { value: 'cosy', label: 'Cosy — warm storybook' },
      { value: 'evening', label: 'Evening — moonlit' },
    ],
    normalize: normalizeArtStyle,
  },

  // Sprite size dial (owner verdict 2026-07-23: the first cosy render read "way too big"). Sprites now
  // DERIVE their size from the vector body they replace (see the studio's `sprite-sizing.ts`), and this
  // dial multiplies that fit — 1 (default, no param) = match the vector footprint exactly; nudge up or
  // down to taste. Only meaningful when an Art style sheet is active; inert in vector mode.
  {
    kind: 'number',
    key: 'artScale',
    label: 'Art scale',
    group: GROUP_ART,
    hint: 'Sprite size relative to the vector art it replaces — 1 matches the vector footprint; raise or lower to taste. Only applies when an Art style sheet is selected.',
    default: 1,
    min: 0.4,
    max: 2.5,
    step: 0.05,
    clampMin: 0.05,
    clampMax: 10,
  },
] as const;

const BY_KEY = new Map<string, ControlSpec>(CONTROLS.map((c) => [c.key, c]));

/** Look a control up by its URL key. */
export function controlByKey(key: string): ControlSpec | undefined {
  return BY_KEY.get(key);
}

/** Every URL key this module manages (for reset / drift checks). */
export const MANAGED_KEYS: readonly string[] = CONTROLS.map((c) => c.key);

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

/** Parse + clamp a control's value out of a `?…` search string, falling back to
 *  the control's default when the param is absent or unparseable. Mirrors the
 *  TreeView parser exactly so panel and world never disagree. */
export function readControlValue(search: string, c: ControlSpec): ControlValue {
  const q = new URLSearchParams(search);
  const raw = q.get(c.key);
  switch (c.kind) {
    case 'number': {
      if (raw === null) return c.default;
      const v = Number(raw);
      if (!Number.isFinite(v)) return c.default;
      return clampNumber(v, c);
    }
    case 'toggle': {
      if (raw === null) return c.default;
      return !c.offReads.includes(raw);
    }
    case 'select': {
      return c.normalize(raw);
    }
  }
}

/** Apply the parser's clamp (and optional integer rounding) to a numeric value. */
export function clampNumber(v: number, c: NumberControl): number {
  let out = Math.max(c.clampMin, v);
  if (c.clampMax !== null) out = Math.min(c.clampMax, out);
  if (c.integer) out = Math.round(out);
  return out;
}

/** Format a number for the URL: integers bare, otherwise trim trailing zeros so
 *  `7` stays `7` (not `7.0`) and a step like `0.05` reads cleanly. */
function formatNumber(v: number): string {
  // toString already drops trailing zeros and the decimal point for integers.
  return String(v);
}

/** Set a control's value into a `?…` search string and return the new search
 *  string (`''` when no params remain). Setting a control to its DEFAULT REMOVES
 *  the param, so the default world's URL stays clean / byte-identical. Unrelated
 *  params are preserved. */
export function setControlValue(search: string, c: ControlSpec, value: ControlValue): string {
  const q = new URLSearchParams(search);
  let token: string | null = null; // null ⇒ remove (value is the default)
  switch (c.kind) {
    case 'number': {
      const v = clampNumber(value as number, c);
      token = v === c.default ? null : formatNumber(v);
      break;
    }
    case 'toggle': {
      const on = value as boolean;
      if (on === c.default) token = null;
      else token = on ? c.onToken : c.offToken;
      break;
    }
    case 'select': {
      const v = c.normalize(value as string);
      token = v === c.default ? null : v;
      break;
    }
  }
  if (token === null) q.delete(c.key);
  else q.set(c.key, token);
  return stringifySearch(q);
}

/** Drop every managed param, preserving anything unmanaged. Returns `''` when no
 *  params remain. */
export function resetControls(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of MANAGED_KEYS) q.delete(k);
  return stringifySearch(q);
}

/** A `URLSearchParams` → `?a=b&c=d` (or `''` when empty), without re-encoding the
 *  human-readable tokens we use (all our keys/values are URL-safe already). */
function stringifySearch(q: URLSearchParams): string {
  const s = q.toString();
  return s.length > 0 ? `?${s}` : '';
}

/** Build a shareable URL with the params placed BEFORE the `#hash` (the project's
 *  hash-router lives in the fragment; query params must precede it to survive a
 *  reload). `origin` is the page origin+path (e.g. `https://host/`), `search` is a
 *  `?…` (or `''`) string, `hash` is the `#/tree…` fragment (or `''`). */
export function buildShareUrl(origin: string, search: string, hash: string): string {
  return `${origin}${search}${hash}`;
}

/**
 * ADR-0093 Unit D: the shared scene-graph (the studio React mapper, `SceneView`) is now the
 * DEFAULT forest-world render — absence ⇒ scene. The studio-only chrome that was inline-only
 * (solar spokes, the distributed-consumer building stamps) is layered ON TOP of `<SceneView>`
 * as sibling `<g>` (ADR-0093 Decision 2), so nothing regresses. The inline `<g>` render is kept
 * reachable for ONE release as a safety net via the `?render=legacy` / `?render=inline` escape
 * hatch — once the scene render is operator-attested across a release it can be deleted outright.
 *
 * Returns `true` to render the scene (the default + explicit `?render=scene`), `false` only for the
 * legacy/inline escape. Deliberately NOT a `CONTROLS` gear dial: it is a transient escape hatch, not
 * a user-facing setting.
 */
export function readRenderScene(search: string): boolean {
  const render = new URLSearchParams(search).get('render');
  // The one-release escape hatch back to the inline render; everything else (incl. absence and an
  // unknown value) is the scene default.
  return render !== 'legacy' && render !== 'inline';
}

/* ADR-0228 retired the default-off `readCosyIsland` (`?cosy`) and `readGardenIsland` (`?garden`)
 * grounded-art flags. The unified vegetation vocabulary below (`?veg`, the promoted default) is the
 * one grounded-art world-art switch that remains. */

/**
 * grounded-art (ADR-0226, promoted to the studio DEFAULT after the owner's 2026-07-22 look verdict): the
 * unified world-art vegetation vocabulary. ON by default — grass = a capability's tests (the decorative
 * wildflower / anemone / heather-bell accents retired), the UAT criteria as small flowers folded into the
 * grass, dead grass = an unhealthy capability, the human-witness signpost retired, and the `autumn-tree`
 * hero as every island's central tree. `?veg=off` (or `=0` / `=false`) is the escape hatch back to the
 * pre-ADR-0226 world. The public website fold never sends `vegetation`, so its render is unchanged (the
 * core's absence lock still holds). This is studio-side only.
 */
export function readVegetationVocab(search: string): boolean {
  const v = new URLSearchParams(search).get('veg');
  return v !== 'off' && v !== '0' && v !== 'false';
}
