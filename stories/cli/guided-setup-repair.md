---
id: "guided-setup-repair"
tier: capability
story: cli
title: "The setup repair loop — a failing invariant is repaired and re-verified, or escalated"
outcome: "A dev's failing setup probe is driven to a re-verified repair, or to a secrets-redacted owner escalation naming why no installer step can fix it."
status: proposed
proof_mode: integration-test
depends_on: []
# Deciding ADRs (ADR-0037 §2): ADR-0207 D6 charters this loop in one decision with two layers
# (bottom `storytree doctor`, top the guide wrapping it), and its D1/D3/D4 supply three of the
# invariants the probes and the escalation are held to — the idempotent installer steps that ARE the
# repair vocabulary, the never-handle-Claude-credentials fence, and the hosted-read identity.
# ADR-0302 D1 removed one probe outright (`seedReadable`) by deleting its subject; the probe list
# below is the post-0302 one.
decisions: [207, 302]
# A greenfield capability registered after its implementation and tests (the arc that authored it:
# capability-layer-coverage-arc increment 5, 2026-08-08). It resolves FOUR story-grain
# `repo-manifest.json` declarations that existed only because no capability covered this organ
# (`guide*.ts`, `escalation-blob.ts`, `repair-planner.ts`, and `doctor.ts` split out of `doct*.ts`).
# The `proof:` block is spec-borne (ADR-0057); there is deliberately NO `real:` arm:
#   1. ADR-0395 — registration order does not make greenfield code brownfield or Adopt-bound; without
#      a current signed pass its honest authored baseline is `proposed` (the pre-merge
#      librarian pass from ADR-0159, which is about frontend-builder's two-stage visual proof and
#      says nothing about manufactured reds). A `real:` arm would also move the pinned
#      REAL-buildable snapshot in `packages/cli/src/node-build.test.ts` (verified: this id appears
#      there zero times).
#   2. `readUnitSourceFiles` (packages/cli/src/check-boundaries.ts:210-234) reads ONLY
#      `real.sourceFile` + literal `real.scope.sourceGlobs` and `continue`s on an absent `real`
#      (`:226`), so this unit contributes nothing to `unitSourceFiles` and the ADR-0192 landlord rule
#      does not fire over it. All five files are in `packages/cli`, this story's OWN building, so no
#      `hostedStories` entry would be needed even if an arm were added later.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs:
      - "packages/cli/src/doctor.test.ts"
      - "packages/cli/src/repair-planner.test.ts"
      - "packages/cli/src/guide-loop.test.ts"
      - "packages/cli/src/escalation-blob.test.ts"
      - "packages/cli/src/guide.test.ts"
      - "packages/cli/src/explorer-invite-doc.test.ts"
    sourceGlobs:
      - "packages/cli/src/doctor.ts"
      - "packages/cli/src/repair-planner.ts"
      - "packages/cli/src/guide-loop.ts"
      - "packages/cli/src/escalation-blob.ts"
      - "packages/cli/src/guide.ts"
---

# The setup repair loop — a failing invariant is repaired and re-verified, or escalated

**Outcome —** A dev's failing setup probe is driven to a re-verified repair, or to a
secrets-redacted owner escalation naming why no installer step can fix it.

**Depends on —** nothing. The edge with
[`unified-command-dispatch`](unified-command-dispatch.md) runs the OTHER way: `commands.ts:78-79`
imports `doctorCommand` and `guideCommand` and dispatches them at `:3115` / `:3123`, so dispatch
CONSUMES this organ rather than being consumed by it. The shared `Envelope` type is a shape, not a
delivered outcome — the suite below drives `guideCommand`/`doctorCommand` directly and never through
`run()`, so nothing this capability proves is preconditioned on the dispatcher. It is a root.

> **Proof status (honest) — `proposed` (a real, standing, passing suite; observational; NOT
> `healthy`).** This was greenfield work landed through ordinary sessions with its tests written
> alongside. Storytree's prove-it-gate did not drive it red→green, but that proof fact does not create
> brownfield provenance (ADR-0395); no `real:` arm is manufactured here.
>
> **The outcome half — `packages/cli/src/guide.test.ts`, 12 tests.** The whole loop is driven through
> the real modules: only the two EFFECTS are faked (`observe` and `runStep`, `guide.test.ts:46-56`),
> while `runDoctor`, `planRepairs`, `buildEscalationBlob`, `startGuide` and `stepGuide` are the real
> implementations reached through `guide.ts`. `:78` walks a failure all the way to healthy; `:111`
> walks an owner-side block all the way to an escalation. That is the integration proof.
>
> **The real-world half — two suites red on a REAL FILE, not a fixture.** `doctor.test.ts:235-241`
> reads the actual `infra/install.ps1` off disk and extracts its `# @step:` markers; `:243` then
> fails if any probe's `fixStep` names a marker the script no longer carries.
> `repair-planner.test.ts:91-95` / `:97` does the same for the plan's actions, and
> `explorer-invite-doc.test.ts:38` holds the escalation categories against the real
> `infra/explorer-invite.md`. So this capability's proof observes drift in two artifacts OUTSIDE its
> own source, which is unusual in this package and is the strongest thing about it.
>
> **The leaf half — 59 further tests** across `doctor.test.ts` (26), `escalation-blob.test.ts` (14),
> `guide-loop.test.ts` (12) and `repair-planner.test.ts` (7). These are the contracts below.
>
> **The stated gap — the SHELL half of `doctor.ts` is not proven, and neither is dispatch.**
> `gatherObservations` (`doctor.ts:510`) and `runInstallerStep` (`guide.ts:169`) are exactly the two
> seams `guide.test.ts` fakes, so nothing in this scope ever spawns `powershell … install.ps1` or
> shells out to `git` for real. `probeHostedRead` is proven against an injected `fetchImpl`
> (`doctor.test.ts:314`, `:320`, `:335`), never against a live studio. And no test invokes
> `run(["doctor"])` or `run(["guide"])`, so the `commands.ts` dispatch of this organ is uncovered.
> Recorded here, not implied: the loop's POLICY is proven end to end; its two effect boundaries are
> not.
>
> **No reliability gate `(covers:)` this capability.** [`story.md`](story.md)'s `cli#gate-1` names
> `unified-command-dispatch`, `cli-resident-corpus-tools` and `organism-boundary-tooling` only. Its
> command (`pnpm --filter @storytree/cli test`) does run every test above, so the evidence is
> already inside that gate's observation — but the gate does not CLAIM it, and extending an
> already-signed gate's `(covers:)` changes what a signed verdict asserts. That is a deliberate,
> id-aware owner edit, so it is left as a stated gap rather than taken here (the same disposition
> increments 2, 3 and 4 took).

## Guidance

**WHY THIS IS ONE ORGAN AND NOT FIVE** (the splitting-rule, ADR-0010). The tempting cut is by
module — probes, planner, loop, blob, shell — which is exactly how the four `repo-manifest.json`
declarations that preceded this file were shaped. It is the wrong cut, and
ADR-0207
D6 says so in the decision itself: it charters ONE thing, in one sentence — *"run doctor → explain
the failure plainly → propose the fix → dev confirms → re-run the corresponding idempotent installer
step from D1 → re-doctor"* — with the escalation blob as its other terminal. The modules are that
sentence's clauses.

- **Four of the five could not state a proof alone.** `repair-planner.ts` is 104 lines whose entire
  input type is `DoctorReport` and whose only consumers are `guide.ts:37` and `guide-loop.ts:40`.
  `escalation-blob.ts` imports `HOSTED_READ_REFUSED_DETAIL` and the probe types from `doctor.js`
  (`:32-33`) and is called only from `guide-loop.ts:192`. `guide-loop.ts` is a pure reducer over the
  other three, with no meaning apart from them. `guide.ts` is a 244-line shell whose pure half
  (`driveGuide`, `:85-153`) is *the composition itself*. Under the arc's own rule that a capability
  which cannot state its proof must not be authored, a per-module split does not yield five weak
  capabilities; it yields one and four units that are illegal to author.
- **Both triggers of the splitting-rule pass for the fused unit.** The outcome states in one
  sentence (above) — the `or` is a terminal disjunction over one loop's complete codomain, the same
  shape [`proof-binding-outcome-contract`](../proof-binding-integrity/proof-binding-outcome-contract.md)
  and [`model-escalation-ladder`](../model-judged-uat/model-escalation-ladder.md) already carry, not
  a second job bolted on with `and`. And the proof shares one precondition (one `DoctorObservations`)
  and one observable (the loop's terminal `GuideOutcome`).
- **The dependency runs one way and the graph stays acyclic.** `doctor` → `repair-planner` →
  `escalation-blob` → `guide-loop` → `guide` is a single chain with no back-edge.

**WHY `doctor.ts` IS INSIDE AND `doctrine.ts` IS NOT — the `doct*.ts` glob had to split.** They share
five letters and nothing else. `doctrine.ts` is a FOUR-LINE back-compat re-export onto
`@storytree/drive` (`export { renderDoctrine, renderDoctrines }`) whose implementation increment 1
already settled at story grain as *not an ORGAN*; it renders one fail-soft envelope pointer line and
has no part in any repair. `doctor.ts` is 577 lines of probe layer that every other module in this
organ imports by type. The glob was a filename coincidence, and increment 2's `desktop*.ts` precedent
— replace a glob with its literal members when they have different owners — applies unchanged.

**WHY THIS IS A `cli` CAPABILITY, and the home that was checked and refuted.**

1. **It is CLI-RESIDENT BY CONSTRUCTION, not by convenience.** All five files are in
   `packages/cli/src`; none is on the package's public surface (`index.ts` exports none of them);
   and NOTHING outside `packages/cli` imports any of them. That last fact is structural rather than
   incidental — `apps/studio/src/modelPathBoundary.test.ts:21` and
   `apps/studio/src/components/ChatPanel.spawn.test.tsx:175` both assert `@storytree/cli` is
   FORBIDDEN, and `apps/desktop/electron/backend-entry.ts:553` records that `run()` *"stays in
   @storytree/cli, which this sidecar may not import"*. No other surface can reach this code even if
   it wanted to.
2. **It rides the CLI's test surface**, which is the criterion
   [`organism-boundary-tooling`](organism-boundary-tooling.md) was admitted on and the one
   `repo-manifest.json`'s rule (6) records as operative.
3. **`app-guide` — checked, because its story is literally about guiding a newcomer through
   install and authentication, and refuted on three independent facts.** Its outcome is *"A newcomer
   opening the DESKTOP APP is guided by a CONVERSATIONAL CONCIERGE …"*: a different surface (the
   Electron app, not a terminal), a different audience (a newcomer, not a dev at a shell), and a
   different mechanism (an LLM concierge, where `guide-loop.ts` is a deterministic reducer with no
   model anywhere in it). Its four capabilities are all chat-panel plumbing —
   `auto-grow-input`, `multi-turn-transcript`, `transcript-reset`, `backend-chat-reset-route`. And
   decisively: `app-guide`'s code lives in `apps/desktop` and `apps/studio`, which the import ban in
   (1) stops from ever consuming this organ. ADR-0207 D6 describes the guide as wrapping doctor
   *"conversationally"*, and that conversational wrapper is `app-guide`'s to build; what is built
   HERE is the deterministic loop underneath it, which the concierge would have to re-reach through
   a process boundary. Two layers, two stories, cleanly split.

**WHAT THIS DOES NOT RE-DERIVE.** [`story.md`](story.md)'s design floor fences the hub against
*"a re-derivation of every per-domain command surface (those belong to the organism that owns the
journey)"*. Nothing is re-derived here because there is no organism whose domain this is: the
subject matter is the DEV'S OWN MACHINE — git, Node, the checkout, the lockfile, the Claude CLI's
login state, the hosted read — which no story in the tree owns and no organism produces. The
open modeling call 1 that story raises is about whether CLI-resident competences belong to the hub
at all; this unit is entered on the same footing `organism-boundary-tooling` already holds under
that unresolved call, and it does not widen it.

## Integration test

**Goal —** Prove that a dev with a broken checkout is carried to a decided end: every failing probe
is explained, proposed, repaired by re-running the matching idempotent installer step and re-verified
by a second doctor pass — and where no step can fix it, the run terminates in a redacted escalation
naming the owner action, never in a false "you're all set".

The integration-flavoured proof is `packages/cli/src/guide.test.ts`, run by
`pnpm --filter @storytree/cli test`. Real collaborators, no stub between them: the run pulls in the
real `runDoctor`, the real `planRepairs`, the real `buildEscalationBlob` and the real
`startGuide`/`stepGuide` reducer, and asserts on the loop's terminal outcome and its rendered text
rather than on any intermediate return value. Only `observe` and `runStep` are injected, because
those are the two places the loop touches the world.

Seven behaviours, one per branch the loop can take: healthy in, healthy out with nothing enacted
(`:60`); a repairable failure PREVIEWED and not enacted (`:68`); one failure repaired and
re-doctored to healthy (`:78`); several repaired in dependency order (`:86`); ADR-0207 D3's login
instructed and never executed in either mode (`:97`); an owner-side block escalated instead of
reported healthy (`:111`); and an unrepairable residue terminating `stuck` rather than retrying the
same step forever (`:120`).

`proposed` (greenfield, observationally tested, without a current signed pass). The two effect seams and the
`commands.ts` dispatch are exercised nowhere in this scope — the stated gaps recorded above, not
claimed here.

## Contracts (8)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`the-repair-vocabulary-cannot-drift-from-the-real-installer`** — ADR-0207 D6's load-bearing
   join, and the only contract here whose red comes from a file this organ does not own
   - **asserts —** every probe that offers a `fixStep`, and every installer-step action the plan
     emits, names a `# @step:` marker that EXISTS in the real `infra/install.ps1` read off disk at
     suite load; and at least four probes repair that way, so the assertion cannot pass vacuously by
     there being no `fixStep` at all. D6 says repair *"is not new machinery; it is the installer
     re-invoked"* — which is only true while the two vocabularies agree, and nothing else in the
     repo checks that they do.
   - **covers —** `packages/cli/src/doctor.ts:157-368`, `packages/cli/src/repair-planner.ts:71-93`
   - **proven by —** `packages/cli/src/doctor.test.ts:243`, `packages/cli/src/repair-planner.test.ts:97`
     (REAL, passing)
2. **`offline-is-undetermined-and-undetermined-never-fails`** — doctor stays runnable on a machine
   with no network, which is the state it is most needed in
   - **asserts —** an unreachable remote and an unknown freshness WARN rather than FAIL; a behind
     checkout WARNs (a pull is a freshness step, not a broken invariant); stale dependencies WARN and
     never FAIL; every non-ok hosted-read state WARNs; and the three currency states read
     DIFFERENTLY, so an undetermined probe is never rendered as a pass.
   - **covers —** `packages/cli/src/doctor.ts:157-368`, `:459-471`
   - **proven by —** `packages/cli/src/doctor.test.ts:89`, `:96`, `:135`, `:162`, `:212`, `:294`
     (REAL, passing)
3. **`the-claude-credential-is-instructed-and-never-enacted`** — ADR-0207 D3's fence, held at all
   three layers rather than trusted at one
   - **asserts —** the `claude-login` probe detects and instructs while carrying NO installer
     `fixStep`; the planner turns it into an INSTRUCTION action with no executable step; the reducer
     moves `confirm` to `instruct-dev` and NEVER to `run-installer-step`; and the same holds in
     `--fix` mode as in preview. Storytree never handles the credential, so the one repair it must
     not automate is fenced in the probe, the plan and the loop independently.
   - **covers —** `packages/cli/src/repair-planner.ts:71-84`, `packages/cli/src/guide-loop.ts:212-254`
   - **proven by —** `packages/cli/src/doctor.test.ts:226`, `packages/cli/src/repair-planner.test.ts:81`,
     `packages/cli/src/guide-loop.test.ts:109`, `packages/cli/src/guide.test.ts:97` (REAL, passing)
4. **`the-plan-is-one-ordered-action-per-failing-probe`** — the plan is a function of the report, not
   a menu
   - **asserts —** a healthy report yields an EMPTY plan and a WARN-only report yields an empty plan
     too (advisories are not repairs); a fresh environment yields one action per FAILing probe; and
     the order is the probe order, so git precedes node precedes checkout-provisioned and a dev is
     never asked to fix a symptom before its cause.
   - **covers —** `packages/cli/src/repair-planner.ts:86-93`
   - **proven by —** `packages/cli/src/repair-planner.test.ts:46`, `:53`, `:59`, `:72` (REAL, passing)
5. **`the-loop-terminates-and-never-retries-a-step-that-did-not-work`** — the property that makes an
   unattended loop safe to run
   - **asserts —** a step that runs and leaves its probe still FAILing is tried ONCE and the run ends
     `stuck` rather than looping; the `attempted` list is what guarantees it; stepping a terminal
     state with any event is a no-op; and `directiveFor` is TOTAL, so no phase can fall through to an
     undefined directive.
   - **covers —** `packages/cli/src/guide-loop.ts:150-168`, `:191-210`
   - **proven by —** `packages/cli/src/guide-loop.test.ts:154`, `:188`, `:198`,
     `packages/cli/src/guide.test.ts:120` (REAL, passing)
6. **`preview-never-enacts-and-fix-is-opt-in`** — reading the diagnosis costs the machine nothing
   - **asserts —** a repairable failure in preview mode is described and NO installer step is run;
     and `--fix` is a declared dependency of enactment, so a bare `storytree guide` cannot enact by
     accident. The default is the safe one, structurally rather than by convention.
   - **covers —** `packages/cli/src/guide.ts:85-153`, `:208-229`
   - **proven by —** `packages/cli/src/guide.test.ts:68`, `:138` (REAL, passing)
7. **`the-blob-is-redacted-and-only-an-owner-side-block-earns-one`** — the escalation is narrow, and
   it carries no secret
   - **asserts —** a healthy report, an installer-repairable report and an offline-but-otherwise-healthy
     report each yield NO escalation, so the owner is not paged for anything the loop can fix itself;
     a missing Claude login escalates as `identity` and a refused remote as `access`; `redact()`
     strips a credentials path, an `sk-ant` token and a long opaque token; and — the contract that
     matters — even when a probe's DETAIL leaks a credentials path or token, neither the blob nor its
     rendered text carries it, so redaction is applied at the boundary rather than trusted upstream.
   - **covers —** `packages/cli/src/escalation-blob.ts:91-115`, `:117-140`, `:161-193`
   - **proven by —** `packages/cli/src/escalation-blob.test.ts:30`, `:38`, `:47`, `:53`, `:62`,
     `:106`, `:117`, `:139` (REAL, passing)
8. **`the-two-access-blocks-keep-distinct-owner-actions-and-the-runbook-names-them`** — an escalation
   the owner cannot act on is not an escalation
   - **asserts —** a refused GitHub remote and a refused hosted read produce DIFFERENT owner actions
     (a repo Read grant vs an IAP membership grant, ADR-0207 D2 and D4 — two grants, two consoles);
     an unconfigured or unreachable hosted read never pages the owner at all; and every
     owner-escalatable ACCESS probe is NAMED in the real `infra/explorer-invite.md` runbook, checked
     against that file on disk — so an escalation category can never be added without the runbook
     gaining the step that answers it.
   - **covers —** `packages/cli/src/escalation-blob.ts:117-159`, `packages/cli/src/doctor.ts:128-155`
   - **proven by —** `packages/cli/src/escalation-blob.test.ts:150`, `:160`, `:167`,
     `packages/cli/src/explorer-invite-doc.test.ts:38` (REAL, passing)
