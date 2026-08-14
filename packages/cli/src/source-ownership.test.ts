import test from "node:test";
import assert from "node:assert/strict";

import {
  formatSourceOwnershipReport,
  judgeSourceOwnership,
  matchesSubtree,
  type SubtreeDeclaration,
} from "./source-ownership.js";

// Builtins + `./source-ownership.js` only — the judge imports nothing, so this suite proves offline
// in a bare worktree with no install, exactly like `boundaries.test.ts`.

const decl = (subtree: string, owner: string): SubtreeDeclaration => ({ subtree, owner });

// ── the matcher ──────────────────────────────────────────────────────────────

test("matchesSubtree accepts an exact file path", () => {
  assert.equal(matchesSubtree("packages/cli/src/boundaries.ts", "packages/cli/src/boundaries.ts"), true);
  assert.equal(matchesSubtree("packages/cli/src/boundaries.ts", "packages/cli/src/boundaries2.ts"), false);
});

test("matchesSubtree treats a bare path as a directory claiming everything beneath it", () => {
  assert.equal(matchesSubtree("packages/library/src/store", "packages/library/src/store/pg-store.ts"), true);
  assert.equal(matchesSubtree("packages/library/src/store", "packages/library/src/store/a/b/c.ts"), true);
  assert.equal(matchesSubtree("packages/library/src/store", "packages/library/src/knowledge.ts"), false);
});

test("matchesSubtree does NOT let a directory prefix bleed into a sibling with the same stem", () => {
  // `packages/cli` must not swallow `packages/cli-extras` — the classic prefix bug, and one that
  // would silently credit another package's files to this owner.
  assert.equal(matchesSubtree("packages/cli", "packages/cli-extras/src/x.ts"), false);
  assert.equal(matchesSubtree("packages/cli", "packages/cli/src/x.ts"), true);
});

test("matchesSubtree: `*` stays inside one segment, `**` spans them", () => {
  assert.equal(matchesSubtree("packages/cli/src/adr*.ts", "packages/cli/src/adr-health.ts"), true);
  assert.equal(matchesSubtree("packages/cli/src/adr*.ts", "packages/cli/src/sub/adr-health.ts"), false);
  assert.equal(matchesSubtree("apps/studio/**", "apps/studio/src/components/TreeView.tsx"), true);
});

test("matchesSubtree: `/**/` matches the FLAT case too (zero intervening directories)", () => {
  // The usual glob subtlety: `src/**/*.ts` must match `src/a.ts`, not only `src/x/a.ts`. A matcher
  // that missed this would report a fully-declared subtree as unowned.
  assert.equal(matchesSubtree("packages/cli/src/**/*.ts", "packages/cli/src/a.ts"), true);
  assert.equal(matchesSubtree("packages/cli/src/**/*.ts", "packages/cli/src/x/a.ts"), true);
  assert.equal(matchesSubtree("packages/cli/src/**/*.ts", "packages/cli/src/a.tsx"), false);
});

test("matchesSubtree escapes regex metacharacters in a literal pattern", () => {
  // A `.` in a pattern must mean a dot, not "any character".
  assert.equal(matchesSubtree("apps/studio/env.d.ts", "apps/studio/envXd.ts"), false);
  assert.equal(matchesSubtree("apps/studio/env.d.ts", "apps/studio/env.d.ts"), true);
});

// ── the totality rule ────────────────────────────────────────────────────────

test("judgeSourceOwnership NAMES every file falling under no declared subtree", () => {
  // The whole point of the second map (ADR-0317 D2): a file under no declaration is named, not
  // silently absorbed by the package-grain check that already passes over it.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts", "packages/cli/src/b.ts", "packages/library/src/store/c.ts"],
    declarations: [decl("packages/library/src/store", "event-sourced-store-seam")],
  });
  assert.equal(report.total, 3);
  assert.equal(report.owned, 1);
  assert.equal(report.unowned, 2);
  assert.deepEqual(
    report.unownedSubtrees.map((s) => [s.dir, s.count]),
    [["packages/cli/src", 2]],
  );
});

test("the backlog is grouped as SUBTREES, descending, and carries EVERY file uncapped", () => {
  // Subtree grain is what makes the backlog walkable rather than a 398-line file list — the
  // difference ADR-0317 D2 says makes a future ratchet reachable at all.
  const files = [
    ...Array.from({ length: 5 }, (_, i) => `packages/cli/src/f${i}.ts`),
    "apps/studio/src/lib/one.ts",
    "apps/studio/src/lib/two.ts",
  ];
  const report = judgeSourceOwnership({ files, declarations: [] });
  assert.deepEqual(
    report.unownedSubtrees.map((s) => s.dir),
    ["packages/cli/src", "apps/studio/src/lib"],
  );
  assert.equal(report.unownedSubtrees[0]?.count, 5);
  assert.equal(
    report.unownedSubtrees[0]?.files.length,
    5,
    "the DATA is complete — only the summary VIEW truncates, and `--all` must be able to expand it",
  );
});

test("coverage is grouped by workspace package, biggest debt first", () => {
  const report = judgeSourceOwnership({
    files: [
      "packages/cli/src/a.ts",
      "packages/cli/src/b.ts",
      "packages/cli/src/c.ts",
      "apps/studio/src/d.ts",
      "packages/notice-board/src/e.ts",
    ],
    declarations: [decl("packages/notice-board/src", "presence-store")],
  });
  assert.deepEqual(
    report.byPackage.map((p) => [p.pkg, p.unowned, p.total]),
    [
      ["packages/cli", 3, 3],
      ["apps/studio", 1, 1],
      ["packages/notice-board", 0, 1],
    ],
  );
});

test("an empty declaration list reports EVERYTHING unowned rather than vacuously passing", () => {
  const report = judgeSourceOwnership({ files: ["packages/cli/src/a.ts"], declarations: [] });
  assert.equal(report.owned, 0);
  assert.equal(report.unowned, 1);
});

// ── the ways a hand-typed glob map rots ──────────────────────────────────────

test("a file matched by two declarations is CONTESTED, credited to the first", () => {
  // An exact-key map like `packageOwnership` cannot have this defect; a glob map can, so the
  // instrument that permits globs has to name it.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/boundaries.ts"],
    declarations: [
      decl("packages/cli/src/boundaries.ts", "organism-boundary-tooling"),
      decl("packages/cli/**", "cli"),
    ],
  });
  assert.equal(report.contested.length, 1);
  assert.deepEqual(report.contested[0]?.owners, ["organism-boundary-tooling", "cli"]);
  assert.equal(report.owners[0]?.owner, "organism-boundary-tooling", "the FIRST declaration wins");
  assert.equal(report.unowned, 0);
});

test("a declaration matching nothing on disk is STALE — the self-pruning worklist rule", () => {
  // The `hostedStories` precedent: a register entry with no evidence is itself a violation, which is
  // what stops the map from accumulating entries for code that moved or was deleted.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts"],
    declarations: [decl("packages/cli/src", "cli"), decl("packages/gone/src", "ghost")],
  });
  assert.deepEqual(
    report.staleDeclarations.map((d) => d.subtree),
    ["packages/gone/src"],
  );
});

test("a declared owner naming nothing in the work graph is reported as UNRESOLVED", () => {
  // The subtree exists to be CLAIMABLE (ADR-0317 D3). An owner that resolves to nothing satisfies
  // totality while remaining unclaimable — the exact escape hatch the increment warns about.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts", "packages/cli/src/b.ts"],
    declarations: [decl("packages/cli/src/a.ts", "organism-boundary-tooling"), decl("packages/cli/src/b.ts", "phantom-id")],
    knownUnitIds: ["organism-boundary-tooling", "cli"],
  });
  assert.equal(report.ownersChecked, true);
  assert.deepEqual(report.unresolvedOwners, ["phantom-id"]);
});

test("owner resolution is SKIPPED, not faked green, when no namespace is supplied", () => {
  // "none unresolved" and "not checked" are different claims; conflating them is how a report
  // reassures a reader about something it never looked at.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts"],
    declarations: [decl("packages/cli/src/a.ts", "phantom-id")],
  });
  assert.equal(report.ownersChecked, false);
  assert.deepEqual(report.unresolvedOwners, []);
  assert.match(formatSourceOwnershipReport(report), /were NOT resolved/);
});

test("the grain tally separates capability-grain owners from coarser story-grain ones", () => {
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts", "packages/proof-protocol/src/b.ts", "packages/x/src/c.ts"],
    declarations: [
      decl("packages/cli/src/a.ts", "organism-boundary-tooling"),
      decl("packages/proof-protocol/src", "proof-protocol"),
      decl("packages/x/src", "nobody"),
    ],
    knownUnitIds: ["organism-boundary-tooling", "proof-protocol"],
    storyIds: ["proof-protocol"],
  });
  assert.deepEqual(report.grain, { capability: 1, story: 1, unresolved: 1 });
});

// ── the story-grain listing: WHY each entry sits at that grain ───────────────
//
// The grain COUNT alone asserts something false. Before this listing existed the report called all
// 92 live story-grain declarations a "`story-author` worklist" where "no capability exists for that
// subtree" — while `repo-manifest.json`'s own rules (1) and (4) already SETTLE 20 of them, and the
// guidance pointed at "every subtree KEY below" when no subtree key was printed anywhere.

/** The three-kind fixture every classification case below is a slice of. */
function grainFixture() {
  return judgeSourceOwnership({
    files: [
      "packages/agent/src/index.ts",
      "packages/agent/src/sdk-curator.ts",
      "packages/proof-protocol/src/a.ts",
      "packages/proof-protocol/src/b.ts",
      "packages/cli/src/gate.ts",
    ],
    declarations: [
      decl("packages/agent/src/index.ts", "agent"),
      decl("packages/agent/src/sdk-curator.ts", "agent"),
      decl("packages/proof-protocol/src", "proof-protocol"),
      decl("packages/cli/src/gate.ts", "gate-ci-parity"),
    ],
    knownUnitIds: ["agent", "proof-protocol", "gate-ci-parity", "leaf-tool-surface"],
    storyIds: ["agent", "proof-protocol"],
    unitsByStory: new Map([
      ["agent", ["leaf-tool-surface"]], // declares a capability ⇒ a finer owner MAY exist
      ["proof-protocol", []], // root port: the story IS the one competence
    ]),
  });
}

test("every story-grain declaration is listed BY SUBTREE KEY — the claimable object (ADR-0317 D3)", () => {
  // The defect this closes: the guidance said "claim the subtree you are writing" while the report
  // printed owners only, so the one thing a session could bind to was invisible.
  const keys = grainFixture().storyGrain.map((d) => d.subtree);
  assert.deepEqual(keys.sort(), [
    "packages/agent/src/index.ts",
    "packages/agent/src/sdk-curator.ts",
    "packages/proof-protocol/src",
  ]);
});

test("a capability-grain declaration never appears in the story-grain listing", () => {
  assert.ok(!grainFixture().storyGrain.some((d) => d.subtree === "packages/cli/src/gate.ts"));
});

test("a package re-export barrel is DECIDED by manifest rule 4, not residue", () => {
  const barrel = grainFixture().storyGrain.find((d) => d.subtree.endsWith("/index.ts"));
  assert.equal(barrel?.reason, "barrel");
});

test("a story declaring NO units is DECIDED by manifest rule 1 — nothing finer could be named", () => {
  const port = grainFixture().storyGrain.find((d) => d.owner === "proof-protocol");
  assert.equal(port?.reason, "no-capability-declared");
  assert.equal(port?.files, 2);
});

test("a story that DOES declare capabilities leaves its non-barrel subtrees as RESIDUE", () => {
  const residue = grainFixture().storyGrain.find((d) => d.subtree.endsWith("sdk-curator.ts"));
  assert.equal(residue?.reason, "residue");
});

test("the barrel rule wins over the no-units rule — the more specific settlement", () => {
  const report = judgeSourceOwnership({
    files: ["packages/p/src/index.ts"],
    declarations: [decl("packages/p/src/index.ts", "p")],
    knownUnitIds: ["p"],
    storyIds: ["p"],
    unitsByStory: new Map([["p", []]]),
  });
  assert.equal(report.storyGrain[0]?.reason, "barrel");
});

test("without a story→unit namespace the reason is UNCLASSIFIED, never guessed as residue", () => {
  // Defaulting to `residue` would inflate the worklist with entries nobody measured — the same
  // "not checked is not a pass" rule `ownersChecked` already holds for owner resolution.
  const report = judgeSourceOwnership({
    files: ["packages/agent/src/sdk-curator.ts"],
    declarations: [decl("packages/agent/src/sdk-curator.ts", "agent")],
    knownUnitIds: ["agent"],
    storyIds: ["agent"],
  });
  assert.equal(report.storyGrain[0]?.reason, "unclassified");
});

test("file counts are PER DECLARATION, not per owner — one owner may hold many subtrees", () => {
  const report = judgeSourceOwnership({
    files: ["p/src/one.ts", "p/src/two.ts", "p/other/three.ts"],
    declarations: [decl("p/src", "s"), decl("p/other", "s")],
    knownUnitIds: ["s"],
    storyIds: ["s"],
    unitsByStory: new Map([["s", ["cap"]]]),
  });
  // The OWNER holds 3 files; the two declarations hold 2 and 1.
  assert.equal(report.owners[0]?.files, 3);
  assert.deepEqual(
    report.storyGrain.map((d) => [d.subtree, d.files]),
    [
      ["p/src", 2],
      ["p/other", 1],
    ],
  );
});

test("the rendered listing prints the keys, splits the three remedies, and drops the old false claim", () => {
  const text = formatSourceOwnershipReport(grainFixture());
  // The keys are on screen, and the claim command is the one a session can actually run.
  assert.match(text, /packages\/agent\/src\/sdk-curator\.ts/);
  assert.match(text, /noticeboard claim '<subtree-key>' --grade work --pg/);
  // Three different remedies, because draining a DECIDED entry is not progress.
  assert.match(text, /RESIDUE/);
  assert.match(text, /DECIDED — a package re-export barrel/);
  assert.match(text, /DECIDED — the owning story declares no units/);
  // The blanket assertion that is false for all 20 decided entries must not come back.
  assert.doesNotMatch(text, /no capability exists for that subtree/);
  // ADR-0308 D5's fallback — what a session with no capability to name actually does.
  assert.match(text, /INCREMENT you are driving/);
});

test("the listing is absent when nothing is at story grain, rather than printing an empty heading", () => {
  const text = formatSourceOwnershipReport(
    judgeSourceOwnership({
      files: ["packages/cli/src/a.ts"],
      declarations: [decl("packages/cli/src/a.ts", "some-capability")],
      knownUnitIds: ["some-capability"],
      storyIds: [],
      unitsByStory: new Map(),
    }),
  );
  assert.doesNotMatch(text, /STORY-GRAIN DECLARATIONS/);
});

// ── the trend ────────────────────────────────────────────────────────────────

test("the trend compares against the recorded baseline and reports BOTH movements", () => {
  // The denominator moves too; a delta read without it is not like-for-like.
  const report = judgeSourceOwnership({
    files: ["a/b/one.ts", "a/b/two.ts"],
    declarations: [decl("a/b/one.ts", "owner")],
    baseline: { date: "2026-08-06", files: 3, unowned: 3 },
  });
  assert.equal(report.trend?.delta, -2);
  assert.equal(report.trend?.nowUnowned, 1);
  assert.equal(report.trend?.wasFiles, 3);
  assert.equal(report.trend?.nowFiles, 2);
  assert.match(formatSourceOwnershipReport(report), /2 fewer unowned/);
});

test("with no baseline the report states there is none rather than inventing a zero delta", () => {
  const report = judgeSourceOwnership({ files: ["a/b/one.ts"], declarations: [] });
  assert.equal(report.trend, undefined);
  assert.match(formatSourceOwnershipReport(report), /no baseline recorded/);
});

// ── the framing the report must never lose ───────────────────────────────────

test("the rendered report says REPORT ONLY and blocks nothing", () => {
  const report = judgeSourceOwnership({ files: ["packages/cli/src/a.ts"], declarations: [] });
  const text = formatSourceOwnershipReport(report);
  assert.match(text, /REPORT ONLY/);
  assert.match(text, /fails nothing/);
});

test("the report refuses the two mischaracterisations ADR-0317 D1 exists to prevent", () => {
  // THE LOAD-BEARING ONE. The number here is a statement about how much of the tree carries a
  // declared owner. It is NOT evidence that `proof.real.sourceFile` decayed (that field is a
  // unit→file build target, near-full at its own job), and it is NOT a verdict on
  // `check:boundaries`, which is correct at package grain. A future reader who loses either framing
  // rebuilds the wrong instrument — which is precisely what ADR-0317 was written to stop.
  const report = judgeSourceOwnership({
    files: ["packages/cli/src/a.ts"],
    declarations: [],
    baseline: { date: "2026-08-06", files: 1, unowned: 1 },
  });
  const text = formatSourceOwnershipReport(report);
  assert.match(text, /was never an ownership map/, "sourceFile must not read as a decayed map");
  assert.match(text, /correct at ITS grain/, "check:boundaries must not read as broken");
  assert.match(text, /intended architecture/, "shared substrate must not read as drift");
});

test("the summary view prints per-subtree counts; --all lists EVERY file with no silent cap", () => {
  // The regression this pins: `--all` once re-used the summary's bounded sample, so it announced
  // "UNOWNED FILES (483)" and then printed three per directory with "… 92 more". A view that caps
  // what it promised to list is the same defect class as an unrun check reading as a pass.
  const files = Array.from({ length: 8 }, (_, i) => `packages/cli/src/f${i}.ts`);
  const report = judgeSourceOwnership({ files, declarations: [] });

  const summary = formatSourceOwnershipReport(report);
  assert.match(summary, /THE BACKLOG/);
  assert.doesNotMatch(summary, /f7\.ts/, "the summary must not degenerate into the full file list");

  const all = formatSourceOwnershipReport(report, { all: true });
  assert.match(all, /UNOWNED FILES \(8\)/);
  for (const file of files) assert.match(all, new RegExp(file.replace(/[.]/g, "\\.")));
  assert.doesNotMatch(all, /more$/m, "--all must not truncate");
});

test("contested and stale sections appear only when they have something to say", () => {
  const clean = formatSourceOwnershipReport(
    judgeSourceOwnership({
      files: ["packages/cli/src/a.ts"],
      declarations: [decl("packages/cli/src", "cli")],
      knownUnitIds: ["cli"],
    }),
  );
  assert.doesNotMatch(clean, /CONTESTED/);
  assert.doesNotMatch(clean, /STALE/);
});
