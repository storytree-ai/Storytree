/**
 * The RUNNER for the leaf-test-strength reading (`verdict-accuracy-arc` increment 1) — the impure
 * half of {@link file://./leaf-test-strength.ts}, which holds every decision this file makes.
 *
 * NOT A GATE RUNG. It is invoked by hand (`pnpm leaf-test-strength …`), prints a report, writes a
 * JSON artifact, and exits 0 on any complete run whatever the score says. The arc it serves BANKS A
 * READING and adjudicates nothing, so there is deliberately no threshold, no non-zero exit on a low
 * score, and nothing here for a CI job to call.
 *
 * IT IS ALSO A DECLARED ENTRY POINT, and that is load-bearing rather than cosmetic. This file
 * self-executes, and `check:mutation-diff` LOADS every file in its mutate set during test discovery
 * — so a self-executing module inside the aperture aborts the whole rung with `No tests were found`,
 * naming nothing. The exemption is DERIVED from a root `package.json` script invoking this path
 * (`entryPointsFromScripts`), never declared, so the script in `package.json` is what keeps the rung
 * alive and must not be removed while this file self-executes.
 *
 * Two modes:
 *   --population           resolve and report the population only. Needs the live store, no Stryker.
 *   --score [--limit N]    additionally mutate each pair. Minutes per pair; see the doc it feeds.
 *   --score --units a,b    re-score only these units, MERGING into whatever is already banked.
 *   --markdown             re-render the banked artifact as the research doc's table. Offline.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closePool, createPool } from "@storytree/library/store";
import { findNodeSpecFile, loadNodeSpec, resolveBuildConfig } from "@storytree/orchestrator";

import { runnerFor } from "./mutation-diff.js";
import {
  coveredScorePair,
  lookupFromResolved,
  mergeFailed,
  mergeScored,
  pct,
  reach,
  renderPopulation,
  renderReadingMarkdown,
  resolvePopulation,
  scorePair,
  selectUnits,
  statusesFromReport,
  strykerConfigBody,
  tallyMutants,
  vitestConfigBody,
  type ExclusionReason,
  type LeafPair,
  type MutationReportShape,
  type PairScore,
  type RunnerChoice,
  type SpecLookup,
  type StoredVerdict,
} from "./leaf-test-strength.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const OUT_DIR = path.join(repoRoot, "reports");
const CONFIG_FILE = "stryker.leaf-strength.conf.mjs";
const REPORT_FILE = "reports/leaf-strength-pair.json";
const VITEST_CONFIG_FILE = "vitest.leaf-strength.config.ts";

/** The committed shape of the JSON artifact this runner writes beside the research doc. */
interface ReadingArtifact {
  readonly takenAt: string;
  readonly head: string;
  readonly population: {
    readonly verdictsSeen: number;
    readonly verdictsWithBoundHash: number;
    readonly verdictsIncluded: number;
    readonly excluded: Readonly<Record<ExclusionReason, number>>;
    readonly units: number;
    readonly proofsPerUnit: Readonly<Record<string, number>>;
  };
  readonly pairs: readonly (LeafPair & { readonly testChangedSinceProof: boolean | undefined })[];
  scored: readonly PairScore[];
  failed: readonly { readonly unitId: string; readonly error: string }[];
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

/**
 * The disk half of the spec lookup, memoised per unit id.
 *
 * A THROWN SPEC IS `no-proof-config`, NOT A CRASH. `loadNodeSpec` throws loud on a malformed
 * `proof:` block, which is right for a build and wrong for a census: one unparseable spec would
 * take down a reading over the other two hundred. It lands in a named bucket instead.
 */
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
        answer = lookupFromResolved(unitId, null, true);
      }
    }
    cache.set(unitId, answer);
    return answer;
  };
}

/** Run git, returning null rather than throwing — a git miss is a third state, never a false. */
function git(args: readonly string[]): string | null {
  try {
    // stderr is DISCARDED, not inherited: `cat-file -e` on a commit that never landed is an
    // EXPECTED miss here (the proof ran on a branch that was squashed away), and letting git print
    // `fatal: Not a valid object name` for each one buries the report in noise about a third state
    // the reader is already being shown as a count.
    return execFileSync("git", [...args], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Has `file` been touched since `sinceSha`? `undefined` when git cannot answer — an unknown commit
 * (the proof ran on a branch that never landed), an unborn path, no git at all. Never folded into
 * "unchanged": the whole point of the field is that a reader can see which pairs are still the
 * bytes the leaf wrote and which have moved on.
 */
function changedSince(file: string, sinceSha: string): boolean | undefined {
  if (git(["cat-file", "-e", `${sinceSha}^{commit}`]) === null) return undefined;
  const out = git(["diff", "--name-only", `${sinceSha}..HEAD`, "--", file]);
  if (out === null) return undefined;
  return out.length > 0;
}

/**
 * The workspace project a repo-relative path belongs to — its first two segments, when that
 * directory carries a `package.json`. `null` for anything outside `packages/*` / `apps/*`.
 */
function projectDirOf(rel: string): string | null {
  const parts = rel.split("/");
  if (parts.length < 3) return null;
  const dir = `${parts[0]}/${parts[1]}`;
  return existsSync(path.join(repoRoot, dir, "package.json")) ? dir : null;
}

/** The `test` script a project declares, which is what {@link runnerFor} reads. */
function testScriptOf(dir: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, dir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts?.["test"];
  } catch {
    return undefined;
  }
}

/**
 * Which Stryker runner can execute this pair's test file, decided by the project's OWN `test`
 * script through the rung's own {@link runnerFor} — never re-derived here. A project whose script
 * is neither `bun test` nor `vitest run` is not one Stryker can drive, and says so.
 */
function runnerChoiceFor(pair: LeafPair): RunnerChoice | { error: string } {
  const dir = projectDirOf(pair.testFile);
  if (dir === null) return { error: `test file is in no workspace project: ${pair.testFile}` };
  const runner = runnerFor(testScriptOf(dir));
  if (runner === null) {
    return { error: `${dir} declares a test script Stryker cannot drive: ${testScriptOf(dir) ?? "(none)"}` };
  }
  if (runner === "bun") return { kind: "bun" };
  const configRel = `${dir}/${VITEST_CONFIG_FILE}`;
  writeFileSync(
    path.join(repoRoot, configRel),
    vitestConfigBody(pair.testFile.slice(`${dir}/`.length)),
    "utf8",
  );
  return { kind: "vitest", configFile: configRel };
}

/** Score ONE pair by mutating its source file with only its test file running. */
function scoreOne(pair: LeafPair, concurrency: number): { tally: ReturnType<typeof tallyMutants> } | { error: string } {
  const abs = (rel: string): string => path.join(repoRoot, rel);
  if (!existsSync(abs(pair.sourceFile))) return { error: `source file is gone: ${pair.sourceFile}` };
  if (!existsSync(abs(pair.testFile))) return { error: `test file is gone: ${pair.testFile}` };

  const runner = runnerChoiceFor(pair);
  if ("error" in runner) return runner;

  const configPath = path.join(repoRoot, CONFIG_FILE);
  const reportPath = path.join(repoRoot, REPORT_FILE);
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(reportPath, { force: true });
  writeFileSync(configPath, strykerConfigBody(pair, REPORT_FILE, concurrency, runner), "utf8");

  const run = spawnSync("npx", ["stryker", "run", CONFIG_FILE], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(reportPath)) {
    // STRYKER'S OWN DIAGNOSIS IS IN THE FIRST ERROR LINE IT LOGS, NOT THE LAST. The tail is a node
    // stack trace naming only Stryker's own dist files, so a tail-only capture reported "no report"
    // for four pairs whose real cause ("No tests were found") had been printed and then buried
    // sixty lines above it. ANSI codes are stripped first: every one of those lines is coloured,
    // and a pattern that does not account for that matches the useful line and returns it wrapped
    // in escape sequences, or misses it entirely.
    const plain = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.replace(/\[[0-9;]*m/g, "");
    const named = plain
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /No tests were (found|executed)|ERROR |ConfigError|Error:/.test(l));
    const tail = plain.trim().split("\n").slice(-3).join(" | ");
    const why = (named ?? tail).trim().slice(0, 240);
    return { error: `stryker produced no report (exit ${String(run.status)}): ${why}` };
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as MutationReportShape;
  return { tally: tallyMutants(statusesFromReport(report)) };
}

/** `--units a,b,c` (repeatable, comma-separated) — the unit ids to score, empty meaning all. */
function parseUnits(argv: readonly string[]): string[] {
  const out: string[] = [];
  argv.forEach((arg, i) => {
    if (arg !== "--units") return;
    for (const part of (argv[i + 1] ?? "").split(",")) {
      const id = part.trim();
      if (id !== "") out.push(id);
    }
  });
  return out;
}

/** Whatever a previous run banked, or an empty reading. Never throws over a missing/odd file. */
function readBanked(): { scored: readonly PairScore[]; failed: readonly { unitId: string; error: string }[] } {
  try {
    const banked = JSON.parse(
      readFileSync(path.join(OUT_DIR, "leaf-test-strength.json"), "utf8"),
    ) as Partial<ReadingArtifact>;
    return { scored: banked.scored ?? [], failed: [...(banked.failed ?? [])] };
  } catch {
    return { scored: [], failed: [] };
  }
}

function parseLimit(argv: readonly string[]): number {
  const i = argv.indexOf("--limit");
  if (i < 0) return Number.POSITIVE_INFINITY;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/**
 * `--markdown`: re-render the BANKED artifact as the research doc's table. It reads
 * `reports/leaf-test-strength.json` and touches neither the store nor Stryker, so the doc's numbers
 * stay re-derivable from the reading rather than transcribed by hand.
 */
function renderBankedArtifact(): number {
  const file = path.join(OUT_DIR, "leaf-test-strength.json");
  if (!existsSync(file)) {
    process.stderr.write(`no reading banked yet — run \`pnpm leaf-test-strength --score\` first
`);
    return 1;
  }
  const banked = JSON.parse(readFileSync(file, "utf8")) as ReadingArtifact;
  process.stdout.write(
    `${renderReadingMarkdown(banked.scored, banked.population.units, banked.failed)}
`,
  );
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("--markdown")) return renderBankedArtifact();
  const wantScore = argv.includes("--score");
  const storiesDir = path.join(repoRoot, "stories");

  const banked = readBanked();
  const verdicts = await readVerdicts();
  const population = resolvePopulation(verdicts, diskLookup(storiesDir));
  process.stdout.write(`\n${renderPopulation(population)}\n\n`);

  const withStatus = population.pairs.map((pair) => {
    // The EARLIEST verdict for this unit is the one that admitted it, so staleness is measured from
    // the first proof rather than the latest — a unit re-proved after an edit would otherwise report
    // itself fresh precisely because it was edited and re-proved.
    const first = population.resolutions.find((r) => r.kind === "included" && r.pair.unitId === pair.unitId);
    const sha = first !== undefined && first.kind === "included" ? first.verdict.commitSha : "";
    return { pair, testChangedSinceProof: sha === "" ? undefined : changedSince(pair.testFile, sha) };
  });

  const onDisk = withStatus.filter((p) => existsSync(path.join(repoRoot, p.pair.sourceFile)) && existsSync(path.join(repoRoot, p.pair.testFile)));
  process.stdout.write(
    `pairs whose files still exist:   ${onDisk.length} of ${population.pairs.length}\n` +
      `  test file touched since proof: ${withStatus.filter((p) => p.testChangedSinceProof === true).length}\n` +
      `  test file unchanged:           ${withStatus.filter((p) => p.testChangedSinceProof === false).length}\n` +
      `  staleness unknowable:          ${withStatus.filter((p) => p.testChangedSinceProof === undefined).length}\n\n`,
  );

  const artifact: ReadingArtifact = {
    takenAt: new Date().toISOString(),
    head: git(["rev-parse", "HEAD"]) ?? "unknown",
    population: {
      verdictsSeen: population.verdictsSeen,
      verdictsWithBoundHash: population.verdictsWithBoundHash,
      verdictsIncluded: population.verdictsIncluded,
      excluded: population.excluded,
      units: population.pairs.length,
      proofsPerUnit: population.proofsPerUnit,
    },
    pairs: withStatus.map((p) => ({ ...p.pair, testChangedSinceProof: p.testChangedSinceProof })),
    // SEEDED FROM WHAT IS ALREADY BANKED, not from empty. `--population` re-writes this file, and a
    // `--population` after a completed `--score` must not silently delete the reading it cost hours
    // to take; a subset `--score` merges onto these below.
    scored: banked.scored,
    failed: banked.failed,
  };

  if (!wantScore) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, "leaf-test-strength.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    process.stdout.write(`population written to reports/leaf-test-strength.json (no mutants run)\n`);
    return 0;
  }

  const wanted = parseUnits(argv);
  const chosen = selectUnits(onDisk.map((p) => p.pair), wanted);
  if (chosen.unmatched.length > 0) {
    // A typo'd unit id that silently selected nothing would read exactly like a unit that scored
    // nothing. Refuse instead of running a population the caller did not mean.
    process.stderr.write(`--units named ${chosen.unmatched.length} id(s) not in the population: ${chosen.unmatched.join(", ")}
`);
    return 1;
  }
  const chosenIds = new Set(chosen.selected.map((p) => p.unitId));
  const limit = parseLimit(argv);
  const eligible = onDisk.filter((p) => chosenIds.has(p.pair.unitId));
  const targets = eligible.slice(0, limit === Number.POSITIVE_INFINITY ? eligible.length : limit);
  const scored: PairScore[] = [];
  const failed: { unitId: string; error: string }[] = [];
  let index = 0;
  for (const t of targets) {
    index += 1;
    process.stdout.write(`[${index}/${targets.length}] ${t.pair.unitId} — mutating ${t.pair.sourceFile}\n`);
    const started = Date.now();
    const outcome = scoreOne(t.pair, 4);
    const seconds = Math.round((Date.now() - started) / 1000);
    if ("error" in outcome) {
      failed.push({ unitId: t.pair.unitId, error: outcome.error });
      process.stdout.write(`      SKIPPED after ${seconds}s — ${outcome.error}\n`);
    } else {
      const { score, denominator } = scorePair(outcome.tally);
      scored.push({
        pair: t.pair,
        tally: outcome.tally,
        score,
        denominator,
        testChangedSinceProof: t.testChangedSinceProof,
      });
      process.stdout.write(
        `      ${pct(score)} of ${denominator} mutant(s) killed in ${seconds}s ` +
          `[covered ${pct(coveredScorePair(outcome.tally).score)}, reach ${pct(reach(outcome.tally))}] ` +
          `(k${outcome.tally.killed} s${outcome.tally.survived} t${outcome.tally.timeout} ` +
          `n${outcome.tally.noCoverage} x${outcome.tally.excluded})\n`,
      );
    }
    // AFTER EVERY PAIR, INCLUDING A FAILED ONE. Writing only after a success meant a run in which
    // every pair failed recorded NOTHING — so a re-run of exactly the failures, which is the run
    // most likely to fail throughout, could not update the reasons it was launched to improve.
    // MERGE, never replace: a subset re-run must not discard the hours the rest already cost.
    artifact.scored = mergeScored(banked.scored, scored);
    artifact.failed = mergeFailed(banked.failed, failed, new Set(scored.map((s) => s.pair.unitId)));
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, "leaf-test-strength.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }

  // ONE renderer for the finished reading, shared with `--markdown`, so the summary a run prints
  // and the table the research doc carries can never disagree.
  process.stdout.write(
    `
${renderReadingMarkdown(artifact.scored, population.pairs.length, artifact.failed)}
`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`[leaf-test-strength] ${(e as Error).message}\n`);
    process.exit(1);
  },
);
