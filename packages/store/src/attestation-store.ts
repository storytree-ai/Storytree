import type { Attestation } from "@storytree/verdict-contract";
import { Attestation as AttestationDoc } from "@storytree/verdict-contract";

/**
 * ADR-0044 `attestation-signals`: the Postgres-backed per-UAT-test attestation log.
 * Append-only and signed — the `events.verdict` writer's shape (a single validated
 * INSERT, no projection), but a DELIBERATELY SEPARATE table: a vouch and a proof must
 * not share a log (the conflation ADR-0044 d.2 forbids). This store STRUCTURALLY
 * touches `events.attestation` only, so recording an attestation can never write
 * `events.verdict` (`separate-from-verdicts`).
 *
 * No projection table: the latest-per-(testId,witness) display projection is derived
 * in JS by `@storytree/core`'s `deriveAttestations` (the verdict-glyph discipline),
 * so there is nothing to keep atomic and a plain INSERT suffices. The doc is
 * re-validated at the write boundary — a blank signer / unknown witness is refused
 * here, not only at the HTTP/CLI layer.
 *
 * The client is duck-typed (just `query`) so offline tests inject a fake without `pg`.
 */

// ── Structural seam ───────────────────────────────────────────────────────────

export interface AttestationStoreClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

// ── Internal row shapes ────────────────────────────────────────────────────────

interface AttestationEventRow {
  seq: string | number;
  doc: unknown;
}

// ── Store ────────────────────────────────────────────────────────────────────

export class PgAttestationStore {
  readonly #client: AttestationStoreClient;

  constructor(client: AttestationStoreClient) {
    this.#client = client;
  }

  /**
   * Record a signed attestation: re-validate at the write boundary (fail-closed — a
   * blank signer / unknown witness throws before any SQL), then append ONE row to
   * `events.attestation`. No other table is touched. Returns the persisted doc.
   */
  async record(att: Attestation): Promise<Attestation> {
    const validated = AttestationDoc.parse(att);
    await this.#client.query(
      `INSERT INTO events.attestation (test_id, outcome, witness, signer, relayed_by, doc)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        validated.testId,
        validated.outcome,
        validated.witness,
        validated.signer,
        validated.relayedBy ?? null,
        JSON.stringify(validated),
      ],
    );
    return validated;
  }

  /**
   * All attestation rows as `{ seq, doc }`, ascending by `seq` — the input shape
   * `deriveAttestations` consumes. The caller derives the latest-per-(testId,witness)
   * projection (and filters to a story's `<story>#uat-*` tests) in JS.
   */
  async readEvents(): Promise<Array<{ seq: number; doc: unknown }>> {
    const res = await this.#client.query("SELECT seq, doc FROM events.attestation ORDER BY seq");
    return (res.rows as AttestationEventRow[]).map((r) => ({ seq: Number(r.seq), doc: r.doc }));
  }

  /**
   * Full append-only history for one test id, ascending. A malformed stored row is
   * skipped (conservative parsing) rather than crashing the read.
   */
  async history(testId: string): Promise<Attestation[]> {
    const res = await this.#client.query(
      "SELECT doc FROM events.attestation WHERE test_id = $1 ORDER BY seq",
      [testId],
    );
    const out: Attestation[] = [];
    for (const row of res.rows as Array<{ doc: unknown }>) {
      const parsed = AttestationDoc.safeParse(row.doc);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  }
}
