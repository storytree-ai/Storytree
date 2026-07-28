/**
 * `write-authority` — the fail-closed write-authority decision (ADR-0255 D2 / ADR-0257 D1, D3).
 *
 * Every fixture path is built with `path.resolve`/`path.join` rather than written as a literal, so
 * the suite asserts the same behaviour on the Windows dev box and on Linux CI. Case folding is
 * driven by an EXPLICIT `caseInsensitive` flag, never by the running platform, so both arms of that
 * rule are exercised everywhere.
 */
import { strict as assert } from "node:assert";
import path from "node:path";
import test from "node:test";

import {
  canonicalisePath,
  classifyTarget,
  containsPath,
  evaluateWriteAuthority,
  platformCaseInsensitive,
  resolveTargets,
  type LiveClaim,
  type MintedWorktree,
  type RealpathFn,
  type RepoTopology,
  type TargetResolution,
} from "./write-authority.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRIMARY = path.resolve("/repo/storytree");
const WT_ROOT = path.join(PRIMARY, ".claude", "worktrees", "alpha-1a2b3c");
const WT_NESTED = path.join(WT_ROOT, ".claude", "worktrees", "beta-4d5e6f");

/**
 * A fake filesystem: every key EXISTS and resolves to its value (a differing value = a
 * symlink/junction). The filesystem ROOT is always present, because a real one always is — without
 * it the ancestor walk would report every unknown path as unresolvable rather than as outside.
 */
function fakeFs(entries: Readonly<Record<string, string>>): RealpathFn {
  const root = path.parse(path.resolve("/")).root;
  const map = new Map(
    Object.entries({ [root]: root, ...entries }).map(([k, v]) => [path.resolve(k), path.resolve(v)]),
  );
  return (p) => map.get(path.resolve(p)) ?? null;
}

/** Identity-resolving fake fs — the given paths exist and are not links. */
function realDirs(...dirs: readonly string[]): RealpathFn {
  return fakeFs(Object.fromEntries(dirs.map((d) => [d, d])));
}

function worktree(over: Partial<MintedWorktree> = {}): MintedWorktree {
  return { sessionId: "alpha-1a2b3c", root: WT_ROOT, branch: "claude/alpha-1a2b3c", ...over };
}

function topology(over: Partial<RepoTopology> = {}): RepoTopology {
  return {
    primaryRoot: PRIMARY,
    mintedWorktrees: [worktree()],
    caseInsensitive: false,
    ...over,
  };
}

function claim(over: Partial<LiveClaim> = {}): LiveClaim {
  return { unitId: "notice-board", branch: "claude/alpha-1a2b3c", ...over };
}

/** An already-resolved target in a given zone, for the decision-only tests. */
function inWorktree(rel: string, wt: MintedWorktree = worktree()): TargetResolution {
  const canonical = path.join(wt.root, rel);
  return { ok: true, raw: rel, canonical, zone: { kind: "worktree", worktree: wt } };
}

// ---------------------------------------------------------------------------
// canonicalisePath
// ---------------------------------------------------------------------------

test("canonicalisePath resolves a relative target against cwd", () => {
  const file = path.join(WT_ROOT, "packages", "drive", "src", "x.ts");
  const got = canonicalisePath(
    path.join("packages", "drive", "src", "x.ts"),
    WT_ROOT,
    realDirs(WT_ROOT, file),
  );
  assert.deepEqual(got, { ok: true, path: file });
});

test("canonicalisePath collapses `..`, so a relative escape lands outside the worktree", () => {
  const got = canonicalisePath(path.join("..", "..", "..", "secrets.json"), WT_ROOT, realDirs(PRIMARY));
  assert.equal(got.ok, true);
  assert.equal(got.ok && got.path, path.join(PRIMARY, "secrets.json"));
});

test("canonicalisePath resolves a target that does not exist yet — the file-CREATE case", () => {
  // Only the worktree root exists; the file and its `src/` parent are about to be created.
  const got = canonicalisePath(path.join(WT_ROOT, "src", "brand-new.ts"), WT_ROOT, realDirs(WT_ROOT));
  assert.deepEqual(got, { ok: true, path: path.join(WT_ROOT, "src", "brand-new.ts") });
});

test("canonicalisePath follows a junction/symlink OUT of the worktree", () => {
  // `<worktree>/escape` is a junction pointing at the primary checkout: a write through it lands in
  // the lobby, and a textual prefix check would have called it a worktree write.
  const link = path.join(WT_ROOT, "escape");
  const got = canonicalisePath(
    path.join(link, "CLAUDE.md"),
    WT_ROOT,
    fakeFs({ [WT_ROOT]: WT_ROOT, [link]: PRIMARY }),
  );
  assert.deepEqual(got, { ok: true, path: path.join(PRIMARY, "CLAUDE.md") });
});

test("canonicalisePath refuses a blank target", () => {
  const got = canonicalisePath("   ", WT_ROOT, realDirs(WT_ROOT));
  assert.equal(got.ok, false);
});

test("canonicalisePath refuses when not even the filesystem root resolves", () => {
  const got = canonicalisePath(path.join(WT_ROOT, "x.ts"), WT_ROOT, () => null);
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.why : "", /no existing ancestor/);
});

// ---------------------------------------------------------------------------
// containsPath
// ---------------------------------------------------------------------------

test("containsPath matches the root itself and anything strictly inside it", () => {
  assert.equal(containsPath(PRIMARY, PRIMARY, false), true);
  assert.equal(containsPath(PRIMARY, path.join(PRIMARY, "a", "b.ts"), false), true);
});

test("containsPath is segment-boundary aware — a sibling PREFIX never matches", () => {
  const root = path.resolve("/repo/storytree");
  const sibling = path.resolve("/repo/storytree-evil/x.ts");
  assert.equal(containsPath(root, sibling, false), false);
  // …and the trap it guards: a bare startsWith would have said true.
  assert.equal(sibling.startsWith(root), true);
});

test("containsPath folds case only when told to — the Windows drive-case rule", () => {
  const inside = path.join(PRIMARY, "src", "a.ts");
  assert.equal(containsPath(PRIMARY.toUpperCase(), inside.toLowerCase(), true), true);
  assert.equal(containsPath(PRIMARY.toUpperCase(), inside.toLowerCase(), false), false);
});

test("platformCaseInsensitive folds on Windows and macOS, not on Linux", () => {
  assert.equal(platformCaseInsensitive("win32"), true);
  assert.equal(platformCaseInsensitive("darwin"), true);
  assert.equal(platformCaseInsensitive("linux"), false);
});

// ---------------------------------------------------------------------------
// classifyTarget
// ---------------------------------------------------------------------------

test("classifyTarget matches the WORKTREE before the lobby, though the worktree nests inside it", () => {
  // The trap: `.claude/worktrees/<name>` lives UNDER the primary root, so lobby-first would refuse
  // every legitimate workspace write.
  const zone = classifyTarget(path.join(WT_ROOT, "packages", "drive", "src", "x.ts"), topology());
  assert.equal(zone.kind, "worktree");
  assert.equal(zone.kind === "worktree" && zone.worktree.sessionId, "alpha-1a2b3c");
});

test("classifyTarget picks the LONGEST matching worktree root when worktrees nest", () => {
  const nested = worktree({ sessionId: "beta-4d5e6f", root: WT_NESTED, branch: "claude/beta-4d5e6f" });
  const zone = classifyTarget(
    path.join(WT_NESTED, "x.ts"),
    topology({ mintedWorktrees: [worktree(), nested] }),
  );
  assert.equal(zone.kind === "worktree" && zone.worktree.sessionId, "beta-4d5e6f");
});

test("classifyTarget calls an ordinary primary-checkout path the LOBBY", () => {
  assert.deepEqual(classifyTarget(path.join(PRIMARY, "CLAUDE.md"), topology()), { kind: "lobby" });
});

test("classifyTarget calls a path outside the repository OUTSIDE", () => {
  assert.deepEqual(classifyTarget(path.resolve("/etc/hosts"), topology()), { kind: "outside" });
});

test("classifyTarget treats a worktree dir GIT DOES NOT KNOW as lobby, not as a workspace", () => {
  // ADR-0257 rejects "permit every `.claude/worktrees` directory": a stale or hand-made directory
  // would become writable below the semantic check. Enumeration comes from git, not from the name.
  const stale = path.join(PRIMARY, ".claude", "worktrees", "stale-999999", "x.ts");
  assert.deepEqual(classifyTarget(stale, topology()), { kind: "lobby" });
});

// ---------------------------------------------------------------------------
// evaluateWriteAuthority — every arm fails closed
// ---------------------------------------------------------------------------

const CLAIMED = { "alpha-1a2b3c": [claim()] };

test("evaluateWriteAuthority ALLOWS a claimed worktree write on the claimed branch", () => {
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts")],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "allow");
  assert.match(got.reason, /alpha-1a2b3c/);
});

test("evaluateWriteAuthority allows on ANY claim grade — exploring admits scoped preparation", () => {
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts")],
    claimsBySession: { "alpha-1a2b3c": [claim({ grade: "exploring" })] },
  });
  assert.equal(got.decision, "allow");
});

test("evaluateWriteAuthority REFUSES when no target could be extracted", () => {
  const got = evaluateWriteAuthority({ targets: [], claimsBySession: CLAIMED });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /no write target could be extracted/);
});

test("evaluateWriteAuthority REFUSES an unresolvable target", () => {
  const got = evaluateWriteAuthority({
    targets: [{ ok: false, raw: "??", why: "no existing ancestor" }],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /could not be canonicalised/);
});

test("evaluateWriteAuthority REFUSES a target outside the repository", () => {
  const got = evaluateWriteAuthority({
    targets: [
      { ok: true, raw: "/etc/hosts", canonical: path.resolve("/etc/hosts"), zone: { kind: "outside" } },
    ],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /outside this\s+repository/);
});

test("evaluateWriteAuthority REFUSES a lobby write and names the mint ceremony", () => {
  const got = evaluateWriteAuthority({
    targets: [
      {
        ok: true,
        raw: "CLAUDE.md",
        canonical: path.join(PRIMARY, "CLAUDE.md"),
        zone: { kind: "lobby" },
      },
    ],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /read-only agent lobby/);
  assert.match(got.reason, /storytree worktree create/);
});

test("evaluateWriteAuthority REFUSES a detached-HEAD worktree — no branch, no authority", () => {
  const detached = worktree({ branch: null });
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts", detached)],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /DETACHED HEAD/);
});

test("evaluateWriteAuthority REFUSES when the ledger could not be read", () => {
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts")],
    claimsBySession: null,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /claim ledger could not be read/);
});

test("evaluateWriteAuthority REFUSES an unclaimed worktree — a directory is not a workspace", () => {
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts")],
    claimsBySession: { "someone-else": [claim()] },
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /holds NO live claim/);
});

test("evaluateWriteAuthority REFUSES when the worktree moved off its claimed branch", () => {
  // The `sibling rewound my branch ref` friction shape: every git signal afterwards reads as success.
  const got = evaluateWriteAuthority({
    targets: [inWorktree("src/x.ts", worktree({ branch: "main" }))],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /branch mismatch/);
  assert.match(got.reason, /worktree is on: main/);
  assert.match(got.reason, /claude\/alpha-1a2b3c/);
});

test("evaluateWriteAuthority refuses the WHOLE call when one target of a batch is a lobby write", () => {
  const got = evaluateWriteAuthority({
    targets: [
      inWorktree("src/x.ts"),
      {
        ok: true,
        raw: "CLAUDE.md",
        canonical: path.join(PRIMARY, "CLAUDE.md"),
        zone: { kind: "lobby" },
      },
    ],
    claimsBySession: CLAIMED,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /read-only agent lobby/);
});

// ---------------------------------------------------------------------------
// resolveTargets — the one call an adapter makes
// ---------------------------------------------------------------------------

test("resolveTargets canonicalises and classifies a mixed batch end to end", () => {
  const file = path.join(WT_ROOT, "src", "x.ts");
  const link = path.join(WT_ROOT, "escape");
  const io = fakeFs({ [PRIMARY]: PRIMARY, [WT_ROOT]: WT_ROOT, [file]: file, [link]: PRIMARY });

  const got = resolveTargets(
    [path.join("src", "x.ts"), path.join(link, "CLAUDE.md"), path.resolve("/etc/hosts")],
    WT_ROOT,
    topology(),
    io,
  );

  assert.equal(got.length, 3);
  assert.equal(got[0]?.ok === true && got[0].zone.kind, "worktree");
  // The junction escape is classified by where it RESOLVES, not by the path that was written.
  assert.equal(got[1]?.ok === true && got[1].zone.kind, "lobby");
  assert.equal(got[2]?.ok === true && got[2].zone.kind, "outside");
});

test("resolveTargets + evaluateWriteAuthority refuse a junction escape out of a claimed worktree", () => {
  const link = path.join(WT_ROOT, "escape");
  const io = fakeFs({ [PRIMARY]: PRIMARY, [WT_ROOT]: WT_ROOT, [link]: PRIMARY });
  const targets = resolveTargets([path.join(link, "CLAUDE.md")], WT_ROOT, topology(), io);
  const got = evaluateWriteAuthority({ targets, claimsBySession: CLAIMED });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /read-only agent lobby/);
});
