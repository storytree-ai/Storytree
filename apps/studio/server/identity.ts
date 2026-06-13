// Verified identity for the hosted studio (ADR-0042 d.2, studio-hosting
// `guest-scope`): IAP authenticates every request at the edge and injects the
// signed-in user as `x-goog-authenticated-user-email` ("accounts.google.com:
// user@example.com"). The deployment invariant — ingress is IAP-only — is what
// makes trusting the header acceptable for a trusted circle; verifying the
// `x-goog-iap-jwt-assertion` signature is the named hardening if exposure ever
// widens. No I/O here: pure header parsing plus the local-trial override.

import type { IncomingMessage } from 'node:http';

/** The header IAP strips from external traffic and re-adds with the verified user. */
export const IAP_EMAIL_HEADER = 'x-goog-authenticated-user-email';

/** Env var for trying guarded mode locally (never applies when the real header is present). */
export const DEV_IDENTITY_ENV = 'STORYTREE_STUDIO_DEV_IDENTITY';

/**
 * PURE: the verified email from an IAP-style header value — the part after the
 * last `:` ("accounts.google.com:a@b.c" → "a@b.c"), lowercased. Null for blank.
 */
export function emailFromIapHeader(value: string): string | null {
  const email = value.slice(value.lastIndexOf(':') + 1).trim().toLowerCase();
  return email || null;
}

/**
 * The caller's verified identity: the IAP header when present, else the local
 * dev override (so guarded mode is triable on a laptop), else null — and null
 * is what the policy refuses with a 401 (fail-closed, ADR-0042 d.2).
 */
export function identityFromRequest(
  req: IncomingMessage,
  devOverride: string | undefined = process.env[DEV_IDENTITY_ENV],
): string | null {
  const raw = req.headers[IAP_EMAIL_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value) return emailFromIapHeader(value);
  const fallback = devOverride?.trim().toLowerCase();
  return fallback || null;
}
