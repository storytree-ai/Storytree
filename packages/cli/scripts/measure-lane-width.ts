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
 * Read-only: opens the live store, reads git, writes one report file. Run:
 *   pnpm --filter @storytree/cli exec tsx scripts/measure-lane-width.ts <repoRoot> <out.json>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createPool, closePool } from "@storytree/library/store";

const repoRoot = process.argv[2];
const outFile = process.argv[3];
if (!repoRoot || !outFile) {
  console.error("usage: measure-lane-width.ts <repoRoot> <out.json>");
  process.exit(2);
}

const git = (...a: string[]): string =>
  execFileSync("git", ["-C", repoRoot, ...a], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });

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
type Unit = { arc: string; incs: string[]; date: string; prs: number[]; files: Set<string> };
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

const isRecord = (f: string) => f.endsWith(".md") || f.endsWith(".json");
const isSource = (f: string) => /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|rs|css|scss|sql|sh|ya?ml|toml)$/.test(f);
/** per-arc hot RECORDS only — ledgers and decision docs, never the arc's authored source */
const arcRecords = (units: Unit[]): Set<string> => {
  const c = new Map<string, number>();
  for (const u of units) for (const f of u.files) if (isRecord(f)) c.set(f, (c.get(f) ?? 0) + 1);
  return new Set([...c].filter(([, n]) => n >= 3 && n / units.length >= 1 / 3).map(([f]) => f));
};

// ---------------------------------------------------------------- 5. instrument A
/** ADR-0332 D4 — measured, never re-derived here. Beyond 4 lanes the tax is unmeasured. */
const SPEEDUP = (k: number): number => (k <= 1 ? 1 : k === 2 ? 1.31 : k === 3 ? 1.59 : 1.84);
const DISPATCH_CAP = 4;
type Kind = "build" | "authoring" | "registry-only";
const classify = (own: string[]): Kind =>
  own.length === 0 ? "registry-only" : own.some(isSource) ? "build" : "authoring";

function measure(since: string | undefined, want: (k: Kind) => boolean, forgive = true) {
  const sizes: number[] = [];
  let units = 0, unitsWide = 0, serial = 0, batched = 0, registryOnly = 0;
  const serialisers = new Map<string, number>();
  const perArc: Array<{ arc: string; units: number; waves: number; maxWave: number; shareWide: number }> = [];

  for (const arc of arcNames) {
    const all = ordered(arc, since);
    if (!all.length) continue;
    const recs = arcRecords(all);
    // STRICT mode forgives nothing: it is the floor, the width available with no merge
    // coordination at all. The gap between it and the default is the price of consolidation.
    const forgiven = (f: string) => forgive && (REGISTRY.has(f) || recs.has(f));

    const kept: Array<{ u: Unit; own: string[] }> = [];
    for (const u of all) {
      const own = [...u.files].filter((f) => !forgiven(f));
      const k = classify(own);
      // a unit whose whole file set is registry has no own surface: it would be disjoint from
      // everything and join any wave for free. Excluded, and counted.
      if (k === "registry-only") { registryOnly++; continue; }
      if (want(k)) kept.push({ u, own });
    }
    if (!kept.length) continue;

    const waves: Array<{ n: number; blockedBy: string[] }> = [];
    let curN = 0, curF = new Set<string>();
    for (const { own } of kept) {
      const clash = own.filter((f) => curF.has(f));
      if (curN > 0 && clash.length) {
        waves.push({ n: curN, blockedBy: clash.slice(0, 3) });
        curN = 0; curF = new Set();
      }
      curN++;
      for (const f of own) curF.add(f);
    }
    if (curN) waves.push({ n: curN, blockedBy: [] });

    units += kept.length;
    for (const w of waves) {
      sizes.push(w.n);
      if (w.n >= 2) unitsWide += w.n;
      let rem = w.n;
      serial += rem;
      while (rem > 0) { const x = Math.min(rem, DISPATCH_CAP); batched += x / SPEEDUP(x); rem -= x; }
      for (const f of w.blockedBy) serialisers.set(f, (serialisers.get(f) ?? 0) + 1);
    }
    const wide = waves.filter((w) => w.n >= 2).reduce((a, w) => a + w.n, 0);
    perArc.push({ arc, units: kept.length, waves: waves.length, maxWave: Math.max(...waves.map((w) => w.n)), shareWide: wide / kept.length });
  }

  const dist = new Map<number, number>();
  for (const s of sizes) dist.set(s, (dist.get(s) ?? 0) + 1);
  const ss = sizes.slice().sort((a, b) => a - b);
  return {
    units, waves: sizes.length, registryOnlyExcluded: registryOnly,
    mean: units / sizes.length, median: ss[Math.floor(ss.length / 2)],
    wavesGe2: sizes.filter((s) => s >= 2).length,
    shareWavesGe2: sizes.filter((s) => s >= 2).length / sizes.length,
    shareUnitsInWideWave: unitsWide / units,
    dist: [...dist].sort((a, b) => a[0] - b[0]),
    stragglerAdjustedSpeedup: serial / batched,
    arcsWithWideWave: perArc.filter((a) => a.maxWave >= 2).length,
    arcsCounted: perArc.length,
    topSerialisers: [...serialisers].sort((a, b) => b[1] - a[1]).slice(0, 10),
    perArc: perArc.sort((a, b) => b.shareWide - a.shareWide || b.units - a.units),
  };
}

// ---------------------------------------------------------------- 6. instrument B
const storyKeys = (files: Set<string>): Set<string> => {
  const s = new Set<string>();
  for (const f of files) {
    let m = /^stories\/([^/]+)\/story\.md$/.exec(f);
    if (m) { s.add(m[1]!); continue; }
    m = /^apps\/studio\/data\/seed-kinds\/[^/]+\/([^_/]+)__/.exec(f);
    if (m) s.add(m[1]!);
  }
  return s;
};
const allUnits = arcNames.flatMap((a) => ordered(a));
const bRows = allUnits.map((u) => ({ arc: u.arc, pr: u.prs.join("+"), lanes: storyKeys(u.files).size }));
const bWith = bRows.filter((r) => r.lanes >= 1);
const bDist = new Map<number, number>();
for (const r of bWith) bDist.set(r.lanes, (bDist.get(r.lanes) ?? 0) + 1);

// ---------------------------------------------------------------- 7. report
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
console.log(`\nwrote ${outFile}`);
