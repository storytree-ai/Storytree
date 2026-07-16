// Contract for the prompt-keyed definition injector (`packages/cli/definition-injection.mjs`) —
// the UserPromptSubmit hook that scans a submitted prompt for Library `definition` terms and
// injects the matched definitions' `oneLine` summaries (plus a pull pointer to the full body).
// Behavioural invariants:
//   - matching is word-boundary, case-insensitive, hyphen/space-equivalent, plural-tolerant —
//     a term embedded inside another word never matches;
//   - SELECTIVE, never a glossary: only prompt-matched terms, capped at MAX_MATCHES, most-specific
//     (longest) term first — a term-dense prompt cannot front-load the corpus (ADR-0023/0135);
//   - oneLine ONLY, never the whatItIs/whatItIsNot body (ADR-0156) — the full body stays pull-based
//     behind a `storytree library artifact <id>` pointer;
//   - no match ⇒ empty output (the hook injects nothing, most prompts pay zero);
//   - the entry is fail-safe: malformed stdin ⇒ exit 0, empty stdout — a hook failure must never
//     surface into the session.
// The matcher/renderer are pure (definitions injected), so the contract runs without the seed
// corpus; one spawn of the real entry proves the stdin→stdout wiring end-to-end.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_MATCHES,
  matchDefinitions,
  renderInjection,
  buildInjection,
  type DefinitionDoc,
} from "../definition-injection.mjs";

const SCRIPT = fileURLToPath(new URL("../definition-injection.mjs", import.meta.url));

function def(id: string, title: string, oneLine: string): DefinitionDoc {
  return { kind: "definition", id, title, oneLine };
}

const DEFS: DefinitionDoc[] = [
  def("verdict", "verdict", "The signed pass/fail outcome of a proof run."),
  def("proof-mode", "Proof mode", "The four ways a unit earns healthy, one rung per tier."),
  def("story", "story", "The top-level unit of work you watch grow."),
  def(
    "leaf-step-leaf-judgment",
    "leaf step / leaf judgment",
    "The leaf authors the step; the spine judges it.",
  ),
  def("arc", "Arc", "A named multi-increment thread of work."),
  def("gate", "gate", "The local green bar: typecheck + tests."),
  def("run", "run", "A single per-node execution attempt."),
  def("claim", "claim", "A session's declared hold on a story."),
];

test("matchDefinitions: word-boundary match — embedded substrings never match", () => {
  const hit = matchDefinitions("what shape is the verdict here?", DEFS);
  assert.deepEqual(
    hit.map((d) => d.id),
    ["verdict"],
  );
  // "carcass" contains "arc", "prune" contains "run" — neither is a word-boundary match.
  assert.deepEqual(matchDefinitions("prune the carcass", DEFS), []);
});

test("matchDefinitions: case-insensitive, hyphen/space-equivalent (id and title both match)", () => {
  assert.deepEqual(
    matchDefinitions("explain Proof-Mode", DEFS).map((d) => d.id),
    ["proof-mode"],
  );
  assert.deepEqual(
    matchDefinitions("explain proof mode", DEFS).map((d) => d.id),
    ["proof-mode"],
  );
});

test("matchDefinitions: plural-tolerant (s and y→ies)", () => {
  assert.deepEqual(
    matchDefinitions("compare the verdicts", DEFS).map((d) => d.id),
    ["verdict"],
  );
  assert.deepEqual(
    matchDefinitions("across many stories", DEFS).map((d) => d.id),
    ["story"],
  );
});

test("matchDefinitions: a slash-separated title matches on each part", () => {
  assert.deepEqual(
    matchDefinitions("who owns the leaf judgment?", DEFS).map((d) => d.id),
    ["leaf-step-leaf-judgment"],
  );
});

test("matchDefinitions: one entry per definition even when several surfaces match", () => {
  const hit = matchDefinitions("proof-mode aka Proof mode", DEFS);
  assert.deepEqual(
    hit.map((d) => d.id),
    ["proof-mode"],
  );
});

test("matchDefinitions: capped at MAX_MATCHES, most-specific (longest) term first", () => {
  const prompt =
    "the leaf judgment run hit the gate: the story claim needs a verdict on the arc in proof mode";
  const hit = matchDefinitions(prompt, DEFS);
  assert.equal(hit.length, MAX_MATCHES, `cap at ${MAX_MATCHES} of the 8 matching terms`);
  assert.ok(hit.length < DEFS.length, "a term-dense prompt must not front-load the corpus");
  const first = hit[0];
  assert.ok(first, "at least one match");
  assert.equal(first.id, "leaf-step-leaf-judgment", "longest matched term ranks first");
});

test("matchDefinitions/buildInjection: no match ⇒ empty", () => {
  assert.deepEqual(matchDefinitions("hello there", DEFS), []);
  assert.equal(buildInjection("hello there", DEFS), "");
  assert.equal(renderInjection([]), "");
});

test("renderInjection: oneLine + a pull pointer per match — never the body fields", () => {
  const doc = {
    ...def("verdict", "verdict", "The signed pass/fail outcome of a proof run."),
    whatItIs: "BODY-MUST-NOT-APPEAR",
  };
  const out = renderInjection([doc]);
  assert.match(out, /verdict: The signed pass\/fail outcome of a proof run\./);
  assert.match(out, /storytree library artifact <id>/, "one shared pull-pointer line");
  assert.ok(!out.includes("BODY-MUST-NOT-APPEAR"), "whatItIs body is never injected (ADR-0156)");
});

test("buildInjection: only kind=definition docs participate", () => {
  const docs: DefinitionDoc[] = [
    { kind: "principle", id: "verdict", title: "verdict", oneLine: "an impostor principle" },
    def("gate", "gate", "The local green bar: typecheck + tests."),
  ];
  const out = buildInjection("the verdict and the gate", docs);
  assert.ok(out.includes("gate:"), "definition matched");
  assert.ok(!out.includes("impostor"), "non-definition kinds never injected");
});

test("entry: real prompt on stdin ⇒ matched oneLine on stdout, exit 0 (real seed corpus)", () => {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt: "what does a verdict prove?" }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /- verdict: /, "the verdict definition's oneLine is injected");
  assert.match(res.stdout, /storytree library artifact <id>/, "pull pointer present");
});

test("entry: malformed stdin ⇒ exit 0, empty stdout (fail-safe hook contract)", () => {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: "not json {{{",
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});

test("entry: no-match prompt ⇒ exit 0, empty stdout (most prompts pay zero)", () => {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt: "zzz qqq nothing matches here" }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});
