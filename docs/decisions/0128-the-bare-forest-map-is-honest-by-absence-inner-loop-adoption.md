---
status: accepted
decided: 2026-06-28
supersedes: [124]
amends: [48]
load_bearing: true
---
# ADR-0128: The bare forest map is honest by absence; inner-loop adoption is the gap

## Status

accepted (2026-06-28). Records the owner's decision, directed in conversation 2026-06-28
("**I actually don't want the UI to show planning**"), to **withdraw the planning-render direction of
[ADR-0124](0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md) and keep
[ADR-0048](0048-in-flight-build-is-the-primary-wisp.md)'s build-only wisp** as the forest world's only
session-activity signal. Born accepted under
[ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (design-time owner direction is
ratification). **Supersedes [ADR-0124]** (which proposed runtime-emitted planning presence) and
**amends [ADR-0048]** by resolving its §5 named-deferred "quieter planning form" as *deliberately not
built*.

## Context

[ADR-0124](0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md) (proposed) read
ADR-0048 §5's deferred "planning form" as ripe: now that the outer loop runs inside the studio
(ADR-0108/0112/0113/0119), a planning session's anchor could be machine-emitted by the `orchestrate()`
runtime and rendered as a quiet world element. Before building it, the owner asked the prior question —
*why is the map bare in the first place, given many sessions run concurrently?* A forensic triangulation
(2026-06-28) answered it from three independent, **machine-written** sources:

- **git history.** Over Jun 6–27, **301 source-changing PRs** merged to `main`; only **23 (7.6%)**
  landed via a `claude/real/*` promotion — i.e. through a signed `--real` inner-loop build. The other
  **278 landed by `pnpm gate` + merge**, bypassing the prove-it-gate entirely.
- **the `events` store.** 79 `building` events / 72 passing verdicts across ~30 runs, all reconciling to
  those ~23 driven landings. **8 of 18 active days had zero driving** — on those days the world was
  provably empty.
- **the wisp pipeline.** Only `--real` (and the transient `--emit-wisp` smoke) writes a persistent
  `building` row; `--dry-run`/`--live` are in-memory; a manual edit / plain commit / subagent write
  leaves **zero** trace in `events`. A wisp clears the instant its verdict lands (passes are fast) or
  after a 20-min TTL, so even a driven build shows for *minutes*. There is no independent log of the UI
  painting a wisp; the `building.at` timestamp is the only record.

The conclusion: **the bare map is correct.** It honestly reports "no proof is being mechanically driven
right now," which is true ~92% of the time because most work grows *outside* the inner loop. Rendering
planning would not have fixed this — a wisp is driven by a **build**, not a declared node; the ~37
concurrent sessions already appear in the studio **dock** ([ADR-0033](0033-session-presence-notice-board.md)),
they simply (correctly) do not orbit a tree they are not building. ADR-0048's "honest by absence"
property held exactly as designed.

What the bare map actually signals is a **process** fact, not a rendering gap: **the inner loop is the
exception, not the default path.** That is the real lever — tracked separately, not decided here.

## Decision

1. **Session / planning presence is NOT rendered in the forest world.** ADR-0048's demotion of session
   presence out of the orbiting role **stands and is vindicated**; the world orbits builds and blooms
   verdicts only. The studio **dock** (ADR-0033) remains the home for advisory session presence.

2. **ADR-0124 is superseded, not built.** Its premise — that the missing signal was a *render* — is
   refuted by the evidence: the signal isn't missing, the *driving* is. Runtime-emitted planning
   presence is withdrawn; its OQ1 (form) / OQ2 (anchor) questions die with it. The historical body is
   retained for the record.

3. **ADR-0048 §5's deferred "quieter planning form" is resolved as deliberately not built.** The owner
   has now made the "later owner call" ADR-0048 deferred it to: the planning claim does not get a world
   element. The dock is sufficient.

4. **The real gap — inner-loop adoption — is named and tracked, not decided here.** *Why* ~92% of source
   changes bypass `node build --real` / `story build --real`, and what would make driving the default
   path, is a separate investigation. The owner's leading hypothesis: the outer loop is not yet wired
   into the studio (ADR-0108's chat-driven orchestration is only partially built), so driving is a
   manual CLI step most sessions skip; other factors (per-build friction/cost, genuinely non-buildable
   work, "gate is good enough" for non-leaf changes) are in scope. This ADR records that the bare map is
   the honest **symptom** of that gap; it does not resolve it.

## What this explicitly does NOT do

- It does not remove or weaken the build wisp, the verdict bloom, the dock, or `noticeboard declare`.
- It does not assert the inner-loop-adoption gap is a defect to "fix" by force — the open investigation
  scopes that, and may conclude the current ratio is acceptable for non-leaf work.
- It does not touch [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md)'s
  machine-written build **claim** (a separate, accepted signal).

## Consequences

- **Good.** The decision log matches reality: a contradicted `proposed` ADR is retired, and ADR-0048's
  honest-by-absence property is reaffirmed with evidence, so "render planning" is not re-litigated.
  Future sessions calibrate to *the bare map is honest — raise driving, do not add a render.*
- **Cost / open.** The actionable question (inner-loop adoption) is deferred to a separate
  investigation, so the world stays a low-signal surface until more work is driven — honest, but quiet.
- **Numbering.** `0128` was reserved from the store allocator ([ADR-0050](0050-adr-numbers-allocated-from-the-store.md));
  `0125–0127` were taken by parallel sessions.

## References

- [ADR-0124](0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md) — superseded here;
  the planning-render direction withdrawn.
- [ADR-0048](0048-in-flight-build-is-the-primary-wisp.md) — the build-only wisp + §5's deferred planning
  form (resolved here as not-built); the "honest by absence" property this confirms.
- [ADR-0033](0033-session-presence-notice-board.md) — the dock / advisory session presence that stays.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) /
  [ADR-0112](0112-extract-the-build-orchestrate-drivers-into-packages-drive.md) /
  [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) /
  [ADR-0119](0119-thick-local-desktop-backend-a-tsx-sidecar-serving-the-studio.md) — the
  outer-loop-in-studio arc whose still-unwired state is the leading hypothesis for the adoption gap.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) — the machine-written
  build claim (a separate accepted signal, untouched).
- Forensic method: `gh pr list` branch-class + source/docs classification; the
  `events.work_event` / `events.verdict` tables (`packages/library/src/store/`); the wisp pipeline
  (`packages/drive/src/node-build.ts`, `apps/studio/server/inFlightBuilds.ts`,
  `apps/studio/src/types.ts` `BUILD_IN_FLIGHT_TTL_MS`).
