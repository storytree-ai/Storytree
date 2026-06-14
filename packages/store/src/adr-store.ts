/**
 * The ADR-number allocator (ADR-0050): hands out the next ADR number ATOMICALLY from
 * `events.adr_number`, so two parallel sessions can't pick the same one — the recurring collision
 * the `storytree adr new` command and the CI dup-number gate close.
 *
 * The next number is `GREATEST(localMax, the max already handed out) + 1`, where `localMax` is the
 * highest ADR number on the CALLER's checkout. That reconciliation matters: an ADR can land on `main`
 * without going through the allocator (an offline-fallback author), so the allocator must never re-hand
 * a number already used on disk. `number` is the table's PRIMARY KEY, so a racing double-allocation
 * (two sessions computing the same `MAX(number)+1` before either commits) hits a unique violation
 * (23505) — caught here and RETRIED, which recomputes the max against the now-committed row.
 *
 * EVENT-ONLY allocation log: a row is written once and never updated or reused, so an abandoned
 * branch's number stays burned (holes are fine — sequential, not gapless, is the contract).
 */

/** The slice of `pg.Pool` this allocator needs (structural, so offline tests inject a fake). */
export interface AdrAllocatorClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface AdrAllocation {
  /** The freshly-reserved ADR number (4-digit when zero-padded). */
  number: number;
  /** When it was reserved (ISO 8601). */
  at: string;
}

/** Postgres `unique_violation` — a concurrent allocation grabbed the number we computed; retry. */
const UNIQUE_VIOLATION = "23505";
/** A small bound: contention is two-or-three sessions at once, never dozens. */
const MAX_RETRIES = 8;

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === UNIQUE_VIOLATION;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class PgAdrStore {
  readonly #client: AdrAllocatorClient;

  constructor(client: AdrAllocatorClient) {
    this.#client = client;
  }

  /**
   * Reserve the next ADR number. `localMax` is the highest ADR number on the caller's checkout (0 if
   * none); the result is `max(localMax, max-ever-handed-out) + 1`. Records slug/branch/actor for audit.
   * Atomic: a contended double-allocation retries on the PK unique violation.
   */
  async allocate(a: {
    localMax: number;
    slug: string;
    branch: string;
    actor: string;
  }): Promise<AdrAllocation> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await this.#client.query(
          `INSERT INTO events.adr_number (number, slug, branch, actor)
           SELECT GREATEST($1::int, COALESCE(MAX(number), 0)) + 1, $2, $3, $4
           FROM events.adr_number
           RETURNING number, at`,
          [a.localMax, a.slug, a.branch, a.actor],
        );
        const row = res.rows[0] as { number: string | number; at: Date | string } | undefined;
        if (row === undefined) throw new Error("PgAdrStore.allocate: no row returned");
        return { number: Number(row.number), at: toIso(row.at) };
      } catch (err) {
        if (isUniqueViolation(err)) {
          lastErr = err; // another session grabbed it between our MAX read and INSERT — recompute
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `PgAdrStore.allocate: gave up after ${MAX_RETRIES} contended attempts ` +
        `(${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
    );
  }
}
