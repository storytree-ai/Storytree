---
status: accepted
decided: 2026-07-04
amends: [34]
---
# ADR-0154: librarian-curator owns the process tier as a standing projection of the decision log, and the CLI surface is coverage-gated to it

## Status

accepted (2026-07-04) — decided/directed by the owner in conversation on 2026-07-04. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0034 — its §2 decision (process artifacts are *downstream, derived* views of the deciding ADRs, reference-don't-restate, the cited ADR wins) stands unchanged. What this narrows is §3's *staffing*: 0034 authored the first instances via a one-time fan-out workflow and assigned **no standing owner**, so the derivation never recurred. This ADR makes the derivation a standing librarian-curator charter and adds a mechanical coverage gate. It does not overturn any 0034 decision.

## Context

The drift that surfaced this: `apps/desktop` (ADR-0109/0111) has no launcher anywhere an agent looks — no `storytree` command, no root `pnpm` script (unlike the studio's `studio:up`/`--filter studio dev`), no line in `CLAUDE.md` — discoverable only via the app-scoped `pnpm --filter desktop start`. The missing launcher is a symptom; the question is why the CLI surface drifts from what the system actually does.

Tracing it to root:

- **ADR-0034 §2 already decided the correct model:** process artifacts are downstream, derived — *synthesized from the deciding ADRs and guardrails*, citing them, reference-don't-restate. A `process` carries the operational shape (when → what, in what order, on which surfaces); the cited decision carries the why.
- **But §3 staffed it as a one-time job.** The first instances were "authored via a fan-out + adversarial-verify agent workflow" — a single manual pass, no recurring role. So the tier **froze**: 6 process artifacts today (all agent ceremonies — merge, library-edit, prove-and-promote, attest, stage-attestation — plus desktop-e2e-conventions) against a decision log past 150 ADRs. Ways-of-working that landed since (ADR-0042 hosted studio, ADR-0063 db-control, ADR-0109/0111 desktop, ADR-0114 db window, ADR-0100 consuming surfaces) never became processes.
- **The only wired inbound path to a `process` is trace-history, not the log.** librarian-curator authors a process only reactively, as a graduation output from agent-memory (ADR-0095). Nothing reads the *decision log forward* into the process tier — exactly the gap the owner named.
- **No one owns the CLI surface as a projection.** Command structure is decided ad hoc, one ADR per area (ADR-0116 for `adopt`, ADR-0118 for the workflow reshape), by whoever builds that area. There is no process tier for it to project from and no standing check that every way-of-working has a surface, or every surface a way-of-working. ADR-0053 already made the CLI's guidance *prose* library-derived; its *structure* was never given the same discipline.

"Which commands do we need?" is a judgement and cannot be gated. But "does every process name a real entrypoint, and does every entrypoint belong to a process?" is an objective bijection — the same shape as the existing `check:coverage` (contracts↔tests) and `check:agents-sync` gates.

## Decision

1. **librarian-curator gains a standing, proactive charter: keep the `process` tier a current projection of the load-bearing decision log.** Its existing pre-merge curation pass (ADR-0095 D7 — it already runs before every merge ceremony) extends to: *any load-bearing ADR that changes a way-of-working must have a current `process` artifact deriving from it.* The derivation rule is ADR-0034 §2 unchanged (reference-don't-restate; the cited ADR wins; a process makes no new policy). This **complements** the reactive graduation-from-memory path (ADR-0095) — it does not replace it. Ownership stays with librarian-curator because this is a decision-log→library projection, the same family as its existing charter of keeping every accepted ADR true-in-full (ADR-0139).

2. **The CLI/pnpm surface is a declared projection of the process tier, gated on coverage — never on necessity.** Every `process` names its enacting entrypoint(s) in `surfaces` (a `storytree` command or a root `pnpm` script). A new advisory gate `check:surface-coverage` asserts (a) each surface a process names resolves to a real entrypoint, and (b) flags any operator-facing entrypoint with **no** process behind it (an orphan). It **WARNs, never blocks**, and runs local + CI — the established pattern of `check:coverage` / `check:agents-sync` / `check:corpus-sync`. The gate encodes the bijection; it never judges whether a command *should* exist.

3. **First cut (this arc) = charter + gate + backfill.** (1) the standing charter, (2) the coverage gate, and (3) a backfill of the missing *operational* processes derived from their ADRs — at least launch-studio, launch-desktop, db-control, and website-release (ADR-0042/0109/0111/0063/0114/0100). Deriving `launch-desktop` from ADR-0109/0111 forces the missing `desktop:*` entrypoint to exist; the gate then keeps it honest permanently. The originating drift self-heals as a side effect of the loop working.

## Consequences

- The process tier stops being a frozen snapshot of six ceremonies and becomes a living map an agent (and the CLI) can rely on. New way-of-working ADRs now carry a derivation obligation the librarian pass enforces.
- "Is this CLI command needed?" is answered structurally, not by taste: a surface with no process is a flagged orphan (either graduate a process for it or retire it); a process with no surface is a flagged gap (either build the surface or record why none exists).
- Cost: a standing obligation on the librarian pass (more to check before each merge) and a new gate to maintain. Mitigated by keeping the gate advisory (WARN) so it never strands a PR, matching its sibling sync checks.
- **Deferred to a follow-on (captured, not decided here):** giving `process` artifacts branch-edges and deriving the CLI's choose-your-own-adventure `next:` graph from the process graph — the context-optimised surface where an agent standing at a process node sees only that node's surfaces and its outbound branches (extending ADR-0023 / ADR-0053). This is the payoff capability once the tier is populated and current; folding it into this ADR would couple a governance fix to a CLI restructure. Owner-directed deferral, 2026-07-04.
- **Not decided:** any change to who authors the work hierarchy (story-author) or the behavioural floor (guidance-curator); making `check:surface-coverage` blocking (it starts advisory, like its siblings); the exact `surfaces` field grammar for entrypoint references (a build-time detail for the gate unit).

## References

- ADR-0034 (process artifacts as derived ways-of-working — the §2 decision this stands on and the §3 staffing this amends).
- ADR-0023 (the exploratory just-in-time CLI — choose-your-own-adventure) · ADR-0053 (the CLI builds its guidance prose from the library — the projection precedent this extends from prose to structure).
- ADR-0095 (memory→Library graduation — the reactive process-authoring path this complements) · ADR-0139 (every accepted ADR true-in-full — the librarian charter this parallels).
- ADR-0116 / ADR-0118 (per-area command-surface decisions — the ad-hoc pattern this gives a standing owner).
- ADR-0109 / ADR-0111 (the desktop surface — the originating drift) · ADR-0042 / ADR-0063 / ADR-0114 / ADR-0100 (the operational ADRs whose processes the backfill derives).
- `check:coverage` (contracts↔tests) / `check:agents-sync` / `check:corpus-sync` — the advisory-coverage-gate pattern `check:surface-coverage` follows.
- Owner conversation, 2026-07-04.
