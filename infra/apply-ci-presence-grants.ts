// Apply infra/ci-presence-grants.sql as the schema owner (keyless, ADR-0021).
// Idempotent — safe to re-run after a user recreate, a schema change, or a widening of the grants.
//
// RUN IT FROM THE REPO ROOT, THROUGH A WORKSPACE `tsx`:
//
//   STORYTREE_DB_USER=hua.mick@gmail.com pnpm -C packages/cli exec tsx ../../infra/apply-ci-presence-grants.ts
//
// ⚠ NOT `npx tsx infra/apply-ci-presence-grants.ts`, which is what this header said until
// 2026-09-08 and which does not work: this pnpm workspace has no root `node_modules/.bin`, so npx
// finds no tsx and (offline, or on a fresh checkout) simply fails with
// `'tsx' is not recognized`. The `-C packages/cli` form resolves the workspace's pinned tsx, and the
// relative path back out to infra/ is what keeps the script's own repo-root-relative reads correct.
// Recorded rather than quietly fixed because a documented command that does not run is the same
// defect class this file's `claim_event` paragraph exists to record — see the note there.

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
    "ci-presence grants applied for storytree-ci-presence@…iam: WRITE on events.node_claim + " +
      "INSERT and SELECT on events.claim_event (the merge-time claim release — SELECT is what the " +
      "append's `RETURNING seq` costs, not a read grant) + SELECT on events.library_artifact/" +
      "library_event (the live-store gate rungs, ADR-0302 D3) + the ADR-0451 work-hierarchy mirror. " +
      "Session-presence grants retired, ADR-0200 D7.",
  );
} finally {
  await closePool(pool, connector);
}
