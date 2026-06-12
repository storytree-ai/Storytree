#!/usr/bin/env -S tsx
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";

import { sessionHook, statuslineGlance } from "./ambient-presence.js";
import type { AmbientDeps, HeartbeatState } from "./ambient-presence.js";
import { deriveIdentity } from "./noticeboard.js";
import type { PresenceStoreLike } from "./noticeboard.js";
import { loadLocalSecrets } from "./secrets.js";

/**
 * The shared `.claude/settings.json` entry for ambient presence (ADR-0033 Decision 3 + owner
 * decision 3: the wrappers land SHARED — every session gets them). One file, three modes:
 *
 *   tsx src/ambient-presence-entry.ts start        — SessionStart: declare this session
 *   tsx src/ambient-presence-entry.ts end          — SessionEnd: mark it done
 *   tsx src/ambient-presence-entry.ts statusline   — render the board glance + debounced heartbeat
 *
 * HARD CONTRACT (the V1 hook-loop lesson, encoded): ALWAYS exit 0, bounded time, and silent on
 * every failure path — no output when the DB is down, no error ever surfaces into the session.
 * The hook modes print NOTHING even on success (SessionStart stdout lands in the model's
 * context); statusline prints at most the one glance line. This command must NEVER be registered
 * on a blocking-capable hook event (`Stop`, `PreToolUse`, `UserPromptSubmit`) — `auditHookConfig`
 * in `ambient-presence.ts` keys on the "ambient-presence" name to enforce exactly that.
 */

/**
 * Bound on acquiring the live pool. The keyless Cloud SQL connector's first handshake (ADC token
 * + ephemeral cert) measures ~6s cold on this machine — 4s silently lost the race every time.
 */
const ACQUIRE_TIMEOUT_MS = 10_000;
/** Bound on each store call once the pool is up (a query measures ~350ms). */
const STORE_TIMEOUT_MS = 4_000;
/** The heartbeat debounce window (owner decision 2: the statusline bumps `lastSeenAt`). */
const HEARTBEAT_DEBOUNCE_MS = 5 * 60_000;

/** Resolve null after `ms` — the loser of every race here. */
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * Acquire the live presence store, bounded and fail-silent: null when the store package, the
 * connector, or the DB is unavailable within the timeout. The dangling pool (if creation loses
 * the race) is reaped by the unconditional process.exit.
 */
async function acquireStore(): Promise<{
  store: PresenceStoreLike | null;
  close: () => Promise<void>;
}> {
  try {
    const { createPool, closePool, PgPresenceStore } = await import("@storytree/store");
    const acquired = await Promise.race([
      createPool().then(({ pool, connector }) => ({
        store: new PgPresenceStore(pool) as PresenceStoreLike,
        close: () => closePool(pool, connector),
      })),
      timeout(ACQUIRE_TIMEOUT_MS),
    ]);
    if (acquired === null) return { store: null, close: async () => {} };
    return acquired;
  } catch {
    return { store: null, close: async () => {} };
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
  if (mode !== "start" && mode !== "end" && mode !== "statusline") return;

  loadLocalSecrets();
  const identity = deriveIdentity();
  // Not a recognised session worktree (primary checkout, build worktrees) → silently do nothing.
  if (identity === null) return;

  const { store, close } = await acquireStore();
  const deps: AmbientDeps = { store, identity, now: () => new Date() };

  try {
    if (mode === "statusline") {
      const line = await Promise.race([
        statuslineGlance(deps, fileHeartbeatState(identity.sessionId), HEARTBEAT_DEBOUNCE_MS),
        timeout(STORE_TIMEOUT_MS),
      ]);
      if (line !== null && line !== "") process.stdout.write(line);
    } else {
      await sessionHook(mode, deps, {
        workingOn: `interactive session on ${identity.branch}`,
        timeoutMs: STORE_TIMEOUT_MS,
      });
    }
  } catch {
    // unreachable by the module's own contract — belt-and-suspenders silence
  }

  await Promise.race([close().catch(() => undefined), timeout(1_000)]);
}

// ALWAYS exit 0 — success, failure, or hang (the races bound every path above).
void main()
  .catch(() => undefined)
  .finally(() => process.exit(0));
