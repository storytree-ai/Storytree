// refine.ts — station 4 of the building factory: the bounded render→look→refine loop
// with a pairwise, revert-only look guard (ADR-0217 decision 6, realized by ADR-0224).
//
// WHY THIS EXISTS. Stations 2 and 3 catch PHYSICS — a floating part, an inverted draw
// order. Nothing before this station catches LOOK: an edit that is physically sound but
// reads worse. Increments 4/5 recorded that every look defect so far was caught by a
// human rendering an image and looking; the machinery that catches look was 0% built.
// This is that machinery.
//
// WHAT IT IS, AND IS NOT. It is a GUARD, not a gate. Station 2's programmatic checker is
// the gate; this loop only stops a refine pass from making an asset WORSE. Its judge can
// only ever REVERT, never approve — the safety property (ADR-0224 D2): a wrong revert
// costs an improvement (recoverable); a wrong approval would ship a defect. And it does
// not replace the owner's stage-2 look attestation (ADR-0070) — it catches regressions
// inside the loop; the human still signs off taste.
//
// WHY A SEAM. The judge is a MODEL (a VLM), exactly as station 1's artist and station 5's
// owner are. So `LookJudge` is an injected seam: this pure, zero-dependency file carries
// the loop, the quorum, and the decision semantics, and a scripted judge for tests; the
// real VLM judge is supplied by the author-time caller. The Station-4 look-judge benchmark
// (docs/research/grounded-art-station4-look-judge-benchmark/) measured that a real judge in
// exactly this pairwise, revert-only, quorum shape agrees with the human 96% on visible
// defects with zero false reverts.

/** Which of the two renders the judge finds worse. `neither` includes a genuine "they
 *  look equivalent" abstain — the SAME verdict the benchmark let judges give. */
export type Worse = 'before' | 'after' | 'neither';

/** One pairwise verdict: the judge's only power is to name the EDITED render (`after`)
 *  worse, which is the sole trigger for a revert. */
export interface LookVerdict {
  worse: Worse;
  /** one line the caller can log / surface — why this verdict */
  reason?: string;
}

/**
 * A pairwise, revert-only look judge: given the render BEFORE an edit and the render
 * AFTER it, say which is worse (or neither). Injected, because the real judge is a model
 * call — see the file header. `R` is whatever the judge and the renderer agree to exchange
 * (an SVG string, a PNG path, a data URL); the loop never inspects it.
 */
export type LookJudge<R> = (before: R, after: R) => LookVerdict | Promise<LookVerdict>;

/**
 * Combine N independent judges into a QUORUM (ADR-0224 D3). The edit is condemned only
 * when at least `threshold` judges INDEPENDENTLY name the `after` worse; otherwise the
 * verdict is `neither` (keep). This is the guardrail the benchmark's single false revert
 * demanded: a lone dissenting judge can no longer throw away a good edit.
 *
 * `threshold` defaults to a majority of the panel (`floor(N/2) + 1`), i.e. 2 of 3.
 */
export function quorumJudge<R>(judges: readonly LookJudge<R>[], threshold?: number): LookJudge<R> {
  if (judges.length === 0) throw new Error('quorumJudge needs at least one judge');
  const need = threshold ?? Math.floor(judges.length / 2) + 1;
  if (need < 1 || need > judges.length) {
    throw new Error(`quorum threshold ${need} out of range 1..${judges.length}`);
  }
  return async (before, after) => {
    const verdicts = await Promise.all(judges.map((j) => Promise.resolve(j(before, after))));
    const afterWorse = verdicts.filter((v) => v.worse === 'after').length;
    if (afterWorse >= need) {
      return { worse: 'after', reason: `${afterWorse}/${judges.length} judges called the edit worse (>= ${need})` };
    }
    return { worse: 'neither', reason: `${afterWorse}/${judges.length} judges called the edit worse (< ${need}) — kept` };
  };
}

/** One proposed refinement: the artist (station 1's model) returns the EDITED asset plus
 *  a label. Returning `null` means the artist is satisfied and the loop stops early. */
export interface Proposal<A> {
  asset: A;
  label?: string;
}

/**
 * The artist seam: given the current asset and the 1-based pass number, propose the next
 * edit, or return `null` to stop. Reactive by design — a real artist looks at the current
 * render before proposing — so it is a function, not a static list. Injected, like the
 * judge, because it is a model.
 */
export type Artist<A> = (current: A, pass: number) => Proposal<A> | null | Promise<Proposal<A> | null>;

/** What one pass of the loop decided. */
export interface RefineDecision {
  pass: number;
  label: string;
  /** true = the edit was kept; false = the judge condemned it and it was reverted */
  kept: boolean;
  reason?: string;
}

export interface RefineResult<A> {
  /** the asset after the loop — the initial one plus every KEPT edit */
  asset: A;
  /** one entry per pass that ran, in order */
  decisions: RefineDecision[];
  /** how many passes ran (<= maxPasses; fewer if the artist stopped early) */
  passes: number;
}

export interface RefineOptions<A, R> {
  /** the asset to refine */
  initial: A;
  /** proposes edits (station 1's model), reactively */
  artist: Artist<A>;
  /** bake + render an asset to whatever the judge sees */
  render: (asset: A) => R | Promise<R>;
  /** the pairwise, revert-only judge (usually a `quorumJudge`) */
  judge: LookJudge<R>;
  /** ADR-0217 D6 / ADR-0224 D4: at most this many passes. Default 3. */
  maxPasses?: number;
}

/**
 * Run the bounded render→look→refine loop.
 *
 * Each pass: ask the artist for an edit (stop if none); render the current asset and the
 * edited one; ask the judge which is worse. The edit is KEPT unless the judge names the
 * edited render worse — revert-only, so `neither` and "the before was worse" both keep it.
 * Bounded at `maxPasses`.
 *
 * The loop performs no geometry and knows nothing about buildings — `render`, `artist` and
 * `judge` are all injected — so it is the same loop for any object type the factory grows.
 */
export async function refine<A, R>(opts: RefineOptions<A, R>): Promise<RefineResult<A>> {
  const maxPasses = opts.maxPasses ?? 3;
  let current = opts.initial;
  const decisions: RefineDecision[] = [];

  for (let pass = 1; pass <= maxPasses; pass++) {
    const proposal = await opts.artist(current, pass);
    if (proposal === null) break; // the artist accepted its own output

    const before = await opts.render(current);
    const after = await opts.render(proposal.asset);
    const verdict = await opts.judge(before, after);

    const kept = verdict.worse !== 'after';
    if (kept) current = proposal.asset;

    const decision: RefineDecision = { pass, label: proposal.label ?? `pass ${pass}`, kept };
    if (verdict.reason !== undefined) decision.reason = verdict.reason;
    decisions.push(decision);
  }

  return { asset: current, decisions, passes: decisions.length };
}
