import assert from "node:assert/strict";
import test from "node:test";

import { openPinnedCodexDetachedThread } from "./index.js";

test("staged-protocol-returns-response-produced-identity: stages one authenticated host-owned thread, then uses and terminates that exact owner", async () => {
  const hostPlatform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const hostOwnerKind = hostPlatform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const;
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
    platform: hostPlatform,
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
      return { kind: hostOwnerKind, rootPid: 431, token: "owned-group" };
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
  assert.deepEqual(ownershipRequests, [{ pid: 431, platform: hostPlatform, timeoutMs: 100 }]);
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
      owner: { kind: hostOwnerKind, rootPid: 431, token: "owned-group" },
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
  assert.deepEqual(terminationRequests, [{ kind: hostOwnerKind, rootPid: 431, token: "owned-group" }]);
  events?.exit(0, null);
});

test("invalid-protocol-identity-and-turn-fail-closed: rejects an ownership token that is blank and cleans up that exact root", async () => {
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

test("platform-owner-distinguishes-posix-group-from-windows-tree: refuses a caller-selected ownership platform that contradicts this host", async () => {
  const hostPlatform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const contradictoryPlatform = hostPlatform === "windows" ? "posix" as const : "windows" as const;
  const contradictoryKind = contradictoryPlatform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const;
  const terminated: unknown[] = [];

  await assert.rejects(
    openPinnedCodexDetachedThread({
      cwd: process.cwd(),
      model: "requested-model",
      reasoningEffort: "requested-effort",
      platform: contradictoryPlatform,
      authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
      spawn: (_command, events) => ({
        pid: 433,
        write: (line) => {
          const message = JSON.parse(line) as { id?: number; method?: string };
          if (message.method === "initialize") {
            events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          }
          if (message.method === "thread/start") {
            events.stdout(`${JSON.stringify({
              id: message.id,
              result: { thread: { id: "wrong-platform-thread", model: "model", reasoningEffort: "effort" } },
            })}\n`);
          }
        },
        end: () => undefined,
      }),
      observeOwnership: async () => ({ kind: contradictoryKind, rootPid: 433, token: "host-mismatch" }),
      terminateOwnedTree: async (owner) => { terminated.push(owner); },
    }),
    /exact Codex process ownership was not acquired/,
  );

  assert.deepEqual(terminated, [{ kind: contradictoryKind, rootPid: 433, token: "host-mismatch" }]);
});

test("production-defaults-authenticate-before-detached-spawn: an authentication refusal creates no app-server", async () => {
  let spawns = 0;

  await assert.rejects(
    openPinnedCodexDetachedThread({
      cwd: process.cwd(),
      model: "requested-model",
      reasoningEffort: "requested-effort",
      platform: process.platform === "win32" ? "windows" : "posix",
      authRunner: async () => ({ code: 0, stdout: "Logged in using an API key\n", stderr: "" }),
      spawn: () => {
        spawns += 1;
        throw new Error("an unauthenticated open must not spawn");
      },
    }),
    /not authenticated/,
  );

  assert.equal(spawns, 0);
});

test("probe-reads-os-liveness-and-same-app-server-limits: re-observes the exact owner rather than treating local intent as liveness", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const owner = {
    kind: platform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const,
    rootPid: 434,
    token: "exact-owner",
  };
  let ownershipObservations = 0;
  let events: { stdout(chunk: string): void } | undefined;

  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(),
    model: "requested-model",
    reasoningEffort: "requested-effort",
    platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, nextEvents) => {
      events = nextEvents;
      return {
        pid: 434,
        write: (line) => {
          const message = JSON.parse(line) as { id?: number; method?: string };
          if (message.method === "initialize") nextEvents.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
          if (message.method === "thread/start") nextEvents.stdout(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread", model: "resolved", reasoningEffort: "high" } } })}\n`);
          if (message.method === "account/rateLimits/read") nextEvents.stdout(`${JSON.stringify({ id: message.id, result: { rateLimits: { primary: null } } })}\n`);
        },
        end: () => undefined,
      };
    },
    observeOwnership: async () => {
      ownershipObservations += 1;
      return owner;
    },
    terminateOwnedTree: async () => undefined,
  });

  assert.deepEqual(await thread.probe(), { live: true, rateLimits: { primary: null } });
  assert.equal(ownershipObservations, 2, "probe must observe the owner again on the OS, not infer it from local state");
  await thread.terminate();
  events = undefined;
});

test("probe-tristate-and-same-channel-rate-limits: preserves an unavailable exact-owner observation without issuing a rate-limit request", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const owner = {
    kind: platform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const,
    rootPid: 437,
    token: "unavailable-owner",
  };
  const protocol: string[] = [];

  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "requested-model", reasoningEffort: "requested-effort", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({
      pid: 437,
      write: (line) => {
        const message = JSON.parse(line) as { id?: number; method?: string };
        if (message.method !== undefined) protocol.push(message.method);
        if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        if (message.method === "thread/start") {
          events.stdout(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread", model: "resolved", reasoningEffort: "high" } } })}\n`);
        }
      },
      end: () => undefined,
    }),
    observeOwnership: async () => owner,
    observeLiveness: async () => undefined,
    terminateOwnedTree: async () => undefined,
  });

  assert.deepEqual(await thread.probe(), { live: "unavailable", rateLimits: undefined });
  assert.deepEqual(protocol, ["initialize", "initialized", "thread/start"]);
});

test("termination-reaps-the-exact-owned-tree-and-confirms-death: concurrent termination shares one exact-tree command", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const owner = {
    kind: platform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const,
    rootPid: 435,
    token: "owned-tree",
  };
  const terminated: unknown[] = [];

  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "requested-model", reasoningEffort: "requested-effort", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({
      pid: 435,
      write: (line) => {
        const message = JSON.parse(line) as { id?: number; method?: string };
        if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        if (message.method === "thread/start") events.stdout(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread", model: "resolved", reasoningEffort: "high" } } })}\n`);
      },
      end: () => undefined,
    }),
    observeOwnership: async () => owner,
    observeLiveness: async () => false,
    terminateOwnedTree: async (observedOwner) => { terminated.push(observedOwner); },
  });

  await Promise.all([thread.terminate(), thread.terminate()]);
  await thread.terminate();
  assert.deepEqual(terminated, [owner]);
});

test("invalid-protocol-identity-and-turn-fail-closed: a blank turn prompt reaps the staged exact owner and leaves it not live", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const owner = {
    kind: platform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const,
    rootPid: 436,
    token: "blank-turn-owner",
  };
  const terminated: unknown[] = [];
  let live = true;

  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "requested-model", reasoningEffort: "requested-effort", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({
      pid: 436,
      write: (line) => {
        const message = JSON.parse(line) as { id?: number; method?: string };
        if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
        if (message.method === "thread/start") events.stdout(`${JSON.stringify({ id: message.id, result: { thread: { id: "thread", model: "resolved", reasoningEffort: "high" } } })}\n`);
      },
      end: () => undefined,
    }),
    observeOwnership: async () => owner,
    observeLiveness: async () => live,
    terminateOwnedTree: async (observedOwner) => { terminated.push(observedOwner); live = false; },
  });

  await assert.rejects(thread.startTurn("   "), /turn prompt must not be blank/);
  assert.deepEqual(terminated, [owner], "a rejected turn start closes the exact staged tree");
  assert.deepEqual(await thread.probe(), { live: false, rateLimits: undefined });
});

test("auth-refusal-and-timeout-never-spawn: every non-managed authentication observation refuses before spawn", async () => {
  for (const auth of [
    { code: 1, stdout: "", stderr: "not logged in" },
    { code: 0, stdout: "Logged in using an API key\n", stderr: "" },
    { code: null, stdout: "Logged in using ChatGPT\n", stderr: "", timedOut: true as const },
  ]) {
    let spawns = 0;
    await assert.rejects(openPinnedCodexDetachedThread({
      cwd: process.cwd(), model: "m", reasoningEffort: "e",
      platform: process.platform === "win32" ? "windows" : "posix",
      authRunner: async () => auth,
      spawn: () => { spawns += 1; throw new Error("must not spawn"); },
    }), /not authenticated/);
    assert.equal(spawns, 0);
  }
});

test("pinned-command-scrubs-env-and-spawns-detached: successful auth creates one scrubbed pinned command", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const commands: unknown[] = [];
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), env: { KEEP: "yes", openai_api_key: "metered" }, model: "m", reasoningEffort: "e", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (command) => { commands.push(command); return { pid: 0, write: () => undefined, end: () => undefined }; },
  }), /positive pid/);
  assert.equal(commands.length, 1);
  assert.match(JSON.stringify(commands[0]), /app-server/);
  assert.match(JSON.stringify(commands[0]), /--stdio/);
  assert.equal(JSON.stringify(commands[0]).includes("metered"), false);
  assert.match(JSON.stringify(commands[0]), /KEEP/);
});

test("posix-group-owner-is-observed-probed-and-terminated: the published POSIX owner remains rooted at the spawned pid", async () => {
  if (process.platform === "win32") return;
  const seen: unknown[] = [];
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform: "posix", timeoutMs: 20,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: () => ({ pid: 71, write: () => undefined, end: () => undefined }),
    observeOwnership: async (request) => { seen.push(request); return { kind: "posix-process-group", rootPid: 71, token: "71" }; },
    terminateOwnedTree: async () => undefined,
  }), /timed out/);
  assert.deepEqual(seen[0], { pid: 71, platform: "posix", timeoutMs: 20 });
});

test("windows-tree-owner-is-observed-probed-and-terminated: a Windows owner is never accepted as a POSIX group", async () => {
  if (process.platform === "win32") return;
  const terminated: unknown[] = [];
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform: "posix",
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: () => ({ pid: 72, write: () => undefined, end: () => undefined }),
    observeOwnership: async () => ({ kind: "windows-process-tree", rootPid: 72, token: "72" }),
    terminateOwnedTree: async (owner) => { terminated.push(owner); },
  }), /ownership/);
  assert.deepEqual(terminated, [{ kind: "windows-process-tree", rootPid: 72, token: "72" }]);
});

test("owner-validation-rejects-invalid-pid-root-kind-and-token: an invalid child pid is rejected and its channel is closed", async () => {
  let ended = 0;
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform: process.platform === "win32" ? "windows" : "posix",
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: () => ({ pid: 0, write: () => undefined, end: () => { ended += 1; } }),
  }), /positive pid/);
  assert.equal(ended, 1);
});

test("ownership-acquisition-failure-reaps-spawned-child: unavailable ownership closes the just-spawned protocol channel", async () => {
  let ended = 0;
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform: process.platform === "win32" ? "windows" : "posix",
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: () => ({ pid: 73, write: () => undefined, end: () => { ended += 1; } }),
    observeOwnership: async () => undefined,
  }), /ownership/);
  assert.equal(ended, 1);
});

test("initialize-notification-thread-order-returns-response-identity: opening does not begin a turn", async () => {
  const methods: string[] = [];
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "requested", reasoningEffort: "requested", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({ pid: 74, end: () => undefined, write: (line) => {
      const message = JSON.parse(line) as { id?: number; method: string }; methods.push(message.method);
      if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
      if (message.method === "thread/start") events.stdout(`${JSON.stringify({ id: message.id, result: { thread: { id: "response", model: "actual", reasoningEffort: "high" } } })}\n`);
    } }),
    observeOwnership: async () => ({ kind: platform === "windows" ? "windows-process-tree" : "posix-process-group", rootPid: 74, token: "74" }),
    observeLiveness: async () => false, terminateOwnedTree: async () => undefined,
  });
  assert.deepEqual({ threadId: thread.threadId, model: thread.model, reasoningEffort: thread.reasoningEffort }, { threadId: "response", model: "actual", reasoningEffort: "high" });
  assert.deepEqual(methods, ["initialize", "initialized", "thread/start"]);
});

test("jsonl-fragments-and-correlates-responses: split JSONL responses resolve the matching request", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({ pid: 75, end: () => undefined, write: (line) => {
      const message = JSON.parse(line) as { id?: number; method: string };
      const result = message.method === "initialize" ? {} : { thread: { id: "fragment-thread", model: "m", reasoningEffort: "e" } };
      const response = JSON.stringify({ id: message.id, result }) + "\n";
      if (message.method !== "initialized") { events.stdout(response.slice(0, 8)); events.stdout(response.slice(8)); }
    } }),
    observeOwnership: async () => ({ kind: platform === "windows" ? "windows-process-tree" : "posix-process-group", rootPid: 75, token: "75" }),
    observeLiveness: async () => false, terminateOwnedTree: async () => undefined,
  });
  assert.equal(thread.threadId, "fragment-thread");
});

test("jsonl-rpc-write-and-exit-faults-clean-up: a protocol write fault closes the exact owner", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const owner = { kind: platform === "windows" ? "windows-process-tree" as const : "posix-process-group" as const, rootPid: 76, token: "76" };
  let terminated = 0;
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: () => ({ pid: 76, write: () => { throw new Error("write broke"); }, end: () => undefined }),
    observeOwnership: async () => owner, observeLiveness: async () => false,
    terminateOwnedTree: async () => { terminated += 1; },
  }), /write broke/);
  assert.equal(terminated, 1);
});

test("request-timeouts-use-safe-bound-and-clean-up: an invalid timeout falls back to a positive finite bound", async () => {
  const seen: number[] = [];
  await assert.rejects(openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform: process.platform === "win32" ? "windows" : "posix", timeoutMs: 0,
    authRunner: async (command) => { seen.push(command.timeoutMs); return { code: 1, stdout: "", stderr: "" }; },
  }));
  assert.deepEqual(seen, [60_000]);
});

test("turn-prompt-and-response-failures-clean-up: a blank prompt rejects before a turn is sent", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const calls: string[] = [];
  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({ pid: 77, end: () => undefined, write: (line) => { const m = JSON.parse(line) as { id?: number; method: string }; calls.push(m.method); if (m.method === "initialize") events.stdout(`${JSON.stringify({ id: m.id, result: {} })}\n`); if (m.method === "thread/start") events.stdout(`${JSON.stringify({ id: m.id, result: { thread: { id: "t", model: "m", reasoningEffort: "e" } } })}\n`); } }),
    observeOwnership: async () => ({ kind: platform === "windows" ? "windows-process-tree" : "posix-process-group", rootPid: 77, token: "77" }), observeLiveness: async () => false, terminateOwnedTree: async () => undefined,
  });
  await assert.rejects(thread.startTurn(" \t "), /blank/);
  assert.equal(calls.includes("turn/start"), false);
});

test("probe-tristate-and-same-channel-rate-limits: a dead owner never sends a rate-limit RPC", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const methods: string[] = [];
  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({ pid: 78, end: () => undefined, write: (line) => { const m = JSON.parse(line) as { id?: number; method: string }; methods.push(m.method); if (m.method === "initialize") events.stdout(`${JSON.stringify({ id: m.id, result: {} })}\n`); if (m.method === "thread/start") events.stdout(`${JSON.stringify({ id: m.id, result: { thread: { id: "t", model: "m", reasoningEffort: "e" } } })}\n`); } }),
    observeOwnership: async () => ({ kind: platform === "windows" ? "windows-process-tree" : "posix-process-group", rootPid: 78, token: "78" }), observeLiveness: async () => false, terminateOwnedTree: async () => undefined,
  });
  assert.deepEqual(await thread.probe(), { live: false, rateLimits: undefined });
  assert.equal(methods.includes("account/rateLimits/read"), false);
});

test("termination-is-idempotent-bounded-and-confirms-death: termination polls until the exact owner is observed dead", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  let livenessReads = 0;
  const thread = await openPinnedCodexDetachedThread({
    cwd: process.cwd(), model: "m", reasoningEffort: "e", platform, timeoutMs: 25,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    spawn: (_command, events) => ({ pid: 79, end: () => undefined, write: (line) => { const m = JSON.parse(line) as { id?: number; method: string }; if (m.method === "initialize") events.stdout(`${JSON.stringify({ id: m.id, result: {} })}\n`); if (m.method === "thread/start") events.stdout(`${JSON.stringify({ id: m.id, result: { thread: { id: "t", model: "m", reasoningEffort: "e" } } })}\n`); } }),
    observeOwnership: async () => ({ kind: platform === "windows" ? "windows-process-tree" : "posix-process-group", rootPid: 79, token: "79" }),
    observeLiveness: async () => { livenessReads += 1; return livenessReads > 1 ? false : true; }, terminateOwnedTree: async () => undefined,
  });
  await thread.terminate();
  assert.equal(livenessReads, 2, "termination must wait for an observed-dead owner instead of trusting one live probe");
});
