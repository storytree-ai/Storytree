// Best-effort LIVE non-agent corpus drift check (ADR-0103), wired into `pnpm gate` — NOT into CI.
//
// The non-agent tier (principle / definition / pattern / guardrail / techstack / process /
// open-question / proposal / template) is LIVE-canonical (ADR-0023), but the ADR-0095 graduation flow
// writes a freshly-derived artifact into the SEED (knowledge.json), where the offline agent renderer
// reads it. That leaves it seed-only: invisible to `--pg` and the studio, and rendered as a
// `> MISSING REF` by any agent that cites it against the LIVE store. This WARNs when a seed non-agent
// artifact is missing from the live store, so the drift is visible before a push:
//
//   - DB reachable + a seed artifact missing -> WARN naming the fix (`storytree library sync-corpus --pg`).
//   - DB reachable + every seed artifact present -> OK.
//   - DB not reachable / no creds (stopped, fresh worktree, web container) -> SKIP.
//
// It is DELIBERATELY one-directional: it does NOT flag live artifacts absent from the seed (those are
// expected live-canonical creations) or content drift (the seed is a lagging export) — only the
// migration gap. EPHEMERAL kinds (`plan`, ADR-0183 D2) are out of scope entirely (live-only by
// design, so never a gap). It is read-only (no writes), and lives in `pnpm gate` rather than CI
// because CI's verify job is deliberately DB-free.
//
// IT IS NO LONGER UNCONDITIONALLY EXIT-0. Since 2026-07-28 the migration-gap worklist is held to a
// DRAIN CEILING (ADR-0252 D3, `verification-integrity-arc`) — see `sync-drain.ts` for the differential
// control that measured this list reaching SIX items while exiting 0, five of which are still absent
// from the live store today because they left the seed instead of draining through the command below.
// The ceiling is ZERO, so any seed-only artifact now FAILS the local gate; the remedy is the
// migrate-only sync the WARN already names, never a raise. The FAIL-OPEN paths are unchanged and still
// exit 0: no creds, an unreachable store, or an unreadable seed.

import { createPool, closePool, PgLibraryStore, loadCorpus, diffCorpus } from "@storytree/library/store";
import { InMemoryStore } from "@storytree/storage-protocol";

import { loadLocalSecrets } from "./secrets.js";
import { evaluateCorpusSyncDrain } from "./sync-drain.js";

const TAG = "[check:corpus-sync]";
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
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live corpus tier unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    // The seed is loaded EXPLICITLY rather than through `diffSeedCorpus` so the unit count the seed
    // FILE contributed is observable. It is not derivable from the diff: `libraryTemplates()` adds 13
    // code-derived `template` artifacts no seed file can remove, so an EMPTY seed still reports a
    // plausible non-zero population (measured — `sync-drain.ts`). Everything else is unchanged; this
    // is exactly what `diffSeedCorpus` does internally. Bound the whole thing so a stopped instance
    // can't hang the gate.
    const { diff, seedUnitsRead } = await withTimeout(
      (async () => {
        const seed = new InMemoryStore();
        const counts = await loadCorpus(seed);
        return { diff: await diffCorpus(seed, pg), seedUnitsRead: counts.knowledge };
      })(),
      LIVE_READ_TIMEOUT_MS,
      "live read",
    );
    // The drain ceiling (ADR-0252 D3). Evaluated BEFORE the headline is chosen, because a withheld
    // verdict must not print under an `OK —` line: the substrate case measured here (an empty seed
    // still comparing 13 `libraryTemplates()` artifacts) would otherwise state `OK` and then deny it
    // one line later, which is prose its own verdict contradicts.
    const verdict = evaluateCorpusSyncDrain({ missing: diff.missing, seedScope: diff.seed.length }, { seedUnitsRead });

    if (diff.complete && verdict.unverified === undefined) {
      console.log(`${TAG} OK — the live store holds every seed non-agent artifact (${diff.seed.length}).`);
    } else if (diff.complete) {
      console.warn(
        `${TAG} WARN — no seed artifact is missing from the live store, but this run is NOT evidence ` +
          `of a reconciled corpus: ${verdict.unverified}.`,
      );
    } else {
      console.warn(
        `${TAG} WARN — ${diff.missing.length} seed non-agent artifact(s) are MISSING from the live store ` +
          "(seed-only). Run `pnpm storytree library sync-corpus --pg` to migrate them " +
          "(`--pg`/studio + any agent citing them are affected; offline rendering is not).",
      );
      console.warn(`${TAG}   missing from live (in seed): ${diff.missing.join(", ")}`);
      if (verdict.unverified !== undefined) console.warn(`${TAG}   note: ${verdict.unverified}`);
    }

    // The breach is layered ABOVE the WARN, never in place of it — the advisory lines above still
    // print in full, and this states outright that the gate now fails, so a reader never has to
    // reconcile an advisory tone with a non-zero exit.
    if (verdict.breaches.length > 0) {
      console.error(`${TAG} RED — the migration-gap ceiling is breached, and this FAILS the gate (ADR-0252 D3, \`sync-drain.ts\`):`);
      for (const breach of verdict.breaches) console.error(`${TAG}   · ${breach}`);
      console.error(`${TAG}   DRAIN it — \`pnpm storytree library sync-corpus --pg\`. Never raise the ceiling.`);
      process.exitCode = 1;
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
  // Even an unexpected error fails OPEN — a check that cannot run has observed no gap, and redding on
  // its own failure would make the ceiling unclearable by the drain it names.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drift unverified.`);
});
