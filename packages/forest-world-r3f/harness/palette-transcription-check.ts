// palette-transcription-check.ts — THE RUNG THAT ASKS. `pnpm check:palette-transcription`.
//
// The comparison itself is `palette-transcription.ts`; this file is only the entry point, the
// paths, and the refusal. Two things justify it being a GATE RUNG rather than only the `node:test`
// suite beside it, and the second is the whole reason it exists:
//
//  1. It is the fourth landing in a row on this arc to find the status palette out of step with
//     the decisions, and the first three were all found by a human reading a file. The land's
//     colour is a capability's proof state (ADR-0392 D5 / ADR-0398 D7), so drift here is the map
//     misreporting work, which is the one failure this arc named as doing real harm.
//
//  2. ⚠ THE `node:test` SUITE ALONE CANNOT SEE THE DRIFT THAT ACTUALLY HAPPENS. `pnpm gate`
//     narrows both `-r` legs to the packages this branch AFFECTS plus their dependents (ADR-0304
//     D1), and `apps/studio` does NOT depend on `@storytree/forest-world-r3f`. So a branch that
//     retunes `.hex-territory.st-<status>` in the studio's CSS — the CANONICAL surface, and the
//     surface every one of ADR-0462 / ADR-0470 was authored on — runs no test in this package at
//     all. The suite catches a canvas that drifts from the CSS; only a rung catches a CSS that
//     drifts from the canvas, and the CSS is the copy that MOVES. A declared `check:*` step runs
//     on every gate regardless of scope, which is exactly the property needed here.
//
// It is pure filesystem reading and string parsing: no browser, no store, no network, single-digit
// milliseconds. It never skips — all three sources are always present in this checkout — so it has
// no reserved exit 3 and CI runs it as an ordinary step.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STATUS_TOKENS, TREE_TOKENS } from './palette-band.js';
import { checkTranscriptions, formatDisagreements } from './palette-transcription.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, '..');
const REPO = join(PACKAGE, '..', '..');

const { faults, disagreements } = checkTranscriptions(
  (p) => readFileSync(p, 'utf8'),
  {
    cssPath: join(REPO, 'apps', 'studio', 'src', 'index.css'),
    canvasPath: join(PACKAGE, 'src', 'ForestWorldCanvas.tsx'),
  },
  STATUS_TOKENS,
  TREE_TOKENS,
);

if (faults.length > 0 || disagreements.length > 0) {
  console.error('');
  console.error('[palette-transcription] REFUSED — the status palette does not say one thing.');
  console.error('');
  if (faults.length > 0) {
    console.error('  A SOURCE COULD NOT BE READ AS A PALETTE (this is not agreement — it is silence):');
    for (const f of faults) console.error(`    ${f}`);
    console.error('');
  }
  if (disagreements.length > 0) {
    console.error('  THE COPIES DISAGREE:');
    console.error(formatDisagreements(disagreements));
    console.error('');
    console.error('  apps/studio/src/index.css is CANONICAL — it is where the vocabulary is authored');
    console.error('  and where ADR-0462 and ADR-0470 were decided. Move the other copies onto it, in');
    console.error('  the same landing. The land’s colour IS a capability’s proof state (ADR-0392 D5');
    console.error('  / ADR-0398 D7): a copy that disagrees is the map reporting a state nobody decided.');
  }
  console.error('');
  process.exit(1);
}

console.log(
  '[palette-transcription] PASS — apps/studio/src/index.css, harness/palette-band.ts and ' +
    'src/ForestWorldCanvas.tsx agree on all six states, ground and crown.',
);
