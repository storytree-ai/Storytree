import test from "node:test";
import assert from "node:assert/strict";
import type { Verdict } from "@storytree/proof-protocol";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import type { Store } from "@storytree/storage-protocol";
import { rollupStatus, workEvent } from "./rollup.js";

/**
 * The REUSABLE rollup-parity suite (node:test). MOVED here from `@storytree/core` with the rollup
 * compute (ADR-0068 step 1). Mirrors `storeParitySuite`'s discipline: the projection must read
 * identically off ANY {@link Store} implementation — events are appended through the seam and the
 * rollup is computed over `readEvents()`. Run against `InMemoryStore` in the parity tests;
 * the organisms' `./store` pg impls (ADR-0077) are held to the same bar.
 */
export function rollupParitySuite(
  name: string,
  makeStore: () => Store | Promise<Store>,
): void {
  const passVerdict = (unitId: string): Verdict => ({
    unitId,
    proofMode: "capability",
    outcome: "pass",
    commitSha: "cafebabe",
    signer: "tester@example.com",
    runId: "run-1",
    outputVersion: "v1",
    evidence: [],
    at: "2026-06-10T00:00:00.000Z",
  });

  test(`${name} rollup parity: no events => null (the authored status stands)`, async () => {
    const store = await makeStore();
    assert.equal(rollupStatus("ghost", await store.readEvents()), null);
  });

  test(`${name} rollup parity: a building work event without a later pass => building`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "u1", event: "building", runId: "run-1" }, "tester"));
    assert.equal(rollupStatus("u1", await store.readEvents()), "building");
  });

  test(`${name} rollup parity: building then a signed pass verdict => healthy`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "u1", event: "building", runId: "run-1" }, "tester"));
    await store.appendEvent({
      id: "run-1:u1",
      kind: SIGNING_EVENT_KIND,
      type: "created",
      doc: passVerdict("u1"),
      actor: "tester@example.com",
    });
    assert.equal(rollupStatus("u1", await store.readEvents()), "healthy");
  });

  test(`${name} rollup parity: another unit's events grant nothing`, async () => {
    const store = await makeStore();
    await store.appendEvent(workEvent({ unitId: "other", event: "building" }, "tester"));
    await store.appendEvent({
      id: "run-1:other",
      kind: SIGNING_EVENT_KIND,
      type: "created",
      doc: passVerdict("other"),
      actor: "tester@example.com",
    });
    assert.equal(rollupStatus("u1", await store.readEvents()), null);
  });
}
