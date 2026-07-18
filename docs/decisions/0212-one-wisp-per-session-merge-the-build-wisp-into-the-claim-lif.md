---
status: accepted
decided: 2026-07-18
amends: [48, 138, 200]
---
# ADR-0212: One wisp per session: merge the build wisp into the claim lifecycle

## Status

accepted (2026-07-18) — decided/directed by the owner in conversation on 2026-07-18. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0048, ADR-0138, ADR-0200 — it retires ADR-0048's build wisp as a SEPARATE drawable and folds its red→green band into ADR-0138 §5's claim wisp; it keeps ADR-0138 §5's honesty wall intact while collapsing the two-layer split that §5 assumed; and it reverses one ADR-0200 D7 detail (the `exploring` family's stationary-by-construction rule). None of the three is overturned as a whole.

## Context

The forest map draws two independent ORBITING layers on the same story territory:

- the **build wisp** (ADR-0048), keyed by `runId` — "a leaf agent is mechanically building this now"
- the **claim wisp** (ADR-0138 §5), keyed by `sessionId` — "a session holds the work claim on this story"

They are the same drawable. Identical circle radii (12 / 6.5 / 2.8), orbit radii 12px apart
(`radius * 0.72 + 10` vs `+ 22`), and the build wisp's scene-node fields are a strict SUPERSET of the
claim wisp's (`title, phase, phaseBand, colourState?` vs `title, phase, colourState`). `scene.ts`
pushes both layers unconditionally, commenting *"Layered after the build wisps so when both run the
claim reads outside."*

So a single session that both HOLDS a story and is BUILDING it renders **two orbiting bodies**, which
reads as two sessions. The owner observed exactly this on `studio-members` (2026-07-18) and correctly
challenged it: the work claim is an exclusive mutex (ADR-0200 D2), so two sessions working one story
is precisely the thing that cannot happen. The map was showing an impossible state.

(A live ledger read during that session found NO claim on `studio-members`, so the observed pair was
most likely two build wisps — two concurrent `runId`s — rather than two claims. The mutex held. That
incident is not fully explained, and this decision does not rest on it: the redundancy is proven by
the code above regardless of what the screenshot captured.)

The deeper fault: **nothing ever decided what wisp COUNT means.** Each layer counts a different noun —
build wisps count runs, claim wisps count sessions, departing wisps count released claims — so "how
many wisps are on this story" answers no single question.

## Decision

**Wisp count encodes SESSIONS.** One session working a story renders exactly ONE wisp, which moves
through a four-stage lifecycle. Two wisps means two sessions — reserved for the multi-session future,
and meaningless today.

Three orthogonal channels:

1. **POSITION = stage**
   - *window shopping* (`exploring`) — a small local orbit BESIDE the island
   - *waiting in line* (`waiting`) — a queued line, stationary, ordered by `claimedAt`
   - *work* (`work`) — orbits the WHOLE island; the only island orbit
   - *finish* — drifts upward and fades (the departing drawable)
2. **COLOUR = intent** — authoring amber, proving teal, supplementing violet. Never green.
3. **MOTION (speed / pulse) = build phase**, within the work stage only — red steady, green pulsing.

The **build-wisp layer is DELETED**. Its only signal not already carried by the claim wisp — the
red→green `phaseBand` — folds into channel 3 on the work stage.

**The join key is the STORY, not the session.** `BuildActivity` is deliberately keyed by `runId` and
carries NO session identity ("its own identity (never a session's)"), so builds cannot be joined to
sessions directly without stamping a session id onto `events.work_event` and the server fold. That
backend change is NOT required: because the work claim is an exclusive mutex (ADR-0200 D2), a story
that has a work claim AND a live build has exactly one possible actor — they are the same session by
construction. The surface therefore folds a story's live build phase onto that story's work-claim
body. The mutex is what makes this sound; if the mutex is ever relaxed to allow multiple work claims
per story, this join must be revisited FIRST.

A build on a story with NO work claim (unattended, CI, or the marketing website's demo data) still
renders its own claim-less body — that is the fallback, and it is also what keeps the website working
without a claim concept.

The verdict bloom (ADR-0045) is UNCHANGED and remains the landing signal: a wisp that fades has walked
away; a bloom means a signed verdict landed. A fade is never a proof.

The **marketing website**, which has no real sessions, feeds this same lifecycle with MANUFACTURED
demo claims rather than carrying a build layer of its own. It therefore stops being a surface with its
own drawable layer and becomes an ordinary consumer of the shared model — strictly simpler than today.

## Consequences

- **ADR-0048's build wisp retires as a separate drawable.** Precedent: ADR-0048 §5 already retired the
  session-presence orbit into the dock, so collapsing an orbiting layer is a move this world has made
  before.
- **ADR-0138 §5's two-layer split is collapsed, but its HONESTY WALL survives and is restated** under
  the merge: the colour channel is never green, and the bloom keeps its own silhouette (scale-pulse +
  spark, which no wisp has). A claimed-but-unproven story still cannot render as a proven one. This is
  the constraint most at risk from the merge and must not be relaxed.
- **ADR-0200 D7's "exploring is stationary by construction" is REVERSED on purpose.** `scene.ts`
  deliberately omits the orbit `phase` for the hover family, and the mapper animates rotation only when
  `phase` is present; window shopping now carries a small-radius `phase`. This is a decision, not a
  regression — a future reader finding a spinning hover wisp should land here.
- **Multi-run collapse.** Build wisps keyed on `runId` meant N concurrent runs drew N bodies. Merged
  onto `sessionId` they collapse to one, so the work stage needs a phase-resolution rule: **red wins**
  — a green on one run must never mask a red on another.
- **Three surfaces move, not one:** `packages/forest-world/src/scene.ts` (the shared core, which the
  website inherits), the studio mapper + `apps/studio/src/index.css`, and
  `apps/studio/src/components/WorldLegend.tsx` — where the `building` RowKey retires and folds into
  `claim`. The legend icons deliberately reuse the world's own CSS classes so they cannot drift.
- **Sequencing risk:** `packages/forest-world` was held `[work]` by another session at decision time.
  This change contends with active work there and should be sequenced against it, not run in parallel.

## Rollout

This cannot land as one green unit: the exploring small-orbit needs the studio mapper (which animates
rotation only for the `wisp`/`claim-wisp` kinds), and deleting the build layer before a surface stops
sending `wisps` would break the render. It lands additively in three increments, each green on its own:

1. **This ADR lands alone (docs-only).** The decision is recorded before any engine code moves.

2. **Core + surface flip, as ONE unit.** `claims[]` takes an optional `phase`, the WORK-grade body
   folds it to `phaseBand` on the SAME drawable, the studio joins live builds to the story's work
   claim (by STORY — see the join rule above), stops sending `wisps`, and gains the exploring
   small-orbit. Touches `scene.ts`, the mapper (`SceneView.tsx`, incl. rotation for the hover kind +
   a NESTED transform so the small orbit centres on the rest spot, NOT the centroid — an
   `animateTransform` rotate REPLACES a `transform` attribute on the same `g`), `index.css`, and
   `WorldLegend.tsx` (the `building` RowKey retires into the claim row).

   **WHY the core is not split off first:** any change under `packages/forest-world/src` puts the
   website's synced copy (`web/src/lib/forest-world/`) out of date and BLOCKS CI on
   `check:web-engine` — so it drags a full cross-repo publish (`pnpm sync:web-engine` → PR in the
   separate `storytree-web` repo → pin bump) behind it. Splitting the core out would pay that
   cross-repo cost TWICE for a first increment that is functionally inert. Note the local gate does
   NOT catch this when the `web` submodule is uninitialised in a worktree (`git submodule status`
   shows a leading `-`): `check:web-engine` passes vacuously and the drift appears only in CI.

3. **The old layer is deleted.** `buildWisps` and the `wisps` input go once no surface sends them.

## References

- ADR-0048 — the in-flight build wisp (the layer this retires); §5 retired the presence orbit.
- ADR-0138 §5 — the story-claim wisp and the honesty wall this preserves.
- ADR-0200 D2/D7 — the claim mutex and the grade→drawable families.
- ADR-0045 / ADR-0040 — the verdict bloom and the durable verdict-derived plant hue.
- `packages/forest-world/src/scene.ts` — `buildWisps` / `buildClaimWisps`, the two layers merged here.
- `apps/studio/src/index.css` — the `world-wisp` / `world-claim-wisp` / `world-hover-wisp` families.
- `apps/studio/src/components/WorldLegend.tsx` — the teaching surface for this vocabulary.
