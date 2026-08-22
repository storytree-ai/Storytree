// payloadCache — the stamped local cache for the two READ-ONLY studio boot payloads, /api/tree's
// stories and /api/docs (ADR-0240 decision 2 stage 2, map-payload-cache): so a reloaded studio
// paints the forest from the last visit's payloads instead of a cold "Growing the world…" wait.
// Pure client module — no React, no `fetch`, no import of the world builder — so its read/write/
// evict/shape-check semantics are directly provable.
//
// The mutable /api/assets and /api/comments reads are NEVER part of this entry (they carry a
// write path — a persisted copy could contradict an edit the operator just made). The live
// coordination seeds (`builds`/`claims` on the tree payload) are likewise never carried — a wisp
// restored from a previous load would misstate what a session is doing right now; only the
// STORIES are persisted from the tree payload.
//
// Three independent guards gate a persisted entry before it is ever painted — failing ANY evicts:
//   1. CLIENT STAMP ({@link CLIENT_STAMP}) — moves with the bundle; decidable synchronously,
//      before any network response, so a schema-changing merge can never paint an old shape into
//      a new client.
//   2. SERVER CODE STAMP — the entry records the server `/api/health` `code.head` it was written
//      under; a later health response reporting a DIFFERENT head evicts it (checked once health
//      resolves, via {@link evictIfCodeHeadMismatch} — never blocks the synchronous first-paint
//      read).
//   3. STRUCTURAL SHAPE — a truncated / hand-edited / foreign value never reaches the world
//      builder.
//
// Every operation degrades silently (never throws) on an unavailable, full, or corrupt store —
// persistence is an accelerator, and the product must be indifferent to its absence.

import type { DocMeta, TreeStory } from '../types';

/** localStorage key for the one persisted entry. */
export const PAYLOAD_CACHE_KEY = 'storytree.studio.payloadCache.v1';

/**
 * Guard 1 — the CLIENT stamp. Bump this whenever the persisted shape below (or anything about how
 * this module writes it) changes, so a schema-changing merge can never paint an old shape into a
 * new client. A plain literal is sufficient: it is decidable synchronously, with no I/O.
 */
export const CLIENT_STAMP = 'map-payload-cache/1';

interface CachedTreePart {
  stories: TreeStory[];
}

interface CachedPayloadEntry {
  clientStamp: string;
  codeHead: string;
  tree: CachedTreePart;
  docs: DocMeta[];
}

/** What a caller gets back from a valid, painted-ready cache read. */
export interface CachedPayload {
  stories: TreeStory[];
  docs: DocMeta[];
}

function isDocMetaLike(v: unknown): v is DocMeta {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.title === 'string' && typeof r.group === 'string';
}

function isTreeStoryLike(v: unknown): v is TreeStory {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    typeof r.outcome === 'string' &&
    Array.isArray(r.capabilities)
  );
}

/** Guard 3 — the structural shape check: a truncated/hand-edited/foreign value never validates. */
function isCachedPayloadEntry(v: unknown): v is CachedPayloadEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.clientStamp !== 'string') return false;
  if (typeof r.codeHead !== 'string') return false;
  if (typeof r.tree !== 'object' || r.tree === null) return false;
  const stories = (r.tree as Record<string, unknown>).stories;
  if (!Array.isArray(stories) || !stories.every(isTreeStoryLike)) return false;
  if (!Array.isArray(r.docs) || !r.docs.every(isDocMetaLike)) return false;
  return true;
}

/** Best-effort raw object read — undefined on an unavailable store, missing key, or unparseable JSON. */
function readRawObject(): Record<string, unknown> | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const raw = window.localStorage.getItem(PAYLOAD_CACHE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the persisted entry, validated on guards 1 (client stamp) + 3 (structural shape) — the two
 * guards decidable synchronously, before any network response. Guard 2 (the server code stamp) is
 * checked separately once `/api/health` resolves ({@link evictIfCodeHeadMismatch}) and never blocks
 * this read. Degrades to `null` on any failure — an unavailable/corrupt store, a foreign client
 * stamp, or a malformed entry — never a thrown error.
 */
export function readPayloadCache(): CachedPayload | null {
  const raw = readRawObject();
  if (raw === undefined || !isCachedPayloadEntry(raw)) return null;
  if (raw.clientStamp !== CLIENT_STAMP) return null;
  return { stories: raw.tree.stories, docs: raw.docs };
}

/**
 * Guard 2 — evict the persisted entry when its recorded `codeHead` differs from the server code
 * stamp `/api/health` just reported, so no LATER paint can use it. A no-op (never throws) when the
 * store is unavailable, the entry is absent, or it already fails guards 1/3.
 *
 * Returns whether a mismatched entry was actually found and evicted — the caller (App) uses this
 * to know its OWN boot just observed a server-head drift against what it had cached, and holds off
 * re-writing a fresh entry for the rest of this boot (see `cacheWriteSuppressed` in TreeView/App):
 * a client that just caught its own record stale is in no position to promise a same-boot rewrite
 * is any less stale (the server may still be mid-deploy) — the operator's NEXT reload, seeded by a
 * clean health probe, is what re-establishes trust.
 */
export function evictIfCodeHeadMismatch(codeHead: string): boolean {
  const raw = readRawObject();
  if (raw === undefined || !isCachedPayloadEntry(raw)) return false;
  if (raw.codeHead !== codeHead) {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(PAYLOAD_CACHE_KEY);
      return true;
    } catch {
      // unavailable store — nothing left to evict.
      return false;
    }
  }
  return false;
}

/**
 * Persist the given (tree|docs) half of the entry, MERGING onto whatever half already sits under
 * the key — so whichever of the two read-only fetches (tree/docs) resolves LAST completes the one
 * combined entry, in either order. The merge trusts the existing raw fields directly (rather than
 * requiring the existing entry to already validate as complete) so the half already written by the
 * other side is never lost while the entry is still partial. Degrades silently on a full/unavailable
 * store.
 */
function writeMerged(part: { tree?: CachedTreePart; docs?: DocMeta[] }, codeHead: string): void {
  if (typeof window === 'undefined') return;
  const existing = readRawObject();
  const priorTree =
    existing !== undefined && typeof existing.tree === 'object' && existing.tree !== null
      ? (existing.tree as CachedTreePart)
      : undefined;
  const priorDocs = existing !== undefined && Array.isArray(existing.docs) ? (existing.docs as DocMeta[]) : undefined;
  interface MergedShape { clientStamp: string; codeHead: string; tree?: CachedTreePart; docs?: DocMeta[] }

  const merged: MergedShape = {
    clientStamp: CLIENT_STAMP,
    codeHead,
    ...(part.tree !== undefined ? { tree: part.tree } : priorTree !== undefined ? { tree: priorTree } : {}),
    ...(part.docs !== undefined ? { docs: part.docs } : priorDocs !== undefined ? { docs: priorDocs } : {}),
  };
  try {
    window.localStorage.setItem(PAYLOAD_CACHE_KEY, JSON.stringify(merged));
  } catch {
    // quota / unavailable — degrade silently, the product must be indifferent to its absence.
  }
}

/** Persist the TREE half of the entry — see {@link writeMerged}. */
export function writeTreeCache(stories: TreeStory[], codeHead: string): void {
  writeMerged({ tree: { stories } }, codeHead);
}

/** Persist the DOCS half of the entry — see {@link writeMerged}. */
export function writeDocsCache(docs: DocMeta[], codeHead: string): void {
  writeMerged({ docs }, codeHead);
}
