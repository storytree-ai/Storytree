import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";

import { run } from "./commands.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";

/**
 * The tree DISPATCH wiring (spine-side, ADR-0033) + the verdict-glyph wiring (the verdict-glyphs
 * capability's post-promotion spine work): `run` routes the `tree` area to the leaf-proven
 * `treeCommand` with the injected stories dir, registry seam, presence store, and verdict reader.
 * The command module's own truths live in tree.test.ts and the glyph module's in
 * tree-verdicts.test.ts (the nodes' registered proofs); this file only proves the glue:
 * glyphs appear per node row when a reader is injected and are silently absent without one.
 */

let storiesDir: string;

before(() => {
  storiesDir = mkdtempSync(join(tmpdir(), "tree-dispatch-test-"));
  const storyDir = join(storiesDir, "demo-story");
  mkdirSync(storyDir);

  writeFileSync(
    join(storyDir, "story.md"),
    [
      "---",
      "id: demo-story",
      "tier: story",
      "title: Demo Story",
      "outcome: The demo story delivers value",
      "status: proposed",
      "proof_mode: UAT",
      "capabilities:",
      "  - cap-a",
      "  - cap-b",
      "  - cap-c",
      "---",
      "",
      "Demo story body.",
    ].join("\n"),
  );

  for (const cap of ["cap-a", "cap-b", "cap-c"]) {
    writeFileSync(
      join(storyDir, `${cap}.md`),
      [
        "---",
        `id: ${cap}`,
        "tier: capability",
        `title: Capability ${cap}`,
        `outcome: ${cap} is done`,
        "status: proposed",
        "proof_mode: integration-test",
        "---",
        "",
        `${cap} body.`,
      ].join("\n"),
    );
  }
});

after(() => {
  rmSync(storiesDir, { recursive: true, force: true });
});

/** A full signed Verdict doc (the strict core shape) wrapped as a signing event. */
function signingEvent(
  seq: number,
  unitId: string,
  outcome: "pass" | "fail",
): { kind: string; seq: number; doc: unknown } {
  return {
    kind: SIGNING_EVENT_KIND,
    seq,
    doc: {
      unitId,
      proofMode: "capability",
      outcome,
      commitSha: "abc123",
      signer: "test-signer",
      runId: `run-${seq}`,
      evidence: [],
      at: "2026-06-13T00:00:00.000Z",
    },
  };
}

function fakeVerdictReader(
  events: Array<{ kind: string; seq: number; doc: unknown }>,
): VerdictReaderLike {
  return { readEvents: () => Promise.resolve(events) };
}

test("the tree area routes to the bare view off the injected stories dir", async () => {
  const env = await run(["tree"], { store: new InMemoryStore(), storiesDir });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /demo-story/);
  assert.ok(env.next?.includes("storytree tree demo-story"));
});

test("focused view through the dispatch weaves verdict glyphs from the injected reader", async () => {
  const verdicts = fakeVerdictReader([
    signingEvent(1, "cap-a", "pass"),
    signingEvent(2, "cap-b", "pass"),
    signingEvent(3, "cap-b", "fail"), // last run failed — supersedes the pass
  ]);
  const env = await run(["tree", "demo-story"], {
    store: new InMemoryStore(),
    storiesDir,
    verdicts,
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /cap-a ✓/);
  assert.match(env.body, /cap-b ✗/);
  assert.match(env.body, /cap-c –/); // registered in the story, never built
  // The story row reads ONLY its own UAT node's verdict — children's passes grant it nothing.
  assert.match(env.body, /Story: demo-story –/);
});

test("the bare view carries the story's own glyph too", async () => {
  const verdicts = fakeVerdictReader([signingEvent(1, "demo-story", "pass")]);
  const env = await run(["tree"], { store: new InMemoryStore(), storiesDir, verdicts });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /demo-story ✓/);
});

test("without a verdict reader the views are glyph-free and ok (offline-silent)", async () => {
  const env = await run(["tree", "demo-story"], { store: new InMemoryStore(), storiesDir });
  assert.equal(env.ok, true, env.body);
  assert.ok(!env.body.includes("✓"));
  assert.ok(!env.body.includes("✗"));
  assert.ok(!env.body.includes("–"));
});

test("a throwing verdict reader degrades to the glyph-free view, never an error", async () => {
  const verdicts: VerdictReaderLike = {
    readEvents: () => Promise.reject(new Error("DB unavailable")),
  };
  const env = await run(["tree", "demo-story"], {
    store: new InMemoryStore(),
    storiesDir,
    verdicts,
  });
  assert.equal(env.ok, true, env.body);
  assert.ok(!env.body.includes("✓"));
  assert.ok(!env.body.includes("–"));
});

test("tree --help is an ok envelope and the top help names the area", async () => {
  const helpEnv = await run(["tree", "--help"], { store: new InMemoryStore(), storiesDir });
  assert.equal(helpEnv.ok, true);
  assert.match(helpEnv.body, /orientation surface/);
  assert.match(helpEnv.body, /✓ proven/);

  const top = await run([], { store: new InMemoryStore() });
  // ADR-0118 goal-first flip: `tree` is now surfaced as a proof workflow (`tree [<story>]`), not the
  // old grain-area line — but the top help still names it with its work-hierarchy gloss.
  assert.match(top.body, /^\s*tree \[<story>\].*the work hierarchy/m);
});
