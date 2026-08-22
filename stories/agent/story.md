---
id: "agent"
tier: story
title: "The agent runtime — the swappable leaf behind the PhaseAuthor seam"
outcome: "The spine hands a leaf one authoring slice and gets back an authored deliverable (or a fail-closed refusal) without caring which model runtime answered — the owned loop, the live Claude Agent SDK, or the live ChatGPT-funded Codex runtime, all behind one seam that never observes red/green or reports a verdict."
status: proposed
proof_mode: UAT
# Root of the story graph by ADR-0075's own test — `depends_on: []` — though this is a domain
# organism, not a published port: packages/agent's runtime deps are @anthropic-ai/* + @openai/codex +
# zod and NO @storytree package at all, so this story carries no outbound cross-story edge. It carried
# exactly one until ADR-0175 retired the in-app spawn surface: `agent → notice-board`, hosted by the
# claim-at-spawn gate (packages/agent/src/claim-gated-spawn.ts, the chat-subagent-spawn story's now
# `retired` claim-gated-spawn capability). That file is DELETED and held gone by
# apps/desktop/src/backend/spawn-surface-retired.test.ts, and nothing under packages/agent/src imports
# @storytree/notice-board today — not in value, not in type. The one surviving pre-spawn seam,
# spawn-claim.ts, DECLARES its own claim shapes rather than importing them; that decoupling is
# deliberate, and the seam is owned by the wisp-as-story-claim story (which declares its own
# notice-board edge), not by this one. With zero outbound edges no cycle through this story is
# possible at all.
depends_on: []
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
# import site (4), the Claude Agent SDK live leaf + the PhaseAuthor pivot seam (30), the leaf's
# bounded feedback tools (35), the organism rebuild that gave this package the model-event vocabulary
# port (68), ports-as-root-organisms (75) under which this leaf was a declared root, the retirement of
# the Cursor second-harness leaf (198, superseding 177), and the ChatGPT-funded Codex second live leaf
# (232, superseding 198 while preserving the Cursor retirement). ADR-0138's claim-at-spawn wall is
# deliberately NOT listed: it decided the spawn gate, never this organism's outcome, and ADR-0175
# deleted that gate. It stays a deciding ADR on the units whose code it really decides
# (wisp-as-story-claim, chat-subagent-spawn, spawn-visibility, scoped-glue-actuator); packages/agent
# only ever HOSTED some of that code.
decisions: [4, 11, 30, 35, 68, 75, 232]
---

# The agent runtime — the swappable leaf behind the PhaseAuthor seam

**Outcome —** The spine hands a leaf one authoring slice and gets back an authored deliverable (or a
fail-closed refusal) without caring which model runtime answered — the owned loop, the live Claude
Agent SDK, or the live ChatGPT-funded Codex runtime, all behind one seam that never observes
red/green or reports a verdict.

`packages/agent` is storytree's **leaf-runtime organism**: the model seam, the turn loop, the
fail-closed step runner, the real local file-tool surface, the model-event vocabulary port, and both
live `PhaseAuthor` implementations — `ClaudeAgentAuthor` on the Claude Agent SDK (the compatibility
default) and `CodexPhaseAuthor` on the official Codex CLI using saved ChatGPT authentication
(`--runtime codex`, default model `gpt-5.6-terra`; ADR-0232). The owned loop remains the
offline/deterministic executor and pivot-out fallback (ADR-0011), adapted to the same seam by
`OwnedLoopAuthor` in drive-machinery. This package is the **single model-runtime import site**
(ADR-0004, widened here): the third-party runtime imports live behind the runtime-agnostic seam, so
the deterministic spine never names a model.

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
carries **ZERO** edges — `depends_on: []`. Every edge points in and none points out, so the no-cycle
check here is not a check but a structural guarantee: a story with no outbound edge cannot sit on a
cycle, whatever the rest of the graph does (ADR-0058 §4).

That is a **stronger** claim than the *near-root* shape this section used to describe, not a weaker
one. The leaf depends on no storytree organism at all — its runtime deps are `@anthropic-ai/*`,
`@openai/codex` and `zod` — so it satisfies ADR-0075's own root test (`depends_on: []`) while
remaining a domain organism rather than a published port. `proof-protocol` and `library` are still the
roots the rest of the system rests **on**, which is a different property from having nothing beneath
you; this organism is depended-upon-by-several and depends on nothing.

It held one outbound edge until ADR-0175 retired the in-app spawn surface: `agent → notice-board`,
taken by the claim-at-spawn gate, which consumed the work-time claim primitive `workClaimRequest`
under ADR-0138 §3's "no claim, no subagent". That gate's file was deleted with the rest of the spawn
surface, and the edge went with it — no file under `packages/agent/src` imports
`@storytree/notice-board` today, in value or in type. The pre-spawn seam that survives,
`spawn-claim.ts`, mirrors notice-board's claim shapes deliberately instead of importing them, and it
belongs to the `wisp-as-story-claim` story, which declares that edge itself. Re-declaring it here —
bare or annotated — would name an import that does not exist and duplicate an edge its real owner
already carries.

## Honest status

**Greenfield in origin, with historical signed verdicts since 2026-06-26.** The organism's dominant behaviour is
observationally verified by a real, passing, OFFLINE suite (`pnpm --filter @storytree/agent test`):
**189/189** on 2026-07-26 (no DB, no API key — `ScriptedModel`, an injectable `queryFn`, and an
injectable Codex runner keep runtime decisions offline-testable). The code was built inside Storytree;
its later work-hierarchy registration does not make it inherited brownfield (ADR-0395). Without a
current signed pass, each capability's honest authored baseline is `proposed`.

*(Scope note 2026-07-26 — three claims in this paragraph were stale and are corrected in place. The
suite count was **70/70 on 2026-06-21**; it is now 189/189, re-run at this date. The former `mapped` basis
cited `docs/glossary.md`, which ADR-0135 RETIRED — the definitions are authoritative in the Library
(`storytree library artifact mapped`), so the dead pointer is dropped rather than re-aimed. And the
claim that this organism has **no signed verdicts** is now FALSE: the live store holds 25
`events.verdict` rows for `agent#*`, including the 6 `adopted` verdicts the 2026-06-26 adopt pass
signed — `agent#gate-1` and legs 1–4, 6, each `approvedBy: hua.mick@gmail.com` — plus the
`operator-attested` verdict on leg 5 discussed under `## UAT Test Criteria`. `healthy` remains
non-authorable (ADR-0020): it is only ever DERIVED from those verdicts, never written here. The
authored frontmatter `status:` accordingly reads **`proposed`**. Commit `e21ee4d4` made that earlier
change during an Adopt pass; ADR-0395 now establishes the same baseline from greenfield provenance,
independent of registration order or that historical ceremony.)*

The recurring honesty shape, per capability: **offline-proven mechanics, live-attested-but-not-
standing-tested live legs.** The owned loop, the file-tool surface, the model seam, and both live
leaves' authentication/result/scope decisions are offline-proven; the genuinely live SDK/CLI
subscription invocations remain need-gated, never a standing test in this package.

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on). Edges are **within-story,
code-derived** (ADR-0010 §3) — read off the real `./`-imports between the source files, never
hand-drawn from UAT need. A passing offline suite is evidence, not provenance: these greenfield
capabilities stay `proposed` unless a current signed pass derives green (ADR-0395).

The **buildable** column marks the split this story now carries. Three capabilities are **proof-wired**
(ADR-0057 — they carry a `proof:` block with a `real:` arm describing a genuine additive red→green
against the real `packages/agent/src` source) and are listed in the story's `capabilities:`
frontmatter; that closed, acyclic, every-cap-has-a-`real:`-arm set is exactly what makes the WHOLE
story story-`real`-buildable (`isStoryBuildable`, the studio Build button). Two are **authored but
intentionally unwired** — they cannot carry a genuine standalone red→green (see the note below the
table) — so they are NOT in the buildable set, kept honestly `proposed` as documented gaps.

| # | capability | outcome | status | buildable | depends on |
|---|---|---|---|---|---|
| 1 | [`model-runtime-seam`](model-runtime-seam.md) | The owned loop calls any model through one swappable seam and speaks one typed model-event vocabulary, with every `@anthropic-ai/sdk` import isolated to a single file. | proposed | **yes** (proof-wired) | — |
| 2 | [`phase-author-seam`](phase-author-seam.md) | The spine drives a leaf through one runtime-agnostic surface that only ever AUTHORS — it never observes red/green and never reports a verdict. | proposed | no (pure type module) | — |
| 3 | [`leaf-tool-surface`](leaf-tool-surface.md) | A leaf's tool calls dispatch through one executor to real local file tools whose every path is confined to the workspace, errors captured as tool results, never thrown. | proposed | **yes** (proof-wired) | `model-runtime-seam` |
| 4 | [`owned-turn-loop`](owned-turn-loop.md) | The owned loop runs a model↔tool turn to a natural stop and a step fail-closed: a malformed or wrong-shape result retries, then HALTS — never a forged success. | proposed | **yes** (proof-wired) | `model-runtime-seam`, `leaf-tool-surface` |
| 5 | [`live-sdk-leaf`](live-sdk-leaf.md) | The live Claude Agent SDK authors one slice per `query()` with write scope enforced fail-closed by a PreToolUse hook before any write lands, Bash absent from the tool surface, and red/green never the runtime's to report. | proposed | no (operator-attested live leg) | `phase-author-seam` |

**Why two capabilities stay unwired (honest gaps, not omissions).**

- **`phase-author-seam` is a pure type module.** `phase-author.ts` declares `AuthoringPhase`,
  `AuthorResult`, and the `PhaseAuthor` interface — no runtime, no test of its own to count (its own
  proof prose says exactly this). A pure type module has NO isolatable red→green: it is proven only
  THROUGH its three implementations (`ClaudeAgentAuthor`, `CodexPhaseAuthor`, and `OwnedLoopAuthor`
  in drive-machinery) and
  by the gate type-checking against it. There is no additive runtime assertion to fail-then-pass, so a
  `real:` arm would be a fake. It stays `proposed`, unwired.
- **`live-sdk-leaf` has an operator-attested live leg, and an unwired dependency.** Its DECISION
  functions are offline-proven (`decideWrite`, the prompt composition, the feedback doorbell), but its
  defining behaviour — a real subscription `query()` authoring a slice — is **operator-attested** from
  the drive-machinery dogfood, never a standing offline test (proving a live runtime needs the paid
  leaf). So it has no free, offline red→green to drive under the gate. It also `depends_on:
  [phase-author-seam]`, which is unwired, so dependency-closure would exclude it from the buildable set
  regardless. It stays `proposed`, unwired.

> **The Cursor second-harness leaf remains RETIRED (ADR-0198, superseding ADR-0177; subsequently
> superseded by ADR-0232 without reversing that retirement).** The former
> `cursor-sdk-leaf` capability (a read-only Cursor SDK admission handshake) and its `@cursor/sdk`
> machinery are removed — Cursor was a metered API billing path, not a subscription-funded harness, so
> no Storytree surface may invite Cursor API spend. ADR-0232 supplies the fresh decision and explicit
> funding model that ADR-0198 required: `ClaudeAgentAuthor` remains the compatibility default, while
> `CodexPhaseAuthor` is an explicit `--runtime codex` live leaf funded only through saved
> ChatGPT-managed authentication. No replacement Cursor work is planned here.

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
- The second live implementation also consumes `phase-author-seam`: `codex-author.ts` implements
  `CodexPhaseAuthor` over the official Codex CLI. It is selected explicitly at the injection layer,
  without changing the Claude-specific `live-sdk-leaf` capability above.

**Cross-story:** **none outbound** — `depends_on: []`. No source file in this package imports another
storytree organism, in value or in type; the one edge this story used to carry went with the
claim-at-spawn gate ADR-0175 deleted (see **Direction & the no-cycle check**). Inbound: the `PhaseAuthor` seam (and the
re-exported model-event vocabulary `port`) is consumed by `drive-machinery` (the spine's
`OwnedLoopAuthor`, the gate, the prove-spec resolver) and bound to either `ClaudeAgentAuthor` (the
compatibility default) or `CodexPhaseAuthor` (`--runtime codex`) in the CLI's build path — declared
as the drive-machinery `depends_on agent` edge and this story's `consumed_by: [cli]`.

## This story's published interface (ADR-0010 §4)

The declared cross-story seam this organism exposes is the **`PhaseAuthor` executor seam**
(`phase-author.ts`): `author(phase, prompt) → AuthorResult`, plus the model-event vocabulary `port`
(`model-events.ts`, re-exported from the package index) that the orchestrator consumes to read tool
blocks. A consumer (the spine) depends on this seam as a TYPE and binds a concrete runtime at the
injection layer — exactly where a seam SHOULD meet an implementation (drive-machinery's
`prove-spec-resolution` is the one place the selected live author is bound). The seam's contract: a
`PhaseAuthor` only AUTHORS inside the two authoring phases (`AUTHOR_TEST` / `IMPLEMENT`); it never
observes red/green and never reports a verdict — the deterministic spine remains the sole
red/green/verdict authority and keeps every honesty property OUTSIDE the leaf (ADR-0020).

## UAT Test Criteria

The integrated **acceptance walkthrough** proving the organism's outcome end to end: a spine drives a
real authoring slice through a selected runtime behind one seam and gets an authored deliverable, with
every honesty wall held.

**Goal —** Behind one `PhaseAuthor` seam, the selected runtime authors a slice on demand, refusing every
out-of-scope write and never forging a success.

One leg. The other five were **properties of modules, not steps in a journey** — ADR-0294 D1 names this
story's own leg 1 (*"the seam is runtime-agnostic"*) as its worked example of the shape that does not
belong in a UAT section — and each was bound to `pnpm --filter @storytree/agent test`, the same command
that greens its own capability. They were deleted on 2026-08-03 with the proving node named per
criterion (table below; `stories/uat-legacy-dispositions.json` records them `superseded`).

The five deleted criteria and the node that already proves each, for audit:

| deleted criterion | claim | proven at |
| --- | --- | --- |
| `uatc_022a155228bc9924c4875e84` | *the seam is runtime-agnostic* — `author("AUTHOR_TEST", …)` returns `{ok:true}` or fail-closed `{ok:false,error}` and the consumer never knows which runtime answered | [`phase-author-seam`](phase-author-seam.md) (capability) — `sdk-author.test.ts` over an injected `queryFn`, `codex-author.test.ts` over an injected runner; observed by gate-1. **ADR-0294 D1's named example of a property, not a journey step** |
| `uatc_06cc2a84373bb97a0aa7e0ae` | *the model is swappable* — `ScriptedModel` drives the owned loop with zero live calls, running past the scripted end is a LOUD error, `@anthropic-ai/sdk` imports confined to `model.ts` | [`model-runtime-seam`](model-runtime-seam.md) (capability) — `model.test.ts`, `run-turn.test.ts`; observed by gate-1 |
| `uatc_87dfb002958176d8e4b566ea` | *the tool surface is confined* — a path outside the workspace is refused with `PathEscapeError` returned as a tool result, never a thrown crash | [`leaf-tool-surface`](leaf-tool-surface.md) (capability) — `fs-tools.test.ts` (path-escape + error-as-result), `tool-executor.test.ts` (unknown tool / throwing handler captured as `is_error`); observed by gate-1 |
| `uatc_07ab4bbca22ca84a6772c53e` | *a step fails closed* — malformed/wrong-shape model JSON makes `runStepValidated` retry then HALT to `ValidationFailed`, never a forged success | [`owned-turn-loop`](owned-turn-loop.md) (capability) — `step.test.ts`; observed by gate-1 |
| `uatc_bf5fccace84b18f4b3615108` | *feedback is a doorbell, not a shell* — bounded in-process MCP tools, leaf controls ZERO arguments, output is feedback only, attested red/green stays the spine's out-of-band runs | [`live-sdk-leaf`](live-sdk-leaf.md) (capability) — `sdk-author.test.ts` (`executeFeedback` / `formatFeedbackOutput`); observed by gate-1 |

Every assertion above still runs under `pnpm --filter @storytree/agent test` and every capability still
greens on it — the deletion removed a second signature at the story rung, not the evidence.

> **The surviving leg's witness is an OPEN OWNER CALL and was deliberately NOT changed by this pass.**
> Leg 5 above is `agent#uat-5`. Its `witness: human` tag, its `uatc_` identity and its revision are
> all carried forward untouched, and under
> ADR-0253 its
> list position is not its identity. *(Corrected in place 2026-08-22, ADR-0139. This read "Leg 1
> above is the former `agent#uat-5` … only its list position moved": the 2026-08-03 pass renumbered
> the survivor from 5 down to 1 to close the gap its four deletions left. Renumbering is genuinely
> free at the CRITERION tier — id, revision and `(proof-gate:)` all survive it, which is why it
> looked safe — but not at the LEDGER, where `agent#uat-1` was superseded the same day for the
> deleted `uatc_022a155228bc9924c4875e84`, so two criteria answered to one frozen key. The ordinal is
> restored to 5 and the gap is kept. This is the rule gate-2 below already states for gate ids — a
> spent positional key is only ever left spent — and it is now enforced by
> `packages/library/src/burned-ordinal-collision.ts` rather than left to reading.)* The record it
> needs:
>
> - **Two signed rows exist against the legacy positional key `agent#uat-5`** — `events.attestation`
>   seq 7 (`outcome: pass`, `witness: human`, signer `operator`, `relayed_by` NULL, 2026-06-26T13:37:41Z,
>   no note), and an `operator-attested` PASS verdict (`runId`
>   `studio-uat-attest:2026-06-26T13:47:08.024Z`, commit `e21ee4d4`, signer `operator`, no `approvedBy`,
>   evidence exactly `[{ ref: "operator", kind: "operator-attested" }]`). `operator` is the studio's
>   fallback signer on open localhost dev (`apps/studio/server/apiRouter.ts`), not a person, so the walk
>   behind them is unrecorded.
> - **Neither row grants green today.** This section previously stated that
>   `apps/studio/data/unit-status.json` derives `agent#uat-5 → healthy` from that verdict. That is no
>   longer true and is corrected in place per ADR-0139: since the ADR-0253 cutover the file carries
>   *"Legacy positional UAT ids are preserved history and intentionally omitted from current"*, and
>   `agent#uat-5` appears nowhere in it. The leg holds **no proof credit**, exactly as ADR-0294 records
>   for all 282 criteria. Deleting this story's other five legs therefore stranded nothing.
> - **The claim under those rows had already broadened** before this pass: at commit `e21ee4d4` the leg
>   was Claude-only; the ADR-0232 Codex leaf widened it on 2026-07-24. Same claim, widened — not the
>   `embedded-terminal#uat-5` renumbering failure (PR #916).
>
> **THE OWNER HAS PICKED, AND OPTION (iii) IS TAKEN — ADR-0348
> D7 (2026-08-11), executed here 2026-08-12.** This note previously read *"the remedy remains the
> owner's, and no agent may pick it"*, and listed three standing options without preference. It is
> corrected in place (ADR-0139) because the call has been made, not because the reasoning changed.
>
> The owner's question that opened ADR-0348 was asked OF THIS LEG: *"just because we have prev human
> uat signed rows is not a reason to keep them human."* His answer — prior signed state is not a
> reason, and the label should mean what it says — is exactly the third option named above: **the leg
> is re-adjudicated to `machine` as a coordinated change that also SUPERSEDES the two `operator` rows.**
> Those rows are superseded deliberately, with the owner's ruling behind it; they are not preserved,
> and they were never granting green (see the bullet above — the leg held no proof credit either way).
>
> The merits were never in dispute and are unchanged: every clause of the success condition compiles,
> both leaves are subscription-funded rather than metered, and under
> `human-witness-is-a-judgment-gap-not-cost` a harness/cost statement is not a judgment gap — a reading
> ADR-0295
> D1/D5 strengthens. What blocked the flip was never the merits; it was that ADR-0295 D1's model-driven
> executor was **decided but unbuilt**, so a flipped leg would have had nowhere to earn green. That
> executor landed 2026-08-12 (`packages/drive/src/uat-drive*.ts`, PR #1291), and the leg is flipped in
> the same change that binds it to `agent#gate-2` — ADR-0348 D5's ordering, honoured.
>
> **This does NOT generalise to `wisp-as-story-claim`'s open call 1** — *does an owner attestation carry
> forward onto a changed leg?* That call concerns a genuine TASTE leg and stays open and owner-owned.
> What is settled here is narrower: a leg that was never a judgment gap does not stay `human` merely
> because signed rows exist against it.


5. **The selected live runtime authors a real slice.** _(witness: machine)_ _(proof-gate: agent#gate-2)_ With Claude as the _(criterion-id: uatc_027e3e8ad2253d327fc15c07)_ _(revision-id: uatr1:380a683e4995990d)_ _(previous-revision-id: uatr1:b7b5052c7e21a3a2)_
   compatibility default or Codex selected explicitly via `--runtime codex`, the leaf runs one
   subscription-funded invocation. **Success —** phase scope is enforced before any write lands,
   out-of-scope writes are recorded violations, and no red/green claim or verdict is accepted from
   the leaf; the spine reruns the registered command out of band. *(write-scope decisions proven
   offline in `sdk-author.test.ts` and `codex-author.test.ts`; live invocations are need-gated.)*

End state — one seam, three runtime implementations, every honesty wall (path confinement, fail-closed
steps, scoped writes, no-self-verdict) held; the spine never named a model.
## Reliability Gates

The agent runtime is **greenfield in origin**. Its dominant behaviour is observationally
verified by a real, passing, OFFLINE suite (`pnpm --filter @storytree/agent test`, **189/189** on
2026-07-26, was 70/70 —
`ScriptedModel`, an injectable `queryFn`, and an injectable Codex runner keep runtime decisions
offline-testable, no DB, no API key, see **Honest status**). Those tests and the historical adopted
verdicts remain evidence, but neither implementation-before-registration nor absence of a gate-driven
red makes the organism brownfield (ADR-0395). Its authored baseline is therefore `proposed`; the
reliability gates below remain the declared evidence surface and do not establish provenance. Distinct from
`## UAT Test Criteria` above (the integrated, part-scripted/part-attested acceptance journey across
the runtime implementations): the gates are the author's **expandable reliability floor**, observing the
existing green suite and GROWING a `_(gate: build-tests)_` gate (a genuine red→green regression leg)
the moment observation proves insufficient — a real defect slips through, or a live subscription leg
(currently operator-attested) finally earns a standing offline test.

1. **The agent runtime's own suite is green** _(gate: observe)_ `pnpm --filter @storytree/agent test`.
   The spine runs it at a clean committed HEAD and OBSERVES it green — the `Model` seam + `ScriptedModel`
   (every `@anthropic-ai/sdk` import confined to `model.ts`), the owned turn loop, the fail-closed step
   runner (malformed result retries then HALTS, never a forged success), the confined file-tool surface
   (a path escape refused as a tool result, never a thrown crash), and both live leaves'
   authentication/result/scope decisions all pass offline (no DB, no API key) — then signs an `adopted` verdict
   (`storytree gate run agent#gate-1 --pg`). This is the bulk of the leaf organism's mechanics
   (`packages/agent`). The genuinely live SDK/CLI subscription invocations stay need-gated (see
   **Honest status** and Story UAT leg 5), never a standing test in this package; they become a
   `build-tests` gate here if one is ever authored.
2. **UAT leg 5 — the live runtime authored a real slice, driven end to end** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts agent uatc_027e3e8ad2253d327fc15c07`.
   **APPENDED 2026-08-12 (ADR-0348 D1/D5/D7). Gate-1 above is untouched and keeps its ordinal** — gate
   ids are positional, so a gate is only ever APPENDED; inserting one would silently re-point gate-1's
   already-signed `adopted` verdict and every `(proof-gate:)` binding naming it.
   This gate is what gave Story UAT leg 5 somewhere to earn green, which is the whole reason the flip
   waited: ADR-0295 D1 admitted a model driver's report as a verdict from 2026-08-03, but no executor
   existed for that sentence until 2026-08-12. It witnesses a persisted `events.uat_drive` record — a
   fresh subscription-funded session that ran `node build <id> --live` for real and watched the leaf
   author a red test then a green implementation under phase-enforced write scope, with the spine's own
   out-of-band runs deciding red/green. It carries no `(covers:)`: it proves a JOURNEY, not a
   capability, and adding it to one would let an observe-and-sign adopt pass green a capability that
   never went red (ADR-0085 / ADR-0097).
   **It does not drive and it does not spend.** The drive is deliberately out-of-band — `pnpm --filter
   @storytree/drive exec node --import tsx src/uat-drive.run.ts agent uatc_027e3e8ad2253d327fc15c07` —
   which ADR-0010 §5 keeps off every gate path, exactly as `dogfood-probe.run.ts` is. The spine still
   mints the verdict over the exit code IT watched, so ADR-0295 D2's *no model signs its own verdict*
   holds with the signing path unchanged.
   It goes red — honestly — when no `pass` record exists at the criterion's CURRENT content-bound
   revision, when the driven commit is not in HEAD's ancestry, or when the newest record is older than
   90 days (the ADR-0016 ageing floor).

The historical Adopt run signed this gate — **this HAS happened** (2026-06-26): the run
observed the suite green at a clean HEAD and signed `adopted` verdicts for `agent#gate-1` and the five
`machine` legs (1–4, 6), each `approvedBy: hua.mick@gmail.com`, and flipped the frontmatter `status:`
to `proposed` in commit `e21ee4d4`. ADR-0395 now makes `proposed` the correct greenfield baseline
regardless of that ceremony. `healthy` stays non-authorable
(ADR-0020) — it is never
written into the frontmatter; the world's crown DERIVES green from the signed verdicts
(ADR-0040) and only
when every capability is `healthy` AND this reliability gate is signed AND the `## UAT Test Criteria`
above is
attested — per-leg now (ADR-0106): the five `machine` legs (1–4, 6) explicitly bind to
`agent#gate-1`, so Adopt observe-and-signed them against that exact suite. Leg 5
(`witness: human`) carries an `operator-attested` verdict and an attestation from the same day, both
signed `operator` — **read the blockquote under `## UAT Test Criteria` before relying on either**
(ADR-0082).
The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-
driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up
(ADR-0082 /
ADR-0083 Fork A + ADR-0085). No single gate greens the story.

## Proof

The story carries the UAT above (ADR-0010 §2); it is proven when that walkthrough passes against the
real runtimes with the capabilities' integration tests and contracts green underneath. The greenfield
provenance and what stays live-attested are pinned in **Honest status** and per capability. Per
ADR-0020 `healthy` is only ever DERIVED from signed verdicts — *(scope note 2026-07-26: the claim that
"this organism has none yet" was FALSE and is corrected here, verified against the live store. The
2026-06-26 adopt pass signed `adopted` verdicts for `agent#gate-1` and legs 1–4, 6, so
`apps/studio/data/unit-status.json` already derives those units `healthy`; and the three proof-wired
capabilities — `model-runtime-seam`, `leaf-tool-surface`, `owned-turn-loop` — each carry a
`capability`-mode PASS verdict, i.e. the "next rung" below was not merely authored but DRIVEN. What
genuinely has no verdict is the pair that never could: `phase-author-seam` and `live-sdk-leaf`, the
two deliberately unwired capabilities — exactly as **Capabilities (5)** predicts.)*. The remaining
bootstrap rung is therefore only those two, and neither carries a genuine standalone red→green
(ADR-0057) to drive.

### This story is now story-`real`-buildable (the first rung is taken)

That next rung is now PARTLY taken: three capabilities — `model-runtime-seam`, `leaf-tool-surface`,
`owned-turn-loop` — carry a `proof:` block with a `real:` arm and are listed in the story's
`capabilities:` frontmatter. They form a **dependency-closed, acyclic** set in which **every** member
resolves a `real:` arm, so `isStoryBuildable(agent, …, 'real')` is satisfied: the story can be driven
end to end with `pnpm storytree story build agent --real` (and the studio's story-level Build button,
PR #299/#300), which walks the three capabilities in dependency order through a genuine spine-observed
red→green.

Each `real:` arm is an **edits-existing** greenfield slice (ADR-0057 §3 expansion C), offline-verified
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
witness. The two unwired capabilities (`phase-author-seam`, `live-sdk-leaf`)
remain documented gaps — they carry no genuine standalone red→green to drive (see
**Capabilities (5)**), so they are not yet a
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
3. **What do the two `operator`-signed rows on `#uat-5` vouch for? (raised 2026-07-26, NOT decided.)**
   Leg 5 carries both an attestation and an `operator-attested` verdict from 2026-06-26, each signed
   with the studio's placeholder `operator` rather than an identified person, with no note and no
   recorded walk — and the claim at that id has since been BROADENED to cover the ADR-0232 Codex leaf,
   which did not exist when they were signed. The full evidence, the three honest remedies, and why no
   agent may pick one are in the blockquote under `## UAT Test Criteria`. Mirrored here so the call is
   discoverable from this index.
4. **Leg 5's witness is pinned OUTSIDE `stories/**` — is that intended? (raised 2026-07-26.)**
   `packages/cli/src/agent-witness-resolution.test.ts` hard-pins this story's leg COUNT (6), its exact
   witness vector, `agent#uat-5 → { witness: "human" }`, and the adopt summary string, as ADR-0106's
   "concrete instance" fixture. That makes a real, useful assertion — but it also means this story's
   UAT shape cannot be re-adjudicated, split, or extended without a coordinated edit to a package test
   that story authors do not own. Worth deciding whether the fixture should keep pinning the LIVE
   story or move to a synthetic one, so the corpus stays free to re-adjudicate.
