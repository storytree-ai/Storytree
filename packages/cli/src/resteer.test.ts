import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { Resteer } from "@storytree/library";

import { run } from "./commands.js";
import { resteerIdFromTitle } from "./resteer.js";

/**
 * `storytree resteer` (ADR-0515) — driven through the REAL dispatch, so a flag this surface declares
 * but never receives fails here rather than in a retro nobody re-runs.
 *
 * The two claims worth testing are the two the tier's value rests on: that the capture REFUSES the
 * shapes that would quietly corrupt the log (a missing disposition, an `owner` claim on an inference,
 * a defect with no mode, a paraphrase in the evidence column), and that the report's error figure
 * cannot see a taste row. The type-level half of that second claim lives in
 * `@storytree/library`'s `resteer-report.test.ts`, where a `@ts-expect-error` asserts the compile
 * error a runtime test can never observe.
 */

const NOW = "2026-09-05T12:00:00.000Z";
const BRANCH = "claude/test-resteer";

function deps(s: InMemoryStore, writable = true) {
  const base = { store: s, friction: { branch: BRANCH, now: NOW, inboxDir: "", docsDir: "" } };
  return writable ? { ...base, writable: true } : base;
}

/** The flags a well-formed capture supplies. `taste`/`owner` by default — the row every figure must refuse. */
function argv(over: Record<string, string | undefined> = {}): string[] {
  // No `Record<string, string | undefined>` annotation: it would discard the keys this literal just
  // wrote (anti-slop `no-known-value-widening`). Inference plus the spread is what the rule wants.
  const flags = {
    "--title": "He redirected the ADR to correct in place",
    "--doing": "about to supersede ADR-0400 with a new decision",
    "--redirect": "correct the overtaken paragraph in place instead",
    "--evidence": '"dont supersede it, the decision didnt change — just fix the prose"',
    "--disposition": "taste",
    "--by": "owner",
    ...over,
  };
  const out = ["resteer", "new"];
  for (const [k, v] of Object.entries(flags)) if (v !== undefined) out.push(k, v);
  out.push("--pg");
  return out;
}

/* -------------------------------------------------------------------------------------------- */
/* Capture                                                                                        */
/* -------------------------------------------------------------------------------------------- */

test("resteer-new-files-a-validated-row-with-provenance", async () => {
  const s = new InMemoryStore();
  const res = await run(argv(), deps(s));
  assert.equal(res.ok, true, res.body);

  const id = resteerIdFromTitle("He redirected the ADR to correct in place");
  const stored = await s.getDoc(id);
  assert.ok(stored, "the row must be in the store");
  // Validates as a `resteer` against the real schema — not merely "some object was written".
  const doc = Resteer.parse(stored.doc);
  assert.equal(doc.disposition, "taste");
  assert.equal(doc.dispositionBy, "owner");
  assert.equal(doc.provenance?.branch, BRANCH);
  assert.equal(doc.provenance?.date, "2026-09-05");
  assert.equal(doc.provenance?.source, "retro");
  // A taste row carries no failure mode, and that is correct rather than missing.
  assert.equal(doc.mode, undefined);
  // The capture says out loud that this row is excluded — the exclusion is not silent.
  assert.match(res.body, /excluded from every error figure/i);
});

test("resteer-new-refuses-without-pg-and-names-why-there-is-no-inbox", async () => {
  const s = new InMemoryStore();
  const res = await run(["resteer", "new", "--title", "x", "--doing", "a", "--redirect", "b", "--evidence", '"c"', "--disposition", "taste", "--by", "owner"], deps(s, false));
  assert.equal(res.ok, false);
  assert.match(res.body, /needs --pg/);
  // The absence of an offline inbox is a stated decision, not an unimplemented branch.
  assert.match(res.body, /no offline inbox/i);
});

test("resteer-new-refuses-a-missing-or-bogus-disposition", async () => {
  const s = new InMemoryStore();
  for (const bad of [undefined, "preference", "DEFECT", ""]) {
    const res = await run(argv({ "--disposition": bad }), deps(s));
    assert.equal(res.ok, false, `disposition ${JSON.stringify(bad)} must be refused`);
    assert.match(res.body, /--disposition must be defect \| taste/);
  }
  // Nothing was written by any of the refusals.
  assert.equal((await s.queryDocs({ kind: "resteer" })).length, 0);
});

test("resteer-new-refuses-a-missing-or-bogus-by, and warns against claiming owner for an inference", async () => {
  const s = new InMemoryStore();
  const res = await run(argv({ "--by": undefined }), deps(s));
  assert.equal(res.ok, false);
  assert.match(res.body, /--by must be owner \| agent/);
  // The refusal has to say WHY the field matters, or it reads as bureaucracy and gets filled in wrong.
  assert.match(res.body, /Do not claim `owner` for an inference/);
});

test("resteer-defect-must-carry-a-mode, and no-mast-home satisfies it", async () => {
  const s = new InMemoryStore();
  const noMode = await run(argv({ "--disposition": "defect" }), deps(s));
  assert.equal(noMode.ok, false);
  assert.match(noMode.body, /carries no `mode`/);
  assert.equal((await s.queryDocs({ kind: "resteer" })).length, 0, "a modeless defect must not land");

  // The escape hatch is an ANSWER. Force-fitting a mode is what the frame exists to prevent.
  const escaped = await run(
    argv({ "--disposition": "defect", "--mode": "no-mast-home", "--title": "Unhoused one" }),
    deps(s),
  );
  assert.equal(escaped.ok, true, escaped.body);
  assert.equal(Resteer.parse((await s.getDoc(resteerIdFromTitle("Unhoused one")))?.doc).mode, "no-mast-home");
});

test("resteer-new-refuses-an-off-frame-mode-and-prints-the-frame", async () => {
  const s = new InMemoryStore();
  const res = await run(argv({ "--disposition": "defect", "--mode": "agent-was-lazy" }), deps(s));
  assert.equal(res.ok, false);
  assert.match(res.body, /unknown --mode "agent-was-lazy"/);
  // The refusal lists the frame, so the author never has to go looking for the vocabulary.
  assert.match(res.body, /incorrect-verification/);
  assert.match(res.body, /no-mast-home/);
});

test("resteer-evidence-must-be-concrete: a paraphrase is refused", async () => {
  const s = new InMemoryStore();
  const res = await run(argv({ "--evidence": "he seemed unhappy with the direction and wanted something else" }), deps(s));
  assert.equal(res.ok, false);
  // The message must name the REASON — a paraphrase is the agent's account, in the one column that
  // is meant to hold observed behaviour.
  assert.match(res.body, /quote what he actually said/i);
});

test("resteer-self-report-is-stored-and-kept-separate-from-the-evidence", async () => {
  const s = new InMemoryStore();
  const res = await run(
    [...argv({ "--title": "With a self report" }).slice(0, -1), "--self-report", "I said I had misread the ADR standard", "--pg"],
    deps(s),
  );
  assert.equal(res.ok, true, res.body);
  const stored = (await s.getDoc(resteerIdFromTitle("With a self report")))?.doc;
  // It VALIDATES as a re-steer...
  assert.equal(Resteer.safeParse(stored).success, true);
  // ...but the BODY fields are read off the raw doc, because `z.infer` erases every KIND_SPECS field:
  // `buildKindSchema` spreads them from a `Record`, which carries no statically-known keys. That is a
  // documented type-level hole in the builder, not a gap in the runtime schema.
  const raw = stored as Record<string, unknown>;
  assert.equal(raw["selfReport"], "I said I had misread the ADR standard");
  // ADR-0513 D4: the two live in DIFFERENT fields. A schema that blended them would destroy the only
  // trustworthy column, so this asserts the separation rather than merely that both were stored.
  assert.notEqual(raw["selfReport"], raw["evidence"]);
  assert.match(String(raw["evidence"]), /dont supersede it/);
});

test("resteer-new-refuses-a-duplicate-id", async () => {
  const s = new InMemoryStore();
  assert.equal((await run(argv(), deps(s))).ok, true);
  const again = await run(argv(), deps(s));
  assert.equal(again.ok, false);
  assert.match(again.body, /already exists/);
});

test("resteer-id-derives-from-the-title", () => {
  assert.equal(resteerIdFromTitle("He redirected the ADR"), "resteer-he-redirected-the-adr");
  assert.equal(resteerIdFromTitle("  Mixed --- Punctuation!  "), "resteer-mixed-punctuation");
  // A title with nothing sluggable yields "", which the verb turns into a refusal rather than a
  // row whose id is a bare prefix.
  assert.equal(resteerIdFromTitle("!!!"), "");
});

/* -------------------------------------------------------------------------------------------- */
/* The report                                                                                     */
/* -------------------------------------------------------------------------------------------- */

test("resteer-list-on-an-empty-tier-reports-a-free-outcome, not a skipped retro", async () => {
  const res = await run(["resteer", "list"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true);
  // "No re-steers" must never read as a missing obligation (ADR-0513: a free, unmarked outcome).
  assert.match(res.body, /first-class, FREE outcome/);
});

test("resteer-list-excludes-taste-from-the-defect-share, and the share moves when a row flips", async () => {
  const s = new InMemoryStore();
  await run(argv({ "--title": "D one", "--disposition": "defect", "--mode": "incorrect-verification" }), deps(s));
  await run(argv({ "--title": "T one" }), deps(s));
  await run(argv({ "--title": "T two" }), deps(s));
  await run(argv({ "--title": "T three" }), deps(s));

  const res = await run(["resteer", "list"], deps(s, false));
  assert.equal(res.ok, true);
  assert.match(res.body, /4 re-steers recorded — 1 defect, 3 taste/);
  assert.match(res.body, /defect share \(all taste excluded\):\s+25\.0%/);

  // The discriminating case: file a second DEFECT and the figure must move. If the exclusion were
  // removed and every row counted, both readings would have been 100% and neither assertion above
  // would have failed.
  await run(argv({ "--title": "D two", "--disposition": "defect", "--mode": "step-repetition" }), deps(s));
  const after = await run(["resteer", "list"], deps(s, false));
  assert.match(after.body, /defect share \(all taste excluded\):\s+40\.0%/);
});

test("resteer-list-surfaces-the-self-characterisation-gap", async () => {
  const s = new InMemoryStore();
  await run(argv({ "--title": "D one", "--disposition": "defect", "--mode": "task-derailment" }), deps(s));
  await run(argv({ "--title": "T agent", "--by": "agent" }), deps(s));

  const res = await run(["resteer", "list"], deps(s, false));
  assert.match(res.body, /taste called by owner \/ by agent:\s+0 \/ 1/);
  // The two shares diverge, and the report says WHY rather than printing two numbers side by side.
  assert.match(res.body, /defect share \(only OWNER-marked taste\):\s+100\.0%/);
  assert.match(res.body, /called by the AGENT, not the owner/);
});

test("resteer-list-states-what-it-cannot-compute", async () => {
  const s = new InMemoryStore();
  await run(argv({ "--title": "D one", "--disposition": "defect", "--mode": "premature-termination" }), deps(s));
  const res = await run(["resteer", "list"], deps(s, false));
  // The intervention rate has no denominator here, and saying so is what stops a later session
  // quoting one. An instrument that printed only what it CAN compute would invite exactly that.
  assert.match(res.body, /NOT COMPUTABLE FROM THIS TIER/);
  assert.match(res.body, /HUMAN INTERVENTION RATE/);
  assert.match(res.body, /TCR@k/);
});

test("resteer-help-names-the-cap-free-and-obligation-free-design", async () => {
  const res = await run(["resteer"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true);
  assert.match(res.body, /NO CAP/);
  assert.match(res.body, /never a gate rung/);
});

/* -------------------------------------------------------------------------------------------- */
/* The frame-validation verb                                                                      */
/* -------------------------------------------------------------------------------------------- */

test("resteer-agreement-computes-both-grains-from-two-label-files", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'resteer-agree-'));
  const a = path.join(dir, 'a.json');
  const b = path.join(dir, 'b.json');
  // 4 items: 3 agree at MODE grain; the 4th disagrees at mode but AGREES at category (both are FC3),
  // which is the case that makes the two grains report different numbers rather than one number twice.
  writeFileSync(a, JSON.stringify([
    { id: '1', mode: 'step-repetition', reason: 'rides along, ignored' },
    { id: '2', mode: 'no-mast-home' },
    { id: '3', mode: 'no-mast-home' },
    { id: '4', mode: 'incorrect-verification' },
  ]));
  writeFileSync(b, JSON.stringify([
    { id: '1', mode: 'step-repetition' },
    { id: '2', mode: 'no-mast-home' },
    { id: '3', mode: 'no-mast-home' },
    { id: '4', mode: 'no-or-incomplete-verification' },
  ]));

  const res = await run(["resteer", "agreement", a, b], deps(new InMemoryStore(), false));
  assert.equal(res.ok, true, res.body);
  assert.match(res.body, /n = 4 items/);
  assert.match(res.body, /MODE GRAIN/);
  assert.match(res.body, /CATEGORY GRAIN/);
  // 3 of 4 agree at mode grain; 4 of 4 at category grain — the two must differ, or the roll-up is
  // not happening and both lines are reporting the same comparison twice.
  assert.match(res.body, /observed agreement\s+0\.750/);
  assert.match(res.body, /observed agreement\s+1\.000/);
});

test("resteer-agreement-fails-closed-on-a-bad-file, and never coerces a missing mode", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'resteer-agree-bad-'));
  const bad = path.join(dir, 'bad.json');
  const ok = path.join(dir, 'ok.json');
  writeFileSync(ok, JSON.stringify([{ id: '1', mode: 'step-repetition' }]));

  // Missing both files.
  const none = await run(["resteer", "agreement"], deps(new InMemoryStore(), false));
  assert.equal(none.ok, false);
  assert.match(none.body, /needs TWO annotation files/);
  // And it says WHY two files rather than two passes — independence is the measurement.
  assert.match(none.body, /measure consistency, not agreement/);

  // A row with no `mode`. Coercing it would make `undefined` its own agreement CATEGORY and inflate
  // the statistic, so this must refuse rather than compute.
  writeFileSync(bad, JSON.stringify([{ id: '1' }]));
  const missingMode = await run(["resteer", "agreement", bad, ok], deps(new InMemoryStore(), false));
  assert.equal(missingMode.ok, false);
  assert.match(missingMode.body, /has no string "mode"/);

  // Not an array.
  writeFileSync(bad, JSON.stringify({ id: '1', mode: 'x' }));
  const notArray = await run(["resteer", "agreement", bad, ok], deps(new InMemoryStore(), false));
  assert.equal(notArray.ok, false);
  assert.match(notArray.body, /must be a JSON ARRAY/);

  // Unreadable path.
  const gone = await run(["resteer", "agreement", path.join(dir, 'nope.json'), ok], deps(new InMemoryStore(), false));
  assert.equal(gone.ok, false);
  assert.match(gone.body, /could not read/);
});

test("resteer-unknown-subcommand-is-refused", async () => {
  const res = await run(["resteer", "route"], deps(new InMemoryStore(), false));
  assert.equal(res.ok, false);
  assert.match(res.body, /unknown resteer command "route"/);
});
