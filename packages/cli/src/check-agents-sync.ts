// Best-effort LIVE agent-tier drift check (ADR-0055), wired into `pnpm gate` — NOT into CI.
//
// The agent tier is seed-canonical (agents are authored in the seed and rendered offline), and the
// live Cloud SQL projection that powers `storytree agents --pg` + the studio drifts when a seed edit
// isn't synced. Everything that RUNS reads the seed (gate-protected by check:claude/check:agents), so
// this is a WARN-only advisory about a human-facing projection — never a hard failure:
//
//   - DB reachable + drifted   -> print WARN naming the fix (`storytree library sync-agents --pg`).
//   - DB reachable + in sync    -> print OK.
//   - DB not reachable / no creds (stopped, fresh worktree, web container) -> print SKIP.
//
// It ALWAYS exits 0. It is read-only (no writes, no truncation risk). It lives in `pnpm gate` rather
// than CI because CI's verify job is deliberately DB-free; you do all real work with the DB up, so
// the local gate is where this catches drift before a push.

import { createPool, closePool, PgLibraryStore, diffSeedAgents, AGENT_KIND } from "@storytree/store";

import { loadLocalSecrets } from "./secrets.js";

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
  // Even an unexpected error is advisory only — never fail the gate on the agent-sync check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); drift unverified.`);
});
