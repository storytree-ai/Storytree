import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENTS_COMMAND,
  GUIDANCE_COMMAND,
  STATUS_COMMAND,
  classifyDrift,
  diagnoseExpected,
  diagnoseOrphan,
  renderDriftDiagnosis,
  type DriftDiagnosis,
} from "./projection-drift-diagnosis.js";

// ---------- WHICH SIDE MOVED (diagnosis-honesty-arc) ----------
//
// `check:agents` / `check:guidance` score a COMMITTED projection against the LIVE store, which is
// shared and concurrently written. The old message named the reader — "regenerate and commit" —
// which is right for one of the three ways this reds and actively harmful for the most common one:
// when origin/main already carries the regeneration, regenerating locally sweeps another session's
// in-flight live-store edit into this branch's commit for nothing.

const named = (label: string, side: ReturnType<typeof classifyDrift>): DriftDiagnosis => ({
  ok: true,
  mainRef: "abc1234",
  files: [{ label, side }],
});

// ---------- the classifier ----------

test("origin/main matching the store, on a file this branch never touched, means BEHIND", () => {
  assert.equal(
    classifyDrift({ label: "x", mainInSync: true, branchTouched: false }),
    "branch-behind",
  );
});

test("a stale main that this branch has not touched is the LIVE STORE moving", () => {
  assert.equal(
    classifyDrift({ label: "x", mainInSync: false, branchTouched: false }),
    "main-equally-stale",
  );
});

// THE CORRECTION THAT MATTERS. A hand-edited projection also differs from origin/main, so a
// main-vs-branch discriminator classified it BEHIND and prescribed a merge — which git would decline
// to apply over a local edit. The remedy would have looked right and done nothing: a fresh wrong
// cause, on the arc chartered to stop exactly that.
test("a file THIS BRANCH touched is never sent to merge, whatever main says", () => {
  assert.equal(
    classifyDrift({ label: "x", mainInSync: true, branchTouched: true }),
    "branch-diverged",
  );
  assert.equal(
    classifyDrift({ label: "x", mainInSync: false, branchTouched: true }),
    "branch-diverged",
  );
});

test("no copy on origin/main classifies as absent, never guessed into another side", () => {
  assert.equal(
    classifyDrift({ label: "x", mainInSync: null, branchTouched: false }),
    "absent-on-main",
  );
});

// ---------- the two-question helpers ----------

test("diagnoseExpected compares modulo EOL, so a CRLF checkout is neither a side nor a touch", () => {
  // Main carries the fresh render; this tree carries the base copy with Windows line endings.
  const projection = diagnoseExpected("x", "fresh\n", "old\r\n", "fresh\n", "old\n");
  assert.equal(projection.mainInSync, true);
  assert.equal(projection.branchTouched, false, "CRLF alone must not read as this branch's edit");
  assert.equal(classifyDrift(projection), "branch-behind");
});

test("diagnoseExpected: the sibling-race shape — main regenerated, this branch untouched", () => {
  const projection = diagnoseExpected("x", "fresh\n", "old\n", "fresh\n", "old\n");
  assert.equal(classifyDrift(projection), "branch-behind");
});

test("diagnoseExpected: main stale and this branch untouched is the live store's move", () => {
  const projection = diagnoseExpected("x", "fresh\n", "old\n", "old\n", "old\n");
  assert.equal(classifyDrift(projection), "main-equally-stale");
});

test("diagnoseExpected: a HAND-EDITED projection is the branch's, even though main is in sync", () => {
  // main == the fresh render, but this tree's copy is neither main's nor the base's: a local edit.
  const projection = diagnoseExpected("x", "fresh\n", "hand-edited\n", "fresh\n", "fresh\n");
  assert.equal(projection.mainInSync, true);
  assert.equal(projection.branchTouched, true);
  assert.equal(classifyDrift(projection), "branch-diverged");
});

test("diagnoseExpected reads a file deleted HERE but present at the base as this branch's touch", () => {
  const projection = diagnoseExpected("x", "fresh\n", null, "fresh\n", "fresh\n");
  assert.equal(projection.branchTouched, true);
});

test("diagnoseOrphan INVERTS mainInSync — main pruning the file is main being in sync", () => {
  // Main no longer carries it and the branch did not add it: merging prunes it here.
  assert.equal(classifyDrift(diagnoseOrphan("x", null, "leftover\n")), "branch-behind");
  // Main still carries it, branch did not add it: both equally stale, merging cannot help.
  assert.equal(classifyDrift(diagnoseOrphan("x", "leftover\n", "leftover\n")), "main-equally-stale");
  // Absent at the base but present here: this branch added the orphan, so it owns it.
  assert.equal(classifyDrift(diagnoseOrphan("x", null, null)), "branch-diverged");
});

// ---------- the remedy, and its ORDER ----------

test("BRANCH-BEHIND orders merge BEFORE regenerate, and says not to regenerate first", () => {
  const message = renderDriftDiagnosis(
    AGENTS_COMMAND,
    ["stale:   .claude/agents/planner.md"],
    named("stale:   .claude/agents/planner.md", "branch-behind"),
  );
  assert.match(message, /NOT YOURS/);
  assert.match(message, /origin\/main ALREADY matches the live store/);
  // The load-bearing half: the merge is step 1 and the regeneration is last.
  const merge = message.indexOf("git merge origin/main");
  const recheck = message.indexOf("pnpm check:agents");
  const regen = message.indexOf("pnpm build:agents, then commit");
  assert.ok(merge > -1 && recheck > merge, "re-check must follow the merge");
  assert.ok(regen > recheck, `regenerating must come last, got merge=${merge} regen=${regen}`);
  assert.match(message, /Do NOT run `pnpm build:agents` first/);
  assert.match(message, /sweeps another session's in-flight/);
});

test("MAIN-EQUALLY-STALE says merging cannot help, and asks for a separate attributed commit", () => {
  const message = renderDriftDiagnosis(
    GUIDANCE_COMMAND,
    ["CLAUDE.md region is stale"],
    named("CLAUDE.md region is stale", "main-equally-stale"),
  );
  assert.match(message, /THE LIVE STORE/);
  assert.match(message, /nothing newer\s+to merge/);
  assert.match(message, /Merging cannot fix these/);
  assert.match(message, /commit it SEPARATELY/);
  assert.match(message, /pnpm build:guidance/, "it names the GUIDANCE build, not the agents one");
  assert.doesNotMatch(message, /build:agents/);
  // It must not overclaim WHOSE live edit it was — the committed file is identical either way.
  assert.match(message, /cannot tell whether that live edit was a sibling session's or this session's/);
});

test("BRANCH-DIVERGED still names the branch, and points at the artifact not the projection", () => {
  const message = renderDriftDiagnosis(
    AGENTS_COMMAND,
    ["stale:   .claude/agents/planner.md"],
    named("stale:   .claude/agents/planner.md", "branch-diverged"),
  );
  assert.match(message, /YOURS/);
  assert.match(message, /changed these generated files itself/);
  assert.match(message, /storytree library artifact edit <id> --pg/);
  // Offering the merge here would be a remedy that git declines to apply over a local edit.
  assert.doesNotMatch(
    message,
    /1\. git fetch origin && git merge origin\/main/,
    "the merge must not be prescribed for a file this branch changed",
  );
});

test("a MIXED diagnosis prints BRANCH-BEHIND first — the merge can moot the rest", () => {
  const message = renderDriftDiagnosis(AGENTS_COMMAND, ["a", "b"], {
    ok: true,
    mainRef: "abc1234",
    files: [
      { label: "stale:   .claude/agents/diverged.md", side: "branch-diverged" },
      { label: "stale:   .claude/agents/behind.md", side: "branch-behind" },
    ],
  });
  const behind = message.indexOf("NOT YOURS");
  const yours = message.indexOf("WHICH SIDE MOVED: YOURS");
  assert.ok(behind > -1 && yours > -1, "both groups must be reported");
  assert.ok(behind < yours, "the merge-first group must be rendered before the branch's own");
  // Every drifted file survives into the report, grouped under the side that owns it.
  assert.match(message, /behind\.md/);
  assert.match(message, /diverged\.md/);
});

test("an unusable origin/main FAILS WIDE — the old remedy, with the reason named, never a guess", () => {
  const message = renderDriftDiagnosis(AGENTS_COMMAND, ["stale:   .claude/agents/planner.md"], {
    ok: false,
    reason: "no readable origin/main ref (fatal: ambiguous argument)",
  });
  assert.match(message, /could not be determined/);
  assert.match(message, /no readable origin\/main ref/);
  assert.match(message, /pnpm build:agents/, "the unconditional remedy is still offered");
  // Fail-wide must not silently drop the cheaper move; it suggests it without claiming it applies.
  assert.match(message, /git fetch origin && git merge origin\/main/);
  assert.doesNotMatch(message, /WHICH SIDE MOVED: (NOT )?YOURS/, "no side is asserted");
});

test("the compared origin/main ref is named, since a stale ref changes the answer", () => {
  const message = renderDriftDiagnosis(AGENTS_COMMAND, ["x"], named("x", "branch-behind"));
  assert.match(message, /compared against origin\/main @ abc1234/);
});

// THE CLASS, not the instance. Three commands compare a committed projection against a live store
// other sessions write: the two gate rungs plus `build:status --check`, whose live source is the
// work-event store rather than the agent tier. Each must prescribe ITS OWN build verb — a message
// that told a `build:status` failure to run `build:agents` would be a fresh wrong cause.
test("every entry point in the class names its own build verb, never a sibling's", () => {
  const commands = [AGENTS_COMMAND, GUIDANCE_COMMAND, STATUS_COMMAND];
  assert.equal(new Set(commands.map((c) => c.build)).size, 3, "the three build verbs are distinct");
  for (const command of commands) {
    for (const side of ["branch-behind", "main-equally-stale", "branch-diverged"] as const) {
      const message = renderDriftDiagnosis(command, ["x"], named("x", side));
      assert.match(message, new RegExp(`pnpm ${command.build.replace(/:/g, ":")}`));
      for (const other of commands.filter((c) => c.build !== command.build)) {
        assert.doesNotMatch(
          message,
          new RegExp(`pnpm ${other.build}\\b`),
          `${command.build}/${side} must not prescribe ${other.build}`,
        );
      }
    }
  }
});

test("the drift list itself is never lost, whichever branch renders", () => {
  for (const diagnosis of [
    named("stale:   .claude/agents/planner.md", "branch-behind"),
    named("stale:   .claude/agents/planner.md", "main-equally-stale"),
    named("stale:   .claude/agents/planner.md", "branch-diverged"),
    named("stale:   .claude/agents/planner.md", "absent-on-main"),
    { ok: false, reason: "detached" } as DriftDiagnosis,
  ]) {
    const message = renderDriftDiagnosis(
      AGENTS_COMMAND,
      ["stale:   .claude/agents/planner.md"],
      diagnosis,
    );
    assert.match(message, /planner\.md/);
  }
});
