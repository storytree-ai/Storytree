import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { storyUatCompleteness } from "./story-completeness.js";

/**
 * ADR-0092 (gate-as-proof for a machine-witnessed story's own UAT node): the per-story
 * structural-completeness check is RED against an incomplete story scaffold (missing sections /
 * untagged legs / placeholders) and GREEN against a complete, fully-witnessed machine-UAT record —
 * never asserting the story is `healthy` (the story-green crown stays ADR-0082/0083). This is the
 * "test" the prove-it-gate drives red→green via edit-existing (ADR-0057 C), the story analog of
 * `adr-completeness.test.ts`.
 */

const FILE = "stories/library/story.md";

/** A complete, fully-witnessed machine-UAT story record: every completeness check passes. */
const COMPLETE_MACHINE_STORY = [
  "---",
  'id: "demo"',
  "tier: story",
  'title: "A demo story"',
  'outcome: "An agent does one provable thing end to end through a real surface."',
  "status: mapped",
  "proof_mode: UAT",
  "uat_witness: machine",
  "capabilities: [cap-one, cap-two]",
  "---",
  "",
  "# A demo story",
  "",
  "## Story UAT",
  "",
  "1. **First leg:** _(witness: machine)_ run the thing. **Success —** it works.",
  "2. **Second leg:** _(witness: machine)_ run the other thing. **Success —** it also works.",
  "",
  "## Proof",
  "",
  "The story is proven when the UAT passes against the real organism.",
  "",
].join("\n");

test("GREEN against a complete, fully-witnessed machine-UAT story record", () => {
  assert.deepEqual(storyUatCompleteness(FILE, COMPLETE_MACHINE_STORY), []);
});

test("GREEN against the REAL library story.md (the checker is grounded against the live spec)", () => {
  // The library story is the first gate-as-proof story KIND (ADR-0092). It must read as COMPLETE —
  // if a future edit makes it incomplete, this catches it before the spec ships an honest-by-absence red.
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  const real = readFileSync(path.join(repoRoot, "stories", "library", "story.md"), "utf8").replace(/\r\n/g, "\n");
  assert.deepEqual(
    storyUatCompleteness("stories/library/story.md", real),
    [],
    "the live library story.md must be structurally complete",
  );
});

test("RED on a missing `## UAT Test Criteria` section (the integrated acceptance journey)", () => {
  const noUat = COMPLETE_MACHINE_STORY.replace(
    "## Story UAT\n\n1. **First leg:** _(witness: machine)_ run the thing. **Success —** it works.\n2. **Second leg:** _(witness: machine)_ run the other thing. **Success —** it also works.\n\n",
    "",
  );
  const fails = storyUatCompleteness(FILE, noUat);
  assert.ok(
    fails.some((f) => /UAT Test Criteria/.test(f)),
    `expected a UAT Test Criteria failure, got: ${fails.join(" | ")}`,
  );
});

test("RED on a UAT leg that does not declare its witness (silent `either` default)", () => {
  const untagged = COMPLETE_MACHINE_STORY.replace(
    "2. **Second leg:** _(witness: machine)_ run the other thing. **Success —** it also works.",
    "2. **Second leg:** run the other thing. **Success —** it also works.",
  );
  const fails = storyUatCompleteness(FILE, untagged);
  assert.ok(
    fails.some((f) => /leg\(s\) 2 .* witness/.test(f)),
    `expected an untagged-leg failure naming leg 2, got: ${fails.join(" | ")}`,
  );
});

test("RED on an EXPLICIT-but-invalid witness tag (fails closed, not a crash)", () => {
  const bad = COMPLETE_MACHINE_STORY.replace("(witness: machine)_ run the thing", "(witness: nobody)_ run the thing");
  const fails = storyUatCompleteness(FILE, bad);
  assert.ok(
    fails.some((f) => /invalid witness/.test(f)),
    `expected an invalid-witness failure, got: ${fails.join(" | ")}`,
  );
});

test("RED on a human-witnessed story (a human UAT is a ceremony, not a machine gate-as-proof)", () => {
  const human = COMPLETE_MACHINE_STORY.replace("uat_witness: machine", "uat_witness: human").replace(
    /_\(witness: machine\)_/g,
    "_(witness: human)_",
  );
  const fails = storyUatCompleteness(FILE, human);
  assert.ok(
    fails.some((f) => /uat_witness.*must be "machine"/.test(f)),
    `expected a witness-frontmatter failure, got: ${fails.join(" | ")}`,
  );
});

test("RED on unfilled `<…>` scaffold placeholders (a fresh story scaffold's genuine red)", () => {
  const scaffolded = COMPLETE_MACHINE_STORY.replace(
    "An agent does one provable thing end to end through a real surface.",
    "An agent does <one provable thing> end to end.",
  );
  const fails = storyUatCompleteness(FILE, scaffolded);
  assert.ok(fails.some((f) => /placeholder/.test(f)), `expected a placeholder failure, got: ${fails.join(" | ")}`);
});

test("an inline `<id>`-style code span does NOT false-trip the placeholder detector", () => {
  // `<id>` has no internal whitespace, and code spans are stripped — a finished story uses these freely.
  const withCode = COMPLETE_MACHINE_STORY.replace(
    "run the thing. **Success —** it works.",
    "run `storytree library artifact <id>` and `--set <field>=<value>`. **Success —** it works.",
  );
  assert.deepEqual(storyUatCompleteness(FILE, withCode), []);
});

test("RED on a non-story tier / missing capabilities (wrong artifact shape)", () => {
  const cap = COMPLETE_MACHINE_STORY.replace("tier: story", "tier: capability").replace(
    "capabilities: [cap-one, cap-two]",
    "capabilities: []",
  );
  const fails = storyUatCompleteness(FILE, cap);
  assert.ok(fails.some((f) => /tier/.test(f)), `expected a tier failure, got: ${fails.join(" | ")}`);
  assert.ok(fails.some((f) => /capabilities/.test(f)), `expected a capabilities failure, got: ${fails.join(" | ")}`);
});

test("malformed frontmatter returns a parse/shape failure (not a crash)", () => {
  assert.ok(storyUatCompleteness(FILE, "no frontmatter here\n").length > 0);
});
