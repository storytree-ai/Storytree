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

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadArcRollups } from '@storytree/arc';
import { loadTitledAdrMetasFromStore } from '@storytree/drive';
import { isSignableUatCriterion, parseReliabilityGates, parseUatTestCriteria } from '@storytree/library';
import type { Store } from '@storytree/storage-protocol';

import { buildTreePayload, resolveStudioPaths } from './apiRouter';
import {
  serialiseForestSnapshot,
  toForestSnapshot,
  unpublishableReason,
  type AuthoredUatCriterion,
  type ForestSnapshotAdr,
} from './forestSnapshot';
import { createBackend, selectedStore } from './libraryBackend';

const STUDIO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The AUTHORED half of every UAT leg in the tree, keyed by criterion id (ADR-0494 D1).
 *
 * ⚠ THIS IS NOT A SECOND READING OF PROOF, and the distinction is the one `forestSnapshot.ts`'s
 * header draws. A leg's STATE arrives on the tree payload, folded from signed verdicts by the
 * studio's own reader; nothing here can change a colour. What this walk produces is the leg's
 * authored TITLE and its witness tag, through `parseUatTestCriteria` — the SAME parser the tree
 * read, the gate, the CLI and the build all count legs with, never a grep and never a second
 * grammar.
 *
 * ⚠ SIGNABILITY IS READ HERE TOO, AND IT IS RESOLVED AGAINST THE STORY'S OWN GATES — which is why
 * this walk parses both sections rather than only the criteria. `isSignableUatCriterion` asks
 * whether the leg names the gate that proves it, so it is a fact about the AUTHORING, and the same
 * function the crown, the CLI and the desktop overlay resolve it with. See
 * {@link ForestSnapshotUatCriterion.signable} for the five green islands that need it.
 *
 * A spec that fails to parse contributes nothing and is not fatal: the tree read already recorded
 * that story's `error` and the fold will fall the leg back to its own id, which is visible. A
 * publish that died because one story's markdown was malformed would take the whole forest down for
 * a defect the corpus's own rungs already name.
 */
export function loadAuthoredUatCriteria(storiesDir: string): Map<string, AuthoredUatCriterion> {
  const out = new Map<string, AuthoredUatCriterion>();
  if (!existsSync(storiesDir)) return out;
  for (const ent of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const file = path.join(storiesDir, ent.name, 'story.md');
    if (!existsSync(file)) continue;
    try {
      const body = readFileSync(file, 'utf8');
      // The FULL gate parse, not `activeReliabilityGates` — a leg bound to a gate retired in place
      // is BROKEN rather than never-bound, and `crownUatCriteria` draws that line the same way.
      const gates = parseReliabilityGates(ent.name, body);
      for (const leg of parseUatTestCriteria(ent.name, body)) {
        out.set(leg.criterionId, {
          title: leg.title,
          witness: leg.witness,
          signable: isSignableUatCriterion(leg, gates),
        });
      }
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * The decision log, keyed by number and narrowed to title-and-identity depth (ADR-0494 D2).
 *
 * ⚠ AN UNREADABLE LOG IS A REFUSAL, NOT AN EMPTY ONE — the same fail-closed shape as
 * `unpublishableReason`, and reachable in exactly the same way. `loadTitledAdrMetasFromStore`
 * reports `unreadable` precisely so a caller cannot mistake "the store did not answer" for "this
 * corpus has no decisions"; taking the second reading here would publish 35 islands each declaring
 * that nothing was decided behind it, on the page whose whole claim is that its signals are real.
 */
export async function loadPublishableDecisions(
  store: Store,
): Promise<{ decisions: Map<number, ForestSnapshotAdr>; unreadable: boolean }> {
  const { adrs, unreadable } = await loadTitledAdrMetasFromStore(store);
  const decisions = new Map<number, ForestSnapshotAdr>();
  for (const adr of adrs) {
    decisions.set(adr.number, {
      number: adr.number,
      status: String(adr.status),
      title: adr.title,
    });
  }
  return { decisions, unreadable };
}

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

  // The arc tier (ADR-0453 D12) comes from the SAME join the CLI's `arc show` and the studio's
  // `/api/arcs` read, so the drawer cannot disagree with either about an arc's shape. `docStore()`
  // is guaranteed here: the `pg` refusal above already rejected the one backend that has no store.
  const store = await (backend.docStore?.() ?? Promise.resolve(null));
  if (store === null) {
    console.error(
      'web:forest-snapshot — refusing: the `pg` backend returned no document store.\n' +
        '  Arcs are live-canonical (ADR-0183), so the arc drawer has nothing to publish and the\n' +
        '  snapshot would report every island as reached by no initiative — an absence invented by\n' +
        '  a missing connection rather than read from the corpus.',
    );
    process.exit(1);
  }

  const payload = await buildTreePayload({ paths, backend });
  const arcRollups = await loadArcRollups({ store, storiesDir: paths.storiesDir });
  const { decisions, unreadable } = await loadPublishableDecisions(store);
  if (unreadable) {
    console.error(
      'web:forest-snapshot — refusing: the decision log could not be read.\n' +
        '  Publishing now would put a forest on the site whose every island declares that nothing\n' +
        '  was decided behind it — an absence invented by an unanswered store rather than read\n' +
        '  from the corpus (ADR-0494 D2).\n' +
        '  → bring the store up (`pnpm db:up`) and re-run, or check STORYTREE_DB_USER.',
    );
    process.exit(1);
  }
  const snapshot = toForestSnapshot(payload, new Date().toISOString(), {
    arcRollups,
    uatCriteria: loadAuthoredUatCriteria(paths.storiesDir),
    decisions,
  });

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
      `  uat legs     ${snapshot.stories.reduce((n, s) => n + s.uat.length, 0)} across ` +
      `${snapshot.stories.filter((s) => s.uat.length > 0).length} of ${snapshot.storyCount} stories\n` +
      `  decisions    ${snapshot.decisions.length} reachable\n` +
      `  arcs         ${snapshot.arcs.length} reaching ` +
      `${snapshot.stories.filter((s) => s.arcs.length > 0).length} of ${snapshot.storyCount} stories\n` +
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
