/**
 * ALTITUDE — `decision-read-measurement-arc-inc-03`'s arithmetic.
 *
 * The arc's second hypothesis: the decision log is ALTITUDE-MIXED, and that — not its size — is why
 * a 200-plus-artifact calibrate-to-these set cannot be calibrated on. "Own the agent loop" and "the
 * gate's skip code is 3" carry equal weight in one flat set. If reads CLUSTER by altitude, a single
 * flat rollup is the wrong object and the edge-rollup design changes shape before anyone builds it.
 *
 * PURE: no filesystem, no clock, no store, no `process.env`, no randomness of its own. Every input is
 * injected by {@link import("./probe-decision-altitude.js")}, and the one place this needs randomness
 * — the permutation test — takes a declared SEED and runs a deterministic generator, so the p-value
 * is reproducible to the digit rather than merely reproducible in distribution.
 *
 * ## THE TAXONOMY IS KRUCHTEN'S, AND IT PREDATES US
 *
 * Kruchten's ontology of architectural design decisions (2004) classifies a decision as EXISTENCE
 * (*ontocrisis* — a named element will exist, is composed thus, or is BANNED/removed, which is his
 * *anticrisis* and still an existence claim), PROPERTY (*diacrisis* — an enduring overarching trait,
 * rule or constraint holding ACROSS elements, not itself a nameable element), or EXECUTIVE
 * (*pericrisis* — driven by the business environment: the development process, the people, and the
 * choice of technology and tools). The increment fixes these three rather than Anthony's
 * strategic/control/operational triangle, because they are native to architectural decisions and
 * were not invented here to fit the answer.
 *
 * **THE ALTITUDE READING BEING TESTED, STATED SO IT CAN FAIL.** Kruchten's three are a KIND taxonomy
 * and not strictly an altitude ladder. The reading this increment tests is the one implied by
 * scope-of-effect — `EXECUTIVE ≳ PROPERTY > EXISTENCE` — because executive and property decisions
 * constrain many elements while an existence decision is local to the element it names. If reads
 * cluster by altitude, executive and property decisions are read BROADLY and existence decisions
 * NARROWLY. Writing that down before the join is what makes "they do not" a result rather than a
 * shrug.
 *
 * ## CLASSIFY FIRST, JOIN SECOND — AND THIS MODULE CANNOT SEE THE READS WHILE IT CLASSIFIES
 *
 * {@link classifyAltitudeLexically} takes a title and the decision's own prose and NOTHING ELSE. It
 * is not handed reach, chain depth, or the offer record, and it has no parameter through which they
 * could arrive. The blindness is structural rather than a promise in a comment, which is the only
 * form of it worth anything: a classifier that could see the outcome it is about to be joined to
 * would make the clustering result unfalsifiable.
 *
 * ## AN UNREAD DECISION IS A ZERO, NOT A MISSING ROW
 *
 * {@link computeAltitudeReading} builds each class's reach vector over EVERY classified decision the
 * log holds, entering 0 for the ones no session read. Restricting the test to decisions that were
 * read would compare classes on a subset selected by the very variable under test, and would report
 * a difference in reach among the read while the real difference — whether a class gets read at all —
 * silently left the denominator. 46 of 416 decisions are unread; they are 46 zeros here.
 *
 * ## THE JOIN KEY IS A NUMBER BOTH SIDES ALREADY RESOLVED
 *
 * Reach rows arrive from `decision-read-baseline.ts`, which resolved every observed id through
 * `resolveDecisionId` before counting it. Labels arrive keyed by an id STRING, and
 * {@link resolveLabelSet} puts them through THE SAME function — one resolution point, per ADR-0403
 * dec 7. No string is ever compared to a string anywhere in this file. `-inc-01` measured what a raw
 * join costs on this corpus: 0.9% against 32.4%, a ~35x under-count that reports no error, and an
 * altitude join is exactly the shape that would swallow it silently, because a class whose labels all
 * failed to resolve reads as a class nobody consults.
 *
 * ## "NO CLUSTERING" AND "NOTHING WAS CLASSIFIED" MUST NEVER PRINT THE SAME WAY
 *
 * {@link altitudeVacuity} is `decisionWalkVacuity`'s discipline reused rather than re-derived:
 * REASONS, not a boolean, because the causes have different remedies. A p-value near 1 over three
 * populated classes is a FINDING — the log's altitude does not predict how broadly a decision is
 * read. A p-value near 1 because every label failed to resolve, or because the taxonomy collapsed
 * into one bucket, is an instrument reading, and it exits non-zero instead.
 *
 * ## THE AGREEMENT RATE IS WORTH MORE THAN THE JOIN
 *
 * The increment says so outright, and {@link agreementBetween} is why: a classification two passes
 * cannot reproduce is not one a rollup can be built over, whatever the join says. It reports the raw
 * rate AND Cohen's kappa, because a three-class distribution this uneven makes a raw rate flattering
 * — two passes that both guessed the majority class every time would agree far above chance-free
 * expectation. The confusion matrix is reported beside them so a reader can see WHERE the passes
 * part, which is the part that tells you whether the boundary is real.
 */

// ---------------------------------------------------------------------------
// The taxonomy
// ---------------------------------------------------------------------------

/** Kruchten's three classes. Ordered here by the scope-of-effect altitude reading under test. */
export const ALTITUDE_CLASSES = ["executive", "property", "existence"] as const;

export type AltitudeClass = (typeof ALTITUDE_CLASSES)[number];

/** One decision's altitude, as one pass judged it. `basis` is the pass's own short reason code. */
export interface AltitudeLabel {
  /** The decision id AS AUTHORED — resolved through `resolveDecisionId`, never string-compared. */
  readonly id: string;
  readonly altitude: AltitudeClass;
  /** A short reason code from the pass's own vocabulary. Auditable; never used in any arithmetic. */
  readonly basis?: string;
}

/** A label set after resolution: decision number → class, plus what could not be resolved. */
export interface ResolvedLabelSet {
  readonly byDecision: ReadonlyMap<number, AltitudeClass>;
  /** Label ids no resolver could turn into a decision number. Counted, never silently dropped. */
  readonly unresolved: readonly string[];
  /** Ids that resolved to the SAME decision twice. A duplicate is a defect, not a merge. */
  readonly duplicates: readonly number[];
}

/**
 * Resolve a label set's ids to decision numbers through the corpus's single resolution point.
 *
 * `resolve` is injected rather than imported so this module stays free of every dependency: the probe
 * hands it `resolveDecisionId`. Passing a resolver that answers `null` for everything is what
 * {@link ResolvedLabelSet.unresolved} exists to make visible — a silently empty join is the failure
 * this whole file is shaped around.
 */
export function resolveLabelSet(
  labels: readonly AltitudeLabel[],
  resolve: (id: string) => { number: number } | null,
): ResolvedLabelSet {
  const byDecision = new Map<number, AltitudeClass>();
  const unresolved: string[] = [];
  const duplicates: number[] = [];
  for (const label of labels) {
    const resolved = resolve(label.id);
    if (resolved === null) {
      unresolved.push(label.id);
      continue;
    }
    if (byDecision.has(resolved.number)) duplicates.push(resolved.number);
    byDecision.set(resolved.number, label.altitude);
  }
  return { byDecision, unresolved, duplicates };
}

// ---------------------------------------------------------------------------
// Reading a decision's own prose
// ---------------------------------------------------------------------------

/**
 * PURE: a decision's `## Decision` section, or the whole body when it has none.
 *
 * INDEX ARITHMETIC, NEVER A `\Z` LOOKAHEAD. JavaScript has no `\Z` anchor, so
 * `(?=^##\s|\Z)` compiles its second alternation branch to a LITERAL `z` and cuts every section at
 * the first one it meets — `Operationali|ze`, `normali|zed`, `reali|zes`. This increment's first
 * extractor was written that way and silently truncated 228 of 416 sections, 30 of them to under 200
 * characters, while still returning plausible prose. Nothing about the output looked wrong, which is
 * the whole reason it survived to be caught by hand.
 *
 * Fenced code is removed so a quoted snippet cannot supply signal words the prose never used, and
 * whitespace is collapsed so a density score cannot be moved by formatting. The fallback for a body
 * with no `## Decision` heading is the WHOLE body rather than the empty string: an empty string
 * would score every class at zero and return a near-tie verdict that reads like a classification
 * rather than like an absence.
 */
export function decisionSection(body: string): string {
  const heading = /^##\s+Decision[^\n]*\n/im.exec(body);
  const raw = ((): string => {
    if (heading === null) return body;
    const rest = body.slice(heading.index + heading[0].length);
    const next = /^##\s/m.exec(rest);
    return next === null ? rest : rest.slice(0, next.index);
  })();
  return raw.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// PASS B — the lexical classifier, and an honest account of what it is
// ---------------------------------------------------------------------------

/**
 * A cheap, deterministic, committed second opinion — NOT a second mind, and the report says so.
 *
 * It reads a decision's title and its `## Decision` prose and scores three signal families derived
 * from Kruchten's own definitions. Its value is not that it is as good as an editorial reading; it is
 * that it is REPRODUCIBLE and INDEPENDENT OF THE EDITORIAL PASS'S LABELS, so the agreement between
 * the two measures how much of an altitude judgment is recoverable from surface text — which is
 * exactly what an automated rollup would have to recover.
 *
 * SCORES ARE PER-1000-CHARACTER DENSITIES, AND THAT GOVERNS THE REPORTED SCORE AND THE NEAR-TIE
 * FLAG — NOT THE CLASS. Stated precisely because the loose version is false and a mutation test
 * caught it: all three families are divided by the SAME body length, so the divisor cancels in the
 * argmax and the winning class is exactly `argmax(titleHits * TITLE_WEIGHT + bodyHits)`. What the
 * normalisation buys is that {@link LexicalVerdict.scores} are comparable BETWEEN decisions — a
 * 38,000-character decision and a 1,700-character one are scored on the same scale — which is the
 * only thing that makes a fixed {@link NEAR_TIE} threshold mean anything.
 *
 * The title is weighted heavily because the rubric classifies by the PRIMARY claim, and the title is
 * where this corpus states it (median title length: 83 characters — these are sentences, not slugs).
 */
export interface LexicalVerdict {
  readonly altitude: AltitudeClass;
  /** Per-class score, so a near-tie is visible rather than hidden behind an argmax. */
  readonly scores: Readonly<Record<AltitudeClass, number>>;
  /** True when the top two scores are within {@link NEAR_TIE}. Reported, never silently resolved. */
  readonly nearTie: boolean;
}

/** How close two class scores must be before the verdict is declared a near-tie. */
export const NEAR_TIE = 0.15;

/** Weight on a title hit relative to a body hit — the title states the primary claim. */
const TITLE_WEIGHT = 6;

/** Characters of body prose one "density unit" represents. */
const DENSITY_WINDOW = 1000;

/**
 * EXECUTIVE — the business environment: our own way of working, our roles, our money, our vendors.
 *
 * The one adaptation this corpus forces is declared here rather than smuggled: Kruchten defines
 * executive by its DRIVER ("affects the development process"), and THIS PROJECT'S PRODUCT IS A
 * DEVELOPMENT PROCESS, so a literal reading collapses the taxonomy into one bucket. The line taken —
 * in the rubric and in these patterns — is that executive is judged against OUR OWN working and
 * purchasing, never against the process storytree ships as a product.
 */
const EXECUTIVE_PATTERNS: readonly RegExp[] = [
  // Vendors, runtimes and bought tools — Kruchten's "choices of technologies and tools", verbatim.
  /\b(?:postgres|dbos|cloud sql|gcp|cloud run|cloud build|terraform|github actions|electron|vite|three\.js|react-three-fiber|blender|pixellab|keystatic|oxlint|typescript 7|pnpm|bun|tsx|xterm|node-pty)\b/gi,
  /\b(?:claude|codex|cursor|gemini|chatgpt|anthropic|openai|agent sdk|subscription)\b/gi,
  /\b(?:adopt|vendor|borrow|rent|buy|off-the-shelf|established|upstream)\b/gi,
  // Our own ceremonies and the way sessions are run.
  /\b(?:ceremony|merge ceremony|closing leg|debrief|retro|onboarding|dogfood|handoff|worklist)\b/gi,
  /\b(?:session|sessions|fresh session|in-thread|cut a session|inert)\b/gi,
  /\b(?:priority|deferral|deferred|scoped as its own arc|withdrawn|is not built|stops)\b/gi,
  // Roles and authority — who is allowed to do what.
  /\b(?:owner|operator|human|agent|subagent|librarian|curator|delegate|role|authority|permitted|may hold)\b/gi,
  // Money.
  /\b(?:cost|budget|usd|spend|billing|price|ceiling|token|cheap|expensive)\b/gi,
];

/** PROPERTY — an enduring rule, quality or constraint holding ACROSS elements. */
const PROPERTY_PATTERNS: readonly RegExp[] = [
  // Deontic language: the never/always/must that binds regardless of which element implements it.
  /\b(?:never|always|must|may not|cannot|refuses?|refusal|forbidden|is not|stays|remains)\b/gi,
  /\b(?:invariant|rule|constraint|guarantee|obligation|precondition|posture|discipline)\b/gi,
  /\b(?:fail-closed|fail closed|honest|honesty|earned|provisional|durable|immutable|binding|binds)\b/gi,
  // Meaning-fixing: what a term or signal MEANS, which is a property of the system not an element.
  /\b(?:means|semantics|only when|only if|exactly|the whole meaning|no longer)\b/gi,
  /\b(?:enforced|gated|bounded|narrowed|scoped to|measures what|charged by)\b/gi,
];

/** EXISTENCE — a named element exists, is composed thus, is moved, or is removed (the ban). */
const EXISTENCE_PATTERNS: readonly RegExp[] = [
  // Repo-shaped nouns: the thing you can point at.
  /(?:packages|apps|stories|docs|scripts|infra)\/[a-z0-9-]/gi,
  /\b(?:package|module|seam|port|kind|field|table|column|endpoint|route|verb|command|flag|panel|drawer|lens|tab|component|renderer|adapter|store|schema)\b/gi,
  // Creation and destruction — Kruchten's ontocrisis and anticrisis.
  /\b(?:a new|add|adds|introduce|introduces|gains?|ships?|extract|extracted|carve|split|move[sd]?|rename[sd]?)\b/gi,
  /\b(?:retire[sd]?|retirement|delete[sd]?|remove[sd]?|dissolve[sd]?|drop|collapse[sd]?|replaces?)\b/gi,
  /\b(?:exists?|lives? in|owns? its own|is its own|becomes? (?:a|an|one|its))\b/gi,
];

function densityScore(patterns: readonly RegExp[], title: string, body: string): number {
  let titleHits = 0;
  let bodyHits = 0;
  for (const pattern of patterns) {
    titleHits += countMatches(pattern, title);
    bodyHits += countMatches(pattern, body);
  }
  const bodyUnits = Math.max(1, body.length / DENSITY_WINDOW);
  return (titleHits * TITLE_WEIGHT + bodyHits) / bodyUnits;
}

function countMatches(pattern: RegExp, text: string): number {
  // `String.prototype.match` with a /g/ pattern, NOT an `exec` loop — the state is removed rather
  // than guarded. A hand-rolled `while (pattern.exec(text) !== null)` over a MODULE-LEVEL /g/ regex
  // carries `lastIndex` between calls, so an early `break` would leave it non-zero and the next
  // decision would be scored from part-way through its own text. That would make a committed second
  // opinion depend on what was classified before it, which is the one property it may not have.
  // `match` resets `lastIndex` itself and returns every match, so there is no cursor to leak and no
  // arbitrary cap to break out of.
  return text.match(pattern)?.length ?? 0;
}

/**
 * PASS B's verdict for one decision. Blind to reach by construction — there is no parameter for it.
 *
 * The tie-break is the rubric's declared precedence `EXISTENCE > PROPERTY > EXECUTIVE`: existence
 * first because it is the most concrete and therefore the least arbitrary, executive last because its
 * definition is the broadest and would otherwise absorb every tie.
 */
export function classifyAltitudeLexically(input: {
  readonly title: string;
  readonly decisionText: string;
}): LexicalVerdict {
  const title = input.title;
  const body = input.decisionText;
  const scores: Record<AltitudeClass, number> = {
    executive: densityScore(EXECUTIVE_PATTERNS, title, body),
    property: densityScore(PROPERTY_PATTERNS, title, body),
    existence: densityScore(EXISTENCE_PATTERNS, title, body),
  };
  const precedence: readonly AltitudeClass[] = ["existence", "property", "executive"];
  let best: AltitudeClass = "existence";
  for (const candidate of precedence) {
    if (scores[candidate] > scores[best]) best = candidate;
  }
  const sorted = [...ALTITUDE_CLASSES].map((c) => scores[c]).sort((a, b) => b - a);
  const top = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  return { altitude: best, scores, nearTie: top - second < NEAR_TIE };
}

// ---------------------------------------------------------------------------
// AGREEMENT — worth more than the join, per the increment's own brief
// ---------------------------------------------------------------------------

/** One cell of the confusion matrix: pass A said `a`, pass B said `b`, this many times. */
export interface ConfusionCell {
  readonly a: AltitudeClass;
  readonly b: AltitudeClass;
  readonly count: number;
}

export interface AgreementReading {
  /** Decisions BOTH passes labelled — the only population an agreement rate may be taken over. */
  readonly compared: number;
  readonly onlyInA: number;
  readonly onlyInB: number;
  readonly agreed: number;
  /** `agreed / compared`, or 0 when nothing was compared (which {@link altitudeVacuity} reports). */
  readonly rate: number;
  /** Agreement expected from the two passes' MARGINALS alone — the number kappa corrects for. */
  readonly expectedByChance: number;
  /** Cohen's kappa. Null when expected agreement is 1 and the correction is undefined. */
  readonly kappa: number | null;
  readonly confusion: readonly ConfusionCell[];
}

/**
 * Two passes' agreement over the decisions BOTH labelled.
 *
 * REPORTED WITH KAPPA, NEVER THE RAW RATE ALONE. This corpus's altitude distribution is uneven, and
 * a raw rate rewards two passes for sharing a prior about which class is commonest. Kappa asks the
 * sharper question — how much of the agreement survives once each pass's own marginal habits are
 * subtracted — and it is the number that says whether the boundary between classes is real enough to
 * build a rollup on.
 */
export function agreementBetween(
  a: ReadonlyMap<number, AltitudeClass>,
  b: ReadonlyMap<number, AltitudeClass>,
): AgreementReading {
  const shared: Array<[AltitudeClass, AltitudeClass]> = [];
  for (const [decision, classA] of a) {
    const classB = b.get(decision);
    if (classB !== undefined) shared.push([classA, classB]);
  }
  const compared = shared.length;
  const agreed = shared.filter(([x, y]) => x === y).length;

  const marginalA = new Map<AltitudeClass, number>();
  const marginalB = new Map<AltitudeClass, number>();
  for (const [x, y] of shared) {
    marginalA.set(x, (marginalA.get(x) ?? 0) + 1);
    marginalB.set(y, (marginalB.get(y) ?? 0) + 1);
  }
  let expected = 0;
  if (compared > 0) {
    for (const klass of ALTITUDE_CLASSES) {
      expected += ((marginalA.get(klass) ?? 0) / compared) * ((marginalB.get(klass) ?? 0) / compared);
    }
  }
  const rate = compared === 0 ? 0 : agreed / compared;
  const kappa = compared === 0 || expected >= 1 ? null : (rate - expected) / (1 - expected);

  const confusion: ConfusionCell[] = [];
  for (const x of ALTITUDE_CLASSES) {
    for (const y of ALTITUDE_CLASSES) {
      const count = shared.filter(([p, q]) => p === x && q === y).length;
      if (count > 0) confusion.push({ a: x, b: y, count });
    }
  }

  return {
    compared,
    onlyInA: a.size - compared,
    onlyInB: b.size - compared,
    agreed,
    rate,
    expectedByChance: expected,
    kappa,
    confusion,
  };
}

// ---------------------------------------------------------------------------
// The clustering test — Kruskal–Wallis H, p-value by seeded permutation
// ---------------------------------------------------------------------------

/**
 * A deterministic generator, so a p-value is reproducible to the digit.
 *
 * `Math.random()` would make this file impure and the reported p-value unrepeatable, and a permutation
 * p-value that moves between runs invites re-running until it reads well. mulberry32 over a declared
 * seed removes the temptation along with the impurity.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Average ranks, ties shared — the standard correction, and it matters here: reach is mostly 0s. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((x, y) => x.value - y.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j += 1;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k]!.index] = shared;
    i = j + 1;
  }
  return ranks;
}

/** Kruskal–Wallis H with the standard tie correction. 0 when fewer than two groups have members. */
export function kruskalWallisH(groups: readonly (readonly number[])[]): number {
  const populated = groups.filter((g) => g.length > 0);
  if (populated.length < 2) return 0;
  const flat = populated.flat();
  const total = flat.length;
  const ranks = averageRanks(flat);

  let cursor = 0;
  let sum = 0;
  for (const group of populated) {
    let rankSum = 0;
    for (let i = 0; i < group.length; i += 1) rankSum += ranks[cursor + i]!;
    sum += (rankSum * rankSum) / group.length;
    cursor += group.length;
  }
  const h = (12 / (total * (total + 1))) * sum - 3 * (total + 1);

  const tieCounts = new Map<number, number>();
  for (const value of flat) tieCounts.set(value, (tieCounts.get(value) ?? 0) + 1);
  let tieSum = 0;
  for (const count of tieCounts.values()) tieSum += count * count * count - count;
  const correction = 1 - tieSum / (total * total * total - total);
  if (correction <= 0) return 0;
  return h / correction;
}

export interface ClusteringVerdict {
  /** Kruskal–Wallis H over the classes' reach ranks. */
  readonly statistic: number;
  /**
   * `(1 + permutations at least as extreme) / (1 + iterations)` — never a bare proportion, so a
   * p-value can never read as exactly 0 on finite evidence.
   */
  readonly pValue: number;
  readonly iterations: number;
  readonly seed: number;
  /** Classes with at least one member. Fewer than two and there is nothing to compare. */
  readonly groupsCompared: number;
  /** Decisions in the test — EVERY classified decision, unread ones entering as 0. */
  readonly observationsCompared: number;
  /** Plain-language effect size: the gap between the highest and lowest class median reach. */
  readonly medianSpread: number;
  /** The same for means, as a ratio. Null when the smallest class mean is 0. */
  readonly meanRatio: number | null;
}

/**
 * Does reach differ by class beyond what shuffling the labels would produce?
 *
 * A PERMUTATION p-value rather than a chi-square approximation, for two reasons that both bite here:
 * the reach distribution is extremely non-normal (a median of 3 and a maximum of 31, with 46 zeros),
 * and a permutation test needs no special-function implementation that would itself have to be
 * trusted. The null being permuted is exactly the one in question — that a decision's altitude tells
 * you nothing about how broadly it is read.
 */
export function clusteringVerdict(
  groups: readonly (readonly number[])[],
  options: { readonly seed: number; readonly iterations: number },
): ClusteringVerdict {
  const populated = groups.filter((g) => g.length > 0);
  const flat = populated.flat();
  const observed = kruskalWallisH(populated);
  const sizes = populated.map((g) => g.length);

  const random = mulberry32(options.seed);
  let atLeastAsExtreme = 0;
  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const shuffled = [...flat];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const swap = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = swap;
    }
    const regrouped: number[][] = [];
    let cursor = 0;
    for (const size of sizes) {
      regrouped.push(shuffled.slice(cursor, cursor + size));
      cursor += size;
    }
    if (kruskalWallisH(regrouped) >= observed) atLeastAsExtreme += 1;
  }

  const medians = populated.map(median);
  const means = populated.map(mean);
  const smallestMean = Math.min(...means);

  return {
    statistic: observed,
    pValue: (1 + atLeastAsExtreme) / (1 + options.iterations),
    iterations: options.iterations,
    seed: options.seed,
    groupsCompared: populated.length,
    observationsCompared: flat.length,
    medianSpread: populated.length < 2 ? 0 : Math.max(...medians) - Math.min(...medians),
    meanRatio: populated.length < 2 || smallestMean === 0 ? null : Math.max(...means) / smallestMean,
  };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// ---------------------------------------------------------------------------
// THE JOIN
// ---------------------------------------------------------------------------

/** One decision's reach, as `decision-read-baseline.ts` already resolved and counted it. */
export interface AltitudeReachRow {
  readonly decision: number;
  /** DISTINCT sessions that read it — the baseline's rank key, carried over unchanged. */
  readonly sessions: number;
}

/** A decision-to-decision support edge, by number. The two types stay APART (ADR-0419 D1). */
export interface AltitudeEdge {
  readonly from: number;
  readonly to: number;
}

export interface AltitudeReadingInput {
  /** Every decision number the log holds — the subject denominator. */
  readonly decisionsInLog: readonly number[];
  /** The primary (editorial) classification, already resolved to numbers. */
  readonly labels: ReadonlyMap<number, AltitudeClass>;
  /** Reach rows for the sessions that read a decision. Absent decisions are zeros, not omissions. */
  readonly reach: readonly AltitudeReachRow[];
  /** Sessions in the reach denominator — echoed so a share can be checked against it. */
  readonly sessionsInDenominator: number;
  /** The two support-edge populations, handed in APART and never summed into one figure. */
  readonly amends: readonly AltitudeEdge[];
  readonly dependsOn: readonly AltitudeEdge[];
  readonly seed: number;
  readonly iterations: number;
}

export interface ClassReach {
  readonly altitude: AltitudeClass;
  readonly decisions: number;
  readonly shareOfLog: number;
  readonly read: number;
  readonly neverRead: number;
  readonly totalReach: number;
  readonly shareOfReach: number;
  readonly meanReach: number;
  readonly medianReach: number;
  readonly maxReach: number;
}

/** Within-class vs cross-class, for ONE edge population. Never merged with the other's counts. */
export interface EdgeCrossing {
  readonly population: "amends" | "dependsOn" | "union-adjacency";
  readonly edges: number;
  /** Edges with BOTH endpoints classified — the only ones this split can be taken over. */
  readonly joined: number;
  readonly unjoined: number;
  readonly withinClass: number;
  readonly crossClass: number;
  readonly byPair: readonly EdgePairCount[];
}

export interface EdgePairCount {
  readonly from: AltitudeClass;
  readonly to: AltitudeClass;
  readonly count: number;
}

export interface AltitudeReading {
  // --- denominators of the SUBJECT ---
  readonly decisionsInLog: number;
  readonly decisionsClassified: number;
  readonly decisionsUnclassified: number;
  readonly labelsOntoUnknownDecisions: number;
  readonly classCounts: readonly ClassReach[];
  // --- denominators of the JOIN ---
  readonly reachRowsObserved: number;
  readonly reachRowsJoined: number;
  readonly reachRowsUnjoined: number;
  readonly sessionsInDenominator: number;
  readonly totalReach: number;
  // --- the result ---
  readonly clustering: ClusteringVerdict;
  readonly edgeCrossings: readonly EdgeCrossing[];
  readonly vacuity: readonly string[];
}

/**
 * The join, with every denominator on the way through.
 *
 * The reach vector for a class is built over EVERY classified decision in the log — see the header:
 * an unread decision is a 0, not a missing row, and dropping the zeros would test the classes on a
 * population selected by the outcome.
 */
export function computeAltitudeReading(input: AltitudeReadingInput): AltitudeReading {
  const logSet = new Set(input.decisionsInLog);
  const reachByDecision = new Map<number, number>();
  let reachRowsJoined = 0;
  for (const row of input.reach) {
    reachByDecision.set(row.decision, row.sessions);
    if (input.labels.has(row.decision) && logSet.has(row.decision)) reachRowsJoined += 1;
  }

  let labelsOntoUnknownDecisions = 0;
  const vectors = new Map<AltitudeClass, number[]>();
  for (const klass of ALTITUDE_CLASSES) vectors.set(klass, []);
  for (const [decision, klass] of input.labels) {
    if (!logSet.has(decision)) {
      labelsOntoUnknownDecisions += 1;
      continue;
    }
    vectors.get(klass)!.push(reachByDecision.get(decision) ?? 0);
  }

  const decisionsClassified = [...input.labels.keys()].filter((d) => logSet.has(d)).length;
  const grandTotalReach = [...vectors.values()].flat().reduce((a, b) => a + b, 0);

  const classCounts: ClassReach[] = ALTITUDE_CLASSES.map((altitude) => {
    const values = vectors.get(altitude)!;
    const totalReach = values.reduce((a, b) => a + b, 0);
    return {
      altitude,
      decisions: values.length,
      shareOfLog: decisionsClassified === 0 ? 0 : values.length / decisionsClassified,
      read: values.filter((v) => v > 0).length,
      neverRead: values.filter((v) => v === 0).length,
      totalReach,
      shareOfReach: grandTotalReach === 0 ? 0 : totalReach / grandTotalReach,
      meanReach: mean(values),
      medianReach: median(values),
      maxReach: values.length === 0 ? 0 : Math.max(...values),
    };
  });

  const clustering = clusteringVerdict(
    ALTITUDE_CLASSES.map((k) => vectors.get(k)!),
    { seed: input.seed, iterations: input.iterations },
  );

  const edgeCrossings: EdgeCrossing[] = [
    crossing("amends", input.amends, input.labels),
    crossing("dependsOn", input.dependsOn, input.labels),
    // The walk TRAVERSES both as one adjacency while COUNTING them apart (ADR-0419 D1). This row is
    // the adjacency, labelled as such and printed BESIDE the two populations rather than instead of
    // them, so no figure here is a blended edge COUNT standing in for the pair.
    crossing("union-adjacency", [...input.amends, ...input.dependsOn], input.labels),
  ];

  const reading: Omit<AltitudeReading, "vacuity"> = {
    decisionsInLog: logSet.size,
    decisionsClassified,
    decisionsUnclassified: logSet.size - decisionsClassified,
    labelsOntoUnknownDecisions,
    classCounts,
    reachRowsObserved: input.reach.length,
    reachRowsJoined,
    reachRowsUnjoined: input.reach.length - reachRowsJoined,
    sessionsInDenominator: input.sessionsInDenominator,
    totalReach: grandTotalReach,
    clustering,
    edgeCrossings,
  };
  return { ...reading, vacuity: altitudeVacuity(reading) };
}

function crossing(
  population: EdgeCrossing["population"],
  edges: readonly AltitudeEdge[],
  labels: ReadonlyMap<number, AltitudeClass>,
): EdgeCrossing {
  const pairs = new Map<string, number>();
  let joined = 0;
  let withinClass = 0;
  for (const edge of edges) {
    const from = labels.get(edge.from);
    const to = labels.get(edge.to);
    if (from === undefined || to === undefined) continue;
    joined += 1;
    if (from === to) withinClass += 1;
    const key = `${from}>${to}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const byPair: EdgePairCount[] = [...pairs.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split(">") as [AltitudeClass, AltitudeClass];
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);
  return {
    population,
    edges: edges.length,
    joined,
    unjoined: edges.length - joined,
    withinClass,
    crossClass: joined - withinClass,
    byPair,
  };
}

// ---------------------------------------------------------------------------
// VACUITY — reasons, not a boolean
// ---------------------------------------------------------------------------

/** Below this, a "no clustering" verdict is arithmetic over too little to mean anything. */
const VACUOUS_FLOOR = 10;

/**
 * PURE: the ways an altitude reading could be a number that measured nothing.
 *
 * **ASK WHAT INPUT WOULD MAKE THIS FIRE.** A label set whose ids all failed to resolve produces three
 * empty classes, a Kruskal–Wallis H of 0, and a p-value of 1 — which reads as "altitude does not
 * predict reach" and is in fact "the join was invisible". That is the same failure shape
 * `decisionWalkVacuity` was written for and the same one `-inc-01` measured at ~35x, and an altitude
 * join is where it would be least visible, because a silent class simply looks unpopular.
 *
 * Reasons rather than a boolean, because the remedies differ: a collapsed taxonomy is a rubric
 * problem, an empty join is a resolver problem, and an unread corpus is an instrument problem.
 */
export function altitudeVacuity(reading: Omit<AltitudeReading, "vacuity">): readonly string[] {
  const reasons: string[] = [];

  if (reading.decisionsInLog === 0) {
    reasons.push(
      "the decision log resolved to 0 decisions, so every figure below is arithmetic over an empty " +
        "subject — an unmigrated or unreachable store, never a log that holds none",
    );
  }

  if (reading.decisionsInLog > 0 && reading.decisionsClassified === 0) {
    reasons.push(
      `${reading.decisionsInLog} decisions are in the log and NONE carries an altitude label that ` +
        "resolved onto one, so the classification is invisible to the join — the id-spelling " +
        "regression `resolveDecisionId` exists to prevent, wearing an altitude coat",
    );
  }

  const populated = reading.classCounts.filter((c) => c.decisions > 0);
  if (reading.decisionsClassified >= VACUOUS_FLOOR && populated.length < 2) {
    reasons.push(
      `${reading.decisionsClassified} decisions were classified into ${populated.length} non-empty ` +
        "class(es), so the taxonomy collapsed and there is nothing to compare — a rubric that sorts " +
        "everything into one bucket cannot report an absence of clustering",
    );
  }

  if (reading.reachRowsObserved === 0) {
    reasons.push(
      "0 reach rows were supplied, so every class reads as never-consulted — an empty instrument " +
        "reading, never a finding that agents ignore the decision log",
    );
  } else if (reading.reachRowsJoined === 0) {
    reasons.push(
      `${reading.reachRowsObserved} reach rows were supplied and NONE joined a classified decision, ` +
        "so the join key is not shared between the two sides and any clustering verdict below is " +
        "computed over zeros",
    );
  }

  if (reading.decisionsClassified > 0 && reading.totalReach === 0) {
    reasons.push(
      "every classified decision has a reach of 0, so the class vectors are all-zero and the " +
        "clustering test compares three identical populations by construction",
    );
  }

  if (
    reading.clustering.observationsCompared > 0 &&
    reading.clustering.observationsCompared < VACUOUS_FLOOR
  ) {
    reasons.push(
      `only ${reading.clustering.observationsCompared} observations entered the clustering test, ` +
        `below the floor of ${VACUOUS_FLOOR} at which a permutation p-value says anything at all`,
    );
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// The held-out sample — drawn, never picked
// ---------------------------------------------------------------------------

/**
 * A deterministic held-out sample of decision numbers.
 *
 * DRAWN FROM A DECLARED SEED, NEVER HAND-PICKED, and the difference is the whole point. A sample
 * chosen by a person is a sample chosen by someone who has already read some of the corpus, and the
 * agreement rate over it would measure the choosing rather than the classifying. A seeded draw over
 * the sorted population is reproducible by anyone holding the same population, so a reader can check
 * that the sample was not selected after the labels were known.
 *
 * The population is sorted first so the draw cannot depend on the order rows happened to arrive in.
 */
export function drawHeldOutSample(
  population: readonly number[],
  options: { readonly seed: number; readonly size: number },
): number[] {
  const sorted = [...population].sort((a, b) => a - b);
  const random = mulberry32(options.seed);
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = sorted[i]!;
    sorted[i] = sorted[j]!;
    sorted[j] = swap;
  }
  return sorted.slice(0, Math.min(options.size, sorted.length)).sort((a, b) => a - b);
}
