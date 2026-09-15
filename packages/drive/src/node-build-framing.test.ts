// A refused build's honest framing stops claiming a signed verdict persisted
// (`verification-integrity-arc`, increment `refused-build-framing-stops-claiming-a-signature`).
//
// THE MEASURED FAILURE. Run `real-mtsqwotf` printed `verdict: NONE — failed closed at CONFIRM_GREEN`
// and then, in the same envelope, "What DID persist: the signed verdict — events.verdict". The
// framing read `persisted`, which says where a verdict WOULD go — `true` for every `--store pg`
// build — and never whether the gate signed one. `--real` always persists (ADR-0060/0081), so every
// refused real build told its reader that a signature existed.
//
// WHY THE RENDERERS ARE CALLED DIRECTLY. `nodeBuild`'s `--real` and `--live` arms cannot be reached
// offline: `NodeBuildOpts` has no author seam, by design (ADR-0243 D4). So `nodeBuild` hands its
// `ProveResult` to these two renderers as an identifier, and every decision about the outcome is
// made inside them, where a test can see it.
//
// Proof: pnpm --filter @storytree/drive exec bun test --preload ../../scripts/tsx-cache-off.mjs src/node-build-framing.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";

import { honestFramingLive, honestFramingReal } from "./node-build.js";

const REFUSED = { ok: false };
const SIGNED = { ok: true };
const PERSISTED = true;
const IN_MEMORY = false;

test("a REFUSED real build on the shared store claims no signed verdict, and says none was signed", () => {
  const framing = honestFramingReal(PERSISTED, REFUSED, undefined, undefined, undefined, "codex");
  assert.doesNotMatch(framing, /signed verdict/, framing);
  assert.doesNotMatch(framing, /What DID persist/, framing);
  assert.match(framing, /No verdict was signed/, framing);
});

test("a SIGNED real build on the shared store still names the signed verdict that persisted", () => {
  const framing = honestFramingReal(PERSISTED, SIGNED, undefined, "green", "green", "codex");
  assert.match(framing, /What DID persist: the signed verdict — events\.verdict in the shared store/, framing);
});

test("a REFUSED real build in memory does not say a verdict landed there", () => {
  const framing = honestFramingReal(IN_MEMORY, REFUSED, undefined, undefined, undefined, "claude");
  assert.doesNotMatch(framing, /the verdict\s+landed/, framing);
  assert.match(framing, /No verdict was signed/, framing);
});

test("a real build refused by its backstop does not say the verdict was signed after the suite ran", () => {
  const framing = honestFramingReal(PERSISTED, REFUSED, undefined, "red", "red", "claude");
  assert.doesNotMatch(framing.replace(/\s+/g, " "), /BEFORE the verdict was signed/, framing);
});

test("a REFUSED live smoke claims no persisted verdict, on either store", () => {
  for (const persisted of [PERSISTED, IN_MEMORY]) {
    const framing = honestFramingLive(persisted, REFUSED, "codex", "library-cli");
    assert.doesNotMatch(framing, /signed verdict PERSISTED/, framing);
    assert.doesNotMatch(framing, /the verdict landed/, framing);
    assert.match(framing, /no verdict was signed/, framing);
  }
});

test("a SIGNED live smoke on the shared store still says its signed verdict persisted", () => {
  const framing = honestFramingLive(PERSISTED, SIGNED, "codex", "library-cli");
  assert.match(framing, /the signed verdict PERSISTED to the shared store/, framing);
});

// ---------- the whole framing, pinned per shape ----------
//
// A framing is prose, so `check:mutation-diff` charges every changed literal in it as its own
// mutant, and a probe such as `assert.match(framing, /No verdict was signed/)` kills only the words
// it quotes. So each shape is pinned whole. That is deliberately brittle: changing this wording is
// meant to fail HERE, where the change gets read. Each expected string was captured from the
// renderers and read for truth before it was pinned.

const PROMOTED = {
  branch: "claude/real/verdict-line-real-fixture",
  commitSha: "0123456789abcdef0123",
  pushed: true,
  detail: "pushed to origin",
};

const GOLDENS = [
  {
    name: "real, REFUSED on the shared store, no backstop",
    render: () => honestFramingReal(PERSISTED, REFUSED, undefined, undefined, undefined, "codex"),
    expected:
      "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\nnode's REAL test/impl files at their real repo paths authored by the ChatGPT-subscription Codex leaf via exact replica promotion,\nthe node's declared REAL proof command run by the spine for\nboth red and green, a spine-side commit of the authored files, and a GATE that read genuine\n`git status` off that worktree. the authored commit was not promoted (see the promotion line above); and only the\nnode's registered proof command ran (not the full package suite — no-install worktree,\nbuiltins-only target).\nNo verdict was signed: the shared store holds only this run's own events (its building mark, and any claim,\nusage and write-fence rows it wrote), never a verdict.",
  },
  {
    name: "real, REFUSED on the shared store by a red backstop",
    render: () => honestFramingReal(PERSISTED, REFUSED, undefined, "red", "red", "claude"),
    expected:
      "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\nnode's REAL test/impl files at their real repo paths authored by the Claude Agent SDK leaf under hook-enforced write scope,\nthe node's declared REAL proof command run by the spine for\nboth red and green, a spine-side commit of the authored files, and a GATE that read genuine\n`git status` off that worktree. the authored commit was not promoted (see the promotion line above); and the node's proof command ran AND the package regression suite was observed RED\nand the package typecheck RED in the installed worktree — both BEFORE the gate\nruled, so no signed PASS can out-run them (the proof run is tsx-driven — types stripped — so\nonly the typecheck sees type-illegal code).\nNo verdict was signed: the shared store holds only this run's own events (its building mark, and any claim,\nusage and write-fence rows it wrote), never a verdict.",
  },
  {
    name: "real, SIGNED on the shared store, promoted, both backstops green",
    render: () => honestFramingReal(PERSISTED, SIGNED, PROMOTED, "green", "green", "codex"),
    expected:
      "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\nnode's REAL test/impl files at their real repo paths authored by the ChatGPT-subscription Codex leaf via exact replica promotion,\nthe node's declared REAL proof command run by the spine for\nboth red and green, a spine-side commit of the authored files, and a GATE that read genuine\n`git status` off that worktree. the authored commit is PARKED on claude/real/verdict-line-real-fixture\n(landing rides the PR/CI gate — merge NON-SQUASH so the verdict's commit stays an ancestor of main); and the node's proof command ran AND the package regression suite was observed GREEN\nand the package typecheck GREEN in the installed worktree — both BEFORE the gate\nruled, so no signed PASS can out-run them (the proof run is tsx-driven — types stripped — so\nonly the typecheck sees type-illegal code).\nWhat DID persist: the signed verdict — events.verdict in the shared store (the rollup can\nderive from it across sessions).",
  },
  {
    name: "real, SIGNED in memory, suite only",
    render: () => honestFramingReal(IN_MEMORY, SIGNED, undefined, "green", undefined, "claude"),
    expected:
      "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\nnode's REAL test/impl files at their real repo paths authored by the Claude Agent SDK leaf under hook-enforced write scope,\nthe node's declared REAL proof command run by the spine for\nboth red and green, a spine-side commit of the authored files, and a GATE that read genuine\n`git status` off that worktree. the authored commit was not promoted (see the promotion line above); the verdict\nlanded in an in-memory store and is gone; and the node's proof command ran AND the package regression suite was observed GREEN\nin the installed worktree BEFORE the gate ruled.",
  },
  {
    name: "real, REFUSED in memory",
    render: () => honestFramingReal(IN_MEMORY, REFUSED, undefined, undefined, undefined, "claude"),
    expected:
      "honest framing: a REAL build (ADR-0031). What was real: a fresh git worktree of THIS repo, the\nnode's REAL test/impl files at their real repo paths authored by the Claude Agent SDK leaf under hook-enforced write scope,\nthe node's declared REAL proof command run by the spine for\nboth red and green, a spine-side commit of the authored files, and a GATE that read genuine\n`git status` off that worktree. the authored commit was not promoted (see the promotion line above); and only the\nnode's registered proof command ran (not the full package suite — no-install worktree,\nbuiltins-only target).\nNo verdict was signed: this run's own events landed in an in-memory store and are gone.",
  },
  {
    name: "live, REFUSED in memory",
    render: () => honestFramingLive(IN_MEMORY, REFUSED, "codex", "library-cli"),
    expected:
      "honest framing: a live smoke proves the LIVE LOOP through the gate — the Codex CLI with saved ChatGPT subscription authentication\n(ADR-0030/0232) genuinely authored the test and impl under phase-enforced write\nscope, and the spine observed the genuine red→green those writes caused. The TASK is still the synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\nThe node's authored status is untouched; no verdict was signed, and this run's own events landed in an in-memory store and are gone.",
  },
  {
    name: "live, REFUSED on the shared store",
    render: () => honestFramingLive(PERSISTED, REFUSED, "claude", "library-cli"),
    expected:
      "honest framing: a live smoke proves the LIVE LOOP through the gate — the Claude Agent SDK with subscription authentication\n(ADR-0030/0232) genuinely authored the test and impl under phase-enforced write\nscope, and the spine observed the genuine red→green those writes caused. The TASK is still the synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\nThe node's authored status is untouched; no verdict was signed, and the shared store holds only this run's own events (its building mark, and any claim,\nusage and write-fence rows it wrote), never a verdict.",
  },
  {
    name: "live, SIGNED on the shared store",
    render: () => honestFramingLive(PERSISTED, SIGNED, "codex", "library-cli"),
    expected:
      "honest framing: a live smoke proves the LIVE LOOP through the gate — the Codex CLI with saved ChatGPT subscription authentication\n(ADR-0030/0232) genuinely authored the test and impl under phase-enforced write\nscope, and the spine observed the genuine red→green those writes caused. The TASK is still the synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\nThe node's authored status is untouched; the signed verdict PERSISTED to the shared store (events.verdict — the rollup can derive from it across sessions).",
  },
  {
    name: "live, SIGNED in memory",
    render: () => honestFramingLive(IN_MEMORY, SIGNED, "claude", "library-cli"),
    expected:
      "honest framing: a live smoke proves the LIVE LOOP through the gate — the Claude Agent SDK with subscription authentication\n(ADR-0030/0232) genuinely authored the test and impl under phase-enforced write\nscope, and the spine observed the genuine red→green those writes caused. The TASK is still the synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\nThe node's authored status is untouched; the verdict landed in an in-memory store and is gone.",
  },
];

for (const golden of GOLDENS) {
  test(`the framing is pinned whole: ${golden.name}`, () => {
    assert.equal(golden.render(), golden.expected);
  });
}
