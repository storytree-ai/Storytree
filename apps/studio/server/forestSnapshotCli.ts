// forestSnapshotCli.ts — the shell that PUBLISHES the public site's forest snapshot (ADR-0453 D7).
//
//   pnpm web:forest-snapshot --out web/src/data/forest-snapshot.json
//
// Reads the studio's own `/api/tree` fold against the live store, folds it through the pure
// `toForestSnapshot` allow-list, stamps the moment, and writes the file. Everything about WHAT is
// exported and why lives in `forestSnapshot.ts`; this file is IO, a clock, and one fail-closed guard.
//
// ⚠ THE GUARD IS THE POINT, so read it before relaxing it. When the live store cannot answer, the
// studio's presentation fold does not error — it falls back to the AUTHORED status ladder and the
// world UNDER-CLAIMS (see `../src/lib/worldStatus`, "Offline (DB down, verdicts absent)…"). Authored
// status is uniform in this corpus — measured 2026-08-26, every live story reads `proposed` — so the
// under-claiming snapshot is not a partial reading, it is 35 identical grey islands: a forest with no
// information at all, published to the one page that asserts its signals are real. It exits non-zero
// and writes nothing rather than let that reach the site. There is no override flag; a corpus with
// genuinely zero proven stories is a state this repo has never been in, and if it ever is, the right
// response is a decision, not a `--force`.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTreePayload, resolveStudioPaths } from './apiRouter';
import { serialiseForestSnapshot, toForestSnapshot, unpublishableReason } from './forestSnapshot';
import { createBackend, selectedStore } from './libraryBackend';

const STUDIO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `--out <path>`; relative paths resolve against the repo root, not the cwd. */
function parseOut(argv: readonly string[]): string | null {
  const i = argv.indexOf('--out');
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v !== undefined && !v.startsWith('--') ? v : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const paths = resolveStudioPaths(STUDIO_ROOT);
  const out = parseOut(argv);
  if (out === null) {
    console.error('web:forest-snapshot — missing --out <path> (e.g. web/src/data/forest-snapshot.json)');
    process.exit(2);
  }
  const outAbs = path.isAbsolute(out) ? out : path.join(paths.repoRoot, out);

  if (selectedStore() !== 'pg') {
    console.error(
      'web:forest-snapshot — refusing: STORYTREE_STUDIO_STORE is not `pg`.\n' +
        '  The published snapshot must be a reading of the LIVE store; the offline JSON backend\n' +
        '  carries a deliberately-frozen fixture corpus that is not this project.',
    );
    process.exit(1);
  }

  const backend = createBackend({
    assetsFile: paths.assetsFile,
    commentsFile: paths.commentsFile,
    usersFile: paths.usersFile,
    attestationsFile: paths.attestationsFile,
  });

  const payload = await buildTreePayload({ paths, backend });
  const snapshot = toForestSnapshot(payload, new Date().toISOString());

  const refusal = unpublishableReason(snapshot);
  if (refusal !== null) {
    console.error(`web:forest-snapshot — REFUSING TO PUBLISH: ${refusal}`);
    process.exit(1);
  }

  mkdirSync(path.dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, serialiseForestSnapshot(snapshot), 'utf8');

  console.log(
    `web:forest-snapshot — wrote ${path.relative(paths.repoRoot, outAbs)}\n` +
      `  as of        ${snapshot.generatedAt}\n` +
      `  stories      ${snapshot.storyCount} (${snapshot.provenStoryCount} proven)\n` +
      `  capabilities ${snapshot.capabilityCount}\n` +
      `  source       ${snapshot.source}`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main().then(
    () => process.exit(0),
    (err: unknown) => {
      console.error('web:forest-snapshot — failed:', err);
      process.exit(1);
    },
  );
}
