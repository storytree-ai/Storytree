// Unit tests for the studio's WAKE-AUTHORIZATION invariant (guestPolicy.ts) — the chicken-and-egg at
// the heart of studio-cloud `hosted-db-wake` (ADR-0049). When the live store is DOWN, membership
// can't be resolved from the (down) users projection, so the StoreBanner's "Wake the database"
// affordance MUST be authorized off the env SEED (STORYTREE_STUDIO_ADMINS) — never the projection —
// or the button is hidden exactly when an admin needs it (the affordance regresses to "fall back to
// pnpm db:up in a terminal"). serveApi.integration.test.ts exercises this end-to-end over http; these
// pin the same invariant at the PURE layer — `mayWakeDb`, `createDegradedPolicy` (store-down), and
// `createMembersPolicy`/`meFromAccess` (store-up) — so a regression in the policy logic fails fast
// and in isolation rather than only as one assertion buried in a 25-case http suite.

import { describe, it, expect } from 'vitest';
import { parseSeedAdmins, type ResolvedAccess } from '@storytree/studio-members';
import { HttpError } from './httpUtil';
import { mayWakeDb, createDegradedPolicy, createMembersPolicy } from './guestPolicy';

const SEED = parseSeedAdmins('owner@example.com');
const ADMIN = 'owner@example.com'; // in the seed
const MEMBER = 'member@example.com'; // not in the seed

const adminAccess: ResolvedAccess = { email: ADMIN, role: 'admin', status: 'active', seeded: true };
const memberAccess: ResolvedAccess = { email: MEMBER, role: 'member', status: 'active', seeded: false };

/** Run a gate call and return the HttpError it throws (or null if it permits the request). */
function gateError(policy: { gate: (m: string, p: string) => void }, method: string, path: string): HttpError | null {
  try {
    policy.gate(method, path);
    return null;
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
}

describe('mayWakeDb — only a SEED admin may wake a stopped DB', () => {
  it('true for a seed admin, false for a non-seed identity', () => {
    expect(mayWakeDb(ADMIN, SEED)).toBe(true);
    expect(mayWakeDb(MEMBER, SEED)).toBe(false);
  });

  it('false with no identity, and false against an empty seed (no admin configured)', () => {
    expect(mayWakeDb(null, SEED)).toBe(false);
    expect(mayWakeDb(ADMIN, parseSeedAdmins(''))).toBe(false);
    expect(mayWakeDb(ADMIN, parseSeedAdmins(undefined))).toBe(false);
  });

  it('normalises the identity so the match is case-insensitive on both sides', () => {
    // The seed set is already lower-cased by parseSeedAdmins; the identity must be folded too, or a
    // mixed-case verified email would be wrongly refused the wake (consistent with resolveAccess,
    // which normalises its verified email). Defence-in-depth: identityFromRequest lowercases live.
    expect(mayWakeDb('Owner@Example.Com', SEED)).toBe(true);
    expect(mayWakeDb('  owner@example.com', SEED)).toBe(true);
  });
});

describe('createDegradedPolicy — store down: a seed admin can still wake it (ADR-0049)', () => {
  it('me carries storeUnreachable + canWakeDb:true for a seed admin', () => {
    const me = createDegradedPolicy(ADMIN, SEED).me;
    expect(me).toMatchObject({ email: ADMIN, member: false, role: null, storeUnreachable: true, canWakeDb: true });
  });

  it('me carries canWakeDb:false for a non-seed member (no billable start off a non-admin)', () => {
    const me = createDegradedPolicy(MEMBER, SEED).me;
    expect(me).toMatchObject({ member: false, storeUnreachable: true, canWakeDb: false });
  });

  it('gate: POST /api/db/wake is permitted for a seed admin, 403 for a non-seed member', () => {
    expect(gateError(createDegradedPolicy(ADMIN, SEED), 'POST', '/api/db/wake')).toBeNull();
    expect(gateError(createDegradedPolicy(MEMBER, SEED), 'POST', '/api/db/wake')?.status).toBe(403);
  });

  it('gate: keeps /api/health + /api/me alive but 503s the rest of the corpus', () => {
    const p = createDegradedPolicy(ADMIN, SEED);
    expect(gateError(p, 'GET', '/api/health')).toBeNull();
    expect(gateError(p, 'GET', '/api/me')).toBeNull();
    expect(gateError(p, 'GET', '/api/tree')?.status).toBe(503);
    expect(gateError(p, 'GET', '/api/assets')?.status).toBe(503);
  });

  it('gate: an identity-less request is 401 before any wake is considered', () => {
    const p = createDegradedPolicy(null, SEED);
    expect(gateError(p, 'POST', '/api/db/wake')?.status).toBe(401);
    expect(p.me.canWakeDb).toBe(false);
  });
});

describe('createMembersPolicy / meFromAccess — store up: canWakeDb rides the resolved role', () => {
  it('a resolved admin gets canWakeDb:true (and no storeUnreachable flag)', () => {
    const me = createMembersPolicy(ADMIN, adminAccess).me;
    expect(me).toMatchObject({ email: ADMIN, role: 'admin', member: true, canWakeDb: true });
    expect(me.storeUnreachable).toBeUndefined();
  });

  it('a resolved member gets canWakeDb:false', () => {
    expect(createMembersPolicy(MEMBER, memberAccess).me).toMatchObject({ role: 'member', member: true, canWakeDb: false });
  });

  it('a non-member (null access) gets member:false, canWakeDb:false', () => {
    expect(createMembersPolicy('stranger@example.com', null).me).toMatchObject({ member: false, role: null, canWakeDb: false });
  });

  it('gate: a non-member is served only /api/me; everything else is 403 + requestAccess', () => {
    const p = createMembersPolicy('stranger@example.com', null);
    expect(gateError(p, 'GET', '/api/me')).toBeNull();
    const corpus = gateError(p, 'GET', '/api/tree');
    expect(corpus?.status).toBe(403);
    expect(corpus?.details).toMatchObject({ requestAccess: true });
  });
});
