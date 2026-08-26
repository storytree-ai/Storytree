import test from "node:test";
import assert from "node:assert/strict";

import {
  formatHierarchyCamps,
  judgeHierarchyCamps,
  parseHierarchyCampMap,
  readHierarchyAccess,
  stripCommentsAndPatterns,
  valueExportedNames,
  valueImportedNames,
  VacuousCampSweep,
  type HierarchyAccess,
  type HierarchyCampDeclaration,
} from "./hierarchy-camps.js";

/**
 * Every case here is a MUTATION of a green baseline, because the fault this rung exists to prevent
 * is a fence that cannot go red. The baseline below is the smallest tree that passes; each test
 * moves exactly one thing and asserts the breach that moves with it.
 */

const proveReader: HierarchyAccess = {
  path: "packages/cli/src/check-coverage.ts",
  reads: ["checkout"],
  evidence: ['names the checkout\'s stories path: "stories"'],
  imports: ["join"],
  exports: ["sweepRealBuildCoverage"],
};

const renderReader: HierarchyAccess = {
  path: "apps/studio/server/libraryBackend.ts",
  reads: ["live"],
  evidence: ["opens the store's projection: PgWorkHierarchyStore"],
  imports: ["rowsToBuildActivity"],
  exports: ["createLibraryBackend"],
};

const proveDecl: HierarchyCampDeclaration = {
  path: proveReader.path,
  camp: "prove",
  reads: ["checkout"],
};

const renderDecl: HierarchyCampDeclaration = {
  path: renderReader.path,
  camp: "render",
  reads: ["live"],
};

function judge(
  accesses: readonly HierarchyAccess[],
  declarations: readonly HierarchyCampDeclaration[],
): ReturnType<typeof judgeHierarchyCamps> {
  return judgeHierarchyCamps({
    accesses,
    declarations,
    walked: 700,
    seen: new Set([...accesses.map((a) => a.path), ...declarations.map((d) => d.path)]),
  });
}

const kinds = (v: ReturnType<typeof judgeHierarchyCamps>): string[] => v.breaches.map((b) => b.kind);

test("hierarchy-camps-holds-the-reader-map-total: the baseline is GREEN, so every red below is the mutation's", () => {
  const v = judge([proveReader, renderReader], [proveDecl, renderDecl]);
  assert.equal(v.verdict, "ok", JSON.stringify(v.breaches));
  assert.equal(v.readers, 2);
  assert.equal(v.proveReaders, 1);
  assert.equal(v.renderReaders, 1);
});

test("hierarchy-camps-holds-the-reader-map-total: a reader with no declaration FAILS", () => {
  const v = judge([proveReader, renderReader], [renderDecl]);
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["undeclared-reader"]);
  assert.match(v.breaches[0]?.detail ?? "", /which clock must it agree with/i);
});

test("hierarchy-camps-holds-the-reader-map-total: the map is total the OTHER way too — a declaration naming a module that reads nothing FAILS", () => {
  const stale: HierarchyCampDeclaration = {
    path: "packages/cli/src/gate-order.ts",
    camp: "prove",
    reads: ["checkout"],
  };
  const v = judgeHierarchyCamps({
    accesses: [proveReader, renderReader],
    declarations: [proveDecl, renderDecl, stale],
    walked: 700,
    seen: new Set([proveReader.path, renderReader.path, stale.path]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["declared-file-reads-nothing"]);
});

test("hierarchy-camps-holds-the-reader-map-total: a declaration for a file the sweep never saw is told apart from one that reads nothing", () => {
  const gone: HierarchyCampDeclaration = {
    path: "packages/cli/src/deleted.ts",
    camp: "prove",
    reads: ["checkout"],
  };
  const v = judgeHierarchyCamps({
    accesses: [proveReader, renderReader],
    declarations: [proveDecl, renderDecl, gone],
    walked: 700,
    seen: new Set([proveReader.path, renderReader.path]),
  });
  assert.deepEqual(kinds(v), ["declared-file-is-absent"]);
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a PROVE reader that opens the live store FAILS", () => {
  const drifted: HierarchyAccess = { ...proveReader, reads: ["checkout", "live"] };
  const v = judge([drifted, renderReader], [proveDecl, renderDecl]);
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["live-read-in-the-prove-camp"]);
  assert.match(v.breaches[0]?.detail ?? "", /commit under test/);
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a RENDER reader that reads the checkout without a stated fallback FAILS", () => {
  const degraded: HierarchyAccess = { ...renderReader, reads: ["checkout"] };
  const v = judge([proveReader, degraded], [proveDecl, { ...renderDecl, reads: ["checkout"] }]);
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["unstated-checkout-fallback"]);
  assert.match(v.breaches[0]?.detail ?? "", /ADR-0445 D2/);
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: the SAME reader passes once the fallback is stated", () => {
  const degraded: HierarchyAccess = { ...renderReader, reads: ["checkout"] };
  const v = judge(
    [proveReader, degraded],
    [proveDecl, { ...renderDecl, reads: ["checkout"], fallback: "the store could not be reached" }],
  );
  assert.equal(v.verdict, "ok", JSON.stringify(v.breaches));
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a source the code performs and the declaration omits FAILS", () => {
  const widened: HierarchyAccess = { ...renderReader, reads: ["live", "checkout"] };
  const v = judge([proveReader, widened], [proveDecl, { ...renderDecl, fallback: "stated" }]);
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["source-not-declared"]);
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a source the declaration claims and the code no longer performs FAILS", () => {
  const moved: HierarchyAccess = { ...renderReader, reads: ["checkout"] };
  const v = judge(
    [proveReader, moved],
    [proveDecl, { ...renderDecl, reads: ["live", "checkout"], fallback: "stated" }],
  );
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["declared-source-not-performed"]);
  assert.match(v.breaches[0]?.detail ?? "", /moved camps without saying so/);
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a BRIDGE must span both clocks, so one that reads a single source FAILS", () => {
  const bridgeDecl: HierarchyCampDeclaration = {
    path: proveReader.path,
    camp: "bridge",
    reads: ["checkout"],
  };
  const v = judge([proveReader, renderReader], [bridgeDecl, renderDecl]);
  assert.equal(v.verdict, "fail");
  assert.ok(kinds(v).includes("bridge-that-spans-nothing"));
});

test("hierarchy-camps-reds-on-a-wrong-camp-read: a genuine bridge — reading both — passes", () => {
  const loader: HierarchyAccess = { ...proveReader, reads: ["checkout", "live"] };
  const v = judge(
    [loader, renderReader],
    [{ path: loader.path, camp: "bridge", reads: ["checkout", "live"] }, renderDecl],
  );
  assert.equal(v.verdict, "ok", JSON.stringify(v.breaches));
  assert.equal(v.bridgeReaders, 1);
});

test("hierarchy-camps-reds-when-a-render-reader-reaches-through-a-helper: importing a prove reader's export FAILS", () => {
  const reaching: HierarchyAccess = { ...renderReader, imports: ["sweepRealBuildCoverage"] };
  const v = judge([proveReader, reaching], [proveDecl, renderDecl]);
  assert.equal(v.verdict, "fail");
  assert.deepEqual(kinds(v), ["render-reaches-a-prove-reader"]);
  assert.match(v.breaches[0]?.detail ?? "", /through a helper is still reaching it/);
});

test("hierarchy-camps-reds-when-a-render-reader-reaches-through-a-helper: a render reader with a STATED fallback may reach one", () => {
  const reaching: HierarchyAccess = {
    ...renderReader,
    reads: ["live", "checkout"],
    imports: ["sweepRealBuildCoverage"],
  };
  const v = judge(
    [proveReader, reaching],
    [proveDecl, { ...renderDecl, reads: ["live", "checkout"], fallback: "the store was unreachable" }],
  );
  assert.equal(v.verdict, "ok", JSON.stringify(v.breaches));
});

test("hierarchy-camps-never-reports-a-blinded-sweep-as-clean: a sweep that walked nothing THROWS rather than passing", () => {
  assert.throws(
    () => judgeHierarchyCamps({ accesses: [], declarations: [proveDecl], walked: 0, seen: new Set() }),
    VacuousCampSweep,
  );
});

test("hierarchy-camps-never-reports-a-blinded-sweep-as-clean: an empty declaration map THROWS rather than reporting every reader undeclared", () => {
  assert.throws(
    () =>
      judgeHierarchyCamps({
        accesses: [proveReader],
        declarations: [],
        walked: 700,
        seen: new Set([proveReader.path]),
      }),
    VacuousCampSweep,
  );
});

test("hierarchy-camps-never-reports-a-blinded-sweep-as-clean: every unreadable manifest shape is `unread`, never an empty map", () => {
  assert.equal(parseHierarchyCampMap("{ not json", "m").unread.length, 1);
  assert.match(parseHierarchyCampMap("{}", "m").unread[0] ?? "", /no `hierarchyCamps` block/);
  assert.match(
    parseHierarchyCampMap('{"hierarchyCamps":{}}', "m").unread[0] ?? "",
    /no `hierarchyCamps.readers` object/,
  );
  const badCamp = '{"hierarchyCamps":{"readers":{"a.ts":{"camp":"either","reads":["live"]}}}}';
  assert.match(parseHierarchyCampMap(badCamp, "m").unread[0] ?? "", /"prove", "render" or "bridge"/);
  const noReads = '{"hierarchyCamps":{"readers":{"a.ts":{"camp":"prove"}}}}';
  assert.match(parseHierarchyCampMap(noReads, "m").unread[0] ?? "", /declares no `reads`/);
  const badRead = '{"hierarchyCamps":{"readers":{"a.ts":{"camp":"prove","reads":["disk"]}}}}';
  assert.match(parseHierarchyCampMap(badRead, "m").unread[0] ?? "", /"checkout" or "live"/);
});

test("hierarchy-camps-never-reports-a-blinded-sweep-as-clean: a well-formed entry parses, `$`-prefixed keys are comments", () => {
  const text =
    '{"hierarchyCamps":{"$comment":"why","readers":{"$note":"x","a.ts":{"camp":"render","reads":["live","checkout"],"fallback":"f","because":"b"}}}}';
  const read = parseHierarchyCampMap(text, "m");
  assert.deepEqual(read.unread, []);
  assert.equal(read.readers.length, 1);
  assert.deepEqual(read.readers[0], {
    path: "a.ts",
    camp: "render",
    reads: ["live", "checkout"],
    fallback: "f",
    because: "b",
  });
});

test("hierarchy-camps-classifies-by-what-the-code-names: an identifier naming the stories directory is a checkout read", () => {
  const access = readHierarchyAccess({
    path: "a.ts",
    text: 'import path from "node:path";\nexport const f = (storiesDir: string) => storiesDir;',
  });
  assert.deepEqual(access?.reads, ["checkout"]);
});

test("hierarchy-camps-classifies-by-what-the-code-names: `storiesDirty` is a git predicate, not a directory", () => {
  const access = readHierarchyAccess({
    path: "a.ts",
    text: 'import path from "node:path";\nexport const f = (storiesDirty: boolean) => storiesDirty;',
  });
  assert.equal(access, null);
});

test("hierarchy-camps-classifies-by-what-the-code-names: naming the tree in PROSE is not reading it", () => {
  const access = readHierarchyAccess({
    path: "a.ts",
    text: '// walks stories/** and storiesDir\n/* "stories" */\nimport path from "node:path";\nexport const f = 1;',
  });
  assert.equal(access, null);
});

test("hierarchy-camps-classifies-by-what-the-code-names: a PATTERN matches paths, it does not read them", () => {
  const access = readHierarchyAccess({
    path: "a.ts",
    text: 'import path from "node:path";\nexport const RE = /\\bstories(?:Dir|Root)\\b/;',
  });
  assert.equal(access, null);
});

test("hierarchy-camps-classifies-by-what-the-code-names: a module that cannot reach a filesystem is not a checkout reader", () => {
  const text = 'export const glob = "stories/**";';
  assert.equal(readHierarchyAccess({ path: "a.ts", text }), null);
  const withIo = `import { readdirSync } from "node:fs";\n${text}`;
  assert.deepEqual(readHierarchyAccess({ path: "a.ts", text: withIo })?.reads, ["checkout"]);
});

test("hierarchy-camps-classifies-by-what-the-code-names: a barrel that RE-EXPORTS the store door obtains nothing", () => {
  const access = readHierarchyAccess({
    path: "index.ts",
    text: 'export { PgWorkHierarchyStore } from "./pg-work-hierarchy-store.js";',
  });
  assert.equal(access, null);
});

test("hierarchy-camps-classifies-by-what-the-code-names: opening the store door IS a live read", () => {
  const access = readHierarchyAccess({
    path: "a.ts",
    text: 'import { PgWorkHierarchyStore } from "@storytree/library/store";\nexport const f = () => new PgWorkHierarchyStore(pool);',
  });
  assert.deepEqual(access?.reads, ["live"]);
  assert.deepEqual(access?.imports, ["PgWorkHierarchyStore"]);
});

test("hierarchy-camps-classifies-by-what-the-code-names: the scanner keeps strings, drops comments, and does not end a regex inside a character class", () => {
  const kept = stripCommentsAndPatterns('const a = "keep/*me*/"; // gone\nconst b = 2;');
  assert.match(kept, /keep\/\*me\*\//);
  assert.doesNotMatch(kept, /gone/);
  // The bug this pins: `/[/\\]/` ends at the class's own slash, the rest is scanned as code, and the
  // first backtick in it swallows the following comment whole.
  const afterClass = stripCommentsAndPatterns('const RE = /[/\\\\]stories/;\nconst s = `after`;');
  assert.doesNotMatch(afterClass, /stories/);
  assert.match(afterClass, /`after`/);
});

test("hierarchy-camps-classifies-by-what-the-code-names: only VALUE imports count, and a dynamic destructure is one", () => {
  const code = [
    'import type { A } from "x";',
    'import { b, c as d, type E } from "y";',
    'import f from "z";',
    'const { g } = await import("w");',
  ].join("\n");
  assert.deepEqual(valueImportedNames(code), ["b", "c", "f", "g"]);
  assert.deepEqual(valueExportedNames("export function h() {}\nexport const i = 1;"), ["h", "i"]);
});

test("hierarchy-camps-names-the-camp-question: the failure text asks which clock, not which rule number", () => {
  const body = formatHierarchyCamps(judge([proveReader, renderReader], [renderDecl]));
  assert.match(body, /which clock/i);
  assert.match(body, /I must agree with the commit under test/);
  assert.match(body, /I must agree with NOW/);
  assert.match(body, /hierarchyCamps\.readers/);
  assert.doesNotMatch(body, /every reader declares a camp/);
});
