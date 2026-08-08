---
status: accepted
decided: 2026-08-09
amends: [212]
---
# ADR-0326: Join a live build to a claim at the claimed unit, not the story

## Status

accepted (2026-08-09) — RATIFIED by the owner in conversation ("accept ADR-0326"), which is the green
flip ADR-0084 permits once the decision is made and the prose supports it.

It was born `proposed` on 2026-08-08 rather than accepted, and the distinction is worth keeping: the
owner directed the REPAIR of ADR-0212's fold and explicitly delegated the choice of remedy ("weigh
them yourself"), so ADR-0110's design-time alignment did not apply — a delegated call is not a
directed one. The fix therefore LANDED first (PR #1226) with the decision still open, and the
ratification was asked as an `open-question` artifact on `parallel-red-green-arc`
(`ratify-adr0326-claimed-unit-join`, ADR-0314 D5) rather than in chat alone. This flip closes it. The
owner ratified the recommended arm, Option A: take the claimed-unit join now and keep the
`events.work_event` session stamp named-but-unbuilt as the closure for the residual named in
Consequences.

**Amends** [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md) — it
replaces ONE clause, the join key. ADR-0212's three channels (position = stage, colour = intent,
motion = build phase), its build-wisp retirement, the ADR-0138 §5 honesty wall it restates, and its
ADR-0048/0138/0200 amendments are untouched and stay current.

## Context

ADR-0212 folded the live build phase onto a story's work-claim body and wrote down the join key it
used and the argument that made it sound:

> The join key is the STORY, not the session. […] because the work claim is an exclusive mutex
> (ADR-0200 D2), a story that has a work claim AND a live build has exactly one possible actor — they
> are the same session by construction. […] if the mutex is ever relaxed to allow multiple work
> claims per story, this join must be revisited FIRST.

That inference is now false, and ADR-0212's own correction note (2026-08-08) says so precisely while
deliberately declining to pick the remedy. Two facts settle it, and the second was established from
the code for this decision rather than assumed.

**1. The fence as literally worded never fired.** Nothing about the mutex changed — `events.node_claim`
is still one work claim per unit id. The inference broke through a different door: it never rested on
the mutex alone. It rested on the mutex PLUS an unwritten second fact — that `story build S --real`
took a work claim on `S` itself, so a session already holding S's work claim refused any other
session's chain. That take was a PROXY for the story's members and fenced none of them; `aa293a0d`
(PR #1220) retired it, and the chain now claims the MEMBERS of its drive order, taking `S` only when
S's own UAT node is in that order. So session A can hold S's work claim — legitimate under ADR-0270
D1 for cross-capability work — while session B runs a live `story build S`, and the fold paints B's
build phase onto A's wisp.

**2. THE DEFECT IS OLDER AND WIDER THAN THAT LANDING** — this is the open point ADR-0212's note left
for the render to establish, and the answer is yes, member-grain builds DO roll up. The studio groups
both layers to the story before the fold ever runs, by the same two lines
(`apps/studio/src/components/TreeView.tsx`):

```ts
const storyId = storyIds.has(b.unitId) ? b.unitId : capOwner.get(b.unitId);   // builds
const storyId = storyIds.has(c.unitId) ? c.unitId : capOwner.get(c.unitId);   // claims
```

So a `node build cap-of-S --real` has ALWAYS arrived at the fold labelled `S`, and it never took a
claim on `S` either. The inference was already weakened before PR #1220 — that landing widened an
existing hole rather than opening a new one. Two consequences follow that the story-grain framing hid:

- `foldBuildOntoClaims` reads `claims.find((c) => (c.grade ?? 'work') === 'work')` and its comment
  asserts *"By the ADR-0200 D2 mutex there is at most one such claim, so 'the first work-grade claim'
  is 'the'."* **That is false at story grain.** ADR-0270 D1 exists precisely so two sessions may hold
  work claims on two disjoint capabilities of one story; both roll up to `S`, and `find` then returns
  whichever sorts first by `claimedAt` — an arbitrary session, not the building one.
- The mutex is per unit id, so story grain is the one grain at which it guarantees nothing. The fold
  asked the mutex a question about a scope the mutex does not cover.

The result is a record whose rendered state does not correspond to what it describes — the
`verification-integrity-arc` failure class — and the same premise is restated verbatim in
`packages/forest-world/src/scene.ts`'s `claims[].phase` contract note, where it carries the same
defect.

**The live `claim` definition already records the property this got wrong:** a claim row is keyed by
the RAW id string, and containment is resolved in NEITHER direction — a claim on a story does not
cover its capabilities, nor the reverse. Whether a parent claim SHOULD cover its children is
ADR-0310/ADR-0317's ground and is deliberately not settled here.

### The three remedies weighed

ADR-0212's note named three and preferred none.

**(1) Stamp a session id onto `events.work_event` and the server fold.** Strongest — it makes the join
a direct identity join rather than any inference at all. Also the heaviest: a durable event-schema
change, a server fold change, and a long tail of existing rows carrying no session id, so the fold
needs the inferential fallback anyway. It buys a rendering concern by changing the durable event
store. NOT taken now; it stays the closure for the residual named below.

**(2) Join at the CLAIMED UNIT.** One pure function, no schema, no wire field, no new event. Taken —
see the soundness argument in the Decision, which is the part that makes this more than a hunch.

**(3) Drop the fold.** Reverses a decided design — the red→green band is ADR-0212's whole reason for
merging the layers — to fix a defect that has a cheaper honest repair. Rejected.

## Decision

**The join key is the CLAIMED UNIT.** A live build's phase rides a work-claim body if and only if the
build's `unitId` equals that claim's `unitId`. Builds and claims still arrive grouped by story (the
territory is drawn per story), but the fold matches WITHIN that group at unit grain and never across
it.

Concretely, in `foldBuildOntoClaims`:

- each work-grade claim resolves its own band from the builds on ITS unit, so several members of one
  story each carry their own build's phase, and `resolveBuildPhase`'s RED-WINS rule (ADR-0212) now
  applies per unit rather than smearing one story-wide band across unrelated sessions;
- `exploring` / `waiting` grades still never carry a band — unchanged;
- a build whose unit carries no work claim is an ORPHAN and gets ADR-0212's own claim-less
  manufactured body. This is the clause that changes most: previously a manufactured body appeared
  only when the story had NO work claim at all, so an unclaimed member build was silently absorbed
  into a stranger's wisp. Now it renders as itself.

**WHY THIS IS SOUND, and it is the mutex finally doing real work.** At unit grain the mutex is exactly
the guarantee the fold needs, because a build that can appear in this layer has necessarily taken the
claim on the unit it is building:

- `nodeBuild` claims `spec.id` (ADR-0121); the chain claims every node in its drive order
  (`packages/drive/src/chain-claims.ts`, ADR-0270 D3).
- The claim store and the work-event store are THE SAME POOL — the per-unit claim store defaults to
  the `--store pg` pool's claim store, and is null for an in-memory store. A build is visible to this
  layer only if its `building` row reached `events.work_event` in Postgres, which is the same
  condition under which it holds a claim store and takes the claim.

So a `building` row on unit U implies its session took U's work claim, and the per-unit-id mutex then
makes "a live build on U + a work claim on U" exactly one actor. That is the inference ADR-0212
reached for, asserted at the one grain where it is true.

## Consequences

- **The pre-#1220 case is repaired too, not just the one that exposed this.** A `node build cap-of-S
  --real` running beside a story-grain declaration no longer paints that declaration's wisp.
- **Concurrent disjoint-member sessions now render honestly.** Two sessions on two capabilities of one
  story each see their own band, where the fold previously handed one session's band to whichever
  claim sorted first.
- **More claim-less bodies than before, on purpose.** An unclaimed build under a claimed story used to
  vanish into someone else's body; it now draws its own. Wisp count still encodes actors — the extra
  body IS an extra actor, which is ADR-0212's stated fallback rather than an exception to it.
- **RESIDUAL, named rather than papered over: a TTL-window race survives.** A build row stays "in
  flight" for `BUILD_IN_FLIGHT_TTL_MS` after its last event, but the build releases its claim when it
  ends. If a different session claims that unit inside that window, the finished build's stale row can
  still paint the new claim. This is strictly narrower than the structural defect being fixed (a
  seconds-to-minutes race on one unit, versus every build under a story mis-joining every claim under
  it), and closing it is exactly what remedy (1) — the session stamp — is for. It is not worth a
  durable schema change until observed.
- **Not fixed here, and NOT this ADR's ground: one session can now draw N claim bodies on one story.**
  Since PR #1220 a chain takes a claim per member, and the surface renders one body per claim row —
  so a single `story build S --real` produces N rows under S, which is in tension with ADR-0212's
  "wisp count encodes SESSIONS". They currently stack invisibly (the work-grade orbit rotation is
  `hash(key)` and `key` is the sessionId, so same-session bodies land at an identical orbit phase),
  which is why nobody has seen it. That is a wisp-COUNT question, not a build→claim JOIN question, and
  folding it in here would settle two decisions in one landing. Recorded so the next reader inherits
  it.
- **`packages/forest-world/src/scene.ts`'s `claims[].phase` contract note is corrected in the same
  landing** (ADR-0139: a code comment asserting something false is the same defect as ADR prose
  asserting it). It now states the OBLIGATION the core needs from a surface — supply the phase of a
  build joined at the claimed unit — instead of restating a soundness argument about surface code the
  core cannot see. Carrying that argument in the core is how it went stale unnoticed in the first
  place, so the correction is structural, not just factual.
- **The scene.ts edit drags the ADR-0093 cross-repo publish** (`pnpm sync:web-engine` → a PR on
  `storytree-web` → the submodule pin bump), because `check:web-engine` compares the synced copy
  byte-for-byte and does not exempt comments. Paid deliberately: a false contract note in the shared
  render core is read by both surfaces.

## References

- [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md) — the fold this
  amends, and its 2026-08-08 correction note that opened both questions settled here.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) D2 — the
  per-unit-id work-claim mutex.
- [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) D1/D3 —
  capability-grain claims, which is what makes several work claims per story legitimate.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) — the per-unit
  build write-claim the soundness argument rests on.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — correct in
  place vs. supersede-and-replace; why the scene.ts note is in scope.
- `apps/studio/src/components/TreeView.tsx` — `foldBuildOntoClaims`, `buildsByStory`, `claimsByStory`.
- `packages/drive/src/chain-claims.ts` — the chain's per-member take (PR #1220), and its own note that
  the ledger resolves containment in neither direction.
- `packages/forest-world/src/scene.ts` — the `claims[].phase` contract note corrected here.
