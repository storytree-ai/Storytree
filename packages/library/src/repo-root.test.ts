import test from "node:test";
import assert from "node:assert/strict";

import { REPO_ROOT_ENV, resolveRepoRoot } from "./repo-root.js";

// ADR-0246 / foreign-project-forest-arc inc 1: the repo root is a PARAMETER. These lock the
// precedence and the blank-is-unset rule the call sites depend on.

test("derived wins when nothing is configured — storytree's own loop is unchanged", () => {
  const r = resolveRepoRoot({ derived: "/checkouts/storytree" });
  assert.equal(r.root, "/checkouts/storytree");
  assert.equal(r.source, "derived");
});

test("env repoints the root away from the module's own checkout", () => {
  const r = resolveRepoRoot({ env: "/work/other-project", derived: "/checkouts/storytree" });
  assert.equal(r.root, "/work/other-project");
  assert.equal(r.source, "env");
});

test("an explicit argument outranks the env", () => {
  const r = resolveRepoRoot({
    explicit: "/work/argument",
    env: "/work/from-env",
    derived: "/checkouts/storytree",
  });
  assert.equal(r.root, "/work/argument");
  assert.equal(r.source, "explicit");
});

test("blank and whitespace-only values are UNSET, not the filesystem root", () => {
  // `STORYTREE_REPO_ROOT=` in a shell exports an empty string; reading that as a path would resolve
  // every subsequent join against `/`.
  for (const blank of ["", "   ", "\t\n"]) {
    const r = resolveRepoRoot({ explicit: blank, env: blank, derived: "/checkouts/storytree" });
    assert.equal(r.root, "/checkouts/storytree", `blank ${JSON.stringify(blank)} must not win`);
    assert.equal(r.source, "derived");
  }
});

test("null/undefined candidates fall through to the next source", () => {
  assert.equal(
    resolveRepoRoot({ explicit: null, env: "/work/other", derived: "/checkouts/storytree" }).root,
    "/work/other",
  );
  assert.equal(
    resolveRepoRoot({ explicit: undefined, env: undefined, derived: "/checkouts/storytree" }).source,
    "derived",
  );
});

test("a winning value is trimmed — a trailing newline off a config file is not part of the path", () => {
  const r = resolveRepoRoot({ env: "  /work/other-project\n", derived: "/checkouts/storytree" });
  assert.equal(r.root, "/work/other-project");
});

test("the env var name is the one the call sites read", () => {
  assert.equal(REPO_ROOT_ENV, "STORYTREE_REPO_ROOT");
});
