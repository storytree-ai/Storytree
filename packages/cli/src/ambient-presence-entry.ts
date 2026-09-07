#!/usr/bin/env -S tsx
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  readSessionOriginDeclaration,
  resolveSessionOrigin,
  resolveTraceIdentity,
  resolveTraversalDir,
  undeclaredOriginNudge,
} from "@storytree/context-traversal-capture";
import { statuslineGlance, sweepWorktreeActivity, undeclaredSessionNudge } from "@storytree/drive";
import type { AmbientClaimsLike, AmbientDeps, HeartbeatState } from "@storytree/drive";
import { deriveIdentity } from "@storytree/drive";
import { loadLocalSecrets } from "./secrets.js";
import { gatherWorktreeActivity } from "./worktree.js";

/**
 * The shared `.claude/settings.json` entry for the ambient session surface (ADR-0033 Decision 3,
 * re-founded on the claim ledger by ADR-0200 D5/D7 — presence is RETIRED). One file, two modes:
 *
 *   tsx src/ambient-presence-entry.ts start        — SessionStart: print the one claim-ledger nudge
 *   tsx src/ambient-presence-entry.ts statusline   — the ledger glance + the debounced sweep
 *   tsx src/ambient-presence-entry.ts sweep        — the sweep ALONE, for the detached hook
 *
 * `start` is now PURE and offline (ADR-0143 / ADR-0200 D3): no store, no declare — it prints the
 * single anchor-ceremony nudge line (SessionStart stdout lands in the model's context) and exits.
 * `statusline` reads the CLAIM LEDGER (count / own claims / overlap) and, on the same debounce,
 * runs the worktree-activity sweep (ADR-0535 D2) — which rides free there, since that path already
 * opens a pool for its two reads. The old `end` mode (the SessionEnd presence-done) is GONE with
 * presence — an unrecognised mode exits 0 silently, so a stale hook registration stays harmless.
 *
 * `sweep` EXISTS BECAUSE `statusline` DOES NOT FIRE WHERE THE PROBLEM IS. A status bar is drawn by
 * a terminal; desktop and unattended sessions draw none, which is exactly why the retired beat left
 * their claims ageing out on a timer. This mode carries the same sweep on the SessionStart hook
 * instead, DETACHED (see `scripts/worktree-activity-hook.sh`) so no session start waits on a
 * connector handshake. Between them the two carriers need no new hook-event category: a
 * `PostToolUse` registration would put store work on a per-tool-call path, and a sweep vouches for
 * EVERY claimed worktree on the box rather than only its own, so one live terminal covers every
 * desktop session and one session start covers the rest.
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
/** The sweep's debounce window (ADR-0535 D2, inheriting the retired beat's cadence). */
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
        // The ambient ledger slice (ADR-0200 D5/D7): the glance's two reads + the sweep's OBSERVED
        // activity write (ADR-0535 D2, which replaced the retired status-bar heartbeat bump).
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

/**
 * The ADR-0487 origin ask, resolved against this session's real state — or `""` on any failure.
 *
 * The COMPOSITION half of a pure question: `undeclaredOriginNudge` decides what to say, and this
 * resolves the two things it needs. The session id is `resolveDeclaringSessionId`'s answer in
 * `commands.ts` — deliberately the same one, so the hook asks about exactly the id a declaration
 * would land under and a read would be keyed by. It passes `slot: null` for that function's own
 * reason: the slot is a grouping attribute that never affects the identity, so deriving it would be
 * a `git` shell-out on the startup path whose answer is thrown away (ADR-0162's budget).
 *
 * FAIL-SILENT, on the hook's hard contract: an unreadable declaration, a missing home, anything at
 * all — the session simply is not asked this start. Staying quiet is the safe direction, because the
 * only cost of a missed ask is one undeclared session, while a throw here would surface into a
 * session's context as a hook error.
 */
function originNudge(): string {
  try {
    const sessionId = resolveTraceIdentity({ env: process.env, slot: null })?.sessionId ?? null;
    if (sessionId === null) return "";
    const declaration = readSessionOriginDeclaration(resolveTraversalDir(), sessionId);
    return undeclaredOriginNudge({
      sessionId,
      origin: resolveSessionOrigin({ env: process.env, declaration }),
    });
  } catch {
    return "";
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "start" && mode !== "statusline" && mode !== "sweep") return;

  const identity = deriveIdentity();
  // Not a recognised session worktree (primary checkout, build worktrees) → silently do nothing.
  if (identity === null) return;

  if (mode === "start") {
    // The one deliberate SessionStart print (ADR-0143 / ADR-0200 D3): inject the claim-ledger
    // anchor ceremony into the fresh session's context. PURE and offline — no store, no declare.
    process.stdout.write(undeclaredSessionNudge(identity));
    // And the SECOND ask (ADR-0487): how this session came to exist. It rides this channel because
    // ADR-0484 D7 built both capture channels with no producer for the case that dominates — a cut
    // through the desktop's `spawn_task`, whose environment the harness owns — so every trace since
    // has read `unknown`. Asking the SUCCESSOR rather than mandating a line in the cutting ceremony
    // is what yields BOTH populations, and therefore a share rather than a bare count.
    //
    // Still offline and still bounded: one small local file read, no store and no clock. It goes
    // silent the moment the session answers, so it is a question asked until answered rather than a
    // standing tax — which is the whole reason a second SessionStart line is affordable at all.
    process.stdout.write(originNudge());
    return;
  }

  if (mode === "sweep") {
    // The DETACHED SessionStart carrier (ADR-0535 D2). Nothing is printed and nothing waits on it.
    //
    // ⚠ CHECK FIRST, CONNECT SECOND — the whole reason this is not simply folded into `start`.
    // `sweepWorktreeActivity` takes the store as a THUNK, so the debounce marker and the fs
    // observation both happen before `acquireClaims` is ever called; a box with nothing to report
    // therefore pays no connector handshake at all. The retired beat inverted exactly this.
    loadLocalSecrets();
    let close: () => Promise<void> = async () => {};
    try {
      await Promise.race([
        sweepWorktreeActivity(
          {
            now: () => new Date(),
            observe: () => gatherWorktreeActivity(),
            acquire: async () => {
              const acquired = await acquireClaims();
              close = acquired.close;
              return acquired.claims;
            },
          },
          fileHeartbeatState(identity.sessionId),
          HEARTBEAT_DEBOUNCE_MS,
        ),
        timeout(ACQUIRE_TIMEOUT_MS + STORE_TIMEOUT_MS),
      ]);
    } catch {
      // unreachable by the module's own contract — belt-and-suspenders silence
    }
    await Promise.race([close().catch(() => undefined), timeout(1_000)]);
    return;
  }

  // statusline — the ledger glance + the debounced worktree-activity sweep (ADR-0535 D2). The
  // pool is opened for the glance's own two reads either way, so the sweep rides it for free.
  loadLocalSecrets();
  const { claims, close } = await acquireClaims();
  const deps: AmbientDeps = { claims, identity, now: () => new Date() };

  try {
    const line = await Promise.race([
      statuslineGlance(deps),
      timeout(STORE_TIMEOUT_MS),
    ]);
    if (line !== null && line !== "") process.stdout.write(line);
    await Promise.race([
      sweepWorktreeActivity(
        {
          now: () => new Date(),
          observe: () => gatherWorktreeActivity(),
          acquire: async () => claims,
        },
        fileHeartbeatState(identity.sessionId),
        HEARTBEAT_DEBOUNCE_MS,
      ),
      timeout(STORE_TIMEOUT_MS),
    ]);
  } catch {
    // unreachable by the module's own contract — belt-and-suspenders silence
  }

  await Promise.race([close().catch(() => undefined), timeout(1_000)]);
}

// ALWAYS exit 0 — success, failure, or hang (the races bound every path above).
void main()
  .catch(() => undefined)
  .finally(() => process.exit(0));
