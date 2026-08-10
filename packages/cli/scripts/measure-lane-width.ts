/**
 * measure-lane-width — does the factory's work actually decompose into parallel lanes? (ADR-0340)
 *
 * ADR-0333 answered this from lanes the `planner` DECLARED, which ADR-0334 D2 showed is endogenous:
 * the declarations came from a brief that never asked for width, priced at the wrong vehicle. This
 * instrument reads LANDED FILE SETS instead — git facts, produced by no brief.
 *
 * TWO readings, because width hides in two places:
 *
 *   A. INTER-landing. Per arc, walk the landed units in landing order and simulate an in-order
 *      fan-out: open a wave, add the next unit while it stays file-disjoint from every unit already
 *      in the wave, close and re-open on the first conflict. The wave-width distribution is the
 *      width that arc's own landed work offered.
 *
 *   B. INTRA-landing. A landing that touched several independent stories in ONE pass was width a
 *      session collapsed into a serial run. Reading A scores that as width 1, so without B the
 *      paradigm case (#1214 — eleven stories in one PR) is invisible. B is also the confound-free
 *      half: work inside one PR was concurrently known by construction.
 *
 * THE CONSOLIDATION DISCRIMINATOR. A conflict on a shared REGISTRY (every lane appends a row) is
 * not a conflict on the arc's own SOURCE MODULE (the lanes are edits to one thing). Forgiving the
 * first is ADR-0334 D4(c)'s "fan the builds, sequence the landings"; forgiving the second
 * manufactures width. They are told apart by WHERE a file is hot:
 *   - hot FACTORY-WIDE (>=5% of all resolved PRs) -> registry; every arc passes through it.
 *   - hot only within ONE arc and is source        -> that arc's subject. Never forgiven.
 *   - hot only within one arc and is a RECORD      -> a ledger or decision doc. Forgiven.
 * A plain per-arc frequency rule cannot make that split — it strips
 * `packages/notice-board/src/claim.ts` from `noticeboard-claim-ledger-arc`, which is the arc's
 * whole subject.
 *
 * THE MARGINAL RANKING (added 2026-08-10). The owner directed that the registry surfaces be made
 * dispatch-safe before any dispatcher is built, which asks WHICH of them — two of the nine must not
 * be touched at all (`knowledge.json` is already deleted; `pnpm-lock.yaml` is a lockfile). So the
 * same simulation is re-run forgiving exactly ONE surface at a time, over a baseline that already
 * forgives what is gone, and each surface's contribution is measured rather than assumed.
 *
 * Read-only: opens the live store, reads git, writes one report file. Run:
 *   pnpm --filter @storytree/cli exec tsx scripts/measure-lane-width.ts <repoRoot> <out.json>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createPool, closePool } from "@storytree/library/store";
import {
  STRICT,
  attributeChurn,
  forgiveOnly,
  marginalRanking,
  measure as measureWidth,
  storyKeys,
  type ArcUnits,
  type ForgivePolicy,
  type Kind,
  type SurfaceEdit,
  type Unit,
} from "../src/lane-width.js";

const repoRoot = process.argv[2];
const attributeAt = process.argv.indexOf("--attribute");
const attributeFile = attributeAt > 0 ? process.argv[attributeAt + 1] : undefined;
const outFile = attributeFile ? undefined : process.argv[3];
if (!repoRoot || (!outFile && !attributeFile)) {
  console.error("usage: measure-lane-width.ts <repoRoot> <out.json>");
  console.error("       measure-lane-width.ts <repoRoot> --attribute <path> [construct ...]");
  process.exit(2);
}

const git = (...a: string[]): string =>
  execFileSync("git", ["-C", repoRoot, ...a], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });

// ------------------------------------------- 0. (opt-in) WITHIN-surface churn attribution
// Needs no store, so it runs before the pool opens. `marginalRanking` says which surfaces cost
// width; this says whether a given one is FIXABLE, which is the question ADR-0341 D4/D5 answered
// for `node-build.test.ts` and `commands.ts` by sampling hunks by hand.
if (attributeFile) {
  const fence = process.argv.slice(attributeAt + 2).filter((a) => !a.startsWith("--"));
  const hashes = git("log", "--no-merges", "--format=%H", "--", attributeFile)
    .trim()
    .split("\n")
    .filter(Boolean);
  const edits: SurfaceEdit[] = [];
  for (const hash of hashes) {
    let text: string;
    try {
      text = git("show", `${hash}:${attributeFile}`);
    } catch {
      continue; // the path did not exist under this name at this commit
    }
    const diff = git("show", hash, "--format=", "--unified=0", "--", attributeFile);
    const addedLines: number[] = [];
    let n = 0;
    for (const raw of diff.split("\n")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (hunk) {
        n = Number(hunk[1]);
        continue;
      }
      if (raw.startsWith("+++") || raw.startsWith("---")) continue;
      if (raw.startsWith("+")) {
        if (raw.slice(1).trim() !== "") addedLines.push(n);
        n++;
      }
    }
    edits.push({ hash, text, addedLines });
  }

  const churn = attributeChurn(edits, fence);
  const share = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`${attributeFile} — ${churn.edits} non-merge commits\n`);
  console.log(`${"construct".padEnd(44)} ${"commits".padStart(8)} ${"share".padStart(7)} ${"+lines".padStart(7)}`);
  for (const c of churn.constructs.slice(0, 25))
    console.log(
      `${c.construct.padEnd(44)} ${String(c.commits).padStart(8)} ${share(c.share).padStart(7)} ${String(c.lines).padStart(7)}`,
    );
  if (fence.length)
    console.log(
      `\nCONFINEMENT to [${fence.join(", ")}]: ${share(churn.confinedShare)} of commits touched nothing else.\n` +
        `That is a CEILING on what removing those constructs buys, never an achieved number: the wave\n` +
        `simulation counts whether two landings TOUCHED this file, never how many lines each added, so\n` +
        `shrinking an edit without removing the touch buys zero measured width (ADR-0341 D6).`,
    );
  process.exit(0);
}

// The attribution mode always exits above, so the report path from here on has its out file.
if (!outFile) {
  console.error("usage: measure-lane-width.ts <repoRoot> <out.json>");
  process.exit(2);
}

// ---------------------------------------------------------------- 1. the store
type Row = { id: string; doc: Record<string, unknown> };
const { pool, connector } = await createPool();
let increments: Row[];
try {
  const res = await pool.query<{ id: string; doc: Record<string, unknown> }>(
    `SELECT id, doc FROM events.library_artifact WHERE kind = 'increment' ORDER BY id`,
  );
  increments = res.rows;
} finally {
  await closePool(pool, connector);
}

// ---------------------------------------------------------------- 2. PR -> changed files
const prNumbers = (pr: unknown): number[] =>
  typeof pr === "string" ? [...pr.matchAll(/(\d{2,5})/g)].map((m) => Number(m[1])) : [];

const mergeOf = new Map<number, string[]>();
const squashOf = new Map<number, string>();
for (const line of git("log", "origin/main", "--format=%H|%P|%s").split("\n")) {
  if (!line.trim()) continue;
  const [sha, parentStr, ...rest] = line.split("|");
  const subject = rest.join("|");
  const parents = (parentStr ?? "").trim().split(/\s+/).filter(Boolean);
  const m = /^Merge pull request #(\d+) from /.exec(subject ?? "");
  if (m) {
    if (!mergeOf.has(Number(m[1]))) mergeOf.set(Number(m[1]), parents);
    continue;
  }
  const s = /\(#(\d+)\)\s*$/.exec(subject ?? "");
  if (s && !squashOf.has(Number(s[1]))) squashOf.set(Number(s[1]), sha!);
}

const prFiles = new Map<number, string[]>();
const unresolvedPrs: number[] = [];
const filesFor = (n: number): string[] | null => {
  if (prFiles.has(n)) return prFiles.get(n)!;
  const parents = mergeOf.get(n);
  let files: string[] | null = null;
  if (parents && parents.length >= 2) {
    // the branch's OWN work: from where it forked, to its tip — never main's meanwhile-commits
    const base = git("merge-base", parents[0]!, parents[1]!).trim();
    files = git("diff", "--name-only", base, parents[1]!).split("\n").map((f) => f.trim()).filter(Boolean);
  } else if (squashOf.has(n)) {
    files = git("show", "--name-only", "--format=", squashOf.get(n)!).split("\n").map((f) => f.trim()).filter(Boolean);
  }
  if (!files) {
    unresolvedPrs.push(n);
    return null;
  }
  prFiles.set(n, files);
  return files;
};

// ---------------------------------------------------------------- 3. units (one landing = one unit)
const byArc = new Map<string, Map<string, Unit>>();
const dropped = { nonNumericPr: 0, unresolvedPr: 0, emptyFileSet: 0 };

for (const row of increments) {
  const doc = row.doc as any;
  if (doc.status !== "closed" || !doc.outcome?.pr) continue;
  const arc = String(doc.arcRef).replace(/^asset:/, "");
  const ns = prNumbers(doc.outcome.pr);
  if (!ns.length) {
    dropped.nonNumericPr++;
    continue;
  }
  const ok = ns.filter((n) => filesFor(n) !== null);
  if (!ok.length) {
    dropped.unresolvedPr++;
    continue;
  }
  const files = new Set<string>(ok.flatMap((n) => filesFor(n)!));
  if (!files.size) {
    dropped.emptyFileSet++;
    continue;
  }
  // increments sharing a PR landed atomically — collapse, or they self-conflict on identical files
  const key = ok.slice().sort((a, b) => a - b).join(",");
  const m = byArc.get(arc) ?? new Map<string, Unit>();
  byArc.set(arc, m);
  const ex = m.get(key);
  if (ex) {
    ex.incs.push(row.id);
    if (String(doc.outcome.date) < ex.date) ex.date = String(doc.outcome.date);
  } else {
    m.set(key, { arc, incs: [row.id], date: String(doc.outcome.date), prs: ok, files });
  }
}
const arcNames = [...byArc.keys()].sort();
const ordered = (arc: string, since?: string): Unit[] =>
  [...byArc.get(arc)!.values()]
    .filter((u) => !since || u.date >= since)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Math.min(...a.prs) - Math.min(...b.prs)));

// ---------------------------------------------------------------- 4. derived surfaces
const globalFreq = new Map<string, number>();
for (const files of prFiles.values())
  for (const f of new Set(files)) globalFreq.set(f, (globalFreq.get(f) ?? 0) + 1);
const nPr = prFiles.size;
const REGISTRY = new Set([...globalFreq].filter(([, n]) => n / nPr >= 0.05).map(([f]) => f));

// ---------------------------------------------------------------- 5. instrument A
const arcsSince = (since?: string): ArcUnits[] =>
  arcNames.map((arc) => ({ arc, units: ordered(arc, since) })).filter((a) => a.units.length > 0);

/** the published readings: STRICT forgives nothing (the floor), FULL is registries + arc records */
const FULL: ForgivePolicy = { surfaces: REGISTRY, arcRecords: true };
const measure = (since: string | undefined, want: (k: Kind) => boolean, forgive = true) =>
  measureWidth(arcsSince(since), want, forgive ? FULL : STRICT);

// ---------------------------------------------------------------- 6. instrument B
const allUnits = arcNames.flatMap((a) => ordered(a));
const bRows = allUnits.map((u) => ({ arc: u.arc, pr: u.prs.join("+"), lanes: storyKeys(u.files).size }));
const bWith = bRows.filter((r) => r.lanes >= 1);
const bDist = new Map<number, number>();
for (const r of bWith) bDist.set(r.lanes, (bDist.get(r.lanes) ?? 0) + 1);

// ------------------------------------------------- 7. the marginal ranking (owner-directed, 08-10)
/**
 * Already gone, so it belongs in the BASELINE and not in the ranking: forgiving it does not describe
 * work anyone still has to do. ADR-0302 D1 deleted it on 2026-08-04; it only appears among the nine
 * because the measurement spans history.
 */
const ALREADY_FIXED = ["apps/studio/data/knowledge.json"];
const CANDIDATES = [...REGISTRY].filter((f) => !ALREADY_FIXED.includes(f)).sort();
const todayBase = forgiveOnly(ALREADY_FIXED.filter((f) => REGISTRY.has(f)));

/**
 * Surfaces this repo has since DE-REGISTRIED — the per-lane rows that made them collide are gone, so
 * two lanes touching the same concern no longer edit the same file.
 *
 * Read the `programme` reading below as a COUNTERFACTUAL, not as an after-the-fact re-measurement.
 * Instrument A reads landed history, and fixing a file today cannot make yesterday's landings
 * disjoint — so a plain re-run necessarily reports the same numbers it did before. What the
 * counterfactual says is: had these surfaces been append-safe for the whole measured period, the
 * factory's own landings would have offered this much width. The forward reading — landings authored
 * AFTER the fix — is the parked `measure-lane-width-after-brief` increment, and only time supplies it.
 */
const DE_REGISTRIED = [
  // the hardcoded REAL-buildable catalogue, derived from the story specs instead (2026-08-10).
  // 127 of the 157 commits that ever touched this file edited that one list.
  "packages/cli/src/node-build.test.ts",
];

const marginal = {
  $comment:
    "Marginal width per registry surface. `baseline` already forgives the surfaces ALREADY_FIXED " +
    "(knowledge.json, deleted 2026-08-04), so a delta here is width that work still to be done " +
    "would unlock. deltaShareWavesGe2 = fix this one alone; costOfOmittingShareWavesGe2 = fix every " +
    "candidate but this one. They disagree exactly when surfaces clash together.",
  alreadyFixed: ALREADY_FIXED,
  candidates: CANDIDATES,
  build: marginalRanking(arcsSince(), (k) => k === "build", CANDIDATES, todayBase),
  all: marginalRanking(arcsSince(), () => true, CANDIDATES, todayBase),
  build_since_2026_08_04: marginalRanking(
    arcsSince("2026-08-04"),
    (k) => k === "build",
    CANDIDATES,
    todayBase,
  ),
  /** registries WITHOUT the per-arc record forgiveness, to show how the published 34.4% splits */
  registriesOnly: {
    build: measureWidth(arcsSince(), (k) => k === "build", forgiveOnly(REGISTRY)),
    all: measureWidth(arcsSince(), () => true, forgiveOnly(REGISTRY)),
  },
  /** the counterfactual for what has ACTUALLY been de-registried — see DE_REGISTRIED above */
  programme: {
    deRegistried: DE_REGISTRIED,
    build: measureWidth(
      arcsSince(),
      (k) => k === "build",
      forgiveOnly([...ALREADY_FIXED.filter((f) => REGISTRY.has(f)), ...DE_REGISTRIED]),
    ),
    all: measureWidth(
      arcsSince(),
      () => true,
      forgiveOnly([...ALREADY_FIXED.filter((f) => REGISTRY.has(f)), ...DE_REGISTRIED]),
    ),
  },
};

// ---------------------------------------------------------------- 8. report
const report = {
  generated: { repoRoot, head: git("rev-parse", "HEAD").trim() },
  meta: {
    incrementsInStore: increments.length,
    closedWithPr: increments.filter((r) => (r.doc as any).status === "closed" && (r.doc as any).outcome?.pr).length,
    dropped, arcs: arcNames.length, landedUnits: allUnits.length,
    prsResolved: nPr, prsUnresolved: [...new Set(unresolvedPrs)].sort((a, b) => a - b),
    registrySurfaces: [...REGISTRY].sort(),
  },
  A: {
    all_strict: measure(undefined, () => true, false),
    build_strict: measure(undefined, (k) => k === "build", false),
    all: measure(undefined, () => true),
    build: measure(undefined, (k) => k === "build"),
    authoring: measure(undefined, (k) => k === "authoring"),
    all_since_2026_08_04: measure("2026-08-04", () => true),
    build_since_2026_08_04: measure("2026-08-04", (k) => k === "build"),
  },
  B: {
    landings: allUnits.length,
    touchingStoryGrain: bWith.length,
    landingsSpanningGe2Stories: bWith.filter((r) => r.lanes >= 2).length,
    shareOfStoryTouchingLandings: bWith.filter((r) => r.lanes >= 2).length / bWith.length,
    latentLanesCollapsed: bWith.reduce((a, r) => a + Math.max(0, r.lanes - 1), 0),
    dist: [...bDist].sort((a, b) => a[0] - b[0]),
    widest: bWith.slice().sort((a, b) => b.lanes - a.lanes).slice(0, 12),
  },
  marginal,
};
writeFileSync(outFile, JSON.stringify(report, null, 2));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`increments=${report.meta.incrementsInStore} closed+pr=${report.meta.closedWithPr} landed units=${report.meta.landedUnits} arcs=${report.meta.arcs}`);
console.log(`PRs resolved=${report.meta.prsResolved} unresolved=${report.meta.prsUnresolved.length}`);
for (const [name, m] of Object.entries(report.A)) {
  console.log(`\n${name}: units=${m.units} waves=${m.waves} mean=${m.mean.toFixed(2)} median=${m.median}`);
  console.log(`   waves>=2: ${m.wavesGe2}/${m.waves} (${pct(m.shareWavesGe2)})   units in a >=2 wave: ${pct(m.shareUnitsInWideWave)}   arcs with a wide wave: ${m.arcsWithWideWave}/${m.arcsCounted}`);
  console.log(`   dist: ${m.dist.map(([a, b]) => `${a}:${b}`).join(" ")}   speedup: ${m.stragglerAdjustedSpeedup.toFixed(3)}x`);
}
console.log(`\nB: ${report.B.landingsSpanningGe2Stories}/${report.B.touchingStoryGrain} story-touching landings spanned >=2 stories; ${report.B.latentLanesCollapsed} latent lanes collapsed into serial passes`);

for (const [name, r] of [
  ["build", marginal.build],
  ["all", marginal.all],
  ["build since 2026-08-04", marginal.build_since_2026_08_04],
] as const) {
  console.log(`\nMARGINAL — ${name}   baseline (already-fixed forgiven) ${pct(r.baseline.shareWavesGe2)} -> all candidates ${pct(r.together.shareWavesGe2)}`);
  console.log(`   ${"surface".padEnd(44)} ${"touched".padStart(8)} ${"blocks".padStart(7)} ${"+alone".padStart(8)} ${"-if skipped".padStart(12)}`);
  for (const s of r.surfaces)
    console.log(`   ${s.surface.padEnd(44)} ${`${s.touchedBy} (${pct(s.shareOfLandings)})`.padStart(8)} ${String(s.wavesBlocked).padStart(7)} ${pct(s.deltaShareWavesGe2).padStart(8)} ${pct(s.costOfOmittingShareWavesGe2).padStart(12)}`);
}
console.log(`\nregistries only (no per-arc records): build ${pct(marginal.registriesOnly.build.shareWavesGe2)}  all ${pct(marginal.registriesOnly.all.shareWavesGe2)}`);
console.log(`PROGRAMME (counterfactual — surfaces actually de-registried: ${DE_REGISTRIED.join(", ") || "none"})`);
console.log(`   build ${pct(marginal.build.baseline.shareWavesGe2)} -> ${pct(marginal.programme.build.shareWavesGe2)}   all ${pct(marginal.all.baseline.shareWavesGe2)} -> ${pct(marginal.programme.all.shareWavesGe2)}`);

console.log(`\nwrote ${outFile}`);
