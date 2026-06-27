---
status: accepted
decided: 2026-06-27
supersedes_in_part: [116]
---
# ADR-0118: Workflow-first CLI surface: proof commands mirror the studio's workflows, primitives nest below

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. Supersedes IN PART ADR-0116 (which kept `gate` a standalone top-level area and left the proof surface grain-first); ADR-0116's "`adopt` is first-class" call survives — `adopt` stays, now as a workflow with the gate primitive nested under it.

## Context

ADR-0116 (landed earlier the same day) made `storytree adopt` a first-class area but KEPT the proof surface **grain-first**: `node`, `gate`, `uat`, `attest`, `adopt`, `story` sit as top-level peers, each organized by the proof GRAIN it operates on (a node, a reliability gate, a UAT test). Its load-bearing call was "keep `gate` standalone because it spans adoption *and* build."

The owner reframed the surface from first principles. Two forces:

1. **The CLI's primary user is an agent doing choose-your-own-adventure discovery (ADR-0023).** For that user the top-level question is "what is my GOAL?" — not "what grain am I operating on?" A grain-first top surface leaks the proof MACHINERY's taxonomy to the discovery surface and forces the agent to learn the "reliability gate" grain before it can express the goal "adopt this story."
2. **The CLI should mirror the studio's workflow affordances.** The studio surfaces status-aware WORKFLOWS (the Adopt / Build buttons, ADR-0094) — there is no standalone "gate" panel; gate state shows up *within* the adopt/build context. Mirroring that vocabulary makes the two surfaces teach the same mental model.

The key realization that unlocks the reshape: **`gate run` is one verb hiding a phase fork.** An `observe` gate is observe-and-signed to an `adopted` verdict — that IS adoption (ADR-0085/0097). A `build-tests` gate is driven red→green to a DRIVEN verdict (`gate run --real`) — that IS a build (ADR-0098). The gate's *kind* (plus a `--real` flag) silently selects the phase. So "keep `gate` standalone because it spans two phases" (ADR-0116) was treating a symptom: the right move is not to host the conflated verb at the top, but to **un-conflate it** by promoting the phase to the parent.

## Decision

Make the CLI proof surface **workflow-first**: the top level is the set of workflows an operator/agent actually pursues (mirroring the studio), and the composable primitives nest BELOW each workflow.

- **`adopt <story>`** — bring a brownfield story into the fold.
  - `adopt <story>` — the ceremony (observe-sign every observe gate + machine UAT legs, flip `mapped → proposed`).
  - `adopt plan <story>` — classify coverage.
  - `adopt gate <story>#gate-<n>` — primitive: observe-and-sign ONE observe gate (was `gate run <g>`).
- **`build <id>`** — drive red→green, **auto-routing node-vs-story by tier** (mirrors the studio's single Build button / `routedBuildRunner`: a story id → the whole-story chain, anything else → a node build).
  - `build node <id>` — explicit single node (was `node build <id>`).
  - `build story <id>` — explicit whole-story chain (was `story build <id>`).
  - `build gate <story>#gate-<n> --real` — primitive: earn a `build-tests` gate by a real red→green (was `gate run <g> --real`).
- **`witness <story>`** — the human/operator proof workflow (it cuts across adopt AND build — you witness a UAT test whether the story was adopted or built — so it is its OWN workflow, not nested under either).
  - `witness list <story>` (was `uat list`), `witness attest <test>` (was `uat attest`), `witness vouch <test>` (the lower-rigor ADR-0044 vouch, was `attest`).
- **`tree [<story>]`** — orientation absorbs gate INSPECTION: a story's reliability-gate obligations + proven glyphs render here (was `gate list`).

The standalone top-level `gate`, `node`, `story`, `uat`, `attest` areas DISSOLVE; their operations RELOCATE (never vanish) under the workflows above. Every moved verb keeps a **back-compat alias** so no caller/script/agent-habit breaks silently — same discipline as ADR-0116's `story adopt-plan` redirect.

Two tenets are recorded as the durable rationale (candidates for promotion to principles by the implementing session):

- **The CLI is a SUPERSET of the UI, not a mirror.** The top surface borrows the UI's workflow VOCABULARY, but a uniform `<grain> <verb>` ALGEBRA persists underneath for agent composition. The UI user clicks one state-aware button; the agent composes and loops and discovers via the `next:`/help envelope, so it legitimately needs primitives the UI never exposes (`build node`, `adopt gate`). We relocate the primitives; we do not lose them.
- **Workflow-first IS the CYOA stance.** Surface GOALS at the top; teach the grain concepts (reliability gate, verdict tier) in-context through help and `next:`; let the agent drill in to reach the primitives. The concept doesn't need a top-level area to exist — it needs to be taught where it's relevant.

## Consequences

- Agent discovery becomes goal-first and studio-faithful; the two surfaces teach one mental model.
- `gate`'s hidden phase fork is un-conflated at the surface: observe → `adopt gate`, build-tests → `build gate --real`. The `--real` flag stops doubling as a silent phase switch.
- The composable grain-algebra survives one level down, so scripted/looping agents keep predictable primitives.
- COST: a real reshape of the proof top-verbs (`node`/`story`/`gate`/`uat`/`attest`), back-compat aliases to maintain, and a top surface that CHURNS more than a grain-first one (workflows multiply as the methodology grows — adopt, build, witness, … — where grains are stable nouns). The churn is accepted as a feature: the surface should track how we actually work.
- This is a substantive re-decision of ADR-0116's grain-first/gate-standalone call (copy-on-write, ADR-0086): recorded as `supersedes_in_part: [116]`; ADR-0116's first-class-`adopt` decision is retained.
- ALIGNMENT SCAFFOLDING (deferred to the implementing session, per the owner): the reshape likely warrants new PRINCIPLES (the two tenets above) and possibly a dedicated **cli-writer subagent** to keep the surface aligned as it grows. Whether to add them — and the plan to **dogfood** the reshape through storytree's own build machinery rather than hand-coding it — is the explore step a fresh session owns next.

## References

- ADR-0116 (the first-pass `adopt` area + the grain-first/gate-standalone call this supersedes in part), ADR-0023 (the choose-your-own-adventure CLI surface), ADR-0094 (status-aware go-green affordances the studio surfaces — Adopt for `mapped`, Build for `proposed`), ADR-0098 (build-tests gates earned by a real build — the build half of the gate fork), ADR-0085 / ADR-0097 (observe gates / adoption — the adoption half), ADR-0044 (the lower-rigor attestation vouch → `witness vouch`), ADR-0057 (node-build discoverability), ADR-0110 (owner-directed → born accepted).
- Code: `apps/studio/server/buildWorker.ts` `routedBuildRunner` (the studio's tier-routed single Build the `build <id>` auto-route will mirror); `packages/cli/src/commands.ts` (the dispatch to reshape); `packages/cli/src/{adopt,gate,uat,attest}.ts` + `@storytree/drive`'s `node-build`/`story-build` (the primitives to relocate).
