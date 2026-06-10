---
id: "signal-synthesis"
tier: capability
story: notice-board
title: "A synthesis agent graduates accumulated signal into open-questions / proposals (deferred)"
outcome: "A future synthesis agent reads the signal-graph and proposes open-questions / proposals for operator review."
status: proposed
proof_mode: integration-test
depends_on: [cite-event, archive-with-reason]
---

# A synthesis agent graduates accumulated signal into open-questions / proposals (deferred)

**Outcome —** A future synthesis agent reads the signal-graph and proposes open-questions /
proposals for operator review.

**Depends on —** [`cite-event`](cite-event.md), [`archive-with-reason`](archive-with-reason.md)

> **Proof status (honest) — `proposed`, DEFERRED.** This capability is named, not built, and is not
> the next frontier. ADR-0032 §3 fixes the direction: **graduation is intelligence, not arithmetic**
> — a synthesis agent reads the accumulated signal-graph and emits open-questions / proposals into
> the existing ADR-0018 OQ→ADR flow. There is deliberately **no** deterministic cite-threshold scan
> and **no** auto-promotion (ADR-0032 §3, §5). It is recorded so the design is legible and the build
> order is honest, not so it is built now.

## Guidance

This replaces ADR-0014's cite-threshold curation (the deterministic scan + operator-approved
promotion that earlier drafts of this story specified). Per ADR-0032 the curation is an **agent**,
not a function over a counter:

- **Input — the signal-graph:** the agent traverses cites (`cite-event`) across comments and
  artifacts, skipping archived signal (`archive-with-reason`), to find recurring or cross-cutting
  friction — issues that span the tree, which a per-post tally could never see.
- **Output — OQs / proposals through the front door:** what the agent emits is an **open-question or
  proposal** authored through the Library's existing path (ADR-0018's OQ→ADR lifecycle), carrying
  provenance back to the signal it synthesised. It does not write durable guidance directly; the
  OQ→ADR flow (operator-adjudicated) remains the path to a decision.
- **No anti-gaming machinery (ADR-0032 §5):** no cite-density math, no thresholds, no forge
  defences. A capable agent judges the signal; cite-stuffing is an unobserved problem and is not
  pre-solved. If it is ever observed, that becomes its own work item with evidence.
- **Identity is the residual (ADR-0032 §6 / `open-questions.md` §1):** what an agent-session's
  signal is *worth* to the synthesis agent is the genuinely open part — it ties to attestation/
  identity §1. This is why the capability is deferred, not merely unbuilt: its trust model waits on
  §1.

## Integration test (would-be, when built)

**Goal —** Against a real store seeded with a real signal-graph (cites across comments and
artifacts, some archived), the agent emits exactly the open-questions / proposals the signal
supports, with walkable provenance, and writes nothing durable directly.

Seed cross-linked, partly-archived signal; run synthesis; assert each emitted OQ/proposal goes
through the ADR-0018 authoring path, carries provenance to the cites/comments it synthesised,
ignores archived signal, and that no path lets the agent write a Library guidance unit directly or
self-adjudicate.

## Contracts (would-be — specified when this leaves deferred)

1. **`emits-through-oq-flow`** — synthesis output is an OQ / proposal via the ADR-0018 path, never a
   direct guidance write.
2. **`provenance-is-walkable`** — each emitted artifact references the signal-graph it was
   synthesised from (cites, comments, artifacts).
3. **`ignores-archived-signal`** — archived posts and their cites do not feed synthesis.

*(Contracts are intentionally thin: the agent's trust model depends on identity `open-questions.md`
§1, and the precise shape lands when this capability leaves deferred.)*
