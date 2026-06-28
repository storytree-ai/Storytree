// Integration test for the desktop accept→dispatch MOUNT (capability desktop-accept-dispatch,
// ADR-0133 d.3 / ADR-0108 Phase 3+4).
//
// WHAT IT PINS: createAcceptDispatchMount routes a HUMAN-accepted unit id (POST /api/chat/accept) to the
// RELOCATED dispatchAcceptedBuild over the SHARED BuildContext — mints a run on the shared registry, fires
// runBuildJob, and the worker's coarse progress is read back over the build route's GET /api/build?runId
// (capability 2, mounted here over the SAME registry). Driven over a REAL node:http server against the
// REAL relocated dispatchAcceptedBuild + BuildRegistry (@storytree/drive/build-worker) with a SCRIPTED
// runner — no SDK, no DB, no Electron (ADR-0010 §5). The accept is the HUMAN's (a POST body), never a
// free-text "yes" (ADR-0108 d.3).
//
// THE BOUNDARY (ADR-0100): the slice imports the dispatch by PACKAGE name; `dad-accept-is-intent-via-
// package` pins this structurally.

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

import { createAcceptDispatchMount } from "./accept-dispatch.js";
import { createBuildRouteMount } from "./build-route.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type ChainHandler = (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean>;

/**
 * Spin up a node:http server chaining `mounts` (accept-dispatch + build-route, sharing one registry):
 * each is tried in order; the first to claim wins; a fall-through 404s — mirrors the desktop sidecar.
 */
async function withServer(mounts: ChainHandler[], fn: (base: string) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      for (const mount of mounts) {
        if (await mount(req, res, pathname)) return;
      }
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "not found" }));
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

interface BuildStatusBody {
  runId: string;
  unitId: string;
  status: "building" | "passed" | "failed";
  transcript: string[];
  envelope?: string;
  reason?: string;
}

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

/** POST /api/chat/accept {unitId} — the renderer's accept-button click (the human's accept). */
async function postAccept(base: string, unitId: string): Promise<Response> {
  return fetch(`${base}/api/chat/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitId }),
  });
}

/** Poll the shared GET /api/build?runId (the build route, capability 2) until the run leaves `building`. */
async function pollUntilTerminal(base: string, runId: string): Promise<BuildStatusBody> {
  for (let i = 0; i < 100; i += 1) {
    const res = await fetch(`${base}/api/build?runId=${encodeURIComponent(runId)}`);
    const body = (await res.json()) as BuildStatusBody;
    if (body.status !== "building") return body;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`run ${runId} did not terminalise`);
}

/** Mount the accept-dispatch + build-route over ONE shared BuildContext (the shared registry). */
function mountsOver(build: BuildContext): ChainHandler[] {
  return [createAcceptDispatchMount(build), createBuildRouteMount(build)];
}

// ---------------------------------------------------------------------------
// Contract 1 — dad-accepted-id-reaches-dispatch
// ---------------------------------------------------------------------------

// An ACCEPTED buildable id POSTed to /api/chat/accept reaches the relocated dispatchAcceptedBuild, mints a
// run on the shared registry (returns a runId), fires runBuildJob, and once drained the shared GET poll
// reports terminal `passed` with the scripted progress on transcript (progress read back over the desktop).
test("dad-accepted-id-reaches-dispatch: an accepted buildable id reaches dispatchAcceptedBuild, mints + runs, progress polled back", async () => {
  const registry = new BuildRegistry();
  const { runner, calls } = scriptedRunner(["▸ phase: AUTHOR_TEST", "▸ phase: GREEN"], {
    ok: true,
    body: "verdict: PASS",
  });
  const build: BuildContext = { registry, runner, isBuildable: async (id) => id === "chat-drive-bridge" };

  await withServer(mountsOver(build), async (base) => {
    const res = await postAccept(base, "chat-drive-bridge");
    assert.equal(res.status, 202, "an accepted buildable id is dispatched (202)");
    const body = (await res.json()) as { ok?: unknown; runId?: unknown };
    assert.equal(body.ok, true, "the typed dispatch result is ok");
    assert.equal(typeof body.runId, "string", "the accept returns the minted runId");
    assert.ok((body.runId as string).length > 0, "the runId is non-empty");

    // Progress read back over the SHARED build-route poll (capability 2), proving one shared registry.
    const terminal = await pollUntilTerminal(base, body.runId as string);
    assert.equal(terminal.status, "passed", "the accepted dispatch drains to a terminal passed");
    assert.equal(terminal.unitId, "chat-drive-bridge", "the run carries the accepted unit id");
    assert.ok(
      terminal.transcript.some((l) => l.includes("AUTHOR_TEST")),
      "the worker's coarse progress is read back over the shared GET /api/build?runId poll",
    );
    assert.equal(calls(), 1, "the relocated worker ran exactly once for the accepted id");
  });
});

// ---------------------------------------------------------------------------
// Contract 2 — dad-refuses-unbuildable-accepted-id
// ---------------------------------------------------------------------------

// An un-buildable / unknown accepted id (isBuildable false) → a typed refusal and runBuildJob NEVER
// invoked — the accept dispatches ONLY a buildable accepted id, never a run against nothing.
test("dad-refuses-unbuildable-accepted-id: an un-buildable accepted id is refused and the worker is never invoked", async () => {
  const registry = new BuildRegistry();
  const { runner, calls } = scriptedRunner(["should never run"], { ok: true, body: "unreached" });
  const build: BuildContext = { registry, runner, isBuildable: async () => false };

  await withServer(mountsOver(build), async (base) => {
    const res = await postAccept(base, "no-such-unit");
    assert.equal(res.status, 404, "an un-buildable accepted id is a typed 404, never a forged run");
    const body = (await res.json()) as { ok?: unknown; error?: unknown };
    assert.equal(body.ok, false, "the typed refusal carries ok:false");
    assert.equal(typeof body.error, "string", "the refusal carries a reason");
    assert.equal(calls(), 0, "the worker is NEVER invoked against an un-buildable accepted id");
    assert.equal(registry.hasActiveBuild(), false, "no run is minted on a refusal");
  });
});

// ---------------------------------------------------------------------------
// Contract 3 — dad-single-build-guard-shared
// ---------------------------------------------------------------------------

// A second accept while a run is live → the single-build refusal (the SHARED registry's guard — you can't
// accept-and-drive twice at once), the running run untouched. The shared registry spans build + accept.
test("dad-single-build-guard-shared: a concurrent accept is refused by the shared single-build guard", async () => {
  const registry = new BuildRegistry();
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

  await withServer(mountsOver(build), async (base) => {
    const first = await postAccept(base, "chat-drive-bridge");
    assert.equal(first.status, 202, "the first accept is dispatched");
    const { runId } = (await first.json()) as { runId: string };

    // The first run is now live on the SHARED registry; a second accept is refused.
    const second = await postAccept(base, "desktop-accept-dispatch");
    assert.equal(second.status, 409, "a concurrent accept is a 409 (the shared single-build guard)");
    const secondBody = (await second.json()) as { ok?: unknown; error?: unknown };
    assert.equal(secondBody.ok, false, "the concurrent accept is a typed refusal");

    // The running run is untouched (still pollable over the shared build-route poll).
    const running = await fetch(`${base}/api/build?runId=${encodeURIComponent(runId)}`);
    assert.equal(running.status, 200, "the running run is left untouched by the refused accept");

    release();
    await pollUntilTerminal(base, runId);
  });
});

// ---------------------------------------------------------------------------
// Contract 4 — dad-accept-is-intent-via-package
// ---------------------------------------------------------------------------

// The accept is a SAFE write over the package import: accept-dispatch.ts imports dispatchAcceptedBuild from
// @storytree/drive/build-worker (package name) and NOTHING from apps/studio/server (ADR-0100); it holds no
// signing key, no events.verdict writer, no DB connection — a build INTENT off the human's accept (ADR-0091).
test("dad-accept-is-intent-via-package: imports the dispatch by package name, nothing from apps/studio/server, no verdict path", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "accept-dispatch.ts"), "utf8");
  const importLines = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l) || /\bfrom\s+["']/.test(l) || /import\(/.test(l))
    .join("\n");

  assert.match(
    importLines,
    /dispatchAcceptedBuild.*@storytree\/drive\/build-worker|@storytree\/drive\/build-worker/,
    "the accept slice imports the relocated dispatch by package name",
  );
  assert.match(src, /dispatchAcceptedBuild\(/, "the accept slice invokes the relocated dispatchAcceptedBuild");
  assert.ok(!/studio\/server/.test(importLines), "must not import apps/studio/server (the surface boundary, ADR-0100)");
  assert.ok(!/\bfrom\s+["']pg["']/.test(importLines), "the accept slice opens no direct pg connection");
  assert.ok(!/cloud-sql-connector|@storytree\/store|@storytree\/library\/store/.test(importLines), "no DB store path");
  assert.ok(
    !/signVerdict|signing-key|events\.verdict/i.test(src),
    "the accept slice holds no signing key and writes no events.verdict — a build INTENT only (ADR-0091)",
  );
});
