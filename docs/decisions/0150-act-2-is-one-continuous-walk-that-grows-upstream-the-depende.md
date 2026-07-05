---
status: accepted
decided: 2026-07-04
amends: [134, 145, 148]
---
# ADR-0150: Act 2 is one continuous walk that grows upstream — the dependency layer is the advantage

## Status

accepted (2026-07-04) — decided/directed by the owner at the `act2-guided-walkthrough` (increment G)
attestation gate on 2026-07-04. Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second end-of-flow ask.

**Overtakes the unlanded ADR-0147** (born accepted on branch `claude/laughing-galileo-fe1a0b`, never
merged to main — so this is NOT a formal `supersedes` frontmatter edge: there is no on-main decision to
supersede, and its reserved number is simply a hole in the record). That branch decision grew Act 2
HORIZONTALLY (neighbor/sibling stories as more islands) and PRESERVED beat 4's wrong-way road verbatim.
The owner's direction here reverses BOTH: the forest grows VERTICALLY (a backend and a database
UPSTREAM of the website, on real `dependsOn` edges), and beat 4's wrong-way flag is RETIRED in favour of
the dependency-layer-as-advantage teach. ADR-0147's `--real` director grow lives only on that unmerged
branch; its DECISION is overtaken, but its salvageable MECHANICS (a multi-story `WorldState`, a
tri-state story status, an honest pull-back legend) are reused by this decision — reshaped from
horizontal to vertical (see Consequences).

**Amends** [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) (re-decides
§3's beat-4 "stories connect via roads … the wrong-way road" as a NEGATIVE antipattern teach — it
becomes the POSITIVE dependency-layer-as-advantage teach), [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)
(the 2.5D substrate STANDS unchanged — only what grows on it changes), and
[ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md) (re-decides its
"increment H opens from G's 'what's next' CTA" framing — H is no longer a separate CTA-gated phase but
the SAME continuous walk continuing upstream). This is a NEW ADR, not an in-place edit of 134/145/148
(copy-on-write, ADR-0086/0139): their bodies stay as history, with a dated forward pointer added at
each amended point.

*(Amended by [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md),
2026-07-04: this ADR's core decision — Act 2 is one continuous walk that grows UPSTREAM; the dependency
layer is the advantage — STANDS. ADR-0153 (a) CORRECTS an ERROR in how the `dependsOn` edge direction
was expressed in this body (the direction is `website.dependsOn=[backend]` /
`backend.dependsOn=[database]`, dependent → prerequisite — the backwards "backend `dependsOn` website"
phrasing is corrected in place below), and (b) refines the Act 2 experience toward the real product
(real app UI + progressive disclosure, no escape hatches, an outcome-brief-with-chat step 1,
drive-machinery overlays, and a frontend-high / foundation-below spatial reframe). No `supersedes` —
0153 refines. Noted in place per ADR-0139.)*

## Context

[ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md) split Act 2 into two
increments the owner sequenced ship-now/extend-next: **G** — the website-first walk (the reused
"build me a shopping website" prompt, the orchestrator's mock-website proposal, the visitor-paced
five-beat 2.5D walk growing that one website story green) — and **H** — the guided forest (the
orchestrator guiding the visitor to more stories). Increment G was BUILT, owner-attested, and shipped
LIVE (storytree-web PR #22 → web main `ff70222b`, 2026-07-04). At that same attestation gate the owner
walked G, judged it good enough to land, and directed the shape of H with two points (verbatim):

> "land this, then chip off a fresh session, in the fresh session get rid of this bit [beat 4's 'wrong
> way — skips the payment service' flag], then integrate the grow the backend into the one tutorial,
> it shouldnt be separate."

The two points resolve into one coherent narrative move — and reverse the horizontal, wrong-way-
preserving shape the unlanded ADR-0147 had given the expansion:

1. **Integrate, don't separate ("it shouldnt be separate").** ADR-0148 framed H as opening "from G's
   'what's next' CTA" — a hand-off into a next phase behind a destination button. The owner wants H to
   read as the SAME walk continuing: the visitor who just grew the mock website green keeps walking,
   and the upstream forest reveals as the next beats of one arc, not a new page or a gated second
   experience.

2. **Retire beat 4's wrong-way flag; teach the dependency layer as an ADVANTAGE, on the actual map
   ("get rid of this bit … show the advantage of the dependency layer using the actual map").** Beat 4
   today draws a wrong-way UI→DB road skipping the service layer, flagged as an antipattern — a
   NEGATIVE teach (here is a mistake storytree catches). The owner wants the POSITIVE inverse: the
   dependency LAYERS storytree makes visible on the 2.5D map — the website depends on a backend which
   depends on a database — ARE the advantage. You SEE the layers, you build them in the right order,
   nothing is hidden. The teach moves from "look, an antipattern flagged" to "look, the honest
   dependency structure, shown to you."

**The two points unify.** H's upstream forest IS the dependency-layer-as-advantage. The website
depends on a backend which depends on a database — those upstream dependency layers, shown on the map,
are exactly what storytree gives you that a chaotic swarm does not. So retiring the negative beat-4
flag and integrating the upstream forest into one walk are the SAME move: the upstream stories carry
the dependency-layer teach that beat 4 used to gesture at negatively, and they do it by BEING the
dependency layers, revealed in the one continuous walk. This is also the honest reading of the
coverage map ([`docs/research/vibe-coding-coverage-map-2026.md`](../research/vibe-coding-coverage-map-2026.md)
§C): the upstream dependency roads teach *hidden coupling / blast-radius* — still coupling, NOT
duplication (clone-detection stays out of scope, owner 2026-07-03) — now framed as the advantage of
SEEING the layers rather than the danger of a flagged edge.

**Why ADR-0147's horizontal shape is the wrong one to keep.** ADR-0147 grew the forest sideways
(sibling stories as neighbor islands) to make the pull-back legend honest, and it deliberately kept
beat 4's wrong-way road. Both choices are now overtaken: the owner's H grows the forest UPWARD (real
`dependsOn` edges to a backend and a database above the website), and it RETIRES the wrong-way flag.
The horizontal expansion answered "show more of the forest"; the owner's direction answers a sharper
question — "show the dependency LAYERS as the product's advantage" — which is inherently vertical and
inherently positive. ADR-0147's mechanics (multiple stories, tri-state status, honest legend) are the
right substrate; its DIRECTION and its wrong-way-preservation are not. This ADR keeps the mechanics
and reshapes the direction.

This decision is design-time-ratified (the owner directed it in conversation, ADR-0110) — it is NOT a
fork to re-escalate. It fixes the HIERARCHY the direction implies: the grown director vocabulary (the
LEAF, `act2-beat-director`), the grown experienced walk and its upstream reveal (the LOOK,
`act2-guided-forest`), a light correction to G's shipped beat 4 + CTA seam (`act2-guided-walkthrough`),
and the story-level framing — each honest at its tier.

## Decision

**Act 2 is ONE continuous visitor-paced walk that, after growing the mock website green, keeps walking
UPSTREAM — revealing the backend and database the website depends on as PROPOSED trees on the real
2.5D map — and the dependency layers thus made visible ARE the advantage the walk teaches, replacing
beat 4's wrong-way-flag antipattern teach.**

1. **One continuous walk, not a CTA-gated second phase (amends ADR-0148 §4).** The upstream forest is
   NOT a separate destination the visitor clicks into from a "grow the backend next →" button. It is
   the next beats of the same arc: the visitor who has grown the mock website green continues, at the
   same one-tap-per-beat pace, and the orchestrator guides them upstream in the same voice and register
   G established. G's "what's next" CTA is reframed from a hand-off DESTINATION into a CONTINUATION
   SEAM — the walk flows on; it does not branch to a new page. (Until H builds, the seam still resolves
   to the real product / get-involved so the site stays coherent — the continuity is the experienced
   shape, not a requirement that H exist before G is honest.)

2. **The forest grows UPSTREAM on real `dependsOn` edges (reverses the unlanded ADR-0147's horizontal
   growth).** The revealed stories are a **backend** and a **database**, positioned ABOVE the website
   in the DAG, connected by dependency edges the website OWNS (`website → backend → database`, read as
   "depends on" — the website depends on the backend, which depends on the database). They
   are NOT sibling/neighbor islands beside the website (ADR-0147's shape). Each carries an explicit
   `dependsOn` so the map renders the upstream layering, and each appears **proposed** (sapling/ghosted,
   not green) until the visitor walks it. This is the correction ADR-0148 named — the walk must SHOW
   that a backend and a database sit upstream of the website, not pretend the website is a leaf —
   realised as the map's actual dependency layers.
   *(Amended by [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md),
   2026-07-04: the DEPENDENCY direction here (`website → backend → database`, dependent → prerequisite)
   is correct and STANDS. The SPATIAL framing "positioned ABOVE the website" is reframed — the owner
   directed at the increment-H gate that the FRONTEND renders HIGH with the backend then database as the
   FOUNDATION BELOW. "Upstream" (dependency axis) and "frontend high / foundation below" (screen axis)
   describe the same layering from two axes and are not contradictory; screen position is a free render
   choice with no corpus convention. Noted in place per ADR-0139.)*
   *(Further amended by [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md)
   §1, 2026-07-05: the confirmed shape is the BaaS DIAMOND, not the 3-tier spine — the frontend reads
   the database directly, so a direct `website → database` read edge is ADDED (in this same dependent →
   prerequisite direction) on top of the backend chain: `website.dependsOn=[backend, database]`,
   `backend.dependsOn=[database]`, `database.dependsOn=[]`. This ADR's core (one continuous upstream
   walk; the dependency layer is the advantage) STANDS; the added edge points the same way, it does not
   re-break the direction. Noted in place per ADR-0139.)*

3. **The dependency layer is the ADVANTAGE — the teach that replaces beat 4's wrong-way flag (amends
   ADR-0134 §3; reverses the unlanded ADR-0147's beat-4 preservation).** The old beat 4 drew a
   wrong-way UI→DB road flagged as an antipattern (a negative teach). That framing is RETIRED as the
   teach. In its place: the upstream dependency layers, shown on the actual 2.5D map, ARE storytree's
   advantage — the visitor SEES that the website needs a backend which needs a database, in the honest
   order, with nothing hidden. Where the swarm (Act 1) buried the backend and let the visitor discover
   the missing layer by failure, storytree shows the layer up front, as structure, as the thing you
   build next. The teach is POSITIVE (here is the honest dependency structure, revealed to you) not
   NEGATIVE (here is a mistake flagged).

4. **The wrong-way-road DATA CONTRACT is retired from the teach, but green-only-on-signed-proof STANDS
   verbatim.** Two thesis data-contracts live in the `act2-beat-director` engine today:
   `abd-green-only-on-signed-proof` and `abd-wrong-way-road-is-flagged-from-data`. The FIRST is
   PRESERVED verbatim and remains load-bearing — a limb greens only on a signed-proof marker, in data,
   so the site can never walk a script that contradicts the verification-gap thesis (this is NOT
   retired and NOT weakened). The SECOND — the wrong-way road flagged from data — is no longer the
   Act-2 TEACH; the engine's `RoadDelta.violation` field and its flagging capability MAY remain in the
   type (roads can still declare a violation, and the layer-jump answer stays a real storytree
   mechanism per the coverage map §C), but the default script no longer USES a violation-flagged road
   as a beat, and no UAT leg asserts the wrong-way flag as the teach. The engine's grown default script
   is the positive upstream arc; the antipattern road is demoted from "the beat" to "a capability the
   model still has, unused by the shipped script." (Whether to keep or drop the `violation` field
   entirely is a build-time call for the `act2-beat-director` re-spec — the WHAT here is that it is no
   longer the teach; the coverage-map layer-jump mechanism does not depend on the WEBSITE teaching it.)

5. **The 2.5D substrate STANDS (ADR-0145 extended, not re-decided).** The walk still renders on the
   synced `buildScene` scene-graph as the site's 2.5D SVG; still visitor-paced (one Next-tap per beat,
   no auto-play); still anchored-callout narration in plain language; the fiction and words stay
   site-owned (narration keyed by beat id). What grows is the beat STRUCTURE (the upstream arc) and the
   director's VOCABULARY (multi-story, `dependsOn`, tri-state status); the substrate does not change.

6. **The upstream stories are INSPECTABLE and walked green PROGRESSIVELY.** The visitor can open any
   proposed upstream story to read, in plain language, WHAT it is (its outcome, on the anchored-callout
   treatment) and WHY it is proposed (the orchestrator's dependency rationale, grounded in the
   website's needs: carts need storage → a database; checkout needs server logic → a backend). Then
   they walk each green one at a time, at their own pace, with the same Next gesture — green still
   appears ONLY on the signed-proof marker (contract `abd-green-only-on-signed-proof`). Complexity is
   SCAFFOLDED — revealed in the order a human can hold it, as the visitor asks for the next step —
   never dumped up front, never hidden.

7. **Act 1 and the storm→land inflection are explicitly UNTOUCHED.** This decision changes only Act 2's
   post-website arc, beat 4's teach, and the CTA seam. Act 1 (`act1-terminal-storm`), the inflection
   (`storm-to-forest-inflection`), G's reused-prompt open + orchestrator mock-website proposal + the
   five-beat website walk (beats 1–3 and 5 unchanged; beat 4's teach reframed), and the "one calm
   gesture per act — same input, opposite outcome" thesis are unchanged.

The gripe-mapping source of record for which reveal teaches which gripe stays
[`docs/research/vibe-coding-coverage-map-2026.md`](../research/vibe-coding-coverage-map-2026.md) — the
upstream dependency roads teach hidden coupling / blast-radius (C-11/12), now framed as the advantage
of SEEING the layers; no beat claims storytree answers duplication (§C ⚠, corpus-silent).

## Consequences

**Good.**

- The pitch keeps G's non-overwhelming website-first front door AND ends on the dependency-layer payoff
  the product is actually about — the mock website is the on-ramp; the honest upstream forest is the
  destination, revealed as ONE continuous walk rather than a separate phase.
- Beat 4's teach flips from negative to positive: instead of "here is a mistake flagged," the visitor
  learns "here is the honest dependency structure, shown to me in the right order." This reads as an
  advantage a vibe coder actually wants (see the layers, build them in order) rather than a scold.
- The pull-back legend becomes HONEST for the RIGHT reason: a grown forest genuinely holds
  proven/building/broken across the website + its upstream stories, so "green = proven, sapling =
  in-progress, withered = broken" is backed by data — realised as vertical dependency layers, not
  sideways neighbor islands.
- `green-only-on-signed-proof` stays a parent-side DATA CONTRACT the spine holds — the grown walk still
  cannot ship a diorama that contradicts the verification-gap thesis (the whole pitch's center).
- The proof model is unchanged: the LEAF re-builds red→green through the real prove-it-gate at the
  grown vocabulary (the prior `2358bc4` build stands as history; the re-build proves the upstream
  vocabulary), and the LOOK stays ADR-0070 operator-attested (appearance and feel never self-signed).

**Salvage from the unlanded ADR-0147 director grow (reuse the mechanics, reshape the direction).** The
`--real`-proven grow on `claude/laughing-galileo-fe1a0b` (@ `8aa8d0f`) is ~70% of the engine mechanics
this decision needs, shaped for the wrong (horizontal) framing:

- **REUSE:** `WorldState.stories: StoryNode[]` (multiple stories replacing the flat `storyId`); the
  tri-state `StoryStatus` = `proven | building | broken` → green/sapling/withered; the honest legend;
  the `add-roads` accumulation (roads now accrete across beats, not replace); the upsert-by-id
  `applyDelta` for `plant-story`/`attach-wisp`/`branch-caps`; the beat-id position-honesty discipline;
  the preserved `green-only-on-signed-proof` refine and runtime `Beat.parse`.
- **ADAPT:** `StoryNode` gains a `dependsOn: string[]` (ADR-0147's neighbor has none — its stories are
  siblings, not upstream). The `grow-forest` delta (flat neighbor list) becomes an **`add-upstream-story`**
  delta. The new default-script beats are the UPSTREAM arc (reveal the backend the website `dependsOn` →
  reveal the database the backend `dependsOn` → walk each green) NOT the horizontal `grow-forest` +
  `connect-stories` neighbor arc.
  *(Correction 2026-07-04, [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md):
  the `dependsOn` EDGE DIRECTION was expressed backwards here. The `add-upstream-story` stories do NOT
  carry a `dependsOn` "pointing DOWN to the story they sit above"; the edge points FROM the dependent TO
  its prerequisite (`cross-story-dependency`, [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)
  §1 — A depends_on B iff A needs B's delivered outcome to pass A's own UAT). So
  `website.dependsOn=[backend]`, `backend.dependsOn=[database]`, `database.dependsOn=[]` — NOT
  "backend `dependsOn` website". This ADR's DECISION (grow upstream; the dependency layer is the
  advantage) is unchanged and SOUND; only the mis-expressed edge direction is corrected. Noted in place
  per ADR-0139.)*
- **DROP:** ADR-0147's beat-4-preservation and its wrong-way road AS THE TEACH; the horizontal
  `grow-forest`/`connect-stories` beats; the sibling-island framing.

The `claude/laughing-galileo-fe1a0b` branch dies unlanded; ADR-0147 never enters main's decision record
(its reserved number is a permanent hole — ADR-0050), so no on-main status flip is owed. The salvage is
of CODE (the grown director), cherry-picked/adapted by H's build session — never of the ADR-0147 file.

**Costs / risks (named).**

- The `act2-beat-director` exported contract CHANGES shape again (on top of, and diverging from, the
  laughing-galileo grow): `WorldState.storyId: string` → `WorldState.stories: StoryNode[]` WITH a
  `dependsOn` field, and a new `add-upstream-story` delta kind. This is a breaking change to the synced
  artifact the site consumes: the site's `walkthroughScript` (the fiction) and `foldWorldToScene` (the
  fold) grow in lockstep (the `frontend-builder`'s job on storytree-web). The build-time narration wall
  (`act2-validate`) and the `check:web-engine` drift gate catch a stale fold or an orphaned narration
  key, so the lockstep is enforced, not hoped.
- The beat ids grow and change. The site's narration wall keys on beat id, so each renamed/new beat id
  is matched by a site-side narration key in lockstep; a stale key FAILS `astro build` (exact-coverage
  wall), so the rename cannot silently drift. Beat ids stay position-honest.
- Increment G's SHIPPED beat 4 (live at web main `ff70222b`) still carries the wrong-way road. This ADR
  reframes the teach; the actual site edit (retire the flag, land the dependency-layer reveal) is H's
  build on storytree-web, operator-attested — G's live record is corrected in its cap's history
  (copy-on-write, the "As built" record kept intact), not rewritten.
- The reveal is a longer continuous walk (more taps before the CTA). Mitigation: the beat COUNT is the
  owner's to tune at the ADR-0070 stage-2 gate — the director is data-driven, so the upstream arc can
  be lengthened or shortened without re-proving the engine; each merge still leaves a complete-so-far
  arc ending on the CTA (never a dead-end Next).
- This decision does NOT close any coverage GAP (security, slopsquatting, duplication) — those stay
  owner-review items. The walk teaches only the covered side; the dependency-layer reframe is a
  re-framing of the coupling teach (C-11/12), not a new coverage claim.

**Unchanged (explicit).** Act 1, the storm→land inflection, the 2.5D substrate (ADR-0145), the
visitor-paced/Next-only pacing, the anchored-callout narration, the plain-language voice, the fictional
site-owned data (the boundary, ADR-0056/0066/0093), the `green-only-on-signed-proof` thesis
data-contract, G's reused-prompt open + orchestrator mock-website proposal + the website walk's beats
1–3 and 5, and the ADR-0070 two-stage proof for the LOOK. What changes: beat 4's teach (negative flag →
positive dependency-layer advantage), H's structure (CTA-gated phase → one continuous upstream walk),
and the director's vocabulary (single-story → multi-story-with-dependsOn, upstream growth).

## References

- ADR-0147 (unlanded — branch `claude/laughing-galileo-fe1a0b`, never merged to main, so referenced by
  name only): OVERTAKEN — its horizontal (sibling-island) growth and its beat-4 wrong-way preservation
  are reversed; its mechanics (multi-story state, tri-state status, honest legend) are reused and
  reshaped vertical.
- [ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md) — AMENDED: increment
  H no longer opens from a "what's next" CTA as a separate phase; it is the same continuous walk
  continuing upstream (the CTA becomes a continuation seam).
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — AMENDED: §3's beat-4
  "stories connect via roads … the wrong-way road" as a negative antipattern teach becomes the positive
  dependency-layer-as-advantage teach.
- [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — the 2.5D substrate;
  EXTENDED (the substrate stands; the upstream arc grows on it).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment IS
  ratification (this ADR born accepted, owner-directed 2026-07-04).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage
  proof for visual surfaces; the LOOK's grown scope is operator-attested, never self-signed.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — red→green enforcement; the LEAF
  re-builds red→green at the grown vocabulary; `healthy` is earned through the gate, never authored.
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) /
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — copy-on-write: a
  re-decision is a new ADR (this one), not an in-place body edit of 134/145/148.
- [`docs/research/vibe-coding-coverage-map-2026.md`](../research/vibe-coding-coverage-map-2026.md) — the
  gripe-mapping menu: the upstream dependency roads teach hidden coupling / blast-radius (C-11/12), now
  framed as the advantage of seeing the layers; §C ⚠ the no-duplication honesty this ADR keeps.
- [`stories/website-experience/story.md`](../../stories/website-experience/story.md) — the story this
  arc lives in (H description + Story-UAT leg 6 updated for the integrated/upstream framing).
- [`stories/website-experience/act2-guided-forest.md`](../../stories/website-experience/act2-guided-forest.md)
  — the LOOK cap re-specced by this decision (increment H, the one continuous upstream walk).
- [`stories/website-experience/act2-beat-director.md`](../../stories/website-experience/act2-beat-director.md)
  — the LEAF cap re-specced by this decision (multi-story-with-dependsOn director, upstream arc,
  wrong-way road demoted from the teach).
- [`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md)
  — the LOOK cap (increment G) lightly corrected: beat 4's teach reframed, the CTA becomes a
  continuation seam; the "As built" live-attested history kept intact.
</content>
</invoke>
