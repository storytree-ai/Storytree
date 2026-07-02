// Best-effort undeclared-session warning (ADR-0143), wired into `pnpm gate` — NOT into CI.
//
// ADR-0142 made `noticeboard declare --node` take the work-time story claim (the wisp), but the
// declare is still the session's deliberate act. This check is the gate-side pressure: a session
// can start work undeclared, but it cannot reach the landing ceremony without being told, by
// machine, that the map does not show it. WARN-only — coordination visibility is advisory
// (ADR-0033); the fail-closed rungs are the build claim (ADR-0121) and the merge ceremony's
// merged-branch guard (ADR-0142):
//
//   - not a .claude/worktrees/* session (CI, main checkout, build worktree) -> SKIP silently.
//   - no DB creds / DB unreachable                                          -> SKIP.
//   - active declaration with >=1 node                                      -> OK.
//   - no active declaration, or nodes: [] (the hooks' ambient shell)        -> WARN naming the fix.
//
// It ALWAYS exits 0 and is read-only.

import { deriveIdentity } from "@storytree/drive";
import { createPool, closePool } from "@storytree/library/store";
import { PgPresenceStore } from "@storytree/notice-board/store";

import { loadLocalSecrets } from "./secrets.js";

const TAG = "[check:declared]";
/** Bound the live read so a stopped DB can't hang the gate (> the ~6s Cloud SQL cold handshake). */
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
  const identity = deriveIdentity();
  if (identity === null) return; // not a session worktree — nothing to anchor, stay silent

  loadLocalSecrets();
  if (process.env["STORYTREE_DB_USER"] === undefined) {
    console.log(`${TAG} SKIP — no STORYTREE_DB_USER (DB creds absent); declaration unverified.`);
    return;
  }

  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    const presence = new PgPresenceStore(handle.pool);
    const active = await withTimeout(presence.listActive(), LIVE_READ_TIMEOUT_MS, "live read");
    const own = active.find((d) => d.sessionId === identity.sessionId);
    if (own !== undefined && own.nodes.length > 0) {
      console.log(`${TAG} OK — session "${identity.sessionId}" is anchored (${own.nodes.join(", ")}).`);
    } else {
      const state = own === undefined ? "not on the notice board" : "on the board but node-less (ambient shell only)";
      console.warn(
        `${TAG} WARN — session "${identity.sessionId}" is ${state}: no story wisp shows for this work (ADR-0142/0143). ` +
          'Anchor it: pnpm storytree noticeboard declare --working-on "<what>" --node <story-id> --pg',
      );
    }
  } catch (err) {
    console.log(
      `${TAG} SKIP — live DB not reachable (${(err as Error).message}); declaration unverified, offline gate unaffected.`,
    );
  } finally {
    if (handle) await closePool(handle.pool, handle.connector).catch(() => {});
  }
  // WARN-only: never sets a non-zero exit code.
}

main().catch((err: unknown) => {
  // Even an unexpected error is advisory only — never fail the gate on the declared check.
  console.log(`${TAG} SKIP — unexpected error (${(err as Error).message}); declaration unverified.`);
});
