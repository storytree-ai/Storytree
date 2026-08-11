/**
 * The graded claim-ledger verbs of the `storytree noticeboard` family (ADR-0200 D2 — the
 * noticeboard IS the claim ledger): claim / upgrade / downgrade / release / claims / mine.
 *
 * Every read here consults ONE staleness predicate — `isReclaimable`, via `classifyClaims` /
 * `liveClaims` — and every render SAYS the word "stale" when a row is one (ADR-0346 D1 companion
 * work). Before that, `claimsFor` applied no predicate at all: the per-unit view showed a
 * 554-hour ghost as though it were a live holder, a queue position counted dead waiters, and a
 * reclaimable work row read as a fence. Under a binding `waiting` those are not cosmetic.
 *
 * The sibling of
 * `noticeboard.ts` (declare/done stay byte-compatible there); every handler returns an `Envelope` —
 * testable without a terminal. DO NOT import from any organism's `/store` subpath — the
 * {@link ClaimLedgerStoreLike} seam keeps this module offline-testable (the CLI injects
 * `PgClaimStore` when --pg; null offline).
 */
import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";
import {
  CLAIM_STALE_RECLAIM_MS,
  claimGrade,
  claimRole,
  classifyClaims,
  exploringClaimRequest,
  liveClaims,
  waitingClaimRequest,
} from "@storytree/notice-board";

import { quoteClaimId } from "./claim-namespace.js";
import {
  guardClaimNamespace,
  kindSuffix,
  subtreeClaimNote,
  type ClaimUniverseLoader,
} from "./claim-universe.js";
import type { Envelope } from "./envelope.js";
import type { SessionIdentity } from "./noticeboard.js";
// ONE liveness describer, shared with `declare`'s HELD line — the same reason IDENTITY_REFUSAL_BODY
// is one copy: a refusal rendered two ways drifts into teaching two different rules.
import { describeHolder, describeIntent, formatAgeMs, IDENTITY_REFUSAL_BODY } from "./noticeboard.js";

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
  /**
   * THIS session's rows — the `mine` self-view. `includeStale` is passed so a session sees its OWN
   * ghosts: a stale row of yours is still in `events.node_claim` and is still what another
   * session's per-unit read shows.
   */
  claimsBySession(sessionId: string, opts?: { includeStale?: boolean }): Promise<ClaimDocT[]>;
}

export interface ClaimLedgerDeps {
  /** The ledger store (--pg); null offline — every verb then refuses with the db:up guidance. */
  claims: ClaimLedgerStoreLike | null;
  /** Worktree-derived session identity (never typed); null outside a recognised worktree. */
  identity: SessionIdentity | null;
  now: () => Date;
  /**
   * The claim NAMESPACE (ADR-0310 D2): resolves a unit id to a real object of a claimable kind, so
   * an id naming nothing is refused here instead of taking a row that protects nothing. Absent/null
   * = unchecked, which is exactly the pre-ADR-0310 behaviour — see `guardClaimNamespace` for why
   * every uncertainty resolves that way rather than into a refusal.
   */
  universe?: ClaimUniverseLoader | null;
}

/** The ledger verbs this module dispatches (the CLI routes these before declare/done). */
export const CLAIM_LEDGER_VERBS = ["claim", "upgrade", "downgrade", "release", "claims", "mine"] as const;
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

/** Age of a claim from `claimedAt` — the elapsed formatter is `noticeboard.ts`'s, shared not copied. */
function formatAge(claimedAt: string, now: Date): string {
  return formatAgeMs(now.getTime() - new Date(claimedAt).getTime());
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
  return { ok: false, body: IDENTITY_REFUSAL_BODY };
}

/**
 * One board line per claim row — the `claims` verb's rendering, shared with the refusal arm.
 *
 * This read applied NO staleness predicate at all until ADR-0346 D1's companion work, which is the
 * other half of the measured 2026-08-11 defect: where the board silently dropped a ghost, this
 * silently showed one, unmarked and indistinguishable from a live holder.
 */
function renderBoardLines(rows: ClaimDocT[], now: Date): string[] {
  return classifyClaims(rows, now).map(({ claim: c, stale, heartbeatAgeMs }) => {
    const mark = stale ? `  STALE ${formatAgeMs(heartbeatAgeMs)} — reclaimable` : "";
    // Role AND prose, both (ADR-0346 D3): the typed word says what KIND of work is under way, the
    // prose says what the holder is actually doing. One column served both until D3, and the
    // highest-volume writer filled it with a constant.
    return (
      `  - [${claimGrade(c)}/${claimRole(c)}]  ${c.sessionId}  ${formatAge(c.claimedAt, now)}  ` +
      `branch=${c.branch}  intent ${describeIntent(c.intent)}${mark}`
    );
  });
}

/** The one-line staleness summary under a board, or nothing when every row is live. */
function staleSummary(rows: ClaimDocT[], now: Date): string[] {
  const staleCount = rows.length - liveClaims(rows, now).length;
  if (staleCount === 0) return [];
  return [
    "",
    `${staleCount} of ${rows.length} row${rows.length === 1 ? "" : "s"} above ${staleCount === 1 ? "is" : "are"} STALE ` +
      `(no heartbeat for over ${formatAgeMs(CLAIM_STALE_RECLAIM_MS)}) — reclaimable, and blocking nobody:`,
    "a stale work row is taken over by the next claimer in the same transaction (ADR-0200 D2).",
  ];
}

/**
 * The session's position in the unit's waiting line (1-based) + the line's length, read from the
 * ledger's queue-order view (`claimsFor` sorts ascending by claimed_at — ADR-0200 D2). Null when
 * the session has no waiting row (e.g. the read raced a promotion) — and null when NO work claim
 * is held on the unit at all: with no holder there IS no line, and rendering "position 1 of 1"
 * against nothing was the measured fiction ADR-0270 D3.1 retires.
 *
 * STALE rows are excluded first (ADR-0346 D1 companion work). `claimsFor` applies no heartbeat
 * predicate, so this counted DEAD waiters into the line ahead of you and treated a reclaimable
 * work row as a holder — while `oldestLiveWaiter` skips exactly those rows when the store actually
 * promotes, and `claim()` reclaims exactly that row on the next take. Two of the eleven stale rows
 * measured on 2026-08-11 were `waiting`, and three were `work`.
 */
async function queuePosition(
  store: ClaimLedgerStoreLike,
  unitId: string,
  sessionId: string,
  now: Date,
): Promise<{ position: number; length: number } | null> {
  const rows = liveClaims(await store.claimsFor(unitId), now);
  if (!rows.some((c) => claimGrade(c) === "work")) return null;
  const waiting = rows.filter((c) => claimGrade(c) === "waiting");
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
  now: Date,
): Promise<Envelope> {
  const pos = await queuePosition(store, unitId, sessionId, now);
  const cmdId = quoteClaimId(unitId);
  const where =
    pos !== null ? ` (position ${pos.position} of ${pos.length} in the LIVE line)` : "";
  return {
    ok: true,
    body:
      `Work slot on "${unitId}" is HELD by ${describeHolder(heldBy, now)} — ` +
      `waiting in line behind ${heldBy.sessionId}${where}. ` +
      "On release the store promotes the oldest live waiter (ADR-0200 D2).",
    next: [
      `storytree noticeboard claims ${cmdId} --pg`,
      `storytree noticeboard release ${cmdId} --pg`,
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
  // -------------------------------------------------------------------------
  // mine — THIS session's holdings, no unit id (ADR-0346 D1 companion work)
  //
  // Routed ahead of the unit-id guard because it is the one read keyed on the SESSION rather than
  // on a unit. There was no self-view at all: `claims` demands a unit id, so a session verifying
  // its own claims were released had to enumerate units from memory — which is precisely how the
  // 2026-08-11 contradiction was found, at a closing leg, by hand.
  // -------------------------------------------------------------------------
  if (verb === "mine") {
    if (deps.claims === null) return needsPg("mine");
    if (deps.identity === null) return needsIdentity();
    const now = deps.now();
    const { sessionId, branch } = deps.identity;
    // includeStale: a session must see its OWN ghosts — they are what other sessions collide with.
    const rows = await deps.claims.claimsBySession(sessionId, { includeStale: true });
    if (rows.length === 0) {
      return {
        ok: true,
        body:
          `This session (${sessionId}, branch ${branch}) holds NO claims on the ledger — ` +
          "live or stale. An unclaimed session is invisible on the map and is not ready for the " +
          "merge ceremony (ADR-0200 D3).",
        next: [
          'storytree noticeboard claim <unit-id> --grade exploring --intent "<why>" --pg',
          "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
        ],
      };
    }
    const marked = classifyClaims(rows, now);
    const staleCount = marked.filter((m) => m.stale).length;
    const lines = [
      `Claims held by this session (${sessionId}, branch ${branch}):`,
      ...marked.map(({ claim: c, stale, heartbeatAgeMs }) => {
        const mark = stale ? `  STALE ${formatAgeMs(heartbeatAgeMs)} — reclaimable` : "";
        return (
          `  - ${c.unitId}  [${claimGrade(c)}/${claimRole(c)}]  ${formatAge(c.claimedAt, now)}  ` +
          `intent ${describeIntent(c.intent)}${mark}`
        );
      }),
      "",
      `${rows.length} row${rows.length === 1 ? "" : "s"}: ${rows.length - staleCount} live, ${staleCount} stale.`,
    ];
    if (staleCount > 0) {
      lines.push(
        "A stale row of yours still sits in the ledger and still renders on " +
          "`noticeboard claims <unit> --pg` — release it rather than leaving it to age out.",
      );
    }
    return {
      ok: true,
      body: lines.join("\n"),
      next: [
        "storytree noticeboard done --pg",
        `storytree noticeboard release ${quoteClaimId(marked[0]?.claim.unitId ?? "<unit-id>")} --pg`,
        "storytree noticeboard --pg",
      ],
    };
  }

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
        "  storytree noticeboard mine --pg                   what THIS session holds (no unit id)",
      ].join("\n"),
      next: ["storytree noticeboard --pg"],
    };
  }
  if (deps.claims === null) return needsPg(verb);
  const store = deps.claims;
  // Every command string below is built from the QUOTED id: a subtree claim id is a path-or-glob
  // (ADR-0317 D3), and an unquoted `*` would be expanded by the shell before storytree saw it —
  // handing the session a "next" line that silently means something else. A plain id is unchanged.
  const cmdId = quoteClaimId(unitId);

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
          `storytree noticeboard claim ${cmdId} --grade exploring --intent "<prose>" --pg`,
        ],
      };
    }
    const now = deps.now();
    const lines = [
      `Claims on "${unitId}" (queue order, ADR-0200 D2):`,
      ...renderBoardLines(rows, now),
      ...staleSummary(rows, now),
    ];
    return {
      ok: true,
      body: lines.join("\n"),
      next: [
        `storytree noticeboard claim ${cmdId} --grade waiting --pg`,
        `storytree noticeboard upgrade ${cmdId} --pg`,
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
        next: [`storytree noticeboard claim ${cmdId} --grade exploring --intent "<prose>" --pg`],
      };
    }
    // THE NAMESPACE FENCE (ADR-0310 D2) — ahead of every other check in this arm, because the
    // remedy is to fix the ID, and a session told "an exploring claim requires --intent" about an
    // id that names nothing would supply the intent and then take the phantom row anyway.
    const named = await guardClaimNamespace({
      id: unitId,
      universe: deps.universe,
      verb: `storytree noticeboard claim <unit-id> --grade ${grade} --pg`,
    });
    if (!named.ok) return named.refusal;

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
          next: [`storytree noticeboard claim ${cmdId} --grade exploring --intent "<prose>" --pg`],
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
    if ("queued" in result) return renderQueued(store, unitId, sessionId, result.heldBy, deps.now());
    if (!result.acquired) {
      // The refusal site carries the whole board (ADR-0270 D3.2): disjointness is read from the
      // ledger here, never established by hand-inspecting the holder's unpushed branch. Every row
      // on that board now states its own liveness, which is the line ADR-0346 D1 depends on: a
      // fence you cannot see through is a fence you route around.
      const now = deps.now();
      const rows = await store.claimsFor(unitId);
      const board = rows.length > 0 ? renderBoardLines(rows, now) : ["  (no rows — the read raced a release)"];
      return {
        ok: false,
        body: [
          `Work claim on "${unitId}" REFUSED — HELD by ${describeHolder(result.heldBy, now)}.`,
          "",
          "The unit's claim board (queue order, ADR-0200 D2):",
          ...board,
          ...staleSummary(rows, now),
          "",
          "Disjoint from the holder? Narrow your claim to the capability you are actually writing",
          "(ADR-0270 D1) and proceed, or queue behind them with a waiting claim (ADR-0200 D2).",
          "Resolve it from this board on your own judgment — a claim conflict is not an owner question",
          "(ADR-0270 D2).",
        ].join("\n"),
        next: [
          `storytree noticeboard claim <capability-id> --grade work --pg`,
          `storytree noticeboard claim ${cmdId} --grade waiting --pg`,
          `storytree noticeboard claims ${cmdId} --pg`,
        ],
      };
    }
    if (grade === "work") {
      const reclaimedNote = result.reclaimed ? " (reclaimed from a stale holder)" : "";
      return {
        ok: true,
        // The kind is NAMED (ADR-0310 D2). This line said "the STORY wisp is lit" for any string —
        // untrue over a capability, an arc or an increment, and untrue over a typo.
        body: [
          `Work claim acquired on "${unitId}"${kindSuffix(named.kind, named.owner)}${reclaimedNote} — the wisp is lit.`,
          ...subtreeClaimNote(named.kind, named.owner),
        ].join("\n"),
        next: [
          `storytree noticeboard claims ${cmdId} --pg`,
          `storytree noticeboard release ${cmdId} --pg`,
        ],
      };
    }
    if (grade === "waiting") {
      // LIVE rows only, on the same predicate the store promotes by: a stale work row is not a
      // holder (the next take reclaims it), and a stale waiter is not ahead of you in any line.
      const now = deps.now();
      const rows = liveClaims(await store.claimsFor(unitId), now);
      const holderHeld = rows.some((c) => claimGrade(c) === "work");
      if (!holderHeld) {
        // No holder ⇒ no line. The old rendering ("position 1 of 1") was the fiction ADR-0270
        // retires: a waiting row against nothing reads as queued while nothing blocks the session.
        return {
          ok: true,
          body:
            `Waiting claim taken on "${unitId}" — but NO LIVE work claim is held here: nothing ` +
            "blocks you (ADR-0270 D3.1). If you are building this unit, take the work slot " +
            "(upgrade — it reclaims a stale holder in the same transaction); if you meant a " +
            "narrower surface, claim the capability you are actually writing instead (ADR-0270 D1).",
          next: [
            `storytree noticeboard upgrade ${cmdId} --pg`,
            `storytree noticeboard claims ${cmdId} --pg`,
          ],
        };
      }
      const waiting = rows.filter((c) => claimGrade(c) === "waiting");
      const idx = waiting.findIndex((c) => c.sessionId === sessionId);
      const where = idx !== -1 ? ` (position ${idx + 1} of ${waiting.length} in the LIVE line)` : "";
      return {
        ok: true,
        body: `Waiting claim taken on "${unitId}"${kindSuffix(named.kind, named.owner)} — queued for the work slot${where}.`,
        next: [
          `storytree noticeboard claims ${cmdId} --pg`,
          `storytree noticeboard upgrade ${cmdId} --pg`,
        ],
      };
    }
    return {
      ok: true,
      body: [
        `Exploring claim taken on "${unitId}"${kindSuffix(named.kind, named.owner)} — shared; the hovering wisp carries your intent.`,
        `  session:  ${result.claim.sessionId}`,
        `  branch:   ${result.claim.branch}`,
        `  intent:   "${result.claim.intent}"`,
      ].join("\n"),
      next: [
        `storytree noticeboard upgrade ${cmdId} --pg`,
        `storytree noticeboard claims ${cmdId} --pg`,
      ],
    };
  }

  // -------------------------------------------------------------------------
  // upgrade — exploring→work (queued arm when the slot is held, ADR-0200 D2)
  // -------------------------------------------------------------------------
  if (verb === "upgrade") {
    // Fenced too (ADR-0310 D2): upgrade CREATES a work row when the session holds none, so it is a
    // claim-taking path in its own right and a phantom reaches the ledger through it unaided.
    const named = await guardClaimNamespace({
      id: unitId,
      universe: deps.universe,
      verb: "storytree noticeboard upgrade <unit-id> --pg",
    });
    if (!named.ok) return named.refusal;
    // Branch always supplied from identity: the store fail-closes when the session holds no prior
    // row and no branch was given — the CLI never invents attribution, it derives it (ADR-0033).
    const result = await store.upgrade(unitId, sessionId, { branch });
    if ("queued" in result) return renderQueued(store, unitId, sessionId, result.heldBy, deps.now());
    if (!result.acquired) {
      return {
        ok: false,
        body: `Upgrade on "${unitId}" REFUSED — work slot HELD by ${describeHolder(result.heldBy, deps.now())}.`,
        next: [`storytree noticeboard claims ${cmdId} --pg`],
      };
    }
    const reclaimedNote = result.reclaimed ? " (a stale holder was reclaimed)" : "";
    return {
      ok: true,
      body: [
        `Upgraded to the WORK claim on "${unitId}"${kindSuffix(named.kind, named.owner)}${reclaimedNote} — the wisp is lit.`,
        ...subtreeClaimNote(named.kind, named.owner),
      ].join("\n"),
      next: [
        `storytree noticeboard claims ${cmdId} --pg`,
        `storytree noticeboard downgrade ${cmdId} --grade exploring --pg`,
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
        next: [`storytree noticeboard downgrade ${cmdId} --grade exploring --pg`],
      };
    }
    const downgraded = await store.downgrade(unitId, sessionId, grade);
    if (!downgraded) {
      return {
        ok: false,
        body: `Nothing of yours to downgrade on "${unitId}" — this session holds no claim there.`,
        next: [`storytree noticeboard claims ${cmdId} --pg`],
      };
    }
    return {
      ok: true,
      body:
        `Downgraded your claim on "${unitId}" to ${grade}. If this freed the work slot, the store ` +
        "promoted the oldest live waiter in the same transaction (ADR-0200 D2).",
      next: [`storytree noticeboard claims ${cmdId} --pg`],
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
      next: [`storytree noticeboard claims ${cmdId} --pg`],
    };
  }
  return {
    ok: true,
    body:
      `Released your claim on "${unitId}". If it was the work slot, the store promoted the oldest ` +
      "live waiter in the same transaction (ADR-0200 D2).",
    next: [`storytree noticeboard claims ${cmdId} --pg`],
  };
}
