// Apply infra/ci-website-verdict-grants.sql as the schema owner (keyless, ADR-0021).
// Idempotent — safe to re-run after a user recreate, a schema change, or a widening of the grants.
//
// RUN IT FROM THE REPO ROOT. The path below is repo-root-relative, and running it from inside
// infra/ doubles the path and fails:
//
//   STORYTREE_DB_USER=hua.mick@gmail.com npx tsx infra/apply-ci-website-verdict-grants.ts
//
// (On Windows PowerShell: $env:STORYTREE_DB_USER='hua.mick@gmail.com'; npx tsx ...)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Relative, not '@storytree/library/store': infra/ is not a workspace package, so the
// package name doesn't resolve from here; the library's own node_modules does (mirrors
// apply-ci-presence-grants.ts).
import { createPool, closePool } from "../packages/library/src/store/connection.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "ci-website-verdict-grants.sql"), "utf8");

const { pool, connector } = await createPool();
try {
  await pool.query(sql);
  console.log(
    "ci-website-verdict grants applied for storytree-ci-webverdict@…iam: INSERT+SELECT on " +
      "events.verdict, INSERT on events.uat_drive. No corpus read, no claim-table access — a " +
      "new, narrower identity rather than a widened storytree-ci-presence.",
  );
} finally {
  await closePool(pool, connector);
}
