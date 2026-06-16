/**
 * Parity suite for the ChangeStore seam on InMemoryStore (ADR-0016 §2).
 * Pins the four contracts that any ChangeStore backend must meet.
 * changeStoreParitySuite is not yet exported from store.ts — these tests fail
 * with AssertionError (the right-kind red) until IMPLEMENT adds the three pieces.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "./store.js";

/** Minimal valid ChangeEvent fixture (matches the ChangeEvent zod schema in anchor.ts). */
const change = (unitId: string, why?: string) => ({
  unitId,
  hashBefore: "aaaa",
  hashAfter: "bbbb",
  ...(why !== undefined ? { description: why } : {}),
  author: "tester",
  at: "2026-06-16T00:00:00.000Z",
});

/**
 * Cast InMemoryStore to a ChangeStore-shaped accessor so we read the unimplemented
 * methods as `unknown` via index access — producing AssertionError (not TypeError)
 * when they are absent.
 */
const changeStore = (s: InMemoryStore) =>
  s as unknown as {
    appendChangeEvent(c: ReturnType<typeof change>): Promise<void>;
    readChangeEvents(filter?: { unitId?: string }): Promise<Array<ReturnType<typeof change>>>;
  };

test("InMemoryStore change parity: empty store returns [] (never throws)", async () => {
  const store = new InMemoryStore();
  // Fails with AssertionError ('undefined' !== 'function') until IMPLEMENT adds the method.
  assert.equal(
    typeof (store as unknown as Record<string, unknown>)["readChangeEvents"],
    "function",
    "InMemoryStore must implement ChangeStore.readChangeEvents",
  );
  const cs = changeStore(store);
  assert.deepEqual(await cs.readChangeEvents(), []);
  assert.deepEqual(await cs.readChangeEvents({ unitId: "nope" }), []);
});

test("InMemoryStore change parity: round-trip — event stored and read back unchanged", async () => {
  const store = new InMemoryStore();
  assert.equal(
    typeof (store as unknown as Record<string, unknown>)["appendChangeEvent"],
    "function",
    "InMemoryStore must implement ChangeStore.appendChangeEvent",
  );
  const cs = changeStore(store);
  const c = change("unit-1");
  await cs.appendChangeEvent(c);
  const result = await cs.readChangeEvents();
  assert.deepEqual(result, [c]);
});

test("InMemoryStore change parity: filter by unitId returns only matching events", async () => {
  const store = new InMemoryStore();
  assert.equal(
    typeof (store as unknown as Record<string, unknown>)["appendChangeEvent"],
    "function",
    "InMemoryStore must implement ChangeStore.appendChangeEvent",
  );
  const cs = changeStore(store);
  const ca = change("a", "fix a");
  const cb = change("b", "fix b");
  await cs.appendChangeEvent(ca);
  await cs.appendChangeEvent(cb);
  assert.deepEqual(await cs.readChangeEvents({ unitId: "a" }), [ca]);
  assert.deepEqual(await cs.readChangeEvents({ unitId: "b" }), [cb]);
  const all = await cs.readChangeEvents();
  assert.equal(all.length, 2);
});

test("InMemoryStore change parity: insertion order preserved", async () => {
  const store = new InMemoryStore();
  assert.equal(
    typeof (store as unknown as Record<string, unknown>)["appendChangeEvent"],
    "function",
    "InMemoryStore must implement ChangeStore.appendChangeEvent",
  );
  const cs = changeStore(store);
  const c1 = change("u", "first");
  const c2 = change("u", "second");
  const c3 = change("u", "third");
  await cs.appendChangeEvent(c1);
  await cs.appendChangeEvent(c2);
  await cs.appendChangeEvent(c3);
  assert.deepEqual(await cs.readChangeEvents({ unitId: "u" }), [c1, c2, c3]);
});
