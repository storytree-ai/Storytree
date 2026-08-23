import assert from "node:assert/strict";
import test from "node:test";

import {
  delinkDecisionFileLinks,
  delinkRepoPathLinks,
  delinkedRepoPathText,
  delinkedText,
  findDecisionFileLinks,
  findRepoPathLinks,
  rootedRepoPath,
} from "./adr-body-links.js";

/**
 * The de-link rule, against the three link shapes MEASURED across the live corpus's 3,300
 * occurrences rather than the shapes that came to mind. Each `delinkDecisionFileLinks` case is
 * paired with a `findDecisionFileLinks` case on the same input, because the gate rung and the fixer
 * read the same regex and a finder that missed a link would make the fixer's own output pass.
 */

test("adr-body-links: the canonical [ADR-NNNN](NNNN-slug.md) de-links to the bare number", () => {
  const body = "see [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose.md) for the rule";
  assert.equal(findDecisionFileLinks(body).length, 1);
  assert.equal(delinkDecisionFileLinks(body), "see ADR-0139 for the rule");
});

test("adr-body-links: every relative prefix the corpus uses is matched", () => {
  for (const target of [
    "0139-x.md",
    "./0139-x.md",
    "../0139-x.md",
    "../../0139-x.md",
    "../../docs/decisions/0139-x.md",
    "decisions/0139-x.md",
  ]) {
    const body = `a [ADR-0139](${target}) b`;
    assert.equal(findDecisionFileLinks(body).length, 1, target);
    assert.equal(delinkDecisionFileLinks(body), "a ADR-0139 b", target);
  }
});

test("adr-body-links: a link text carrying the number some other way is kept verbatim", () => {
  for (const [text, target] of [
    ["ADR-0074 §6", 74],
    ["ADR-0011: Own the agent loop and context engineering", 11],
    ["renamed by ADR-0078", 78],
  ] as const) {
    const body = `x [${text}](${String(target).padStart(4, "0")}-slug.md) y`;
    assert.equal(delinkDecisionFileLinks(body), `x ${text} y`);
  }
});

test("adr-body-links: a bare-number link text is PROMOTED, never left as a naked number", () => {
  // `- Superseded (history): [0145](0145-….md), [0148](0148-….md)` — the reference-list shape in
  // adr-0213 / adr-0215 / adr-0216. De-linking to `0145` would leave a number no reader can address.
  const body = "- Superseded (history): [0145](0145-act-2-walks-the-real-map.md).";
  assert.equal(delinkDecisionFileLinks(body), "- Superseded (history): ADR-0145.");
});

test("adr-body-links: prose link text KEEPS the address as a trailing (ADR-NNNN)", () => {
  // Erasing the target here would drop a pointer rather than tidy one.
  const body = "the bar mirrors [the owner-fork bar](0097-brownfield-go-green.md) — escalate";
  assert.equal(
    delinkDecisionFileLinks(body),
    "the bar mirrors the owner-fork bar (ADR-0097) — escalate",
  );
  const named = "the [`reference-dont-restate`](0029-agents-as-library-artifact-category.md) win";
  assert.equal(delinkDecisionFileLinks(named), "the `reference-dont-restate` (ADR-0029) win");
});

test("adr-body-links: a bracketed aside anchors on the LINK's bracket, not the aside's", () => {
  // Excluding only `]` from the link text (the retired loader's pattern) captures
  // `Amended by [ADR-0272` and eats the aside's own bracket. Excluding `[` too is what fixes it.
  const body = "[Amended by [ADR-0272](0272-the-claim-fence-binds.md)]";
  const found = findDecisionFileLinks(body);
  assert.equal(found.length, 1);
  assert.equal(found[0]?.text, "ADR-0272");
  assert.equal(delinkDecisionFileLinks(body), "[Amended by ADR-0272]");
});

test("adr-body-links: a non-decision .md link is NOT touched", () => {
  // The regex must not run past a directory boundary into an unrelated file, and a path with no
  // four-digit basename is not a decision at all.
  for (const body of [
    "see [the spec](../../stories/website/act2-guided-walkthrough.md)",
    "see [the gloss](../../apps/studio/data/knowledge.json)",
    "see [notes](docs/research/agentic-foundation-survey.md)",
    "see [a story](../../stories/web/0123-not-a-decision/story.md)",
  ]) {
    assert.deepEqual(findDecisionFileLinks(body), [], body);
    assert.equal(delinkDecisionFileLinks(body), body, body);
  }
});

test("adr-body-links: the transform is IDEMPOTENT — its own output holds no match", () => {
  const body =
    "a [ADR-0139](0139-x.md), b [0145](0145-y.md), c [the bar](0097-z.md), d [ADR-0074 §6](0074-w.md)";
  const once = delinkDecisionFileLinks(body);
  assert.deepEqual(findDecisionFileLinks(once), []);
  assert.equal(delinkDecisionFileLinks(once), once);
});

test("adr-body-links: multiple links on one line all de-link", () => {
  const body = "[0056](0056-a.md) / [0066](0066-b.md) / [ADR-0070](0070-c.md)";
  assert.equal(delinkDecisionFileLinks(body), "ADR-0056 / ADR-0066 / ADR-0070");
  assert.equal(findDecisionFileLinks(body).length, 3);
});

test("adr-body-links: findDecisionFileLinks reports the number and the whole span", () => {
  const found = findDecisionFileLinks("x [ADR-0215](0215-public-website-story-frame.md) y");
  assert.deepEqual(found, [
    {
      text: "ADR-0215",
      number: 215,
      raw: "[ADR-0215](0215-public-website-story-frame.md)",
    },
  ]);
});

test("adr-body-links: a bare-number text that DISAGREES with its target keeps both", () => {
  // Not present in today's corpus, but the rule must not silently pick one of two numbers.
  assert.equal(
    delinkedText({ text: "0145", number: 148, raw: "[0145](0148-x.md)" }),
    "0145 (ADR-0148)",
  );
});

test("adr-body-links: a clean body yields no findings and is returned unchanged", () => {
  const body = "ADR-0139 is the rule; open it with `storytree library artifact adr-0139`.";
  assert.deepEqual(findDecisionFileLinks(body), []);
  assert.equal(delinkDecisionFileLinks(body), body);
});

// ---------------------------------------------------------------------------------------------
// The REPO-PATH class (increment 09). Same pairing discipline: every de-link case is paired with a
// find case on the same input, because the gate rung and the fixer share one regex and a finder
// that missed a link would let the fixer's own leftovers pass as clean.
// ---------------------------------------------------------------------------------------------

test("repo-path links: one `../` roots at docs/, two roots at the repo — the measured depth rule", () => {
  // Not a guess. Across all 230 occurrences the depths are perfectly separated: 46 at one `../` land
  // in docs' own children (research / guidelines / design / open-questions.md) and 184 at two land in
  // repo-root children (packages / stories / apps / web / .gitmodules). A decision file lived at
  // `docs/decisions/NNNN-slug.md`, which is exactly what makes that separation the base rule.
  assert.equal(rootedRepoPath("../research/x.md"), "docs/research/x.md");
  assert.equal(rootedRepoPath("../../packages/orchestrator/src/prove-it-gate.ts"), "packages/orchestrator/src/prove-it-gate.ts");
  assert.equal(rootedRepoPath("../../.gitmodules"), ".gitmodules");
  assert.equal(rootedRepoPath("../guidelines/"), "docs/guidelines/", "a directory target keeps its slash");
  // Depth 3+ does not occur; it roots rather than walking out of the repo, which has no meaning.
  assert.equal(rootedRepoPath("../../../packages/x.ts"), "packages/x.ts");
});

test("repo-path links: text that already IS the address de-links to the text alone", () => {
  const body = "see [`docs/research/agentic-foundation-survey.md`](../research/agentic-foundation-survey.md) for it";
  assert.equal(findRepoPathLinks(body).length, 1);
  assert.equal(
    delinkRepoPathLinks(body),
    "see `docs/research/agentic-foundation-survey.md` for it",
    "the address is already in the words, so de-linking loses nothing",
  );
});

test("repo-path links: text that names the target another way keeps the words AND gains the path", () => {
  // The case that separates de-linking from deleting. Dropping the target here would erase a
  // pointer: `agent-library-interaction` alone does not say where to look.
  const cases: [string, string][] = [
    [
      "[`agent-library-interaction`](../research/agent-library-interaction.md)",
      "`agent-library-interaction` (`docs/research/agent-library-interaction.md`)",
    ],
    ["[§5](../open-questions.md)", "§5 (`docs/open-questions.md`)"],
    [
      "[test-command-registry.ts](../../packages/orchestrator/src/test-command-registry.ts)",
      "test-command-registry.ts (`packages/orchestrator/src/test-command-registry.ts`)",
    ],
    ["[`web/`](../../.gitmodules)", "`web/` (`.gitmodules`)"],
  ];
  for (const [body, expected] of cases) {
    assert.equal(findRepoPathLinks(body).length, 1, body);
    assert.equal(delinkRepoPathLinks(body), expected, body);
  }
});

test("repo-path links: a DEAD target is de-linked exactly like a live one", () => {
  // The whole finding of increment 09. `apps/studio/data/knowledge.json` was deleted by ADR-0302 D1
  // and `packages/orchestrator/src/prove-it-gate.ts` exists — and it makes NO difference, because
  // both links resolved from `docs/decisions/`, which is gone. Whether the target survives has no
  // bearing on whether the LINK works; none of them work. That is what collapses what looked like 96
  // per-target judgments into one rule.
  //
  // The dead PATH is left standing as prose deliberately: a body sentence naming a since-deleted
  // file is describing what was true when the decision was made, and whether it has been overtaken
  // is a per-body judgment for the librarian, not something a bulk rewrite may decide.
  assert.equal(
    delinkRepoPathLinks("[`edit-first-curation`](../../apps/studio/data/knowledge.json)"),
    "`edit-first-curation` (`apps/studio/data/knowledge.json`)",
  );
});

test("repo-path links: a DECISION-file link is NOT this finder's, in either direction", () => {
  // The two classes share one body and must not both claim a link: `../0139-x.md` gets the number
  // promoted, not a path appended. They are mutually exclusive BY CONSTRUCTION rather than by call
  // order, so neither depends on running first and a body may be scanned by either alone.
  const body = "see [ADR-0139](../0139-the-rule.md) and [`SceneView`](../../packages/app-surface/src/SceneView.tsx)";
  assert.equal(findRepoPathLinks(body).length, 1, "only the repo path is this finder's");
  assert.equal(findRepoPathLinks(body)[0]?.target, "../../packages/app-surface/src/SceneView.tsx");
  assert.equal(findDecisionFileLinks(body).length, 1, "only the decision file is that finder's");

  // Either order, same result — which is what "by construction" has to mean.
  assert.equal(
    delinkDecisionFileLinks(delinkRepoPathLinks(body)),
    delinkRepoPathLinks(delinkDecisionFileLinks(body)),
  );
  assert.equal(
    delinkRepoPathLinks(delinkDecisionFileLinks(body)),
    "see ADR-0139 and `SceneView` (`packages/app-surface/src/SceneView.tsx`)",
  );
});

test("repo-path links: an ABSOLUTE url is untouched, and always was", () => {
  // 28 of these sit in decision bodies. A URL resolves the same from a row as from a file, so it is
  // not this class and must not be swept up by a pattern that only meant to catch `../`.
  const body = "see [the PR](https://github.com/storytree-ai/Storytree/pull/1022) and [redblobgames](https://www.redblobgames.com/blog/x/)";
  assert.equal(findRepoPathLinks(body).length, 0);
  assert.equal(delinkRepoPathLinks(body), body);
});

test("repo-path links: the rewrite is IDEMPOTENT, which is what makes the migration re-runnable", () => {
  const body = "a [`SceneView`](../../packages/app-surface/src/SceneView.tsx) b [x](../research/y.md) c";
  const once = delinkRepoPathLinks(body);
  assert.equal(findRepoPathLinks(once).length, 0, "the output contains no match");
  assert.equal(delinkRepoPathLinks(once), once, "so a second pass is a no-op");
});

test("repo-path links: NO WORDS ARE LOST — every link's text survives verbatim", () => {
  // The one failure a bulk body rewrite could cause that a reader would not spot. Length proves
  // nothing here (a body legitimately SHRINKS when the text already is the address), so the
  // invariant is stated on the words themselves — the same guard the one-shot migration ran per row.
  const bodies = [
    "[`docs/guidelines/`](../guidelines/)",
    "[§9](../open-questions.md)",
    "[`SemanticGrowthWorldView`](../../packages/app-surface/src/SemanticGrowthWorldView.tsx)",
    "[TreeView.tsx:4891](../../apps/studio/src/components/TreeView.tsx)",
  ];
  for (const body of bodies) {
    const links = findRepoPathLinks(body);
    assert.equal(links.length, 1, body);
    const out = delinkRepoPathLinks(body);
    assert.ok(out.includes(links[0]?.text.trim() ?? ""), `text lost from ${body}`);
    assert.ok(!out.includes("]("), `${body} still carries a link`);
  }
});

test("repo-path links: delinkedRepoPathText is the same function the body rewrite uses", () => {
  // The finder/fixer pairing this file exists to hold, one level down: the per-link function and the
  // whole-body replace must not be able to disagree, or a link the body pass rendered one way would
  // be reported another way by the rung.
  const link = { text: "`x`", target: "../research/y.md", raw: "[`x`](../research/y.md)" };
  assert.equal(delinkedRepoPathText(link), delinkRepoPathLinks(link.raw));
});
