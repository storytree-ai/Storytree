// Apply infra/ci-presence-grants.sql as the schema owner (keyless, ADR-0021).
// Idempotent — safe to re-run after a user recreate, a schema change, or a widening of the grants.
//
// RUN IT FROM THE REPO ROOT. The path below is repo-root-relative, and running it from inside
// infra/ doubles the path and fails:
//
//   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-presence-grants.ts
//
// (On Windows PowerShell: $env:STORYTREE_DB_USER='hua.mick@gmail.com'; npx tsx ...)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Relative, not '@storytree/library/store': infra/ is not a workspace package, so the
// package name doesn't resolve from here; the library's own node_modules does. (ADR-0077: the
// Postgres connection substrate moved into the library organism's node-only ./store subpath.)
import { createPool, closePool } from "../packages/library/src/store/connection.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "ci-presence-grants.sql"), "utf8");

const { pool, connector } = await createPool();
try {
  await pool.query(sql);
  console.log(
    "ci-presence grants applied for storytree-ci-presence@…iam: WRITE on events.node_claim/claim_event " +
      "(merge-time claim release) + SELECT on events.library_artifact/library_event (the live-store gate " +
      "rungs, ADR-0302 D3). Session-presence grants retired, ADR-0200 D7.",
  );
} finally {
  await closePool(pool, connector);
}
