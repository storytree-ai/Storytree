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
 * match disagreed. Since ADR-0200 D3 that refusal fences a whole runtime out of `check:declared` and
 * therefore out of the merge ceremony, and ADR-0232 makes Codex a first-class leaf, so it recurs by
 * construction.
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
 *     UNCHANGED: the shared lobby has no isolated identity, and `check:declared`'s lobby arm
 *     depends on it staying true.
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
        "  storytree noticeboard declare  — take the work-time claim on your --node unit ids (the capability you are writing, ADR-0270; the story for cross-capability work)",
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
    const acquired: { unitId: string; branch: string }[] = [];
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
        if (res.acquired) acquired.push({ unitId: nodeId, branch: deps.identity.branch });
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
