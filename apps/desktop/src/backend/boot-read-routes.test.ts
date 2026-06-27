// Integration test for boot-read-routes.ts
//
// WHAT IT PINS: the factory composes the studio's BOOT READ routes — /api/me (constant local
// identity), /api/docs (real FS walk over a seeded docs/ dir), and /api/comments (injected
// listComments seam) — and returns an async handler (req, res, pathname) => Promise<boolean>
// that returns true when it handled the path and false otherwise (fall-through for the Electron
// main's chained dispatch).
//
// INTEGRATION TIER: /api/docs drives a REAL recursive FS walk over a seeded temp dir — the
// filesystem IS the collaborator, not a stub. /api/comments uses an injected stub (no DB
// touched in CI). /api/me is a constant. The fall-through (false) test proves the dispatcher
// is real, not a catch-all — the deletion test.
//
// DELETION TEST: removing createBootReadRoutes or LOCAL_ME breaks the import and fails every
// assertion. Removing the /api/docs FS walk returns [] for the seeded-dir test. Making the
// handler a catch-all (always true) breaks the fall-through test. Wrapping any response in an
// object instead of a bare array/object breaks the envelope assertions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createBootReadRoutes, LOCAL_ME } from "./boot-read-routes.js";

// ---------------------------------------------------------------------------
// Local type mirrors
// ---------------------------------------------------------------------------

/**
 * A comment-shaped object — mirrors PgCommentStore.Comment (packages/library/src/store/) for
 * the injected listComments seam. Defined locally so the test has no live-DB dependency.
 */
interface Comment {
  id: string;
  topicKind: "doc" | "asset";
  topicId: string;
  anchor: {
    kind: "topic" | "section" | "text";
    headingSlug: string | null;
    headingText: string | null;
    quote: string | null;
    prefix: string | null;
    suffix: string | null;
    startOffset: number | null;
    color: string | null;
  };
  body: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Spin up a node:http server wrapping the boot-read-routes handler.
 * When the handler returns false (fall-through), the wrapper sends 404 — the deletion test that
 * proves the dispatcher is real, not a catch-all. Closes the server before returning — no
 * OS handle leaks.
 */
async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<boolean>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void handler(req, res, url.pathname)
      .then((handled) => {
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "not handled" }));
        }
      })
      .catch((err: unknown) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          );
        }
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
}

/**
 * Create a temporary docs dir seeded with one ADR (decisions/ + frontmatter) and one
 * reference doc. Returns the dir path and a cleanup fn. The ADR doc has `status: accepted` and
 * `decided: 2024-01-15` in its frontmatter — the test pins that both are parsed and surfaced.
 */
async function seedDocsDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "boot-read-routes-docs-"));
  // A Decisions-group doc: decisions/0001-some-decision.md (ADR with frontmatter)
  const decisionsDir = path.join(dir, "decisions");
  await fs.mkdir(decisionsDir);
  await fs.writeFile(
    path.join(decisionsDir, "0001-some-decision.md"),
    [
      "---",
      "status: accepted",
      "decided: 2024-01-15",
      "---",
      "",
      "# Some Decision",
      "",
      "This records the rationale for a key system choice.",
    ].join("\n"),
    "utf8",
  );
  // A Reference-group doc: glossary.md (no frontmatter, no status/decided)
  await fs.writeFile(
    path.join(dir, "glossary.md"),
    ["# Glossary", "", "Shared terminology for the system."].join("\n"),
    "utf8",
  );
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** A real Comment-shaped stub object — the injected seam returns this for the /api/comments tests. */
const STUB_COMMENT: Comment = {
  id: "stub-comment-1",
  topicKind: "doc",
  topicId: "decisions/0001-some-decision.md",
  anchor: {
    kind: "topic",
    headingSlug: null,
    headingText: null,
    quote: null,
    prefix: null,
    suffix: null,
    startOffset: null,
    color: null,
  },
  body: "A stub comment for testing.",
  author: "operator",
  createdAt: "2024-01-15T00:00:00.000Z",
  resolved: false,
  resolvedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Pins the /api/me route: the handler returns LOCAL_ME as a BARE JSON OBJECT — not an array,
// not wrapped in { me: ... }. The studio frontend's /api/me parse expects a bare object; a
// wrong envelope reads as malformed (the "access screen" failure this capability exists to fix).
test("boot-read-routes: GET /api/me returns LOCAL_ME as a bare JSON object", async () => {
  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-test-missing-dir",
    listComments: async () => [],
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/me`);
    assert.equal(res.status, 200, "/api/me must return 200");

    const body = (await res.json()) as Record<string, unknown>;

    // Shape checks: a bare object, never an array.
    assert.ok(!Array.isArray(body), "/api/me must be a BARE OBJECT, not an array");

    // Concrete field assertions — the operator IS member+admin on their own machine.
    assert.equal(body["email"], null, "email must be null (no hosted identity on the desktop)");
    assert.equal(body["role"], "admin", "role must be admin (operator is admin on own machine)");
    assert.equal(body["status"], "active", "status must be active");
    assert.equal(body["member"], true, "member must be true");
    assert.equal(body["canWakeDb"], false, "canWakeDb must be false (no DB wake control on the desktop)");

    // Deletion test: if LOCAL_ME were a different object, deepEqual fails.
    assert.deepEqual(
      body,
      LOCAL_ME,
      "the /api/me response body must exactly match the exported LOCAL_ME constant",
    );
  });
});

// Pins the /api/docs route: the handler walks the seeded docs dir over REAL node:fs and returns
// a BARE ARRAY of DocMeta. Checks group assignment (Decisions/Reference), H1 title extraction,
// excerpt presence, and frontmatter status/decided parsing for the ADR doc.
test("boot-read-routes: GET /api/docs returns a bare DocMeta array from the real FS walk", async () => {
  const { dir, cleanup } = await seedDocsDir();
  try {
    const handler = createBootReadRoutes({
      docsDir: dir,
      listComments: async () => [],
    });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/docs`);
      assert.equal(res.status, 200, "/api/docs must return 200");

      const body = (await res.json()) as unknown;

      // Deletion test: if the FS walk were removed, body would not be a non-empty array.
      assert.ok(Array.isArray(body), "/api/docs must return a BARE ARRAY — not a wrapped { docs: [...] }");

      const docs = body as Array<Record<string, unknown>>;

      // Both seeded files must appear.
      assert.equal(docs.length, 2, "both seeded docs must be returned by the real FS walk");

      // --- ADR doc (Decisions group) ---
      const adr = docs.find(
        (d) => typeof d["id"] === "string" && (d["id"] as string).startsWith("decisions/"),
      );
      assert.ok(adr !== undefined, "the ADR doc under decisions/ must appear in the result");
      assert.equal(adr["id"], "decisions/0001-some-decision.md", "id must be the POSIX relpath under docsDir");
      assert.equal(adr["group"], "Decisions", "a doc under decisions/ must have group='Decisions'");
      assert.equal(adr["title"], "Some Decision", "title must be extracted from the H1 (after stripping frontmatter)");
      assert.ok(typeof adr["excerpt"] === "string", "excerpt must be a string");
      // Frontmatter status and decided must be parsed for Decisions docs.
      assert.equal(
        adr["status"],
        "accepted",
        "the ADR frontmatter status must be parsed and surfaced on the DocMeta",
      );
      assert.equal(
        adr["decided"],
        "2024-01-15",
        "the ADR frontmatter decided date must be parsed and surfaced on the DocMeta",
      );

      // --- Reference doc ---
      const ref = docs.find((d) => d["id"] === "glossary.md");
      assert.ok(ref !== undefined, "the reference doc (glossary.md) must appear in the result");
      assert.equal(ref["group"], "Reference", "a doc at the root must have group='Reference'");
      assert.equal(ref["title"], "Glossary", "title must be extracted from the H1");
      assert.equal(
        ref["status"],
        undefined,
        "a non-ADR doc must NOT carry a status field (only Decisions docs carry frontmatter status)",
      );
      assert.equal(
        ref["decided"],
        undefined,
        "a non-ADR doc must NOT carry a decided field",
      );
    });
  } finally {
    await cleanup();
  }
});

// Pins the missing-docsDir path: a non-existent docsDir must return [] gracefully (never throws,
// never 500). The studio boots fine with no docs; the frontend simply renders an empty list.
test("boot-read-routes: GET /api/docs with a missing docsDir returns an empty array", async () => {
  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-no-such-docs-dir-xyzzy",
    listComments: async () => [],
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/docs`);
    assert.equal(
      res.status,
      200,
      "/api/docs must return 200 even when the docsDir does not exist — never 500/throw",
    );

    const body = (await res.json()) as unknown;
    assert.ok(Array.isArray(body), "response must be an array (bare)");
    assert.equal(
      (body as unknown[]).length,
      0,
      "a missing docsDir must return an empty array, not an error",
    );
  });
});

// Pins the /api/comments route: the handler calls the injected listComments seam and returns its
// result as a BARE ARRAY. The studio frontend's boot Promise.all calls /api/comments with no
// filter; a wrong envelope (e.g. { comments: [...] }) reads as malformed — the exact "boots to
// an error screen" failure this capability exists to remove.
test("boot-read-routes: GET /api/comments returns the injected stub result as a bare array", async () => {
  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-test-missing-dir",
    listComments: async (_filter) => [STUB_COMMENT],
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/comments`);
    assert.equal(res.status, 200, "/api/comments must return 200");

    const body = (await res.json()) as unknown;

    // Deletion test: if the seam were disconnected or the envelope were wrapped, this fails.
    assert.ok(
      Array.isArray(body),
      "/api/comments must return a BARE ARRAY — not a wrapped { comments: [...] }",
    );
    assert.equal(
      (body as unknown[]).length,
      1,
      "the stub's one comment must be returned — the seam must be wired",
    );

    const comment = (body as Array<Record<string, unknown>>)[0];
    assert.ok(comment !== undefined, "the first element must be the stub comment");
    assert.equal(comment["id"], STUB_COMMENT.id, "the comment id must match the stub");
    assert.equal(comment["body"], STUB_COMMENT.body, "the comment body must match the stub");
  });
});

// Pins the query-string filter wiring: the handler parses topicId/topicKind from the URL and
// passes them to listComments. The studio's non-boot comment-panel calls use these filters.
test("boot-read-routes: GET /api/comments forwards topicId and topicKind to the listComments seam", async () => {
  const receivedFilters: Array<{ topicId?: string; topicKind?: "doc" | "asset" }> = [];

  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-test-missing-dir",
    listComments: async (filter) => {
      receivedFilters.push(filter);
      return [];
    },
  });

  await withServer(handler, async (base) => {
    const url = `${base}/api/comments?topicId=decisions%2F0001-some-decision.md&topicKind=doc`;
    const res = await fetch(url);
    assert.equal(res.status, 200, "filtered /api/comments must return 200");

    // The filter must be forwarded to the seam — not silently dropped.
    assert.equal(receivedFilters.length, 1, "listComments must have been called exactly once");
    const filter = receivedFilters[0];
    assert.ok(filter !== undefined, "a filter must have been received");
    assert.equal(
      filter["topicId"],
      "decisions/0001-some-decision.md",
      "topicId must be URL-decoded and forwarded from the query string",
    );
    assert.equal(
      filter["topicKind"],
      "doc",
      "topicKind must be forwarded from the query string",
    );
  });
});

// DELETION TEST: the dispatcher falls through (returns false) for routes it does not own.
// If createBootReadRoutes were a catch-all (always returning true), this test would get a 200
// instead of a 404 — proving the handler must NOT shadow /api/health, /api/tree, or other routes
// that local-backend-boot owns. The Electron main mounts these two dispatchers in sequence; a
// catch-all here would silently intercept every /api/* request.
test("boot-read-routes: an unhandled route (/api/health) falls through — the dispatcher returns false", async () => {
  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-test-missing-dir",
    listComments: async () => [],
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(
      res.status,
      404,
      "/api/health must fall through (the dispatcher returns false, the wrapper sends 404) — " +
        "the boot-read-routes dispatcher must NOT be a catch-all",
    );
  });
});
