/**
 * `pnpm standson:bootstrap [--write]` — ADR-0223 dec 5's one-time seed of the authored `dependsOn`
 * DAG from existing down-tier citations, as amended by ADR-0363 D1.
 *
 * THE THIN HALF. Every rule lives in the pure projection (`projectDependsOnFromCitations` in
 * `@storytree/library`); this file reads the corpus, prints the plan, and — only when told to —
 * applies it. It decides nothing.
 *
 * DRY-RUN BY DEFAULT. This writes an authored field across a large fraction of the SHARED live
 * corpus, which is the kind of write that should be read before it happens, not explained after.
 * `--write` is the opt-in.
 *
 * IT PATCHES, IT NEVER UPSERTS (ADR-0352). A whole-doc write here would replace the doc as this
 * process read it seconds-to-minutes earlier and silently revert anything a sibling session landed in
 * between — the measured lost update, and a migration touching ~169 docs is the worst possible place
 * to reintroduce it. `patchDoc` merges the single `dependsOn` key onto CURRENT state inside the
 * store's own write, so a concurrent edit to any other field survives, and `validate` runs on the
 * MERGED doc so migrate-on-write is not skipped.
 *
 * A per-doc failure does not abort the run: the projection is a set of independent per-artifact
 * seeds, so one refused doc is one missing edge, not a half-applied migration. Failures are counted
 * and named at the end, and the exit code reflects them.
 */

import { openCorpusStore } from "@storytree/drive";
import { projectDependsOnFromCitations, upcastAndValidate } from "@storytree/library";

const TAG = "standson:bootstrap";

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const corpus = await openCorpusStore(TAG);

  try {
    const docs = await corpus.store.queryDocs();
    const plan = projectDependsOnFromCitations(docs);

    console.log(`${TAG} — corpus: ${docs.length} artifacts, ${plan.docsScanned} of them in the DAG.`);
    console.log(
      `${TAG} — plan: ${plan.edgesPlanned} NEW edges across ${plan.edges.length} artifacts` +
        ` (${plan.extended} of them EXTENDED — they already carried authored edges, ADR-0373).`,
    );
    // Print the skips ALWAYS. A thin plan is the expected outcome of a corpus whose citations mostly
    // run sideways, and without these numbers a small yield is indistinguishable from a broken read.
    const s = plan.skipped;
    console.log(
      `${TAG} — citations not seeded: ${s.sameTier} same-tier (the curation tail), ${s.upTier} up-tier, ` +
        `${s.targetOutsideDag} target outside the DAG, ${s.targetAbsent} target absent from the corpus, ` +
        `${s.malformed} malformed pointer(s).`,
    );
    console.log(
      `${TAG} — artifacts already carrying edges with nothing to add (untouched): ${s.alreadyAuthored}.`,
    );

    if (!write) {
      console.log(
        `\n${TAG} — DRY RUN, nothing written. Re-run with --write to apply.\n` +
          `The acyclicity of this plan is proven by construction, not by this run: every seeded edge ` +
          `strictly descends the tier order (packages/library/src/standson-bootstrap.test.ts).`,
      );
      return;
    }

    let applied = 0;
    let missing = 0;
    const failures: { id: string; reason: string }[] = [];

    for (const edge of plan.edges) {
      try {
        const saved = await corpus.store.patchDoc({
          id: edge.id,
          fields: { dependsOn: [...edge.dependsOn] },
          actor: `${TAG} (ADR-0223 dec 5, ADR-0373)`,
          validate: (merged) => upcastAndValidate(merged),
        });
        // `null` means the row vanished between the bulk read and this write — a sibling deleted or
        // retired it. That is a legitimate outcome of a live corpus, not a failure of the migration.
        if (saved === null) missing += 1;
        else applied += 1;
      } catch (err) {
        failures.push({ id: edge.id, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log(`\n${TAG} — applied ${applied} of ${plan.edges.length} artifacts.`);
    if (missing > 0) console.log(`${TAG} — ${missing} artifact(s) no longer exist; skipped.`);
    if (failures.length > 0) {
      console.error(`${TAG} — ${failures.length} artifact(s) REFUSED the write:`);
      for (const f of failures) console.error(`  ${f.id}: ${f.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `${TAG} — done. Verify with: pnpm check:library-dag-acyclic ` +
        `(it must now report a non-zero authored-edge count).`,
    );
  } finally {
    await corpus.close();
  }
}

main().catch((err: unknown) => {
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
