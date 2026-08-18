import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { findNodeSpecFile, loadNodeSpec } from "@storytree/orchestrator";

import { findStaleExistenceClaim, staleExistenceClaimRefusal } from "./stale-existence-claim.js";
import { repoRoot } from "./node-build.js";

// ── the PURE anchor detector — no disk, no NodeSpec ──────────────────────────────────────────────

test("findStaleExistenceClaim: anchors 'does not exist' next to the file's own basename", () => {
  const body = "The red is genuine: `widget.ts` does not exist at HEAD, so the import fails.";
  const found = findStaleExistenceClaim(body, "packages/x/src/widget.ts");
  assert.ok(found !== null);
  assert.equal(found?.basename, "widget.ts");
  assert.match(found?.sentence ?? "", /does not exist at HEAD/);
});

test("findStaleExistenceClaim: matches every ADR-0378 phrase variant", () => {
  const cases = [
    "`widget.ts` does not exist at HEAD",
    "`widget.ts` does not yet exist",
    "`widget.ts` is not built",
    "`widget.ts` is not yet built",
    "`widget.ts` is absent at HEAD",
  ];
  for (const body of cases) {
    assert.ok(
      findStaleExistenceClaim(body, "packages/x/src/widget.ts") !== null,
      `expected an anchor in: ${body}`,
    );
  }
});

test("findStaleExistenceClaim: a phrase split across a wrapped line still anchors (whitespace-tolerant)", () => {
  // Story markdown line-wraps at ~100 columns; a real corpus occurrence (`boot-read-routes.md`) had
  // "does not" and "exist" on either side of a hard line break. A literal-space regex misses this —
  // the exact under-count this test guards against re-introducing.
  const body = "the import resolves nothing — `widget.ts`\ndoes not\nexist at HEAD, so the test fails.";
  const found = findStaleExistenceClaim(body, "packages/x/src/widget.ts");
  assert.ok(found !== null, "a newline-wrapped absence phrase must still anchor");
});

test("findStaleExistenceClaim: an absence phrase FAR from the basename does not anchor", () => {
  const body =
    "`widget.ts` is the file in scope. " +
    "x".repeat(200) +
    " Somewhere else entirely, a symbol does not exist yet.";
  assert.equal(findStaleExistenceClaim(body, "packages/x/src/widget.ts"), null);
});

test("findStaleExistenceClaim: an absence phrase about a DIFFERENT symbol, well outside the anchor window, does not anchor", () => {
  // The brownfield shape ADR-0378 exists to exclude: `TreeView.tsx` is named elsewhere in the doc,
  // but the absence claim is about `compositorPan` (a symbol/behaviour inside it, not the file), and
  // — as in the real corpus (`compositor-pan-transform.md`) — the two sit well past the 160-char
  // anchor radius apart, which is what the anchor mechanism actually keys on (proximity, not symbol
  // resolution: the ADR's own text is "within roughly 160 characters", never "about the file itself").
  const filler = "This capability's live per-frame write executes inside the existing render walk. ".repeat(4);
  const body =
    `The proof-bound source stays \`TreeView.tsx\`, unchanged by this increment. ${filler}` +
    "Elsewhere: while `compositorPan` does not exist, the capability counts on the unbound render.";
  assert.equal(findStaleExistenceClaim(body, "apps/studio/src/components/TreeView.tsx"), null);
});

test("findStaleExistenceClaim: the basename never appearing means no anchor, absence phrase or not", () => {
  const body = "some other file does not exist at HEAD.";
  assert.equal(findStaleExistenceClaim(body, "packages/x/src/widget.ts"), null);
});

// ── the disk-consulting refusal, over hermetic tmp fixtures ─────────────────────────────────────

async function fixtureRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "storytree-stale-claim-"));
}

async function writeSpec(
  root: string,
  id: string,
  sourceFile: string,
  bodyProse: string,
): Promise<ReturnType<typeof loadNodeSpec>> {
  const storiesDir = path.join(root, "stories", "fixture-story");
  await fs.mkdir(storiesDir, { recursive: true });
  const testFile = sourceFile.replace(/\.ts$/, ".test.ts");
  const file = path.join(storiesDir, `${id}.md`);
  await fs.writeFile(
    file,
    [
      "---",
      `id: "${id}"`,
      "tier: capability",
      'title: "x"',
      'outcome: "y"',
      "status: proposed",
      "proof_mode: integration-test",
      "proof:",
      "  command:",
      "    file: node",
      '    args: ["--version"]',
      "  scope:",
      `    testGlobs: ["${testFile}"]`,
      `    sourceGlobs: ["${sourceFile}"]`,
      "  real:",
      `    testFile: "${testFile}"`,
      `    sourceFile: "${sourceFile}"`,
      "    scope:",
      `      testGlobs: ["${testFile}"]`,
      `      sourceGlobs: ["${sourceFile}"]`,
      "---",
      bodyProse,
      "",
    ].join("\n"),
  );
  return loadNodeSpec(file);
}

test("staleExistenceClaimRefusal: (a) anchored claim + EXISTING declared path → refuses", async () => {
  const root = await fixtureRoot();
  try {
    const sourceFile = "packages/fixture/src/widget.ts";
    await fs.mkdir(path.join(root, "packages/fixture/src"), { recursive: true });
    await fs.writeFile(path.join(root, sourceFile), "export const widget = 1;\n");
    const spec = await writeSpec(
      root,
      "stale-claim-refuses",
      sourceFile,
      "The RED the spine observes: `widget.ts` does not exist at HEAD, so the import fails.",
    );
    const refusal = staleExistenceClaimRefusal(spec, root);
    assert.ok(refusal !== null, "expected a refusal");
    assert.equal(refusal?.ok, false);
    assert.match(refusal?.body ?? "", /stale-claim-refuses/);
    assert.match(refusal?.body ?? "", /widget\.ts/);
    assert.match(refusal?.body ?? "", /already exists/);
    assert.match(refusal?.body ?? "", /ADR-0378/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("staleExistenceClaimRefusal: (b) anchored claim + GENUINELY MISSING declared path → does not refuse", async () => {
  const root = await fixtureRoot();
  try {
    const sourceFile = "packages/fixture/src/widget.ts";
    // Deliberately never written to disk — the claim is still TRUE.
    const spec = await writeSpec(
      root,
      "stale-claim-true",
      sourceFile,
      "The RED the spine observes: `widget.ts` does not exist at HEAD, so the import fails.",
    );
    assert.equal(staleExistenceClaimRefusal(spec, root), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("staleExistenceClaimRefusal: (c) brownfield — a symbol-scoped absence phrase well outside the anchor window → does not refuse", async () => {
  const root = await fixtureRoot();
  try {
    const sourceFile = "packages/fixture/src/widget.ts";
    await fs.mkdir(path.join(root, "packages/fixture/src"), { recursive: true });
    await fs.writeFile(path.join(root, sourceFile), "export const widget = 1;\n");
    const filler = "This capability's existing behaviour is unchanged by this increment. ".repeat(4);
    const spec = await writeSpec(
      root,
      "stale-claim-brownfield",
      sourceFile,
      `The proof-bound source stays \`widget.ts\`, unchanged here. ${filler}` +
        "Elsewhere: while `newBehaviour` does not exist, the capability counts on the existing walk.",
    );
    assert.equal(staleExistenceClaimRefusal(spec, root), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("staleExistenceClaimRefusal: (d) no proof.real.sourceFile declared → does not refuse", async () => {
  const root = await fixtureRoot();
  try {
    const storiesDir = path.join(root, "stories", "fixture-story");
    await fs.mkdir(storiesDir, { recursive: true });
    const file = path.join(storiesDir, "no-real-arm.md");
    await fs.writeFile(
      file,
      [
        "---",
        'id: "no-real-arm"',
        "tier: capability",
        'title: "x"',
        'outcome: "y"',
        "status: proposed",
        "proof_mode: integration-test",
        "proof:",
        "  command:",
        "    file: node",
        '    args: ["--version"]',
        "  scope:",
        '    testGlobs: ["packages/fixture/x.test.ts"]',
        '    sourceGlobs: ["packages/fixture/x.ts"]',
        "---",
        "some_file.ts does not exist at HEAD.",
        "",
      ].join("\n"),
    );
    const spec = loadNodeSpec(file);
    assert.equal(spec.buildConfig?.real, undefined);
    assert.equal(staleExistenceClaimRefusal(spec, root), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ── validated against the REAL corpus (ADR-0378's own measurement) ──────────────────────────────
//
// These four cases are the ones the ADR's decision text names directly. They necessarily read live
// `stories/**` content, so a later curation pass that corrects one of the 30 stale specs (the fix
// ADR-0378 deliberately leaves for later, out of scope here) will need to repoint the "(a) refuses"
// case at a different still-stale id — that is a maintenance cost this ADR already accepted, not a
// defect in the rule.

const root = repoRoot();
const storiesDir = path.join(root, "stories");

function loadRealSpec(id: string) {
  const file = findNodeSpecFile(storiesDir, id);
  assert.ok(file !== null, `fixture corpus node "${id}" not found under ${storiesDir}`);
  return loadNodeSpec(file);
}

test("real corpus: boot-read-routes — sourceFile exists AND the spec's own prose still (anchored) claims it does not → refuses", () => {
  const spec = loadRealSpec("boot-read-routes");
  const refusal = staleExistenceClaimRefusal(spec, root);
  assert.ok(refusal !== null, "expected boot-read-routes.ts to be flagged stale");
  assert.equal(refusal?.ok, false);
  assert.match(refusal?.body ?? "", /boot-read-routes\.ts/);
});

test("real corpus: backend-chat-reset-route — the declared path is genuinely still missing → does not refuse", () => {
  const spec = loadRealSpec("backend-chat-reset-route");
  assert.equal(spec.buildConfig?.real?.sourceFile, "apps/desktop/src/backend/chat-reset-route.ts");
  assert.equal(staleExistenceClaimRefusal(spec, root), null);
});

test("real corpus: compositor-pan-transform → TreeView.tsx — brownfield symbol-scoped claim does not refuse", () => {
  const spec = loadRealSpec("compositor-pan-transform");
  assert.equal(staleExistenceClaimRefusal(spec, root), null);
});

test("real corpus: map-server-memo → apiRouter.ts — brownfield symbol-scoped claim does not refuse", () => {
  const spec = loadRealSpec("map-server-memo");
  assert.equal(staleExistenceClaimRefusal(spec, root), null);
});

test("real corpus: change-event-store → store.ts — brownfield symbol-scoped claim does not refuse", () => {
  const spec = loadRealSpec("change-event-store");
  assert.equal(staleExistenceClaimRefusal(spec, root), null);
});

test("real corpus: browse-library — no real: arm declared → does not refuse (nothing to check)", () => {
  const spec = loadRealSpec("browse-library");
  assert.equal(spec.buildConfig?.real, undefined);
  assert.equal(staleExistenceClaimRefusal(spec, root), null);
});
