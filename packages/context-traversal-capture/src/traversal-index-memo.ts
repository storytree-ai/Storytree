// The trace index, answered incrementally (`traversal-panel-arc`, increment
// `traversal-panel-index-read`; MOVED here from `apps/studio/server/traversalIndexMemo.ts` by
// increment `desktop-serves-the-traversal-routes`).
//
// WHY IT MOVED, and why it was not copied. The desktop backend serves the same compiled studio
// bundle from its own route table and had to grow its own `/api/traversal/sessions`. Copying this
// module would have produced a SECOND cache carrying the same freshness argument and the same
// deep-equality obligation to `listTraversalSessions`, with nothing binding the two together — the
// exact duplication `desktop-backend-mirrors-studio-routes-subset` records drifting twice on
// `/api/activity`. It holds no studio policy at all (`node:fs`, `node:path`, and this package's own
// summary type), so the one copy lives beside the reader it wraps and both surfaces import it.
//
// WHY THIS EXISTS AT ALL, measured rather than assumed. `listTraversalSessions` fully REPLAYS every
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
// ⚠ THE STUDIO MUST STILL REACH THIS LAZILY. `apps/studio/server/traversalApi.ts` is loaded by
// `vite.config.ts` → `devApi.ts` through Node's plain ESM loader, where this package's internal
// `./sink.js` specifiers do not resolve (only the `.ts` files exist), and `pnpm gate` does not run
// `vite build` — so a STATIC import of this package from that file would break the dev server with
// only CI Build to catch it. The route already pulls the package through `loadTraversalSink()`; this
// function rides that same loader rather than a static import of its own. Nothing about the move
// weakens that trap, and the injectable `summarize` below is no longer what protects against it.

import fs from "node:fs";
import path from "node:path";

import {
  summarizeTraversalSession,
  TRAVERSAL_TRACE_EXT,
  type TraversalSessionSummary,
} from "./sink.js";

/**
 * How one session's summary is produced. `null` means the file replayed to zero usable events —
 * which `listTraversalSessions` omits from its answer, and which is cached the same way a real
 * summary is so a dead file is not re-read either.
 *
 * Defaults to the sink's own {@link summarizeTraversalSession}, which is the SAME body
 * `listTraversalSessions` folds with, so parity is structural rather than test-held. It stays
 * injectable for one reason only: a test that COUNTS reads is the only way to prove the point of the
 * module — that an unchanged file was not re-read.
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
 *
 * Module state, so the two surfaces each hold their OWN index: they are separate processes. Nothing
 * here is shared between them beyond the code.
 */
const indexByDir = new Map<string, Map<string, CachedSummary>>();

/** Drops every cached index. For tests, which share module state within a file. */
export function resetTraversalIndexMemo(): void {
  indexByDir.clear();
}

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
  summarize: SummarizeTraversalSession = summarizeTraversalSession,
): TraversalSessionSummary[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    // Stryker disable next-line CallExpression: EQUIVALENT to a reader — dropping the index for an
    // unreadable dir and keeping it are indistinguishable from outside, because the very next call
    // re-reads the directory anyway (an unreadable dir returns `[]` and a readable one is rebuilt
    // from THIS call's entries). It is here so a dir that vanishes does not hold its summaries
    // resident for the process's lifetime.
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
    if (!entry.endsWith(TRAVERSAL_TRACE_EXT)) continue;
    const sessionId = entry.slice(0, -TRAVERSAL_TRACE_EXT.length);

    // Observed BEFORE the summary below — see the freshness note at the top of the file.
    let observed: { mtimeMs: number; size: number } | null;
    // Stryker disable BlockStatement: the catch below is UNREACHABLE IN A TEST BY CONSTRUCTION —
    // reaching it means deleting the file in the window between this loop's `readdir` and its
    // `statSync`, which is a race a suite cannot schedule. Its whole purpose is to make that race
    // harmless. A `disable next-line` on the `} catch {` line does not take (measured 2026-08-29:
    // the mutant is still reported), so the region form is used.
    try {
      const st = fs.statSync(path.join(dir, entry));
      observed = { mtimeMs: st.mtimeMs, size: st.size };
      // Vanished between the readdir and the stat. Fall through to a real read (which the sink
      // answers as empty for a missing file) and cache NOTHING, so the next call re-decides.
    } catch {
      observed = null;
    }
    // Stryker restore BlockStatement

    const cached = previous?.get(sessionId);
    if (
      // Stryker disable next-line ConditionalExpression: this conjunct guards the unreachable race
      // above — with `observed` null there is nothing to compare against, so a test that could
      // discriminate it would have to schedule that same race. The mtime and size conjuncts below
      // are NOT disabled: both are asserted directly by the re-read cases.
      observed !== null &&
      cached !== undefined &&
      cached.mtimeMs === observed.mtimeMs &&
      cached.size === observed.size
    ) {
      // Stryker disable next-line CallExpression: EQUIVALENT to the ANSWER — not carrying the entry
      // forward only makes the NEXT call re-read a file it need not, which is a cost rather than a
      // difference. The property that matters, that an unchanged file is not re-read, is asserted
      // directly by the read-counting cases.
      next.set(sessionId, cached);
      if (cached.summary !== null) summaries.push(cached.summary);
      continue;
    }

    const summary = summarize(dir, sessionId);
    // Stryker disable next-line ConditionalExpression: the same unreachable race — see above.
    if (observed !== null) {
      next.set(sessionId, { mtimeMs: observed.mtimeMs, size: observed.size, summary });
    }
    if (summary !== null) summaries.push(summary);
  }

  indexByDir.set(dir, next);
  return summaries;
}
