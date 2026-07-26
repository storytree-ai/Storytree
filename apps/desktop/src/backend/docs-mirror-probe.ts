/**
 * The DESKTOP half of the cross-surface conformance harness (`pnpm check:mirror-conformance`,
 * verification-integrity-arc inc 2). A probe, not a route: it prints what this backend's
 * `GET /api/docs` would serve for one or more docs directories, so the gate can diff it against
 * the studio payload it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and
 * imports ONLY this app — the boundary that makes the whole harness legal. This backend
 * deliberately re-composes the studio's route algorithm over its own `node:fs` and may never
 * import apps/studio/server (ADR-0176; `check:boundaries` enforces the wall), so conformance is
 * established by a third party comparing two JSON payloads, not by either side importing the
 * other. Keep this file's import list to `./boot-read-routes.js`.
 *
 * Contract (shared with the studio probe, apps/studio/server/docsMirrorProbe.ts):
 *   argv: one or more absolute docs directories
 *   stdout: a single JSON object `{ [dir]: DocMeta[] }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 */

import { listDocs } from "./boot-read-routes.js";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("docs-mirror-probe: expected one or more docs directories as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) out[dir] = await listDocs(dir);
process.stdout.write(JSON.stringify(out));
