---
id: "live-sdk-leaf"
tier: capability
story: agent
title: "The live Claude Agent SDK authors one slice per query() with write scope fail-closed and no self-verdict"
outcome: "The live Claude Agent SDK authors one slice per query() with write scope enforced fail-closed by a PreToolUse hook before any write lands, Bash absent from the tool surface, and red/green never the runtime's to report."
status: mapped
proof_mode: integration-test
depends_on: [phase-author-seam]
---

# The live SDK leaf — ClaudeAgentAuthor

**Outcome —** The live Claude Agent SDK authors one slice per `query()` with write scope enforced
fail-closed by a PreToolUse hook before any write lands, Bash absent from the tool surface, and
red/green never the runtime's to report.

> **Proof status (honest) — `mapped`, with a live leg that is operator-attested only.**
> `sdk-author.test.ts` (21) + `sdk-curator.test.ts` (4) pass offline over an injectable `queryFn`
> (`SdkQueryFn`), so every DECISION is offline-testable: `decideWrite` (the fail-closed write-scope
> predicate the PreToolUse hook calls), `composeLeafSystemPrompt` / `leafSystemPrompt`,
> `executeFeedback` / `formatFeedbackOutput` (the bounded feedback-tool doorbell). The genuinely
> LIVE leg — a real SDK `query()` authoring against a subscription — is **operator-attested** from
> the drive-machinery dogfood (the live leaf authored real units red→green there), never a standing
> test in this package: proving a live runtime needs the paid leaf. No `healthy` — no signed verdict
> (ADR-0020).

This is the LIVE `PhaseAuthor` (ADR-0030) and the one place the Claude Agent SDK is imported
(ADR-0004's single-import-site rule, widened to this package). It depends by code on
`phase-author-seam`: `sdk-author.ts` imports `AuthoringPhase` / `AuthorResult` / `PhaseAuthor` —
`ClaudeAgentAuthor` IS the seam's live implementation; `sdk-curator.ts` reuses the injectable
`SdkQueryFn` seam. The honesty walls are structural and live OUTSIDE the runtime (ADR-0020): write
scope is enforced by a PreToolUse hook BEFORE any write lands (`decideWrite` fail-closed), Bash is
NOT in the tool surface (a shell write would bypass the scope hook), and red/green is never this
runtime's to report — the spine re-runs the proof itself, out-of-band, after the leaf stops.

## Proof

The write-scope decision, the system-prompt composition, and the feedback-tool plumbing are
integration-proven offline against the injected query double (ADR-0010 §2). The live `query()` leg is
brownfield-attested, not gate-driven — the standing-test boundary every live leg in storytree carries
(the paid leaf can't be a free/offline standing test). `sdk-curator` (the live curator leaf, ADR-0067)
rides the same query seam and is consumed by the CLI's `curate` path.
