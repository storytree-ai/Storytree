/**
 * The `criterion-detail-hash-anchor` capability (ADR-0209 D6): a pure content-hash over a UAT
 * criterion detail's PROOF-BEARING fields — `action` / `successConditions` /
 * `evidenceExpectations` / `refs`, the fields `uat-detail-kind` defines — that anchors a verdict
 * and invalidates on a substantive change to those fields.
 *
 * Volatile metadata (timestamps, actor stamps, the detail's own `id`/`kind`, and the story-owned
 * display `title`, ADR-0209 D6) never participates: only the four proof-bearing fields are read,
 * so any other property present on the input is silently ignored.
 *
 * The algorithm is a 128-bit FNV-1a fingerprint (32 lowercase hex chars) of
 * `JSON.stringify({ action, successConditions, evidenceExpectations, refs })` in that exact field
 * order — mirroring the existing repo convention
 * (`packages/orchestrator/src/proof/anchor-compute.ts`'s `hashSpan`), pinned exactly rather than
 * left free to silently drift. Pure, deterministic, no I/O.
 */

export interface DetailHashInput {
  readonly action: string;
  readonly successConditions: string;
  readonly evidenceExpectations: string;
  readonly refs: readonly string[];
}

export interface DetailAnchor {
  readonly detailArtifactId: string;
  readonly contentHash: string;
}

export type DetailAnchorFreshness = "fresh" | "stale";

// FNV-1a 128-bit constants (the canonical offset basis + prime) — a content FINGERPRINT, not a
// cryptographic hash. Pinned to match the test's `referenceHash` exactly.
const FNV_OFFSET_128 = 0x6c62272e07bb014262b821756295c58dn;
const FNV_PRIME_128 = 0x0000000001000000000000000000013bn;
const MASK_128 = (1n << 128n) - 1n;

/**
 * The pure content-hash of a detail's proof-bearing fields (ADR-0209 D6). Only `action`,
 * `successConditions`, `evidenceExpectations`, and `refs` are read from `input` — any other
 * property (id, kind, timestamps, actor stamps, title) is ignored, so touching only those never
 * changes the hash.
 */
export function computeDetailHash(input: DetailHashInput): string {
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

/**
 * Pairs a detail artifact's id with {@link computeDetailHash}'s result — the small anchor record a
 * later model/human UAT verdict embeds.
 */
export function computeDetailAnchor(
  detailArtifactId: string,
  detail: DetailHashInput,
): DetailAnchor {
  return { detailArtifactId, contentHash: computeDetailHash(detail) };
}

/**
 * Classifies a previously recorded hash against the detail's current proof-bearing content:
 * `fresh` when unchanged, `stale` when a substantive change (or any mismatch) is detected.
 */
export function classifyDetailAnchor(
  priorHash: string,
  currentDetail: DetailHashInput,
): DetailAnchorFreshness {
  return computeDetailHash(currentDetail) === priorHash ? "fresh" : "stale";
}
