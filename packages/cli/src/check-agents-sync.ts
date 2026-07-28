// Best-effort LIVE agent-tier drift check (ADR-0055), wired into `pnpm gate` — NOT into CI.
//
// The agent tier is seed-canonical (agents are authored in the seed and rendered offline), and the
// live Cloud SQL projection that powers `storytree agents --pg` + the studio drifts when a seed edit
// isn't synced. Everything that RUNS reads the seed (gate-protected by check:claude/check:agents), so
// the drift itself is about a human-facing projection, never about a build:
//
//   - DB reachable + drifted   -> print WARN naming the fix (`storytree library sync-agents --pg`).
//   - DB reachable + in sync    -> print OK.
//   - DB not reachable / no creds / unreadable seed (stopped, fresh worktree, web container) -> SKIP.
//
// IT IS NO LONGER UNCONDITIONALLY EXIT-0. Since 2026-07-28 the drift worklist is held to a DRAIN
// CEILING (ADR-0252 D3, `verification-integrity-arc`) — see `sync-drain.ts` for the differential
// control that measured this list printing 3, then 2, then 1 items while exiting 0 every time, and for
// why a cheap idempotent drain is not the same as a drain that runs. The ceiling is ZERO, so any
// drifted agent id now FAILS the local gate; the remedy is the sync command the WARN already names,
// never a raise. The FAIL-OPEN paths are unchanged and still exit 0: no creds, an unreachable store, an
// unreadable seed, or a seed holding no agents at all (where the drain would be destructive).
//
// It is read-only (no writes, no truncation risk). It lives in `pnpm gate` rather than CI because CI's
// verify job is deliberately DB-free; you do all real work with the DB up, so the local gate is where
// this catches drift before a push — and it is the only place the ceiling's drain is available.

import { createPool, closePool, PgLibraryStore, diffSeedAgents, AGENT_KIND } from "@storytree/library/store";

import { loadLocalSecrets } from "./secrets.js";
import { evaluateAgentsSyncDrain } from "./sync-drain.js";

const TAG = "[check:agents-sync]";
/** Bound the live read so a stopped DB can't hang the gate. > the ~6s Cloud SQL cold-handshake so a
 *  warm-but-cold instance isn't mistaken for unreachable. */
const LIVE_READ_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

async function main(): Promise<void> {
  // Match the CLI: hydrate STORYTREE_DB_USER from ~/.storytree/secrets.json when unset (env wins).
  loadLocalSecrets();

  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live agent tier unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    // diffSeedAgents loads the seed (in-memory, fast) and queries the live target; bound the whole
    // thing so a stopped instance can't hang the gate.
    const diff = await withTimeout(diffSeedAgents(pg), LIVE_READ_TIMEOUT_MS, "live read");
    if (diff.inSync) {
      console.log(`${TAG} OK — live ${AGENT_KIND} tier matches the seed (${diff.seed.length}).`);
    } else {
      console.warn(
        `${TAG} WARN — the live ${AGENT_KIND} tier has DRIFTED from the seed. ` +
          "Run `pnpm storytree library sync-agents --pg` (the live studio / `storytree agents --pg` are stale; builds are unaffected).",
      );
      if (diff.missing.length > 0) console.warn(`${TAG}   missing from live (in seed): ${diff.missing.join(", ")}`);
      if (diff.extra.length > 0) console.warn(`${TAG}   extra in live (not in seed): ${diff.extra.join(", ")}`);
    }

    // The drain ceiling (ADR-0252 D3). Layered ABOVE the WARN, never in place of it — the advisory
    // lines above still print in full, and this states outright that the gate now fails, so a reader
    // never has to reconcile an advisory tone with a non-zero exit.
    const verdict = evaluateAgentsSyncDrain({
      missing: diff.missing,
      extra: diff.extra,
      seedAgents: diff.seed.length,
    });
    if (verdict.breaches.length > 0) {
      const emit = verdict.suppressed === undefined ? console.error : console.warn;
      emit(
        verdict.suppressed === undefined
          ? `${TAG} RED — the drift ceiling is breached, and this FAILS the gate (ADR-0252 D3, \`sync-drain.ts\`):`
          : `${TAG} RED (NOT ENFORCED) — the drift ceiling is breached, but the breach is suppressed:`,
      );
      for (const breach of verdict.breaches) emit(`${TAG}   · ${breach}`);
      if (verdict.suppressed === undefined) {
        emit(`${TAG}   DRAIN it — \`pnpm storytree library sync-agents --pg\`. Never raise the ceiling.`);
      } else {
        emit(`${TAG}   not enforced: ${verdict.suppressed}`);
      }
      if (verdict.suppressed === undefined) process.exitCode = 1;
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — could not compare the tiers (${(err as Error).message}); drift unverified, ` +
        "offline gate unaffected.",
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
}

main().catch((err: unknown) => {
  // Even an unexpected error fails OPEN — a check that cannot run has observed no drift, and redding
  // on its own failure would make the ceiling unclearable by the drain it names.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drift unverified.`);
});
