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

/** Body of the `.md` file seeded ONE LEVEL ABOVE docsDir — see {@link seedDocsDir}. */
const OUTSIDE_SENTINEL = "SENTINEL-OUTSIDE-THE-DOCS-DIR";
/** Body of the non-`.md` file seeded INSIDE docsDir — see {@link seedDocsDir}. */
const NON_MARKDOWN_SENTINEL = "SENTINEL-CONTAINED-BUT-NOT-MARKDOWN";

/**
 * Create a temporary docs dir seeded with one ADR (decisions/ + frontmatter) and one
 * reference doc. Returns the dir path and a cleanup fn. The ADR doc has `status: accepted` and
 * `decided: 2024-01-15` in its frontmatter — the test pins that both are parsed and surfaced.
 *
 * TWO SENTINEL FILES EXIST SO THE TRAVERSAL TEST CAN FAIL, and that is the whole reason the
 * temp dir is nested inside a ROOT rather than being the mkdtemp dir itself. Until 2026-08-30
 * the traversal test asked for `../../package.json` and a `.md`-less id, and BOTH resolved to
 * paths where no file existed — so `existsSync` produced the expected 404 and the guard was
 * never the thing under test. Measured: deleting either arm of `safeDocPath`'s guard
 * (`rel.startsWith("..")`, `!resolved.endsWith(".md")`) left the whole 234-test desktop suite
 * GREEN. The test asserted "refuses a path-traversal id, a non-.md id … and NEVER leaks file
 * contents" and measured "a missing file 404s", three times.
 *
 * A REAL file now sits at each escape point, so the guard is the ONLY thing that can produce
 * the 404 and a regression in it shows up as a 200 carrying the sentinel:
 *   <root>/outside-the-docs-dir.md     — real markdown, ABOVE docsDir (pins the `..` arm)
 *   <root>/docs/contained-not-markdown.json — real file, INSIDE docsDir (pins the `.md` arm)
 *
 * The `.json` sentinel is invisible to `listDocs` (which walks `.md` only), so the seeded-doc
 * count stays 2 and no other test in this file moves.
 */
async function seedDocsDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "boot-read-routes-root-"));
  // Readable, real, and OUTSIDE the docs dir: what a working `..` guard must refuse to serve.
  await fs.writeFile(
    path.join(root, "outside-the-docs-dir.md"),
    ["# Outside", "", OUTSIDE_SENTINEL].join("\n"),
    "utf8",
  );
  const dir = path.join(root, "docs");
  await fs.mkdir(dir);
  // Readable, real, and INSIDE the docs dir: what a working `.md` guard must refuse to serve.
  await fs.writeFile(
    path.join(dir, "contained-not-markdown.json"),
    JSON.stringify({ secret: NON_MARKDOWN_SENTINEL }),
    "utf8",
  );
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
  // A Reference-group doc: open-questions.md (no frontmatter, no status/decided)
  await fs.writeFile(
    path.join(dir, "open-questions.md"),
    ["# Open questions", "", "Deferred decisions for the system."].join("\n"),
    "utf8",
  );
  return {
    dir,
    // Remove the ROOT, not just the docs dir — the outside-the-docs-dir sentinel lives above it.
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
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

    // Concrete field assertions — the operator is a full MEMBER on their own machine, NOT an admin.
    // The desktop stays a member (so hosted admin surfaces remain hidden) and separately advertises
    // the one brokered UAT-signing permission it actually serves.
    assert.equal(body["email"], null, "email must be null (no hosted identity on the desktop)");
    assert.equal(body["role"], "member", "role must be member — the desktop serves no admin-only routes");
    assert.notEqual(
      body["role"],
      "admin",
      "the desktop must NOT claim admin: it serves no admin routes, so admin-only UI (Members, UAT sign) would 404",
    );
    assert.equal(body["status"], "active", "status must be active");
    assert.equal(body["member"], true, "member must be true");
    assert.equal(body["canAttestUat"], true, "desktop may sign human UAT through the broker");
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

      // --- a NESTED doc, which is what the recursive walk is for ---
      //
      // This used to be "the ADR doc (Decisions group)": the walker special-cased anything under
      // `decisions/` into its own group and parsed its frontmatter for status and lineage signals.
      // Decisions are Library artifacts now (ADR-0403 dec 1), that directory does not exist, and the
      // walker is back to being exactly the `docs/` tree. What it still has to prove is unchanged —
      // it RECURSES, it ids by POSIX relpath, and it reads the H1 through the frontmatter — so the
      // same assertions are made against a nested file that is not a decision.
      const nested = docs.find(
        (d) => typeof d["id"] === "string" && (d["id"] as string).includes("/"),
      );
      assert.ok(nested !== undefined, "a NESTED doc must appear — the walk is recursive");
      assert.equal(nested["id"], "decisions/0001-some-decision.md", "id must be the POSIX relpath under docsDir");
      assert.equal(nested["group"], "Reference", "every doc is Reference now — the Decisions group went with the files");
      assert.equal(nested["title"], "Some Decision", "title must be extracted from the H1 (after stripping frontmatter)");
      assert.ok(typeof nested["excerpt"] === "string", "excerpt must be a string");
      // NO frontmatter is parsed any more, for any doc. The status / decided chips were an
      // ADR-only read of `docs/decisions/**`, and both the read and its subject went with the
      // directory (ADR-0403 dec 1) — a decision's status is a typed field on its `adr` row now.
      // Asserted as an ABSENCE rather than deleted, so a walker that quietly started parsing
      // frontmatter again would go red rather than pass unnoticed.
      assert.equal(nested["status"], undefined, "no doc carries a parsed frontmatter status");
      assert.equal(nested["decided"], undefined, "no doc carries a parsed frontmatter date");

      // --- Reference doc ---
      const ref = docs.find((d) => d["id"] === "open-questions.md");
      assert.ok(ref !== undefined, "the reference doc (open-questions.md) must appear in the result");
      assert.equal(ref["group"], "Reference", "a doc at the root must have group='Reference'");
      assert.equal(ref["title"], "Open questions", "title must be extracted from the H1");
      assert.equal(
        ref["status"],
        undefined,
        "no doc carries a status field — the ADR-only frontmatter read went with docs/decisions/",
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

// Pins the ADR wire-signal fold (ADR-0187 dec 3) this backend must reproduce from the studio's
// listDocs: `loadBearing` from the frontmatter `load_bearing: true` tag, and the deduped union of
// `supersedes`/`supersedes_in_part`/`amends` NUMBERS resolved to `doc:` pointers against the walked
// corpus. It landed studio-side in commit 71f68d2b and never reached here; because the desktop
// serves the SAME compiled studio SPA, the Library selection card's load-bearing badge (which reads
// DocMeta.loadBearing through resolveSelectionDetail) simply never rendered on the desktop.
//
// This is the desktop-side half of the proof. The cross-surface half — that this copy and the
// studio's original agree over the real docs/ tree, which is what actually fences the drift class —
// is `pnpm check:mirror-conformance` (packages/cli/src/check-mirror-conformance.ts).
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

// Pins the /api/docs/content route: the handler reads ONE doc's body from the seeded docs dir over
// REAL node:fs, strips frontmatter, and returns { id, title, markdown } as a bare object. This is the
// endpoint DocView calls via api.docContent(id) to render an ADR body in the library tech-tree overlay
// dive — the desktop backend must SERVE it, not fall through to the local-backend 404 'unknown endpoint'.
test("boot-read-routes: GET /api/docs/content returns { id, title, markdown } for a seeded doc, frontmatter stripped", async () => {
  const { dir, cleanup } = await seedDocsDir();
  try {
    const handler = createBootReadRoutes({
      docsDir: dir,
      listComments: async () => [],
    });

    await withServer(handler, async (base) => {
      const res = await fetch(`${base}/api/docs/content?id=decisions%2F0001-some-decision.md`);
      assert.equal(res.status, 200, "/api/docs/content must return 200 for a real doc");

      const body = (await res.json()) as Record<string, unknown>;
      assert.ok(!Array.isArray(body), "/api/docs/content must be a BARE OBJECT, not an array");
      assert.equal(body["id"], "decisions/0001-some-decision.md", "id must echo the requested relpath");
      assert.equal(
        body["title"],
        "Some Decision",
        "title must be derived from the H1 (after frontmatter strip)",
      );
      assert.ok(typeof body["markdown"] === "string", "markdown must be a string");
      const markdown = body["markdown"] as string;
      assert.ok(markdown.includes("# Some Decision"), "markdown must contain the doc body");
      assert.ok(
        markdown.includes("This records the rationale"),
        "markdown must contain the doc's prose",
      );
      assert.ok(
        !markdown.includes("status: accepted"),
        "the YAML frontmatter must be STRIPPED — the reader shows prose, not the frontmatter block",
      );
    });
  } finally {
    await cleanup();
  }
});

// Pins the read-only doc-serving GUARD: /api/docs/content refuses a path-traversal id, a non-.md id,
// and a non-existent doc with 404 'doc not found' and NEVER leaks file contents. Fall-through (the
// unimplemented state) yields the wrapper's 'not handled' body, so asserting the exact 'doc not found'
// message keeps this red until the route actually OWNS and guards the request.
test("boot-read-routes: GET /api/docs/content 404s traversal / non-md / missing ids with 'doc not found' and no leak", async () => {
  const { dir, cleanup } = await seedDocsDir();
  try {
    const handler = createBootReadRoutes({
      docsDir: dir,
      listComments: async () => [],
    });

    await withServer(handler, async (base) => {
      // Each id names a file that REALLY EXISTS and is REALLY READABLE, except the last. That is
      // what makes the first two load-bearing: only the guard can turn them into a 404, so
      // deleting either arm of it turns them into a 200 carrying the sentinel body.
      const cases = [
        {
          id: "..%2Foutside-the-docs-dir.md", // escapes docsDir; the file above it is real markdown
          leak: OUTSIDE_SENTINEL,
          why: "a `..` id that resolves onto a REAL .md file above docsDir",
        },
        {
          id: "contained-not-markdown.json", // contained, real, readable — but not markdown
          leak: NON_MARKDOWN_SENTINEL,
          why: "a contained id naming a REAL non-.md file",
        },
        {
          id: "decisions%2F9999-does-not-exist.md", // valid shape, no such file
          leak: null,
          why: "a well-formed id with no file behind it",
        },
      ];
      for (const { id, leak, why } of cases) {
        const res = await fetch(`${base}/api/docs/content?id=${id}`);
        const raw = await res.text();
        assert.equal(res.status, 404, `${why} (id=${id}) must 404 — got ${res.status}: ${raw}`);
        const body = JSON.parse(raw) as Record<string, unknown>;
        assert.equal(
          body["error"],
          "doc not found",
          `${why} (id=${id}) must return the guard's 'doc not found' — not fall through, not leak`,
        );
        assert.equal(
          body["markdown"],
          undefined,
          `${why} (id=${id}) must never leak file contents`,
        );
        if (leak !== null) {
          // Belt to the braces above: assert on the RESPONSE BYTES, so no future reshaping of the
          // error envelope can carry the file's contents through under a different key.
          assert.ok(
            !raw.includes(leak),
            `${why} (id=${id}) must not leak the target file's contents anywhere in the response`,
          );
        }
      }
    });
  } finally {
    await cleanup();
  }
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

// Pins the EMPTY-VALUE half of that parse, which is a different rule from forwarding a value and
// was wrong here until 2026-08-31. `searchParams.get` answers `""` — not null — for a present-but-
// empty `?topicId=`, so a `?? undefined` guard admitted the empty string as a filter and this route
// answered with NO comments, while the studio's truthy guard treated the parameter as ABSENT and
// answered with ALL of them. Same request, opposite answer, and nothing observed it until the two
// surfaces were response-diffed (`unscored-guards-arc` / `establish-remaining-mirror-pairs`). The
// cross-surface half is now pinned by `check:mirror-conformance`'s `/api/comments` row; this is the
// desktop-side unit half, so the rule fails HERE too and not only on a whole-gate run.
test("boot-read-routes: an empty ?topicId= is ABSENT, not a filter for the empty string", async () => {
  const receivedFilters: Array<{ topicId?: string; topicKind?: "doc" | "asset" }> = [];

  const handler = createBootReadRoutes({
    docsDir: "/tmp/boot-read-routes-test-missing-dir",
    listComments: async (filter) => {
      receivedFilters.push(filter);
      return [];
    },
  });

  await withServer(handler, async (base) => {
    await fetch(`${base}/api/comments?topicId=`);
    await fetch(`${base}/api/comments?topicId=&topicKind=asset`);
  });

  assert.equal(receivedFilters.length, 2, "both requests must reach the seam");
  assert.deepEqual(
    receivedFilters[0],
    {},
    "an empty ?topicId= must compose an EMPTY filter — filtering on \"\" matches no comment at all",
  );
  assert.deepEqual(
    receivedFilters[1],
    { topicKind: "asset" },
    "and it must drop out alongside a valid second parameter, not ride along with it",
  );
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
