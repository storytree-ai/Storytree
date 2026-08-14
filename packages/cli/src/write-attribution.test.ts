import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTOR_HELPER,
  DECLARED_EXCEPTIONS,
  STORE_WRITE_METHODS,
  actorExpression,
  findWriteSites,
  formatViolations,
  resolvesToHelper,
  scanWriteAttribution,
  stripComments,
} from "./write-attribution.js";

const cliSrc = fileURLToPath(new URL(".", import.meta.url));

/**
 * The two source roots the fence covers: `packages/cli/src` and `packages/arc/src`.
 *
 * ⚠ THE SECOND ROOT IS THE WHOLE POINT, not tidiness. `arc-tier-extraction-arc` moved three of the
 * fence's own named write paths — `arc.ts`, `question.ts`, `increment.ts` — into `@storytree/arc`. A
 * fence that walked only its own directory would have followed them out of scope SILENTLY, keeping a
 * green test while covering strictly less than it did the day before; the anti-vacuity test below
 * names `arc.ts` and `question.ts` explicitly and is what turned that into a loud failure. The rule
 * the roots encode is "every package whose verbs write to the live Library under the `cli@<branch>`
 * identity", which is now two packages and may become three.
 *
 * `packages/drive` stays out for the reason the module header gives: it writes under a deliberate
 * non-branch identity (`CURATOR_ACTOR`), which is a different judgement, not an omission.
 */
const FENCED_ROOTS: readonly { repoPath: string; dir: string }[] = [
  { repoPath: "packages/cli/src", dir: cliSrc },
  { repoPath: "packages/arc/src", dir: path.resolve(cliSrc, "..", "..", "arc", "src") },
];

/**
 * The files the fence covers: every non-test `.ts` under each {@link FENCED_ROOTS} directory.
 *
 * Test fixtures are excluded BY PATH rather than by pattern — the parked entry's own requirement.
 * `friction.test.ts` deliberately constructs bare-`cli` rows to prove the guard's fail-closed
 * behaviour, and a pattern-shaped exclusion would eventually cover a real write path too.
 */
function cliSources(): { file: string; source: string }[] {
  return FENCED_ROOTS.flatMap(({ repoPath, dir }) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .sort()
      .map((f) => ({
        file: `${repoPath}/${f}`,
        source: readFileSync(path.join(dir, f), "utf8"),
      })),
  );
}

// ── the fence itself, over the real tree ─────────────────────────────────────

test("every CLI store-write call site resolves its actor through defaultCliActor()", () => {
  const scan = scanWriteAttribution(cliSources());
  assert.equal(
    scan.violations.length,
    0,
    `${scan.violations.length} CLI store-write call site(s) do not carry branch attribution:\n\n` +
      `${formatViolations(scan.violations)}\n\n` +
      "An unattributed write succeeds and typechecks, so nothing else will tell you. `branchOfActor`\n" +
      "reads it as UNATTRIBUTED, which the friction route guard treats as another adjudicator's —\n" +
      "so this path's own session can no longer re-route its own items.",
  );
});

test("the scan actually reaches the CLI's write paths — a vacuous green is a failure", () => {
  const scan = scanWriteAttribution(cliSources());
  const attributed = scan.sites.filter((s) => s.shape === "attributed");
  assert.ok(
    attributed.length >= 8,
    `the fence found only ${attributed.length} attributed write site(s) — it is meant to cover the ` +
      "arc / friction / question / artifact write paths, so a number this low means the scan stopped " +
      "matching rather than that the repo stopped writing.",
  );
  // Named with their packages since `arc-tier-extraction-arc` split them across two: `arc.ts` and
  // `question.ts` moved to `@storytree/arc` and this list is what made the move visible rather than
  // letting the fence quietly shrink to whatever stayed behind.
  for (const file of [
    "packages/cli/src/commands.ts",
    "packages/cli/src/friction.ts",
    "packages/arc/src/arc.ts",
    "packages/arc/src/question.ts",
  ]) {
    assert.ok(
      scan.sites.some((s) => s.file === file),
      `no store-write call site found in ${file} — the scan's call pattern has drifted from the source.`,
    );
  }
});

test("every declared exception still matches a real call site", () => {
  const scan = scanWriteAttribution(cliSources());
  assert.deepEqual(
    scan.unmatchedExceptions.map((e) => `${e.file} (${e.actor === "" ? "forwarded" : e.actor})`),
    [],
    "a declared attribution exception matches no call site — it reads as a live carve-out for a " +
      "path that no longer exists. Delete it, or re-point it at the site that replaced it.",
  );
});

test("each declared exception states a reason, not just a path", () => {
  for (const e of DECLARED_EXCEPTIONS) {
    assert.ok(
      e.reason.trim().length > 40,
      `the exception for ${e.file} must say WHY it is not a defect — a bare path is the pattern-shaped ` +
        "exclusion this table exists to refuse.",
    );
  }
});

// ── the classifier ───────────────────────────────────────────────────────────

test("a store write stamping a literal actor is a violation", () => {
  const scan = scanWriteAttribution([
    { file: "f.ts", source: `await deps.store.upsertDoc({ id, kind, doc, actor: "cli" });` },
  ]);
  assert.equal(scan.violations.length, 1);
  assert.equal(scan.violations[0]?.shape, "unresolved");
  assert.equal(scan.violations[0]?.actor, '"cli"');
  assert.match(scan.violations[0]?.why ?? "", /defaultCliActor\(\)/);
});

test("a store write declaring no actor at all is a violation — the store would stamp its default", () => {
  const scan = scanWriteAttribution([
    { file: "f.ts", source: `await deps.store.upsertDoc({ id, kind: "arc", doc: valid });` },
  ]);
  assert.equal(scan.violations.length, 1);
  assert.equal(scan.violations[0]?.shape, "absent");
  assert.match(scan.violations[0]?.why ?? "", /DEFAULT_ACTOR/);
});

test("the house form passes: deps.actor ?? defaultCliActor()", () => {
  const scan = scanWriteAttribution([
    {
      file: "f.ts",
      source: `await deps.store.upsertDoc({ id, kind, doc, actor: deps.actor ?? defaultCliActor() });`,
    },
  ]);
  assert.deepEqual(scan.violations, []);
  assert.equal(scan.sites[0]?.shape, "attributed");
});

test("an actor bound by a local const to the helper passes — the friction route guard's shape", () => {
  const source = [
    `const actor = deps.actor ?? defaultCliActor();`,
    `await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor });`,
  ].join("\n");
  const scan = scanWriteAttribution([{ file: "f.ts", source }]);
  assert.deepEqual(scan.violations, []);
  assert.equal(scan.sites[0]?.shape, "attributed");
});

test("an actor bound by a local const to something ELSE is still a violation", () => {
  const source = [
    `const actor = process.env["WHOEVER"] ?? "cli";`,
    `await deps.store.upsertDoc({ id, kind: "friction", doc: valid, actor });`,
  ].join("\n");
  const scan = scanWriteAttribution([{ file: "f.ts", source }]);
  assert.equal(scan.violations.length, 1);
  assert.equal(scan.violations[0]?.shape, "unresolved");
});

test("all three Store write verbs are judged, not just upsertDoc", () => {
  const source = [
    `await s.upsertDoc({ id, doc });`,
    `await s.deleteDoc(id, { reason });`,
    `await s.appendEvent({ id, type: "created", doc });`,
  ].join("\n");
  const scan = scanWriteAttribution([{ file: "f.ts", source }]);
  assert.deepEqual(
    scan.violations.map((v) => v.method).sort(),
    [...STORE_WRITE_METHODS].sort(),
  );
});

test("a conditional spread that buries actor one level down is judged, not skipped", () => {
  const scan = scanWriteAttribution([
    {
      file: "f.ts",
      source: `await s.upsertDoc({ id, doc, ...(deps.actor !== undefined ? { actor: deps.actor } : {}) });`,
    },
  ]);
  assert.equal(scan.violations.length, 1);
  assert.equal(scan.violations[0]?.shape, "unresolved");
});

test("a forwarding adapter is not judged as an authoring site, but must be declared", () => {
  const scan = scanWriteAttribution(
    [{ file: "adapter.ts", source: `upsertDoc: async (input) => (await open()).upsertDoc(input),` }],
    [],
  );
  assert.equal(scan.sites[0]?.shape, "forwarded");
  assert.equal(scan.violations.length, 1, "an UNDECLARED forward is still reported");
  const declared = scanWriteAttribution(
    [{ file: "adapter.ts", source: `upsertDoc: async (input) => (await open()).upsertDoc(input),` }],
    [{ file: "adapter.ts", actor: "", reason: "x".repeat(50) }],
  );
  assert.deepEqual(declared.violations, []);
});

test("an exception is scoped to its file — the same actor expression elsewhere is still a violation", () => {
  const source = `await deps.store.appendEvent({ id, type: "created", doc, actor: signer });`;
  const exceptions = [{ file: "packages/cli/src/uat.ts", actor: "signer", reason: "x".repeat(50) }];
  assert.deepEqual(
    scanWriteAttribution([{ file: "packages/cli/src/uat.ts", source }], exceptions).violations,
    [],
  );
  assert.equal(
    scanWriteAttribution([{ file: "packages/cli/src/other.ts", source }], exceptions).violations
      .length,
    1,
  );
});

test("the reported line is the call's own line", () => {
  const source = ["// header", "", `await s.upsertDoc({ id, doc, actor: "cli" });`].join("\n");
  assert.equal(findWriteSites("f.ts", source)[0]?.line, 3);
});

// ── the primitives ───────────────────────────────────────────────────────────

test("a store-write call named only in a comment is not a call site", () => {
  const source = [
    "/** Every write goes through store.upsertDoc({ id, doc }) with no actor. */",
    "// see also s.deleteDoc(id)",
    "const x = 1;",
  ].join("\n");
  assert.deepEqual(findWriteSites("f.ts", source), []);
});

test("stripComments preserves offsets, line breaks and string bodies", () => {
  const source = `const a = "http://x"; // note\nconst b = 2;`;
  const stripped = stripComments(source);
  assert.equal(stripped.length, source.length);
  assert.equal(stripped.split("\n").length, 2);
  assert.ok(stripped.includes(`"http://x"`), "a `//` inside a string is not a comment");
  assert.ok(!stripped.includes("note"));
});

test("actorExpression reads the whole value, including a nested call and a ?? chain", () => {
  assert.equal(actorExpression(`{ id, doc, actor: deps.actor ?? defaultCliActor() }`), "deps.actor ?? defaultCliActor()");
  assert.equal(actorExpression(`{ actor: a ? b : c, id }`), "a ? b : c");
  assert.equal(actorExpression(`{ id, doc }`), null);
});

test("actorExpression normalises a value the formatter wrapped across lines", () => {
  assert.equal(actorExpression(`{\n  actor:\n    deps.actor ??\n      defaultCliActor(),\n}`), "deps.actor ?? defaultCliActor()");
});

test("actorExpression does not match a property whose name merely ends in `actor`", () => {
  assert.equal(actorExpression(`{ id, refactor: true }`), null);
  assert.equal(actorExpression(`{ id, doc: deps.actor }`), null);
});

test("actorExpression reads the shorthand property as the identifier itself", () => {
  assert.equal(actorExpression(`{ id, kind: "friction", doc: valid, actor }`), "actor");
  assert.equal(actorExpression(`{ actor, id }`), "actor");
});

test("resolvesToHelper accepts the helper directly and one const hop, nothing further", () => {
  assert.equal(resolvesToHelper(ACTOR_HELPER, ""), true);
  assert.equal(resolvesToHelper("actor", `const actor = defaultCliActor();`), true);
  assert.equal(resolvesToHelper("actor", `const actor = "cli";`), false);
  assert.equal(resolvesToHelper(`"cli"`, `const actor = defaultCliActor();`), false);
});
