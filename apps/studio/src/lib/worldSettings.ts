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

/** substrate aliases, mirroring readSubstrateMode. */
function normalizeSubstrate(raw: string | null): string {
  if (raw === 'hex' || raw === 'none' || raw === 'default' || raw === 'classic') return 'hex';
  if (raw === 'relaxed-hex') return 'relaxed-hex';
  if (raw === 'relaxed-quad' || raw === 'relaxed') return 'relaxed-quad';
  // 'mesh' | 'path-b' | unknown | null → mesh (the default world).
  return 'mesh';
}

/** layout aliases, mirroring readLayoutMode. Default = `dag` (the byte-identical world). */
function normalizeLayout(raw: string | null): string {
  if (raw === 'solar' || raw === 'solar-system' || raw === 'radial') return 'solar';
  // 'dag' | 'rows' | 'tree' | unknown | null → dag (the current world).
  return 'dag';
}

// The forest-map dials (owner ask 2026-06-18). Since the river-trail road system was
// retired (ADR-0076: connections are thin perimeter-docked lines with nothing to tune),
// the road-routing knobs are GONE — only Layout (DAG vs solar) and Ground (tiling) remain.
// Each control's `hint` is the visible plain-English description shown UNDER the control.
export const CONTROLS: readonly ControlSpec[] = [
  // ---- Layout ----
  // ADR-0074 §6 / `solar-system-world`: the RADIAL hub-and-spoke world (cli/store at
  // the centre, organisms orbiting by rank). Default `dag` writes NO param, so the
  // current world stays byte-identical until the owner picks `solar`.
  {
    kind: 'select',
    key: 'layout',
    label: 'Layout',
    group: GROUP_LAYOUT,
    hint: 'How islands are arranged — DAG rows, or a solar-system with the cli/store hubs at the centre.',
    default: 'dag',
    options: [
      { value: 'dag', label: 'DAG rows' },
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
