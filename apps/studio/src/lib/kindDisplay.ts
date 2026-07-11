// kindDisplay — the ONE place the studio maps a kind KEY to its display text (ADR-0183 D1).
//
// The owner's naming call: `arc` is the canonical kind key everywhere machine-facing (routes,
// refs, API, CLI, corpus), but the studio DISPLAYS it as "Epic" by default, flippable to "Arc"
// via a persisted display preference. No component hand-rolls the alias — chips, headings,
// sidebar labels and editor options all route through here, so the alias can never leak into a
// key (the D1 line: one canonical name in the machine, one legible name for humans).
//
// Pure string math + an injectable storage seam (kindDisplay.test.ts runs in node env); the
// React binding is a tiny useSyncExternalStore hook at the bottom.

import { useSyncExternalStore } from 'react';

/** The persisted display preference for the `arc` kind: "Epic" (default) or the literal key. */
export type ArcDisplay = 'epic' | 'arc';

/** localStorage key for the preference (exported for the tests' storage stub). */
export const ARC_DISPLAY_KEY = 'storytree.arcDisplay';

/** Fired on setArcDisplay so every mounted useArcDisplay re-reads (plus cross-tab 'storage'). */
const CHANGE_EVENT = 'storytree:arc-display-change';

/** The read seam: anything with localStorage's getItem (injectable for node-env tests). */
interface DisplayStorage {
  getItem(key: string): string | null;
}

/**
 * The chip / inline kind text for a category. Only `arc` is ever aliased ('epic' under the
 * default preference); every other kind — including `plan` — renders its canonical key.
 */
export function kindLabel(category: string, display: ArcDisplay): string {
  return category === 'arc' && display === 'epic' ? 'epic' : category;
}

/**
 * The plural heading text for a category card / crumb. `fallback` is the caller's own label
 * map entry (e.g. "Arcs"); only the arc heading under the epic preference is replaced.
 */
export function typeLabel(category: string, display: ArcDisplay, fallback: string): string {
  return category === 'arc' && display === 'epic' ? 'Epics' : fallback;
}

/**
 * Read the persisted preference, defaulting to 'epic' (D1: Epic is the default) on a missing
 * or unrecognised value and on an unavailable storage (private mode) — never a throw.
 */
export function readArcDisplay(storage?: DisplayStorage): ArcDisplay {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    return store?.getItem(ARC_DISPLAY_KEY) === 'arc' ? 'arc' : 'epic';
  } catch {
    return 'epic';
  }
}

/** Persist a preference flip and notify every mounted useArcDisplay. Write failures are inert. */
export function setArcDisplay(value: ArcDisplay): void {
  try {
    window.localStorage.setItem(ARC_DISPLAY_KEY, value);
  } catch {
    /* private mode: the flip still applies for this page via the change event */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The live preference as React state — re-renders on setArcDisplay and cross-tab changes. */
export function useArcDisplay(): ArcDisplay {
  return useSyncExternalStore(subscribe, () => readArcDisplay(), () => 'epic' as const);
}
