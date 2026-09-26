// The seed's rules (scripts/library-seed.mjs): how stories/library.md becomes a story, capabilities
// and contracts, how a test run's results become each contract's verified health, and that writing
// them to a library is idempotent. The parsing and judging tests are pure; the library tests run
// against the Postgres `pnpm test` provides (STORYTREE_TEST_PG_URL), each in a project of its own
// that is dropped afterwards.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { connect } from "@storytree/library";
import pg from "pg";

import { contractsCoveredBy, judge, parseJunit, parseStory, recordHealth, syncStory } from "./library-seed.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const librarySpec = readFileSync(path.join(root, "stories", "library.md"), "utf8");
const librarySrc = path.join(root, "packages", "library", "src");

// test-removed: "parseStory reads stories/library.md" pinned the library story file's own titles, prose,
// dependencies and contract counts, so it went red whenever that document changed (ADR-0623 D1: a test's
// subject is a product behaviour, never the wording or shape of a document). The parse behaviours it was
// the only test of, reading Depends on lines and following the build order, are the next test's subject.

test("parseStory takes capabilities in the build order's order, then any it leaves out, and reads each Depends on line up to its first full stop or bracket", () => {
  const story = parseStory(
    [
      "# Story: four parts",
      "",
      "**What it is.** Four capabilities.",
      "",
      "Build order: 1 → (3, 2).",
      "",
      "## 1 · First",
      "",
      "- **Depends on:** nothing.",
      "",
      "## 2 · Second",
      "",
      "- **Depends on:** 1 (and 3's records, which it does not need).",
      "",
      "## 3 · Third",
      "",
      "- **Depends on:** 1.",
      "",
      "## 4 · Fourth",
      "",
      "- **Depends on:** 1 and 2. Not 3.",
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    story.capabilities.map(({ number, dependsOn }) => [number, dependsOn]),
    [[1, []], [3, [1]], [2, [1]], [4, [1, 2]]],
  );
});

test("parseStory keeps heading order when there is no build order, and refuses a build order that puts a capability before one it depends on", () => {
  const spec = (buildOrder) => [
    "# Story: a small one",
    "",
    "**What it is.** Two capabilities.",
    "",
    ...(buildOrder === undefined ? [] : [`Build order: ${buildOrder}.`, ""]),
    "## 1 · First",
    "",
    "The first one,",
    "over two lines.",
    "",
    "- **Depends on:** nothing.",
    "",
    "**Contracts:**",
    "1. Does a thing,",
    "   carried on.",
    "2. Does another.",
    "",
    "## 2 · Second",
    "",
    "The second one.",
    "",
    "- **Depends on:** 1.",
    "",
    "**Contracts:**",
    "1. Only one.",
    "",
  ].join("\n");

  const story = parseStory(spec());
  assert.equal(story.title, "A small one");
  assert.equal(story.description, "Two capabilities.");
  assert.deepEqual(story.capabilities.map(({ title }) => title), ["1 · First", "2 · Second"]);
  assert.equal(story.capabilities[0].description, "The first one, over two lines.");
  assert.deepEqual(story.capabilities[0].contracts.map(({ title }) => title), ["1.1 · Does a thing, carried on.", "1.2 · Does another."]);
  assert.throws(() => parseStory(spec("2 → 1")), /2 · Second.*before.*1 · First/);
});

test("parseJunit reads each test's name, the suites around it, its file, and whether it passed, failed or was skipped", () => {
  const results = parseJunit(JUNIT);
  assert.deepEqual(results, [
    { name: "packages\\library\\src\\transactions\\pg.test.ts", suites: [], file: "C:\\repo\\packages\\library\\src\\transactions\\pg.test.ts", status: "failed", message: "test failed" },
    { name: "1.1 openProject creates the project's database and its tables", suites: [], file: "C:\\repo\\a.test.ts", status: "passed" },
    { name: '2.3 [memory] a "quoted" <name> & more', suites: [], file: "C:\\repo\\a.test.ts", status: "passed" },
    { name: "8.1 live proof", suites: [], file: "C:\\repo\\a.test.ts", status: "skipped", message: "owner-gated" },
    { name: "3.1 fails", suites: [], file: "C:\\repo\\a.test.ts", status: "failed", message: "boom" },
    { name: "2.1 [cloud-sql] inside", suites: ["8.1 capability 2's suite"], file: "C:\\repo\\a.test.ts", status: "passed" },
    { name: "4.4 todo", suites: [], file: "C:\\repo\\a.test.ts", status: "skipped", message: "later" },
  ]);
});

test("judge: a contract passes only if every test it has passed; any failure fails it; a skipped test, or none, leaves it not checked", () => {
  const result = (name, status, extra = {}) => ({ name, suites: [], file: "C:\\repo\\a.test.ts", status, ...extra });
  const { verdicts, unmapped } = judge({
    contracts: ["1.1", "1.2", "1.3", "2.1", "2.2", "8.1", "8.2"],
    results: [
      result("1.1 [memory] one", "passed"),
      result("1.1 [postgres] one", "passed"),
      result("1.2 [memory] two", "passed"),
      result("1.2 [postgres] two", "failed", { message: "boom" }),
      result("2.1 [memory] some", "passed"),
      result("2.1 [postgres] some", "skipped", { message: "no server" }),
      result("8.1 live proof", "skipped", { message: "owner-gated" }),
      // Nested under 8.1, a test named for 2.2 counts for 8.1, the outermost numbered name.
      { name: "2.2 [cloud-sql] inside", suites: ["8.2 around it"], file: "C:\\repo\\a.test.ts", status: "passed" },
      result("robustness [memory] no number", "passed"),
      result("9.9 a contract the story does not have", "passed"),
    ],
    coverage: () => new Set(),
  });
  const brief = (number) => {
    const { state, note } = verdicts.get(number);
    return note === undefined ? { state } : { state, note };
  };
  assert.deepEqual(brief("1.1"), { state: "passing", note: "2/2 tests passed" });
  assert.deepEqual(brief("1.2"), { state: "failing", note: "1/2 tests passed" });
  assert.deepEqual(brief("1.3"), { state: "not-checked" }, "no tests");
  assert.deepEqual(brief("2.1"), { state: "not-checked" }, "a skipped test is not a pass");
  assert.deepEqual(brief("2.2"), { state: "not-checked" }, "its only test counts for 8.2");
  assert.deepEqual(brief("8.1"), { state: "not-checked" }, "all skipped");
  assert.deepEqual(brief("8.2"), { state: "passing", note: "1/1 tests passed" });
  assert.match(verdicts.get("2.1").reason, /1 of 2 tests skipped/);
  assert.match(verdicts.get("8.1").reason, /skipped.*owner-gated/);
  assert.match(verdicts.get("1.3").reason, /no tests/);
  assert.deepEqual(unmapped.map(({ name }) => name), ["robustness [memory] no number", "9.9 a contract the story does not have"]);
});

test("judge: a test file that produced no results leaves the contracts it holds not checked, never failing, and names the file", () => {
  const crashed = "C:\\repo\\packages\\library\\src\\transactions\\pg.test.ts";
  const { verdicts, crashedFiles } = judge({
    contracts: ["2.1", "2.2", "3.1"],
    results: [
      { name: "packages\\library\\src\\transactions\\pg.test.ts", suites: [], file: crashed, status: "failed", message: "test failed" },
      { name: "2.1 [memory] save", suites: [], file: "C:\\repo\\memory.test.ts", status: "passed" },
      { name: "2.2 [memory] edit", suites: [], file: "C:\\repo\\memory.test.ts", status: "failed", message: "boom" },
      { name: "3.1 [memory] schema", suites: [], file: "C:\\repo\\schema.test.ts", status: "passed" },
    ],
    coverage: (file) => (file === crashed ? new Set(["2.1", "2.2"]) : new Set()),
  });
  assert.equal(verdicts.get("2.1").state, "not-checked", "its memory half passed, but its postgres half never ran");
  assert.match(verdicts.get("2.1").reason, /pg\.test\.ts produced no results/);
  assert.equal(verdicts.get("2.2").state, "failing", "a failure seen is still a failure");
  assert.equal(verdicts.get("3.1").state, "passing");
  assert.deepEqual(crashedFiles, [{ file: crashed, contracts: ["2.1", "2.2"] }]);
});

test("contractsCoveredBy finds the contract numbers a test file names, in itself and in the modules it imports", () => {
  const covered = (file) => [...contractsCoveredBy(path.join(librarySrc, file), { root: librarySrc })].sort();
  assert.deepEqual(covered("transactions/pg.test.ts"), ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9"], "through behaviour-suite.ts");
  assert.deepEqual(covered("project/project-libraries.test.ts"), ["1.1", "1.2", "1.3", "1.4", "1.5"]);
  assert.ok(covered("transactions/cloud-sql.test.ts").includes("8.1"));
});

test("syncStory adds the story once: a second run changes nothing, and a changed capability or contract is updated without a duplicate", async () => {
  await withLibrary(async (lib) => {
    const story = parseStory(librarySpec);
    // The story's size comes from the file itself, so the test does not change when the file does.
    const capabilityCount = story.capabilities.length;
    const contractCount = story.capabilities.reduce((count, { contracts }) => count + contracts.length, 0);
    const first = await syncStory(lib, story);
    assert.deepEqual(first.counts, {
      story: "added",
      capabilities: { added: capabilityCount, updated: 0, unchanged: 0, retired: 0 },
      contracts: { added: contractCount, replaced: 0, unchanged: 0, retired: 0 },
    });
    const tree = await lib.projectTree();
    assert.equal(tree.stories.length, 1);
    const [stored] = tree.stories;
    assert.equal(stored.title, "The library");
    assert.equal(stored.description, story.description);
    assert.deepEqual(stored.capabilities.map(({ title }) => title), story.capabilities.map(({ title }) => title), "added in build order");
    const idOf = (title) => stored.capabilities.find((capability) => capability.title === title).id;
    const api = stored.capabilities.find(({ title }) => title === "7 · Library API");
    assert.deepEqual(api.dependsOn, ["1 · Project libraries", "4 · Work model", "5 · Health record", "6 · Knowledge and memory"].map(idOf));
    assert.deepEqual(api.contracts.map(({ title }) => title.slice(0, 3)), ["7.1", "7.2", "7.3"]);
    assert.equal(first.contractIds.get("7.2"), api.contracts[1].id);

    const second = await syncStory(lib, story);
    assert.deepEqual(second.counts, {
      story: "unchanged",
      capabilities: { added: 0, updated: 0, unchanged: capabilityCount, retired: 0 },
      contracts: { added: 0, replaced: 0, unchanged: contractCount, retired: 0 },
    });
    assert.deepEqual(await lib.projectTree(), tree, "the second run wrote nothing");

    // The file changes: a capability's description, one contract's wording, one contract gone, one new.
    const changed = parseStory(
      librarySpec
        .replace("Every record has a declared type with a fixed set of fields", "Every record has a declared type with a FIXED set of fields")
        .replace("`edit` of a missing record returns `null` and creates nothing.", "`edit` of a missing record returns `null`, and creates nothing at all.")
        .replace(/5\. A project name that is not lower-case[\s\S]*?names the rule\.\n/, "")
        .replace("4. A link to a record that does not exist is refused.", "4. A link to a record that does not exist is refused.\n5. A brand new promise."),
    );
    const third = await syncStory(lib, changed);
    assert.deepEqual(third.counts, {
      story: "unchanged",
      capabilities: { added: 0, updated: 1, unchanged: capabilityCount - 1, retired: 0 },
      contracts: { added: 1, replaced: 1, unchanged: contractCount - 2, retired: 1 },
    });
    const after = (await lib.projectTree()).stories;
    assert.equal(after.length, 1, "still one story");
    const schema = after[0].capabilities.find(({ title }) => title === "3 · Data schema");
    assert.equal(schema.id, idOf("3 · Data schema"), "updated in place");
    assert.match(schema.description, /FIXED set of fields/);
    const numbers = after[0].capabilities.flatMap(({ contracts }) => contracts.map(({ title }) => title.split(" ")[0]));
    assert.equal(numbers.length, new Set(numbers).size, "no contract number twice");
    assert.ok(!numbers.includes("1.5") && numbers.includes("6.5"));
    const edited = after[0].capabilities.flatMap(({ contracts }) => contracts).find(({ title }) => title.startsWith("2.4 "));
    assert.match(edited.title, /creates nothing at all\.$/);
  });
});

test("recordHealth writes each passing or failing verdict to the verified column, with who and how many tests, and nothing for not checked", async () => {
  await withLibrary(async (lib) => {
    const { contractIds } = await syncStory(lib, parseStory(librarySpec));
    const verdicts = new Map([
      ["1.1", { number: "1.1", state: "passing", note: "2/2 tests passed" }],
      ["1.2", { number: "1.2", state: "failing", note: "1/2 tests passed" }],
      ["1.3", { number: "1.3", state: "not-checked", reason: "no tests" }],
    ]);
    const written = await recordHealth(lib, contractIds, verdicts);
    assert.deepEqual(written, { passing: 1, failing: 1, notChecked: 1 });

    const passing = await lib.health(contractIds.get("1.1"));
    assert.equal(passing.verified.state, "passing");
    assert.equal(passing.verified.by, "storytree test run");
    assert.equal(passing.verified.note, "2/2 tests passed");
    assert.deepEqual(passing.reported, { state: "not-checked" }, "the reported column is left alone");
    assert.equal((await lib.health(contractIds.get("1.2"))).verified.state, "failing");
    assert.deepEqual(await lib.healthHistory(contractIds.get("1.3")), [], "nothing is written for a contract not checked");
    assert.deepEqual(await lib.healthHistory(contractIds.get("1.4")), [], "nor for one with no verdict");
  });
});

// --- helpers ---------------------------------------------------------------------------------

/** Node's junit reporter output, as it writes it (a crashed file, escaping, a skip, a failure, a suite, a todo). */
const JUNIT = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testcase name="packages\\library\\src\\transactions\\pg.test.ts" time="0.08" classname="test" file="C:\\repo\\packages\\library\\src\\transactions\\pg.test.ts" failure="test failed">
		<failure type="testCodeFailure" message="test failed">
[Error: test failed] { code: 'ERR_TEST_FAILURE', failureType: 'testCodeFailure', cause: 'test failed', exitCode: 1, signal: null }
		</failure>
	</testcase>
	<testcase name="1.1 openProject creates the project's database and its tables" time="1.3" classname="test" file="C:\\repo\\a.test.ts"/>
	<testcase name="2.3 [memory] a &amp;quot;quoted&amp;quot; &lt;name> &amp; more" time="0.1" classname="test" file="C:\\repo\\a.test.ts"/>
	<testcase name="8.1 live proof" time="0.001" classname="test" file="C:\\repo\\a.test.ts">
		<skipped type="skipped" message="owner-gated"/>
	</testcase>
	<testcase name="3.1 fails" time="0.001" classname="test" file="C:\\repo\\a.test.ts" failure="boom">
		<failure type="testCodeFailure" message="boom">
Error: boom &lt;&amp;> at TestContext.&lt;anonymous>
		</failure>
	</testcase>
	<testsuite name="8.1 capability 2's suite" time="0.0002" disabled="0" errors="0" tests="1" failures="0" skipped="0" hostname="box">
		<testcase name="2.1 [cloud-sql] inside" time="0.0001" classname="test" file="C:\\repo\\a.test.ts"/>
	</testsuite>
	<testcase name="4.4 todo" time="0.00006" classname="test" file="C:\\repo\\a.test.ts">
		<skipped type="todo" message="later"/>
	</testcase>
	<!-- tests 7 -->
</testsuites>
`;

/** Run `body` with a library for a fresh project on the test server, dropped afterwards, pass or fail. */
async function withLibrary(body) {
  const url = process.env.STORYTREE_TEST_PG_URL;
  assert.ok(url, "STORYTREE_TEST_PG_URL is not set: run these tests through `pnpm test`, which starts a local Postgres");
  const name = `t-${randomBytes(4).toString("hex")}`;
  const storytree = await connect({ url });
  try {
    const lib = await storytree.openProject(name);
    try {
      await body(lib);
    } finally {
      await lib.close();
    }
  } finally {
    await storytree.close();
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "storytree_${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}
