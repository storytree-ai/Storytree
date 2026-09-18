---
id: "post-build-curation-pass"
tier: capability
story: drive-machinery
title: "The post-build curation pass — a scoped curator judges, the spine holds the kind fence"
outcome: "A green story build ends by enacting a scoped curator's open-question judgments behind a kind fence the curator cannot open."
status: proposed
proof_mode: integration-test
depends_on: []
# A greenfield capability registered after its implementation and tests (capability-layer-coverage-arc,
# 2026-08-07). Per ADR-0395, retrospective registration does not make it brownfield or Adopt-bound.
# Spec-borne `proof:` (ADR-0057) with NO `real:` arm. The command names BOTH packages deliberately: the
# contract-grain proofs are drive-resident (packages/drive/src/curate.test.ts), and the green-ONLY
# trigger — the half of the outcome that says "a GREEN story build ends by" — is proven cli-resident
# against the real storyBuild (packages/cli/src/story-build.test.ts), as is the end-to-end half of
# contract 19's test-process refusal (packages/cli/src/story-real-build.test.ts). A single-package
# command would leave those halves unproven.
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
`a-refused-action-is-collected-never-thrown` and contract 9. It has one deliberate exception, and only
in a TEST process: a green chain that injected no curator throws at the curation step rather than
start the live curator — contract 19.)*

**Depends on —** nothing within this story, and the direction matters. `packages/drive/src/curate.ts`
imports nothing from another drive-machinery capability; the arrow runs the other way —
[`story-topo-build`](story-topo-build.md)'s `story-build.ts` imports THIS module (`:91-99`) and calls
the pass after the chain goes green (`:1517`, or through `runLiveCuration` at `:1489` on the live
default). Declaring the reverse edge because the integration proof happens to live in the chain's test
file would put a CYCLE in the story graph, which is a modelling error, not a tolerable one.

> **Proof status (honest) — `proposed` (real passing offline tests, but no current signed pass).** The
> judging half, the enactment half, the kind fence, the tolerant output parser and the whole pass
> orchestration are covered by REAL, passing, offline tests in `packages/drive/src/curate.test.ts`,
> part of the `@storytree/drive` suite — 20 of them when the whole suite was run on 2026-08-07
> (**484 tests, 484 pass, 0 fail, 0 skipped**), and 28 on 2026-09-18, when the file was run on its own
> and all 28 passed. The GREEN-ONLY trigger and the end-to-end serialize→SDK→parse→enact path are
> covered by three further REAL tests in `packages/cli/src/story-build.test.ts` (`:136`, `:159`,
> `:186`) against the real `storyBuild`, and the refusal of the live curator from a test process by a
> fourth, `packages/cli/src/story-real-build.test.ts:251`, against a real `--real` chain. The
> implementation is greenfield Storytree work; standing tests and the absence of a gate-driven
> red→green do not make it brownfield (ADR-0395).
>
> **The `proposed` pockets, named rather than implied.** (a) The LIVE SDK session itself —
> `runSdkCurator` — is `@storytree/agent`'s, proven in `packages/agent/src/sdk-curator.test.ts`, not
> here; every test on this side injects `runSdk`, so the real model call has no assertion in this
> capability. (b) `renderCuratorPrompt`'s LIVE branch (`curate.ts:487-496`, the `openCorpusStore`
> open) has no offline assertion — the covered path is the INJECTED-store seam at `:486`, which exists
> precisely because a hermetic suite holds no credential (ADR-0302 D3). So "the prompt is rendered from
> the live store" is proven as far as `renderAgentPrompt` and no further. (c) The live `PgCommentStore`
> behind `CommentSink` is the `library` story's; every test here uses a fake sink. (d) The per-action
> `catch` at `curate.ts:278-280` — the last-resort guard that turns an action THROWING mid-enactment
> into a `<type> failed: …` refusal line — is reached by NOTHING: every covered refusal path RETURNS a
> refusal rather than throwing, so the guard is unexercised. Contract 8 deliberately claims only the
> return paths, and this pocket is why.
>
> **No reliability gate `(covers:)` this capability yet.** Gate-2 and gate-3 run both proving suites but
> their `(covers:)` lists were frozen before this node existed, so no current signed verdict names it
> — a stated proof gap, not a reason to route this greenfield capability through Adopt.

## Guidance

ADR-0065/ADR-0067: at the END of a green story build a librarian-curator, **scoped to the story nodes
just built**, judges the open-questions in that neighbourhood and cleans up. (Read "neighbourhood"
precisely: in the code it is the story's id, nodes and deciding ADRs. The questions are not narrowed
by story — `runCurationPass` queries the whole `open-question` kind and hands over every one still
waiting on an answer.) This is the inverse of ADR-0032's graduation loop — pruning open-questions
instead of growing them — and like it the JUDGMENT is the agent's intelligence, never a deterministic
scan.

**Two halves, split for honesty and offline-testability** (`packages/drive/src/curate.ts`):

- **The judging half** — a `CuratorRunner` (`:109-111`) returns structured `CurationAction`s and writes
  NOTHING. `ScriptedCuratorRunner` (`:118-126`) is the deterministic offline/dry-run runner;
  `SdkCuratorRunner` (`:651-670`) is the live one — serialize the neighbourhood, run ONE read-only SDK
  session, parse its structured output. A failed or empty session yields no actions.
- **The enacting half** — `enactCuration` (`:176-285`) APPLIES those intents, kind-fenced SPINE-SIDE.
  The runner may ask to retire any id; enactment verifies the LIVE target really is an open-question
  before any write (`isKind`, `:184-187`; `patchKindFenced`'s kind check, `:335-342`), and a write to
  any other kind has no code path at all. Since 2026-09-18 it also verifies the target carries no
  owner's answer (`:217-224`, `:237-252`; contract 17). **So the fence holds even if the agent
  misbehaves** — judgment is the leaf's, the wall is the spine's, the ADR-0020 posture.

**The authority table is encoded in the TYPE and re-verified at runtime.** `WRITABLE_KINDS` (`:38`) is
`{ openQuestion: "open-question" }` and the `CurationAction` union (`:87-92`) has no `edit-definition` /
`retire-guardrail` variant — but the type alone fences nothing, because a coerced action arrives at
runtime as JSON from a model. `coerceAction` (`:575-606`) drops anything not in `ACTION_TYPES`
(`:559-565`), which is why contract 7 asserts on the accepted action SET rather than trusting the union.

**The proposal-writing half is GONE, and was not re-pointed (ADR-0298).** The kind is retired, and its
successor — a parked entry on the arc that owns the remedy — is deliberately unreachable from here:
parking is the ADJUDICATOR's seat (ADR-0298 D2), and a pass scoped to ONE story neighbourhood holds no
view of which initiative owns a remedy. A curator that cannot see the arcs would charter or mis-file
them, which is exactly the homeless-item failure ADR-0298 exists to end. What it keeps is ESCALATE.

**This pass is now the ONLY open-question machinery on a live story build.** It used to be one end of
a pair: [`oq-hygiene-gate`](oq-hygiene-gate.md) was the PRE-build refusal that blocked a live story
build while an operator's answer sat unprocessed, and this capability is the POST-green cleanup —
different trigger, different direction, no shared code. The pre-build half **RETIRED on 2026-08-30**
(ADR-0477 removed the library `references` field it read to find the questions bearing on a story),
so a live build no longer refuses on OQ hygiene before spending; it only curates after going green.
The two never shared code, so nothing here changed — but the "OTHER end" is gone, and this pass does
not and cannot stand in for it: it runs AFTER the spend and is advisory by construction.

**An answered question is never the curator's to delete — enforced at enactment since 2026-09-18
(ADR-0434 D5).** A green `--live`/`--real` build defaulted to the LIVE SDK curator whenever its caller
injected neither `curatorRunner` nor `curationStores`, and test processes reached that default: 3,596
real curator sessions on the main dev box since 2026-08-18, and 62 on the second (Mint) box. They
deleted 31 owner-ANSWERED open-questions — 28 from the dev box's sessions, and 3 on 2026-09-08 (19:50Z)
from one inside a paid build's cli regression suite on the Mint box. The model was handed every
open-question, answered or not — without the answer, which the serializer never includes — and told
to retire one "settled by a landed decision", the very case ADR-0434 D5 says is settled and stays on
its arc. CI never saw it: it holds no credential, and the pass swallowed the unreachable store as a
best-effort `skipped` line. The answer is now protected where the kind is: the spine refuses to retire
or reword an answered question, or to write a settlement field, whatever the model emits (contract 17)
— so a curator that ignores its prompt still cannot delete an answer. The input and the prompt were
corrected too (contract 18), and the live curator no longer runs from a test process at all
(contract 19).

**Consumed by** [`story-topo-build`](story-topo-build.md) / [`build-drive-cli`](build-drive-cli.md): on
the live default, `runLiveCuration` (`story-build.ts:325-384`) renders the curator prompt (`:331`),
constructs the live runner (`:351`) and runs the pass (`:366`); `:1479-1531` chooses between that
default and the injected or dry-run pass (`:1519`) — with the comment at `:1479-1483` recording why the
pass can never fail or block the build, and `:1489-1490` the one deliberate exception, refusing the
live default from a test process before anything renders, dials or spawns (contract 19).

## Integration test

**Goal —** Prove the two halves of the outcome that a unit test of `enactCuration` alone cannot: that
the pass runs at the END of a build and ONLY on green, and that the whole live path —
serialize the neighbourhood → run the (faked) SDK session → parse its structured output → enact it
kind-fenced — reaches a real store and really removes a row.

Real collaborators, no stubs except the model itself: `packages/cli/src/story-build.test.ts:136`
(passing) runs the real `storyBuild` with a real `InMemoryStore` as the library and a
`ScriptedCuratorRunner`, and asserts the OQ is GONE from the store after the green build. `:159`
(passing) does the same through the real `SdkCuratorRunner` with only `runSdk` faked, so the real
`serializeCurationContext` → real `parseCuratorActions` → real `enactCuration` chain is exercised
end-to-end. `:186` (passing) is the negative half that makes the "green" in the outcome load-bearing: a
build that HALTS never runs curation at all — the OQ survives untouched and no `curation:` line appears
in the envelope.

`packages/cli/src/story-real-build.test.ts:251` (passing) pins the default the other three bypass: a
green `--real` chain in the test process, with no curator injected, REJECTS with
`LIVE_CURATION_FROM_A_TEST` instead of reaching the live curator. It also points the secrets file at a
path that does not exist and unsets the store door, so nothing the live path could reach holds a
credential even if the refusal went. It fails with the `story-build.ts:1490` call removed (verified
by hand on 2026-09-18). `packages/drive/src/curate.test.ts:557` is the same witness drive-side, where
the mutation rung can see it — it too was run with the call removed and failed.

Underneath, 28 tests in `packages/drive/src/curate.test.ts` (all passing on 2026-09-18) cover every
action, every refusal — the answered-question wall included — the parser, the report and the
test-process refusal. `proposed`: the greenfield capability has standing observational evidence but
no current signed pass (ADR-0395).

## Contracts (19)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`retire-records-its-rationale`** — a retire is a delete that carries WHY, attributed to the curator
   - **asserts —** retiring an open-question drops it from the projection AND writes a `deleted` event whose actor is `librarian-curator` and whose doc carries the given `retiredReason`; an optional `supersededBy` rides along.
   - **covers —** `packages/drive/src/curate.ts:180,225-228`
   - **proven by —** `packages/drive/src/curate.test.ts:62` (REAL, passing)
2. **`the-write-fence-is-verified-live-never-trusted`** — the target's real kind is checked before any mutation
   - **asserts —** a retire aimed at a `guardrail` is REFUSED and the guardrail is untouched — never deleted; a retire of an absent id is a refusal, not a throw; a reframe aimed at a `definition` is refused with a message telling the curator to comment + escalate instead.
   - **covers —** `packages/drive/src/curate.ts:184-187,210-216,335-342`
   - **proven by —** `packages/drive/src/curate.test.ts:76`, `:87`, `:121` (REAL, passing)
3. **`raise-is-edit-first-and-schema-validated`** — a new open-question must be new and must be valid
   - **asserts —** a well-formed doc is created as kind `open-question`; RE-raising an existing id is refused (`reframe/edit it, don't recreate it` — the edit-first-curation rule); a doc missing its required body fails `upcastAndValidate` and is refused WITHOUT ever being persisted.
   - **covers —** `packages/drive/src/curate.ts:231-235,290-312`
   - **proven by —** `packages/drive/src/curate.test.ts:97`, `:112` (REAL, passing)
4. **`reframe-patches-an-open-question-in-place`** — a reframe merges over the stored body and re-validates
   - **asserts —** reframing an existing OQ leaves the patched field changed on the stored doc, with the rest of the body preserved; an edit that would make the doc invalid is refused rather than written.
   - **covers —** `packages/drive/src/curate.ts:253-261,343-356`
   - **proven by —** `packages/drive/src/curate.test.ts:121` (REAL, passing)
5. **`comment-and-escalate-are-the-only-reach-into-any-other-kind`** — every non-writable kind gets prose, never an edit
   - **asserts —** with a live comment sink, a comment on a `guardrail` is created against that topic id, authored by `librarian-curator`; with NO sink it records as an `unsent` report line and enacts nothing.
   - **covers —** `packages/drive/src/curate.ts:189-204,263-268`
   - **proven by —** `packages/drive/src/curate.test.ts:208` (REAL, passing)
6. **`an-escalation-surfaces-even-with-no-comment-store`** — the owner's channel never depends on infrastructure
   - **asserts —** an escalate always lands in `escalations`; with a sink it ALSO writes a comment marked `ESCALATION`; with no sink the escalation still surfaces and the enacted line says the comment store was offline.
   - **covers —** `packages/drive/src/curate.ts:269-276`
   - **proven by —** `packages/drive/src/curate.test.ts:228` (REAL, passing)
7. **`deferred-work-can-no-longer-be-written-here`** — ADR-0298's removal is pinned at the runtime boundary, not left to the type
   - **asserts —** `open-question` is the ONLY value in `WRITABLE_KINDS`; a model emitting `create-proposal` or `edit-proposal` has that action DROPPED rather than enacted (asserted on the parser, because a coerced action arrives as JSON where the type fences nothing); and `escalate` — the path the curator keeps for work it thinks should be built later — still parses.
   - **covers —** `packages/drive/src/curate.ts:38,87-92,559-565`
   - **proven by —** `packages/drive/src/curate.test.ts:183` (REAL, passing)
8. **`a-refused-action-is-collected-never-thrown`** — a bad intent is recorded and the pass carries on
   - **asserts —** a retire of an absent id is a REFUSAL rather than a throw; a retire aimed at a non-open-question and a raise of an invalid doc are likewise collected into `refused` with `enacted` left empty, and `enactCuration` returns normally in each case — so one bad intent from the model never costs the pass its remaining actions.
   - **covers —** `packages/drive/src/curate.ts:211-216,359-362`
   - **proven by —** `packages/drive/src/curate.test.ts:87`, `:76`, `:112` (REAL, passing)
9. **`the-pass-never-throws-into-the-build`** — a broken library store degrades to one report line
   - **asserts —** a `library` whose `queryDocs` throws yields a `skipped — … (best-effort; the build is unaffected)` line instead of an exception, so the pass itself can never fail the enclosing build (ADR-0067) — contract 19's refusal throws in `storyBuild`, before the pass, and only in a test process.
   - **covers —** `packages/drive/src/curate.ts:408-412`
   - **proven by —** `packages/drive/src/curate.test.ts:296` (REAL, passing)
10. **`the-pass-defers-when-no-library-store-is-wired`** — no store means no curation, said out loud
    - **asserts —** `library: null` returns a single `deferred` line and performs no read and no write.
    - **covers —** `packages/drive/src/curate.ts:383-387`
    - **proven by —** `packages/drive/src/curate.test.ts:272` (REAL, passing)
11. **`the-pass-loads-the-neighbourhood-judges-and-enacts`** — the three steps compose over a real store
    - **asserts —** `runCurationPass` queries the whole `open-question` kind, hands the runner the ones still waiting on an answer as `ctx.openQuestions` (contract 18 pins that filter), and enacts what comes back — the OQ the runner judged overtaken is gone from the store and named in the report lines; the scripted runner's function form really receives the context (it branches on `ctx.decisions`).
    - **covers —** `packages/drive/src/curate.ts:118-126,388-407`
    - **proven by —** `packages/drive/src/curate.test.ts:281`, `:252` (REAL, passing)
12. **`the-model-output-is-parsed-tolerantly-or-not-at-all`** — a malformed entry is dropped, never fatal
    - **asserts —** a fenced JSON array yields only its well-formed actions (a `retire-open-question` with no id/reason and an unknown type are both dropped); a bare bracketed array parses; prose with no JSON and an invalid fenced body each yield `[]`.
    - **covers —** `packages/drive/src/curate.ts:575-632`
    - **proven by —** `packages/drive/src/curate.test.ts:314`, `:332` (REAL, passing)
13. **`the-neighbourhood-is-serialized-into-the-user-prompt`** — the curator judges over what it was actually shown
    - **asserts —** the serialized prompt names the story just built, each deciding ADR with its CURRENT stored status, every open-question id in `ctx.openQuestions`, and each such OQ's body fields — so the curator judges over exactly what the pass handed it, which is every open-question in the store still waiting on an answer (contract 18), not a set narrowed to the story.
    - **covers —** `packages/drive/src/curate.ts:523-557`
    - **proven by —** `packages/drive/src/curate.test.ts:342` (REAL, passing)
14. **`the-sdk-session-is-injectable-and-best-effort`** — the live runner is offline-testable and never fatal
    - **asserts —** `SdkCuratorRunner` threads the rendered system prompt through unchanged, serializes the neighbourhood into the user prompt, parses the session's output into actions, and surfaces the run's cost through `onResult` for the build report; a session that returns `ok: false` yields ZERO actions rather than an error.
    - **covers —** `packages/drive/src/curate.ts:640-670`
    - **proven by —** `packages/drive/src/curate.test.ts:361`, `:394` (REAL, passing)
15. **`the-curator-prompt-is-the-library-agent-plus-the-output-contract`** — the prompt is assembled, never hand-written
    - **asserts —** rendering over a corpus produces a system prompt carrying the `librarian-curator` agent's own body with the JSON output contract appended (the `retire-open-question` schema and the `post-build curation pass` framing both present).
    - **covers —** `packages/drive/src/curate.ts:462-464,499-512`
    - **proven by —** `packages/drive/src/curate.test.ts:403` (REAL, passing — over an INJECTED fixture corpus; the LIVE `openCorpusStore` branch at `:487-496` is the `proposed` pocket named above)
16. **`a-pass-with-nothing-to-do-reports-clean`** — silence is said out loud, never inferred from an empty block
    - **asserts —** enacting an EMPTY action list produces a report line saying the curator found nothing to clean up in this story's neighbourhood — so a build header can never leave "curation ran and found nothing" indistinguishable from "curation did not run".
    - **covers —** `packages/drive/src/curate.ts:673-682`
    - **proven by —** `packages/drive/src/curate.test.ts:246` (REAL, passing)
17. **`the-curator-never-destroys-an-answer`** — the spine refuses to delete, reword or forge an owner's answer, whatever the model emits
    - **asserts —** `enactCuration` refuses a `retire-open-question` aimed at a question that carries an answer (`carriesAnAnswer`: `lifecycle: settled`, or a non-blank `answer` string), leaving the row and its answer in place with no `deleted` event (ADR-0434 D5), while a question nobody answered can still be retired; it refuses a `reframe-open-question` aimed at an answered question (ADR-0434 D3) and any reframe whose `set` names a settlement field (`answer`, `lifecycle`, `settledAt`, `settledByRef` — only `storytree question settle` writes those, ADR-0434 D2), while an ordinary reframe of an unanswered question still lands.
    - **covers —** `packages/drive/src/curate.ts:48-58,217-224,237-252`
    - **proven by —** `packages/drive/src/curate.test.ts:425`, `:436`, `:460` (REAL, passing)
18. **`the-curator-is-never-invited-to-retire-an-answer`** — the judging half is neither shown an answered question nor told to retire one
    - **asserts —** `runCurationPass` hands the runner, as `ctx.openQuestions`, only the questions still waiting on an answer (an answered one the model names anyway is still refused by contract 17's wall), and the output contract appended to the curator's system prompt says to RETIRE only a question nobody answered that turned out wrong, NEVER to retire an answered one, and to ESCALATE a still-open question a landed decision answered so the session holding the answer settles it; the retire schema's `reason` asks why the question was wrong or withdrawn, and the instruction to retire a question "settled by a landed decision" is gone.
    - **covers —** `packages/drive/src/curate.ts:390-394,439,446-452`
    - **proven by —** `packages/drive/src/curate.test.ts:493`, `:514` (REAL, passing)
19. **`the-live-curator-never-runs-from-a-test`** — a test that forgets to inject a curator fails loudly instead of starting the live one
    - **asserts —** `refuseLiveCurationFromATest` throws `LIVE_CURATION_FROM_A_TEST` in a test runner's process — `NODE_ENV=test` (set by `bun test` and vitest) or a set `NODE_TEST_CONTEXT` (set by `node --test`) — even one that opted into the live suites with `STORYTREE_DB_LIVE=1`, because `runLiveCuration` dials production rather than a test database, and is a no-op in an ordinary process; `storyBuild` calls it on the live/real default branch before `runLiveCuration`, so a green `--real` chain in a test process that injects neither `curatorRunner` nor `curationStores` rejects with that message, and nothing is rendered, dialled or spawned.
    - **covers —** `packages/drive/src/curate.ts:70-78`, `packages/drive/src/story-build.ts:1485-1490` (riding `isTestRunnerProcess`, `packages/library/src/store/data-plane.ts:114-116`)
    - **proven by —** `packages/drive/src/curate.test.ts:537` (REAL, passing — the refusal itself), `:557` (REAL, passing — a real `--real` chain rejects at curation, drive-side), `packages/cli/src/story-real-build.test.ts:251` (REAL, passing — the same, cli-side)
