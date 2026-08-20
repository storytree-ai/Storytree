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
// The SUBPATH, never the `@storytree/drive` barrel. The barrel re-exports the whole build/orchestrate
// runtime — `node-build`, `story-build`, `orchestrate`, the DB preflight — when this module needs only
// the claim-universe helpers. Both symbols live in the exported `claim-universe.ts` subpath.
import { guardClaimNamespace, type ClaimUniverseLoader } from "@storytree/drive/claim-universe";

// Direct from `arc-rollup.ts`, not through the package barrel. The barrel reaches `arc.ts`, which
// reaches the `@storytree/drive` BARREL and with it the whole build/orchestrate runtime. `arc-rollup.ts`
// is the direct owner of the helper and avoids that unrelated dependency reach.
//
// The module MOVED packages on 2026-08-14 (`@storytree/drive/arc-rollup` → `@storytree/arc/arc-rollup`,
// ADR-0369) and the narrow-subpath requirement moved with it UNCHANGED — which is why `arc-rollup.ts`
// now reaches drive through `@storytree/drive/adr-metas` / `/adr-frontmatter` / `/work-hierarchy`
// rather than drive's barrel. Taking either side of that merge alone would have broken something:
// the barrel import widens the dependency graph, and the old path no longer exists.
import { storyArcStamps } from "@storytree/arc/arc-rollup";

// The `git worktree list --porcelain` parser the reaper already owns — composed, never re-written
// (a second porcelain parser is a second source of truth about what git holds). `worktree.ts` and its
// one import (`worktree-drain.ts`) are node-builtin-only, so this costs the Codex bootstrap payload
// no database client — the same fence every import note above polices.
import { parseWorktreeList } from "./worktree.js";
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
    // A declared SUBTREE became claimable in ADR-0317 D3 and its id is a PATH-or-glob, so this is
    // now reachable by a legitimate claim rather than only by a typo — and "rename the node" is
    // useless advice for a path. The anchor is the only node that names the directory and branch;
    // the rest are just claims, so the remedy is ordering, not renaming.
    throw new Error(
      `anchor node "${anchor}" has characters unsafe for a directory/branch name ` +
        "(allowed: lowercase alphanumerics and hyphens). A declared subtree is claimable but its id " +
        "is a path, so it cannot ANCHOR a workspace: put the story or capability first and pass the " +
        "subtree as a later --node. A tree node is renamed, never silently normalised.",
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
//   parse → RESUME probe → mint (collision re-draws INCLUDED — the identity is FINAL before it is
//   claimed) → take the exploring claim(s) → fetch + `git worktree add` off origin/main →
//   CHECKPOINT → synchronous `pnpm install` → the start-payload envelope.
//
// The RESUME probe and the CHECKPOINT are the two halves of "a timed-out create is resumable, not a
// duplicate" (see the RESUME section below). The probe adopts this caller's own partial ceremony
// instead of minting beside it; the checkpoint announces what exists BEFORE the slow install, so a
// caller killed mid-provision still learns the path, branch and claims it is holding. Neither can
// refuse a workspace: both are best-effort, and a failure in either lands on the pre-resume path.
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
  /**
   * Plain `existsSync`. Two callers, deliberately the same seam: a candidate `<worktrees>/<name>` hit
   * forces a suffix re-draw during minting, and a `<worktree>/node_modules` hit tells the resume probe
   * that a tree is already PROVISIONED (see {@link findResumableCeremony}).
   */
  exists(absPath: string): boolean;
  /**
   * Every worktree git currently has registered, as `{path, branch}` — `git worktree list --porcelain`
   * parsed. The resume probe's only view of what already exists.
   *
   * BEST-EFFORT BY CONTRACT: answer `[]` rather than throwing when git cannot be read. A degraded
   * probe means "no orphan found", so the ceremony mints fresh exactly as it did before resume — it
   * must never turn into a refused workspace.
   */
  registeredWorktrees(primaryRoot: string): ReadonlyArray<{ path: string; branch: string | null }>;
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
  registeredWorktrees(primaryRoot) {
    try {
      const out = execFileSync("git", ["-C", primaryRoot, "worktree", "list", "--porcelain"], {
        encoding: "utf8",
      }) as string;
      return parseWorktreeList(out).map((e) => ({ path: e.path, branch: e.branch }));
    } catch {
      // Documented as best-effort: an unreadable registry means "no orphan found", never a refusal.
      return [];
    }
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

// ---------------------------------------------------------------------------
// RESUME — adopting a partial ceremony instead of duplicating it
// ---------------------------------------------------------------------------
//
// THE FAILURE (friction `worktree-create-timeout-leaves-a-half-provisioned-session`, measured
// 2026-08-11): the call crosses the caller's foreground timeout AFTER the exploring claim is taken
// and the worktree is cut, but BEFORE `pnpm install` finishes — a measured 21.2s from a warm store,
// on top of fetch and add. The caller is left holding a live claim and a cut-but-unusable worktree,
// with no start payload naming either.
//
// WHY A RE-RUN COULD NOT SIMPLY CONVERGE: the basename carries a random suffix, so `exists()` — which
// exists to force a re-draw on collision — guarantees the retry mints a SECOND worktree beside the
// orphan rather than recognising it. Nothing links the retry to its own earlier attempt BY NAME.
//
// THE LINK THAT DOES EXIST is the surviving claim. Its `sessionId` IS the worktree basename
// (ADR-0033) and its branch is `claude/<basename>`, so `unit + intent + that identity shape` names
// the earlier attempt without any new bookkeeping — and the re-take is idempotent per (unit,
// session), so adoption re-takes rather than tracking what it already took.
//
// THE DISCRIMINATOR that keeps adoption off a LIVE session's workspace is the very thing that makes
// an orphan an orphan: its `node_modules` are ABSENT. A provisioned tree is somebody's working
// session and is never adopted, however well its claim matches. The `exploring` grade is the second
// fence — a session that promoted to `work` is writing.
//
// WHAT IS DELIBERATELY NOT ADOPTED: a claim with NO registered worktree (the ceremony died before
// `git worktree add`). Re-using that name would mean `git worktree add -b <branch>` against a branch
// that may already exist, i.e. a repair rather than a resume. That shape refuses today with the
// claims named and the release command printed, which is honest; it is not silently abandoned.

/** A basename safe to join into a path — {@link mintWorktreeName}'s own alphabet, re-asserted here. */
const SAFE_BASENAME = /^[a-z0-9-]+$/;

/** Two absolute paths denote the same location? Forward-slashed, trailing-slash-free, win32-folded. */
function samePathish(a: string, b: string): boolean {
  const norm = (p: string): string => {
    const r = path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "");
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/** The identity of a partial ceremony this call may adopt instead of minting a new one. */
export interface ResumableCeremony {
  /** The orphan's session id — its worktree basename (ADR-0033). */
  readonly sessionId: string;
  /** `claude/<sessionId>`. */
  readonly branch: string;
  /** `<primary>/.claude/worktrees/<sessionId>`. */
  readonly worktreePath: string;
}

/**
 * PURE adoption policy: which of the anchor unit's live claims (if any) names a partial ceremony of
 * MINE that should be resumed rather than re-cut. Every input is data, so the whole decision is
 * proven without git, a ledger, or a filesystem. Returns null — mint fresh — unless ALL hold:
 *
 *   - the claim is `exploring` (the grade this ceremony takes; `work` means a session promoted it);
 *   - its `sessionId` is a mint-shaped basename (so it can never traverse out of the worktrees dir);
 *   - its branch is exactly `claude/<sessionId>` (the create ceremony's own identity shape);
 *   - its intent matches this call's intent verbatim (what makes it MY attempt, not a sibling's);
 *   - git has a worktree registered at `<worktreesDir>/<sessionId>` ON that branch;
 *   - that worktree is NOT provisioned — a tree with `node_modules` is a live session's workspace.
 *
 * On several matches the OLDEST claim wins (ties broken by session id), so the choice is stable
 * across re-runs rather than dependent on ledger row order.
 */
export function findResumableCeremony(args: {
  readonly claims: readonly ClaimDocT[];
  readonly intent: string;
  readonly worktreesDir: string;
  readonly registered: ReadonlyArray<{ path: string; branch: string | null }>;
  readonly isProvisioned: (absPath: string) => boolean;
}): ResumableCeremony | null {
  const want = args.intent.trim();
  if (want.length === 0) return null;
  const candidates = args.claims
    .filter(
      (c) =>
        claimGrade(c) === "exploring" &&
        SAFE_BASENAME.test(c.sessionId) &&
        c.branch === BRANCH_PREFIX + c.sessionId &&
        c.intent.trim() === want,
    )
    .slice()
    .sort((a, b) =>
      a.claimedAt === b.claimedAt
        ? a.sessionId.localeCompare(b.sessionId)
        : a.claimedAt.localeCompare(b.claimedAt),
    );
  for (const c of candidates) {
    const worktreePath = path.join(args.worktreesDir, c.sessionId);
    const entry = args.registered.find((e) => samePathish(e.path, worktreePath));
    if (entry === undefined || entry.branch !== c.branch) continue;
    if (args.isProvisioned(worktreePath)) continue;
    return { sessionId: c.sessionId, branch: c.branch, worktreePath };
  }
  return null;
}

export interface WorktreeCreateOpts {
  /** The `--node` story ids, in flag order — the FIRST is the anchor the name is minted from. */
  readonly nodes: readonly string[];
  /** The `--intent` prose — REQUIRED, non-blank: the exploring claim IS its intent (ADR-0200 D2). */
  readonly intent: string;
}

export interface WorktreeCreateDeps {
  /** The live claim ledger (--pg); null offline — the ceremony refuses (no claim, no workspace). */
  readonly ledger: WorktreeCreateLedgerLike | null;
  /**
   * The claim NAMESPACE (ADR-0310 D2). This ceremony BORNS a session claimed, so a phantom id here
   * mints a whole worktree around a claim on nothing — the most expensive shape of the failure.
   * Absent/null = unchecked (the pre-ADR-0310 behaviour).
   */
  readonly universe?: ClaimUniverseLoader | null;
  readonly io?: WorktreeCreateIo;
  /** Story→arc provenance stamps for the mint; defaults to reading `<primary>/stories/`. */
  readonly stamps?: () => ReadonlyArray<{ story: string; arc: string }>;
  /** Suffix draws for the mint; defaults to 6 random hex chars (the branch.ts pattern). */
  readonly generateSuffix?: () => string;
  /** Re-draw cap on a basename collision (the branch.ts pattern); defaults to 5. */
  readonly maxAttempts?: number;
  /**
   * The STAGED-PAYLOAD sink: called ONCE, the moment the worktree provably exists and BEFORE the slow
   * install, with the path / branch / session / claims a killed caller would otherwise never learn.
   * The envelope is the complete payload and arrives only at the end; this is what survives a caller
   * whose foreground timeout expires mid-install. Defaults to stderr — stdout belongs to the envelope
   * alone (the Codex bootstrap entry parses it as JSON). A throw here never fails the ceremony.
   */
  readonly checkpoint?: (text: string) => void;
}

const USAGE = 'storytree worktree create --node <story> [--node <story>…] --intent "<what>" --pg';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Release the already-taken claims best-effort — the original error is NEVER masked by a release
 * failure. `keep` names a unit whose claim must SURVIVE the rollback: on an adopted ceremony the
 * anchor's claim PRE-DATES this call and is the only durable link to the orphan worktree, so
 * releasing it would strand a tree nothing can ever identify again — the exact failure resume exists
 * to remove. Rolling back a claim we did not take is not a rollback, it is a deletion.
 */
async function releaseTaken(
  ledger: WorktreeCreateLedgerLike,
  taken: readonly ClaimDocT[],
  sessionId: string,
  keep: string | null = null,
): Promise<string[]> {
  const released: string[] = [];
  for (const c of taken) {
    if (c.unitId === keep) continue;
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
  // THE NAMESPACE FENCE (ADR-0310 D2) — still inside the parse block, so it lands on the right side
  // of the ceremony's load-bearing invariant: no claim, no workspace. A phantom id caught here costs
  // nothing; the same id caught after the mint would already have a branch and a worktree hung off
  // a claim that protects nothing. Every node is checked before any is refused, so a session with
  // two typos is told about both rather than discovering the second on the re-run.
  const unresolved: Envelope[] = [];
  for (const node of nodes) {
    const named = await guardClaimNamespace({ id: node, universe: deps.universe, verb: USAGE });
    if (!named.ok) unresolved.push(named.refusal);
  }
  const firstUnresolved = unresolved[0];
  if (firstUnresolved !== undefined) {
    return unresolved.length === 1
      ? firstUnresolved
      : {
          ok: false,
          body: unresolved.map((r) => r.body).join("\n\n"),
          next: [...new Set(unresolved.flatMap((r) => r.next ?? []))],
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

  const worktreesDir = path.join(primary, ".claude", "worktrees");

  // (b0) RESUME — BEFORE minting, because adopting my own partial ceremony and drawing a fresh
  // identity are mutually exclusive: `exists()` would otherwise re-draw AROUND the orphan and leave a
  // second worktree beside it. Wholly best-effort — every probe here is a READ, and any failure means
  // "no orphan found", which is exactly the pre-resume behaviour.
  let resumed: ResumableCeremony | null = null;
  try {
    resumed = findResumableCeremony({
      claims: await ledger.claimsFor(nodes[0] as string),
      intent: opts.intent,
      worktreesDir,
      registered: io.registeredWorktrees(primary),
      isProvisioned: (p) => io.exists(path.join(p, "node_modules")),
    });
  } catch {
    resumed = null;
  }

  // (b) Mint — BEFORE the claims: the identity (basename = session id, branch = claude/<basename>)
  // must be FINAL before it is claimed, so collision re-draws are part of minting, never a re-claim.
  // An adopted ceremony skips this entirely: its identity was already minted, claimed and cut.
  const maxAttempts = deps.maxAttempts ?? 5;
  let minted: MintedWorktreeName | null =
    resumed === null ? null : { basename: resumed.sessionId, branch: resumed.branch };
  let worktreePath = resumed?.worktreePath ?? "";
  if (resumed === null) {
    const stamps =
      deps.stamps !== undefined ? deps.stamps() : storyArcStamps(path.join(primary, "stories"));
    const generateSuffix = deps.generateSuffix ?? (() => randomBytes(3).toString("hex"));
    try {
      for (let attempt = 0; attempt < maxAttempts && minted === null; attempt += 1) {
        const candidate = mintWorktreeName(nodes, stamps, generateSuffix());
        const candidatePath = path.join(worktreesDir, candidate.basename);
        if (!io.exists(candidatePath)) {
          minted = candidate;
          worktreePath = candidatePath;
        }
      }
    } catch (err) {
      // mintWorktreeName refuses by throwing (unsafe anchor, blank suffix) — surface it verbatim.
      return { ok: false, body: `worktree create refused: ${errMsg(err)}`, next: [USAGE] };
    }
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
  // On a RESUMED ceremony these are RE-takes: the upsert is idempotent per (unit, session), which is
  // what lets adoption converge without a second bookkeeping layer. Two consequences for the rollback
  // below: the anchor's claim pre-dates this call and must survive it, and "no worktree was created"
  // would be a lie about a tree the previous attempt cut.
  const keepOnRollback = resumed === null ? null : (nodes[0] as string);
  const nothingStands =
    resumed === null
      ? "No worktree was created."
      : `The adopted worktree at ${worktreePath} still stands, and its own claim on ` +
        `"${keepOnRollback ?? ""}" was left in place so a later re-run can still find it.`;
  const taken: ClaimDocT[] = [];
  for (const unitId of nodes) {
    let result: ClaimResult;
    try {
      result = await ledger.take(exploringClaimRequest({ unitId, sessionId, branch, intent: opts.intent }));
    } catch (err) {
      const released = await releaseTaken(ledger, taken, sessionId, keepOnRollback);
      return {
        ok: false,
        body: [
          `exploring claim on "${unitId}" FAILED — no claim, no workspace (ADR-0200 D3): ${errMsg(err)}`,
          released.length > 0 ? `Released the already-taken claim(s): ${released.join(", ")}.` : "",
          nothingStands,
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
      const released = await releaseTaken(ledger, taken, sessionId, keepOnRollback);
      return {
        ok: false,
        body: [
          `exploring claim on "${unitId}" REFUSED — held by ${holder.sessionId} (branch ${holder.branch}, intent "${holder.intent}").`,
          released.length > 0 ? `Released the already-taken claim(s): ${released.join(", ")}.` : "",
          nothingStands,
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
  // BOTH are skipped for an adopted ceremony: the tree is already cut and on the right branch, so a
  // re-add would throw and a re-fetch would be pure latency on the path a timeout already burned.
  let fetchNote: string | null = null;
  if (resumed === null) {
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
  }

  // (d′) THE STAGED PAYLOAD. Everything irreversible has now happened and only the slow step remains
  // (a measured 21.2s of `pnpm install` from a warm store), so a caller killed from here on would
  // otherwise learn NOTHING about the session it just created. Announce it before paying that cost.
  // stderr, never stdout: the envelope is stdout's alone.
  const checkpoint =
    deps.checkpoint ??
    ((text: string) => {
      process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
    });
  try {
    checkpoint(
      [
        `[worktree create] ${resumed === null ? "CUT" : "RESUMED"} ${worktreePath}`,
        `[worktree create]   branch ${branch} · session ${sessionId} · claims ${nodes.join(", ")}`,
        "[worktree create]   installing dependencies — if this call is killed now, re-run the SAME " +
          "command and it will adopt this worktree rather than mint a second one.",
      ].join("\n"),
    );
  } catch {
    // An announcement, not a step: a closed stderr never costs anyone a workspace.
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

  // (A write-authority receipt was stamped here for the born-claimed session until ADR-0284 D4
  // retired it with the hook that consumed it.)

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
    resumed === null
      ? `Worktree created — the claim-gated workspace ceremony (ADR-0200 D3).`
      : `Worktree RESUMED — a partial ceremony for session "${sessionId}" was adopted rather than ` +
        `re-cut: its exploring claim stood and its worktree was already cut, but it was never ` +
        `provisioned (a create that crossed its caller's timeout mid-install). No second worktree ` +
        `was minted and no claim was abandoned.`,
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
