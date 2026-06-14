import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/core";

import { run } from "./commands.js";
import { storyBuild } from "./story-build.js";

/**
 * `storytree story build <story-id>` (drive-machinery Phase E), driven through `run` exactly as
 * `main` does. All offline: scripted leaves, temp workspaces, an InMemoryStore — zero API cost,
 * no DB. `--actor` pins the signer so the tests are deterministic on any machine.
 */

/** The story area never touches the library store; an empty InMemoryStore keeps the tests fast. */
const deps = { store: new InMemoryStore() };

test("story build library --dry-run drives the capabilities topo-ordered and SIGNS the (machine-witnessed) story UAT node", async () => {
  const env = await run(
    ["story", "build", "library", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /story build library — DRY-RUN/);
  assert.match(env.body, /stories\/library\/story\.md/);

  // The topo order: the lone root first, the CLI capability after all six deps, the story LAST.
  const orderLine = env.body.split("\n").find((l) => l.startsWith("order:"));
  assert.ok(orderLine !== undefined, "an order: line is part of the report");
  const order = orderLine
    .replace("order:", "")
    .split("→")
    .map((s) => s.trim());
  assert.equal(order[0], "library-schema-and-write-validation", "the dependency root runs first");
  assert.equal(order[order.length - 1], "library", "the story's UAT node is last in the order");
  assert.equal(order[order.length - 2], "library-cli", "the most-dependent capability runs just before the story");
  assert.equal(order.length, 8, "7 capabilities + the story");
  assert.ok(
    order.indexOf("migrate-on-write-upcaster") < order.indexOf("event-sourced-store-seam"),
    "depends_on edges are honoured",
  );

  // ADR-0044/0040: library now declares uat_witness: machine (every Story UAT leg is an agent
  // exercise) → the gate drives AND signs the story's own UAT node, not just its capabilities.
  assert.match(env.body, /uat witness: machine \(declared\)/);
  assert.match(env.body, /nodes: {7}8\/8 signed passes/);
  assert.match(env.body, /library +PASS {3}rollup: healthy/);
  assert.doesNotMatch(env.body, /WITHHELD/);
  assert.match(env.body, /outcome: {5}PASSED — every node signed/);
  assert.equal((env.body.match(/PASS {3}rollup: healthy/g) ?? []).length, 8);

  // The honest framing is part of the output.
  assert.match(env.body, /proves the CHAINING/);
  assert.match(env.body, /NOT the nodes' actual proofs/);
});

/**
 * A temp stories/ root REUSING registered node ids (`library`, `library-cli`) so the registry
 * precheck passes — the witness gate (ADR-0040) is what varies. `uat_witness` lands in the
 * story frontmatter verbatim (the empty string omits the line).
 */
function tempStoriesDir(uatWitnessLine: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "storytree-witness-"));
  mkdirSync(path.join(dir, "library"));
  writeFileSync(
    path.join(dir, "library", "story.md"),
    [
      "---",
      'id: "library"',
      "tier: story",
      'title: "temp witness-gate story"',
      'outcome: "temp"',
      "status: proposed",
      "proof_mode: UAT",
      ...(uatWitnessLine === "" ? [] : [uatWitnessLine]),
      "capabilities: [library-cli]",
      "---",
      "",
      "# temp",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(dir, "library", "library-cli.md"),
    [
      "---",
      'id: "library-cli"',
      "tier: capability",
      'title: "temp capability"',
      'outcome: "temp"',
      "status: proposed",
      "proof_mode: integration-test",
      'story: "library"',
      "depends_on: []",
      "---",
      "",
      "# temp",
      "",
    ].join("\n"),
  );
  return dir;
}

test("uat_witness: machine lets the gate drive the story's UAT node (ADR-0040)", async () => {
  const dir = tempStoriesDir("uat_witness: machine");
  try {
    const env = await storyBuild("library", {
      dryRun: true,
      actor: "tester@example.com",
      storiesDir: dir,
    });
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /uat witness: machine \(declared\)/);
    assert.match(env.body, /nodes: {7}2\/2 signed passes/);
    assert.match(env.body, /outcome: {5}PASSED — every node signed/);
    assert.doesNotMatch(env.body, /WITHHELD/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit uat_witness: human withholds the story UAT node exactly like the default", async () => {
  const dir = tempStoriesDir("uat_witness: human");
  try {
    const env = await storyBuild("library", {
      dryRun: true,
      actor: "tester@example.com",
      storiesDir: dir,
    });
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /uat witness: human \(declared\)/);
    assert.match(env.body, /nodes: {7}1\/1 signed passes \(the story UAT node awaits its human witness\)/);
    assert.match(env.body, /library +WITHHELD — uat_witness: human: a human must witness this UAT/);
    assert.match(env.body, /declare/);
    assert.match(env.body, /uat_witness: machine in the story frontmatter/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an invalid uat_witness value fails the spec load loudly (never a silent default)", async () => {
  const dir = tempStoriesDir("uat_witness: robot");
  try {
    const env = await storyBuild("library", {
      dryRun: true,
      actor: "tester@example.com",
      storiesDir: dir,
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /a node spec failed to load/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("story build with no mode (or both modes) is refused", async () => {
  const none = await run(["story", "build", "library"], deps);
  assert.equal(none.ok, false);
  assert.match(none.body, /pick exactly one mode/);
  assert.ok(none.next?.some((n) => n.includes("--dry-run")));
  assert.ok(none.next?.some((n) => n.includes("--live")));

  const both = await run(["story", "build", "library", "--dry-run", "--live"], deps);
  assert.equal(both.ok, false);
  assert.match(both.body, /pick exactly one mode/);
});

test("story build on a story with unregistered nodes fails closed BEFORE any node runs", async () => {
  const env = await run(
    ["story", "build", "studio", "--dry-run", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no test-command registry entry/);
  // It names the unregistered nodes rather than dying mid-run.
  assert.match(env.body, /browse-library/);
  assert.doesNotMatch(env.body, /phase trail/);
});

test("story build on an unknown story id is guidance", async () => {
  const env = await run(["story", "build", "no-such-story", "--dry-run", "--actor", "t@e.c"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no story spec "no-such-story"/);
});

test("story build on a CAPABILITY id is refused (not a story)", async () => {
  const env = await run(["story", "build", "library-cli", "--dry-run", "--actor", "t@e.c"], deps);
  assert.equal(env.ok, false);
  // library-cli has no <id>/story.md, so the spec lookup itself misses — a tier-shaped refusal
  // would need a spec file at the story path; either way the build never starts.
  assert.doesNotMatch(env.body, /phase trail/);
});

test("--store pg with --dry-run is refused: a scripted PASS must never persist (forged healthy)", async () => {
  const env = await run(
    ["story", "build", "library", "--dry-run", "--store", "pg", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /forged/);
  assert.match(env.body, /ADR-0020/);
});

test("an unknown --store value is refused with guidance", async () => {
  const env = await run(
    ["story", "build", "library", "--dry-run", "--store", "surreal", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown --store "surreal"/);
});

test("bare `story`, story --help, and an unknown story command are help/guidance", async () => {
  const bare = await run(["story"], deps);
  assert.equal(bare.ok, true);
  assert.match(bare.body, /story build <story-id> --dry-run/);
  assert.match(bare.body, /halt/i);

  const unknown = await run(["story", "frobnicate"], deps);
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown story command/);

  const noId = await run(["story", "build", "--dry-run"], deps);
  assert.equal(noId.ok, false);
  assert.match(noId.body, /needs a story id/);
});

test("node build --store pg --dry-run is refused too (same forged-healthy wall)", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--store", "pg", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /forged/);
});

test("node build --dry-run still reports the in-memory verdict store in the header", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /store: {7}in-memory/);
});
