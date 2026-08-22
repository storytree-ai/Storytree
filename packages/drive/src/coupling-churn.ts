import { execFileSync } from "node:child_process";

/**
 * COUPLING CHURN — the git half of the factory-floor health instrument (ADR-0316,
 * `coupling-churn-instrument-rate-normalised`).
 *
 * QUESTION 2 — IS COUPLING CHURN FALLING? Two full sessions have hand-walked git to answer it: once
 * on 2026-08-04 to charter `session-decoupling-arc`, and again on 2026-08-06 to record
 * `session-decoupling-arc-inc-22`. Both walked every `merge origin/main` re-sync on `main` and
 * diffed `sha^1...sha^2` for what each forced a branch to absorb. This module is that archaeology,
 * mechanised — method unchanged, so the figures are reproducible from git alone.
 *
 * RATE-NORMALISE OR REFUSE (ADR-0316 D2), which is the whole reason this is not just a git script.
 * `session-decoupling-arc`'s close-condition-two clause requires its ratio be measured at a dispatch
 * rate COMPARABLE to 2026-08-03 (~34 landings in a day) and states that a lower-dispatch measurement
 * PROVES NOTHING, because the claim is that interference is superlinear in concurrency. The daily
 * series makes the trap concrete — 0.40 / 0.39 / 0.89 / 0.27 / 0.33 / 0.56 across 2026-08-01..06 —
 * a quiet day is indistinguishable from a fixed one on the ratio alone. So {@link couplingChurn}
 * carries the window's dispatch rate BESIDE every figure, and where the window is not comparable to
 * the reference it names the condition that failed and DECLINES to render the ratio as a trend.
 * A quiet week must not be able to look like a win. That refusal is a first-class output, not an
 * error: `inc-22` had to open with a hand-written prose warning telling readers not to count itself
 * as the test, and a number that needs a prose warning attached is a defect in the number.
 *
 * WHAT IS RATE-NORMALISED BY CONSTRUCTION and is therefore ALWAYS reported: per-landing absorbed
 * churn, and the channel-composition split. Those two carried the real finding in inc-22 and neither
 * depends on volume.
 *
 * NOT A CAP (the owner rejected any in-flight limit on 2026-08-04). Measuring concurrency is the
 * point; throttling it is the rejected option. This reports and gates nothing.
 *
 * FENCE — claim-queue delay is INVISIBLE here and that is a known blind spot, not an omission: a
 * session queued behind a sibling's claim performs no extra `git merge origin/main`, so it costs an
 * hour (measured: 64 and 71 minutes on 2026-08-04) and moves these figures not at all. Reading it
 * needs `events.claim_event`, which `noticeboard history` already owns — consume that, never write a
 * second reader here.
 */

// ---------------------------------------------------------------------------
// The commit vocabulary
// ---------------------------------------------------------------------------

/** One commit on the trunk, as this module needs it. */
export interface CommitRec {
  sha: string;
  /** Committer time, seconds since epoch. */
  at: number;
  /** Parent shas, first-parent first. */
  parents: string[];
  subject: string;
}

/**
 * The re-sync classifier: a branch absorbing `main`.
 *
 * DELIBERATELY NARROW. A wider pattern (`Merge origin/main into …`, `Merge current main …`) adds
 * three commits across 2026-08-01..06 and moves the daily ratio series off the hand measurement it
 * has to reproduce; this exact form reproduces `session-decoupling-arc-inc-22`'s series on all six
 * days. Widening it is a calibration change, not a tidy-up — `coupling-churn.test.ts` pins it.
 */
export const RESYNC_SUBJECT = /^Merge remote-tracking branch 'origin\/main'/i;

/** The landing classifier: a PR merged to the trunk. */
export const LANDING_SUBJECT = /^Merge pull request #(\d+)(?: from ([^\s]+))?/;

/**
 * Paths excluded from absorbed churn, and WHY — stated in the output rather than buried
 * (the entry: "state the exclusion in the output rather than burying it").
 */
export const CHURN_EXCLUSIONS: ReadonlyArray<{ prefix: string; why: string }> = [
  {
    prefix: "docs/research/",
    why: "bulk additive research dumps — absorbed by every re-sync in their window, collided on by nobody; excluded by the session-decoupling-arc charter's own method",
  },
];

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * The coupling CHANNELS: the buckets absorbed churn is composed of.
 *
 * A file matching none of these is `unclassified` — counted, reported, and held OUT of the share
 * denominator. That is not a rounding convenience: a residual "other" bucket spanning `.github/`,
 * `legacy/` and `web/` is not a channel anyone owns, so folding it into the denominator would move
 * every share without naming anything. The count is printed beside the shares so the denominator is
 * visible.
 */
export const CHANNELS: ReadonlyArray<{ channel: string; match: (path: string) => boolean }> = [
  { channel: "packages/**", match: (p) => p.startsWith("packages/") },
  { channel: "apps/**", match: (p) => p.startsWith("apps/") },
  { channel: "docs/decisions/", match: (p) => p.startsWith("docs/decisions/") },
  { channel: "stories/", match: (p) => p.startsWith("stories/") },
  { channel: "lockfile", match: (p) => p === "pnpm-lock.yaml" },
  { channel: "root", match: (p) => !p.includes("/") },
];

function channelOf(path: string): string | undefined {
  return CHANNELS.find((c) => c.match(path))?.channel;
}

// ---------------------------------------------------------------------------
// Comparability
// ---------------------------------------------------------------------------

/** The dispatch rate a rate-sensitive ratio must be read against. */
export interface ReferenceRate {
  /** Where the reference comes from, printed with the verdict. */
  label: string;
  landingsPerDay: number;
}

/**
 * The reference `session-decoupling-arc`'s close condition two names: 2026-08-03, the day the
 * problem was measured at full concurrency.
 */
export const DECOUPLING_REFERENCE: ReferenceRate = {
  label: "session-decoupling-arc close-condition-two (2026-08-03: ~40+ sessions, ~34 landings/day)",
  landingsPerDay: 34,
};

/**
 * How close a window's dispatch rate must be to the reference before a rate-SENSITIVE ratio may be
 * rendered as a trend. 0.8 is a stated threshold, not a discovered one — the point is that it is
 * declared and printed, so a reader can disagree with a visible number rather than with a silent
 * one.
 */
export const COMPARABILITY_FLOOR = 0.8;

/** The comparability verdict — a first-class output either way (ADR-0316 D2). */
export type Comparability =
  | { comparable: true; reference: ReferenceRate; ratioToReference: number; floor: number }
  | {
      comparable: false;
      reference: ReferenceRate;
      ratioToReference: number;
      floor: number;
      /** The condition that failed, named. */
      failed: string;
      /** What is being declined, and why — printed instead of the number. */
      refusal: string;
    };

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface DispatchRate {
  landings: number;
  /** Distinct head branches merged in the window — the sessions proxy. */
  branches: number;
  /** Window length in days (fractional). */
  days: number;
  landingsPerDay: number;
  branchesPerDay: number;
}

export interface ChannelShare {
  channel: string;
  changes: number;
  /** Share of the CLASSIFIED absorbed changes. */
  share: number;
}

export interface ChurnReport {
  /** The exact instants the figures were computed over — every figure carries its window. */
  window: { from: string; to: string };
  sample: {
    resyncs: number;
    landings: number;
    /** Absorbed file-changes after exclusions. */
    absorbedChanges: number;
    /** Of those, files falling in a named channel (the share denominator). */
    classified: number;
    /** Files in no named channel — reported, never folded into the denominator. */
    unclassified: number;
    /** Absorbed file-changes dropped by {@link CHURN_EXCLUSIONS}. */
    excluded: number;
  };
  dispatch: DispatchRate;
  /** RATE-NORMALISED BY CONSTRUCTION — always reported. */
  perLandingAbsorbedChurn: number;
  /** RATE-NORMALISED BY CONSTRUCTION — always reported. */
  channels: ChannelShare[];
  /** The hottest individual objects: how many re-syncs each was absorbed by. */
  hottest: Array<{ path: string; resyncs: number; share: number }>;
  /**
   * RATE-SENSITIVE: re-syncs per landing. Present ONLY when {@link Comparability} says the window
   * can carry it. Its absence is the refusal, and `comparability.refusal` says why.
   */
  resyncsPerLanding?: number;
  comparability: Comparability;
  exclusions: ReadonlyArray<{ prefix: string; why: string }>;
}

function isExcluded(path: string): boolean {
  return CHURN_EXCLUSIONS.some((e) => path.startsWith(e.prefix));
}

/**
 * Compute question 2's answer over a window.
 *
 * PURE: the caller supplies the commit list and a resolver for what each re-sync absorbed, so the
 * whole surface is testable without a repository. {@link gitCommits} / {@link gitAbsorbed} are the
 * real adapters.
 */
export interface ChurnInput {
  commits: readonly CommitRec[];
  /** What a re-sync forced its branch to absorb: `git diff --name-only <p1>...<p2>`. */
  absorbedFor: (commit: CommitRec) => readonly string[];
  /** Window bounds as ISO instants. */
  window: { from: string; to: string };
  reference?: ReferenceRate;
}

export function couplingChurn(input: ChurnInput): ChurnReport {
  const reference = input.reference ?? DECOUPLING_REFERENCE;
  const from = Date.parse(input.window.from) / 1000;
  const to = Date.parse(input.window.to) / 1000;
  const inWindow = input.commits.filter((c) => c.at >= from && c.at < to);

  const resyncs = inWindow.filter((c) => RESYNC_SUBJECT.test(c.subject) && c.parents.length >= 2);
  const landings = inWindow.filter((c) => LANDING_SUBJECT.test(c.subject));

  let excluded = 0;
  let classified = 0;
  let unclassified = 0;
  const perChannel = new Map<string, number>();
  const perPath = new Map<string, number>();
  for (const resync of resyncs) {
    const files = input.absorbedFor(resync);
    const kept: string[] = [];
    for (const file of files) {
      if (isExcluded(file)) {
        excluded += 1;
        continue;
      }
      kept.push(file);
      const channel = channelOf(file);
      if (channel === undefined) unclassified += 1;
      else {
        classified += 1;
        perChannel.set(channel, (perChannel.get(channel) ?? 0) + 1);
      }
    }
    for (const file of new Set(kept)) perPath.set(file, (perPath.get(file) ?? 0) + 1);
  }
  const absorbedChanges = classified + unclassified;

  const days = Math.max((to - from) / 86_400, Number.EPSILON);
  const branches = new Set(
    landings.map((c) => LANDING_SUBJECT.exec(c.subject)?.[2]).filter((b): b is string => b !== undefined),
  ).size;
  const dispatch: DispatchRate = {
    landings: landings.length,
    branches,
    days,
    landingsPerDay: landings.length / days,
    branchesPerDay: branches / days,
  };

  const ratioToReference = dispatch.landingsPerDay / reference.landingsPerDay;
  const comparable = ratioToReference >= COMPARABILITY_FLOOR;
  const comparability: Comparability = comparable
    ? { comparable: true, reference, ratioToReference, floor: COMPARABILITY_FLOOR }
    : {
        comparable: false,
        reference,
        ratioToReference,
        floor: COMPARABILITY_FLOOR,
        failed: `window dispatch rate ${dispatch.landingsPerDay.toFixed(1)} landings/day is ${(ratioToReference * 100).toFixed(0)}% of the reference ${reference.landingsPerDay}/day, below the ${(COMPARABILITY_FLOOR * 100).toFixed(0)}% floor`,
        refusal:
          "DECLINED: re-syncs per landing is rate-sensitive and this window cannot carry it as a trend. " +
          "The decoupling claim is that interference is superlinear in concurrency, so a lower-dispatch " +
          "window proves nothing about it — and it fails in the flattering direction, because the ratio " +
          "looks best exactly when it means least. Re-run over a window at the reference dispatch rate. " +
          "The per-landing absorbed churn and the channel composition below are rate-normalised by " +
          "construction and stand on their own.",
      };

  const channels: ChannelShare[] = CHANNELS.map(({ channel }) => ({
    channel,
    changes: perChannel.get(channel) ?? 0,
    share: classified === 0 ? 0 : (perChannel.get(channel) ?? 0) / classified,
  }))
    .filter((c) => c.changes > 0)
    .sort((a, b) => b.changes - a.changes);

  const hottest = [...perPath.entries()]
    .map(([path, n]) => ({ path, resyncs: n, share: resyncs.length === 0 ? 0 : n / resyncs.length }))
    .sort((a, b) => b.resyncs - a.resyncs || a.path.localeCompare(b.path))
    .slice(0, 10);

  const report: ChurnReport = {
    window: input.window,
    sample: {
      resyncs: resyncs.length,
      landings: landings.length,
      absorbedChanges,
      classified,
      unclassified,
      excluded,
    },
    dispatch,
    perLandingAbsorbedChurn: landings.length === 0 ? 0 : absorbedChanges / landings.length,
    channels,
    hottest,
    comparability,
    exclusions: CHURN_EXCLUSIONS,
  };
  if (comparable) report.resyncsPerLanding = resyncs.length / Math.max(landings.length, 1);
  return report;
}

// ---------------------------------------------------------------------------
// The git adapters
// ---------------------------------------------------------------------------

/**
 * The field separator in the `git log --pretty` format below. Written as an ESCAPE, never as a
 * literal control byte in source — a raw 0x01 renders the line invisible to `grep`
 * (`control-byte-makes-source-invisible-to-grep`). No commit subject can contain it, so the split
 * cannot be fooled by a subject carrying the separator.
 */
const FIELD = String.fromCharCode(1);

/**
 * Parse `git log --pretty=%H<FS>%ct<FS>%P<FS>%s` output. Pure, so the format contract is unit-tested
 * without a repository — the shell below only has to hand it the right bytes.
 */
export function parseCommitLog(text: string): CommitRec[] {
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha = "", at = "0", parents = "", ...rest] = line.split(FIELD);
      return {
        sha,
        at: Number(at),
        parents: parents.split(" ").filter((p) => p.length > 0),
        subject: rest.join(FIELD),
      };
    })
    .filter((c) => c.sha.length > 0);
}

/** Read the trunk's commit list. `ref` is resolved by git — a missing ref throws, it never silently empties. */
export function gitCommits(cwd: string, ref = "origin/main"): CommitRec[] {
  const out = execFileSync("git", ["log", ref, `--pretty=%H${FIELD}%ct${FIELD}%P${FIELD}%s`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return parseCommitLog(out);
}

/**
 * What one re-sync forced its branch to absorb: the three-dot diff from the branch's own prior
 * commit to the trunk commit it merged in — i.e. what `main` had gained since the branch last
 * synced. This is the charter's method verbatim.
 */
export function gitAbsorbed(cwd: string, commit: CommitRec): string[] {
  const [own, incoming] = commit.parents;
  if (own === undefined || incoming === undefined) return [];
  const out = execFileSync("git", ["diff", "--name-only", `${own}...${incoming}`], {
    cwd,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.split("\n").filter((line) => line.length > 0);
}
