import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNodeSpec } from "./node-spec.js";
import type { NodeSpec } from "./node-spec.js";
import type { RealProofConfig } from "./proof-config.js";
import { assemblePrompts, realPrompts } from "./resolve-prove-spec.js";

// `brief-carries-the-units-proof-walkthrough`: a unit's `## Proof walkthrough` — the acceptance setup its test
// must build — is read off the spec and reaches both phase briefs right after the guidance, and a unit with
// none briefs byte for byte as before. The walkthrough never reached a leaf until this, so a guidance line
// telling both phases to "read this whole file" pointed at a file the brief never named.

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const TEST_FILE = "packages/unit/src/unit.test.ts";
const SOURCE_FILE = "packages/unit/src/unit.ts";

const WALKTHROUGH =
  "Given a real `ShellTestExecutor` whose children append one marker each (never a `RecordingTestExecutor`):\n\n" +
  "1. **Red.** The child exits red; read one marker.\n" +
  "2. **Green.** The child exits green; read two markers.";

/** The section as the loader should read it: trimmed, its own `###` subheading kept. */
const EXPECTED_WALKTHROUGH = `${WALKTHROUGH}\n\n### A subheading stays inside it\n\nStill the walkthrough.`;

/** A spec whose body carries `heading` and its walkthrough between the guidance and the contracts. */
function specWith(heading?: string): string {
  const lines = [
    "---",
    'id: "walkthrough-unit"',
    "tier: capability",
    "story: drive-machinery",
    'title: "A unit with a proof walkthrough"',
    'outcome: "add returns the sum of its operands."',
    "status: proposed",
    "proof_mode: integration-test",
    "depends_on: []",
    "---",
    "",
    "# A unit with a proof walkthrough",
    "",
    "## Guidance",
    "",
    "Keep `add` pure.",
    "",
  ];
  if (heading !== undefined) {
    lines.push(heading, "", WALKTHROUGH, "", "### A subheading stays inside it", "", "Still the walkthrough.", "");
  }
  lines.push("## Contracts (1)", "", "1. **`add-sums`** — add returns the sum of its operands", "   - **asserts —** `add(2, 3)` is 5.", "");
  return lines.join("\n");
}

function loadSpec(text: string): NodeSpec {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-walkthrough-"));
  try {
    const file = path.join(dir, "walkthrough-unit.md");
    fs.writeFileSync(file, text);
    return loadNodeSpec(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function realConfig(extra: Partial<RealProofConfig> = {}): RealProofConfig {
  return { testFile: TEST_FILE, sourceFile: SOURCE_FILE, scope: { testGlobs: [TEST_FILE], sourceGlobs: [SOURCE_FILE] }, ...extra };
}

test("spec-proof-walkthrough-is-read: the loader reads a `## Proof walkthrough` under every spelling the corpus uses, up to the next `##` heading", () => {
  for (const heading of [
    "## Proof walkthrough",
    "## Proof walkthrough first",
    "## Proof walkthrough (written first)",
    "## Proof walkthrough — contract-test",
  ]) {
    const spec = loadSpec(specWith(heading));
    assert.equal(spec.proofWalkthrough, EXPECTED_WALKTHROUGH, heading);
    assert.equal(spec.guidance, "Keep `add` pure.", `${heading}: the guidance still ends at the next heading`);
    assert.deepEqual(
      spec.contracts.map((c) => c.id),
      ["add-sums"],
      `${heading}: the contracts still parse after it`,
    );
  }
});

test("spec-proof-walkthrough-is-read: a bare `## Proof`, or no walkthrough at all, leaves the key absent", () => {
  for (const [label, text] of [
    ["a bare `## Proof`", specWith("## Proof")],
    ["no walkthrough", specWith()],
  ] as const) {
    const spec = loadSpec(text);
    assert.equal("proofWalkthrough" in spec, false, label);
  }
});

test("briefs-carry-the-proof-walkthrough: every real arm, and the dry-run brief, carry the walkthrough right after the guidance in both phases, and nothing else in either brief moves", () => {
  const spec = loadSpec(specWith("## Proof walkthrough"));
  const { proofWalkthrough, ...bare } = spec;
  assert.equal(proofWalkthrough, EXPECTED_WALKTHROUGH);
  const guidance = "\n\nGuidance from the node spec:\nKeep `add` pure.";
  const authorBlock =
    "\n\nProof walkthrough from the node spec — the acceptance setup your test must build. Use the " +
    `collaborators it names, and never a double or shortcut it rules out:\n${EXPECTED_WALKTHROUGH}`;
  const implementBlock =
    `\n\nProof walkthrough from the node spec — the acceptance setup the test you implement against builds:\n${EXPECTED_WALKTHROUGH}`;
  const display = "node --import tsx --test unit.test.ts";

  const arms = {
    "net-new": realConfig(),
    "edits-existing": realConfig({ editsExisting: true }),
    "a cluster": realConfig({ editsExisting: true, cluster: ["add-sums", "add-handles-negatives"] }),
    "refactor-for-tests": realConfig({
      refactorForTests: true,
      proofCommand: { file: "pnpm", args: ["--filter", "@storytree/unit", "test"] },
    }),
  } satisfies Record<string, RealProofConfig>;
  for (const [arm, real] of Object.entries(arms)) {
    const withIt = realPrompts(spec, real, display, "codex");
    const without = realPrompts(bare, real, display, "codex");
    assert.ok(
      withIt.authorTest.includes(`${guidance}${authorBlock}\n\nPhase AUTHOR_TEST`),
      `${arm}: AUTHOR_TEST carries it right after the guidance`,
    );
    assert.ok(
      withIt.implement.includes(`${guidance}${implementBlock}\n\nPhase IMPLEMENT`),
      `${arm}: IMPLEMENT carries it right after the guidance`,
    );
    assert.equal(withIt.authorTest.replace(authorBlock, ""), without.authorTest, `${arm}: nothing else in AUTHOR_TEST moved`);
    assert.equal(withIt.implement.replace(implementBlock, ""), without.implement, `${arm}: nothing else in IMPLEMENT moved`);
  }
  assert.ok(
    realPrompts(spec, arms["a cluster"], display, "codex").authorTest.includes("author a CLUSTER"),
    "the cluster arm really briefed a cluster",
  );

  const dry = assemblePrompts(spec);
  const dryBare = assemblePrompts(bare);
  assert.equal(dry.authorTest, `${dryBare.authorTest}${authorBlock}`);
  assert.equal(dry.implement, `${dryBare.implement}${implementBlock}`);
});

test("briefs-carry-the-proof-walkthrough: a real spec's walkthrough reaches both of its briefs verbatim", () => {
  const spec = loadNodeSpec(path.join(REPO_ROOT, "stories", "drive-machinery", "gate-routes-authoring-escalation.md"));
  const walkthrough = spec.proofWalkthrough;
  assert.ok(walkthrough !== undefined, "the spec carries a `## Proof walkthrough`");
  const brief = realPrompts(spec, realConfig({ editsExisting: true }), "node --import tsx --test unit.test.ts", "codex");
  assert.ok(brief.authorTest.includes(walkthrough), "AUTHOR_TEST carries it verbatim");
  assert.ok(brief.implement.includes(walkthrough), "IMPLEMENT carries it verbatim");
});
