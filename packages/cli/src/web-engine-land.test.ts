import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIRTY_PATHS_SHOWN,
  WEB_MERGE_METHOD,
  pinAfterMerge,
  planLanding,
  type LandState,
} from "./web-engine-land.js";

/** A healthy world with work to do: the mirror has drifted and everything else is in order. */
function state(over: Partial<LandState> = {}): LandState {
  return {
    webCheckedOut: true,
    ghAuthenticated: true,
    drifted: true,
    pin: "861ebfb027b31c238b594570df5506d176426abc",
    webMain: "861ebfb027b31c238b594570df5506d176426abc",
    webHead: "861ebfb027b31c238b594570df5506d176426abc",
    headOnWebMain: true,
    parentDirtyPaths: [],
    commitIdentity: { name: "HuaMick", email: "hua.mick@gmail.com" },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// THE BRANCH BASE — the one decision this module exists for.
// ---------------------------------------------------------------------------

test("abbreviates the commits it names, so the sentence stays readable", () => {
  // The operator reads this line to decide whether to trust the base. A full 40-character sha twice
  // in one sentence is the difference between a reason and a wall of hex — and an abbreviation that
  // silently stopped abbreviating would still "work".
  const webMain = "9f4a147aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const plan = planLanding(state({ webMain }));
  const message = plan.kind === "sync-and-open" ? plan.message : "";
  assert.match(message, /9f4a147a/, "the short form is what appears");
  assert.ok(!message.includes(webMain), "and the full sha is not also printed");
  assert.ok(!message.includes(state().pin), "neither is the pin's");
});

test("branches from the PIN even when web main has moved past it", () => {
  // The measured trap (2026-09-06, storytree-web#120): web `main` was six commits past the pin and
  // carried a sibling's already-PUBLISHED engine sync. A branch cut from `main` and re-synced from
  // this checkout rewrote 12 files where six were the author's — the other six silently reverted
  // the sibling's published work. Cutting from the pin means the sync touches only the files this
  // change actually moves.
  const plan = planLanding(state({ webMain: "9f4a147aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  assert.equal(plan.kind, "sync-and-open");
  assert.equal(plan.reason, "main-ahead-of-pin");
  assert.equal(plan.kind === "sync-and-open" && plan.base, state().pin);
  assert.match(
    plan.kind === "sync-and-open" ? plan.message : "",
    /AHEAD of the pin/,
    "when main has moved the reason must SAY so — the base is the same either way, so a caller " +
      "reading the plan can otherwise not tell the dangerous day from the safe one",
  );
});

test("branches from the pin on the ordinary day too, and says why it is stated as an invariant", () => {
  // The rule has to be unconditional to be worth anything. A base chosen from `main` is correct on
  // every day except the one where main has moved — which is exactly the shape of a rule that gets
  // written down, forgotten, and then costs a published revert.
  const plan = planLanding(state());
  assert.equal(plan.kind, "sync-and-open");
  assert.equal(plan.reason, "pin-is-main");
  assert.equal(plan.kind === "sync-and-open" && plan.base, state().pin);
  assert.match(
    plan.kind === "sync-and-open" ? plan.message : "",
    /the same commit/,
    "the safe day must be DISTINGUISHABLE from the dangerous one in what the verb prints, or a " +
      "reader cannot tell which rule was applied",
  );
});

// ---------------------------------------------------------------------------
// REFUSING, AND REFUSING IN THE RIGHT ORDER.
// ---------------------------------------------------------------------------

test("refuses when there is no git identity to commit the website branch with", () => {
  // ⚠ FOUND BY RUNNING THE VERB, not by reading it. A freshly-initialised submodule inherits
  // NEITHER user.name nor user.email from its parent, and git refuses to auto-detect one from the
  // hostname. Without this check the ceremony died at the COMMIT — three steps in, with the branch
  // cut and 57 files rewritten — which is the precise failure the up-front refusals exist to
  // prevent, and the verb's own design claimed to have prevented.
  const plan = planLanding(state({ commitIdentity: null }));
  assert.equal(plan.kind, "refuse");
  assert.equal(plan.reason, "no-git-identity");
  assert.match(
    plan.kind === "refuse" ? plan.message : "",
    /inherits NEITHER/,
    "the refusal must say WHY the submodule has no identity, or the reader sets it globally and " +
      "wonders why it did not take",
  );
});

test("carries the identity on the PLAN, so the shell cannot reach for a different one", () => {
  // The refusal above is only worth having if the value it guarded is the value actually used. A
  // shell that re-read the config for itself could refuse against one answer and commit with
  // another.
  const identity = { name: "Someone Else", email: "else@example.com" };
  const plan = planLanding(state({ commitIdentity: identity }));
  assert.equal(plan.kind, "sync-and-open");
  assert.deepEqual(plan.kind === "sync-and-open" ? plan.identity : null, identity);
});

test("refuses when web/ is not checked out, rather than acting on the parent repo by accident", () => {
  const plan = planLanding(state({ webCheckedOut: false }));
  assert.equal(plan.kind, "refuse");
  assert.equal(plan.reason, "no-web-checkout");
  assert.match(plan.kind === "refuse" ? plan.message : "", /submodule update --init web/);
  // The reason must name the failure mode, because the symptom is a command that SUCCEEDS: an empty
  // submodule dir resolves up to the parent, so git answers about the wrong repository.
  assert.match(plan.kind === "refuse" ? plan.message : "", /resolves UP to the parent/);
});

test("refuses a dirty parent tree — the pin must not record sources that may never land", () => {
  const plan = planLanding(state({ parentDirtyPaths: ["packages/forest-world/src/scene.ts"] }));
  assert.equal(plan.kind, "refuse");
  assert.equal(plan.reason, "parent-dirty");
  assert.match(plan.kind === "refuse" ? plan.message : "", /may never land/);
  assert.match(
    plan.kind === "refuse" ? plan.message : "",
    /packages\/forest-world\/src\/scene\.ts/,
    "the refusal names the paths, or the author has to go and find them",
  );
});

test("a dirty tree of many paths names a few and COUNTS the rest, rather than printing all of them", () => {
  const many = Array.from({ length: 9 }, (_, i) => `packages/forest-world/src/f${i}.ts`);
  const plan = planLanding(state({ parentDirtyPaths: many }));
  assert.equal(plan.kind, "refuse");
  const message = plan.kind === "refuse" ? plan.message : "";
  assert.match(message, /and 4 more/);
  assert.ok(!message.includes("f8.ts"), "the tail is counted, not listed");
});

test("the list/count boundary is EXACT — at the limit it lists, one past it counts", () => {
  // Pinned at the boundary rather than well past it. A `>` that drifted to `>=` (or the reverse)
  // changes only the message on ONE input size, so a test using nine paths cannot see it — and the
  // observable is a refusal that says "and 0 more", which reads like a bug in something else.
  const at = Array.from({ length: DIRTY_PATHS_SHOWN }, (_, i) => `f${i}.ts`);
  const atPlan = planLanding(state({ parentDirtyPaths: at }));
  const atMessage = atPlan.kind === "refuse" ? atPlan.message : "";
  // Asserted as the exact TAIL, not as "does not contain 'more'": the branch that appends the count
  // is an empty string at the limit, and an empty string can be replaced by any text that happens
  // not to contain the word being looked for.
  assert.ok(
    atMessage.endsWith("f0.ts, f1.ts, f2.ts, f3.ts, f4.ts."),
    `at the limit every path is listed, comma-separated, and nothing is appended — got: ${atMessage}`,
  );

  const over = [...at, "f5.ts"];
  const overPlan = planLanding(state({ parentDirtyPaths: over }));
  const overMessage = overPlan.kind === "refuse" ? overPlan.message : "";
  assert.match(overMessage, /and 1 more/, "one past the limit counts exactly one");
  assert.ok(!overMessage.includes("f5.ts"), "and does not also list it");
});

test("the web gitlink itself never counts as a dirty path", () => {
  // The ceremony's own job is to move that gitlink, so counting it would make the verb refuse to run
  // the second time you invoked it — and the first thing an author does after a failed run is to
  // run it again.
  assert.equal(planLanding(state({ parentDirtyPaths: [] })).kind, "sync-and-open");
});

test("says NOTHING TO DO before it complains about a credential it was never going to use", () => {
  // Ordering, not politeness: a session with no `gh` credential asking "is the mirror current?" is
  // asking a question that has an answer, and refusing it teaches the author that the verb is
  // unusable rather than that the mirror is fine.
  const plan = planLanding(state({ drifted: false, ghAuthenticated: false }));
  assert.equal(plan.kind, "nothing-to-do");
  assert.equal(plan.reason, "already-current");
});

test("refuses an unauthenticated gh UP FRONT once there is real work, not halfway through it", () => {
  // The failure this prevents is not "it did not work" — it is a submodule left holding 57 rewritten
  // files with no branch pushed and no pull request opened, which is a worse state than the chore.
  const plan = planLanding(state({ ghAuthenticated: false }));
  assert.equal(plan.kind, "refuse");
  assert.equal(plan.reason, "no-gh-credential");
  assert.match(plan.kind === "refuse" ? plan.message : "", /halfway/);
});

// ---------------------------------------------------------------------------
// NOTHING TO DO, AND WHAT GETS PINNED.
// ---------------------------------------------------------------------------

test("⚠ NO DRIFT IS NOT NOTHING TO DO — a stale gitlink is a BUMP, and the verb resumes into it", () => {
  // The state a partial run leaves behind, and the reason this branch exists: the sync ran, the
  // website pull request merged, and the run died before recording the bump. Drift is measured
  // against the submodule's WORKING TREE, so it reads clean — and answering "nothing to do" there
  // would report success over a mirror this repository has not landed. `check:web-engine` cannot
  // catch it either, because it reads the same working tree; CI clones the submodule AT THE PIN and
  // is the first thing to notice. Found by running the verb into exactly this state.
  const webHead = "38f7d480aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const plan = planLanding(state({ drifted: false, webHead, headOnWebMain: true }));
  assert.equal(plan.kind, "bump-only");
  assert.equal(plan.reason, "pin-behind-web");
  assert.equal(plan.kind === "bump-only" ? plan.pinTo : "", webHead);
});

test("refuses to pin a web commit that has NOT landed on the website's main", () => {
  // The pin must be resolvable by everyone else: CI clones the submodule at it, and a fresh
  // `git clone --recurse-submodules` of this repo fails outright on a pin that only exists as some
  // session's unmerged branch tip.
  const plan = planLanding(state({
    drifted: false,
    webHead: "38f7d480aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    headOnWebMain: false,
  }));
  assert.equal(plan.kind, "refuse");
  assert.equal(plan.reason, "web-work-not-landed");
  assert.match(plan.kind === "refuse" ? plan.message : "", /NOT reachable/);
});

test("does nothing when the mirror is already current, whatever web main is doing", () => {
  // Drift is measured against the copy AT THE PIN, which is what CI compares too — so a web main
  // that has moved is not by itself a reason to sync. Pinning on main's movement would open an empty
  // pull request, and an empty pull request on that repo still PUBLISHES the site.
  for (const webMain of [state().pin, "9f4a147aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]) {
    const plan = planLanding(state({ drifted: false, webMain }));
    assert.equal(plan.kind, "nothing-to-do", `webMain ${webMain}`);
    assert.match(plan.kind === "nothing-to-do" ? plan.message : "", /nothing to sync/);
  }
});

test("pins the branch TIP after the merge — not the merge commit and not web main", () => {
  // The pin must equal this checkout's engine byte for byte. Web main may not (it can carry a
  // sibling's engine files); the tip's only delta from the old pin is this change. `--merge` keeps
  // the tip reachable from main, so the lineage probe still flips true.
  const tip = "ca6b3be1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(pinAfterMerge(tip), tip);
});

test("the web merge method is --merge, and a squash or rebase would dangle the pin", () => {
  // Pinned as a value rather than trusted as prose: a squash or rebase rewrites the branch's commits
  // into new ones, so the commit the parent pins stops existing and a fresh
  // `git clone --recurse-submodules` of the parent fails outright.
  assert.equal(WEB_MERGE_METHOD, "--merge");
  assert.notEqual(WEB_MERGE_METHOD as string, "--squash");
  assert.notEqual(WEB_MERGE_METHOD as string, "--rebase");
});
