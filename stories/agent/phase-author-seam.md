---
id: "phase-author-seam"
tier: capability
story: agent
title: "The runtime-agnostic executor seam that only ever authors — never observes, never verdicts"
outcome: "The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS — it never observes red/green and never reports a verdict."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The PhaseAuthor seam — author-only, runtime-agnostic

**Outcome —** The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS —
it never observes red/green and never reports a verdict.

> **Proof status (honest) — `proposed`.** `phase-author.ts` declares `AuthoringPhase`
> (`"AUTHOR_TEST" | "IMPLEMENT"`), `LiveRuntime`, `AuthorResult`
> (`{ ok: true } | { ok: false; error; exhausted?; escalation? }`), the `PhaseAuthor` interface
> (`author(phase, prompt) → Promise<AuthorResult>`), and — since contract
> [`authoring-escalation-shape`](authoring-escalation-shape.md) (signed PASS, run `real-mu1lbfen`) —
> its first runtime value: the pure `parseAuthoringEscalation` validator, with a test of its own. The
> rest of its behaviour is proven by its implementations — `ClaudeAgentAuthor` (`sdk-author.test.ts`),
> `CodexPhaseAuthor` (`codex-author.test.ts`), `PiPhaseAuthor` (`pi-author.ts`), and `OwnedLoopAuthor`
> in drive-machinery — and by the gate that consumes it as a TYPE only (`prove-it-gate.ts:18`). The
> capability carries no verdict of its own (ADR-0020); the one signed verdict here is its contract's,
> one grain down.

This is **this story's published cross-story interface** (ADR-0010 §4). It is the pivot seam of
ADR-0030 §2: the spine hands a leaf exactly two authoring slices and must not care which runtime
answers. ADR-0555 makes `CodexPhaseAuthor` the omitted-runtime default, while `--runtime claude`
selects `ClaudeAgentAuthor` explicitly; neither selection changes the seam. The seam carries the
load-bearing honesty contract — a
`PhaseAuthor` authors INSIDE the two authoring phases and never decides proof success; the
deterministic spine alone observes red/green and issues the verdict (ADR-0020). It imports no other
in-story capability (a root, alongside `model-runtime-seam`).

## Escalation (ADR-0569)

A leaf that concludes the contract cannot be tested as specified, or that the test it was handed
cannot be satisfied as written, used to have no move but to fail, and that failure read exactly like
bad work. ADR-0569 D1 gives the seam a typed alternative, built by contract
[`authoring-escalation-shape`](authoring-escalation-shape.md):

- `AuthorResult`'s failure branch gains an optional `escalation?: AuthoringEscalation`, bound to the
  phase that raised it — AUTHOR_TEST: `{ phase, kind: "untestable-contract", statement }`;
  IMPLEMENT: `{ phase, kind: "unsatisfiable-test", statement, assertion }`;
- `parseAuthoringEscalation(phase, input)` is the only way a leaf builds one. It is pure, derives the
  kind from the phase and never reads it from input, requires non-blank trimmed text, and refuses an
  IMPLEMENT escalation that does not quote the assertion it cannot satisfy. A present but malformed
  `assertion` is refused in either phase; a well-formed one on AUTHOR_TEST is dropped. The package
  barrel publishes the validator and the type.

An escalation's authority is the authority an authoring error already has, now typed: it can end a
walk without a verdict, and it can never advance a phase, produce a verdict, or enter evidence
(ADR-0569 D2). What the spine does with one belongs to `drive-machinery` (contract
`gate-routes-authoring-escalation`). Which leaf can raise one belongs to each runtime: only
`ClaudeAgentAuthor` gets a channel (contract [`sdk-leaf-escalate-tool`](sdk-leaf-escalate-tool.md),
ADR-0569 D6), and `CodexPhaseAuthor`, `PiPhaseAuthor` and the owned loop never return one.

**The agent story's buildable set is unchanged.** This capability stays out of the story's
`capabilities:` list. The validator's red→green is carried one grain down, by the contract node's own
`real:` arm; the capability itself still carries none, so listing it would still make
`isStoryBuildable` return false for the whole story (ADR-0057).

## Proof

The seam is proven through its implementations' integration tests (each concrete author satisfies
`author(...)` fail-closed) and by the consuming gate type-checking against it. A consumer can rebuild
against this seam alone (ADR-0010 §6 cold-rebuild guidance): hand it the seam + ADR-0030 and it can
write a runtime with no knowledge of the gate's phase machine. The escalation validator is proven
directly by its contract's own test, `packages/agent/src/phase-author.test.ts` (signed PASS, run
`real-mu1lbfen`).
