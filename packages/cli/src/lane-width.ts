/**
 * lane-width — the pure core of the ADR-0340 lane-width instrument.
 *
 * The runnable entry is `packages/cli/scripts/measure-lane-width.ts`, which opens the live store and
 * reads git; everything that decides a NUMBER lives here, so the wave simulation and the marginal
 * ranking are provable by ordinary tests rather than by re-running a 400-PR sweep and squinting.
 *
 * ADR-0340 D3 found that better than half of the factory's available lane width sits behind nine
 * shared registry surfaces. The owner directed (2026-08-10) that those surfaces be fixed before any
 * dispatcher — which immediately asks WHICH of them, since two of the nine must not be touched at
 * all. `marginalRanking` answers that with evidence: it re-runs the same wave simulation forgiving
 * exactly one surface at a time, so each surface's contribution is measured rather than assumed.
 */

/** One landing: the file set an arc's work actually put on `main` in a single PR. */
export type Unit = {
  readonly arc: string;
  readonly incs: string[];
  readonly date: string;
  readonly prs: number[];
  readonly files: Set<string>;
};

/** An arc's landings, already in landing order. */
export type ArcUnits = { readonly arc: string; readonly units: readonly Unit[] };

/**
 * What a conflict is allowed to be forgiven ON. Strict forgives nothing and is the floor: the width
 * available with no merge coordination at all. The gap up to a policy is the price of that policy.
 */
export type ForgivePolicy = {
  /** files forgiven in every arc — the factory-wide registries */
  readonly surfaces: ReadonlySet<string>;
  /** also forgive per-arc hot RECORDS (a ledger or decision doc one arc keeps appending to) */
  readonly arcRecords: boolean;
};

export const STRICT: ForgivePolicy = { surfaces: new Set(), arcRecords: false };
export const forgiveOnly = (files: Iterable<string>): ForgivePolicy => ({
  surfaces: new Set(files),
  arcRecords: false,
});

export type Kind = "build" | "authoring" | "registry-only";

const RECORD_RE = /\.(md|json)$/;
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|rs|css|scss|sql|sh|ya?ml|toml)$/;
export const isRecord = (f: string): boolean => RECORD_RE.test(f);
export const isSource = (f: string): boolean => SOURCE_RE.test(f);

/**
 * A landing with no own surface left is registry-only: it would be disjoint from everything and join
 * any wave for free, so it is excluded and counted rather than silently kept (ADR-0340's 19).
 */
export const classify = (own: readonly string[]): Kind =>
  own.length === 0 ? "registry-only" : own.some(isSource) ? "build" : "authoring";

/**
 * Per-arc hot RECORDS — ledgers and decision docs the arc keeps appending to. Never the arc's
 * authored SOURCE: a plain per-arc frequency rule strips `packages/notice-board/src/claim.ts` from
 * `noticeboard-claim-ledger-arc`, which is that arc's whole subject (ADR-0340, discarded method).
 */
export const arcRecords = (units: readonly Unit[]): Set<string> => {
  const c = new Map<string, number>();
  for (const u of units) for (const f of u.files) if (isRecord(f)) c.set(f, (c.get(f) ?? 0) + 1);
  return new Set([...c].filter(([, n]) => n >= 3 && n / units.length >= 1 / 3).map(([f]) => f));
};

/** ADR-0332 D4 — measured, never re-derived here. Beyond 4 lanes the tax is unmeasured. */
export const SPEEDUP = (k: number): number => (k <= 1 ? 1 : k === 2 ? 1.31 : k === 3 ? 1.59 : 1.84);
export const DISPATCH_CAP = 4;

export type Wave = { readonly n: number; readonly blockedBy: readonly string[] };

/**
 * The in-order fan-out simulation: open a wave, add the next landing while it stays file-disjoint
 * from every landing already in the wave, close and re-open on the first conflict.
 */
export const simulateWaves = (kept: readonly { readonly own: readonly string[] }[]): Wave[] => {
  const waves: Wave[] = [];
  let curN = 0;
  let curF = new Set<string>();
  for (const { own } of kept) {
    const clash = own.filter((f) => curF.has(f));
    if (curN > 0 && clash.length) {
      waves.push({ n: curN, blockedBy: clash });
      curN = 0;
      curF = new Set();
    }
    curN++;
    for (const f of own) curF.add(f);
  }
  if (curN) waves.push({ n: curN, blockedBy: [] });
  return waves;
};

export type Measurement = {
  units: number;
  waves: number;
  registryOnlyExcluded: number;
  mean: number;
  median: number | undefined;
  wavesGe2: number;
  shareWavesGe2: number;
  shareUnitsInWideWave: number;
  dist: [number, number][];
  stragglerAdjustedSpeedup: number;
  arcsWithWideWave: number;
  arcsCounted: number;
  topSerialisers: [string, number][];
  perArc: { arc: string; units: number; waves: number; maxWave: number; shareWide: number }[];
};

/**
 * Instrument A — inter-landing width across every arc, under one forgiveness policy.
 *
 * `want` selects the population (build lanes, authoring lanes, or everything). Note the ordering:
 * a landing is classified AFTER forgiveness, because a landing whose source file is a forgiven
 * registry is not a build lane in that world.
 */
export function measure(
  arcs: readonly ArcUnits[],
  want: (k: Kind) => boolean,
  policy: ForgivePolicy,
): Measurement {
  const sizes: number[] = [];
  let units = 0;
  let unitsWide = 0;
  let serial = 0;
  let batched = 0;
  let registryOnly = 0;
  const serialisers = new Map<string, number>();
  const perArc: Measurement["perArc"] = [];

  for (const { arc, units: all } of arcs) {
    if (!all.length) continue;
    const recs = policy.arcRecords ? arcRecords(all) : undefined;
    const forgiven = (f: string): boolean => policy.surfaces.has(f) || (recs?.has(f) ?? false);

    const kept: { own: string[] }[] = [];
    for (const u of all) {
      const own = [...u.files].filter((f) => !forgiven(f));
      const k = classify(own);
      if (k === "registry-only") {
        registryOnly++;
        continue;
      }
      if (want(k)) kept.push({ own });
    }
    if (!kept.length) continue;

    const waves = simulateWaves(kept);
    units += kept.length;
    for (const w of waves) {
      sizes.push(w.n);
      if (w.n >= 2) unitsWide += w.n;
      let rem = w.n;
      serial += rem;
      while (rem > 0) {
        const x = Math.min(rem, DISPATCH_CAP);
        batched += x / SPEEDUP(x);
        rem -= x;
      }
      // truncated to three exactly as ADR-0340 reported it, so `topSerialisers` reproduces
      for (const f of w.blockedBy.slice(0, 3)) serialisers.set(f, (serialisers.get(f) ?? 0) + 1);
    }
    const wide = waves.filter((w) => w.n >= 2).reduce((a, w) => a + w.n, 0);
    perArc.push({
      arc,
      units: kept.length,
      waves: waves.length,
      maxWave: Math.max(...waves.map((w) => w.n)),
      shareWide: wide / kept.length,
    });
  }

  const dist = new Map<number, number>();
  for (const s of sizes) dist.set(s, (dist.get(s) ?? 0) + 1);
  const ss = sizes.slice().sort((a, b) => a - b);
  return {
    units,
    waves: sizes.length,
    registryOnlyExcluded: registryOnly,
    mean: units / sizes.length,
    median: ss[Math.floor(ss.length / 2)],
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

export type SurfaceMargin = {
  surface: string;
  /** landings that touched it, and the share of all landings that did */
  touchedBy: number;
  shareOfLandings: number;
  /** waves this surface closed under the baseline policy — the direct blocking signal */
  wavesBlocked: number;
  /** width with the baseline plus THIS surface forgiven */
  shareWavesGe2: number;
  /** …minus the baseline. The width fixing this surface alone unlocks. */
  deltaShareWavesGe2: number;
  deltaShareUnitsInWideWave: number;
  deltaSpeedup: number;
  /** all candidate surfaces forgiven EXCEPT this one — what leaving it unfixed costs the set */
  leaveOneOutShareWavesGe2: number;
  costOfOmittingShareWavesGe2: number;
};

export type Ranking = {
  baseline: { shareWavesGe2: number; shareUnitsInWideWave: number; stragglerAdjustedSpeedup: number };
  together: { shareWavesGe2: number; shareUnitsInWideWave: number; stragglerAdjustedSpeedup: number };
  surfaces: SurfaceMargin[];
};

/**
 * Rank candidate surfaces by the width each one unlocks ON ITS OWN, over a baseline that may already
 * forgive surfaces which are gone or out of scope.
 *
 * Two readings, because they answer different questions and can disagree when surfaces co-occur:
 *   - ADD-ONE (`deltaShareWavesGe2`) — fix this one and nothing else. The ranking for "what next".
 *   - LEAVE-ONE-OUT (`costOfOmittingShareWavesGe2`) — fix every candidate but this one. What
 *     skipping it costs a completed programme. A surface that always clashes alongside another
 *     scores low on add-one and low on leave-one-out; one that is the sole blocker scores high on
 *     both. Neither alone is the answer, so both are reported.
 */
export function marginalRanking(
  arcs: readonly ArcUnits[],
  want: (k: Kind) => boolean,
  candidates: readonly string[],
  baseline: ForgivePolicy,
): Ranking {
  const base = measure(arcs, want, baseline);
  const all = forgiveOnly([...baseline.surfaces, ...candidates]);
  const together = measure(arcs, want, all);

  const landings = arcs.flatMap((a) => a.units);
  const blocked = blockersUnder(arcs, want, baseline);

  const surfaces = candidates.map((surface) => {
    const withIt = measure(arcs, want, forgiveOnly([...baseline.surfaces, surface]));
    const withoutIt = measure(
      arcs,
      want,
      forgiveOnly([...baseline.surfaces, ...candidates.filter((c) => c !== surface)]),
    );
    const touchedBy = landings.filter((u) => u.files.has(surface)).length;
    return {
      surface,
      touchedBy,
      shareOfLandings: touchedBy / landings.length,
      wavesBlocked: blocked.get(surface) ?? 0,
      shareWavesGe2: withIt.shareWavesGe2,
      deltaShareWavesGe2: withIt.shareWavesGe2 - base.shareWavesGe2,
      deltaShareUnitsInWideWave: withIt.shareUnitsInWideWave - base.shareUnitsInWideWave,
      deltaSpeedup: withIt.stragglerAdjustedSpeedup - base.stragglerAdjustedSpeedup,
      leaveOneOutShareWavesGe2: withoutIt.shareWavesGe2,
      costOfOmittingShareWavesGe2: together.shareWavesGe2 - withoutIt.shareWavesGe2,
    };
  });

  const pick = (m: Measurement) => ({
    shareWavesGe2: m.shareWavesGe2,
    shareUnitsInWideWave: m.shareUnitsInWideWave,
    stragglerAdjustedSpeedup: m.stragglerAdjustedSpeedup,
  });
  return {
    baseline: pick(base),
    together: pick(together),
    surfaces: surfaces.sort((a, b) => b.deltaShareWavesGe2 - a.deltaShareWavesGe2),
  };
}

/**
 * How many waves each file actually closed under one policy — untruncated, unlike `topSerialisers`,
 * which keeps ADR-0340's three-deep slice so its published table still reproduces.
 */
export function blockersUnder(
  arcs: readonly ArcUnits[],
  want: (k: Kind) => boolean,
  policy: ForgivePolicy,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { units: all } of arcs) {
    if (!all.length) continue;
    const recs = policy.arcRecords ? arcRecords(all) : undefined;
    const forgiven = (f: string): boolean => policy.surfaces.has(f) || (recs?.has(f) ?? false);
    const kept: { own: string[] }[] = [];
    for (const u of all) {
      const own = [...u.files].filter((f) => !forgiven(f));
      const k = classify(own);
      if (k === "registry-only") continue;
      if (want(k)) kept.push({ own });
    }
    if (!kept.length) continue;
    for (const w of simulateWaves(kept))
      for (const f of w.blockedBy) out.set(f, (out.get(f) ?? 0) + 1);
  }
  return out;
}

/** Story-grain lanes a single landing collapsed into a serial pass — instrument B, confound-free. */
export const storyKeys = (files: Iterable<string>): Set<string> => {
  const s = new Set<string>();
  for (const f of files) {
    let m = /^stories\/([^/]+)\/story\.md$/.exec(f);
    if (m) {
      s.add(m[1]!);
      continue;
    }
    m = /^apps\/studio\/data\/seed-kinds\/[^/]+\/([^_/]+)__/.exec(f);
    if (m) s.add(m[1]!);
  }
  return s;
};
