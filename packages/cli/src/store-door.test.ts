import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveStoreDoor,
  StoreDoorConfigError,
  STORE_DOOR_TOKEN_ENV,
  STORE_DOOR_URL_ENV,
} from "./store-door.js";

/**
 * The CLI's third store (ADR-0259 D1). The behaviour that matters is the FAIL-CLOSED rule: a
 * configured-but-broken door must never degrade to the offline seed, because once ADR-0302 D1
 * decommits that seed the fallback reads as an EMPTY corpus and the session reports "no such
 * artifact" for artifacts that exist.
 */
describe("resolveStoreDoor", () => {
  it("returns null when no door is configured — the offline/--pg paths are untouched", () => {
    assert.equal(resolveStoreDoor({}), null);
    assert.equal(resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "" }), null);
    assert.equal(resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "   " }), null);
  });

  it("resolves an https door, with no auth header when no token is set", () => {
    const door = resolveStoreDoor({
      [STORE_DOOR_URL_ENV]: "https://studio.example/api/store",
    });
    assert.deepEqual(door, { baseUrl: "https://studio.example/api/store", headers: {} });
  });

  it("carries a token as a bearer header — the seat for whatever credential is chosen", () => {
    const door = resolveStoreDoor({
      [STORE_DOOR_URL_ENV]: "https://studio.example/api/store",
      [STORE_DOOR_TOKEN_ENV]: "  tok-123  ",
    });
    assert.deepEqual(door?.headers, { authorization: "Bearer tok-123" });
  });

  it("strips a trailing slash so the dialled URL is the one an error message names", () => {
    const door = resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "https://studio.example/api/store//" });
    assert.equal(door?.baseUrl, "https://studio.example/api/store");
  });

  it("accepts http — a local desktop door (ADR-0259 D2) is not remote and needs no TLS", () => {
    const door = resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "http://127.0.0.1:5173/api/store" });
    assert.equal(door?.baseUrl, "http://127.0.0.1:5173/api/store");
  });

  it("THROWS on an unparseable URL rather than silently falling back to the seed", () => {
    assert.throws(
      () => resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "studio.example/api/store" }),
      (err: unknown) =>
        err instanceof StoreDoorConfigError && /not a valid URL/.test((err as Error).message),
    );
  });

  it("THROWS on a non-http(s) scheme — the door is ordinary HTTPS on 443 by design", () => {
    assert.throws(
      () => resolveStoreDoor({ [STORE_DOOR_URL_ENV]: "postgres://host/db" }),
      (err: unknown) =>
        err instanceof StoreDoorConfigError && /must be an http\(s\) URL/.test((err as Error).message),
    );
  });
});
