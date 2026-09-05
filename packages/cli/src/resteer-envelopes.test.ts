import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";

/**
 * Every `storytree resteer` envelope, PINNED WHOLE — body and `next` both.
 *
 * WHY WHOLE-BODY EQUALITY RATHER THAN THE PARTIAL `assert.match` ITS SIBLING USES. These strings ARE
 * the surface. A refusal that loses the sentence explaining WHY a field matters still refuses, still
 * exits non-zero, and still satisfies any regex asserting its first clause — so the failure this file
 * exists to catch is prose going silently missing, which no behavioural assertion can see.
 * `check:mutation-diff` measures exactly that: it empties each string on the lines a branch changed
 * and asks whether anything noticed. A partial match notices one mutant per line and misses the rest.
 *
 * THE DIVISION OF LABOUR: `resteer.test.ts` asserts BEHAVIOUR — what lands in the store, what is
 * refused, what the figures come to. This file asserts TEXT. Neither subsumes the other.
 *
 * A wording change is MEANT to red here. That is the cost and the point: re-read the new text, decide
 * it still says what it has to, and update the literal deliberately rather than by regenerating it.
 */

const NOW = "2026-09-05T12:00:00.000Z";
const BRANCH = "claude/test-resteer";

function deps(s: InMemoryStore, writable = false) {
  const base = { store: s, friction: { branch: BRANCH, now: NOW, inboxDir: "", docsDir: "" } };
  return writable ? { ...base, writable: true } : base;
}

/** A complete, valid capture argv; `over` replaces a flag, or drops it when the value is undefined. */
function FULL(over: Record<string, string | undefined> = {}): string[] {
  const flags = {
    "--title": "He redirected the ADR to correct in place",
    "--doing": "about to supersede ADR-0400 with a new decision",
    "--redirect": "correct the overtaken paragraph in place instead",
    "--evidence": "\"dont supersede it, the decision didnt change\"",
    "--disposition": "taste",
    "--by": "owner",
    ...over,
  };
  const out = ["resteer", "new"];
  for (const [k, v] of Object.entries(flags)) if (v !== undefined) out.push(k, v);
  out.push("--pg");
  return out;
}

test("resteer-help-body-is-pinned", async () => {
  const res = await run(["resteer"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true);
  assert.equal(res.body, "storytree resteer — the owner's interventions, recorded as they happen (ADR-0515).\n\n  new         record ONE intervention (live store, --pg)\n  list        the report: defect/taste split, failure modes, per-session load\n  agreement   inter-annotator kappa for the classification frame (two JSON label files)\n\nFILE ONE:\n  storytree resteer new --pg \\\n    --title \"<short name>\" \\\n    --doing \"<what you were doing>\" --redirect \"<what he asked for instead>\" \\\n    --evidence \"<HIS OWN WORDS, quoted>\" \\\n    --disposition defect|taste --by owner|agent [--mode <mast-mode>] \\\n    [--self-report \"<what you said about it — UNVALIDATED, nothing scores it>\"]\n\nEvery prose flag takes the house `@path` convention for multi-line text.\n\nTHE TWO RULES THAT MATTER:\n  · TASTE IS NOT AN ERROR. A re-steer the owner marks as preference is excluded from every\n    error figure by construction — the type system refuses to count it, not a filter you have\n    to remember. Mark it honestly.\n  · YOUR OWN ACCOUNT IS THE WEAK HALF. --evidence is what HE said; --self-report is what you\n    said, stored in a field nothing scores. HANDBOOK.md (arXiv 2607.25398) found the agent's\n    self-report the least reliable artifact in the trajectory — nearly every failed run ended\n    claiming compliance while citing the sections it had violated.\n\nNO CAP, and NO OBLIGATION. Unlike `friction`, there is no cap-3: every intervention is a datum,\nand dropping the fourth would destroy the count. And 'no re-steers this session' is a\nfirst-class, FREE, unmarked outcome — capture is DISCIPLINE, never a gate rung.");
  assert.deepEqual(res.next, ["storytree resteer list --pg","storytree library artifact mast-failure-frame"]);
});

test("resteer-new-without-pg-body-is-pinned", async () => {
  const res = await run(FULL(), deps(new InMemoryStore(), false));
  assert.equal(res.ok, false);
  assert.equal(res.body, "`resteer new` is a live-store write and needs --pg (bring the DB up first: `pnpm db:up`).\nThere is no offline inbox for this tier, deliberately: a re-steer is filed in the retro that\nimmediately precedes the merge ceremony, and that ceremony already requires the live store.");
  assert.deepEqual(res.next, ["pnpm db:up","storytree resteer --help"]);
});

test("resteer-missing-every-required-flag-body-is-pinned", async () => {
  const res = await run(["resteer", "new", "--pg"], deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "resteer new needs --title, --doing, --redirect, --evidence.\n  --doing     what the session was doing when he intervened\n  --redirect  what he asked for instead\n  --evidence  HIS OWN WORDS, quoted — the observed datum this tier exists for");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-bad-disposition-body-is-pinned", async () => {
  const res = await run(FULL({ "--disposition": "nope" }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "--disposition must be defect | taste (got \"nope\").\n  defect  the system should not have produced this; it counts toward the error figure\n  taste   the owner's preference — excluded from every error figure by construction");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-bad-by-body-is-pinned", async () => {
  const res = await run(FULL({ "--by": undefined }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "--by must be owner | agent (got null) — WHO called it that.\n  owner   he said so, in words you can quote in --evidence\n  agent   this is your reading of it, and it is recorded as such (ADR-0515 D3)\nDo not claim `owner` for an inference: the gap between the two is a measurement, and\nmislabelling it is the one way to make that measurement lie.");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-bad-mode-body-is-pinned-and-prints-the-whole-frame", async () => {
  const res = await run(FULL({ "--disposition": "defect", "--mode": "nope" }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "unknown --mode \"nope\". The frame is MAST (arXiv 2503.13657) — 14 modes, the four storytree extension modes, plus one escape hatch:\n  disobey-task-specification  (specification-and-design)\n  disobey-role-specification  (specification-and-design)\n  step-repetition  (specification-and-design)\n  loss-of-conversation-history  (specification-and-design)\n  unaware-of-termination-conditions  (specification-and-design)\n  conversation-reset  (inter-agent-misalignment)\n  fail-to-ask-for-clarification  (inter-agent-misalignment)\n  task-derailment  (inter-agent-misalignment)\n  information-withholding  (inter-agent-misalignment)\n  ignored-other-agents-input  (inter-agent-misalignment)\n  reasoning-action-mismatch  (inter-agent-misalignment)\n  premature-termination  (verification-and-termination)\n  no-or-incomplete-verification  (verification-and-termination)\n  incorrect-verification  (verification-and-termination)\n  tool-defect  (storytree-extension)\n  environment-defect  (storytree-extension)\n  missing-capability  (storytree-extension)\n  data-model-gap  (storytree-extension)\n  no-mast-home  (unhoused)\nWhen none genuinely describes it, `no-mast-home` is the honest answer and a finding in its\nown right. Never stretch a mode to fit.");
  assert.deepEqual(res.next, ["storytree resteer --help","storytree library artifact mast-failure-frame"]);
});

test("resteer-unsluggable-title-body-is-pinned", async () => {
  const res = await run(FULL({ "--title": "!!!" }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "--title must contain at least one letter or digit (the id derives from it).");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-defect-without-mode-body-is-pinned", async () => {
  const res = await run(FULL({ "--disposition": "defect" }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "re-steer \"resteer-he-redirected-the-adr-to-correct-in-place\" is disposition \"defect\" but carries no `mode`. A defect with no failure mode is a row the frame cannot see: it counts toward the error figure while contributing nothing to the distribution, which is the shape that makes a later percentage unreadable. Classify it against the adopted frame — and when no MAST mode genuinely describes it, `no-mast-home` is the honest answer and a finding in its own right (ADR-0515 D4). Never stretch a mode to fit.");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-vague-evidence-body-is-pinned", async () => {
  const res = await run(FULL({ "--evidence": "he seemed unhappy about it all" }), deps(new InMemoryStore(), true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "--evidence must be CONCRETE — quote what he actually said. A paraphrase is your account of\nhis words, which puts generated text in the one column that is supposed to hold observed\nbehaviour (ADR-0513 D4). What you filed:\n  evidence: he seemed unhappy about it all");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-successful-taste-capture-body-is-pinned", async () => {
  const res = await run(FULL(), deps(new InMemoryStore(), true));
  assert.equal(res.ok, true);
  assert.equal(res.body, "recorded re-steer resteer-he-redirected-the-adr-to-correct-in-place on \"claude/test-resteer\" (2026-09-05) — taste (called by: owner).\nMarked TASTE: excluded from every error figure by construction (ADR-0513 D4).");
  assert.deepEqual(res.next, ["storytree resteer list --pg","storytree library artifact resteer-he-redirected-the-adr-to-correct-in-place --pg"]);
});

test("resteer-empty-list-body-is-pinned", async () => {
  // The empty read is its own contract: it must say "free outcome", NOT "nothing recorded", or an
  // untouched tier reads as a skipped retro.
  const res = await run(["resteer", "list"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true);
  assert.equal(res.body, "no re-steers recorded.\n\nThat is a first-class, FREE outcome and it is not a marker of a skipped retro: a session the\nowner never redirected files nothing (ADR-0513). It also means this tier can never report an\nintervention RATE — see the caveats under a populated read.");
  assert.deepEqual(res.next, ["storytree resteer --help"]);
});

test("resteer-empty-list-carries-an-EMPTY-result-id-list, not an absent one", () => {
  // "found nothing" and "never plumbed" are different facts, and the traversal capture records them
  // identically unless this branch supplies the empty array explicitly.
  return run(["resteer", "list"], deps(new InMemoryStore(), false)).then((res) => {
    assert.deepEqual(res.observedResultIds, []);
  });
});

test("resteer-unknown-subcommand-body-is-pinned", async () => {
  const res = await run(["resteer", "bogus"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, false);
  assert.equal(res.body, "unknown resteer command \"bogus\". try: new | list | agreement");
  assert.deepEqual(res.next, ["storytree resteer --help","storytree resteer list --pg"]);
});

test("resteer-agreement-without-files-body-is-pinned", async () => {
  const res = await run(["resteer", "agreement"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, false);
  assert.equal(res.body, "resteer agreement needs TWO annotation files:\n  storytree resteer agreement <annotator-a.json> <annotator-b.json>\n\nEach is a JSON array of {id, mode} — one entry per item, from annotators who did NOT see\neach other's answers. Independence is the whole measurement; two passes by one reader\nmeasure consistency, not agreement.");
  assert.deepEqual(res.next, ["storytree resteer --help","storytree library artifact mast-failure-frame"]);
});

test("resteer-duplicate-id-body-is-pinned", async () => {
  // Needs a SHARED store: the second capture is refused only because the first one landed.
  const s = new InMemoryStore();
  assert.equal((await run(FULL(), deps(s, true))).ok, true);
  const res = await run(FULL(), deps(s, true));
  assert.equal(res.ok, false);
  assert.equal(res.body, "\"resteer-he-redirected-the-adr-to-correct-in-place\" already exists — a re-steer is one intervention, so give this one its own --title.");
  assert.deepEqual(res.next, ["storytree library artifact resteer-he-redirected-the-adr-to-correct-in-place --pg","storytree resteer list --pg"]);
});

test("resteer-populated-list-body-is-pinned — every figure, caveat and warning line", async () => {
  // Four rows chosen to light EVERY branch of the report at once: two defects (so the mode table and
  // its MAST roll-up render), one owner-marked taste and one AGENT-marked taste (so the two defect
  // shares diverge and the self-characterisation warning fires).
  const s = new InMemoryStore();
  const cap = (t: string, o: Record<string, string> = {}) => {
    // Inference, not an open dictionary (anti-slop `no-known-value-widening`).
    const f = {
      "--title": t, "--doing": "d", "--redirect": "r", "--evidence": "\"quoted words here\"",
      "--disposition": "taste", "--by": "owner", ...o,
    };
    const a = ["resteer", "new"];
    for (const [k, v] of Object.entries(f)) a.push(k, v);
    a.push("--pg");
    return a;
  };
  await run(cap("D one", { "--disposition": "defect", "--mode": "incorrect-verification" }), deps(s, true));
  await run(cap("D two", { "--disposition": "defect", "--mode": "step-repetition" }), deps(s, true));
  await run(cap("T owner"), deps(s, true));
  await run(cap("T agent", { "--by": "agent" }), deps(s, true));

  const res = await run(["resteer", "list"], deps(s, false));
  assert.equal(res.ok, true);
  assert.equal(res.body, "4 re-steers recorded — 2 defect, 2 taste.\n\n  defect share (all taste excluded):        50.0%\n  defect share (only OWNER-marked taste):   75.0%\n  taste called by owner / by agent:         1 / 1\n\n  ⚠ the two shares differ because some taste was called by the AGENT, not the owner. The gap\n    between them bounds how far the system's own account is moving the headline figure.\n\nFAILURE MODES (defects only)\n    1  incorrect-verification  (verification-and-termination)\n    1  step-repetition  (specification-and-design)\n\nPER SESSION\n    2 defect    2 taste   claude/test-resteer\n\nNOT COMPUTABLE FROM THIS TIER\n  · HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row and cannot be counted from this tier.\n  · TCR@k — needs the same session denominator, plus each session's completion outcome, neither of which is a field on this tier.");
  assert.deepEqual(res.next, ["storytree library artifact resteer-d-one --pg","storytree library artifact mast-failure-frame"]);
});

test("resteer-agreement-reading-body-is-pinned", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(os.tmpdir(), "resteer-env-"));
  const A = path.join(dir, "a.json");
  const B = path.join(dir, "b.json");
  // 3 of 4 agree at mode grain; the 4th disagrees at mode but AGREES at category (both FC3), so the
  // two grains MUST report different numbers — which is what proves the roll-up actually happens.
  writeFileSync(A, JSON.stringify([
    { id: "1", mode: "step-repetition" }, { id: "2", mode: "no-mast-home" },
    { id: "3", mode: "no-mast-home" }, { id: "4", mode: "incorrect-verification" },
  ]));
  writeFileSync(B, JSON.stringify([
    { id: "1", mode: "step-repetition" }, { id: "2", mode: "no-mast-home" },
    { id: "3", mode: "no-mast-home" }, { id: "4", mode: "no-or-incomplete-verification" },
  ]));
  const res = await run(["resteer", "agreement", A, B], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true);
  assert.equal(res.body, "n = 4 items both annotators labelled.\n\nMODE GRAIN     (4 labels in play: incorrect-verification, no-mast-home, no-or-incomplete-verification, step-repetition)\n  observed agreement  0.750\n  expected by chance  0.313\n  Cohen's kappa       0.636\n\nCATEGORY GRAIN (3 labels in play: specification-and-design, unhoused, verification-and-termination)\n  observed agreement  1.000\n  expected by chance  0.375\n  Cohen's kappa       1.000\n\nAn `undefined` kappa means chance agreement was total (one label used for everything), so the\nstatistic is 0/0. Read it as 'no reading', never as 0 or 1.");
  assert.deepEqual(res.next, ["storytree library artifact mast-failure-frame"]);
});
