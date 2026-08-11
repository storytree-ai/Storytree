/**
 * `storytree noticeboard` command family (ADR-0033, re-founded on the claim ledger by ADR-0200).
 *
 * Sub-commands: (undefined) = board, "declare", "done".
 * Every handler returns an `Envelope` — testable without a terminal.
 * DO NOT import from any organism's `/store` subpath — the seam keeps this module offline-testable.
 *
 * PRESENCE IS RETIRED (ADR-0200 D7): the graded claim ledger (`events.node_claim`/`claim_event`)
 * is the ONE coordination + observability machinery. The board renders the ledger ONLY; `declare`
 * is the claim-taking anchor ceremony (ADR-0142 claim-at-declare, now the whole verb); `done`
 * bulk-releases the session's claims. Nothing here reads or writes `events.session` any more.
 *
 * `declare` is where ADR-0346 lands, because it is the highest-volume claim-taking path: a held node
 * now QUEUES this session and fences it out (D1 — `waiting` binds, and the refusal exits non-zero
 * instead of offering "coordinate or pick other work"), and a STORY id is refused outright (D2 —
 * the grain retired; the capability, or the increment when there is no capability to name). The
 * migration is pull-based: a session adopts the new grain at its next declare.
 */
import { execFileSync } from "node:child_process";

import type {
  ClaimDocT,
  ClaimRequest,
  ClaimResult,
  SessionClaimGroup,
} from "@storytree/notice-board";
import {
  CLAIM_STALE_RECLAIM_MS,
  claimRole,
  groupClaimsBySession,
  isReclaimable,
  workClaimRequest,
} from "@storytree/notice-board";

import { claimNamespaceOneLine, fenceStoryWorkClaim } from "./claim-namespace.js";
import { guardClaimNamespace, kindSuffix, type ClaimUniverseLoader } from "./claim-universe.js";
import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface SessionIdentity {
  sessionId: string;
  branch: string;
}

/**
 * The session-scoped slice of the write-claim store (ADR-0142 claim-at-declare): `declare --node`
 * takes the work-time claim on each declared node (the story wisp), and `done` bulk-releases
 * everything the session holds. Satisfied by `PgClaimStore`; null when offline — declare/done then
 * refuse with the db:up guidance (there is no presence fallback to land on, ADR-0200 D7).
 */
export interface SessionClaimStoreLike {
  /**
   * `opts.queueOnRefusal` (ADR-0346 D1): a declared node whose work slot is held puts this session
   * in the WAITING line rather than dead-ending, in one transaction — so a fenced-out node is a
   * node this session is queued for, and the ADR-0200 D2 promotion reaches it when the holder lets
   * go. Optional on the seam so a narrower test double stays assignable.
   */
  claim(req: ClaimRequest, opts?: { queueOnRefusal?: boolean }): Promise<ClaimResult>;
  releaseClaimsBySession(sessionId: string): Promise<number>;
}

/**
 * The board's READ slice of the claim ledger (ADR-0200 D7 — the noticeboard IS the claim ledger):
 * EVERY claim row, all units, all grades, stale ones INCLUDED. Duck-typed (never a /store import —
 * this module stays offline-testable); satisfied by `PgClaimStore`.
 *
 * It read `listLiveClaims` (stale-filtered in SQL) until ADR-0346 D1's companion work. The board
 * cannot mark what the store never hands it, and a silently-dropped row is exactly how the board
 * printed "No live claims on the ledger." over a table holding an unmarked 554-hour row that
 * `noticeboard claims` was showing at the same moment. Staleness is now decided ONCE, in the pure
 * `groupClaimsBySession` fold, and SAID OUT LOUD by {@link renderLedgerBoard}.
 */
export interface ClaimLedgerReadLike {
  listAllClaims(): Promise<ClaimDocT[]>;
}

// (A write-authority RECEIPT seam lived here — `declare` stamped one, `done` revoked it — so the
// wall could prove a claim without dialling the ledger on every write. ADR-0284 D4 retired it with
// the hook that was its only consumer.)

export interface NoticeboardDeps {
  identity: SessionIdentity | null;
  now: () => Date;
  /** The write-claim store (ADR-0142); null = offline — declare/done refuse politely. */
  claims?: SessionClaimStoreLike | null;
  /** The claim-ledger read (ADR-0200 D7); null = offline — the board renders empty. */
  ledger?: ClaimLedgerReadLike | null;
  /**
   * The claim NAMESPACE (ADR-0310 D2) — `declare --node` is the highest-volume claim-taking path
   * and took two of the 26 measured phantoms as PATHS pasted where an id belonged. Absent/null =
   * unchecked, the pre-ADR-0310 behaviour.
   */
  universe?: ClaimUniverseLoader | null;
}

// ---------------------------------------------------------------------------
// deriveIdentity
// ---------------------------------------------------------------------------

function builtinRunGit(args: string[]): string {
  return (execFileSync("git", args, { encoding: "utf8" }) as string).trim();
}

/**
 * The refusal prose shared by every identity-gated verb (declare / done / claim). One copy, because
 * three drifting copies is how a widened rule keeps teaching the old one.
 */
export const IDENTITY_REFUSAL_BODY =
  "Identity is derived from the session worktree (ADR-0033 Decision 1) — from ANY git-registered " +
  "linked worktree, whatever its parent path (`.claude/worktrees/<name>`, " +
  "`.codex/worktrees/<n>/storytree`, or your own convention; `git worktree list` shows them). " +
  "The PRIMARY CHECKOUT is deliberately refused: the shared lobby has no isolated identity to " +
  "claim under. Run this command from inside a worktree — there is deliberately no flag to " +
  "supply an identity manually.";

/** Trailing-separator-tolerant last path component, for paths git hands back in either separator. */
function basename(p: string): string {
  const parts = p.trim().replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

/** Compare two git-reported absolute paths for identity, tolerating separator + trailing-slash skew. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * Derive session identity from the git worktree — from ANY worktree git itself has REGISTERED, not
 * from a hard-coded path prefix (the ADR-0033 D1 decision is "the session worktree", never
 * specifically `.claude/`). Widened because a registered linked worktree at
 * `.codex/worktrees/<n>/storytree` was refused three times across three branches while `git worktree
 * list` showed it: the session HAD the isolation the rule exists to guarantee, and only the prefix
 * match disagreed. ADR-0200 D3 requires a live noticeboard claim before the merge ceremony, so that
 * refusal fenced a whole runtime out of the ceremony; ADR-0232 makes Codex a first-class leaf, so
 * it recurs by construction.
 *
 * `branch` = current HEAD branch name. `sessionId` resolves in this order:
 *
 *  1. `.claude/worktrees/<name>` -> `<name>`, the historical rule, byte-for-byte. It stays FIRST and
 *     separate rather than folding into rule 2 because the two can genuinely disagree: a slot
 *     RENAMED after creation keeps git's original admin-dir name, and this box carries exactly that
 *     — `.claude/worktrees/gemini-subagents-preserved` is admin dir `gemini-subagents`. Folding the
 *     rules would silently re-key such a session's existing claims.
 *  2. Any other registered linked worktree -> the basename of its git ADMIN dir
 *     (`<common>/worktrees/<id>`), NOT of its path. Git mints that id itself and de-duplicates it
 *     per repository, which is the path-qualification the proposal's Risks section demands: on this
 *     box six Codex worktrees share the path basename `storytree` and five `--real` replicas share
 *     `wt`, so a path-basename identity would collapse six sessions onto ONE claim — strictly worse
 *     than the refusal being fixed. Git has already spread them as `storytree`..`storytree5`.
 *  3. The PRIMARY CHECKOUT -> null, detected as git-dir === git-common-dir. Load-bearing and
 *     UNCHANGED: the shared lobby has no isolated identity and cannot satisfy the explicit
 *     noticeboard claim requirement for the merge ceremony.
 *
 * Returns `null` for the primary checkout, an empty basename, or any git error (unchanged).
 */
export function deriveIdentity(
  runGit: (args: string[]) => string = builtinRunGit,
): SessionIdentity | null {
  try {
    const toplevel = runGit(["rev-parse", "--show-toplevel"]);
    // Rule 1: .../.claude/worktrees/<name> (both / and \ separators, name is last path component).
    const match = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(toplevel);
    let sessionId = match?.[1] ?? "";

    if (sessionId.length === 0) {
      // Rules 2 + 3. `--path-format=absolute` so both answers are comparable (and both absolute);
      // already the house form in `presence-hook.sh` and `check-declared.ts`.
      const gitDir = runGit(["rev-parse", "--path-format=absolute", "--git-dir"]);
      const commonDir = runGit(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
      // Rule 3: equal means this is the primary checkout (or a submodule root) — no session identity.
      if (samePath(gitDir, commonDir)) return null;
      // Rule 2: linked worktree — git's own registry key, unique per repository by construction.
      sessionId = basename(gitDir);
    }

    if (sessionId.length === 0) return null;
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    return { sessionId, branch };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function formatAgeMs(elapsedMs: number): string {
  const minutes = Math.floor(Math.max(0, elapsedMs) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * Render a claim's free prose for a human, or `(none)` when it carries none (ADR-0346 D3). ONE
 * copy, shared with the board lines in `noticeboard-claims.ts` — an empty pair of quotes reads as
 * "the holder said nothing", which is true, and as "the field is broken", which is not.
 */
export function describeIntent(intent: string): string {
  return intent.trim().length > 0 ? `"${intent.trim()}"` : "(none)";
}

/**
 * Name a blocking holder: WHO, what ROLE, in what WORDS, for how LONG, and whether it is ALIVE
 * (ADR-0346 D1 + D3). ONE copy, shared with the ledger verbs in `noticeboard-claims.ts`, for the
 * reason {@link IDENTITY_REFUSAL_BODY} is one copy: a refusal rendered two ways drifts into
 * teaching two different rules.
 *
 * "HELD by X (branch …, intent …)" left the only actionable question unanswered — queue behind a
 * live builder, or take over a ghost. A refusal from `claim()`/`upgrade()` names a LIVE holder in
 * practice (the store reclaims a stale one in the same transaction rather than refusing), so
 * liveness is computed rather than asserted: the message cannot outlive that guarantee.
 *
 * D3 added the other two halves. `role` is the typed word (`claimRole` derives it for a pre-split
 * row, so this line is honest over both eras), and `intent` is now genuinely the holder's own
 * prose — which for 15 of the 16 refusals measured in the 12 days to 2026-08-11 was the literal
 * string "orchestrate", telling the blocked session nothing. `held` is the claim's own age,
 * distinct from the heartbeat age: a claim taken 6 h ago and beating 2 min ago is a long job in
 * progress, not a ghost, and the two numbers are the only way to tell that from the outside.
 */
export function describeHolder(holder: ClaimDocT, now: Date): string {
  const beat = Math.max(0, now.getTime() - new Date(holder.heartbeatAt).getTime());
  const held = Math.max(0, now.getTime() - new Date(holder.claimedAt).getTime());
  const liveness = isReclaimable(holder, now)
    ? `STALE — no heartbeat for ${formatAgeMs(beat)}, reclaimable`
    : `LIVE — heartbeat ${formatAgeMs(beat)} ago`;
  return (
    `${holder.sessionId} (branch ${holder.branch}, role ${claimRole(holder)}, ` +
    `intent ${describeIntent(holder.intent)}, held ${formatAgeMs(held)}, ${liveness})`
  );
}

/** One board line — unit id, [grade], role, age, the STALE marker when it is one, intent prose. */
function renderBoardClaim(claim: SessionClaimGroup["claims"][number]): string {
  const base = `  - ${claim.unitId}  [${claim.grade}/${claim.role}]  ${formatAgeMs(claim.ageMs)}`;
  // The word "stale", in the word "stale" — neither surface used it before ADR-0346 D1, so a
  // 554-hour ghost and a live holder rendered identically wherever they rendered at all.
  const mark = claim.stale ? `  STALE ${formatAgeMs(claim.heartbeatAgeMs)} — reclaimable` : "";
  return claim.intent.length > 0 ? `${base}${mark}  ${claim.intent}` : `${base}${mark}`;
}

/**
 * PURE: render the claim ledger as the board (ADR-0200 D7) — one section per session (the
 * {@link groupClaimsBySession} fold decides grouping/order; this only formats), one line per
 * claim: unit id, [grade], age (mm/hh style), staleness, intent prose.
 *
 * DARK sessions (every row stale) render in their own trailing section rather than vanishing
 * (ADR-0346 D1 companion work). Vanishing was defensible while a claim only advised; once `waiting`
 * BINDS, a row the board hides is a row that can fence a live session out of a capability — and
 * three of the eleven stale rows measured on 2026-08-11 were `work` rows. Every row in the table
 * appears here; the board's own claim about the ledger is now checkable against the ledger.
 */
export function renderLedgerBoard(groups: SessionClaimGroup[]): string {
  const lines: string[] = ["Claim ledger (ADR-0200):"];
  if (groups.length === 0) {
    lines.push("", "No claims on the ledger — no rows at all, live or stale.");
    return lines.join("\n");
  }
  const live = groups.filter((g) => !g.stale);
  const dark = groups.filter((g) => g.stale);

  if (live.length === 0) {
    lines.push("", "No LIVE claims on the ledger — but it is not empty; see the stale rows below.");
  }
  for (const group of live) {
    lines.push(`\n## ${group.sessionId}  branch=${group.branch}`);
    for (const claim of group.claims) lines.push(renderBoardClaim(claim));
  }

  if (dark.length > 0) {
    const rows = dark.reduce((n, g) => n + g.claims.length, 0);
    lines.push(
      "",
      `STALE — ${rows} row${rows === 1 ? "" : "s"} across ${dark.length} session${dark.length === 1 ? "" : "s"} with no heartbeat for over ${formatAgeMs(CLAIM_STALE_RECLAIM_MS)}.`,
      "These rows are still in the ledger: `noticeboard claims <unit> --pg` shows them, and a stale",
      "work row blocks nobody — the next claimer reclaims it in the same transaction (ADR-0200 D2).",
    );
    for (const group of dark) {
      lines.push(`\n## ${group.sessionId}  branch=${group.branch}  [STALE]`);
      for (const claim of group.claims) lines.push(renderBoardClaim(claim));
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// noticeboardCommand
// ---------------------------------------------------------------------------

export async function noticeboardCommand(
  sub: string | undefined,
  opts: { workingOn?: string; nodes: string[] },
  deps: NoticeboardDeps,
): Promise<Envelope> {
  // -------------------------------------------------------------------------
  // Unknown sub-command → help
  // -------------------------------------------------------------------------
  if (sub !== undefined && sub !== "declare" && sub !== "done") {
    return {
      ok: false,
      body: [
        "Unknown noticeboard sub-command.",
        "",
        "Usage:",
        "  storytree noticeboard         — show the notice board (the claim ledger)",
        "  storytree noticeboard declare  — take the work-time claim on your --node unit ids (the CAPABILITY you are writing, several if several; the increment id when there is no capability to name — a story is no longer a work claim, ADR-0346 D2)",
        "  storytree noticeboard done     — release every claim this session holds",
      ].join("\n"),
      next: [
        "storytree noticeboard --pg",
        "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
        "storytree noticeboard done --pg",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Board (sub === undefined) — the claim ledger IS the board (ADR-0200 D7).
  // Ledger-less/offline degrades to the empty no-live-claims render, never an
  // error and never a presence read (presence is retired).
  // -------------------------------------------------------------------------
  if (sub === undefined) {
    const ledger = deps.ledger ?? null;
    const bodyLines: string[] = [];
    if (ledger === null) {
      // NOT `renderLedgerBoard([])`: an empty render says "no claims on the ledger", which is an
      // assertion about a store this process never read. Unknown and empty are different answers,
      // and conflating them is the same defect ADR-0346 D1's companion work exists to remove.
      bodyLines.push(
        "Claim ledger (ADR-0200):",
        "",
        "UNREAD — offline, so this says nothing about what the ledger holds.",
        "(pass --pg with the DB up: pnpm db:up)",
      );
    } else {
      const claims = await ledger.listAllClaims();
      bodyLines.push(renderLedgerBoard(groupClaimsBySession(claims, deps.now())));
    }
    return {
      ok: true,
      body: bodyLines.join("\n"),
      next: [
        'storytree noticeboard claim <unit-id> --grade exploring --intent "<why>" --pg',
        "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
        "storytree noticeboard done --pg",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // declare — the claim-taking anchor ceremony (ADR-0142, presence retired)
  // -------------------------------------------------------------------------
  if (sub === "declare") {
    const claims = deps.claims ?? null;
    if (claims === null) {
      return {
        ok: false,
        body:
          "declare requires the live store (--pg). " +
          "Bring the DB up and pass --pg.",
        next: ["pnpm db:up", "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg"],
      };
    }
    if (deps.identity === null) {
      return { ok: false, body: IDENTITY_REFUSAL_BODY };
    }
    const workingOn = opts.workingOn;
    if (workingOn === undefined || workingOn.trim().length === 0) {
      return {
        ok: false,
        body:
          "A non-blank --working-on description is required (workingOn must describe what this session is doing).",
      };
    }
    if (opts.nodes.length === 0) {
      // Presence retired (ADR-0200 D7): a node-less declare has nothing to anchor — the claim IS
      // the declaration now. Fail closed with the ceremony, never a silent no-op.
      return {
        ok: false,
        body:
          "declare anchors work by CLAIMING story nodes on the ledger (ADR-0200 — presence is " +
          "retired). Pass at least one --node <unit-id>; each declared node takes the work-time " +
          "claim (the story wisp).",
        next: [
          "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
          'storytree noticeboard claim <unit-id> --grade exploring --intent "<why>" --pg',
        ],
      };
    }

    // Claim-at-declare (ADR-0142): anchoring a node takes the work-time claim on it — the wisp
    // acquisition ADR-0138 §3 named. Fail-soft per node: one refusal/hiccup never loses the other
    // nodes' claims; every outcome is surfaced loudly.
    const claimLines: string[] = [];
    const acquired: string[] = [];
    // Withheld splits THREE ways because the remedies differ: a HELD node is a conflict the session
    // resolves itself (ADR-0270 D2), a FAILED write is a store problem no re-declare will fix, and
    // an UNRESOLVED id (ADR-0310 D2) is a typo only the session can correct — no amount of retrying
    // or waiting makes a name that refers to nothing refer to something.
    const held: string[] = [];
    const failed: string[] = [];
    const unresolved: string[] = [];
    /** Nodes refused by the story-grain fence (ADR-0346 D2) — a real id, at a retired grain. */
    const fenced: string[] = [];
    /** Owners of the SUBTREES this declare actually claimed — the overlap footer's input. */
    const subtreeOwners = new Set<string>();
    for (const nodeId of opts.nodes) {
      // The namespace fence runs BEFORE the write, per node: one bad id must not cost the others
      // their claims, which is the same fail-soft posture the loop already takes for a conflict.
      const named = await guardClaimNamespace({
        id: nodeId,
        universe: deps.universe,
        verb: "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
      });
      if (!named.ok) {
        unresolved.push(nodeId);
        claimLines.push(`    ${nodeId}: ${claimNamespaceOneLine(named.suggestions)}`);
        continue;
      }
      // The story-grain fence (ADR-0346 D2), per node and BEFORE the write, for the same fail-soft
      // reason the namespace check is: one node declared at the retired grain must not cost the
      // others their claims. `declare` is the highest-volume work-claim path, so this is where the
      // grain actually migrates — pull-based, at each session's next declare.
      const fence = fenceStoryWorkClaim({
        id: nodeId,
        kind: named.kind,
        uatWitness: named.uatWitness,
        verb: "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg",
      });
      if (!fence.ok) {
        fenced.push(nodeId);
        claimLines.push(
          `    ${nodeId}: NOT CLAIMED — a STORY is no longer a work claim (ADR-0346 D2); ` +
            "claim the capability you are writing",
        );
        continue;
      }
      try {
        const res = await claims.claim(
          workClaimRequest({
            unitId: nodeId,
            sessionId: deps.identity.sessionId,
            branch: deps.identity.branch,
            kind: "orchestrate",
            // THE PROSE THIS VERB ALREADY VALIDATED, WRITTEN THROUGH (ADR-0346 D3). It used to stop
            // at the envelope body: the row got the literal string "orchestrate" and the session's
            // own description of its work was discarded at the store boundary. That is why the
            // column read "orchestrate" 708 times in 1285 hold spans, and why 15 of the 16 refusals
            // in the 12 days to 2026-08-11 could tell a blocked session nothing about the holder.
            // The typed half the map reads is now `role`, stamped from `kind` — the two no longer
            // compete for one column.
            intent: workingOn.trim(),
          }),
          // ADR-0346 D1: a held node fences this session OUT of it, so the session joins the line
          // rather than being told "no" and left to decide. The take and the enqueue are one
          // transaction, so a release cannot slip between them.
          { queueOnRefusal: true },
        );
        if (res.acquired) acquired.push(nodeId);
        else held.push(nodeId);
        // A declare may anchor several nodes, so the subtree/owner overlap is stated ONCE for the
        // whole verb rather than per line (ADR-0317 D3 — announced, not enforced; see
        // `subtreeClaimNote`). Only nodes actually claimed are collected: telling a session about an
        // overlap on a row it does not hold would be this verb overclaiming again.
        if (res.acquired && named.kind === "subtree" && named.owner !== null) {
          subtreeOwners.add(named.owner);
        }
        claimLines.push(
          res.acquired
            ? `    ${nodeId}${kindSuffix(named.kind, named.owner)}: claimed — the wisp is lit`
            // The holder's LIVENESS rides along (ADR-0346 D1 companion work): the choice this
            // session now has to make is unanswerable without knowing whether the holder is alive.
            // "coordinate or pick other work" is gone with the affordance it named — under D1 the
            // session does not coordinate its way in, it is QUEUED and works elsewhere.
            : `    ${nodeId}: HELD by ${describeHolder(res.heldBy, deps.now())} — ` +
              `${"queued" in res ? "you are QUEUED behind them" : "NOT queued — take the waiting claim"}; this node is fenced`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push(nodeId);
        claimLines.push(`    ${nodeId}: claim write FAILED (${msg}) — wisp NOT lit`);
      }
    }

    const withheld = [...held, ...failed, ...unresolved, ...fenced];
    // The three outcomes are graded by WHAT THE SESSION HOLDS when the verb returns, because the
    // merge ceremony explicitly requires a live noticeboard claim (ADR-0200 D3).
    // Fidelity over politeness: the headline and the exit code both report the ledger, not the
    // attempt. Until now every arm printed `Declared session "<x>"` and exited 0, so a declare that
    // took NOTHING read as done — and the session learned otherwise only at the gate, after the
    // work. Two sibling sessions filed that same defect 20 minutes apart on 2026-08-04.
    //
    //   A. every node claimed      -> ok, byte-compatible with the pre-fix render.
    //   B. SOME claimed (partial)  -> ok, but the headline names the shortfall. The session DOES
    //      hold a live claim, so the gate passes and stopping it would be a lie in the other
    //      direction; it just is not writing the withheld node. Decided explicitly rather than
    //      inherited: the observed defect was the total case, and a partial declare is a different
    //      situation with a different honest answer.
    //   C. NOTHING claimed         -> NOT ok. This declare anchored nothing, so saying "Declared"
    //      is the untrue record. This is the arc's class — a write path reporting success while the
    //      durable row disagrees — resolved the way the arc charters it: refuse, and say why.
    //
    // Arm C stays a REFUSAL-WITH-A-BOARD, never a bare error: ADR-0270 D2 makes resolving a claim
    // conflict the session's own call and never an owner question, and a session cannot exercise
    // that judgment against a message it read as success. The board is what it judges from.
    //
    // Arm C claims only what THIS DECLARE did, never that the session holds nothing anywhere: the
    // store seam here takes claims, it does not read the session's other rows, and a session that
    // declared a second unit after a first one usually does hold one. Asserting "UNCLAIMED" would
    // be this verb committing the same overclaim it is being fixed for.
    const headline =
      withheld.length === 0
        ? `Declared session "${deps.identity.sessionId}" on the claim ledger.`
        : acquired.length > 0
          ? `Declared session "${deps.identity.sessionId}" — PARTIAL: claimed ${acquired.length} of ${opts.nodes.length} nodes.`
          : `Declare took NO claim — nothing was anchored for session "${deps.identity.sessionId}".`;

    const bodyLines = [
      headline,
      `  branch:     ${deps.identity.branch}`,
      `  workingOn:  ${workingOn.trim()}`,
      `  nodes:      ${opts.nodes.join(", ")}`,
      "  claims:",
      ...claimLines,
    ];

    if (subtreeOwners.size > 0) {
      const owners = [...subtreeOwners].sort().join(", ");
      bodyLines.push(
        "",
        "You claimed a declared SUBTREE (ADR-0317 D3). The ledger keys claims by id and knows no",
        `containment, so a session holding ${owners} does NOT contend with you over the same`,
        "files — check both boards before you write.",
      );
    }

    if (acquired.length > 0 && withheld.length > 0) {
      bodyLines.push(
        "",
        `Withheld: ${withheld.join(", ")}. This session DOES hold a live noticeboard claim ` +
          `(${acquired.join(", ")}), but the withheld node was not anchored — and under ADR-0346 D1 ` +
          "that is a FENCE, not a hint: do not write it. Work the nodes you did claim.",
      );
    } else if (withheld.length > 0) {
      bodyLines.push(
        "",
        "Every declared node was withheld, so this declare anchored NOTHING. If this session holds " +
          "no other live claim it is not ready for the merge ceremony: ADR-0200 D3 requires an " +
          "explicit live noticeboard claim. " +
          "This non-zero exit is that failure, moved to the moment you can still act on it — " +
          "`storytree noticeboard --pg` shows what you actually hold.",
      );
      if (held.length > 0) {
        bodyLines.push(
          "",
          "The held node is FENCED, and you are in its line — `waiting` binds (ADR-0346 D1): the " +
            "store hands you the slot when the holder releases, so there is nothing to poll. Do " +
            "not build it in the meantime. Two branches and only two (ADR-0346 D4): work another " +
            "capability you already hold, or write what you were attempting and what remains onto " +
            "the owning arc, release your claims, and END the session (ADR-0303 — escalating is a " +
            "landing, never a pause). A claim conflict is still never an owner question " +
            "(ADR-0270 D2's surviving clause).",
        );
      }
      if (failed.length > 0) {
        bodyLines.push(
          "",
          `${failed.length} claim write${failed.length !== 1 ? "s" : ""} FAILED against the store ` +
            "— that is a store problem, not a conflict: no re-declare fixes it until the write " +
            "lands. Check the DB and re-declare.",
        );
      }
    }

    // Outside the arms above, because an unresolvable id needs saying in BOTH: a declare that
    // anchored two of three nodes still wrote nothing for the third, and the session would
    // otherwise read "PARTIAL" and assume a sibling holds it. Nothing else in this verb tells the
    // difference between "someone has it" and "it does not exist".
    if (unresolved.length > 0) {
      bodyLines.push(
        "",
        `${unresolved.length} declared id${unresolved.length !== 1 ? "s name" : " names"} nothing ` +
          `in the work graph: ${unresolved.join(", ")} (ADR-0310 D2). No row was written for ` +
          `${unresolved.length !== 1 ? "them" : "it"} — this is NOT a conflict and NOT a store ` +
          "problem, so neither waiting nor re-running changes it. A claim on an id that resolves " +
          "to nothing protects no code and contends with no sibling; 26 such ids accumulated " +
          "silently before this check existed. Fix the id (the suggestions above are the closest " +
          "real nodes) and re-declare.",
      );
    }

    // Also outside the arms above, and for the same reason: a fenced node is neither a conflict nor
    // a typo. Its id is REAL and nobody holds it — the GRAIN is retired, so the remedy is to declare
    // at a finer one, which no amount of re-running or waiting reaches.
    if (fenced.length > 0) {
      bodyLines.push(
        "",
        `${fenced.length} declared id${fenced.length !== 1 ? "s are" : " is"} a STORY: ` +
          `${fenced.join(", ")}. A story is no longer a work claim (ADR-0346 D2) — declare the ` +
          "CAPABILITY you are writing, several if you are writing several, or the INCREMENT you " +
          "are driving when there is no capability to name (ADR-0308 D5). Nobody is holding these " +
          "ids: the grain went, not the node. The story tier is still claimable where it names " +
          "real work — a `uat_witness: machine` story's UAT node, which `story build` claims " +
          "alongside its members — and these stories do not declare it. To read or plan across a " +
          "story rather than write it, take the SHARED exploring claim: it is untouched by D2, and " +
          "it fences nobody.",
      );
    }

    // `next` points at the remedy for the state the session is actually in — for arm C that is the
    // one command the measured sessions eventually reached for, rather than the onward navigation
    // a successful declare offers.
    const firstHeld = held[0];
    const firstFenced = fenced[0];
    let next: string[];
    if (acquired.length > 0) {
      next = [`storytree tree ${opts.nodes[0]} --pg`, "storytree noticeboard --pg"];
    } else if (firstFenced !== undefined) {
      // The fence outranks a conflict in `next` because it is the one state re-running cannot
      // change: a held node promotes on its own, an unresolved id is a typo, a story is a grain.
      next = [
        `storytree tree ${firstFenced}   (this story's capabilities — declare the one you are writing)`,
        "storytree noticeboard declare --working-on <prose> --node <capability-id> --pg",
        `storytree noticeboard claim ${firstFenced} --grade exploring --intent "<why>" --pg`,
      ];
    } else if (firstHeld !== undefined) {
      next = [
        "storytree noticeboard mine --pg   (what you hold — work one of these, ADR-0346 D4)",
        `storytree noticeboard claims ${firstHeld} --pg`,
        "storytree arc increment add <arc-id> --outcome <text|@file> --pg   (land the residue and END)",
      ];
    } else {
      // Nothing held and nothing acquired: every node's write FAILED, so the store is the problem.
      next = ["pnpm db:probe", "storytree noticeboard declare --working-on <prose> --node <unit-id> --pg"];
    }

    return {
      ok: acquired.length > 0,
      body: bodyLines.join("\n"),
      next,
    };
  }

  // -------------------------------------------------------------------------
  // done — release every claim the session holds (ADR-0142)
  // -------------------------------------------------------------------------
  // sub === "done"
  const claims = deps.claims ?? null;
  if (claims === null) {
    return {
      ok: false,
      body:
        "done requires the live store (--pg). " +
        "Bring the DB up and pass --pg.",
      next: ["pnpm db:up", "storytree noticeboard done --pg"],
    };
  }
  if (deps.identity === null) {
    return { ok: false, body: IDENTITY_REFUSAL_BODY };
  }
  // A done session is working nothing, so its wisps go out. Fail-soft: a release hiccup is
  // surfaced (stale-reclaim and the CI merge clear are the backstops), never a crash.
  try {
    const released = await claims.releaseClaimsBySession(deps.identity.sessionId);
    const note =
      released > 0
        ? `Released ${released} story claim${released !== 1 ? "s" : ""}.`
        : "No live claims held — nothing to release.";
    return {
      ok: true,
      body: `Session "${deps.identity.sessionId}" marked as done. ${note} Thanks for keeping the board current.`,
      next: ["storytree noticeboard --pg"],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      body: `Claim release FAILED (${msg}) — claims will age out via stale-reclaim.`,
      next: ["storytree noticeboard --pg"],
    };
  }
}
