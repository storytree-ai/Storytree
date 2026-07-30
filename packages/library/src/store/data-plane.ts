// The data-plane reachability refusal (ADR-0250, amending ADR-0089).
//
// A Claude Code REMOTE session (the web/VM container) can NEVER open a Postgres *data* connection.
// (It could once still reach the Cloud SQL Admin REST *control* plane over 443; that went away with
// the `storytree-remote-dev` identity, retired 2026-07-27 — ADR-0254 D4.) ADR-0089 first attributed
// the data-plane failure to
// a port block; the 2026-07-26 re-measurement corrected the mechanism (ADR-0250): the agent proxy
// DOES CONNECT-tunnel arbitrary ports, but it re-terminates TLS, and TLS on any non-443 port is
// reset. The Cloud SQL connector needs client-mTLS on 3307 — which the proxy's own policy lists as
// unsupported, "report, do not work around".
//
// Left alone the failure is a HANG, not an error: `probeLiveDb` burns its 45s budget, reports the DB
// unreachable, and `ensureDbUp` then spends its whole multi-minute cold-start poll starting an instance that was never
// the problem. Nearly eight minutes to learn nothing. This module turns that into an immediate,
// legible refusal that names the real mechanism.
//
// PURE over its injected environment + directory probe, so the whole decision is offline-testable.

/** Env var that force-allows the data plane, for an environment whose egress has since been fixed. */
export const ALLOW_DATA_PLANE_ENV = "STORYTREE_ALLOW_DATA_PLANE";

/**
 * The harness's own remote-container marker directory. Its `README.md` carries the proxy policy that
 * names client-mTLS / non-443 HTTPS / raw-TCP databases as unsupported — the authority this refusal
 * cites. Observed at this path in a remote session on 2026-07-26.
 */
export const REMOTE_MARKER_DIR = "/root/.ccr";

/** The GCP credential shape a remote session is handed — a JSON key in env, not an ADC file. */
const REMOTE_CREDENTIAL_ENV = "GOOGLE_APPLICATION_CREDENTIALS_JSON";

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const;

/** Environment reader — `process.env` in production, a literal in tests. */
export type EnvLike = Record<string, string | undefined>;

export interface DataPlaneProbe {
  /** Does this directory exist? (`fs.existsSync` in production.) */
  dirExists: (path: string) => boolean;
}

const isSet = (v: string | undefined): boolean => v !== undefined && v.trim() !== "";

/**
 * Is this a session whose egress cannot carry a Postgres data connection?
 *
 * Deliberately CONSERVATIVE — a false positive refuses the owner's own laptop (breaking the daily
 * driver), while a false negative merely leaves today's hang in place. So it fires only on evidence:
 *
 *   - the harness's remote marker directory exists; OR
 *   - a remote-shaped GCP credential (a JSON key in env) AND an egress proxy are BOTH configured.
 *
 * Neither holds on a laptop session (measured 2026-07-26: no marker dir, no JSON-key env, no proxy
 * vars). {@link ALLOW_DATA_PLANE_ENV} overrides to `false` unconditionally.
 */
export function isDataPlaneBlockedSession(env: EnvLike, probe: DataPlaneProbe): boolean {
  if (isSet(env[ALLOW_DATA_PLANE_ENV])) return false;
  if (probe.dirExists(REMOTE_MARKER_DIR)) return true;
  const proxied = PROXY_ENV_KEYS.some((k) => isSet(env[k]));
  return isSet(env[REMOTE_CREDENTIAL_ENV]) && proxied;
}

/**
 * The refusal message: `null` when the data plane may be dialled, otherwise the operator-facing
 * explanation. It names the MECHANISM (so no session re-derives it), what still works, and the ADR —
 * and it offers the override, so an environment whose egress is later fixed is not bricked by this.
 */
export function dataPlaneRefusal(env: EnvLike, probe: DataPlaneProbe): string | null {
  if (!isDataPlaneBlockedSession(env, probe)) return null;
  return [
    "live store refused: this session's egress cannot carry a Postgres data connection (ADR-0250).",
    "",
    "Mechanism (measured, not inferred): the agent proxy CONNECT-tunnels arbitrary ports, but it",
    "re-terminates TLS and resets TLS on any non-443 port. The Cloud SQL connector needs client-mTLS",
    "on port 3307, which the proxy's own policy lists as unsupported — report, do not work around.",
    "",
    "Still available here: the whole offline gate (pnpm -r typecheck, pnpm -r test) and every read",
    "command — they run on the in-memory seed.",
    "",
    "Blocked: --pg writes, --store pg, and live/--real builds that persist verdicts. Since the",
    "storytree-remote-dev identity was retired (ADR-0254 D4) this session holds no GCP credential at",
    "all, so the Cloud SQL Admin REST control plane (db:status / db:up) is gone too.",
    "",
    "Do this work from a laptop/direct-network session (ADR-0089 D1).",
    `If this environment's egress has since changed, set ${ALLOW_DATA_PLANE_ENV}=1 to dial anyway.`,
  ].join("\n");
}
