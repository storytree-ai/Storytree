// Dev-only override for the load/store-down screens, so the owner can flip through every honest
// state without actually stopping Cloud SQL (the incident-2026-06-27 states: CHECKING, ASLEEP as
// admin, ASLEEP as member, STARTING, TAKING-LONGER, SERVER-LOST, ERROR). It is INERT in a
// production build (`import.meta.env.DEV` is false there), so it can never affect the hosted studio.
//
// How it works: when the URL carries `?devLoadState=<name>` AND we're in a Vite dev build, App
// derives its screen from a SYNTHETIC (meStatus, me, phase, elapsedMs) tuple instead of the live
// ones. This is a VIEW shim only — it never touches the server, the auth model, or who may wake the
// DB (the wake button still calls the real, admin-gated endpoint; clicking it in `asleep-admin`
// against a healthy DB simply no-ops/has no instance to start, which is fine for a look-only pass).

import { useEffect, useState } from 'react';
import type { MeInfo } from '../types';
import type { StorePhase } from '../components/StoreBanner';
import { TAKING_LONGER_MS } from './loadState';

/** The synthetic inputs a dev override forces into deriveLoadState. */
export interface DevOverride {
  meStatus: 'loading' | 'ready' | 'error';
  me: MeInfo | null;
  phase: StorePhase;
  elapsedMs: number;
}

const downAdmin: MeInfo = {
  email: 'admin@storytree.dev',
  role: 'admin',
  status: null,
  member: false,
  storeUnreachable: true,
  canWakeDb: true,
};
const downMember: MeInfo = {
  email: 'member@storytree.dev',
  role: 'member',
  status: null,
  member: false,
  storeUnreachable: true,
  canWakeDb: false,
};

/** The named states the owner can force via `?devLoadState=<name>`. */
const PRESETS: ReadonlyMap<string, DevOverride> = new Map([
  ["checking", { meStatus: 'loading', me: null, phase: 'unknown', elapsedMs: 0 }],
  ["asleep-admin", { meStatus: 'ready', me: downAdmin, phase: 'unreachable', elapsedMs: 0 }],
  ["asleep-member", { meStatus: 'ready', me: downMember, phase: 'unreachable', elapsedMs: 0 }],
  // storeUnreachable yet /api/health says the DB is reachable → a fault, not a sleep.
  ["store-fault", { meStatus: 'ready', me: downAdmin, phase: 'healthy', elapsedMs: 0 }],
  ["starting", { meStatus: 'ready', me: downAdmin, phase: 'starting', elapsedMs: 30_000 }],
  ["taking-longer", {
    meStatus: 'ready',
    me: downAdmin,
    phase: 'starting',
    elapsedMs: TAKING_LONGER_MS + 30_000,
  }],
  ["server-lost", { meStatus: 'error', me: null, phase: 'server-lost', elapsedMs: 0 }],
  ["error", { meStatus: 'error', me: null, phase: 'unknown', elapsedMs: 0 }],
]);

/** The preset names, for the dev hint strip. */
export const DEV_OVERRIDE_NAMES = [...PRESETS.keys()];

function readOverride(): DevOverride | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const name = new URLSearchParams(window.location.search).get('devLoadState');
  if (name === null || name === '') return null;
  return PRESETS.get(name) ?? null;
}

/**
 * In a Vite dev build, returns the synthetic load inputs named by `?devLoadState=<name>` (or null
 * when absent/unknown/prod). Re-reads on hashchange/popstate so flipping the query in the address
 * bar takes effect without a manual reload of the SPA shell.
 */
export function useDevStoreOverride(): DevOverride | null {
  const [override, setOverride] = useState<DevOverride | null>(readOverride);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const reread = (): void => setOverride(readOverride());
    window.addEventListener('popstate', reread);
    window.addEventListener('hashchange', reread);
    return () => {
      window.removeEventListener('popstate', reread);
      window.removeEventListener('hashchange', reread);
    };
  }, []);
  return override;
}

// ── THE FOREST CURRENCY SIGNAL'S OWN DEV OVERRIDE (ADR-0445 D3, `map-currency-signal`) ──────────
//
// Same shim, same file, same reason: the signal's APPEARANCE is operator-attested (ADR-0070 stage
// 2), and on a local dev studio only GREEN occurs naturally — `code.stale` is false on a
// freshly-started server and the dev studio sends no `runtime.behind` at all, so amber needs a
// pinned installed app that is genuinely behind `main` and red needs the tree read to fail cold.
// Staging those for real would mean breaking the operator's machine to show him a colour.
//
// INERT IN A PRODUCTION BUILD (`import.meta.env.DEV` is false there), exactly like the load-screen
// override above, so it can never reach the hosted studio. It is a VIEW shim only: it substitutes
// the READING, never the facts it is derived from, so nothing about the health poll, the payload
// cache, or the map's own data path changes while it is in effect.

import type { MapCurrencyReading } from './mapCurrency';

/** The named readings the owner can force via `?devCurrency=<name>`. */
const CURRENCY_PRESETS: ReadonlyMap<string, MapCurrencyReading> = new Map([
  ['green', { state: 'green', causes: [] }],
  [
    'amber-cache',
    {
      state: 'amber',
      causes: [
        {
          id: 'serving-cache',
          what: 'painted from the last visit’s cached payload — not confirmed against the store',
          remedy: 'Reconnect, or wait for the next read to land.',
        },
      ],
    },
  ],
  [
    'amber-behind',
    {
      state: 'amber',
      causes: [
        {
          id: 'app-behind-main',
          what: 'this app is 7 commits behind main, so it is asking about criteria that have since moved',
          remedy: 'Rebuild and relaunch to update.',
        },
      ],
    },
  ],
  [
    'amber-both',
    {
      state: 'amber',
      causes: [
        {
          id: 'serving-cache',
          what: 'painted from the last visit’s cached payload — not confirmed against the store',
          remedy: 'Reconnect, or wait for the next read to land.',
        },
        {
          id: 'app-behind-main',
          what: 'this app is 7 commits behind main, so it is asking about criteria that have since moved',
          remedy: 'Rebuild and relaunch to update.',
        },
      ],
    },
  ],
  ['red', { state: 'red', causes: [] }],
]);

/** The preset names, for the dev hint strip. */
export const DEV_CURRENCY_NAMES = [...CURRENCY_PRESETS.keys()];

function readCurrencyOverride(): MapCurrencyReading | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const name = new URLSearchParams(window.location.search).get('devCurrency');
  if (name === null || name === '') return null;
  return CURRENCY_PRESETS.get(name) ?? null;
}

/**
 * In a Vite dev build, returns the synthetic currency reading named by `?devCurrency=<name>` (or
 * null when absent/unknown/prod), re-read on hashchange/popstate so flipping the query in the
 * address bar takes effect without reloading the SPA shell.
 */
export function useDevCurrencyOverride(): MapCurrencyReading | null {
  const [override, setOverride] = useState<MapCurrencyReading | null>(readCurrencyOverride);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const reread = (): void => setOverride(readCurrencyOverride());
    window.addEventListener('popstate', reread);
    window.addEventListener('hashchange', reread);
    return () => {
      window.removeEventListener('popstate', reread);
      window.removeEventListener('hashchange', reread);
    };
  }, []);
  return override;
}
