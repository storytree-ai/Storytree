import test from "node:test";
import assert from "node:assert/strict";
import type { Attestation } from "@storytree/core";
import { PgAttestationStore } from "./attestation-store.js";

/**
 * Offline: drives `PgAttestationStore` through a FAKE client that records every
 * `query(text, values)` and returns canned rows (the `user-store.test.ts` pattern).
 * Proves the store half of `separate-from-verdicts` (only events.attestation is
 * touched) and `signed-with-provenance` (fail-closed validation at the write boundary).
 */

interface QueryCall {
  text: string;
  values: unknown[];
}

class FakeClient {
  readonly calls: QueryCall[] = [];
  /** Rows returned for any SELECT (the read paths). */
  rows: unknown[] = [];

  async query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ text, values: values ?? [] });
    if (text.trimStart().toUpperCase().startsWith("SELECT")) return { rows: this.rows };
    return { rows: [] };
  }
}

function att(over: Partial<Attestation> = {}): Attestation {
  return {
    testId: "demo-story#uat-2",
    outcome: "pass",
    witness: "human",
    signer: "owner@example.com",
    at: "2026-06-14T00:00:00.000Z",
    ...over,
  };
}

// ── record ───────────────────────────────────────────────────────────────────

test("record: INSERTs into events.attestation with the scalar columns + jsonb doc", async () => {
  const client = new FakeClient();
  const store = new PgAttestationStore(client);
  const result = await store.record(att({ relayedBy: "nice-wright-3a8133", note: "clicked it" }));

  assert.equal(client.calls.length, 1, "one INSERT, nothing else");
  const call = client.calls[0]!;
  assert.ok(call.text.includes("INSERT INTO events.attestation"), "targets events.attestation");
  // VALUES ($1=test_id, $2=outcome, $3=witness, $4=signer, $5=relayed_by, $6=doc)
  assert.deepEqual(call.values.slice(0, 5), [
    "demo-story#uat-2",
    "pass",
    "human",
    "owner@example.com",
    "nice-wright-3a8133",
  ]);
  const docJson = JSON.parse(call.values[5] as string) as Attestation;
  assert.equal(docJson.note, "clicked it", "the full signed doc is persisted in the jsonb column");
  assert.equal(result.relayedBy, "nice-wright-3a8133", "returns the persisted doc");
});

test("separate-from-verdicts: recording NEVER issues SQL against events.verdict", async () => {
  const client = new FakeClient();
  const store = new PgAttestationStore(client);
  await store.record(att());
  await store.record(att({ witness: "machine", signer: "uat-runner" }));
  assert.ok(
    client.calls.every((c) => !c.text.includes("events.verdict")),
    "no write ever touches the verdict log",
  );
  assert.ok(
    client.calls.every((c) => c.text.includes("events.attestation")),
    "every write targets the attestation log",
  );
});

test("record: relayed_by defaults to NULL for a machine attestation", async () => {
  const client = new FakeClient();
  const store = new PgAttestationStore(client);
  await store.record(att({ witness: "machine", signer: "uat-runner", relayedBy: undefined }));
  assert.equal(client.calls[0]!.values[4], null, "no relayedBy → NULL column");
});

test("signed-with-provenance: a blank signer / unknown witness is refused before any SQL", async () => {
  const client = new FakeClient();
  const store = new PgAttestationStore(client);
  await assert.rejects(() => store.record(att({ signer: "   " })), "blank signer refused");
  await assert.rejects(() => store.record(att({ witness: "either" as never })), "either is not recordable");
  assert.equal(client.calls.length, 0, "fail-closed: nothing was written");
});

// ── readEvents / history ───────────────────────────────────────────────────────

test("readEvents: returns {seq, doc} ascending for deriveAttestations", async () => {
  const client = new FakeClient();
  client.rows = [
    { seq: "1", doc: att() },
    { seq: "2", doc: att({ outcome: "fail" }) },
  ];
  const store = new PgAttestationStore(client);
  const events = await store.readEvents();
  assert.equal(events.length, 2);
  assert.equal(typeof events[0]!.seq, "number", "seq coerced to number");
  assert.ok(client.calls[0]!.text.includes("ORDER BY seq"), "ordered by seq");
});

test("history: filters by test id and skips a malformed stored row", async () => {
  const client = new FakeClient();
  client.rows = [{ doc: att() }, { doc: { junk: true } }, { doc: att({ outcome: "fail" }) }];
  const store = new PgAttestationStore(client);
  const hist = await store.history("demo-story#uat-2");
  assert.equal(hist.length, 2, "the malformed row is skipped");
  assert.equal(client.calls[0]!.values[0], "demo-story#uat-2", "queried by the test id");
});
