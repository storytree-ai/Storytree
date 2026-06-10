import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/core";

import { run } from "./commands.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C), driven through `run` exactly as
 * `main` does. All offline: scripted model, temp workspace, InMemoryStore — zero API cost, no DB.
 * `--actor` pins the signer so the tests are deterministic on any machine (no git-email reliance).
 */

/** The node area never touches the library store; an empty InMemoryStore keeps the tests fast. */
const deps = { store: new InMemoryStore() };

test("node build <id> --dry-run walks the gate and reports trail + verdict + rollup", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  // The full phase trail, in order.
  assert.match(env.body, /AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/);
  // The signed verdict, attributed to the --actor signer, with the spine's own red→green evidence.
  assert.match(env.body, /verdict: {5}PASS — signed by tester@example\.com/);
  assert.match(env.body, /observation:red, observation:green/);
  // The real spec drove it: real file, real proof-mode mapping.
  assert.match(env.body, /stories\/library\/library-cli\.md/);
  assert.match(env.body, /integration-test → capability/);
  // The rollup DERIVES healthy off the event log (building → signed pass).
  assert.match(env.body, /rollup: {6}healthy/);
  // The honest framing is part of the output, not just a code comment.
  assert.match(env.body, /proves the GLUE/);
  assert.match(env.body, /NOT the\nnode's actual proofs/);
});

test("node build with no mode is refused (must pick --dry-run or --live)", async () => {
  const env = await run(["node", "build", "library-cli"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--live/);
  assert.ok(env.next?.some((n) => n.includes("--dry-run")));
  assert.ok(env.next?.some((n) => n.includes("--live")));
});

test("node build with BOTH modes is refused (dry-run xor live)", async () => {
  const env = await run(["node", "build", "library-cli", "--dry-run", "--live"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
});

test("node build with --dry-run AND --real is refused; the mode menu names --real", async () => {
  const env = await run(["node", "build", "verdict-line", "--dry-run", "--real"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--real/);
  assert.match(env.body, /REAL proof command|REAL test\/impl/);
  assert.ok(env.next?.some((n) => n.includes("--real")));
});

test("node build --real on a node WITHOUT a real-proof config fails closed before any worktree", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--real", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not REAL-buildable/);
  assert.match(env.body, /verdict-line/);
  assert.ok(env.next?.some((n) => n === "storytree node build verdict-line --real"));
});

test("the verdict-line node spec loads and dry-runs (the real target is also glue-driveable)", async () => {
  const env = await run(
    ["node", "build", "verdict-line", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/drive-machinery\/verdict-line\.md/);
  assert.match(env.body, /contract-test → contract/);
  assert.match(env.body, /rollup: {6}healthy/);
});

test("node build with an unknown id is guidance listing the buildable nodes", async () => {
  const env = await run(["node", "build", "no-such-node", "--dry-run", "--actor", "t@e.c"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no node spec "no-such-node"/);
  assert.ok(env.next?.some((n) => n.includes("library-cli")));
});

test("node build on a spec that exists but is NOT registered fails closed", async () => {
  // studio-foundation/browse-library.md is a real spec with no test-command registry entry.
  const env = await run(
    ["node", "build", "browse-library", "--dry-run", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no test-command registry entry/);
});

test("node build without an id, and bare `node`, are help/guidance", async () => {
  const bare = await run(["node"], deps);
  assert.equal(bare.ok, true);
  assert.match(bare.body, /node build <id> --dry-run/);
  assert.match(bare.body, /library-cli/);
  assert.match(bare.body, /--real/);
  assert.match(bare.body, /REAL-buildable nodes: {9}verdict-line/);

  const noId = await run(["node", "build", "--dry-run"], deps);
  assert.equal(noId.ok, false);
  assert.match(noId.body, /needs an id/);
});

test("the story node (library) dry-runs too, with the UAT → story proof-mode mapping", async () => {
  const env = await run(
    ["node", "build", "library", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/library\/story\.md/);
  assert.match(env.body, /UAT → story/);
  assert.match(env.body, /rollup: {6}healthy/);
});
