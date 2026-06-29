---
status: accepted
decided: 2026-06-29
---
# ADR-0136: App-driven story go-green lives in the forest-map Build affordance, not the chat smoke loop

## Status

accepted — owner-ratified 2026-06-29 in design discussion. App-driven **whole-story go-green stays the
forest-map Adopt/Build button** (option c, the recommendation below). The chat's positive role — bring
stories in via the story-author, drive changes by spawning the inner loop — is settled in **ADR-0137**;
the "chat smoke loop" framing in this title/body is the *pre-ADR-0137* understanding, kept as history.
The open fork in §Decision is resolved (see the inline note). Surfaced by the 2026-06-28 desktop-drive
live walk (ADR-0108 Phase 3/4 + ADR-0133 d.3).

## Context

On 2026-06-28 the desktop app drove a real Claude Agent SDK leaf through the prove-it-gate to a signed
PASS from the chat's accept-to-land **Build** button (~$0.10, subscription-billed). The drive loop is
proven end-to-end. But the walk surfaced a gap in the *headline*: "the app drives a **story** green →
PR → CI merge" is **not reachable through the natural chat flow.**

Why, mechanically:

- The chat proposed a **capability** (`proposal-id-threading`), a node-tier unit. The build dispatch
  routes by tier — `routedBuildRunner` (`packages/drive/src/build-worker.ts`) sends a **story** id to
  `story build --real` (persists verdicts to `events.work_event`/`verdict` **and** opens an
  auto-merging PR), and a **node**/capability id to `node build --live` (an in-memory **smoke**: the
  synthetic `add(2,3)` task, the node's real proof not run, nothing persisted, **no PR**). So the walk
  took the node→smoke path: it proved the live drive loop, but opened no PR and landed nothing.
- **The routing is already tier-correct.** A story id would correctly drive `--real`→PR today. The gap
  is *not* the router — it is *which tier the chat proposes.*
- **The chat proposes nodes by design.** The chat surface IS the rendered `session-orchestrator`
  (ADR-0108 Phase 1/2). Its job — *slow-growth-minimum-to-green* — is to decompose intent into the
  **smallest provable unit** (a capability/contract, node tier), not a whole story. Proposing a node is
  the orchestrator doing its job correctly, not a bug.
- **The node path is deliberately a non-persisting smoke (ADR-0099-B).** A single-node `--live` build
  runs a synthetic task — it proves the *pipeline*, not the node's feature — so its PASS may **never**
  land in `events.verdict` (the forged-green back-door ADR-0099 closes). The `routedBuildRunner` node
  branch therefore omits `--store pg` on purpose.

The crucial finding: **the deliberate story→`--real`→PR op already exists in the UI** — it is the
ADR-0094 *status-aware* forest-map **story Build affordance** (`BuildSection`, `scope='story'`,
`goGreen === 'build'` on a `proposed` story → `story build --real` → auto-merging PR; the
"Builds the whole story for real … then opens a pull request that merges automatically" hint). This is
the "legitimate go-green" the build-worker comments already point to — never the node smoke.

**But it is not wired into the desktop.** The desktop's tree fold
(`apps/desktop/src/backend/tree-verdicts.ts` → `foldVerdicts`) deliberately **skips the go-green
affordance pass** (`applyStoryGoGreenProof`) and never computes `storyGoGreen` — it owns only the
verdict-*hue* overlay (ADR-0119 deferred overlay), not the Build/Adopt *buttons*. So in the desktop
`/api/tree` every story's `goGreen` is `undefined` → `BuildSection` renders `NoGoGreen` → **no story
Build button in the desktop forest map.** The affordance is present in the shared studio frontend the
desktop renders, but starved of its data.

So "drive a story green + PR from the app" has two distinct truths today: it is *architecturally
correct and already-decided* (ADR-0094), but *not currently reachable in the desktop shell* — and it is
*not* the chat loop's job.

## Decision

**Recommended (option c — keep the surfaces separate):**

1. **App-driven story go-green is a deliberate, separately-triggered op that lives on the story node in
   the forest map** — the ADR-0094 Build affordance → `story build --real` → auto-merging PR. It is
   **not** a side-effect of the chat propose→accept loop.
2. **The chat propose→accept loop's role is orient + propose the minimal provable unit + (on accept)
   smoke the drive pipeline** (ADR-0099-B). It proves the loop is alive and routes the *minimal* unit;
   it does not land a whole story. The 2026-06-28 walk did exactly what this loop is for.
3. **Immediate clean increment, no further decision needed:** wire the `goGreen` affordance into the
   desktop `/api/tree` using the **already-imported** `@storytree/orchestrator` `storyGoGreen` (the
   build/adopt/none decision, `packages/orchestrator/src/story-build.ts`) plus the `applyStoryGoGreenProof`
   post-pass — closing the desktop-parity gap with the **same** re-composition discipline ADR-0119
   already established for the hue overlay. This alone makes "drive a story to green + PR from the app"
   reachable in the desktop via the forest map. It is CI-provable (the studio already has the algorithm
   and its tests; the desktop tree fold is offline-testable against a seed).

**Rejected — (a) have the chat propose story-tier units.** This fights the orchestrator's
slow-growth-minimum-to-green role; a `story build --real` authors *every* capability in the story
atomically — the opposite of the decompose-and-route discipline the orchestrator exists to apply. It is
also blocked on the known orientation-runner stub (the chat cannot yet read the live tree to know which
ids are stories). Misaligned at the role level, not just the wiring level.

**Rejected — (b) a tier toggle on a node accept (escalate a node accept to a story `--real`).** A node
is not story-buildable; escalating means resolving the node to its **parent story** and building the
*whole* story. So accepting one capability would silently build all of them — muddying the
accept-provenance ADR-0108 d.3 deliberately keeps legible ("I accepted `proposal-id-threading`, but it
built the whole thick-client story"), and blurring the ADR-0099-B node-smoke / story-real honesty
boundary.

**RESOLVED 2026-06-29 (owner):** neither pole of the binary below — the chat does **not** reach
story-real-PR directly at all. Per **ADR-0137**, the chat is the session-orchestrator: it brings a story
IN (`mapped`/`proposed`) by spawning the story-author, and drives CHANGES/fixes by spawning the
inner-loop leaf; the forest-map **Adopt/Build** button stays the human's deliberate whole-story
go-green. So go-green is the forest map's (this ADR), and the chat's reach is *authoring + spawning the
inner loop* (ADR-0137), not a story-real escalation. The original fork, kept as posed:

**Open fork for the owner (the one genuine decision this ADR poses):** should the **chat conversation**
*also* be able to reach the story-real-PR path — e.g. a deliberate *secondary* "Build the parent story"
affordance that routes the proposed node's owning story through the **same** ADR-0094 Build path — or
is the forest-map story node the **sole** home for it? This is a UX/product call about where a billed,
outward-facing (opens a real auto-merging PR) op should live. Default recommendation: the forest map is
the home (ship the §3 wiring); add a chat-side escalation only if the owner wants the whole journey to
live in one conversation. If the owner wants the chat escalation, it is a clean follow-on routing
through the already-decided story Build path — not a re-decision of (a) or (b).

## Consequences

- **Good:** respects the orchestrator's role (propose minimal units), ADR-0099-B's honesty wall (node
  smoke never persists), ADR-0094's decided go-green, and human-owns-the-outer-loop (landing a whole
  story is a deliberate act). The fix is a small, CI-provable parity increment — **no new mechanism.**
- **Good:** dissolves the "headline unreachable via chat" confusion — it was a *misframing* (two
  surfaces, two purposes), not a missing capability. The router was never the problem.
- **Cost / residual:** until the §3 `goGreen` wiring lands, the desktop forest map shows no story Build
  button (the affordance is data-starved), so the *only* build trigger in the desktop today is the chat
  smoke path. The wiring is the thing that actually makes the headline reachable in the desktop.
- **Deferred by the fork:** if the owner wants the chat to reach story-real (a/b/blend), that is a
  separate follow-on increment with its own provable unit.

## References

- **ADR-0094** — status-aware story go-green affordance (Build / Adopt / None); the forest-map story
  Build button this ADR routes the deliberate op to.
- **ADR-0099 / ADR-0099-B** — a single-node `--live` smoke is synthetic and must never persist a green.
- **ADR-0108** — chat propose→accept (Phase 1/2/3); d.3 keeps the human's accept-provenance legible.
- **ADR-0119** — the desktop re-composes the studio tree fold (the discipline §3's wiring extends from
  the hue overlay to the go-green affordance).
- **ADR-0133 d.3** — the desktop build mount + the relocated `routedBuildRunner`.
- Code — `packages/drive/src/build-worker.ts` (`routedBuildRunner`, tier routing);
  `apps/desktop/electron/backend-entry.ts` (`BuildContext` wiring, `classify`/`nodeBuild`/`storyBuild`);
  `apps/desktop/src/backend/tree-verdicts.ts` (`foldVerdicts` — **skips** the go-green pass, the wiring
  gap); `apps/studio/src/components/BuildSection.tsx` (the story Build vs node smoke affordance);
  `apps/studio/server/apiRouter.ts` (`storyGoGreen` + `applyStoryGoGreenProof`, the pass to port);
  `packages/orchestrator/src/story-build.ts` (`storyGoGreen`, already in the shared barrel).
