import test from "node:test";
import assert from "node:assert/strict";

import { branchOfActor, cliActorFor, CLI_ACTOR_PREFIX } from "./cli-actor.js";
import type { DriftAttributionEvidence } from "./corpus-content-attribution.js";
import type { AbsenceEvidence } from "./corpus-content-attribution.js";
import { attributeDrift, classifyAbsence } from "./corpus-content-attribution.js";

/**
 * Who a seed↔live drift is charged to (ADR-0290). Pure — the classifier takes measured evidence, so
 * every case is testable without a DB, a git repo, or a live store.
 *
 * THE RED→GREEN PAIR is the measured defect itself: a branch identical to `origin/main`, with a clean
 * working tree and no live writes, was blocked on 2026-08-02 by three artifacts it had not touched
 * (`friction-adjudication`, `merge-ceremony`, `the-same-file-in-another-tree-is-a-different-file`).
 * The first test replays that population and asserts nothing is charged. Everything after it exists so
 * the fix cannot be mistaken for a blanket excuse: the two authoring paths still charge, and an
 * unmeasurable attribution charges everything rather than passing.
 */

const BRANCH = "claude/sleepy-northcutt-4d5383";
const SIBLING = "claude/some-other-session";

function evidence(over: Partial<DriftAttributionEvidence> = {}): DriftAttributionEvidence {
  return {
    branch: BRANCH,
    seedChangedByBranch: new Set<string>(),
    liveWrittenByBranch: new Set<string>(),
    reconciledOnMain: new Set<string>(),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The defect, replayed
// ---------------------------------------------------------------------------

test("RED→GREEN: a branch at origin/main with a clean tree is charged NOTHING (the measured defect)", () => {
  // Measured 2026-08-02 on claude/sleepy-northcutt-4d5383 before ADR-0290 landed: HEAD == origin/main
  // (`git rev-list --left-right --count origin/main...HEAD` → `0 0`), working tree clean, zero commits,
  // zero live writes — and `check:corpus-content` exited 1 with `3 value-drift`. The seed is a
  // per-branch surface and the live store is shared, so the check was charging a machine-shared total
  // to whoever gated next. Six sessions filed that independently rather than as reinforcements.
  const drifted = [
    "friction-adjudication",
    "merge-ceremony",
    "the-same-file-in-another-tree-is-a-different-file",
  ];
  const a = attributeDrift(drifted, evidence());

  assert.deepEqual(a.authored, [], "nothing is charged to a branch that authored nothing");
  assert.equal(a.foreign.length, 3, "…and nothing is dropped either — all three are reported");
  assert.deepEqual(
    a.foreign.map((d) => d.id),
    drifted,
  );
  for (const d of a.foreign) {
    assert.equal(d.owner, "foreign");
    assert.match(d.because, /another writer/, "each carries the reason it is not yours");
  }
});

// ---------------------------------------------------------------------------
// The two authoring paths — either one alone would leave a hole
// ---------------------------------------------------------------------------

test("CHARGED: a branch that edited the SEED entry owns the drift (the git signal)", () => {
  const a = attributeDrift(["merge-ceremony", "deep-modules"], evidence({
    seedChangedByBranch: new Set(["deep-modules"]),
  }));
  assert.deepEqual(a.authored.map((d) => d.id), ["deep-modules"]);
  assert.match(a.authored[0]?.because ?? "", new RegExp(BRANCH));
  assert.match(a.authored[0]?.because ?? "", /seed entry/);
  assert.deepEqual(a.foreign.map((d) => d.id), ["merge-ceremony"]);
});

test("CHARGED: a branch that wrote the LIVE body last owns the drift (the event-log signal)", () => {
  // This is the case a pure git differential CANNOT see, and it is the ceremony's normal direction
  // (ADR-0023: live is the edit surface). Drop this signal and the check stops catching the exact
  // thing it exists for — a session that edits live and forgets to export.
  const a = attributeDrift(["merge-ceremony", "deep-modules"], evidence({
    liveWrittenByBranch: new Set(["merge-ceremony"]),
  }));
  assert.deepEqual(a.authored.map((d) => d.id), ["merge-ceremony"]);
  assert.match(a.authored[0]?.because ?? "", /live body last/);
  assert.deepEqual(a.foreign.map((d) => d.id), ["deep-modules"]);
});

// ---------------------------------------------------------------------------
// Staleness — the mechanism that falsified the family's first filing
// ---------------------------------------------------------------------------

test("STALE: drift origin/main has ALREADY reconciled is a merge, not an export", () => {
  // The reinforcement that corrected `a-drain-ceiling-a-sibling-breached-...`: the branch was 12
  // commits behind origin/main, main's seed ALREADY carried the body live held, and materialising
  // main's seed in place produced `OK — every seed body matches live across 177 export-scope
  // artifacts`, exit 0. Following the check's printed export remedy there authors a duplicate of a
  // hunk already on main, so the two cases must not print the same instruction.
  const a = attributeDrift(["merge-ceremony"], evidence({
    reconciledOnMain: new Set(["merge-ceremony"]),
  }));
  assert.deepEqual(a.stale.map((d) => d.id), ["merge-ceremony"]);
  assert.deepEqual(a.authored, [], "being behind main is not authorship");
  assert.deepEqual(a.foreign, [], "…and it is distinguished from a sibling's undrained edit");
  assert.match(a.stale[0]?.because ?? "", /origin\/main/);
});

test("PRECEDENCE: authorship beats staleness — a branch that REVERTED main's export still owns it", () => {
  // Order matters and the wrong order silently excuses real work: if a branch changed the seed entry
  // of an artifact whose live body main already matches, it has reverted main's export. Checking
  // staleness first would file that under "just merge", and the revert would land unreconciled.
  const a = attributeDrift(["merge-ceremony"], evidence({
    seedChangedByBranch: new Set(["merge-ceremony"]),
    reconciledOnMain: new Set(["merge-ceremony"]),
  }));
  assert.deepEqual(a.authored.map((d) => d.id), ["merge-ceremony"]);
  assert.deepEqual(a.stale, []);
});

// ---------------------------------------------------------------------------
// The fail-closed fallback
// ---------------------------------------------------------------------------

test("FAIL-CLOSED: an unmeasurable attribution charges EVERYTHING — never a pass", () => {
  // The asymmetry of harm, pinned. A wrongly-charged red costs a merge or a routed report; a wrongly-
  // excused red lands a one-sided edit that no LATER gate catches either, because the next session's
  // check would excuse it as foreign too. So an attribution that could not be measured falls back to
  // the pre-ADR-0290 behaviour — charge the lot — and says why.
  const a = attributeDrift(["a", "b", "c"], evidence({ unattributable: "no origin/main ref" }));
  assert.equal(a.authored.length, 3);
  assert.deepEqual(a.stale, []);
  assert.deepEqual(a.foreign, []);
  assert.equal(a.unattributable, "no origin/main ref");
  for (const d of a.authored) assert.match(d.because, /unmeasured — charged, not excused/);
});

test("FAIL-CLOSED: the fallback ignores the partial signals rather than half-trusting them", () => {
  // A half-read evidence set is not better than none: if the event log could not be read, the git set
  // alone would charge seed edits and silently excuse every live edit — the one direction that matters
  // most. So `unattributable` short-circuits BEFORE either set is consulted.
  const a = attributeDrift(["a", "b"], evidence({
    seedChangedByBranch: new Set(["a"]),
    reconciledOnMain: new Set(["b"]),
    unattributable: "the live event log could not be read",
  }));
  assert.equal(a.authored.length, 2, "both charged, including the one main had reconciled");
  assert.deepEqual(a.stale, []);
});

test("a null branch still renders a readable reason", () => {
  // `branch: null` reaches the classifier only alongside `unattributable`, but the message must not
  // interpolate "null" if that pairing is ever loosened.
  const a = attributeDrift(["a"], evidence({ branch: null, seedChangedByBranch: new Set(["a"]) }));
  assert.match(a.authored[0]?.because ?? "", /this branch changed its seed entry/);
});

test("an empty drift list attributes to three empty lists", () => {
  const a = attributeDrift([], evidence());
  assert.deepEqual(a.authored, []);
  assert.deepEqual(a.stale, []);
  assert.deepEqual(a.foreign, []);
  assert.equal(a.unattributable, undefined);
});

// ---------------------------------------------------------------------------
// The stamp the live signal reads — format and parse must be one pair
// ---------------------------------------------------------------------------

test("STAMP: the actor format round-trips, and only a stamped actor names a branch", () => {
  // The write side and the read side are the same two functions on purpose. If they ever disagreed,
  // every live edit would silently become unattributed — which fails OPEN on the live axis (the
  // classifier would call a session's own edit foreign) and is therefore the failure worth pinning.
  assert.equal(cliActorFor(BRANCH), `${CLI_ACTOR_PREFIX}${BRANCH}`);
  assert.equal(branchOfActor(cliActorFor(BRANCH)), BRANCH);
  assert.notEqual(branchOfActor(cliActorFor(SIBLING)), BRANCH, "a sibling's stamp is not yours");

  // Everything else is UNATTRIBUTED, which is not the same as "not yours" — the caller decides. These
  // are the real values already in `events.library_event`.
  for (const actor of ["cli", "system", "corpus-migration", "someone@example.com", CLI_ACTOR_PREFIX]) {
    assert.equal(branchOfActor(actor), null, `${actor} names no branch`);
  }
});

test("STAMP: an unattributed live write is charged to nobody, so pre-stamp history cannot red a session", () => {
  // The migration property. Every live row written before ADR-0290 carries the constant `"cli"`, so no
  // branch matches it and the whole pre-existing backlog reports as foreign rather than landing on the
  // first session to gate after the stamp ships. That is the correct direction: nobody currently
  // gating authored those edits.
  const legacyWriters = new Map([
    ["merge-ceremony", { actor: "cli", at: "2026-07-30T00:00:00.000Z" }],
    ["friction-adjudication", { actor: "system", at: "2026-07-31T00:00:00.000Z" }],
    ["deep-modules", { actor: cliActorFor(BRANCH), at: "2026-08-02T00:00:00.000Z" }],
  ]);
  const mine = new Set(
    [...legacyWriters.entries()].filter(([, w]) => branchOfActor(w.actor) === BRANCH).map(([id]) => id),
  );
  assert.deepEqual([...mine], ["deep-modules"]);

  const a = attributeDrift([...legacyWriters.keys()], evidence({ liveWrittenByBranch: mine }));
  assert.deepEqual(a.authored.map((d) => d.id), ["deep-modules"]);
  assert.deepEqual(a.foreign.map((d) => d.id), ["merge-ceremony", "friction-adjudication"]);
});

// ---------------------------------------------------------------------------
// check:corpus-sync — classifying WHY an artifact is absent (the widened half)
// ---------------------------------------------------------------------------

/**
 * WHY an artifact is absent from live, before a remedy is prescribed. Pure, like the drift half above.
 *
 * THE RED→GREEN PAIR is the measured harm: `oq-diff-view-altitude` was retired live under ADR-0267 D5
 * and the check's one unconditional remedy told stale sessions to `sync-corpus` it back, four times
 * over (`events.library_event` created 1472 → deleted 2694 → created 2695 → deleted 2696 → created
 * 2698 → deleted 2702 → created 2742 → deleted 2756). The first test replays that shape and asserts it
 * is neither charged nor drained. Everything after exists so the fix cannot become a blanket excuse:
 * a genuine graduation still charges, and an unmeasurable cause charges everything.
 */

const RETIRE = { actor: "cli@claude/curator", at: "2026-07-29T16:40:19.256Z" };

function absenceEvidence(over: Partial<AbsenceEvidence> = {}): AbsenceEvidence {
  return {
    branch: BRANCH,
    seedAddedByBranch: new Set<string>(),
    retiredLive: new Map<string, { actor: string; at: string }>(),
    absentFromMainSeed: new Set<string>(),
    ...over,
  };
}

test("RED→GREEN: a RETIRED-LIVE artifact is reported with its retiring event, never charged and never drained", () => {
  // The defect, replayed: before this, `oq-diff-view-altitude` was one undifferentiated seed-only id
  // and the gate's own printed remedy resurrected it.
  const a = classifyAbsence(["oq-diff-view-altitude"], absenceEvidence({
    retiredLive: new Map([["oq-diff-view-altitude", RETIRE]]),
  }));
  assert.deepEqual(a.neverMigrated, [], "nothing is charged");
  assert.deepEqual(a.retiredLive.map((x) => x.id), ["oq-diff-view-altitude"]);
  assert.match(a.retiredLive[0]!.because, /retired live by cli@claude\/curator/, "the retiring event is named");
  assert.match(a.retiredLive[0]!.because, /never by syncing/);
});

test("a retirement whose seed row main has ALREADY dropped carries the merge remedy too", () => {
  // Both signals are routinely true at once (a retirement drops the seed row on main, so a stale
  // branch sees both). The label answers WHY; the `because` still hands over the action.
  const a = classifyAbsence(["oq-diff-view-altitude"], absenceEvidence({
    retiredLive: new Map([["oq-diff-view-altitude", RETIRE]]),
    absentFromMainSeed: new Set(["oq-diff-view-altitude"]),
  }));
  assert.equal(a.retiredLive.length, 1);
  assert.match(a.retiredLive[0]!.because, /merging main clears this/);
  assert.deepEqual(a.neverMigrated, []);
});

test("BEHIND MAIN: a row origin/main has dropped is not this branch's gap — merge, never sync", () => {
  const a = classifyAbsence(["retire-generated-assets-json"], absenceEvidence({
    absentFromMainSeed: new Set(["retire-generated-assets-json"]),
  }));
  assert.deepEqual(a.neverMigrated, [], "not charged");
  assert.deepEqual(a.behindMain.map((x) => x.id), ["retire-generated-assets-json"]);
});

test("NEVER MIGRATED still charges: an ordinary migration gap is unchanged by the classification", () => {
  const a = classifyAbsence(["freshly-graduated"], absenceEvidence());
  assert.deepEqual(a.neverMigrated.map((x) => x.id), ["freshly-graduated"]);
  assert.match(a.neverMigrated[0]!.because, /never migrated/);
});

test("AUTHORED WINS: a graduation THIS BRANCH added is charged even though main does not carry it either", () => {
  // The step that makes a bare main-differential wrong. Main does not carry a brand-new graduation
  // either, so testing only "absent from main's seed" would excuse every genuine migration gap as
  // staleness — silently switching the check off in its main direction.
  const a = classifyAbsence(["my-new-principle"], absenceEvidence({
    seedAddedByBranch: new Set(["my-new-principle"]),
    absentFromMainSeed: new Set(["my-new-principle"]),
  }));
  assert.deepEqual(a.neverMigrated.map((x) => x.id), ["my-new-principle"], "charged, not excused as stale");
  assert.match(a.neverMigrated[0]!.because, /added it to the seed/);
  assert.deepEqual(a.behindMain, []);
});

test("FAIL-CLOSED: an unmeasurable cause charges every absence and says why (ADR-0290 D7)", () => {
  // A wrongly-charged red costs a merge; a wrongly-excused one lands a one-sided edit no later gate
  // catches. So an unreadable signal degrades to the PRE-classification behaviour, never to a pass —
  // including for ids the other signals would otherwise have excused.
  const a = classifyAbsence(["a", "b", "c"], absenceEvidence({
    retiredLive: new Map([["a", RETIRE]]),
    absentFromMainSeed: new Set(["b"]),
    unattributable: "the live event log could not be read, so no retirement can be seen",
  }));
  assert.deepEqual(a.neverMigrated.map((x) => x.id), ["a", "b", "c"], "everything charged");
  assert.deepEqual(a.retiredLive, []);
  assert.deepEqual(a.behindMain, []);
  assert.equal(a.unattributable, "the live event log could not be read, so no retirement can be seen");
  for (const x of a.neverMigrated) assert.match(x.because, /charged, not excused/);
});

test("a mixed population splits three ways, and only the gap is charged", () => {
  const a = classifyAbsence(["gap", "retired", "stale", "mine"], absenceEvidence({
    seedAddedByBranch: new Set(["mine"]),
    retiredLive: new Map([["retired", RETIRE]]),
    absentFromMainSeed: new Set(["stale"]),
  }));
  assert.deepEqual(a.neverMigrated.map((x) => x.id), ["gap", "mine"]);
  assert.deepEqual(a.retiredLive.map((x) => x.id), ["retired"]);
  assert.deepEqual(a.behindMain.map((x) => x.id), ["stale"]);
});
