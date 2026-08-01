/**
 * Contract for the claim RECEIPT (ADR-0257 D5, increment 2).
 *
 * `write-authority-hook.test.ts` proves this module's BEHAVIOUR end to end against a real filesystem
 * and a real spawned hook. This suite covers what an end-to-end test cannot isolate cleanly: each
 * individual fail-closed arm of the parser, the HEAD reader's two on-disk layouts, and the
 * worktree locator's nesting rule. Every path here is pure or takes an injected reader, so it runs
 * offline and identically on both platforms.
 */
import { strict as assert } from "node:assert";
import path from "node:path";
import test from "node:test";

import {
  RECEIPT_POLICY_VERSION,
  RECEIPT_TTL_MS,
  evaluateReceiptAuthority,
  locateWorktree,
  mintReceipt,
  parseReceipt,
  readHeadBranch,
  receiptPath,
  type WriteAuthorityReceipt,
} from "./write-authority-receipt.js";

const PRIMARY = path.resolve("/repo/storytree");
const WT = path.join(PRIMARY, ".claude", "worktrees", "alpha-1a2b3c");
const BRANCH = "claude/alpha-1a2b3c";
const NOW = new Date("2026-08-01T10:00:00.000Z");

function receipt(over: Partial<WriteAuthorityReceipt> = {}): WriteAuthorityReceipt {
  return {
    ...mintReceipt({
      sessionId: "alpha-1a2b3c",
      worktreeRoot: WT,
      primaryRoot: PRIMARY,
      branch: BRANCH,
      claims: [{ unitId: "drive-machinery", branch: BRANCH }],
      now: NOW,
    }),
    ...over,
  };
}

/** Fake reader: every key exists with its value; everything else is absent. */
function files(entries: Readonly<Record<string, string>>): (p: string) => string | null {
  const map = new Map(Object.entries(entries).map(([k, v]) => [path.resolve(k), v]));
  return (p) => map.get(path.resolve(p)) ?? null;
}

// ---------------------------------------------------------------------------
// mintReceipt / receiptPath
// ---------------------------------------------------------------------------

test("mintReceipt stamps a FINITE expiry — authority that never lapses is not authority", () => {
  const r = receipt();
  assert.equal(Date.parse(r.expiresAt) - Date.parse(r.issuedAt), RECEIPT_TTL_MS);
  assert.equal(r.policyVersion, RECEIPT_POLICY_VERSION);
});

test("mintReceipt copies only unitId/branch off each claim — no incidental ledger fields ride along", () => {
  const r = mintReceipt({
    sessionId: "s",
    worktreeRoot: WT,
    primaryRoot: PRIMARY,
    branch: BRANCH,
    claims: [{ unitId: "u", branch: BRANCH, grade: "work" }],
    now: NOW,
  });
  assert.deepEqual(r.claims, [{ unitId: "u", branch: BRANCH }]);
});

test("receiptPath puts the receipt in the PRIMARY checkout — the deny-protected lobby", () => {
  const p = receiptPath(PRIMARY, "alpha-1a2b3c");
  assert.equal(p, path.join(PRIMARY, ".claude", "receipts", "alpha-1a2b3c.json"));
  // It must NOT live inside the worktree, which the session can freely rewrite.
  assert.ok(!p.startsWith(WT));
});

// ---------------------------------------------------------------------------
// parseReceipt — every arm fails closed
// ---------------------------------------------------------------------------

test("parseReceipt accepts a well-formed receipt", () => {
  const got = parseReceipt(JSON.parse(JSON.stringify(receipt())));
  assert.equal(got.ok, true);
});

test("parseReceipt refuses a receipt from another policy version", () => {
  const got = parseReceipt({ ...receipt(), policyVersion: 99 });
  assert.equal(got.ok, false);
  assert.match(got.ok === false ? got.why : "", /policyVersion/);
});

test("parseReceipt refuses non-objects, blank fields, and a bad expiry", () => {
  assert.equal(parseReceipt(null).ok, false);
  assert.equal(parseReceipt("nope").ok, false);
  assert.equal(parseReceipt({ ...receipt(), sessionId: "  " }).ok, false);
  assert.equal(parseReceipt({ ...receipt(), branch: "" }).ok, false);
  assert.equal(parseReceipt({ ...receipt(), expiresAt: "not-a-date" }).ok, false);
});

test("parseReceipt refuses a malformed claims array rather than dropping bad entries", () => {
  // Silently skipping a malformed claim would quietly narrow authority instead of refusing — the
  // opposite of fail-closed, and much harder to notice.
  assert.equal(parseReceipt({ ...receipt(), claims: "all" }).ok, false);
  assert.equal(parseReceipt({ ...receipt(), claims: [{ unitId: "u" }] }).ok, false);
  assert.equal(parseReceipt({ ...receipt(), claims: [null] }).ok, false);
});

// ---------------------------------------------------------------------------
// readHeadBranch — both on-disk layouts, no git spawn
// ---------------------------------------------------------------------------

test("readHeadBranch follows a LINKED worktree's `.git` file to its gitdir", () => {
  const gitDir = path.join(PRIMARY, ".git", "worktrees", "alpha-1a2b3c");
  const read = files({
    [path.join(WT, ".git")]: `gitdir: ${gitDir.replaceAll("\\", "/")}\n`,
    [path.join(gitDir, "HEAD")]: `ref: refs/heads/${BRANCH}\n`,
  });
  assert.equal(readHeadBranch(WT, read), BRANCH);
});

test("readHeadBranch handles a plain checkout whose `.git` is a DIRECTORY", () => {
  // No `.git` file to read, so the reader returns null for it and HEAD is read in place.
  const read = files({ [path.join(WT, ".git", "HEAD")]: `ref: refs/heads/${BRANCH}\n` });
  assert.equal(readHeadBranch(WT, read), BRANCH);
});

test("readHeadBranch returns null on a DETACHED HEAD (a raw sha, no ref)", () => {
  const read = files({ [path.join(WT, ".git", "HEAD")]: "9f8e7d6c5b4a3928170\n" });
  assert.equal(readHeadBranch(WT, read), null);
});

test("readHeadBranch returns null when nothing is readable — which refuses upstream", () => {
  assert.equal(readHeadBranch(WT, () => null), null);
});

test("readHeadBranch keeps a branch name containing slashes intact", () => {
  const read = files({ [path.join(WT, ".git", "HEAD")]: "ref: refs/heads/feat/deep/name\n" });
  assert.equal(readHeadBranch(WT, read), "feat/deep/name");
});

// ---------------------------------------------------------------------------
// locateWorktree
// ---------------------------------------------------------------------------

test("locateWorktree finds the session from any depth inside the worktree", () => {
  const got = locateWorktree(path.join(WT, "packages", "drive", "src"));
  assert.equal(got?.sessionId, "alpha-1a2b3c");
  assert.equal(path.resolve(got?.primaryRoot ?? ""), PRIMARY);
});

test("locateWorktree returns null in the primary checkout and outside the repo", () => {
  assert.equal(locateWorktree(PRIMARY), null);
  assert.equal(locateWorktree(path.resolve("/etc")), null);
});

test("locateWorktree picks the INNERMOST worktree when worktrees nest", () => {
  // `.claude/worktrees/` nests inside a worktree exactly as it does inside the primary checkout,
  // so the last marker — not the first — identifies the session actually running here.
  const nested = path.join(WT, ".claude", "worktrees", "beta-4d5e6f");
  assert.equal(locateWorktree(nested)?.sessionId, "beta-4d5e6f");
});

// ---------------------------------------------------------------------------
// evaluateReceiptAuthority — the composed decision
// ---------------------------------------------------------------------------

const realDirs = (...dirs: string[]) => {
  const set = new Set(dirs.map((d) => path.resolve(d)));
  const root = path.parse(path.resolve("/")).root;
  set.add(path.resolve(root));
  return (p: string) => (set.has(path.resolve(p)) ? path.resolve(p) : null);
};

test("evaluateReceiptAuthority allows a write inside the claimed worktree on the claimed branch", () => {
  const got = evaluateReceiptAuthority({
    rawTargets: [path.join(WT, "packages", "x.ts")],
    cwd: WT,
    receipt: receipt(),
    headBranch: BRANCH,
    now: NOW,
    realpath: realDirs(PRIMARY, WT),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "allow");
});

test("evaluateReceiptAuthority refuses with NO receipt and names the claim ceremony", () => {
  const got = evaluateReceiptAuthority({
    rawTargets: [path.join(WT, "x.ts")],
    cwd: WT,
    receipt: null,
    headBranch: BRANCH,
    now: NOW,
    realpath: realDirs(PRIMARY, WT),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /NO write-authority receipt/);
  assert.match(got.reason, /noticeboard declare/);
});

test("evaluateReceiptAuthority trusts the LIVE head branch over the receipt's recorded one", () => {
  // The receipt says the session claimed `BRANCH`; HEAD now says `main`. A sibling rewinding this
  // worktree's ref must refuse even though the receipt itself is perfectly valid and unexpired.
  const got = evaluateReceiptAuthority({
    rawTargets: [path.join(WT, "x.ts")],
    cwd: WT,
    receipt: receipt(),
    headBranch: "main",
    now: NOW,
    realpath: realDirs(PRIMARY, WT),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /branch mismatch/i);
});

test("evaluateReceiptAuthority refuses once the receipt has expired", () => {
  const got = evaluateReceiptAuthority({
    rawTargets: [path.join(WT, "x.ts")],
    cwd: WT,
    receipt: receipt(),
    headBranch: BRANCH,
    now: new Date(NOW.getTime() + RECEIPT_TTL_MS + 1),
    realpath: realDirs(PRIMARY, WT),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /EXPIRED/);
});

test("evaluateReceiptAuthority names a SIBLING workspace precisely, not as `the primary checkout`", () => {
  // Accuracy matters operationally: told the wrong thing, an operator debugs the wrong problem.
  const sibling = path.join(PRIMARY, ".claude", "worktrees", "beta-4d5e6f", "x.ts");
  const got = evaluateReceiptAuthority({
    rawTargets: [sibling],
    cwd: WT,
    receipt: receipt(),
    headBranch: BRANCH,
    now: NOW,
    realpath: realDirs(PRIMARY, WT, path.dirname(sibling)),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "refuse");
  assert.match(got.reason, /ANOTHER\s+session's workspace/);
});

test("evaluateReceiptAuthority refuses an empty target list (ADR-0257 D3)", () => {
  const got = evaluateReceiptAuthority({
    rawTargets: [],
    cwd: WT,
    receipt: receipt(),
    headBranch: BRANCH,
    now: NOW,
    realpath: realDirs(PRIMARY, WT),
    caseInsensitive: false,
  });
  assert.equal(got.decision, "refuse");
});
