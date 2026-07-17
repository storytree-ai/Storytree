// loopback-guard — the auth / CSRF / DNS-rebinding wall for the desktop's loopback HTTP surfaces
// (the thick-local backend SIDECAR dispatch in electron/backend-entry.ts and the `/api/*` PROXY in
// electron/static-server.ts). ADR-0119 §1 binds the sidecar to an ephemeral 127.0.0.1 port; loopback
// binding stops LAN reach, but it is NOT an authentication boundary — any web page the user visits can
// port-scan localhost and fire a CORS-"simple" (text/plain) POST at a side-effecting route with no
// preflight, and DNS rebinding lets a remote page reach a same-origin-looking Host. The side-effecting
// routes (POST /api/chat starts an autonomous session-orchestrator that writes files, runs bash, and
// opens auto-merging PRs; POST /api/build, /api/adopt, /api/uat/attest, /api/forest/write) MUST be gated.
//
// THE WALL (applied to every STATE-MUTATING request; read-only GET/HEAD stay lenient):
//   1. Origin — a present `Origin` must be a loopback origin (the renderer's own origin is
//      http://127.0.0.1:<studioPort>); any remote origin is refused. Blocks cross-origin browser CSRF.
//   2. Host — the `Host` must be a loopback host. A DNS-rebinding page carries its OWN domain in Host
//      (the browser sets Host from the URL authority, which the attacker controls only as their domain),
//      so a non-loopback Host is the rebinding tell. Blocks DNS rebinding.
//   3. Token — a per-launch random secret the Electron main mints and the trusted static-server proxy
//      injects on every proxied request (never exposed to the renderer or any page). The sidecar requires
//      it on mutating routes, so a request reaching the sidecar's ephemeral port by any path OTHER than
//      our proxy (a local non-browser process; a browser page that somehow cleared 1+2) is refused. This
//      is the robust defense-in-depth over Origin/Host, which a non-browser client can forge at will.
//
// No `electron` import, no `node:` import — headlessly provable (loopback-guard.test.ts), the same
// discipline as open-link-policy.ts / pty-session-manager.ts.

/** The header carrying the per-launch shared secret the trusted proxy injects (lower-case: node's
 *  `req.headers` keys are already lower-cased, and this is compared against them directly). */
export const SIDECAR_TOKEN_HEADER = "x-storytree-sidecar-token";

/** Methods that never mutate state — the gate lets these through untouched (the boot read routes). */
const READ_ONLY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** The exact loopback hostnames the WHATWG parser normalizes to (IPv4 loopback, `localhost`, IPv6 ::1). */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Normalize a `Host`/`Origin` authority (`host[:port]`, `[ipv6]:port`) to a bare, lower-cased hostname
 * via the WHATWG URL parser — it strips the port, unwraps `[::1]` → `::1`, lower-cases the host, and
 * rejects the tab/newline obfuscation a naive split would miss. Returns null when unparseable.
 */
function hostnameOf(authority: string): string | null {
  try {
    const { hostname } = new URL(`http://${authority}`);
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

/** Whether a normalized hostname is loopback: `localhost`, `::1`, or anything in 127.0.0.0/8. The
 *  WHATWG parser returns IPv6 hosts bracketed (`[::1]`) and compressed, so strip the brackets first. */
function isLoopbackHostname(hostname: string): boolean {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (LOOPBACK_HOSTNAMES.has(bare)) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

/**
 * Whether the `Host` header names a loopback host — the DNS-rebinding defense. An absent Host is
 * refused for mutating requests (a browser always sends one; its absence is anomalous).
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined || host === "") return false;
  const hostname = hostnameOf(host);
  return hostname !== null && isLoopbackHostname(hostname);
}

/**
 * Whether an `Origin` header is acceptable for a mutating request: ABSENT (same-origin requests
 * routinely omit Origin) or a loopback http/https origin. A present remote origin — or the opaque
 * `null` origin (a sandboxed frame / `data:` document, never our renderer's) — is refused.
 */
export function isAcceptableOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === "") return true;
  if (origin === "null") return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isLoopbackHostname(url.hostname);
}

/** The four request facts the guard decides over — extracted from an `IncomingMessage` by {@link guardHttpRequest}. */
export interface GuardRequestFacts {
  method: string | undefined;
  origin: string | undefined;
  host: string | undefined;
  /** The value of {@link SIDECAR_TOKEN_HEADER} on the request, if any. */
  token: string | undefined;
}

export interface GuardOptions {
  /**
   * The per-launch secret a mutating request must carry (via {@link SIDECAR_TOKEN_HEADER}). Set on the
   * SIDECAR (which the proxy injects it for); OMIT on the proxy itself (the entry point has no upstream
   * token to check — it relies on Origin/Host, then injects the token downstream). An empty/undefined
   * value skips the token check (Origin/Host still enforced).
   */
  expectedToken?: string | undefined;
}

export type GuardVerdict = { ok: true } | { ok: false; status: number; reason: string };

/**
 * Decide whether a request may proceed. Read-only methods (GET/HEAD) always pass. Every other method
 * is a state-mutating request and must clear the Origin, Host, and (when configured) token checks;
 * the first failure returns a 403 with a terse reason. Pure — no I/O, no throw.
 */
export function guardRequest(facts: GuardRequestFacts, opts: GuardOptions = {}): GuardVerdict {
  const method = (facts.method ?? "GET").toUpperCase();
  if (READ_ONLY_METHODS.has(method)) return { ok: true };

  if (!isAcceptableOrigin(facts.origin)) {
    return { ok: false, status: 403, reason: `cross-origin request refused (origin: ${facts.origin ?? "<absent>"})` };
  }
  if (!isLoopbackHost(facts.host)) {
    return { ok: false, status: 403, reason: `non-loopback Host refused (host: ${facts.host ?? "<absent>"})` };
  }
  const expected = opts.expectedToken;
  if (expected !== undefined && expected !== "" && facts.token !== expected) {
    return { ok: false, status: 403, reason: "missing or invalid session token" };
  }
  return { ok: true };
}

/** A minimal structural view of `node:http`'s `IncomingMessage` — kept local so this module carries no `node:` import. */
export interface HttpRequestLike {
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

/** Pull the guard facts off an `IncomingMessage`-shaped request and decide. The convenience entry the servers call. */
export function guardHttpRequest(req: HttpRequestLike, opts: GuardOptions = {}): GuardVerdict {
  const pick = (name: string): string | undefined => {
    const raw = req.headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  return guardRequest(
    { method: req.method, origin: pick("origin"), host: pick("host"), token: pick(SIDECAR_TOKEN_HEADER) },
    opts,
  );
}
