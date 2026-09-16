import assert from "node:assert/strict";
import test from "node:test";

import { openPinnedCodexDetachedThread } from "./index.js";

test("detached-codex-thread-is-staged-owned-and-bounded: stages one authenticated POSIX thread, then uses and terminates that exact owner", async () => {
  const authCommands: unknown[] = [];
  const spawnCommands: unknown[] = [];
  const protocol: unknown[] = [];
  const ownershipRequests: unknown[] = [];
  const terminationRequests: unknown[] = [];
  let events: {
    stdout(chunk: string): void;
    exit(code: number | null, signal: NodeJS.Signals | null): void;
  } | undefined;
  let ended = 0;

  const result = await openPinnedCodexDetachedThread({
    cwd: process.cwd(),
    env: {
      STORYTREE_SAFE_VALUE: "kept",
      OPENAI_API_KEY: "metered",
      Codex_Access_Token: "metered-too",
    },
    model: "requested-model",
    reasoningEffort: "requested-effort",
    platform: "posix",
    timeoutMs: 100,
    authRunner: async (command: unknown) => {
      authCommands.push(command);
      return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
    },
    spawn: (command: unknown, nextEvents: typeof events) => {
      spawnCommands.push(command);
      events = nextEvents;
      return {
        pid: 431,
        write: (line: string) => {
          const message = JSON.parse(line) as { id?: number; method?: string; params?: unknown };
          protocol.push(message);
          if (message.method === "initialize") {
            nextEvents?.stdout(JSON.stringify({ id: message.id, result: { serverInfo: { name: "codex" } } }) + "\n");
          }
          if (message.method === "thread/start") {
            nextEvents?.stdout(JSON.stringify({
              id: message.id,
              result: {
                thread: {
                  id: "response-thread",
                  model: "response-model",
                  reasoningEffort: "response-effort",
                },
              },
            }) + "\n");
          }
          if (message.method === "turn/start") {
            nextEvents?.stdout(JSON.stringify({
              id: message.id,
              result: { turn: { id: "response-turn", status: "accepted" } },
            }) + "\n");
          }
          if (message.method === "account/rateLimits/read") {
            nextEvents?.stdout(JSON.stringify({
              id: message.id,
              result: { rateLimits: { primary: null, secondary: null } },
            }) + "\n");
          }
        },
        end: () => { ended += 1; },
      };
    },
    observeOwnership: async (request: unknown) => {
      ownershipRequests.push(request);
      return { kind: "posix-process-group", rootPid: 431, token: "owned-group" };
    },
    terminateOwnedTree: async (owner: unknown) => {
      terminationRequests.push(owner);
    },
  });

  assert.deepEqual(authCommands, [{ args: ["login", "status"], timeoutMs: 100 }]);
  assert.equal(spawnCommands.length, 1, "auth completes before exactly one detached spawn");
  assert.match(JSON.stringify(spawnCommands[0]), /app-server/);
  assert.match(JSON.stringify(spawnCommands[0]), /--stdio/);
  assert.equal(JSON.stringify(spawnCommands[0]).includes("metered"), false, "metered credentials are scrubbed");
  assert.deepEqual(ownershipRequests, [{ pid: 431, platform: "posix", timeoutMs: 100 }]);
  assert.deepEqual(
    protocol.map((message) => (message as { method?: string }).method),
    ["initialize", "initialized", "thread/start"],
  );
  assert.equal(protocol.some((message) => (message as { method?: string }).method === "turn/start"), false);
  assert.deepEqual(
    { threadId: result.threadId, model: result.model, reasoningEffort: result.reasoningEffort, pid: result.pid, owner: result.owner },
    {
      threadId: "response-thread",
      model: "response-model",
      reasoningEffort: "response-effort",
      pid: 431,
      owner: { kind: "posix-process-group", rootPid: 431, token: "owned-group" },
    },
  );

  assert.deepEqual(await result.probe(), {
    live: true,
    rateLimits: { primary: null, secondary: null },
  });
  assert.deepEqual(await result.startTurn("  do the bounded work  "), {
    turnId: "response-turn",
    status: "accepted",
  });
  assert.equal(spawnCommands.length, 1, "turns and probes reuse the staged app-server");
  assert.deepEqual(
    protocol.map((message) => (message as { method?: string }).method),
    ["initialize", "initialized", "thread/start", "account/rateLimits/read", "turn/start"],
  );

  await Promise.all([result.terminate(), result.terminate()]);
  await result.terminate();
  assert.equal(ended, 1, "termination closes the one protocol channel once");
  assert.deepEqual(terminationRequests, [{ kind: "posix-process-group", rootPid: 431, token: "owned-group" }]);
  events?.exit(0, null);
});

test("detached-codex-thread-is-staged-owned-and-bounded: rejects an ownership token that is blank and cleans up that exact root", async () => {
  const terminated: unknown[] = [];

  await assert.rejects(
    openPinnedCodexDetachedThread({
      cwd: process.cwd(),
      model: "requested-model",
      reasoningEffort: "requested-effort",
      platform: "posix",
      authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
      spawn: (_command, events) => ({
        pid: 432,
        write: (line) => {
          const message = JSON.parse(line) as { id?: number; method?: string };
          if (message.method === "initialize") {
            events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          }
          if (message.method === "thread/start") {
            events.stdout(`${JSON.stringify({
              id: message.id,
              result: { thread: { id: "thread", model: "model", reasoningEffort: "effort" } },
            })}\n`);
          }
        },
        end: () => undefined,
      }),
      observeOwnership: async () => ({ kind: "posix-process-group", rootPid: 432, token: "" }),
      terminateOwnedTree: async (owner) => { terminated.push(owner); },
    }),
    /exact Codex process ownership was not acquired/,
  );

  assert.deepEqual(terminated, [{ kind: "posix-process-group", rootPid: 432, token: "" }]);
});
