import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertResteerInvariants,
  KIND_SPECS,
  MAST_CATEGORY,
  ResteerDisposition,
  ResteerDispositionBy,
  ResteerMode,
  type Resteer,
} from "./knowledge.js";
import {
  cohensKappa,
  countDefects,
  partitionResteers,
  resteerReport,
  RESTEER_NOT_COMPUTABLE,
  type DefectResteer,
} from "./resteer-report.js";

/**
 * The `resteer` tier's compute (ADR-0515) — and specifically the two claims that would otherwise be
 * prose: that the taste exclusion is structural, and that the agreement statistic is arithmetic
 * rather than a number a script once printed.
 */

/** A row builder. `taste` by default, since that is the row every error figure must refuse. */
function row(id: string, over: Partial<Resteer> = {}): Resteer {
  return {
    kind: "resteer",
    id,
    title: `re-steer ${id}`,
    description: "fixture",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    schemaVersion: 1,
    references: [],
    disposition: "taste",
    dispositionBy: "owner",
    ...over,
  } as Resteer;
}

/* -------------------------------------------------------------------------------------------- */
/* The exclusion is structural                                                                   */
/* -------------------------------------------------------------------------------------------- */

test("resteer-taste-excluded-by-construction: countDefects refuses an unpartitioned list AT COMPILE TIME", () => {
  const rows: readonly Resteer[] = [row("a", { disposition: "defect", mode: "step-repetition" }), row("b")];

  // THE FENCE ITSELF. `readonly Resteer[]` is not assignable to `readonly DefectResteer[]`, because
  // `Resteer.disposition` is the whole `"defect" | "taste"` union. This is what "excluded by
  // construction" (ADR-0513 D4) means here, as against a filter each call site must remember to
  // write — and `@ts-expect-error` is the only way to ASSERT a compile error: if the fence ever
  // stopped holding, this directive would become unused and `tsc` would fail on the directive itself.
  // A runtime assertion could never observe this.
  // @ts-expect-error — passing raw rows to an error figure must not compile.
  countDefects(rows);

  // The partition is the only door through.
  const { defects, taste } = partitionResteers(rows);
  assert.equal(countDefects(defects), 1);
  assert.equal(taste.length, 1);
});

test("resteer-taste-excluded-by-construction: the partition never leaks a taste row", () => {
  const rows = [
    row("d1", { disposition: "defect", mode: "no-or-incomplete-verification" }),
    row("t1"),
    row("t2", { dispositionBy: "agent" }),
    row("d2", { disposition: "defect", mode: "step-repetition" }),
  ];
  const { defects, taste } = partitionResteers(rows);
  assert.deepEqual(defects.map((d) => d.id), ["d1", "d2"]);
  assert.deepEqual(taste.map((t) => t.id), ["t1", "t2"]);
  // Nothing is dropped: every row lands on exactly one side.
  assert.equal(defects.length + taste.length, rows.length);
  for (const d of defects) assert.equal(d.disposition, "defect");
});

test("resteer-defect-share-moves-with-the-disposition: the exclusion is not vacuous", () => {
  // The discriminating case. If the taste exclusion were removed and every row counted as a defect,
  // this share would be 1. Asserting the SHARE rather than merely "taste rows exist" is what makes
  // the test fail when the filter is deleted.
  const rows = [
    row("d1", { disposition: "defect", mode: "step-repetition" }),
    row("d2", { disposition: "defect", mode: "step-repetition" }),
    row("t1"),
    row("t2"),
    row("t3"),
  ];
  assert.equal(resteerReport(rows).defectShare, 2 / 5);

  // Flip one taste row to a defect and the figure MUST move — the negative control.
  const flipped = [...rows.slice(0, 4), row("t3", { disposition: "defect", mode: "task-derailment" })];
  assert.equal(resteerReport(flipped).defectShare, 3 / 5);
});

test("resteer-empty-set-reports-absence-not-a-clean-factory", () => {
  const report = resteerReport([]);
  // A 0% error rate over no data reads as a perfect record. `undefined` says "no reading".
  assert.equal(report.defectShare, undefined);
  assert.equal(report.defectShareOwnerTasteOnly, undefined);
  assert.equal(report.total, 0);
  // The limits are always stated, including on an empty read.
  assert.ok(report.notComputable.length > 0);
});

test("resteer-self-characterisation-gap-is-visible: owner-marked and agent-marked taste are separated", () => {
  const rows = [
    row("d1", { disposition: "defect", mode: "incorrect-verification" }),
    row("t-owner", { dispositionBy: "owner" }),
    row("t-agent1", { dispositionBy: "agent" }),
    row("t-agent2", { dispositionBy: "agent" }),
  ];
  const report = resteerReport(rows);
  assert.equal(report.tasteByOwner, 1);
  assert.equal(report.tasteByAgent, 2);
  // The headline share excludes ALL taste; the strict share excludes only the owner's.
  assert.equal(report.defectShare, 1 / 4);
  assert.equal(report.defectShareOwnerTasteOnly, 3 / 4);
});

test("resteer-mode-distribution-covers-defects-only-and-rolls-up-to-mast-categories", () => {
  const rows = [
    row("d1", { disposition: "defect", mode: "step-repetition" }),
    row("d2", { disposition: "defect", mode: "loss-of-conversation-history" }),
    row("d3", { disposition: "defect", mode: "incorrect-verification" }),
    // A taste row carrying no mode must not appear anywhere in the distribution.
    row("t1"),
  ];
  const report = resteerReport(rows);
  assert.equal([...report.modeDistribution.values()].reduce((a, b) => a + b, 0), 3);
  assert.equal(report.categoryDistribution.get("specification-and-design"), 2);
  assert.equal(report.categoryDistribution.get("verification-and-termination"), 1);
  // Modes never reached are ABSENT, not zero-filled — a zero row reads as a measured zero.
  assert.equal(report.modeDistribution.has("conversation-reset"), false);
});

test("resteer-per-session-load-groups-by-branch", () => {
  const rows = [
    row("a", { disposition: "defect", mode: "step-repetition", provenance: { branch: "claude/x", date: "2026-09-05", source: "retro" } }),
    row("b", { disposition: "defect", mode: "step-repetition", provenance: { branch: "claude/x", date: "2026-09-05", source: "retro" } }),
    row("c", { provenance: { branch: "claude/y", date: "2026-09-05", source: "retro" } }),
  ];
  const report = resteerReport(rows);
  assert.deepEqual(report.perSession, [
    { branch: "claude/x", defects: 2, taste: 0 },
    { branch: "claude/y", defects: 0, taste: 1 },
  ]);
});

/* -------------------------------------------------------------------------------------------- */
/* The frame's invariant                                                                          */
/* -------------------------------------------------------------------------------------------- */

test("resteer-defect-carries-a-mode: a defect with no mode fails closed", () => {
  assert.throws(
    () => assertResteerInvariants(row("d", { disposition: "defect" })),
    /carries no `mode`/,
  );
  // `no-mast-home` SATISFIES the invariant — the escape hatch is an answer, not an omission.
  assert.doesNotThrow(() =>
    assertResteerInvariants(row("d", { disposition: "defect", mode: "no-mast-home" })),
  );
  // A taste row is exempt: a preference is not a failure and has no failure mode.
  assert.doesNotThrow(() => assertResteerInvariants(row("t")));
});

test("frame-is-14-mast-modes-plus-4-extension-modes-plus-one-escape-hatch, each in exactly one category", () => {
  const modes = ResteerMode.options;
  assert.equal(modes.length, 19, "MAST's 14 modes, the four storytree extension modes, plus `no-mast-home`");
  assert.equal(modes.filter((m) => MAST_CATEGORY[m] === "unhoused").length, 1);
  assert.equal(modes.filter((m) => MAST_CATEGORY[m] === "specification-and-design").length, 5);
  assert.equal(modes.filter((m) => MAST_CATEGORY[m] === "inter-agent-misalignment").length, 6);
  assert.equal(modes.filter((m) => MAST_CATEGORY[m] === "verification-and-termination").length, 3);
  // The extension is its OWN category, never folded into MAST's three: that is what keeps a
  // MAST-only reading recoverable (fold `storytree-extension` back into `unhoused`) and stops the
  // four from ever being presented as MAST's own modes.
  assert.equal(modes.filter((m) => MAST_CATEGORY[m] === "storytree-extension").length, 4);
});

/* -------------------------------------------------------------------------------------------- */
/* The agreement statistic                                                                        */
/* -------------------------------------------------------------------------------------------- */

test("cohens-kappa-matches-a-hand-computed-case", () => {
  // The textbook 2x2: 50 items — both-yes 20, both-no 15, A-yes/B-no 5, A-no/B-yes 10.
  //   observed = 35/50 = 0.70
  //   A marginals 25/25, B marginals 30/20 → expected = .5*.6 + .5*.4 = 0.50
  //   kappa = (0.70 - 0.50) / (1 - 0.50) = 0.40
  // The expected values are computed BY HAND above, not by re-running the function under test.
  const a: Array<{ id: string; label: string }> = [];
  const b: Array<{ id: string; label: string }> = [];
  const push = (n: number, la: string, lb: string, tag: string) => {
    for (let i = 0; i < n; i++) {
      a.push({ id: `${tag}${i}`, label: la });
      b.push({ id: `${tag}${i}`, label: lb });
    }
  };
  push(20, "yes", "yes", "bothyes");
  push(15, "no", "no", "bothno");
  push(5, "yes", "no", "ayes");
  push(10, "no", "yes", "byes");

  const reading = cohensKappa(a, b);
  assert.equal(reading.n, 50);
  assert.equal(reading.observed, 0.7);
  assert.equal(reading.expected, 0.5);
  assert.ok(reading.kappa !== undefined && Math.abs(reading.kappa - 0.4) < 1e-12);
});

test("cohens-kappa: perfect agreement is 1, and a single shared category is UNDEFINED not 1", () => {
  const same = [
    { id: "1", label: "x" },
    { id: "2", label: "y" },
  ];
  assert.equal(cohensKappa(same, same).kappa, 1);

  // Both annotators used one category for everything: chance agreement is total, kappa is 0/0. A
  // fabricated 1 here would report perfect reliability from a frame that discriminated nothing.
  const flat = [
    { id: "1", label: "x" },
    { id: "2", label: "x" },
  ];
  const reading = cohensKappa(flat, flat);
  assert.equal(reading.observed, 1);
  assert.equal(reading.expected, 1);
  assert.equal(reading.kappa, undefined);
});

test("cohens-kappa: an item only one annotator labelled is dropped, not scored as a disagreement", () => {
  const a = [
    { id: "1", label: "x" },
    { id: "2", label: "y" },
    { id: "3", label: "z" },
  ];
  const b = [
    { id: "1", label: "x" },
    { id: "2", label: "y" },
  ];
  const reading = cohensKappa(a, b);
  assert.equal(reading.n, 2, "only the items BOTH labelled");
  assert.equal(reading.observed, 1, "an unlabelled item is not a disagreement");
});

test("cohens-kappa: the reported categories are SORTED and de-duplicated", () => {
  // `categories` is what a reader uses to see how many labels were actually in play, and it feeds the
  // chance-agreement sum. Unsorted, two runs over the same data print different orders and read as
  // different studies; duplicated, the expected-agreement term would be counted twice per label and
  // kappa would come out wrong rather than merely untidy.
  const a = [
    { id: "1", label: "zeta" },
    { id: "2", label: "alpha" },
    { id: "3", label: "zeta" },
  ];
  const b = [
    { id: "1", label: "zeta" },
    { id: "2", label: "mid" },
    { id: "3", label: "alpha" },
  ];
  assert.deepEqual(cohensKappa(a, b).categories, ["alpha", "mid", "zeta"]);
});

test("cohens-kappa: an empty overlap reports n=0 and an undefined kappa", () => {
  const reading = cohensKappa([{ id: "1", label: "x" }], [{ id: "2", label: "y" }]);
  assert.equal(reading.n, 0);
  assert.equal(reading.kappa, undefined);
});

/** A `DefectResteer` is assignable to `Resteer`; the reverse is what the fence refuses. */
test("defect-resteer-narrows-rather-than-brands", () => {
  const defect: DefectResteer = row("d", { disposition: "defect", mode: "step-repetition" }) as DefectResteer;
  const asRow: Resteer = defect;
  assert.equal(asRow.disposition, "defect");
});

/* -------------------------------------------------------------------------------------------- */
/* The tier's own VOCABULARY, pinned                                                              */
/*                                                                                                */
/* These are values, not behaviour, and every one of them is load-bearing text: the two enums are  */
/* what the CLI validates against, the KIND_SPECS table is what renders and templates a row, and   */
/* the invariant's message is the only thing that tells an author WHY a modeless defect is refused.*/
/* Pinned whole, because a partial assertion leaves the rest of each string free to go missing —   */
/* which is exactly what `check:mutation-diff` empties them to prove.                              */
/* -------------------------------------------------------------------------------------------- */

test("resteer-enums-are-pinned: the closed sets the CLI validates against", () => {
  assert.deepEqual(ResteerDisposition.options, ["defect","taste"]);
  assert.deepEqual(ResteerDispositionBy.options, ["owner","agent"]);
});

test("mast-category-map-is-pinned-whole", () => {
  // A count-only assertion (three FC1, six FC2 …) stays green if two modes SWAP categories, which
  // would silently re-bucket every distribution ever computed from it. The map is pinned entire.
  assert.deepEqual(MAST_CATEGORY, {"disobey-task-specification":"specification-and-design","disobey-role-specification":"specification-and-design","step-repetition":"specification-and-design","loss-of-conversation-history":"specification-and-design","unaware-of-termination-conditions":"specification-and-design","conversation-reset":"inter-agent-misalignment","fail-to-ask-for-clarification":"inter-agent-misalignment","task-derailment":"inter-agent-misalignment","information-withholding":"inter-agent-misalignment","ignored-other-agents-input":"inter-agent-misalignment","reasoning-action-mismatch":"inter-agent-misalignment","premature-termination":"verification-and-termination","no-or-incomplete-verification":"verification-and-termination","incorrect-verification":"verification-and-termination","tool-defect":"storytree-extension","environment-defect":"storytree-extension","missing-capability":"storytree-extension","data-model-gap":"storytree-extension","no-mast-home":"unhoused"});
});

test("resteer-kind-specs-are-pinned: field order, headings, and the required flags", () => {
  // ORDER IS SIGNIFICANT — the renderer emits fields in this order and the parser relies on it, so
  // this is a deepEqual over the whole table rather than a membership check. `selfReport` is LAST
  // and OPTIONAL on purpose: it is the unvalidated half (ADR-0513 D4), never the lead.
  assert.deepEqual(KIND_SPECS.resteer, [{"field":"doing","lead":true,"heading":"**What the session was doing.**","required":true,"placeholder":"_One line: the course the session was on, or about to take, when the owner intervened._"},{"field":"redirect","lead":false,"heading":"What the owner redirected it to","required":true,"placeholder":"_One line: what he asked for instead. State the redirection, not your reading of why._"},{"field":"evidence","lead":false,"heading":"Evidence","required":true,"placeholder":"_The owner's OWN WORDS, quoted. This is the observed datum and the reason a re-steer outranks a self-report; paraphrase it and the column stops being evidence. An evidence-free item is refused at capture, fail-closed._"},{"field":"selfReport","lead":false,"heading":"Agent self-report (UNVALIDATED — nothing scores this)","required":false,"placeholder":"_What the agent said about it at the time, if anything. Explicitly unvalidated (ADR-0513 D4): generated text, kept beside the observed datum and never in place of it._"}]);
});

test("resteer-invariant-message-is-pinned-whole", () => {
  // The message has to carry three things or it teaches nothing: WHAT is wrong, WHY it matters, and
  // that `no-mast-home` is a legitimate answer. Asserting only the first clause — as a regex would —
  // leaves the other two free to vanish.
  let message = "";
  try {
    assertResteerInvariants(row("x", { disposition: "defect" }));
  } catch (e) {
    message = (e as Error).message;
  }
  assert.equal(message, "re-steer \"x\" is disposition \"defect\" but carries no `mode`. A defect with no failure mode is a row the frame cannot see: it counts toward the error figure while contributing nothing to the distribution, which is the shape that makes a later percentage unreadable. Classify it against the adopted frame — and when no MAST mode genuinely describes it, `no-mast-home` is the honest answer and a finding in its own right (ADR-0515 D4). Never stretch a mode to fit.");
});

test("resteer-not-computable-caveats-are-pinned-whole", () => {
  // This list is the instrument's own statement of its limits. If it silently emptied, every reader
  // would see a report that looked complete — which is the failure the list exists to prevent.
  assert.deepEqual(RESTEER_NOT_COMPUTABLE, ["HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row and cannot be counted from this tier.","TCR@k — needs the same session denominator, plus each session's completion outcome, neither of which is a field on this tier."]);
  assert.deepEqual(resteerReport([]).notComputable, ["HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row and cannot be counted from this tier.","TCR@k — needs the same session denominator, plus each session's completion outcome, neither of which is a field on this tier."]);
});

test("resteer-per-session-sort-is-defects-desc-then-branch-asc", () => {
  // Both keys are asserted, and each with a case the OTHER key cannot explain: 'zzz' outranks 'aaa'
  // on defect count alone, and the two 1-defect branches can only be ordered by name.
  const at = (branch: string) => ({ branch, date: "2026-09-05", source: "retro" as const });
  const rows = [
    row("a", { provenance: at("aaa"), disposition: "defect", mode: "step-repetition" }),
    row("b", { provenance: at("mmm"), disposition: "defect", mode: "step-repetition" }),
    row("c", { provenance: at("zzz"), disposition: "defect", mode: "step-repetition" }),
    row("d", { provenance: at("zzz"), disposition: "defect", mode: "step-repetition" }),
    row("e", { provenance: at("aaa") }),
  ];
  assert.deepEqual(resteerReport(rows).perSession, [
    { branch: "zzz", defects: 2, taste: 0 },
    { branch: "aaa", defects: 1, taste: 1 },
    { branch: "mmm", defects: 1, taste: 0 },
  ]);
});

test("resteer-a-row-with-no-provenance-is-grouped-as-unstamped, never dropped", () => {
  // The fallback branch. Dropping an unstamped row would quietly shrink the denominator of every
  // per-session figure; bucketing it under a visible label keeps the arithmetic honest.
  const report = resteerReport([row("x", { disposition: "defect", mode: "step-repetition" })]);
  assert.deepEqual(report.perSession, [{ branch: "(unstamped)", defects: 1, taste: 0 }]);
  assert.equal(report.defects, 1);
});

test("resteer-a-defect-with-no-mode-is-counted-but-not-bucketed", () => {
  // `assertResteerInvariants` refuses this at the capture door, so a row like it reached the store by
  // some other path. It must still COUNT as a defect (the error figure stays honest) while entering
  // no mode bucket — guessing a mode for it would fabricate the distribution.
  const report = resteerReport([
    row("noMode", { disposition: "defect" }),
    row("hasMode", { disposition: "defect", mode: "step-repetition" }),
  ]);
  assert.equal(report.defects, 2);
  assert.equal([...report.modeDistribution.values()].reduce((a, b) => a + b, 0), 1);
  assert.equal(report.modeDistribution.get("step-repetition"), 1);
});
