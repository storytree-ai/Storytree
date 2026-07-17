// loopback-guard — the auth / CSRF / DNS-rebinding wall for the desktop's loopback HTTP surfaces
// (the sidecar dispatch + the /api proxy). These tests pin the decision table headlessly (no electron,
// no live server): read-only requests pass; mutating requests must clear Origin, Host, and token.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SIDECAR_TOKEN_HEADER,
  guardRequest,
  guardHttpRequest,
  isAcceptableOrigin,
  isLoopbackHost,
} from "./loopback-guard.js";

const TOKEN = "s3cret-per-launch-token";
const STUDIO_ORIGIN = "http://127.0.0.1:53422";
const STUDIO_HOST = "127.0.0.1:53422";

test("lg-read-only-methods-always-pass: GET/HEAD are lenient even with a hostile origin", () => {
  // The boot read routes (GET /api/tree, /api/me, /api/docs, …) must never be gated — a cross-origin
  // GET can't read the response (CORS) and the routes mutate nothing, so leniency is safe and required.
  for (const method of ["GET", "HEAD", "get", "head"]) {
    const verdict = guardRequest(
      { method, origin: "https://evil.example.com", host: "evil.example.com", token: undefined },
      { expectedToken: TOKEN },
    );
    assert.deepEqual(verdict, { ok: true }, `${method} should pass`);
  }
});

test("lg-legit-renderer-post-passes: same-origin loopback POST with the injected token is allowed", () => {
  // The renderer's own POST /api/chat|build|adopt|uat/attest: loopback Origin + loopback Host + the
  // proxy-injected token → allowed. This is the flow that must keep working after the fix.
  const verdict = guardRequest(
    { method: "POST", origin: STUDIO_ORIGIN, host: STUDIO_HOST, token: TOKEN },
    { expectedToken: TOKEN },
  );
  assert.deepEqual(verdict, { ok: true });
});

test("lg-absent-origin-post-passes: a same-origin POST that omits Origin still clears the origin check", () => {
  // Browsers may omit Origin on some same-origin POSTs; absent Origin is acceptable (Host + token still
  // gate the request). Only a PRESENT, non-loopback Origin is a CSRF tell.
  const verdict = guardRequest(
    { method: "POST", origin: undefined, host: STUDIO_HOST, token: TOKEN },
    { expectedToken: TOKEN },
  );
  assert.deepEqual(verdict, { ok: true });
});

test("lg-cross-origin-post-refused: a remote Origin is a 403 (browser CSRF)", () => {
  // The core threat: a web page the user visits fires a CORS-simple POST at the loopback port. The
  // browser attaches the page's real Origin, which is not loopback → refused before any mount runs.
  const verdict = guardRequest(
    { method: "POST", origin: "https://evil.example.com", host: STUDIO_HOST, token: TOKEN },
    { expectedToken: TOKEN },
  );
  assert.equal(verdict.ok, false);
  assert.equal((verdict as { status: number }).status, 403);
});

test("lg-rebinding-host-refused: a non-loopback Host is a 403 (DNS rebinding)", () => {
  // A DNS-rebinding page resolves its own domain to 127.0.0.1; the browser still sends Host = the
  // attacker's domain (which the attacker only controls as their domain, not as 127.0.0.1). Even with
  // Origin omitted (same-origin from the page's view), the non-loopback Host is the rebinding tell.
  const verdict = guardRequest(
    { method: "POST", origin: undefined, host: "attacker.example.com:53422", token: TOKEN },
    { expectedToken: TOKEN },
  );
  assert.equal(verdict.ok, false);
  assert.equal((verdict as { status: number }).status, 403);
});

test("lg-missing-token-refused: a loopback-looking POST without the proxy token is a 403", () => {
  // Defense-in-depth against a local NON-browser process (no Origin/Host constraints) hitting the
  // sidecar's ephemeral port directly: it can forge loopback Origin/Host but not the per-launch secret.
  const noToken = guardRequest(
    { method: "POST", origin: STUDIO_ORIGIN, host: STUDIO_HOST, token: undefined },
    { expectedToken: TOKEN },
  );
  assert.equal(noToken.ok, false);
  assert.equal((noToken as { status: number }).status, 403);

  const wrongToken = guardRequest(
    { method: "POST", origin: STUDIO_ORIGIN, host: STUDIO_HOST, token: "not-the-token" },
    { expectedToken: TOKEN },
  );
  assert.equal(wrongToken.ok, false);
});

test("lg-token-optional-at-proxy: with no expectedToken, Origin+Host alone gate the request", () => {
  // The static-server proxy runs the guard WITHOUT a token (it is the entry point; it injects the token
  // downstream). A legit loopback POST passes; a cross-origin one is still refused.
  assert.deepEqual(
    guardRequest({ method: "POST", origin: STUDIO_ORIGIN, host: STUDIO_HOST, token: undefined }),
    { ok: true },
  );
  assert.equal(
    guardRequest({ method: "POST", origin: "https://evil.example.com", host: STUDIO_HOST, token: undefined }).ok,
    false,
  );
});

test("lg-null-origin-refused: the opaque `null` origin (sandboxed frame / data:) is refused for mutations", () => {
  assert.equal(isAcceptableOrigin("null"), false);
  assert.equal(
    guardRequest({ method: "POST", origin: "null", host: STUDIO_HOST, token: TOKEN }, { expectedToken: TOKEN }).ok,
    false,
  );
});

test("lg-origin-predicate: loopback variants accepted, remotes refused", () => {
  assert.equal(isAcceptableOrigin("http://localhost:5173"), true);
  assert.equal(isAcceptableOrigin("http://127.0.0.1:8080"), true);
  assert.equal(isAcceptableOrigin("http://[::1]:8080"), true);
  assert.equal(isAcceptableOrigin("https://127.0.0.1"), true);
  assert.equal(isAcceptableOrigin(undefined), true); // absent → same-origin, acceptable
  assert.equal(isAcceptableOrigin("http://127.0.0.1.evil.com"), false); // suffix trick — not loopback
  assert.equal(isAcceptableOrigin("http://evil.com"), false);
  assert.equal(isAcceptableOrigin("file://"), false);
});

test("lg-host-predicate: loopback hosts accepted, everything else refused", () => {
  assert.equal(isLoopbackHost("127.0.0.1:53422"), true);
  assert.equal(isLoopbackHost("localhost:5173"), true);
  assert.equal(isLoopbackHost("[::1]:8080"), true);
  assert.equal(isLoopbackHost("127.5.6.7"), true); // 127.0.0.0/8 is all loopback
  assert.equal(isLoopbackHost(undefined), false); // absent → refused for mutations
  assert.equal(isLoopbackHost("attacker.example.com:53422"), false);
  assert.equal(isLoopbackHost("127.0.0.1.evil.com"), false); // suffix trick
});

test("lg-guardHttpRequest-extracts-headers: reads method + origin/host/token off an IncomingMessage shape", () => {
  // node lower-cases header keys; the token header comparison is against that lower-cased form.
  const ok = guardHttpRequest(
    {
      method: "POST",
      headers: { origin: STUDIO_ORIGIN, host: STUDIO_HOST, [SIDECAR_TOKEN_HEADER]: TOKEN },
    },
    { expectedToken: TOKEN },
  );
  assert.deepEqual(ok, { ok: true });

  // An array-valued header (node's shape for a repeated header) takes the first entry.
  const arrayHeader = guardHttpRequest(
    {
      method: "POST",
      headers: { origin: [STUDIO_ORIGIN], host: STUDIO_HOST, [SIDECAR_TOKEN_HEADER]: TOKEN },
    },
    { expectedToken: TOKEN },
  );
  assert.deepEqual(arrayHeader, { ok: true });

  const refused = guardHttpRequest(
    { method: "POST", headers: { origin: "https://evil.example.com", host: STUDIO_HOST } },
    { expectedToken: TOKEN },
  );
  assert.equal(refused.ok, false);
});
