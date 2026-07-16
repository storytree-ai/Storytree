/**
 * `mintWorktreeName` — the ADR-0200 D3 worktree/session name minting policy.
 *
 * `storytree worktree create` mints the worktree basename BEFORE any filesystem mutation, and the
 * basename IS the session id (ADR-0033: board/dock/map entries become self-describing) — minted
 * ONCE: a session that walks on to a sibling story keeps its birth name; the ledger, not the name,
 * is the truth. The policy (ADR-0200 D3, owner-refined 2026-07-16):
 *
 *   - The FIRST node is the anchor (first `--node` wins when several are claimed).
 *   - Arc-stamped anchor → `<arc-slug>-<story>-<suffix>` (the arc names the journey — a long-lived
 *     worktree walks sibling stories one landing at a time, ADR-0142 — the story names the anchor
 *     at creation); the arc slug drops a trailing `-arc`. Planless anchor → `<story>-<suffix>`.
 *   - Windows path budget: the name rides every pnpm/node_modules path, so the arc and story parts
 *     each truncate to 16 chars and the whole basename caps at 40 (trailing/double hyphens trimmed
 *     around every cut and join).
 *   - branch = `claude/` + basename — the harness prefix is load-bearing (CI and
 *     scripts/merged-branch-guard.sh recognise claude/*; never a bare basename branch).
 *
 * PURE: stamps arrive as data (arc.ts's `storyArcStamps` does the fs read); refusals THROW a clear
 * Error — the command turns that into a refusal envelope. An unsafe anchor is REFUSED, never
 * silently normalised (a normalised name would desync from the story id it claims).
 */

import { existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";

import type { ClaimDocT, ClaimRequest, ClaimResult } from "@storytree/notice-board";
import { claimGrade, exploringClaimRequest } from "@storytree/notice-board";

import { storyArcStamps } from "./arc.js";
import type { Envelope } from "./envelope.js";

/** What one anchor node is allowed to look like in a directory/branch name. */
const SAFE_NODE = /^[a-z0-9-]+$/;

/** Per-part budget: the arc part and the story part each truncate to this many chars. */
const PART_MAX = 16;

/** Whole-basename budget, INCLUDING the suffix (the Windows path-length backstop). */
const BASENAME_MAX = 40;

/** The load-bearing harness branch prefix (CI + merged-branch-guard recognise claude/*). */
const BRANCH_PREFIX = "claude/";

export interface MintedWorktreeName {
  basename: string;
  branch: string;
}

/** Trim trailing hyphens — every truncation cut and the final cap call this so no join dangles. */
function trimTrailingHyphens(s: string): string {
  return s.replace(/-+$/, "");
}

/** Truncate one name part to the per-part budget, never leaving a trailing hyphen. */
function truncatePart(s: string): string {
  return trimTrailingHyphens(s.slice(0, PART_MAX));
}

/**
 * Mint the worktree basename + branch for a new session (ADR-0200 D3). `nodes` are the claimed
 * story ids in `--node` order (the first is the anchor); `stamps` are the story→arc provenance
 * stamps (from `storyArcStamps`); `suffix` is the caller-minted short uniquifier.
 *
 * Throws on refusal: empty nodes, a blank or unsafe anchor, a blank suffix.
 */
export function mintWorktreeName(
  nodes: readonly string[],
  stamps: ReadonlyArray<{ story: string; arc: string }>,
  suffix: string,
): MintedWorktreeName {
  const anchor = nodes[0];
  if (anchor === undefined) {
    throw new Error("cannot mint a worktree name with no nodes — pass at least one --node (the first is the anchor)");
  }
  if (anchor.trim().length === 0) {
    throw new Error("cannot mint a worktree name from a blank anchor node");
  }
  if (!SAFE_NODE.test(anchor)) {
    throw new Error(
      `anchor node "${anchor}" has characters unsafe for a directory/branch name ` +
        "(allowed: lowercase alphanumerics and hyphens) — rename the node, it is never silently normalised",
    );
  }
  if (suffix.trim().length === 0) {
    throw new Error("cannot mint a worktree name with a blank suffix");
  }

  // Arc-stamped anchor gets the journey prefix; the trailing `-arc` is dropped (suffix only —
  // an arc id not ending in `-arc` is used whole).
  const stamp = stamps.find((s) => s.story === anchor);
  const parts: string[] = [];
  if (stamp !== undefined) parts.push(truncatePart(stamp.arc.replace(/-arc$/, "")));
  parts.push(truncatePart(anchor));
  parts.push(suffix);

  // Join, then the defensive whole-name cap: re-trim so the cut never leaves a trailing hyphen,
  // and collapse any double hyphen a cut/join produced.
  let basename = parts.filter((p) => p.length > 0).join("-");
  if (basename.length > BASENAME_MAX) basename = basename.slice(0, BASENAME_MAX);
  basename = trimTrailingHyphens(basename).replace(/-{2,}/g, "-");

  return { basename, branch: BRANCH_PREFIX + basename };
}

// ---------------------------------------------------------------------------
// `storytree worktree create` — the claim-gated workspace ceremony (ADR-0200 D3)
// ---------------------------------------------------------------------------
//
// Sessions open on the PRIMARY checkout (the "lobby") and obtain their workspace HERE, in strict
// order — each step's failure aborts everything after it:
//
//   parse → mint (collision re-draws INCLUDED — the identity is FINAL before it is claimed) →
//   take the exploring claim(s) → fetch + `git worktree add` off origin/main → synchronous
//   `pnpm install` → the start-payload envelope.
//
// The load-bearing invariant is ADR-0121's claim-before-worktree ordering, generalised to sessions:
// NO CLAIM, NO WORKSPACE — a take() that fails leaves ZERO worktree IO behind it (earlier takes are
// released best-effort, the original error never masked). The inverse is deliberately soft: once the
// claims and the worktree exist, an install failure is REPORTED with the fix, never a teardown (the
// claims are releasable; a half-provisioned worktree self-heals with one `pnpm install`).
//
// Identity is CONSTRUCTED from the mint (sessionId = the basename, branch = claude/<basename>),
// never `deriveIdentity()` — the lobby has no worktree identity yet. IO rides the injected
// {@link WorktreeCreateIo} (the `pruneWorktrees` seam pattern above in worktree.ts), so the whole
// ceremony is proven offline with fakes; {@link defaultWorktreeCreateIo} is real git/fs/pnpm.

/**
 * The ledger slice the ceremony drives — take / release / claimsFor, structurally satisfied by
 * `@storytree/drive`'s `ClaimLedgerStoreLike` (the wider verb surface stays with the noticeboard
 * verbs; create needs only these three). Null offline — the ceremony then refuses (--pg required).
 */
export interface WorktreeCreateLedgerLike {
  take(req: ClaimRequest): Promise<ClaimResult>;
  release(unitId: string, sessionId: string): Promise<boolean>;
  claimsFor(unitId: string): Promise<ClaimDocT[]>;
  /**
   * OPTIONAL: baseline the minted session's overlap-delta cursor (ADR-0200 D4) so the board-digest
   * snapshot below never re-fires as deltas on the session's first command. A courtesy — the
   * store's first-read self-baseline is the correctness guard — so absent/failing is fine.
   */
  baselineCursor?(sessionId: string): Promise<void>;
}

/** The injected IO surface — git + fs + pnpm. Real impl is {@link defaultWorktreeCreateIo}. */
export interface WorktreeCreateIo {
  /** Absolute primary-checkout root (where `.claude/worktrees/` lives). Throws outside a repo. */
  primaryRoot(): string;
  /** Does the candidate worktree path already exist on disk? A hit forces a suffix re-draw. */
  exists(absPath: string): boolean;
  /** `git fetch origin main` — best-effort (a failure is reported, never fatal to the cut). */
  fetchMain(primaryRoot: string): void;
  /** `git worktree add -b <branch> <absPath> refs/remotes/origin/main` — throws on failure. */
  addWorktree(primaryRoot: string, branch: string, absPath: string): void;
  /** Synchronous `pnpm install` in the new worktree; returns ok/code, never throws. */
  install(absPath: string): { ok: boolean; code: number };
}

/**
 * Synchronous `pnpm install` — the provision-worktree.mjs shape, implemented inside the IO seam:
 * Windows resolves the `pnpm.cmd` shim only through a shell (a single STATIC command string, so
 * shell:true carries no injection surface and no DEP0190 warning); POSIX spawns the binary directly.
 * Child stdout/stderr land on OUR stderr so the envelope stays the only stdout payload.
 */
function defaultInstall(root: string): { ok: boolean; code: number } {
  const win = process.platform === "win32";
  const opts = {
    cwd: root,
    stdio: ["ignore", 2, 2] as ["ignore", number, number],
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  };
  const runCmd = win
    ? (cmd: string) => spawnSync(cmd, { ...opts, shell: true })
    : (cmd: string) => {
        const [bin, ...a] = cmd.split(" ");
        return spawnSync(bin as string, a, opts);
      };
  let res = runCmd("pnpm install");
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    res = runCmd("corepack pnpm install");
  }
  if (res.error) return { ok: false, code: typeof res.status === "number" ? res.status : 1 };
  return { ok: res.status === 0, code: res.status ?? 1 };
}

/** The production IO — real git, real fs, real pnpm. */
export const defaultWorktreeCreateIo: WorktreeCreateIo = {
  primaryRoot() {
    const common = (
      execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        encoding: "utf8",
      }) as string
    ).trim();
    return path.dirname(common);
  },
  exists(absPath) {
    return existsSync(absPath);
  },
  fetchMain(primaryRoot) {
    execFileSync("git", ["-C", primaryRoot, "fetch", "origin", "main"], { encoding: "utf8" });
  },
  addWorktree(primaryRoot, branch, absPath) {
    execFileSync(
      "git",
      ["-C", primaryRoot, "worktree", "add", "-b", branch, absPath, "refs/remotes/origin/main"],
      { encoding: "utf8" },
    );
  },
  install: defaultInstall,
};

export interface WorktreeCreateOpts {
  /** The `--node` story ids, in flag order — the FIRST is the anchor the name is minted from. */
  readonly nodes: readonly string[];
  /** The `--intent` prose — REQUIRED, non-blank: the exploring claim IS its intent (ADR-0200 D2). */
  readonly intent: string;
}

export interface WorktreeCreateDeps {
  /** The live claim ledger (--pg); null offline — the ceremony refuses (no claim, no workspace). */
  readonly ledger: WorktreeCreateLedgerLike | null;
  readonly io?: WorktreeCreateIo;
  /** Story→arc provenance stamps for the mint; defaults to reading `<primary>/stories/`. */
  readonly stamps?: () => ReadonlyArray<{ story: string; arc: string }>;
  /** Suffix draws for the mint; defaults to 6 random hex chars (the branch.ts pattern). */
  readonly generateSuffix?: () => string;
  /** Re-draw cap on a basename collision (the branch.ts pattern); defaults to 5. */
  readonly maxAttempts?: number;
}

const USAGE = 'storytree worktree create --node <story> [--node <story>…] --intent "<what>" --pg';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Release the already-taken claims best-effort — the original error is NEVER masked by a release failure. */
async function releaseTaken(
  ledger: WorktreeCreateLedgerLike,
  taken: readonly ClaimDocT[],
  sessionId: string,
): Promise<string[]> {
  const released: string[] = [];
  for (const c of taken) {
    try {
      await ledger.release(c.unitId, sessionId);
      released.push(c.unitId);
    } catch {
      // Best-effort only: the refusal must carry the take's error, not a release's.
    }
  }
  return released;
}

/** The digest verb per grade — "someone else is exploring/waiting on/WORKING …". */
function gradeVerb(grade: "exploring" | "waiting" | "work"): string {
  return grade === "work" ? "WORKING on" : grade === "waiting" ? "waiting on" : "exploring";
}

/** The claim-gated workspace ceremony (ADR-0200 D3). See the section comment above for the order. */
export async function createWorktree(
  opts: WorktreeCreateOpts,
  deps: WorktreeCreateDeps,
): Promise<Envelope> {
  // (a) Parse — both refusals happen before ANY claim and ANY IO (no claim, no cut).
  const nodes = opts.nodes.map((n) => n.trim()).filter((n) => n.length > 0);
  if (nodes.length === 0) {
    return {
      ok: false,
      body: `worktree create needs at least one --node <story-id> — the first is the anchor the name is minted from (ADR-0200 D3).\nUsage: ${USAGE}`,
      next: ["storytree tree --pg", USAGE],
    };
  }
  if (opts.intent.trim().length === 0) {
    return {
      ok: false,
      body:
        'worktree create requires --intent "<prose>" — the exploring claim IS its intent (ADR-0200 D2/D3): ' +
        `no intent, no claim, no workspace.\nUsage: ${USAGE}`,
      next: [USAGE],
    };
  }
  if (deps.ledger === null) {
    // The claim-verb refusal stance (noticeboard-claims.ts needsPg): no live ledger, no ceremony.
    return {
      ok: false,
      body:
        "worktree create requires the live claim ledger (--pg) — no claim, no workspace (ADR-0200 D3). " +
        "Bring the DB up and pass --pg.",
      next: ["pnpm db:up", USAGE],
    };
  }
  const ledger = deps.ledger;
  const io = deps.io ?? defaultWorktreeCreateIo;

  let primary: string;
  try {
    primary = io.primaryRoot();
  } catch (err) {
    return {
      ok: false,
      body: `could not resolve the primary checkout root: ${errMsg(err)}`,
      next: ["git status"],
    };
  }

  // (b) Mint — BEFORE the claims: the identity (basename = session id, branch = claude/<basename>)
  // must be FINAL before it is claimed, so collision re-draws are part of minting, never a re-claim.
  const stamps = deps.stamps !== undefined ? deps.stamps() : storyArcStamps(path.join(primary, "stories"));
  const generateSuffix = deps.generateSuffix ?? (() => randomBytes(3).toString("hex"));
  const maxAttempts = deps.maxAttempts ?? 5;
  let minted: MintedWorktreeName | null = null;
  let worktreePath = "";
  try {
    for (let attempt = 0; attempt < maxAttempts && minted === null; attempt += 1) {
      const candidate = mintWorktreeName(nodes, stamps, generateSuffix());
      const candidatePath = path.join(primary, ".claude", "worktrees", candidate.basename);
      if (!io.exists(candidatePath)) {
        minted = candidate;
        worktreePath = candidatePath;
      }
    }
  } catch (err) {
    // mintWorktreeName refuses by throwing (unsafe anchor, blank suffix) — surface it verbatim.
    return { ok: false, body: `worktree create refused: ${errMsg(err)}`, next: [USAGE] };
  }
  if (minted === null) {
    return {
      ok: false,
      body:
        `could not mint a free worktree name after ${maxAttempts} suffix draws — every candidate ` +
        `collided with an existing .claude/worktrees/ dir. No claims were taken. ` +
        "Prune dead worktrees and retry.",
      next: ["storytree worktree prune", USAGE],
    };
  }
  const sessionId = minted.basename;
  const branch = minted.branch;

  // (c) Claims FIRST — before ANY filesystem mutation (the load-bearing ordering, ADR-0121→0200).
  const taken: ClaimDocT[] = [];
  for (const unitId of nodes) {
    let result: ClaimResult;
    try {
      result = await ledger.take(exploringClaimRequest({ unitId, sessionId, branch, intent: opts.intent }));
    } catch (err) {
      const released = await releaseTaken(ledger, taken, sessionId);
      return {
        ok: false,
        body: [
          `exploring claim on "${unitId}" FAILED — no claim, no workspace (ADR-0200 D3): ${errMsg(err)}`,
          released.length > 0 ? `Released the already-taken claim(s): ${released.join(", ")}.` : "",
          "No worktree was created.",
        ]
          .filter((l) => l.length > 0)
          .join("\n"),
        next: [`storytree noticeboard claims ${unitId} --pg`, USAGE],
      };
    }
    if (!result.acquired) {
      // An exploring take is shared and should always acquire — a refusal here is a store-side
      // surprise; treat it exactly like a failure (release, refuse, zero worktree IO).
      const holder = result.heldBy;
      const released = await releaseTaken(ledger, taken, sessionId);
      return {
        ok: false,
        body: [
          `exploring claim on "${unitId}" REFUSED — held by ${holder.sessionId} (branch ${holder.branch}, intent "${holder.intent}").`,
          released.length > 0 ? `Released the already-taken claim(s): ${released.join(", ")}.` : "",
          "No worktree was created.",
        ]
          .filter((l) => l.length > 0)
          .join("\n"),
        next: [`storytree noticeboard claims ${unitId} --pg`, USAGE],
      };
    }
    taken.push(result.claim);
  }

  // (d) Cut the worktree off origin/main. The fetch is best-effort; the add is not — but a failed
  // add never rolls the claims back (they are honest "I intend to work here" rows, releasable).
  let fetchNote: string | null = null;
  try {
    io.fetchMain(primary);
  } catch (err) {
    fetchNote = `note: git fetch origin main failed (${errMsg(err)}) — the cut used the last-fetched origin/main.`;
  }
  try {
    io.addWorktree(primary, branch, worktreePath);
  } catch (err) {
    return {
      ok: false,
      body: [
        `git worktree add FAILED: ${errMsg(err)}`,
        `Your exploring claim(s) STAND on: ${nodes.join(", ")} (session ${sessionId}).`,
        "Retry the create, or release them: storytree noticeboard release <unit> --pg.",
      ].join("\n"),
      next: [`storytree noticeboard release ${nodes[0]} --pg`, USAGE],
    };
  }
  let installNote: string;
  try {
    const res = io.install(worktreePath);
    installNote = res.ok
      ? "pnpm install completed — the worktree is ready."
      : `pnpm install FAILED (exit ${res.code}) — run \`pnpm install\` in ${worktreePath} before any pnpm/tsx command; the worktree and claims stand.`;
  } catch (err) {
    installNote = `pnpm install FAILED (${errMsg(err)}) — run \`pnpm install\` in ${worktreePath} before any pnpm/tsx command; the worktree and claims stand.`;
  }

  // (e) The start payload: claims + board digest + the work-from-this-path ceremony.
  const digest: string[] = [];
  for (const unitId of nodes) {
    try {
      for (const c of await ledger.claimsFor(unitId)) {
        if (c.sessionId === sessionId) continue;
        const intent = c.intent.trim().length > 0 ? ` ("${c.intent}")` : "";
        digest.push(`  - someone else is ${gradeVerb(claimGrade(c))} ${unitId}${intent} — session ${c.sessionId}`);
      }
    } catch {
      // The digest is a courtesy read — a failed board read never fails a created workspace.
    }
  }

  // Baseline the minted session's delta cursor (ADR-0200 D4): the board digest above IS the birth
  // snapshot, so those same rows must never re-fire as cursor-once deltas on the session's first
  // command. Best-effort — the store's first-read self-baseline is the correctness guard.
  try {
    await ledger.baselineCursor?.(sessionId);
  } catch {
    // courtesy only — a failed baseline never fails a created workspace
  }

  const anchor = nodes[0] as string;
  const body = [
    `Worktree created — the claim-gated workspace ceremony (ADR-0200 D3).`,
    "",
    "claims taken:",
    ...taken.map((c) => `  - [${claimGrade(c)}] ${c.unitId}  intent "${c.intent}"`),
    "",
    "board digest:",
    ...(digest.length > 0 ? digest : ["  - no other sessions on your units."]),
    "",
    "work from this path:",
    `  ${worktreePath}`,
    `  cd there — the basename "${sessionId}" IS your session id (ADR-0033), and branch ${branch} is cut off origin/main.`,
    "  Claims release via `storytree noticeboard release <unit> --pg`, or on merge.",
    `  ${installNote}`,
    ...(fetchNote !== null ? [`  ${fetchNote}`] : []),
  ].join("\n");

  return {
    ok: true,
    body,
    next: [`storytree tree ${anchor} --pg`, `storytree noticeboard claims ${anchor} --pg`],
  };
}
