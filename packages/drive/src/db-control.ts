// db-control — the live-build DB preflight (ADR-0060): a `--real`/`--live` build OWNS the database.
// The build defaults to the live store and, before connecting, ENSURES the instance is up: probe it,
// and if it is unreachable, run the `db:up` equivalent (Cloud SQL Admin REST patch → activation-policy
// ALWAYS, ADR-0063 — no gcloud subprocess) and poll until it accepts connections — or refuse the build
// with a clear reason. `--dry-run` never comes here (it stays in-memory: offline, and a scripted PASS
// must not persist, ADR-0020), and the offline gate (`pnpm -r test`) / CI never touch this path.
//
// The core decision flow `ensureDbUp` takes its effects as INJECTED deps (probe/start/sleep/now), so it
// is unit-tested with a fake clock and no real DB or REST; `ensureLiveDb` wires the real effects.

import { existsSync } from "node:fs";

import { closePool, createAdcCloudSqlAdmin, createPool, dataPlaneRefusal } from "@storytree/library/store";
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
  /**
   * Consulted ONLY after the poll deadline exhausts, to tell "start issued, instance still
   * warming" (activationPolicy ALWAYS — the PATCH took, re-probe and never re-start) apart from
   * "genuinely unreachable" (the PATCH did not take, or the Admin API disagrees). Optional; absent
   * or throwing falls back to the generic refusal. Real wiring: `statusLiveDbViaRest`.
   */
  status?: () => Promise<InstanceStatus>;
  /**
   * Total budget to wait for connectivity after start (default 600s / 10 min). A typical GCP cold
   * start was measured at ~5–6 min (≤366s end-to-end), not the ~60–90s ADR-0060 first estimated —
   * and since ADR-0063 made `start()` a non-blocking REST PATCH, this poll owns the WHOLE wait.
   * 180s was below the observed cold start, so a genuinely-slow start refused spuriously (the
   * retired `oq-live-build-autostart-cold-start-wait` question — ADR-0060 is the resolution
   * record); 420s then sat too close to the ~5–6 min its own
   * progress banner advertises, giving up on starts it itself called normal (the
   * `db-up-poll-window-shorter-than-the-cold-start-it-triggers` friction — post-overnight starts
   * have reached ~21 min). 600s carries real headroom, and the still-warming refusal below covers
   * the long tail honestly.
   */
  timeoutMs?: number;
  /** Poll interval while waiting (default 5s). */
  pollMs?: number;
  /**
   * ADR-0250: the data-plane refusal for this session, or `null` when the DB may be dialled. A
   * remote session's egress structurally cannot carry a Postgres connection, so probing and then
   * starting the instance is ~8 minutes spent to learn nothing — refuse before the first probe.
   * Absent (tests, non-CLI callers) means "no refusal".
   */
  refusal?: string | null;
}

/**
 * Outcome of the preflight: up (whether we had to start it), or a refusal reason.
 * `stillWarming` marks the refusal that is NOT a failure to act on: the start was issued and the
 * instance reports activationPolicy ALWAYS, so it is coming up — re-probe shortly, never re-start
 * (callers may exit distinctly, e.g. db-cli's EX_TEMPFAIL 75).
 */
export type EnsureDbResult =
  | { ok: true; started: boolean }
  | { ok: false; reason: string; stillWarming?: boolean };

/**
 * Ensure the live store is reachable, starting it if needed (ADR-0060). Fast path: if a probe
 * succeeds, return immediately (the owner leaves the DB up, so this is the common case). Otherwise
 * start the instance and poll until it answers or the timeout elapses. Pure over its injected
 * effects — no DB, gcloud, or wall-clock of its own — so the decision flow is deterministically
 * testable.
 */
export async function ensureDbUp(deps: EnsureDbDeps): Promise<EnsureDbResult> {
  // ADR-0250: refuse FIRST — before the probe, before the start. A blocked session that falls
  // through here pays the 45s probe plus the whole multi-minute cold-start poll before refusing for the wrong reason
  // ("the database did not accept connections"), which sends the reader after a healthy instance.
  if (deps.refusal !== undefined && deps.refusal !== null) {
    return { ok: false, reason: deps.refusal };
  }
  if (await deps.probe()) return { ok: true, started: false };

  deps.log("live store unreachable — starting Cloud SQL (db:up) and waiting for it to accept connections…");
  try {
    await deps.start();
  } catch (e) {
    return { ok: false, reason: `could not start the database: ${(e as Error).message}` };
  }

  const timeoutMs = deps.timeoutMs ?? 600_000;
  const pollMs = deps.pollMs ?? 5_000;
  const startedAt = deps.now();
  const deadline = startedAt + timeoutMs;
  // A cold start is minutes, not seconds — surface progress every 30s so the wait reads as progress,
  // not a hang (the loop otherwise prints nothing between the one line at the top and the verdict).
  let nextProgressAt = 30_000;
  while (deps.now() < deadline) {
    await deps.sleep(pollMs);
    if (await deps.probe()) return { ok: true, started: true };
    const elapsed = deps.now() - startedAt;
    if (elapsed >= nextProgressAt) {
      deps.log(`still waiting for Cloud SQL to accept connections (${Math.round(elapsed / 1000)}s elapsed; a cold start runs ~5–6 min)…`);
      nextProgressAt += 30_000;
    }
  }
  // Deadline exhausted. Before refusing generically, ask the Admin API which failure this IS:
  // activationPolicy ALWAYS means the start we issued took and the instance is still warming
  // (post-overnight cold starts have reached ~21 min) — a wait, not a wedge. Anything else means
  // the PATCH did not take effect, which no amount of re-probing fixes.
  const waitedS = Math.round(timeoutMs / 1000);
  if (deps.status !== undefined) {
    let observed: InstanceStatus | undefined;
    try {
      observed = await deps.status();
    } catch {
      // Admin API unreachable — fall through to the generic refusal below.
    }
    if (observed !== undefined) {
      if (observed.activationPolicy === "ALWAYS") {
        return {
          ok: false,
          stillWarming: true,
          reason: `db:up was issued and the instance reports state=${observed.state} activationPolicy=ALWAYS, but it did not accept connections within ${waitedS}s — it is STILL WARMING, not down (post-overnight cold starts have reached ~21 min; past ~30 min treat it as a real wedge). Re-probe shortly (\`pnpm db:status\`, or just retry the command that needed the DB) — do NOT issue another start or stop.`,
        };
      }
      return {
        ok: false,
        reason: `the database did not accept connections within ${waitedS}s of db:up, and the instance reports state=${observed.state} activationPolicy=${observed.activationPolicy} — the activation PATCH did not take effect, so waiting longer will not help. Check \`pnpm db:status\` and \`gcloud auth application-default print-access-token\`.`,
      };
    }
  }
  return {
    ok: false,
    reason: `the database did not accept connections within ${waitedS}s of db:up. A cold Cloud SQL start usually takes ~5–6 min and it may still be coming up — re-run shortly, or check \`pnpm db:status\` and \`gcloud auth application-default print-access-token\`.`,
  };
}

// ── The canonical reachability probe ─────────────────────────────────────────
//
// CLAUDE.md names a direct-connector `createPool` + `SELECT 1` as the definitive
// probe-don't-assume check ("never conclude the DB is unreachable from the environment"), and until
// now shipped no command for it — so every session hand-rolled the script and serially rediscovered
// the same three traps (bare `tsx` does not resolve from a worktree root; `createPool` refuses
// without `STORYTREE_DB_USER`; `createPool` returns a `PoolHandle {pool, connector}`, not a `Pool`).
// Four attempts were logged on 2026-07-13 before one succeeded — and proved the DB had been up the
// whole time (367 ms).
//
// {@link probeDb} below IS that probe, and it is the ONE implementation: `pnpm db:probe` runs it,
// and `ensureLiveDb`'s readiness poll runs it (through the boolean {@link probeLiveDb} wrapper, so
// `ensureDbUp`'s injected `probe: () => Promise<boolean>` contract — and with it ADR-0060's 75/1
// exit vocabulary — is unchanged). The two can no longer disagree, which was the other half of the
// defect: `pnpm db:up` reported "did not accept connections within 420s" TWICE at status RUNNABLE
// while a direct `SELECT 1` answered in 6047 ms. The POLL was the blocker, not the database.

/**
 * What a reachability probe learned. `reachable` carries how long `SELECT 1` took — the number that
 * settles "is the DB slow or is my poll wrong". The refusal carries the EXACT reason rather than the
 * bare `false` the boolean probe could report, because "unreachable" and "unauthenticated" want
 * different next actions and the old shape could not tell them apart.
 */
export type DbProbeResult =
  | { reachable: true; elapsedMs: number }
  | { reachable: false; elapsedMs: number; reason: string };

/**
 * The probe budget. 45s, NOT the 10s this originally shipped with: `createPool` alone — the Cloud
 * SQL connector's ADC + Admin-API + TLS handshake — was measured at ~9.6s from a laptop session on a
 * RUNNING, already-warm instance (the `SELECT 1` after it costs ~320ms, and a second query on the
 * warm pool ~17ms). A 10s budget for a ~10s operation has no headroom, so the probe reported a
 * perfectly healthy database as unreachable and `ensureDbUp` burned its whole cold-start poll
 * refusing a build it should have run. Erring long is nearly free — the probe returns the instant
 * the DB answers, and the only cost is a slower refusal when the DB really is down.
 */
export const DB_PROBE_TIMEOUT_MS = 45_000;

/** Injected effects for {@link probeDb} — real wiring in {@link probeLiveDbDetailed}, fakes in tests. */
export interface ProbeDeps {
  /** Build the pool (real: `createPool`). May hang: a STOPPED instance hangs the pool build itself. */
  open: () => Promise<PoolHandle>;
  /** The canonical query (real: `handle.pool.query("SELECT 1")`). */
  select1: (handle: PoolHandle) => Promise<unknown>;
  /** Tear the pool down (real: `closePool`). Runs even when the budget won the race. */
  close: (handle: PoolHandle) => Promise<void>;
  /** Monotonic-ish clock for the elapsed measurement (real: `Date.now`). */
  now: () => number;
  /**
   * Start the budget clock: `expired` resolves when it runs out, `cancel` stops it (real:
   * `setTimeout` / `clearTimeout`). A plain `expire(ms): Promise<void>` could not be cancelled, so
   * a fast probe would leave a live timer holding the event loop open.
   */
  budget: (ms: number) => { expired: Promise<void>; cancel: () => void };
}

/**
 * The canonical probe, pure over its injected effects — no DB, no wall-clock of its own — so the
 * timeout and teardown paths are deterministically testable. That coverage is the point rather than
 * ceremony: `ensureDbUp`'s poll now runs THIS function, so a bug here fails the preflight for every
 * `--real` build, not one throwaway script.
 *
 * NEVER throws and never rejects: a thrown error IS the answer (it becomes `reason`). The pool is
 * ALWAYS torn down, including when the budget already won the race, so a late-resolving pool never
 * leaks its connector.
 */
export async function probeDb(deps: ProbeDeps, timeoutMs: number): Promise<DbProbeResult> {
  const startedAt = deps.now();
  const elapsed = (): number => deps.now() - startedAt;

  const work = (async (): Promise<DbProbeResult> => {
    let handle: PoolHandle | undefined;
    try {
      handle = await deps.open();
      await deps.select1(handle);
      return { reachable: true, elapsedMs: elapsed() };
    } catch (err) {
      return {
        reachable: false,
        elapsedMs: elapsed(),
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (handle !== undefined) {
        try {
          await deps.close(handle);
        } catch {
          // A teardown failure must never change the verdict — the DB answered or it did not.
        }
      }
    }
  })();

  const budget = deps.budget(timeoutMs);
  const timedOut = budget.expired.then(
    (): DbProbeResult => ({
      reachable: false,
      elapsedMs: elapsed(),
      reason:
        `no answer within ${Math.round(timeoutMs / 1000)}s. A STOPPED instance hangs the pool build ` +
        "itself, so this reads as stopped or cold-starting rather than refused — check `pnpm " +
        "db:status`, and note a cold start runs ~5-6 min (post-overnight, up to ~21 min).",
    }),
  );

  try {
    return await Promise.race([work, timedOut]);
  } finally {
    budget.cancel();
    void work.catch(() => {}); // belt-and-braces: `work` catches its own, so this never fires
  }
}

/**
 * PURE: render a probe result as the one line `pnpm db:probe` prints. Separated from the I/O so the
 * wording is asserted offline — db-cli.ts stays the thin argv → effect → stdout shell it advertises.
 */
export function renderDbProbe(result: DbProbeResult): string {
  return result.reachable
    ? `reachable — SELECT 1 answered in ${result.elapsedMs} ms`
    : `UNREACHABLE after ${result.elapsedMs} ms — ${result.reason}`;
}

// ── The real effects ─────────────────────────────────────────────────────────

/**
 * Wire the real effects into {@link probeDb}: `createPool` + `SELECT 1` + `closePool`, raced against
 * {@link DB_PROBE_TIMEOUT_MS}. This is what `pnpm db:probe` runs.
 */
export function probeLiveDbDetailed(timeoutMs = DB_PROBE_TIMEOUT_MS): Promise<DbProbeResult> {
  return probeDb(
    {
      open: () => createPool(),
      select1: (handle) => handle.pool.query("SELECT 1"),
      close: (handle) => closePool(handle.pool, handle.connector),
      now: () => Date.now(),
      budget: (ms) => {
        let timer: NodeJS.Timeout | undefined;
        const expired = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, ms);
        });
        return {
          expired,
          cancel: () => {
            if (timer !== undefined) clearTimeout(timer);
          },
        };
      },
    },
    timeoutMs,
  );
}

/**
 * The boolean face of {@link probeLiveDbDetailed}, kept because `ensureDbUp` takes
 * `probe: () => Promise<boolean>` — the poll and the `db:probe` verb run the SAME code, and
 * ADR-0060's exit vocabulary (75 = started and still warming; 1 = the activation PATCH did not take)
 * is untouched by the consolidation.
 */
export async function probeLiveDb(timeoutMs = DB_PROBE_TIMEOUT_MS): Promise<boolean> {
  return (await probeLiveDbDetailed(timeoutMs)).reachable;
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
    // Consulted only after the poll deadline: tells still-warming from genuinely unreachable.
    status: () => statusLiveDbViaRest(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log,
    now: () => Date.now(),
    // ADR-0250: on a remote session this is a message and the preflight refuses instantly; on a
    // laptop it is `null` and nothing changes.
    refusal: dataPlaneRefusal(process.env, { dirExists: existsSync }),
  });
}

/**
 * The effective verdict store for a build (ADR-0060/0081, narrowed by ADR-0099-B). Only a REAL driven
 * proof (`--real`, a genuine red→green) earns the persisting default: an unset `--store` resolves to
 * `pg`, so real work feeds the studio's wisps/blooms. A SYNTHETIC walk — a `--dry-run` scripted walk OR
 * a `--live` `add(2,3)` smoke — passes its flag through unchanged (undefined → in-memory; an explicit
 * `pg` is refused downstream as a forged healthy, ADR-0020/0099). **ADR-0099-B overtakes ADR-0081's
 * "live builds always persist": a `--live` smoke no longer defaults to `pg`, because a synthetic proof
 * must never persist a greening verdict.** `--store memory` is still not a CLI option (ADR-0081); a
 * `"memory"` flag only reaches here from the internal test seam, mapping to in-memory downstream.
 */
export function effectiveVerdictStore(flag: string | undefined, synthetic: boolean): string | undefined {
  if (synthetic) return flag;
  return flag ?? "pg";
}
