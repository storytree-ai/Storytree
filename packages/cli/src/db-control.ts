// db-control — the live-build DB preflight (ADR-0060): a `--real`/`--live` build OWNS the database.
// The build defaults to the live store and, before connecting, ENSURES the instance is up: probe it,
// and if it is unreachable, run the `db:up` equivalent (Cloud SQL Admin REST patch → activation-policy
// ALWAYS, ADR-0063 — no gcloud subprocess) and poll until it accepts connections — or refuse the build
// with a clear reason. `--dry-run` never comes here (it stays in-memory: offline, and a scripted PASS
// must not persist, ADR-0020), and the offline gate (`pnpm -r test`) / CI never touch this path.
//
// The core decision flow `ensureDbUp` takes its effects as INJECTED deps (probe/start/sleep/now), so it
// is unit-tested with a fake clock and no real DB or REST; `ensureLiveDb` wires the real effects.

import { closePool, createAdcCloudSqlAdmin, createPool } from "@storytree/library/store";
import type { InstanceStatus, PoolHandle } from "@storytree/library/store";

/** The Cloud SQL instance the storytree work tables live on (mirrors `pnpm db:up`, ADR-0015). */
const DB_INSTANCE = "storytree-pg";
const DB_PROJECT = "storytree-498613";

/** Injected effects for {@link ensureDbUp} — real wiring in {@link ensureLiveDb}, fakes in tests. */
export interface EnsureDbDeps {
  /** Can the live store be reached right now? Must never throw (a stopped instance answers `false`). */
  probe: () => Promise<boolean>;
  /** Bring the instance up (the `db:up` equivalent). Throws on failure (e.g. no ADC token). */
  start: () => Promise<void>;
  /** Sleep between connectivity polls. */
  sleep: (ms: number) => Promise<void>;
  /** Progress sink (the start + wait is ~a minute; the operator should see it happening). */
  log: (message: string) => void;
  /** Monotonic-ish clock for the deadline (real: `Date.now`). */
  now: () => number;
  /** Total budget to wait for connectivity after start (default 180s — a cold instance is ~60–90s). */
  timeoutMs?: number;
  /** Poll interval while waiting (default 5s). */
  pollMs?: number;
}

/** Outcome of the preflight: up (whether we had to start it), or a refusal reason. */
export type EnsureDbResult = { ok: true; started: boolean } | { ok: false; reason: string };

/**
 * Ensure the live store is reachable, starting it if needed (ADR-0060). Fast path: if a probe
 * succeeds, return immediately (the owner leaves the DB up, so this is the common case). Otherwise
 * start the instance and poll until it answers or the timeout elapses. Pure over its injected
 * effects — no DB, gcloud, or wall-clock of its own — so the decision flow is deterministically
 * testable.
 */
export async function ensureDbUp(deps: EnsureDbDeps): Promise<EnsureDbResult> {
  if (await deps.probe()) return { ok: true, started: false };

  deps.log("live store unreachable — starting Cloud SQL (db:up) and waiting for it to accept connections…");
  try {
    await deps.start();
  } catch (e) {
    return { ok: false, reason: `could not start the database: ${(e as Error).message}` };
  }

  const timeoutMs = deps.timeoutMs ?? 180_000;
  const pollMs = deps.pollMs ?? 5_000;
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    await deps.sleep(pollMs);
    if (await deps.probe()) return { ok: true, started: true };
  }
  return {
    ok: false,
    reason: `the database did not accept connections within ${Math.round(timeoutMs / 1000)}s after db:up — check \`gcloud auth application-default print-access-token\` and \`pnpm db:status\`.`,
  };
}

// ── The real effects ─────────────────────────────────────────────────────────

/**
 * Probe the live store: `createPool` + `SELECT 1`, raced against a short timeout because a STOPPED
 * instance hangs the pool build itself (the same trap the studio's health probe handles). Always
 * tears its pool down, never throws — `true` iff the DB answered inside the budget.
 */
export async function probeLiveDb(timeoutMs = 10_000): Promise<boolean> {
  const work = (async (): Promise<boolean> => {
    let handle: PoolHandle | undefined;
    try {
      handle = await createPool();
      await handle.pool.query("SELECT 1");
      return true;
    } finally {
      // Close even when the timeout already won the race, so a late-resolving pool never leaks.
      if (handle !== undefined) await closePool(handle.pool, handle.connector).catch(() => {});
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    work.catch(() => {}); // swallow a late rejection if the timeout won
  }
}

/**
 * The `db:up` effect over the Cloud SQL Admin REST API (ADR-0063): no gcloud subprocess, so it never
 * feeds the Python-cold-start credential-lock cascade. Keyless — an ambient ADC token (local) or the
 * runtime SA (Cloud Run). Idempotent: patching an already-ALWAYS instance is a harmless no-op.
 */
export function startLiveDbViaRest(): Promise<void> {
  return createAdcCloudSqlAdmin({ project: DB_PROJECT, instance: DB_INSTANCE }).setActivationPolicy("ALWAYS");
}

/** The `db:down` effect over REST (ADR-0063): settings.activationPolicy = NEVER (no gcloud subprocess). */
export function stopLiveDbViaRest(): Promise<void> {
  return createAdcCloudSqlAdmin({ project: DB_PROJECT, instance: DB_INSTANCE }).setActivationPolicy("NEVER");
}

/** `db:status` over REST (ADR-0063): the instance state + activation policy, no gcloud subprocess. */
export function statusLiveDbViaRest(): Promise<InstanceStatus> {
  return createAdcCloudSqlAdmin({ project: DB_PROJECT, instance: DB_INSTANCE }).describe();
}

/** Wire the real effects into {@link ensureDbUp}: probe the live store, `db:up` if down, poll until up. */
export function ensureLiveDb(log: (message: string) => void): Promise<EnsureDbResult> {
  return ensureDbUp({
    probe: () => probeLiveDb(),
    // REST-only (ADR-0063): the build preflight no longer shells gcloud.
    start: () => startLiveDbViaRest(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log,
    now: () => Date.now(),
  });
}

/**
 * The effective verdict store for a build (ADR-0060/0081). A scripted (`--dry-run`) walk is unchanged
 * — its flag passes through (undefined → in-memory; an explicit `pg` is refused downstream as a forged
 * healthy, ADR-0020). A `--live`/`--real` build OWNS the DB and ALWAYS persists: an unset `--store`
 * defaults to `pg`, so real work feeds the studio's wisps/blooms. There is no persist-nothing mode —
 * `--store memory` was removed at the CLI (ADR-0081); a `"memory"` flag only reaches here from the
 * internal test seam, and still maps to the in-memory store downstream for those offline driver tests.
 */
export function effectiveVerdictStore(flag: string | undefined, scripted: boolean): string | undefined {
  if (scripted) return flag;
  return flag ?? "pg";
}
