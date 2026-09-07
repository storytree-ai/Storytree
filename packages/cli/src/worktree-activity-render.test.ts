import test from "node:test";
import assert from "node:assert/strict";

import { planActivitySweep, type WorktreeActivityReading } from "@storytree/drive";

import { renderActivitySweep } from "./worktree.js";

/**
 * `storytree worktree activity`'s RENDER, pinned whole (ADR-0535 D2).
 *
 * WHY A GOLDEN ASSERTION RATHER THAN PROBES. A report is mostly string literals, and
 * `check:mutation-diff` charges one mutant per literal and reds on a single survivor — so
 * `assert.match(body, /refused/)` kills the words it quotes and leaves every other line standing.
 * Pinning the entire body kills the whole class at once, and its brittleness is the point: this
 * report is the sweep's only evidence, and changing what it says should have to be deliberate.
 *
 * The fixture is built to reach every branch in one pass: two admissible readings with DIFFERENT
 * bindings, one refusal of each of the four kinds, a second session id on one worktree (the Rule-2
 * twin), and two worktrees resolving to a shared id so the newest-wins dedup shows in the output.
 */

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

function reading(over: Partial<WorktreeActivityReading>): WorktreeActivityReading {
  return {
    name: "unnamed",
    sessionIds: [],
    mtimeMs: NOW - 60_000,
    binding: "index",
    fellBack: false,
    bulkStamped: false,
    ...over,
  };
}

const READINGS: WorktreeActivityReading[] = [
  reading({ name: "live-one", sessionIds: ["live-one", "live-one-admin"], mtimeMs: NOW - 90_000 }),
  reading({ name: "live-two", sessionIds: ["live-two"], mtimeMs: NOW - 3 * 3_600_000, binding: "HEAD" }),
  // Three worktrees, ONE identity, deliberately ordered so every wrong rule is visible:
  //  - an older one comes FIRST, so "keep whatever you saw first" would lose the winner;
  //  - the winner sits in the MIDDLE, reachable by neither end;
  //  - an EQUAL-mtime twin follows it, so `>` and `>=` disagree (>= would take this one's binding);
  //  - another old one comes LAST, so "always overwrite" would take a 5-hour-old observation.
  reading({ name: "twin-early", sessionIds: ["twinned"], mtimeMs: NOW - 5 * 3_600_000 }),
  reading({ name: "twin-new", sessionIds: ["twinned"], mtimeMs: NOW - 1_800_000, binding: "ORIG_HEAD" }),
  reading({ name: "twin-tie", sessionIds: ["twinned"], mtimeMs: NOW - 1_800_000, binding: "HEAD" }),
  reading({ name: "twin-old", sessionIds: ["twinned"], mtimeMs: NOW - 5 * 3_600_000 }),
  reading({ name: "gone", sessionIds: ["gone"], mtimeMs: 0, binding: null }),
  reading({ name: "husk", sessionIds: ["husk"], fellBack: true, binding: "<dir>" }),
  // Deliberately NOT in sorted order — the report sorts within a reason, and an unsorted fixture
  // is the only way that sort can fail visibly.
  reading({ name: "swept-c", sessionIds: ["swept-c"], bulkStamped: true }),
  reading({ name: "swept-a", sessionIds: ["swept-a"], bulkStamped: true }),
  reading({ name: "swept-b", sessionIds: ["swept-b"], bulkStamped: true }),
  reading({ name: "skewed", sessionIds: ["skewed"], mtimeMs: NOW + 3_600_000 }),
];

const READ_ONLY_BODY = `WORKTREE ACTIVITY — what the ledger is told about liveness (ADR-0535 D2).

  observed   binding      session
      0.0h  index        live-one
      0.0h  index        live-one-admin
      3.0h  HEAD         live-two
      0.5h  ORIG_HEAD    twinned

  12 worktrees observed · 4 session ids vouched for · 6 refused.
  refused (bulk-stamp): swept-a, swept-b, swept-c
  refused (fell-back): husk
  refused (future): skewed
  refused (no-signal): gone
  ⚠ BULK STAMP — worktrees sharing an idle stamp to the second were touched by one pass,
    not used. This fault class has bitten twice; \`storytree worktree idle\` names the signal.

  read-only. Pass --pg to write these stamps to the claim ledger.`;

test("liveness-is-observed-not-self-reported: the activity report is pinned WHOLE — every stamp, every refusal, and its reason", () => {
  const plan = planActivitySweep(READINGS, new Date(NOW));
  const env = renderActivitySweep(READINGS, plan, { nowMs: NOW, written: null });

  assert.equal(env.ok, true);
  assert.equal(env.body, READ_ONLY_BODY);
  assert.deepEqual(env.next, [
    "storytree worktree activity --pg",
    "storytree worktree idle",
    "storytree noticeboard --pg",
  ]);
});

test("liveness-is-observed-not-self-reported: with --pg the closing line reports what MOVED, and says which way", () => {
  const plan = planActivitySweep(READINGS, new Date(NOW));
  const written = renderActivitySweep(READINGS, plan, { nowMs: NOW, written: 7 }).body;

  // Identical up to the last line — only the closing verdict changes.
  const upToLast = (b: string): string => b.slice(0, b.lastIndexOf("\n"));
  assert.equal(upToLast(written), upToLast(READ_ONLY_BODY));
  assert.equal(
    written.slice(written.lastIndexOf("\n") + 1),
    "  wrote 7 claim rows forward (a stamp only ever moves a claim forward, never back).",
  );
});

test("liveness-is-observed-not-self-reported: ONE row moved is singular — a plural count reads as a different fact", () => {
  const plan = planActivitySweep(READINGS, new Date(NOW));
  const body = renderActivitySweep(READINGS, plan, { nowMs: NOW, written: 1 }).body;
  assert.match(body, /wrote 1 claim row forward \(a stamp only ever moves a claim forward, never back\)\.$/);
});

test("liveness-is-observed-not-self-reported: a box with nothing admissible says so, and prints no table", () => {
  // The commonest real outcome on a quiet machine, and the one a `refused`-only report would render
  // as a blank table. It must also NOT raise the bulk-stamp alarm, which is a different finding.
  const readings = [reading({ name: "husk", sessionIds: ["husk"], fellBack: true, binding: "<dir>" })];
  const plan = planActivitySweep(readings, new Date(NOW));
  const env = renderActivitySweep(readings, plan, { nowMs: NOW, written: null });

  assert.equal(
    env.body,
    `WORKTREE ACTIVITY — what the ledger is told about liveness (ADR-0535 D2).

  nothing to vouch for — no worktree produced an admissible reading.

  1 worktrees observed · 0 session ids vouched for · 1 refused.
  refused (fell-back): husk

  read-only. Pass --pg to write these stamps to the claim ledger.`,
  );
});

test("liveness-is-observed-not-self-reported: a clean sweep prints no refusal lines and no alarm at all", () => {
  const readings = [reading({ name: "live-one", sessionIds: ["live-one"] })];
  const plan = planActivitySweep(readings, new Date(NOW));
  const env = renderActivitySweep(readings, plan, { nowMs: NOW, written: 3 });

  assert.equal(
    env.body,
    `WORKTREE ACTIVITY — what the ledger is told about liveness (ADR-0535 D2).

  observed   binding      session
      0.0h  index        live-one

  1 worktrees observed · 1 session ids vouched for · 0 refused.

  wrote 3 claim rows forward (a stamp only ever moves a claim forward, never back).`,
  );
});

test("liveness-is-observed-not-self-reported: a stamp no reading accounts for renders `?`, never a crash or a hole", () => {
  // The plan and the readings are separate arguments, so a caller CAN hand over a stamp for a
  // session no reading carries. That must print a column rather than throw on a missing entry —
  // this report is diagnostic output, and a report that dies on odd input tells you nothing at the
  // moment you most need it. Deliberately NOT reachable through `run(...)`, which builds both from
  // one observation; it is reachable through the exported function, which is what is tested.
  const readings = [reading({ name: "elsewhere", sessionIds: ["elsewhere"] })];
  const plan = {
    stamps: [{ sessionId: "unaccounted", observedAt: new Date(NOW - 60_000).toISOString() }],
    refused: [],
  };
  const body = renderActivitySweep(readings, plan, { nowMs: NOW, written: null }).body;
  assert.match(body, /^ {6}0\.0h {2}\? {10} {2}unaccounted$/m);
});

test("liveness-is-observed-not-self-reported: a stamped reading with NO readable binding also renders `?`", () => {
  // The SECOND `?` fallback, and a different one from the test above — that one covers a stamp with
  // no reading at all, this one a reading whose signal could not be read. `planActivitySweep`
  // refuses a null binding, so the pairing is only reachable by handing the two in separately, and
  // both fallbacks must hold: a blank column here would read as "no signal bound it", which is a
  // claim about the worktree rather than about the report's own ignorance.
  const readings = [reading({ name: "odd", sessionIds: ["odd"], binding: null })];
  const plan = {
    stamps: [{ sessionId: "odd", observedAt: new Date(NOW - 60_000).toISOString() }],
    refused: [],
  };
  const body = renderActivitySweep(readings, plan, { nowMs: NOW, written: null }).body;
  assert.match(body, /^ {6}0\.0h {2}\? {10} {2}odd$/m);
});
