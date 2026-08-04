/**
 * The CLI's STORE DOOR client selection (ADR-0259 D1) — how a session with no Cloud SQL connector
 * reads the live library.
 *
 * The CLI has had exactly two stores since ADR-0023: an offline `InMemoryStore` seeded from the
 * committed corpus (the default), and the live `PgLibraryStore` under `--pg`. Neither works from a
 * remote session (Claude Code on the web) once ADR-0302 lands: `--pg` cannot work there at all —
 * client-mTLS cannot survive the agent proxy's TLS re-termination, and no tunnel exists
 * (ADR-0250 / ADR-0258 D2) — and the offline seed is exactly what ADR-0302 D1/D2 decommit. This is
 * the third store: `HttpStore` against the studio's `/api/store` door, which is ordinary HTTPS on
 * 443 and therefore the one shape such a session CAN reach.
 *
 * ## Fail closed, never silently fall back
 *
 * A set-but-unusable `STORYTREE_STORE_URL` THROWS rather than degrading to the offline seed. The
 * silent fallback is the dangerous option specifically because of what this door is for: once the
 * seed stops being committed, falling back to it reads as an EMPTY corpus, and a session would then
 * report "no such artifact" for artifacts that exist. A loud refusal naming the bad value is the only
 * honest answer.
 */

/** The door's base URL, e.g. `https://storytree-studio-…run.app/api/store`. */
export const STORE_DOOR_URL_ENV = "STORYTREE_STORE_URL";

/**
 * Optional bearer token sent as `authorization: Bearer <token>`.
 *
 * This is a SEAT, not a decision: the credential a remote session should present to the hosted
 * studio is owner-gated and unsettled (the deployment is behind IAP, and ADR-0254 D4 retired the
 * `storytree-remote-dev` service account, so a remote container holds no GCP identity at all). Any
 * scheme that ends in a bearer token — an IAP-audience OIDC token, a proxy token, a local desktop
 * door needing none — is carried by this variable without changing this module.
 */
export const STORE_DOOR_TOKEN_ENV = "STORYTREE_STORE_TOKEN";

export interface StoreDoorConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

/** Thrown when the door is configured but unusable — never swallowed into an offline fallback. */
export class StoreDoorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreDoorConfigError";
  }
}

/**
 * PURE: resolve the door config from an environment. `null` = no door configured (the caller keeps
 * its existing offline / `--pg` behaviour); a config = use `HttpStore`; a throw = configured but
 * broken.
 *
 * `env` is injected rather than read off `process.env` so this is a unit, and so a test never has to
 * mutate global state.
 */
export function resolveStoreDoor(
  env: Record<string, string | undefined>,
): StoreDoorConfig | null {
  const raw = env[STORE_DOOR_URL_ENV]?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new StoreDoorConfigError(
      `${STORE_DOOR_URL_ENV} is not a valid URL: ${JSON.stringify(raw)} — expected the store door's ` +
        "mount point, e.g. https://<studio-host>/api/store",
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new StoreDoorConfigError(
      `${STORE_DOOR_URL_ENV} must be an http(s) URL, got ${JSON.stringify(parsed.protocol)} — the ` +
        "door is ordinary HTTPS on 443, which is the whole reason it exists (ADR-0258 D2)",
    );
  }

  const token = env[STORE_DOOR_TOKEN_ENV]?.trim();
  return {
    // Strip a trailing slash here as well as in HttpStore, so the value a caller sees in an error
    // message is the one actually dialled.
    baseUrl: raw.replace(/\/+$/, ""),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}
