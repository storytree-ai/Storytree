/**
 * Proves all three contracts for the `declare-presence` capability node
 * (stories/notice-board/declare-presence.md, ADR-0033 Decision 1):
 *
 *   1. presence-doc-fail-closed   — schema refuses blank identity/substance fields; strict mode rejects extras
 *   2. staleness-is-derived       — fresh/stale/possibly-dead is a pure function of lastSeenAt vs now
 *   3. declaration-upsert-merge   — mergeDeclaration anchors sessionId+startedAt; patches everything else
 *
 * All assertions run offline (no store, no clock reads, no worktree probing).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PresenceDeclaration,
  classifyPresence,
  mergeDeclaration,
  reapableSessions,
  STALE_THRESHOLD_MS,
  POSSIBLY_DEAD_THRESHOLD_MS,
} from "./presence.js";
import type { PresenceDeclarationDoc, PresenceDeclarationPatch } from "./presence.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_LAST_SEEN = "2026-06-11T10:00:00.000Z";

/** A fully-specified, valid raw declaration. */
const validRaw = {
  sessionId: "wt-feature-x",
  branch: "claude/real/feature-x",
  workingOn: "Implementing the presence schema for the notice-board story",
  nodes: ["declare-presence"],
  status: "active" as const,
  startedAt: "2026-06-11T09:00:00.000Z",
  lastSeenAt: BASE_LAST_SEEN,
};

// ---------------------------------------------------------------------------
// Contract 1: presence-doc-fail-closed
// ---------------------------------------------------------------------------

describe("presence-doc-fail-closed: schema validation", () => {
  it("parses a fully-specified valid declaration", () => {
    const doc = PresenceDeclaration.parse(validRaw);
    assert.equal(doc.sessionId, "wt-feature-x");
    assert.equal(doc.branch, "claude/real/feature-x");
    assert.equal(doc.workingOn, "Implementing the presence schema for the notice-board story");
    assert.deepEqual(doc.nodes, ["declare-presence"]);
    assert.equal(doc.status, "active");
    assert.equal(doc.startedAt, "2026-06-11T09:00:00.000Z");
    assert.equal(doc.lastSeenAt, BASE_LAST_SEEN);
  });

  it("defaults nodes to empty array when omitted", () => {
    const { nodes: _nodes, ...withoutNodes } = validRaw;
    const doc = PresenceDeclaration.parse(withoutNodes);
    assert.deepEqual(doc.nodes, []);
  });

  it("defaults status to active when omitted", () => {
    const { status: _status, ...withoutStatus } = validRaw;
    const doc = PresenceDeclaration.parse(withoutStatus);
    assert.equal(doc.status, "active");
  });

  // --- sessionId: fail-closed ---

  it("refuses missing sessionId", () => {
    const { sessionId: _, ...raw } = validRaw;
    assert.throws(() => PresenceDeclaration.parse(raw));
  });

  it("refuses blank (empty-string) sessionId", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, sessionId: "" }));
  });

  it("refuses whitespace-only sessionId", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, sessionId: "   " }));
  });

  // --- branch: fail-closed ---

  it("refuses missing branch", () => {
    const { branch: _, ...raw } = validRaw;
    assert.throws(() => PresenceDeclaration.parse(raw));
  });

  it("refuses blank (empty-string) branch", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, branch: "" }));
  });

  it("refuses whitespace-only branch", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, branch: "  " }));
  });

  // --- workingOn: fail-closed ---

  it("refuses missing workingOn", () => {
    const { workingOn: _, ...raw } = validRaw;
    assert.throws(() => PresenceDeclaration.parse(raw));
  });

  it("refuses blank (empty-string) workingOn", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, workingOn: "" }));
  });

  it("refuses whitespace-only workingOn", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, workingOn: "   " }));
  });

  // --- strict mode: unknown fields are rejected, not silently stripped ---

  it("rejects an unknown extra field (strict mode)", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, unexpectedField: "oops" }));
  });

  it("rejects a stored staleness field (unknown in strict mode)", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, staleness: "fresh" }));
  });

  // --- status enum ---

  it("accepts status: done", () => {
    const doc = PresenceDeclaration.parse({ ...validRaw, status: "done" });
    assert.equal(doc.status, "done");
  });

  it("rejects an invalid status value", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, status: "pending" }));
  });
});

// ---------------------------------------------------------------------------
// Contract 2: staleness-is-derived
// ---------------------------------------------------------------------------

describe("staleness-is-derived: freshness is a pure function of lastSeenAt vs now", () => {
  // `baseNow` is the instant of BASE_LAST_SEEN itself (elapsed = 0 → fresh).
  const baseNow = new Date(BASE_LAST_SEEN);

  it("classifies as fresh when elapsed < STALE_THRESHOLD_MS", () => {
    const now = new Date(baseNow.getTime() + STALE_THRESHOLD_MS - 1);
    assert.equal(classifyPresence(BASE_LAST_SEEN, now), "fresh");
  });

  it("classifies as fresh at elapsed = 0", () => {
    assert.equal(classifyPresence(BASE_LAST_SEEN, baseNow), "fresh");
  });

  it("classifies as stale at the exact STALE_THRESHOLD_MS boundary", () => {
    const now = new Date(baseNow.getTime() + STALE_THRESHOLD_MS);
    assert.equal(classifyPresence(BASE_LAST_SEEN, now), "stale");
  });

  it("classifies as stale between stale and possibly-dead thresholds", () => {
    const midpoint = STALE_THRESHOLD_MS + Math.floor((POSSIBLY_DEAD_THRESHOLD_MS - STALE_THRESHOLD_MS) / 2);
    const now = new Date(baseNow.getTime() + midpoint);
    assert.equal(classifyPresence(BASE_LAST_SEEN, now), "stale");
  });

  it("classifies as possibly-dead at the exact POSSIBLY_DEAD_THRESHOLD_MS boundary", () => {
    const now = new Date(baseNow.getTime() + POSSIBLY_DEAD_THRESHOLD_MS);
    assert.equal(classifyPresence(BASE_LAST_SEEN, now), "possibly-dead");
  });

  it("classifies as possibly-dead well beyond the dead threshold", () => {
    const now = new Date(baseNow.getTime() + POSSIBLY_DEAD_THRESHOLD_MS * 3);
    assert.equal(classifyPresence(BASE_LAST_SEEN, now), "possibly-dead");
  });

  it("is deterministic: identical inputs always yield the same band", () => {
    const now = new Date(baseNow.getTime() + STALE_THRESHOLD_MS - 1);
    const r1 = classifyPresence(BASE_LAST_SEEN, now);
    const r2 = classifyPresence(BASE_LAST_SEEN, now);
    assert.equal(r1, r2);
  });

  it("STALE_THRESHOLD_MS is strictly less than POSSIBLY_DEAD_THRESHOLD_MS (bands are ordered)", () => {
    assert.ok(
      STALE_THRESHOLD_MS < POSSIBLY_DEAD_THRESHOLD_MS,
      `STALE_THRESHOLD_MS (${STALE_THRESHOLD_MS}) must be < POSSIBLY_DEAD_THRESHOLD_MS (${POSSIBLY_DEAD_THRESHOLD_MS})`,
    );
  });

  // The doc schema must not carry any staleness field — no "staleness", "stalenessClass",
  // "freshness", etc. — derived state is never stored (ADR-0033 Decision 1).
  it("the doc schema rejects staleness/freshness as a stored field", () => {
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, staleness: "fresh" }));
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, stalenessClass: "stale" }));
    assert.throws(() => PresenceDeclaration.parse({ ...validRaw, freshness: "fresh" }));
  });
});

// ---------------------------------------------------------------------------
// Contract 3: declaration-upsert-merge
// ---------------------------------------------------------------------------

describe("declaration-upsert-merge: mergeDeclaration is pure and stable", () => {
  const existing = PresenceDeclaration.parse(validRaw);
  const laterLastSeen = "2026-06-11T11:00:00.000Z";

  // Anchors: sessionId and startedAt are never moved by a patch.

  it("sessionId is never overwritten by patch (runtime anchor)", () => {
    // Type system prevents this; cast to test the runtime guard too.
    const patch = { sessionId: "hacked-session" } as unknown as PresenceDeclarationPatch;
    const merged = mergeDeclaration(existing, patch);
    assert.equal(merged.sessionId, "wt-feature-x");
  });

  it("startedAt survives any overwrite attempt (runtime anchor)", () => {
    const patch = { startedAt: "1970-01-01T00:00:00.000Z" } as unknown as PresenceDeclarationPatch;
    const merged = mergeDeclaration(existing, patch);
    assert.equal(merged.startedAt, "2026-06-11T09:00:00.000Z");
  });

  // lastSeenAt: patches normally.

  it("lastSeenAt advances when provided in patch", () => {
    const merged = mergeDeclaration(existing, { lastSeenAt: laterLastSeen });
    assert.equal(merged.lastSeenAt, laterLastSeen);
  });

  // Normal patchable fields.

  it("workingOn patches normally", () => {
    const merged = mergeDeclaration(existing, { workingOn: "Updated work description" });
    assert.equal(merged.workingOn, "Updated work description");
  });

  it("branch patches normally", () => {
    const merged = mergeDeclaration(existing, { branch: "claude/real/updated-feature" });
    assert.equal(merged.branch, "claude/real/updated-feature");
  });

  it("nodes patches normally", () => {
    const merged = mergeDeclaration(existing, { nodes: ["declare-presence", "presence-store"] });
    assert.deepEqual(merged.nodes, ["declare-presence", "presence-store"]);
  });

  it("status patches normally (active -> done)", () => {
    const merged = mergeDeclaration(existing, { status: "done" });
    assert.equal(merged.status, "done");
  });

  // undefined fields are ignored: the mergeCommentPatch pattern.

  it("undefined patch fields leave existing values untouched", () => {
    const patch: PresenceDeclarationPatch = {
      workingOn: undefined,
      nodes: undefined,
      status: undefined,
      branch: undefined,
      lastSeenAt: undefined,
    };
    const merged = mergeDeclaration(existing, patch);
    assert.equal(merged.workingOn, existing.workingOn);
    assert.deepEqual(merged.nodes, existing.nodes);
    assert.equal(merged.status, existing.status);
    assert.equal(merged.branch, existing.branch);
    assert.equal(merged.lastSeenAt, existing.lastSeenAt);
  });

  // Non-mutation: inputs are not modified.

  it("does not mutate the existing doc", () => {
    const existingWorkingOn = existing.workingOn;
    const existingLastSeen = existing.lastSeenAt;
    mergeDeclaration(existing, { workingOn: "Mutating?", lastSeenAt: laterLastSeen });
    assert.equal(existing.workingOn, existingWorkingOn);
    assert.equal(existing.lastSeenAt, existingLastSeen);
  });

  // Merge stability: anchors on the result are always from existing.

  it("result carries correct sessionId and startedAt from existing after a normal patch", () => {
    const merged = mergeDeclaration(existing, { lastSeenAt: laterLastSeen });
    assert.equal(merged.sessionId, existing.sessionId);
    assert.equal(merged.startedAt, existing.startedAt);
  });

  it("empty patch returns a doc equal in shape to existing", () => {
    const merged = mergeDeclaration(existing, {});
    assert.equal(merged.sessionId, existing.sessionId);
    assert.equal(merged.branch, existing.branch);
    assert.equal(merged.workingOn, existing.workingOn);
    assert.deepEqual(merged.nodes, existing.nodes);
    assert.equal(merged.status, existing.status);
    assert.equal(merged.startedAt, existing.startedAt);
    assert.equal(merged.lastSeenAt, existing.lastSeenAt);
  });
});

// ---------------------------------------------------------------------------
// Contract 4: reapable-selection (the data-side janitor's pure selector, ADR-0079)
// ---------------------------------------------------------------------------

describe("reapable-selection: reapableSessions picks active AND possibly-dead rows only", () => {
  const NOW = new Date("2026-06-20T12:00:00.000Z");
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  function row(
    sessionId: string,
    lastSeenAt: string,
    status: "active" | "done" = "active",
  ): PresenceDeclarationDoc {
    return {
      sessionId,
      branch: `claude/${sessionId}`,
      workingOn: `work for ${sessionId}`,
      nodes: [],
      status,
      startedAt: "2026-06-10T00:00:00.000Z",
      lastSeenAt,
    };
  }

  it("selects an active possibly-dead row", () => {
    const dead = row("dead", ago(POSSIBLY_DEAD_THRESHOLD_MS));
    assert.deepEqual(reapableSessions([dead], NOW), [dead]);
  });

  it("excludes fresh and stale active rows", () => {
    const fresh = row("fresh", ago(STALE_THRESHOLD_MS - 1));
    const stale = row("stale", ago(STALE_THRESHOLD_MS));
    assert.deepEqual(reapableSessions([fresh, stale], NOW), []);
  });

  it("excludes a possibly-dead row that is already done (defensive: status gates too)", () => {
    const doneDead = row("done-dead", ago(POSSIBLY_DEAD_THRESHOLD_MS * 5), "done");
    assert.deepEqual(reapableSessions([doneDead], NOW), []);
  });

  it("picks exactly the possibly-dead actives out of a mixed set, preserving order", () => {
    const fresh = row("fresh", ago(60_000));
    const dead1 = row("dead1", ago(POSSIBLY_DEAD_THRESHOLD_MS));
    const stale = row("stale", ago(STALE_THRESHOLD_MS + 1));
    const dead2 = row("dead2", ago(POSSIBLY_DEAD_THRESHOLD_MS * 10));
    const result = reapableSessions([fresh, dead1, stale, dead2], NOW);
    assert.deepEqual(
      result.map((d) => d.sessionId),
      ["dead1", "dead2"],
    );
  });

  it("returns [] for an empty input and does not read the clock itself", () => {
    assert.deepEqual(reapableSessions([], NOW), []);
  });
});
