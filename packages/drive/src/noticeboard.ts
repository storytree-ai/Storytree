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
 */
import { execFileSync } from "node:child_process";

import type {
  ClaimDocT,
  ClaimRequest,
  ClaimResult,
  SessionClaimGroup,
} from "@storytree/notice-board";
import { groupClaimsBySession, workClaimRequest } from "@storytree/notice-board";

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
  claim(req: ClaimRequest): Promise<ClaimResult>;
  releaseClaimsBySession(sessionId: string): Promise<number>;
}

/**
 * The board's READ slice of the claim ledger (ADR-0200 D7 — the noticeboard IS the claim ledger):
 * every live claim row, all units, all grades, stale-filtered store-side. Duck-typed (never a
 * /store import — this module stays offline-testable); satisfied by `PgClaimStore`.
 */
export interface ClaimLedgerReadLike {
  listLiveClaims(): Promise<ClaimDocT[]>;
}

export interface NoticeboardDeps {
  identity: SessionIdentity | null;
  now: () => Date;
  /** The write-claim store (ADR-0142); null = offline — declare/done refuse politely. */
  claims?: SessionClaimStoreLike | null;
  /** The claim-ledger read (ADR-0200 D7); null = offline — the board renders empty. */
  ledger?: ClaimLedgerReadLike | null;
}

// ---------------------------------------------------------------------------
// deriveIdentity
// ---------------------------------------------------------------------------

function builtinRunGit(args: string[]): string {
  return (execFileSync("git", args, { encoding: "utf8" }) as string).trim();
}

/**
 * Derive session identity from the git worktree.
 *
 * `sessionId` = basename of the toplevel, but ONLY when the toplevel sits
 * under a `.claude/worktrees/` directory (both `/` and `\` separators accepted).
 * `branch` = current HEAD branch name.
 *
 * Returns `null` for a plain checkout, an empty basename, or any git error.
 */
export function deriveIdentity(
  runGit: (args: string[]) => string = builtinRunGit,
): SessionIdentity | null {
  try {
    const toplevel = runGit(["rev-parse", "--show-toplevel"]);
    // Match: .../.claude/worktrees/<name>  (both / and \ separators, name is last path component)
    const match = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(toplevel);
    if (match === null) return null;
    const sessionId = match[1];
    if (sessionId === undefined || sessionId.length === 0) return null;
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    return { sessionId, branch };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatAgeMs(elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * PURE: render the claim ledger as the board (ADR-0200 D7) — one section per session (the
 * {@link groupClaimsBySession} fold decides grouping/order; this only formats), one line per
 * claim: unit id, [grade], age (mm/hh style), intent prose.
 */
export function renderLedgerBoard(groups: SessionClaimGroup[]): string {
  const lines: string[] = ["Claim ledger (ADR-0200):"];
  if (groups.length === 0) {
    lines.push("", "No live claims on the ledger.");
    return lines.join("\n");
  }
  for (const group of groups) {
    lines.push(`\n## ${group.sessionId}  branch=${group.branch}`);
    for (const claim of group.claims) {
      const base = `  - ${claim.unitId}  [${claim.grade}]  ${formatAgeMs(claim.ageMs)}`;
      lines.push(claim.intent.length > 0 ? `${base}  ${claim.intent}` : base);
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
        "  storytree noticeboard declare  — take the work-time claim on your --node story ids",
        "  storytree noticeboard done     — release every claim this session holds",
      ].join("\n"),
      next: [
        "storytree noticeboard --pg",
        "storytree noticeboard declare --working-on <prose> --node <story-id> --pg",
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
      bodyLines.push(
        renderLedgerBoard([]),
        "",
        "(offline — pass --pg with the DB up to read the live ledger)",
      );
    } else {
      const claims = await ledger.listLiveClaims();
      bodyLines.push(renderLedgerBoard(groupClaimsBySession(claims, deps.now())));
    }
    return {
      ok: true,
      body: bodyLines.join("\n"),
      next: [
        'storytree noticeboard claim <unit-id> --grade exploring --intent "<why>" --pg',
        "storytree noticeboard declare --working-on <prose> --node <story-id> --pg",
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
        next: ["pnpm db:up", "storytree noticeboard declare --working-on <prose> --node <story-id> --pg"],
      };
    }
    if (deps.identity === null) {
      return {
        ok: false,
        body:
          "Identity is derived from the session worktree (ADR-0033 Decision 1). " +
          "Run this command from inside a recognised .claude/worktrees/<name> checkout — " +
          "there is deliberately no flag to supply an identity manually.",
      };
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
          "retired). Pass at least one --node <story-id>; each declared node takes the work-time " +
          "claim (the story wisp).",
        next: [
          "storytree noticeboard declare --working-on <prose> --node <story-id> --pg",
          'storytree noticeboard claim <story-id> --grade exploring --intent "<why>" --pg',
        ],
      };
    }

    // Claim-at-declare (ADR-0142): anchoring a node takes the work-time claim on it — the wisp
    // acquisition ADR-0138 §3 named. Fail-soft per node: one refusal/hiccup never loses the other
    // nodes' claims; every outcome is surfaced loudly.
    const claimLines: string[] = [];
    for (const nodeId of opts.nodes) {
      try {
        const res = await claims.claim(
          workClaimRequest({
            unitId: nodeId,
            sessionId: deps.identity.sessionId,
            branch: deps.identity.branch,
            kind: "orchestrate",
          }),
        );
        claimLines.push(
          res.acquired
            ? `    ${nodeId}: claimed — the story wisp is lit`
            : `    ${nodeId}: HELD by ${res.heldBy.sessionId} (branch ${res.heldBy.branch}, intent "${res.heldBy.intent}") — coordinate or pick other work`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        claimLines.push(`    ${nodeId}: claim write FAILED (${msg}) — wisp NOT lit`);
      }
    }

    const body = [
      `Declared session "${deps.identity.sessionId}" on the claim ledger.`,
      `  branch:     ${deps.identity.branch}`,
      `  workingOn:  ${workingOn.trim()}`,
      `  nodes:      ${opts.nodes.join(", ")}`,
      "  claims:",
      ...claimLines,
    ].join("\n");

    return {
      ok: true,
      body,
      next: [`storytree tree ${opts.nodes[0]} --pg`, "storytree noticeboard --pg"],
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
    return {
      ok: false,
      body:
        "Identity is derived from the session worktree (ADR-0033 Decision 1). " +
        "Run this command from inside a recognised .claude/worktrees/<name> checkout — " +
        "there is deliberately no flag to supply an identity manually.",
    };
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
