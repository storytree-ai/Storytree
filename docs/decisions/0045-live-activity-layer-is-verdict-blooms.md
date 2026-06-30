---
status: accepted
decided: 2026-06-14
amends: [40, 41, 33]
---

# ADR-0045: The hosted live-activity layer is signed-verdict blooms; presence stays for multi-dev

## Status

accepted (2026-06-14) — a display-level addition to the story world's live layer, decided by the
owner 2026-06-14 in conversation and recorded the same day. **Amends
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)** (it builds directly on
verdict-derived green: the bloom announces the very transition the hue durably records),
**amends [ADR-0041](0041-possibly-dead-wisps-park-in-the-dock.md) / applies
[ADR-0033](0033-session-presence-notice-board.md)** (it sits the new bloom layer *beside* the
session-presence wisps without changing them — this ADR does not demote presence, though ADR-0048
later moved its orbiting-wisp role to the harness; see the Correction below). It reuses the visual
vocabulary of [ADR-0036](0036-story-world-studio-visualisation.md) /
[ADR-0038](0038-story-world-vocabulary-recalibration.md) (the hex world, the hue ladder) and the
transient-flash idiom already in `apps/studio/src/index.css` (`hlflash` / `cflash`).

**Correction ([ADR-0048](0048-in-flight-build-is-the-primary-wisp.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** §6's "presence is
NOT demoted" is reversed — session presence loses its **orbiting-wisp role** to the harness-driven
in-flight build (the presence model, dock, and `noticeboard declare` stay; only the orbiting role
moves). And the named-deferred "in-flight 'building' shimmer" is now **in scope** as ADR-0048's
centrepiece. The verdict-bloom CORE this ADR decides (Decisions 1–5) STANDS untouched.

*Numbering note:* checked all remote branches post-`git fetch` for `docs/decisions/0045*` on
2026-06-13/14 — 0043 and 0044 are taken on `main`; 0045 is free (live DB carries no ADR rows of its
own — ADRs are docs, ADR-0017/0018).

## Date

2026-06-14

## Context

The studio story world (`#/tree`, ADR-0036) renders the work hierarchy as a Dorfromantik-style hex
map. Two of its layers were already live before this decision: the durable **status/proof** layer
(plant hue = the signed verdict, ADR-0040) and the **presence** layer (session wisps + dock,
ADR-0033/0041). What it lacked was a sense of *recent motion* — "real work just landed here" — that
a watcher could read at a glance without opening a panel.

The obvious candidate signal was "files changed by a merge", and it is the wrong one. **A verified
finding shaped this decision: merge-changed files do NOT map to story territories.** Almost every
merge touches `apps/`, `packages/`, or `docs/` and hardly ever `stories/<id>/` — the *code* a story
describes lives outside the spec tree, so a merge's file set rarely names the territory the work
belongs to. Mapping merges onto the world would mean inventing a fragile path→story heuristic and
would still miss most landings.

The signal that *is* per-unit, immutable, and territory-anchored is the **signed verdict**. A
verdict's `unit_id` is exactly a story or capability id (`events.verdict`, ADR-0020/0031), and
`verdict.at` — the moment it was signed — is **already on the wire**: `latestVerdicts()`
(`apps/studio/server/libraryBackend.ts`) selects it and the `/api/tree` router attaches it as
`story.verdict` / `cap.verdict` (`apps/studio/server/apiRouter.ts`); `TreeView` already renders
verdict facts (the crown hue, the signpost, `VerdictLine`). So an activity layer keyed on
`verdict.at` is a **pure client-side decoration off data the world already holds** — zero new query,
endpoint, or infra.

## Decision

1. **The live-activity layer is a "recently-landed" bloom keyed on `verdict.at`.** A pure helper
   `verdictBloom(verdict, now) → { outcome, ageRatio } | null` (`apps/studio/src/lib/activity.ts`,
   sibling to `provenStatus` in `worldStatus.ts`) returns a bloom when a unit's verdict landed
   inside `BLOOM_WINDOW_HOURS` (default **6 h**, owner-tunable), else `null`. `ageRatio =
   clamp(0, 1 − ageHours/windowHours, 1)` drives the bloom's opacity, so it dims as the event ages
   and the layer unmounts entirely at the window edge.

2. **The bloom renders as a finite, low-amplitude decaying pulse in the verdict's hue** — a soft
   halo ring plus a few sparkles, on the story **crown** (`StoryTree`) and a smaller one at each
   capability **plant base** (`GardenPlant`). Geometry is **seeded by `hash(unitId)`** so it never
   jitters between re-renders (the same purity rule the wisp orbit phase obeys). A new
   `@keyframes bloom-pulse` (kin to `hlflash`/`cflash`) drives a gentle scale/opacity breath;
   `prefers-reduced-motion` collapses it to a **static faint ring**. Aging is driven by the
   existing `now` ticker that `usePresence` already publishes (it re-renders the world between
   polls) — **no new interval, and `/api/tree` is never polled** (it re-walks `stories/` per hit).
   A brand-new verdict therefore blooms on the *next* one-shot tree load — acceptable for "landed
   over the last N hours"; a cheap verdict-only poll endpoint is named-deferred below.

3. **Activity is a TRANSIENT announcement of the transition the hue durably records — never
   persistent.** This is the load-bearing principle. The plant hue is the steady-state record
   (ADR-0040: a signed pass greens the unit). The bloom announces the *moment that pass landed* and
   then decays to nothing. A persistent activity dot would re-encode the bit the hue already
   carries — the exact **same-bit-twice** redundancy ADR-0040 invoked to *delete* the UAT ✓/✗
   badges. So the layer is transient-only by construction: once aged out, the territory is back to
   carrying its result in colour alone.

4. **v1 blooms PASSES only (green).** A signed **fail** already withers the plant (ADR-0040); a red
   "fail bloom" is a distinct announcement with its own honesty questions and is a **named owner
   call**, deliberately left out of v1. A bloom also never appears on a withered unit (the rare
   authored-unhealthy-over-a-signed-pass disagreement renders the *result*, not a green
   announcement).

5. **The legend gains an `activity` model row** (`WorldLegend.tsx`), visible **iff** some unit's
   verdict is within the window (`anyRecentLanding`, read off the same `verdict.at` the proof facts
   already use), reusing the existing rule that a model row drops when it has no instance. Its
   caption states the honesty contract verbatim: *activity marks real signed-verdict events
   landing, not who is online; it fades as the event ages — the durable result is the plant colour
   (ADR-0040).*

6. **Presence is NOT demoted (owner call 2026-06-14).** *(Reversed by
   [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) per
   [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): session presence
   loses its orbiting-wisp role to the harness-driven in-flight build; the presence model and dock
   stay.)* The session-presence wisps and dock
   (ADR-0033/0041) stay a **first-class** hosted layer — they serve multi-dev awareness on the
   shared studio page, which the bloom (a record of *past* landings) does not replace. The bloom is
   *added beside* presence, not in place of it. Presence's **reliability** is improved on a
   **separate** track (a merge-retire backstop so finished sessions stop appearing, and heartbeat
   hardening) — a sibling work item, not part of this layer.

## What this explicitly does NOT do

- **No `merged` lifecycle word.** We do not add a `merged` (or any new) `WorkEventDoc` lifecycle
  value. The `.strict()` enum in `packages/core/src/rollup.ts` and the pinned rollup/id-list tests
  stay as they are, and green stays **verdict-only** — a merge word would compete with that and
  re-introduce a non-verdict "healthy" signal ADR-0040 closed off.
- **No new query/endpoint/infra.** The layer is pure client-side decoration off `verdict.at`, which
  is already attached to `/api/tree`.

## Named-deferred (future owner calls)

- **Fail-verdict red blooms** — announce a landing that *failed*, distinct from the durable
  withering. Held for §4's reasons.
- **Near-real-time landings** — a cheap verdict-only poll endpoint so a fresh verdict blooms within
  seconds instead of on the next tree load. Deliberately not built: `/api/tree` must stay one-shot.
- **In-flight "building" shimmer** — a pre-verdict pulse while a unit is actively being built.
  Would lean on live presence/work-event state rather than a signed fact; out of scope here.
  *(Now IN scope — built as the primary wisp, sourced from the harness `building` work-event, per
  [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) (ADR-0139).)*

## Consequences

- A watcher can see, at a glance and with zero new backend cost, *where signed work landed in the
  last few hours* — and that signal cleanly fades, so the world never accumulates stale "activity".
- The honesty contract is explicit in the legend: the bloom is **not** presence and **not** a
  second copy of the hue; it is the transient announcement of the hue's most recent change.
- The hosted Cloud Run image (`storytree-studio`, ADR-0042) is a frozen build — it shows blooms
  only after the studio image is **rebuilt + redeployed** (`infra/studio-cloudbuild.yaml`). Landing
  this PR updates `main`; the redeploy is the step that makes it live for the trusted circle.
- `pnpm gate` covers the seam: `activity.test.ts` pins the window edges, pass-only scope, ageRatio
  ramp, and `anyRecentLanding`; `WorldLegend.test.tsx` pins the activity-row visibility and its
  honesty caption.
