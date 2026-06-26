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
const PRESETS: Record<string, DevOverride> = {
  checking: { meStatus: 'loading', me: null, phase: 'unknown', elapsedMs: 0 },
  'asleep-admin': { meStatus: 'ready', me: downAdmin, phase: 'unreachable', elapsedMs: 0 },
  'asleep-member': { meStatus: 'ready', me: downMember, phase: 'unreachable', elapsedMs: 0 },
  // storeUnreachable yet /api/health says the DB is reachable → a fault, not a sleep.
  'store-fault': { meStatus: 'ready', me: downAdmin, phase: 'healthy', elapsedMs: 0 },
  starting: { meStatus: 'ready', me: downAdmin, phase: 'starting', elapsedMs: 30_000 },
  'taking-longer': {
    meStatus: 'ready',
    me: downAdmin,
    phase: 'starting',
    elapsedMs: TAKING_LONGER_MS + 30_000,
  },
  'server-lost': { meStatus: 'error', me: null, phase: 'server-lost', elapsedMs: 0 },
  error: { meStatus: 'error', me: null, phase: 'unknown', elapsedMs: 0 },
};

/** The preset names, for the dev hint strip. */
export const DEV_OVERRIDE_NAMES = Object.keys(PRESETS);

function readOverride(): DevOverride | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const name = new URLSearchParams(window.location.search).get('devLoadState');
  if (name === null || name === '') return null;
  return PRESETS[name] ?? null;
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
