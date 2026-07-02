---
id: "agent"
tier: story
title: "The agent runtime — the swappable leaf behind the PhaseAuthor seam"
outcome: "The spine hands a leaf one authoring slice and gets back an authored deliverable (or a fail-closed refusal) without caring which model runtime answered — the owned loop or the live Claude Agent SDK, both behind one seam that never observes red/green or reports a verdict."
status: proposed
proof_mode: UAT
# Near-root organism (ADR-0075, amended in degree by ADR-0138 §3): packages/agent's runtime deps are
# @anthropic-ai/* + zod + ONE @storytree package — @storytree/notice-board (pure zod, browser-safe),
# whose work-time claim primitive (workClaimRequest) the claim-at-spawn gate consumes
# (packages/agent/src/claim-gated-spawn.ts, the chat-subagent-spawn story's claim-gated-spawn
# capability — code hosted in this package under that story's declared edge, ADR-0004 forcing the
# spawn machinery here). "No claim, no subagent" made the claim primitive part of the agent's own
# spawning discipline, so the edge is genuine and declared. notice-board never imports agent — acyclic.
depends_on: [notice-board]
# The buildable capability set (ADR-0057): listing a capability id here is what makes the STORY
# story-level buildable — `isStoryBuildable` requires a non-empty, dependency-closed, acyclic set in
# which EVERY listed capability resolves a `real:` proof arm. ONLY the 3 proof-wired capabilities are
# listed. `phase-author-seam` (a pure type module — no standalone red→green) and `live-sdk-leaf` (an
# operator-attested live leg, and it depends_on the unwired phase-author-seam) carry NO `real:` arm, so
# they are deliberately UNLISTED — listing either would make `isStoryBuildable` return false for the
# whole story. The 3 form a closed set: model-runtime-seam (depends_on []), leaf-tool-surface
# (depends_on [model-runtime-seam]), owned-turn-loop (depends_on [model-runtime-seam, leaf-tool-surface]).
capabilities: [model-runtime-seam, leaf-tool-surface, owned-turn-loop]
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
# vocabulary port (68), ports-as-root-organisms (75) under which this leaf was a declared root, and
# the claim-at-spawn wall (138) whose "no claim, no subagent" gave the package its one outbound
# @storytree edge (notice-board's claim primitive).
decisions: [4, 11, 30, 35, 68, 75, 138]
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
`@storytree/agent` as a runtime dependency. So the consumer edges point **into** agent. Outbound it
carries exactly ONE edge: `agent → notice-board` (the claim-at-spawn gate consumes the work-time
claim primitive `workClaimRequest` — ADR-0138 §3's "no claim, no subagent" made the claim part of
the agent's own spawning discipline; direction test: the gate genuinely needs the claim primitive's
delivered outcome to spawn). `notice-board` (→ `library` → the protocol roots) never imports agent,
so no path returns from agent to any consumer and the graph stays acyclic (ADR-0058 §4). This is a
*near-root* shape: depended-upon-by-several, depending only on the pure claim/presence primitive —
`proof-protocol` and `library` remain the true roots.

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

The **buildable** column marks the split this story now carries. Three capabilities are **proof-wired**
(ADR-0057 — they carry a `proof:` block with a `real:` arm describing a genuine additive red→green
against the real `packages/agent/src` source) and are listed in the story's `capabilities:`
frontmatter; that closed, acyclic, every-cap-has-a-`real:`-arm set is exactly what makes the WHOLE
story story-`real`-buildable (`isStoryBuildable`, the studio Build button). Two are **authored but
intentionally unwired** — they cannot carry a genuine standalone red→green (see the note below the
table) — so they are NOT in the buildable set, kept honestly `mapped` as documented gaps.

| # | capability | outcome | status | buildable | depends on |
|---|---|---|---|---|---|
| 1 | [`model-runtime-seam`](model-runtime-seam.md) | The owned loop calls any model through one swappable seam and speaks one typed model-event vocabulary, with every `@anthropic-ai/sdk` import isolated to a single file. | mapped | **yes** (proof-wired) | — |
| 2 | [`phase-author-seam`](phase-author-seam.md) | The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS — it never observes red/green and never reports a verdict. | mapped | no (pure type module) | — |
| 3 | [`leaf-tool-surface`](leaf-tool-surface.md) | A leaf's tool calls dispatch through one executor to real local file tools whose every path is confined to the workspace, errors captured as tool results, never thrown. | mapped | **yes** (proof-wired) | `model-runtime-seam` |
| 4 | [`owned-turn-loop`](owned-turn-loop.md) | The owned loop runs a model↔tool turn to a natural stop and a step fail-closed: a malformed or wrong-shape result retries, then HALTS — never a forged success. | mapped | **yes** (proof-wired) | `model-runtime-seam`, `leaf-tool-surface` |
| 5 | [`live-sdk-leaf`](live-sdk-leaf.md) | The live Claude Agent SDK authors one slice per `query()` with write scope enforced fail-closed by a PreToolUse hook before any write lands, Bash absent from the tool surface, and red/green never the runtime's to report. | mapped | no (operator-attested live leg) | `phase-author-seam` |

**Why two capabilities stay unwired (honest gaps, not omissions).**

- **`phase-author-seam` is a pure type module.** `phase-author.ts` declares `AuthoringPhase`,
  `AuthorResult`, and the `PhaseAuthor` interface — no runtime, no test of its own to count (its own
  proof prose says exactly this). A pure type module has NO isolatable red→green: it is proven only
  THROUGH its two implementations (`ClaudeAgentAuthor`, and `OwnedLoopAuthor` in drive-machinery) and
  by the gate type-checking against it. There is no additive runtime assertion to fail-then-pass, so a
  `real:` arm would be a fake. It stays `mapped`, unwired.
- **`live-sdk-leaf` has an operator-attested live leg, and an unwired dependency.** Its DECISION
  functions are offline-proven (`decideWrite`, the prompt composition, the feedback doorbell), but its
  defining behaviour — a real subscription `query()` authoring a slice — is **operator-attested** from
  the drive-machinery dogfood, never a standing offline test (proving a live runtime needs the paid
  leaf). So it has no free, offline red→green to drive under the gate. It also `depends_on:
  [phase-author-seam]`, which is unwired, so dependency-closure would exclude it from the buildable set
  regardless. It stays `mapped`, unwired.

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

**Cross-story:** one outbound — `notice-board` (`claim-gated-spawn.ts`, hosted here by the
chat-subagent-spawn story, value-imports `workClaimRequest`; see the frontmatter note). Inbound: the `PhaseAuthor` seam (and the
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
>
> **Per-leg witness (ADR-0106).** The adopt pass resolves each leg's witness, never defaulting it onto
> the human: legs 1–4 and 6 are `witness: machine` — the package's own offline suite (`agent#gate-1`,
> `pnpm --filter @storytree/agent test`) demonstrably covers them, so Adopt observe-and-signs them. Leg
> 5 is `witness: human` — the live `query()` is experiential/operator-attested, with no standing offline
> test, so it (and it alone) awaits the operator's "I saw it work" (ADR-0082). No leg rests `either`.

**Goal —** Behind one `PhaseAuthor` seam, two runtimes each author a slice on demand, refusing every
out-of-scope write and never forging a success.

1. **The seam is runtime-agnostic.** _(witness: machine)_ A consumer holds a `PhaseAuthor` and calls
   `author("AUTHOR_TEST", prompt)`. **Success —** it returns `{ ok: true }` on a completed slice or
   `{ ok: false, error }` fail-closed, and the consumer never had to know which runtime answered.
   *(proven offline: `sdk-author.test.ts` exercises `ClaudeAgentAuthor.author` over an injected
   `queryFn`; the owned-loop side is `OwnedLoopAuthor`, mapped in drive-machinery.)*
2. **The model is swappable.** _(witness: machine)_ Drive the owned loop with a `ScriptedModel` (zero live calls);
   running past the scripted end is a LOUD error, never silent. **Success —** a turn runs to a
   natural stop with all `@anthropic-ai/sdk` imports confined to `model.ts`. *(proven:
   `model.test.ts`, `run-turn.test.ts`)*
3. **The tool surface is confined.** _(witness: machine)_ A leaf's file tool addresses a path outside the workspace.
   **Success —** the executor refuses with a `PathEscapeError` and the refusal returns as a tool
   result, never a thrown crash. *(proven: `fs-tools.test.ts` — path-escape + error-as-result;
   `tool-executor.test.ts` — unknown tool / throwing handler captured as `is_error`)*
4. **A step fails closed.** _(witness: machine)_ The model returns malformed or wrong-shape JSON. **Success —**
   `runStepValidated` retries, then HALTS to `ValidationFailed` — never reports a forged success.
   *(proven: `step.test.ts`)*
5. **The live runtime authors a real slice.** _(witness: human)_ `ClaudeAgentAuthor` runs one `query()`: write scope is
   enforced fail-closed by a PreToolUse hook BEFORE any write lands, Bash is absent from the tool
   surface (a shell write would bypass the scope hook), and red/green is never this runtime's to
   report. **Success —** the slice's deliverable is authored under scope, out-of-scope writes are
   recorded violations, and no verdict is claimed. *(write-scope DECISION proven offline:
   `sdk-author.test.ts` (`decideWrite`); the live `query()` leg is operator-attested — drive-machinery
   dogfood history, the SDK leaf authored real units red→green.)*
6. **Feedback is a doorbell, not a shell.** _(witness: machine)_ The spine exposes its proof/typecheck commands as
   bounded in-process MCP tools (`mcp__spine__run_proof` …). **Success —** the leaf can iterate
   write→run→fix, but it controls ZERO arguments (fixed commands), the output is feedback only, and
   the attested red/green stays the spine's own out-of-band runs after the leaf stops. *(proven:
   `sdk-author.test.ts` — `executeFeedback` / `formatFeedbackOutput`)*

End state — one seam, two runtimes, every honesty wall (path confinement, fail-closed steps, scoped
writes, no-self-verdict) held; the spine never named a model.

## Reliability Gates

The agent runtime is **brownfield** (`status: mapped`): its dominant behaviour is observationally
verified by a real, passing, OFFLINE suite (`pnpm --filter @storytree/agent test`, **70/70** —
`ScriptedModel` + an injectable `queryFn` keep every decision offline-testable, no DB, no API key, see
**Honest status**), but storytree's own prove-it-gate never DROVE those proofs red→green. So its honest
path off `mapped` is **not** a fail-closed `--real` Build over a mature artifact with no genuine live
red — it is the author-declared **reliability gates** below, observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
names (its decision d.3 retired the status-blind Build for `mapped` stories). Distinct from
`## Story UAT` above (the integrated, part-scripted/part-attested acceptance journey across two
runtimes): the gates are the author's **expandable reliability floor**, starting by adopting the
existing green suite and GROWING a `_(gate: build-tests)_` gate (a genuine red→green regression leg)
the moment observation proves insufficient — a real defect slips through, or the live SDK leg
(currently operator-attested) finally earns a standing offline test.

1. **The agent runtime's own suite is green** _(gate: observe)_ `pnpm --filter @storytree/agent test`.
   The spine runs it at a clean committed HEAD and OBSERVES it green — the `Model` seam + `ScriptedModel`
   (every `@anthropic-ai/sdk` import confined to `model.ts`), the owned turn loop, the fail-closed step
   runner (malformed result retries then HALTS, never a forged success), the confined file-tool surface
   (a path escape refused as a tool result, never a thrown crash), and the SDK leaf's `decideWrite`
   write-scope DECISION function all pass offline (no DB, no API key) — then signs an `adopted` verdict
   (`storytree gate run agent#gate-1 --pg`). This is the bulk of the leaf organism's mechanics
   (`packages/agent`). The genuinely live legs — a real subscription `query()`, the inner loop — stay
   operator-attested in the drive-machinery dogfood history (see **Honest status** and Story UAT leg 5),
   never a standing test in this package; they become a `build-tests` gate here if one is ever authored.

Adopting this gate flips the runtime off `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` stays `mapped`; the world's crown DERIVES green from the signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` AND this reliability gate is signed AND the Story UAT above is
attested — per-leg now (ADR-0106): Adopt observe-and-signs the five `machine` legs (1–4, 6) against
this same suite, and only leg 5 (`witness: human`) awaits the operator's "I saw it work" (ADR-0082).
The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-
driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up
([ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085). No single gate greens the story.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against the
real runtimes with the capabilities' integration tests and contracts green underneath. Why `mapped`
and what stays live-attested is pinned in **Honest status** and per capability — nothing here is
`healthy`: per ADR-0020, `healthy` is only ever DERIVED from signed verdicts, and this organism has
none yet. The next bootstrap rung toward `healthy` is authoring a `proof:` block per capability
(ADR-0057) so the spine can drive these offline suites red→green under its own gate.

### This story is now story-`real`-buildable (the first rung is taken)

That next rung is now PARTLY taken: three capabilities — `model-runtime-seam`, `leaf-tool-surface`,
`owned-turn-loop` — carry a `proof:` block with a `real:` arm and are listed in the story's
`capabilities:` frontmatter. They form a **dependency-closed, acyclic** set in which **every** member
resolves a `real:` arm, so `isStoryBuildable(agent, …, 'real')` is satisfied: the story can be driven
end to end with `pnpm storytree story build agent --real` (and the studio's story-level Build button,
PR #299/#300), which walks the three capabilities in dependency order through a genuine spine-observed
red→green.

Each `real:` arm is an **edits-existing** brownfield slice (ADR-0057 §3 expansion C), offline-verified
genuinely RED against the current source: the leaf authors a NEW regression test that FAILS against
`packages/agent/src` as it stands today, then EDITS the one existing source file to make it pass —
`StopReason` widened to admit the Messages API's `"refusal"` (`model-events.ts`), `edit_file` given an
opt-in `replace_all` (`fs-tools.ts`), and `TurnResult` surfacing the terminating `stopReason`
(`run-turn.ts`). Each slice's exact RED/GREEN and its rules live in that capability's `## Guidance`.

Because the `agent` story is **human-witnessed** (its `uat_witness` is absent → human; ADR-0040), the
story's own UAT node is **WITHHELD** from the real build — `isStoryBuildable` does not require a
machine-driven story UAT, and the integrated acceptance walkthrough above stays human/operator-attested
(part-scripted, part live-attested, per **Honest status**). So driving the three capabilities to a
signed verdict is exactly what makes the WHOLE story buildable; the story crown still awaits its human
witness. The two unwired capabilities (`phase-author-seam`, `live-sdk-leaf`) remain documented gaps —
they carry no genuine standalone red→green to drive (see **Capabilities (5)**), so they are not yet a
rung anyone can take.

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
