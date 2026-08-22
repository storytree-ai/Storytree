import assert from "node:assert/strict";
import test from "node:test";

import {
  delinkDecisionFileLinks,
  delinkedText,
  findDecisionFileLinks,
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
