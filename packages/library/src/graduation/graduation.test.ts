import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyMemory,
  extractWikiLinks,
  resolveReferences,
  findCover,
  graduationCandidates,
  novelCandidates,
  type MemoryFile,
  type LibrarySnapshot,
} from "./graduation.js";

const snapshot: LibrarySnapshot = {
  docs: [
    { id: "deep-modules", kind: "principle", title: "Deep modules" },
    { id: "slow-growth-minimum-to-green", kind: "principle", title: "Slow growth: minimum to green" },
    { id: "merge-ceremony", kind: "process", title: "Merge ceremony" },
  ],
};

function mem(partial: Partial<MemoryFile> & Pick<MemoryFile, "type">): MemoryFile {
  return {
    name: partial.name ?? "some-memory",
    description: partial.description ?? "a one-line summary",
    body: partial.body ?? "",
    type: partial.type,
  };
}

test("classifyMemory maps each tier to its default target; user is never graduated (ADR-0095 D4)", () => {
  assert.equal(classifyMemory("feedback"), "principle");
  assert.equal(classifyMemory("project"), "process");
  assert.equal(classifyMemory("reference"), "definition");
  assert.equal(classifyMemory("user"), null);
});

test("extractWikiLinks pulls slugs, strips the | label, dedups case-insensitively, preserves order", () => {
  const body = "see [[deep-modules]] and [[Merge Ceremony | the ceremony]]; again [[deep-modules]].";
  assert.deepEqual(extractWikiLinks(body), ["deep-modules", "Merge Ceremony"]);
});

test("extractWikiLinks returns nothing for prose with no links", () => {
  assert.deepEqual(extractWikiLinks("no links here, just words"), []);
});

test("resolveReferences matches links to snapshot ids/titles as asset:<id>, drops danglers, dedups", () => {
  const body = "builds on [[deep-modules]] and [[Merge Ceremony]] but cites [[a-memory-not-in-the-library]].";
  assert.deepEqual(resolveReferences(body, snapshot), ["asset:deep-modules", "asset:merge-ceremony"]);
});

test("resolveReferences matches a link by normalised TITLE, not just id", () => {
  // "Slow growth: minimum to green" (title) normalises to the same as the link text
  const body = "apply [[slow growth minimum to green]] here.";
  assert.deepEqual(resolveReferences(body, snapshot), ["asset:slow-growth-minimum-to-green"]);
});

test("findCover flags a memory whose name matches an existing doc; novel names are undefined", () => {
  assert.equal(findCover(mem({ type: "feedback", name: "deep-modules" }), snapshot), "deep-modules");
  assert.equal(findCover(mem({ type: "feedback", name: "Deep Modules" }), snapshot), "deep-modules"); // normalised
  assert.equal(findCover(mem({ type: "project", name: "a-brand-new-lesson" }), snapshot), undefined);
});

test("graduationCandidates skips user-tier memory (deferred, ADR-0095 D4/D6)", () => {
  const out = graduationCandidates(
    [mem({ type: "user", name: "owner-prefers-org-analogies" })],
    snapshot,
    { now: "2026-06-22T00:00:00Z" },
  );
  assert.deepEqual(out, []);
});

test("graduationCandidates builds a novel candidate with target, provenance, resolved refs", () => {
  const out = graduationCandidates(
    [
      mem({
        type: "feedback",
        name: "verify-edit-write-persisted",
        description: "always confirm a write landed before claiming success",
        body: "After a write, re-read it. Relates to [[merge-ceremony]].",
      }),
    ],
    snapshot,
    { now: "2026-06-22T12:00:00Z" },
  );
  assert.equal(out.length, 1);
  const c = out[0]!;
  assert.equal(c.source, "verify-edit-write-persisted");
  assert.equal(c.target, "principle");
  assert.equal(c.provenance, "Graduated from agent-memory 'verify-edit-write-persisted' on 2026-06-22T12:00:00Z.");
  assert.deepEqual(c.references, ["asset:merge-ceremony"]);
  assert.equal(c.duplicateOf, undefined);
  assert.match(c.rationale, /feedback memory → principle/);
});

test("graduationCandidates flags a duplicate via duplicateOf (the Library already covers it)", () => {
  const out = graduationCandidates(
    [mem({ type: "feedback", name: "deep-modules", description: "prefer small interfaces" })],
    snapshot,
    { now: "2026-06-22T00:00:00Z" },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.duplicateOf, "deep-modules");
});

test("novelCandidates drops the flagged duplicates, keeps the rest (no silent caps — both surfaced)", () => {
  const memories: MemoryFile[] = [
    mem({ type: "feedback", name: "deep-modules" }), // duplicate
    mem({ type: "project", name: "a-fresh-workflow" }), // novel
    mem({ type: "user", name: "a-user-pref" }), // skipped entirely
  ];
  const all = graduationCandidates(memories, snapshot, { now: "2026-06-22T00:00:00Z" });
  assert.equal(all.length, 2); // user skipped; duplicate still surfaced (flagged)
  const novel = novelCandidates(all);
  assert.equal(novel.length, 1);
  assert.equal(novel[0]!.source, "a-fresh-workflow");
  assert.equal(novel[0]!.target, "process");
});
