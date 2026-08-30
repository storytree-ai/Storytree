/**
 * Unit cover for the CAPTURE COMPOSITION (`captureCliInvocation`), story
 * `context-traversal-capture`, capability `terminal-capture-activation`.
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL, since `terminal-capture.uat.test.ts` has covered this module since
 * it shipped. That suite spawns the REAL CLI binary against a REAL fixture door, which is what makes
 * it a genuine acceptance proof — and also what makes it useless to a mutation runner that owns the
 * process lifecycle: ADR-0464 D1's landing measured six of its legs failing Stryker's dry run with a
 * refused connection, on clean `origin/main`, aborting the whole rung before a single mutant was
 * evaluated. `check:mutation-diff` now excludes `*.uat.test.ts`, and the stated cost of that
 * exclusion is exactly this: lines only a spawn test reached became uncovered.
 *
 * So this is the cheap half of that cost paid back — the composition driven IN-PROCESS with every
 * seam injected (`dir`, `sessionId`, `nextId`, `now`), asserting the two things the UAT proves
 * expensively through a real process: that an observed read is APPENDED to the session's trace, and
 * that the identity attributes are stamped only when supplied. It does not replace the UAT and is not
 * meant to: a real process boundary is the only thing that proves durability across one.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { captureCliInvocation, showTraversalSession } from "./terminal-capture.js";
import { readTraversalSession, appendTraversalEvents } from "./sink.js";
import { readShipCursor } from "./store/ship.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `traversal-unit-${prefix}-`));
}

const AT = new Date("2026-08-28T00:00:00.000Z");

test("captureCliInvocation: an allowlisted read is observed and APPENDED to the session's trace", () => {
  const dir = freshDir("append");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-unit-1",
    dir,
    enabled: true,
    nextId: () => "visit-1",
    now: () => AT,
  });

  const { replay } = readTraversalSession({ dir, sessionId: "session-unit-1" });
  const visits = replay.events.filter(isContextVisitEvent);
  assert.equal(visits.length, 1, "one allowlisted read observes exactly one visit");
  assert.equal(visits[0]?.nodeId, "plan");
  assert.equal(visits[0]?.visitId, "visit-1", "the injected id source is what mints the visit id");
});

test("captureCliInvocation: a write-shaped command appends NOTHING — the allowlist's default answer is no event", () => {
  // The negative half, and it is asserted on the DIRECTORY rather than on an empty replay: a reader
  // over a missing trace file and a reader over a genuinely empty one return the same thing, so an
  // empty-replay assertion cannot tell "nothing was written" from "the write went somewhere else".
  const dir = freshDir("refuse");
  captureCliInvocation({
    argv: ["library", "artifact", "edit", "plan", "--set", "title=x", "--pg"],
    ok: true,
    sessionId: "session-unit-2",
    dir,
    enabled: true,
    nextId: () => "visit-x",
    now: () => AT,
  });
  assert.deepEqual(fs.readdirSync(dir), [], "a write observes no read, so no trace file is created");
});

test("captureCliInvocation: grade and slot are stamped only when SUPPLIED, and absence leaves the line unlabelled", () => {
  const dir = freshDir("identity");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-unit-3",
    dir,
    enabled: true,
    nextId: () => "visit-3",
    now: () => AT,
    grade: "window",
    slot: "slot-a",
  });
  const stamped = readTraversalSession({ dir, sessionId: "session-unit-3" });
  assert.equal(stamped.identity, "window");
  assert.deepEqual(stamped.slots, ["slot-a"]);

  // ...and the same call WITHOUT them must not invent either. An absent attribute is what leaves a
  // line unlabelled, so a default here would make every unidentified trace claim an identity grade.
  const bare = freshDir("identity-bare");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-unit-4",
    dir: bare,
    enabled: true,
    nextId: () => "visit-4",
    now: () => AT,
  });
  const unlabelled = readTraversalSession({ dir: bare, sessionId: "session-unit-4" });
  assert.notEqual(unlabelled.identity, "window", "no grade was supplied, so none may be claimed");
  assert.deepEqual(unlabelled.slots, [], "and no slot either");
});

test("captureCliInvocation: capture disabled writes no trace at all (ADR-0241 D2)", () => {
  const dir = freshDir("off");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-unit-5",
    dir,
    enabled: false,
    nextId: () => "visit-5",
    now: () => AT,
  });
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("captureCliInvocation: the FORWARD-ONLY ship baseline is stamped before the append (ADR-0484 D6)", () => {
  const dir = freshDir("baseline");
  const sessionId = "session-unit-baseline";

  // Pre-landing history: two events written by a capture path that knew nothing about shipping.
  appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: "old-1",
        sessionId,
        at: "2026-08-27T00:00:00.000Z",
        visitId: "old-v1",
        nodeId: "plan",
      },
      {
        kind: "front_matter_read",
        eventId: "old-2",
        sessionId,
        at: "2026-08-27T00:00:01.000Z",
        visitId: "old-v2",
        nodeId: "plan",
      },
    ],
    { dir, sessionId },
  );
  const historyBytes = fs.statSync(path.join(dir, `${sessionId}.jsonl`)).size;

  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId,
    dir,
    nextId: () => "visit-baseline",
    now: () => AT,
  });

  // The cursor sits at the file's size BEFORE this invocation, so the two historical events are
  // never shipped and this one is. A missing cursor here would make the session look like
  // pre-landing history to the shipper and lose every event it goes on to write; a cursor at the
  // file's CURRENT size would skip the event this invocation just appended.
  assert.equal(readShipCursor(dir, sessionId)?.offset, historyBytes);
  assert.ok(fs.statSync(path.join(dir, `${sessionId}.jsonl`)).size > historyBytes);
});

test("captureCliInvocation: an invocation that observes nothing stamps no baseline either", () => {
  const dir = freshDir("no-baseline");
  captureCliInvocation({
    argv: ["library", "artifact", "edit", "plan"],
    ok: true,
    sessionId: "session-unit-no-baseline",
    dir,
    nextId: () => "visit-none",
    now: () => AT,
  });
  // A write-shaped command writes no line, so there is nothing to baseline AGAINST — and a cursor
  // minted here would enrol a session in the sweep on the strength of a command that recorded
  // nothing.
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(readShipCursor(dir, "session-unit-no-baseline"), null);
});

test("showTraversalSession: the render declares the SURVIVING outermost coverage, not a retired outer layer", () => {
  // THE HAZARD THIS PINS, stated in this module's own header: every increment before ADR-0464 D1
  // moved the coverage import OUTWARD, and each time the seam failed by declaring an INNER layer —
  // printing a field under `omitted` on a trace that visibly carried it. D1 moved it INWARD for the
  // first time, so the seam now has a second direction to fail in, and it is the easier one: both
  // retired constants (`OFFER_CANDIDATE_SET_COVERAGE`, `FOLLOW_OFFER_EDGE_COVERAGE`) are still
  // recoverable from git and read as the more complete ones. Re-wiring either would make this render
  // claim two event kinds nothing can produce.
  const dir = freshDir("render-coverage");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-unit-6",
    dir,
    enabled: true,
    nextId: () => "visit-6",
    now: () => AT,
  });

  const rendered = showTraversalSession("session-unit-6", { dir });
  const coverageLine = rendered.body
    .split("\n")
    .find((line) => line.includes("coverage: adapter=terminal-cli-dispatch"));
  assert.notEqual(coverageLine, undefined, "the terminal adapter's coverage must render");
  const [supported, omitted] = (coverageLine ?? "").split(" omitted=");

  // What this composition genuinely writes stays SUPPORTED — without this half, the omission
  // assertions below would be satisfied by a declaration that simply claimed nothing.
  assert.ok(supported?.includes("field:parent_visit_id"));
  assert.ok(supported?.includes("field:prior_visit_id"));

  for (const retired of ["event:candidate_set", "event:followed_edge", "field:candidate_follow_causality"]) {
    assert.ok(omitted?.includes(retired), `${retired} has no producer, so the render must OMIT it`);
    assert.equal(
      supported?.includes(retired),
      false,
      `${retired} must not render as supported — declaring an event this adapter cannot write is the ` +
        "mirror of the self-denial ADR-0235 clause 6 forbids",
    );
  }

  // The caveats ride with the declaration (ADR-0235 clause 6): a render that states no gap at all
  // satisfies that clause vacuously, which is what deleting the three retired offer caveats would
  // have left behind.
  assert.ok(rendered.body.includes("coverage-caveats:"));
  assert.ok(rendered.body.includes("offers-and-follows-are-no-longer-recorded"));
});

test("captureCliInvocation: a search's RESULT IDS reach the trace, and their absence is not an empty set", () => {
  // The composition owns the absent-vs-empty decision (ADR-0484 D3), which is why it is asserted
  // here rather than in the CLI entry point: `resultNodeIds: []` on a written line must mean "this
  // search matched nothing", never "the caller passed nothing through".
  const dir = freshDir("search-results");
  captureCliInvocation({
    argv: ["library", "search", "amends"],
    ok: true,
    sessionId: "session-results",
    dir,
    enabled: true,
    now: () => AT,
    nextId: () => "search-with-results",
    resultNodeIds: ["adr-0431", "adr-0139"],
  });

  const { replay } = readTraversalSession({ dir, sessionId: "session-results" });
  assert.equal(replay.events.length, 1);
  const [event] = replay.events;
  assert.equal(event?.kind, "search");
  assert.deepEqual(
    event && "resultNodeIds" in event ? event.resultNodeIds : undefined,
    ["adr-0431", "adr-0139"],
  );
});

test("captureCliInvocation: a search captured with NO result ids still writes the event, with an empty set", () => {
  const dir = freshDir("search-none");
  captureCliInvocation({
    argv: ["library", "search", "amends"],
    ok: true,
    sessionId: "session-none",
    dir,
    enabled: true,
    now: () => AT,
    nextId: () => "search-without-results",
    // Deliberately omitted — the shape every non-search dispatch takes, and the shape the CLI passes
    // when an envelope carried none.
  });

  const { replay } = readTraversalSession({ dir, sessionId: "session-none" });
  assert.equal(replay.events.length, 1);
  const [event] = replay.events;
  assert.equal(event?.kind, "search");
  assert.deepEqual(event && "resultNodeIds" in event ? event.resultNodeIds : undefined, []);
});

test("captureCliInvocation: a NON-search read is unaffected by result ids the caller happens to pass", () => {
  // The observer reads `resultNodeIds` only on a search shape. Asserting it here keeps the plumbing
  // from leaking into visit events, where a result set would mean nothing.
  const dir = freshDir("visit-with-results");
  captureCliInvocation({
    argv: ["library", "artifact", "plan"],
    ok: true,
    sessionId: "session-visit",
    dir,
    enabled: true,
    now: () => AT,
    nextId: () => "visit-1",
    resultNodeIds: ["ignored-1"],
  });

  const { replay } = readTraversalSession({ dir, sessionId: "session-visit" });
  assert.equal(replay.events.length, 1);
  const [event] = replay.events;
  assert.ok(event !== undefined);
  assert.equal(isContextVisitEvent(event) ? event.nodeId : undefined, "plan");
  assert.equal(JSON.stringify(event).includes("ignored-1"), false);
});
