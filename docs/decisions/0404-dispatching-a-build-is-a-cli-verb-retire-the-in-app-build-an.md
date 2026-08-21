---
status: accepted
arc: retire-ui-build-dispatch-arc
decided: 2026-08-21
amends: [90, 94, 97, 136, 144]
load_bearing: true
---
# ADR-0404: Dispatching a build is a CLI verb — retire the in-app Build and Adopt affordances

## Status

accepted — the owner's call, 2026-08-21: *"we have been building using coding harnesses claude code
and codex and i don't think we need build buttons in the UI, instead coding harnesses can drive this
from the cli as needed."* Design-time alignment is ratification (ADR-0110), so this is born accepted
rather than proposed. The owner directed the BUILD half verbatim; the ADOPT half is this ADR's own
call, taken on the owner's stated reasoning and flagged as such in `## Consequences`.

## Context

The forest map's detail panel offers a **Build** button plus a Claude/Codex runtime picker
(`apps/studio/src/components/BuildSection.tsx`) and, for a brownfield story, an **Adopt** button
(`AdoptPanel`, same file). Both POST an intent to the studio/desktop backend, which mints a run in a
shared in-memory `BuildRegistry` and drives it fire-and-forget while the client polls.

Four facts, all re-verified against this checkout on 2026-08-21, set the terms:

**1. The Build click is a real, subscription-billed drive — not a smoke test.** `routedBuildRunner`
(`packages/drive/src/build-worker.ts:347`) routes a node id to `nodeBuild(unitId, { real: true,
verdictStore: 'pg', … })` and a story id to `storyBuild(… real: true, openPr: true …)`. Since
ADR-0144 the node branch signs a genuine RED→GREEN verdict, persists it to `events.verdict`, and
parks a `claude/real/<unit>-<run>` branch. Two pieces of operator-facing copy still describe the
pre-ADR-0144 world and are now false: the node hint at `BuildSection.tsx:283` ("Runs a quick test
build on your machine — it checks that the build works, not the real feature") and the `scope`
JSDoc at `BuildSection.tsx:166` ("`node build --live` — proves the build PIPELINE on a synthetic
task, not the node's real feature"). A control that spends the owner's subscription while telling
him it is a cheap check is the sharpest argument against keeping it.

**2. The CLI already is the dispatch surface, and on the desktop the button admits it.** With the
terminal bridge present, a Build click does not dispatch in-app at all — it SEEDS the embedded
terminal with `pnpm storytree node build <id> --real --store pg --runtime <r>`
(`apps/studio/src/lib/buildCommand.ts`, wired at `BuildSection.tsx:238`). The in-app dispatch is
already the fallback for the case where no harness is present, which is precisely the case the
owner says does not need serving.

**3. Adopt has an exact CLI equivalent, by its own documentation.** `storytree adopt <story-id>
--pg` (`packages/cli/src/adopt.ts:8-12`) is described in its own header as *"The SAME engine the
studio's Adopt button drives"*, and `storytree adopt plan <story-id>` gives the read-only Layer-2
classification offline. The owner's reasoning — the harnesses drive it from the CLI — transfers to
Adopt without modification.

**4. The Adopt panel currently renders for no story at all.** `AdoptPanel` is reached only via
`goGreen === 'adopt'`, which requires `status: mapped`. A census of `stories/*/story.md` finds 38
`proposed`, 8 `retired`, **0 `mapped`** out of 46. The panel is live code on an unreachable branch.

The cost being carried for this is not only the button. It is: a `BuildRegistry` instantiated in two
separate backends; a POST/GET `/api/build` pair and a POST `/api/adopt` in the studio route table
plus two mount factories in the desktop backend; a polling React hook, a transcript renderer and an
appearance harness in the SPA; and five fields on the tree payload (`buildable`, `storyBuildable`,
`goGreen`, `adoptGates`, `adoption`) whose only consumer is `BuildSection`.

One consumer named in earlier scoping is genuinely dead: `dispatchAcceptedBuild`
(`packages/drive/src/build-worker.ts:423`), the chat accept→dispatch of ADR-0108/0144. Its caller
`packages/drive/src/spawn-builder.ts` does not exist — ADR-0175 retired the in-app spawn surface —
and grep finds no production reference. Only its own relocation test exercises it. Several story
documents still cite the deleted file by line number.

**The genuine fork is Adopt**, because it is not a mechanical consequence of removing Build. It has
its own POST route and its own runner; what it SHARES is the registry, the `usePollableRun` hook,
the `BuildRun` transcript renderer, and — critically — its only progress-poll path, `GET
/api/build?runId`. Remove the build route pair and Adopt loses the ability to report progress unless
something is minted to replace it. Three options were weighed:

- **(A) Retire Adopt's dispatch alongside Build.** The owner's reasoning applies verbatim; fact 3
  proves CLI parity, fact 4 proves nothing is being taken away from anyone today.
- **(B) Keep Adopt on its own transport.** Requires MINTING a replacement poll route (`GET
  /api/adopt?runId`) and retaining the registry, the hook and the transcript renderer — that is
  substantially the machinery this arc exists to remove, kept in service of a panel that renders for
  zero stories.
- **(C) Keep the panel read-only** — surface the reliability gates and the adoption plan, drop only
  the button. Needs no poll route, but retains the panel, its tests, and all five payload fields;
  `storytree adopt plan` already prints the same classification.

## Decision

**1. The only supported way to dispatch a build or an adoption is the CLI.** `storytree node build`,
`storytree story build` and `storytree adopt` are the dispatch surface. No UI dispatches either.

**2. Retire the in-app Build affordance**: the Build button, the Claude/Codex runtime picker, the
`api.build` / `api.buildStatus` client pair, `POST`/`GET /api/build` in the studio route table, and
`createBuildRouteMount` in the desktop backend.

**3. Retire the in-app Adopt affordance too — option (A).** `AdoptPanel`, `api.adopt` and `POST
/api/adopt` go with it, along with the desktop's `createAdoptRouteMount`. Adoption remains a live
strategy (`mapped` is still a schema status; ADR-0097 stays accepted and load-bearing) and its
engine — `runAdopt` in `@storytree/drive`, reached by `storytree adopt` — is untouched. What is
withdrawn is one dispatch surface over that engine, on the same reasoning as Build. Option (B) is
rejected because minting a new poll route to preserve an unreachable panel inverts the arc's
purpose; option (C) is rejected because `storytree adopt plan` already serves the read-only need
offline and (C) retains nearly all of (A)'s cost.

**4. `BuildSection.tsx` is deleted whole**, and with it the tree payload's go-green affordance
fields — `buildable`, `storyBuildable`, `goGreen`, `adoptGates`, `adoption` — whose only consumer it
is, along with `BuildRunHarness` in `apps/studio/src/main.tsx`.

**5. Delete `dispatchAcceptedBuild` and its relocation-test coverage**, and correct the story
documents that cite the deleted `packages/drive/src/spawn-builder.ts`.

**6. The build ENGINE is out of scope and does not change.** `nodeBuild`, `storyBuild`,
`routedBuildRunner`, `runAdopt`, the prove-it-gate, verdict signing, and every CLI verb stay exactly
as they are. `BuildRegistry` / `runBuildJob` survive only if a remaining consumer needs them; with
both routes gone they are expected to be orphaned, and that is a finding for the implementation
increment, not a licence to touch the drivers.

**7. The reversal is on the DISPATCH SURFACE only.** ADR-0090 Phase 1 (the in-panel Build control),
ADR-0094 (the status-aware go-green affordance), ADR-0097 Layer 1 (the Adopt button), ADR-0136
(app-driven story go-green lives in the forest-map Build affordance) and ADR-0144's UI-dispatch
clause are amended to that extent and no further. What a build DOES, what it signs, where verdicts
persist, and the brown→proposed→green proving process itself are all untouched.

**8. If the copy fix lands alone, it is still worth landing.** Should this arc stall, correcting the
two false hint strings at `BuildSection.tsx:283` and `:166` is an independently valuable change,
because the harm they do is active while the button exists.

## Consequences

**Good.** One dispatch path instead of two, and it is the one the harnesses already use. A
subscription-billed drive can no longer be started by a click that describes it as a cheap check.
The studio server, the desktop backend and the SPA each shed a route, a mount and a polling
component; the tree payload sheds five fields. The hosted studio is unaffected — it never wired
either seam and answered 404 for both.

**Bad, and knowingly accepted.** A human with the map open and no terminal to hand can no longer
start a build or an adoption; that is the owner's stated intent, not a regression. The map loses its
only view of a brownfield story's reliability gates and adoption plan — recoverable at any time via
`storytree adopt plan <story-id>`, and reachable by no story in today's corpus. Reinstating either
affordance later means re-minting a route pair; ADR-0090's Phase-1 shape is recorded here and in git
if that is ever wanted.

**The Adopt half is this ADR's call, not the owner's.** The owner directed the Build removal
verbatim and did not speak to Adopt. It is decided here rather than escalated because CLI parity is
proven by the verb's own documentation, the panel is unreachable in the current corpus, and the
alternative — minting a replacement poll route to keep it alive — would defeat the arc. It is
cheaply reversible: option (C) remains available if the owner wants the gate/plan display back on
the map, and nothing in the adoption ENGINE is touched either way.

**Hazards for the implementation increment.** Removing the five tree-payload fields crosses the
studio/desktop payload fold, which is guarded by parity tests that compare shapes structurally —
expect `apps/studio` and `apps/desktop` to need changing together, and gate them together. The
desktop's `tree-verdicts.ts:269` computes `storyBuildable` server-side and is part of this removal.
`apps/desktop/e2e/*.mjs` was checked for coupling to the `.build-btn` / `tree-build` selectors and
has none, so the E2E suite is not a blocker — but no gate rung reads those files, so any future
coupling would merge red.

## References

- ADR-0090 (UI-driven orchestration, Phase 1: the in-panel Build control) — amended, dispatch surface only.
- ADR-0094 (go-green is a status transition: proposed builds, mapped adopts) — amended, affordance only.
- ADR-0097 (brownfield go-green is a proving process) — amended, Layer-1 button only; the process and engine stand.
- ADR-0136 (app-driven story go-green lives in the forest-map Build affordance) — amended, reversed on the surface.
- ADR-0144 (chat-accepted node builds run the real proof and persist the verdict) — amended, UI-dispatch clause only; the real-proof behaviour stands and is the reason the hint copy is false.
- ADR-0175 (repurpose, don't delete, the in-app orchestrator chat infrastructure) — retired the spawn surface that called `dispatchAcceptedBuild`.
- ADR-0110 (owner direction at design time is ratification) — why this is born accepted.
- ADR-0139 (an accepted ADR carries no stale prose; partial reversal is an `amends` edge).
- Code: `apps/studio/src/components/BuildSection.tsx` · `apps/studio/src/api.ts:355` · `apps/studio/src/main.tsx:44` · `apps/studio/src/components/TreeView.tsx:6084` · `apps/studio/server/apiRouter.ts:2340` · `apps/studio/server/devApi.ts:98` · `apps/desktop/electron/backend-entry.ts:634` · `apps/desktop/src/backend/build-route.ts` · `apps/desktop/src/backend/adopt-route.ts` · `packages/drive/src/build-worker.ts:423` · `packages/cli/src/adopt.ts`.
