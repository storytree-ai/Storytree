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
// design, so never a gap). It ALWAYS exits 0, is read-only (no writes), and lives in `pnpm gate`
// rather than CI because CI's verify job is deliberately DB-free.

import { createPool, closePool, PgLibraryStore, diffSeedCorpus } from "@storytree/library/store";

import { loadLocalSecrets } from "./secrets.js";

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
    // diffSeedCorpus loads the seed (in-memory, fast) and queries the live target; bound the whole
    // thing so a stopped instance can't hang the gate.
    const diff = await withTimeout(diffSeedCorpus(pg), LIVE_READ_TIMEOUT_MS, "live read");
    if (diff.complete) {
      console.log(`${TAG} OK — the live store holds every seed non-agent artifact (${diff.seed.length}).`);
    } else {
      console.warn(
        `${TAG} WARN — ${diff.missing.length} seed non-agent artifact(s) are MISSING from the live store ` +
          "(seed-only). Run `pnpm storytree library sync-corpus --pg` to migrate them " +
          "(`--pg`/studio + any agent citing them are affected; offline rendering is not).",
      );
      console.warn(`${TAG}   missing from live (in seed): ${diff.missing.join(", ")}`);
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); drift unverified, offline gate unaffected.`,
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
  // WARN-only: never sets a non-zero exit code.
}

main().catch((err: unknown) => {
  // Even an unexpected error is advisory only — never fail the gate on the corpus-sync check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drift unverified.`);
});
