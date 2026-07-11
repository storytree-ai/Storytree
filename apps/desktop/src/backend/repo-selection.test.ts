// Integration test for the Electron-main repo selection module (repo-selection.ts).
//
// WHAT IT PINS: RepoSelection is the SELECTION LIFECYCLE AS A WHOLE, over injected ports —
// it VALIDATES a candidate directory via an injected DirProbe (exists / is a directory / is
// a git repo), PERSISTS a valid one via an injected SelectionStore (and refuses to persist an
// invalid one), READS the persisted selection back, and RESOLVES the terminal's cwd (the
// selected dir when still valid, else a caller-supplied fallback) — failing closed (a typed
// reason / the fallback, NEVER a throw) on every bad, absent, or now-invalid path.
//
// INJECTED FAKES: a fake DirProbe whose exists/isDirectory/isGitRepo are scripted per path,
// and a fake SelectionStore backed by an in-memory value — the same discipline
// pty-session-manager.test.ts uses with FakePtyPort. No real node:fs, no Electron.
//
// DELETION TEST: if RepoSelection were removed, every assertion below fails on import. If
// validation were dropped, an invalid path would be persisted. If the fail-closed guards were
// dropped, a bad path would throw instead of returning a typed reason / the fallback.

import { test } from "node:test";
import assert from "node:assert/strict";

// RED: repo-selection.ts does not exist yet — module-not-found is the right-kind red.
import { RepoSelection } from "./repo-selection.js";
import type { DirProbe, SelectionStore } from "./repo-selection.js";

// ---------------------------------------------------------------------------
// Fake ports — the injected seams.
// ---------------------------------------------------------------------------

interface PathFacts {
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
}

class FakeDirProbe implements DirProbe {
  readonly #facts = new Map<string, PathFacts>();

  /** Test-only: script the facts a real filesystem would report for `path`. */
  set(path: string, facts: PathFacts): void {
    this.#facts.set(path, facts);
  }

  exists(path: string): boolean {
    return this.#facts.get(path)?.exists ?? false;
  }

  isDirectory(path: string): boolean {
    return this.#facts.get(path)?.isDirectory ?? false;
  }

  isGitRepo(path: string): boolean {
    return this.#facts.get(path)?.isGitRepo ?? false;
  }
}

class FakeSelectionStore implements SelectionStore {
  #value: string | null = null;
  writeCount = 0;

  read(): string | null {
    return this.#value;
  }

  write(path: string): void {
    this.writeCount += 1;
    this.#value = path;
  }

  /** Test-only: seed the store as if a prior session had already persisted a path. */
  seed(path: string | null): void {
    this.#value = path;
  }
}

const VALID_REPO = "/home/user/projects/storytree";
const NOT_FOUND = "/home/user/projects/does-not-exist";
const NOT_A_DIRECTORY = "/home/user/projects/storytree/package.json";
const NOT_A_GIT_REPO = "/home/user/projects/plain-folder";

function makeValidatedProbe(): FakeDirProbe {
  const probe = new FakeDirProbe();
  probe.set(VALID_REPO, { exists: true, isDirectory: true, isGitRepo: true });
  probe.set(NOT_A_DIRECTORY, { exists: true, isDirectory: false, isGitRepo: false });
  probe.set(NOT_A_GIT_REPO, { exists: true, isDirectory: true, isGitRepo: false });
  // NOT_FOUND is intentionally never set — exists() falls back to false.
  return probe;
}

// ---------------------------------------------------------------------------
// select() — validation + persistence
// ---------------------------------------------------------------------------

test("select: a path that exists, is a directory, and is a git repo is persisted and returns ok", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  const result = selection.select(VALID_REPO);

  assert.deepEqual(result, { ok: true, path: VALID_REPO });
  assert.equal(store.writeCount, 1, "a valid selection must be persisted exactly once");
  assert.equal(store.read(), VALID_REPO);
});

test("select: a missing path is rejected with a typed reason and is never persisted", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  const result = selection.select(NOT_FOUND);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && typeof result.reason === "string" && result.reason.length > 0);
  assert.equal(store.writeCount, 0, "an invalid path must never be persisted");
  assert.equal(store.read(), null);
});

test("select: a path that exists but is not a directory is rejected and never persisted", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  const result = selection.select(NOT_A_DIRECTORY);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && typeof result.reason === "string" && result.reason.length > 0);
  assert.equal(store.writeCount, 0);
  assert.equal(store.read(), null);
});

test("select: a directory that is not a git repo is rejected and never persisted", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  const result = selection.select(NOT_A_GIT_REPO);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && typeof result.reason === "string" && result.reason.length > 0);
  assert.equal(store.writeCount, 0);
  assert.equal(store.read(), null);
});

test("select never throws on a bad path — fail closed, typed reason only", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  assert.doesNotThrow(() => {
    selection.select(NOT_FOUND);
    selection.select(NOT_A_DIRECTORY);
    selection.select(NOT_A_GIT_REPO);
  });
});

// ---------------------------------------------------------------------------
// current() — read-back
// ---------------------------------------------------------------------------

test("current: returns the persisted selection after a successful select", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  selection.select(VALID_REPO);

  assert.equal(selection.current(), VALID_REPO);
});

test("current: returns null when nothing has ever been persisted", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  assert.equal(selection.current(), null);
});

// ---------------------------------------------------------------------------
// resolveCwd() — fallback resolution, fail-closed
// ---------------------------------------------------------------------------

test("resolveCwd: returns the selected directory when the persisted selection is still valid", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  store.seed(VALID_REPO);
  const selection = new RepoSelection(probe, store);

  const cwd = selection.resolveCwd("/fallback/serve-root");

  assert.equal(cwd, VALID_REPO);
});

test("resolveCwd: returns the fallback when nothing has ever been persisted", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  const selection = new RepoSelection(probe, store);

  const cwd = selection.resolveCwd("/fallback/serve-root");

  assert.equal(cwd, "/fallback/serve-root");
});

test("resolveCwd: returns the fallback, never throws, when the persisted selection is now invalid", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  // A path that was valid at select-time but has since been deleted / is no longer a repo.
  store.seed("/home/user/projects/deleted-since-selection");
  const selection = new RepoSelection(probe, store);

  let cwd = "";
  assert.doesNotThrow(() => {
    cwd = selection.resolveCwd("/fallback/serve-root");
  });
  assert.equal(cwd, "/fallback/serve-root");
});

test("resolveCwd: a now-non-git directory that was previously selected also falls back", () => {
  const probe = makeValidatedProbe();
  const store = new FakeSelectionStore();
  // Simulate the .git directory having been removed since selection.
  probe.set(VALID_REPO, { exists: true, isDirectory: true, isGitRepo: false });
  store.seed(VALID_REPO);
  const selection = new RepoSelection(probe, store);

  const cwd = selection.resolveCwd("/fallback/serve-root");

  assert.equal(cwd, "/fallback/serve-root");
});
