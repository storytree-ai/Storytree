#!/usr/bin/env -S tsx
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";

import { statuslineGlance, undeclaredSessionNudge } from "@storytree/drive";
import type { AmbientClaimsLike, AmbientDeps, HeartbeatState } from "@storytree/drive";
import { deriveIdentity } from "@storytree/drive";
import { loadLocalSecrets } from "./secrets.js";

/**
 * The shared `.claude/settings.json` entry for the ambient session surface (ADR-0033 Decision 3,
 * re-founded on the claim ledger by ADR-0200 D5/D7 — presence is RETIRED). One file, two modes:
 *
 *   tsx src/ambient-presence-entry.ts start        — SessionStart: print the one claim-ledger nudge
 *   tsx src/ambient-presence-entry.ts statusline   — the ledger glance + debounced claim heartbeat
 *
 * `start` is now PURE and offline (ADR-0143 / ADR-0200 D3): no store, no declare — it prints the
 * single anchor-ceremony nudge line (SessionStart stdout lands in the model's context) and exits.
 * `statusline` reads the CLAIM LEDGER (count / own claims / overlap) and, on the same debounce,
 * bumps this session's claim heartbeats (ADR-0200 D5 — a live session's claim must never age into
 * stale-reclaim). The old `end` mode (the SessionEnd presence-done) is GONE with presence — an
 * unrecognised mode exits 0 silently, so a stale hook registration stays harmless.
 *
 * HARD CONTRACT (the V1 hook-loop lesson, encoded): ALWAYS exit 0, bounded time, and silent on
 * every failure path — no output when the DB is down, no error ever surfaces into the session.
 * This command must NEVER be registered on a blocking-capable hook event (`Stop`, `PreToolUse`,
 * `UserPromptSubmit`) — `auditHookConfig` in `ambient-presence.ts` enforces exactly that.
 */

/**
 * Bound on acquiring the live pool. The keyless Cloud SQL connector's first handshake (ADC token
 * + ephemeral cert) measures ~6s cold on this machine — 4s silently lost the race every time.
 */
const ACQUIRE_TIMEOUT_MS = 10_000;
/** Bound on the glance once the pool is up (a query measures ~350ms). */
const STORE_TIMEOUT_MS = 4_000;
/** The heartbeat debounce window (ADR-0200 D5: the statusline bumps the claim heartbeats). */
const HEARTBEAT_DEBOUNCE_MS = 5 * 60_000;

/** Resolve null after `ms` — the loser of every race here. */
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * Acquire the live claim store, bounded and fail-silent: null when the store package, the
 * connector, or the DB is unavailable within the timeout. The dangling pool (if creation loses
 * the race) is reaped by the unconditional process.exit.
 */
async function acquireClaims(): Promise<{
  claims: AmbientClaimsLike | null;
  close: () => Promise<void>;
}> {
  try {
    const { createPool, closePool } = await import("@storytree/library/store");
    const { PgClaimStore } = await import("@storytree/notice-board/store");
    const acquired = await Promise.race([
      createPool().then(({ pool, connector }) => ({
        // The ambient ledger slice (ADR-0200 D5/D7): the glance reads + the heartbeat bump.
        claims: new PgClaimStore(pool) as AmbientClaimsLike,
        close: () => closePool(pool, connector),
      })),
      timeout(ACQUIRE_TIMEOUT_MS),
    ]);
    if (acquired === null) return { claims: null, close: async () => {} };
    return acquired;
  } catch {
    return { claims: null, close: async () => {} };
  }
}

/** File-backed heartbeat state in the OS temp dir, keyed by session — best-effort, fail-silent. */
function fileHeartbeatState(sessionId: string): HeartbeatState {
  const file = path.join(os.tmpdir(), `storytree-heartbeat-${sessionId}`);
  return {
    readLastBump: () => {
      try {
        const value = fs.readFileSync(file, "utf8").trim();
        return value.length > 0 ? value : null;
      } catch {
        return null;
      }
    },
    writeLastBump: (iso: string) => {
      try {
        fs.writeFileSync(file, iso, "utf8");
      } catch {
        // best-effort — a lost bump only means an extra heartbeat next render
      }
    },
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "start" && mode !== "statusline") return;

  const identity = deriveIdentity();
  // Not a recognised session worktree (primary checkout, build worktrees) → silently do nothing.
  if (identity === null) return;

  if (mode === "start") {
    // The one deliberate SessionStart print (ADR-0143 / ADR-0200 D3): inject the claim-ledger
    // anchor ceremony into the fresh session's context. PURE and offline — no store, no declare.
    process.stdout.write(undeclaredSessionNudge(identity));
    return;
  }

  // statusline — the ledger glance + the debounced claim heartbeat (ADR-0200 D5).
  loadLocalSecrets();
  const { claims, close } = await acquireClaims();
  const deps: AmbientDeps = { claims, identity, now: () => new Date() };

  try {
    const line = await Promise.race([
      statuslineGlance(deps, fileHeartbeatState(identity.sessionId), HEARTBEAT_DEBOUNCE_MS),
      timeout(STORE_TIMEOUT_MS),
    ]);
    if (line !== null && line !== "") process.stdout.write(line);
  } catch {
    // unreachable by the module's own contract — belt-and-suspenders silence
  }

  await Promise.race([close().catch(() => undefined), timeout(1_000)]);
}

// ALWAYS exit 0 — success, failure, or hang (the races bound every path above).
void main()
  .catch(() => undefined)
  .finally(() => process.exit(0));
