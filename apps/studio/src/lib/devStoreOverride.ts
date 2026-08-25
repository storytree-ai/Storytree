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

// ── THE DATABASE-CONNECTION LIGHT'S OWN DEV OVERRIDE (`store-connection-signal`) ────────────────
//
// Same shim, same file, same reason: the light's APPEARANCE is operator-attested (ADR-0070 stage 2)
// and on a working machine only GREEN occurs naturally. The honest alternatives are stopping the
// shared Cloud SQL instance — which every other session on the box is using — or waiting for an
// outage, so the override exists to let the owner look without breaking anything.
//
// It substitutes the INPUT, not the reading: the preset resolves to a `StorePhase`, which is what
// `storeConnection()` maps. So what the owner is looking at is the real instrument on a synthetic
// phase, never a hand-drawn picture of one.
//
// INERT IN A PRODUCTION BUILD (`import.meta.env.DEV` is false there), exactly like the load-screen
// override above, so it can never reach the hosted studio. Note the presets deliberately do NOT
// reuse `?devLoadState`: those swap the whole load screen, so the map — and therefore this chip —
// is not on screen for any of them.

/** The phases the owner can force via `?devConnection=<name>`, one per rendered state. */
const CONNECTION_PRESETS: ReadonlyMap<string, StorePhase> = new Map([
  ['connected', 'healthy'],
  ['connecting', 'starting'],
  ['not-connected', 'unreachable'],
]);

/** The preset names, for the dev hint strip. */
export const DEV_CONNECTION_NAMES = [...CONNECTION_PRESETS.keys()];

function readConnectionOverride(): StorePhase | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const name = new URLSearchParams(window.location.search).get('devConnection');
  if (name === null || name === '') return null;
  return CONNECTION_PRESETS.get(name) ?? null;
}

/**
 * In a Vite dev build, returns the synthetic store phase named by `?devConnection=<name>` (or null
 * when absent/unknown/prod), re-read on hashchange/popstate so flipping the query in the address bar
 * takes effect without reloading the SPA shell.
 */
export function useDevConnectionPhase(): StorePhase | null {
  const [override, setOverride] = useState<StorePhase | null>(readConnectionOverride);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const reread = (): void => setOverride(readConnectionOverride());
    window.addEventListener('popstate', reread);
    window.addEventListener('hashchange', reread);
    return () => {
      window.removeEventListener('popstate', reread);
      window.removeEventListener('hashchange', reread);
    };
  }, []);
  return override;
}
