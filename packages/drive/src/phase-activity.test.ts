import { test } from "node:test";
import assert from "node:assert/strict";

import { WorkEventDoc } from "@storytree/proof-protocol";
import type { BuildPhase } from "@storytree/proof-protocol";

import { phaseActivityWriter } from "./phase-activity.js";

// ── ADR-0048 §3 v2: the CLI-drive owns the phase WRITE (not the gate) ────────
//
// The orchestrator stays pure (ADR-0048 "No orchestrator impurity"): proveUnit
// only INVOKES an injected onPhase observer. The activity WRITE — a fresh
// phase-stamped `building` work-event per transition — lives HERE in the drive,
// exactly where the initial `building` mark is written. `phaseActivityWriter`
// builds that onPhase callback over an injected store, so it is red-green offline
// with a fake store (no DB, no worktree, no SDK).

/** A fake append-only store recording every event it is handed. */
function recordingStore(): {
  appendEvent: (e: { id: string; kind: string; type: string; doc: unknown; actor?: string }) => Promise<void>;
  events: { id: string; kind: string; type: string; doc: unknown; actor?: string }[];
} {
  const events: { id: string; kind: string; type: string; doc: unknown; actor?: string }[] = [];
  return {
    events,
    appendEvent: async (e) => {
      events.push(e);
    },
  };
}

test("phaseActivityWriter appends one phase-stamped `building` work-event per phase", async () => {
  const store = recordingStore();
  const onPhase = phaseActivityWriter(store, {
    unitId: "stories/library",
    runId: "real-abc",
    tier: "story",
    signer: "sandbox:opus",
  });

  // drive the whole gate walk through the writer.
  for (const phase of ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"] as const) {
    await onPhase(phase);
  }

  // one event per phase, all `building` (NO new lifecycle word — ADR-0048).
  assert.equal(store.events.length, 5);
  const docs = store.events.map((e) => WorkEventDoc.parse(e.doc));
  assert.deepEqual(
    docs.map((d) => d.phase),
    ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"],
  );
  assert.ok(docs.every((d) => d.event === "building"), "every phase mark stays a `building` event");
  // the build identity rides every row so inFlightBuilds keys it to the right unit/run.
  assert.ok(docs.every((d) => d.unitId === "stories/library" && d.runId === "real-abc" && d.tier === "story"));
  // the work-event id is the runId:unitId shape (so a later phase upserts the same logical mark).
  assert.ok(store.events.every((e) => e.id === "real-abc:stories/library"));
  assert.ok(store.events.every((e) => e.kind === "work" && e.actor === "sandbox:opus"));
});

test("phaseActivityWriter omits tier when none is given (optional column)", async () => {
  const store = recordingStore();
  const onPhase = phaseActivityWriter(store, {
    unitId: "u",
    runId: "r",
    signer: "s",
  });
  const phase: BuildPhase = "CONFIRM_RED";
  await onPhase(phase);
  const doc = WorkEventDoc.parse(store.events[0]?.doc);
  assert.equal(doc.tier, undefined);
  assert.equal(doc.phase, "CONFIRM_RED");
  assert.equal(doc.event, "building");
});

test("phaseActivityWriter is a no-op-safe append — a store failure never throws into the gate", async () => {
  // The phase write is ADVISORY (like withPresence): a board/DB hiccup must never
  // fail the build it is observing. A throwing store is swallowed.
  const onPhase = phaseActivityWriter(
    {
      appendEvent: async () => {
        throw new Error("DB down mid-build");
      },
    },
    { unitId: "u", runId: "r", signer: "s" },
  );
  await assert.doesNotReject(() => Promise.resolve(onPhase("GATE")));
});
