---
status: accepted
load_bearing: true
decided: 2026-06-22
amends: [90, 91]
---
# ADR-0094: Go-green is a status transition: proposed builds, mapped adopts, red-recovery deferred

## Status

accepted (2026-06-22) — direct owner decision in a design conversation while curating the just-landed
[ADR-0092](0092-gate-as-proof-for-a-machine-witnessed-story-s-own-uat-node.md). The owner observed that
the studio's brownfield **Build** button is modelled on a concept that *has not been born* — a story in
a *red status* that a **user** presses a button to flip green — and that the transitions we actually
have are `proposed → healthy` (build) and `mapped → healthy` (adopt). The owner directed removing the
red→green *user-facing* wording and routing brownfield through
[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)'s reliability gates. The
`status:` flip was applied by this session per [ADR-0084](0084-agents-may-flip-an-adr-green.md). Tagged
`load_bearing`: it reframes the build-affordance model ([ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md)
/ [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md)) a new session must
calibrate to.

**Provenance correction ([ADR-0395](0395-brown-records-provenance-missing-proof-stays-on-the-greenfie.md),
per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** the general
status-aware split in decisions 1–3 stands for genuinely greenfield versus inherited brownfield work.
The `library`-specific application in decisions 4–5 does not: Storytree's `library` story is
greenfield, and retrospective registration does not turn it into a `mapped` Adopt target.

> **Amended by [ADR-0404](0404-dispatching-a-build-is-a-cli-verb-retire-the-in-app-build-an.md)**
> (accepted, 2026-08-21) — **the status-aware AFFORDANCE is retired; the status MODEL stands.** The
> transitions this ADR named — `proposed → healthy` by build, `mapped → healthy` by adopt — are
> unchanged, and remain how go-green works. What is withdrawn is the UI that offered them: the
> status-aware Build/Adopt control in `BuildSection`, and with it the `goGreen` / `adoptGates` /
> `adoption` fields the tree payload computed to drive it. Both transitions are dispatched from the
> CLI (`storytree story build`, `storytree adopt`).

## Context

The studio's story-level **Build** button ([ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) /
[ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md)) lights when
`isStoryBuildable(id, caps, 'real')` is true — i.e. every DRIVEN node carries a `real:` arm — and runs
`story build <id> --real`, which drives each node red→green through the prove-it-gate.

[ADR-0092](0092-gate-as-proof-for-a-machine-witnessed-story-s-own-uat-node.md) made the `library` story
satisfy that check: it added a gate-as-proof `real:` arm to the story's machine-witnessed UAT node and
brownfield-labelled `real:` arms to its seven capabilities, so the studio offered Build for the
library. The story was then treated as **brownfield** (`status: mapped`) and redirected away from a
red→green drive to
[ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)'s author-declared
`## Reliability Gates`, whose `observe` gates the spine **observe-and-signs** into an `adopted` verdict.
A red→green arm on a mature, already-green artifact has no genuine red, so it **fails closed**: the
button lit, but pressing it cannot deliver green. The two foundational ports (`proof-protocol`,
`storage-protocol`) already went green the ADR-0085 way. ADR-0395 later corrected the distinct
provenance mistake in this example: `library` is greenfield, so neither its prior `mapped` label nor
registration order authorises Adopt.

Underneath that wiring gap is a **modelling error**. The "press Build to turn a story green" framing
silently imports a transition that does not exist in our world: a story sitting in a **red status** that
a **person** acts on. In practice:

- The transitions we actually have are **`proposed → healthy`** (build authored work to green) and
  **`mapped → healthy`** (adopt an existing brownfield suite). Those are what a go-green affordance
  should reflect.
- A `healthy` story that **regresses to red** is the **agent loop's** trigger, not a user's: the
  orchestrator owns driving red→green ([ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns
  the *outer* loop, the agent the inner; [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) —
  `green = a signed gate verdict`). A red tile on the world is a signal *to an agent*, not a button *for
  a user*.
- We have **no observed case** of a story staying red long enough that a human must act on it through
  the studio. Modelling a user-facing red-recovery affordance now is speculative (YAGNI) — the concept
  surely exists somewhere, but it has not been born here.

So the Build button over-promises (it implies a red→green user action that does not apply to brownfield)
*and* the library was pointed at the wrong mechanism. This ADR fixes the model, not just the wiring.

## Decision

**1. The studio's go-green affordance is a function of the story's STATUS, not a generic "Build".**
- **`proposed → healthy`: Build.** Drive the story's author-declared obligations to green through the
  prove-it-gate (`story build --real`). The gate's internal red→green is the proof *mechanism*; the
  user-facing concept is "build a proposed story to healthy", never "recover a red story".
- **`mapped → healthy`: Adopt.** A brownfield story earns green by author-declared `## Reliability
  Gates` observe-and-signed to `adopted` (ADR-0085) — surfaced as **Adopt / run reliability gates**
  (`gate run <id> --pg`), **not** Build.
- **`healthy`:** no go-green affordance (re-verification aside).

**2. Story-status red-recovery is DEFERRED as a not-yet-born concept.** A `healthy` story that regresses
to red is recovered by the **agent** loop (the orchestrator; ADR-0030 / ADR-0020) — never by a user
"flip it green" button. We will not model, gate on, or build a user-facing red-recovery affordance until
we **observe** a story staying red long enough that a human must act on it through the studio. The
**red→green wording is removed from the build/affordance framing** accordingly. This touches only the
*user-facing narrative*; the prove-it-gate's red→green *mechanism* ([ADR-0007](0007-proof-model.md) /
ADR-0020) and the agent's red→green *job* are unchanged.

**3. `isStoryBuildable` / the Build button is gated on the story's green path matching its status.**
A `mapped` story does **not** light **Build** merely because its driven nodes carry `real:` arms — it
lights **Adopt** (its reliability gates). Build lights only for a story whose path to its declared green
is a genuine drive (a `proposed` story, or — when it arrives — an ADR-0085 `build-tests` gate's
author-declared red→green). *(Amends [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md)
/ [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md), which defined the
single status-blind Build affordance.)*

**4. Correct ADR-0092 in place: its studio-Build purpose is overtaken.** A genuinely brownfield story's
UAT node does **not** earn the studio **Build** affordance via a gate-as-proof `real:` arm. At the time
this was applied to `library` and redirected it to `## Reliability Gates` (ADR-0085); ADR-0395 later
withdrew that application because `library` is greenfield. This still overtakes **ADR-0092 decision 1's
*button-lighting purpose*** (the gate-as-proof
story-node arm) **and decision 5's *buildability purpose*** (the 7 caps' brownfield `real:` arms). What
**survives** ADR-0092: decision 1's gate-as-proof MECHANISM (the `real:` arm via `editsExisting` over
`stories/<story>/story.md`, the AUTHOR_TEST→…→GATE ladder), **decision 2** (`storyUatCompleteness` as a
spec-hygiene check), **decision 3** (the node-verdict-≠-story-green-crown honesty boundary), and
**decision 4** (the [ADR-0087](0087-spec-borne-write-scope-is-bounded-structurally-not-by-pr-dif.md)
authoring-doc scope-bound amendment). Because ADR-0092's core stands, it is **corrected in place**
([ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)) and stays
`accepted` — not fully superseded.

**5. The historical `library`-as-brownfield application is withdrawn.** This ADR directed `library`
to declare `observe` gates over its existing passing suites and treated those gates as an Adopt path.
ADR-0395 corrects that classification: Storytree's `library` story is greenfield, and neither those
gates nor its retrospective registration establish brownfield provenance. The general reliability-gate
mechanism remains available to genuinely inherited brownfield stories.

## Consequences

**Good.**
- The studio stops over-promising: a brownfield story offers the affordance that can actually green it
  (**Adopt**), not a fail-closed **Build**.
- The model only carries transitions that exist (`proposed → healthy`, `mapped → healthy`); speculative
  user-facing red-recovery is excluded by construction until observed — the YAGNI the owner asked for.
- ADR-0085's brownfield-green path remains the actual path for genuinely inherited stories. Its
  `library` application was withdrawn by ADR-0395; unsigned greenfield `library` work is `proposed`.
- ADR-0092 is **corrected in place** ([ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
  its overtaken Build-button purpose is fixed while its still-valid parts (decisions 2–4 + the
  gate-as-proof mechanism) stay — truth-maintenance, not an orphan additive ADR.

**Bad / costs / follow-on (surfaced, not buried).**
- This **partly unwinds ADR-0092** (landed PR #305, curated PR #306): the gate-as-proof story-node arm
  loses its button-lighting justification (it keeps spec-hygiene value). The library `story.md`
  `proof.real` arm and the 7 cap `real:` arms become **vestigial for buildability** and should be
  removed or repurposed when the reliability gates land (follow-on).
- The ADR-0092 open-call **#5 prose** added in PR #306 ("live red→green still pending") carries the
  removed framing and must be reconciled to the `mapped → healthy` / reliability-gate path on acceptance.
- The **`isStoryBuildable` / studio affordance** change (status-aware Build vs Adopt) is **decided here,
  built follow-on** — including the studio surfacing of `## Reliability Gates` as the Adopt action.
- Red→green does **not** disappear from the system: it is the proof mechanism, and it re-enters
  *author-declared* via an ADR-0085 `build-tests` gate if observation proves insufficient — never as a
  user-pressed red-recovery button.

## References

- [ADR-0085](0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md) — brownfield green via
  author-declared `## Reliability Gates` + `observe`/`adopted` (the path this ADR routes brownfield to;
  **left untouched**).
- [ADR-0092](0092-gate-as-proof-for-a-machine-witnessed-story-s-own-uat-node.md) — gate-as-proof story
  UAT node; **decisions 1 & 5 overtaken here** (corrected in place per ADR-0139), decisions 2–4 stand.
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) /
  [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the status-blind
  Build affordance this **amends** to be status-aware.
- [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — author-defined story
  green (the obligation model `proposed → healthy` / `mapped → healthy` rest on).
- [ADR-0007](0007-proof-model.md) / [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the
  proof modes and `green = a signed verdict` (the red→green *mechanism*, unchanged).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop, the agent the inner
  (why red-recovery is an agent job, not a user button).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — `uat_witness`; a
  machine-witnessed story drives its own UAT node (the ADR-0092 premise this reframes).
