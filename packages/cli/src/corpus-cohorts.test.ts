import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCohorts, coReadNeighbours, RECORD_TIERS } from "./corpus-cohorts.js";
import type { LinkageNode } from "./corpus-linkage.js";
import type { ReadRecord } from "./corpus-read-record.js";

/** An unlinked node — the only kind `buildCohorts` groups. */
function node(rowId: string, kind: string, reason: LinkageNode["edgeFreeReason"]): LinkageNode {
  return {
    nodeId: rowId,
    rowId,
    kind,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    outDegree: 0,
    inDegree: 0,
    supersedesOut: 0,
    supersedesIn: 0,
    anchorOut: 0,
    referenceCount: 0,
    danglingOut: 0,
    repoFileOut: 0,
    edgeFreeReason: reason,
  };
}

function record(reads: number, sessions: readonly string[], lastAt: string): ReadRecord {
  return { reads, sessions: new Set(sessions), firstAt: "2026-01-01T00:00:00.000Z", lastAt };
}

const NO_MANIFEST: ReadonlySet<string> = new Set();

test("RECORD_TIERS is the five log tiers and nothing else", () => {
  assert.deepEqual([...RECORD_TIERS].sort(), [
    "arc",
    "friction",
    "increment",
    "open-question",
    "template",
  ]);
});

test("a LINKED node is never a cohort member — this classifies the unlinked half", () => {
  const cohorts = buildCohorts(
    [node("a", "principle", null), node("b", "principle", "field-never-authored")],
    new Map(),
    new Map(),
    NO_MANIFEST,
  );
  assert.equal(cohorts.length, 1);
  assert.deepEqual(cohorts[0]!.nodes.map((member) => member.rowId), ["b"]);
});

test("cohorts key on tier class, kind AND the mechanical reason", () => {
  const cohorts = buildCohorts(
    [
      node("f", "friction", "schema-refuses-the-field"),
      node("p", "principle", "field-never-authored"),
      node("q", "principle", "field-authored-empty"),
    ],
    new Map(),
    new Map(),
    NO_MANIFEST,
  );
  assert.deepEqual(cohorts.map((cohort) => cohort.key).sort(), [
    "knowledge/principle/field-authored-empty",
    "knowledge/principle/field-never-authored",
    "record/friction/schema-refuses-the-field",
  ]);
  assert.equal(cohorts.find((cohort) => cohort.key.startsWith("record/"))!.tierClass, "record");
  assert.equal(cohorts.find((cohort) => cohort.key.startsWith("knowledge/"))!.tierClass, "knowledge");
});

test("AGENT-MANIFEST MEMBERS ARE THEIR OWN COHORT, because their answer is already known", () => {
  const cohorts = buildCohorts(
    [
      node("register-follows-audience", "principle", "field-never-authored"),
      node("some-other-principle", "principle", "field-never-authored"),
    ],
    new Map(),
    new Map(),
    new Set(["register-follows-audience"]),
  );
  assert.deepEqual(cohorts.map((cohort) => cohort.key).sort(), [
    "knowledge/principle/field-never-authored",
    "knowledge/principle/field-never-authored/IN-AGENT-MANIFEST",
  ]);
  const injected = cohorts.find((cohort) => cohort.key.endsWith("/IN-AGENT-MANIFEST"))!;
  assert.equal(injected.nodes.length, 1);
  assert.equal(injected.inAgentManifest, 1);
  assert.equal(
    cohorts.find((cohort) => !cohort.key.endsWith("/IN-AGENT-MANIFEST"))!.inAgentManifest,
    0,
  );
});

test("SESSIONS ARE UNIONED ACROSS MEMBERS, never summed", () => {
  // One session that read four members of a cohort is ONE session. Summing per-artifact counts
  // would report four, and only the unioned form answers "how many sessions consult this cohort".
  const reads = new Map<string, ReadRecord>([
    ["a", record(10, ["s1", "s2"], "2026-08-01T00:00:00.000Z")],
    ["b", record(5, ["s1"], "2026-08-05T00:00:00.000Z")],
  ]);
  const cohorts = buildCohorts(
    [node("a", "principle", "field-never-authored"), node("b", "principle", "field-never-authored")],
    reads,
    new Map(),
    NO_MANIFEST,
  );
  const cohort = cohorts[0]!;
  assert.equal(cohort.trace.sessions, 2, "s1 read both members and is still one session");
  assert.equal(cohort.trace.reads, 15, "raw reads DO sum");
  assert.equal(cohort.trace.readNodes, 2);
  assert.equal(cohort.trace.lastAt, "2026-08-05T00:00:00.000Z", "the latest read across members");
});

test("`observedNodes` unions the two SOURCES over a boolean, so overlap cannot inflate it", () => {
  const trace = new Map<string, ReadRecord>([["a", record(3, ["s1"], "2026-08-01T00:00:00.000Z")]]);
  const transcript = new Map<string, ReadRecord>([
    ["a", record(3, ["w1"], "2026-08-01T00:00:00.000Z")],
    ["b", record(1, ["w2"], "2026-08-02T00:00:00.000Z")],
  ]);
  const cohorts = buildCohorts(
    [
      node("a", "principle", "field-never-authored"),
      node("b", "principle", "field-never-authored"),
      node("c", "principle", "field-never-authored"),
    ],
    trace,
    transcript,
    NO_MANIFEST,
  );
  const cohort = cohorts[0]!;
  assert.equal(cohort.observedNodes, 2, "a and b were seen; c never was");
  assert.equal(cohort.trace.reads, 3);
  assert.equal(cohort.transcript.reads, 4);
  assert.notEqual(cohort.observedNodes, 3, "the same artifact in both sources is still one artifact");
});

test("a cohort nothing ever read reports an EMPTY lastAt, not a date", () => {
  const cohorts = buildCohorts(
    [node("a", "guardrail", "field-never-authored")],
    new Map(),
    new Map(),
    NO_MANIFEST,
  );
  const cohort = cohorts[0]!;
  assert.equal(cohort.observedNodes, 0);
  assert.equal(cohort.trace.reads, 0);
  assert.equal(cohort.trace.sessions, 0);
  assert.equal(cohort.trace.lastAt, "", "a caller must be able to print NEVER OBSERVED, not a zero date");
});

test("cohorts sort largest first, so the biggest population is read first", () => {
  const cohorts = buildCohorts(
    [
      node("a", "principle", "field-never-authored"),
      node("f1", "friction", "schema-refuses-the-field"),
      node("f2", "friction", "schema-refuses-the-field"),
    ],
    new Map(),
    new Map(),
    NO_MANIFEST,
  );
  assert.equal(cohorts[0]!.nodes.length, 2);
  assert.equal(cohorts[1]!.nodes.length, 1);
});

test("coReadNeighbours counts a neighbour ONCE PER SESSION, not once per read", () => {
  const members = new Set(["target"]);
  const sessionReads = new Map<string, ReadonlySet<string>>([
    ["s1", new Set(["target", "merge-ceremony", "plan"])],
    ["s2", new Set(["target", "merge-ceremony"])],
    ["s3", new Set(["merge-ceremony"])],
  ]);
  const neighbours = coReadNeighbours(members, sessionReads, 5);
  assert.deepEqual(neighbours, [
    { id: "merge-ceremony", sessions: 2 },
    { id: "plan", sessions: 1 },
  ]);
  // s3 never touched the cohort, so its read of merge-ceremony contributes nothing.
  assert.equal(neighbours[0]!.sessions, 2);
});

test("coReadNeighbours never reports a cohort member as its own neighbour", () => {
  const members = new Set(["a", "b"]);
  const sessionReads = new Map<string, ReadonlySet<string>>([["s1", new Set(["a", "b", "other"])]]);
  assert.deepEqual(coReadNeighbours(members, sessionReads, 5), [{ id: "other", sessions: 1 }]);
});

test("coReadNeighbours honours its limit and breaks ties by id", () => {
  const sessionReads = new Map<string, ReadonlySet<string>>([
    ["s1", new Set(["t", "b", "a", "c"])],
  ]);
  assert.deepEqual(coReadNeighbours(new Set(["t"]), sessionReads, 2), [
    { id: "a", sessions: 1 },
    { id: "b", sessions: 1 },
  ]);
});

test("a cohort nobody co-read yields no neighbours rather than a spurious one", () => {
  const sessionReads = new Map<string, ReadonlySet<string>>([["s1", new Set(["unrelated"])]]);
  assert.deepEqual(coReadNeighbours(new Set(["target"]), sessionReads, 5), []);
});

test("lastAt takes the LATEST across members, whatever order they arrive in", () => {
  const reads = new Map<string, ReadRecord>([
    ["a", record(1, ["s1"], "2026-08-09T00:00:00.000Z")],
    ["b", record(1, ["s2"], "2026-08-02T00:00:00.000Z")],
  ]);
  const forward = buildCohorts(
    [node("a", "principle", "field-never-authored"), node("b", "principle", "field-never-authored")],
    reads,
    new Map(),
    NO_MANIFEST,
  );
  const reversed = buildCohorts(
    [node("b", "principle", "field-never-authored"), node("a", "principle", "field-never-authored")],
    reads,
    new Map(),
    NO_MANIFEST,
  );
  assert.equal(forward[0]!.trace.lastAt, "2026-08-09T00:00:00.000Z");
  assert.equal(reversed[0]!.trace.lastAt, "2026-08-09T00:00:00.000Z", "member order must not matter");
});

test("a cohort with SOME members read keeps both numbers apart", () => {
  const reads = new Map<string, ReadRecord>([["a", record(4, ["s1"], "2026-08-09T00:00:00.000Z")]]);
  const cohorts = buildCohorts(
    [node("a", "principle", "field-never-authored"), node("b", "principle", "field-never-authored")],
    reads,
    new Map(),
    NO_MANIFEST,
  );
  const cohort = cohorts[0]!;
  assert.equal(cohort.nodes.length, 2);
  assert.equal(cohort.trace.readNodes, 1);
  assert.equal(cohort.trace.reads, 4);
  assert.equal(cohort.observedNodes, 1);
  assert.equal(cohort.trace.lastAt, "2026-08-09T00:00:00.000Z");
});

test("cohorts of EQUAL size break their tie by key, not by input order", () => {
  const cohorts = buildCohorts(
    [node("z", "zebra", "field-never-authored"), node("a", "alpha", "field-never-authored")],
    new Map(),
    new Map(),
    NO_MANIFEST,
  );
  assert.deepEqual(cohorts.map((cohort) => cohort.key), [
    "knowledge/alpha/field-never-authored",
    "knowledge/zebra/field-never-authored",
  ]);
});

test("a transcript-only read still counts, so neither source is privileged", () => {
  const transcript = new Map<string, ReadRecord>([
    ["a", record(2, ["w1"], "2026-08-07T00:00:00.000Z")],
  ]);
  const cohort = buildCohorts(
    [node("a", "principle", "field-never-authored")],
    new Map(),
    transcript,
    NO_MANIFEST,
  )[0]!;
  assert.equal(cohort.observedNodes, 1);
  assert.equal(cohort.trace.reads, 0);
  assert.equal(cohort.trace.lastAt, "");
  assert.equal(cohort.transcript.reads, 2);
  assert.equal(cohort.transcript.sessions, 1);
  assert.equal(cohort.transcript.lastAt, "2026-08-07T00:00:00.000Z");
});
