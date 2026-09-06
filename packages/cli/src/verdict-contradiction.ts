/**
 * # Was a signed GREEN ever contradicted by later history?
 *
 * `verdict-accuracy-arc` increment 2. The prove-it-gate signs a verdict when the spine has OBSERVED
 * a red and then a green. This module asks the question that observation cannot answer: **did
 * somebody later come back and fix a bug in the code that verdict certified?**
 *
 * ## ⚠ THIS IS A SMOKE TEST. IT IS NOT A PRECISION FIGURE, AND IT SAYS SO IN ITS OWN OUTPUT
 *
 * The increment is emphatic about this and so is {@link renderReport}: the classification below
 * CANNOT be made reliable. A commit saying "fix" may be a rename; a real regression may land with
 * no such word. What this establishes is whether the phenomenon EXISTS and roughly how often — not
 * what the precision number is. A clean precision figure needs an oracle we do not control.
 *
 * Deliberately NOT an LLM judge. `docs/research/benchmark-landscape-2026-09-04.md` records the
 * published finding that LLM judges cannot detect false completion (AUROC ≤0.65) where programmatic
 * state checks can — which is the whole reason the spine is deterministic. So the heuristic here is
 * programmatic, conservative, and biased to OVER-report, with a shortlist small enough to hand-read.
 *
 * ## The grain, and why it is the file rather than the span
 *
 * The increment as authored said "for each `--real` verdict with a `boundHash`, resolve the span it
 * bound". **That selects an empty set**: increment 1 measured `boundHash` stamped on ZERO of the 665
 * stored verdicts, and this module reproduced that before re-scoping. The span-level route does not
 * exist for any verdict in this corpus and cannot be back-filled, because a content hash of the span
 * as it stood at proof time is not recoverable after the fact.
 *
 * So the resolvable grain is the DECLARED PROOF PAIR — `real.testFile` and `real.sourceFile` from
 * the unit's `proof:` block, the same route `leaf-test-strength.ts` already resolves. That is
 * coarser than a span and the report says so.
 *
 * ## What this adds to plain file grain, and why the TEST file is the half worth keeping
 *
 * Asking only "did a later commit touch the proved SOURCE file" is very noisy: a shared file like a
 * studio component collects dozens of unrelated commits. But the pair declares TWO files, and the
 * test file is the one the verdict's own oracle lived in. A later commit that had to change THAT
 * test is a materially stronger signal than one that merely touched the source, because the proof's
 * own oracle had to move. So the reading is a LADDER of nested populations ({@link ladder}), each
 * with its denominator, narrowing from "everything" to a hand-readable shortlist.
 *
 * Nothing here adjudicates. No gate rung, no threshold, no guidance changes on the strength of a
 * number this produces — the arc's stated posture is "measure first, decide never".
 */

/** The house prefix on a commit the SPINE itself made when it re-proved a unit. */
const RE_PROOF_SUBJECT = /^storytree\s+(?:real|node|story)\s+build\b/i;

/**
 * Words that make a subject fix-shaped. Matched anywhere in the subject and BEFORE any
 * conventional-commit prefix is considered, so a `feat(...)` that also repairs something is counted
 * as fix-shaped rather than filed away as a feature — a fix very often lands inside a feature
 * commit, and missing those is the failure this ordering exists to prevent.
 *
 * The list is deliberately generous. Over-reporting is the instruction; the shortlist is hand-read.
 */
const FIX_WORDS: readonly string[] = [
  "fix",
  "fixes",
  "fixed",
  "bug",
  "bugs",
  "regress",
  "regression",
  "regressed",
  "broke",
  "broken",
  "breaks",
  "incorrect",
  "wrong",
  "wrongly",
  "fails",
  "failed",
  "failing",
  "crash",
  "crashes",
  "leak",
  "leaks",
  "stale",
  "corrupt",
  "corrupted",
  "missing",
  "mishandled",
  "misread",
  "miscounts",
  "miscounted",
  "revert",
  "reverts",
  "repair",
  "repairs",
  "defect",
  "wedge",
  "wedged",
  "hang",
  "hangs",
  "clobber",
  "clobbers",
  "silently",
  "never",
  "no-op",
];

/**
 * Conventional-commit prefixes that are NOT fix-shaped, mapped to the class they report as. A
 * prefix is only ever consulted after {@link FIX_WORDS} has had its say.
 */
const PREFIX_CLASSES: ReadonlyMap<string, CommitClass> = new Map([
  ["feat", "feature"],
  ["refactor", "refactor"],
  ["perf", "refactor"],
  ["test", "test-only"],
  ["docs", "housekeeping"],
  ["chore", "housekeeping"],
  ["style", "housekeeping"],
  ["build", "housekeeping"],
  ["ci", "housekeeping"],
]);

/**
 * How a later commit's message reads. Every value is a NAMED state — there is no null and no
 * silent drop, because "we could not classify this" and "this is noise" are different claims and
 * only one of them may be excluded from a shortlist.
 */
export type CommitClass =
  /** The spine's own re-proof commit. The gate running again is not a bug fix — see {@link classifyCommitMessage}. */
  | "re-proof"
  /** Carries a repair word. The signal, conservatively and generously matched. */
  | "fix-shaped"
  /** A conventional `feat`. Noise for this question — but see the ordering note above. */
  | "feature"
  /** A conventional `refactor`/`perf`. Noise. */
  | "refactor"
  /** A conventional `test`. Noise for the source question, though it means the oracle moved. */
  | "test-only"
  /** A conventional `docs`/`chore`/`style`/`build`/`ci`. Noise. */
  | "housekeeping"
  /**
   * No conventional prefix this module knows, and no repair word. **This is NOT noise.** Roughly a
   * quarter of this repo's commits carry no recognised prefix, so treating them as noise would
   * silently drop the largest unexamined bucket. They stay IN the shortlist.
   */
  | "unclassified";

/**
 * Classify one commit subject. Conservative and fail-wide: when in doubt a commit is
 * `unclassified`, which {@link ladder} keeps in the shortlist rather than discarding.
 *
 * ## Why re-proof is checked FIRST, and why it is not a fix
 *
 * A `--real` build commits the leaf's work under a subject like
 * `storytree real build real-mr6ycu73: act2-beat-director (authored by the gated leaf)`. Those
 * commits touch the proved pair by construction — every single time a unit is re-proved — so left
 * unclassified they would dominate the shortlist. And they are not contradictions: re-proving a
 * unit means the leaf authored a NEW test which the spine watched go red against the CURRENT
 * source. That red is about the new test, not about the old code being broken. Counted and
 * reported in its own right; never counted as a fix.
 */
export function classifyCommitMessage(subject: string): CommitClass {
  if (RE_PROOF_SUBJECT.test(subject.trim())) return "re-proof";

  // Word-boundary matching, so "prefix" and "suffix" do not read as "fix" — the single most
  // likely false positive in a repo whose commits talk about prefixes constantly.
  const words = subject.toLowerCase().split(/[^a-z0-9-]+/u);
  if (words.some((w) => FIX_WORDS.includes(w))) return "fix-shaped";

  const prefix = /^([a-z]+)\s*[(:]/u.exec(subject.trim().toLowerCase());
  if (prefix !== null) {
    const mapped = PREFIX_CLASSES.get(prefix[1] ?? "");
    if (mapped !== undefined) return mapped;
  }
  return "unclassified";
}

/**
 * One commit that landed AFTER a unit's verdict and touched at least one file of its declared proof
 * pair. `testLinesAdded` is git's own `--numstat` added-line count for the test file, and it is the
 * discriminator behind the {@link ladder}'s third rung.
 */
export interface LaterCommit {
  readonly sha: string;
  readonly subject: string;
  /** The commit touched `real.sourceFile`. */
  readonly touchedSource: boolean;
  /** The commit touched `real.testFile` — the file the verdict's own oracle lived in. */
  readonly touchedTest: boolean;
  /** Lines ADDED to the test file by this commit. Zero when the test file was not touched. */
  readonly testLinesAdded: number;
}

/** A later commit paired with the unit whose verdict it may contradict. */
export interface UnitCommit extends LaterCommit {
  readonly unitId: string;
  readonly sourceFile: string;
  readonly testFile: string;
  /** The verdict's commit, from which history was walked forward. */
  readonly provedAt: string;
}

/** One rung of the narrowing ladder: a named population and the commits in it. */
export interface Rung {
  readonly key: string;
  /** What this rung admits, in one plain sentence — rendered into the report verbatim. */
  readonly says: string;
  readonly commits: readonly UnitCommit[];
  /** Distinct units represented. A rung of 40 commits over 3 units is a different claim from 40 over 40. */
  readonly units: number;
  /**
   * Distinct COMMITS represented, which is not `commits.length`.
   *
   * Units share files — three terminal units all declare `TerminalDock.tsx` as their source — so a
   * single commit is counted once per unit it reaches. Without this figure the row count reads as a
   * count of distinct events and overstates it, in the one direction an over-reporting instrument
   * can least afford to be misread.
   */
  readonly distinctCommits: number;
}

/** The whole reading: four nested rungs plus the comparison figure and the denominators. */
export interface Ladder {
  /** Units with a resolvable proof commit — the denominator every rate below is over. */
  readonly unitsConsidered: number;
  /** Every rung, widest first. Each is a strict subset of the one before it. */
  readonly rungs: readonly Rung[];
  /**
   * The reading the increment's own fallback option (a) would have produced on its own: fix-shaped
   * commits touching the SOURCE file, ignoring the test file entirely. Reported so the document can
   * show how much the pair narrows it rather than asserting that it does.
   */
  readonly sourceOnlyFixShaped: readonly UnitCommit[];
  /** Spine re-proof commits, counted and set aside. Never part of any rung. */
  readonly reProofs: readonly UnitCommit[];
}

/** The classes that stay in the shortlist. `unclassified` is here on purpose — see {@link CommitClass}. */
const SHORTLIST_CLASSES: ReadonlySet<CommitClass> = new Set<CommitClass>(["fix-shaped", "unclassified"]);

/** Count distinct units in a commit list. */
function distinctUnits(commits: readonly UnitCommit[]): number {
  return new Set(commits.map((c) => c.unitId)).size;
}

/** Count distinct commits in a commit list — see {@link Rung.distinctCommits} for why this differs. */
function distinctShas(commits: readonly UnitCommit[]): number {
  return new Set(commits.map((c) => c.sha)).size;
}

/**
 * Build the narrowing ladder over every later commit found for every resolved unit.
 *
 * Each rung is a STRICT SUBSET of the one above, which is what makes the report readable as a
 * funnel rather than as four unrelated numbers. The widest rung deliberately admits everything —
 * including commits this module cannot classify at all — because a shortlist that silently dropped
 * its unknowns would report a smaller, cleaner-looking number that nobody could audit.
 */
export function ladder(commits: readonly UnitCommit[], unitsConsidered: number): Ladder {
  const reProofs = commits.filter((c) => classifyCommitMessage(c.subject) === "re-proof");
  const real = commits.filter((c) => classifyCommitMessage(c.subject) !== "re-proof");

  const r0 = real.filter((c) => c.touchedSource);
  const r1 = r0.filter((c) => c.touchedTest);
  const r2 = r1.filter((c) => c.testLinesAdded > 0);
  const r3 = r2.filter((c) => SHORTLIST_CLASSES.has(classifyCommitMessage(c.subject)));

  const rung = (key: string, says: string, list: readonly UnitCommit[]): Rung => ({
    key,
    says,
    commits: list,
    units: distinctUnits(list),
    distinctCommits: distinctShas(list),
  });

  return {
    unitsConsidered,
    rungs: [
      rung(
        "touched-source",
        "landed after the verdict and touched the file the verdict's unit was scoped to implement",
        r0,
      ),
      rung(
        "co-changed-pair",
        "...and also touched that unit's declared test file, so the proof's own oracle had to move",
        r1,
      ),
      rung(
        "oracle-grew",
        "...and ADDED lines to that test file, so a case was written that the original proof did not have",
        r2,
      ),
      rung(
        "fix-shaped-or-unclassified",
        "...and reads as a repair, or could not be classified at all — THE SHORTLIST, to be hand-read",
        r3,
      ),
    ],
    sourceOnlyFixShaped: r0.filter((c) => classifyCommitMessage(c.subject) === "fix-shaped"),
    reProofs,
  };
}

/**
 * Format a share as a percentage, or report an ABSENCE when the denominator is zero.
 *
 * A zero denominator must never render as `0.0%`. Increment 1 established the rule and the arc's
 * end state requires it: "we measured, and the answer is none" and "we could not measure" are
 * different findings and must read differently.
 */
export function share(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * How many commits fell into each class. A NAMED contract with one field per {@link CommitClass}
 * rather than an open `Record`: every bucket is present by construction, so a class that scored
 * nothing renders as a zero instead of vanishing from the table — and an absent bucket is not a
 * measurement.
 */
export interface ClassTally {
  readonly "re-proof": number;
  readonly "fix-shaped": number;
  readonly feature: number;
  readonly refactor: number;
  readonly "test-only": number;
  readonly housekeeping: number;
  readonly unclassified: number;
}

/** Per-class counts over a commit list, including the zeroes. */
export function classTally(commits: readonly UnitCommit[]): ClassTally {
  const tally = {
    "re-proof": 0,
    "fix-shaped": 0,
    feature: 0,
    refactor: 0,
    "test-only": 0,
    housekeeping: 0,
    unclassified: 0,
  } satisfies ClassTally;
  for (const c of commits) tally[classifyCommitMessage(c.subject)] += 1;
  return tally;
}

/** Everything the report needs that this module cannot derive from the commits alone. */
export interface ReportInputs {
  /** Verdicts offered by the store. The outermost denominator. */
  readonly verdictsSeen: number;
  /** How many carried an ADR-0016 `boundHash`. A finding in its own right — see the module header. */
  readonly verdictsWithBoundHash: number;
  /** Verdicts that resolved to a declared proof pair. */
  readonly verdictsResolved: number;
  /** Units those verdicts covered. */
  readonly unitsResolved: number;
  /** Units whose proof commit is not in this checkout's history — a THIRD state, never a zero. */
  readonly unitsProofCommitMissing: number;
  /** ISO date the reading was taken. */
  readonly takenOn: string;
}

/** Sort a rung's commits for display: most test lines added first, then by unit for stability. */
export function orderForDisplay(commits: readonly UnitCommit[]): readonly UnitCommit[] {
  return [...commits].sort(
    (a, b) => b.testLinesAdded - a.testLinesAdded || a.unitId.localeCompare(b.unitId) || a.sha.localeCompare(b.sha),
  );
}

/**
 * Render the whole reading as markdown.
 *
 * The smoke-test caveat is emitted HERE, in the document's own words, rather than left to a commit
 * message or a PR body — the increment requires that a later reader cannot quote a number from this
 * file as a clean one without also reading why it is not.
 */
export function renderReport(l: Ladder, inputs: ReportInputs): string {
  const out: string[] = [];
  out.push("# Has a signed GREEN ever been contradicted by later history?");
  out.push("");
  out.push(
    `**Taken ${inputs.takenOn}.** \`verdict-accuracy-arc\` increment 2. Instrument: ` +
      "`packages/cli/src/verdict-contradiction.ts` (+ `.run.ts`), run as `pnpm verdict-contradiction`.",
  );
  out.push("");
  out.push("## ⚠ Read this before quoting any number below");
  out.push("");
  out.push(
    "**This is a SMOKE TEST, not a precision figure.** It establishes whether the phenomenon " +
      "exists and roughly how often. It does not measure a false-pass RATE, and no number in it " +
      "should be quoted as one.",
  );
  out.push("");
  out.push(
    "The reason is in the method and cannot be engineered away. Classifying a commit as a fix " +
      "rather than a refactor or a feature is unreliable in both directions: a message saying " +
      '"fix" may be a rename, and a real regression may land with no such word. The heuristic here ' +
      "is deliberately biased to OVER-report — commits it cannot classify at all stay in the " +
      "shortlist rather than being dropped — so the widest rungs are upper bounds and the shortlist " +
      "is a reading list, not a result. **The cases are the useful output; the counts are context " +
      "for them.**",
  );
  out.push("");
  out.push(
    "No LLM judge is used, deliberately. `docs/research/benchmark-landscape-2026-09-04.md` records " +
      "the published finding that LLM judges cannot detect false completion (AUROC ≤0.65) where " +
      "programmatic state checks can, which is the whole reason the spine is deterministic.",
  );
  out.push("");
  out.push(
    "This document BANKS A READING and adjudicates nothing — no gate rung is added, no threshold " +
      "is set, and no guidance changes on the strength of anything below (the arc's posture: " +
      '"measure first, decide never"). If a case here is a genuine false pass, that is an owner ' +
      "fork to be opened on the evidence, not a decision taken inside the increment that found it.",
  );
  out.push("");
  out.push("## The population, and the premise that had to be re-scoped first");
  out.push("");
  out.push(
    "> **Finding 1 — the increment's own method selects an empty set, and this run re-confirmed it.** " +
      `\`boundHash\` — ADR-0016's binding anchor, the field that would say WHICH BYTES a verdict ` +
      `proved — is stamped on **${inputs.verdictsWithBoundHash} of ${inputs.verdictsSeen}** stored ` +
      "verdicts. The increment as authored says \"for each `--real` verdict with a `boundHash`, " +
      'resolve the span it bound"; there are none, on any row, and a content hash of a span as it ' +
      "stood at proof time cannot be back-filled afterwards. Span grain is unavailable for this " +
      "entire corpus. (Increment 1 measured this first; it is re-measured here rather than inherited.)",
  );
  out.push("");
  out.push(
    "So the reading below is taken at **declared-proof-pair grain** instead: a unit's `real.testFile` " +
      "and `real.sourceFile`, the two paths the phase machine builds its write walls from, resolved " +
      "the same way `leaf-test-strength.ts` resolves them. That is coarser than a span, and the " +
      "ladder below exists because of it.",
  );
  out.push("");
  out.push("| | count | |");
  out.push("|---|---:|---|");
  out.push(`| verdicts in \`events.verdict\` | ${inputs.verdictsSeen} | every row |`);
  out.push(`| carrying a \`boundHash\` | ${inputs.verdictsWithBoundHash} | Finding 1 |`);
  out.push(`| resolved to a declared proof pair | ${inputs.verdictsResolved} | the population |`);
  out.push(`| distinct units those cover | ${inputs.unitsResolved} | deduped — a unit proved four times counts once |`);
  out.push(
    `| units whose proof commit is not in this checkout | ${inputs.unitsProofCommitMissing} | a THIRD state: the proof ran on a branch since squashed away, so git cannot answer |`,
  );
  out.push(`| **units history could be walked for** | **${l.unitsConsidered}** | the denominator for every rate below |`);
  out.push("");
  out.push("## The ladder");
  out.push("");
  out.push(
    "Each rung is a strict subset of the one above it. The widest admits everything, including " +
      "commits that could not be classified; the narrowest is small enough to read by hand. " +
      "`units` matters as much as `commits`: forty commits over three units is a different claim " +
      "from forty over forty.",
  );
  out.push("");
  out.push("| rung | rows | distinct commits | units | units as share of the denominator | admits |");
  out.push("|---|---:|---:|---:|---:|---|");
  for (const r of l.rungs) {
    out.push(
      `| \`${r.key}\` | ${r.commits.length} | ${r.distinctCommits} | ${r.units} | ${share(r.units, l.unitsConsidered)} | ${r.says} |`,
    );
  }
  out.push("");
  out.push(
    "**`rows` is not a count of distinct events, and the gap is large.** Units share files — three " +
      "terminal units all declare the same studio component as their source file — so one commit is " +
      "counted once per unit it reaches. Read `distinct commits` as the number of things that " +
      "happened and `rows` as the number of (unit, commit) pairs. This is a property of file grain, " +
      "not a defect of the walk, and it is one more reason the span-level anchor would be worth " +
      "having.",
  );
  out.push("");
  out.push(
    `Set aside before the ladder starts: **${l.reProofs.length}** spine re-proof commits ` +
      "(`storytree real build …`). Those touch the proved pair by construction every time a unit is " +
      "re-proved, and they are not contradictions — re-proving a unit means the leaf wrote a NEW " +
      "test which the spine watched go red against the CURRENT source, and that red is about the " +
      "new test, not about the old code being broken. Left in, they would have dominated the " +
      "shortlist.",
  );
  out.push("");
  out.push("### What the test file is worth");
  out.push("");
  out.push(
    "The increment's fallback option was file grain alone — \"did a later fix touch that FILE\". " +
      `Taken on its own that reading returns **${l.sourceOnlyFixShaped.length}** commits over ` +
      `**${distinctUnits(l.sourceOnlyFixShaped)}** units. The ladder's shortlist is ` +
      `**${l.rungs[l.rungs.length - 1]?.commits.length ?? 0}**, because it also requires the unit's ` +
      "own declared test file to have been touched and to have grown. Both are reported: the " +
      "narrowing is shown, not asserted.",
  );
  out.push("");
  out.push("### How the classifier read the widest rung");
  out.push("");
  const widest = l.rungs[0]?.commits ?? [];
  const tally = classTally(widest);
  out.push("| class | commits |");
  out.push("|---|---:|");
  for (const [k, v] of Object.entries(tally)) out.push(`| \`${k}\` | ${v} |`);
  out.push("");
  out.push(
    "`unclassified` is not noise and is not dropped: this repo's history carries a large minority " +
      "of commits with no conventional-commit prefix, and treating them as noise would silently " +
      "discard the biggest unexamined bucket. They stay in the shortlist.",
  );
  out.push("");
  out.push("## The shortlist — the useful output");
  out.push("");
  const shortlist = l.rungs[l.rungs.length - 1]?.commits ?? [];
  if (shortlist.length === 0) {
    out.push(
      "**Empty.** No later commit touched a proved unit's source AND its declared test file, added " +
        "lines to that test, and read as a repair. Over " +
        `${l.unitsConsidered} units this is a measured absence, not an unmeasured one.`,
    );
  } else {
    out.push(
      `**${shortlist.length} commits over ${distinctUnits(shortlist)} units.** Ordered by lines ` +
        "added to the proved test file — the crudest available proxy for how much the oracle had to " +
        "grow. Each row is a CANDIDATE to read, never a confirmed false pass.",
    );
    out.push("");
    out.push("| unit | +test lines | class | commit | subject |");
    out.push("|---|---:|---|---|---|");
    for (const c of orderForDisplay(shortlist)) {
      const subject = c.subject.replace(/\|/gu, "\\|");
      out.push(
        `| \`${c.unitId}\` | ${c.testLinesAdded} | ${classifyCommitMessage(c.subject)} | \`${c.sha.slice(0, 8)}\` | ${subject} |`,
      );
    }
  }
  out.push("");
  out.push("## Re-running this over other work");
  out.push("");
  out.push(
    "The arc's end state 3 requires that both instruments attach to a real engagement without new " +
      "design. This one needs three things and nothing else: verdict rows in `events.verdict` " +
      "carrying a `unitId` and a `commitSha`; specs under `stories/**` whose `proof:` blocks declare " +
      "a `real:` arm; and a git history containing those commits. `pnpm verdict-contradiction` " +
      "against a checkout and store satisfying those re-takes the whole reading. Two limits travel " +
      "with it, both structural: history is followed by PATH, so a renamed file reads as an absent " +
      "one; and where a proof commit is not an ancestor of `HEAD` the walk is over-wide rather than " +
      "wrong, which is the direction this instrument is biased in anyway.",
  );
  out.push("");
  return out.join("\n");
}
