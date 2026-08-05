import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { chooseCorpusSource, corpusUnreachableMessage } from "./corpus-store.js";
import { STORE_DOOR_URL_ENV } from "./store-door.js";

describe("chooseCorpusSource", () => {
  test("defaults to the direct connector when no door is configured", () => {
    assert.deepEqual(chooseCorpusSource({}), { kind: "pg" });
  });

  test("prefers the store door when STORYTREE_STORE_URL is set", () => {
    const source = chooseCorpusSource({ [STORE_DOOR_URL_ENV]: "https://studio.example/api/store" });
    assert.equal(source.kind, "door");
    assert.equal(source.kind === "door" && source.door.baseUrl, "https://studio.example/api/store");
  });

  test("a set-but-broken door THROWS rather than degrading to the connector", () => {
    // The fail-closed rule store-door.ts establishes, asserted here too: silently choosing another
    // source when the operator named one is how a generator reads the wrong corpus.
    assert.throws(() => chooseCorpusSource({ [STORE_DOOR_URL_ENV]: "not-a-url" }), /not a valid URL/);
  });
});

describe("corpusUnreachableMessage", () => {
  test("names the connector remedy and refuses a seed fallback", () => {
    const msg = corpusUnreachableMessage("build:guidance", { kind: "pg" }, "ECONNREFUSED");
    assert.match(msg, /build:guidance/);
    assert.match(msg, /ECONNREFUSED/);
    assert.match(msg, /pnpm db:up/);
    // The whole point of the loud failure: no silent fallback to a committed corpus.
    assert.match(msg, /does NOT fall back/);
    assert.match(msg, /ADR-0302 D1/);
  });

  test("names the door and its own remedy when the door was the source tried", () => {
    const msg = corpusUnreachableMessage(
      "check:guidance",
      { kind: "door", door: { baseUrl: "https://studio.example/api/store", headers: {} } },
      "403",
    );
    assert.match(msg, /https:\/\/studio\.example\/api\/store/);
    assert.match(msg, new RegExp(STORE_DOOR_URL_ENV));
    // The connector remedy would be wrong advice here — the door was the thing that failed.
    assert.doesNotMatch(msg, /pnpm db:up/);
  });
});
