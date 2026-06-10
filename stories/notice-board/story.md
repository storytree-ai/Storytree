---
id: "notice-board"
tier: story
title: "The notice board — cites link feedback into a signal-graph a synthesis agent graduates"
outcome: "Operator and session feedback becomes a connected, attributable signal-graph via cites; a future synthesis agent graduates accumulated signal into open-questions and proposals."
status: proposed
proof_mode: UAT
capabilities: [cite-event, archive-with-reason, signal-synthesis]
---

# The notice board — cites link feedback into a signal-graph a synthesis agent graduates

**Outcome —** Operator and session feedback becomes a connected, attributable signal-graph via
cites; a future synthesis agent graduates accumulated signal into open-questions and proposals.

This is the cite / graduation mechanism that [ADR-0027](../../docs/decisions/0027-supersede-adr-0014-notice-board.md)
carried forward from the superseded ADR-0014, and that
[ADR-0032](../../docs/decisions/0032-cite-graduation-mechanism.md) now **decides**. The
**post substrate is already built and is NOT re-scoped here**: posts/comments persist as typed
events (`events.comment` projection + append-only `events.comment_event`; `PgCommentStore` in
`packages/store`), and the studio reads/writes them against the shared store. This story builds
what sits ON that substrate: cites-as-links, reasoned archival, and — deferred — the synthesis
agent that graduates accumulated signal.

**First feature story through the drive (intent).** Unlike the seed stories (retrospective specs
over existing code), every capability here is greenfield `proposed` — authored first, to be built
through the prove-it-gate (`node build`/`story build`), with REAL worktree builds now able to
import workspace packages (`install: true`, ADR-0031 §2) and signed passes landing by promotion
(ADR-0031 §1). Registry entries are NOT pre-created — registration is the deliberate act that
makes a node buildable, done per node when its build is actually next.

## Design floor (from ADR-0032, the deciding ADR)

- A **comment** is a signal that an artifact needs attention. A **cite** is a typed **link**, not a
  counter: it reinforces a signal *and* connects signals and artifacts — and a cite may target
  another **artifact**, not just a comment — so cites compose into a **signal-graph** across the
  whole system. Cites are events; any count is derived, never stored.
- **Graduation is a future synthesis agent**: it reads the accumulated signal-graph and synthesises
  **open-questions / proposals** into the ADR-0018 OQ→ADR flow. There is **no** deterministic
  cite-threshold scan and **no** auto-promotion. This capability is deferred — named, not built.
- Wrong or handled posts are **archived with a reason**, never deleted: history stays, the
  projection drops them from the live surface.
- **No anti-gaming machinery** (cite-density math, forge defences, signal-vs-noise thresholds) — a
  deliberate non-goal per ADR-0032 §5, revisited only on observed evidence of abuse.

## Capabilities (3)

Listed roots-first. All `proposed` — no code exists; the Proof note in each file is a would-be
integration test, not evidence.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`cite-event`](cite-event.md) | A cite is an attributable typed link between comments, cites, and artifacts; counts are derived, never stored. | proposed | — |
| 2 | [`archive-with-reason`](archive-with-reason.md) | A wrong post is archived by a reasoned event that preserves history and removes it from the live surface. | proposed | — |
| 3 | [`signal-synthesis`](signal-synthesis.md) | **Deferred** — a future synthesis agent reads the signal-graph and proposes open-questions / proposals for operator review. | proposed (deferred) | `cite-event`, `archive-with-reason` |

## Dependency graph (predicted, not code-derived)

Greenfield story: these edges are the *designed* couplings the integration tests will assert,
to be re-derived from real imports once code exists (the `library` story's standard).

- `signal-synthesis` → `cite-event` — the agent traverses cite links to read the signal-graph.
- `signal-synthesis` → `archive-with-reason` — the agent ignores archived signal.

**Cross-story boundary (owner call #3):** every capability here consumes the **comment/post
substrate** owned by the existing organisms (`events.comment*` via the store seam), and
`signal-synthesis` (when built) emits through the **open-question / proposal authoring path** in the
`library` story (the ADR-0018 OQ→ADR flow). Under ADR-0010 §4 these are cross-story interfaces and
should be declared, not absorbed.

## Story UAT (would-be)

**Goal —** One operator, one session: feedback becomes a connected, attributable signal-graph, a
wrong post leaves the surface without losing history, and accumulated signal is legible to a future
synthesis agent. The synthesis step itself is deferred (see `signal-synthesis`); the near-term UAT
proves the substrate it will read.

1. **Cite (reinforce):** two different sessions cite an existing post, each with a why. **Success —**
   two cite events persist (from/to/why/actor), the post's *derived* cite count reads 2, and no
   stored counter exists anywhere.
2. **Cite (link across artifacts):** a session cites *from* a comment *to* another artifact (a node
   or Library unit). **Success —** the cite event records both endpoints; traversing the cite graph
   from the artifact reaches the originating comment — signal that spans the tree, not a per-post
   tally.
3. **Archive:** a different, wrong post is archived with a reason. **Success —** the archival event
   (who/when/reason) persists, the post leaves the live surface, and its full history (incl. its
   cites) remains readable.
4. **Synthesis (deferred):** *when `signal-synthesis` is built* — the agent reads the signal-graph
   and emits an open-question / proposal candidate referencing the signal it synthesised, through the
   ADR-0018 authoring path. Out of scope for this story's first build; recorded as the next frontier.

## Open modeling calls (for the owner)

1. **RESOLVED by ADR-0032 — cite identity (ADR-0014's C4).** Identity is provenance on the cite
   `actor`, not a gate in a threshold. `citedBy`/`actor` resolves through the fail-closed signer
   chain; what an *agent-session* cite is worth is the residual that ties to `open-questions.md` §1
   and is the synthesis agent's concern, not the cite primitive's.
2. **RESOLVED by ADR-0032 — graduation shape.** Not a deterministic threshold scan: a future
   synthesis agent produces open-questions / proposals. No threshold policy to set; no anti-gaming
   machinery to build.
3. **Declare the cross-story interfaces** (comment substrate; the OQ/proposal authoring path) per
   ADR-0010 §4 — this story would be the first consumer of a declared interface.
