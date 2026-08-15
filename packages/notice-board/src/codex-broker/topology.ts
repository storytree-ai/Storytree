/**
 * Codex session topology — pure Git-topology resolution, moved out of
 * `packages/cli/src/codex-session-containment.ts` (ADR-0375) so the claim broker's `promote` verb
 * (`resident.ts`) can re-derive a caller's identity from Git without `@storytree/cli`, which
 * `apps/desktop` may not import (ADR-0112). This module is pure — only `node:path` — exactly as it
 * was in its previous home; `codex-session-containment.ts` now imports and re-exports everything
 * below so its own consumers are unaffected by the move.
 */
import path from "node:path";

/**
 * Where repository-minted worktrees live, relative to the primary checkout. ADR-0364 D1 grants this
 * whole area once instead of naming one worktree per launch, so the path has to be derivable without
 * a session — it is, because the primary checkout is the one thing a standing profile may pin.
 */
export const CODEX_WORKTREES_SEGMENTS: readonly string[] = [".claude", "worktrees"];

export function codexWorktreesRoot(primaryCheckout: string): string {
  return path.join(primaryCheckout, ...CODEX_WORKTREES_SEGMENTS);
}

export interface CodexGitProbe {
  readonly topLevel: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly branch: string;
  readonly worktreeList: string;
}

interface TopologyBase {
  readonly ok: true;
  readonly primaryCheckout: string;
  readonly registeredWorktrees: readonly string[];
}

export interface CodexLobbyTopology extends TopologyBase {
  readonly location: "lobby";
}

export interface CodexWorktreeTopology extends TopologyBase {
  readonly location: "worktree";
  readonly currentWorktree: string;
  readonly siblingWorktrees: readonly string[];
  readonly sessionId: string;
  readonly branch: string;
  readonly gitDir: string;
  readonly commonDir: string;
}

export type CodexSessionTopology = CodexLobbyTopology | CodexWorktreeTopology;
export type TopologyResult = CodexSessionTopology | { readonly ok: false; readonly reason: string };

/**
 * Local to this module — deliberately NOT shared with `codex-session-containment.ts`'s own
 * identically-shaped `comparable`, which stays there for its other callers (credential-deny path
 * comparison, the interactive-tool-use path check). Two small pure copies are cheaper than a coupling
 * that would make an unrelated caller's behaviour depend on this module.
 */
function comparable(value: string): string {
  const slashed = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

export function samePath(left: string, right: string): boolean {
  return comparable(left) === comparable(right);
}

export function insidePath(root: string, candidate: string): boolean {
  const base = comparable(root);
  const target = comparable(candidate);
  return target === base || target.startsWith(`${base}/`);
}

function parseRegisteredWorktrees(porcelain: string): string[] {
  return porcelain
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter((line) => line.length > 0);
}

function sessionIdFor(topLevel: string, gitDir: string): string {
  const claude = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(topLevel);
  if (claude?.[1]) return claude[1];
  return path.basename(gitDir.replace(/[/\\]+$/, ""));
}

/**
 * Resolve the current checkout only from Git's own topology and registry. No caller-supplied root,
 * session id, or sibling allowlist participates in the answer.
 */
export function resolveCodexSessionTopology(
  probe: CodexGitProbe,
  io: { canonicalize: (target: string) => string },
): TopologyResult {
  try {
    const topLevel = io.canonicalize(probe.topLevel);
    const gitDir = io.canonicalize(probe.gitDir);
    const commonDir = io.canonicalize(probe.commonDir);
    const primaryCheckout = io.canonicalize(path.dirname(probe.commonDir));
    const registeredWorktrees = parseRegisteredWorktrees(probe.worktreeList).map(io.canonicalize);
    const registrations = registeredWorktrees.filter((root) => samePath(root, topLevel));
    if (registrations.length !== 1) {
      return {
        ok: false,
        reason:
          `current checkout resolves to ${topLevel}, but Git reports ${registrations.length} ` +
          "matching registrations — it is not exactly one registered worktree",
      };
    }

    if (samePath(gitDir, commonDir)) {
      if (!samePath(topLevel, primaryCheckout)) {
        return {
          ok: false,
          reason: "Git reports a primary checkout whose top-level disagrees with its common directory",
        };
      }
      return {
        ok: true,
        location: "lobby",
        primaryCheckout,
        registeredWorktrees,
      };
    }

    if (probe.branch.trim().length === 0 || probe.branch.trim() === "HEAD") {
      return { ok: false, reason: "the registered worktree is detached or has no current branch" };
    }
    const sessionId = sessionIdFor(topLevel, gitDir);
    if (sessionId.length === 0) {
      return { ok: false, reason: "Git topology produced no repository-minted session identity" };
    }
    return {
      ok: true,
      location: "worktree",
      primaryCheckout,
      registeredWorktrees,
      currentWorktree: topLevel,
      siblingWorktrees: registeredWorktrees.filter(
        (root) => !samePath(root, topLevel) && !samePath(root, primaryCheckout),
      ),
      sessionId,
      branch: probe.branch.trim(),
      gitDir,
      commonDir,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `could not canonicalise the current Git topology: ${String(error)}`,
    };
  }
}
