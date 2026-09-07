/**
 * `treeCommand`'s SPEC-LOAD FAILURE SURFACE — story-load-error-surfaces-arc, from friction
 * `story-load-failure-renders-as-unknown`.
 *
 * ⚠ IT LIVES HERE, BESIDE THE SOURCE, AND NOT IN `packages/cli/src/tree.test.ts` WHERE THE REST OF
 * THIS COMMAND'S PROOF SITS. `packages/cli/src/tree.ts` is a re-export shim (ADR-0112) and the
 * command itself is this package's, so a suite in `cli` mutates nothing here: `check:mutation-diff`
 * mutates the CHANGED source in its own project and runs that project's tests, and with the only
 * changed tests one package over it SKIPPED — reporting "nothing would be proved by mutating" over
 * a behaviour change. A skip is unverified, not a pass. This is the sibling unit suite that closes
 * that, and it is deliberately narrow: the shim's own registered REAL proof is unchanged.
 */

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { treeCommand, type TreeDeps } from "./tree.js";

const NOW = new Date("2026-06-11T10:00:00.000Z");

let brokenDir: string;
let healthyDir: string;

before(() => {
  brokenDir = mkdtempSync(join(tmpdir(), "tree-view-broken-"));

  // (a) NO FRONTMATTER AT ALL — `loadNodeSpec` throws its own message, and that message already
  //     opens with the file path.
  const noFm = join(brokenDir, "no-frontmatter");
  mkdirSync(noFm);
  writeFileSync(join(noFm, "story.md"), "# just a heading, no frontmatter block\n");

  // (b) FRONTMATTER THAT FAILS THE SCHEMA — the zod report names the offending field and does NOT
  //     open with the path, which is the branch that has to prepend it.
  const badSchema = join(brokenDir, "bad-schema");
  mkdirSync(badSchema);
  writeFileSync(
    join(badSchema, "story.md"),
    ["---", "id: bad-schema", "tier: story", "title: Bad Schema", "---", "", "body"].join("\n"),
  );

  // (c) A GOOD STORY WITH AN UNREADABLE CAPABILITY — the file exists and will not parse, which is a
  //     different fix from a file that is not there.
  const badCap = join(brokenDir, "bad-cap");
  mkdirSync(badCap);
  writeFileSync(
    join(badCap, "story.md"),
    [
      "---",
      "id: bad-cap",
      "tier: story",
      "title: Bad Cap Story",
      "outcome: it has one unreadable capability",
      "status: proposed",
      "proof_mode: UAT",
      "capabilities:",
      "  - cap-broken",
      "---",
      "",
      "Body.",
    ].join("\n"),
  );
  writeFileSync(join(badCap, "cap-broken.md"), "no frontmatter here either\n");

  // (d) THE CONTROL — a story and a capability that both load, so the non-vacuity test below reads
  //     a dir where nothing failed rather than merely a view that happened not to print.
  healthyDir = mkdtempSync(join(tmpdir(), "tree-view-healthy-"));
  const good = join(healthyDir, "good-story");
  mkdirSync(good);
  writeFileSync(
    join(good, "story.md"),
    [
      "---",
      "id: good-story",
      "tier: story",
      "title: Good Story",
      "outcome: it loads",
      "status: proposed",
      "proof_mode: UAT",
      "capabilities:",
      "  - cap-good",
      "---",
      "",
      "Body.",
    ].join("\n"),
  );
  writeFileSync(
    join(good, "cap-good.md"),
    [
      "---",
      "id: cap-good",
      "tier: capability",
      "title: Good Capability",
      "outcome: it loads too",
      "status: proposed",
      "proof_mode: integration-test",
      "---",
      "",
      "Body.",
    ].join("\n"),
  );
});

after(() => {
  rmSync(brokenDir, { recursive: true, force: true });
  rmSync(healthyDir, { recursive: true, force: true });
});

const brokenDeps = (): TreeDeps => ({ storiesDir: brokenDir, lookupConfig: () => null, now: () => NOW });

test("⚠ NON-VACUITY: a story that loads carries NO failure block at all — the block contributes ZERO lines, not an empty-looking one", async () => {
  const deps: TreeDeps = { storiesDir: healthyDir, lookupConfig: () => null, now: () => NOW };
  const bare = await treeCommand(undefined, deps);
  const focused = await treeCommand("good-story", deps);
  for (const env of [bare, focused]) {
    assert.equal(env.ok, true);
    assert.ok(!env.body.includes("could not be read"), `a healthy read prints no failure block: ${env.body}`);
    assert.ok(!env.body.includes("(unreadable)"), "and no row claims a spec would not parse");
  }
  // ⚠ COUNTED, NOT MERELY SEARCHED FOR. "Contributes nothing" is a statement about LINES, and a
  // substring search cannot make it: a block that appended a line saying anything at all would pass
  // every assertion above. The healthy dir holds ONE story, so the bare view is exactly its heading
  // and its row — any extra line is the failure block having spoken when it had nothing to say.
  const bareLines = bare.body.split("\n");
  assert.equal(bareLines.length, 2, `the bare view of one healthy story is two lines: ${JSON.stringify(bare.body)}`);
  assert.equal(bareLines[0], "Stories:");
  assert.ok(bareLines[1]?.startsWith("  good-story"), `and the second is the story's row: ${bareLines[1]}`);
  // And the focused view is a multi-line render, which is what says the lines were JOINED with a
  // newline rather than run together.
  assert.ok(focused.body.split("\n").length > 4, `the focused body is a block of lines: ${JSON.stringify(focused.body)}`);
  assert.equal(focused.body.split("\n")[0], "Story: good-story", "and its first line is the heading alone");
});

test("⚠ the BARE view still lists a story whose spec throws, and NAMES the reason — but stays ok, because one author's broken file must not fail everyone's inventory", async () => {
  const env = await treeCommand(undefined, brokenDeps());
  // The inventory is what was asked for and it is complete.
  assert.equal(env.ok, true, "one broken story does not fail the whole inventory");
  for (const id of ["no-frontmatter", "bad-schema", "bad-cap"]) {
    assert.ok(env.body.includes(id), `${id} is still listed`);
  }
  assert.ok(env.body.includes("(unknown)"), "a story that would not load still renders its placeholder row");
  // ⚠ AND THE HALF THAT WAS MISSING: the loader's own words, not a summary of them.
  assert.ok(env.body.includes("spec(s) could not be read"), "the failure block is present");
  assert.ok(env.body.includes("2 spec(s) could not be read"), "exactly the two stories that threw, not three and not one");
  // ⚠ THE BLANK LINE THAT SEPARATES IT FROM THE LISTING IS PART OF THE BLOCK, not incidental
  // whitespace: without it the header runs straight on from the last story row and reads as one.
  const bodyLines = env.body.split("\n");
  const headerAt = bodyLines.findIndex((l) => l.includes("spec(s) could not be read"));
  assert.ok(headerAt > 0, "the header is not the first line");
  assert.equal(bodyLines[headerAt - 1], "", "the failure block opens with a blank separator line");
  assert.ok(
    env.body.includes("no frontmatter block (the file must start with '---')"),
    "loadNodeSpec's own message reaches the body verbatim",
  );
  assert.ok(env.body.includes("no-frontmatter"), "and the failing file is named");
  // Non-vacuity: the story that loads fine contributes NO failure line.
  assert.ok(!env.body.includes("bad-cap/story.md"), "a story that loads is not reported as a failure");
});

test("⚠⚠ the FOCUSED view on a story whose spec throws exits NON-ZERO and prints the loader's message — it used to render (unknown) at exit 0", async () => {
  const env = await treeCommand("no-frontmatter", brokenDeps());
  assert.equal(env.ok, false, "a hollow render must not report success");
  assert.ok(env.body.includes("(unknown)"), "what can be rendered still is");
  assert.ok(
    env.body.includes("no frontmatter block (the file must start with '---')"),
    "and the reason is on the page",
  );
  // The `next` pointers still ship — an error is guidance, not a bare failure (the envelope's own rule).
  assert.ok(Array.isArray(env.next) && env.next.length > 0, "a failed read still offers next steps");
});

test("⚠ the SCHEMA failure's message does not open with the path, so the path is prepended — and the loader's own message, which does, is not printed twice", async () => {
  const schema = await treeCommand("bad-schema", brokenDeps());
  assert.equal(schema.ok, false);
  // The path is absolute and its separator is the platform's, so the line is found by the tail the
  // renderer wrote rather than by a hand-built path.
  const schemaLine = schema.body.split("\n").find((l) => l.includes("story.md: "));
  assert.ok(schemaLine !== undefined, `the failure line names the file: ${schema.body}`);
  assert.ok(schemaLine.includes("bad-schema"), "and it is the failing story's file");
  assert.ok(schema.body.includes('"outcome"'), "the zod report names the offending field, so the message is printed WHOLE");

  const noFm = await treeCommand("no-frontmatter", brokenDeps());
  const noFmLine = noFm.body.split("\n").find((l) => l.includes("no frontmatter block"));
  assert.ok(noFmLine !== undefined);
  // ⚠ ONCE. The old shape would have read `<path>: <path>: no frontmatter block ...`.
  assert.equal(
    noFmLine.split("story.md").length - 1,
    1,
    `the path appears exactly once: ${noFmLine}`,
  );
});

test("⚠ a capability whose file EXISTS but will not parse reads (unreadable), not (spec missing) — and fails the view it belongs to", async () => {
  const env = await treeCommand("bad-cap", brokenDeps());
  assert.equal(env.ok, false, "this view IS that story's hierarchy, so an unreadable member makes it wrong");
  // The story itself loaded, so its own fields are real — only the capability row is a placeholder.
  assert.ok(env.body.includes("Bad Cap Story"), "the story's own title is rendered");
  // BOTH columns, not either — the title and the status are separate placeholders and a row that
  // said `(unreadable)` in only one of them would read as a spec that half-parsed.
  const capRow = env.body.split("\n").find((l) => l.includes("cap-broken "));
  assert.ok(capRow !== undefined, `the capability row is rendered: ${env.body}`);
  assert.ok(capRow.includes("  (unreadable)  "), "the title column says the file would not parse");
  assert.ok(capRow.includes("status=(unreadable)"), "and so does the status column");
  assert.ok(!env.body.includes("(spec missing)"), "which is NOT the same as the file being absent");
  assert.ok(env.body.includes("cap-broken.md"), "and the failing file is named");
  assert.ok(env.body.includes("1 spec(s) could not be read"), "one failure, not the story's own");
});
