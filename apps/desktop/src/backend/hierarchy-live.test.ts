// THE DESKTOP MAP'S SOURCE SELECTION, AND THE INCIDENT ITSELF (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// WHAT IT PINS: which source answers the map's QUESTION, and whether a degradation can happen without
// anyone finding out. The fold itself is proven elsewhere (the library's own suite, and the studio's
// `hierarchyLiveRead.test.ts` which drives one tree through both readers and compares field for
// field). What lives here is the selection, the runtime cache, and the announcement.
//
// The last case is the increment's stated acceptance shape: an app built at an OLD commit paints a
// re-worded criterion GREEN without a rebuild. It is written as a before/after walk rather than a unit
// assertion because that is the only form in which it can fail for the right reason — the fault was
// never inside one function, it was two sources sitting at different commits.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { foldWorkHierarchy } from "@storytree/library";
import type { WorkHierarchySnapshot } from "@storytree/library";

import {
  HierarchyRuntimeCache,
  announceDesktopHierarchyOrigin,
  resetDesktopHierarchyAnnouncements,
  selectDesktopHierarchy,
  toDesktopTree,
  type DesktopTreeRead,
} from "./hierarchy-live.js";

/** The revision `agent`'s criterion was authored at on 2026-08-03. */
const OLD_REVISION = "uatr1:b7b5052c7e21a3a2";
/** The revision it was re-worded to on 2026-08-12 — and signed against on 08-22/23. */
const NEW_REVISION = "uatr1:380a683e4995990d";
const CRITERION = "uatc_000000000000000000000042";

function snapshot(revisionId: string): WorkHierarchySnapshot {
  // Built as the REAL type rather than asserted into it: the fixture is then checked by the compiler,
  // so a projection field that changes shape breaks here instead of silently passing a test that was
  // never describing the current schema.
  return {
    schemaVersion: 1,
    commitSha: "current-main",
    storiesTreeSha: "tree-now",
    generatedAt: "2026-08-26T00:00:00.000Z",
    generator: "test",
    stories: [
      {
        id: "agent",
        title: "Agent",
        outcome: "the owned loop",
        status: "building",
        proofMode: "UAT",
        uatWitness: "machine",
        dependsOn: [],
        consumedBy: [],
        decisions: [],
        building: false,
        capabilities: [],
        uatTestCriteria: [
          {
            criterionId: CRITERION,
            revisionId,
            title: "the leaf authors a phase",
            witness: "machine",
            wouldBe: false,
          },
        ],
        reliabilityGates: [],
      },
    ],
    capabilities: [],
  };
}

/** A disk read standing in for the frozen `stories/**` copy an installed app ships. */
function frozenDisk(revisionId: string): () => Promise<DesktopTreeRead> {
  return async () => ({
    stories: [
      {
        id: "agent",
        title: "Agent",
        outcome: "the owned loop",
        status: "building",
        proofMode: "UAT",
        uatWitness: "machine" as const,
        dependsOn: [],
        consumedBy: [],
        capabilities: [],
      },
    ],
    uatTestCriteriaByStory: new Map([["agent", [{ criterionId: CRITERION, revisionId }]]]),
    uatCriteriaByStory: new Map([["agent", [{ criterionId: CRITERION, revisionId }]]]),
    coverageByStory: new Map(),
  });
}

/** A disk read that records whether it was reached at all. */
function countingDisk(revisionId: string) {
  let calls = 0;
  const inner = frozenDisk(revisionId);
  return {
    calls: () => calls,
    disk: async () => {
      calls += 1;
      return inner();
    },
  };
}

beforeEach(() => {
  resetDesktopHierarchyAnnouncements();
});

test("desktop-live-hierarchy-read-prefers-the-live-store — reads live and never touches its own frozen copy", async () => {
  const { calls, disk } = countingDisk(OLD_REVISION);
  const selection = await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: foldWorkHierarchy,
    cache: new HierarchyRuntimeCache(),
    disk,
  });

  assert.equal(selection.origin, "live");
  // THE POINT OF THE INCREMENT: with a live answer in hand, the app's own commit contributes not one
  // fact to what the map draws.
  assert.equal(calls(), 0);
  assert.equal(selection.stamp?.commitSha, "current-main");
});

test("desktop-live-hierarchy-read-degrades-to-its-runtime-cache-not-its-frozen-copy — the store goes away", async () => {
  const cache = new HierarchyRuntimeCache();
  const { calls, disk } = countingDisk(OLD_REVISION);

  // One good live read primes the cache…
  await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: foldWorkHierarchy,
    cache,
    disk,
  });
  // …then the store goes away.
  const degraded = await selectDesktopHierarchy({
    live: async () => {
      throw new Error("pool exploded");
    },
    fold: foldWorkHierarchy,
    cache,
    disk,
  });

  assert.equal(degraded.origin, "cache");
  // The frozen copy is STILL not consulted. Falling back to it here would re-enter the exact fault
  // this increment closes, through the back door.
  assert.equal(calls(), 0);
  // And the cache carries the CURRENT revision, so the map keeps painting correctly meanwhile.
  assert.deepEqual(degraded.read.uatCriteriaByStory.get("agent"), [
    { criterionId: CRITERION, revisionId: NEW_REVISION },
  ]);
  assert.match(degraded.degradedBecause ?? "", /pool exploded/);
});

test("desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so — nothing cached", async () => {
  const selection = await selectDesktopHierarchy({
    live: async () => null,
    fold: foldWorkHierarchy,
    cache: new HierarchyRuntimeCache(),
    disk: frozenDisk(OLD_REVISION),
  });

  // A blank forest would break "amber discloses and never blocks" (ADR-0445 D5) outright, so disk
  // stays reachable — but only here, and only announced.
  assert.equal(selection.origin, "disk");
  assert.match(selection.degradedBecause ?? "", /holds no work-hierarchy projection/);
  assert.equal(selection.stamp, undefined);
});

test("desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so — an unfoldable snapshot degrades", async () => {
  const selection = await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: () => {
      throw new Error("unknown schema version");
    },
    cache: new HierarchyRuntimeCache(),
    disk: frozenDisk(OLD_REVISION),
  });

  // A store written by a newer projection schema than this app understands is a real possibility once
  // the version moves. Pretending it parsed would put garbage on the map.
  assert.equal(selection.origin, "disk");
  assert.match(selection.degradedBecause ?? "", /did not fold/);
});

test("desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so — no unexplained branch exists", async () => {
  const cases = [
    await selectDesktopHierarchy({
      live: undefined,
      fold: foldWorkHierarchy,
      cache: new HierarchyRuntimeCache(),
      disk: frozenDisk(OLD_REVISION),
    }),
    await selectDesktopHierarchy({
      live: async () => null,
      fold: foldWorkHierarchy,
      cache: new HierarchyRuntimeCache(),
      disk: frozenDisk(OLD_REVISION),
    }),
    await selectDesktopHierarchy({
      live: async () => {
        throw new Error("boom");
      },
      fold: foldWorkHierarchy,
      cache: new HierarchyRuntimeCache(),
      disk: frozenDisk(OLD_REVISION),
    }),
  ];
  // Asserted over the SET rather than case by case: the risk is a future branch added without a
  // reason, and a per-case test cannot fail for a case nobody has written yet.
  for (const c of cases) {
    assert.notEqual(c.origin, "live");
    assert.ok(c.degradedBecause, "a degraded selection with no stated reason");
  }
});

test("desktop-live-hierarchy-read-degrades-to-its-runtime-cache-not-its-frozen-copy — each caller gets its own copy", async () => {
  const cache = new HierarchyRuntimeCache();
  const first = await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: foldWorkHierarchy,
    cache,
    disk: frozenDisk(OLD_REVISION),
  });
  // `foldVerdicts` mutates the stories it is handed — simulate one request's enrichment.
  first.read.stories[0]!.verdict = { outcome: "pass", at: "x" };

  const second = await selectDesktopHierarchy({
    live: async () => {
      throw new Error("store gone");
    },
    fold: foldWorkHierarchy,
    cache,
    disk: frozenDisk(OLD_REVISION),
  });
  assert.equal(second.origin, "cache");
  // Without the copy, the cache would answer with yesterday's proof state while claiming to be a copy
  // of the hierarchy alone.
  assert.equal(second.read.stories[0]!.verdict, undefined);
});

test("desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so — cache and disk name different consequences", async () => {
  const lines: string[] = [];
  const cache = new HierarchyRuntimeCache();
  await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: foldWorkHierarchy,
    cache,
    disk: frozenDisk(OLD_REVISION),
  });
  announceDesktopHierarchyOrigin(
    await selectDesktopHierarchy({
      live: async () => null,
      fold: foldWorkHierarchy,
      cache,
      disk: frozenDisk(OLD_REVISION),
    }),
    (m) => lines.push(m),
  );
  announceDesktopHierarchyOrigin(
    await selectDesktopHierarchy({
      live: async () => null,
      fold: foldWorkHierarchy,
      cache: new HierarchyRuntimeCache(),
      disk: frozenDisk(OLD_REVISION),
    }),
    (m) => lines.push(m),
  );

  assert.equal(lines.length, 2);
  // The two degradations are wrong in DIFFERENT ways; one undifferentiated warning would send an
  // operator to the wrong remedy.
  assert.match(lines[0] ?? "", /newly authored work will be missing/);
  assert.match(lines[1] ?? "", /will show as unproven/);
});

test("desktop-live-hierarchy-read-reaches-disk-only-on-a-cold-boot-and-says-so — silent on live, once per reason under polling", async () => {
  const lines: string[] = [];
  announceDesktopHierarchyOrigin(
    await selectDesktopHierarchy({
      live: async () => snapshot(NEW_REVISION),
      fold: foldWorkHierarchy,
      cache: new HierarchyRuntimeCache(),
      disk: frozenDisk(OLD_REVISION),
    }),
    (m) => lines.push(m),
  );
  // `assert.equal` on the length rather than `deepEqual(lines, [])`: the latter narrows `lines` to
  // `never[]` for the rest of the function, which breaks the pushes below.
  assert.equal(lines.length, 0);

  // `/api/tree` is polled. A line on every poll is a line the operator filters out, which is how a
  // loud signal becomes a silent one.
  const degraded = await selectDesktopHierarchy({
    live: async () => null,
    fold: foldWorkHierarchy,
    cache: new HierarchyRuntimeCache(),
    disk: frozenDisk(OLD_REVISION),
  });
  announceDesktopHierarchyOrigin(degraded, (m) => lines.push(m));
  announceDesktopHierarchyOrigin(degraded, (m) => lines.push(m));
  announceDesktopHierarchyOrigin(degraded, (m) => lines.push(m));
  assert.equal(lines.length, 1);
});

test("desktop-live-hierarchy-read-greens-an-old-build-without-a-rebuild — the incident, walked", async () => {
  // The app on disk is frozen at the commit that authored the OLD revision — the state an installed
  // app was actually in for eleven days.
  const frozen = frozenDisk(OLD_REVISION);
  // The store holds the tree as it is TODAY, and the signed verdict binds to the NEW revision.
  const signedRevision = NEW_REVISION;

  const beforeThisIncrement = await frozen();
  const askedByTheOldApp = beforeThisIncrement.uatCriteriaByStory.get("agent")![0]!.revisionId;
  // BEFORE: the app asks about a revision nothing was ever signed against, so the join misses and the
  // island paints yellow. The app is not broken and the database is not wrong — it asked an outdated
  // question and got an honest answer.
  assert.equal(askedByTheOldApp, OLD_REVISION);
  assert.notEqual(askedByTheOldApp, signedRevision);

  // AFTER: the same app, same build, same disk — pointed at the live store.
  const afterThisIncrement = await selectDesktopHierarchy({
    live: async () => snapshot(NEW_REVISION),
    fold: foldWorkHierarchy,
    cache: new HierarchyRuntimeCache(),
    disk: frozen,
  });
  const askedNow = afterThisIncrement.read.uatCriteriaByStory.get("agent")![0]!.revisionId;

  assert.equal(afterThisIncrement.origin, "live");
  // The question now matches what was signed. The join lands and `agent` greens — with no rebuild, no
  // reinstall, and nothing on this app's disk having changed.
  assert.equal(askedNow, signedRevision);
});

test("desktop-live-hierarchy-read-prefers-the-live-store — the folded nodes are mutable, as foldVerdicts needs", () => {
  const tree = toDesktopTree(foldWorkHierarchy(snapshot(NEW_REVISION)));
  // Not a style point: a readonly node cast to a mutable one compiles and then throws at the first
  // enrichment write. Proving the write lands is what makes the rebuild-not-cast choice real.
  tree.stories[0]!.verdict = { outcome: "pass", at: "now" };
  assert.equal(tree.stories[0]!.verdict.outcome, "pass");
  assert.equal(tree.stories[0]!.id, "agent");
});
