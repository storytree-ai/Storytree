// The picker's trace index, answered incrementally (`traversal-panel-arc`, increment
// `traversal-panel-index-read`).
//
// WHY THIS EXISTS, measured rather than assumed. `listTraversalSessions` fully REPLAYS every
// `*.jsonl` under the trace dir on every call, and `GET /api/traversal/sessions` called it per
// request. On this machine's 328 traces (3.1 MB) that is 693 ms, and the bytes are not the cost:
// reading every byte is 43 ms, `+ JSON.parse` is 76 ms, and `+ ONE` `ContextTraversalEvent` zod pass
// is 426 ms — so ~95% of the work is validation, redone from scratch each time (twice per line, in
// fact: the sink `safeParse`s and `trace.append` parses the same object again). Through the dev
// server's loader the same route measured 6.3 s cold / 0.9-1.6 s warm on an IDLE server, and the
// handler is fully SYNCHRONOUS, so under a real page load every other request queues behind it. That
// is how it came to lose a race with its own client's 10 s abort.
//
// THE SHAPE OF THE FIX, and why it is not a bigger timeout. A trace is APPEND-ONLY: the sink writes
// with `fs.appendFileSync` and nothing in this repo rewrites or prunes one (ADR-0241 D7 forbids
// retention/rotation outright). So a file whose (mtime, size) is unchanged since it was last read
// cannot have changed content, and its summary can be reused verbatim. Cost then scales with the
// CHURN — the one or two traces the operator's own live sessions are appending to — instead of with
// the trace COUNT, which only ever grows. A raised timeout would just move the cliff; this removes
// the term that was growing.
//
// FRESHNESS ORDER IS LOAD-BEARING (the `corpusMemo.ts` lesson, same reasoning): the stat is observed
// BEFORE the summary is computed and stored paired with it, so a write landing mid-read is keyed to
// the PRE-write stat. The next request observes a different stat and re-reads — a wasted read, never
// a stale answer. Doing it the other way round (read, then stat) would cache a post-write stat over
// pre-write content, which is exactly the staleness this ordering forbids.
//
// PURE OF THE CAPTURE PACKAGE, deliberately. `summarize` is injected rather than imported: this
// module is reached from `traversalApi.ts`, which vite.config.ts loads through Node's plain ESM
// loader, where `@storytree/context-traversal-capture`'s internal `./sink.js` specifiers do not
// resolve (only the .ts files exist). A static import here would break the dev server with only CI
// Build to catch it — the same trap the route's lazy loaders already dodge.

import fs from 'node:fs';
import path from 'node:path';

// Type-only, so it is fully erased under `verbatimModuleSyntax` and never reaches the config-load
// graph. The VALUE half is injected by the caller.
import type { TraversalSessionSummary } from '@storytree/context-traversal-capture';

/**
 * How one session's summary is produced. `null` means the file replayed to zero usable events —
 * which `listTraversalSessions` omits from its answer, and which is cached the same way a real
 * summary is so a dead file is not re-read either.
 *
 * Injected so the route can supply the lazily-loaded sink, and so a test can COUNT the reads and
 * prove an unchanged file was not re-read.
 */
export type SummarizeTraversalSession = (
  dir: string,
  sessionId: string,
) => TraversalSessionSummary | null;

interface CachedSummary {
  readonly mtimeMs: number;
  readonly size: number;
  readonly summary: TraversalSessionSummary | null;
}

/**
 * One index per directory path, never a single shared slot — `STORYTREE_TRAVERSAL_DIR` moves the
 * trace dir, and a shared slot would serve one directory's answer for another. No TTL and no clock:
 * freshness is decided by (mtime, size) and by nothing else.
 */
const indexByDir = new Map<string, Map<string, CachedSummary>>();

/** Drops every cached index. For tests, which share module state within a file. */
export function resetTraversalIndexMemo(): void {
  indexByDir.clear();
}

/**
 * The sink's own filename convention (`<sessionId>.jsonl`), mirrored rather than imported for the
 * config-load reason above. It is held honest by a parity test that deep-compares this function's
 * answer against the REAL `listTraversalSessions` over the same directory — so a convention change
 * in the sink reds here rather than drifting silently.
 */
const TRACE_EXT = '.jsonl';

/**
 * Enumerate every captured session under `dir`, re-reading only the files whose (mtime, size) moved
 * since the last call. Answers exactly what `listTraversalSessions({ dir })` answers, in the same
 * `readdir` order, including its omission of sessions that replay to zero usable events.
 *
 * An unreadable directory is an EMPTY LIST and drops any index held for it — the same honest answer
 * the sink gives, because a machine that has captured nothing (and the hosted container, which
 * captures nothing ever) is a normal state rather than an error.
 */
export function listTraversalSessionsIncremental(
  dir: string,
  summarize: SummarizeTraversalSession,
): TraversalSessionSummary[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    indexByDir.delete(dir);
    return [];
  }

  const previous = indexByDir.get(dir);
  // Rebuilt from THIS call's entries rather than mutated in place, so a session whose file was
  // removed simply does not carry over — no eviction pass, and no way for a deleted trace to keep
  // being served.
  const next = new Map<string, CachedSummary>();
  const summaries: TraversalSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(TRACE_EXT)) continue;
    const sessionId = entry.slice(0, -TRACE_EXT.length);

    // Observed BEFORE the summary below — see the freshness note at the top of the file.
    let observed: { mtimeMs: number; size: number } | null;
    try {
      const st = fs.statSync(path.join(dir, entry));
      observed = { mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      // Vanished between the readdir and the stat. Fall through to a real read (which the sink
      // answers as empty for a missing file) and cache NOTHING, so the next call re-decides.
      observed = null;
    }

    const cached = previous?.get(sessionId);
    if (
      observed !== null &&
      cached !== undefined &&
      cached.mtimeMs === observed.mtimeMs &&
      cached.size === observed.size
    ) {
      next.set(sessionId, cached);
      if (cached.summary !== null) summaries.push(cached.summary);
      continue;
    }

    const summary = summarize(dir, sessionId);
    if (observed !== null) {
      next.set(sessionId, { mtimeMs: observed.mtimeMs, size: observed.size, summary });
    }
    if (summary !== null) summaries.push(summary);
  }

  indexByDir.set(dir, next);
  return summaries;
}
