---
id: "wisp-as-story-claim"
tier: story
title: "The forest wisp IS the claim — graded (hover / orbit / queue), coloured by subagent, cleared on merge"
outcome: "The forest map shows one wisp per claimed story, its shape the claim GRADE (an exploring claim hovers, a work claim orbits, waiting claims queue, a released claim fades on departure), coloured by the active subagent and visibly distinct from a proven-green bloom, taken at workspace creation / declare and cleared on the CI merge — so parallel sessions never stomp each other and the map reads the ONE claim ledger, never a presence row."
# ADR-0200 re-aim (2026-07-16): the noticeboard is the claim ledger, presence retired. The wisp is the
# render of the GRADED claim (exploring hover / work orbit / waiting queue / departure fade), not a
# binary claimed/proven. The render LANDED and was owner-attested 2026-07-17 (claim-grade map wisps
# default-ON hover/queue/orbit + departure fades). ADR-0138 remains the mechanism this story realises;
# ADR-0200 generalises the claim to grades and settles the framing (ADR-0124/0128's "map honest by
# absence" is superseded — the map now populates exactly proportionally to real claim activity).
status: proposed
proof_mode: operator-attested
# The story's headline outcome is a LOOK on the forest map — one wisp per claimed story, colour by active
# subagent, claimed visibly distinct from proven-green, the wisp clearing on merge. The APPEARANCE half of
# that is a human-eyes leg (ADR-0070): the UAT node (capability F) is operator-attested, never
# self-attested. uat_witness stays absent ⇒ `human` (ADR-0040 fail-closed), so the machine-driven
# whole-story UAT node stays WITHHELD and the crown derives from the per-leg roll-up plus the operator's
# attestations. WITNESS RE-ADJUDICATION 2026-07-26 (ADR-0209 D8): "the appearance cannot be
# machine-witnessed" was too broad and is corrected — the LOOK cannot, but the counts, the placements, the
# claim-ledger contention logic, the structural honesty wall and the release sweep all can, and are now
# seven `machine` legs beside four `human` ones (see `## UAT Test Criteria`). Nothing about the human legs
# is weakened by that; the story-level witness is unchanged. NARROWED 2026-08-11 (ADR-0348 D6): those four
# human legs are DELETED as user EXPERIENCE rather than user ACCEPTANCE claims, leaving seven machine legs
# and ZERO human ones at the story tier. NARROWED AGAIN 2026-08-20 (ADR-0294 D2/D4): legs 3 and 7 are
# deleted as duplicates of proof one rung down, leaving FIVE machine legs (1, 2, 5, 9, 10) and still
# zero human ones.
# Nothing is lost — the capability `appearance-uat` already carries
# all four near-verbatim as legs a/b/c/d, so for this story D6 completes ADR-0294 D3. The owner's
# 2026-07-17 attestation record and open modeling call 1 are UNTOUCHED and stay open.
capabilities: [claim-store-work-time, render-claim-as-wisp, colour-by-subagent, ci-clear-on-merge, take-claim-at-spawn, claim-at-declare, appearance-uat]
# HOSTED-STORY edges (ADR-0192 landlord rule): this cross-cutting layer landed its organs INSIDE four
# other stories' territories — the claim store in packages/notice-board/src/store, the subagent-colour
# + merge-sweep wiring in packages/drive, the wisp/in-flight render glue in apps/studio, the
# spawn-seam claim in packages/agent — so the hosting is declared (consumer-side) and annotated
# (hosted seams: the story owns no package and adds no @storytree/* import of its own). No cycle:
# none of the four hosts depends on this story. Its one story-level consumer WAS chat-subagent-spawn
# (above them); that story and all five of its capabilities are `status: retired` under ADR-0175 and its
# code is deleted, so this story now has no live story-level consumer — which strengthens the no-cycle
# claim rather than weakening it. The packages/agent seam ADR-0175 deliberately KEPT (spawn-claim.ts,
# `resolveSpawnClaim`) is still hosted here, so the agent hosting edge stands.
depends_on: [notice-board, drive-machinery, studio, agent]
# ADR-0166 artifact edges: all four are hosted-seam edges (see above) — no code import backs them.
artifact_edges: [notice-board, drive-machinery, studio, agent]
# The within-story DAG (ADR-0010 §3): A is the root (the claim-store deltas everything stands on); B, C,
# D, E each consume A; F (the appearance UAT) depends on B, C, D, E. Mirrors the capability depends_on.
# claim-at-declare joined AFTER delivery (ADR-0142, landed work documented post-hoc): the declare-time
# acquisition wiring for §3's work-time claim — it consumes A like its siblings; F predates it, so no F
# edge is claimed.
edges:
  - from: render-claim-as-wisp
    to: claim-store-work-time
    rationale: "B reads the work-time `events.node_claim` rows A generalises into map activity."
  - from: colour-by-subagent
    to: claim-store-work-time
    rationale: "C colours the claim-wisp by the active subagent/intent A's work-time claim carries."
  - from: ci-clear-on-merge
    to: claim-store-work-time
    rationale: "D's merge sweep calls A1's `releaseClaimsByBranch` to clear the claim on merge."
  - from: take-claim-at-spawn
    to: claim-store-work-time
    rationale: "E's spawn-seam acquires a work-time claim via A3's work-time `ClaimRequest` intent helper."
  - from: claim-at-declare
    to: claim-store-work-time
    rationale: "The declare-time acquisition (ADR-0142) claims via A3's `workClaimRequest` and adds the session-scoped bulk twins of A1/A2 (`releaseClaimsBySession` / `bumpHeartbeatsBySession`) to the same PgClaimStore."
  - from: appearance-uat
    to: render-claim-as-wisp
    rationale: "F witnesses the rendered claim-wisp B produces (one wisp per claimed story)."
  - from: appearance-uat
    to: colour-by-subagent
    rationale: "F witnesses the colour shift by active subagent C produces."
  - from: appearance-uat
    to: ci-clear-on-merge
    rationale: "F witnesses the wisp clearing on merge D wires."
  - from: appearance-uat
    to: take-claim-at-spawn
    rationale: "F witnesses that a claimed story orbits exactly one wisp — the count/exclusivity E's acquire-or-wait seam decides. E's spawn-path CALLER retired with chat-subagent-spawn (ADR-0175); the live claim reaching the map is taken at workspace creation (ADR-0200 D3) and at declare-time (claim-at-declare)."
# Deciding ADRs (ADR-0037 §2): 0200 is the re-decision this story now realises (the noticeboard is the
# claim ledger; the claim gains grades exploring/waiting/work; presence retired; the map renders by grade
# by default — the `?claims=` flag retires). 0138 is the mechanism it generalises (the wisp IS the claim,
# amending 0121/0033, superseding 0048); 0200 supersedes 0079/0141 (presence-lifecycle machinery) and
# settles 0124/0128's "map honest by absence" (the map now populates proportionally to real claim
# activity). 0142 landed the live work-time acquisition (claim-at-declare; branch dies on merge). Builds
# on 0137 (the orchestrator that holds + spawns under the claim); keeps the §5 honesty wall (0045/0099 —
# a claim state is never a proof). 0212 amends 0048/0138/0200 and re-decided the render this story owns:
# wisp COUNT encodes SESSIONS, the separate build-wisp layer is DELETED with its red→green band folded
# onto the work body as a third (motion) channel, and ADR-0200 D7's "exploring is stationary by
# construction" is REVERSED — window shopping now carries its own small local orbit. Added by the
# 2026-07-26 witness re-adjudication, whose machine legs assert that render. 0175 is added not as a
# decider of this story's render but because it RETIRED the cross-story realisation of E2 (the whole
# chat-subagent-spawn story and its spawn code, 2026-07-31) while deliberately KEEPING this story's own
# packages/agent seam (spawn-claim.ts) — a reader cannot judge capability E's live scope without it.
decisions: [200, 212, 138, 142, 121, 33, 128, 137, 45, 99, 70, 175]
---

# The forest wisp IS the claim — graded, coloured by subagent, cleared on merge

**Outcome —** The forest map shows **one wisp per claimed story**, its shape the claim **GRADE** — an
`exploring` claim **hovers** beside the story tree on a small local orbit ("someone is reading / planning
here"), a `work` claim **orbits** the whole island (the exclusive holder), `waiting` claims **queue**
behind it stationary, and a released claim
**fades** on departure — coloured by what the orchestrator is currently doing (authoring / proving /
supplementing), **visibly distinct** from a proven-green bloom, **taken at workspace creation / declare**
and **cleared on the CI merge**. Parallel sessions never stomp each other and the map reads the **one
claim ledger**, never a presence row.

This story realises [ADR-0138](../../docs/decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md)
as generalised by
[ADR-0200](../../docs/decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md):
the `events.node_claim` lock (ADR-0121 / ADR-0009) is the single **coordination + observability** ledger,
and the claim now carries three **grades** (exploring / waiting / work). The wisp is the render of the
**graded claim**, not of the build; the build stays a *colour state* of the work-grade claim-wisp
(ADR-0048 generalised, not deleted). The [`notice-board`](../notice-board/story.md) story owns the ledger
machinery + the CLI/dock views; this story owns the **forest-map render**.

> **ADR-0200 re-aim (one ledger; render landed + owner-attested 2026-07-17).** Two things changed under
> this story's feet and are now reflected: (1) the self-reported **presence layer retired** — the map
> reads ONLY the claim ledger (`events.node_claim`), never `events.session`; "no presence-sourced
> wisps" is structural now. (2) The claim **gained grades** — the wisp render is no longer binary
> (claimed vs proven) but graded (hover / orbit / queue) plus a **departure fade** for a just-released
> claim (`foldDepartures`, `packages/notice-board/src/claim.ts`), fixing the
> `friction-released-build-wisp-reads-as-lost-claim` item. The grade renders landed default-ON and the
> owner attested the look on 2026-07-17 (hover / queue / orbit + departure fades; the `?claims=` flag
> retired, ADR-0200 D7). The §5 honesty wall is untouched — no claim grade or colour is ever a proof.
>
> **ADR-0212 (2026-07-18) then re-decided the render again**, and this story now reflects it: wisp COUNT
> encodes **SESSIONS**, the separate ADR-0048 **build-wisp layer is DELETED** with its only unshared
> signal — the red→green `phaseBand` — folded onto the **work** body as a third channel (**position =
> stage, colour = intent, motion = build phase**), and ADR-0200 D7's *"exploring is stationary by
> construction"* is **REVERSED**: window shopping now carries its own small local orbit beside the story
> tree, so position alone separates it from the whole-island work orbit. The §5 wall survives that merge
> intact — a green build BAND riding a claim body is still never a bloom.

## Framing

The forest map serves two jobs prior ADRs conflated: **observability** ("a proof is being mechanically
driven here") and **coordination** ("another session is working on this story; I should wait / pull main
after its merge / not stomp it"). ADR-0128 read the bare map as honest-by-absence for observability; the
coordination need is real and demonstrated — the recorded duplicate-build collisions are sessions
stomping each other for lack of a node-anchored "someone is here" signal. **ADR-0200 settled the tension**
ADR-0124/0128 left open (an unclaimed session was invisible): sessions are **forced onto the ledger at
workspace creation**, so the map now populates **exactly proportionally to real claim activity** — hover =
intent, orbit = work, queue = contention, colour = proof in flight, empty = genuinely nothing. Both jobs
unify onto the **graded claim**: forced at workspace creation (we own the outer + inner loop,
ADR-0137 / ADR-0030), cleared on the CI merge, staleness as one trace-driven backstop across all grades.

**The honesty wall (ADR-0138 §5, non-negotiable):** a claim's presence or colour is **never** a proof.
Only a real build's `CONFIRM_GREEN` + signed verdict paints the green **bloom**
([ADR-0045](../../docs/decisions/0045-live-activity-layer-is-verdict-blooms.md) /
[ADR-0099](../../docs/decisions/0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md)). A
claimed-but-not-proven story must look **visibly different** from a proven-green one, or the map silently
inflates proof. This wall is the load-bearing constraint on capabilities B, C, and the appearance UAT F.

**The DAG.** `A → {B, C, D, E} → F`. A (the claim-store work-time deltas) is the root every other piece
stands on. B (render the claim as a wisp), C (colour by subagent/intent), D (CI clear on merge), and E
(take the claim at spawn) each consume A and are independent of each other. F (the operator-attested
appearance UAT) is the human-eyes leg, last, depending on B, C, D, E.

**Post-delivery: the acquisition landed at declare-time (ADR-0142).** E's spawn-path wiring (E2) was
deferred behind ADR-0137 Phase 3, which left the delivered layer with **no live acquisition path** — a
well-behaved session showed no wisp between builds. [ADR-0142](../../docs/decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md)
(amends 0138/0033) closed that gap the cheap way: `noticeboard declare --node <story> --pg` now also
takes the work-time claim ([`claim-at-declare`](claim-at-declare.md), landed PR #535), `done`
bulk-releases, the statusline heartbeat keeps claims out of stale-reclaim, and CI refuses a PR from an
already-merged head branch (*a branch is one landed unit* — what keeps D's branch-keyed clear from ever
erasing live work).

**Claim-at-SPAWN (E2) landed cross-story and has since been RETIRED — the spawn never became the live hard
point.** Its GATE half graduated as chat-subagent-spawn's
[`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md) under a signed `--real` PASS, and the
runtime mount followed (that story's `spawn-tool-surface` / `spawn-deps-composition` caps, also signed
`--real` PASSes). Then
[ADR-0175](../../docs/decisions/0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)
retired the in-app orchestrator's spawn surface outright — neither the spawn nor the landing surface had a
reachable caller — and its execution status records *SPAWN — DONE (2026-07-31)*:
`packages/agent/src/{spawn-tool-surface,claim-gated-spawn}.ts`,
`packages/drive/src/{spawn-deps,spawn-builder,spawn-trace}.ts` and
`apps/desktop/src/backend/spawn-turns.ts` are **deleted**, the `spawn?` thread and the sidecar composition
are unpicked, and it is all held gone by `apps/desktop/src/backend/spawn-surface-retired.test.ts`. The
`chat-subagent-spawn` story and all five of its capabilities are `status: retired`; their spec files remain
browsable as history, so every cross-story link from here points at retired work whose code no longer
exists. **What this means for the delivered layer:** the live acquisition surface is workspace creation
(ADR-0200 D3's forced `exploring` claim) plus declare-time ([`claim-at-declare`](claim-at-declare.md)) —
no spawn path in the tree is claim-gated today. E's own contribution SURVIVES intact and is unaffected:
ADR-0175 deliberately KEEPS `packages/agent/src/spawn-claim.ts` (`resolveSpawnClaim`) because it "belongs
to the LIVE `wisp-as-story-claim` story this ADR does not retire".

## UAT Test Criteria

The integrated acceptance walkthrough proving the story's goal end-to-end on the **real forest map** — the
claim ledger rendered, contended, coloured, and cleared. Minimal-first
(`uat-proves-the-goal-not-the-surface`): one coherent walk over the graded claim lifecycle, not a tour of
the render. Witnesses marked per leg (ADR-0040 / ADR-0070 / ADR-0209 D1).

> **Per-leg witness — RE-ADJUDICATED 2026-07-26** under the ADR-0209 D8 corpus-wide migration. The
> governing rule is `human-witness-is-a-judgment-gap-not-cost`: the human rung is for a success condition
> that has **no compiler**, and a success that is machine-observable but merely LIVE, EXPENSIVE, or
> NOT-YET-HARNESSED is `machine`. Re-adjudicating leg by leg resolved this story to seven `machine` legs
> and four `human` legs (eleven, up from four — see the splits below). Only `machine` and `human` exist
> as classified kinds here; there is no third rung to reach for.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): all FOUR EXPERIENCE legs are DELETED, so the story carried
> seven `machine` legs and ZERO `human` legs from that date.** *(This read "so the story NOW carries
> seven `machine` legs"; the ADR-0294 D2/D4 pass below then deleted legs 3 and 7, leaving five.
> Corrected in place per ADR-0139 — the 2026-08-11 narrowing itself is unchanged.)*
> The deleted set — *"the three stages READ apart at a
> glance"* (old leg 4), *"the three colour states are distinguishable to the eye"* (old leg 6),
> *"claimed LOOKS clearly different from proven-green"* (old leg 8) and *"the departure reads as just
> left, not as lost"* (old leg 11) — asked whether this surface is any GOOD, not whether the journey
> achieved its goal. That is continuous owner feedback gathered through use, not a discrete pass/fail
> obligation the story must clear to be green. **No design intent is lost here and none needed
> relocating:** this story's capability [`appearance-uat`](appearance-uat.md) already carries all four
> near-verbatim as its legs a/b/c/d, each self-labelled with the story leg it restates, so for this
> story D6 COMPLETES ADR-0294 D3 rather than diverging from it. Ordinals are BURNED, not renumbered —
> positions 4, 6, 8 and 11 are simply absent, so every surviving leg keeps the number it has always had
> and no signed verdict or `(proof-gate:)` binding is silently re-pointed. **The owner's 2026-07-17
> attestation record and open modeling call 1 are untouched by this and stay OPEN** — see below; the
> complete copy of that record survives in the capability's own preamble.
>
> **All four old legs were tagged `human` because the story is ABOUT a look — but their stated success
> conditions were mostly COUNTS, PLACEMENTS and CLAIM-LEDGER LOGIC with a felt verdict welded on top. Each
> was SPLIT rather than laundered**: the countable half became a machine leg, and the "does it read right
> to the eye" half became its own human leg. The leg count grew; nothing felt was shaved into a footnote.
> The felt halves then left the story tier entirely on 2026-08-11 — struck through below, and each still
> carried by the capability's matching leg:
>
> | old leg | machine half | felt half (deleted 2026-08-11, ADR-0348 D6) |
> | --- | --- | --- |
> | 1 (one wisp per claimed story, shaped by grade) | **1** — the COUNT and the ANCHOR: one body per claim, on the STORY's territory, never a second island orbit; **2** — the GRADE→POSITION channel; ~~**3** — contention: the second work claim refused-and-named, or queued~~ (deleted 2026-08-20, ADR-0294 D2) | ~~**4** — whether the three stages READ apart at a glance~~ → `appearance-uat` leg **a** |
> | 2 (colour shifts by the active subagent) | **5** — the data→colour stamp: role/intent in, one of three mutually distinct non-green tokens out, and the token actually SHIFTING as the active subagent changes | ~~**6** — whether the three colours are DISTINGUISHABLE TO THE EYE~~ → `appearance-uat` leg **b** |
> | 3 (claimed is visibly distinct from proven-green) | ~~**7** — the STRUCTURAL wall: the claim/hover/queue/departing families emit no bloom kind, no `outcome`, no `bloom`/`verdict` class — even with a GREEN build band riding the work body~~ (deleted 2026-08-20, ADR-0294 D2) | ~~**8** — whether claimed LOOKS clearly different from a bloom to a human eye~~ → `appearance-uat` leg **c** |
> | 4 (the wisp clears on merge, with a legible departure) | **9** — the merge sweep: every grade released for the branch, audited, oldest live waiter promoted; **10** — the departure WINDOW: a departing body inside `DEPARTURE_WINDOW_MS` fading by age, gone past it, no zombie | ~~**11** — whether the departure reads as *just left* rather than *lost*~~ → `appearance-uat` leg **d** |
>
> **THE OWNER'S 2026-07-17 ATTESTATION — PRESERVED, RE-POINTED, AND NOT RE-GRANTED.** The graded
> claim-wisp renders landed default-ON and **the owner attested the look on 2026-07-17** — hover / queue /
> orbit **+ departure fades** (ADR-0200 D7 gated the presence-core retirement on exactly that
> attestation). That record is true history and is **not** deleted, weakened or re-scoped here — the
> COMPLETE copy now lives in [`appearance-uat`](appearance-uat.md)'s own preamble, which is where a
> reader should go for it. Where the four claims land after the 2026-08-11 deletion:
>
> - **`appearance-uat` leg a** carries the *hover / queue / orbit* look claim — the graded render reading
>   as three distinct stages. This is the claim that signature was given against. *(It was story leg 4
>   from 2026-07-26 until ADR-0348 D6 deleted the story-tier leg.)*
> - **`appearance-uat` leg d** carries the *departure fade* look claim — a released claim reading as
>   *just left*. *(Story leg 11 until the same deletion.)*
> - **The colour and claimed-versus-bloom claims were NEVER in that attestation.** The 2026-07-17
>   signature covered the grade GEOMETRY and the departure fade; it did not cover colour
>   distinguishability (`appearance-uat` leg b, story leg 6) or claimed-versus-bloom distinctness
>   (`appearance-uat` leg c, story leg 8). Those two are unattested and always were — recorded here
>   rather than quietly absorbed by a nearby signature.
>
> **Per ADR-0209 D6 all eleven legs returned UNSTAMPED, legs 4 and 11 included.** A substantive change to
> a criterion invalidates the old green, and a leg SPLIT is such a change. So that re-adjudication did
> not preserve the attestation as a live GREEN — it preserved it as a RECORD WITH A LEG TO ATTACH TO.
> **Whether an attestation granted against an old fused leg carries forward onto the narrower split leg,
> or must be re-signed, is an OPEN OWNER CALL (open modeling call 1) and is STILL OPEN.** Deleting the
> story-tier legs does not answer it, narrow it, or moot it: the same question now stands of
> `appearance-uat` legs a and d, which is where those claims live. ADR-0348 D7's supersession ruling
> reaches `agent` leg 1 ONLY and is deliberately not generalised here. No agent may resolve it in either
> direction: granting the carry-forward would be an agent self-exempting a unit toward green
> (`agent-never-self-exempts`), and silently discarding it would destroy real signed state. Until the
> owner rules, those claims are honestly unstamped with a live prior attestation on record. **This story
> is the first in the migration to hit this, and it will recur on every already-attested story the
> migration reaches.**
>
> **`machine` is a witness KIND, not a claim of coverage — but here much of it is genuinely already
> covered, and that is stated per leg.** Unusually for this migration, most machine halves have REAL
> existing specs: the claim ledger's offline and live-DB suites (`packages/notice-board`), the scene core's
> grade-geometry and honesty-wall walks (`packages/forest-world`), and the SVG mapper's DOM walls
> (`packages/app-surface`). Each machine leg cites what already discharges it and names the residual gap.
> Two are declared with NO harness at HEAD — leg 5's producer chain and leg 9's workflow wiring — and say
> so. Where a spec does not exist, the leg never pretends one does, and this re-adjudication creates none.
> Legs 1, 2, 5 and 9 carry seed-canonical `uat-criterion` detail artifacts (ADR-0209 D5, under the owner's
> narrower bar: a detail ONLY where the one-line title is too thin to judge against, never one per leg).
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — legs 3 and 7 are DELETED, and the five survivors are declared
> UNBOUND.** Old legs **3** and **7** restated proof that already exists one rung down and named it in
> their own success clauses. Leg 3's contention walk is proven by the capability
> [`claim-store-work-time`](claim-store-work-time.md), whose declared proof command
> (`pnpm --filter @storytree/notice-board test`) runs
> `packages/notice-board/src/store/claim-store.test.ts` — “claim (REFUSED — the red→green): a
> different session's live claim → acquired:false, holder named, 'conflict-refused' event, NO write
> to node_claim”, “upgrade (held by a LIVE other session): the session QUEUES → waiting upsert,
> 'queued' event, queued arm names the holder”, and the live-gated “live: two concurrent claims on
> one unit — exactly one wins; release lets the other in; stale reclaim”. Leg 7's honesty wall is
> proven in three places, one per surface the leg walks: the DATA level by this story's own capability
> [`render-claim-as-wisp`](render-claim-as-wisp.md), contract
> `claim-activity-is-visibly-distinct-from-proven-green` at
> `apps/studio/server/inFlightActivity.test.ts`; the SCENE CORE by
> [`forest-world`](../forest-world/render-core.md)'s `render-core` (greened by `forest-world#gate-1`
> over `pnpm --filter @storytree/forest-world test`) at `packages/forest-world/src/scene.test.ts` —
> “§5 honesty wall: a claim wisp is NEVER a bloom — no bloom/outcome token anywhere on the claim
> layer”, “§5 honesty wall holds for EVERY grade + the departure layer: no bloom kind, no verdict
> outcome” and “ADR-0212: folding a GREEN build band never turns the claim body into a proof (the §5
> wall holds)”; and the RENDERED DOM by
> [`app-surface`](../app-surface/app-surface-world-view.md)'s `app-surface-world-view` (greened by
> `app-surface#gate-1` over `pnpm --filter @storytree/app-surface test`) at
> `packages/app-surface/src/SceneView.test.tsx` — “§5 HONESTY WALL: a claim wisp is NEVER painted as
> the proven-green bloom (class-level)”, “§5 HONESTY WALL extended: hover / queue / departing wisps
> never carry bloom/verdict classes” and “ADR-0212 honesty wall: a GREEN build band never paints the
> claim body as a proof”. Both were checked against those tests' ACTUAL assertions, not their file
> existence (ADR-0294 D2's honesty wall). Ordinals **3** and **7** are BURNED, not renumbered, so no
> surviving leg moves and no binding is re-pointed. This story now carries **FIVE** `machine` legs
> (1, 2, 5, 9, 10) and no `human` leg.
>
> **A citation caveat worth reading before reusing these two.** Neither deletion could name a
> CONTRACT, only a capability. `claim-store-work-time`'s three declared contracts are
> `releaseClaimsByBranch`, the heartbeat-bump shape and the work-time `ClaimRequest` builder — none of
> them the contention arms — and the graded `take` / `upgrade` / `downgrade` machinery is, by that
> capability's own text, the [`notice-board`](../notice-board/story.md) story's living shape, consumed
> here through the ADR-0192 hosted seam. `render-core` and `app-surface-world-view` likewise green a
> whole package suite through an observe gate without declaring a contract per claim-family walk. So
> both rationales cite the ASSERTIONS rather than a contract id — the same discipline PR #1444 arrived
> at when `repo-selection`'s declared ids turned out to appear in no test file. The proof runs on
> every `pnpm -r test` either way; what is missing is a contract NAMING it, which is a
> capability-shape gap and not a reason to keep a story-tier duplicate standing.
>
> **The five survivors stay unbound, and that is the honest state rather than an omission.** Legs 1,
> 2, 5, 9 and 10 are genuine journey steps, and each is at most a PARTIAL duplicate — the
> un-duplicated half is what keeps it. Legs 1 and 10 both rest on the studio-side fold in
> `TreeView.tsx`, whose only spec (`apps/studio/src/components/sceneAdapter.test.ts`) walks parcels,
> trails and UAT markers and asserts nothing about claims or departures at all; leg 2's own text says
> “SUBSTANTIALLY discharged”; leg 5 says outright that the colour SHIFT is not green and has no live
> producer; leg 9 says the released FUNCTION is proven live and that what the leg ADDS is the CI job
> actually calling it. None declares a `(proof-gate:)`, so `resolveWitness` refuses each one
> (`coverage: "refused"`) and no adopt pass can sign them. **No gate is minted for any of them.**
> Answering an unbound leg with a freshly minted check is the rubber stamp ADR-0097 §2 forbids, and it
> is the exact reflex ADR-0294's end state point 4 names. What binds them is a real instrument: a spec
> that passes claims and departures through `worldToScene`, a producer that drives all three colour
> states, a live-gated assertion on the workflow's release step — or ADR-0295 D1's model-driven
> executor.

1. **One wisp per claimed story, anchored on the STORY's territory.** _(witness: machine)(detail: wisp-as-story-claim#uat-1)_ Fold a set of _(criterion-id: uatc_d267439415d002238392d7b8)_ _(revision-id: uatr1:4481807efbe1efb6)_ _(previous-revision-id: uatr1:7fae5863e09358c8)_
   live claims — one per session, some landing on capability units, some on story units, some on unknown
   ids — through the real surface path (`worldToScene` → `buildScene`,
   `apps/studio/src/components/TreeView.tsx` / `packages/forest-world/src/scene.ts`) and walk the resulting
   scene tree. **Success —** each live claim yields exactly ONE body; a claim landing on a CAPABILITY unit
   is re-anchored to its owning story's territory rather than drawn on the capability; a claim on an
   unknown unit is dropped; a claim past `CLAIM_STALE_RECLAIM_MS` yields no body at all; and at most ONE
   whole-island orbit exists per story however many grades are present — hover and queue bodies may coexist
   with it, a second island orbit may not (the work claim is an exclusive mutex, ADR-0200 D2, and wisp
   COUNT encodes SESSIONS, ADR-0212).
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`. The one-body-per-claim
   and stale-drop clauses ARE proven at the data level by
   [`render-claim-as-wisp`](render-claim-as-wisp.md)'s `claim-rows-fold-to-one-wisp-per-claimed-story`,
   but the re-anchoring, unknown-unit and one-island-orbit clauses run through `worldToScene` in
   `TreeView.tsx`, which no spec exercises for claims — so the leg is a PARTIAL duplicate,
   `resolveWitness` refuses it (`coverage: "refused"`) and nothing can sign it. No gate is minted to
   host it (ADR-0097 §2).
2. **The claim GRADE is the position channel.** _(witness: machine)(detail: wisp-as-story-claim#uat-2)_ Build the scene with one claim of each _(criterion-id: uatc_989445a3b7008767a9e59506)_ _(revision-id: uatr1:ee29a5f91fa15e7a)_ _(previous-revision-id: uatr1:f61efef77732c3f2)_
   grade on one territory, plus one grade-absent claim, and assert each body's placement. **Success —** an
   `exploring` claim sits on a SMALL LOCAL orbit beside the story tree (`HOVER_ORBIT_R`), its rest spot on
   a parent `g` so the rotation cannot sweep the centroid; a `waiting` claim is STATIONARY and index-placed
   along the queue line in INPUT order, never hash-random; a `work` claim orbits the WHOLE island on the
   deliberately wider radius; and an ABSENT grade renders as `work` (the pre-grade back-compat lock,
   ADR-0200 D2). Substantially discharged already by `packages/forest-world/src/scene.test.ts` (the
   window-shop, queue-order, work and grade-absent walks) and `packages/app-surface/src/SceneView.test.tsx`
   (the rendered classes and orbit durations).
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, and the operative word
   above is SUBSTANTIALLY: those suites green `render-core` and `app-surface-world-view` through their
   own observe gates, not this leg, and a partial duplicate is not a duplicate (ADR-0294 D2) — which is
   why this pass kept it where it deleted legs 3 and 7. So `resolveWitness` refuses it
   (`coverage: "refused"`), and no gate is minted to host it (ADR-0097 §2).
5. **The active subagent's colour state is STAMPED, and it SHIFTS.** _(witness: machine)(detail: wisp-as-story-claim#uat-5)_ Drive one claimed _(criterion-id: uatc_7b39f68835e41d1f472d4fc1)_ _(revision-id: uatr1:6adfb6a92117f207)_ _(previous-revision-id: uatr1:17eb530972d07a8e)_
   story through authoring → proving → supplementing and read the colour state off the data the surface
   consumes. **Success —** the pure mapping returns exactly one of three mutually distinct, never-green
   tokens for each subagent role and each claim intent (`subagentColourState`,
   `packages/drive/src/subagent-colour.ts`; mirrored browser-side as `claimColourState`,
   `apps/studio/src/lib/claimColour.ts`, because `apps/studio/src` may not import `@storytree/drive`); the
   writer STAMPS that token onto the `building` doc it appends
   (`writer-stamps-the-subagent-colour-state`, `packages/drive/src/phase-activity.ts`); AND the token a
   real run actually produces CHANGES across the three phases of work. The two mapping halves are green
   today; **the SHIFT is not, and no live producer drives all three states** — see the detail's producer
   gap.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: with no producer at HEAD
   there is no artifact for an `observe` gate to read, so `resolveWitness` refuses it
   (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2) — binding this to the two
   mapping suites that ARE green would sign exactly the half the leg does not turn on.
9. **The CI merge releases the branch's claims — every grade, audited, waiter promoted.** _(criterion-id: uatc_89597d2010852d4ef712a33a)_ _(revision-id: uatr1:e3abf61d6f7ccf53)_ _(previous-revision-id: uatr1:53d8c3cefe6eb5b2)_
   _(witness: machine)(detail: wisp-as-story-claim#uat-9)_ Merge a real PR whose branch holds claims, then read the ledger. **Success —**
   every `events.node_claim` row for the merged branch is gone whatever its grade, one `released`
   `claim_event` row exists per cleared claim, the oldest LIVE waiter on each cleared unit is promoted in
   the same transaction, releasing a branch with no claims is a no-op returning `0`, and a release failure
   never fails the merge. The released FUNCTION is proven live by
   `packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts`; what this leg adds is that
   the CI merge job ACTUALLY CALLS it — the `.github/workflows/ci.yml` wiring
   ([`ci-clear-on-merge`](ci-clear-on-merge.md)). *(Machine, not human: released rows and audit events are
   byte-level observables, and "CI-observed — the released count + the `released` `claim_event` rows are
   the machine evidence the clear fired" is what that capability already calls its own evidence. The
   workflow being un-harnessed by the prove-it-gate is a COST, not a judgment gap — open modeling call
   4.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: nothing observes the CI
   job CALLING the release, and that call persists no artifact an `observe` gate could read, so
   `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2) —
   re-running capability A's own live spec would be a FALSE pass here, which
   [`ci-clear-on-merge`](ci-clear-on-merge.md) already says in its own words.
10. **The departure window: fades by age, then gone — no zombie.** _(witness: machine)_ Release a claim and _(criterion-id: uatc_38393cb281430ed91e51f2c9)_ _(revision-id: uatr1:20ea9828fce68efe)_ _(previous-revision-id: uatr1:7cebb1a11ddf673d)_
    observe the departing body across the window. **Success —** the released claim surfaces as a
    `departing-wisp` family body inside `DEPARTURE_WINDOW_MS` (120 s,
    `packages/notice-board/src/claim.ts`) carrying an `ageRatio` that drives both the fade and the upward
    drift, its grade read off the released doc (a malformed doc degrading to `work` rather than throwing);
    the body is DROPPED past the window; `ageMs` clamps to 0 under clock skew; and no stale-zombie body
    survives either the window or the stale-reclaim threshold. Discharged already by `foldDepartures`'
    suite in `packages/notice-board/src/claim.test.ts`, `claim-departures.live.test.ts` (the live
    in-window / aged-out pair), `packages/forest-world/src/scene.test.ts` (the departing family and its
    `ageRatio`) and `packages/app-surface/src/SceneView.test.tsx` (the rendered opacity derived from
    `ageRatio`). **Residual gap —** the studio-side fold that feeds all of it (`departureAgeRatio` and the
    per-territory `departures` mapping in `TreeView.tsx`) has NO test: no spec passes `departuresByStory`
    through `worldToScene`, so the window is proven on both sides of a seam that is itself unproven.
    **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: that residual gap is
    exactly the seam an honest binding would have to cross, so `resolveWitness` refuses it
    (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2).

## Open modeling calls (for the owner)

Surfaced rather than guessed — none blocks the delivered layer, and none is settled here.

1. **Does an owner attestation carry forward onto a SPLIT leg, or must it be re-signed?** ★ The call this
   re-adjudication exists to surface. The owner attested this story's look on **2026-07-17** (hover / queue
   / orbit + departure fades). Re-adjudicating mechanically unstamps every leg under ADR-0209 D6 — so the
   attestation's claims sat on human legs **4** and **11**, both honestly UNSTAMPED, even though the
   thing the owner looked at has not changed by one pixel. **Those two story legs were then DELETED by
   ADR-0348 D6 (2026-08-11) and the claims now sit on [`appearance-uat`](appearance-uat.md)'s legs a and
   d — which MOVES the question one rung down and settles nothing about it. This call remains OPEN and
   owner-owned;** ADR-0348 D7's supersession ruling reaches `agent` leg 1 only and is deliberately not
   generalised here. Two honest readings, and the corpus settles
   neither: (a) the split legs are strictly NARROWER than the leg that was signed, so the signature still
   covers them and should carry forward; or (b) ADR-0209 D6's invalidation is deliberate and absolute, so
   any re-adjudicated leg must be re-signed regardless of whether the surface moved. **An agent must not
   choose.** Choosing (a) would be an agent restoring green state it was not granted
   (`agent-never-self-exempts`); choosing (b) silently, without recording it, would destroy a real
   attestation. This is the FIRST story in the ADR-0209 D8 migration whose legs carried a live owner
   attestation, and it will recur on every attested story the migration reaches — so the call is worth
   making once, generally, rather than per story. Candidate shapes, none chosen: a carry-forward rule
   keyed on "the new leg's success condition is a strict subset of the signed one"; a blanket re-sign; or
   an explicit `attested-history` field that records the prior signature without claiming green.
2. **ADR-0212's THIRD channel has no leg of its own.** ADR-0212 deleted the separate build-wisp layer and
   folded its red→green `phaseBand` onto the work body as **motion** (speed / pulse = build phase, red
   steady / green pulsing) — a new visual channel on the very drawable this story owns. No UAT leg was
   added when that landed. This re-adjudication does NOT invent one (that would be authoring new scope
   under a re-classification pass); it folded only the honesty-wall consequence — a green BAND is still
   never a bloom — into machine leg 7, which the ADR-0294 D2 pass then deleted on 2026-08-20, so that
   consequence now sits where it is proven: `scene.test.ts`'s “ADR-0212: folding a GREEN build band
   never turns the claim body into a proof” and `SceneView.test.tsx`'s “ADR-0212 honesty wall: a
   GREEN build band never paints the claim body as a proof”. *(This read “it folds only … into
   machine leg 7”, present tense, and cited an ordinal that no longer exists; corrected in place per
   ADR-0139.)* Whether the motion channel earns its own leg (a machine half: the
   band maps from the resolved build phase, RED WINS; a human half: does pulsing read as *nearly done*?)
   is an owner/story-shape call.
3. **Is `authoring` (amber) reachable from real data at all?** Machine leg 5 asserts the colour SHIFTS
   across three states, and the mapping proves three tokens exist — but at HEAD no producer in
   `packages/**` drives all three: `subagentRole` is set nowhere outside its own tests, and
   `story-build.ts`'s `story:<mode>` intent matches no case and collapses to `supplementing`. In practice
   the observable colour set is two of three. That is either an unbuilt producer (leg 5 is a real build
   obligation) or a render whose third state is decorative (leg 5 should narrow to two). Recorded, not
   guessed — the detail artifact names the exact call sites.
4. **How does a CI-OBSERVED workflow effect reach the proof spine?** Machine leg 9's observable is a real
   merge's effect on the live ledger, and `ci-clear-on-merge` is `proof_mode: operator-attested` precisely
   because *"a workflow edit cannot be driven red→green by the prove-it-gate"*. Those two are consistent —
   the WITNESS KIND is machine (rows and audit events), while the capability's PROOF MODE describes how
   the gate can reach it — but the carry is unresolved, the same shape as `website-experience`'s open call
   6. Candidate shapes, none chosen: a live-gated spec that invokes the workflow's release step directly
   against `storytree_test`; a post-merge CI assertion published back as a verdict; or leaving the leg
   discharged by CI evidence the spine does not sign. Owner/build-time call.
5. **The honesty wall is proven ONE-DIRECTIONALLY, and never with both layers present.** The
   capability-tier coverage named in the ADR-0294 D2/D4 pass above — `render-claim-as-wisp`'s
   `claim-activity-is-visibly-distinct-from-proven-green`, `render-core`'s §5 walks in
   `scene.test.ts`, and `app-surface-world-view`'s class-level walls in `SceneView.test.tsx` —
   asserts that the claim families never reach for bloom vocabulary. Nothing asserts the
   converse (the bloom renderer never reaches for claim styling), and no test renders one story carrying a
   claim wisp AND an in-window bloom simultaneously — which is the case a human eye actually has to
   separate, and the case [`appearance-uat`](appearance-uat.md)'s leg c is asked to judge (story leg 8
   until ADR-0348 D6 deleted it). Both fields exist on `SceneTerritoryInput`, so the co-presence case is
   buildable. Whether that capability-tier coverage should WIDEN to the co-presence case, or whether
   it stays `appearance-uat` leg c's human burden, is a build-time call. *(This call read “Machine leg
   7's existing coverage … Whether leg 7 should widen”. Story leg 7 was deleted by the ADR-0294 D2
   pass on 2026-08-20 as a duplicate of the very capability coverage it was describing; the GAP is
   unchanged and the call stays OPEN — only its address moved. Corrected in place per ADR-0139.)*
6. **Capability E is half-orphaned by ADR-0175: does it narrow to its one live contract, and does its
   spent `real:` arm come off?** Two facts now sit under [`take-claim-at-spawn`](take-claim-at-spawn.md),
   both verified at file level. **(a)** Its E1 seam LANDED — `packages/agent/src/spawn-claim.ts`
   (`resolveSpawnClaim`) and its spec are at HEAD, authored by the gated leaf under a signed `--real`
   PASS — so the capability still carries a `real:` arm declaring a NET-NEW source file that already
   exists. The original red is spent, and a `--real` drive on this node would manufacture a red over green
   code: exactly what [`claim-at-declare`](claim-at-declare.md) refuses to do by carrying no `proof:`
   block at all. **(b)** Its second contract, `orchestrator-acquires-before-spawn`, was realised
   cross-story and then RETIRED with the whole `chat-subagent-spawn` story under ADR-0175 — so it now
   describes behaviour that exists nowhere and has no home capability. The honest shapes, none chosen
   here: leave the capability as authored and let the fold speak; narrow it to contract 1 and strike
   contract 2 as withdrawn; or drop the `real:` arm the way `claim-at-declare` did, converting E into
   documentation of landed work. **The third is not a stories-only edit** — `packages/cli/src/node-build.test.ts`
   pins `take-claim-at-spawn` in its REAL-buildable snapshot, so removing the arm reds that snapshot until
   the pin moves with it. Recorded rather than guessed, for the same reason as call 1: narrowing a
   capability's scope is a story-shape decision, and flipping E toward green on the strength of an
   already-landed file would be an agent self-exempting a unit (`agent-never-self-exempts`). E's status
   therefore stays `proposed`, and `retired` is affirmatively wrong for it — ADR-0175 KEEPS
   `spawn-claim.ts` precisely because it belongs to this live story.
