/**
 * `write-authority` — the pure, fail-closed write-authority DECISION (ADR-0255 D2, hardened by
 * ADR-0257 D1/D3). Increment 1 of the session-isolation write-authority wall.
 *
 * ADR-0255 decided that the primary checkout is a read-only agent lobby and that a repository write
 * is authorised only when its canonical target sits inside a repository-minted worktree whose
 * derived session id and branch match a live claim in the one noticeboard ledger. ADR-0257 D3 then
 * spelled out what "resolves actual targets and fails closed" has to mean. Neither ADR is built:
 * today the ONLY enforcement of this hazard is ADR-0245 D5.2's gate-time lobby arm in
 * `packages/cli/src/check-declared.ts`, which keys on a DIRTY checkout at the landing gate — long
 * after the isolation failure happened.
 *
 * This module is the SEMANTIC layer both harness adapters project: one decision, stated in
 * repository terms, that a Claude `PreToolUse` boundary and a Codex managed hook can each ask before
 * a byte moves. It is deliberately NOT the wall — ADR-0257 D1 is explicit that a pre-tool policy is
 * the decision layer, and that containment (a filesystem profile or broker) stays part of the
 * current minimum wherever a harness cannot prove complete write-path coverage. Installing that
 * boundary, and the transport a hook script uses to reach this code, are later increments.
 *
 * WHAT IS DECIDED BY THE TARGET, NOT THE CALLER. ADR-0255 D2 keys authority on the canonical target
 * path, never on `cwd`: its own Context records a Codex task whose runtime `cwd` was the primary
 * checkout but which wrote only through absolute worktree paths. That write is authorised — the
 * worktree it lands in is claimed. `cwd` is used for one thing here: resolving a RELATIVE target.
 *
 * THE TRAPS THIS ENCODES (ADR-0255's own "a textual prefix check is unsafe"):
 *   - `.claude/worktrees/<name>` lives UNDER the primary root, so "under primary ⇒ lobby" would
 *     refuse every legitimate write. Worktrees are matched FIRST, longest root wins.
 *   - `/repo-evil` must not match `/repo` — containment is segment-boundary aware, not `startsWith`.
 *   - Windows drive-letter case and separators; case-insensitive volumes.
 *   - `..` escapes and junction/symlink escapes out of a worktree.
 *   - A target that does not exist yet (every file CREATE) has no realpath — the nearest existing
 *     ancestor is resolved and the unresolvable tail re-appended.
 *   - A worktree directory git does not know about is NOT a workspace. Enumerating from git rather
 *     than from the `.claude/worktrees/` directory name is what makes ADR-0257's rejected
 *     "permit every `.claude/worktrees` directory" alternative stay rejected.
 *
 * FAIL-CLOSED IS THE WHOLE POINT. Every arm that cannot prove authority REFUSES: no targets
 * extracted, an unresolvable path, a target outside the repository, a lobby target, a detached-HEAD
 * worktree, an unreachable ledger, an unclaimed workspace, a claim on a different branch. There is
 * no "unknown ⇒ allow" arm. Note the contrast with `check-declared.ts`, whose SKIP arms fail OPEN on
 * purpose (a gate check that cannot read the repo must never invent a red): a check that gates a
 * LANDING may fail open, an authority boundary may not.
 *
 * PURE, in the `evaluateDeclared`/`evaluateLobby` house style: the decision takes gathered facts as
 * data. The one unavoidable I/O — resolving symlinks/junctions — rides an injected `realpath`
 * function (the `deriveIdentity(runGit)` pattern), so the whole module is proven offline with fakes.
 */

import { realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/** Resolve one EXISTING path through symlinks/junctions; null when it does not exist or fails. */
export type RealpathFn = (absPath: string) => string | null;

/** The production resolver — `realpathSync.native` so Windows returns the true on-disk casing. */
export const builtinRealpath: RealpathFn = (absPath) => {
  try {
    return realpathSync.native(absPath);
  } catch {
    return null;
  }
};

/** A canonicalised target, or the reason it could not be canonicalised (which REFUSES). */
export type Canonical =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly why: string };

/**
 * Canonicalise one write target: resolve it against `cwd` if relative, collapse `.`/`..`, then
 * resolve symlinks and Windows junctions.
 *
 * A target that does not exist yet is the NORMAL case for a create, so this walks up to the nearest
 * existing ancestor, resolves THAT, and re-appends the unresolved tail. The tail segments cannot
 * themselves be links (they do not exist), so the result is fully canonical. If not even the
 * filesystem root resolves, the target is unresolvable and the caller must refuse.
 */
export function canonicalisePath(
  target: string,
  cwd: string,
  realpath: RealpathFn = builtinRealpath,
): Canonical {
  if (target.trim().length === 0) {
    return { ok: false, why: "the write target is blank" };
  }
  const abs = path.resolve(cwd, target);

  const tail: string[] = [];
  let base = abs;
  for (;;) {
    const real = realpath(base);
    if (real !== null) {
      return { ok: true, path: tail.length === 0 ? real : path.resolve(real, ...[...tail].reverse()) };
    }
    const parent = path.dirname(base);
    if (parent === base) {
      return {
        ok: false,
        why: `no existing ancestor of "${abs}" could be resolved — the target cannot be canonicalised`,
      };
    }
    tail.push(path.basename(base));
    base = parent;
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** One repository-minted worktree as git reports it (`git worktree list --porcelain`). */
export interface MintedWorktree {
  /** The worktree basename — the logical session id (ADR-0033/0200 D3). */
  readonly sessionId: string;
  /** Canonical absolute worktree root. */
  readonly root: string;
  /** The branch this worktree currently has checked out; null = detached HEAD (which refuses). */
  readonly branch: string | null;
}

/** The repository shape a target is classified against — all roots already canonical. */
export interface RepoTopology {
  /** Canonical primary-checkout root (the parent of the git common dir) — the LOBBY. */
  readonly primaryRoot: string;
  /** Every worktree GIT knows about. A directory git does not list is not a workspace. */
  readonly mintedWorktrees: readonly MintedWorktree[];
  /** Fold case when comparing paths (true on Windows and case-insensitive macOS volumes). */
  readonly caseInsensitive: boolean;
}

/** Where a canonical target sits relative to the repository. */
export type TargetZone =
  | { readonly kind: "worktree"; readonly worktree: MintedWorktree }
  | { readonly kind: "lobby" }
  | { readonly kind: "outside" };

/** Default for the running platform — Windows folds case, POSIX does not. */
export function platformCaseInsensitive(platform: string = process.platform): boolean {
  return platform === "win32" || platform === "darwin";
}

/** Strip a trailing separator (except on a bare root) and fold case when the platform folds it. */
/**
 * Normalise a path for COMPARISON only (never for display or I/O).
 *
 * SEPARATORS ARE UNIFIED TO `/`, and that is load-bearing rather than tidy. The two sides of every
 * comparison here arrive from different places and disagree on Windows: the topology roots come from
 * `locateWorktree`, which does string work on a `/`-normalised copy, while canonical targets come
 * back from `realpathSync.native` in native `\` form. Comparing them literally made a session's OWN
 * worktree classify as `outside`, so the wall refused every write including the ones it exists to
 * permit — a brick, indistinguishable in practice from a wall that refuses nothing.
 *
 * Every fixture in the suites below builds both sides with the same `path.join`, so their separators
 * always agreed and the bug was invisible to 49 passing tests. It surfaced the first time the wall
 * ran for real (2026-08-02), which is the whole argument for behavioural proof over unit coverage.
 */
function normaliseForCompare(p: string, caseInsensitive: boolean): string {
  const slashed = p.replace(/\\/g, "/");
  const trimmed = slashed.length > 1 ? slashed.replace(/\/+$/, "") : slashed;
  return caseInsensitive ? trimmed.toLowerCase() : trimmed;
}

/**
 * Is `target` the root itself or strictly inside it? Segment-boundary aware, so `/repo-evil` never
 * matches `/repo` — the trap a bare `startsWith` walks straight into.
 */
export function containsPath(root: string, target: string, caseInsensitive: boolean): boolean {
  const r = normaliseForCompare(root, caseInsensitive);
  const t = normaliseForCompare(target, caseInsensitive);
  if (r.length === 0) return false;
  if (t === r) return true;
  // Both sides are `/`-normalised above, so the boundary is `/` on every platform. Using
  // `path.sep` here was the other half of the mixed-separator brick: on Windows it appended `\` to
  // an already-forward-slashed root, and nothing ever matched.
  const boundary = r.endsWith("/") ? r : `${r}/`;
  return t.startsWith(boundary);
}

/**
 * PURE: classify one CANONICAL target. Worktrees are matched FIRST and the longest matching root
 * wins — `.claude/worktrees/<name>` is nested inside the primary root, and a nested worktree is
 * legal, so lobby-first or shortest-first would misclassify every real workspace write.
 */
export function classifyTarget(canonicalPath: string, topology: RepoTopology): TargetZone {
  const ci = topology.caseInsensitive;
  let best: MintedWorktree | null = null;
  let bestLen = -1;
  for (const wt of topology.mintedWorktrees) {
    if (!containsPath(wt.root, canonicalPath, ci)) continue;
    const len = normaliseForCompare(wt.root, ci).length;
    if (len > bestLen) {
      best = wt;
      bestLen = len;
    }
  }
  if (best !== null) return { kind: "worktree", worktree: best };
  if (containsPath(topology.primaryRoot, canonicalPath, ci)) return { kind: "lobby" };
  return { kind: "outside" };
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/** One target after canonicalisation + classification, or the reason it could not be resolved. */
export type TargetResolution =
  | { readonly ok: true; readonly raw: string; readonly canonical: string; readonly zone: TargetZone }
  | { readonly ok: false; readonly raw: string; readonly why: string };

/** A live claim row as the ledger reports it (the `ClaimDocT` slice this decision reads). */
export interface LiveClaim {
  readonly unitId: string;
  readonly branch: string;
  readonly grade?: string;
}

export interface WriteAuthorityInput {
  /**
   * One entry per path the tool would write. An EMPTY array means the tool call's targets could not
   * be extracted — ADR-0257 D3 refuses those rather than inferring that they are harmless.
   */
  readonly targets: readonly TargetResolution[];
  /**
   * Live claims keyed by session id. `null` means the LEDGER COULD NOT BE READ (offline, no creds,
   * unreachable, timed out) — ADR-0255 D7: ledger loss cannot silently turn coordinated writing into
   * uncoordinated writing, so every write refuses. ADR-0257 D5's expiring claim-receipt exception
   * would narrow this arm; the receipt is unbuilt, so the unqualified rule is what holds.
   */
  readonly claimsBySession: Readonly<Record<string, readonly LiveClaim[]>> | null;
}

export interface WriteDecision {
  readonly decision: "allow" | "refuse";
  /** Why — an authority refusal has to explain itself and name the next ceremony (ADR-0257 D2). */
  readonly reason: string;
}

/** The ceremony every lobby/unclaimed refusal points at. */
const MINT = 'pnpm storytree worktree create --node <story-id> --intent "<what>" --pg';

/**
 * PURE: the write-authority decision (ADR-0255 D2 / ADR-0257 D1, D3). ALLOW only when EVERY target
 * lands in a git-known worktree that is on a branch matching a live claim held by that worktree's
 * session. Every other shape refuses, and the first refusing target is the one reported.
 */
export function evaluateWriteAuthority(input: WriteAuthorityInput): WriteDecision {
  if (input.targets.length === 0) {
    return {
      decision: "refuse",
      reason:
        "REFUSED — no write target could be extracted from this tool call, so its authority cannot be " +
        "checked (ADR-0257 D3: a write-capable route whose targets cannot be extracted is denied, " +
        "never guessed read-only).",
    };
  }

  for (const target of input.targets) {
    if (!target.ok) {
      return {
        decision: "refuse",
        reason:
          `REFUSED — the write target "${target.raw}" could not be canonicalised: ${target.why}. ` +
          "An unresolvable path cannot be proven to sit inside a claimed workspace (ADR-0257 D3).",
      };
    }

    if (target.zone.kind === "outside") {
      return {
        decision: "refuse",
        reason:
          `REFUSED — "${target.raw}" resolves to ${target.canonical}, which is outside this ` +
          "repository. Storytree write authority is repository-scoped (ADR-0255 D2); a target that " +
          "escapes the repository — through `..`, a symlink or a junction — is never authorised.",
      };
    }

    if (target.zone.kind === "lobby") {
      return {
        decision: "refuse",
        reason: [
          `REFUSED — "${target.raw}" resolves to ${target.canonical}, inside the PRIMARY CHECKOUT.`,
          "The primary checkout is a read-only agent lobby (ADR-0255 D1, narrowed to shared checkouts",
          "by ADR-0257 D6): read it, query the tree and the ledger, and request a workspace there — but",
          "no agent file or shell tool may create, modify, rename, delete or restore a file in it,",
          "tracked, untracked or ignored, whatever branch it currently names.",
          "",
          `Get a claimed workspace first:  ${MINT}`,
        ].join("\n"),
      };
    }

    const wt = target.zone.worktree;

    if (wt.branch === null) {
      return {
        decision: "refuse",
        reason:
          `REFUSED — the worktree "${wt.sessionId}" (${wt.root}) is on a DETACHED HEAD, so no claim ` +
          "can match its branch. A workspace with no branch identity cannot carry write authority " +
          "(ADR-0255 D2). Check out the session's branch, or mint a fresh workspace.",
      };
    }

    if (input.claimsBySession === null) {
      return {
        decision: "refuse",
        reason:
          "REFUSED — the claim ledger could not be read, so write authority cannot be proven " +
          "(ADR-0255 D7: ledger loss must not silently turn coordinated writing into uncoordinated " +
          "writing). The tree, Library and checkout stay readable. Bring the ledger up: pnpm db:up.",
      };
    }

    const held = input.claimsBySession[wt.sessionId] ?? [];
    if (held.length === 0) {
      return {
        decision: "refuse",
        reason: [
          `REFUSED — the worktree "${wt.sessionId}" holds NO live claim, so it is not a workspace,`,
          "it is a directory (ADR-0255 D2 / ADR-0200 D3: no claim, no write authority). An unclaimed",
          "worktree is invisible on the notice board, so a sibling cannot see it and will collide.",
          "",
          'Claim it:  pnpm storytree noticeboard declare --working-on "<what>" --node <story-id> --pg',
          `Or mint a claimed workspace:  ${MINT}`,
        ].join("\n"),
      };
    }

    const onBranch = held.filter((c) => c.branch === wt.branch);
    if (onBranch.length === 0) {
      const claimed = [...new Set(held.map((c) => c.branch))].join(", ");
      return {
        decision: "refuse",
        reason: [
          `REFUSED — branch mismatch in worktree "${wt.sessionId}".`,
          `  worktree is on: ${wt.branch}`,
          `  its live claim(s) name: ${claimed}`,
          "",
          "The claim records the branch the work was authorised on (ADR-0255 D2). A worktree that has",
          "moved off it is either mid-surgery or has had its ref rewound by another session — either",
          "way the write is not the one that was claimed. Restore the claimed branch, or re-declare",
          "on the branch you are actually on.",
        ].join("\n"),
      };
    }
  }

  const first = input.targets[0];
  const where =
    first !== undefined && first.ok && first.zone.kind === "worktree"
      ? ` in claimed workspace "${first.zone.worktree.sessionId}" (${first.zone.worktree.branch})`
      : "";
  return {
    decision: "allow",
    reason: `ALLOWED — ${input.targets.length} target(s)${where}: every target is inside a git-known worktree whose branch matches a live claim.`,
  };
}

// ---------------------------------------------------------------------------
// Convenience: raw targets → resolutions
// ---------------------------------------------------------------------------

/**
 * Canonicalise and classify a batch of RAW tool targets — the one call an adapter makes before
 * {@link evaluateWriteAuthority}. `cwd` resolves relative targets only; it never grants authority.
 */
export function resolveTargets(
  rawTargets: readonly string[],
  cwd: string,
  topology: RepoTopology,
  realpath: RealpathFn = builtinRealpath,
): TargetResolution[] {
  return rawTargets.map((raw) => {
    const canonical = canonicalisePath(raw, cwd, realpath);
    if (!canonical.ok) return { ok: false, raw, why: canonical.why };
    return { ok: true, raw, canonical: canonical.path, zone: classifyTarget(canonical.path, topology) };
  });
}
