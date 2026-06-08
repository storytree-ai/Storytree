// One-off: verify the live migration round-tripped (ADR-0021). Run keyless:
//   STORYTREE_DB_USER=<iam-email> npx tsx packages/store/scripts/verify-migration.ts
import { createPool, closePool } from "../src/connection.js";
import { PgLibraryStore } from "../src/pg-store.js";

const { pool, connector } = await createPool();
try {
  const store = new PgLibraryStore(pool);
  const docs = await store.queryDocs();
  const byKind = docs.reduce<Record<string, number>>((a, d) => ((a[d.kind] = (a[d.kind] ?? 0) + 1), a), {});
  const events = await store.readEvents();
  const sample = await store.getDoc("deep-modules");
  const comments = await pool.query<{ n: string }>("SELECT count(*)::text AS n FROM events.comment");
  console.log(`artifacts: ${docs.length}`);
  console.log(`by kind: ${JSON.stringify(byKind)}`);
  console.log(`library_event rows: ${events.length}`);
  console.log(`comment projection rows: ${comments.rows[0]?.n ?? "?"}`);
  console.log(`sample getDoc('deep-modules'): ${sample ? `${sample.kind} / ${(sample.doc as { title?: string }).title}` : "MISSING"}`);
} finally {
  await closePool(pool, connector);
}
