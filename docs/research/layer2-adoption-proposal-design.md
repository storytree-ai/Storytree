# Layer 2 — the adoption proposal / feedback mechanism (ADR-0097 follow-on design)

> **Status: design, not built.** This is the captured design for the named follow-on of
> [ADR-0097](../decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
> ("the adoption proposal / feedback mechanism does not exist … building it is the substantive new
> work this ADR names"). Settled with the owner across a design conversation 2026-06-23. **No code
> was written this session** (owner chose "design only — capture + stop"). It builds on **Layer 1**
> (the `(covers:)` gate annotation, `approvedBy` on the verdict, the spine-principal signer, the
> `mapped → proposed` flip) which is **also not built yet** — Layer 2 must be sequenced after it.

## What this is

ADR-0097 decided that bringing a brownfield (`mapped`) story into the fold is a **proving process**:
`brown → proposed → green`, where green is **earned by real work, never flipped by a button**.
Pressing **Adopt** does not green a story — it *enters the process* and produces an **adoption
proposal**: the spine's honest answer to *"what does bringing this in actually take?"*

This document is the design for that proposal mechanism + the surfaces that render it. The reference
for what "correct" looks like is the authored prose in
[`stories/library/story.md`](../../stories/library/story.md) — its `## Proof` section honestly flags
the `mapped` vs `proposed` pockets (`seed-corpus-scripts` has no real tests; the Postgres transaction
path is live-gated/unrun; several CLI branches are uncovered). **The mechanism should DETECT the
tested-vs-untested boundary, not trust that prose** — but the prose is the yardstick a build measures
its detector against.

## Decisions settled this session (the four forks)

1. **Analysis rigor → structural now, empirical later.** The proposal is computed by diffing Layer 1's
   `(covers:)` declarations against the full capability set. This detects *uncovered* caps
   deterministically and offline; it **trusts** that a declared `observe` gate genuinely exercises the
   caps it covers (author review supplies that, per
   [ADR-0085](../decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)). Real
   coverage *measurement* — to catch a gate whose suite only smoke-imports its code (the
   `seed-corpus-scripts` mis-declaration risk) — is **named follow-on**, feasible later with Node 24's
   built-in `node:test` coverage but needing each capability to declare its source files.

2. **Session scope → design only.** Settle the forks, capture the design (this doc), stop. Nothing
   built; Layer 1 is sequenced first.

3. **Render surface → both, studio primary.** The spine emits the proposal as **data**; the studio
   renders it for the human (replacing today's copy-paste `storytree gate run <id> --pg` command list,
   per ADR-0097 D3), and a CLI report renders it for agents / offline / the orchestrator's own use.

4. **Bucket (c) the key decisions → spine detects, a story-writer agent analyses, durable artifacts
   are authored, the studio surfaces them.** (Owner's refined model — see the flow below.) The
   mechanism never auto-writes the **decision log**; artifacts are authored by an *agent with
   judgment* through the existing OQ → ADR authoring path, and a human owns accept / un-decide.

## The flow (owner's refined model)

```
mapped story
   │  human presses ADOPT  (studio affordance / CLI)
   ▼
1. SPINE detects what it can (mechanical, structural — Fork 1)
      ├─ (a) adopt-able   : caps covered by an honest `observe` gate over a green suite
      ├─ (b) needs-work   : caps / pockets with no honest coverage → `build-tests` work
      └─ (c) decision-gaps: structural gaps that imply a decision is owed
   │
2. STORY-WRITER AGENT takes the detection and does further analysis
   │   (the existing `story-author` agent — owns the work hierarchy + the OQ→proposal authoring path)
   │
3. Durable LIBRARY ARTIFACTS are authored: proposed ADRs + open-questions
   │   (`storytree adr new --pg` for ADRs; `docs/open-questions.md` / the story's
   │    `## Open modeling calls` for OQs — never an in-place decision-log write by the machine)
   │
4. Story flips  mapped → proposed   ("adoption underway", ADR-0097 D1)
   │   and the cheap first step runs: the (a) `observe` gates are observe-and-signed NOW
   │   (`adopted` verdicts, signer = spine principal, `approvedBy` = the operator — Layer 1)
   ▼
5. STUDIO details panel (the now-`proposed` node) shows:
      ├─ "Open Questions / Proposals" section (under UAT) — the OQs + proposed ADRs for this node
      └─ "Relevant ADRs" section — the node's `decisions:` ADRs  (NEW UI; data exists, unplumbed)
   ▼
6. Pre-work clears (OQs resolved, proposals actioned) ── necessary, NOT sufficient for green
   ▼
7. BUILD the real work — the standard `proposed → Build` path (ADR-0094) drives the `build-tests`
   red→green that earns the signed verdicts. GREEN DERIVES from those verdicts (ADR-0020/0040/0082/
   0083 — `rollupStoryGreen`). No button flips it; the build earns it.
```

### Why this is coherent with the decided model

- **Adopt is the brownfield on-ramp that converts a `mapped` story into a `proposed` one.** Layer 2
  doesn't invent a new green path — it *feeds the existing one*. Once the story is `proposed`, the
  standard `proposed → Build` affordance ([ADR-0094](../decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md))
  drives the real `build-tests` work. The owner's instinct ("maybe then there is a build button")
  lands exactly on ADR-0094's `proposed → Build`.
- **Two kinds of work, cleanly separated.** *Proposals / OQs = the pre-work* (the decisions and
  analysis that must clear before the build is well-defined). *The build = the real work* (the
  red→green that produces the signed verdicts). Resolving every OQ is **necessary but not
  sufficient**: `green = a signed verdict` ([ADR-0020](../decisions/0020-red-green-enforcement-on-the-owned-loop.md))
  never bends, so the story cannot auto-flip green on "OQs resolved" — the build must still earn it.
- **Two surfaces, two actors.** The **studio** (hosted, read+comment; no agent runtime) does the
  *mechanical* part — flip `mapped → proposed`, observe-and-sign the (a) gates, render the spine's
  structural detection + the authored artifacts. The *deeper analysis + artifact authoring* (step 2–3)
  is a **Claude Code orchestrator/story-author session** task, not a hosted-button action. The CLI
  report (`storytree story adopt-plan <id>`) is what that agent session reads to do its analysis. The
  human owns the outer loop (ADR-0030): the adoption decision and the genuine forks are theirs.
- **Provenance stays honest end-to-end** (ADR-0097 D4): the machine signs what it witnessed (spine
  principal on the `adopted` verdicts), the human owns what they decided (`approvedBy` + the
  escalated forks). Neither pretends to be the other.

## Components a build session would land (after Layer 1)

| # | Component | Package / surface | Notes |
|---|---|---|---|
| 1 | `AdoptionProposal` shape + pure compute | `@storytree/orchestrator` (proof/) | Reads a story's `NodeSpec` (caps + reliability gates + Layer 1 `(covers:)`), returns the three buckets. Pure-by-injection like `observeAndSign`; offline-testable; the red→green unit. |
| 2 | CLI report `storytree story adopt-plan <id>` | `@storytree/cli` | Renders the proposal as data for agents/offline. The story-author agent reads this to do step 2. |
| 3 | Studio Adopt panel — render the proposal | `apps/studio` (`BuildSection`/`AdoptPanel`) | Replace today's copy-paste `gate run` command list with the three-bucket proposal + the Adopt action (flip + observe-and-sign the (a) gates). |
| 4 | "Open Questions / Proposals" panel section | `apps/studio` details panel (under UAT) | Lists the OQs + proposed ADRs tied to the node. Needs the payload to carry them. |
| 5 | "Relevant ADRs" panel section | `apps/studio` details panel | **Data exists** (`NodeSpec.decisions`), **unplumbed** — add `decisions` to `TreeStory` payload + render, linking to the existing `Decisions`-group Library docs. |
| 6 | The pre-work → build seam | orchestrator + studio | Once `proposed` and pre-work clears, the standard `proposed → Build` (ADR-0094) drives `build-tests`. Confirm the affordance composes (a `proposed`-from-Adopt story is `build`-buildable). |

## Layer 1 prerequisites (must land first)

Layer 2 reads and writes these — verified **not built** as of 2026-06-23:

- `(covers: <cap-ids>)` annotation parsed in
  [`packages/library/src/reliability-gates.ts`](../../packages/library/src/reliability-gates.ts)
  (today it parses `(gate: <kind>)` + the backticked command only). This is the structural input to
  the analysis (Fork 1).
- `approvedBy` (optional) on the `Verdict` shape in `@storytree/proof-protocol` — the human approver,
  distinct from `signer`.
- The **spine-principal** signer for `adopted` verdicts produced by Adopt (so the machine, not the
  clicker, is the witness — ADR-0097 D1/D4).
- The crown-coverage refinement to `rollupStoryGreen`: a brownfield cap's `healthy` is satisfiable by
  an adopted `observe` gate that `(covers:)` it (ADR-0097 D5).
- The `mapped → proposed` flip wired to the Adopt action (ADR-0097 D3).

## Open implementation questions (for the build session — not blocking the design)

- **Does the studio Adopt button persist a proposal snapshot, or is the proposal a live-derived
  view?** Recommendation: live-derived (re-compute each load) — the structural analysis is cheap and
  always reflects current `(covers:)` + verdict state; no stale snapshot to reconcile.
- **How does the studio trigger the story-writer's deeper analysis (step 2)?** The hosted studio can't
  spawn agents. Likely: Adopt does the mechanical part + records intent; the analysis is picked up by
  an orchestrator session (the CLI report is the hand-off). Confirm whether any signal is needed
  beyond the `proposed` flip + the visible needs-work bucket.
- **`(covers:)` syntax** — ADR-0097 D5 calls it "the proposed mechanism, syntax polished in build."
  Settle the exact form (e.g. `_(gate: observe)_ … (covers: cap-a, cap-b)`).
- **Empirical coverage (Fork 1 follow-on)** — when built, each capability needs a source-glob to map
  Node coverage back to it; flag any `(covers:)` cap its gate's suite barely touches.

## References

- [ADR-0097](../decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — the
  brown→proposed→green proving process; this is its named Layer 2 follow-on.
- [ADR-0085](../decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) —
  `observe` vs `build-tests` gate kinds; observe-and-sign → `adopted`.
- [ADR-0094](../decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) —
  `proposed → Build`, the path Layer 2 feeds into.
- [ADR-0050](../decisions/0050-adr-number-allocation.md) — atomic ADR allocation (`adr new --pg`), the
  artifact-authoring path step 3 uses.
- `owner-fork-bar` principle (#318) — escalate ownership, not uncertainty: the triage that keeps
  bucket (c) from over-escalating.
- Surfaces: [`observe-and-sign.ts`](../../packages/orchestrator/src/proof/observe-and-sign.ts),
  [`reliability-gates.ts`](../../packages/library/src/reliability-gates.ts),
  [`apiRouter.ts`](../../apps/studio/server/apiRouter.ts) (`storyGoGreen` / `adoptGates`),
  [`node-spec.ts`](../../packages/orchestrator/src/node-spec.ts) (`decisions`).
