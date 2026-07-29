---
status: accepted
decided: 2026-07-29
---
# ADR-0266: The software factory is a master process: a branch-edged station index, Library-canonical, with a navigable flow render

## Status

accepted (2026-07-29) — decided/directed by the owner in conversation on 2026-07-29. The owner asked
for a birds-eye view of the whole delivery loop, directed the rename of "the SDLC" to **the software
factory** ("the term being used for AI self perpetuating systems these days"), proposed the container
shape themselves — *"i think it deserves a definition but also its a process artifact. Or maybe its a
master process and that has upstream child processes"* — and then chose the full scope: the artifacts
**plus** an interactive flow canvas, with the Library canonical and the published HTML page a view.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The delivery loop this repo runs on is real, enforced, and **undocumented as a whole**. Its parts are
documented well: fourteen `process` artifacts carry the ceremonies, ninety-one load-bearing ADRs carry
the decisions, and the `session-orchestrator` agent carries the operating discipline. What no artifact
carries is the **shape** — which ceremony is which station, what hands on to what, and where the
guardrails sit relative to each other. The owner had to ask for it to be assembled by hand, which is
the observable symptom that it is not in the corpus.

Four capabilities needed to close that gap already exist, and three of them are built:

- **Mermaid renders in artifact bodies** (ADR-0096). `Markdown.tsx` renders ```` ```mermaid ```` blocks
  to inline SVG client-side at `securityLevel: 'strict'`, and an artifact's whole body routes through
  it in the studio's view mode. Of 172 corpus artifacts, **one** uses it (`oq-diff-view-altitude`).
- **`branchEdges` on the `process` kind** — structured outbound edges, `{ ref, label? }`, chartered by
  ADR-0154 and un-deferred by ADR-0161 dec 5 as the process node of the Library context DAG.
- **`check:process-graph`** — wired into `pnpm gate`, enforcing that every branch edge resolves and no
  cycle forms. Its own header records what it is waiting for: *"A NO-OP today (no seed process carries
  branchEdges), exactly as intended."*
- **The typed-edge wire** — `library-typed-edges` surfaces a process's `branchEdges` onto the rendered
  `GuidanceAsset` through `renderStoredDoc`, and it is **built and signed** (commit `3c69dd21`, the
  `lte-*` contracts in `render-doc.test.ts`), through `apps/studio/server/libraryBackend.ts` onto
  `apps/studio/src/types.ts`. Its spec reads `status: proposed`, which is **not** a staleness bug and
  must not be hand-corrected: a spec's `status` is the authored starting declaration, while proven
  health is a separate derived projection rolled up from signed verdicts
  (`build-unit-status.ts` — *"a projection of the verdicts, never authored"*). All seventeen specs in
  this story read `proposed`, including ones that demonstrably landed. Editing one to look built would
  be precisely the hand-edit `prove-it-gate` forbids.

So the pipeline is complete end to end except at its two ends: **all fourteen process artifacts carry
zero branch edges** (no data), and nothing in `apps/studio/src/lib` reads the field (no render). The
`library-typed-edges` spec named the second gap explicitly and deferred it — *"nothing renders
differently until a later increment (inc-9) draws with the edges"*. This ADR is that increment, and
the data it needs.

The remaining force is the one the corpus is most opinionated about: `reference-dont-restate`
(ADR-0034 §2) and `edit-first-curation`. A master artifact that re-explained the merge ceremony or the
prove-and-promote ceremony would be a second copy of doctrine required to agree with the first, which
by ADR-0251 would need a conformance test rather than a convention — an expensive way to build a
duplicate.

## Decision

**D1 — The software factory is one `process` artifact whose branch edges are the index, and which
restates nothing.** `process:software-factory` carries the station map and a mermaid diagram in its
body, and points at the existing ceremonies through `branchEdges`. The ceremonies are edited nowhere;
they become its children. A new artifact *kind* is not introduced — the master/child relationship is
carried entirely by the edge field the schema already has.

**D2 — The term enters the vocabulary tier.** `definition:software-factory` records what the term
means, with the **return edge as its differentia**: a pipeline ships product, a factory retools itself
between shifts. This is what makes the rename doctrine that flows into agent guidance rather than one
diagram's title. Nothing in the corpus is *named* "SDLC" — the string appears in four incidental
places, two of them generated data files — so this is a vocabulary decision, not a migration.

**D3 — Edges are drawn to stations, not to the whole process shelf, and the gaps stay visible.** The
master branches to the processes that genuinely are stations or cross-cutting legs of the loop, each
edge labelled with the station it serves. It does **not** index the environment and ops processes
(`db-control`, `launch-studio`, `launch-desktop`, `desktop-e2e-conventions`, `website-release`), which
are not stations of this flow. Structure has to encode something true, and a master that indexed
everything would encode only "these are processes".

This makes a real gap visible rather than papering it: of the seven stations, **two have no process
artifact at all** — Intent (decide and decompose the unit) and Claim (claim, isolate, take the
worktree). They are named as absent in the master's body, in the posture ADR-0128 settled for the
forest map: honest by absence, with the gap as the worklist. Authoring them is follow-on work, not a
precondition for this ADR.

That count is itself evidence for the drift cost recorded under Consequences. The first draft of this
ADR and of the map named **three** gaps, including Gate; between authoring and verifying, the same
afternoon, `type-only-red-needs-runtime-witness` (station 3) and `verification-decay-detection`
(station 5) landed on `main`, and Gate acquired a ceremony. The map was corrected before landing, but
only because the process shelf was re-read — nothing would have failed had it not been.

**D4 — The Library is canonical; the published HTML page is an unmaintained view.** The master
artifact's body is the source of truth, looked up through `storytree library artifact software-factory`
and the studio. The HTML artifact published on 2026-07-29 is a one-off presentation of the same
content and is **explicitly not a surface required to agree** — it may go stale, and ADR-0251's
conformance rule therefore does not bind it. Stating this is the point: an unlabelled second copy is
exactly the drift ADR-0251 exists to catch, and the cheap escape is to declare which copy is
authoritative rather than to gate a page nobody re-reads.

**D5 — `branchEdges` get a navigable render in the studio, two-stage.** A process node's outbound
edges become navigable in the Library canvas — the first consumer of the wire `library-typed-edges`
already delivers. Per ADR-0070 the unit splits: the **geometry and behaviour** (the edges present in
the graph, their labels, click-through re-centre onto a child, the absent-by-default case for a
process with no edges) are machine-witnessed under `apps/studio`'s vitest runner; the **appearance** is
the story's operator-attested leg and carries no pixel assertion in the proof.

## Consequences

**`check:process-graph` stops being a no-op the moment this lands.** It has run green in every gate
since it was built because the graph was empty. With the master's edges authored it acquires real
input, and its two rules — every edge resolves, no cycles — become live constraints on corpus edits. A
future artifact rename that breaks a branch edge now fails the gate instead of passing silently. This
is the intended effect, and it is also the first time the check's own correctness is exercised against
real data rather than fixtures.

**A durable-tier write obligation attaches.** Both artifacts are durable-tier, so per ADR-0263 the
live edit must be discharged with `storytree library export-corpus --pg --write` to keep
`check:corpus-content` at its zero ceiling. Skipping it now fails the local gate rather than accruing
silently, which is ADR-0252 D3's design working as intended.

**The master becomes a maintenance surface with no gate behind it.** `check:process-graph` proves the
edges resolve; nothing proves the *body* still describes the loop. If a station changes — a gate check
is added, a ceremony is re-decided — the master can drift into a confident, wrong map, which is worse
than no map. This is the accepted cost, stated rather than glossed. The mitigating structure is that
the master restates nothing (D1): the drift surface is the station list and the diagram, not the
doctrine, and the librarian pass already owns keeping the decision log honest.

**Two station gaps are now recorded rather than merely absent.** Intent and Claim having no process
artifact was true before this ADR and invisible; it is now written down with a name.

**The rename does not propagate automatically.** D2 puts "software factory" in the vocabulary tier,
which reaches agents through the Library and the rendered guidance. It does not rewrite the four
incidental "SDLC" strings, two of which are generated data. Nothing depends on them.

## References

- [ADR-0034](0034-process-artifacts-ways-of-working.md) — the `process` kind and `reference-dont-restate`.
- [ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md) / [ADR-0161](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md) — the process branch-edge graph this authors the first instance of.
- [ADR-0096](0096-render-mermaid-diagrams-in-the-studio-markdown-surface.md) — mermaid rendering in the studio markdown surface.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage frontend proof D5 splits on.
- [ADR-0251](0251-mirror-conformance-two-surfaces-required-to-agree-are-gated.md) — the conformance rule D4 declares out of scope for the published page.
- [ADR-0263](0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md) — the export discharge the artifacts owe.
- [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md) — honest by absence, the posture D3 takes on the three missing stations.
- `packages/library/src/store/render-doc.ts` + `render-doc.test.ts` (`lte-*`) — the built typed-edge wire.
- `packages/cli/src/check-process-graph.ts` — the gate that stops being a no-op.
- `stories/library-tech-tree-overlay/library-typed-edges.md` — the built-and-signed wire D5 consumes; its `proposed` status is the authored declaration, deliberately left alone.
- `packages/cli/src/build-unit-status.ts` — proven health as a verdict projection, never an authored field.
