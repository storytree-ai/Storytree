/**
 * The graded claim-ledger verbs of the `storytree noticeboard` family (ADR-0200 D2 — the
 * noticeboard IS the claim ledger): claim / upgrade / downgrade / release / claims. The sibling of
 * `noticeboard.ts` (declare/done stay byte-compatible there); every handler returns an `Envelope` —
 * testable without a terminal. DO NOT import from any organism's `/store` subpath — the
 * {@link ClaimLedgerStoreLike} seam keeps this module offline-testable (the CLI injects
 * `PgClaimStore` when --pg; null offline).
 */
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";
import { claimGrade, exploringClaimRequest, waitingClaimRequest } from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";
import type { SessionIdentity } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

/**
 * The ledger slice of the claim store the verbs drive (ADR-0200 D2) — wider than the declare/done
 * `SessionClaimStoreLike` (which stays untouched for back-compat): grade-aware take, the
 * exploring→work upgrade (queued arm when the slot is held), the shared-grade downgrade, the
 * any-grade release, and the queue-order read. Satisfied by `PgClaimStore`; null when offline.
 */
export interface ClaimLedgerStoreLike {
  take(req: ClaimRequest): Promise<ClaimResult>;
  upgrade(
    unitId: string,
    sessionId: string,
    opts?: { branch?: string; intent?: string },
  ): Promise<ClaimResult>;
  downgrade(unitId: string, sessionId: string, grade: "exploring" | "waiting"): Promise<boolean>;
  release(unitId: string, sessionId: string): Promise<boolean>;
  claimsFor(unitId: string): Promise<ClaimDocT[]>;
}

export interface ClaimLedgerDeps {
  /** The ledger store (--pg); null offline — every verb then refuses with the db:up guidance. */
  claims: ClaimLedgerStoreLike | null;
  /** Worktree-derived session identity (never typed); null outside a recognised worktree. */
  identity: SessionIdentity | null;
  now: () => Date;
}

/** The ledger verbs this module dispatches (the CLI routes these before declare/done). */
export const CLAIM_LEDGER_VERBS = ["claim", "upgrade", "downgrade", "release", "claims"] as const;
export type ClaimLedgerVerb = (typeof CLAIM_LEDGER_VERBS)[number];

export function isClaimLedgerVerb(sub: string | undefined): sub is ClaimLedgerVerb {
  return sub !== undefined && (CLAIM_LEDGER_VERBS as readonly string[]).includes(sub);
}

export interface ClaimLedgerOpts {
  /** claim: exploring|waiting|work (default exploring) · downgrade: exploring|waiting (required). */
  grade?: string;
  /** Free prose; REQUIRED for an exploring claim (fail-closed, matching exploringClaimRequest). */
  intent?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatAge(claimedAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(claimedAt).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/** Refusal envelope for a missing live store — mirrors declare/done's --pg pattern. */
function needsPg(verb: ClaimLedgerVerb): Envelope {
  return {
    ok: false,
    body: `${verb} requires the live store (--pg). Bring the DB up and pass --pg.`,
    next: ["pnpm db:up", `storytree noticeboard ${verb} <unit-id> --pg`],
  };
}

/** Refusal envelope for a missing identity — the exact declare/done stance (ADR-0033 Decision 1). */
function needsIdentity(): Envelope {
  return {
    ok: false,
    body:
      "Identity is derived from the session worktree (ADR-0033 Decision 1). " +
      "Run this command from inside a recognised .claude/worktrees/<name> checkout — " +
      "there is deliberately no flag to supply an identity manually.",
  };
}

function describeHolder(holder: ClaimDocT): string {
  return `${holder.sessionId} (branch ${holder.branch}, intent "${holder.intent}")`;
}

/**
 * The session's position in the unit's waiting line (1-based) + the line's length, read from the
 * ledger's queue-order view (`claimsFor` sorts ascending by claimed_at — ADR-0200 D2). Null when
 * the session has no waiting row (e.g. the read raced a promotion).
 */
async function queuePosition(
  store: ClaimLedgerStoreLike,
  unitId: string,
  sessionId: string,
): Promise<{ position: number; length: number } | null> {
  const waiting = (await store.claimsFor(unitId)).filter((c) => claimGrade(c) === "waiting");
  const idx = waiting.findIndex((c) => c.sessionId === sessionId);
  if (idx === -1) return null;
  return { position: idx + 1, length: waiting.length };
}

/** Render the queued arm — "waiting in line behind <holder>" with the queue position. */
async function renderQueued(
  store: ClaimLedgerStoreLike,
  unitId: string,
  sessionId: string,
  heldBy: ClaimDocT,
): Promise<Envelope> {
  const pos = await queuePosition(store, unitId, sessionId);
  const where =
    pos !== null ? ` (position ${pos.position} of ${pos.length} in the line)` : "";
  return {
    ok: true,
    body:
      `Work slot on "${unitId}" is HELD by ${describeHolder(heldBy)} — ` +
      `waiting in line behind ${heldBy.sessionId}${where}. ` +
      "On release the store promotes the oldest live waiter (ADR-0200 D2).",
    next: [
      `storytree noticeboard claims ${unitId} --pg`,
      `storytree noticeboard release ${unitId} --pg`,
    ],
  };
}

// ---------------------------------------------------------------------------
// claimLedgerCommand
// ---------------------------------------------------------------------------

export async function claimLedgerCommand(
  verb: ClaimLedgerVerb,
  unitId: string | undefined,
  opts: ClaimLedgerOpts,
  deps: ClaimLedgerDeps,
): Promise<Envelope> {
  if (unitId === undefined || unitId.trim().length === 0) {
    return {
      ok: false,
      body: [
        `${verb} needs a unit id.`,
        "",
        "Usage:",
        '  storytree noticeboard claim <unit-id> --grade exploring|waiting|work [--intent "<prose>"] --pg',
        "  storytree noticeboard upgrade <unit-id> --pg      exploring→work (queues when held)",
        "  storytree noticeboard downgrade <unit-id> --grade exploring|waiting --pg",
        "  storytree noticeboard release <unit-id> --pg      drop this session's claim (any grade)",
        "  storytree noticeboard claims <unit-id> --pg       the unit's rows, queue order",
      ].join("\n"),
      next: ["storytree noticeboard --pg"],
    };
  }
  if (deps.claims === null) return needsPg(verb);
  const store = deps.claims;

  // -------------------------------------------------------------------------
  // claims — the read view (queue/board), no identity needed
  // -------------------------------------------------------------------------
  if (verb === "claims") {
    const rows = await store.claimsFor(unitId);
    if (rows.length === 0) {
      return {
        ok: true,
        body: `No claims on "${unitId}".`,
        next: [
          `storytree noticeboard claim ${unitId} --grade exploring --intent "<prose>" --pg`,
        ],
      };
    }
    const now = deps.now();
    const lines = [`Claims on "${unitId}" (queue order, ADR-0200 D2):`];
    for (const c of rows) {
      const intent = c.intent.trim().length > 0 ? `"${c.intent}"` : "(none)";
      lines.push(
        `  - [${claimGrade(c)}]  ${c.sessionId}  ${formatAge(c.claimedAt, now)}  branch=${c.branch}  intent ${intent}`,
      );
    }
    return {
      ok: true,
      body: lines.join("\n"),
      next: [
        `storytree noticeboard claim ${unitId} --grade waiting --pg`,
        `storytree noticeboard upgrade ${unitId} --pg`,
      ],
    };
  }

  // Every write verb below needs the worktree-derived identity.
  if (deps.identity === null) return needsIdentity();
  const { sessionId, branch } = deps.identity;

  // -------------------------------------------------------------------------
  // claim — take a claim at a grade (default exploring)
  // -------------------------------------------------------------------------
  if (verb === "claim") {
    const grade = opts.grade ?? "exploring";
    if (grade !== "exploring" && grade !== "waiting" && grade !== "work") {
      return {
        ok: false,
        body: `unknown claim grade "${grade}" — a claim is exploring, waiting, or work (ADR-0200 D2).`,
        next: [`storytree noticeboard claim ${unitId} --grade exploring --intent "<prose>" --pg`],
      };
    }
    const intent = opts.intent;
    let req: ClaimRequest;
    if (grade === "exploring") {
      // Fail-closed like the builder: an exploring claim IS its intent prose ("what I'm thinking",
      // ADR-0200 D2) — a blank one carries nothing worth rendering as a hovering wisp.
      if (intent === undefined || intent.trim().length === 0) {
        return {
          ok: false,
          body:
            'An exploring claim requires --intent "<prose>" — the "what I\'m thinking" prose IS the ' +
            "claim's payload (ADR-0200 D2); it renders on the hovering wisp.",
          next: [`storytree noticeboard claim ${unitId} --grade exploring --intent "<prose>" --pg`],
        };
      }
      req = exploringClaimRequest({ unitId, sessionId, branch, intent });
    } else if (grade === "waiting") {
      req = waitingClaimRequest({
        unitId,
        sessionId,
        branch,
        ...(intent !== undefined ? { intent } : {}),
      });
    } else {
      // A work take carries the CLI's free intent prose, so the enum-kinded workClaimRequest
      // (edit|orchestrate, ADR-0138 §3) doesn't fit — build the request literal instead.
      req = { unitId, sessionId, branch, grade: "work", ...(intent !== undefined ? { intent } : {}) };
    }

    const result = await store.take(req);
    if ("queued" in result) return renderQueued(store, unitId, sessionId, result.heldBy);
    if (!result.acquired) {
      return {
        ok: false,
        body:
          `Work claim on "${unitId}" REFUSED — HELD by ${describeHolder(result.heldBy)}. ` +
          "Join the line instead: a waiting claim queues you behind the holder (ADR-0200 D2).",
        next: [
          `storytree noticeboard claim ${unitId} --grade waiting --pg`,
          `storytree noticeboard claims ${unitId} --pg`,
        ],
      };
    }
    if (grade === "work") {
      const reclaimedNote = result.reclaimed ? " (reclaimed from a stale holder)" : "";
      return {
        ok: true,
        body: `Work claim acquired on "${unitId}"${reclaimedNote} — the story wisp is lit.`,
        next: [
          `storytree noticeboard claims ${unitId} --pg`,
          `storytree noticeboard release ${unitId} --pg`,
        ],
      };
    }
    if (grade === "waiting") {
      const pos = await queuePosition(store, unitId, sessionId);
      const where = pos !== null ? ` (position ${pos.position} of ${pos.length} in the line)` : "";
      return {
        ok: true,
        body: `Waiting claim taken on "${unitId}" — queued for the work slot${where}.`,
        next: [
          `storytree noticeboard claims ${unitId} --pg`,
          `storytree noticeboard upgrade ${unitId} --pg`,
        ],
      };
    }
    return {
      ok: true,
      body: [
        `Exploring claim taken on "${unitId}" — shared; the hovering wisp carries your intent.`,
        `  session:  ${result.claim.sessionId}`,
        `  branch:   ${result.claim.branch}`,
        `  intent:   "${result.claim.intent}"`,
      ].join("\n"),
      next: [
        `storytree noticeboard upgrade ${unitId} --pg`,
        `storytree noticeboard claims ${unitId} --pg`,
      ],
    };
  }

  // -------------------------------------------------------------------------
  // upgrade — exploring→work (queued arm when the slot is held, ADR-0200 D2)
  // -------------------------------------------------------------------------
  if (verb === "upgrade") {
    // Branch always supplied from identity: the store fail-closes when the session holds no prior
    // row and no branch was given — the CLI never invents attribution, it derives it (ADR-0033).
    const result = await store.upgrade(unitId, sessionId, { branch });
    if ("queued" in result) return renderQueued(store, unitId, sessionId, result.heldBy);
    if (!result.acquired) {
      return {
        ok: false,
        body: `Upgrade on "${unitId}" REFUSED — work slot HELD by ${describeHolder(result.heldBy)}.`,
        next: [`storytree noticeboard claims ${unitId} --pg`],
      };
    }
    const reclaimedNote = result.reclaimed ? " (a stale holder was reclaimed)" : "";
    return {
      ok: true,
      body: `Upgraded to the WORK claim on "${unitId}"${reclaimedNote} — the story wisp is lit.`,
      next: [
        `storytree noticeboard claims ${unitId} --pg`,
        `storytree noticeboard downgrade ${unitId} --grade exploring --pg`,
      ],
    };
  }

  // -------------------------------------------------------------------------
  // downgrade — work/waiting → a shared grade
  // -------------------------------------------------------------------------
  if (verb === "downgrade") {
    const grade = opts.grade;
    if (grade !== "exploring" && grade !== "waiting") {
      return {
        ok: false,
        body:
          "downgrade needs --grade exploring|waiting — the shared grades (the work grade is what " +
          "you're stepping down FROM, ADR-0200 D2).",
        next: [`storytree noticeboard downgrade ${unitId} --grade exploring --pg`],
      };
    }
    const downgraded = await store.downgrade(unitId, sessionId, grade);
    if (!downgraded) {
      return {
        ok: false,
        body: `Nothing of yours to downgrade on "${unitId}" — this session holds no claim there.`,
        next: [`storytree noticeboard claims ${unitId} --pg`],
      };
    }
    return {
      ok: true,
      body:
        `Downgraded your claim on "${unitId}" to ${grade}. If this freed the work slot, the store ` +
        "promoted the oldest live waiter in the same transaction (ADR-0200 D2).",
      next: [`storytree noticeboard claims ${unitId} --pg`],
    };
  }

  // -------------------------------------------------------------------------
  // release — drop this session's claim, whatever its grade
  // -------------------------------------------------------------------------
  const released = await store.release(unitId, sessionId);
  if (!released) {
    return {
      ok: false,
      body: `Nothing of yours to release on "${unitId}" — this session holds no claim there.`,
      next: [`storytree noticeboard claims ${unitId} --pg`],
    };
  }
  return {
    ok: true,
    body:
      `Released your claim on "${unitId}". If it was the work slot, the store promoted the oldest ` +
      "live waiter in the same transaction (ADR-0200 D2).",
    next: [`storytree noticeboard claims ${unitId} --pg`],
  };
}
