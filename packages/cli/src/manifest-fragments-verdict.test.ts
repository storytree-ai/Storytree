import test from "node:test";
import assert from "node:assert/strict";

import { splitManifest, type ManifestFragmentSource, type ManifestObject } from "@storytree/drive";

import { formatManifestTreeVerdict, judgeManifestTree } from "./manifest-fragments-verdict.js";

/**
 * `check:manifest-fragments`' judge (ADR-0556 D4): a fragment tree composes, is written in its one form, and has
 * no aggregate beside it. Every fixture is text, never a disk, and every refusal sits beside the unbroken tree
 * the same test shows green — so no refusal can pass because the whole fixture was broken.
 */

/** A complete manifest: every section the composer requires, two owners' declarations, nearly nothing else. */
function manifest(): ManifestObject {
  return {
    root: { files: { "README.md": "front door" }, dirs: { packages: "code" } },
    docs: { allowedDirs: {}, files: {} },
    packageOwnership: { organisms: { "@storytree/drive": "drive-machinery" }, foundational: [], surfaces: {} },
    sourceOwnership: {
      subtrees: { "packages/drive/src/a.ts": "drive-machinery", "packages/cli/src/b.ts": "organism-boundary-tooling" },
    },
    hierarchyCamps: { readers: {} },
    hostedStories: { register: {} },
  };
}

function read(fragments: readonly ManifestFragmentSource[]) {
  return { fragments, unread: [] };
}

const AGGREGATE =
  "repo-manifest.json sits beside the fragment tree, and nothing reads it: the aggregate left Git (ADR-0556 D4), so " +
  "whatever it declares is declared nowhere — move each declaration into repo-manifest/ and delete the file";

const NO_TREE =
  "no repo-manifest/ fragment tree at the repo root — every reader of the manifest reads it, and nothing else holds it";

test("a tree written in its one form, with nothing beside it, is green — and says how much it judged", () => {
  const fragments = splitManifest(manifest());
  assert.equal(fragments.length, 7, "five domain shards and two owners");
  const verdict = judgeManifestTree({ tree: read(fragments), aggregatePresent: false });
  assert.deepEqual(verdict, { refusals: [], drift: [], fragments: 7 });
  assert.equal(
    formatManifestTreeVerdict(verdict),
    "✓ repo manifest (ADR-0556): 7 fragment(s) under repo-manifest/ compose, each written exactly as the composer " +
      "writes it, and no aggregate sits beside them",
  );
});

test("a fragment out of form is refused naming what is wrong, and offers the one mechanical repair", () => {
  const at = "source-ownership/drive-machinery.json";
  const compact = splitManifest(manifest()).map((f) => (f.path === at ? { path: at, text: JSON.stringify(JSON.parse(f.text)) } : f));
  const verdict = judgeManifestTree({ tree: read(compact), aggregatePresent: false });
  const refusal =
    "repo-manifest/source-ownership/drive-machinery.json is not written the way the composer writes it — keys sorted " +
    "at every depth, two-space indentation, one trailing newline";
  assert.deepEqual(verdict.refusals, [refusal]);
  assert.deepEqual(
    verdict.drift.map((d) => [d.repair, d.path]),
    [["rewrite", at]],
  );
  assert.equal(verdict.fragments, 7);
  assert.equal(
    formatManifestTreeVerdict(verdict),
    `✗ repo manifest (ADR-0556): 1 refusal(s)\n  - ${refusal}\n\n` +
      "1 fragment(s) drifted — `pnpm check:manifest-fragments --write` rewrites the tree in its one form, and what it " +
      "declares is unchanged.",
  );
});

test("a tree that does not compose is refused with the composer's own reasons, and offers no rewrite", () => {
  const broken = [...splitManifest(manifest()), { path: "hosted-stories/extra.json", text: "{ nope" }];
  const verdict = judgeManifestTree({ tree: read(broken), aggregatePresent: false });
  assert.equal(verdict.refusals.length, 1);
  assert.match(verdict.refusals[0] ?? "", /^hosted-stories\/extra\.json: is not valid JSON/);
  assert.deepEqual(verdict.drift, []);
  assert.equal(verdict.fragments, 8);
  assert.doesNotMatch(formatManifestTreeVerdict(verdict), /--write/);
});

test("a tree that did not read in full is refused with its own reason — never composed from what did read", () => {
  const unread = "the manifest fragment tree at /x could not be read in full (EACCES)";
  assert.deepEqual(judgeManifestTree({ tree: { fragments: [], unread: [unread] }, aggregatePresent: false }), {
    refusals: [unread],
    drift: [],
    fragments: 0,
  });
});

test("no tree at all is refused — there is no other home to fall back on", () => {
  assert.deepEqual(judgeManifestTree({ tree: null, aggregatePresent: false }), { refusals: [NO_TREE], drift: [], fragments: 0 });
});

test("a repo-manifest.json beside the tree is refused however sound the tree — and after every other refusal", () => {
  assert.deepEqual(judgeManifestTree({ tree: read(splitManifest(manifest())), aggregatePresent: true }).refusals, [AGGREGATE]);
  assert.deepEqual(judgeManifestTree({ tree: null, aggregatePresent: true }).refusals, [NO_TREE, AGGREGATE]);
  assert.deepEqual(judgeManifestTree({ tree: { fragments: [], unread: ["unread"] }, aggregatePresent: true }).refusals, [
    "unread",
    AGGREGATE,
  ]);
  const compact = splitManifest(manifest()).map((f) => ({ path: f.path, text: JSON.stringify(JSON.parse(f.text)) }));
  const drifted = judgeManifestTree({ tree: read(compact), aggregatePresent: true });
  assert.equal(drifted.refusals.length, 8, "seven drifted fragments, then the aggregate");
  assert.equal(drifted.refusals.at(-1), AGGREGATE);
});
