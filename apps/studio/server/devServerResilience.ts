// devServerResilience — a last-resort process guard for the OPEN localhost dev front (devApi.ts).
//
// THE BUG IT FIXED (the "Adopt kills localhost" incident, 2026-06-26): the dev server RAN the
// build/adopt worker IN-PROCESS, fire-and-forget (apiRouter `handleAdopt`/`handleBuild` → `runBuildJob`).
// `runBuildJob` is careful to never *throw* — but a try/catch around `await runner(...)` only catches the
// AWAITED rejection. A worker job, by design, spawns test subprocesses, holds pg pools/connectors, and
// mutates files over MINUTES; an ASYNC fault from any of those — an `'error'` event from a stray emitter
// or socket, a background-timer rejection, a promise nobody awaited — surfaces as a process-level
// `unhandledRejection` / `uncaughtException` that NO surrounding try/catch can catch. Node's default for
// both is to print and EXIT, so one stray async fault in a background job takes the WHOLE Vite dev server
// down with it: localhost dies mid-run, the in-memory run registry is lost, the UI "clears."
//
// The fix: install process-level handlers so such a fault LOGS (loudly, with its stack) and the dev
// server SURVIVES. For a dev tool the alternative (the whole server dying, the operator losing their
// session) is strictly worse than surviving-and-logging, and the loud log keeps the underlying bug
// visible.
//
// ADR-0404 (2026-08-22) RETIRED THE ORIGINATING CAUSE and this guard is deliberately KEPT. The
// build/adopt routes and the in-process worker described above are gone — dispatching a build is a CLI
// verb — so the specific fault that motivated this can no longer arise here. What has NOT changed is the
// shape of the risk: the dev front still does long-lived in-process async work (pg pools and connectors
// through the library backend, the traversal-index prime), and any of it can still surface a
// process-level `unhandledRejection` that no surrounding try/catch can reach. So the posture stands on
// its own merits rather than on the worker, and this note exists so the next reader does not delete the
// guard on the strength of a rationale that names a retired route.

/** The narrow logger seam this needs — satisfied by Vite's `server.config.logger` and by `console`. */
export interface ResilienceLogger {
  error: (message: string) => void;
}

// Install-once PER PROCESS, tracked on a GLOBAL symbol (not a module-level flag): a Vite server restart
// re-bundles the config and RE-EVALUATES this module, so a module-level `installed` would reset and stack
// a fresh handler pair on every restart (a slow leak + duplicate logs). A `Symbol.for` global survives
// re-evaluation, so the handlers are added at most once for the life of the Node process.
const GUARD_KEY = Symbol.for('storytree.studio.devServerResilience.installed');

interface GuardGlobal {
  [GUARD_KEY]?: { onRejection: (reason: unknown) => void; onException: (err: Error) => void };
}

/** Format any thrown/rejected value for the log — prefer a stack, fall back to the string form. */
function describe(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  return String(value);
}

/**
 * Install last-resort `unhandledRejection` / `uncaughtException` handlers so an async fault in a
 * fire-and-forget worker job LOGS and the dev server STAYS UP (instead of crashing the whole Vite
 * process — the Adopt-kills-localhost bug). Idempotent across Vite server restarts (guarded on a global
 * symbol). Returns a disposer that removes the handlers — used by tests; the real dev server never
 * disposes (the guard lives for the process).
 */
export function installDevServerResilience(logger: ResilienceLogger): () => void {
  const g = globalThis as GuardGlobal;
  const existing = g[GUARD_KEY];
  if (existing) {
    // Already guarded this process (a Vite restart re-ran configureServer) — leave the one pair in place.
    return () => dispose(existing.onRejection, existing.onException);
  }

  const onRejection = (reason: unknown): void => {
    logger.error(
      `[studio] SUPPRESSED unhandled rejection in a background job — dev server stays up (was the ` +
        `Adopt-kills-localhost crash). Cause:\n${describe(reason)}`,
    );
  };
  const onException = (err: Error): void => {
    logger.error(
      `[studio] SUPPRESSED uncaught exception in a background job — dev server stays up (was the ` +
        `Adopt-kills-localhost crash). Cause:\n${describe(err)}`,
    );
  };

  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  g[GUARD_KEY] = { onRejection, onException };

  return () => {
    dispose(onRejection, onException);
    delete g[GUARD_KEY];
  };
}

function dispose(
  onRejection: (reason: unknown) => void,
  onException: (err: Error) => void,
): void {
  process.off('unhandledRejection', onRejection);
  process.off('uncaughtException', onException);
}
