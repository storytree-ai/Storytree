---
status: accepted
decided: 2026-07-05
amends: [154, 156]
---
# ADR-0161: The library is a node-keyed context DAG: agent step-nodes and process nodes share one next: emitter

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05, after an
independent readiness review of the ADR-0156 build. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md) and
[ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md) without overturning
either. ADR-0156's essentials-only decision and CLI-first build order stand in full; this adds the
constraint that its `storytree agents <name> --step` affordance and ADR-0154's process-graph must emit
through ONE shared `node → next:` emitter over a compatible edge shape, and that ADR-0156's own
way-of-working graduates a `process` artifact. ADR-0154's §2 derived-process model and its
`check:surface-coverage` bijection stand; what this changes is its Consequences deferral of the process
`next:`-graph follow-on — that item is **un-deferred** and folded into this arc under a standing owner.
*(Tense corrected in place 2026-08-06 per ADR-0139; nothing here is re-decided. This read "its
`check:surface-coverage` **gate** stand". ADR-0311 D2 retired that rung from root/CI policy — ADR-0154
D2 now records it as an on-demand diagnostic — so what stands is the bijection and the charter, not a
gate obligation.)*

## Context

[ADR-0023](0023-library-cli-choose-your-own-adventure.md) /
[ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) already made every CLI command
return a `next:` envelope — a choose-your-own-adventure breadcrumb (`{ ok, body, next[] }`,
`packages/cli/src/envelope.ts`, re-exported from `@storytree/drive`). But those `next[]` breadcrumbs
are **hand-authored strings per command**; there is no structured edge on the artifacts that the
`next:` is derived FROM. The Library is real as `asset:` refs (an agent points at its refs), but the
NAVIGATION graph — which node hands on to which — is still prose. "The Library DAG" is, today, a
metaphor.

Two accepted decisions independently reach for the same missing structure:

- **ADR-0156** — an agent's workflow STEP keys to the refs that step needs, served by
  `storytree agents <name> --step`, reusing the ADR-0023 envelope.
- **ADR-0154's captured-but-deferred follow-on** — give `process` artifacts BRANCH-EDGES and derive
  the CLI's `next:` graph from the process graph, so an agent standing at a process node sees only that
  node's surfaces and its outbound branches.

Both are the same shape: *a node whose just-in-time context and outbound branches the one envelope
serves.* The readiness review (2026-07-05) established the precise seam:

- **The envelope kernel already EXISTS and is singular** — a 3-line re-export both surfaces reuse by
  design (ADR-0156 §4 forbids re-implementing it). There is no second navigation SYSTEM at risk.
- **The two node types are legitimately different data on different kinds** — agent step→refs vs
  process branch-edges — and the four ADR-0156 rollout agents (librarian-curator, story-author,
  guidance-curator, corpus-investigator) cite ZERO `process`-kind refs, so the initial rollout has no
  schema overlap with the process-graph.
- **The genuine risk is EMITTER / EDGE-SHAPE DRIFT, not duplication of the graph.** Build ADR-0156's
  step-keying over a bespoke `node → envelope` path and ADR-0154's process-graph over a second one, and
  the one Library DAG fragments into two incompatible sub-graphs that later need reconciling — the very
  restatement ADR-0156 exists to remove. The cheapest moment to prevent that is now, while ADR-0156 is
  the first mover and neither emitter is built.

## Decision

1. **The Library is a node-keyed context DAG served by one envelope.** A NODE (today: an agent
   workflow-step or a `process`) carries structured OUTBOUND EDGES to the artifacts/nodes it hands on
   to; the ADR-0023 `next:` envelope is DERIVED from those edges, not hand-authored per command. This
   formalises ADR-0023/0053's choose-your-own-adventure from prose breadcrumbs into a queryable graph.
   Existing hand-authored `next[]` strings stay valid and migrate to derived opportunistically, per
   surface — never a big-bang rewrite.

2. **Two node types, one emitter.** ADR-0156's agent step→refs and ADR-0154's process branch-edges are
   the first two node types. They emit through a SINGLE shared `node → next:` helper over a COMPATIBLE
   edge shape (a node → an ordered list of outbound asset/node refs, rendered as one envelope). Neither
   invents a bespoke navigation format. (This is the readiness review's caveat, ratified.)

3. **Un-defer ADR-0154's process-graph follow-on into this arc, under a standing owner.** ADR-0154
   deferred the process branch-edges + derived `next:` graph to avoid coupling a governance fix to a
   CLI restructure. That precondition is now met — the process tier has a standing librarian charter
   and a backfilled, coverage-gated set (**as measured on 2026-07-05:** 10 processes,
   `check:surface-coverage` clean). The follow-on becomes the second half of this arc, built on the
   shared emitter from (2). librarian-curator owns keeping the process graph a current projection
   (extending its ADR-0154 charter).

   **Corrected in place 2026-07-27, extended 2026-07-28 — the clause is date-stamped because the sweep
   went dirty and has since been drained; the decision it supports is unaffected either way.** Nine days
   after this ADR, ADR-0195 added the operator-facing root script `ci:affected` with no `process` behind
   it, and the orphan list read 1 continuously from 2026-07-14 to 2026-07-28 (13 processes / 67
   entrypoints at the 2026-07-27 measurement). The precondition this un-defer rested on was the
   *standing charter plus a gated tier*, not a permanently-zero worklist, so the un-defer stood
   throughout — but the 2026-07-05 parenthetical must not be read as current state. That the drift sat
   un-drained for thirteen days across every local and CI gate run is the measured evidence that bounded
   `check:surface-coverage` at a drain ceiling (see the ADR-0154 D2 correction and
   `packages/cli/src/surface-coverage-drain.ts`, which cites this line as its baseline).

   **DRAINED 2026-07-28.** `process:affected-pr-test-scope` was authored from ADR-0195 under ADR-0154's
   charter, and the sweep is CLEAN again — **14 processes / 67 entrypoints, unresolved 0 / orphans 0** —
   with the orphan ceiling tightened 1 → 0 in the same unit, so the state this clause describes cannot
   silently recur. Neither the 2026-07-05 nor the 2026-07-27 count is current; run the
   surface-coverage checker for the live numbers rather than calibrating to any figure here.
   *(Invocation corrected in place 2026-08-06 per ADR-0139; nothing here is re-decided. This said "run
   `pnpm check:surface-coverage`" — ADR-0311 D2 removed that root script, so the command no longer
   resolves. The checker itself survives unwired at
   `packages/cli/src/check-surface-coverage.ts`; invoke it directly. The instruction not to calibrate
   to any figure in this ADR is unchanged and matters more now that nothing re-measures on a schedule.)*

4. **ADR-0156's way-of-working graduates its own `process`.** Per ADR-0154's charter (a load-bearing
   way-of-working ADR carries a current `process`), ADR-0156 — how a subagent gets context — graduates
   a `subagent-context-pull` process deriving from it, authored during the build (`agents` is not
   orphan-checked, so this is an obligation of the charter, not a retroactive gate).

5. **The new edges are born enforced.** ADR-0156's size/structure gate additionally asserts STEP→REFS
   INTEGRITY (every entry names a real workflow step; no dangling ref key), and the process-graph unit
   adds GRAPH INTEGRITY (branch-edges resolve; no cycles) — the dangling-ref fence extended to
   structured edges. *(Half OVERTAKEN — corrected in place 2026-08-06 per ADR-0139; nothing here is
   re-decided and the edges were born enforced as decided. ADR-0311 D2 then retired
   `check:process-graph` from root/CI policy, so the GRAPH INTEGRITY half is no longer enforced at any
   gate — only on demand. The STEP→REFS half rides ADR-0156's own gate and is unaffected.)*
   (*Delivered* by `check:process-graph`, ADR-0161 inc 7c: resolve + acyclic. The
   third property this originally named, "unreachable nodes", is DEFERRED — the process branch-edge
   graph declares no traversal ROOT, and reachability is only computable relative to one; enforcing it
   would mean inventing a root semantics the corpus does not settle, so it becomes definable once a real
   graph entry-point is declared. A standing, not-yet-met obligation, not a shipped check — recorded
   here so the accepted set stays true in full, ADR-0139.) The enforcement stays layered exactly as
   today: code fences (block —
   they make thinning safe) + structural gates (drift / size / bijection / integrity) + the
   librarian-curator standing charter (WHICH nodes should exist — the judgement no gate makes).

6. **Build order — this ADR lands first (the frame), then a self-perpetuating chip lands one unit per
   session.** ADR-0156's CLI-first sequence is unchanged (§6 i–iv), with the shared emitter introduced
   in its first unit; then the process-graph units (branch-edge schema → derive `next:` → integrity
   gate); the `subagent-context-pull` process is authored by the librarian pass. `frontend-builder`
   stays EXCLUDED (its process revisit is a separate chip); `graduation-synthesist` / `friction-analyst`
   thin-render only. The chip HALTS to the owner at any genuine design fork or operator-attested leg.

## Consequences

- **Good.** The "Library DAG" becomes real structure, not a metaphor — one queryable graph, one
  emitter, one enforcement stack. An agent standing at any node (an agent-step or a process) sees only
  that node's surfaces and outbound branches — the context-optimised surface ADR-0154 named, now spanning
  both tiers. ADR-0156's measured token-cut still ships on schedule (the shared emitter is a small
  factor in its first unit, not a blocking redesign), and there is no later migration to reconcile two
  sub-graphs.
- **Cost / sharp edges.** The process-graph half is real net-new work (schema + derive + integrity)
  this arc now takes on rather than defers. Fixing the shared edge shape up front constrains ADR-0156's
  first unit slightly (a helper + a compatible field, not a bespoke `--step` path). Two more integrity
  checks to keep green. The graph must not grow cycles — the integrity gate is load-bearing.
- **Net.** Unifies two independently-correct decisions into one system at the cheapest possible moment —
  before either emitter is built — completing ADR-0023/0053's choose-your-own-adventure over both the
  agent and process tiers, and leaving ADR-0156's and ADR-0154's own decisions intact.

## References

- [ADR-0156](0156-subagent-prompts-are-essentials-only-the-cli-serves-ceremony.md) — agent step→refs,
  essentials-only (amended: + shared emitter, + graph frame, + process obligation).
- [ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md) — the process tier
  as a standing projection (amended: its deferred process-`next:`-graph follow-on is un-deferred into
  this arc).
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) /
  [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) — the choose-your-own-adventure
  CLI envelope this formalises from prose breadcrumbs into derived structure.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is
  ratification (this ADR born accepted).
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — the accepted ADR
  set carries no stale prose, correct-in-place (the discipline the librarian applies to ADR-0154's
  now-overtaken deferral note).
- Code: `packages/cli/src/envelope.ts` (the shared `next:` envelope), `packages/library/src/store/render-agent.ts`,
  `packages/cli/src/agents.ts`, `packages/cli/src/surface-coverage-gate.ts`.
- Readiness review + owner conversation, 2026-07-05.
