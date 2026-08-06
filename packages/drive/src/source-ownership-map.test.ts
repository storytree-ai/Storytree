import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalisePastedPath, resolveClaimId, type ClaimUniverse } from "./claim-namespace.js";
import { readSubtreeTargets } from "./claim-universe.js";
import { readSourceOwnershipMap } from "./source-ownership-map.js";

/**
 * The declared subtree map (ADR-0317 D2) as a CLAIM SOURCE (D3).
 *
 * Two halves, and the second one is deliberately NOT hermetic:
 *
 *  1. The reader's contract over throwaway manifests — every way it can fail to read must be
 *     reported as unread, because `claim-universe.ts` turns a non-empty `unread` into "stand down"
 *     and anything it swallowed instead would become a refusal on a real id.
 *  2. THE LIVE MANIFEST. Every one of the map's real keys must resolve as a claim id, and none may
 *     be mangled by the pasted-path normalisation or shadow a node id. `claim-namespace.test.ts` is
 *     frozen and hermetic on purpose; that is exactly why it cannot answer this — its fixture is
 *     two hand-written keys, and the property that matters is over all 372 the repo actually
 *     declares. This file is in `drive` beside its sibling live-manifest suites
 *     (`write-authority-rules.test.ts`, `repo-root-drivable.test.ts`) and needs no DB and no
 *     network: `repo-manifest.json` is a committed file.
 */

/** This file sits at `<repo>/packages/drive/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const LIVE_MANIFEST = path.join(REPO_ROOT, "repo-manifest.json");

function write(body: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "source-ownership-map-"));
  const file = path.join(dir, "repo-manifest.json");
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body), "utf8");
  return file;
}

// ---------------------------------------------------------------------------
// The reader's contract
// ---------------------------------------------------------------------------

test("declarations are read as {subtree, owner}, and `$`-prefixed prose keys are not declarations", () => {
  const file = write({
    sourceOwnership: {
      $comment: "the authoring rules",
      $section_cli: "—",
      subtrees: {
        $comment: "prose",
        $section_cli: "—",
        "packages/cli/src/gate*.ts": "gate-ci-parity",
        "packages/library/src/store": "library-cli",
        "packages/bad/src": 42,
      },
    },
  });
  const map = readSourceOwnershipMap(file);
  assert.deepEqual(map.unread, []);
  assert.deepEqual(map.subtrees, [
    { subtree: "packages/cli/src/gate*.ts", owner: "gate-ci-parity" },
    { subtree: "packages/library/src/store", owner: "library-cli" },
  ]);
});

test("EVERY way of failing to read is reported as unread, never as an empty map", () => {
  // The asymmetry is the design's centre: a non-empty `unread` stands the claim check down, while a
  // silently-empty map would refuse every real subtree id. So each of these must land in `unread`.
  const cases: Array<[string, string | null]> = [
    ["uncomposed", null],
    ["absent", path.join(tmpdir(), "no-such-manifest-4471.json")],
    ["unparseable", write("{ not json")],
    ["no sourceOwnership block", write({ packageOwnership: {} })],
    ["sourceOwnership is not an object", write({ sourceOwnership: "nope" })],
    ["no subtrees map", write({ sourceOwnership: { baseline: {} } })],
    ["subtrees is not an object", write({ sourceOwnership: { subtrees: "nope" } })],
  ];
  for (const [why, file] of cases) {
    const map = readSourceOwnershipMap(file);
    assert.equal(map.subtrees.length, 0, why);
    assert.equal(map.unread.length, 1, `${why} must report itself unread`);
  }
});

test("a deliberately EMPTY subtrees map reads CLEAN — declaring nothing is not failing to read", () => {
  const map = readSourceOwnershipMap(write({ sourceOwnership: { subtrees: {} } }));
  assert.deepEqual(map.subtrees, []);
  assert.deepEqual(map.unread, []);
});

test("a malformed baseline is dropped, not escalated — the trend is cosmetic, the map is not", () => {
  const file = write({
    sourceOwnership: { baseline: { date: "2026-08-06", files: "lots" }, subtrees: { a: "b" } },
  });
  const map = readSourceOwnershipMap(file);
  assert.equal(map.baseline, undefined);
  assert.deepEqual(map.unread, [], "one bad number must not stand every claim in the factory down");
});

test("a well-formed baseline is read", () => {
  const file = write({
    sourceOwnership: { baseline: { date: "2026-08-06", files: 521, unowned: 483 }, subtrees: {} },
  });
  assert.deepEqual(readSourceOwnershipMap(file).baseline, {
    date: "2026-08-06",
    files: 521,
    unowned: 483,
  });
});

// ---------------------------------------------------------------------------
// The LIVE map, held to the resolver
// ---------------------------------------------------------------------------

/** The real map as a complete universe — subtrees only, which is all these assertions are about. */
function liveUniverse(): ClaimUniverse {
  const source = readSubtreeTargets(LIVE_MANIFEST);
  assert.deepEqual(source.unread, [], "the committed manifest must read in full");
  return { targets: source.targets, nonClaimable: [], complete: true, unreadSources: [] };
}

test("EVERY declaration in the live manifest resolves as a claim id", () => {
  const universe = liveUniverse();
  assert.ok(universe.targets.length > 300, "the map is authored in full (372 at ADR-0317 D2)");
  for (const target of universe.targets) {
    const r = resolveClaimId(target.id, universe);
    assert.equal(r.verdict, "resolved", `${target.id} must be claimable by its own key`);
    if (r.verdict !== "resolved") return;
    assert.equal(r.target.owner, target.owner);
  }
});

test("no live declaration key is mangled by the pasted-path normalisation", () => {
  // The measured hazard runs the other way — `stories/studio` pasted where an id belonged — and
  // this is the check that widening the namespace did not turn that remedy into a new defect. If a
  // future entry ever lands under `stories/` or ends `.md`, this reds rather than silently making
  // that subtree claimable only by a mangled name.
  for (const target of liveUniverse().targets) {
    assert.equal(normalisePastedPath(target.id), target.id, target.id);
  }
});

test("no live declaration key could shadow a node id — the two namespaces cannot collide", () => {
  // Exact resolution takes the FIRST matching target, so a subtree keyed like a node id would
  // silently decide which of the two a claim meant. Node ids are bare slugs and subtree keys are
  // paths, and this is the assertion that keeps it that way.
  for (const target of liveUniverse().targets) {
    assert.ok(
      target.id.includes("/"),
      `${target.id} has no path separator, so it could collide with a node id`,
    );
  }
});
