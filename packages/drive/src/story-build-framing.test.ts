// A halted story build's framing states how many verdicts were signed
// (`verification-integrity-arc`, increment `story-build-framing-counts-signed-verdicts`).
//
// THE DEFECT, the chain-grain sibling of the one PR #1944 fixed for `node build`. Both story
// framings ended "The signed verdicts PERSISTED to the shared store" whenever `persisted` was true.
// `persisted` is a property of the STORE — `--real` always persists (ADR-0060/0081) — never of the
// run, and `story-build.ts` computes ONE framing and prints it on the HALTED envelope too, directly
// under `outcome: HALTED at node N/M`. So a real story build that halted at its FIRST member told
// its reader that the chain's signed verdicts were in the shared store, and one that halted at node
// k presented a signed prefix of k-1 members as the chain's verdicts.
//
// THE COUNT IS OBSERVED, NOT INFERRED FROM `haltedAt`. `StoryBuildRun.outcomes` gets one entry per
// member whose gate SIGNED: `runStoryBuild` pushes only on the `ok` arm, and that arm's `result` is
// typed `Extract<ProveResult, { ok: true }>`, so every entry holds a signed verdict. `haltedAt` is a
// POSITION, and the budget wall halts at the index of a node that never ran — so it answers "where"
// and only implies "how many". The renderers read `outcomes.length`.
//
// WHY THE RENDERERS ARE CALLED DIRECTLY. `storyBuild`'s `--real` arm cannot be reached offline, so
// it hands the run and the drive order to these renderers as bare identifiers — nothing on those
// call lines is mutable — and every decision about the chain's outcome is made inside them, where a
// test can see it (the same design PR #1944 proved for `node build`).
//
// Proof: pnpm --filter @storytree/drive exec bun test --preload ../../scripts/tsx-cache-off.mjs src/story-build-framing.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  honestFramingStoryDry,
  honestFramingStoryLive,
  honestFramingStoryReal,
} from "./story-build.js";

const PERSISTED = true;
const IN_MEMORY = false;

/**
 * The three admitted live leaves. CODEX IS THE DEFAULT (`resolveLiveRuntime` — a bare
 * `story build --live` runs it), which is why naming the wrong one was a defect on the ordinary
 * path rather than an opt-in one. `--real` refuses pi (ADR-0449 authorised a live trial, not a
 * promotion path), so the real framing's leaf clause has two reachable arms and the live one has
 * three.
 */
const CLAUDE = "claude" as const;
const CODEX = "codex" as const;
const PI = "pi" as const;

/** Three members were driven; the run is what says how many of them signed. */
const MEMBERS = [{ id: "a" }, { id: "b" }, { id: "c" }];

/** Halted at the FIRST member: nothing signed, so no verdict exists to have persisted. */
const SIGNED_NONE = { outcomes: [] };
/** Halted at the third: a two-member PREFIX signed, which is not the chain. */
const SIGNED_PREFIX = { outcomes: [{ unitId: "a" }, { unitId: "b" }] };
/** Every member signed. */
const SIGNED_ALL = { outcomes: [{ unitId: "a" }, { unitId: "b" }, { unitId: "c" }] };

// ---------- the chain's verdict fate follows the RUN, not the store ----------

test("a real story build halted at its FIRST member claims no signed verdict on the shared store", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_NONE, MEMBERS, undefined, CLAUDE);
  assert.doesNotMatch(framing, /signed verdicts PERSISTED/, framing);
  assert.match(framing, /No member verdict was signed/, framing);
});

test("a real story build halted at its FIRST member in memory does not say verdicts landed there", () => {
  const framing = honestFramingStoryReal(IN_MEMORY, SIGNED_NONE, MEMBERS, undefined, CLAUDE);
  assert.doesNotMatch(framing, /verdicts landed in an in-memory store/, framing);
  assert.match(framing, /No member verdict was signed/, framing);
});

test("a real story build halted LATER names the proven prefix and its size, never the chain", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_PREFIX, MEMBERS, undefined, CLAUDE);
  assert.match(framing, /2 of 3 members signed/, framing);
  assert.match(framing, /PROVEN PREFIX/, framing);
  assert.doesNotMatch(framing, /^The signed verdicts PERSISTED/m, framing);
});

test("a PASSED real story build still says every member verdict was signed and persisted", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_ALL, MEMBERS, undefined, CLAUDE);
  assert.match(framing, /All 3 member verdicts were signed and PERSISTED to the shared store/, framing);
});

test("a live story build halted at its FIRST member claims no signed verdict, on either store", () => {
  for (const persisted of [PERSISTED, IN_MEMORY]) {
    const framing = honestFramingStoryLive(persisted, SIGNED_NONE, MEMBERS, CLAUDE);
    assert.doesNotMatch(framing, /signed verdicts PERSISTED/, framing);
    assert.doesNotMatch(framing, /verdicts landed in an\s+in-memory store/, framing);
    assert.match(framing, /No member verdict was signed/, framing);
  }
});

test("a PASSED live story build still says its signed verdicts persisted", () => {
  const framing = honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CLAUDE);
  assert.match(framing, /All 3 member verdicts were signed and PERSISTED to the shared store/, framing);
});

test("a dry-run halted at its FIRST member does not say its verdicts landed in an in-memory store", () => {
  const framing = honestFramingStoryDry(SIGNED_NONE, MEMBERS);
  assert.doesNotMatch(framing, /the verdicts landed\s+in an in-memory store/, framing);
  assert.match(framing, /No member verdict was signed/, framing);
});

// ---------- the WALK narration follows the run too ----------
//
// The real framing opened in the PAST tense — "Each node was driven through the FULL prove-it-gate
// for real ... the spine observed the genuine red→green and committed the authored files" — a few
// lines under `outcome: HALTED at node 1/3`, where no node completed the gate and nothing was
// committed. The mode description is now present-tense (what a real story build DOES) and the
// past-tense claim is made only about members that actually signed.

test("a real story build that signed nothing does not narrate an observed red→green", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_NONE, MEMBERS, undefined, CLAUDE);
  assert.doesNotMatch(framing, /the spine observed the genuine red→green/, framing);
  assert.match(framing, /NO member completed that gate/, framing);
});

test("a real story build that signed members still narrates the observed red→green", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_PREFIX, MEMBERS, undefined, CLAUDE);
  assert.match(framing, /the spine observed the genuine red→green/, framing);
  assert.doesNotMatch(framing, /NO member completed that gate/, framing);
});

// ---------- the framing names the leaf that actually ran ----------
//
// (`verification-integrity-arc`, increment `story-live-framing-names-the-runtime-that-ran`.)
//
// Both story framings described the leaf as a LITERAL — "a REAL Claude Agent SDK leaf per node"
// (live) and "under hook-enforced write scope" (real, the `PreToolUse` hook that is Claude's
// mechanism and no other's). `story build` takes `--runtime claude|codex|pi`, and
// `resolveLiveRuntime` DEFAULTS TO CODEX, so a bare `story build --live` ran the Codex CLI and its
// honest framing named the Claude Agent SDK — contradicting the `runtime:     codex` line printed a
// few lines above it in the SAME envelope. `node build`'s framings already select the leaf clause
// from `runtime`; these now do the same.

test("a live story build on the DEFAULT leaf does not claim the Claude Agent SDK ran", () => {
  const framing = honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CODEX);
  assert.doesNotMatch(framing, /Claude Agent SDK/, framing);
  assert.match(framing, /Codex CLI/, framing);
});

test("a live story build on pi names pi's own fence, not a hook-held write wall", () => {
  const framing = honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, PI);
  assert.doesNotMatch(framing, /Claude Agent SDK/, framing);
  assert.match(framing, /pi agent loop/, framing);
});

test("a live story build on the Claude leaf still names it", () => {
  const framing = honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CLAUDE);
  assert.match(framing, /Claude Agent SDK/, framing);
  assert.doesNotMatch(framing, /Codex CLI/, framing);
});

test("each live leaf clause cites the decision that admitted THAT leaf", () => {
  assert.match(honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CLAUDE), /ADR-0030/);
  assert.match(honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CODEX), /ADR-0232/);
  assert.match(honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, PI), /ADR-0449/);
});

test("a real story build on the DEFAULT leaf does not claim a hook held its write scope", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_ALL, MEMBERS, undefined, CODEX);
  assert.doesNotMatch(framing, /hook/i, framing);
  assert.match(framing, /Codex leaf/, framing);
});

test("a real story build on the Claude leaf still names its hook-held write scope", () => {
  const framing = honestFramingStoryReal(PERSISTED, SIGNED_ALL, MEMBERS, undefined, CLAUDE);
  assert.match(framing, /hook/i, framing);
  assert.doesNotMatch(framing, /Codex leaf/, framing);
});

// A chain that signed NOTHING narrates no leaf at all — there is no authoring to attribute — so the
// leaf clause must not leak into the halted-at-first shape whatever the runtime was.
test("a real story build that signed nothing attributes authoring to no leaf", () => {
  for (const runtime of [CLAUDE, CODEX]) {
    const framing = honestFramingStoryReal(PERSISTED, SIGNED_NONE, MEMBERS, undefined, runtime);
    assert.doesNotMatch(framing, /Claude Agent SDK|Codex leaf/, framing);
    assert.match(framing, /NO member completed that gate/, framing);
  }
});

// ---------- the whole framing, pinned per shape ----------
//
// A framing is prose, so `check:mutation-diff` charges every changed literal in it as its own
// mutant, and a probe such as `assert.match(framing, /PROVEN PREFIX/)` kills only the words it
// quotes. So each shape is pinned whole. That is deliberately brittle: changing this wording is
// meant to fail HERE, where the change gets read. Each expected string was captured from the
// renderers and read for truth before it was pinned.

const PUSHED = {
  branch: "claude/real/story-chain-fixture",
  commitSha: "0123456789abcdef0123",
  pushed: true,
  detail: "pushed to origin",
};
const LOCAL_ONLY = {
  branch: "claude/real/story-chain-fixture",
  commitSha: "0123456789abcdef0123",
  pushed: false,
  detail: "the chain halted",
};

const GOLDENS = [
  {
    name: "real, HALTED AT THE FIRST member, shared store, nothing promoted",
    render: () => honestFramingStoryReal(PERSISTED, SIGNED_NONE, MEMBERS, undefined, CLAUDE),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nNO member completed that gate: no node's red→green was ever observed and nothing was\ncommitted; nothing was promoted (see the promotion line above).\nNo member verdict was signed: the shared store holds only this run's own events (its building\nmarks, and any claim, usage and write-fence rows it wrote), never a verdict.",
  },
  {
    name: "real, HALTED LATER — a 2-of-3 prefix signed — shared store, parked local-only, claude leaf",
    render: () => honestFramingStoryReal(PERSISTED, SIGNED_PREFIX, MEMBERS, LOCAL_ONLY, CLAUDE),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nEach member that SIGNED completed it for real — the leaf authored its REAL test/impl at their\nreal repo paths, the spine observed the genuine red→green, and the spine committed the authored\nfiles; the proven chain is PARKED LOCAL-ONLY on claude/real/story-chain-fixture (not pushed — the chain halted);\na partial/halted or backstop-red chain is preserved for forensics, never offered as a landing candidate.\nThat leaf was the Claude Agent SDK leaf, under a fail-closed PreToolUse\nwrite hook.\n2 of 3 members signed before the chain halted; that PROVEN PREFIX persisted to the\nshared store (events.verdict — the rollup derives each node's status across sessions). A prefix is\nnever the chain.",
  },
  {
    name: "real, HALTED AT THE FIRST member, in memory, nothing promoted",
    render: () => honestFramingStoryReal(IN_MEMORY, SIGNED_NONE, MEMBERS, undefined, CLAUDE),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nNO member completed that gate: no node's red→green was ever observed and nothing was\ncommitted; nothing was promoted (see the promotion line above).\nNo member verdict was signed: this run's own events landed in an in-memory store and are gone.",
  },
  {
    name: "real, HALTED LATER — a 2-of-3 prefix signed — in memory, CODEX leaf",
    render: () => honestFramingStoryReal(IN_MEMORY, SIGNED_PREFIX, MEMBERS, undefined, CODEX),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nEach member that SIGNED completed it for real — the leaf authored its REAL test/impl at their\nreal repo paths, the spine observed the genuine red→green, and the spine committed the authored\nfiles; nothing was promoted (see the promotion line above).\nThat leaf was the ChatGPT-subscription Codex leaf, authoring in a\ndisposable replica the spine promoted the exact phase manifest from.\n2 of 3 members signed before the chain halted; that PROVEN PREFIX landed in an\nin-memory store and is gone. A prefix is never the chain.",
  },
  {
    name: "real, PASSED, shared store, pushed, CODEX leaf (the default)",
    render: () => honestFramingStoryReal(PERSISTED, SIGNED_ALL, MEMBERS, PUSHED, CODEX),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nEach member that SIGNED completed it for real — the leaf authored its REAL test/impl at their\nreal repo paths, the spine observed the genuine red→green, and the spine committed the authored\nfiles; the whole proven chain is PARKED on claude/real/story-chain-fixture and pushed — land it via ONE\nNON-SQUASH PR (every node's verdict commit must stay an ancestor of main, ADR-0031).\nThat leaf was the ChatGPT-subscription Codex leaf, authoring in a\ndisposable replica the spine promoted the exact phase manifest from.\nAll 3 member verdicts were signed and PERSISTED to the shared store (events.verdict — the\nrollup derives each node's status across sessions).",
  },
  {
    name: "real, PASSED, in memory, nothing promoted, claude leaf",
    render: () => honestFramingStoryReal(IN_MEMORY, SIGNED_ALL, MEMBERS, undefined, CLAUDE),
    expected:
      "honest framing: a REAL story build (ADR-0057 §3 expansion D). Each node is driven through the\nFULL prove-it-gate for real, in ONE shared worktree in dependency order, so each node builds on\nthe committed result of the nodes before it (the story grows). Halt-is-never-a-pass holds: a node\nfailing closed halts the chain and later nodes never run.\nEach member that SIGNED completed it for real — the leaf authored its REAL test/impl at their\nreal repo paths, the spine observed the genuine red→green, and the spine committed the authored\nfiles; nothing was promoted (see the promotion line above).\nThat leaf was the Claude Agent SDK leaf, under a fail-closed PreToolUse\nwrite hook.\nAll 3 member verdicts were signed; they landed in an in-memory store and are gone.",
  },
  {
    name: "live, HALTED AT THE FIRST member, shared store, CODEX leaf (the default)",
    render: () => honestFramingStoryLive(PERSISTED, SIGNED_NONE, MEMBERS, CODEX),
    expected:
      "honest framing: a live story build proves the CHAIN with a REAL subscription leaf per node —\nthe Codex CLI on saved ChatGPT subscription authentication (ADR-0232/0555, the DEFAULT leaf),\nauthoring in a disposable replica the spine promotes the exact phase manifest from.\nNo USD ceiling by default; the turn cap is the brake (ADR-0130). Genuine authoring and\nspine-observed red→green per node. The TASK per node is still the synthetic add(2,3) pair in a\ntemp workspace (`node build --real` is the per-node real path; chaining REAL builds is later\nwork). Authored statuses are untouched.\nNo member verdict was signed: the shared store holds only this run's own events (its building\nmarks, and any claim, usage and write-fence rows it wrote), never a verdict.",
  },
  {
    name: "live, HALTED AT THE FIRST member, in memory, claude leaf",
    render: () => honestFramingStoryLive(IN_MEMORY, SIGNED_NONE, MEMBERS, CLAUDE),
    expected:
      "honest framing: a live story build proves the CHAIN with a REAL subscription leaf per node —\nthe Claude Agent SDK on subscription authentication (ADR-0030), under a fail-closed PreToolUse\nwrite hook.\nNo USD ceiling by default; the turn cap is the brake (ADR-0130). Genuine authoring and\nspine-observed red→green per node. The TASK per node is still the synthetic add(2,3) pair in a\ntemp workspace (`node build --real` is the per-node real path; chaining REAL builds is later\nwork). Authored statuses are untouched.\nNo member verdict was signed: this run's own events landed in an in-memory store and are gone.",
  },
  {
    name: "live, PASSED, shared store, CODEX leaf (the default)",
    render: () => honestFramingStoryLive(PERSISTED, SIGNED_ALL, MEMBERS, CODEX),
    expected:
      "honest framing: a live story build proves the CHAIN with a REAL subscription leaf per node —\nthe Codex CLI on saved ChatGPT subscription authentication (ADR-0232/0555, the DEFAULT leaf),\nauthoring in a disposable replica the spine promotes the exact phase manifest from.\nNo USD ceiling by default; the turn cap is the brake (ADR-0130). Genuine authoring and\nspine-observed red→green per node. The TASK per node is still the synthetic add(2,3) pair in a\ntemp workspace (`node build --real` is the per-node real path; chaining REAL builds is later\nwork). Authored statuses are untouched.\nAll 3 member verdicts were signed and PERSISTED to the shared store (events.verdict — the\nrollup derives each node's status across sessions).",
  },
  {
    name: "live, PASSED, in memory, pi leaf",
    render: () => honestFramingStoryLive(IN_MEMORY, SIGNED_ALL, MEMBERS, PI),
    expected:
      "honest framing: a live story build proves the CHAIN with a REAL subscription leaf per node —\nthe pi agent loop against Anthropic on the subscription credential (ADR-0449), under pi's\nin-process tool_call fence.\nNo USD ceiling by default; the turn cap is the brake (ADR-0130). Genuine authoring and\nspine-observed red→green per node. The TASK per node is still the synthetic add(2,3) pair in a\ntemp workspace (`node build --real` is the per-node real path; chaining REAL builds is later\nwork). Authored statuses are untouched.\nAll 3 member verdicts were signed; they landed in an in-memory store and are gone.",
  },
  {
    name: "dry-run, HALTED AT THE FIRST member",
    render: () => honestFramingStoryDry(SIGNED_NONE, MEMBERS),
    expected:
      "honest framing: a story dry-run proves the CHAINING — capabilities topo-ordered from depends_on,\neach walked through the gate, the story's UAT node last, halt-is-never-a-pass, per-node rollups\nderived from ONE event log — NOT the nodes' actual proofs: every leaf is scripted and every\nred→green synthetic in a temp workspace. Authored statuses are untouched.\nNo member verdict was signed: this run's own events landed in an in-memory store and are gone.",
  },
  {
    name: "dry-run, PASSED",
    render: () => honestFramingStoryDry(SIGNED_ALL, MEMBERS),
    expected:
      "honest framing: a story dry-run proves the CHAINING — capabilities topo-ordered from depends_on,\neach walked through the gate, the story's UAT node last, halt-is-never-a-pass, per-node rollups\nderived from ONE event log — NOT the nodes' actual proofs: every leaf is scripted and every\nred→green synthetic in a temp workspace. Authored statuses are untouched.\nAll 3 member verdicts were signed; they landed in an in-memory store and are gone.",
  },
];

for (const golden of GOLDENS) {
  test(`the framing is pinned whole: ${golden.name}`, () => {
    assert.equal(golden.render(), golden.expected);
  });
}
