---
id: "agent"
tier: story
title: "The agent runtime — the swappable leaf behind the PhaseAuthor seam"
outcome: "The spine hands a leaf one authoring slice and gets back an authored deliverable (or a fail-closed refusal) without caring which model runtime answered — the owned loop or the live Claude Agent SDK, both behind one seam that never observes red/green or reports a verdict."
status: mapped
proof_mode: UAT
# Root organism (ADR-0075): packages/agent imports NO @storytree/* package — its only runtime deps
# are @anthropic-ai/* + zod (verified: packages/agent/package.json, and a grep of src for @storytree/
# finds only comments naming its CONSUMERS). It is a true root, the swappable model runtime the whole
# build machinery points at. depends_on: [] by construction.
depends_on: []
# Provider-side inbound edges (ADR-0074 §4 / ADR-0058 §3): the orchestrator (drive-machinery) and the
# cli HUB both import @storytree/agent as a RUNTIME dependency. The drive-machinery → agent edge is
# declared CONSUMER-side in stories/drive-machinery/story.md's depends_on (the edge that story's
# "PhaseAuthor seam is CONSUMED, not owned" section predicted it would gain). The cli → agent edge is
# declared HERE provider-side so the cli hub stays de-noised (the same pattern library / proof-protocol
# / drive-machinery use for their cli edge). The boundary gate (ADR-0074) covers a code edge when
# EITHER endpoint declares it.
consumed_by: [cli]
# Deciding ADRs (ADR-0037 §2): the owned loop on the raw Messages API (11), the single model-runtime
# import site (4), all-in on the Claude Agent SDK as the live leaf + the PhaseAuthor pivot seam (30),
# the leaf's bounded feedback tools (35), the organism rebuild that gave this package the model-event
# vocabulary port (68), and ports-as-root-organisms (75) under which this leaf is a declared root.
decisions: [4, 11, 30, 35, 68, 75]
---

# The agent runtime — the swappable leaf behind the PhaseAuthor seam

**Outcome —** The spine hands a leaf one authoring slice and gets back an authored deliverable (or a
fail-closed refusal) without caring which model runtime answered — the owned loop or the live Claude
Agent SDK, both behind one seam that never observes red/green or reports a verdict.

`packages/agent` is storytree's **leaf-runtime organism**: the model seam, the turn loop, the
fail-closed step runner, the real local file-tool surface, the model-event vocabulary port, and BOTH
`PhaseAuthor` implementations — the owned loop (ADR-0011: the offline/deterministic executor and the
pivot-out fallback) and the live `ClaudeAgentAuthor` on the Claude Agent SDK (ADR-0030). It is the
**single model-runtime import site** (ADR-0004, widened to this package): every `@anthropic-ai/*`
import lives here, behind the runtime-agnostic seam, so the rest of the system never names a model.

## Why this is its own organism (the modeling call this story settles)

This story exists because `stories/drive-machinery` deliberately did **not** own the leaf. That
story's section *"The PhaseAuthor seam is CONSUMED, not owned"* made the case and left authoring this
organism as open work; the live open-question `oq-agent-as-its-own-organism-story` posed it. Applying
the rules confirms the SPLIT:

- **The journey-principle (`journey-principle`, generalised to a *consumer* by ADR-0058 §6).** This
  organism's consumer is **the spine** (the deterministic orchestrator), which consumes the
  `PhaseAuthor` seam. The drive's journey — *drive a registered node red→green and land the proven
  commit* — does **not** lead its consumer to need the leaf's INTERNALS to get value: the spine needs
  the seam's *delivered outcome* (an authored slice), and is deliberately agnostic to which runtime
  produced it (ADR-0030 §2). Two organisms, one declared seam — the rainforest model (ADR-0010 §1):
  collaborating, each runnable in isolation against the boundary, behaviour duplicated not shared.
- **The splitting-rule (`splitting-rule`), both falsifiable triggers fire.**
  1. *The outcome cannot be stated without conjunctions across the two.* The drive's outcome is "the
     spine **drives** a node red→green and **lands** the proven commit"; this organism's is "a leaf
     **authors** one slice, runtime-agnostically, observing nothing." Folding them yields a
     conjunction ("the spine drives… AND a swappable leaf authors…") — a list, not one sentence.
  2. *The proofs share no common precondition + observable.* The drive's proof is a spine-observed
     red→green ladder on a committed tree; this organism's proof is *the leaf authored what it was
     asked, under its write scope, never claiming a verdict* — a different precondition (an authoring
     slice, not a tree state) and a different observable (a deliverable + fail-closed refusals, not an
     exit code). They are two walkthroughs, not one.
  - Tiebreakers also point split: a **separate rebuild brief** (rebuild the leaf from the seam +
    ADR-0030, with no knowledge of the gate's phase machine), and the **pivot-out fallback** (ADR-0030
    §2) is only *real* if the boundary is real — folding the runtimes into the drive would dissolve
    the seam that makes swapping runtimes possible.
- **The boundary it makes visible (ADR-0074 / the OQ's core point).** With the leaf folded into
  drive-machinery, the `orchestrator → agent` code edge was *intra-organism* and the boundary gate
  could not see one of the system's most important seams (deterministic spine ↔ swappable model
  runtime). Splitting promotes that documented intent into a **first-class declared, world-visible
  edge** — exactly what ADR-0074 exists to make routine.

## Direction & the no-cycle check (ADR-0058 §1, §4)

Run the direction test both ways. *Does the agent need drive-machinery's delivered outcome to author
a slice?* **No** — the leaf authors against a prompt + its tools; it never drives a gate, never reads
a verdict. *Does drive-machinery (and cli) need the agent's delivered outcome?* **Yes** — both import
`@storytree/agent` as a runtime dependency. So the edges point **into** agent (it is a sink), and
`agent depends_on: []`. No path returns from agent to any consumer, so the graph stays acyclic
(ADR-0058 §4). This is the *root-organism* shape (ADR-0058 §2): depended-upon-by-several, depending on
nothing — the same emergent shape as `proof-protocol` and `library`, earned by being depended upon,
not declared.

## Honest status

**`mapped` (brownfield), NOT `healthy`.** The organism's dominant behaviour is observationally
verified by a real, passing, OFFLINE suite (`pnpm --filter @storytree/agent test`): **70/70** on
2026-06-21 (no DB, no API key — `ScriptedModel` + an injectable `queryFn` keep every decision
offline-testable). Per `docs/glossary.md` that observational green is exactly brownfield `mapped`:
storytree's own prove-it-gate did not drive these red→green. `healthy` is non-authorable (ADR-0020) —
it is only ever DERIVED from signed verdicts, of which this organism has none. The authored frontmatter
`status:` stays `mapped`.

The recurring honesty shape, per capability: **offline-proven mechanics, live-attested-but-not-
standing-tested live legs.** The owned loop, the file-tool surface, the model seam, and the SDK
write-scope decision function are all offline-proven; the genuinely live legs — a real SDK `query()`,
the subscription-funded inner loop — are operator-attested in the drive-machinery dogfood history
(the SDK leaf authored real units there), never a standing test in this package.

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on). Edges are **within-story,
code-derived** (ADR-0010 §3) — read off the real `./`-imports between the source files, never
hand-drawn from UAT need. `mapped` = a real passing offline suite observationally verifies the
dominant behaviour.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`model-runtime-seam`](model-runtime-seam.md) | The owned loop calls any model through one swappable seam and speaks one typed model-event vocabulary, with every `@anthropic-ai/sdk` import isolated to a single file. | mapped | — |
| 2 | [`phase-author-seam`](phase-author-seam.md) | The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS — it never observes red/green and never reports a verdict. | mapped | — |
| 3 | [`leaf-tool-surface`](leaf-tool-surface.md) | A leaf's tool calls dispatch through one executor to real local file tools whose every path is confined to the workspace, errors captured as tool results, never thrown. | mapped | `model-runtime-seam` |
| 4 | [`owned-turn-loop`](owned-turn-loop.md) | The owned loop runs a model↔tool turn to a natural stop and a step fail-closed: a malformed or wrong-shape result retries, then HALTS — never a forged success. | mapped | `model-runtime-seam`, `leaf-tool-surface` |
| 5 | [`live-sdk-leaf`](live-sdk-leaf.md) | The live Claude Agent SDK authors one slice per `query()` with write scope enforced fail-closed by a PreToolUse hook before any write lands, Bash absent from the tool surface, and red/green never the runtime's to report. | mapped | `phase-author-seam` |

## Dependency graph (code-derived)

**Within-story** edges, read off the real `./` imports (ADR-0010 §3). The graph is acyclic;
`model-runtime-seam` and `phase-author-seam` are the roots. Type-only imports are counted (the
contract shape IS the coupling) and marked.

- `leaf-tool-surface` → `model-runtime-seam`
  - `fs-tools.ts` imports `ModelTool` (type) from `./model.js` and `ToolResultBlock`/`ToolUseBlock`
    (type) + `ToolExecutor` (type) — the file tools are described to the model as `ModelTool`s and
    dispatched through the executor's typed blocks; `tool-executor.ts` imports the same block types.
- `owned-turn-loop` → `model-runtime-seam`
  - `run-turn.ts` imports `Model`/`ModelMessage`/`ModelRequest` (type) + the model-event helpers
    `isTextBlock`/`isToolUseBlock` from `./model-events.js`; `step.ts` imports `Model` (type) and
    calls `runTurn` (`step.ts` → `./run-turn.js`).
- `owned-turn-loop` → `leaf-tool-surface`
  - `run-turn.ts` and `step.ts` both import `ToolExecutor` (type) — the loop drives tool calls
    through the executor surface the tool capability owns.
- `live-sdk-leaf` → `phase-author-seam`
  - `sdk-author.ts` imports `AuthoringPhase`/`AuthorResult`/`PhaseAuthor` (type) from
    `./phase-author.js` — `ClaudeAgentAuthor` IS an implementation of the seam; `sdk-curator.ts`
    imports `SdkQueryFn` from `./sdk-author.js` (the curator reuses the leaf's injectable query seam).

**Cross-story:** none outbound (`depends_on: []`). Inbound: the `PhaseAuthor` seam (and the
re-exported model-event vocabulary `port`) is consumed by `drive-machinery` (the spine's
`OwnedLoopAuthor`, the gate, the prove-spec resolver) and bound to `ClaudeAgentAuthor` in the CLI's
build path — declared as the drive-machinery `depends_on agent` edge and this story's `consumed_by:
[cli]`.

## This story's published interface (ADR-0010 §4)

The declared cross-story seam this organism exposes is the **`PhaseAuthor` executor seam**
(`phase-author.ts`): `author(phase, prompt) → AuthorResult`, plus the model-event vocabulary `port`
(`model-events.ts`, re-exported from the package index) that the orchestrator consumes to read tool
blocks. A consumer (the spine) depends on this seam as a TYPE and binds a concrete runtime at the
injection layer — exactly where a seam SHOULD meet an implementation (drive-machinery's
`prove-spec-resolution` is the one place `ClaudeAgentAuthor` is a VALUE import). The seam's contract:
a `PhaseAuthor` only AUTHORS inside the two authoring phases (`AUTHOR_TEST` / `IMPLEMENT`); it never
observes red/green and never reports a verdict — the spine keeps every honesty property OUTSIDE the
leaf (ADR-0020).

## Story UAT

The integrated **acceptance walkthrough** proving the organism's outcome end to end: a spine drives
the SAME two authoring slices through TWO different runtimes behind one seam and gets an authored
deliverable each time, with every honesty wall held.

> **HONEST status — `mapped`, no single scripted UAT spans the whole journey live.** The offline
> legs (1–4, 6) are automated TODAY by the package's own suite (citations inline). Leg 5 — a REAL
> SDK `query()` authoring against a live subscription — is **operator-attested** history from the
> drive-machinery dogfood (the live leaf authored real units red→green there), not a standing test in
> this package: proving a live runtime needs the paid leaf, so the offline path scripts the seam +
> the write-scope decision only. This UAT is therefore part-scripted, part-attested — exactly the
> drive-machinery honesty pattern.

**Goal —** Behind one `PhaseAuthor` seam, two runtimes each author a slice on demand, refusing every
out-of-scope write and never forging a success.

1. **The seam is runtime-agnostic.** A consumer holds a `PhaseAuthor` and calls
   `author("AUTHOR_TEST", prompt)`. **Success —** it returns `{ ok: true }` on a completed slice or
   `{ ok: false, error }` fail-closed, and the consumer never had to know which runtime answered.
   *(proven offline: `sdk-author.test.ts` exercises `ClaudeAgentAuthor.author` over an injected
   `queryFn`; the owned-loop side is `OwnedLoopAuthor`, mapped in drive-machinery.)*
2. **The model is swappable.** Drive the owned loop with a `ScriptedModel` (zero live calls);
   running past the scripted end is a LOUD error, never silent. **Success —** a turn runs to a
   natural stop with all `@anthropic-ai/sdk` imports confined to `model.ts`. *(proven:
   `model.test.ts`, `run-turn.test.ts`)*
3. **The tool surface is confined.** A leaf's file tool addresses a path outside the workspace.
   **Success —** the executor refuses with a `PathEscapeError` and the refusal returns as a tool
   result, never a thrown crash. *(proven: `fs-tools.test.ts` — path-escape + error-as-result;
   `tool-executor.test.ts` — unknown tool / throwing handler captured as `is_error`)*
4. **A step fails closed.** The model returns malformed or wrong-shape JSON. **Success —**
   `runStepValidated` retries, then HALTS to `ValidationFailed` — never reports a forged success.
   *(proven: `step.test.ts`)*
5. **The live runtime authors a real slice.** `ClaudeAgentAuthor` runs one `query()`: write scope is
   enforced fail-closed by a PreToolUse hook BEFORE any write lands, Bash is absent from the tool
   surface (a shell write would bypass the scope hook), and red/green is never this runtime's to
   report. **Success —** the slice's deliverable is authored under scope, out-of-scope writes are
   recorded violations, and no verdict is claimed. *(write-scope DECISION proven offline:
   `sdk-author.test.ts` (`decideWrite`); the live `query()` leg is operator-attested — drive-machinery
   dogfood history, the SDK leaf authored real units red→green.)*
6. **Feedback is a doorbell, not a shell.** The spine exposes its proof/typecheck commands as
   bounded in-process MCP tools (`mcp__spine__run_proof` …). **Success —** the leaf can iterate
   write→run→fix, but it controls ZERO arguments (fixed commands), the output is feedback only, and
   the attested red/green stays the spine's own out-of-band runs after the leaf stops. *(proven:
   `sdk-author.test.ts` — `executeFeedback` / `formatFeedbackOutput`)*

End state — one seam, two runtimes, every honesty wall (path confinement, fail-closed steps, scoped
writes, no-self-verdict) held; the spine never named a model.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against the
real runtimes with the capabilities' integration tests and contracts green underneath. Why `mapped`
and what stays live-attested is pinned in **Honest status** and per capability — nothing here is
`healthy`: per ADR-0020, `healthy` is only ever DERIVED from signed verdicts, and this organism has
none yet. The next bootstrap rung toward `healthy` is authoring a `proof:` block per capability
(ADR-0057) so the spine can drive these offline suites red→green under its own gate.

## Open modeling calls (for the owner)

1. **Capability granularity.** Five capabilities split by the within-story code seam (model /
   tool-surface / turn-loop / phase-author / sdk-leaf). The `model-runtime-seam` bundles the `Model`
   seam + the model-event vocabulary `port`; splitting the published model-event `port` into its own
   sub-capability (the way `proof-protocol` is a pure published shape) is an option if a real defect
   makes it worth proving on its own.
2. **The owned loop's two homes.** `packages/agent` owns the owned-loop *building blocks*
   (`model` / `run-turn` / `step` / `tool-executor` / `fs-tools`); the spine-side composition
   `OwnedLoopAuthor` lives in `packages/orchestrator` and is mapped in `drive-machinery` as
   `owned-loop-phase-author` — the drive owns its side of the seam, this organism owns the loop
   behind it. That split is deliberate (it keeps the seam real); flagged here so it is visible, not
   hidden.
