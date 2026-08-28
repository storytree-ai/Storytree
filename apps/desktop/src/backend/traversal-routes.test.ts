// Integration test for traversal-routes.ts (`traversal-panel-arc`, increment
// `desktop-serves-the-traversal-routes`).
//
// WHAT IT PINS, and why each half is here.
//
// 1. PRESENCE — the defect this increment closes. The Traversal tab ships in the compiled studio
//    bundle the desktop serves, and its three fetches fell through every mount in the Electron
//    chain to `local-backend`'s catch-all `404 {"error":"unknown endpoint"}`. The RED for that is
//    the first test below and it is a genuine red: before this module existed, no dispatcher in
//    `apps/desktop` claimed `/api/traversal/sessions`, so the request 404s. Route presence is only
//    ever as durable as a test like this one — `check:mirror-conformance` compares PAYLOADS, and two
//    ABSENT routes compare equal (`mirror-pair-registration-is-mandatory-not-optional`).
//
// 2. THE ENVELOPE — the half a payload comparison over a populated fixture would miss. The studio
//    answers 400 / 404 / 405 apart from each other and the compiled panel reads them apart: an
//    absent trace is "this machine holds no trace for that id", an all-corrupt trace is a 200 with
//    `skipped > 0` (ADR-0241 D5), and a window with NO transcript is deliberately a 200 carrying an
//    absence rather than a 404 that would read as "the route is missing". Each is asserted here.
//
// INTEGRATION TIER: real HTTP over a real `node:http` server, driving the REAL dispatcher this
// module exports. Fixtures are real trace lines written through the sink's own
// `appendTraversalEvents` and real host-transcript lines in the shape the harness writes, under temp
// dirs pointed at by the documented `STORYTREE_TRAVERSAL_DIR` / `STORYTREE_TRANSCRIPT_DIR`
// overrides — so the env path the handler resolves through is itself under test rather than
// bypassed. No DB, no network beyond loopback, no module mocking.
//
// DELETION TEST: removing `createTraversalRoutes` breaks the import and every assertion. Making the
// dispatcher a catch-all breaks the fall-through case. Dropping the 404-vs-200 fork for an
// unreadable trace, or 404-ing an absent transcript, breaks the envelope cases — which is the
// point, since those are the decisions a hand-copied route silently loses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appendTraversalEvents } from "@storytree/context-traversal-capture";

import { createTraversalRoutes } from "./traversal-routes.js";

const TRACE_DIR_ENV = "STORYTREE_TRAVERSAL_DIR";
const TRANSCRIPT_DIR_ENV = "STORYTREE_TRANSCRIPT_DIR";
/** The harness's own per-repo project directory name under the transcript root. */
const PROJECT = "C--code-storytree";

interface Harness {
  base: string;
  traceDir: string;
  transcriptRoot: string;
  close: () => Promise<void>;
}

/**
 * Stand up the REAL dispatcher behind a real server, with both ambient roots pointed at fresh temp
 * dirs. The chain in `backend-entry.ts` hands each mount a PATHNAME, so this harness reproduces that
 * call shape exactly — a server that passed a URL would prove the wrong function's contract.
 */
async function harness(): Promise<Harness> {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-traversal-"));
  const transcriptRoot = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-transcripts-"));
  const priorTrace = process.env[TRACE_DIR_ENV];
  const priorTranscript = process.env[TRANSCRIPT_DIR_ENV];
  process.env[TRACE_DIR_ENV] = traceDir;
  process.env[TRANSCRIPT_DIR_ENV] = transcriptRoot;

  const routes = createTraversalRoutes();
  const server: Server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (await routes(req, res, pathname)) return;
      // The rest of the Electron chain, collapsed to the one answer that matters here:
      // `local-backend`'s catch-all. A request reaching this line is the DEFECT.
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "unknown endpoint" }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    traceDir,
    transcriptRoot,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (priorTrace === undefined) delete process.env[TRACE_DIR_ENV];
      else process.env[TRACE_DIR_ENV] = priorTrace;
      if (priorTranscript === undefined) delete process.env[TRANSCRIPT_DIR_ENV];
      else process.env[TRANSCRIPT_DIR_ENV] = priorTranscript;
      fs.rmSync(traceDir, { recursive: true, force: true });
      fs.rmSync(transcriptRoot, { recursive: true, force: true });
    },
  };
}

let visit = 0;
/** Append one real visit event through the sink — how a trace genuinely grows. */
function writeTrace(dir: string, sessionId: string, at: string): void {
  visit += 1;
  const ok = appendTraversalEvents(
    [
      {
        kind: "front_matter_read",
        eventId: `event:visit-${visit}`,
        sessionId,
        visitId: `visit-${visit}`,
        nodeId: "node-a",
        surfaceId: "tree",
        at,
      },
    ],
    { dir, sessionId },
  );
  assert.equal(ok, true, "the fixture must be written through the sink's own append");
}

/** One assistant line in the shape the host harness writes. */
function writeTranscript(root: string, windowId: string, tokens: number): void {
  const dir = path.join(root, PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${windowId}.jsonl`),
    `${JSON.stringify({
      type: "assistant",
      sessionId: windowId,
      timestamp: "2026-08-28T10:00:00.000Z",
      isSidechain: false,
      cwd: "/home/mickh/code/storytree",
      message: { id: "msg-1", model: "claude-opus-5", usage: { input_tokens: tokens, output_tokens: 12 } },
    })}\n`,
  );
}

// ---------- 1. PRESENCE: the three routes the compiled bundle calls are SERVED here ----------

test("traversal-routes: GET /api/traversal/sessions answers the local trace index, not 'unknown endpoint'", async () => {
  const h = await harness();
  try {
    writeTrace(h.traceDir, "session-alpha", "2026-08-28T10:00:00.000Z");
    writeTrace(h.traceDir, "session-alpha", "2026-08-28T10:00:05.000Z");
    writeTrace(h.traceDir, "session-beta", "2026-08-28T11:00:00.000Z");

    const res = await fetch(`${h.base}/api/traversal/sessions`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      dir: string;
      sessions: { sessionId: string; eventCount: number; lastObservedAt: string | null }[];
    };
    // `dir` rides the wire because "no sessions" and "no traces where I looked" are different facts.
    assert.equal(body.dir, h.traceDir);
    assert.deepEqual(
      body.sessions.map((s) => s.sessionId).sort(),
      ["session-alpha", "session-beta"],
    );
    assert.equal(body.sessions.find((s) => s.sessionId === "session-alpha")?.eventCount, 2);
    assert.equal(
      body.sessions.find((s) => s.sessionId === "session-alpha")?.lastObservedAt,
      "2026-08-28T10:00:05.000Z",
    );
  } finally {
    await h.close();
  }
});

test("traversal-routes: GET /api/traversal?session= replays one session with its decision points", async () => {
  const h = await harness();
  try {
    writeTrace(h.traceDir, "session-alpha", "2026-08-28T10:00:00.000Z");

    const res = await fetch(`${h.base}/api/traversal?session=session-alpha`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      events: unknown[];
      skipped: number;
      decisionPoints: unknown;
    };
    assert.equal(body.events.length, 1);
    assert.equal(body.skipped, 0);
    // `decisionPoints` rides the SAME payload rather than a second fetch: an offer fan drawn without
    // its denominator over-reports how often a session stayed inside the asset graph (ADR-0312 D6).
    assert.notEqual(body.decisionPoints, undefined);
  } finally {
    await h.close();
  }
});

test("traversal-routes: GET /api/context-windows?session= answers one window's occupancy series", async () => {
  const h = await harness();
  try {
    writeTranscript(h.transcriptRoot, "window-alpha", 110_300);

    const res = await fetch(`${h.base}/api/context-windows?session=window-alpha`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    // The fold's own shape is @storytree/context-traversal-transcript's business and is proven
    // there. What this asserts is that the route REACHED it — an object came back rather than the
    // chain's `unknown endpoint`.
    assert.equal(typeof body, "object");
    assert.notEqual(body, null);
    assert.ok(
      !("error" in body) || body["error"] !== "unknown endpoint",
      "the occupancy read must not fall through to the catch-all",
    );
  } finally {
    await h.close();
  }
});

test("traversal-routes: falls through for every path it does not own, so sibling mounts still fire", async () => {
  const h = await harness();
  try {
    const res = await fetch(`${h.base}/api/tree`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "unknown endpoint" });
  } finally {
    await h.close();
  }
});

// ---------- 2. THE ENVELOPE: the decisions a payload comparison over a happy path would miss ----------

test("traversal-routes: an EMPTY trace dir is an honest empty list, never an error", async () => {
  const h = await harness();
  try {
    const res = await fetch(`${h.base}/api/traversal/sessions`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { dir: h.traceDir, sessions: [] });
  } finally {
    await h.close();
  }
});

test("traversal-routes: an ABSENT trace 404s, while an ALL-CORRUPT trace serves 200 with skipped > 0", async () => {
  const h = await harness();
  try {
    // ABSENT: no file at all. A 200 with an empty replay would tell the panel "this session
    // traversed nothing" — a claim about the session rather than about the absence of its file.
    const missing = await fetch(`${h.base}/api/traversal?session=never-captured`);
    assert.equal(missing.status, 404);
    assert.match(((await missing.json()) as { error: string }).error, /no readable trace/);

    // ALL CORRUPT: a file whose every line the tolerant reader skipped. That is something OBSERVED,
    // and reporting it is the whole point of ADR-0241 D5 — so it is a 200, not a 404.
    fs.writeFileSync(path.join(h.traceDir, "session-garbage.jsonl"), "not json at all\n", "utf8");
    const corrupt = await fetch(`${h.base}/api/traversal?session=session-garbage`);
    assert.equal(corrupt.status, 200);
    const body = (await corrupt.json()) as { events: unknown[]; skipped: number };
    assert.equal(body.events.length, 0);
    assert.ok(body.skipped > 0, "an all-corrupt trace must report what it skipped");
  } finally {
    await h.close();
  }
});

test("traversal-routes: a window with NO transcript is a 200 absence, deliberately not a 404", async () => {
  const h = await harness();
  try {
    // A 404 here would be read as "the route is missing", which sends an operator somewhere else
    // entirely. This is the exact conflation the mirror is most likely to lose.
    const res = await fetch(`${h.base}/api/context-windows?session=never-opened`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(typeof body, "object");
    assert.notEqual(body, null);
  } finally {
    await h.close();
  }
});

test("traversal-routes: a missing or non-flat id is refused BY NAME with 400, never a filesystem escape", async () => {
  const h = await harness();
  try {
    for (const url of [`${h.base}/api/traversal`, `${h.base}/api/traversal?session=`]) {
      const res = await fetch(url);
      assert.equal(res.status, 400, url);
      assert.match(((await res.json()) as { error: string }).error, /which captured session/);
    }
    for (const url of [`${h.base}/api/context-windows`, `${h.base}/api/context-windows?session=`]) {
      const res = await fetch(url);
      assert.equal(res.status, 400, url);
      assert.match(((await res.json()) as { error: string }).error, /which host context window/);
    }

    // The id becomes a FILENAME inside its root and the reader joins that path itself, so a
    // separator or a `..` segment would be an escape. Refused before any join happens.
    for (const bad of ["../secrets", "a/b", ".hidden"]) {
      const trace = await fetch(`${h.base}/api/traversal?session=${encodeURIComponent(bad)}`);
      assert.equal(trace.status, 400, `traversal ${bad}`);
      assert.match(((await trace.json()) as { error: string }).error, /flat token/);

      const win = await fetch(`${h.base}/api/context-windows?session=${encodeURIComponent(bad)}`);
      assert.equal(win.status, 400, `context-windows ${bad}`);
      assert.match(((await win.json()) as { error: string }).error, /flat token/);
    }
  } finally {
    await h.close();
  }
});

test("traversal-routes: a non-GET is refused 405 BY NAME on all three paths, never a 404", async () => {
  const h = await harness();
  try {
    for (const p of ["/api/traversal", "/api/traversal/sessions", "/api/context-windows"]) {
      const res = await fetch(`${h.base}${p}`, { method: "POST" });
      assert.equal(res.status, 405, p);
      assert.match(((await res.json()) as { error: string }).error, /read-only/);
    }
  } finally {
    await h.close();
  }
});
