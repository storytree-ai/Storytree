# Layer 2 — the adoption proposal / classifier (ADR-0097 follow-on design)

> **Status: design, not built.** The captured design for the named follow-on of
> [ADR-0097](../decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — the
> middle of the three layers the brownfield proving process decomposes into. Settled with the owner in
> a design conversation 2026-06-23. **No Layer-2 code was written this session** (owner: "design only
> — capture + stop").
>
> **Calibration note (important):** this design was drafted assuming Layer 1 was unbuilt, but **Layer 1
> landed on `main` while it was being written** (PR #324, "feat(adopt): ADR-0097 Layer 1"), and
> **[ADR-0098](../decisions/0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)**
> (proposed) landed defining **Layer 3**. This doc has been reconciled to that reality. The three
> layers, per ADR-0098 §7:
>
> | Layer | What | State |
> |---|---|---|
> | **1** | the `proposed`-state model, `(covers:)` crown-coverage, the Adopt entry (flip + observe-and-sign) | **BUILT** (PR #324) |
> | **2** | the adoption proposal that **classifies each gap `observe` / `R1` / `R2`** + surfaces the key decisions | **THIS DESIGN** (unbuilt) |
> | **3** | the `build-tests`-capable inner loop that **consumes the classification** | **DESIGNED** (ADR-0098, proposed) |

## What this is

ADR-0097 decided that bringing a brownfield (`mapped`) story into the fold is a **proving process**:
`brown → proposed → green`, green **earned by real work, never flipped by a button**. Pressing
**Adopt** (now built) enters the process — it flips `mapped → proposed` and observe-and-signs the
already-green `observe` gates — but it does **not** analyse what the *untested* pockets need.

**Layer 2 is that analysis.** ADR-0098 §1 pins its job precisely:

> *"Classifying each gap into observe / R1 / R2 is the adoption-proposal's job (Layer 2); Layer 3
> consumes the classification."*

So Layer 2 produces, for a story being adopted, the honest answer to *"what does bringing this in
actually take?"* — a per-capability **classification** plus the **key decisions** the human must make.
The yardstick for "correct" is the authored prose in
[`stories/library/story.md`](../../stories/library/story.md) `## Proof` (it flags `seed-corpus-scripts`
as untested, the Pg transaction path as live-gated/unrun, several CLI branches as uncovered) — but the
mechanism should **DETECT** that boundary from the code + the `(covers:)` declarations, not trust the
prose.

## The classification (the Layer-2 ↔ Layer-3 contract)

Every capability / pocket of an adopted story lands in exactly one bucket. The taxonomy is
ADR-0098's (its §1 + the R1/R2 red taxonomy), which Layer 3's inner loop consumes:

| Bucket | Meaning | Earned by |
|---|---|---|
| **adopt-able (`observe`)** | covered by an honest `observe` gate over a green suite; OR untested-but-**correct-and-testable-as-is** (characterization) | `observeAndSign` → `adopted` verdict (Layer 1, built) |
| **`R1` — behavioural red** | untested AND incomplete/incorrect against its contract | the existing `editsExisting` red→green (ADR-0057) → a driven verdict |
| **`R2` — refactor-for-testability red** | untested, **correct, but untestable as-is** (entry-guarded `main()`, raw `Pool`, no seam) | a behaviour-preserving refactor introducing the seam → driven verdict + the regression wall (ADR-0098 — the genuinely-new mode) |

The mechanical half (detect *which* caps are uncovered) is a covers-diff; the judgment half (is the
uncovered code correct? testable-as-is?) is **agent analysis** — which is exactly the owner's flow
below, and exactly ADR-0098 §5's up-front decision sweep.

## Decisions settled this session (the four forks)

1. **Analysis rigor → structural now, empirical later.** Detect uncovered caps by diffing Layer 1's
   `(covers:)` declarations (now built,
   [`reliability-gates.ts`](../../packages/library/src/reliability-gates.ts) — the `covers: string[]`
   field) against the full capability set. Deterministic + offline. It **trusts** that a declared
   `observe` gate genuinely exercises the caps it covers. Real coverage *measurement* — to catch a
   gate whose suite only smoke-imports its code — is **named follow-on** (Node 24's built-in
   `node:test` coverage, needing a per-cap source-glob). This is the same vacuity gap ADR-0098 §2
   accepts for `net-new`/`R2`.

2. **Session scope → design only.** Settle the forks, capture (this doc), stop.

3. **Render surface → both, studio primary.** The classifier emits the proposal as **data**; the
   studio renders it (extending the already-built AdoptPanel), and a CLI report renders it for agents /
   offline / the orchestrator's own use.

4. **Bucket (c) the key decisions → spine detects, a story-writer agent analyses, durable artifacts
   are authored, the studio surfaces them; the machine never writes the decision log.** (Owner's
   refined model — the flow below. This **converges with ADR-0098 §5**'s batch decision-sweep:
   escalate **ownership, not uncertainty** — a fork is escalated iff it changes a public seam, picks
   between materially different strategies, or is cross-cutting/irreversible; an ADR-worthy fork →
   `adr new`, the resolutions thread into the build brief.)

## The flow (owner's refined model)

```
mapped story
   │  human presses ADOPT   ── BUILT (Layer 1): flip mapped→proposed, observe-and-sign the observe gates
   ▼
1. SPINE detects what it can (mechanical, structural — Fork 1): which caps are covered vs uncovered
   │
2. STORY-WRITER AGENT does the further analysis: classifies each uncovered cap observe / R1 / R2,
   │   and identifies the KEY design forks (the batch sweep, ADR-0098 §5 / owner-fork-bar)
   │
3. Durable LIBRARY ARTIFACTS authored: proposed ADRs + open-questions
   │   (`storytree adr new --pg`; `docs/open-questions.md` / the story's `## Open modeling calls`)
   │   — never an in-place decision-log write by the machine; a human owns accept / un-decide
   ▼
4. STUDIO details panel (the now-`proposed` node) shows:
      ├─ the classification (observe / R1 / R2) — extends the AdoptPanel's "what still owes real work"
      ├─ "Open Questions / Proposals" section (under UAT) — the OQs + proposed ADRs for this node
      └─ "Relevant ADRs" section — the node's `decisions:` ADRs   (NEW UI; data exists, UNPLUMBED)
   ▼
5. Pre-work clears (OQs resolved, proposals actioned) ── necessary, NOT sufficient for green
   ▼
6. BUILD the real work — Layer 3 (ADR-0098 U2): `gate run <story>#gate-N --real --pg` drives the
   R1/R2 red→green, signing a DRIVEN verdict for the gate. GREEN DERIVES from the signed verdicts
   (`rollupStoryGreen`). No button flips it; the build earns it.
```

### Why this is coherent with the (now-landed) model

- **Adopt is the on-ramp; the standard `proposed → Build` earns green.** Layer 2 doesn't invent a new
  green path. Once Adopt flips the story `proposed` (built), the classification routes each pocket: the
  `observe` ones are already signed `adopted`; the `R1`/`R2` ones become `build-tests` gates that
  Layer 3's `gate run --real` drives. The owner's instinct ("maybe then there is a build button")
  lands on [ADR-0094](../decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)'s
  `proposed → Build` + ADR-0098's `gate run --real`.
- **Two kinds of work, cleanly separated.** *Proposals / OQs = the pre-work* (decisions that must
  clear before the build is well-defined). *The build = the real work* (the red→green producing the
  signed verdicts). Resolving every OQ is **necessary but not sufficient** — `green = a signed verdict`
  ([ADR-0020](../decisions/0020-red-green-enforcement-on-the-owned-loop.md)) never bends.
- **Two surfaces, two actors.** The **studio** (hosted, read+comment; no agent runtime) does the
  *mechanical* part — the Adopt POST + rendering. The *deeper analysis + artifact authoring* (steps
  2–3) is a **Claude Code orchestrator / story-author session** task; the CLI report is the hand-off.
  The human owns the outer loop ([ADR-0030](../decisions/0030-all-in-on-claude-agent-sdk.md)).
- **Provenance stays honest** (ADR-0097 D4): the machine signs what it witnessed (spine principal on
  the `adopted` verdicts — built), the human owns what they decided (`approvedBy` + the escalated
  forks — `approvedBy` built).

## Components a Layer-2 build session would land (after Layer 1, alongside ADR-0098)

| # | Component | Package / surface | Notes |
|---|---|---|---|
| 1 | `AdoptionProposal` shape + the classifier compute | `@storytree/orchestrator` (proof/) | Reads a story's `NodeSpec` (caps + reliability gates + the built `covers`), returns the per-cap classification (observe / R1 / R2 + uncovered set). Pure-by-injection like `observeAndSign`; offline-testable; the red→green unit. **This is the Layer-2 ↔ Layer-3 contract** ADR-0098 U-series consumes. |
| 2 | CLI report `storytree story adopt-plan <id>` | `@storytree/cli` | Renders the proposal/classification as data. The story-author agent reads this to do step 2; overlaps ADR-0098 U4's batch-sweep surface — coordinate so they are one surface, not two. |
| 3 | Studio: render the classification in the AdoptPanel | `apps/studio` (`BuildSection`/`AdoptPanel`) | The Adopt button + framing exist (Layer 1); ADD the observe/R1/R2 classification of the untested pockets to "what still owes real work." |
| 4 | "Open Questions / Proposals" panel section | `apps/studio` details panel (under UAT) | Lists the OQs + proposed ADRs tied to the node. Needs the payload to carry them. |
| 5 | "Relevant ADRs" panel section | `apps/studio` details panel | **Data exists** (`NodeSpec.decisions`, ADR-0037), **confirmed still UNPLUMBED** to the studio (`TreeStory` has no `decisions`; the payload never sets `story.decisions`). Add it to the payload + render, linking the existing `Decisions`-group Library docs. |

## Already built (do NOT re-scope into Layer 2)

Verified on `main` 2026-06-23 (PR #324):
- `(covers:)` parse — [`reliability-gates.ts:57`](../../packages/library/src/reliability-gates.ts) (`covers: string[]`).
- `approvedBy` on the verdict — [`proof.ts:61`](../../packages/proof-protocol/src/proof.ts) (optional, `adopted`-only today).
- `SPINE_PRINCIPAL` signer — [`spine-principal.ts`](../../packages/orchestrator/src/proof/spine-principal.ts).
- `rollupStoryGreen` crown-coverage (a cap greens via an adopted gate that `(covers:)` it) — [`uat-proof.ts`](../../packages/orchestrator/src/proof/uat-proof.ts).
- The Adopt entry (`adoptStory`/`runAdopt`) — [`adopt.ts`](../../packages/cli/src/adopt.ts); flips `mapped → proposed`, observe-and-signs.
- The studio Adopt button + `/api/adopt` — [`BuildSection.tsx`](../../apps/studio/src/components/BuildSection.tsx) (`AdoptPanel`), [`apiRouter.ts`](../../apps/studio/server/apiRouter.ts).

## Open implementation questions (for the build session — not blocking the design)

- **Where does the observe/R1/R2 *judgment* live?** The covers-diff (uncovered set) is mechanical; the
  observe/R1/R2 call needs reasoning about the code. Recommendation: the classifier compute emits the
  mechanical uncovered set + a *slot* per cap; the story-author agent fills the classification +
  authors the artifacts (steps 2–3). Confirm the split so the pure compute stays offline-testable.
- **One sweep surface, or two?** Layer-2 component #2 (the CLI report) and ADR-0098 U4 (the batch
  decision-sweep) are the same surface viewed from two layers. Build them as one `adopt-plan`/sweep
  command, not two.
- **Live-derived vs persisted proposal?** Recommendation: live-derived (re-compute each load) — cheap
  and always reflects current `(covers:)` + verdict state.
- **Empirical coverage (Fork 1 follow-on)** — per-cap source-glob + Node coverage to flag a `(covers:)`
  gate whose suite barely touches its caps. Same vacuity follow-on ADR-0098 §2 names.

## References

- [ADR-0097](../decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) — the
  brown→proposed→green proving process; this is its named Layer 2.
- [ADR-0098](../decisions/0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md)
  (proposed) — Layer 3, the `build-tests` inner loop; **pins Layer 2's job** (classify observe/R1/R2)
  and the batch decision-sweep this design's bucket (c) converges with.
- [ADR-0085](../decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) —
  `observe` vs `build-tests` gate kinds; observe-and-sign → `adopted`.
- [ADR-0094](../decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) —
  `proposed → Build`, the path the build half feeds into.
- [ADR-0050](../decisions/0050-adr-number-allocation.md) — atomic ADR allocation (`adr new --pg`).
- `owner-fork-bar` principle (#318) — escalate ownership, not uncertainty (the bucket-(c) triage,
  shared with ADR-0098 §5).
