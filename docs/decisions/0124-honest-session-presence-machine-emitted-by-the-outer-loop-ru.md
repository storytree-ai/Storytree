---
status: superseded
amends: [48]
---
# ADR-0124: Honest session presence: machine-emitted by the outer-loop runtime, not self-declared

## Status

**Superseded by [ADR-0128](0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md)**
(2026-06-28) — the owner withdrew the planning-render direction after a forensic triangulation showed
the bare map is *honest by absence*: ~92% of source work lands outside the inner loop, so almost nothing
is mechanically driven to light a wisp. The planning claim does not get a world element; the studio dock
([ADR-0033](0033-session-presence-notice-board.md)) suffices, and ADR-0048's build-only wisp stands. The
original `proposed` body is retained below for the record.

proposed (historical) — direction directed by the owner in conversation on 2026-06-27 ("proceed" on the
recommendation to wire honest, runtime-emitted session presence), fulfilling the owner's long-standing
prediction recorded in [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md)'s own steer:
*"We can take a look at 'I'm planning work around this' claims showing up in a different form later."*
It stays **proposed** (not born-accepted under [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md))
because two design choices remain the **owner's / story-author's open call** — the visual **form**
(ADR-0048 §5's deferred menu) and the **anchor-derivation** for a non-building session (see Open
questions). An agent may flip it green ([ADR-0084](0084-agents-may-flip-an-adr-green.md)) once the form
is chosen and the prose supports it.

## Context

[ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) demoted *session* presence out of the
orbiting-wisp role because it was **dishonest**. Bound to sessions ([ADR-0033](0033-session-presence-notice-board.md)),
presence produced "stale false positives or **nothing at all**" (ADR-0048 §Context). The root cause is
the one the owner named: anchoring a session to a tree required the agent to remember to
`noticeboard declare --node`, and a planning session — which crosses many surfaces — routinely skipped
it, so the row landed `nodes:[]` and "anchors nowhere … shows in the dock list only, never as an
orbiting wisp" (ADR-0048 §Context, lines 49–54). The signal that replaced it — the in-flight **build**
wisp — works precisely because the **harness writes it, not the agent** (ADR-0048 §Decision 1).

ADR-0048 §5 then **named-deferred** the planning claim's return: *"A quieter ambient form for the
'planning' claim (e.g. a faint territory tint or a board-only roster) is named-deferred to a later
owner call — not built here."* That later call is now ripe, because the precondition the owner attached
to it — **the outer loop running inside the studio** — is built:

- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) stood up a
  server-side runtime (`orchestrate()`, `packages/drive`) that runs the **same** `session-orchestrator`
  loop the terminal embodies, human-supervised at accept-to-land.
  [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) extracted it into
  `@storytree/drive`; [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md)
  relocated it thick-local; the chat surface and thick-local read loop landed
  ([ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md)). **The studio now
  drives and observes the planning session** — so the session's anchor can be *computed by machinery*,
  not self-declared.

Two recently-landed moves make the honesty model decisive:

- **The honest render pipe is proven** (ADR-0048 §3 **v2**, just landed): the phase-resolved red→green
  build wisp. `phaseActivityWriter` (`packages/drive/src/phase-activity.ts`) is an advisory `onPhase`
  observer that appends phase-stamped `building` work-events; the studio reads the latest per unit
  (`apps/studio/server/inFlightBuilds.ts`) → `/api/activity` → the SVG `forest-world` scene. The
  *advisory-observer → work-event → activity-read → world* pattern is established and honest.
- **Machine-written per-session ownership signals are now an accepted, built pattern**
  ([ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md)): a spine-side,
  audited per-unit **claim** (`events.claim_event`, written by the harness around a build) that
  **explicitly supersedes [ADR-0033](0033-session-presence-notice-board.md) §4's "no claims"
  deferral**. ADR-0121 covers the **build** race; it does **not** cover the read-only
  **planning/orientation** session — which is exactly the remaining gap and the subject here.

So the honest *source* exists (the runtime), the honest *render pipe* exists (work-event → activity →
SVG scene), and the *precedent* for machine-written session signals is accepted (ADR-0121). What is
missing is the decision to emit a **planning-session** signal from the runtime and render it as ADR-0048
§5's deferred form. The studio render substrate stays SVG —
[ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) confines WebGL to the
public website — so the form lives in the existing `packages/forest-world/src/scene.ts`.

## Decision

1. **Planning-session presence is machine-emitted by the outer-loop runtime, not self-declared.** When
   the studio/desktop drives a session via `orchestrate()` ([ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md)),
   the **runtime** — not the agent — emits the session's presence/anchor, the same way the harness (not
   the agent) emits the `building` work-event. This **structurally eliminates** the "agent forgot to
   declare a node" failure ADR-0048 diagnosed: the agent is removed from the anchoring loop.

2. **The anchor is derived from what the runtime observes, never a hand-typed node list.** The runtime
   sees the session's real activity; the anchor is computed from it. The exact derivation is an **open
   question** (OQ2): candidates are (a) the stories/artifacts the orientation tools actually **read**
   during the session (the `OrientationRunner` dispatches them — observable to the runtime), and/or
   (b) a **git diff ↔ code-anchor match** (the files the session's worktree touches, resolved to the
   owning story via the existing `Anchor{file,symbol}` bindings). Both are machine-facts, not
   self-reports.

3. **It is a distinct art element from the build wisp** ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md),
   "one art element per signal"). Session presence does **not** return to the build-wisp orbiting role
   (ADR-0048's demotion stands); it gets its own **quiet form** (ADR-0048 §5), so "I'm planning around
   this" stays visibly different from "a proof is being mechanically driven here right now." The
   specific form is an **open owner call** (OQ1).

4. **It reuses the established honest pipe, not a new engine.** The signal rides the proven advisory
   pattern: a machine-written event → a backend read (a sibling of `inFlightBuilds`) → `/api/activity`
   → the SVG `forest-world` scene. **Advisory by construction** (a store hiccup never fails the session,
   mirroring `phaseActivityWriter` / `withPresence`), keyed by the run/session identity, and
   **self-cleaning** via a short TTL (kin to the build wisp's 20-min floor and the claim's reclaim
   window) — never the 4-h session staleness ADR-0048 rejected.

5. **The studio render stays SVG** ([ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)).
   The form is added to `packages/forest-world/src/scene.ts` (consumed by the studio React-SVG and
   website SVG-string mappers), not the website-only WebGL/r3f path.

## What this explicitly does NOT do

- **It does not put sessions back into the build-wisp orbit.** ADR-0048's core demotion stands; this is
  a separate, quieter element for a different claim.
- **It does not delete the notice board.** `events.session`, the dock, and `noticeboard declare` stay.
  Whether the runtime-emitted signal **replaces or complements** the self-declared board for *driven*
  sessions is OQ3; un-driven plain terminal sessions keep the self-declared (and, with OQ2(b), the
  diff-derived) path.
- **It adds no orchestrator/gate impurity.** Like `phaseActivityWriter`, the emit lives in the **drive**
  layer (the `orchestrate()` runtime), never the proof gate; failures are swallowed.
- **It does not decide the WebGL render.** ADR-0123's website-only WebGL bet is untouched.

## Open questions (owner / story-author calls — these keep it `proposed`, cf. ADR-0107)

- **OQ1 — the form** (ADR-0048 §5): faint territory tint vs board-only roster vs a distinct low-key
  marker (e.g. a dim, non-orbiting wisp). **Owner call.**
- **OQ2 — the anchor-derivation** for a non-building session: orientation-reads (2a), diff↔anchor-match
  (2b), or both. Sets the honesty granularity and how broadly a session "lights up."
- **OQ3 — replace or complement** the self-declared notice board for studio-driven sessions, and what
  remains for un-driven terminal sessions (the diff-match catch-all is the natural fallback).
- **OQ4 — placement**: a notice-board-organism presence signal (beside `PgClaimStore`/`PgPresenceStore`)
  vs a drive-layer activity writer (mirroring `phaseActivityWriter`). A **story-author** call (package
  layout is not the owner's to adjudicate).

## Consequences

**Good.**
- The honesty root-cause ADR-0048 diagnosed is **structurally eliminated** for studio-driven sessions:
  the anchor is machine-computed, the agent removed from the loop — no `nodes:[]` dead-ends, no
  remember-to-declare.
- The world regains "who's planning where" **without** reintroducing stale-false-positives-or-nothing.
- **Additive, not a new engine**: it reuses the ADR-0048 §3 / ADR-0121 pipes and honors ADR-0062
  (a distinct element) and ADR-0048's demotion (separate from the build wisp).

**Bad / costs.**
- A new advisory signal + render element to maintain (a backend read path, a scene element, a TTL).
- The anchor-derivation has accuracy edges — orientation-reads (2a) may **over-anchor** a session that
  reads broadly; bounded by the TTL and the deliberately quiet form, but real. Diff-match (2b) needs the
  worktree visible to the backend (natural thick-local, harder hosted).
- **Partial coverage until OQ2/OQ3 settle**: un-driven plain terminal sessions remain self-declared or
  diff-derived, not runtime-emitted — honest where covered, silent where not (an honest-by-absence
  consequence, like ADR-0048's).

## References

- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the build wisp + §5's named-deferred
  planning form (**this ADR fulfils it** → `amends: [48]`); §3 v2 the landed honest pipe; the owner
  steer this enacts.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) /
  [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) /
  [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) /
  [ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md) — the outer-loop
  runtime now in the studio/desktop (the deterministic observer this signal rides).
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) — the machine-written
  per-unit claim precedent (supersedes ADR-0033 §4); covers builds, not the planning session.
- [ADR-0033](0033-session-presence-notice-board.md) — the self-declared presence model this
  re-sources for driven sessions.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one art element
  per signal (the distinct quiet form).
- [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) — studio stays SVG;
  the form lives in `forest-world/scene.ts`, not WebGL.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) /
  [ADR-0084](0084-agents-may-flip-an-adr-green.md) — design-time ratification / the agent green-flip
  once the form is chosen.
- Code: `packages/drive/src/orchestrate.ts` (the chokepoint — emits nothing today);
  `packages/drive/src/phase-activity.ts` (the advisory-observer pattern to mirror);
  `apps/studio/server/inFlightBuilds.ts` (the activity-read sibling); `packages/forest-world/src/scene.ts`
  (the SVG form's home); `packages/notice-board/src/claim.ts` (the claim precedent);
  `packages/drive/src/noticeboard.ts` (the self-declared path being re-sourced).
