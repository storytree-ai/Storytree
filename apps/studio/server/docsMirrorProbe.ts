/**
 * The STUDIO half of the cross-surface conformance harness (`pnpm check:mirror-conformance`,
 * verification-integrity-arc inc 2). A probe, not a route: it prints what `GET /api/docs` would
 * serve for one or more docs directories, so the gate can diff it against the desktop's
 * hand-written copy of the same walk.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and
 * imports ONLY this app. That is the whole point of the design: the desktop may never import
 * apps/studio/server (ADR-0176's one-wired-backend rule, enforced by `check:boundaries`), so the
 * comparison is made on decoded JSON by a third party rather than by one surface reaching into
 * the other. Keep this file's import list to `./apiRouter.js` — a probe that grew its own logic
 * would stop measuring the real payload.
 *
 * Contract (shared with the desktop probe, apps/desktop/src/backend/docs-mirror-probe.ts):
 *   argv: one or more absolute docs directories
 *   stdout: a single JSON object `{ [dir]: DocMeta[] }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 */

import { listDocs } from './apiRouter.js';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('docsMirrorProbe: expected one or more docs directories as arguments');
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) out[dir] = await listDocs(dir);
process.stdout.write(JSON.stringify(out));
