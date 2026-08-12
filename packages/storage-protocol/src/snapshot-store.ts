// A read-through SNAPSHOT over the Store seam — one consistent view of the corpus for the length of
// one read-only pass, with each distinct document fetched at most once.
//
// WHY IT EXISTS (the landing-tail measurement, ADR-0345). The generated-view checks read the same
// documents over and over: `check:agents` renders 10 agents into 5 harness formats and then re-reads
// each agent's cited artifacts a third time for the essentials gate, issuing 1,035 `getDoc` calls for
// 87 distinct documents — an 11.9x amplification. That is invisible on a dev box beside the database
// (~18 ms/round trip) and dominant in CI, where a US runner reaches australia-southeast1 at ~167 ms:
// ~181 of the step's 193 seconds were network round trips, making it 37% of the whole landing tail.
//
// The renderers are not wrong to ask; asking is how a pull-based renderer stays honest about a
// dangling ref. What is wrong is answering the same question 12 times over a network. So this
// decorator is deliberately a SEAM concern rather than a fix inside any one renderer: every caller
// that walks a document graph read-only pays the same tax.
//
// IT ALSO REMOVES A RACE. Un-snapshotted, those 1,035 reads straddle several seconds of wall clock,
// so a sibling session's live artifact edit can land MID-CHECK and the run reports drift against a
// corpus that never existed at any single instant. A snapshot reads one instant by construction.
//
// FAIL-CLOSED ON WRITES. Every write verb throws: a snapshot cannot honour a write without either
// lying to a later read or silently invalidating the consistency it exists to provide. Wrapping a
// write path is a programming error, and it is refused loudly rather than papered over.

import type { DeleteDocOpts, Store, StoreEvent, StoredDoc } from "./store.js";

/** The snapshot's own accounting — how many reads reached the underlying store, and how many did not. */
export interface SnapshotStats {
  /** Reads forwarded to the underlying store (the round trips actually paid for). */
  forwarded: number;
  /** Reads answered from the snapshot (the round trips avoided). */
  served: number;
  /** Distinct documents held. */
  docs: number;
}

export interface SnapshotStore extends Store {
  /** Live read accounting — safe to read at any point, and the figure a check should report. */
  readonly stats: Readonly<SnapshotStats>;
}

const WRITE_REFUSAL =
  "snapshotReads() wraps a READ-ONLY pass — a snapshot cannot serve a write without lying to a " +
  "later read. Use the underlying store for writes.";

/**
 * Cache key for an OPTIONAL filter value, where "no filter" is a different question from any
 * particular value. `JSON.stringify` keeps those apart without a magic sentinel — a store whose kind
 * is literally `all` gets `"all"` and the unfiltered query gets `undefined`, so no real value can
 * ever collide with the everything-key.
 */
const cacheKey = (value: string | undefined): string => JSON.stringify(value ?? null);

/**
 * Wrap `store` so each distinct document, kind-query and event-query is fetched at most once.
 *
 * `queryDocs` additionally seeds the per-id cache with every document it returns, so a caller that
 * lists a kind and then reads its members individually pays for the list alone. Concurrent reads of
 * the same key share one in-flight promise, so a parallel walk cannot stampede.
 */
export function snapshotReads(store: Store): SnapshotStore {
  const docs = new Map<string, Promise<StoredDoc | null>>();
  const queries = new Map<string, Promise<StoredDoc[]>>();
  const events = new Map<string, Promise<StoreEvent[]>>();
  const stats: SnapshotStats = { forwarded: 0, served: 0, docs: 0 };

  // `docs` holds a promise per id so a second caller awaiting the same id never issues a second
  // read. A rejected read is EVICTED rather than cached: a transient failure must not become a
  // permanent one for the rest of the pass.
  const memo = <T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit !== undefined) {
      stats.served += 1;
      return hit;
    }
    stats.forwarded += 1;
    const pending = load().catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, pending);
    return pending;
  };

  const seed = (stored: StoredDoc): void => {
    if (docs.has(stored.id)) return;
    docs.set(stored.id, Promise.resolve(stored));
    stats.docs += 1;
  };

  return {
    stats,

    async getDoc(id: string): Promise<StoredDoc | null> {
      const stored = await memo(docs, id, async () => {
        const found = await store.getDoc(id);
        if (found !== null) stats.docs += 1;
        return found;
      });
      return stored;
    },

    async queryDocs(filter?: { kind?: string }): Promise<StoredDoc[]> {
      const found = await memo(queries, cacheKey(filter?.kind), async () => {
        const rows = await store.queryDocs(filter);
        for (const row of rows) seed(row);
        return rows;
      });
      // A copy per call: the snapshot's array must not be mutable by one caller for the next.
      return [...found];
    },

    async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
      const found = await memo(events, cacheKey(filter?.id), () => store.readEvents(filter));
      return [...found];
    },

    upsertDoc(): Promise<StoredDoc> {
      return Promise.reject(new Error(WRITE_REFUSAL));
    },
    patchDoc(): Promise<StoredDoc | null> {
      return Promise.reject(new Error(WRITE_REFUSAL));
    },
    deleteDoc(_id: string, _opts?: DeleteDocOpts): Promise<boolean> {
      return Promise.reject(new Error(WRITE_REFUSAL));
    },
    appendEvent(): Promise<StoreEvent> {
      return Promise.reject(new Error(WRITE_REFUSAL));
    },
  };
}
