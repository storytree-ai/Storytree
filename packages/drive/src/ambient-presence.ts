/**
 * Ambient session automation surface (ADR-0033 Decision 3: advisory-by-construction; re-founded on
 * the claim ledger by ADR-0200 D5/D7 — presence is RETIRED).
 *
 * Every exported async function is fail-silent: ledger failures never surface through the result
 * or errors, never throw, never reject, never write output.
 *
 * This module is self-contained — no Envelope, no commands.ts wiring.
 * It imports only types from ./noticeboard.js (never the pg store).
 *
 * WHAT RETIRED HERE (ADR-0200 D7 — the retirement sweep):
 * - `sessionHook` (the SessionStart declare / SessionEnd done pair) is DELETED: sessions no longer
 *   write presence rows; a fresh workspace is born claimed via the lobby ceremony (ADR-0200 D3)
 *   and the SessionStart nudge below aims at the claim ledger.
 * - the statusline glance's presence half (listActive + the declare self-heal) is DELETED: the
 *   glance now reads the CLAIM LEDGER (count/own/overlap from listLiveClaims/claimsBySession).
 * - `withPresence` stays deleted (ADR-0199) — builds never write session state.
 * What STAYS: the statusline itself (the human ambient surface) and the claim HEARTBEAT on the
 * same debounce (ADR-0200 D5 — a live session's claim must never age into stale-reclaim).
 */
import type { ClaimDocT } from "@storytree/notice-board";

import type { SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

/**
 * The ambient slice of the claim ledger (ADR-0200 D5/D7): the two reads the glance folds
 * (count/own/overlap) plus the session-scoped heartbeat bump the beat fires. Satisfied by
 * `PgClaimStore`; null when offline. NEVER takes or releases a claim — ambient automation only
 * refreshes liveness; only a deliberate claim/declare lights a wisp.
 */
export interface AmbientClaimsLike {
  listLiveClaims(): Promise<ClaimDocT[]>;
  claimsBySession(sessionId: string): Promise<ClaimDocT[]>;
  bumpHeartbeatsBySession(sessionId: string): Promise<number>;
}

export interface AmbientDeps {
  claims: AmbientClaimsLike | null;
  identity: SessionIdentity | null;
  now: () => Date;
}

// NOTE (ADR-0199): there is deliberately NO build presence wrapper here any more. `withPresence`
// declared the BUILD under the LAUNCHING session's worktree identity and retired that session's row
// in its finally — a build run inside an interactive session clobbered and then killed the session's
// declaration (two owner interrupts, 2026-07-15/16). A build's footprint on the shared store is
// exactly its `building` work-events (observability) + the per-unit write-claim (coordination).
// With presence retired outright (ADR-0200 D7), sessions too write only CLAIMS.

export interface HeartbeatState {
  readLastBump: () => string | null;
  writeLastBump: (iso: string) => void;
}

// ---------------------------------------------------------------------------
// statuslineGlance
// ---------------------------------------------------------------------------

/**
 * Glance + heartbeat, sourced from the CLAIM LEDGER (ADR-0200 D7). Returns a single status line —
 * live-claim session count, this session's own claimed units, an overlap warning when another
 * session also claims one of them — on success; `""` on any failure.
 *
 * The heartbeat (ADR-0200 D5, kept from ADR-0142): when the debounce window has expired, the beat
 * bumps this session's claim heartbeats (`bumpHeartbeatsBySession`) so a live session's claims
 * never age into the stale-reclaim window, and writes the bump timestamp via
 * `state.writeLastBump`. A failed bump does NOT consume the debounce (the next render retries).
 * Bump-only — the beat never takes, upgrades, or releases a claim.
 */
export async function statuslineGlance(
  deps: AmbientDeps,
  state: HeartbeatState,
  debounceMs: number,
): Promise<string> {
  const { claims, identity } = deps;

  if (claims === null || identity === null) {
    return "";
  }

  const now = deps.now();

  // Heartbeat: bump the session's claim heartbeats when the debounce window has expired — BEFORE
  // the reads, so a just-revived claim renders live on this very glance.
  const lastBump = state.readLastBump();
  const shouldBump =
    lastBump === null ||
    now.getTime() - new Date(lastBump).getTime() >= debounceMs;
  if (shouldBump) {
    try {
      await claims.bumpHeartbeatsBySession(identity.sessionId);
      state.writeLastBump(now.toISOString());
    } catch {
      // fail-silent — and the debounce is NOT consumed, so the next render retries
    }
  }

  // The glance reads: the whole live ledger (count + overlap) and this session's own rows.
  let live: ClaimDocT[];
  let own: ClaimDocT[];
  try {
    [live, own] = await Promise.all([
      claims.listLiveClaims(),
      claims.claimsBySession(identity.sessionId),
    ]);
  } catch {
    return "";
  }

  const sessionCount = new Set(live.map((c) => c.sessionId)).size;
  const ownUnits = [...new Set(own.map((c) => c.unitId))];
  const ownUnitSet = new Set(ownUnits);
  const hasOverlap = live.some(
    (c) => c.sessionId !== identity.sessionId && ownUnitSet.has(c.unitId),
  );

  const parts: string[] = [
    `${sessionCount} session${sessionCount !== 1 ? "s" : ""} on the ledger`,
  ];

  if (ownUnits.length > 0) {
    parts.push(`claims: ${ownUnits.join(", ")}`);
  }

  if (hasOverlap) {
    parts.push("overlap: another session also claims one of your units");
  }

  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// undeclaredSessionNudge (ADR-0143, re-aimed at the claim ledger by ADR-0200 D3)
// ---------------------------------------------------------------------------

/**
 * The one line the SessionStart hook injects into a fresh worktree session's context (ADR-0143) —
 * the narrow, deliberate amendment of the hook's print-nothing contract. PURE and offline: no store
 * read, no clock — a recognised worktree identity in, the static anchor prompt out (`""` for a
 * plain checkout, so non-session shells stay silent). One line only: SessionStart stdout lands in
 * the model's context, and this is the ceremony the session must see first. ADR-0200 D3's
 * enforcement ratchet re-aims the nudge at the claim ledger: a hand-opened session anchors by
 * claiming its story directly (the exploring claim is the hovering wisp on the map), while fresh
 * workspaces are born claimed via the `worktree create` lobby ceremony.
 */
export function undeclaredSessionNudge(identity: SessionIdentity | null): string {
  if (identity === null) return "";
  return (
    `[storytree] Session "${identity.sessionId}" is UNCLAIMED on the ledger (ADR-0200) — once you ` +
    "know your story, claim it (the exploring claim is the hovering wisp on the map): " +
    'pnpm storytree noticeboard claim <story-id> --grade exploring --intent "<why>" --pg. ' +
    "Fresh workspaces are born claimed instead via the lobby ceremony (ADR-0200 D3): " +
    'pnpm storytree worktree create --node <story-id> --intent "<what>" --pg\n'
  );
}

// ---------------------------------------------------------------------------
// auditHookConfig
// ---------------------------------------------------------------------------

/** Hook events that must never host noticeboard / ambient-presence commands. */
const BLOCKING_EVENTS = ["Stop", "PreToolUse", "UserPromptSubmit"] as const;

/**
 * Keywords that identify a noticeboard/ambient hook command. Includes `presence-hook` so the
 * worktree-safe launcher (`scripts/presence-hook.sh`, which is what the shared settings.json
 * actually invokes) is still recognised by the never-blocking-hooks audit even though its
 * command string never names `ambient-presence` directly.
 */
const PRESENCE_KEYWORDS = ["noticeboard", "ambient-presence", "presence-hook"] as const;

/**
 * Audit `.claude/settings.json` text for never-blocking-hooks violations.
 * Returns one violation string per hook entry registered under `Stop`,
 * `PreToolUse`, or `UserPromptSubmit` whose command mentions `noticeboard`
 * or `ambient-presence`. Returns `[]` when clean.
 *
 * Hooks on those events that are NOT noticeboard-shaped are NOT violations.
 */
export function auditHookConfig(settingsJsonText: string): string[] {
  let settings: unknown;
  try {
    settings = JSON.parse(settingsJsonText);
  } catch {
    return [];
  }

  if (typeof settings !== "object" || settings === null) return [];

  const hooksMap = (settings as Record<string, unknown>)["hooks"];
  if (typeof hooksMap !== "object" || hooksMap === null) return [];

  const violations: string[] = [];

  for (const eventName of BLOCKING_EVENTS) {
    const entries = (hooksMap as Record<string, unknown>)[eventName];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const hookList = (entry as Record<string, unknown>)["hooks"];
      if (!Array.isArray(hookList)) continue;

      for (const hook of hookList) {
        if (typeof hook !== "object" || hook === null) continue;
        const command = (hook as Record<string, unknown>)["command"];
        if (typeof command !== "string") continue;

        const isPresenceHook = PRESENCE_KEYWORDS.some((kw) =>
          command.includes(kw),
        );
        if (isPresenceHook) {
          violations.push(
            `Violation: ${eventName} hook "${command}" — noticeboard/ambient-presence hooks must not be registered on blocking events (Stop, PreToolUse, UserPromptSubmit)`,
          );
        }
      }
    }
  }

  return violations;
}
