/**
 * `storytree branch` command family (ADR-0142: a branch dies on merge).
 *
 * `branch next` is the merge ceremony's post-merge leg in one verb. After CI merges a PR, its head
 * branch is DEAD: the merged-branch guard (`scripts/merged-branch-guard.sh`) refuses any new PR from
 * it, and the CI merge job machine-cleared its board state (the story claims, ADR-0138 cap D).
 * The manual leg — fetch main, cut a fresh `claude/<name>` branch, re-take the story claims — is
 * friction; this verb does it: detect the dead branch, cut + switch a fresh branch from
 * `origin/main`, and re-take the session's claims (directly when the live ledger is wired, else as
 * a printed next-step). Presence is retired (ADR-0200 D7): the prior nodes come from the session's
 * own live claims on the ledger, and the re-take rides the recursive `noticeboard declare`
 * (claim-at-declare, ADR-0142) — one code path.
 *
 * Detection is pure git plumbing behind an injected `runGit` (the `deriveIdentity` seam pattern,
 * `packages/drive/src/noticeboard.ts`), so the whole flow is offline-testable:
 *   - a merge commit on `origin/main` names the branch (`git log --merges --grep`) — the plumbing
 *     mirror of the guard's `gh pr list --state merged`, valid because landings are merge commits
 *     (ADR-0022 / ADR-0031), and the signal that catches a reused branch reset to origin/main;
 *   - the tip is a STRICT ancestor of `origin/main` — every commit already landed;
 *   - `refs/remotes/origin/<branch>` gone after `fetch --prune` — corroboration (CI merges with
 *     `--delete-branch`), reported but never the deciding signal (a never-pushed branch also lacks it).
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";

import type { SessionIdentity } from "@storytree/drive";
import type { ClaimDocT } from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Deps + defaults
// ---------------------------------------------------------------------------

export interface BranchDeps {
  /** Injected git runner (throws on non-zero exit). Defaults to spawning real git. */
  readonly runGit?: (args: readonly string[]) => string;
  /** Fresh-branch candidate names, e.g. "claude/steady-noether-3f9a2c". Injectable for tests. */
  readonly generateName?: () => string;
  /**
   * The session's own live-claim read on the ledger (--pg, ADR-0200 D7): the units this session
   * holds are the nodes to re-take on the fresh branch. Null offline.
   */
  readonly claims: { claimsBySession(sessionId: string): Promise<ClaimDocT[]> } | null;
  /** Worktree-derived session identity (ADR-0033); null in a plain checkout. */
  readonly identity: SessionIdentity | null;
  /**
   * Re-take the claims through the SAME noticeboard declare dispatch the CLI area uses — so
   * whatever that path wires (claim-at-declare re-taking the story claim, ADR-0142) happens on the
   * fresh branch too, one code path. Null when no live store is wired.
   */
  readonly redeclare:
    | ((args: { workingOn: string; nodes: readonly string[] }) => Promise<Envelope>)
    | null;
}

function builtinRunGit(args: readonly string[]): string {
  return (execFileSync("git", [...args], { encoding: "utf8" }) as string).trim();
}

/** Word pools for the default fresh-branch names (harness-style adjective-scientist-hex). */
const ADJECTIVES = [
  "amiable", "bright", "candid", "daring", "earnest", "fervent", "gentle", "hardy",
  "keen", "lively", "mellow", "nimble", "patient", "quiet", "steady", "valiant",
] as const;
const SURNAMES = [
  "agnesi", "bhaskara", "curie", "darwin", "euler", "franklin", "germain", "hopper",
  "kepler", "lovelace", "mendel", "noether", "pasteur", "ramanujan", "somerville", "turing",
] as const;

function builtinGenerateName(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)] ?? ADJECTIVES[0];
  const surname = SURNAMES[randomInt(SURNAMES.length)] ?? SURNAMES[0];
  return `claude/${adjective}-${surname}-${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Git probes (each isolates ONE plumbing question over the injected runner)
// ---------------------------------------------------------------------------

/** True when `ref` resolves (rev-parse --verify --quiet exits 0). */
function refExists(runGit: (args: readonly string[]) => string, ref: string): boolean {
  try {
    runGit(["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

/** True when HEAD is an ancestor of origin/main (merge-base --is-ancestor exits 0). */
function headIsAncestorOfMain(runGit: (args: readonly string[]) => string): boolean {
  try {
    runGit(["merge-base", "--is-ancestor", "HEAD", "refs/remotes/origin/main"]);
    return true;
  } catch {
    return false;
  }
}

/** The subject of the origin/main merge commit naming this branch, or "" when none does. */
function mergeEvidence(runGit: (args: readonly string[]) => string, branch: string): string {
  try {
    return runGit([
      "log",
      "refs/remotes/origin/main",
      "--merges",
      "--fixed-strings",
      `--grep=${branch}`,
      "--format=%s",
      "-1",
    ]);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export function branchHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree branch — branch lifecycle ergonomics (ADR-0142: a branch dies on merge).",
      "",
      "  storytree branch next [--pg]   succeed a DEAD branch: detect it (merged into origin/main and/or",
      "                                 remote gone), cut + switch a fresh claude/<name> from origin/main,",
      "                                 and re-take the story claims — with --pg the re-take runs directly",
      "                                 (the story wisp re-lights on the fresh branch, ADR-0200); offline",
      "                                 it is printed as the next step.",
      "",
      "after a PR merges, its head branch can never land again (the CI merged-branch guard refuses it)",
      "and the merge machine-cleared its board state — `branch next` is the merge ceremony's post-merge",
      "leg in one verb.",
    ].join("\n"),
    next: ["storytree branch next --pg", "storytree noticeboard --pg"],
  };
}

/** The re-declare command with the session's real values when known, else placeholders. */
function declareNextLine(prior: { workingOn: string; nodes: readonly string[] } | null): string {
  const args =
    prior === null
      ? '--working-on "<what>" --node <story-id>'
      : [`--working-on "${prior.workingOn}"`, ...prior.nodes.map((n) => `--node ${n}`)].join(" ");
  return `storytree noticeboard declare ${args} --pg   (re-light the story wisp on the fresh branch, ADR-0142)`;
}

/**
 * `storytree branch next` — detect that the current branch is dead, cut + switch to a fresh
 * `claude/<name>` from `origin/main`, and re-take presence. Every refusal is guidance (ok:false +
 * next), never a throw; the cut itself succeeding with a re-declare hiccup stays ok:true with the
 * failure surfaced loudly (fail-soft, mirroring claim-at-declare's presence-never-lost stance).
 */
export async function branchNext(deps: BranchDeps): Promise<Envelope> {
  const runGit = deps.runGit ?? builtinRunGit;
  const generateName = deps.generateName ?? builtinGenerateName;

  let branch: string;
  try {
    branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch (err) {
    return {
      ok: false,
      body: `not a git checkout (or git is unavailable): ${err instanceof Error ? err.message : String(err)}`,
      next: ["git status"],
    };
  }
  if (branch === "HEAD") {
    return {
      ok: false,
      body: "detached HEAD — branch next succeeds a named working branch. Switch to one first.",
      next: ["git switch <branch>", "git switch -c claude/<name> origin/main"],
    };
  }
  if (branch === "main" || branch === "master") {
    return {
      ok: false,
      body: `on "${branch}" — the trunk never dies (ADR-0142 retires WORKING branches). Cut a working branch instead.`,
      next: ["git switch -c claude/<name> --no-track origin/main"],
    };
  }
  const porcelain = (() => {
    try {
      return runGit(["status", "--porcelain"]);
    } catch {
      return "";
    }
  })();
  if (porcelain !== "") {
    return {
      ok: false,
      body: `the working tree is dirty — commit or stash before switching branches (a fresh cut from origin/main must start clean).\n${porcelain}`,
      next: ["git status", "git stash   (park the changes, re-apply on the fresh branch)"],
    };
  }
  try {
    runGit(["fetch", "origin", "--prune"]);
  } catch (err) {
    return {
      ok: false,
      body: `could not fetch origin — dead-branch detection needs fresh refs: ${err instanceof Error ? err.message : String(err)}`,
      next: ["git fetch origin --prune", "storytree branch next"],
    };
  }
  let mainSha: string;
  try {
    mainSha = runGit(["rev-parse", "refs/remotes/origin/main"]);
  } catch {
    return {
      ok: false,
      body: "no refs/remotes/origin/main after the fetch — is origin wired to the storytree repo?",
      next: ["git remote -v"],
    };
  }
  const headSha = runGit(["rev-parse", "HEAD"]);

  // The three plumbing signals (module doc): merge evidence decides, strict-ancestor decides,
  // remote-gone corroborates.
  const evidence = mergeEvidence(runGit, branch);
  const remoteGone = !refExists(runGit, `refs/remotes/origin/${branch}`);
  const strictAncestor = headSha !== mainSha && headIsAncestorOfMain(runGit);
  const dead = evidence !== "" || strictAncestor;

  if (!dead) {
    if (headSha === mainSha) {
      return {
        ok: true,
        body: `"${branch}" is already a fresh cut of origin/main (${mainSha.slice(0, 7)}) with no landed PR — nothing to do.`,
        next: [declareNextLine(null), "git push -u origin HEAD   (publish the branch when you open the PR)"],
      };
    }
    const ahead = (() => {
      try {
        return runGit(["rev-list", "--count", "refs/remotes/origin/main..HEAD"]);
      } catch {
        return "?";
      }
    })();
    return {
      ok: false,
      body: [
        `"${branch}" is ALIVE — ${ahead} commit(s) not yet in origin/main${remoteGone ? " (and never pushed / remote pruned)" : ""}.`,
        "branch next succeeds a DEAD branch (merged into origin/main, ADR-0142); land this unit first.",
      ].join("\n"),
      next: ["pnpm gate", "git push -u origin HEAD   (open the non-draft PR; CI merges it)"],
    };
  }

  // Pick a free fresh name (collision with an existing local/remote ref retries).
  let fresh: string | null = null;
  for (let attempt = 0; attempt < 5 && fresh === null; attempt += 1) {
    const candidate = generateName();
    if (
      !refExists(runGit, `refs/heads/${candidate}`) &&
      !refExists(runGit, `refs/remotes/origin/${candidate}`)
    ) {
      fresh = candidate;
    }
  }
  if (fresh === null) {
    return {
      ok: false,
      body: "could not find a free claude/<name> in 5 draws — cut one by hand.",
      next: ["git switch -c claude/<name> --no-track origin/main"],
    };
  }
  try {
    runGit(["switch", "--no-track", "-c", fresh, "refs/remotes/origin/main"]);
  } catch (err) {
    return {
      ok: false,
      body: `could not create/switch to "${fresh}": ${err instanceof Error ? err.message : String(err)}`,
      next: ["git status", `git switch -c ${fresh} --no-track origin/main`],
    };
  }

  // Re-take the story claims: read this session's own live claims on the ledger (ADR-0200 D7) and
  // re-take them through the noticeboard declare path — claim-at-declare stamps the FRESH branch on
  // each claim (fail-soft: a ledger hiccup never un-cuts the branch, it is surfaced instead).
  let prior: { workingOn: string; nodes: readonly string[] } | null = null;
  if (deps.claims !== null && deps.identity !== null) {
    try {
      const mine = await deps.claims.claimsBySession(deps.identity.sessionId);
      if (mine.length > 0) {
        const firstIntent = mine.find((c) => c.intent.trim().length > 0)?.intent;
        prior = {
          workingOn: firstIntent ?? "re-taking story claims on the fresh branch (branch next, ADR-0142)",
          nodes: [...new Set(mine.map((c) => c.unitId))],
        };
      }
    } catch {
      // Unreadable ledger — fall through to the printed next-step.
    }
  }
  let redeclareLines: string[] = [];
  let redeclared = false;
  if (prior !== null && deps.redeclare !== null) {
    try {
      const env = await deps.redeclare(prior);
      redeclared = env.ok;
      redeclareLines = [
        env.ok
          ? "re-took the story claims on the fresh branch (claim-at-declare, ADR-0142):"
          : "re-take FAILED — run the declare below so the story wisp re-lights:",
        ...env.body.split("\n").map((l) => `  ${l}`),
      ];
    } catch (err) {
      redeclareLines = [
        `re-take FAILED (${err instanceof Error ? err.message : String(err)}) — run the declare below so the story wisp re-lights.`,
      ];
    }
  }

  const body = [
    `BRANCH DEAD — "${branch}" already landed on origin/main (a branch dies on merge, ADR-0142):`,
    ...(evidence !== "" ? [`  landed:  ${evidence}`] : []),
    ...(evidence === "" && strictAncestor
      ? [`  landed:  every commit on "${branch}" is already in origin/main`]
      : []),
    `  remote:  origin/${branch} ${remoteGone ? "gone (deleted on merge)" : "still present"}`,
    "",
    `cut + switched to "${fresh}" from origin/main (${mainSha.slice(0, 7)}).`,
    ...(redeclareLines.length > 0 ? ["", ...redeclareLines] : []),
  ].join("\n");

  return {
    ok: true,
    body,
    next: [
      ...(redeclared ? [] : [declareNextLine(prior)]),
      "git push -u origin HEAD   (publish the fresh branch when you open the PR)",
      ...(redeclared ? ["storytree noticeboard --pg"] : []),
    ],
  };
}
