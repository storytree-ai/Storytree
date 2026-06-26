// State-machine tests for the studio's honest load + store-down screen (deriveLoadState).
// The owner principle is HONESTY OVER REASSURANCE (incident 2026-06-27): never imply success,
// never hang silently. These pin the transitions that make that true, with NO DOM — the whole
// decision is a pure function so it can be exhaustively asserted:
//   • storeUnreachable → asleep, WITH the wake button for a seed admin / WITHOUT for a member
//   • api.me rejected  → an explicit error screen (the genuine-fault path), not a sleeping-DB screen
//   • CHECKING is the resolving state and is bounded (it is only ever 'loading' / unresolved me)
//   • STARTING vs TAKING-LONGER is purely the elapsed-time threshold while the store boots
//   • server-lost outranks both a generic me-error and the asleep arc (the more specific truth)

import { describe, it, expect } from 'vitest';
import { deriveLoadState, TAKING_LONGER_MS, type LoadState } from './loadState';
import type { MeInfo } from '../types';
import type { StorePhase } from '../components/StoreBanner';

// A resolved member on a healthy store; spread + override per case.
const member: MeInfo = { email: 'm@x.dev', role: 'member', status: 'active', member: true };
const admin: MeInfo = { email: 'a@x.dev', role: 'admin', status: 'active', member: true };
const nonMember: MeInfo = { email: 'guest@x.dev', role: null, status: null, member: false };

/** A storeUnreachable MeInfo (the server's degraded 200) — wake-capable or not. */
const downStore = (canWakeDb: boolean): MeInfo => ({
  email: canWakeDb ? 'a@x.dev' : 'm@x.dev',
  role: canWakeDb ? 'admin' : 'member',
  status: null,
  member: false,
  storeUnreachable: true,
  canWakeDb,
});

describe('deriveLoadState — CHECKING is the resolving state and is bounded', () => {
  it('is checking while membership is still loading, regardless of phase', () => {
    expect(deriveLoadState('loading', null, 'unknown', 0)).toEqual({ kind: 'checking' });
    // A non-null me arriving before meStatus flips is still treated as not-yet-resolved.
    expect(deriveLoadState('loading', member, 'healthy', 0)).toEqual({ kind: 'checking' });
  });

  it('is checking when ready but me has not arrived yet (never a null-deref, never a hang)', () => {
    expect(deriveLoadState('ready', null, 'unknown', 0)).toEqual({ kind: 'checking' });
  });
});

describe('deriveLoadState — ASLEEP/UNREACHABLE honestly offers wake vs wait', () => {
  it('a seed admin (canWakeDb) gets the wake affordance', () => {
    expect(deriveLoadState('ready', downStore(true), 'unreachable', 0)).toEqual({
      kind: 'asleep',
      canWake: true,
    });
    // 'stopped' is the same asleep screen — the local gcloud split is StoreBanner's concern.
    expect(deriveLoadState('ready', downStore(true), 'stopped', 0)).toEqual({
      kind: 'asleep',
      canWake: true,
    });
  });

  it('a member (no canWakeDb) gets asleep WITHOUT wake — they wait for an admin', () => {
    expect(deriveLoadState('ready', downStore(false), 'unreachable', 0)).toEqual({
      kind: 'asleep',
      canWake: false,
    });
  });

  it('treats a missing canWakeDb as not-wakeable (fail-closed)', () => {
    const noFlag: MeInfo = { ...member, member: false, storeUnreachable: true };
    expect(deriveLoadState('ready', noFlag, 'unreachable', 0)).toEqual({
      kind: 'asleep',
      canWake: false,
    });
  });
});

describe('deriveLoadState — STORE-FAULT when the two signals disagree (sleep vs fault)', () => {
  // The owner's "so I can tell if there IS an issue" case: membership couldn't resolve, but the
  // independent /api/health poll says the DB is reachable. That is NOT a sleep — never tell the
  // user to wake an already-running DB.
  it('storeUnreachable + health says DB reachable (healthy) → store-fault, not asleep', () => {
    expect(deriveLoadState('ready', downStore(true), 'healthy', 0)).toEqual({ kind: 'store-fault' });
    // Even for a wake-capable admin: a running DB has nothing to wake — fault, not the wake screen.
    expect(deriveLoadState('ready', downStore(false), 'healthy', 0)).toEqual({
      kind: 'store-fault',
    });
  });

  it('a reachable-but-stale-code DB is still reachable → store-fault, not asleep', () => {
    expect(deriveLoadState('ready', downStore(true), 'stale-code', 0)).toEqual({
      kind: 'store-fault',
    });
  });

  it('storeUnreachable + health also unreachable → asleep (the signals AGREE)', () => {
    expect(deriveLoadState('ready', downStore(true), 'unreachable', 0)).toEqual({
      kind: 'asleep',
      canWake: true,
    });
  });
});

describe('deriveLoadState — STARTING vs TAKING-LONGER is the elapsed threshold', () => {
  it('shows starting while the boot is within the ~1-minute expectation', () => {
    expect(deriveLoadState('ready', downStore(true), 'starting', 0)).toEqual({ kind: 'starting' });
    expect(deriveLoadState('ready', downStore(true), 'starting', TAKING_LONGER_MS - 1)).toEqual({
      kind: 'starting',
    });
  });

  it('admits TAKING-LONGER once the boot runs past the threshold — honest, not implied success', () => {
    expect(deriveLoadState('ready', downStore(true), 'starting', TAKING_LONGER_MS)).toEqual({
      kind: 'taking-longer',
    });
    expect(deriveLoadState('ready', downStore(false), 'starting', TAKING_LONGER_MS + 60_000)).toEqual(
      { kind: 'taking-longer' },
    );
  });
});

describe('deriveLoadState — ERROR is the genuine-fault path, distinct from a sleeping DB', () => {
  it('a rejected api.me is an explicit error screen (never a blank screen / eternal spinner)', () => {
    expect(deriveLoadState('error', null, 'unknown', 0)).toEqual({ kind: 'error', message: '' });
  });

  it('server-lost outranks a generic me-error (the more specific, honest truth)', () => {
    expect(deriveLoadState('error', null, 'server-lost', 0)).toEqual({ kind: 'server-lost' });
  });

  it('server-lost during the store-down arc beats the asleep screen', () => {
    expect(deriveLoadState('ready', downStore(true), 'server-lost', 0)).toEqual({
      kind: 'server-lost',
    });
  });
});

describe('deriveLoadState — resolved + store up routes to app or the access wall', () => {
  it('a resolved member on a healthy store gets the app', () => {
    expect(deriveLoadState('ready', member, 'healthy', 0)).toEqual({ kind: 'app' });
    expect(deriveLoadState('ready', admin, 'healthy', 0)).toEqual({ kind: 'app' });
  });

  it('a resolved non-member on a healthy store gets the request-access wall with their email', () => {
    expect(deriveLoadState('ready', nonMember, 'healthy', 0)).toEqual({
      kind: 'request-access',
      email: 'guest@x.dev',
    });
  });

  it('storeUnreachable is never read as "member" — the down arc wins even for a would-be member', () => {
    const memberButDown: MeInfo = { ...member, storeUnreachable: true, canWakeDb: false };
    const s: LoadState = deriveLoadState('ready', memberButDown, 'unreachable', 0);
    expect(s.kind).toBe('asleep');
  });
});
