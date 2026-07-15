import { test } from "node:test";
import assert from "node:assert/strict";

import { WorkEventDoc } from "@storytree/proof-protocol";
import type { BuildPhase } from "@storytree/proof-protocol";

import { phaseActivityWriter } from "./phase-activity.js";
import { subagentColourState } from "./subagent-colour.js";

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
  // The phase write is ADVISORY: a board/DB hiccup must never
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

// ── ADR-0138 §5: writer-stamps-the-subagent-colour-state ─────────────────────
//
// C2 (colour-by-subagent): when the target carries the active subagent role/intent, the writer
// stamps the resolved `colourState` token (authoring / proving / supplementing) onto the SAME
// `building` doc, alongside the gate phase — so the wisp colours by what the orchestrator is doing
// on the claimed story, not only the red→green phase. The honesty wall holds: the token is never
// `green`/`bloom` (a claim colour is never a proof, ADR-0045 / ADR-0099).

test("writer-stamps-the-subagent-colour-state: phaseActivityWriter stamps the subagent colour-state alongside the phase", async () => {
  const store = recordingStore();
  const onPhase = phaseActivityWriter(store, {
    unitId: "stories/library",
    runId: "real-abc",
    tier: "story",
    signer: "sandbox:opus",
    subagentRole: "proving", // the red→green leaf is running under the claim
  });

  for (const phase of ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"] as const) {
    await onPhase(phase);
  }

  const docs = store.events.map((e) => WorkEventDoc.parse(e.doc));
  // every mark carries the role colour-state token, so inFlightBuilds() can read the role colour.
  assert.ok(
    docs.every((d) => d.colourState === subagentColourState("proving")),
    "every phase mark stamps the resolved subagent colour-state token",
  );
  // it rides ALONGSIDE the live gate phase (both axes present — the phase walk is unchanged).
  assert.deepEqual(
    docs.map((d) => d.phase),
    ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"],
  );
  // honesty wall: the stamped colour-state is NEVER a proven-green/bloom token (ADR-0138 §5).
  assert.ok(
    docs.every((d) => d.colourState !== undefined && !["green", "bloom"].includes(d.colourState)),
    "a claim colour-state is never the proven-green bloom",
  );
});

test("writer-stamps-the-subagent-colour-state: a claim INTENT resolves to the same colour-state as its role", async () => {
  // The spine may carry a claim intent ("edit" | "real" | "orchestrate") instead of an explicit role;
  // the writer resolves it through the same pure mapping (an "edit" claim colours like "authoring").
  const store = recordingStore();
  const onPhase = phaseActivityWriter(store, {
    unitId: "u",
    runId: "r",
    signer: "s",
    subagentRole: "edit",
  });
  await onPhase("AUTHOR_TEST");
  const doc = WorkEventDoc.parse(store.events[0]?.doc);
  assert.equal(doc.colourState, subagentColourState("authoring"));
});

test("phaseActivityWriter omits colourState when no subagent role is given (back-compat)", async () => {
  // A build with no known subagent role (the pre-ADR-0138 path) writes NO colour-state — the doc is
  // byte-identical to the old phase-only mark, so the wisp falls back to the coarse phase band.
  const store = recordingStore();
  const onPhase = phaseActivityWriter(store, { unitId: "u", runId: "r", signer: "s" });
  await onPhase("CONFIRM_RED");
  const doc = WorkEventDoc.parse(store.events[0]?.doc);
  assert.equal(doc.colourState, undefined);
  assert.equal(doc.phase, "CONFIRM_RED");
});
