# ADR-0014: The notice board — anchored prose feedback that graduates into durable guidance

## Status

**draft (2026-06-06, proposed for adjudication.)** Resolves open-q §5 (channel/post); proposes a home for the graduation *target* (relates open-q §9). Evolves Agentic ADR-0011 (forum staging surface) + ADR-0022 §3 (per-story channel) — whose *coordination* half already **collapsed into ADR-0009** per [`agentic-artifact-gap-analysis.md`](../agentic-artifact-gap-analysis.md); this ADR homes the **feedback + graduation** half that gap-analysis left parked in §5/§9. **Decision bullets marked ⚠ are provisional pending owner adjudication of conflicts C1–C4 (see Open); each is being carried into its own session.**

## Date

2026-06-06

## Context — why this un-parks §5 (the reframe)

Agentic ran its coordination substrate **local-only** (laptop Phase-0: git+claims, embedded SurrealDB, cloud deferred). That was correct *for a corpus with no library*: with nothing durable to propagate across sessions, a shared store bought little. That experiment is done, and its lesson is the load-bearing input here (owner, 2026-06-06): **the bottleneck is operator input**, and a single session's feedback dies with the session. **The library is the answer** — durable guidance is how one unit of operator input propagates to every future session. A shared store (already decided: [ADR-0006](0006-event-store-observability-surface.md) / [ADR-0009](0009-concurrency-isolation-id-allocation.md), Postgres/DBOS) is *justified by* this loop, not deferred against it. The gap-analysis concluded "no Agentic ADR needs porting" precisely because §5/§9 were parked; this ADR records the owner decision that un-parks §5.

## Decision

The notice board is **anchored prose feedback on the shared event store, with an explicit graduation path into durable guidance.** It introduces no new substrate; it composes with ADR-0006 (event store), ADR-0008 (studio drives agents), ADR-0009 (claims).

1. **A post is a typed event, anchored.** Every post (operator comment or session note) is an `event` in the shared Postgres store (ADR-0006), anchored to exactly one target: a node (story / capability / contract), a guidance doc, or a doc/artifact text-span (the studio's existing text-quote anchor). **No tags; free-form prose** (Agentic invariant, owner-reaffirmed twice). An orphan-anchored post signals the tree has a gap — refused at the DB constraint, never warned.

2. **Cites are the signal, not a counter.** A session or the operator may *cite* a post ("this applies to me too") — the social-proof upvote. Cites are typed events carrying who / when / why. No thumbs-down. Wrong posts are **archived with a reason, never hard-deleted** (the cites record what confusion recurred). A bare integer counter is rejected — forgeable, and carries no "why".

3. **⚠ Graduation: post → durable guidance (C2).** When a post's cites show recurring friction, it graduates into **durable guidance** — today's home is [`docs/guidelines/`](../guidelines/) (advisory markdown), authored as structured source with markdown-as-view ([ADR-0013](0013-structured-corpus-markdown-as-view.md)) and rendered in the studio Library. The guidance `references` its originating post(s); the post is archived `graduated`, not deleted. **No separate `forum/` staging surface** — graduation is a lifecycle into the existing guidance tier, not a second board. *(This reverses Agentic ADR-0011's deliberate forum/assets separation — see Open C2.)* Whether durable guidance additionally needs the reciprocity-checked, shared-content treatment of open-q §9 is **left open** — `docs/guidelines/` today is explicitly *advisory, not an asset system*.

4. **⚠ The studio is the notice board (C1).** Per-node chat (ADR-0008) and inline anchored comments are the **same post stream at different anchor grain** (node-level vs span-level), not separate surfaces. The canopy renders cite-density per node (the studio already badges open-comment counts); the Library surfaces graduation candidates ranked by cites. *(This is the §5 fold-in decision — see Open C1.)*

5. **Curation is orchestrator-proposed, operator-approved (C3 — resolved (a)).** There is **no Claude Stop hook** (Agentic invoked its `forum-librarian` that way; storytree owns the loop per ADR-0011 and has no persona cascade per ADR-0004). Instead an **orchestrator curation step proposes graduations** — a cite-threshold signal surfaces a post as a graduation *candidate* — and the **operator approves** the promotion in the studio as a signed `actor=operator` event (ADR-0008's human-at-the-outer-loop promotion model). This automates the *proposing* while keeping operator judgment as the *gate* — directly serving the operator-input-bottleneck thesis. The cite-threshold triggers *proposing only*, never the promotion itself; that distinction is what neutralises the cite-stuffing failure mode Agentic ADR-0011 rejected auto-promote for — a stuffed post yields at most an operator-rejected proposal, never durable guidance. Fully-manual promotion is rejected (it re-imposes the proposing burden on the operator, the very bottleneck) and fully-automatic-on-threshold is rejected (no gate — reopens the cite-stuffing hole, and contradicts ADR-0008).

6. **Claims stay in ADR-0009.** The notice board is prose-only. Write-ownership claims remain typed rows/events under ADR-0009; the "typed-claims-separate-from-prose" invariant is preserved by reference, not redefined here.

## Migration / consequences

- The studio's current `apps/studio/data/comments.json` + `assets.json` (flat JSON via Vite dev-middleware) are a **stopgap this ADR retires**: posts and cites become typed events (ADR-0006); the Library's guidance becomes structured source + generated markdown (ADR-0013, which already names "the Library seeder"). The studio reads/writes the shared store instead of repo JSON — which is also what makes feedback persist across sessions and worktrees (the original ask).
- Substrate is **Postgres/DBOS** (ADR-0006/0009). The **GCP hosting** specifics (Cloud SQL vs AlloyDB vs Cloud-Run-managed) are a **separate discussion** — not SurrealDB-on-GCE (Agentic, superseded) and not Firestore.
- Anchor-existence becomes a DB constraint + a derived "orphan-post" projection in the node rollup, replacing Agentic's Rust `AuditReport` / `agentic gate check` machinery.

## Open / conflicts raised to owner (each → its own session)

- **C1 (§5 fold-in):** confirm per-node chat and inline anchored comments are ONE event stream (anchor grain varies), vs. a separate persistent annotation board distinct from live chat.
- **C2 (graduation home):** confirm graduation is a **lifecycle into the existing guidance tier** (`docs/guidelines/`, no separate `forum/`), reversing Agentic ADR-0011's deliberate separation — and whether that tier ever needs open-q §9's reciprocity-checked shared-content shape.
- **C3 (curation trigger): RESOLVED (a) — orchestrator-proposes + operator-approves** (owner, 2026-06-06). Orchestrator curation proposes graduations on a cite-threshold signal; the operator approves the promotion as a signed event (ADR-0008). Fully-manual rejected (re-imposes the proposing bottleneck this ADR exists to relieve); fully-automatic-on-threshold rejected (no operator gate — reopens Agentic ADR-0011's cite-stuffing hole). The cite-threshold gates *proposing*, not promotion — that is what makes automating it safe. Decision recorded in bullet 5.
- **C4 (cite identity):** what identity backs a cite/promotion with no single human/subscription (ties to open-q §1 attestation/identity, still open).

## References

- [ADR-0006](0006-event-store-observability-surface.md) (event store), [ADR-0008](0008-ui-drives-agents-approvals.md) (studio drives agents; per-node chat), [ADR-0009](0009-concurrency-isolation-id-allocation.md) (claims; coordination substrate), [ADR-0013](0013-structured-corpus-markdown-as-view.md) (structured corpus; the guidance representation).
- [`agentic-artifact-gap-analysis.md`](../agentic-artifact-gap-analysis.md) (0022 collapsed → 0009; 0011 forum parked), open-questions [§5](../open-questions.md) / [§9](../open-questions.md), Agentic ADR-0011 + ADR-0022 §3 (`C:\code\Agentic`).
- Design conversation, 2026-06-06.
