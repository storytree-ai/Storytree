/**
 * Runnable entry for reliability gate `drive-machinery#gate-5` (ADR-0184, Story UAT leg 4 "Land it").
 * The pure logic + git oracle live in `./promotion-ancestry.ts`; this is the thin wire the gate runs.
 *
 * Exit 0 = every proven drive-machinery commit is an ancestor of HEAD (reached main, non-squash).
 * Exit 1 = an orphaned proof (a squash/rewrite dropped a signed REAL verdict's commit) OR a shallow
 * clone that cannot verify. Run by `storytree gate run drive-machinery#gate-5` in a full local clone —
 * deliberately NOT a `*.test.ts`, so it never runs in CI's shallow `pnpm -r test` (ADR-0010 §5: the
 * out-of-band artifact check, never on a gate pass).
 */
import { PROVEN_COMMITS, isShallowClone, orphanedProvenCommits, realGitOracle } from "./promotion-ancestry.js";

if (isShallowClone()) {
  console.error(
    "promotion-ancestry: SHALLOW clone — the landed proof commits' objects are absent, so ancestry\n" +
      "cannot be verified. Run this gate in a full clone (a local adoption checkout has full history);\n" +
      "CI checks out shallow by design, which is why this check is not part of `pnpm -r test`.",
  );
  process.exit(1);
}

const orphaned = orphanedProvenCommits(PROVEN_COMMITS, realGitOracle());
if (orphaned.length > 0) {
  console.error("promotion-ancestry: proven commit(s) not reachable from the mainline:");
  for (const line of orphaned) console.error(`  x ${line}`);
  process.exit(1);
}

console.log(
  `promotion-ancestry: all ${PROVEN_COMMITS.length} proven drive-machinery commits are ancestors ` +
    "of HEAD (reached main, non-squash).",
);
