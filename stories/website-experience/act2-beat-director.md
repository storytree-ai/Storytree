---
id: "act2-beat-director"
tier: capability
story: website-experience
title: "The Act 2 beat director — the ONE continuous teaching script (website walk → UPSTREAM forest) as pure, provable choreography"
outcome: "A pure, deterministic, visitor-paced director in @storytree/forest-world-r3f: beats are typed data (scene delta + camera target + narration key), advance() moves exactly one beat per call and parks on the final CTA state, the world holds MULTIPLE stories each with a dependsOn edge set and a tri-state status (proven/building/broken → green/sapling/withered) so the pull-back legend is HONEST, a new add-upstream-story delta raises a backend + database UPSTREAM of the website on real dependsOn edges pointing FROM the dependent TO its prerequisite — in the BaaS shape the owner confirmed at the H#2 gate (ADR-0157): the frontend reads the database directly, so the delta must let one prerequisite be depended on by MORE THAN ONE story, giving website.dependsOn=[backend, database], backend.dependsOn=[database], database.dependsOn=[] (a diamond; ADR-0058 / cross-story-dependency), a limb may turn green ONLY when its delta carries a signed-proof marker — and the exported default script IS the ONE continuous arc: the website walk then the upstream dependency-layer reveal, walking end-to-end. The wrong-way UI→DB road is RETIRED as the teach (no longer a beat in the default script); the layer-violation road model may remain as a latent capability but is not what the shipped script teaches."
status: proposed
proof_mode: integration-test
depends_on: [r3f-world-spike]
decisions: [134, 150, 153, 157]
# Node-borne proof config (ADR-0057 keystone). NET-NEW in the spike-born package (original build) —
# RE-SPECCED by ADR-0150 (owner-directed at the G attestation gate 2026-07-04): the
# director GROWS to a multi-story-with-dependsOn vocabulary, adds an add-upstream-story delta and a
# tri-state story status, and its default script becomes the ONE continuous arc (website walk →
# upstream forest). The wrong-way road is RETIRED as the teach (demoted from the default script). The
# green-only-on-signed-proof contract is PRESERVED VERBATIM (NOT retired, NOT weakened). Then
# CORRECTED by ADR-0153 (owner-directed at the H attestation gate 2026-07-04, where H was refused):
# the dependsOn DIRECTION is fixed to the library rule — the edge points FROM the dependent TO its
# prerequisite (website.dependsOn=[backend], backend.dependsOn=[database], database.dependsOn=[];
# ADR-0058 §1 / cross-story-dependency: A depends_on B iff A needs B's delivered outcome to pass A's
# own UAT). The previously-authored-but-never-proven backwards encoding (backend dependsOn website) is
# removed before it was ever built at the grown vocabulary.
# Then RE-SPECCED AGAIN by ADR-0157 (owner-directed at the H BUILD #2 gate 2026-07-05, where H#2 was
# attested "as a step forward" + landed live): the owner CONFIRMED the BaaS architecture ADR-0153 left
# open — the frontend reads the DATABASE DIRECTLY. So the graph gains a direct website->database edge (in
# the SAME corrected direction, dependent -> prerequisite): website.dependsOn=[backend, database],
# backend.dependsOn=[database], database.dependsOn=[] — a diamond with the database as the shared sink.
# The as-built add-upstream-story delta carries a single dependentId; to encode the diamond the delta
# must let one upstream story be attached as a prerequisite of MORE THAN ONE existing story
# (dependentId: string | string[], or an equivalent direct-edge mechanism) — raise the database once
# with dependentId spanning both the website and the backend. The edge direction stays dependent ->
# prerequisite for each; green-only-on-signed-proof is PRESERVED verbatim; the wrong-way road stays
# retired. This is a re-build red->green under the existing contract (defects-amend-the-owning-story);
# healthy is earned through the gate, never authored (ADR-0020). The director
# stays PURE .ts — beats-as-data in, scene states out; no React, no three.js, no timers (visitor-paced
# means state changes ONLY on advance()) — so it is node:test-provable and rides the same sync artifact
# as the mapper. install: true (it builds World fixtures via @storytree/forest-world and the r3f
# package's own descriptor types) + the typecheck wall. The NARRATION COPY is deliberately NOT here:
# beats carry narration KEYS; the words are site-side fictional content (the Cohoot precedent) keyed by
# beat id — structure/choreography is parent-side and provable, words stay with the surface. The
# director is renderer-agnostic (substrate-blind — no forest-world render import; deltas speak
# scene-semantics, never pixels).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/forest-world-r3f", "test"]
  scope:
    testGlobs: ["packages/forest-world-r3f/src/**/*.test.ts"]
    sourceGlobs: ["packages/forest-world-r3f/src/**/*.ts"]
  real:
    testFile: "packages/forest-world-r3f/src/act2-director.test.ts"
    sourceFile: "packages/forest-world-r3f/src/act2-director.ts"
    scope:
      testGlobs: ["packages/forest-world-r3f/src/act2-director.test.ts"]
      sourceGlobs: ["packages/forest-world-r3f/src/act2-director.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/forest-world-r3f", "typecheck"]
---

# The Act 2 beat director — the ONE continuous teaching script (website walk → UPSTREAM forest) as pure, provable choreography

**Outcome —** A pure, deterministic, **visitor-paced** director in `@storytree/forest-world-r3f`:
beats are typed data (scene delta + camera target + narration key), `advance()` moves exactly one
beat per call and parks on the final CTA state, the world holds **MULTIPLE stories** each with a
`dependsOn` edge set and a **tri-state status** (`proven`/`building`/`broken` → green/sapling/withered)
so the pull-back legend is **HONEST**, a new **`add-upstream-story`** delta raises a **backend + database
UPSTREAM of the website** on real `dependsOn` edges pointing FROM the dependent TO its prerequisite — in
the **BaaS shape the owner confirmed at the H#2 gate (ADR-0157): the frontend reads the database
DIRECTLY**, so the delta must let **one prerequisite be depended on by MORE THAN ONE story**, giving
`website.dependsOn=[backend, database]`, `backend.dependsOn=[database]`, `database.dependsOn=[]` (a
**diamond** with the database as the shared sink; ADR-0058 / ADR-0153 / ADR-0157), a limb may turn
green ONLY when its delta carries a signed-proof marker — and the exported default script IS the **ONE
continuous arc**: the website walk
then the upstream dependency-layer reveal, walking end-to-end. The wrong-way UI→DB road is **RETIRED
as the teach** (no longer a beat in the default script).

**Depends on —** [`r3f-world-spike`](r3f-world-spike.md) — the director lives in the mapper's
package and emits the World / scene inputs the mapper draws.

> **Proof status (honest) — BUILT + LEAF-PROVEN at the grown, direction-corrected vocabulary
> (`--real` PASS, run `real-mr6bktin`, `--store pg`; verdict commit `deb235e` / origin `30be855`;
> consolidation `4fa1a69` / `c474582`; `storytree coverage act2-beat-director` = 4/4; the
> `@storytree/forest-world-r3f` suite 16/16 green). The authored status stays `proposed`
> (the whole STORY is not yet green).** History: the gated SDK leaf first authored the NET-NEW
> single-story director through the real prove-it-gate (run `real-mr32b6ib`, signed PASS @ `2358bc4`
> 2026-07-02; the five-beat website walk, the `green-only-on-signed-proof` refine, the wrong-way-road
> flag). **ADR-0150** (owner-directed at the G attestation gate 2026-07-04) grew the director:
> multi-story-with-`dependsOn` `WorldState`, an `add-upstream-story` delta, a tri-state story status, an
> honest legend, and a default script that is the ONE continuous arc (website walk → upstream forest).
> **ADR-0153** (owner-directed at the H attestation gate 2026-07-04, where increment H was REFUSED)
> CORRECTED the dependency DIRECTION the grown vocabulary encodes: the edge points FROM the dependent
> TO its prerequisite — `website.dependsOn=[backend]`, `backend.dependsOn=[database]`,
> `database.dependsOn=[]` (ADR-0058 §1 / `cross-story-dependency`: A depends_on B iff A needs B's
> delivered outcome to pass A's own UAT; the `boundary` def's "a frontend depends on a database"
> archetype). The earlier spec text encoded this BACKWARDS ("the backend `dependsOn` the website");
> that was never built at the grown vocabulary, and the backwards encoding was removed. Per
> `defects-amend-the-owning-story` this was a re-build red→green under the existing contract (not a new
> unit); `healthy` was earned through the gate, never authored (ADR-0020).
>
> **As built (2026-07-05, verdict `deb235e`) — `packages/forest-world-r3f/src/act2-director.ts`:**
> the corrected-direction `add-upstream-story` delta carries `dependentId` (line 132) — the id of the
> EXISTING story whose `dependsOn` gains the new upstream story's id (`applyDelta` sets
> `dependent.dependsOn = [...dependsOn, delta.id]`, lines 302–325), so the edge points FROM the
> dependent TO its prerequisite. `StoryNode.dependsOn` is documented "FROM this story TO its
> prerequisites — ADR-0058" (lines 201–214); the tri-state `status: 'proven' | 'building' | 'broken'`
> backs the honest legend (line 209). The six-beat `defaultScript` IS the one continuous arc (lines
> 396–501): plant-story → attach-wisp → branch-caps → `add-upstream-story` backend
> (`dependentId: 'story-website'`, beat 4) → `add-upstream-story` database
> (`dependentId: 'story-backend'`, beat 5) → `pull-back` with `proven: ['story-website']` (beat 6,
> lines 495–500) — so the honest status mix at the reveal is website = proven, backend + database =
> building (proposed/sapling, never green). Green stays gated: `LimbDelta`'s zod `refine` requires a
> non-empty `signedProof` on every green limb (lines 56–72) and `advance()` runs `Beat.parse` before
> applying (line 363), so a green-without-marker limb THROWS. The wrong-way `RoadDelta.violation` field
> survives as a LATENT capability but the `add-roads` delta is a no-op in `applyDelta` and no beat in
> `defaultScript` uses it (lines 82–92, 297–300) — retired as the teach, not the model.
>
> **PRESERVED verbatim:** the `green-only-on-signed-proof` data contract (the verification-gap thesis;
> NOT retired, NOT weakened) and the pure/visitor-paced/renderer-agnostic shape. **RETIRED as the
> teach:** the wrong-way UI→DB road — no longer a beat in the default script, no longer contract-covered
> as the teach (ADR-0150 §4; the dependency-layer-as-advantage teach replaces it). **SALVAGE (history):**
> the `--real`-proven grow on the unlanded `claude/laughing-galileo-fe1a0b` branch (@ `8aa8d0f`) was
> ~70% of these mechanics, shaped for the WRONG (horizontal) framing; the landed build reused its
> multi-story state / tri-state status / honest legend and ADAPTED its flat-neighbor delta into
> `add-upstream-story` with `dependsOn` in the CORRECTED direction. That branch died unlanded; ADR-0147's
> number is orphaned in the store.
>
> **RE-OPENED toward `building` by ADR-0157 (owner-directed at the H BUILD #2 gate 2026-07-05).** H#2's
> re-build (still the 3-tier `website → backend → database` spine) was attested "as a step forward" and
> landed live (web main `8f4e166c`); at that gate the owner CONFIRMED the **BaaS** architecture ADR-0153
> had left open — *"the frontend would read directly from the database."* That adds a **direct
> `website → database` edge** in the SAME corrected direction (dependent → prerequisite), so the graph
> becomes the **diamond** `website.dependsOn=[backend, database]`, `backend.dependsOn=[database]`,
> `database.dependsOn=[]`. The as-built delta carries a single `dependentId` (line 132) — the diamond
> needs the delta to let one upstream story be a prerequisite of **more than one** existing story
> (`dependentId: string | string[]`, or an equivalent direct-edge mechanism: raise the database once
> with `dependentId` spanning both the website and the backend). This RE-OPENS the cap toward `building`
> for the widened vocabulary; the H#2 `deb235e` verdict + the as-built above stay TRUE HISTORY
> (copy-on-write). `green-only-on-signed-proof` is PRESERVED verbatim through the change; the wrong-way
> road stays retired. The widen is a re-build red→green under the EXISTING contract
> (`defects-amend-the-owning-story`) — a NEXT build link, not authored green here; `healthy` is earned
> through the gate, never authored (ADR-0020).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: the beat contract, the advance state machine, and the
default continuous script are one organism — a script player — proven by integration (a full walk of
the real default script through the real state machine), not a single isolated assertion.

THE MODEL (grown by ADR-0150). A `Beat` = `{ id, narrationKey, camera, delta }` where
`delta` describes what the world GAINS this beat in the mapper's semantic vocabulary (plant a story
node; attach a wisp; branch capabilities with per-limb proof state; add roads; add an UPSTREAM story
with its `dependsOn` edges and status; widen to the full forest). `WorldState` holds an array of
per-story nodes — `stories: StoryNode[]` where `StoryNode = { id, label, hasWisp, status, dependsOn,
limbs }` — NOT a single flat `storyId` (that was the original single-story shape, superseded).
`DirectorState` = `{ beatIndex, world, camera, done }`. `advance(state, script)` is a pure function —
no timers, no RNG, no auto-play: VISITOR-PACED is a structural property (state changes only when the
visitor's Next-tap calls advance), which is the deliberate inverse of Act 1's all-at-once (ADR-0134 §3).

THE STORY STATUS (salvaged from the unlanded ADR-0147 grow — the honest legend). Each `StoryNode`
carries a tri-state `status` = `'proven' | 'building' | 'broken'`, rendering as green / sapling /
withered. So the pull-back legend ("green = proven, sapling = in-progress, withered = broken") is
backed by data, not a claim over a uniformly-amber forest. `plant-story` seeds the website story as
`building`; `add-upstream-story` raises each upstream story with an explicit status; a limb greening
(contract 2) is the per-limb proof marker, distinct from the story-level status.

THE UPSTREAM DELTA (NEW — ADR-0150; DIRECTION corrected by ADR-0153; the BaaS diamond confirmed by
ADR-0157). `add-upstream-story` raises a story that an existing story DEPENDS ON, on a real dependency
edge: each added story carries `{ id, label, status, dependsOn: string[] }`, and the edge points FROM
the dependent TO its prerequisite. The **BaaS shape the owner confirmed at the H#2 gate (ADR-0157 —
"the frontend would read directly from the database")** is: the WEBSITE `dependsOn` the backend AND the
WEBSITE `dependsOn` the database directly, the BACKEND `dependsOn` the database —
`website.dependsOn=[backend, database]`, `backend.dependsOn=[database]`, `database.dependsOn=[]` — a
**diamond** with the database as the shared sink. This is the authoritative library rule (ADR-0058 §1 /
`cross-story-dependency`: A depends_on B iff A needs B's delivered outcome to pass A's OWN UAT — the
website reads the catalog directly from the database, so it needs the database; the website needs the
backend to serve a working checkout/payment; the backend needs the database; a database is provable
headless). Because the database is now a prerequisite of BOTH the website and the backend, the delta
must let **one upstream story be attached as a prerequisite of MORE THAN ONE existing story**: its
dependent is `string | string[]` (or an equivalent direct-edge mechanism), so `applyDelta` fans the new
id into each named dependent's `dependsOn` — raise the database once with the dependent spanning both
the website and the backend. The edge direction stays dependent → prerequisite for each. So the world
holds the diamond `website → {backend, database}`, `backend → database` (dependent → prerequisite), and
the mapper can render the stack (the owner's spatial preference is frontend HIGH / foundation BELOW —
a free render choice, ADR-0153/0157; the direct `website → database` read edge draws alongside the
`website → backend → database` chain). This REPLACES ADR-0147's flat `grow-forest` neighbor delta
(sibling islands with no `dependsOn`) — the direction is vertical/upstream (toward what the website
needs), not horizontal. **NOTE: an earlier draft of this section encoded the edge BACKWARDS ("the
backend `dependsOn` the website"); that was the error ADR-0153 corrects — the added upstream stories do
NOT carry a `dependsOn` back to the website; the WEBSITE carries the `dependsOn` to its prerequisites.**
**NOTE (ADR-0157): the as-built delta carries a single `dependentId` (the 3-tier spine); the diamond
widening (`dependentId: string | string[]`) is the follow-on build link's red→green under the existing
contract — not yet built.**

THE ONE CONTINUOUS DEFAULT SCRIPT (the exported `defaultScript` — ADR-0150's arc). The script
is ONE arc, not two phases: the website walk THEN the upstream reveal, walking end-to-end to the CTA.

The website-walk beats (carried forward from the original, with beat 4's teach reframed):

1. **Plant a story** — a seed grows into the mock website tree with its OUTCOME on a label (intent is a
   thing on the map, not buried in a chat log). The website story starts `building`.
2. **Watch a wisp** — a soft wisp drifts over the tree (presence without obligation).
3. **It branches** — capability limbs appear; a limb turns green ONLY on a signed passing proof — the
   delta for a green limb MUST carry the signed-proof marker; a "done"-without-proof delta cannot
   colour it (the verification-gap answer, enforced in data — PRESERVED verbatim).

The upstream-forest beats (NEW — the dependency-layer-as-advantage teach that REPLACES the old beat 4):

4. **Grow upstream — the backend.** `add-upstream-story` raises a **backend** story that the website
   `dependsOn` — the edge is `website.dependsOn` includes `backend` (the dependent → its prerequisite;
   ADR-0058 / `cross-story-dependency`) — as `building` (proposed). The teach: the website NEEDS a
   backend to serve a working checkout/payment — you SEE the layer, up front, in order. This is the
   POSITIVE dependency-layer teach that replaces the wrong-way-road antipattern beat.
5. **Grow upstream — the database (the shared foundation, BaaS diamond — ADR-0157).** `add-upstream-story`
   raises a **database** story that BOTH the backend AND the website `dependsOn` directly — the dependent
   spans both (`dependentId` = the backend AND the website), so `backend.dependsOn` includes `database`
   AND `website.dependsOn` includes `database` (the frontend reads the catalog directly from the
   database; the owner-confirmed BaaS shape). The forest now holds the **diamond** `website → {backend,
   database}`, `backend → database` (dependent → prerequisite) with a genuinely mixed status set (proven /
   building / broken across the stories), so the legend is honest. *(The as-built script uses the 3-tier
   spine — a single `dependentId` per delta; the diamond fan-out is the follow-on build link.)*
6. **Pull back** — the camera widens to the whole legible forest (green = proven, sapling =
   in-progress, withered = broken), then `done: true` — the CTA state.

(The beat count and exact status mix are the owner's to tune at the ADR-0070 stage-2 gate — the
director is data-driven, so the arc lengthens/shortens without re-proving the engine. Beat ids stay
POSITION-HONEST — id number = position — and the site's narration wall keys on beat id, so any
rename/renumber is matched by a site-side narration key in lockstep or `astro build` fails.)

THE WRONG-WAY ROAD, RETIRED AS THE TEACH (ADR-0150 §4). The old beat 4 drew a wrong-way UI→DB
road flagged as an antipattern — that NEGATIVE teach is retired. The `RoadDelta` model MAY keep its
`violation` field as a latent capability (roads can still declare a layer violation — the layer-jump
mechanism stays real per the coverage map §C), but the **exported default script no longer uses a
violation-flagged road as a beat**, and no contract/UAT asserts the wrong-way flag as the teach.
Whether to keep or drop the `violation` field entirely is a build-time call (the WHAT here is that it
is no longer the teach; the coverage-map layer-jump mechanism does not depend on the WEBSITE teaching
it). If kept, it stays dead in `defaultScript`.

WORDS STAY SITE-SIDE. Beats carry `narrationKey`s; the plain-language copy and the fictional story
names live in the web repo keyed by beat id (the fictional-data precedent, ADR-0093 §3/§4). The
exported zod contract is what keeps site-side data honest — the site parses its beat copy against it
at build time. The dependency-layer-as-advantage FRAMING is carried by that site-side copy (the engine
carries the STRUCTURE — the upstream stories and their `dependsOn` — not the persuasive words).

THE DRIVE-MACHINERY OVERLAYS STAY SITE-SIDE TOO — the director needs NO structural change for them
(ADR-0153 authoring call). ADR-0153 redirections 4/5 add temporary flow-diagram OVERLAYS (the agent
loop top-left in step 2; the expanded CI/CD / devops / gates / wiring diagrams top-right in steps 3–4)
depicting the background drive machinery. These are SITE-SIDE content keyed by beat id — the same
precedent as narration copy ("words stay site-side") — NOT a new `Beat` field and NOT a new delta kind.
Rationale: an overlay is transient, non-map, presentational chrome (a diagram floating ABOVE the map,
cleared when done); it carries no scene semantics the mapper must draw and no state the engine must
hold, and there is no isolatable red→green oracle for "is the right diagram shown" (that IS the
operator-attested LOOK). Encoding it as engine structure would push presentation into a substrate-blind
engine for no proof benefit and would violate the renderer-agnostic fence. So the overlays live with the
surface, keyed off beat ids the director already exports and validated (like all site-side beat content)
against the exported zod contract by the site's `act2-validate` build-time wall. The director carries no
`driveMachinery?` marker and adds no contract for this. (If a specific overlay ever needs to be GATED as
engine structure — e.g. its presence proven deterministically — that is a later, separate re-spec; the
default here is site-side-keyed.)

FENCES: no React, no three.js, no timers/tweens in this module (interpolation is the canvas layer's
job); no live data ever (the diorama is fictional by boundary); do not encode narration STRINGS here;
renderer-agnostic — deltas speak scene-semantics (`kind` / status / `dependsOn` / road), never pixels,
and this module never imports a forest-world renderer.

## Integration test

**Goal —** Prove the real default script through the real state machine: the visitor-paced steps, the
proof-gated green, the multi-story world with `dependsOn` upstream layering + honest tri-state status,
and the CTA park. (No wrong-way-road assertion — retired as the teach.)

1. Walk `advance()` from the initial empty-land state through the full exported default script →
   assert exactly N steps to `done: true` (N = the shipped beat count), one beat per call, deterministic
   across two walks (deep-equal states), and no state change without a call (visitor-paced structurally).
2. After the branch beat → assert the branched limbs' proof states: every green limb's delta carried the
   signed-proof marker; construct a mutated script whose branch delta claims green WITHOUT the marker →
   assert the director refuses it (contract violation), so a faked "done" cannot colour the tree even in
   fiction. (PRESERVED verbatim from the original build.)
3. After the upstream beats → assert the world holds MULTIPLE stories with `dependsOn` edges forming the
   upstream layering in the CORRECT direction as the **BaaS diamond** (`website.dependsOn` includes BOTH
   the backend AND the database directly; `backend.dependsOn` includes the database — dependent →
   prerequisite, ADR-0058 / ADR-0153 / ADR-0157; the upstream stories carry NO edge back to the website,
   so the graph stays acyclic), that a single `add-upstream-story` delta CAN attach one upstream story
   as a prerequisite of more than one existing story (the diamond's shared database sink), and that the
   story statuses are a genuinely mixed set (not uniform) so the pull-back legend is honest — the
   dependency-layer structure is in the DATA, not a canvas hint.
4. Parse the exported default script with the exported zod contract → assert it validates (the same
   contract the site uses for its narration keys), and `advance()` past `done` is a no-op (the CTA
   state parks; no wrap-around).

## Contracts (4)

Each one isolated automated test (`node:test`, the `@storytree/forest-world-r3f` suite). Per
ADR-0122 each contract id leads a distinctly-named test so `storytree coverage act2-beat-director`
reports 4/4.

1. **`abd-advance-is-visitor-paced-and-deterministic`** — one tap, one beat, same walk every time
   - **asserts —** `advance()` moves exactly one beat per call, two walks of the same script are
     deep-equal, state never changes without a call, and past-`done` advances are parking no-ops.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
2. **`abd-green-only-on-signed-proof`** — the branch-beat thesis is a data contract, not copy
   (PRESERVED VERBATIM — NOT retired, NOT weakened by the re-shape)
   - **asserts —** a limb renders green only when its delta carries the signed-proof marker; a
     green-without-marker delta is refused loudly.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
3. **`abd-upstream-stories-carry-dependsOn-and-honest-status`** — the dependency layer is in the DATA,
   in the CORRECT direction, as the BaaS diamond (NEW — replaces the retired
   `abd-wrong-way-road-is-flagged-from-data`; this is the dependency-layer-as-advantage teach, made a
   data contract; ADR-0157 confirms the BaaS shape)
   - **asserts —** the `add-upstream-story` delta raises stories the existing story DEPENDS ON, on real
     `dependsOn` edges pointing FROM the dependent TO its prerequisite; a single delta can attach one
     upstream story as a prerequisite of **more than one** existing story (the dependent is
     `string | string[]`) — so `website.dependsOn` includes the backend AND the database, and
     `backend.dependsOn` includes the database (the **diamond** `website → {backend, database}`,
     `backend → database` is in the data; the frontend reads the database directly, ADR-0157;
     ADR-0058 / ADR-0153), and the added upstream stories do NOT carry a `dependsOn` back to the website
     (no reverse edge, no cycle) — and after the upstream beats the story statuses are a genuinely
     mixed tri-state set so the pull-back legend (green/sapling/withered) is backed by data, not a claim
     over uniform amber.
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`
4. **`abd-default-script-is-the-one-continuous-arc`** — the shipped choreography is the approved arc
   - **asserts —** the exported default script validates against the exported contract, is exactly the
     approved beats in order (website walk → upstream forest → pull-back), walks end-to-end to the CTA
     state, and contains NO violation-flagged road beat (the wrong-way road is retired from the teach).
   - **covers —** `packages/forest-world-r3f/src/act2-director.ts`

## Salvage & adapt (the unlanded `claude/laughing-galileo-fe1a0b` grow, @ `8aa8d0f`)

The `--real`-proven ADR-0147 director grow is ~70% of these mechanics, shaped for the WRONG (horizontal)
framing. The re-build UNIFIES with it, it does not rebuild from scratch:

- **REUSE verbatim (or near):** `WorldState.stories: StoryNode[]` replacing the flat `storyId`; the
  tri-state `StoryStatus = 'proven' | 'building' | 'broken'` → green/sapling/withered; the honest legend;
  the `add-roads` accumulation (roads accrete across beats, not replace); the upsert-by-id `applyDelta`
  for `plant-story` / `attach-wisp` / `branch-caps`; the preserved `green-only-on-signed-proof` refine
  and the runtime `Beat.parse` in `advance()`; the beat-id position-honesty discipline.
- **ADAPT:** `StoryNode` gains `dependsOn: string[]` (ADR-0147's neighbor had none — its stories were
  siblings, not upstream). The `grow-forest` delta (flat neighbor list, no edges) becomes
  **`add-upstream-story`** whose edges point FROM the dependent TO its prerequisite — the WEBSITE
  `dependsOn` the backend AND the database directly, the BACKEND `dependsOn` the database (ADR-0058 /
  ADR-0153 / ADR-0157, the corrected direction in the BaaS diamond; NOT the backwards "backend dependsOn
  website"). To encode the diamond the delta's dependent is `string | string[]` (ADR-0157) so the
  database can be attached as a prerequisite of both the website and the backend in one delta. The new
  default-script beats are the UPSTREAM arc (reveal the backend the website `dependsOn` → reveal the
  database BOTH the backend and the website `dependsOn` → pull-back) NOT the horizontal `grow-forest` +
  `connect-stories` neighbor arc.
- **DROP:** ADR-0147's beat-4-preservation and its wrong-way road AS THE TEACH (retire it from the
  default script); its horizontal `grow-forest` / `connect-stories` beats; its sibling-island framing.

## Guidance — the slice that earns the signed verdict

The re-build rung (ADR-0057 §3; the original NET-NEW build stands as history @ `2358bc4`):

- **The test —** `packages/forest-world-r3f/src/act2-director.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ advance, defaultScript, BeatScript }` from `"./act2-director.js"`.
  Name each test for its contract id (`abd-…`). The re-build grows the tests to the new contract set
  (contract 3 is the new upstream/`dependsOn`/honest-status assertion; the wrong-way-road test is
  removed).
- **The RED the spine observes —** the grown tests fail at the pre-re-spec HEAD: the single-story
  `WorldState` has no `stories` array / no `dependsOn` / no `add-upstream-story` delta, so the new
  contract-3 assertions and the one-continuous-arc script assertion are red until the grown module lands.
- **The GREEN —** grow the pure module to the multi-story-with-`dependsOn` vocabulary, the
  `add-upstream-story` delta, the tri-state status, and the one continuous default script (website walk
  → upstream forest). After it, the package suite + typecheck stay green; the artifact reaches the site
  through `web-experience-sync` unchanged.

Rules:

- **Pure and visitor-paced by construction** — no timers, no auto-play, no RNG in this module.
- **The verification-gap teach is a contract** — proof-gated green lives in the data model (PRESERVED
  verbatim), so the site cannot accidentally ship a diorama that contradicts the thesis.
- **The dependency layer is in the data** — upstream stories carry `dependsOn` edges and honest
  tri-state status, so the site's dependency-layer-as-advantage teach is backed by structure, not copy.
- **Keys, not copy** — narration text never enters the parent package; the persuasive
  dependency-layer-advantage FRAMING is site-side copy over the engine's structure.
- **The mapper's vocabulary is the interface** — deltas speak scene-semantics (`kind` / status /
  `dependsOn` / road), never pixels; renderer-agnostic.
