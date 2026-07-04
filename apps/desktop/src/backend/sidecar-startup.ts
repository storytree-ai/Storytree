// Sidecar startup diagnostics + graceful-degrade helpers (desktop-orchestrator-full-autonomy, Inc 1).
//
// WHY THIS EXISTS: the thick-local backend sidecar (electron/backend-entry.ts) used to `await
// createPool()` unconditionally at startup. When the DB is down/unreachable — or, worse, when a stale
// `node_modules` can't even resolve an organism import (`@storytree/notice-board`) — the sidecar threw
// before it ever listened, and electron/main.ts surfaced only a GENERIC
// "backend sidecar exited (code 1) before reporting a port". The real cause never reached the operator:
// they had to re-run the commands by hand to see the actual throw.
//
// Two pure cores fix that, both CI-provable here; the electron glue that consumes them (main.ts spawn,
// backend-entry.ts wiring) stays operator-attested (a node:test over it would open a real DB / spawn a
// billed SDK session):
//   - `acquireBackendStore` — wrap the pool factory so a failure becomes a TYPED degraded result, not a
//     throw, carrying the reason. The sidecar can then still listen + serve the read shell.
//   - `degradedBackend` — the read backend used when there is no pool: health `unreachable`, empty
//     assets, null overlays. /api/health then drives the studio's "Start DB" banner instead of the
//     window failing to open.
//   - `tailText` / `describeSidecarExit` — format the child's captured stderr tail into main.ts's
//     rejection message so the `[main]` line is self-contained (the real cause, not a generic code 1).

import type { LocalBackendBackend } from "./local-backend.js";

/**
 * The outcome of trying to acquire the backend store (pool). `ok` carries the live handle; a failure is
 * a typed degraded result carrying the human-readable `reason` (the caught error's message) so the
 * caller can log it and serve a degraded read shell rather than crashing the sidecar.
 */
export type StoreAcquisition<T> =
  | { ok: true; handle: T }
  | { ok: false; reason: string };

/**
 * Acquire the backend store tolerantly: run `create` and, if it rejects (down DB, missing IAM user,
 * unresolved organism import surfaced as a rejected dynamic import), capture the reason instead of
 * letting it propagate. The sidecar uses the degraded branch to still listen + serve the read shell.
 *
 * Generic over the handle type so this helper never imports `pg` — it stays a pure, browser-safe core.
 */
export async function acquireBackendStore<T>(
  create: () => Promise<T>,
): Promise<StoreAcquisition<T>> {
  try {
    return { ok: true, handle: await create() };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The read backend served when the store could not be acquired. Every route stays HONEST about the
 * absence: `health` reports `unreachable` (the signal the studio turns into its "Start DB" banner),
 * `listAssets` is empty (the authored tree still renders from the local stories/ dir), and every
 * advisory overlay is `null` (the tree under-claims — never a throw, never a forged green). This
 * mirrors the per-read advisory contract (ADR-0033) applied to pool CREATION rather than a single query.
 */
export function degradedBackend(): LocalBackendBackend {
  return {
    listAssets: async () => [],
    health: async () => ({ db: "unreachable" as const }),
    activeSessions: async () => null,
    inFlightBuilds: async () => null,
    inFlightClaims: async () => null,
    latestVerdicts: async () => null,
    verdictEvents: async () => null,
  };
}

/**
 * The last `maxLines` non-blank lines of `text`, trimmed — the tail of a child's captured stderr.
 * Returns `""` when there is nothing to show, so the caller can omit the section entirely.
 */
export function tailText(text: string, maxLines: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";
  return lines.slice(-Math.max(1, maxLines)).join("\n");
}

/**
 * Format the sidecar-exit rejection message main.ts surfaces. Includes the exit code (or the killing
 * signal) AND the captured stderr tail so the `[main]` line names the REAL cause — an
 * `ERR_MODULE_NOT_FOUND`, a Postgres auth error — instead of only "exited (code 1)".
 */
export function describeSidecarExit(
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrTail: string,
): string {
  const how =
    code !== null ? `code ${code}` : signal !== null ? `signal ${signal}` : "code null";
  const base = `backend sidecar exited (${how}) before reporting a port`;
  return stderrTail.length > 0 ? `${base} — last stderr:\n${stderrTail}` : base;
}
