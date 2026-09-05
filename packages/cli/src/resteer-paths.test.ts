import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { CLI_READ_VERBS } from "@storytree/context-traversal-capture";

import { run } from "./commands.js";

/**
 * The `storytree resteer` paths the two sibling suites do not reach.
 *
 * `resteer.test.ts` asserts the ordinary behaviour; `resteer-envelopes.test.ts` pins the ordinary
 * text. Between them they walk the happy path and the common refusals. This file is for what is
 * left: the branches only a MALFORMED store, an unusual flag value, or a degenerate statistic can
 * reach — the places a defect sits unobserved precisely because nobody goes there.
 *
 * `check:mutation-diff` is what identified them, one line at a time. Each test names the BEHAVIOUR
 * it protects rather than the mutant that pointed at it, because the mutant is scaffolding and the
 * behaviour is the thing that has to keep being true.
 */

const NOW = "2026-09-05T12:00:00.000Z";
const BRANCH = "claude/test-resteer";

function deps(s: InMemoryStore, writable = false) {
  const base = { store: s, friction: { branch: BRANCH, now: NOW, inboxDir: "", docsDir: "" } };
  return writable ? { ...base, writable: true } : base;
}

function cap(title: string, over: Record<string, string> = {}): string[] {
  const flags: Record<string, string> = {
    "--title": title,
    "--doing": "d",
    "--redirect": "r",
    "--evidence": '"quoted words here"',
    "--disposition": "taste",
    "--by": "owner",
    ...over,
  };
  const argv = ["resteer", "new"];
  for (const [k, v] of Object.entries(flags)) argv.push(k, v);
  argv.push("--pg");
  return argv;
}

/* -------------------------------------------------------------------------------------------- */
/* Every stored field is TRIMMED                                                                  */
/* -------------------------------------------------------------------------------------------- */

test("resteer-every-prose-field-is-trimmed-before-it-is-stored", async () => {
  // `--doing @notes.md` hands the value over with the file's trailing newline attached, and all four
  // of these are `@path`-expandable. Untrimmed, that newline is stored forever and every later
  // exact-match read of the field misses.
  const s = new InMemoryStore();
  const res = await run(
    [
      "resteer", "new",
      "--title", "  Padded title  ",
      "--doing", "  padded doing\n",
      "--redirect", "  padded redirect\n",
      "--evidence", '  "padded evidence"\n',
      "--disposition", "taste", "--by", "owner", "--pg",
    ],
    deps(s, true),
  );
  assert.equal(res.ok, true, res.body);
  const raw = (await s.getDoc("resteer-padded-title"))?.doc as Record<string, unknown>;
  assert.equal(raw["title"], "Padded title");
  assert.equal(raw["doing"], "padded doing");
  assert.equal(raw["redirect"], "padded redirect");
  assert.equal(raw["evidence"], '"padded evidence"');
  // `description` defaults to the redirect, and is trimmed on that path too.
  assert.equal(raw["description"], "padded redirect");
});

test("resteer-an-explicit-description-is-used-and-trimmed", async () => {
  const s = new InMemoryStore();
  const argv = [...cap("With desc").slice(0, -1), "--description", "  a stated one-liner  ", "--pg"];
  assert.equal((await run(argv, deps(s, true))).ok, true);
  const raw = (await s.getDoc("resteer-with-desc"))?.doc as Record<string, unknown>;
  assert.equal(raw["description"], "a stated one-liner");
});

test("resteer-a-whitespace-only-self-report-is-absent, not stored blank", async () => {
  // An empty `selfReport` key would read as "the agent said nothing" where the truth is "nobody
  // filled this in" — a distinction the unvalidated column exists to keep.
  const s = new InMemoryStore();
  const argv = [...cap("Blank sr").slice(0, -1), "--self-report", "   ", "--pg"];
  assert.equal((await run(argv, deps(s, true))).ok, true);
  const raw = (await s.getDoc("resteer-blank-sr"))?.doc as Record<string, unknown>;
  assert.equal("selfReport" in raw, false);
  // A taste row likewise carries NO `mode` key at all, rather than an explicit undefined.
  assert.equal("mode" in raw, false);
});

test("resteer-a-padded-self-report-is-trimmed-and-kept", async () => {
  const s = new InMemoryStore();
  const argv = [...cap("Padded sr").slice(0, -1), "--self-report", "  I said I misread it  ", "--pg"];
  assert.equal((await run(argv, deps(s, true))).ok, true);
  const raw = (await s.getDoc("resteer-padded-sr"))?.doc as Record<string, unknown>;
  assert.equal(raw["selfReport"], "I said I misread it");
});

/* -------------------------------------------------------------------------------------------- */
/* The id slug                                                                                    */
/* -------------------------------------------------------------------------------------------- */

test("resteer-id-slug-strips-leading-and-trailing-separators", async () => {
  const s = new InMemoryStore();
  // Punctuation, not hyphens: a value beginning `--` is parsed as a FLAG before it ever reaches the
  // slug, so a leading-hyphen title cannot be supplied through the CLI at all.
  assert.equal((await run(cap("!!! Leading and trailing ???"), deps(s, true))).ok, true);
  assert.ok(await s.getDoc("resteer-leading-and-trailing"), "the id must carry no edge hyphens");
});

test("resteer-id-slug-trims-a-hyphen-left-by-the-length-cut", async () => {
  // The 60-character cut can land exactly on a separator, leaving a trailing hyphen that the FIRST
  // strip (which ran before the cut) can no longer see. Both strips are load-bearing; this exercises
  // the second.
  const s = new InMemoryStore();
  assert.equal((await run(cap("a".repeat(59) + " tail"), deps(s, true))).ok, true);
  const stored = await s.queryDocs({ kind: "resteer" });
  assert.equal(stored[0]?.id, "resteer-" + "a".repeat(59));
});

/* -------------------------------------------------------------------------------------------- */
/* The write                                                                                      */
/* -------------------------------------------------------------------------------------------- */

test("resteer-successful-defect-capture-body-is-pinned", async () => {
  // The success line's OTHER arms: the mode is named, and the taste-exclusion sentence is absent.
  const res = await run(
    cap("D one", { "--disposition": "defect", "--mode": "incorrect-verification" }),
    deps(new InMemoryStore(), true),
  );
  assert.equal(res.ok, true);
  assert.equal(
    res.body,
    'recorded re-steer resteer-d-one on "claude/test-resteer" (2026-09-05) — defect, incorrect-verification (called by: owner).',
  );
  assert.deepEqual(res.next, [
    "storytree resteer list --pg",
    "storytree library artifact resteer-d-one --pg",
  ]);
});

test("resteer-write-is-attributed-to-the-injected-actor, and defaults when none is given", async () => {
  const s = new InMemoryStore();
  await run(cap("Actor one"), { ...deps(s, true), actor: "someone@example.com" });
  assert.equal((await s.readEvents()).at(-1)?.actor, "someone@example.com");

  const s2 = new InMemoryStore();
  await run(cap("Actor two"), deps(s2, true));
  const fallback = (await s2.readEvents()).at(-1)?.actor;
  // The default is DERIVED, never absent — an unattributed write is one nobody can trace back.
  assert.equal(typeof fallback, "string");
  assert.ok((fallback ?? "").length > 0);
});

/* -------------------------------------------------------------------------------------------- */
/* The report's other shapes                                                                      */
/* -------------------------------------------------------------------------------------------- */

test("resteer-list-reads-ONLY-resteer-rows", async () => {
  // The kind filter. Without it the report counts every artifact in the store and the defect share
  // is diluted by rows that are not interventions at all.
  const s = new InMemoryStore();
  await run(cap("T one"), deps(s, true));
  await s.upsertDoc({ id: "a-friction", kind: "friction", doc: { kind: "friction" }, actor: "t" });
  const res = await run(["resteer", "list"], deps(s, false));
  assert.match(res.body, /^1 re-steers recorded/);
});

test("resteer-list-with-no-defects-omits-the-mode-table-and-the-agent-taste-warning", async () => {
  const s = new InMemoryStore();
  await run(cap("T one"), deps(s, true));
  await run(cap("T two"), deps(s, true));
  const res = await run(["resteer", "list"], deps(s, false));
  assert.equal(res.ok, true);
  assert.equal(
    res.body,
    "2 re-steers recorded — 0 defect, 2 taste.\n\n" +
      "  defect share (all taste excluded):        0.0%\n" +
      "  defect share (only OWNER-marked taste):   0.0%\n" +
      "  taste called by owner / by agent:         2 / 0\n\n" +
      "PER SESSION\n" +
      "    0 defect    2 taste   claude/test-resteer\n\n" +
      "NOT COMPUTABLE FROM THIS TIER\n" +
      "  · HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row and cannot be counted from this tier.\n" +
      "  · TCR@k — needs the same session denominator, plus each session's completion outcome, neither of which is a field on this tier.",
  );
  // With no defect to point at, the follow-on is the help rather than a dangling artifact link.
  assert.deepEqual(res.next, [
    "storytree resteer --help",
    "storytree library artifact mast-failure-frame",
  ]);
  assert.deepEqual((res as { observedResultIds?: string[] }).observedResultIds, [
    "resteer-t-one",
    "resteer-t-two",
  ]);
});

test("resteer-list-reports-rows-it-could-not-read-rather-than-dropping-them", async () => {
  // A row that does not validate is in NO figure above it. Saying so is the difference between a
  // report that is narrow and one that is quietly wrong.
  const s = new InMemoryStore();
  await run(cap("D one", { "--disposition": "defect", "--mode": "step-repetition" }), deps(s, true));
  await s.upsertDoc({ id: "broken", kind: "resteer", doc: { kind: "resteer", nope: true }, actor: "t" });
  await s.upsertDoc({ id: "otherkind", kind: "friction", doc: { kind: "friction" }, actor: "t" });
  const res = await run(["resteer", "list"], deps(s, false));
  assert.equal(
    res.body,
    "1 re-steers recorded — 1 defect, 0 taste.\n\n" +
      "  defect share (all taste excluded):        100.0%\n" +
      "  defect share (only OWNER-marked taste):   100.0%\n" +
      "  taste called by owner / by agent:         0 / 0\n\n" +
      "FAILURE MODES (defects only)\n" +
      "    1  step-repetition  (specification-and-design)\n\n" +
      "PER SESSION\n" +
      "    1 defect    0 taste   claude/test-resteer\n\n" +
      "  ⚠ 1 stored row(s) did not validate as a re-steer and are in NO figure above.\n" +
      "    Every figure here is over the rows that parsed — say so if you quote one.\n\n" +
      "NOT COMPUTABLE FROM THIS TIER\n" +
      "  · HUMAN INTERVENTION RATE — needs a count of sessions (or actions) that were NOT re-steered. Zero is deliberately unmarked (a free outcome), so a session with no re-steers files no row and cannot be counted from this tier.\n" +
      "  · TCR@k — needs the same session denominator, plus each session's completion outcome, neither of which is a field on this tier.",
  );
  // The unreadable row contributes no id either — the capture records what was actually surfaced.
  assert.deepEqual((res as { observedResultIds?: string[] }).observedResultIds, ["resteer-d-one"]);
});

test("resteer-list-orders-modes-by-count-descending", async () => {
  const s = new InMemoryStore();
  for (const t of ["a", "b", "c"]) {
    await run(cap("Rep " + t, { "--disposition": "defect", "--mode": "step-repetition" }), deps(s, true));
  }
  await run(cap("Ver one", { "--disposition": "defect", "--mode": "incorrect-verification" }), deps(s, true));
  const table = (await run(["resteer", "list"], deps(s, false))).body;
  const modes = table.slice(table.indexOf("FAILURE MODES"));
  assert.ok(
    modes.indexOf("step-repetition") < modes.indexOf("incorrect-verification"),
    "the commoner mode must come first — an unordered table hides where the mass is",
  );
});

test("resteer-list-shows-at-most-twenty-sessions", async () => {
  // The per-session block is a summary, not a dump: 25 branches must render 20 rows.
  const s = new InMemoryStore();
  for (let i = 0; i < 25; i++) {
    await run(cap("S" + i, { "--disposition": "defect", "--mode": "step-repetition" }), {
      store: s,
      writable: true,
      friction: { branch: "claude/b" + String(i).padStart(2, "0"), now: NOW, inboxDir: "", docsDir: "" },
    });
  }
  const body = (await run(["resteer", "list"], deps(s, false))).body;
  const block = body.slice(body.indexOf("PER SESSION"), body.indexOf("NOT COMPUTABLE"));
  assert.equal((block.match(/claude\/b/g) ?? []).length, 20);
});

/* -------------------------------------------------------------------------------------------- */
/* The agreement verb's edges                                                                     */
/* -------------------------------------------------------------------------------------------- */

test("resteer-agreement-reports-an-UNDEFINED-kappa-and-an-off-frame-label", async () => {
  // Two degenerate cases at once. Both annotators used ONE label, so chance agreement is total and
  // kappa is 0/0 — reported as undefined, never as a fabricated 1. And the label is not a MAST mode,
  // so the category roll-up buckets it as `off-frame` rather than throwing or silently dropping it.
  const dir = mkdtempSync(path.join(os.tmpdir(), "resteer-flat-"));
  const a = path.join(dir, "a.json");
  const b = path.join(dir, "b.json");
  const rows = JSON.stringify([
    { id: "1", mode: "not-a-mast-mode" },
    { id: "2", mode: "not-a-mast-mode" },
  ]);
  writeFileSync(a, rows);
  writeFileSync(b, rows);
  const res = await run(["resteer", "agreement", a, b], deps(new InMemoryStore(), false));
  assert.equal(
    res.body,
    "n = 2 items both annotators labelled.\n\n" +
      "MODE GRAIN     (1 labels in play)\n" +
      "  observed agreement  1.000\n" +
      "  expected by chance  1.000\n" +
      "  Cohen's kappa       undefined (see below)\n\n" +
      "CATEGORY GRAIN (1 labels in play)\n" +
      "  observed agreement  1.000\n" +
      "  expected by chance  1.000\n" +
      "  Cohen's kappa       undefined (see below)\n\n" +
      "An `undefined` kappa means chance agreement was total (one label used for everything), so the\n" +
      "statistic is 0/0. Read it as 'no reading', never as 0 or 1.",
  );
});

test("resteer-agreement-refuses-each-file-position-independently", async () => {
  // BOTH positions, because a reader that only ever checked the first would satisfy every other test
  // here while ignoring the second file entirely.
  const dir = mkdtempSync(path.join(os.tmpdir(), "resteer-pos-"));
  const ok = path.join(dir, "ok.json");
  const gone = path.join(dir, "gone.json");
  writeFileSync(ok, JSON.stringify([{ id: "1", mode: "step-repetition" }]));

  const onlyOne = await run(["resteer", "agreement", ok], deps(new InMemoryStore(), false));
  assert.equal(onlyOne.ok, false);
  assert.match(onlyOne.body, /needs TWO annotation files/);

  const badFirst = await run(["resteer", "agreement", gone, ok], deps(new InMemoryStore(), false));
  assert.equal(badFirst.ok, false);
  assert.match(badFirst.body, /could not read .*gone\.json/);

  const badSecond = await run(["resteer", "agreement", ok, gone], deps(new InMemoryStore(), false));
  assert.equal(badSecond.ok, false);
  assert.match(badSecond.body, /could not read .*gone\.json/);
});

test("resteer-agreement-refuses-every-malformed-entry-shape", async () => {
  // Each arm named separately. A single "it refuses bad input" case would stay green while any one of
  // these checks silently stopped firing — and a `mode` that coerced instead of refusing would make
  // `undefined` its own agreement category and inflate the statistic.
  const dir = mkdtempSync(path.join(os.tmpdir(), "resteer-shapes-"));
  const ok = path.join(dir, "ok.json");
  const bad = path.join(dir, "bad.json");
  writeFileSync(ok, JSON.stringify([{ id: "1", mode: "step-repetition" }]));

  const cases: Array<readonly [string, RegExp]> = [
    ["not json at all", /is not valid JSON/],
    [JSON.stringify({ id: "1", mode: "x" }), /must be a JSON ARRAY/],
    [JSON.stringify([null]), /\[0\] is not an object/],
    [JSON.stringify(["a string"]), /\[0\] is not an object/],
    [JSON.stringify([{ mode: "x" }]), /has no string "id"/],
    [JSON.stringify([{ id: "", mode: "x" }]), /has no string "id"/],
    [JSON.stringify([{ id: 7, mode: "x" }]), /has no string "id"/],
    [JSON.stringify([{ id: "1" }]), /has no string "mode"/],
    [JSON.stringify([{ id: "1", mode: "" }]), /has no string "mode"/],
    [JSON.stringify([{ id: "1", mode: 7 }]), /has no string "mode"/],
  ];
  for (const [content, expected] of cases) {
    writeFileSync(bad, content);
    const res = await run(["resteer", "agreement", bad, ok], deps(new InMemoryStore(), false));
    assert.equal(res.ok, false, "must refuse: " + content.slice(0, 40));
    assert.match(res.body, expected);
  }
});

/* -------------------------------------------------------------------------------------------- */
/* Wiring                                                                                         */
/* -------------------------------------------------------------------------------------------- */

test("resteer-area-runs-without-an-injected-clock-or-branch", async () => {
  // The composition root's OWN defaults. Every other test injects branch and clock, so nothing else
  // proves the real `currentBranch()` / `new Date()` path is wired at all.
  const read = await run(["resteer", "list"], { store: new InMemoryStore() });
  assert.equal(read.ok, true);
  const written = await run(cap("No injection"), { store: new InMemoryStore(), writable: true });
  assert.equal(written.ok, true, written.body);
});

test("resteer-is-listed-on-the-top-level-help", async () => {
  // A capture step that is DISCIPLINE rather than a gate rung is only ever run by someone who knows
  // it exists, so the one-line entry on the root help is not decoration — it is the whole discovery
  // path. Asserted verbatim, because a half-empty line still looks like a listing.
  const res = await run([], { store: new InMemoryStore() });
  assert.ok(
    res.body.includes("  resteer          record what the OWNER redirected (ADR-0515) — new | list"),
    "the root help must list the resteer area verbatim",
  );
});

test("resteer-list-is-classified-as-a-corpus-search-under-its-own-operation-word", () => {
  // The trace store groups by `operation`, so a wrong or empty word re-buckets this verb's whole
  // history into someone else's.
  const spec = CLI_READ_VERBS["resteer list"];
  assert.equal(spec?.observes, "search");
  assert.equal((spec as { operation?: string }).operation, "resteer_list");
  assert.equal((spec as { surfaceId?: string }).surfaceId, "resteer");
  // Its write sibling observes nothing — a capture is not a corpus read.
  assert.equal(CLI_READ_VERBS["resteer new"]?.observes, "nothing");
});
