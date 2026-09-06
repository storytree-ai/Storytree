/**
 * Take the {@link file://./verdict-contradiction.ts} reading against the live store and this
 * checkout's git history, and write it to `docs/research/`.
 *
 * `pnpm verdict-contradiction` — `verdict-accuracy-arc` increment 2.
 *
 * NOT a gate rung and not a threshold: a by-hand reading, run when someone wants the number. It
 * needs the live store up (`pnpm db:up`) because `events.verdict` is the population, and it needs
 * this checkout's `stories/**` because a unit's declared proof pair is only meaningful against the
 * tree it describes.
 *
 * The two-source shape is the same one `leaf-test-strength.run.ts` carries and is deliberate: the
 * store answers WHICH units were proved and WHEN, the checkout answers WHICH FILES that proof was
 * scoped to, and git answers WHAT HAPPENED AFTERWARDS. No single source holds all three.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePool, createPool } from "@storytree/library/store";
import { findNodeSpecFile, loadNodeSpec, resolveBuildConfig } from "@storytree/orchestrator";

import {
  type SpecLookup,
  type StoredVerdict,
  lookupFromResolved,
  resolvePopulation,
} from "./leaf-test-strength.js";
import { type UnitCommit, ladder, renderReport } from "./verdict-contradiction.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(repoRoot, "docs", "research");

/**
 * git's unit separator (US, 0x1f) — a byte that cannot occur in a commit subject, so the
 * `--format` fields are unambiguous however the subject is punctuated.
 *
 * Built from its char code rather than written as an escape or a literal: a raw control byte in
 * source survives no round-trip through the editing tools reliably, and every escape spelling of it
 * is one backslash away from silently becoming the four-character string "001f" — which would still
 * parse most of the time and fail only on the commit that happens to contain it.
 */
const SEP = String.fromCharCode(31);

/** Run git, returning null rather than throwing — a git miss is a THIRD state, never a false. */
function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], {
      cwd: repoRoot,
      encoding: "utf8",
      // stderr DISCARDED: `cat-file -e` on a commit that never landed is an EXPECTED miss (the
      // proof ran on a branch since squashed away), and letting git print `fatal: Not a valid
      // object name` per unit would bury the report in noise about a state it already counts.
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** Whether a git command succeeds — for the predicate forms (`cat-file -e`, `merge-base --is-ancestor`). */
function gitOk(args: readonly string[]): boolean {
  try {
    execFileSync("git", [...args], { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Read every stored verdict, reduced to the fields population resolution needs. */
async function readVerdicts(): Promise<StoredVerdict[]> {
  const handle = await createPool();
  try {
    const { rows } = await handle.pool.query<{
      seq: string;
      unit_id: string;
      run_id: string;
      proof_mode: string;
      outcome: string;
      commit_sha: string;
      at: string;
      bound_hash: string | null;
      evidence_kinds: string[] | null;
    }>(
      `SELECT seq, unit_id, run_id, proof_mode, outcome, commit_sha, at::text AS at,
              doc->>'boundHash' AS bound_hash,
              COALESCE(
                (SELECT array_agg(e->>'kind' ORDER BY ord)
                   FROM jsonb_array_elements(doc->'evidence') WITH ORDINALITY AS t(e, ord)),
                ARRAY[]::text[]
              ) AS evidence_kinds
         FROM events.verdict
        ORDER BY seq`,
    );
    return rows.map((r) => ({
      seq: Number(r.seq),
      unitId: r.unit_id,
      runId: r.run_id,
      proofMode: r.proof_mode,
      outcome: r.outcome,
      commitSha: r.commit_sha,
      at: r.at,
      boundHash: r.bound_hash ?? undefined,
      evidenceKinds: r.evidence_kinds ?? [],
    }));
  } finally {
    await closePool(handle.pool, handle.connector);
  }
}

/** The disk half of the spec lookup, memoised per unit id — the same route `leaf-test-strength` takes. */
function diskLookup(storiesDir: string): (unitId: string) => SpecLookup {
  const cache = new Map<string, SpecLookup>();
  return (unitId: string): SpecLookup => {
    const hit = cache.get(unitId);
    if (hit !== undefined) return hit;
    let answer: SpecLookup;
    const file = findNodeSpecFile(storiesDir, unitId);
    if (file === null) {
      answer = lookupFromResolved(unitId, null, false);
    } else {
      try {
        const resolved = resolveBuildConfig(loadNodeSpec(file));
        answer = lookupFromResolved(unitId, resolved === null ? null : resolved.config, true);
      } catch {
        // A THROWN SPEC IS `no-proof-config`, NOT A CRASH — one unparseable spec must not take
        // down a census of 665 rows.
        answer = lookupFromResolved(unitId, null, true);
      }
    }
    cache.set(unitId, answer);
    return answer;
  };
}

/**
 * Every commit after `from` that touched either half of the declared proof pair.
 *
 * `--no-merges` because a merge commit touching the pair is the branch's own work arriving, already
 * counted as the individual commits underneath it.
 *
 * Followed by PATH, deliberately without `--follow`: git can only follow one path at a time, and a
 * two-path walk that silently followed one of them would report a pair the spec never declared. A
 * renamed file therefore reads as an absent one, which the report names as a limit.
 */
function laterCommits(from: string, sourceFile: string, testFile: string): UnitCommit[] {
  const out = git([
    "log",
    "--no-merges",
    `--format=C${SEP}%H${SEP}%s`,
    "--numstat",
    `${from}..HEAD`,
    "--",
    sourceFile,
    testFile,
  ]);
  if (out === null) return [];

  const commits: UnitCommit[] = [];
  let sha = "";
  let subject = "";
  let touchedSource = false;
  let touchedTest = false;
  let testLinesAdded = 0;
  let open = false;

  const flush = (): void => {
    if (!open) return;
    commits.push({
      sha,
      subject,
      touchedSource,
      touchedTest,
      testLinesAdded,
      unitId: "",
      sourceFile,
      testFile,
      provedAt: from,
    });
  };

  for (const line of out.split("\n")) {
    if (line.startsWith(`C${SEP}`)) {
      flush();
      const parts = line.split(SEP);
      sha = parts[1] ?? "";
      subject = parts[2] ?? "";
      touchedSource = false;
      touchedTest = false;
      testLinesAdded = 0;
      open = true;
      continue;
    }
    if (!open) continue;
    const cols = line.split("\t");
    if (cols.length !== 3) continue;
    const file = cols[2];
    if (file === sourceFile) touchedSource = true;
    if (file === testFile) {
      touchedTest = true;
      // A binary file reports "-" for its counts; Number("-") is NaN, which must not poison the sum.
      const added = Number(cols[0]);
      if (Number.isFinite(added)) testLinesAdded += added;
    }
  }
  flush();
  return commits;
}

const verdicts = await readVerdicts();
const population = resolvePopulation(verdicts, diskLookup(path.join(repoRoot, "stories")));

/**
 * The EARLIEST verdict per unit, not the latest. A unit re-proved after an edit would otherwise
 * report no later history precisely because it was edited — the walk has to start at the first
 * green, which is the one whose claim later history could contradict.
 */
const firstProof = new Map<string, { sha: string; at: string }>();
for (const r of population.resolutions) {
  if (r.kind !== "included") continue;
  const seen = firstProof.get(r.pair.unitId);
  if (seen === undefined || r.verdict.at < seen.at) {
    firstProof.set(r.pair.unitId, { sha: r.verdict.commitSha, at: r.verdict.at });
  }
}

const commits: UnitCommit[] = [];
let unitsWalked = 0;
let unitsProofCommitMissing = 0;
let unitsProofNotAncestor = 0;

for (const pair of population.pairs) {
  const proof = firstProof.get(pair.unitId);
  if (proof === undefined) continue;
  if (!gitOk(["cat-file", "-e", `${proof.sha}^{commit}`])) {
    unitsProofCommitMissing += 1;
    continue;
  }
  if (!gitOk(["merge-base", "--is-ancestor", proof.sha, "HEAD"])) unitsProofNotAncestor += 1;
  unitsWalked += 1;
  for (const c of laterCommits(proof.sha, pair.sourceFile, pair.testFile)) {
    commits.push({ ...c, unitId: pair.unitId });
  }
}

const reading = ladder(commits, unitsWalked);
const takenOn = new Date().toISOString().slice(0, 10);
const markdown = renderReport(reading, {
  verdictsSeen: population.verdictsSeen,
  verdictsWithBoundHash: population.verdictsWithBoundHash,
  verdictsResolved: population.verdictsIncluded,
  unitsResolved: population.pairs.length,
  unitsProofCommitMissing,
  takenOn,
});

mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `verdict-contradiction-${takenOn}.md`);

/*
 * REFUSE TO CLOBBER, because the thing at risk is the only part of this document a machine did not
 * write. The increment's whole instruction is "hand-read the shortlist", so the dated file is
 * expected to carry an authored section no re-run can reproduce — and a silent overwrite would
 * destroy exactly the analysis the reading exists for, while reporting success. `--force` is the
 * deliberate escape for re-taking a reading nobody has annotated yet.
 */
const force = process.argv.includes("--force");
if (existsSync(outFile) && !force) {
  printSummary();
  console.error("");
  console.error(`REFUSED to write ${path.relative(repoRoot, outFile)} - it already exists.`);
  console.error("That file may carry a hand-read section this run cannot reproduce. Move it aside,");
  console.error("or re-run with --force if it is an un-annotated generated reading.");
  process.exit(2);
}

writeFileSync(outFile, markdown, "utf8");
printSummary();
console.log(`
wrote ${path.relative(repoRoot, outFile)}`);

/** The reading, printed whether or not the document was written. Hoisted, so the refusal can use it. */
function printSummary(): void {
  const dot = String.fromCharCode(183);
  console.log(
    `verdicts ${population.verdictsSeen} ${dot} boundHash ${population.verdictsWithBoundHash} ${dot} resolved ${population.verdictsIncluded} over ${population.pairs.length} units`,
  );
  console.log(
    `units walked ${unitsWalked} ${dot} proof commit missing ${unitsProofCommitMissing} ${dot} proof commit not an ancestor of HEAD ${unitsProofNotAncestor}`,
  );
  for (const r of reading.rungs) {
    console.log(
      `  ${r.key.padEnd(28)} ${String(r.commits.length).padStart(4)} rows ${dot} ${String(r.distinctCommits).padStart(4)} commits ${dot} ${String(r.units).padStart(3)} units`,
    );
  }
  console.log(`re-proof commits set aside: ${reading.reProofs.length}`);
}
