/**
 * Integration tests for the chat spawn-trace surface (chat-spawn-trace-events capability,
 * story spawn-visibility — FIX 1, ADR-0137 Phase 3 / ADR-0112 / ADR-0138 §4).
 *
 * The spawn-boundary traces ALREADY FIRE (spawn-deps.ts emits `spawn_started` / `spawn_finished`
 * into the claim gate's `onTrace`) but the gate swallows them after bumping the heartbeat. This
 * capability TYPES the trace (`SpawnTrace`) and threads it OUT of `startChatStream` as a new
 * NON-terminal `ChatStreamSpawnEvent` on the SAME delta FIFO — additive, ordered, and WITHOUT
 * stealing the heartbeat bump.
 *
 * These tests drive the REAL `startChatStream` wrap end-to-end, offline:
 *   - a scripted spawn double whose `spawnStoryAuthor`, when invoked, fires the two boundary traces
 *     on the `onTrace` it receives (and whose claim store records each `bumpHeartbeat`);
 *   - a scripted `queryFn` that, once the session's headless runner mounts the spawn MCP server,
 *     INVOKES `mcp__spawn__spawn_story_author` through the mounted server instance — the offline
 *     equivalent of the live SDK dispatching the tool — so the trace flows through the REAL
 *     claim gate → the REAL chat-stream wrap → the REAL delta FIFO. No stub is asserted against.
 *
 * Contracts (stories/spawn-visibility/chat-spawn-trace-events.md):
 *   cst-spawn-trace-surfaces-as-ordered-event
 *   cst-trace-both-surfaces-and-bumps
 *   cst-no-spawn-events-without-spawn-deps
 *
 * OFFLINE only — the `queryFn` seam is injected; no live SDK spend (ADR-0010 §5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";
import type { SdkQueryFn } from "@storytree/agent";

import { startChatStream } from "./chat-stream.js";
import type { ChatStreamEvent, ChatStreamSpawnEvent } from "./chat-stream.js";
import type { SpawnSurfaceDeps } from "./spawn-deps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain an async iterable of chat events into an array. */
async function drain(gen: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

const OK_SDK_RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 2,
  total_cost_usd: 0.01,
  result: "I propose: surface the spawn trace on the chat stream.",
};

/** Build an SDK partial-assistant streaming message carrying one text-delta fragment. */
function textDeltaMessage(text: string): unknown {
  return {
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    parent_tool_use_id: null,
    uuid: "u",
    session_id: "s",
  };
}

/** Structural view of the mounted in-process MCP server the headless runner composes. The tool
 *  callbacks live on the private `_registeredTools` map — invoking one here is the offline
 *  equivalent of the live SDK dispatching the tool (it drives the REAL wrapped deps + claim gate). */
interface MountedMcpServer {
  instance?: {
    _registeredTools?: Record<
      string,
      { handler: (args: unknown, extra: unknown) => Promise<unknown> }
    >;
  };
}

/**
 * A scripted `queryFn` that, mid-session, invokes the mounted `spawn_story_author` tool through the
 * SPAWN MCP server the headless runner composed from `startChatStream`'s WRAPPED deps — so the trace
 * flows through the real wrap. It optionally streams a delta before/after the spawn to prove the
 * spawn events interleave with deltas in arrival order, then yields the terminal result.
 */
function queryDrivingSpawn(opts?: {
  unitId?: string;
  deltasBefore?: string[];
  deltasAfter?: string[];
}): { fn: SdkQueryFn; spawnInvoked: () => boolean } {
  let invoked = false;
  const fn: SdkQueryFn = ({ options }) => {
    const servers = (options as { mcpServers?: Record<string, MountedMcpServer> }).mcpServers ?? {};
    return (async function* () {
      for (const d of opts?.deltasBefore ?? []) yield textDeltaMessage(d);

      // Dispatch the spawn tool exactly as the live SDK would — through the mounted server instance.
      const spawn = servers["spawn"];
      const registered = spawn?.instance?._registeredTools ?? {};
      const storyAuthor = registered["spawn_story_author"];
      assert.ok(
        storyAuthor !== undefined,
        "the spawn MCP server must mount spawn_story_author when spawn deps are forwarded",
      );
      invoked = true;
      // Awaiting the handler runs the real claim gate → the real wrapped spawnStoryAuthor → the
      // real composed onTrace, which pushes the spawn events onto the stream's FIFO synchronously
      // with this await (before the terminal result yields below).
      await storyAuthor.handler({ unitId: opts?.unitId ?? "story-x", userPrompt: "author it" }, {});

      for (const d of opts?.deltasAfter ?? []) yield textDeltaMessage(d);

      yield OK_SDK_RESULT;
    })();
  };
  return { fn, spawnInvoked: () => invoked };
}

/**
 * A recording spawn double: `spawnStoryAuthor`, when invoked, fires `spawn_started` then
 * `spawn_finished` on the `onTrace` it receives (the claim gate's heartbeat sink, composed by the
 * chat-stream wrap). Its claim store counts every `bumpHeartbeat` so the ADR-0138 §4 signal can be
 * asserted preserved. `store.claim` always grants.
 */
function recordingSpawnDouble(opts?: { bumps?: { count: number }; unitId?: string }): SpawnSurfaceDeps {
  const bumps = opts?.bumps;
  const unitId = opts?.unitId ?? "story-x";
  return {
    store: {
      claim: async (req) => ({
        acquired: true as const,
        claim: {
          unitId: req.unitId,
          sessionId: req.sessionId,
          branch: req.branch,
          intent: req.intent ?? "orchestrate",
          claimedAt: "2026-07-03T00:00:00.000Z",
          heartbeatAt: "2026-07-03T00:00:00.000Z",
        },
        reclaimed: false,
      }),
      bumpHeartbeat: async () => {
        if (bumps !== undefined) bumps.count += 1;
      },
    },
    sessionId: "sess-chat",
    branch: "claude/sess-chat",
    spawnStoryAuthor: async (_args, onTrace) => {
      // The two boundary traces the real spawn-deps composition emits, in order — the chat-stream
      // wrap composes this onTrace so each ALSO surfaces a `spawn` event on the FIFO.
      onTrace({ type: "spawn_started", role: "story-author", unitId });
      onTrace({ type: "spawn_finished", role: "story-author", unitId, ok: true });
      return "story-author spawn summary";
    },
    spawnBuilder: async () => "builder dispatched",
  };
}

/** Filter the spawn events out of a drained stream, in arrival order. */
function spawnEvents(events: ChatStreamEvent[]): ChatStreamSpawnEvent[] {
  return events.filter((e): e is ChatStreamSpawnEvent => e.type === "spawn");
}

// ---------------------------------------------------------------------------
// cst-spawn-trace-surfaces-as-ordered-event — a fired trace becomes an ordered
// non-terminal `spawn` event on the same FIFO the deltas use
// ---------------------------------------------------------------------------

test(
  "cst-spawn-trace-surfaces-as-ordered-event: a spawn firing spawn_started then spawn_finished yields two ordered `spawn` events, interleaved with deltas, before the terminal `done`",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const q = queryDrivingSpawn({
      unitId: "story-x",
      deltasBefore: ["Orient"],
      deltasAfter: ["done."],
    });

    const events = await drain(
      startChatStream({
        intent: "Orient and spawn as needed.",
        store,
        queryFn: q.fn,
        spawn: recordingSpawnDouble({ unitId: "story-x" }),
      }),
    );

    assert.ok(q.spawnInvoked(), "the scripted session must actually invoke the spawn tool");

    // Exactly two spawn events, in phase order, carrying role/unitId/ok.
    const spawns = spawnEvents(events);
    assert.equal(
      spawns.length,
      2,
      `exactly two spawn events must surface (started, finished); got ${JSON.stringify(spawns)}`,
    );
    assert.deepEqual(
      spawns[0],
      { type: "spawn", phase: "started", role: "story-author", unitId: "story-x" },
      "the first spawn event is the started boundary (no `ok` on started)",
    );
    assert.deepEqual(
      spawns[1],
      { type: "spawn", phase: "finished", role: "story-author", unitId: "story-x", ok: true },
      "the second spawn event is the finished boundary, carrying ok",
    );

    // The spawn events are NON-terminal: both precede the single terminal `done`.
    const doneIdx = events.findIndex((e) => e.type === "done");
    assert.ok(doneIdx !== -1, "the stream must terminate with a `done` event");
    const spawnIdxs = events
      .map((e, i) => (e.type === "spawn" ? i : -1))
      .filter((i) => i !== -1);
    for (const i of spawnIdxs) {
      assert.ok(i < doneIdx, "every spawn event must precede the terminal `done`");
    }

    // Interleaving with deltas is preserved in arrival order: delta "Orient", then the two spawns,
    // then delta "done." — the started boundary fires before the finished boundary throughout.
    const timeline = events
      .filter((e) => e.type === "delta" || e.type === "spawn")
      .map((e) => (e.type === "delta" ? `delta:${e.text}` : `spawn:${(e as ChatStreamSpawnEvent).phase}`));
    assert.deepEqual(
      timeline,
      ["delta:Orient", "spawn:started", "spawn:finished", "delta:done."],
      `spawn and delta events must interleave in arrival order; got ${JSON.stringify(timeline)}`,
    );

    // The terminal event is `done` with the authoritative proposal.
    const last = events[events.length - 1];
    assert.equal(last?.type, "done", "the terminal event is `done`");
    assert.equal(
      last?.type === "done" ? last.proposal : undefined,
      OK_SDK_RESULT.result,
      "the terminal `done` carries the authoritative proposal",
    );
  },
);

// ---------------------------------------------------------------------------
// cst-trace-both-surfaces-and-bumps — surfacing the trace does not steal the
// heartbeat (ADR-0138 §4): each trace BOTH surfaces AND bumps
// ---------------------------------------------------------------------------

test(
  "cst-trace-both-surfaces-and-bumps: each fired trace BOTH surfaces a `spawn` event AND bumps the claim heartbeat (the drive-side wrap is additive, never a theft)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const bumps = { count: 0 };
    const q = queryDrivingSpawn({ unitId: "story-x" });

    const events = await drain(
      startChatStream({
        intent: "Orient and spawn as needed.",
        store,
        queryFn: q.fn,
        spawn: recordingSpawnDouble({ bumps, unitId: "story-x" }),
      }),
    );

    // Both traces surfaced on the stream…
    const spawns = spawnEvents(events);
    assert.equal(spawns.length, 2, "both boundary traces surface as `spawn` events");

    // …AND both bumped the claim heartbeat through the gate's store (the ADR-0138 §4 signal is
    // preserved, not stolen): the double's spawnStoryAuthor called onTrace twice, and each onTrace
    // inside claimGatedSpawn fires exactly one bumpHeartbeat.
    assert.equal(
      bumps.count,
      2,
      `each of the two traces must bump the claim heartbeat (a live spawn never ages into ` +
        `stale-reclaim while the transcript shows it running); got ${bumps.count} bump(s)`,
    );
  },
);

// ---------------------------------------------------------------------------
// cst-no-spawn-events-without-spawn-deps — additive, absent-deps-byte-identical
// ---------------------------------------------------------------------------

test(
  "cst-no-spawn-events-without-spawn-deps: startChatStream WITHOUT spawn deps yields NO `spawn` event (byte-identical to today's surface)",
  async () => {
    const store = new InMemoryStore();
    await loadCorpus(store);

    const events = await drain(
      startChatStream({
        intent: "Orient and propose.",
        store,
        queryFn: () =>
          (async function* () {
            yield textDeltaMessage("Orient");
            yield OK_SDK_RESULT;
          })(),
        // No spawn deps — no spawn handlers mount, no trace fires, no event.
      }),
    );

    assert.equal(
      spawnEvents(events).length,
      0,
      "no `spawn` event may appear without spawn deps (the §7 scale-down: no deps, no trace, no event)",
    );

    // The rest of the surface is unchanged: the delta and the terminal done still flow.
    const last = events[events.length - 1];
    assert.equal(last?.type, "done", "the stream still terminates with a `done` event");
    assert.ok(
      events.some((e) => e.type === "delta"),
      "delta events still surface without spawn deps",
    );
  },
);
