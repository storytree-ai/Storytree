---
id: "post-build-curation-pass"
tier: capability
story: drive-machinery
title: "The post-build curation pass — a scoped curator judges, the spine holds the kind fence"
outcome: "A green story build ends by enacting a scoped curator's open-question judgments behind a kind fence the curator cannot open."
status: mapped
proof_mode: integration-test
depends_on: []
# A brownfield capability over already-implemented, already-tested code (capability-layer-coverage-arc,
# 2026-08-07). Spec-borne `proof:` (ADR-0057) with NO `real:` arm — the drive machinery is `mapped`, so
# its green path is Adopt (the story's `## Reliability Gates`, ADR-0085), not a fail-closed `--real`
# Build (ADR-0094). The command names BOTH packages deliberately: the 20 contract-grain proofs are
# drive-resident (packages/drive/src/curate.test.ts), and the green-ONLY trigger — the half of the
# outcome that says "a GREEN story build ends by" — is proven cli-resident against the real storyBuild
# (packages/cli/src/story-build.test.ts). A single-package command would leave that half unproven.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts", "packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts", "packages/cli/src/**/*.ts"]
---

# The post-build curation pass — a scoped curator judges, the spine holds the kind fence

**Outcome —** A green story build ends by enacting a scoped curator's open-question judgments behind a
kind fence the curator cannot open.

*(The ADVISORY posture — curation never fails or blocks the build it runs inside — was demoted out of
the outcome to avoid a banned conjunction; it lives where it is proven, in contract 8
`one-bad-action-never-fails-the-pass` and contract 9.)*

**Depends on —** nothing within this story, and the direction matters. `packages/drive/src/curate.ts`
imports nothing from another drive-machinery capability; the arrow runs the other way —
[`story-topo-build`](story-topo-build.md)'s `story-build.ts` imports THIS module (`:61-64`) and calls
the pass after the chain goes green (`:979`). Declaring the reverse edge because the integration proof
happens to live in the chain's test file would put a CYCLE in the story graph, which is a modelling
error, not a tolerable one.

> **Proof status (honest) — `mapped` (real passing offline tests, observational; NOT `healthy`).** The
> judging half, the enactment half, the kind fence, the tolerant output parser and the whole pass
> orchestration are covered by 20 REAL, passing, offline tests in `packages/drive/src/curate.test.ts`,
> part of the `@storytree/drive` suite, which I ran on 2026-08-07 — **484 tests, 484 pass, 0 fail, 0
> skipped**. The GREEN-ONLY trigger and the end-to-end serialize→SDK→parse→enact path are covered by
> three further REAL tests in `packages/cli/src/story-build.test.ts` (`:70`, `:93`, `:120`) against the
> real `storyBuild`. storytree's own prove-it-gate did NOT drive any of this red→green, so this is
> brownfield `mapped`.
>
> **The `proposed` pockets, named rather than implied.** (a) The LIVE SDK session itself —
> `runSdkCurator` — is `@storytree/agent`'s, proven in `packages/agent/src/sdk-curator.test.ts`, not
> here; every test on this side injects `runSdk`, so the real model call has no assertion in this
> capability. (b) `renderCuratorPrompt`'s LIVE branch (`curate.ts:410-419`, the `openCorpusStore`
> open) has no offline assertion — the covered path is the INJECTED-store seam at `:409`, which exists
> precisely because a hermetic suite holds no credential (ADR-0302 D3). So "the prompt is rendered from
> the live store" is proven as far as `renderAgentPrompt` and no further. (c) The live `PgCommentStore`
> behind `CommentSink` is the `library` story's; every test here uses a fake sink. (d) The per-action
> `catch` at `curate.ts:219-221` — the last-resort guard that turns an action THROWING mid-enactment
> into a `<type> failed: …` refusal line — is reached by NOTHING: every covered refusal path RETURNS a
> refusal rather than throwing, so the guard is unexercised. Contract 8 deliberately claims only the
> return paths, and this pocket is why.
>
> **No reliability gate `(covers:)` this capability yet.** Gate-2 and gate-3 run both proving suites but
> their `(covers:)` lists were frozen before this node existed, so no signed `adopted` verdict names it
> — a stated gap, and an id-aware edit for the owner rather than a silent one.

## Guidance

ADR-0065/ADR-0067: at the END of a green story build a librarian-curator, **scoped to the story nodes
just built**, judges the open-questions in that neighbourhood and cleans up. This is the inverse of
ADR-0032's graduation loop — pruning open-questions instead of growing them — and like it the JUDGMENT
is the agent's intelligence, never a deterministic scan.

**Two halves, split for honesty and offline-testability** (`packages/drive/src/curate.ts`):

- **The judging half** — a `CuratorRunner` (`:72-74`) returns structured `CurationAction`s and writes
  NOTHING. `ScriptedCuratorRunner` (`:81-89`) is the deterministic offline/dry-run runner;
  `SdkCuratorRunner` (`:572-590`) is the live one — serialize the neighbourhood, run ONE read-only SDK
  session, parse its structured output. A failed or empty session yields no actions.
- **The enacting half** — `enactCuration` (`:139-226`) APPLIES those intents, kind-fenced SPINE-SIDE.
  The runner may ask to retire any id; enactment verifies the LIVE target really is an open-question
  before any write (`isKind`, `:147-150`; `patchDoc`'s kind check, `:265-270`), and a write to any
  other kind has no code path at all. **So the fence holds even if the agent misbehaves** — judgment is
  the leaf's, the wall is the spine's, the ADR-0020 posture.

**The authority table is encoded in the TYPE and re-verified at runtime.** `WRITABLE_KINDS` (`:38`) is
`{ openQuestion: "open-question" }` and the `CurationAction` union (`:50-55`) has no `edit-definition` /
`retire-guardrail` variant — but the type alone fences nothing, because a coerced action arrives at
runtime as JSON from a model. `coerceAction` (`:496-527`) drops anything not in `ACTION_TYPES`
(`:480-486`), which is why contract 7 asserts on the accepted action SET rather than trusting the union.

**The proposal-writing half is GONE, and was not re-pointed (ADR-0298).** The kind is retired, and its
successor — a parked entry on the arc that owns the remedy — is deliberately unreachable from here:
parking is the ADJUDICATOR's seat (ADR-0298 D2), and a pass scoped to ONE story neighbourhood holds no
view of which initiative owns a remedy. A curator that cannot see the arcs would charter or mis-file
them, which is exactly the homeless-item failure ADR-0298 exists to end. What it keeps is ESCALATE.

**Not to be confused with [`oq-hygiene-gate`](oq-hygiene-gate.md)**, which is the OTHER end of the same
build: a PRE-build refusal that blocks a live story build while an operator's answer sits unprocessed.
This capability is the POST-green cleanup. Different trigger, different direction, no shared code.

**Consumed by** [`story-topo-build`](story-topo-build.md) / [`build-drive-cli`](build-drive-cli.md):
`story-build.ts:194` renders the curator prompt, `:207` constructs the live runner, and `:946-980` runs
the pass — with the comment at `:946` recording exactly why it can never fail or block the build.

## Integration test

**Goal —** Prove the two halves of the outcome that a unit test of `enactCuration` alone cannot: that
the pass runs at the END of a build and ONLY on green, and that the whole live path —
serialize the neighbourhood → run the (faked) SDK session → parse its structured output → enact it
kind-fenced — reaches a real store and really removes a row.

Real collaborators, no stubs except the model itself: `packages/cli/src/story-build.test.ts:70`
(passing) runs the real `storyBuild` with a real `InMemoryStore` as the library and a
`ScriptedCuratorRunner`, and asserts the OQ is GONE from the store after the green build. `:93`
(passing) does the same through the real `SdkCuratorRunner` with only `runSdk` faked, so the real
`serializeCurationContext` → real `parseCuratorActions` → real `enactCuration` chain is exercised
end-to-end. `:120` (passing) is the negative half that makes the "green" in the outcome load-bearing: a
build that HALTS never runs curation at all — the OQ survives untouched and no `curation:` line appears
in the envelope.

Underneath, 20 tests in `packages/drive/src/curate.test.ts` (all passing) cover every action, every
refusal, the parser and the report. `mapped` (observational); the prove-it-gate did not drive it.

## Contracts (16)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`retire-records-its-rationale`** — a retire is a delete that carries WHY, attributed to the curator
   - **asserts —** retiring an open-question drops it from the projection AND writes a `deleted` event whose actor is `librarian-curator` and whose doc carries the given `retiredReason`; an optional `supersededBy` rides along.
   - **covers —** `packages/drive/src/curate.ts:172-186`
   - **proven by —** `packages/drive/src/curate.test.ts:54` (REAL, passing)
2. **`the-write-fence-is-verified-live-never-trusted`** — the target's real kind is checked before any mutation
   - **asserts —** a retire aimed at a `guardrail` is REFUSED and the guardrail is untouched — never deleted; a retire of an absent id is a refusal, not a throw; a reframe aimed at a `definition` is refused with a message telling the curator to comment + escalate instead.
   - **covers —** `packages/drive/src/curate.ts:147-150,173-179,265-270`
   - **proven by —** `packages/drive/src/curate.test.ts:68`, `:79`, `:113` (REAL, passing)
3. **`raise-is-edit-first-and-schema-validated`** — a new open-question must be new and must be valid
   - **asserts —** a well-formed doc is created as kind `open-question`; RE-raising an existing id is refused (`reframe/edit it, don't recreate it` — the edit-first-curation rule); a doc missing its required body fails `upcastAndValidate` and is refused WITHOUT ever being persisted.
   - **covers —** `packages/drive/src/curate.ts:188-192,231-253`
   - **proven by —** `packages/drive/src/curate.test.ts:89`, `:104` (REAL, passing)
4. **`reframe-patches-an-open-question-in-place`** — a reframe merges over the stored body and re-validates
   - **asserts —** reframing an existing OQ leaves the patched field changed on the stored doc, with the rest of the body preserved; an edit that would make the doc invalid is refused rather than written.
   - **covers —** `packages/drive/src/curate.ts:193-203,271-283`
   - **proven by —** `packages/drive/src/curate.test.ts:113` (REAL, passing)
5. **`comment-and-escalate-are-the-only-reach-into-any-other-kind`** — every non-writable kind gets prose, never an edit
   - **asserts —** with a live comment sink, a comment on a `guardrail` is created against that topic id, authored by `librarian-curator`; with NO sink it records as an `unsent` report line and enacts nothing.
   - **covers —** `packages/drive/src/curate.ts:152-167,204-209`
   - **proven by —** `packages/drive/src/curate.test.ts:157` (REAL, passing)
6. **`an-escalation-surfaces-even-with-no-comment-store`** — the owner's channel never depends on infrastructure
   - **asserts —** an escalate always lands in `escalations`; with a sink it ALSO writes a comment marked `ESCALATION`; with no sink the escalation still surfaces and the enacted line says the comment store was offline.
   - **covers —** `packages/drive/src/curate.ts:210-217`
   - **proven by —** `packages/drive/src/curate.test.ts:177` (REAL, passing)
7. **`deferred-work-can-no-longer-be-written-here`** — ADR-0298's removal is pinned at the runtime boundary, not left to the type
   - **asserts —** `open-question` is the ONLY value in `WRITABLE_KINDS`; a model emitting `create-proposal` or `edit-proposal` has that action DROPPED rather than enacted (asserted on the parser, because a coerced action arrives as JSON where the type fences nothing); and `escalate` — the path the curator keeps for work it thinks should be built later — still parses.
   - **covers —** `packages/drive/src/curate.ts:38,50-55,480-486`
   - **proven by —** `packages/drive/src/curate.test.ts:132` (REAL, passing)
8. **`a-refused-action-is-collected-never-thrown`** — a bad intent is recorded and the pass carries on
   - **asserts —** a retire of an absent id is a REFUSAL rather than a throw; a retire aimed at a non-open-question and a raise of an invalid doc are likewise collected into `refused` with `enacted` left empty, and `enactCuration` returns normally in each case — so one bad intent from the model never costs the pass its remaining actions.
   - **covers —** `packages/drive/src/curate.ts:174-179,285-288`
   - **proven by —** `packages/drive/src/curate.test.ts:79`, `:68`, `:104` (REAL, passing)
9. **`the-pass-never-throws-into-the-build`** — a broken library store degrades to one report line
   - **asserts —** a `library` whose `queryDocs` throws yields a `skipped — … (best-effort; the build is unaffected)` line instead of an exception, so curation can never fail the enclosing build (ADR-0067).
   - **covers —** `packages/drive/src/curate.ts:335-339`
   - **proven by —** `packages/drive/src/curate.test.ts:245` (REAL, passing)
10. **`the-pass-defers-when-no-library-store-is-wired`** — no store means no curation, said out loud
    - **asserts —** `library: null` returns a single `deferred` line and performs no read and no write.
    - **covers —** `packages/drive/src/curate.ts:308-313`
    - **proven by —** `packages/drive/src/curate.test.ts:221` (REAL, passing)
11. **`the-pass-loads-the-neighbourhood-judges-and-enacts`** — the three steps compose over a real store
    - **asserts —** `runCurationPass` queries the open-questions, hands them to the runner as `ctx.openQuestions`, and enacts what comes back — the OQ the runner judged overtaken is gone from the store and named in the report lines; the scripted runner's function form really receives the context (it branches on `ctx.decisions`).
    - **covers —** `packages/drive/src/curate.ts:81-89,314-334`
    - **proven by —** `packages/drive/src/curate.test.ts:230`, `:201` (REAL, passing)
12. **`the-model-output-is-parsed-tolerantly-or-not-at-all`** — a malformed entry is dropped, never fatal
    - **asserts —** a fenced JSON array yields only its well-formed actions (a `retire-open-question` with no id/reason and an unknown type are both dropped); a bare bracketed array parses; prose with no JSON and an invalid fenced body each yield `[]`.
    - **covers —** `packages/drive/src/curate.ts:496-553`
    - **proven by —** `packages/drive/src/curate.test.ts:261`, `:279` (REAL, passing)
13. **`the-neighbourhood-is-serialized-into-the-user-prompt`** — the curator judges over what it was actually shown
    - **asserts —** the serialized prompt names the story just built, each deciding ADR with its CURRENT on-disk status, every open-question id, and each OQ's body fields — so the judgment is scoped to the neighbourhood rather than roaming the corpus.
    - **covers —** `packages/drive/src/curate.ts:446-478`
    - **proven by —** `packages/drive/src/curate.test.ts:289` (REAL, passing)
14. **`the-sdk-session-is-injectable-and-best-effort`** — the live runner is offline-testable and never fatal
    - **asserts —** `SdkCuratorRunner` threads the rendered system prompt through unchanged, serializes the neighbourhood into the user prompt, parses the session's output into actions, and surfaces the run's cost through `onResult` for the build report; a session that returns `ok: false` yields ZERO actions rather than an error.
    - **covers —** `packages/drive/src/curate.ts:561-590`
    - **proven by —** `packages/drive/src/curate.test.ts:308`, `:341` (REAL, passing)
15. **`the-curator-prompt-is-the-library-agent-plus-the-output-contract`** — the prompt is assembled, never hand-written
    - **asserts —** rendering over a corpus produces a system prompt carrying the `librarian-curator` agent's own body with the JSON output contract appended (the `retire-open-question` schema and the `post-build curation pass` framing both present).
    - **covers —** `packages/drive/src/curate.ts:385-387,422-435`
    - **proven by —** `packages/drive/src/curate.test.ts:350` (REAL, passing — over an INJECTED fixture corpus; the LIVE `openCorpusStore` branch at `:410-419` is the `proposed` pocket named above)
16. **`a-pass-with-nothing-to-do-reports-clean`** — silence is said out loud, never inferred from an empty block
    - **asserts —** enacting an EMPTY action list produces a report line saying the curator found nothing to clean up in this story's neighbourhood — so a build header can never leave "curation ran and found nothing" indistinguishable from "curation did not run".
    - **covers —** `packages/drive/src/curate.ts:593-602`
    - **proven by —** `packages/drive/src/curate.test.ts:195` (REAL, passing)
