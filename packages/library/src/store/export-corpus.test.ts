import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoredDoc } from "@storytree/storage-protocol";
import { validateLibraryDoc } from "../library-doc.js";
import { loadCorpus } from "./load-corpus.js";
import {
  isExportScopeKind,
  isExportableLiveDoc,
  diffCorpusContent,
  computeExportedSeed,
  type SeedEntry,
} from "./export-corpus.js";

/**
 * Offline live→seed export tests (ADR-0120). Run against the REAL seed (loaded into InMemoryStore) so
 * the bodies are genuinely valid library docs — `isExportableLiveDoc` calls `upcastAndValidate`, so a
 * hand-stubbed body could not exercise the exportable/degraded split. NO Cloud SQL, NO live gate.
 *
 * The load-bearing guarantees (all the INVERSE of sync-corpus's seed→live policy): overwrite a drifted
 * seed body from a valid live one, ADD live-only artifacts, but NEVER delete a seed-only entry, NEVER
 * touch agents, and NEVER write a degraded/below-floor live body over the canonical seed.
 */

/** A degraded live body: the rendered-asset `{body, category}` shape, no schemaVersion (the v0 trap). */
function degraded(id: string, kind: string): Record<string, unknown> {
  return { id, kind, category: kind, body: "rendered markdown — degraded", title: id };
}

async function realSeed(): Promise<{ docs: StoredDoc[]; entries: SeedEntry[] }> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const docs = await store.queryDocs();
  return { docs, entries: docs.map((d) => d.doc as SeedEntry) };
}

test("isExportableLiveDoc: valid at-floor structured → true; degraded / agent / template → false", async () => {
  const { docs } = await realSeed();
  const exportable = docs.filter(isExportableLiveDoc);
  assert.ok(exportable.length > 0, "the real seed has exportable structured non-agent docs");
  for (const d of exportable) {
    assert.notEqual(d.kind, "agent", "agents are out of export scope");
    assert.notEqual(d.kind, "template", "templates are generated, out of export scope");
  }
  // A degraded body of a real structured kind is refused.
  const ts = "2026-01-01T00:00:00.000Z";
  assert.equal(
    isExportableLiveDoc({ id: "x", kind: "principle", doc: degraded("x", "principle"), createdAt: ts, updatedAt: ts }),
    false,
  );
  // An agent, even with a perfectly valid body, is out of scope.
  const agent = docs.find((d) => d.kind === "agent");
  if (agent) assert.equal(isExportableLiveDoc(agent), false, "agent kind is never export-scope");
});

test("EPHEMERAL kinds (ADR-0183 D2): a VALID live plan is never exported; arc IS export-scope", async () => {
  assert.equal(isExportScopeKind("plan"), false, "plan is out of export scope — live-only by design");
  assert.equal(isExportScopeKind("arc"), true, "arc is a normal live-canonical kind, exported like any");

  const ts = "2026-07-11T00:00:00.000Z";
  const planBody = {
    kind: "plan",
    id: "live-plan-fixture",
    title: "live plan fixture",
    description: "a disposable choreography that must never reach knowledge.json",
    references: [],
    createdAt: ts,
    updatedAt: ts,
    objective: "prove the ephemeral exclusion",
    decomposition: "one unit: this test",
    arcRef: "asset:adr0183-arc-fixture",
    anchor: { sha: "6df02e1", date: "2026-07-11" },
  };
  // The body itself is VALID — the export refusal must be the kind CLASS, not a validation failure.
  assert.doesNotThrow(() => validateLibraryDoc(planBody), "the fixture plan is a valid library doc");
  const stored: StoredDoc = { id: planBody.id, kind: "plan", doc: planBody, createdAt: ts, updatedAt: ts };
  assert.equal(isExportableLiveDoc(stored), false, "a valid live plan is still not exportable");

  const { docs: seedDocs, entries } = await realSeed();
  const r = computeExportedSeed(entries, [...seedDocs, stored]);
  assert.ok(!r.created.includes(planBody.id), "the live plan is not appended to the seed");
  assert.ok(!r.skippedDegraded.includes(planBody.id), "…and not misreported as a degraded body either");
});

test("diffCorpusContent: classifies value-drift vs degraded-live; ignores seed-only and agents", async () => {
  const { docs: seedDocs } = await realSeed();
  const exportable = seedDocs.filter(isExportableLiveDoc);
  const driftId = exportable[0]!.id;
  const degradeId = exportable[1]!.id;

  // Build a live store: clone of seed, with one value-drift + one degraded body.
  const live: StoredDoc[] = seedDocs.map((d) => {
    if (d.id === driftId) {
      return { ...d, doc: { ...(d.doc as object), description: "LIVE EDIT — a valid value drift" } };
    }
    if (d.id === degradeId) return { ...d, doc: degraded(degradeId, d.kind) };
    return d;
  });

  const diff = diffCorpusContent(seedDocs, live);
  const byId = new Map(diff.drifted.map((x) => [x.id, x.cls]));
  assert.equal(byId.get(driftId), "value-drift", "a valid live edit is a value-drift");
  assert.equal(byId.get(degradeId), "degraded-live", "a below-floor live body is degraded-live");
  assert.equal(diff.clean, false);
  // An agent body differing would NOT appear (out of scope).
  assert.ok(![...byId.keys()].some((id) => seedDocs.find((d) => d.id === id)?.kind === "agent"));
});

test("computeExportedSeed: overwrites value-drift, ADDS live-only, SKIPS degraded, never deletes / touches agents", async () => {
  const { docs: seedDocs, entries } = await realSeed();
  const exportable = seedDocs.filter(isExportableLiveDoc);
  const driftId = exportable[0]!.id;
  const degradeId = exportable[1]!.id;
  const seedOnlyId = exportable[2]!.id; // present in seed, absent from live → must survive
  const liveOnlyId = "live-only-export-fixture";
  const agentDoc = seedDocs.find((d) => d.kind === "agent");

  const live: StoredDoc[] = [];
  for (const d of seedDocs) {
    if (d.id === seedOnlyId) continue; // drop from live → seed-only
    if (d.id === driftId) {
      live.push({ ...d, doc: { ...(d.doc as object), description: "LIVE EDIT" } });
    } else if (d.id === degradeId) {
      live.push({ ...d, doc: degraded(degradeId, d.kind) });
    } else {
      live.push(d);
    }
  }
  // A live-only, valid, at-floor artifact (clone an exportable body under a new id).
  live.push({
    id: liveOnlyId,
    kind: exportable[0]!.kind,
    doc: { ...(exportable[0]!.doc as object), id: liveOnlyId, title: "Live-only export fixture" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  const r = computeExportedSeed(entries, live);

  assert.ok(r.updated.includes(driftId), "the value-drift was overwritten from live");
  assert.ok(r.created.includes(liveOnlyId), "the live-only artifact was appended");
  assert.ok(r.skippedDegraded.includes(degradeId), "the degraded live body was refused");
  assert.equal(r.noop, false);

  const out = new Map(r.entries.map((e) => [e.id, e]));
  // never delete: the seed-only artifact survives.
  assert.ok(out.has(seedOnlyId), "seed-only artifact is kept (never deleted)");
  // degraded refused: the seed's canonical body is preserved, NOT the live rendered shape.
  assert.equal((out.get(degradeId) as Record<string, unknown>)["body"], undefined, "seed body kept, not the degraded one");
  // value-drift applied: the live edit is now in the seed.
  assert.equal((out.get(driftId) as Record<string, unknown>)["description"], "LIVE EDIT");
  // agents untouched.
  if (agentDoc) assert.ok(!r.updated.includes(agentDoc.id) && !r.skippedDegraded.includes(agentDoc.id));
});

test("computeExportedSeed: idempotent — a second run over the same live store is a no-op", async () => {
  const { docs, entries } = await realSeed();
  // First run canonicalises the seed from live (may upcast any below-floor seed bodies to v2).
  const first = computeExportedSeed(entries, docs);
  // Second run against the same live store must change nothing — the load-bearing stability property.
  const second = computeExportedSeed(first.entries, docs);
  assert.equal(second.noop, true, "second export over the same live store changes nothing");
  assert.deepEqual([...second.updated], []);
  assert.deepEqual([...second.created], []);
  assert.equal(second.entries.length, first.entries.length, "no entries added or removed on the second run");
});
