// wisp-smoke — the dry-run wisp SMOKE TEST (ADR-0080): verify the whole in-flight-build wisp
// pipeline (CLI → events.work_event → /api/activity → studio render, ADR-0048) cheaply and
// repeatably, WITHOUT a billed live build and WITHOUT persisting any proof.
//
// `node build <id> --dry-run --emit-wisp` (and the story variant) append ONE transient `building`
// work-event for the REAL <id> with a smoke runId, DWELL long enough to span the studio's 30s
// activity poll, then HARD-DELETE that exact row in a finally — leaving the unit's durable event
// history byte-identical. It NEVER writes a verdict: bending ADR-0020 only to "never persists a
// VERDICT" (a transient self-deleted building-only mark is allowed for wiring verification), never
// to "a dry-run may persist a pass".
//
// The decision flow `runWispSmoke` takes its store + effects (sleep/now/log) as INJECTED deps, so it
// is unit-tested with a fake work store and a fake clock — no real DB, no real wait; `emitWisp` wires
// the real effects (live pg pool, ensureLiveDb preflight, wall-clock dwell, best-effort SIGINT
// cleanup). The offline gate (`pnpm -r test`) / CI never reach `emitWisp` — only the `--emit-wisp`
// flag against the live DB does.

import { workEvent } from "@storytree/orchestrator";
import { PgWorkStore } from "@storytree/orchestrator/store";
import { applySchema, closePool, createPool } from "@storytree/library/store";
import type { Tier } from "@storytree/proof-protocol";

import { ensureLiveDb } from "./db-control.js";
import type { EnsureDbResult } from "./db-control.js";
import type { Envelope } from "./envelope.js";

/**
 * The narrow work-store seam the smoke needs: append ONE building mark, then hard-delete it. Both
 * methods are satisfied by {@link PgWorkStore} (the live impl) and by an offline fake — structural,
 * so the core never reaches for a real pool.
 */
export interface WispSmokeStore {
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<unknown>;
  /** Hard-DELETE the transient `building` smoke row for `(unitId, runId)`. Returns rows removed. */
  deleteWorkEvent(unitId: string, runId: string): Promise<number>;
}

export interface RunWispSmokeArgs {
  store: WispSmokeStore;
  /** The REAL unit the wisp anchors to (so it renders on that unit's story island). */
  unitId: string;
  /** The unit's tier (feeds the events.work_event.tier column; undefined → "unknown"). */
  tier?: Tier;
  /** The smoke runId (e.g. `wisp-smoke-<n>`) — the build identity the wisp + cleanup are keyed by. */
  runId: string;
  /** The work-event actor. */
  signer: string;
  /** How long to hold the mark (ms) — long enough to span the studio's 30s activity poll. */
  dwellMs: number;
  /** Sleep between countdown ticks (real: setTimeout; tests: a no-op or a store-inspecting hook). */
  sleep: (ms: number) => Promise<void>;
  /** Progress sink (the dwell countdown). */
  log: (message: string) => void;
}

export interface WispSmokeResult {
  /** Whether the building mark was appended (false only if the append itself threw). */
  appended: boolean;
  /** Rows hard-deleted in cleanup (1 for a clean smoke; 0 if the row was already gone). */
  deleted: number;
}

/** Default dwell — comfortably spans two of the studio's 30s activity polls (PRESENCE_POLL_MS). */
export const DEFAULT_WISP_DWELL_SEC = 75;

/** Log a countdown tick at most this often during the dwell. */
const DWELL_TICK_MS = 15_000;

export type WispGate = { ok: true; dwellSec: number } | { ok: false; refusal: Envelope };

/**
 * Shared `--emit-wisp` precheck for `node build` and `story build` (called only when the flag is set):
 * it is a DRY-RUN-only smoke (a `--live`/`--real` build already lights a real wisp from its own
 * building mark, ADR-0048/0060), and `--dwell` must be a positive number of seconds. Returns the
 * resolved dwell, or a fail-closed refusal Envelope.
 */
export function gateEmitWisp(opts: {
  dryRun: boolean;
  dwellSec?: number;
  retryCmd: string;
}): WispGate {
  if (!opts.dryRun) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          "--emit-wisp is a DRY-RUN smoke (ADR-0080): it lights a transient, self-deleting wisp to\n" +
          "verify the in-flight-build pipeline WITHOUT a billed build. A --live/--real build ALREADY\n" +
          "lights a real wisp from its own building mark (ADR-0048/0060), so --emit-wisp is refused there.",
        next: [opts.retryCmd],
      },
    };
  }
  const dwellSec = opts.dwellSec ?? DEFAULT_WISP_DWELL_SEC;
  if (!Number.isFinite(dwellSec) || dwellSec <= 0) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          `--dwell must be a positive number of seconds (got "${String(opts.dwellSec)}"). The default ` +
          `is ${DEFAULT_WISP_DWELL_SEC}s — long enough to span the studio's 30s activity poll.`,
        next: [opts.retryCmd],
      },
    };
  }
  return { ok: true, dwellSec };
}

/**
 * Hold the mark for `totalMs`, logging a countdown so the dwell is visible (not a silent hang). The
 * remaining budget is decremented by the slept chunk — NOT recomputed from a wall clock — so the loop
 * terminates after a bounded number of ticks regardless of the clock (no infinite-dwell hazard).
 */
async function dwell(
  totalMs: number,
  sleep: (ms: number) => Promise<void>,
  log: (m: string) => void,
): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(DWELL_TICK_MS, remaining);
    await sleep(step);
    remaining -= step;
    if (remaining > 0) {
      log(`  dwelling… ~${Math.ceil(remaining / 1000)}s left (the studio polls /api/activity every 30s)`);
    }
  }
}

/**
 * The smoke's decision flow: append ONE `building` mark for the real unit, dwell, then HARD-DELETE
 * that exact `(unitId, runId)` row in a `finally` (covers success, a thrown dwell, and — once the
 * caller wires a SIGINT handler — ctrl-c; the 20-min TTL is the backstop if the process dies first).
 * It appends ONLY a building work event — NEVER a verdict (ADR-0080 bends ADR-0020 no further). Pure
 * over its injected store + effects, so it is exercised offline with a fake store and a fake clock.
 */
export async function runWispSmoke(args: RunWispSmokeArgs): Promise<WispSmokeResult> {
  const { store, unitId, tier, runId, signer, dwellMs } = args;
  let appended = false;
  let deleted = 0;
  try {
    await store.appendEvent(
      workEvent(
        { unitId, event: "building", runId, ...(tier !== undefined ? { tier } : {}) },
        signer,
      ),
    );
    appended = true;
    await dwell(dwellMs, args.sleep, args.log);
  } finally {
    if (appended) {
      // The deliberate append-only exception (PgWorkStore.deleteWorkEvent): physically remove the
      // transient row so the unit's durable history is byte-identical to before the smoke.
      deleted = await store.deleteWorkEvent(unitId, runId);
    }
  }
  return { appended, deleted };
}

// ── The real wiring (`emitWisp`) ─────────────────────────────────────────────

/** The studio deep-link for the smoke (env-overridable; defaults to the local Vite dev server). */
function studioDeepLink(override?: string): string {
  const base = (override ?? process.env["STORYTREE_STUDIO_URL"] ?? "http://localhost:5173").replace(
    /\/+$/,
    "",
  );
  return `${base}/#/tree`;
}

/** Open the live work store (pg pool + idempotent schema) — the real {@link WispSmokeStore}. */
async function defaultOpenWorkStore(): Promise<{ store: WispSmokeStore; close: () => Promise<void> }> {
  const { pool, connector } = await createPool();
  await applySchema(pool); // idempotent CREATE IF NOT EXISTS — self-heals a pre-Phase-A live DB
  return { store: new PgWorkStore(pool), close: () => closePool(pool, connector) };
}

/**
 * Install a best-effort one-shot SIGINT (ctrl-c) cleanup that runs `cleanup` then exits, and return
 * an uninstaller. Real builds: a hard kill before the finally runs is covered by the 20-min TTL — this
 * just upgrades the common ctrl-c case from "wisp lingers ~20min" to "wisp cleaned immediately".
 */
function installRealSigintCleanup(cleanup: () => Promise<void>): () => void {
  const handler = (): void => {
    void cleanup().finally(() => process.exit(130));
  };
  process.once("SIGINT", handler);
  return () => process.removeListener("SIGINT", handler);
}

export interface EmitWispArgs {
  /** The REAL unit the wisp anchors to. */
  unitId: string;
  tier?: Tier;
  /** The smoke runId (caller-generated, e.g. `wisp-smoke-<n>`). */
  runId: string;
  signer: string;
  /** Dwell, in seconds (caller-validated). */
  dwellSec: number;
  /** The exact command to re-run, for the refusal `next:` hints. */
  retryCmd: string;
}

export interface EmitWispDeps {
  /** Live-store preflight (default {@link ensureLiveDb}); a test injects a fake. */
  ensureDb?: (log: (message: string) => void) => Promise<EnsureDbResult>;
  /** Work-store opener (default = live pg pool); a test injects a fake store. */
  openStore?: () => Promise<{ store: WispSmokeStore; close: () => Promise<void> }>;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  /** SIGINT cleanup installer (default = real one-shot); a test injects a no-op. */
  installSigintCleanup?: (cleanup: () => Promise<void>) => () => void;
  /** Studio base URL override (default = env / localhost). */
  studioUrl?: string;
}

/**
 * The `--emit-wisp` orchestration: ensure the live DB is up (REQUIRED — fail-closed with a clear
 * message), open the live work store, run {@link runWispSmoke} under a best-effort SIGINT cleanup,
 * and return an honest envelope (deep-link, what to watch, the dwell, the cleanup count). It carves
 * out ONLY the building-only smoke write; it never relaxes the ADR-0020 verdict refusal.
 */
export async function emitWisp(args: EmitWispArgs, deps: EmitWispDeps = {}): Promise<Envelope> {
  const log = deps.log ?? ((m: string) => console.error(`[wisp] ${m}`));
  const ensureDb = deps.ensureDb ?? ensureLiveDb;
  const deepLink = studioDeepLink(deps.studioUrl);

  const ready = await ensureDb(log);
  if (!ready.ok) {
    return {
      ok: false,
      body:
        "--emit-wisp lights a REAL transient wisp in the live store, so it REQUIRES the live DB —\n" +
        `but the database could not be brought up:\n${ready.reason}`,
      next: ["pnpm db:status", `${args.retryCmd}   (retry once the DB is up)`],
    };
  }

  const opened = await (deps.openStore ?? defaultOpenWorkStore)();
  const { store, close } = opened;
  const dwellMs = args.dwellSec * 1_000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  log(`wisp lit: ${args.unitId} (${args.tier ?? "unknown"}) — runId ${args.runId}`);
  log(`watch the teal "${args.unitId}" wisp orbit its story at ${deepLink} for ~${args.dwellSec}s`);

  const uninstall = (deps.installSigintCleanup ?? installRealSigintCleanup)(async () => {
    await store.deleteWorkEvent(args.unitId, args.runId).catch(() => {});
    await close().catch(() => {});
  });

  let result: WispSmokeResult;
  try {
    result = await runWispSmoke({
      store,
      unitId: args.unitId,
      ...(args.tier !== undefined ? { tier: args.tier } : {}),
      runId: args.runId,
      signer: args.signer,
      dwellMs,
      sleep,
      log,
    });
  } finally {
    uninstall();
    await close();
  }

  const cleanupLine =
    result.deleted === 1
      ? "cleanup:     hard-deleted the transient building row — the unit's durable history is pristine"
      : result.deleted === 0
        ? "cleanup:     the transient row was already gone (TTL backstop, or a parallel cleanup) — nothing to delete"
        : `cleanup:     hard-deleted ${result.deleted} transient building rows for this runId`;

  return {
    ok: true,
    body: [
      `wisp smoke ${args.unitId} — DRY-RUN (ADR-0080)`,
      "",
      `unit:        ${args.unitId} (${args.tier ?? "unknown"})`,
      `runId:       ${args.runId}`,
      `signer:      ${args.signer}`,
      `dwell:       ${args.dwellSec}s (the studio polls /api/activity every 30s; ≥60s spans a poll)`,
      `studio:      ${deepLink}  — watch the teal "${args.unitId}" wisp orbit its story, then vanish`,
      cleanupLine,
      "",
      "honest framing: a wisp SMOKE proves the in-flight-build PIPELINE end-to-end (CLI →\n" +
        "events.work_event → /api/activity → studio render, ADR-0048) WITHOUT a billed live build.\n" +
        "It appended ONE transient `building` mark for the real unit and HARD-DELETED it after the\n" +
        "dwell — NEVER a verdict (ADR-0080 bends ADR-0020 no further). The unit's authored status and\n" +
        "durable event history are untouched; nothing persisted past the dwell.",
    ].join("\n"),
    next: [
      `${args.retryCmd}   (run it again — the smoke is repeatable)`,
      `open ${deepLink} during the dwell to confirm the wisp`,
    ],
  };
}
