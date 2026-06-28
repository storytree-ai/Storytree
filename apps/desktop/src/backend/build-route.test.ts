// Integration test for the desktop build-route MOUNT (capability desktop-build-route, ADR-0133 d.3 /
// ADR-0108 Phase 3+4).
//
// WHAT IT PINS: createBuildRouteMount serves POST /api/build (validate → mint → fire-and-forget → 202
// {runId}) + GET /api/build?runId (status + coarse transcript) over the RELOCATED worker's BuildContext,
// with typed refusals (404/409/405) and a chain fall-through (false for an unrelated path). It is driven
// over a REAL node:http server against the REAL relocated BuildRegistry + runBuildJob
// (@storytree/drive/build-worker) with a SCRIPTED runner + an injected isBuildable — no SDK, no DB, no
// Electron (ADR-0010 §5). One worker, two surfaces: the SAME contract apps/studio/server's handleBuild
// holds, on the desktop surface where chat ships.
//
// THE BOUNDARY (ADR-0100): the mount imports the worker by PACKAGE name (@storytree/drive/build-worker),
// never apps/studio/server. `dbr-imports-worker-by-package-not-app` pins this structurally.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BuildRegistry } from "@storytree/drive/build-worker";
import type { BuildContext, BuildRunner } from "@storytree/drive/build-worker";

import { createBuildRouteMount } from "./build-route.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** The chain-dispatcher signature createBuildRouteMount returns. */
type ChainHandler = (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean>;

/**
 * Spin up a node:http server wrapping the chain handler: compute pathname, call the handler, and 404 if
 * it falls through (returns false) — mirrors the desktop sidecar's dispatcher chain. Closes before return.
 */
async function withServer(handler: ChainHandler, fn: (base: string) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const claimed = await handler(req, res, pathname);
      if (!claimed) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "not found" }));
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

/** The GET /api/build?runId wire body. */
interface BuildStatusBody {
  runId: string;
  unitId: string;
  status: "building" | "passed" | "failed";
  transcript: string[];
  envelope?: string;
  reason?: string;
}

/** A scripted runner: emits `lines` as coarse progress, then resolves with the given envelope. */
function scriptedRunner(
  lines: readonly string[],
  envelope: { ok: boolean; body: string },
): { runner: BuildRunner; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    runner: async (_unitId, sink) => {
      calls += 1;
      for (const line of lines) sink(line);
      return envelope;
    },
  };
}

async function postBuild(base: string, unitId: string): Promise<Response> {
  return fetch(`${base}/api/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitId }),
  });
}

/** Poll GET /api/build?runId until the run leaves `building` — the desktop settle pattern. */
async function pollUntilTerminal(base: string, runId: string): Promise<BuildStatusBody> {
  for (let i = 0; i < 100; i += 1) {
    const res = await fetch(`${base}/api/build?runId=${encodeURIComponent(runId)}`);
    const body = (await res.json()) as BuildStatusBody;
    if (body.status !== "building") return body;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`run ${runId} did not terminalise`);
}

// ---------------------------------------------------------------------------
// Contract 1 — dbr-post-dispatches-buildable-id
// ---------------------------------------------------------------------------

// A buildable POST validates isBuildable, mints a run on the REAL relocated registry, fires runBuildJob
// over the injected runner, returns 202 { runId }; once drained, GET reports passed + the scripted progress.
test("dbr-post-dispatches-buildable-id: a buildable POST mints + runs over the relocated worker, 202 + runId, GET polls passed", async () => {
  const registry = new BuildRegistry();
  const { runner, calls } = scriptedRunner(["▸ phase: AUTHOR_TEST", "▸ phase: GREEN"], {
    ok: true,
    body: "verdict: PASS",
  });
  const build: BuildContext = { registry, runner, isBuildable: async () => true };
  const mount = createBuildRouteMount(build);

  await withServer(mount, async (base) => {
    const res = await postBuild(base, "chat-drive-bridge");
    assert.equal(res.status, 202, "a buildable id is accepted with 202");
    const body = (await res.json()) as { runId?: unknown };
    assert.equal(typeof body.runId, "string", "the POST returns a tracked runId");
    assert.ok((body.runId as string).length > 0, "the runId is non-empty");

    const terminal = await pollUntilTerminal(base, body.runId as string);
    assert.equal(terminal.status, "passed", "the fired run drains to a terminal passed over the relocated worker");
    assert.equal(terminal.unitId, "chat-drive-bridge", "GET carries the run's unit id");
    assert.ok(
      terminal.transcript.some((l) => l.includes("AUTHOR_TEST")),
      "the scripted runner's coarse progress is on the polled transcript",
    );
    assert.match(terminal.envelope ?? "", /verdict: PASS/, "the terminal envelope carries the build body");
    assert.equal(calls(), 1, "the injected runner was invoked exactly once");
  });
});

// ---------------------------------------------------------------------------
// Contract 2 — dbr-refuses-unbuildable-id
// ---------------------------------------------------------------------------

// An un-buildable / unknown id (isBuildable false) → 404, and runBuildJob is NEVER invoked (no run
// against nothing) — the handleBuild 404 contract, on the desktop surface.
test("dbr-refuses-unbuildable-id: an un-buildable id is a 404 and the worker is never invoked", async () => {
  const registry = new BuildRegistry();
  const { runner, calls } = scriptedRunner(["should never run"], { ok: true, body: "unreached" });
  const build: BuildContext = { registry, runner, isBuildable: async () => false };
  const mount = createBuildRouteMount(build);

  await withServer(mount, async (base) => {
    const res = await postBuild(base, "no-such-unit");
    assert.equal(res.status, 404, "an un-buildable id must be 404, not a crash or a forged run");
    const body = (await res.json()) as { error?: unknown };
    assert.equal(typeof body.error, "string", "the refusal carries a typed error field");
    assert.equal(calls(), 0, "the worker must NOT be invoked against an un-buildable id");
  });
});

// ---------------------------------------------------------------------------
// Contract 3 — dbr-typed-answers-and-fall-through
// ---------------------------------------------------------------------------

// A concurrent POST → 409 (single-build guard, running run untouched); a wrong method → 405; an unrelated
// path → the handler returns false (chain fall-through, NOT a catch-all) — the full typed-answer + chain
// contract, mirroring handleBuild + the chat-mount fall-through.
test("dbr-typed-answers-and-fall-through: concurrent → 409, wrong method → 405, unrelated path → false fall-through", async () => {
  const registry = new BuildRegistry();
  // A runner that blocks until released, so the first run stays `building` across the second POST.
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const build: BuildContext = {
    registry,
    runner: async (_unitId, sink) => {
      sink("▸ building, awaiting release");
      await gate;
      return { ok: true, body: "verdict: PASS" };
    },
    isBuildable: async () => true,
  };
  const mount = createBuildRouteMount(build);

  await withServer(mount, async (base) => {
    const first = await postBuild(base, "chat-drive-bridge");
    assert.equal(first.status, 202, "the first dispatch is accepted");
    const { runId } = (await first.json()) as { runId: string };

    // The first run is now `building` (createRun set the guard synchronously before the 202).
    const second = await postBuild(base, "desktop-build-route");
    assert.equal(second.status, 409, "a concurrent dispatch is a 409 single-build refusal");
    const stillBuilding = await fetch(`${base}/api/build?runId=${encodeURIComponent(runId)}`);
    assert.equal(stillBuilding.status, 200, "the running run is left untouched by the refused dispatch");

    // A wrong method on the claimed route → 405 (never a 500).
    const del = await fetch(`${base}/api/build`, { method: "DELETE" });
    assert.equal(del.status, 405, "a wrong method on /api/build is a typed 405");

    // Release so the server can close cleanly.
    release();
    await pollUntilTerminal(base, runId);
  });

  // Fall-through: an unrelated path → the handler returns false and writes NOTHING (chain dispatch, not a
  // catch-all). Drive the handler directly with minimal fakes (it returns false before touching req/res).
  let touched = false;
  const fakeRes = {
    statusCode: 0,
    setHeader: () => {
      touched = true;
    },
    end: () => {
      touched = true;
    },
    write: () => {
      touched = true;
    },
  } as unknown as ServerResponse;
  const fakeReq = { method: "GET", url: "/api/health" } as unknown as IncomingMessage;
  const claimed = await mount(fakeReq, fakeRes, "/api/health");
  assert.equal(claimed, false, "an unrelated path falls through (returns false), so the chain continues");
  assert.equal(touched, false, "a fall-through writes nothing to the response (not a catch-all)");
});

// ---------------------------------------------------------------------------
// Contract 4 — dbr-imports-worker-by-package-not-app
// ---------------------------------------------------------------------------

// The ADR-0100 wall: build-route.ts imports the worker from @storytree/drive/build-worker (package name)
// and NOTHING from apps/studio/server; and the route is a build INTENT only — no signing key, no
// events.verdict writer, no DB connection reachable through it (ADR-0091).
test("dbr-imports-worker-by-package-not-app: imports the worker by package name, nothing from apps/studio/server, no verdict path", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "build-route.ts"), "utf8");
  const importLines = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+["']/.test(l) || /import\(/.test(l))
    .join("\n");

  assert.match(
    importLines,
    /@storytree\/drive\/build-worker/,
    "the route imports the relocated worker by package name (the legal post-relocation path)",
  );
  assert.ok(
    !/studio\/server/.test(importLines),
    "must not import apps/studio/server (the surface boundary, ADR-0100)",
  );
  assert.ok(!/\bfrom\s+["']pg["']/.test(importLines), "the route opens no direct pg connection");
  assert.ok(!/cloud-sql-connector|@storytree\/store|@storytree\/library\/store/.test(importLines), "no DB store path");
  assert.ok(
    !/signVerdict|signing-key|events\.verdict/i.test(src),
    "the route holds no signing key and writes no events.verdict — a build INTENT only (ADR-0091)",
  );
});
