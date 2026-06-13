// The hosted studio's guest policy (ADR-0042 d.3, studio-hosting `guest-scope`):
// read + comment for the trusted circle, asset writes for the admin allowlist,
// db control for nobody (that switch is structural — ApiContext.allowDbControl).
// Fail-closed: in guarded mode an /api/* request without a verified identity is
// refused outright. Pure decisions over (method, path, identity) — no I/O.

import { HttpError } from './httpUtil';
import type { ApiPolicy } from './apiRouter';

/** Env var holding the comma-separated admin email allowlist. */
export const ADMINS_ENV = 'STORYTREE_STUDIO_ADMINS';

/** PURE: parse the admin allowlist env value (comma-separated, case-insensitive). */
export function parseAdmins(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * The per-request policy the hosted server injects into the route table:
 *
 * - no identity → 401 for every /api/* (the static bundle stays open; ingress
 *   is IAP-only, so an identity-less API hit is a misconfiguration, not a user)
 * - GET → allowed for everyone authenticated
 * - /api/comments writes → allowed; authorship is STAMPED from the identity and
 *   non-admins may only touch their own comments (commentScope)
 * - any other write → admins only (the asset editor stays owner-side)
 */
export function createGuestPolicy(
  identity: string | null,
  admins: ReadonlySet<string>,
): ApiPolicy {
  const isAdmin = identity !== null && admins.has(identity);
  return {
    gate(method: string, pathname: string): void {
      if (!identity) {
        throw new HttpError(401, 'identity required — this studio is served behind IAP');
      }
      if (method === 'GET') return;
      if (pathname === '/api/comments') return; // scoped in handleComments
      if (isAdmin) return;
      throw new HttpError(403, 'read + comment scope — asset editing is owner-side (ADR-0042)');
    },
    commentScope: identity ? { author: identity, ownOnly: !isAdmin } : null,
  };
}
