/**
 * `storytree noticeboard` command family (ADR-0033).
 *
 * Sub-commands: (undefined) = board, "declare", "done".
 * Every handler returns an `Envelope` — testable without a terminal.
 * DO NOT import from any organism's `/store` subpath — the seam keeps this module offline-testable.
 */
import { execFileSync } from "node:child_process";

import type {
  ClaimDocT,
  ClaimRequest,
  ClaimResult,
  PresenceDeclarationDoc,
  SessionClaimGroup,
} from "@storytree/notice-board";
import { classifyPresence, groupClaimsBySession, workClaimRequest } from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface PresenceStoreLike {
  /**
   * `opts.reactivate: false` marks an ambient (automation) declare: the store must
   * NOT flip an existing `status: "done"` row back to active — only an explicit
   * declare (the default) may. See `PgPresenceStore.declare`.
   */
  declare(
    doc: PresenceDeclarationDoc,
    opts?: { reactivate?: boolean },
  ): Promise<PresenceDeclarationDoc>;
  done(sessionId: string, lastSeenAt: string): Promise<PresenceDeclarationDoc | null>;
  listActive(): Promise<PresenceDeclarationDoc[]>;
  history(
    sessionId: string,
  ): Promise<Array<{ type: string; doc: unknown; actor: string; at: string }>>;
}

export interface SessionIdentity {
  sessionId: string;
  branch: string;
}

/**
 * The session-scoped slice of the write-claim store (ADR-0142 claim-at-declare): `declare --node`
 * takes the work-time claim on each declared node (one ceremony step = presence + wisp), and `done`
 * bulk-releases everything the session holds. Satisfied by `PgClaimStore`; null when offline —
 * claim behaviour then silently absent (presence still works exactly as before).
 */
export interface SessionClaimStoreLike {
  claim(req: ClaimRequest): Promise<ClaimResult>;
  releaseClaimsBySession(sessionId: string): Promise<number>;
}

/**
 * The board's READ slice of the claim ledger (ADR-0200 D7 — the noticeboard IS the claim ledger):
 * every live claim row, all units, all grades, stale-filtered store-side. Duck-typed like the
 * `claims` seam above (never a /store import — this module stays offline-testable); satisfied by
 * `PgClaimStore.listLiveClaims`. Null/absent = the legacy presence-only board.
 */
export interface ClaimLedgerReadLike {
  listLiveClaims(): Promise<ClaimDocT[]>;
}

export interface NoticeboardDeps {
  store: PresenceStoreLike | null;
  identity: SessionIdentity | null;
  now: () => Date;
  /** The write-claim store (ADR-0142); optional/null = no claim behaviour (offline, older callers). */
  claims?: SessionClaimStoreLike | null;
  /**
   * The claim-ledger read (ADR-0200 D7): when present the board renders the ledger PRIMARY with
   * presence below; optional/null = the byte-compatible legacy presence-only board (offline, older
   * callers).
   */
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

function formatAge(lastSeenAt: string, now: Date): string {
  return formatAgeMs(now.getTime() - new Date(lastSeenAt).getTime());
}

function getOrCreate<K, V>(map: Map<K, V[]>, key: K): V[] {
  let bucket = map.get(key);
  if (bucket === undefined) {
    bucket = [];
    map.set(key, bucket);
  }
  return bucket;
}

function renderBoard(docs: PresenceDeclarationDoc[], now: Date): string {
  if (docs.length === 0) {
    return "No active sessions on the notice board.";
  }

  // Group by node id — a session appears under EACH of its declared nodes.
  // Sessions with no nodes go under "(no node)".
  const groups = new Map<string, PresenceDeclarationDoc[]>();
  for (const doc of docs) {
    if (doc.nodes.length === 0) {
      getOrCreate(groups, "(no node)").push(doc);
    } else {
      for (const nodeId of doc.nodes) {
        getOrCreate(groups, nodeId).push(doc);
      }
    }
  }

  const lines: string[] = ["Active sessions:"];
  for (const [nodeId, sessions] of groups) {
    lines.push(`\n## ${nodeId}`);
    for (const doc of sessions) {
      const band = classifyPresence(doc.lastSeenAt, now);
      const age = formatAge(doc.lastSeenAt, now);
      lines.push(
        `  - ${doc.sessionId}  [${band}]  ${age}  branch=${doc.branch}  ${doc.workingOn}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * PURE: render the claim ledger as the board's PRIMARY section (ADR-0200 D7) — one section per
 * session (the {@link groupClaimsBySession} fold decides grouping/order; this only formats), one
 * line per claim: unit id, [grade], age (same mm/hh style as the presence rows), intent prose.
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
        "  storytree noticeboard         — show the notice board (active sessions)",
        "  storytree noticeboard declare  — declare this session as active",
        "  storytree noticeboard done     — mark this session as done",
      ].join("\n"),
      next: [
        "storytree noticeboard --pg",
        "storytree noticeboard declare --working-on <prose> --pg",
        "storytree noticeboard done --pg",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Board (sub === undefined)
  // -------------------------------------------------------------------------
  if (sub === undefined) {
    if (deps.store === null) {
      return {
        ok: false,
        body:
          "The notice board requires the live store (--pg). " +
          "Bring the DB up and retry with --pg.",
        next: ["pnpm db:up", "storytree noticeboard --pg"],
      };
    }
    const active = await deps.store.listActive();
    const presenceBody = renderBoard(active, deps.now());
    const ledger = deps.ledger ?? null;
    if (ledger === null) {
      // Offline / older callers (no ledger seam): EXACTLY the legacy presence-only board —
      // byte-compatible, so nothing downstream of the pre-ADR-0200 output breaks.
      return {
        ok: true,
        body: presenceBody,
        next: [
          "storytree noticeboard declare --working-on <prose> --pg",
          "storytree noticeboard done --pg",
        ],
      };
    }
    // ADR-0200 D7: the claim ledger IS the board — it renders PRIMARY; presence stays below as
    // the secondary section until the retirement increment removes it.
    const claims = await ledger.listLiveClaims();
    const body = [
      renderLedgerBoard(groupClaimsBySession(claims, deps.now())),
      "",
      "Presence (legacy, retiring):",
      presenceBody,
    ].join("\n");
    return {
      ok: true,
      body,
      next: [
        'storytree noticeboard claim <unit-id> --grade exploring --intent "<why>" --pg',
        "storytree noticeboard declare --working-on <prose> --pg",
        "storytree noticeboard done --pg",
      ],
    };
  }

  // -------------------------------------------------------------------------
  // declare
  // -------------------------------------------------------------------------
  if (sub === "declare") {
    if (deps.store === null) {
      return {
        ok: false,
        body:
          "declare requires the live store (--pg). " +
          "Bring the DB up and pass --pg.",
        next: ["pnpm db:up", "storytree noticeboard declare --working-on <prose> --pg"],
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
    const nowIso = deps.now().toISOString();
    const doc: PresenceDeclarationDoc = {
      sessionId: deps.identity.sessionId,
      branch: deps.identity.branch,
      workingOn: workingOn.trim(),
      nodes: opts.nodes,
      status: "active",
      startedAt: nowIso,
      lastSeenAt: nowIso,
    };
    const stored = await deps.store.declare(doc);
    const nodeList = stored.nodes.length > 0 ? stored.nodes.join(", ") : "(none)";

    // Claim-at-declare (ADR-0142): anchoring a node ALSO takes the work-time claim on it — the wisp
    // acquisition ADR-0138 §3 named, wired the cheap way. Fail-soft per node: a refusal or a claim
    // hiccup never loses the presence declare; it is surfaced loudly instead.
    const claims = deps.claims ?? null;
    const claimLines: string[] = [];
    if (claims !== null && stored.nodes.length > 0) {
      for (const nodeId of stored.nodes) {
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
          claimLines.push(`    ${nodeId}: claim write FAILED (${msg}) — presence declared, wisp NOT lit`);
        }
      }
    }

    const body = [
      `Declared presence for session "${stored.sessionId}".`,
      `  branch:     ${stored.branch}`,
      `  workingOn:  ${stored.workingOn}`,
      `  nodes:      ${nodeList}`,
      `  startedAt:  ${stored.startedAt}`,
      ...(claimLines.length > 0 ? ["  claims:", ...claimLines] : []),
    ].join("\n");

    const next: string[] =
      stored.nodes.length > 0
        ? [
            `storytree tree ${stored.nodes[0]} --pg`,
            "storytree noticeboard --pg",
          ]
        : ["storytree noticeboard --pg"];

    return { ok: true, body, next };
  }

  // -------------------------------------------------------------------------
  // done
  // -------------------------------------------------------------------------
  // sub === "done"
  if (deps.store === null) {
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
  const result = await deps.store.done(deps.identity.sessionId, deps.now().toISOString());
  if (result === null) {
    return {
      ok: false,
      body: `No active declaration found for session "${deps.identity.sessionId}". Use declare first.`,
    };
  }
  // Release every work-time claim the session holds (ADR-0142) — a done session is working nothing,
  // so its wisps go out. Fail-soft: a release hiccup never un-dones the session (stale-reclaim and
  // the CI merge clear are the backstops); it is surfaced instead.
  let claimNote = "";
  if (deps.claims !== undefined && deps.claims !== null) {
    try {
      const released = await deps.claims.releaseClaimsBySession(deps.identity.sessionId);
      if (released > 0) claimNote = ` Released ${released} story claim${released !== 1 ? "s" : ""}.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      claimNote = ` Claim release FAILED (${msg}) — claims will age out via stale-reclaim.`;
    }
  }
  return {
    ok: true,
    body: `Session "${result.sessionId}" marked as done.${claimNote} Thanks for keeping the board current.`,
    next: ["storytree noticeboard --pg"],
  };
}
