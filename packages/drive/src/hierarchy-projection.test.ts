import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { canonicalUatCriterionContent, diffWorkHierarchy } from "@storytree/library";
import { criterionRevisionId } from "@storytree/proof-protocol";

import { projectWorkHierarchy, type HierarchyStamp } from "./hierarchy-projection.js";

/**
 * The PROJECTOR over a real (temporary) `stories/` tree: it mirrors the checkout, it survives a
 * broken spec, and it folds nothing. Filesystem only — no store, no credential, no network.
 */

const STAMP: HierarchyStamp = {
  commitSha: "deadbeef",
  storiesTreeSha: "cafef00d",
  generatedAt: "2026-08-26T00:00:00.000Z",
  generator: "test",
};

const C1 = "uatc_000000000000000000000001";
const C2 = "uatc_000000000000000000000002";

/** One authored `## UAT Test Criteria` item, with a revision id that actually binds its content. */
function uatItem(ordinal: number, criterionId: string, lead: string, witness = "machine"): string {
  const draft = `${String(ordinal)}. **${lead}** _(criterion-id: ${criterionId})_ _(revision-id: uatr1:0000000000000000)_ _(witness: ${witness})_`;
  // The identity tags are stripped before hashing, so the placeholder above cannot influence the id.
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(draft));
  return draft.replace("uatr1:0000000000000000", revisionId);
}

function storySpec(
  over: { capabilities?: string[]; extraBody?: string; witness?: string; secondLead?: string } = {},
): string {
  const caps = over.capabilities ?? ["demo-cap", "second-cap"];
  return [
    "---",
    'id: "demo"',
    "tier: story",
    'title: "Demo story"',
    'outcome: "a demo outcome"',
    "status: building",
    "proof_mode: UAT",
    `uat_witness: ${over.witness ?? "machine"}`,
    `capabilities: [${caps.join(", ")}]`,
    "depends_on: [library]",
    "consumed_by: [cli]",
    "decisions: [445, 448]",
    "render: building",
    "---",
    "",
    "# Demo story",
    "",
    "## UAT Test Criteria",
    "",
    uatItem(1, C1, "walk the forest"),
    "",
    uatItem(2, C2, over.secondLead ?? "read the panel"),
    "",
    "## Reliability Gates",
    "",
    "1. **The demo suite is green** _(gate: observe)_ _(covers: demo-cap)_ `pnpm test`.",
    "2. **A retired obligation** _(gate: observe)_ _(retired)_ `pnpm nothing`.",
    over.extraBody ?? "",
  ].join("\n");
}

function capabilitySpec(id: string): string {
  return [
    "---",
    `id: "${id}"`,
    "tier: capability",
    "story: demo",
    `title: "${id} title"`,
    `outcome: "${id} outcome"`,
    "status: healthy",
    "proof_mode: integration-test",
    "depends_on: []",
    "---",
    "",
    `# ${id}`,
    "",
    "## Contracts",
    "",
    "1. **`demo-contract-one`** — the first.",
    "2. **`demo-contract-two`** — the second.",
    "",
  ].join("\n");
}

/** Build a throwaway stories tree; the caller removes it. */
function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "storytree-hierarchy-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

function healthyTree(): string {
  return makeTree({
    "demo/story.md": storySpec(),
    "demo/demo-cap.md": capabilitySpec("demo-cap"),
    "demo/second-cap.md": capabilitySpec("second-cap"),
  });
}

test("work-hierarchy-projection-mirrors-the-checkout: every story, capability, criterion and gate the tree declares is projected", () => {
  const root = healthyTree();
  try {
    const snapshot = projectWorkHierarchy(root, STAMP);

    assert.deepEqual(snapshot.stories.map((s) => s.id), ["demo"]);
    const story = snapshot.stories[0]!;
    assert.equal(story.title, "Demo story");
    assert.equal(story.outcome, "a demo outcome");
    assert.equal(story.status, "building");
    assert.equal(story.proofMode, "UAT");
    assert.deepEqual(story.dependsOn, ["library"]);
    assert.deepEqual(story.consumedBy, ["cli"]);
    assert.deepEqual(story.decisions, [445, 448]);
    assert.equal(story.building, true, "the ADR-0076 render hint survives");
    assert.deepEqual(story.capabilities, ["demo-cap", "second-cap"]);
    assert.deepEqual(story.uatTestCriteria.map((c) => c.criterionId), [C1, C2]);
    assert.deepEqual(story.reliabilityGates.map((g) => g.id), ["demo#gate-1", "demo#gate-2"]);
    assert.deepEqual(story.reliabilityGates[0]?.covers, ["demo-cap"]);

    assert.deepEqual(snapshot.capabilities.map((c) => c.id), ["demo-cap", "second-cap"]);
    assert.equal(snapshot.capabilities[0]?.storyId, "demo");
    assert.equal(snapshot.capabilities[0]?.status, "healthy");
    assert.equal(snapshot.capabilities[0]?.contractCount, 2, "the declared `## Contracts` count");

    // Two runs over the same tree are byte-equal, which is what makes the drift check's silence mean
    // something: a projector that varied by directory-read order would report differences forever.
    assert.deepEqual(diffWorkHierarchy(snapshot, projectWorkHierarchy(root, STAMP)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work-hierarchy-projection-mirrors-the-checkout: a change to ONE criterion's content moves only that criterion", () => {
  const before = healthyTree();
  const after = makeTree({
    "demo/story.md": storySpec({ secondLead: "read the panel carefully" }),
    "demo/demo-cap.md": capabilitySpec("demo-cap"),
    "demo/second-cap.md": capabilitySpec("second-cap"),
  });
  try {
    // The measured skew (ADR-0253): re-wording moves the revision id, and a verdict signed against
    // the OLD revision then matches nothing. This is the difference the store must be able to show.
    const diffs = diffWorkHierarchy(projectWorkHierarchy(after, STAMP), projectWorkHierarchy(before, STAMP));
    assert.ok(
      diffs.every((d) => d.entity === "criterion" && d.id === C2),
      "nothing but the re-worded criterion moved — not the story, not its sibling, not a capability",
    );
    assert.ok(
      diffs.some((d) => d.field === "revisionId"),
      "and the difference the map's join actually turns on is REPORTED, by name",
    );
  } finally {
    rmSync(before, { recursive: true, force: true });
    rmSync(after, { recursive: true, force: true });
  }
});

test("work-hierarchy-projection-mirrors-the-checkout: membership comes from the story's frontmatter, not the directory listing", () => {
  const root = makeTree({
    "demo/story.md": storySpec({ capabilities: ["demo-cap"] }),
    "demo/demo-cap.md": capabilitySpec("demo-cap"),
    // Present on disk, unnamed by the story. `readTree` does not render it, so neither does this —
    // inventing membership from the filesystem would make the store and the map disagree about
    // which capabilities a story has.
    "demo/stray-cap.md": capabilitySpec("stray-cap"),
    // A directory with no `story.md` is not a story directory; it is skipped in silence.
    "notes/readme.md": "# not a story",
  });
  try {
    const snapshot = projectWorkHierarchy(root, STAMP);
    assert.deepEqual(snapshot.capabilities.map((c) => c.id), ["demo-cap"]);
    assert.deepEqual(snapshot.stories.map((s) => s.id), ["demo"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work-hierarchy-projection-is-total-over-an-unreadable-spec: a broken story and a missing capability become error nodes, never a throw", () => {
  const root = makeTree({
    "demo/story.md": storySpec({ capabilities: ["demo-cap", "absent-cap"] }),
    "demo/demo-cap.md": "no frontmatter here at all",
    "broken/story.md": "not a spec",
  });
  try {
    const snapshot = projectWorkHierarchy(root, STAMP);

    // One bad spec must not blank the forest — the whole tree still projects.
    assert.deepEqual(snapshot.stories.map((s) => s.id).sort(), ["broken", "demo"]);
    const broken = snapshot.stories.find((s) => s.id === "broken")!;
    assert.match(broken.error ?? "", /frontmatter/, "the story carries WHY it could not be read");
    assert.equal(broken.status, null);

    const absent = snapshot.capabilities.find((c) => c.id === "absent-cap")!;
    assert.equal(absent.error, "spec file missing");
    const malformed = snapshot.capabilities.find((c) => c.id === "demo-cap")!;
    assert.match(malformed.error ?? "", /frontmatter/);
    assert.equal(malformed.contractCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work-hierarchy-projection-is-total-over-an-unreadable-spec: an absent stories directory projects an EMPTY snapshot rather than throwing", () => {
  const snapshot = projectWorkHierarchy(path.join(tmpdir(), "storytree-no-such-tree-here"), STAMP);
  assert.deepEqual(snapshot.stories, []);
  assert.deepEqual(snapshot.capabilities, []);
  // Empty is a legitimate SHAPE and a suspicious READING — `check:hierarchy-drift` is what refuses
  // to call it clean, because two empty snapshots agree with each other perfectly.
  assert.equal(snapshot.storiesTreeSha, STAMP.storiesTreeSha);
});

test("work-hierarchy-projection-carries-raw-authored-facts: no fold is applied on the way in", () => {
  const root = makeTree({
    "demo/story.md": storySpec({ witness: "human" })
      .replace("## UAT Test Criteria", "## UAT Test Criteria (would-be)"),
    "demo/demo-cap.md": capabilitySpec("demo-cap"),
    "demo/second-cap.md": capabilitySpec("second-cap"),
  });
  try {
    const story = projectWorkHierarchy(root, STAMP).stories[0]!;
    assert.equal(story.uatTestCriteria.length, 2, "would-be criteria are projected, not filtered");
    assert.ok(story.uatTestCriteria.every((c) => c.wouldBe));
    assert.equal(story.reliabilityGates.length, 2, "the RETIRED gate is projected, not filtered");
    assert.equal(story.reliabilityGates[1]?.retired, true);
    assert.equal(story.uatWitness, "human", "the DECLARED witness, verbatim");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("work-hierarchy-projection-carries-raw-authored-facts: an undeclared uat_witness stays undeclared", () => {
  // `effectiveUatWitness`'s fail-closed default to `human` is a RULE. Applying it here would put the
  // LOADER's rule version into the store, which is a second staleness axis no reader could see.
  const root = makeTree({
    "demo/story.md": storySpec().replace("uat_witness: machine\n", ""),
    "demo/demo-cap.md": capabilitySpec("demo-cap"),
    "demo/second-cap.md": capabilitySpec("second-cap"),
  });
  try {
    assert.equal(projectWorkHierarchy(root, STAMP).stories[0]?.uatWitness, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
