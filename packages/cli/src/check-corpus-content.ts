// Best-effort LIVE↔SEED content-diff check (ADR-0120), wired into `pnpm gate` — NOT into CI.
//
// `check:corpus-sync` (ADR-0103) compares ID PRESENCE only — it does not look at BODIES, so a live
// artifact whose body has drifted from its seed copy — or a seed copy degraded relative to live —
// passes it clean. This compares the export-scope tier (structured,
// non-agent, non-template) BODY-for-body and WARNs on drift, classifying each:
//
//   - value-drift   → live is a valid current body that differs: a genuine edit. Resolve by direction —
//                     export live→seed (`storytree library export-corpus --pg --write`) if live is
//                     canonical, or re-edit on the live surface if the seed is.
//   - degraded-live → live is below the schema floor / invalid; the SEED is canonical. Restore it
//                     seed→live (`storytree library artifact edit <id> --file <seed> --pg`).
//
// Mirrors check:corpus-sync: DB reachable + drift → WARN; clean → OK; no DB/creds → SKIP. Read-only,
// ALWAYS exits 0, lives in `pnpm gate` (not CI — verify is deliberately DB-free).

import { createPool, closePool, PgLibraryStore, diffSeedCorpusContent } from "@storytree/library/store";

import { loadLocalSecrets } from "./secrets.js";

const TAG = "[check:corpus-content]";
/** Bound the live read so a stopped DB can't hang the gate (matches check:corpus-sync). */
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
  loadLocalSecrets();

  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); live↔seed content unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const pg = new PgLibraryStore(handle.pool);
    const diff = await withTimeout(diffSeedCorpusContent(pg), LIVE_READ_TIMEOUT_MS, "live read");
    if (diff.clean) {
      console.log(`${TAG} OK — every seed body matches live across ${diff.compared} export-scope artifacts.`);
    } else {
      const degraded = diff.drifted.filter((d) => d.cls === "degraded-live");
      const value = diff.drifted.filter((d) => d.cls === "value-drift");
      console.warn(
        `${TAG} WARN — ${diff.drifted.length} of ${diff.compared} export-scope artifacts differ between ` +
          "seed and live (body-level). Reconcile by direction (ADR-0120):",
      );
      if (value.length > 0) {
        console.warn(
          `${TAG}   value-drift [${value.length}] (genuine edits): ${value.map((d) => d.id).join(", ")}`,
        );
        console.warn(`${TAG}     → if live is canonical: pnpm storytree library export-corpus --pg --write`);
      }
      if (degraded.length > 0) {
        console.warn(
          `${TAG}   degraded-live [${degraded.length}] (seed canonical): ${degraded.map((d) => d.id).join(", ")}`,
        );
        console.warn(`${TAG}     → restore seed→live: storytree library artifact edit <id> --file <seed> --pg`);
      }
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); content drift unverified, offline gate unaffected.`,
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
  // WARN-only: never sets a non-zero exit code.
}

main().catch((err: unknown) => {
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); content drift unverified.`);
});
