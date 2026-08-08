/**
 * The chain claims the NODES it writes (`chain-claims-its-nodes`, `parallel-red-green-arc`).
 *
 * THE DEFECT THIS CLOSES. `buildNodeReal` — the per-node function a story chain calls — takes NO
 * claim; the ADR-0121 write-claim lives inside `nodeBuild`, the standalone `node build` path, which
 * the chain never enters. So a `story build --real` held exactly ONE claim, on `story.id`, INSTEAD OF
 * per-node claims rather than alongside them.
 *
 * That made the story claim a PROXY FOR A SET, not a lock on any story-grain resource. Each of the
 * three resources it looked like it guarded is per-run and uncontended: `createBuildWorktree`
 * mkdtemps a fresh directory per call (build-worktree.ts), `currentHead` is a local variable, and the
 * promotion branch is `claude/real/<unitId>-<runId>` with a per-run `runId` — two runs share none of
 * them. What IS contended is exactly what ADR-0121 measured: two runs proving the same NODES, writing
 * duplicate signed verdicts into the one shared event store and billing twice for it.
 *
 * So the fix is not to keep the story claim and rename it. The chain takes the claims on the units it
 * is actually about to write, and the story claim is RETIRED — the story id is now claimed if and
 * only if the story's own UAT node is in the drive order (a `uat_witness: machine` story), because
 * that is the only case where the chain writes it.
 *
 * WHAT ELSE THIS BUYS, for free: the ADR-0270 D1 tension. D1 legitimised two sessions working
 * disjoint capabilities of one story, while `story build` refused the second outright because both
 * demanded the story id. Holding disjoint member claims, they simply stop contending — no narrowing
 * rule, no partial-build special case. The refusal also names the CAPABILITY actually held rather
 * than the story, which is what ADR-0270 D3 asks refusals to do.
 *
 * AND WHAT IT FIXES THAT NOBODY HAD WRITTEN DOWN: the story claim did not, in fact, prevent the
 * ADR-0121 incident at story scale. `nodeBuild` claims `spec.id` and the chain claimed `story.id` —
 * DIFFERENT rows in a ledger keyed `(unit_id, session_id)` — so a `node build cap-a --real` and a
 * `story build <the story containing cap-a> --real` never met. Both proved cap-a, both signed, both
 * billed. The claim named for that cascade could not see the collision it was named for; it is the
 * per-member take that closes it, and `chain-claims-drive.test.ts` pins it.
 *
 * THE ONE THING THE STORY ROW DID GUARD, named rather than carried forward undecided (the entry's
 * standing instruction). A session that DECLARED at story grain — legitimate under ADR-0270 D1 for
 * cross-capability work — used to block a chain by holding the id the chain demanded. It no longer
 * does. That is not a guarded RESOURCE, though; it is a coincidence of ids, and the ledger has never
 * resolved parent/child containment in either direction: a `node build cap-a --real` has always
 * ignored a story-grain declaration too, and nothing here changes that. So this makes the chain
 * behave exactly as the single-node path already did, and the inconsistency was itself the bug.
 * Whether a claim on a parent id should cover its children is precisely the typed, resolvable
 * namespace ADR-0310 proposes (`first-class-edges-arc`); it is that ADR's ground to settle for BOTH
 * paths at once, and inventing a containment rule inside the build driver would settle it by
 * accident. Recorded here so the next reader inherits the finding instead of re-deriving it.
 *
 * THE FORK, settled here: a set take is ALL-OR-NOTHING over the whole drive order, up front, before
 * any worktree or spend. Coarse, and deliberately so — it matches the pre-existing semantics exactly
 * (one acquire before the loop, one release after) and leaves no window. The finer alternative,
 * claiming per batch as the chain reaches it, leaves a gap between batches in which a sibling can
 * take a node this chain is about to drive and the chain then halts mid-spend. That is a worse
 * failure than an up-front refusal, so the coarse arm is taken until a measured need says otherwise.
 *
 * TWO DETAILS THAT ARE LOAD-BEARING, not incidental:
 *
 *   1. TAKE ORDER IS CANONICAL (sorted), never the drive order. All-or-nothing acquisition over
 *      overlapping sets in DIFFERENT orders can refuse BOTH contenders: chain A holds `c` and wants
 *      `d`, chain B holds `d` and wants `c`, and each rolls back. Under one global order every pair
 *      of intersecting sets contends at their least common member, so exactly one contender holds it
 *      and the other rolls back having taken nothing the winner needs. Disjoint sets never meet, so
 *      full concurrency survives. This is lock-ordering, and it is the reason a set take is safe at
 *      all.
 *   2. ROLLBACK OBEYS THE BORROW-VS-TAKE ASYMMETRY, exactly as the exit path does. `events.node_claim`
 *      is keyed `(unit_id, session_id)`, so a take under the launching session's identity OVERWRITES
 *      that session's own row rather than adding one — and rolling back unconditionally would destroy
 *      a declaration the chain never took. That is the ADR-0199 class, and `claim-release.ts` carries
 *      its event-log trace. Rollback releases only what this run's own take CREATED.
 *
 * REPORTING IS CONSOLIDATED, not per unit. `releaseClaimWithNotice` warns once per released row —
 * correct for one unit, seven seven-line blocks for a seven-node chain, which trains the reader to
 * skip it. {@link releaseChainClaims} keeps every bit of that function's logic (fail-soft, warn only
 * when a row was really deleted) by capturing its output, and emits ONE notice naming both sets.
 */

import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";

import { decideClaimExit, releaseClaimWithNotice } from "./claim-release.js";

/**
 * The narrow slice of the claim store a chain take needs, plus its injectable surroundings — the
 * same shape `ClaimStoreLike` satisfies, declared locally so this module owns no dependency on the
 * build driver that calls it (the `ReleaseDeps` idiom in claim-release.ts).
 */
export interface ChainClaimDeps {
  claim(req: ClaimRequest): Promise<ClaimResult>;
  release(unitId: string, sessionId: string): Promise<boolean>;
  /** Where notices go. Default: stderr — a notice must not pollute an envelope on stdout. */
  log?: (message: string) => void;
  /** Real: `() => new Date()`. */
  now?: () => Date;
}

/** One claim this run is holding, and HOW it came to hold it. */
export interface HeldClaim {
  unitId: string;
  /**
   * The session's OWN pre-existing row this take absorbed — a borrow, not a take. Present means the
   * run must LEAVE the row on the way out (and on rollback); absent means its take created the row
   * and releasing restores the ledger to how it was found.
   */
  displaced?: ClaimDocT;
}

/** The outcome of taking the whole set. On refusal nothing is left held: the partial set is rolled back. */
export type ChainClaimOutcome =
  | { ok: true; held: HeldClaim[] }
  | {
      ok: false;
      /** The one unit that refused — the capability/contract to name, NOT the story (ADR-0270 D3). */
      refusedUnit: string;
      /** The live holder, so the refusal can say who has it. */
      heldBy: ClaimDocT;
      /** Every unit the chain wanted, canonical order — so the reader sees how much of the set collided. */
      requested: string[];
    };

/**
 * PURE: the canonical take order — deduplicated and sorted. See detail 1 in the module note: this
 * ordering is what makes an all-or-nothing set take safe against a sibling holding an overlapping
 * set. Dedup is not merely defensive — taking the same id twice would make the second take re-entrant
 * on the row the FIRST take just created, reporting it as `displaced`, and the run would then "keep"
 * (leak) a claim it did in fact take.
 */
export function canonicalClaimOrder(unitIds: readonly string[]): string[] {
  return [...new Set(unitIds)].sort();
}

/**
 * Take the write-claim on EVERY unit this run is about to write, all-or-nothing, before any worktree
 * or spend. A single refusal rolls the partial set back and reports which unit collided.
 *
 * A null store or identity means no claim at all (a dry-run / live smoke does not contend on the
 * shared store) — that gate is the CALLER's, exactly as it was when the take was inline.
 */
export async function acquireChainClaims(
  deps: ChainClaimDeps,
  input: {
    unitIds: readonly string[];
    sessionId: string;
    branch: string;
    intent: string;
    /** WHO is taking them — the code path, for the rollback notice (e.g. `story build x --real`). */
    caller: string;
  },
): Promise<ChainClaimOutcome> {
  const order = canonicalClaimOrder(input.unitIds);
  const held: HeldClaim[] = [];
  for (const unitId of order) {
    const res = await deps.claim({
      unitId,
      sessionId: input.sessionId,
      branch: input.branch,
      intent: input.intent,
    });
    if (!res.acquired) {
      // Roll the partial set back before reporting: a refused chain must leave the ledger as it found
      // it, or the next attempt collides with its own abandoned claims. Borrowed rows stay (detail 2).
      await releaseChainClaims(deps, held, {
        sessionId: input.sessionId,
        caller: `${input.caller} (rolled back — "${unitId}" is claimed)`,
      });
      return { ok: false, refusedUnit: unitId, heldBy: res.heldBy, requested: order };
    }
    held.push({ unitId, ...(res.displaced !== undefined ? { displaced: res.displaced } : {}) });
  }
  return { ok: true, held };
}

/**
 * Release every claim this run's OWN take created, leave every one it borrowed, and say so ONCE.
 *
 * Fail-soft throughout, like the single-unit path it composes: a release failure is reported and
 * swallowed (the claim ages out via stale-reclaim), because it must never fail an otherwise-good
 * build. Returns the split so a caller — or a test — can assert it without parsing prose.
 */
export async function releaseChainClaims(
  deps: ChainClaimDeps,
  held: readonly HeldClaim[],
  input: { sessionId: string; caller: string },
): Promise<{ released: string[]; kept: HeldClaim[] }> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const now = deps.now ?? ((): Date => new Date());
  const released: string[] = [];
  const kept: HeldClaim[] = [];
  /** Failure lines from the single-unit path — the one thing worth surfacing verbatim. */
  const problems: string[] = [];

  for (const claim of held) {
    if (decideClaimExit(claim.displaced).action === "keep") {
      kept.push(claim);
      continue;
    }
    // Capture rather than print: `releaseClaimWithNotice` returning true means the ONLY thing it
    // logged is its per-unit warning, which the consolidated notice below supersedes. Returning
    // false means it either no-op'd (logged nothing) or FAILED (logged why) — that we keep. No
    // string-sniffing, and none of its fail-soft logic is reimplemented here.
    const captured: string[] = [];
    const didRelease = await releaseClaimWithNotice(
      {
        release: (unitId, sessionId) => deps.release(unitId, sessionId),
        log: (m: string) => captured.push(m),
        now,
      },
      { unitId: claim.unitId, sessionId: input.sessionId, caller: input.caller },
    );
    if (didRelease) released.push(claim.unitId);
    else problems.push(...captured);
  }

  for (const line of problems) log(line);
  if (released.length > 0 || kept.length > 0) {
    log(
      chainClaimExitNotice({
        caller: input.caller,
        sessionId: input.sessionId,
        released,
        kept: kept.map((k) => k.unitId),
        at: now().toISOString(),
      }),
    );
  }
  return { released, kept };
}

/**
 * PURE: the one notice a chain emits about the claims it is putting down. Says what went away, what
 * it left behind and why, and how to re-take — the same three facts `unexplicitReleaseWarning`
 * carries, folded to one block so a seven-node chain reports once instead of seven times.
 */
export function chainClaimExitNotice(input: {
  caller: string;
  sessionId: string;
  released: readonly string[];
  kept: readonly string[];
  at: string;
}): string {
  const lines = [`[claim] ${input.caller} is putting down the claims it took, at ${input.at}:`];
  if (input.released.length > 0) {
    lines.push(
      `        RELEASED (this run took them, so releasing restores the ledger): ${input.released.join(", ")}`,
      "        Not an explicit `noticeboard done`. ADR-0200 D3 requires a live claim before the merge",
      "        ceremony — if this session still needs one, re-take it with:",
      `          pnpm storytree noticeboard declare --node <unit> --pg`,
    );
  }
  if (input.kept.length > 0) {
    lines.push(
      `        KEPT (this session already held them — borrowed, not taken): ${input.kept.join(", ")}`,
      "        A run releases only a claim its own take created (ADR-0199's class), so your",
      "        declaration survives its builds.",
    );
  }
  return lines.join("\n");
}

/**
 * PURE: the refusal body for a chain that collided. Names the UNIT actually held — a capability or a
 * contract — never the story, which is the whole point of the change (ADR-0270 D3), and says plainly
 * that a sibling on a disjoint member is no longer blocked (the D1 tension this resolves).
 */
export function chainClaimRefusalBody(input: {
  storyId: string;
  refusedUnit: string;
  heldBy: ClaimDocT;
  requested: readonly string[];
}): string {
  const others = input.requested.filter((u) => u !== input.refusedUnit);
  return [
    `node "${input.refusedUnit}" — a member of story "${input.storyId}" — is already claimed by another live session. REFUSED (ADR-0121).`,
    "",
    `held by:     ${input.heldBy.sessionId} (branch ${input.heldBy.branch})`,
    `claimed at:  ${input.heldBy.claimedAt}`,
    `this chain wanted: ${input.requested.join(", ")}`,
    "",
    "The chain claims the NODES it writes, not the story (ADR-0270 D3: a refusal names the unit",
    "actually held). Two runs proving the same node write duplicate signed verdicts into the shared",
    "event store and bill twice for it, so the second is refused before any worktree or spend — and",
    "the claims this chain had already taken have been released, leaving the ledger as it was found.",
    "",
    others.length > 0
      ? `A session driving only the other members (${others.join(", ")}) is NOT blocked — disjoint\nmembers of one story no longer contend (ADR-0270 D1).`
      : "This chain drives exactly the contended node, so there is no disjoint remainder to drive.",
  ].join("\n");
}
