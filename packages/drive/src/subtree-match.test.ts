import test from "node:test";
import assert from "node:assert/strict";

import { literalPrefix, matchesSubtree, subtreeCovers } from "./subtree-match.js";

/**
 * The COVERING relation (`repo-manifest-fragmentation-arc` increment 1): does one declared subtree
 * claim every path another one claims? The matcher it is built on is proven in
 * `packages/cli/src/source-ownership.test.ts`, where it was first written; these cases are about the
 * relation, and each one says which misreading of it would pass without it.
 */

test("literalPrefix is everything before the first `*`, and the whole of a pattern that has none", () => {
  assert.equal(literalPrefix("packages/cli/src/gate*.ts"), "packages/cli/src/gate");
  assert.equal(literalPrefix("packages/cli/src/*x*.ts"), "packages/cli/src/");
  assert.equal(literalPrefix("packages/library/src/store"), "packages/library/src/store");
  assert.equal(literalPrefix("**/x.ts"), "");
});

test("the three declarations today's manifest carries covered are covered — the file reading of a literal path", () => {
  assert.equal(subtreeCovers("packages/library/src/store", "packages/library/src/store/pg-work-hierarchy-store.ts"), true);
  assert.equal(subtreeCovers("packages/cli/src/*coverage*.ts", "packages/cli/src/check-desktop-route-coverage.ts"), true);
  assert.equal(subtreeCovers("packages/cli/src/uat*.ts", "packages/cli/src/uat-revision-continuity.ts"), true);
});

test("a literal declaration is covered only by a broader one that matches its own path", () => {
  assert.equal(subtreeCovers("packages/cli", "packages/cli-extras/src/x.ts"), false, "a sibling with the same stem");
  assert.equal(subtreeCovers("packages/cli/src/gate*.ts", "packages/cli/src/check-gate.ts"), false);
  assert.equal(subtreeCovers("packages/library/src/store/pg-work-hierarchy-store.ts", "packages/library/src/store"), false, "covering runs one way");
});

test("a glob under a directory declaration is covered, and one that can step outside it is not", () => {
  assert.equal(subtreeCovers("packages/x/src", "packages/x/src/*.ts"), true);
  assert.equal(subtreeCovers("packages/x/src", "packages/x/src/**"), true);
  assert.equal(subtreeCovers("packages/x/src", "packages/x/src*.ts"), false, "`packages/x/srcs.ts` is a sibling, not a child");
  assert.equal(subtreeCovers("packages/x/src", "packages/xyz/*.ts"), false);
  assert.equal(subtreeCovers("packages/x/src/a.ts", "packages/x/src/*.ts"), false, "a file covers no glob beside it");
});

test("glob inside glob: every well-formed path the specific one matches, the broad one must match too", () => {
  assert.equal(subtreeCovers("a/*.ts", "a/x*.ts"), true);
  assert.equal(subtreeCovers("a/x*.ts", "a/*.ts"), false);
  assert.equal(subtreeCovers("a/**", "a/*.ts"), true);
  assert.equal(subtreeCovers("a/**", "a/**/b.ts"), true);
  assert.equal(subtreeCovers("a/**/*.ts", "a/*.ts"), true, "a many-directory glob matches the flat case too");
  assert.equal(subtreeCovers("a/**/b.ts", "a/x/*/b.ts"), true, "the broad glob closes each directory name it opens");
  assert.equal(subtreeCovers("a/*", "a/**"), false, "`a/x/y` steps outside a one-name star");
  assert.equal(subtreeCovers("a/*", "a/*/b"), false);
  assert.equal(subtreeCovers("a/*.ts", "a/*"), false);
  assert.equal(subtreeCovers("a/*.ts", "a/**/b.ts"), false, "`a/x/b.ts` — the specific glob's own directories count");
  assert.equal(subtreeCovers("a/*/b.ts", "a/**/b.ts"), false, "`a/b.ts` has no directory for the one-name star");
  assert.equal(subtreeCovers("a/**/b", "a/*b"), false, "a directory name must reach its `/` before `b` can follow");
  assert.equal(subtreeCovers("a/*a*", "a/*"), false, "a name built from a character neither pattern names escapes");
});

test("globs that merely INTERSECT do not cover each other — the routine case, and refusing it would refuse the map", () => {
  // Both match a `gate-boundaries.ts` nobody has written, and neither matches everything the other does.
  assert.equal(matchesSubtree("packages/cli/src/*boundaries*.ts", "packages/cli/src/gate-boundaries.ts"), true);
  assert.equal(matchesSubtree("packages/cli/src/gate*.ts", "packages/cli/src/gate-boundaries.ts"), true);
  assert.equal(subtreeCovers("packages/cli/src/*boundaries*.ts", "packages/cli/src/gate*.ts"), false);
  assert.equal(subtreeCovers("packages/cli/src/gate*.ts", "packages/cli/src/*boundaries*.ts"), false);
});

test("an empty segment is not a path, so a one-directory glob does not escape a many-directory one through it", () => {
  // The matcher accepts `a//b.ts` for the specific pattern and refuses it for the broad one: a string
  // no disk holds, and the only thing that could have separated the two.
  assert.equal(matchesSubtree("a/*/b.ts", "a//b.ts"), true);
  assert.equal(matchesSubtree("a/**/b.ts", "a//b.ts"), false);
  assert.equal(subtreeCovers("a/**/b.ts", "a/*/b.ts"), true);
});

test("a path ends in a name: a glob that can only end on `/` names no file, so nothing under it can be missed", () => {
  assert.equal(subtreeCovers("b/*", "a/*/"), true);
});

test("`**` reaches across `/` and `*` never does — even between patterns that name no `/` at all", () => {
  assert.equal(subtreeCovers("**", "*"), true);
  assert.equal(subtreeCovers("*", "**"), false);
});

test("every pattern covers itself: the relation is reflexive, and it is the composer that compares DIFFERENT declarations", () => {
  for (const pattern of ["packages/x/src", "packages/x/src/a.ts", "a/*.ts", "a/**/b*.ts", "**"]) {
    assert.equal(subtreeCovers(pattern, pattern), true, pattern);
  }
});
