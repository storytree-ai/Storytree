import { z } from "zod";

/**
 * ADR-0033 Decision 1: the presence declaration doc plus pure logic every other
 * capability reuses — validation, staleness classification, upsert-merge.
 *
 * No I/O: no store, no clock reads (callers pass `now`), no worktree probing.
 * Identity derivation belongs to the CLI node; this module only refuses docs
 * that arrive without it.
 */

// ---------------------------------------------------------------------------
// Staleness threshold constants (pending owner call 1 for final values)
// ---------------------------------------------------------------------------

/** Elapsed ms after which a declaration is considered stale. */
export const STALE_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes

/** Elapsed ms after which a declaration is considered possibly-dead. */
export const POSSIBLY_DEAD_THRESHOLD_MS = 30 * 60 * 1_000; // 30 minutes

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * A non-blank string: fails on empty string or whitespace-only strings.
 * Used for attribution/substance fields where silence is a refusal.
 */
const nonBlankString = z.string().refine((s) => s.trim().length > 0, {
  message: "must be a non-blank, non-whitespace string",
});

/**
 * The validated presence declaration doc (ADR-0033 Decision 1).
 *
 * Strict mode: unknown fields (including derived staleness fields) are rejected,
 * not stripped silently — "derived, never stored" is enforced at the schema level.
 *
 * Fail-closed on attribution + substance: blank `sessionId`, `branch`, or
 * `workingOn` is a refusal, not a default.
 */
export const PresenceDeclaration = z
  .object({
    /** The worktree name — the identity key for the notice-board. */
    sessionId: nonBlankString,
    /** The git branch this session is working on. */
    branch: nonBlankString,
    /** Required prose: what this session is working on. */
    workingOn: nonBlankString,
    /** Work-hierarchy node ids this session contributes to. Defaults to `[]`. */
    nodes: z.array(z.string()).default([]),
    /** Lifecycle status. Defaults to `"active"`. */
    status: z.enum(["active", "done"]).default("active"),
    /** Set once at first declare; preserved by every merge — never patched. */
    startedAt: z.string(),
    /** Bumped by the store on upsert. */
    lastSeenAt: z.string(),
  })
  .strict();

/** The inferred TypeScript type of a validated presence declaration. */
export type PresenceDeclarationDoc = z.infer<typeof PresenceDeclaration>;

/**
 * A partial update to a stored presence declaration.
 * `sessionId` and `startedAt` are anchors — they cannot appear in a patch.
 *
 * Explicit `undefined` values are admitted by the type because the merge ignores them at
 * runtime (the `mergeCommentPatch` semantic) — under `exactOptionalPropertyTypes` a plain
 * `Partial` would reject the very payloads the contract promises to tolerate.
 */
export type PresenceDeclarationPatch = {
  [K in keyof Omit<PresenceDeclarationDoc, "sessionId" | "startedAt">]?:
    | Omit<PresenceDeclarationDoc, "sessionId" | "startedAt">[K]
    | undefined;
};

// ---------------------------------------------------------------------------
// Staleness classification
// ---------------------------------------------------------------------------

/** The three staleness bands, always derived — never stored. */
export type StalenessClass = "fresh" | "stale" | "possibly-dead";

/**
 * PURE: classify a declaration's staleness band.
 *
 * - `fresh`:         elapsed < {@link STALE_THRESHOLD_MS}
 * - `stale`:         {@link STALE_THRESHOLD_MS} ≤ elapsed < {@link POSSIBLY_DEAD_THRESHOLD_MS}
 * - `possibly-dead`: elapsed ≥ {@link POSSIBLY_DEAD_THRESHOLD_MS}
 *
 * No clock reads — the caller supplies `now`.
 */
export function classifyPresence(lastSeenAt: string, now: Date): StalenessClass {
  const elapsed = now.getTime() - new Date(lastSeenAt).getTime();
  if (elapsed < STALE_THRESHOLD_MS) return "fresh";
  if (elapsed < POSSIBLY_DEAD_THRESHOLD_MS) return "stale";
  return "possibly-dead";
}

// ---------------------------------------------------------------------------
// Upsert-merge
// ---------------------------------------------------------------------------

/**
 * PURE: merge a patch into an existing presence declaration doc.
 *
 * Follows the `mergeCommentPatch` pattern (`packages/store/src/pg-comment-store.ts`):
 * - Undefined patch fields are ignored (real `null` IS applied).
 * - The input is never mutated (spread-first).
 * - `sessionId` and `startedAt` are anchors: forcefully re-applied from
 *   `existing` after the merge so no patch — however cast — can move them.
 */
export function mergeDeclaration(
  existing: PresenceDeclarationDoc,
  patch: PresenceDeclarationPatch,
): PresenceDeclarationDoc {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  // Belt-and-suspenders: anchors always win, regardless of what the patch carried.
  merged.sessionId = existing.sessionId;
  merged.startedAt = existing.startedAt;
  return merged;
}
