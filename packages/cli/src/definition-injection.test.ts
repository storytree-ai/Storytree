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
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_MATCHES,
  matchDefinitions,
  renderInjection,
  buildInjection,
  selectDefinitions,
  isOperatorPrompt,
  injectedStatePath,
  type DefinitionDoc,
} from "../definition-injection.mjs";
import { nodeExecutable } from "./node-executable.js";

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
  const res = spawnSync(nodeExecutable(), [SCRIPT], {
    input: JSON.stringify({ prompt: "what does a verdict prove?" }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /- verdict: /, "the verdict definition's oneLine is injected");
  assert.match(res.stdout, /storytree library artifact <id>/, "pull pointer present");
});

test("entry: malformed stdin ⇒ exit 0, empty stdout (fail-safe hook contract)", () => {
  const res = spawnSync(nodeExecutable(), [SCRIPT], {
    input: "not json {{{",
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});

test("entry: no-match prompt ⇒ exit 0, empty stdout (most prompts pay zero)", () => {
  const res = spawnSync(nodeExecutable(), [SCRIPT], {
    input: JSON.stringify({ prompt: "zzz qqq nothing matches here" }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "");
});

// ---------------------------------------------------------------------------
// Dedup + the machine-turn guard (ADR-0307 D4 re-homing, 2026-08-04)
//
// Both were measured over one real session before being built: 30 injections carried only 14
// distinct terms (53% repeats), and 20 of the 30 fired on background task notifications rather than
// anything the operator typed. The unit tests pin the two pure decisions; the spawn test pins that
// state actually persists across invocations, which is the part a pure test cannot show.
// ---------------------------------------------------------------------------

test("selectDefinitions: excluded ids are dropped — a session is not told the same term twice", () => {
  const prompt = "the verdict and the gate";
  const both = selectDefinitions(prompt, DEFS);
  assert.deepEqual(both.map((d) => d.id).sort(), ["gate", "verdict"]);

  const fresh = selectDefinitions(prompt, DEFS, { exclude: new Set(["verdict"]) });
  assert.deepEqual(fresh.map((d) => d.id), ["gate"], "the already-injected term is gone");

  const none = selectDefinitions(prompt, DEFS, { exclude: new Set(["verdict", "gate"]) });
  assert.deepEqual(none, [], "everything known ⇒ nothing injected");
});

test("selectDefinitions: the cap applies to FRESH terms, not to the pre-exclusion match set", () => {
  // Exclude the most-specific match; the cap must still admit `max` unseen ones rather than
  // spending a slot on a term that was filtered out.
  const prompt = "verdict proof-mode story arc gate leaf step / leaf judgment";
  const capped = selectDefinitions(prompt, DEFS, { max: 2, exclude: new Set(["verdict"]) });
  assert.equal(capped.length, 2, "still two fresh definitions, not one");
  assert.ok(!capped.some((d) => d.id === "verdict"));
});

test("isOperatorPrompt: harness-generated turns are not scanned; real prompts are", () => {
  assert.equal(isOperatorPrompt("how does a verdict work?"), true);
  assert.equal(
    isOperatorPrompt("[SYSTEM NOTIFICATION - NOT USER INPUT]\nagent finished"),
    false,
  );
  assert.equal(isOperatorPrompt("<task-notification>\n<task-id>x</task-id>"), false);
  assert.equal(isOperatorPrompt("<system-reminder>be careful</system-reminder>"), false);
  // CONSERVATIVE: the marker must lead. An operator quoting one deep in a real prompt still gets
  // definitions — dropping a genuine question is the worse failure.
  assert.equal(
    isOperatorPrompt(`${"context. ".repeat(60)}i saw a <task-notification> in the log, why?`),
    true,
  );
});

test("injectedStatePath: absent or unsafe session ids disable dedup instead of sharing a bucket", () => {
  assert.equal(injectedStatePath(undefined), null);
  assert.equal(injectedStatePath(""), null);
  assert.equal(injectedStatePath(42), null);
  // A traversal-shaped id must never steer the path.
  assert.equal(injectedStatePath("../../etc/passwd"), null);
  const ok = injectedStatePath("cli-c3c550");
  assert.ok(ok !== null && ok.endsWith("cli-c3c550.json"), "a normal session id resolves");
});

test("entry: a task notification injects nothing (it is not a prompt the operator wrote)", () => {
  const res = spawnSync(nodeExecutable(), [SCRIPT], {
    input: JSON.stringify({
      session_id: "notif-guard-test",
      prompt: "[SYSTEM NOTIFICATION - NOT USER INPUT]\nthe verdict and the story are ready",
    }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, "", "machine turns are not scanned for terms");
});

test("entry: the same term is injected once per session, and state survives the process", () => {
  // A session id unique to this run, so the temp-dir memo cannot collide with another test or run.
  // `randomUUID`, deliberately NOT a clock reading: ADR-0276 bars wall-clock in gate-tier tests, and
  // `check:test-timing` reds on `process.hrtime` even when it is only being used for uniqueness.
  const sessionId = `dedup-test-${randomUUID()}`;
  const run = (prompt: string) =>
    spawnSync(nodeExecutable(), [SCRIPT], {
      input: JSON.stringify({ session_id: sessionId, prompt }),
      encoding: "utf8",
      timeout: 30_000,
    });

  const first = run("what does a verdict prove?");
  assert.equal(first.status, 0);
  assert.match(first.stdout, /- verdict: /, "first mention injects");

  const second = run("remind me what a verdict proves");
  assert.equal(second.status, 0);
  assert.equal(second.stdout, "", "second mention injects nothing — the memo persisted");

  // A DIFFERENT session must still be told: the memo is per-session, never global.
  const other = spawnSync(nodeExecutable(), [SCRIPT], {
    input: JSON.stringify({ session_id: `${sessionId}-other`, prompt: "what does a verdict prove?" }),
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.match(other.stdout, /- verdict: /, "a fresh session starts with an empty memo");
});

test("entry: no session id ⇒ dedup disabled, injection still happens every time", () => {
  const run = () =>
    spawnSync(nodeExecutable(), [SCRIPT], {
      input: JSON.stringify({ prompt: "what does a verdict prove?" }),
      encoding: "utf8",
      timeout: 30_000,
    });
  assert.match(run().stdout, /- verdict: /);
  assert.match(run().stdout, /- verdict: /, "without a session id it degrades to the old behaviour");
});
