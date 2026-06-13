// The hosted studio's authorization (ADR-0043, trusted-circle-users `app-authorization`):
// IAP authenticates (the verified email is present); the APP authorizes from its own users
// projection. This evolves the old guest/admin allowlist function into a role lookup:
//
//   - no identity              → 401 (fail-closed; ingress is IAP-only, so this is a misconfig)
//   - identity, not a member   → 403 + a `requestAccess` marker on EVERY /api/* except GET /api/me
//                                (the corpus — tree/library/docs/comments — is served nothing)
//   - member                   → read everything + comment as self (the ADR-0042 guest scope)
//   - admin                    → additionally: asset writes + user management + attestations
//
// `STORYTREE_STUDIO_ADMINS` survives ONLY as a bootstrap seed (ADR-0043 d.4): a listed email is an
// effective active admin on first sign-in, so there is always a first admin who can invite the rest.
// Membership resolution also ACTIVATES: a seeded admin (no row) is persisted as an active admin, and
// an `invited` row flips to `active` on first request. Pure decisions over (method, path, access);
// the one impure step — reading the projection + the activation upsert — is `resolveCircleAccess`.

import { resolveAccess, parseSeedAdmins, type ResolvedAccess } from '@storytree/core';
import { HttpError } from './httpUtil';
import type { ApiPolicy, MeInfo } from './apiRouter';
import type { LibraryBackend } from './libraryBackend';

/** Env var holding the comma-separated bootstrap-admin seed (ADR-0043 d.4). */
export const ADMINS_ENV = 'STORYTREE_STUDIO_ADMINS';

/** PURE: parse the bootstrap-admin seed (comma-separated, case-insensitive) — re-exported from core. */
export { parseSeedAdmins };

/**
 * Resolve a verified email to its circle access, ACTIVATING along the way (ADR-0043 d.3/d.4):
 *  - no identity → `null` (the gate refuses with 401).
 *  - not a member and not seeded → `null` (the request-access wall).
 *  - seeded admin with no row → persisted as an active admin row, returned as admin/active.
 *  - an `invited` row → flipped to `active` (role + invitedBy preserved), returned active.
 *  - an `active` row → returned as-is (no write, so steady-state requests are read-only).
 *
 * May throw if the store is unreachable (the caller degrades health/me and 503s the rest).
 */
export async function resolveCircleAccess(
  backend: Pick<LibraryBackend, 'listUsers' | 'upsertUser'>,
  identity: string | null,
  seedAdmins: ReadonlySet<string>,
): Promise<ResolvedAccess | null> {
  if (!identity) return null;
  const users = await backend.listUsers();
  const access = resolveAccess(users, identity, seedAdmins);
  if (access === null) return null;
  const now = new Date().toISOString();
  if (access.seeded) {
    // Bootstrap: a seed admin with no row becomes a persisted active admin.
    await backend.upsertUser(
      { email: access.email, role: 'admin', status: 'active', invitedBy: null, createdAt: now, lastSeenAt: now },
      access.email,
    );
    return access; // already { role: 'admin', status: 'active' }
  }
  const row = users.find((u) => u.email === access.email);
  if (row && row.status === 'invited') {
    // Activation: flip invited → active; spread the row so role/invitedBy/createdAt survive.
    await backend.upsertUser({ ...row, status: 'active', lastSeenAt: now }, access.email);
    return { ...access, status: 'active' };
  }
  return access;
}

/** The `/api/me` payload for a resolved (or unresolved) caller. */
function meFromAccess(identity: string | null, access: ResolvedAccess | null): MeInfo {
  if (access === null) return { email: identity, role: null, status: null, member: false };
  return { email: access.email, role: access.role, status: access.status, member: true };
}

/**
 * The per-request policy injected into the route table. `null` access = a non-member (or no
 * identity): served nothing but `GET /api/me`. User management is admin-only by path; asset and
 * other non-comment writes are admin-only by method.
 */
export function createCirclePolicy(identity: string | null, access: ResolvedAccess | null): ApiPolicy {
  const isAdmin = access?.role === 'admin';
  return {
    gate(method: string, pathname: string): void {
      if (!identity) {
        throw new HttpError(401, 'identity required — this studio is served behind IAP');
      }
      if (pathname === '/api/me') return; // the one endpoint a non-member may reach
      if (access === null) {
        // Non-member: the corpus (tree/library/docs/comments) is served nothing.
        throw new HttpError(403, 'not a member of the trusted circle', { requestAccess: true });
      }
      // User management is admin-only (any method); asset/other writes are admin-only too. Comment
      // writes stay open to members (scoped to own comments below); GETs read the whole corpus.
      const adminOnly =
        pathname === '/api/users' ||
        pathname.startsWith('/api/users/') ||
        (method !== 'GET' && pathname !== '/api/comments');
      if (adminOnly && !isAdmin) {
        throw new HttpError(403, 'member scope — asset editing and user management are admin-only (ADR-0043)');
      }
    },
    commentScope: access ? { author: access.email, ownOnly: !isAdmin } : null,
    me: meFromAccess(identity, access),
  };
}

/**
 * The degraded policy when the live store can't be reached to resolve membership: keep the
 * diagnostic endpoints alive (`/api/health` drives the store banner; `/api/me` reports the outage)
 * and 503 everything else, rather than 500-ing or silently locking the circle out.
 */
export function createDegradedPolicy(identity: string | null): ApiPolicy {
  return {
    gate(_method: string, pathname: string): void {
      if (!identity) {
        throw new HttpError(401, 'identity required — this studio is served behind IAP');
      }
      if (pathname === '/api/health' || pathname === '/api/me') return;
      throw new HttpError(503, 'live store unreachable — membership cannot be resolved right now');
    },
    commentScope: null,
    me: { email: identity, role: null, status: null, member: false, storeUnreachable: true },
  };
}
