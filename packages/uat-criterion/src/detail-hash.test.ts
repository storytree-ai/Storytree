import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDetailHash,
  computeDetailAnchor,
  classifyDetailAnchor,
  type DetailHashInput,
  type DetailAnchor,
} from "./detail-hash.js";

/**
 * Offline tests for the `criterion-detail-hash-anchor` capability (ADR-0209 D6): a pure
 * content-hash over a UAT criterion detail's PROOF-BEARING fields (action / successConditions /
 * evidenceExpectations / refs — the fields `uat-detail-kind` defines, see `detail-kind.ts`) that
 * anchors a verdict and invalidates on a substantive change to those fields. Volatile metadata
 * (timestamps, actor stamps, the detail's own `id`/`kind`, and the story-owned display `title`,
 * ADR-0209 D6) must NEVER participate in the hash.
 *
 * The algorithm is PINNED here rather than left free to silently drift: a 128-bit FNV-1a
 * fingerprint (32 lowercase hex chars) of `JSON.stringify({ action, successConditions,
 * evidenceExpectations, refs })` in that exact field order — mirroring the existing repo
 * convention (`packages/orchestrator/src/proof/anchor-compute.ts`'s `hashSpan`). If
 * `computeDetailHash`'s algorithm ever changes, {@link referenceHash} catches it here rather than
 * silently invalidating every previously-recorded anchor.
 */

const FNV_OFFSET_128 = 0x6c62272e07bb014262b821756295c58dn;
const FNV_PRIME_128 = 0x0000000001000000000000000000013bn;
const MASK_128 = (1n << 128n) - 1n;

function referenceHash(input: DetailHashInput): string {
  const canonical = JSON.stringify({
    action: input.action,
    successConditions: input.successConditions,
    evidenceExpectations: input.evidenceExpectations,
    refs: [...input.refs],
  });
  let h = FNV_OFFSET_128;
  for (const byte of new TextEncoder().encode(canonical)) {
    h = ((h ^ BigInt(byte)) * FNV_PRIME_128) & MASK_128;
  }
  return h.toString(16).padStart(32, "0");
}

const WELL_FORMED: DetailHashInput = {
  action: "Run the canonical CLI invocation end-to-end.",
  successConditions: "The command exits 0 and the artifact is written to disk.",
  evidenceExpectations: "Attach the command transcript and the written file's sha256.",
  refs: ["asset:merge-ceremony", "asset:baseline-preservation"],
};

// ── computeDetailHash: format + determinism + the pinned algorithm ─────────

test("computeDetailHash: returns a stable 32-char lowercase hex fingerprint", () => {
  const hash = computeDetailHash(WELL_FORMED);
  assert.equal(typeof hash, "string");
  assert.match(hash, /^[0-9a-f]{32}$/);
});

test("computeDetailHash: is deterministic for identical proof-bearing content", () => {
  const again = { ...WELL_FORMED, refs: [...WELL_FORMED.refs] };
  assert.equal(computeDetailHash(WELL_FORMED), computeDetailHash(again));
});

test("computeDetailHash: matches the pinned reference algorithm exactly", () => {
  assert.equal(computeDetailHash(WELL_FORMED), referenceHash(WELL_FORMED));
});

// ── substantive change: each proof-bearing field independently changes the hash ─

test("computeDetailHash: a changed action changes the hash", () => {
  const changed = { ...WELL_FORMED, action: "A materially different action entirely." };
  assert.notEqual(computeDetailHash(changed), computeDetailHash(WELL_FORMED));
});

test("computeDetailHash: a changed successConditions changes the hash", () => {
  const changed = { ...WELL_FORMED, successConditions: "A materially different success bar." };
  assert.notEqual(computeDetailHash(changed), computeDetailHash(WELL_FORMED));
});

test("computeDetailHash: a changed evidenceExpectations changes the hash", () => {
  const changed = { ...WELL_FORMED, evidenceExpectations: "Different evidence is now required." };
  assert.notEqual(computeDetailHash(changed), computeDetailHash(WELL_FORMED));
});

test("computeDetailHash: an added ref changes the hash", () => {
  const changed = { ...WELL_FORMED, refs: [...WELL_FORMED.refs, "asset:owner-fork-bar"] };
  assert.notEqual(computeDetailHash(changed), computeDetailHash(WELL_FORMED));
});

test("computeDetailHash: a removed ref changes the hash", () => {
  const changed = { ...WELL_FORMED, refs: WELL_FORMED.refs.slice(0, 1) };
  assert.notEqual(computeDetailHash(changed), computeDetailHash(WELL_FORMED));
});

// ── volatile metadata never participates ────────────────────────────────────

test("computeDetailHash: id/kind/timestamp/actor stamps alongside the proof-bearing fields do not change the hash", () => {
  const withVolatileMetadata = {
    ...WELL_FORMED,
    id: "demo-story#uat-1",
    kind: "uat-criterion",
    updatedAt: "2020-01-01T00:00:00Z",
    actor: "some-agent",
  };
  assert.equal(computeDetailHash(withVolatileMetadata), computeDetailHash(WELL_FORMED));
});

test("computeDetailHash: touching ONLY volatile metadata (no proof-bearing change) leaves the hash unchanged", () => {
  const base = { ...WELL_FORMED, id: "demo-story#uat-1", updatedAt: "2020-01-01T00:00:00Z" };
  const touched = {
    ...base,
    id: "demo-story#uat-2",
    updatedAt: "2099-12-31T00:00:00Z",
    actor: "someone-else",
  };
  assert.equal(computeDetailHash(touched), computeDetailHash(base));
});

test("computeDetailHash: the story-owned display title is not in the hash — adding one changes nothing", () => {
  const withTitle = { ...WELL_FORMED, title: "A story-owned display one-liner" };
  assert.equal(computeDetailHash(withTitle), computeDetailHash(WELL_FORMED));
});

// ── computeDetailAnchor: the small anchor record ────────────────────────────

test("computeDetailAnchor: pairs the given detailArtifactId with computeDetailHash's result", () => {
  const anchor: DetailAnchor = computeDetailAnchor("demo-story#uat-1", WELL_FORMED);
  assert.equal(anchor.detailArtifactId, "demo-story#uat-1");
  assert.equal(anchor.contentHash, computeDetailHash(WELL_FORMED));
});

test("computeDetailAnchor: different detail bodies for the same id yield different content hashes", () => {
  const changed = { ...WELL_FORMED, action: "A different action." };
  const a = computeDetailAnchor("demo-story#uat-1", WELL_FORMED);
  const b = computeDetailAnchor("demo-story#uat-1", changed);
  assert.equal(a.detailArtifactId, b.detailArtifactId);
  assert.notEqual(a.contentHash, b.contentHash);
});

// ── classifyDetailAnchor: fresh | stale ─────────────────────────────────────

test("classifyDetailAnchor: an unchanged detail against its own prior hash classifies as fresh", () => {
  const priorHash = computeDetailHash(WELL_FORMED);
  assert.equal(classifyDetailAnchor(priorHash, WELL_FORMED), "fresh");
});

test("classifyDetailAnchor: a substantive change to a proof-bearing field classifies as stale", () => {
  const priorHash = computeDetailHash(WELL_FORMED);
  const changed = { ...WELL_FORMED, evidenceExpectations: "Now requires a totally different artefact." };
  assert.equal(classifyDetailAnchor(priorHash, changed), "stale");
});

test("classifyDetailAnchor: only volatile metadata changing (no proof-bearing change) still classifies as fresh", () => {
  const priorHash = computeDetailHash(WELL_FORMED);
  const touchedMetadataOnly = { ...WELL_FORMED, id: "demo-story#uat-9", actor: "someone-else" };
  assert.equal(classifyDetailAnchor(priorHash, touchedMetadataOnly), "fresh");
});

test("classifyDetailAnchor: a prior hash that does not match the current content classifies as stale", () => {
  assert.equal(classifyDetailAnchor("0".repeat(32), WELL_FORMED), "stale");
});
