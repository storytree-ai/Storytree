---
id: "owner-grant-carries-settled-authority"
tier: contract
story: drive-machinery
capability: build-drive-cli
arc: inner-loop-exit-arc
title: "A settled owner question grants a bounded attempt above the automatic ceiling"
outcome: "A unit above the automatic attempt ceiling proceeds only for the exact allowance recorded by a settled, owner-backed question on that unit's arc."
status: proposed
proof_mode: contract-test
depends_on: [orchestrator-records-its-calls, build-entry-refuses-before-spend, node-verbs-dispatch]
decisions: [578, 577, 576, 563]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/owner-grant.test.ts"]
    sourceGlobs:
      - "packages/proof-protocol/src/inner-loop-event.ts"
      - "packages/orchestrator/src/proof/inner-loop-ledger.ts"
      - "packages/cli/src/inner-loop-verbs.ts"
      - "packages/cli/src/commands.ts"
      - "packages/cli/src/at-path.ts"
      - "packages/drive/src/inner-loop-entry.ts"
  real:
    testFile: "packages/cli/src/owner-grant.test.ts"
    sourceFile: "packages/cli/src/inner-loop-verbs.ts"
    scope:
      testGlobs: ["packages/cli/src/owner-grant.test.ts"]
      sourceGlobs:
        - "packages/proof-protocol/src/inner-loop-event.ts"
        - "packages/orchestrator/src/proof/inner-loop-ledger.ts"
        - "packages/cli/src/inner-loop-verbs.ts"
        - "packages/cli/src/commands.ts"
        - "packages/cli/src/at-path.ts"
        - "packages/drive/src/inner-loop-entry.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--preload"
        - "./scripts/tsx-cache-off.mjs"
        - "--timeout"
        - "300000"
        - "./packages/cli/src/owner-grant.test.ts"
    typecheck:
      file: pnpm
      args:
        - "--filter"
        - "@storytree/proof-protocol"
        - "--filter"
        - "@storytree/orchestrator"
        - "--filter"
        - "@storytree/drive"
        - "--filter"
        - "@storytree/cli"
        - "typecheck"
---

# A settled owner question grants a bounded attempt above the automatic ceiling

**Outcome —** A unit above the automatic attempt ceiling proceeds only for the exact allowance
recorded by a settled, owner-backed question on that unit's arc.

> **Proof status (honest) — authored `proposed`, with a current signed PASS.** The focused REAL proof
> signed on run `real-mu5x39o9` and the pass was adjudicated `land`. Authored status remains
> `proposed`: health derives from the persisted signed verdict rather than a hand-authored status
> change. The preceding run `real-mu5wu42a` correctly refused at CONFIRM_RED because its first test
> shape threw from Zod before an assertion; the revised assertion-red shape below is the one that
> earned the signature.

## Proof walkthrough

**Fixture.** One `InMemoryStore` is both corpus and attempt ledger. Its `arc-a` contains active
increment `inc-a`; `inc-a` is the increment on six unsigned attempts for unit `u1`. Settled question
`q-a` and accepted decision `adr-0577` both carry `arcRef: "asset:arc-a"`. The question carries a
nonblank `answer`, `settledAt`, and `settledByRef: "asset:adr-0577"`; the decision carries an
owner-directed authority stamp with the owner's quoted words. Unless a step says otherwise, the
requested grant is one `revised-test` attempt whose difference names the three inherited-test
migrations authorized by ADR-0577. `q-b`, `adr-0578`, and `inc-b` provide otherwise-valid foreign-arc
rows. Every refusal asserts that no `owner-grant` event was added.

1. **The protocol and fold distinguish the owner's exceptional grant from an ordinary grant.**
   - Construct the candidate as plain `unknown`, call `InnerLoopEventDoc.safeParse(candidate)`, and
     assert `parsed.success === true`. Do not call `.parse(candidate)` for the red: the
     pre-implementation schema must make a real assertion fail rather than throw before any
     assertion executes. At green,
     `parsed.data` is the typed event used by the fold. The accepted `owner-grant` carries the
     ordinary grant fields plus
     `authorityQuestionRef: "asset:q-a"` and `authorityDecisionRef: "asset:adr-0577"`. Either blank
     authority ref, an unknown key, a non-positive/non-integer allowance, or a non-protocol kind is
     rejected through `safeParse`, with an assertion over `success === false`.
   - Six failed attempts followed by an ordinary `grant` still throws
     `grant exceeds the owner ceiling of 6 failures`; no existing `grant` fixture or identity changes.
   - The same history followed by the `owner-grant` folds to `remainingGrantCount === 1` and policy
     `granted`. Its reason names the question and decision refs. A `revised-test` preflight passes
     only with `revise: true`.
   - The seventh attempt consumes that one allowance. The fold returns to policy `escalate`, and the
     next preflight refuses `owner-ceiling`. An owner grant of two permits exactly two attempts and
     refuses the third. An owner grant before the ceiling, overlapping any live ordinary or owner
     grant, or bound to anything but the latest failed run throws without weakening the ordinary
     decision-point rules.
2. **The recording verb proves authority before it appends.**
   Import the EXISTING module as a namespace (`import * as InnerLoopVerbs from
   "./inner-loop-verbs.js"`) and read `recordNodeOwnerGrant` from that namespace as an unknown
   property. First assert that its type is `"function"`; at the pre-implementation cut the module
   loaded successfully and that assertion failed. Only after the assertion/narrowing call it. Never
   use a named import of the not-yet-exported symbol, because a module-load failure is not this
   edit-existing unit's red.
   `recordNodeOwnerGrant(store, input)` takes `unitId`, `authorityQuestionId`, `attempts`, `kind`,
   `difference`, and optional `actor`; it derives the latest failed run, its increment, the question's
   `settledByRef`, and both stored `asset:` refs. It returns a refusal, never throws, for:
   - a missing/wrong-kind question; an open question; or a purported settlement missing a nonblank
     `answer`, `settledAt`, or `settledByRef`;
   - a missing/wrong-kind/unaccepted deciding ADR, or one whose authority stamp is not
     `owner-directed` or `owner-ratified` with nonblank quoted owner words;
   - a missing/wrong-kind increment; any mismatch among the question, increment, and deciding ADR's
     normalized `arcRef`; or a missing/blank arc ref on any of the three;
   - a unit below the ceiling, with no latest failed attempt, with an unresolved signed pass, or with
     a live grant; and every malformed allowance/difference the ordinary grant content check refuses.

   The valid call appends exactly
   `{ event: "owner-grant", unitId: "u1", incrementId: "inc-a", runId: "r6", attempts: 1,
   kind: "revised-test", difference, authorityQuestionRef: "asset:q-a",
   authorityDecisionRef: "asset:adr-0577" }`, carrying the supplied actor. A fresh fold reports the
   one live allowance.
3. **One answered question is spendable once, globally.** Before append, the verb searches all
   inner-loop events—not only `u1`'s fold—for `authorityQuestionRef: "asset:q-a"`. Once the valid
   event exists, replaying the same call refuses as already spent, and using `q-a` for another unit
   or increment refuses the same way. The count of `owner-grant` events remains one. Canonical event
   identity includes the authority-question ref so conflicting replay cannot acquire a second
   identity. A corrupt prior owner-grant or unreadable corpus/ledger refuses with the underlying
   error quoted; neither is treated as unused authority.
4. **The CLI exposes the exceptional act without changing the ordinary verb.**
   `storytree node owner-grant <unit> --authority <question-id> --attempts <n> --kind
   <changed-input|fixed-defect|new-observation|revised-test> --difference <text|@file> --pg` dispatches
   to `recordNodeOwnerGrant`. It refuses without the unit, every required flag, or the writable live
   store; `--authority` is a literal identifier while `--difference` retains `@path` prose expansion.
   A valid command reports the unit, bound run and increment, exact allowance and kind, plus the
   derived question and decision refs. The existing `storytree node grant` command, its flags, its
   below-ceiling success, and its at-ceiling refusal remain byte-for-byte unchanged.
5. **The paid-build preflight consumes the recorded allowance and then closes again.** Reading the
   same store through `preflightInnerLoop` admits the seventh `--revise-test` walk under `inc-a`.
   After appending its attempt event, the same call refuses another walk with `owner-ceiling`; a
   plain run under the still-live revised-test owner grant refuses `grant-kind-mismatch`. The
   ordinary three-failure grant path still passes and consumes exactly as before.

At the signed run's CONFIRM_RED, the focused test began with an **assertion red** against the existing,
loadable modules: `InnerLoopEventDoc.safeParse(ownerGrantCandidate).success` was asserted true and
was false, and the existing inner-loop-verbs namespace's `recordNodeOwnerGrant` property was asserted
to be a function and was absent. No missing named import or direct `.parse` of the unsupported
variant prevented the file from loading or threw before an assertion. The later fold, CLI and
preflight legs likewise reached functions/modules that already existed at red. One focused suite
drove the whole observable: settled authority entered through the CLI, became one durable event,
admitted its exact paid attempt, and was then exhausted.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file before
writing. Every new test title is one static string beginning
`owner-grant-carries-settled-authority: ` so the contract-coverage sweep can bind it.

**The required red is behavioural, never structural.** This node declares `editsExisting: true`, so
the test file imports only symbols/modules that exist before the change. Specifically:

- import `InnerLoopEventDoc` (or the existing proof-protocol namespace) and use
  `safeParse(ownerGrantCandidate)`; assert success, then use `parsed.data` only after narrowing;
- import `* as InnerLoopVerbs` from the existing `inner-loop-verbs.js`, inspect
  `recordNodeOwnerGrant` through an `unknown` namespace property, assert `typeof === "function"`, and
  call only after narrowing;
- reach CLI behaviour through the existing exported `run`, fold behaviour through the existing
  `foldInnerLoopLedger`, and preflight through the existing `preflightInnerLoop`—never through a
  missing module or missing named export.

At CONFIRM_RED the test file must load and execute at least one `node:assert/strict` assertion that
fails. A Zod throw from `.parse`, an ESM missing-export error, TypeScript compile failure, or test
file that executes zero assertions is the wrong red and must be revised before implementation.

**Decided by ADR-0578, triggered by ADR-0577 under ADR-0576's explicit deferral.** ADR-0576
deliberately built no owner grant until the first owner answer asked for more attempts on the same
unit. ADR-0577 is that answer: one final `revised-test` attempt for
`codex-detached-app-server`, under the existing increment. ADR-0578 fixes the reusable single-use
mechanism without embedding that unit, question, decision, or allowance as a code literal.

- **A distinct event, not a ceiling bypass.** Add `owner-grant` to the inner-loop protocol with the
  ordinary grant fields and two normalized `asset:` authority refs. The existing `grant` schema,
  `recordNodeGrant`, and its fold branch remain unchanged. The owner branch is legal only at or above
  `ATTEMPT_CEILING`; below it the ordinary policy owns the call.
- **Authority is derived, never asserted by flags.** The CLI accepts the question id only. The
  deciding ADR comes from the settled question. The bound run and increment come from the ledger.
  Their shared arc comes from the three live documents. The event records those derived refs so a
  later read can explain why the ceiling opened.
- **Owner means recorded owner provenance.** `accepted` alone is insufficient because agents can
  accept below-owner-fork decisions. The deciding ADR must carry a valid decision-authority stamp
  whose basis is owner-directed or owner-ratified and whose owner quote is nonblank.
- **Spend is global.** A question authorizes one owner-grant event, not one event per unit. Scan the
  already-read event set for its authority ref before append, and give the owner-grant a canonical
  identity anchored by that ref. Replays and cross-unit reuse refuse rather than idempotently
  returning success.
- **The fold meters; the preflight enforces.** While an owner grant has remaining allowance, expose
  the same grant-kind information preflight already uses for ordinary grants. When the allowance is
  consumed, the fold falls back to `decideAttempt`, whose unchanged answer at six or more failures is
  `escalate`; therefore the next build refuses before spend without another special case.
- **Fail closed on live reads.** A store error, corrupt event, missing doc, kind mismatch, authority
  mismatch, or ambiguous arc never becomes permission. Return the quoted refusal and append nothing.

## Out of scope

- No automatic seventh attempt, no general weakening or increase of `ATTEMPT_CEILING`, and no
  reinterpretation of an ordinary `grant` above the ceiling.
- No parsing the question answer or ADR prose for permission. Structured lifecycle, authority, and
  arc fields are the machine boundary; the durable event carries the exact allowance actually spent.
- No implementation of `codex-detached-app-server` and no Mintbox live-runtime/UAT work. This unit
  only makes ADR-0577's already-settled authority recordable and consumable.

## Contracts (1)

1. **`owner-grant-carries-settled-authority`** — a settled owner-backed question on the failed attempt's arc admits exactly its recorded allowance above the automatic ceiling, once.
   - **asserts —** the owner-grant protocol shape is strict; the fold meters its exact allowance and returns to the unchanged ceiling afterwards; the recording verb derives and validates settled-question, accepted-owner-decision, increment and common-arc authority; replay and cross-unit double-spend refuse globally; the CLI dispatches the live-only command; preflight admits only the matching run shape while allowance remains; every malformed, foreign, unreadable or unproven authority appends nothing; ordinary grants and their ceiling stay unchanged.
   - **covers —** `InnerLoopEventDoc` and canonical identity (`packages/proof-protocol/src/inner-loop-event.ts`); `foldInnerLoopLedger` (`packages/orchestrator/src/proof/inner-loop-ledger.ts`); `recordNodeOwnerGrant` (`packages/cli/src/inner-loop-verbs.ts`); `node owner-grant` option classification and dispatch (`packages/cli/src/at-path.ts`, `packages/cli/src/commands.ts`); owner-grant kind consumption in `preflightInnerLoop` (`packages/drive/src/inner-loop-entry.ts`).
   - **proven by —** `packages/cli/src/owner-grant.test.ts` through the declared focused bun REAL proof, signed PASS on run `real-mu5x39o9` and adjudicated `land`; all four touched packages typechecked before signing, and the `@storytree/cli` package suite was the regression backstop. The prior run `real-mu5wu42a` was correctly refused at CONFIRM_RED because its test threw before an assertion, and supplied no proof.
