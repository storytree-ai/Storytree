---
id: "phase-author-seam"
tier: capability
story: agent
title: "The runtime-agnostic executor seam that only ever authors — never observes, never verdicts"
outcome: "The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS — it never observes red/green and never reports a verdict."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The PhaseAuthor seam — author-only, runtime-agnostic

**Outcome —** The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS —
it never observes red/green and never reports a verdict.

> **Proof status (honest) — `mapped`.** `phase-author.ts` is a pure type module (no runtime, no
> test of its own to count): it declares `AuthoringPhase` (`"AUTHOR_TEST" | "IMPLEMENT"`),
> `AuthorResult` (`{ ok: true } | { ok: false; error }`), and the `PhaseAuthor` interface
> (`author(phase, prompt) → Promise<AuthorResult>`). Its behaviour is proven by its two
> implementations — `ClaudeAgentAuthor` here (`sdk-author.test.ts`, 21) and `OwnedLoopAuthor` in
> drive-machinery — and by the gate that consumes it as a TYPE only
> (`prove-it-gate.ts:18`). No `healthy` — no signed verdict (ADR-0020).

This is **this story's published cross-story interface** (ADR-0010 §4). It is the pivot seam of
ADR-0030 §2: the spine hands a leaf exactly two authoring slices and must not care which runtime
answers. The seam carries the load-bearing honesty contract — a `PhaseAuthor` authors INSIDE the two
authoring phases and never runs tests to decide success; the spine observes red/green itself
(ADR-0020). It imports no other in-story capability (a root, alongside `model-runtime-seam`).

## Proof

The seam is proven through its implementations' integration tests (the two runtimes each satisfy
`author(...)` fail-closed) and by the consuming gate type-checking against it. A consumer can rebuild
against this seam alone (ADR-0010 §6 cold-rebuild guidance): hand it the seam + ADR-0030 and it can
write a runtime with no knowledge of the gate's phase machine.
