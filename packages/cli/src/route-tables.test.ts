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
