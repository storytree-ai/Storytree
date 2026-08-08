import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHANNELS,
  CHURN_EXCLUSIONS,
  COMPARABILITY_FLOOR,
  couplingChurn,
  DECOUPLING_REFERENCE,
  LANDING_SUBJECT,
  parseCommitLog,
  RESYNC_SUBJECT,
  type CommitRec,
} from "./coupling-churn.js";

const DAY = 86_400;
const T0 = Date.parse("2026-08-01T00:00:00Z") / 1000;

function resync(n: number, atOffsetDays: number): CommitRec {
  return {
    sha: `r${n}`,
    at: T0 + Math.round(atOffsetDays * DAY),
    parents: [`own${n}`, `main${n}`],
    subject: `Merge remote-tracking branch 'origin/main' into claude/branch-${n}`,
  };
}

function landing(n: number, atOffsetDays: number, branch = `claude/branch-${n}`): CommitRec {
  return {
    sha: `l${n}`,
    at: T0 + Math.round(atOffsetDays * DAY),
    parents: [`p${n}`, `h${n}`],
    subject: `Merge pull request #${n} from storytree-ai/${branch}`,
  };
}

const WINDOW = { from: "2026-08-01T00:00:00Z", to: "2026-08-02T00:00:00Z" };

/** A window at exactly the reference dispatch rate, so comparability is not the thing under test. */
function comparableLandings(): CommitRec[] {
  return Array.from({ length: DECOUPLING_REFERENCE.landingsPerDay }, (_, i) => landing(i, (i + 0.5) / 40));
}

// ---------------------------------------------------------------------------
// The classifiers
// ---------------------------------------------------------------------------

test("the re-sync classifier is the narrow form that reproduces the hand measurement", () => {
  assert.ok(RESYNC_SUBJECT.test("Merge remote-tracking branch 'origin/main' into claude/x"));
  // The three subjects a wider pattern would sweep in. Each is a real re-sync in spirit; including
  // them moves the 2026-08-01..06 daily series off inc-22's numbers, so widening is a calibration
  // change and has to be argued as one.
  assert.equal(RESYNC_SUBJECT.test("Merge origin/main into claude/strange-hermann-5961fc"), false);
  assert.equal(RESYNC_SUBJECT.test("Merge current main into app-surface increment"), false);
  assert.equal(
    RESYNC_SUBJECT.test("merge origin/main into principle-wiring; re-apply wiring on main's seed"),
    false,
  );
  assert.equal(RESYNC_SUBJECT.test("Merge pull request #1211 from storytree-ai/claude/x"), false);
});

test("the landing classifier captures the PR number and the head branch", () => {
  const m = LANDING_SUBJECT.exec("Merge pull request #1211 from storytree-ai/claude/guide-speaks-to-ca9dea");
  assert.equal(m?.[1], "1211");
  assert.equal(m?.[2], "storytree-ai/claude/guide-speaks-to-ca9dea");
});

test("the commit-log parser survives a subject containing spaces, quotes and separators", () => {
  const FS = String.fromCharCode(1);
  const text = [
    `abc123${FS}1785510954${FS}p1 p2${FS}Merge remote-tracking branch 'origin/main' into claude/x`,
    `def456${FS}1785510999${FS}p3${FS}docs: a "quoted" subject`,
    "",
  ].join("\n");
  assert.deepEqual(parseCommitLog(text), [
    {
      sha: "abc123",
      at: 1785510954,
      parents: ["p1", "p2"],
      subject: "Merge remote-tracking branch 'origin/main' into claude/x",
    },
    { sha: "def456", at: 1785510999, parents: ["p3"], subject: 'docs: a "quoted" subject' },
  ]);
});

// ---------------------------------------------------------------------------
// Refusal — ADR-0316 D2, the behaviour that separates this from the metrics it replaces
// ---------------------------------------------------------------------------

test("REFUSAL: a low-dispatch window declines the rate-sensitive ratio and names the condition", () => {
  const commits = [resync(1, 0.1), resync(2, 0.2), ...Array.from({ length: 10 }, (_, i) => landing(i, 0.3 + i * 0.05))];
  const report = couplingChurn({
    commits,
    absorbedFor: () => ["packages/cli/src/a.ts", "stories/x/story.md"],
    window: WINDOW,
  });
  assert.equal(report.comparability.comparable, false);
  assert.equal(report.resyncsPerLanding, undefined, "the ratio is ABSENT, not zeroed or estimated");
  assert.ok(report.comparability.comparable === false);
  assert.match(report.comparability.failed, /10\.0 landings\/day is 29% of the reference 34\/day/);
  assert.match(report.comparability.refusal, /DECLINED/);
  assert.match(report.comparability.refusal, /superlinear in concurrency/);
});

test("REFUSAL still reports everything rate-normalised by construction — it is not an error", () => {
  const commits = [resync(1, 0.1), landing(1, 0.2), landing(2, 0.3)];
  const report = couplingChurn({
    commits,
    absorbedFor: () => ["packages/cli/src/a.ts", "packages/cli/src/b.ts", "stories/x/story.md"],
    window: WINDOW,
  });
  assert.equal(report.comparability.comparable, false);
  assert.equal(report.perLandingAbsorbedChurn, 1.5, "3 absorbed changes over 2 landings — always reported");
  assert.deepEqual(
    report.channels.map((c) => [c.channel, c.changes]),
    [
      ["packages/**", 2],
      ["stories/", 1],
    ],
    "the channel composition is rate-normalised by construction and stands on its own",
  );
  assert.equal(report.sample.resyncs, 1);
});

test("a window AT the reference dispatch rate renders the ratio", () => {
  const commits = [resync(1, 0.1), resync(2, 0.2), ...comparableLandings()];
  const report = couplingChurn({ commits, absorbedFor: () => ["packages/a.ts"], window: WINDOW });
  assert.equal(report.comparability.comparable, true);
  assert.equal(report.resyncsPerLanding, 2 / DECOUPLING_REFERENCE.landingsPerDay);
  assert.equal(report.dispatch.landingsPerDay, DECOUPLING_REFERENCE.landingsPerDay);
});

test("the comparability floor is declared, and a caller may state its own reference", () => {
  const commits = [resync(1, 0.1), ...Array.from({ length: 20 }, (_, i) => landing(i, 0.2 + i * 0.03))];
  const strict = couplingChurn({ commits, absorbedFor: () => [], window: WINDOW });
  assert.equal(strict.comparability.comparable, false, "20/day against 34/day is 59%");
  const own = couplingChurn({
    commits,
    absorbedFor: () => [],
    window: WINDOW,
    reference: { label: "a quieter week", landingsPerDay: 20 },
  });
  assert.equal(own.comparability.comparable, true);
  assert.equal(own.comparability.floor, COMPARABILITY_FLOOR);
  assert.equal(own.comparability.reference.label, "a quieter week");
});

// ---------------------------------------------------------------------------
// Composition, exclusions, and the window/sample disclosure
// ---------------------------------------------------------------------------

test("excluded paths are dropped from churn AND counted, with the reason stated in the report", () => {
  const commits = [resync(1, 0.1), ...comparableLandings()];
  const report = couplingChurn({
    commits,
    absorbedFor: () => [
      "docs/research/big-dump/a.json",
      "docs/research/big-dump/b.json",
      "packages/cli/src/a.ts",
    ],
    window: WINDOW,
  });
  assert.equal(report.sample.excluded, 2);
  assert.equal(report.sample.absorbedChanges, 1, "the additive dump nobody collides on is not churn");
  assert.deepEqual(report.exclusions, CHURN_EXCLUSIONS);
  assert.match(report.exclusions[0]!.why, /collided on by nobody/);
});

test("unclassified files are counted and held OUT of the share denominator, never folded in", () => {
  const commits = [resync(1, 0.1), ...comparableLandings()];
  const report = couplingChurn({
    commits,
    absorbedFor: () => ["packages/a.ts", ".github/workflows/ci.yml", "legacy/Agentic/x.rs", "web/y.ts"],
    window: WINDOW,
  });
  assert.equal(report.sample.classified, 1);
  assert.equal(report.sample.unclassified, 3);
  assert.equal(report.sample.absorbedChanges, 4, "they are still absorbed churn — only the shares exclude them");
  assert.equal(report.channels[0]?.share, 1, "packages/** is 100% of the CLASSIFIED denominator");
});

test("the lockfile is its own channel, ahead of the root bucket that would otherwise swallow it", () => {
  assert.deepEqual(
    CHANNELS.map((c) => c.channel),
    ["packages/**", "apps/**", "docs/decisions/", "stories/", "lockfile", "root"],
  );
  const commits = [resync(1, 0.1), ...comparableLandings()];
  const report = couplingChurn({
    commits,
    absorbedFor: () => ["pnpm-lock.yaml", "CLAUDE.md", "package.json"],
    window: WINDOW,
  });
  assert.deepEqual(
    report.channels.map((c) => [c.channel, c.changes]),
    [
      ["root", 2],
      ["lockfile", 1],
    ],
  );
});

test("hottest objects count RE-SYNCS absorbing them, so one file twice in one diff counts once", () => {
  const commits = [resync(1, 0.1), resync(2, 0.2), ...comparableLandings()];
  const report = couplingChurn({
    commits,
    absorbedFor: (c) =>
      c.sha === "r1" ? ["apps/studio/data/knowledge.json", "apps/studio/data/knowledge.json"] : ["packages/a.ts"],
    window: WINDOW,
  });
  const hot = report.hottest.find((h) => h.path === "apps/studio/data/knowledge.json");
  assert.equal(hot?.resyncs, 1);
  assert.equal(hot?.share, 0.5, "absorbed by 1 of the window's 2 re-syncs");
});

test("every report carries the exact window and the sample behind it", () => {
  const report = couplingChurn({ commits: [], absorbedFor: () => [], window: WINDOW });
  assert.deepEqual(report.window, WINDOW);
  assert.deepEqual(report.sample, {
    resyncs: 0,
    landings: 0,
    absorbedChanges: 0,
    classified: 0,
    unclassified: 0,
    excluded: 0,
  });
  assert.equal(report.perLandingAbsorbedChurn, 0, "an empty window divides by nothing rather than NaN");
  assert.equal(report.comparability.comparable, false, "and zero dispatch is never comparable");
});

test("a re-sync commit with fewer than two parents cannot be diffed and is not counted", () => {
  const orphan: CommitRec = { ...resync(9, 0.1), parents: ["only-one"] };
  const report = couplingChurn({
    commits: [orphan, ...comparableLandings()],
    absorbedFor: () => ["packages/a.ts"],
    window: WINDOW,
  });
  assert.equal(report.sample.resyncs, 0);
});

test("the sessions proxy counts DISTINCT head branches, so a branch landing twice is one session", () => {
  const commits = [landing(1, 0.1, "claude/one"), landing(2, 0.2, "claude/one"), landing(3, 0.3, "claude/two")];
  const report = couplingChurn({ commits, absorbedFor: () => [], window: WINDOW });
  assert.equal(report.dispatch.landings, 3);
  assert.equal(report.dispatch.branches, 2);
  assert.equal(report.dispatch.branchesPerDay, 2);
});
