/**
 * The route-coverage judge (`route-tables.ts`) — `traversal-panel-arc`, increment
 * `desktop-route-coverage-is-unasked`.
 *
 * ## THE FIRST TEST IS THE POINT OF THE WHOLE INCREMENT
 *
 * `check:mirror-conformance` was VACUOUSLY GREEN on the defect that motivated this: the Traversal
 * tab shipped in the compiled bundle the desktop serves, its three fetches were never mirrored, and
 * a payload comparison had no desktop payload to find unequal. So the first case below replays the
 * ACTUAL pre-fix state — a desktop route table holding everything it held on 2026-08-28 except the
 * three traversal paths — and asserts the judge names exactly those three. A check that cannot be
 * shown failing on the case it was built for is the fault class this increment belongs to, not a
 * fix for it. Verified against the live tree the same way before it was written down: removing
 * `traversal-routes.ts` from the working tree drops the desktop from 21 dispatched routes to 18 and
 * produces those three findings, and restoring it returns the check to green.
 *
 * ## THE SECOND IS THE NEAR-MISS THAT WOULD HAVE MADE THIS CHECK VACUOUS TOO
 *
 * `local-backend.ts` guards its whole table with `if (!url.pathname.startsWith("/api/"))`. Read as a
 * route claim, that registers the prefix `/api/` — which every called route starts with, so the
 * desktop would appear to serve EVERYTHING and this check would find nothing, forever. It was caught
 * during the build by its own symptom (four hand-written exceptions all reporting STALE), which is
 * luck rather than method — so it is pinned here, where a regression is a red rather than a silence.
 *
 * Every other case is one of the derivation's REFUSALS. They matter more than the happy path: an
 * enumeration that returns an empty answer reports a perfect sweep, because an empty called-set has
 * an empty difference against any route table.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_ROUTE_EXCEPTIONS,
  RouteDerivationError,
  findForeignApiLiterals,
  findUnservedRoutes,
  mergeDispatchedRoutes,
  parseCalledRoutes,
  parseDispatchedRoutes,
  stripComments,
  type CalledRoute,
  type RouteException,
} from "./route-tables.js";
import { API_CLIENT, FRONTEND_TREES, MIRROR_SURFACE, REFERENCE_SURFACE } from "./route-surfaces.js";

const CLIENT = "apps/studio/src/api.ts";

/** A client source calling exactly `routes`, in the shapes `api.ts` actually uses. */
function client(routes: readonly string[]): string {
  return [
    "async function http<T>(url: string, init?: RequestInit): Promise<T> {",
    "  const res = await fetch(url, init);",
    "  return res.json() as Promise<T>;",
    "}",
    "export const api = {",
    ...routes.map((r, i) => `  m${i}: () => http('${r}'),`),
    "};",
  ].join("\n");
}

/** A backend source dispatching `exact` and `prefix`, in the shapes the route tables actually use. */
function backend(exact: readonly string[], prefix: readonly string[] = []): string {
  return [
    "export function createBackend() {",
    "  return async (req, res) => {",
    // The whole-table API-request guard every backend carries — a GUARD, never a route claim.
    '    if (!url.pathname.startsWith("/api/")) throw new HttpError(404, "not found");',
    ...exact.map((r) => `    if (url.pathname === "${r}") return serve(res);`),
    ...prefix.map((r) => `    if (url.pathname.startsWith("${r}")) return serve(res);`),
    '    throw new HttpError(404, "unknown endpoint");',
    "  };",
    "}",
  ].join("\n");
}

const parseBackend = (source: string) => parseDispatchedRoutes(source, "apps/desktop/x.ts");

// ---------------------------------------------------------------------------
// 1. THE HISTORICAL CASE — the judge fails on the state that shipped a broken tab
// ---------------------------------------------------------------------------

/**
 * The desktop's route table as it stood on 2026-08-28, before
 * `desktop-serves-the-traversal-routes`. Hand-transcribed rather than derived from today's source,
 * deliberately: an expectation computed from its own subject vanishes with the defect it guards
 * (`an-expectation-derived-from-its-subject-cannot-fail`). This is a claim about HISTORY, so it must
 * be written down, not read off a tree that has since been fixed.
 */
const DESKTOP_BEFORE_THE_FIX = [
  "/api/me",
  "/api/docs",
  "/api/docs/content",
  "/api/comments",
  "/api/chat",
  "/api/chat/reset",
  "/api/uat/attest",
  "/api/attestations",
  "/api/health",
  "/api/tree",
  "/api/activity",
  "/api/claims",
  "/api/arcs",
  "/api/floor-health",
  "/api/assets",
];

test("route coverage: THE DEFECT — it names the three traversal routes the desktop never mirrored", () => {
  const called = parseCalledRoutes(
    client([
      "/api/tree",
      "/api/traversal/sessions",
      "/api/traversal?session=${q(id)}",
      "/api/context-windows?session=${q(w)}",
    ]),
    CLIENT,
  );
  const served = parseBackend(backend(DESKTOP_BEFORE_THE_FIX, ["/api/arcs/"]));

  const findings = findUnservedRoutes({ called, served, exceptions: [] });
  assert.deepEqual(
    findings.filter((f) => f.kind === "unserved").map((f) => f.route).sort(),
    ["/api/context-windows", "/api/traversal", "/api/traversal/sessions"],
    "the check must fail on the exact state that answered `unknown endpoint` in the owner's app",
  );
  // `/api/tree` was mirrored and must NOT be reported — a check that flags everything is as useless
  // as one that flags nothing.
  assert.ok(!findings.some((f) => f.route === "/api/tree"));
});

test("route coverage: and it goes GREEN once those three are dispatched — the fix is what clears it", () => {
  const called = parseCalledRoutes(
    client([
      "/api/tree",
      "/api/traversal/sessions",
      "/api/traversal?session=${q(id)}",
      "/api/context-windows?session=${q(w)}",
    ]),
    CLIENT,
  );
  const served = parseBackend(
    backend(
      [
        ...DESKTOP_BEFORE_THE_FIX,
        "/api/traversal",
        "/api/traversal/sessions",
        "/api/context-windows",
      ],
      ["/api/arcs/"],
    ),
  );
  assert.deepEqual(findUnservedRoutes({ called, served, exceptions: [] }), []);
});

// ---------------------------------------------------------------------------
// 2. THE NEAR-MISS — the guard that would have made this check permanently green
// ---------------------------------------------------------------------------

test("route coverage: `!pathname.startsWith('/api/')` is a GUARD, and registering it would serve everything", () => {
  // The literal shape in apps/desktop/src/backend/local-backend.ts.
  const served = parseBackend(backend(["/api/health"]));
  assert.deepEqual([...served.prefix.keys()], [], "the whole-table API guard claims no route");

  // The consequence, asserted rather than trusted: had it registered, `/api/anything` would look
  // served and this check could never find a gap again.
  const called = parseCalledRoutes(client(["/api/health", "/api/never-mirrored"]), CLIENT);
  assert.deepEqual(
    findUnservedRoutes({ called, served, exceptions: [] }).map((f) => f.route),
    ["/api/never-mirrored"],
  );
});

test("route coverage: a REAL prefix dispatch does serve its family", () => {
  const served = parseBackend(backend(["/api/arcs"], ["/api/arcs/"]));
  assert.deepEqual([...served.prefix.keys()], ["/api/arcs/"]);

  const called = parseCalledRoutes(client(["/api/arcs", "/api/arcs/${q(id)}"]), CLIENT);
  const byRoute = new Map(called.map((c) => [c.route, c]));
  assert.equal(byRoute.get("/api/arcs/")?.isPrefix, true, "an interpolated segment is a PREFIX call");
  assert.deepEqual(findUnservedRoutes({ called, served, exceptions: [] }), []);
});

test("route coverage: the fall-through mount idiom (`pathname !==`) registers its route", () => {
  const served = parseBackend(
    'export const mount = async (req, res, pathname) => {\n  if (pathname !== "/api/chat/reset") return false;\n  return true;\n};',
  );
  assert.ok(served.exact.has("/api/chat/reset"));
});

test("route coverage: two surfaces' tables merge, first dispatcher winning", () => {
  const a = parseDispatchedRoutes(backend(["/api/health"]), "apps/desktop/src/backend/a.ts");
  const b = parseDispatchedRoutes(backend(["/api/health", "/api/uat/attest"]), "apps/desktop/electron/b.ts");
  const merged = mergeDispatchedRoutes([a, b]);
  assert.deepEqual([...merged.exact.keys()].sort(), ["/api/health", "/api/uat/attest"]);
  assert.equal(merged.exact.get("/api/health"), "apps/desktop/src/backend/a.ts");
});

// ---------------------------------------------------------------------------
// 3. COMMENT STRIPPING — the load-bearing half of the derivation
// ---------------------------------------------------------------------------

test("stripComments: prose about a route is not a call — all 57 of the studio's are comments", () => {
  const source = [
    "// `/api/presence` was retired and this line still names it",
    "/* a block comment naming /api/build and /api/adopt */",
    "const live = '/api/tree';",
  ].join("\n");
  const stripped = stripComments(source);
  assert.ok(!stripped.includes("/api/presence"));
  assert.ok(!stripped.includes("/api/build"));
  assert.ok(stripped.includes("/api/tree"));
});

test("stripComments: a `//` INSIDE a string is not a comment, and line numbers survive", () => {
  const source = ["const u = 'https://example.test/api/x';", "const v = '/api/tree';"].join("\n");
  const stripped = stripComments(source);
  assert.ok(stripped.includes("https://example.test/api/x"), "a URL's `//` must not open a comment");
  assert.equal(stripped.split("\n").length, 2);
});

test("stripComments: a block comment keeps the file's line count, so findings point at the right line", () => {
  const source = ["/*", " * two lines of prose", " */", "const v = '/api/tree';"].join("\n");
  const called = parseCalledRoutes(stripComments(source), CLIENT);
  assert.equal(called[0]?.line, 4);
});

test("stripComments: a regex body is not read as a comment", () => {
  const source = "const re = /a\\/\\/b/; const v = '/api/tree';";
  assert.ok(stripComments(source).includes("/api/tree"));
});

// ---------------------------------------------------------------------------
// 3b. THE LEXER, CHARACTER BY CHARACTER — every state it can be in
// ---------------------------------------------------------------------------

/**
 * `stripComments` is a hand-written character walk, and it is the load-bearing half of the whole
 * derivation: comments hold 57 `/api/*` mentions in `apps/studio` alone, three of them naming routes
 * nothing calls any more. A lexer that mis-handled ONE state — an escape inside a string, a template
 * spanning lines, a regex containing a slash — would either swallow live code (under-reporting the
 * called set, which reads as "fully covered") or leak prose (over-reporting it, which is then
 * silenced with exception entries until the list means nothing). Both failures point at a green
 * check, so every state gets a case.
 */
test("stripComments: an escaped quote does not end its string, so the code after it survives", () => {
  const out = stripComments(`const a = 'it\\'s fine'; const v = '/api/tree';`);
  assert.ok(out.includes("/api/tree"), "the second literal must still be there");
});

test("stripComments: a template literal may span lines and still carry its path", () => {
  const out = stripComments("const v = `/api/arcs/${\n  id\n}`;");
  assert.ok(out.includes("/api/arcs/"));
});

test("stripComments: a `/*` INSIDE a string is not a block comment", () => {
  const out = stripComments(`const glob = "src/*"; const v = '/api/tree';`);
  assert.ok(out.includes("src/*"));
  assert.ok(out.includes("/api/tree"));
});

test("stripComments: a block comment is removed even when it contains a quote", () => {
  const out = stripComments(`/* don't read this: '/api/ghost' */ const v = '/api/tree';`);
  assert.ok(!out.includes("/api/ghost"));
  assert.ok(out.includes("/api/tree"));
});

test("stripComments: a line comment at end of file needs no trailing newline", () => {
  assert.equal(stripComments("const v = 1; // trailing").trimEnd(), "const v = 1;");
});

test("stripComments: an UNTERMINATED block comment swallows the rest, and says so by producing no route", () => {
  // Not a case the repo has, but the walk must terminate rather than loop. The honest consequence is
  // that everything after it is treated as comment, which `parseCalledRoutes` then refuses as "no
  // /api/* literal found" rather than silently answering a short list.
  const out = stripComments("/* never closed\nconst v = '/api/tree';");
  assert.ok(!out.includes("/api/tree"));
});

test("stripComments: an ESCAPED-SLASH regex survives the strip — the shape every regex here uses", () => {
  // The walk tracks no regex state (see the function's header for the measurement). This is the case
  // that makes that safe: `\\/\\/` is four characters with no adjacent slash pair, so nothing reads as
  // a line comment. Every regex in the files this scans is written this way.
  const out = stripComments("const re = /a\\/\\/b/g; const v = '/api/tree';");
  assert.ok(out.includes("/api/tree"), "the code after the regex must survive");
});

test("stripComments: DIVISION is left alone — a `/` that begins nothing is copied through", () => {
  const out = stripComments("const half = total / 2; const v = '/api/tree';");
  assert.ok(out.includes("/api/tree"));
  assert.ok(out.includes("total / 2"));
});

test("stripComments: a regex character class holding a slash pair does NOT open a comment", () => {
  // `/[//]/` is the one shape a token-stream scan cannot resolve — the scanner emits a SlashToken
  // and only a parser calls `reScanSlashToken`. Both earlier drafts of this function (a hand-written
  // character walk, then a bare `ts.createScanner`) truncated this line and carried it as a stated
  // residual exposure. The full parse has no such gap, so the exposure is GONE rather than merely
  // documented — pinned here so a return to a cheaper scan reds instead of quietly reinstating it.
  const out = stripComments("const re = /[//]/; const v = '/api/tree';");
  assert.ok(out.includes("/api/tree"), "the code after the regex must survive");
});

test("stripComments: a comment INSIDE JSX is blanked, braces and all", () => {
  // `{/* … */}` with no expression has only its two braces as children, and the comment between them
  // is neither one's LEADING trivia. A leading-only sweep left `apps/studio/src/App.tsx:293` intact
  // and reported its prose mention of `/api/assets` as a SECOND API client (measured 2026-08-29).
  const out = stripComments(
    "export const V = () => (<main>{/* neither waits on `/api/assets` */}<b/></main>);",
    "apps/studio/src/App.tsx",
  );
  assert.ok(!out.includes("/api/assets"));
  assert.ok(out.includes("<main>"), "the JSX around it survives");
});

test("stripComments: a `.ts` file's GENERICS are not read as JSX", () => {
  // The variant is chosen by extension. Parsed as JSX, `http<T>(…)` opens a tag and the rest of the
  // file goes with it — which is how a JSDoc block eighty lines later came to be scanned as code.
  const source = [
    "async function http<T>(url: string): Promise<T> { return fetch(url) as Promise<T>; }",
    "/** prose mentioning /api/ghost */",
    "export const api = { m: () => http('/api/tree') };",
  ].join("\n");
  const out = stripComments(source, "apps/studio/src/api.ts");
  assert.ok(!out.includes("/api/ghost"), "the comment must still be found after the generics");
  assert.ok(out.includes("/api/tree"));
});

test("stripComments: line numbers survive every construct, so a finding points at the right line", () => {
  const source = [
    "// one",
    "/* two",
    "   three */",
    "const s = 'a//b';",
    "const v = '/api/tree';",
  ].join("\n");
  const called = parseCalledRoutes(stripComments(source), CLIENT);
  assert.equal(called[0]?.line, 5, "the route is on line 5 of the original file");
});

test("stripComments: an empty source is an empty answer, not a crash", () => {
  assert.equal(stripComments(""), "");
});

// ---------------------------------------------------------------------------
// 3c. THE SCANNERS' OWN ARITHMETIC
// ---------------------------------------------------------------------------

test("parseDispatchedRoutes: a route claimed twice in one file keeps its FIRST dispatcher", () => {
  const served = parseDispatchedRoutes(
    'if (pathname === "/api/x") a();\nif (pathname === "/api/x") b();',
    "apps/desktop/first.ts",
  );
  assert.deepEqual([...served.exact.keys()], ["/api/x"]);
  assert.equal(served.exact.get("/api/x"), "apps/desktop/first.ts");
});

test("parseDispatchedRoutes: a dispatch inside a COMMENT is not a served route", () => {
  const served = parseDispatchedRoutes('// if (pathname === "/api/ghost") ...\nif (pathname === "/api/real") a();', "x.ts");
  assert.deepEqual([...served.exact.keys()], ["/api/real"]);
});

test("mergeDispatchedRoutes: an empty list merges to an empty table rather than throwing", () => {
  const merged = mergeDispatchedRoutes([]);
  assert.equal(merged.exact.size, 0);
  assert.equal(merged.prefix.size, 0);
});

test("mergeDispatchedRoutes: prefix tables merge too, first file winning", () => {
  const a = parseDispatchedRoutes('if (pathname.startsWith("/api/arcs/")) a();', "a.ts");
  const b = parseDispatchedRoutes('if (pathname.startsWith("/api/arcs/")) b();', "b.ts");
  assert.equal(mergeDispatchedRoutes([a, b]).prefix.get("/api/arcs/"), "a.ts");
});

test("parseCalledRoutes: routes come out SORTED, so a finding list is stable across runs", () => {
  const called = parseCalledRoutes(client(["/api/zebra", "/api/alpha", "/api/middle"]), CLIENT);
  assert.deepEqual(
    called.map((c) => c.route),
    ["/api/alpha", "/api/middle", "/api/zebra"],
  );
});

test("parseCalledRoutes: the same route called twice is ONE entry, reported at its first call site", () => {
  const called = parseCalledRoutes(client(["/api/tree", "/api/tree"]), CLIENT);
  assert.equal(called.length, 1);
  assert.equal(called[0]?.line, 6, "the first call site, not the last");
});

test("parseCalledRoutes: a protocol-relative URL is not a request path and is skipped, not refused", () => {
  const called = parseCalledRoutes("const cdn = '//cdn.test/x'; http('/api/tree');", CLIENT);
  assert.deepEqual(called.map((c) => c.route), ["/api/tree"]);
});

test("findUnservedRoutes: a PREFIX dispatch above the called path serves it; one below does not", () => {
  // `startsWith("/api/docs")` serves `/api/docs/content`; the converse must not hold, or a narrow
  // dispatch would appear to cover a whole family.
  const broad = parseBackend(backend([], ["/api/docs"]));
  const narrow = parseBackend(backend([], ["/api/docs/content/deep/"]));
  const called = parseCalledRoutes(client(["/api/docs/content"]), CLIENT);
  assert.deepEqual(findUnservedRoutes({ called, served: broad, exceptions: [] }), []);
  assert.equal(findUnservedRoutes({ called, served: narrow, exceptions: [] }).length, 1);
});

test("findUnservedRoutes: a called PREFIX is served by any dispatch at or below it", () => {
  // `/api/arcs/${id}` is a call for the whole family, and `startsWith("/api/arcs/")` answers it.
  const called = parseCalledRoutes(client(["/api/arcs/${q(id)}"]), CLIENT);
  assert.deepEqual(findUnservedRoutes({ called, served: parseBackend(backend([], ["/api/arcs/"])), exceptions: [] }), []);
  // …but an EXACT dispatch on the bare parent does not serve the family.
  assert.equal(
    findUnservedRoutes({ called, served: parseBackend(backend(["/api/arcs"])), exceptions: [] }).length,
    1,
  );
});

test("findForeignApiLiterals: it reports the LINE, so a second client is findable rather than merely announced", () => {
  const found = findForeignApiLiterals([
    { file: "apps/studio/src/lib/rogue.ts", source: "const a = 1;\nconst b = 2;\nfetch('/api/tree');" },
  ]);
  assert.equal(found[0]?.line, 3);
  assert.equal(found[0]?.file, "apps/studio/src/lib/rogue.ts");
});

test("findForeignApiLiterals: the reported line is the LITERAL's, not the file's length", () => {
  // `text.slice(0, index).split("\n").length` must slice to the MATCH. Slicing the whole text
  // reports the file's line count for every finding, which happens to be right only when the literal
  // is on the last line — so a suite whose fixture ends there proves nothing.
  const found = findForeignApiLiterals([
    { file: "apps/studio/src/lib/rogue.ts", source: "fetch('/api/tree');\nconst a = 1;\nconst b = 2;\nconst c = 3;" },
  ]);
  assert.equal(found[0]?.line, 1, "the literal is on line 1 of a four-line file");
});

test("findForeignApiLiterals: an empty file list finds nothing and does not throw", () => {
  assert.deepEqual(findForeignApiLiterals([]), []);
});

test("parseDispatchedRoutes: only a REAL dispatch matches — near-misses must not register a route", () => {
  // The scan is a regex over source text, so its precision IS the check's precision. Each line below
  // is one character away from a dispatch and must register nothing; a looser pattern would report
  // routes the surface does not serve, and every one of those is a finding that never fires.
  for (const source of [
    'if (pathname == "/api/loose") a();', // `==`, not `===`
    'if (other === "/api/notpathname") a();', // not the `pathname` identifier
    'if (pathname === "/apiary/x") a();', // a longer word, not the `/api/` prefix
    'const label = "/api/prose";', // a literal that dispatches nothing
    'if (mypathname === "/api/suffixed") a();', // `pathname` as a SUFFIX of another identifier
  ]) {
    const served = parseDispatchedRoutes(source, "x.ts");
    assert.deepEqual([...served.exact.keys()], [], source);
    assert.deepEqual([...served.prefix.keys()], [], source);
  }
  // …and the two real spellings still do register.
  assert.ok(parseDispatchedRoutes('if (pathname === "/api/real") a();', "x.ts").exact.has("/api/real"));
  assert.ok(parseDispatchedRoutes('if (pathname !== "/api/real") return false;', "x.ts").exact.has("/api/real"));
});

test("parseDispatchedRoutes: a prefix dispatch matches only the startsWith CALL, not a lookalike", () => {
  for (const source of [
    'if (pathname.startsWithSomething("/api/loose")) a();',
    'if (other.startsWith("/api/notpathname")) a();',
    'if (mypathname.startsWith("/api/suffixed")) a();',
  ]) {
    assert.deepEqual([...parseDispatchedRoutes(source, "x.ts").prefix.keys()], [], source);
  }
  assert.ok(parseDispatchedRoutes('if (pathname.startsWith("/api/real/")) a();', "x.ts").prefix.has("/api/real/"));
  // Whitespace around the call is normal formatting and must not defeat the match.
  assert.ok(
    parseDispatchedRoutes('if ( pathname . startsWith ( "/api/spaced/" ) ) a();', "x.ts").prefix.has("/api/spaced/"),
  );
});

test("parseDispatchedRoutes: the whole-API prefix is dropped in its UN-NEGATED form too", () => {
  // `apps/studio/server/serve.ts` writes this guard without the `!` — `if (pathname.startsWith('/api/'))
  // { proxy() }` — so the negation lookbehind does NOT cover it, and only the guard SET does. Both
  // spellings must claim no route: registering `/api/` as a prefix would make every called route
  // look served, and this check would never find a gap again.
  for (const source of [
    'if (url.pathname.startsWith("/api/")) proxy(req);',
    'if (url.pathname.startsWith("/api")) proxy(req);',
  ]) {
    assert.deepEqual([...parseDispatchedRoutes(source, "x.ts").prefix.keys()], [], source);
  }
  // …while a real family prefix one segment deeper still registers.
  assert.ok(parseDispatchedRoutes('if (pathname.startsWith("/api/arcs/")) a();', "x.ts").prefix.has("/api/arcs/"));
});

test("parseDispatchedRoutes: a prefix claimed twice in one file keeps its FIRST dispatcher", () => {
  const served = parseDispatchedRoutes(
    'if (pathname.startsWith("/api/arcs/")) a();\nif (pathname.startsWith("/api/arcs/")) b();',
    "apps/desktop/only.ts",
  );
  assert.deepEqual([...served.prefix.keys()], ["/api/arcs/"]);
  assert.equal(served.prefix.get("/api/arcs/"), "apps/desktop/only.ts");
});

test("parseDispatchedRoutes: a dispatch written with NO whitespace still registers", () => {
  // The pattern allows any amount, including none. A pattern requiring exactly one space would miss
  // every minified or tightly-formatted dispatch, and miss it SILENTLY.
  assert.ok(parseDispatchedRoutes('if(pathname==="/api/tight")a();', "x.ts").exact.has("/api/tight"));
  assert.ok(parseDispatchedRoutes('if(pathname!=="/api/tight2")return false;', "x.ts").exact.has("/api/tight2"));
  assert.ok(parseDispatchedRoutes('if(pathname.startsWith("/api/tight3/"))a();', "x.ts").prefix.has("/api/tight3/"));
});

test("parseDispatchedRoutes: the SLASHLESS `/api` guard is dropped too, not just `/api/`", () => {
  // `startsWith("/api")` is the same whole-table guard written one character shorter, and it claims
  // every route just as completely.
  assert.deepEqual([...parseDispatchedRoutes('if (!pathname.startsWith("/api")) throw x;', "x.ts").prefix.keys()], []);
});

test("parseCalledRoutes: an interpolation must be the WHOLE tail to read as a prefix", () => {
  // `/api/arcs/${id}` is a call for the family. `/api/arcs/${id}/x` is not — it names a deeper route
  // this scan cannot resolve, and treating it as the family prefix would claim coverage the client
  // never asked for.
  assert.throws(
    () => parseCalledRoutes("http(`/api/arcs/${id}/x`);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError,
  );
  const ok = parseCalledRoutes("http(`/api/arcs/${id}`);", CLIENT);
  assert.equal(ok[0]?.isPrefix, true);
});

test("parseCalledRoutes: a QUERY on a slash-ending path is not a family prefix", () => {
  // `/api/x/?q=${v}` cuts at the `?`, leaving a tail that is a query and not an interpolated
  // segment — even though it happens to END in one. Read as a prefix, this would claim the whole
  // `/api/x/…` family is called when the client asked for exactly one path.
  const called = parseCalledRoutes("http(`/api/x/?q=${v}`);", CLIENT);
  assert.deepEqual(
    called.map((c) => [c.route, c.isPrefix]),
    [["/api/x/", false]],
  );
});

test("parseCalledRoutes: only a TRAILING-slash path reads as a prefix call", () => {
  // `/api/arcs/${id}` is the family; `/api/arcs${id}` is a path being CONCATENATED and names no
  // route. Reading the second as a prefix would silently claim `/api/arcs…` is covered by any
  // dispatch under `/api/arcs/`.
  assert.throws(() => parseCalledRoutes("http(`/api/arcs${id}`);", CLIENT), RouteDerivationError);
  assert.equal(parseCalledRoutes("http(`/api/arcs/${id}`);", CLIENT)[0]?.isPrefix, true);
});

test("parseCalledRoutes: a query CUT keeps the pathname and drops everything after the `?`", () => {
  // Both the `?` and the `${` positions must be considered, and the SMALLER wins: a path carrying
  // both (`/api/x?id=${v}`) cuts at the `?`, never at the interpolation inside the query.
  assert.deepEqual(
    parseCalledRoutes("http(`/api/x?id=${v}&z=1`);", CLIENT).map((c) => [c.route, c.isPrefix]),
    [["/api/x", false]],
  );
  assert.deepEqual(
    parseCalledRoutes("http('/api/y?fixed=1');", CLIENT).map((c) => c.route),
    ["/api/y"],
  );
});

test("parseCalledRoutes: the base-URL refusal reads the WHOLE literal, not just its opening", () => {
  // The pattern must span arbitrary characters before the interpolation. A pattern that only
  // tolerated quote characters there would miss every real base-URL shape, which all carry a path
  // fragment or a variable name first.
  //
  // ⚠ THE MESSAGE IS ASSERTED, NOT JUST THE ERROR TYPE, and that distinction is the whole test. A
  // loosened pattern does not stop this input throwing — the literal scan finds no `/api/…` either,
  // so the empty-set guard throws instead. Matching on `RouteDerivationError` alone therefore passes
  // whether the base-URL guard fired or not, which is a test that cannot fail for its own reason.
  for (const source of ["http(`${base}/api/tree`);", "http(`prefix-${base}/api/tree`);"]) {
    assert.throws(
      () => parseCalledRoutes(source, CLIENT),
      (err: unknown) => err instanceof RouteDerivationError && /base URL/.test((err as Error).message),
      source,
    );
  }
});

test("parseCalledRoutes: a base-URL refusal fires on the PREFIX shape and not on a query interpolation", () => {
  // The two are one character apart in the source and opposite in meaning: `${base}/api/x` hides
  // every route, while `/api/x?q=${v}` is the ordinary way a query is built here.
  assert.throws(
    () => parseCalledRoutes("http(`${base}/api/tree`);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /base URL/.test((err as Error).message),
  );
  assert.deepEqual(
    parseCalledRoutes("http(`/api/tree?q=${v}`);", CLIENT).map((c) => c.route),
    ["/api/tree"],
  );
});

test("findUnservedRoutes: a called PREFIX is served by a dispatch BELOW it as well as at it", () => {
  // `/api/arcs/${id}` asks for the family; a backend that dispatches `startsWith("/api/arcs/deep/")`
  // serves part of it. Reported as served rather than missing — the check's subject is whether a
  // route reaches a handler at all, and a narrower dispatch is a routing decision, not an absence.
  const called = parseCalledRoutes(client(["/api/arcs/${q(id)}"]), CLIENT);
  const below = parseBackend(backend([], ["/api/arcs/deep/"]));
  assert.deepEqual(findUnservedRoutes({ called, served: below, exceptions: [] }), []);
});

test("stripComments: the variant is chosen by EXTENSION, and the two readings genuinely differ", () => {
  // One source, two answers. `<T>(x: T) => x` is a generic arrow in a `.ts` file and an unclosed JSX
  // tag in a `.tsx` one, so the parser's recovery differs and so does what it can still identify as
  // a comment. Asserting the DIFFERENCE is what pins the choice: a check that only ever looked at
  // one variant would pass whatever rule selected it — including a rule that always chose the same
  // one, which is exactly how the desync that reported a called route `"/"` got in.
  const source = "const id = <T>(x: T) => x; // mentions /api/ghost\nconst v = '/api/tree';";
  const asTs = stripComments(source, "a.ts");
  const asTsx = stripComments(source, "a.tsx");
  assert.notEqual(asTs, asTsx, "the extension must actually change how the source is read");
  // The `.ts` reading is the correct one for this source, and it finds the comment.
  assert.ok(!asTs.includes("/api/ghost"));
  assert.ok(asTs.includes("/api/tree"));
});

test("stripComments: a JSX comment in a `.tsx` file is blanked", () => {
  const out = stripComments(
    "export const V = () => (<main>{/* neither waits on /api/ghost */}<b/></main>);",
    "apps/studio/src/App.tsx",
  );
  assert.ok(!out.includes("/api/ghost"));
  assert.ok(out.includes("<main>"));
});

// ---------------------------------------------------------------------------
// 4. THE REFUSALS — an enumeration that cannot see must never answer quietly
// ---------------------------------------------------------------------------

test("parseCalledRoutes: an ASSEMBLED path (`'/api/' + x`) is refused, never silently truncated", () => {
  assert.throws(
    () => parseCalledRoutes("const u = '/api/' + kind; http(u);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /ASSEMBLED/.test((err as Error).message),
  );
});

test("parseCalledRoutes: a BASE-URL prefix is refused — it would take every route out of view at once", () => {
  assert.throws(
    () => parseCalledRoutes("const u = `${base}/api/tree`; http(u);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /base URL/.test((err as Error).message),
  );
});

test("parseCalledRoutes: an interpolation at the ROOT resolves to the bare `/api/` and is refused", () => {
  // The second half of the vacuity guard 1 exists for: `/api/${kind}/list` cuts to `/api/`, which as
  // a called PREFIX would match every served route there is. An earlier draft checked the RAW
  // literal instead of the resolved route and let this straight through.
  assert.throws(
    () => parseCalledRoutes("http(`/api/${kind}/list`);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /at the ROOT/.test((err as Error).message),
  );
});

test("parseCalledRoutes: an interpolated MIDDLE segment names no single route and is refused", () => {
  // Resolves to `/api/foo/` — a plausible-looking prefix that is NOT what the call issues, so
  // accepting it would silently claim coverage of a family the client never asks for.
  assert.throws(
    () => parseCalledRoutes("http(`/api/foo/${x}/bar`);", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /INSIDE a segment/.test((err as Error).message),
  );
});

test("parseCalledRoutes: a request path outside `/api/` is refused rather than quietly skipped", () => {
  assert.throws(
    () => parseCalledRoutes("http('/internal/tree');", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /not an `\/api\/…` route/.test((err as Error).message),
  );
});

test("parseCalledRoutes: a client yielding NO routes is refused — an empty set has an empty difference", () => {
  assert.throws(
    () => parseCalledRoutes("export const api = {};", CLIENT),
    (err: unknown) => err instanceof RouteDerivationError && /derivation broke/.test((err as Error).message),
  );
});

test("parseCalledRoutes: a query string is cut, leaving the pathname a dispatch table can match", () => {
  const called = parseCalledRoutes(client(["/api/traversal?session=${q(id)}"]), CLIENT);
  assert.deepEqual(
    called.map((c: CalledRoute) => [c.route, c.isPrefix]),
    [["/api/traversal", false]],
  );
});

test("findForeignApiLiterals: a SECOND API client is refused, but prose about one is not", () => {
  assert.deepEqual(
    findForeignApiLiterals([
      { file: "apps/studio/src/lib/appData.ts", source: "// waits on `/api/assets` before painting" },
    ]),
    [],
    "a comment naming a route is not a client",
  );
  const found = findForeignApiLiterals([
    { file: "apps/studio/src/lib/rogue.ts", source: "export const boot = () => fetch('/api/tree');" },
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.text, "/api/tree");
});

// ---------------------------------------------------------------------------
// 5. THE EXCEPTION LIST — declared, reasoned, and self-pruning
// ---------------------------------------------------------------------------

const except = (route: string): RouteException => ({ route, reason: "declared for the test" });

test("findUnservedRoutes: a declared exception suppresses its own route and nothing else", () => {
  const called = parseCalledRoutes(client(["/api/users", "/api/never-mirrored"]), CLIENT);
  const served = parseBackend(backend(["/api/health"]));
  assert.deepEqual(
    findUnservedRoutes({ called, served, exceptions: [except("/api/users")] }).map((f) => f.route),
    ["/api/never-mirrored"],
  );
});

test("findUnservedRoutes: an exception the frontend no longer calls is STALE and must be deleted", () => {
  const called = parseCalledRoutes(client(["/api/tree"]), CLIENT);
  const served = parseBackend(backend(["/api/tree"]));
  const findings = findUnservedRoutes({ called, served, exceptions: [except("/api/retired")] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, "stale-exception");
  assert.match(findings[0]?.detail ?? "", /no longer calls/);
});

test("findUnservedRoutes: a stale-exception check reads the exception's OWN route, not the first one", () => {
  // The lookup that pairs an exception with its call must match on the route. Matching anything
  // (returning the first call) would judge every exception against `/api/alpha`'s served-ness — so
  // an exception for a route the desktop does NOT serve would be reported stale, and the operator
  // would be told to delete the entry that is holding a real divergence declared.
  const called = parseCalledRoutes(client(["/api/alpha", "/api/omega"]), CLIENT);
  const served = parseBackend(backend(["/api/alpha"]));
  const findings = findUnservedRoutes({ called, served, exceptions: [except("/api/omega")] });
  assert.deepEqual(findings, [], "/api/omega is unserved and excepted — nothing to report");
});

test("findUnservedRoutes: an exception whose route the desktop now SERVES is STALE too", () => {
  // This is the arm that keeps the list from quietly outliving its reasons — and the one that caught
  // the `startsWith("/api/")` guard bug, by reporting four correct exceptions as stale at once.
  const called = parseCalledRoutes(client(["/api/tree"]), CLIENT);
  const served = parseBackend(backend(["/api/tree"]));
  const findings = findUnservedRoutes({ called, served, exceptions: [except("/api/tree")] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.kind, "stale-exception");
  assert.match(findings[0]?.detail ?? "", /now SERVES/);
});

test("every declared desktop exception carries a real reason — a bare route is an oversight", () => {
  assert.ok(DESKTOP_ROUTE_EXCEPTIONS.length > 0, "the list must not be empty by accident");
  for (const e of DESKTOP_ROUTE_EXCEPTIONS) {
    assert.match(e.route, /^\/api\/[a-z/-]+$/, `${e.route} is not a route`);
    // Long enough to be an argument rather than a label. Every real entry explains WHY the desktop
    // is correct to 404, which is the question an exception exists to answer.
    assert.ok(e.reason.trim().length > 40, `${e.route}'s reason is too thin to review: ${e.reason}`);
  }
  assert.equal(
    new Set(DESKTOP_ROUTE_EXCEPTIONS.map((e) => e.route)).size,
    DESKTOP_ROUTE_EXCEPTIONS.length,
    "a route declared twice hides which reason is live",
  );
});

// ---------------------------------------------------------------------------
// 6. THE DECLARATIONS THEMSELVES — every one names a real place on disk
// ---------------------------------------------------------------------------

/**
 * `route-surfaces.ts` is pure declaration, and until this test it was read only by two gate scripts.
 * A directory renamed out from under it, or a client that moved, would not have failed anything in
 * `pnpm -r test`: the check would refuse at gate time (which is fail-closed and correct), but the
 * declaration itself was asserted by nothing. These are the facts the whole derivation rests on, so
 * they are checked where they are cheap to check.
 */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("route surfaces: every declared directory exists and actually dispatches /api/* routes", () => {
  for (const surface of [REFERENCE_SURFACE, MIRROR_SURFACE]) {
    assert.ok(surface.surface.length > 0, "a surface with no name cannot be reported");
    assert.ok(surface.dirs.length > 0, `${surface.surface} declares no directories — it would enumerate nothing`);
    for (const dir of surface.dirs) {
      // Non-empty FIRST, for the reason spelled out in the frontend-trees case below.
      assert.ok(dir.trim().length > 0, `${surface.surface}: a blank directory entry walks the repo root`);
      assert.ok(existsSync(join(repoRoot, dir)), `${surface.surface}: declared route directory ${dir} does not exist`);
    }
  }
  // The DESKTOP is two directories on purpose, and reading only the first was `mirror-pair-drift`'s
  // own blind spot — the mounts in `electron/` serve real routes.
  assert.ok(MIRROR_SURFACE.dirs.length >= 2, "the desktop serves /api/* from src/backend AND electron/");
  assert.notDeepEqual(REFERENCE_SURFACE.dirs, MIRROR_SURFACE.dirs, "the two surfaces must be different trees");
});

test("route surfaces: the declared API client exists and is the file the frontend calls through", () => {
  const client = join(repoRoot, API_CLIENT);
  assert.ok(existsSync(client), `${API_CLIENT} does not exist — the called-route set would be derived from nothing`);
  // Not merely present: it must actually be a client. A file with no `/api/` literal would make
  // `parseCalledRoutes` refuse, which is the honest failure — this asserts the declaration is right
  // rather than waiting for that refusal at gate time.
  assert.match(readFileSync(client, "utf8"), /["'`]\/api\//, `${API_CLIENT} names no /api/ route`);
  assert.ok(
    FRONTEND_TREES.some((tree) => API_CLIENT.startsWith(`${tree}/`)),
    "the API client must sit inside a swept frontend tree, or the foreign-literal sweep would exclude the one file it is measured against",
  );
});

test("route surfaces: every frontend tree swept for a second client exists", () => {
  assert.ok(FRONTEND_TREES.length > 0, "sweeping no tree would let a second API client appear unseen");
  for (const tree of FRONTEND_TREES) {
    // Non-empty FIRST: `join(repoRoot, "")` is the repo root, which exists — so an existence check
    // alone passes a blanked entry and then sweeps the whole repo.
    assert.ok(tree.trim().length > 0, "a blank tree entry sweeps the repo root instead of a frontend");
    assert.ok(existsSync(join(repoRoot, tree)), `declared frontend tree ${tree} does not exist`);
  }
  assert.equal(new Set(FRONTEND_TREES).size, FRONTEND_TREES.length, "a tree swept twice reports every finding twice");
});
