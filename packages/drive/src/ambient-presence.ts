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
 * What STAYS: the statusline itself (the human ambient surface).
 *
 * WHAT RETIRED NEXT (ADR-0535 D3 — the status-bar check-in is retired rather than repaired). The
 * glance's `bumpHeartbeatsBySession` half is DELETED. It wrote `now()` on the strength of a terminal
 * drawing its status bar, which failed in both directions at once: desktop and unattended sessions
 * never draw one, so every claim they held aged into stale-reclaim exactly 2 h after it was taken
 * whatever the session was doing (measured 2026-09-05: 35 of 40 rows carried a heartbeat identical
 * to their claim moment, to the millisecond — never refreshed once); and a WEDGED session went on
 * bumping regardless, because a timer proves a process exists, which is precisely what a hang also
 * proves. It is replaced, not repaired, by {@link planActivitySweep} + {@link sweepWorktreeActivity}
 * (ADR-0535 D2): liveness is OBSERVED from file change inside each claimed worktree. That upholds
 * ADR-0138 D4's intent — liveness observed, not self-reported — while superseding its mechanism.
 */
import type { ActivityStamp, ClaimDocT } from "@storytree/notice-board";

import type { SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

/**
 * The ambient slice of the claim ledger (ADR-0200 D5/D7): the two reads the glance folds
 * (count/own/overlap) plus the OBSERVED-activity write the sweep fires (ADR-0535 D2, replacing the
 * retired `bumpHeartbeatsBySession` self-report). Satisfied by `PgClaimStore`; null when offline.
 * NEVER takes or releases a claim — ambient automation only refreshes liveness; only a deliberate
 * claim/declare lights a wisp.
 */
export interface AmbientClaimsLike {
  listLiveClaims(): Promise<ClaimDocT[]>;
  claimsBySession(sessionId: string): Promise<ClaimDocT[]>;
  stampActivity(stamps: readonly ActivityStamp[]): Promise<number>;
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
 * The glance, sourced from the CLAIM LEDGER (ADR-0200 D7). Returns a single status line —
 * live-claim session count, this session's own claimed units, an overlap warning when another
 * session also claims one of them — on success; `""` on any failure.
 *
 * READ-ONLY since ADR-0535 D3. It used to carry a debounced `bumpHeartbeatsBySession` write, which
 * is the retired self-report: see this module's header for why it failed in both directions. The
 * liveness WRITE is now {@link sweepWorktreeActivity}, which the same entry fires alongside this on
 * the same debounce — so a terminal session keeps its liveness, now observed rather than asserted,
 * and every OTHER claimed worktree on the box gets vouched for by the same sweep.
 */
export async function statuslineGlance(deps: AmbientDeps): Promise<string> {
  const { claims, identity } = deps;

  if (claims === null || identity === null) {
    return "";
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
// Worktree-activity sweep (ADR-0535 D2) — liveness OBSERVED, not self-reported
// ---------------------------------------------------------------------------

/**
 * One worktree's activity observation, reduced to what the ledger needs.
 *
 * The reading itself is `readIdleSignals`' (`packages/cli/src/worktree.ts`) — deliberately the
 * SAME instrument the reaper judges idleness with, so the ledger and the reaper can no longer
 * disagree about whether a directory is in use. This shape is the seam that carries it across the
 * organism boundary: `drive` never reaches into `cli`, so the CLI composition root observes and
 * this module decides.
 */
export interface WorktreeActivityReading {
  /**
   * A human-readable name for this worktree — for a report, never a key.
   *
   * NOT necessarily a basename: the sweep walks the whole git registry, where basenames collide
   * hard (16 `--real` replicas on the dev box are all called `wt`), so the observer disambiguates.
   */
  readonly name: string;
  /**
   * True when this worktree's stamp is shared, to the second, with two or more others — one pass
   * touched them all, and a pass is not activity.
   *
   * A property of the BATCH, decided by the observer (which alone sees every reading) and carried
   * HERE rather than as a set of names alongside. A name-keyed set is what the first draft used,
   * and on the real registry it would have swept fifteen innocent worktrees into a cluster of one
   * — the failure being silent in the direction that matters, since being wrongly refused is safe
   * and being wrongly admitted is what fences a node nobody can reclaim.
   */
  readonly bulkStamped: boolean;
  /**
   * Every session id this worktree could be claimed under (ADR-0033): the path basename for a
   * Rule-1 `.claude/worktrees/<name>` identity, the git ADMIN-dir basename for a Rule-2 one
   * (`--real` replicas, Codex trees). Both are resolved because a sweep that assumed Rule 1 would
   * silently vouch for nothing at all on the identities that do not live under that directory.
   */
  readonly sessionIds: readonly string[];
  /** The newest ADMITTED signal's mtime in ms; 0 when nothing could be stat'd. */
  readonly mtimeMs: number;
  /** Which signal produced {@link mtimeMs}, or null when nothing could be read. */
  readonly binding: string | null;
  /** True when the reading fell back to the worktree's OWN files (no admin dir resolved). */
  readonly fellBack: boolean;
}

/** Why a reading was not allowed to vouch for anything. Every refusal is REPORTED, never silent. */
export type ActivityRefusalReason = "fell-back" | "no-signal" | "bulk-stamp" | "future";

export interface ActivityRefusal {
  readonly name: string;
  readonly reason: ActivityRefusalReason;
}

export interface ActivitySweepPlan {
  /** At most one stamp per session id, carrying the NEWEST observation that vouched for it. */
  readonly stamps: readonly ActivityStamp[];
  readonly refused: readonly ActivityRefusal[];
}

/**
 * PURE: turn observations into the stamps the ledger may be told, and name every refusal.
 *
 * FOUR FENCES, ALL AGAINST FALSE FRESHNESS — because that is the direction that does damage.
 * `heartbeat_at` is not a display value: it decides `isReclaimable` (so the takeover rule that lets
 * a live session reclaim a dead one's node), `listLiveClaims`, and through `worktree prune --pg`'s
 * live set whether a directory may be DELETED. A stamp that is too OLD costs nothing new — it
 * reproduces today's behaviour, where every claim goes stale on a timer. A stamp that is too FRESH
 * fences a node nobody can reclaim and keeps a dead worktree alive forever.
 *
 * 1. `fell-back` — the reading came from the worktree's OWN files because no admin dir resolved.
 *    Those signals measure the world rather than the worktree: an empty `.codex/` scaffold once
 *    stamped four unrelated worktrees inside 59 ms and erased 25–40 days of real idleness. A husk
 *    or orphan therefore vouches for nobody. (It also excludes the primary checkout by
 *    construction — its `.git` is a directory, not a gitfile — which is correct, since ADR-0033
 *    Rule 3 gives the lobby no identity to claim under in the first place.)
 * 2. `no-signal` — nothing could be stat'd. 0 reads as infinitely old, never as "just now".
 * 3. `bulk-stamp` — one pass touched several worktrees at once. This fault class has bitten TWICE
 *    (a `git gc` reflog rewrite across 76 worktrees; the `.codex/` scaffold across 4), each time
 *    costing a bespoke investigation because the machinery reported a verdict and never its
 *    evidence. Wiring the detector in is what stops the third instance writing a boardful of
 *    false-live claims instead of announcing itself.
 * 4. `future` — a reading ahead of `now`. Refused rather than clamped: a claim whose heartbeat
 *    outlives the staleness window is a fence nobody can ever reclaim, and losing one stamp is the
 *    cheap direction. `stampClaimActivity` clamps for the same asymmetry read the other way.
 *
 * Deduped to the NEWEST observation per session id, so two worktrees resolving to one identity
 * cannot have the older of them age the claim — the monotonic rule, applied before the write.
 */
export function planActivitySweep(
  readings: readonly WorktreeActivityReading[],
  now: Date,
): ActivitySweepPlan {
  const nowMs = now.getTime();
  const newest = new Map<string, number>();
  const refused: ActivityRefusal[] = [];

  for (const reading of readings) {
    if (reading.fellBack) {
      refused.push({ name: reading.name, reason: "fell-back" });
      continue;
    }
    if (reading.mtimeMs <= 0 || reading.binding === null) {
      refused.push({ name: reading.name, reason: "no-signal" });
      continue;
    }
    if (reading.bulkStamped) {
      refused.push({ name: reading.name, reason: "bulk-stamp" });
      continue;
    }
    if (reading.mtimeMs > nowMs) {
      refused.push({ name: reading.name, reason: "future" });
      continue;
    }
    for (const sessionId of reading.sessionIds) {
      if (sessionId.length === 0) continue;
      // `Math.max` rather than a comparison: the plan carries only the timestamp, so `>` and `>=`
      // are indistinguishable here by construction — an equal reading writes back the same instant
      // either way. Saying "the newest" directly leaves nothing that can differ without a test
      // noticing. (The tie DOES matter one layer up, where the report pairs a binding with the
      // stamp; that rule is `renderActivitySweep`'s, and is tested there.)
      newest.set(sessionId, Math.max(newest.get(sessionId) ?? 0, reading.mtimeMs));
    }
  }

  const stamps = [...newest.entries()]
    .map(([sessionId, mtimeMs]) => ({ sessionId, observedAt: new Date(mtimeMs).toISOString() }))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

  return { stamps, refused };
}

export interface ActivitySweepDeps {
  /**
   * Get the ledger slice — a THUNK, not a value, and that is the cost trap encoded in the type.
   *
   * The retired ping took its store as an already-open pool, so the keyless Cloud SQL handshake
   * (~6–11 s on this box) was paid before anything had decided whether there was a word to say.
   * Called at most once, and only after the debounce has passed AND the plan has something to
   * write; resolve it to null when offline. A caller that already holds a pool (the statusline,
   * which opens one for its own reads) hands back what it has and pays nothing.
   */
  acquire: () => Promise<AmbientClaimsLike | null>;
  /** The fs observation, injected so this module stays offline-testable and `cli`-free. */
  observe: () => readonly WorktreeActivityReading[];
  now: () => Date;
}

export interface ActivitySweepResult extends ActivitySweepPlan {
  /** Claims actually moved forward by the write; 0 when nothing was newer than what is stored. */
  readonly written: number;
  /**
   * Why nothing was written, or null when the write landed.
   *
   * `offline` (no ledger to reach) and `write-failed` (a ledger that threw) are deliberately
   * DIFFERENT words for what is otherwise the same outcome: the first is the ordinary state of a
   * machine with the DB down, the second is a fault. Collapsing them would make the sweep's own
   * diagnostic unable to tell a quiet Tuesday from a broken store.
   */
  readonly skipped: "debounced" | "offline" | "write-failed" | "nothing-to-say" | null;
}

const EMPTY_PLAN: ActivitySweepPlan = { stamps: [], refused: [] };

/**
 * Observe every registered worktree and tell the ledger what is actually being touched (ADR-0535
 * D2). Fail-silent on every path, like everything else in this module.
 *
 * ⚠ ORDER IS LOAD-BEARING: DEBOUNCE, THEN OBSERVE, THEN CONNECT. The retired ping opened a DB pool
 * BEFORE checking whether a write was due, and the keyless Cloud SQL handshake measures ~6–11 s on
 * this box — so on the per-call paths it silently lost its own race every time. Everything up to
 * the `stampActivity` call here is a handful of `stat`s and one small file read; a caller that has
 * no pool open must not acquire one until this returns something to write.
 *
 * A failed write does NOT consume the debounce (the next fire retries), matching the convention the
 * retired beat established. A sweep is bump-only: it never takes, upgrades, or releases a claim.
 */
export async function sweepWorktreeActivity(
  deps: ActivitySweepDeps,
  state: HeartbeatState,
  debounceMs: number,
): Promise<ActivitySweepResult> {
  const now = deps.now();
  // `Date.parse` answers NaN for a MISSING marker and an UNREADABLE one alike, and NaN is not
  // finite — so both fall through to a sweep, which is the cheap direction (an extra sweep costs a
  // few stats; a wrongly-skipped one leaves a live claim ageing). Deliberately NOT written as a
  // null branch: `new Date(null)` is the epoch, so any such guard cannot change the outcome, and a
  // branch that cannot change the outcome is noise every later reader has to disprove.
  const elapsed = now.getTime() - Date.parse(String(state.readLastBump()));
  if (Number.isFinite(elapsed) && elapsed < debounceMs) {
    return { ...EMPTY_PLAN, written: 0, skipped: "debounced" };
  }

  let plan: ActivitySweepPlan;
  try {
    plan = planActivitySweep(deps.observe(), now);
  } catch {
    return { ...EMPTY_PLAN, written: 0, skipped: "nothing-to-say" };
  }

  // NOTHING TO SAY IS DECIDED BEFORE THE LEDGER IS EVEN ASKED FOR — see `acquire`'s doc.
  if (plan.stamps.length === 0) return { ...plan, written: 0, skipped: "nothing-to-say" };

  try {
    const claims = await deps.acquire();
    if (claims === null) return { ...plan, written: 0, skipped: "offline" };
    const written = await claims.stampActivity(plan.stamps);
    state.writeLastBump(now.toISOString());
    return { ...plan, written, skipped: null };
  } catch {
    // fail-silent — and the debounce is NOT consumed, so the next fire retries
    return { ...plan, written: 0, skipped: "write-failed" };
  }
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
 * command string never names `ambient-presence` directly — and `worktree-activity-hook` for the
 * same reason (ADR-0535 D2): it is a LEDGER-WRITING hook whose command string names neither, so
 * without the keyword the audit would let it be moved onto `PreToolUse` in silence. What earns a
 * keyword here is writing to the claim ledger, not the file it happens to live in.
 */
const PRESENCE_KEYWORDS = [
  "noticeboard",
  "ambient-presence",
  "presence-hook",
  "worktree-activity-hook",
] as const;

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
