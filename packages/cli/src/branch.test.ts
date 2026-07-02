import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { PresenceDeclarationDoc } from "@storytree/notice-board";
import type { PresenceStoreLike } from "@storytree/drive";

import { branchNext, type BranchDeps } from "./branch.js";
import { run } from "./commands.js";

/**
 * Offline tests for `storytree branch next` (ADR-0142: a branch dies on merge) — the whole flow
 * runs over an injected `runGit` fake (the deriveIdentity seam pattern), so no repo, network, or
 * real git is touched. The fake models one repo state; every git invocation is recorded so the
 * tests can assert what the command DID (or refused to do), not just what it printed.
 */

interface RepoState {
  branch?: string;
  porcelain?: string;
  fetchFails?: boolean;
  headSha?: string;
  mainSha?: string;
  /** origin/<branch> exists after fetch --prune. */
  remoteRef?: boolean;
  /** HEAD is an ancestor of origin/main. */
  ancestor?: boolean;
  /** The origin/main merge-commit subject naming the branch ("" = none). */
  mergeSubject?: string;
  /** Local/remote refs a generated candidate name may collide with. */
  takenNames?: readonly string[];
  aheadCount?: string;
  switchFails?: boolean;
}

function fakeGit(state: RepoState): { runGit: (args: readonly string[]) => string; calls: string[][] } {
  const calls: string[][] = [];
  const branch = state.branch ?? "claude/old-branch-abc123";
  const taken = new Set(state.takenNames ?? []);
  const runGit = (args: readonly string[]): string => {
    calls.push([...args]);
    const key = args.join(" ");
    if (key === "rev-parse --abbrev-ref HEAD") return branch;
    if (key === "status --porcelain") return state.porcelain ?? "";
    if (key === "fetch origin --prune") {
      if (state.fetchFails === true) throw new Error("could not resolve host");
      return "";
    }
    if (key === "rev-parse refs/remotes/origin/main") return state.mainSha ?? "mainsha0000000";
    if (key === "rev-parse HEAD") return state.headSha ?? "headsha0000000";
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const ref = args[3] ?? "";
      if (ref === `refs/remotes/origin/${branch}`) {
        if (state.remoteRef === true) return "remotesha";
        throw new Error("unknown revision");
      }
      // Candidate-name collision probes (refs/heads/<c> and refs/remotes/origin/<c>).
      const name = ref.replace(/^refs\/(heads|remotes\/origin)\//, "");
      if (taken.has(name)) return "takensha";
      throw new Error("unknown revision");
    }
    if (key === "merge-base --is-ancestor HEAD refs/remotes/origin/main") {
      if (state.ancestor === true) return "";
      throw new Error("exit 1");
    }
    if (args[0] === "log") return state.mergeSubject ?? "";
    if (args[0] === "rev-list") return state.aheadCount ?? "3";
    if (args[0] === "switch") {
      if (state.switchFails === true) throw new Error("switch failed");
      return "";
    }
    throw new Error(`fakeGit: unexpected git ${key}`);
  };
  return { runGit, calls };
}

function deps(state: RepoState, extra?: Partial<BranchDeps>): BranchDeps & { calls: string[][] } {
  const { runGit, calls } = fakeGit(state);
  return {
    runGit,
    generateName: () => "claude/fresh-name-facade",
    presence: null,
    identity: null,
    redeclare: null,
    ...extra,
    calls,
  };
}

/** The classic post-merge state: PR merged (merge commit on origin/main), remote branch deleted. */
const MERGED: RepoState = {
  ancestor: true,
  remoteRef: false,
  mergeSubject: "Merge pull request #534 from HuaMick/claude/old-branch-abc123",
};

test("branch next: a merged branch (merge evidence + remote gone) is cut over to a fresh branch", async () => {
  const d = deps(MERGED);
  const env = await branchNext(d);
  assert.equal(env.ok, true);
  assert.match(env.body, /BRANCH DEAD — "claude\/old-branch-abc123"/);
  assert.match(env.body, /ADR-0142/);
  assert.match(env.body, /Merge pull request #534/);
  assert.match(env.body, /origin\/claude\/old-branch-abc123 gone \(deleted on merge\)/);
  assert.match(env.body, /cut \+ switched to "claude\/fresh-name-facade" from origin\/main/);
  // The switch really ran, from origin/main, without tracking it.
  const switchCall = d.calls.find((c) => c[0] === "switch");
  assert.deepEqual(switchCall, [
    "switch", "--no-track", "-c", "claude/fresh-name-facade", "refs/remotes/origin/main",
  ]);
  // Offline (no presence store): the re-declare is the printed next step, with the wisp rationale.
  const next = (env.next ?? []).join("\n");
  assert.match(next, /storytree noticeboard declare --working-on "<what>" --node <story-id> --pg/);
  assert.match(next, /git push -u origin HEAD/);
});

test("branch next: strict-ancestor alone (no merge subject, remote still present) also reads dead", async () => {
  const d = deps({ ancestor: true, remoteRef: true, mergeSubject: "" });
  const env = await branchNext(d);
  assert.equal(env.ok, true);
  assert.match(env.body, /every commit on "claude\/old-branch-abc123" is already in origin\/main/);
  assert.match(env.body, /origin\/claude\/old-branch-abc123 still present/);
  assert.ok(d.calls.some((c) => c[0] === "switch"));
});

test("branch next: merge evidence at tip == origin/main (reused branch reset to main) still reads dead", async () => {
  // The observed trap: after the merge the session ran `git merge origin/main` on the dead branch —
  // tip equals origin/main, but the NAME already landed, so the guard would refuse any PR from it.
  const d = deps({
    headSha: "same000", mainSha: "same000",
    remoteRef: false, ancestor: true,
    mergeSubject: "Merge pull request #534 from HuaMick/claude/old-branch-abc123",
  });
  const env = await branchNext(d);
  assert.equal(env.ok, true);
  assert.match(env.body, /BRANCH DEAD/);
  assert.ok(d.calls.some((c) => c[0] === "switch"));
});

test("branch next: an alive branch (unlanded commits) is refused, nothing switched", async () => {
  const d = deps({ ancestor: false, remoteRef: true, mergeSubject: "", aheadCount: "2" });
  const env = await branchNext(d);
  assert.equal(env.ok, false);
  assert.match(env.body, /"claude\/old-branch-abc123" is ALIVE — 2 commit\(s\) not yet in origin\/main/);
  assert.ok(!d.calls.some((c) => c[0] === "switch"), "no switch on an alive branch");
});

test("branch next: a fresh cut (tip == origin/main, no landed PR) is a clean no-op", async () => {
  const d = deps({ headSha: "same000", mainSha: "same000", remoteRef: false, ancestor: true, mergeSubject: "" });
  const env = await branchNext(d);
  assert.equal(env.ok, true);
  assert.match(env.body, /already a fresh cut of origin\/main/);
  assert.ok(!d.calls.some((c) => c[0] === "switch"), "no switch when already fresh");
});

test("branch next: refusals — dirty tree, detached HEAD, trunk, failed fetch", async () => {
  const dirty = await branchNext(deps({ ...MERGED, porcelain: " M packages/cli/src/branch.ts" }));
  assert.equal(dirty.ok, false);
  assert.match(dirty.body, /working tree is dirty/);

  const detached = await branchNext(deps({ ...MERGED, branch: "HEAD" }));
  assert.equal(detached.ok, false);
  assert.match(detached.body, /detached HEAD/);

  const trunk = await branchNext(deps({ ...MERGED, branch: "main" }));
  assert.equal(trunk.ok, false);
  assert.match(trunk.body, /the trunk never dies/);

  const offline = await branchNext(deps({ ...MERGED, fetchFails: true }));
  assert.equal(offline.ok, false);
  assert.match(offline.body, /could not fetch origin/);
});

test("branch next: a name collision draws again until a free candidate", async () => {
  const names = ["claude/taken-one", "claude/taken-two", "claude/free-three"];
  let i = 0;
  const d = deps(
    { ...MERGED, takenNames: ["claude/taken-one", "claude/taken-two"] },
    { generateName: () => names[i++] ?? "claude/overflow" },
  );
  const env = await branchNext(d);
  assert.equal(env.ok, true);
  assert.match(env.body, /cut \+ switched to "claude\/free-three"/);
});

test("branch next: with a wired presence store, the session's declaration is re-taken via the redeclare seam", async () => {
  const doc: PresenceDeclarationDoc = {
    sessionId: "determined-lederberg-2657ea",
    branch: "claude/old-branch-abc123",
    workingOn: "branch-next ergonomics",
    nodes: ["library-cli"],
    status: "active",
    startedAt: "2026-07-02T00:00:00.000Z",
    lastSeenAt: "2026-07-02T00:00:00.000Z",
  };
  const presence: PresenceStoreLike = {
    declare: async (d) => d,
    done: async () => null,
    listActive: async () => [doc],
    history: async () => [],
  };
  const redeclares: Array<{ workingOn: string; nodes: readonly string[] }> = [];
  const env = await branchNext(
    deps(MERGED, {
      presence,
      identity: { sessionId: "determined-lederberg-2657ea", branch: "claude/old-branch-abc123" },
      redeclare: async (args) => {
        redeclares.push(args);
        return { ok: true, body: 'Declared presence for session "determined-lederberg-2657ea".' };
      },
    }),
  );
  assert.equal(env.ok, true);
  // Re-declared with the SAME working-on + nodes the dead branch held — the wisp re-lights.
  assert.deepEqual(redeclares, [{ workingOn: "branch-next ergonomics", nodes: ["library-cli"] }]);
  assert.match(env.body, /re-declared presence on the fresh branch/);
  // No manual declare next-line needed once the re-declare succeeded.
  assert.doesNotMatch((env.next ?? []).join("\n"), /noticeboard declare --working-on/);
});

test("branch next: presence wired but no active declaration → the printed declare next-step remains", async () => {
  const presence: PresenceStoreLike = {
    declare: async (d) => d,
    done: async () => null,
    listActive: async () => [],
    history: async () => [],
  };
  const env = await branchNext(
    deps(MERGED, {
      presence,
      identity: { sessionId: "determined-lederberg-2657ea", branch: "claude/old-branch-abc123" },
      redeclare: async () => ({ ok: true, body: "unreached" }),
    }),
  );
  assert.equal(env.ok, true);
  assert.match((env.next ?? []).join("\n"), /noticeboard declare --working-on "<what>"/);
});

test("branch next: a re-declare failure never un-cuts the branch (fail-soft, surfaced loudly)", async () => {
  const doc: PresenceDeclarationDoc = {
    sessionId: "s1", branch: "claude/old-branch-abc123", workingOn: "w",
    nodes: [], status: "active",
    startedAt: "2026-07-02T00:00:00.000Z", lastSeenAt: "2026-07-02T00:00:00.000Z",
  };
  const presence: PresenceStoreLike = {
    declare: async (d) => d,
    done: async () => null,
    listActive: async () => [doc],
    history: async () => [],
  };
  const env = await branchNext(
    deps(MERGED, {
      presence,
      identity: { sessionId: "s1", branch: "claude/old-branch-abc123" },
      redeclare: async () => {
        throw new Error("pool closed");
      },
    }),
  );
  assert.equal(env.ok, true, "the cut succeeded — a board hiccup never fails it");
  assert.match(env.body, /re-declare FAILED \(pool closed\)/);
  assert.match((env.next ?? []).join("\n"), /noticeboard declare --working-on "w"/);
});

// ---------------------------------------------------------------------------
// Dispatch (through run(), as main wires it)
// ---------------------------------------------------------------------------

test("dispatch: `branch` help + unknown sub are guidance; `branch next` threads the injected seams", async () => {
  const store = new InMemoryStore();

  const help = await run(["branch"], { store });
  assert.equal(help.ok, true);
  assert.match(help.body, /storytree branch next \[--pg\]/);
  assert.match(help.body, /ADR-0142/);

  const unknown = await run(["branch", "wat"], { store });
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown branch command "wat"/);

  const { runGit, calls } = fakeGit(MERGED);
  const env = await run(["branch", "next"], {
    store,
    branch: { runGit, generateName: () => "claude/threaded-seam-000000" },
    presence: { identity: { sessionId: "s1", branch: "claude/old-branch-abc123" } },
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /cut \+ switched to "claude\/threaded-seam-000000"/);
  assert.ok(calls.some((c) => c[0] === "switch"));
});
