// db-control — the live-build DB preflight (ADR-0060): a `--real`/`--live` build OWNS the database.
// The build defaults to the live store and, before connecting, ENSURES the instance is up: probe it,
// and if it is unreachable, run the `db:up` equivalent (gcloud patch → activation-policy ALWAYS) and
// poll until it accepts connections — or refuse the build with a clear reason. `--dry-run` never comes
// here (it stays in-memory: offline, and a scripted PASS must not persist, ADR-0020), and the offline
// gate (`pnpm -r test`) / CI never touch this path.
//
// The core decision flow `ensureDbUp` takes its effects as INJECTED deps (probe/start/sleep/now), so it
// is unit-tested with a fake clock and no real DB or gcloud; `ensureLiveDb` wires the real effects.

import { spawn } from "node:child_process";
import { closePool, createAdcCloudSqlAdmin, createPool } from "@storytree/store";
import type { PoolHandle } from "@storytree/store";

/** The Cloud SQL instance the storytree work tables live on (mirrors `pnpm db:up`, ADR-0015). */
const DB_INSTANCE = "storytree-pg";
const DB_PROJECT = "storytree-498613";

/** Injected effects for {@link ensureDbUp} — real wiring in {@link ensureLiveDb}, fakes in tests. */
export interface EnsureDbDeps {
  /** Can the live store be reached right now? Must never throw (a stopped instance answers `false`). */
  probe: () => Promise<boolean>;
  /** Bring the instance up (the `db:up` equivalent). Throws on failure (e.g. gcloud missing). */
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
 * The exact gcloud spawn for this host, as data (testable on any platform). On Windows gcloud is a
 * `.cmd` shim Node refuses to spawn without a shell (CVE-2024-27980), so route through the shell as
 * ONE pre-joined string there; shell:false elsewhere. Mirrors apps/studio/server/dbControl.ts (kept
 * separate to avoid an app→package dependency); every arg is a static literal, so joining is safe.
 */
export function gcloudInvocation(
  args: string[],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; shell: boolean } {
  return platform === "win32"
    ? { command: ["gcloud", ...args].join(" "), args: [], shell: true }
    : { command: "gcloud", args, shell: false };
}

/** Run gcloud to completion; resolve on exit 0, reject with stderr on a non-zero exit or spawn error. */
function runGcloud(args: string[]): Promise<void> {
  const { command, args: spawnArgs, shell } = gcloudInvocation(args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, spawnArgs, { shell, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gcloud exited ${code ?? "null"}: ${stderr.trim()}`))));
  });
}

/** The `db:up` effect: `gcloud sql instances patch … --activation-policy ALWAYS` (idempotent). */
export function startLiveDb(): Promise<void> {
  return runGcloud([
    "sql", "instances", "patch", DB_INSTANCE,
    "--project", DB_PROJECT,
    "--activation-policy", "ALWAYS",
    "--quiet",
  ]);
}

/**
 * The `db:up` effect over the Cloud SQL Admin REST API (ADR-0063): no gcloud subprocess, so it never
 * feeds the Python-cold-start credential-lock cascade. Keyless — an ambient ADC token (local) or the
 * runtime SA (Cloud Run). Idempotent: patching an already-ALWAYS instance is a harmless no-op.
 */
export function startLiveDbViaRest(): Promise<void> {
  return createAdcCloudSqlAdmin({ project: DB_PROJECT, instance: DB_INSTANCE }).setActivationPolicy("ALWAYS");
}

/**
 * Start the DB REST-first (ADR-0063), falling back to gcloud if the REST/ADC path errors. The
 * `restStart`/`gcloudStart` effects are injected so the fallback DECISION is unit-testable; a REST
 * failure is logged (not fatal) and the gcloud path is tried — only if BOTH fail does this throw
 * (so {@link ensureDbUp} reports "could not start"). The fallback is a transition guard: it goes once
 * the REST path has proven itself in daily use (ADR-0063).
 */
export async function startWithFallback(
  restStart: () => Promise<void>,
  gcloudStart: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  try {
    await restStart();
  } catch (e) {
    log(`Cloud SQL Admin REST start failed (${(e as Error).message}) — falling back to gcloud.`);
    await gcloudStart();
  }
}

/** Wire the real effects into {@link ensureDbUp}: probe the live store, `db:up` if down, poll until up. */
export function ensureLiveDb(log: (message: string) => void): Promise<EnsureDbResult> {
  return ensureDbUp({
    probe: () => probeLiveDb(),
    // REST-first (ADR-0063), gcloud fallback — the build preflight no longer shells gcloud by default.
    start: () => startWithFallback(startLiveDbViaRest, startLiveDb, log),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log,
    now: () => Date.now(),
  });
}

/**
 * The effective verdict store for a build (ADR-0060). A scripted (`--dry-run`) walk is unchanged —
 * its flag passes through (undefined → in-memory; an explicit `pg` is refused downstream as a forged
 * healthy, ADR-0020). A `--live`/`--real` build OWNS the DB: an unset `--store` DEFAULTS to `pg`, so
 * real work feeds the studio's wisps/blooms by default; `--store memory` is the explicit opt-out.
 */
export function effectiveVerdictStore(flag: string | undefined, scripted: boolean): string | undefined {
  if (scripted) return flag;
  return flag ?? "pg";
}
