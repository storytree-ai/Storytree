/**
 * `pnpm probe:combined-dag` — ADR-0403 dec 5's PRECONDITION: is the graph the depth walk is about
 * to be built on, decisions and Library together, acyclic?
 *
 * `adrs-into-the-dag-arc` increment 08.
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG, and deliberately so** — the `probe:adr-graph` /
 * `probe:depth-from-work` precedent exactly. The increment's fence says this MEASURES: it does not
 * build the walk, does not change ADR-0223 D4, writes nothing to the corpus, and no gate depends on
 * its result. A `check:` name would also be picked up by the gate plan's unplanned-check guard,
 * which is the concrete reason the verb is `probe:`.
 *
 * ## WHAT IT ADDS OVER THE TWO JUDGES THAT ALREADY RUN
 *
 * `check:library-dag-acyclic` proves the Library half and treats every decision as a sink.
 * `pnpm probe:adr-graph` proved the decision half on all three of its own readings and never looked
 * at the Library. **Neither has ever looked at the union**, and the union is what a walk that
 * continues past a decision actually traverses. ADR-0223 D4's guarantee was STRUCTURAL — nothing
 * walked past a decision, so nothing could loop — and ADR-0403 dec 4 retires it, so the guarantee
 * has to be re-earned as a proof over the joined graph.
 *
 * ## THE UNION IS THE CYCLE READING AND NEVER A DEPTH READING
 *
 * `amends` and `supersedes` are summed HERE, and only here, and only to answer "is there a loop?" —
 * a loop is a loop whichever edge closes it. They are never summed for DEPTH: `amends` means "still
 * standing, and rests on this" (distance from the work) while `supersedes` means "this replaced
 * that" (archaeology, chain length 2). This probe therefore prints no depth at all, and the judge it
 * calls carries no field that could be quoted as one (ADR-0403 dec 6).
 *
 * ## IT RUNS TODAY, AGAINST FILES
 *
 * Decisions are still on disk and the migration is sequenced after this arc (ADR-0403 dec 3), so the
 * decision half is read with `loadAdrMetas` and the Library half from the live store. The judge takes
 * both as plain rows and knows nothing about either source, which is the seam that lets the
 * store-backed resolver replace the file-backed one later without touching the proof.
 *
 * Exit 0 when the combined graph is proved acyclic; 1 when a cycle is found, when the read was
 * VACUOUS (a third outcome distinct from both — ADR-0402 D7's shape), or when either half could not
 * be read. A cycle is a FINDING, not a repair instruction: nothing here edits the decision log to
 * make a walk succeed.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdrMetas, openCorpusStore } from "@storytree/drive";
import {
  combinedReadVacuity,
  evaluateCombinedAcyclicity,
  REPO_ROOT_ENV,
  resolveRepoRoot,
  VACUOUS_COMBINED_READ_FLOOR,
} from "@storytree/library";

const TAG = "probe:combined-dag";

/** The repo root — a PARAMETER (ADR-0246), not a derivation from this file's own location. */
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
}).root;

const DECISIONS_DIR = path.join(repoRoot, "docs", "decisions");

/** Cap a listing so one malformed field cannot bury the probe in its own output. */
function capped(lines: readonly string[], limit = 8): string[] {
  if (lines.length <= limit) return [...lines];
  return [...lines.slice(0, limit), `… and ${lines.length - limit} more`];
}

async function main(): Promise<void> {
  const { adrs, parseErrors } = loadAdrMetas(DECISIONS_DIR);
  if (parseErrors.length > 0) {
    // Fail-closed: a proof over a decision log that did not fully parse is a proof over an unknown
    // population, and a clean verdict there would be a claim about a graph nobody read.
    console.error(`${TAG} — ${parseErrors.length} decision file(s) failed to parse:`);
    for (const line of parseErrors) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  const corpus = await openCorpusStore(TAG);
  try {
    // ONE bulk read for a whole-corpus question — the shape ADR-0345 measured as ~10x cheaper than
    // repeated `getDoc`s, and the same read `check:library-dag-acyclic` makes.
    const docs = await corpus.store.queryDocs();
    const verdict = evaluateCombinedAcyclicity(docs, adrs);

    console.log(
      `${TAG} — ${verdict.artifactsScanned} Library artifacts and ${verdict.decisionsScanned} ` +
        `decisions, judged as ONE graph.`,
    );
    console.log("");
    console.log(`  THE TWO HALVES`);
    console.log(
      `    library: ${verdict.libraryEdges} \`asset:\` edges resolving ` +
        `(${verdict.libraryDanglingEdges} dangling)`,
    );
    console.log(
      `    decisions: ${verdict.decisionAmendsEdges} \`amends\` + ${verdict.decisionSupersedesEdges} ` +
        `\`supersedes\` edges resolving (${verdict.decisionDanglingEdges} dangling) — ` +
        `two numbers with two names, walked together ONLY for the cycle question`,
    );
    console.log("");
    console.log(`  THE JOIN — the ~390 pointers nothing has ever walked`);
    console.log(
      `    ${verdict.crossingEdges} \`doc:\` pointer(s) resolve onto a decision ` +
        `(${verdict.crossingDanglingEdges} name a decision that is not on disk; ` +
        `${verdict.nonDecisionDocPointers} \`doc:\` pointer(s) name some other file)`,
    );
    console.log(
      `    pointer spelling (both live, both walked — ADR-0403 dec 7): ${
        verdict.crossingBySpelling.size === 0
          ? "(none)"
          : [...verdict.crossingBySpelling.entries()]
              .sort((left, right) => right[1] - left[1])
              .map(([spelling, count]) => `${count} \`doc:${spelling}/…\``)
              .join(", ")
      }`,
    );
    console.log(
      `    edges OUT of the decision log and back into the Library: ${verdict.decisionToLibraryEdges}`,
    );
    if (verdict.decisionToLibraryEdges === 0) {
      // The structural fact that decides the whole question, reported as a MEASUREMENT rather than
      // asserted in prose — because ADR-0403 dec 1 is precisely the change that makes it able to rise.
      console.log(
        `      → so the join runs ONE WAY today, and that is WHY the union cannot loop: with no path` +
          ` back, the combined graph is acyclic whenever its two halves are. This number is the one` +
          ` to watch — once decisions are ordinary artifacts with an ordinary \`dependsOn\`` +
          ` (ADR-0403 dec 1), a crossing cycle becomes possible and this proof gains teeth.`,
      );
    } else {
      console.log(
        `      → the join now runs BOTH ways, so a crossing cycle is possible and this proof is` +
          ` load-bearing rather than structural. Re-run it on every change to the edge.`,
      );
    }

    if (verdict.duplicateArtifactIds.length > 0) {
      console.log(`    ⚠ duplicate artifact ids (first row wins): ${capped(verdict.duplicateArtifactIds).join(", ")}`);
    }
    if (verdict.duplicateDecisionNumbers.length > 0) {
      console.log(
        `    ⚠ duplicate decision numbers (first row wins): ${verdict.duplicateDecisionNumbers.join(", ")}`,
      );
    }
    if (verdict.collidingIds.length > 0) {
      // A silent merge of a decision with an artifact is the same class of failure as the pointer
      // spelling bug: no error, a plausible graph, a wrong answer. Refuse rather than report.
      console.error("");
      console.error(
        `${TAG} FAIL — ${verdict.collidingIds.length} artifact id(s) occupy the decision namespace, ` +
          `so a decision and an artifact would MERGE into one node: ${capped(verdict.collidingIds).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }

    const vacuity = combinedReadVacuity(verdict);
    if (vacuity.length > 0) {
      // UNVERIFIED — never PASS and never FAIL. There is no cycle to name and no repair to
      // prescribe; the remedy is aimed at the READER. `check:library-dag-acyclic` shipped a green
      // from an instrument that could see none of its subject, and this is that lesson applied to a
      // proof whose subject is the JOIN rather than either half.
      console.error("");
      console.error(`${TAG} UNVERIFIED — this run proved NOTHING about the combined graph:`);
      for (const reason of vacuity) console.error(`  · ${reason}`);
      console.error("");
      console.error(
        `A corpus of ${VACUOUS_COMBINED_READ_FLOOR}+ artifacts missing one of the three is a blind ` +
          `read, not a clean graph. Check that the pointer spellings still resolve ` +
          `(packages/library/src/decision-pointer.ts) and that the stored rows carry the edge under ` +
          `a key the reader accepts (ADR-0402 migration #7 runs at the WRITE boundary only).`,
      );
      process.exitCode = 1;
      return;
    }

    if (verdict.acyclic) {
      console.log("");
      console.log(
        `${TAG} ACYCLIC — no directed cycle across the combined graph. ADR-0223 D4's structural ` +
          `no-loop guarantee is discharged BY PROOF over the graph that will actually be walked ` +
          `(ADR-0403 dec 5), so \`adrs-into-the-dag-arc-inc-09\` may build the walk.`,
      );
      return;
    }

    // The CONCRETE closed paths, never a count — a cycle is repaired by dropping one authored edge,
    // and the operator cannot choose which without seeing the ring.
    console.error("");
    console.error(
      `${TAG} CYCLE — ${verdict.cycles.length} directed cycle(s) in the combined graph. The cycle IS ` +
        `the finding: do NOT repair the decision log to make a walk succeed, and do not build the ` +
        `walk until it is resolved (how it is resolved is the owner's call).`,
    );
    for (const cycle of verdict.cycles) {
      console.error(`  ${cycle.crossesTheJoin ? "crosses the join" : "inside one half"}: ${cycle.line}`);
    }
    process.exitCode = 1;
  } finally {
    await corpus.close();
  }
}

main().catch((err: unknown) => {
  // Fail-closed, for `check:library-dag-acyclic`'s reason: an acyclicity claim made against a graph
  // nobody could read is not a passing one.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
