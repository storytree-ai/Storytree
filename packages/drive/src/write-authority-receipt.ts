/**
 * `write-authority-receipt` — the CLAIM RECEIPT (ADR-0257 D5), increment 2 of the session-isolation
 * write-authority wall.
 *
 * WHY A RECEIPT EXISTS AT ALL — it is not a cache, it is what makes the wall AFFORDABLE.
 * `write-authority.ts` decides authority from a live claim set. Asking the ledger for that set costs
 * a full Cloud SQL connector handshake from a cold process: MEASURED at 17.5 s and 22.6 s on the dev
 * box (2026-08-01). A `PreToolUse` hook is a fresh process per tool call and cannot hold a pool
 * (Claude Code persists no state between hook invocations), so a hook that dialled the ledger would
 * add ~20 s to EVERY file write — ~3.3 min across a typical 10-edit session. That is not a wall
 * anyone would keep switched on.
 *
 * The fix is the ADR's own: the ledger is consulted where it is ALREADY being consulted — the claim
 * ceremonies (`worktree create`, `noticeboard declare`) which take the claim and are already paying
 * that cost — and the answer is written down. Every subsequent write reads the note. Cost at the
 * write path: ~0 ms of I/O, and ~450 ms of process+module load, MEASURED, for the whole hook.
 *
 * WHAT IS TRUSTED, AND WHAT IS RE-READ LIVE. The receipt is trusted for the expensive fact only —
 * "this session held these claims on this branch when the ceremony ran". Two facts are re-derived on
 * EVERY write because they are free and because they are exactly the drift the receipt would hide:
 *   - the target's canonical path (`realpath`, so a junction/symlink escape cannot ride a stale note);
 *   - the worktree's CURRENT HEAD branch, read straight off `.git`/HEAD as a file (no `git` spawn —
 *     a spawn measured ~500 ms, the file read is free). A sibling that rewinds this worktree's ref
 *     mid-session therefore still refuses, which is the `concurrent-session-moved-my-branch-ref`
 *     friction shape and one of the arc's motivating incidents.
 * So the receipt bounds STALENESS to the claim itself, and `expiresAt` bounds that.
 *
 * TAMPER-RESISTANCE WITHOUT A SIGNING KEY (the owner's call, 2026-08-01). ADR-0257 D5 specifies a
 * signed receipt whose signing material the writer cannot reach, and explicitly flags key custody as
 * an unresolved design fork. This increment does NOT sign. Instead it places the receipt in the
 * PRIMARY CHECKOUT — `<primaryRoot>/.claude/receipts/` — which the static `permissions.deny` layer
 * (increment 2's other half) makes unwritable by the agent's `Write`/`Edit`/`NotebookEdit` tools.
 * The session can READ its receipt and cannot rewrite it with a file tool.
 *
 * THE RESIDUAL HOLE IS REAL AND IS NOT CLAIMED CLOSED: `permissions.deny` binds the file TOOLS, not
 * a shell. A `Bash` command can still forge a receipt, exactly as a `Bash` command can still write
 * into the lobby — Bash containment is out of scope for this increment by the same owner decision,
 * and D5 stays OPEN until the receipt is genuinely signed. An implementer must not read this module
 * as satisfying D5.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  canonicalisePath,
  classifyTarget,
  containsPath,
  evaluateWriteAuthority,
  platformCaseInsensitive,
  builtinRealpath,
  type LiveClaim,
  type RealpathFn,
  type RepoTopology,
  type TargetResolution,
  type WriteDecision,
} from "./write-authority.js";

/**
 * Bumped whenever the receipt's SHAPE or its trust rules change. A receipt carrying any other
 * version is refused rather than best-effort parsed — an authority artifact from a policy this code
 * does not implement is not evidence of anything.
 */
export const RECEIPT_POLICY_VERSION = 1;

/**
 * How long a minted receipt admits writes. Finite because ADR-0257 D5 requires it: an unbounded
 * receipt is indistinguishable from "authority, once, forever". Twelve hours comfortably covers a
 * working session (so the common path never re-dials the ledger) while guaranteeing that a released
 * or reassigned claim cannot keep admitting writes past the end of the day it was taken.
 */
export const RECEIPT_TTL_MS = 12 * 60 * 60 * 1000;

/** The directory receipts live in, relative to the PRIMARY checkout (the deny-protected lobby). */
export const RECEIPT_DIR_SEGMENTS = [".claude", "receipts"] as const;

/**
 * A minted claim receipt. Deliberately flat and JSON-native — it is written by one process and read
 * by another with no shared types at runtime, so {@link parseReceipt} re-validates every field.
 */
export interface WriteAuthorityReceipt {
  readonly policyVersion: number;
  /** The logical session id — the worktree basename (ADR-0033/0200 D3). */
  readonly sessionId: string;
  /** Canonical absolute root of the worktree this receipt authorises. */
  readonly worktreeRoot: string;
  /** Canonical absolute root of the primary checkout (the lobby) this worktree belongs to. */
  readonly primaryRoot: string;
  /** The branch the claims were taken on. Re-checked against live HEAD on every write. */
  readonly branch: string;
  /** The live claims held at mint time. */
  readonly claims: readonly LiveClaim[];
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/** Where this session's receipt lives. */
export function receiptPath(primaryRoot: string, sessionId: string): string {
  return path.join(primaryRoot, ...RECEIPT_DIR_SEGMENTS, `${sessionId}.json`);
}

/** The worktree a path belongs to, derived by path SHAPE alone. */
export interface LocatedWorktree {
  readonly primaryRoot: string;
  readonly sessionId: string;
  readonly worktreeRoot: string;
}

/**
 * PURE: locate the session worktree containing `cwd` — `<primaryRoot>/.claude/worktrees/<sessionId>`
 * — with no `git` spawn (a spawn measured ~500 ms; this is string work, and the hook runs on every
 * write). Returns null when `cwd` is not inside a managed worktree, which REFUSES upstream: the
 * lobby and every unmanaged checkout are precisely the places a claim cannot be proven.
 *
 * This locates the SESSION, never the TARGET. Authority is still keyed on the canonical target
 * (ADR-0255 D2), so a session cannot widen what it may write by choosing a convenient `cwd`.
 *
 * Lives HERE rather than in the hook script so there is exactly one implementation: the hook is
 * plain `.mjs` and imports this lazily, and a second hand-rolled copy of path logic is precisely
 * how a `/`-vs-`\` bug reaches a security boundary unnoticed.
 */
export function locateWorktree(cwd: string): LocatedWorktree | null {
  const norm = path.resolve(cwd).replace(/\\/g, "/");
  const marker = "/.claude/worktrees/";
  const at = norm.toLowerCase().lastIndexOf(marker);
  if (at === -1) return null;
  const primaryRoot = norm.slice(0, at);
  const sessionId = norm.slice(at + marker.length).split("/")[0] ?? "";
  if (primaryRoot === "" || sessionId === "") return null;
  return { primaryRoot, sessionId, worktreeRoot: `${primaryRoot}${marker}${sessionId}` };
}

/**
 * Stamp a receipt to disk (the claim ceremony's side of ADR-0257 D5). Written into the PRIMARY
 * checkout, which the static deny layer makes unwritable by the agent's file tools — so the session
 * this authorises can read it but cannot rewrite it with `Write`/`Edit`.
 *
 * Best-effort by contract: a receipt that cannot be stamped must NOT fail the claim itself (the
 * claim is the coordination truth; the receipt is a performance artifact). The caller surfaces the
 * failure, and the wall simply refuses that session's writes until a ceremony succeeds — the
 * fail-closed direction.
 */
export function writeReceiptFile(receipt: WriteAuthorityReceipt): { ok: true } | { ok: false; why: string } {
  try {
    const target = receiptPath(receipt.primaryRoot, receipt.sessionId);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, why: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Revoke this session's receipt (the `noticeboard done` side). Releasing claims must withdraw write
 * authority immediately rather than leaving it to lapse at `expiresAt` — otherwise a session that
 * has handed its unit back keeps writing for up to the TTL. Absent file = already revoked, not an error.
 */
export function deleteReceiptFile(primaryRoot: string, sessionId: string): { ok: true } | { ok: false; why: string } {
  try {
    rmSync(receiptPath(primaryRoot, sessionId), { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, why: err instanceof Error ? err.message : String(err) };
  }
}

/** PURE: build a receipt from facts the claim ceremony already holds. */
export function mintReceipt(input: {
  sessionId: string;
  worktreeRoot: string;
  primaryRoot: string;
  branch: string;
  claims: readonly LiveClaim[];
  now: Date;
  ttlMs?: number;
}): WriteAuthorityReceipt {
  const ttl = input.ttlMs ?? RECEIPT_TTL_MS;
  return {
    policyVersion: RECEIPT_POLICY_VERSION,
    sessionId: input.sessionId,
    worktreeRoot: input.worktreeRoot,
    primaryRoot: input.primaryRoot,
    branch: input.branch,
    claims: input.claims.map((c) => ({ unitId: c.unitId, branch: c.branch })),
    issuedAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + ttl).toISOString(),
  };
}

/** A parsed receipt, or the reason it is not usable (which REFUSES). */
export type ReceiptParse =
  | { readonly ok: true; readonly receipt: WriteAuthorityReceipt }
  | { readonly ok: false; readonly why: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * FAIL-CLOSED parse. Every field is checked; anything missing, mistyped, or from another policy
 * version refuses. A forged/truncated/hand-edited receipt must never parse into partial authority.
 */
export function parseReceipt(raw: unknown): ReceiptParse {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, why: "the receipt is not a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  if (r["policyVersion"] !== RECEIPT_POLICY_VERSION) {
    return {
      ok: false,
      why:
        `the receipt declares policyVersion ${String(r["policyVersion"])}, but this wall implements ` +
        `${RECEIPT_POLICY_VERSION} — a receipt from another policy is not evidence for this one`,
    };
  }
  for (const field of ["sessionId", "worktreeRoot", "primaryRoot", "branch", "issuedAt", "expiresAt"]) {
    if (!isNonEmptyString(r[field])) return { ok: false, why: `the receipt field "${field}" is missing or blank` };
  }
  const expiresAt = Date.parse(r["expiresAt"] as string);
  if (Number.isNaN(expiresAt)) return { ok: false, why: "the receipt's expiresAt is not a valid timestamp" };

  const rawClaims = r["claims"];
  if (!Array.isArray(rawClaims)) return { ok: false, why: "the receipt's claims field is not an array" };
  const claims: LiveClaim[] = [];
  for (const entry of rawClaims) {
    if (entry === null || typeof entry !== "object") return { ok: false, why: "a receipt claim is not an object" };
    const c = entry as Record<string, unknown>;
    if (!isNonEmptyString(c["unitId"]) || !isNonEmptyString(c["branch"])) {
      return { ok: false, why: "a receipt claim is missing unitId or branch" };
    }
    claims.push({ unitId: c["unitId"], branch: c["branch"] });
  }

  return {
    ok: true,
    receipt: {
      policyVersion: RECEIPT_POLICY_VERSION,
      sessionId: r["sessionId"] as string,
      worktreeRoot: r["worktreeRoot"] as string,
      primaryRoot: r["primaryRoot"] as string,
      branch: r["branch"] as string,
      claims,
      issuedAt: r["issuedAt"] as string,
      expiresAt: r["expiresAt"] as string,
    },
  };
}

/**
 * Read the worktree's CURRENT HEAD branch WITHOUT spawning git (a spawn measured ~500 ms; this is
 * two small file reads). A linked worktree's `.git` is a FILE holding `gitdir: <path>`; the primary
 * checkout's is a directory. `<gitdir>/HEAD` is either `ref: refs/heads/<branch>` or a raw sha
 * (detached HEAD → null, which refuses upstream).
 *
 * `readFile` is injected so the whole path is proven offline with fakes, in the module's house style.
 */
export function readHeadBranch(
  worktreeRoot: string,
  readFile: (p: string) => string | null,
): string | null {
  const dotGit = path.join(worktreeRoot, ".git");
  let gitDir = dotGit;
  const pointer = readFile(dotGit);
  if (pointer !== null) {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(pointer);
    if (m === null || m[1] === undefined) return null;
    gitDir = path.resolve(worktreeRoot, m[1]);
  }
  const head = readFile(path.join(gitDir, "HEAD"));
  if (head === null) return null;
  const ref = /^ref:\s*refs\/heads\/(.+?)\s*$/m.exec(head);
  return ref === null || ref[1] === undefined ? null : ref[1];
}

/** Why a write was refused before the shared decision was even reachable. */
export interface ReceiptAuthorityInput {
  /** Raw write targets extracted from the tool call. EMPTY refuses (ADR-0257 D3). */
  readonly rawTargets: readonly string[];
  /** Resolves relative targets only; never grants authority (ADR-0255 D2). */
  readonly cwd: string;
  /** The parsed receipt, or null when absent/unreadable/unparseable — which refuses. */
  readonly receipt: WriteAuthorityReceipt | null;
  /** Live HEAD branch of the receipt's worktree; null = detached, which refuses. */
  readonly headBranch: string | null;
  readonly now: Date;
  readonly realpath?: RealpathFn;
  readonly caseInsensitive?: boolean;
}

/**
 * The write-path decision. Composes the RECEIPT (the cheap, bounded authority evidence) with the
 * already-proven pure decision in `write-authority.ts` — which stays the single source of truth for
 * what authority MEANS, so its 28 tests keep covering this path rather than being bypassed by a
 * second implementation.
 *
 * Order matters: receipt-shaped refusals come first because without a receipt there is no topology
 * to classify a target against at all.
 */
export function evaluateReceiptAuthority(input: ReceiptAuthorityInput): WriteDecision {
  const mint = 'pnpm storytree worktree create --node <story-id> --intent "<what>" --pg';

  if (input.receipt === null) {
    return {
      decision: "refuse",
      reason: [
        "REFUSED — this session holds NO write-authority receipt, so its claim cannot be proven",
        "(ADR-0257 D5). A receipt is stamped by the claim ceremony; a workspace without one is a",
        "directory, not a claimed workspace.",
        "",
        `Claim this workspace:  pnpm storytree noticeboard declare --working-on "<what>" --node <unit-id> --pg`,
        `Or mint a claimed one:  ${mint}`,
      ].join("\n"),
    };
  }

  const receipt = input.receipt;
  if (input.now.getTime() >= Date.parse(receipt.expiresAt)) {
    return {
      decision: "refuse",
      reason:
        `REFUSED — this session's write-authority receipt EXPIRED at ${receipt.expiresAt} ` +
        `(ADR-0257 D5: authority is finite, so a stale grant cannot admit writes indefinitely). ` +
        `Re-take the claim to refresh it: pnpm storytree noticeboard declare --node <unit-id> --pg`,
    };
  }

  // Live HEAD, not the receipt's recorded branch: a sibling that rewound this worktree's ref must
  // refuse, which is the whole point of re-reading it.
  if (input.headBranch === null) {
    return {
      decision: "refuse",
      reason:
        `REFUSED — the worktree "${receipt.sessionId}" is on a DETACHED HEAD, so no claim can match ` +
        "its branch (ADR-0255 D2). Check out the session's branch, or mint a fresh workspace.",
    };
  }

  const ci = input.caseInsensitive ?? platformCaseInsensitive();
  const realpath = input.realpath ?? builtinRealpath;
  const topology: RepoTopology = {
    primaryRoot: receipt.primaryRoot,
    // Only THIS session's worktree is a workspace as far as this session is concerned. A sibling's
    // worktree is therefore NOT matched here and falls through to the lobby arm — which is the
    // correct refusal (you may write in your own room), and the sibling hint below makes it honest.
    mintedWorktrees: [{ sessionId: receipt.sessionId, root: receipt.worktreeRoot, branch: input.headBranch }],
    caseInsensitive: ci,
  };

  const targets: TargetResolution[] = input.rawTargets.map((raw) => {
    const canonical = canonicalisePath(raw, input.cwd, realpath);
    if (!canonical.ok) return { ok: false, raw, why: canonical.why };
    return { ok: true, raw, canonical: canonical.path, zone: classifyTarget(canonical.path, topology) };
  });

  const decision = evaluateWriteAuthority({
    targets,
    claimsBySession: { [receipt.sessionId]: receipt.claims },
  });
  if (decision.decision === "allow") return decision;

  // A refusal that is actually a SIBLING's workspace reads misleadingly as "the primary checkout".
  // Name it precisely — this is the cross-session clobber the arc exists to stop, and an operator
  // who is told the wrong thing debugs the wrong problem.
  const sibling = targets.find(
    (t) =>
      t.ok &&
      t.zone.kind === "lobby" &&
      containsPath(path.join(receipt.primaryRoot, ...RECEIPT_DIR_SEGMENTS.slice(0, 1), "worktrees"), t.canonical, ci),
  );
  if (sibling !== undefined && sibling.ok) {
    return {
      decision: "refuse",
      reason: [
        `REFUSED — "${sibling.raw}" resolves to ${sibling.canonical}, which is inside ANOTHER`,
        `session's workspace. This session may write only inside its own claimed worktree`,
        `("${receipt.sessionId}", ${receipt.worktreeRoot}).`,
        "",
        "Reaching into a sibling's checkout is the collision this wall exists to stop (ADR-0255 D2):",
        "its edits surface in that session's diff, red its gate, or vanish under its next commit.",
        "Steer the owning session instead — `pnpm storytree noticeboard --pg` shows who is where.",
      ].join("\n"),
    };
  }
  return decision;
}
