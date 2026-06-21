---
status: accepted
decided: 2026-06-21
amends: [37]
---
# ADR-0084: Agents may flip an ADR green

## Status

accepted (2026-06-21) — decided in conversation by the owner, who authorised agents to perform the
`proposed → accepted` ("green") status flip rather than reserving it as a human-only hand-edit. Recorded
under — and itself flipped to `accepted` by — the very policy it establishes. It **amends
[ADR-0037](0037-decision-binding-and-hygiene-gates.md)** (the human-only frontmatter-status convention)
and **refines the application** of [ADR-0006](0006-event-store-observability-surface.md) /
[ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) (status is a projection of evidence) — the
projection principle stands; what changes is WHO may transcribe an evidence-backed flip. It overturns
no honesty wall (`green = a signed verdict`, [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md),
is untouched).

## Context

[ADR-0037](0037-decision-binding-and-hygiene-gates.md) made ADR status structured frontmatter, with a
standing convention — stated in the frontmatter parser
([adr-frontmatter.ts](../../packages/cli/src/adr-frontmatter.ts)), the ADR-health checks
([adr-health.ts](../../packages/cli/src/adr-health.ts)), and `CLAUDE.md` — that **status is
HUMAN-flipped: no machine writes it.** The basis was ADR-0006/0031: status is a *projection of
evidence*, never an invented write, and the human was the one who transcribed the `## Status` prose into
the frontmatter `status:` field.

In practice this made every accepted-flip a manual round-trip to the owner, even when the decision was
already made and the evidence already on disk. It also left the **`green-flip`** ADR-health check (a
`healthy` story whose deciding ADR is still `proposed`) as a gate an agent could DETECT but not RESOLVE —
forcing "ask the human to flip" as the only exit, the exact friction that stranded ADR-0083's Fork A at
`proposed` after the work landed.

The owner judged the guardrail too heavy relative to its risk: a wrongly-flipped ADR is **catchable**.
The studio renders each ADR's `## Status` prose; the world renders the downstream green effect (a story
the ADR greens lights up); and the `green-flip` gate already fails CI on the most consequential drift.
Observability is the backstop, so the cost of the manual round-trip is not worth paying.

## Decision

**1. An agent may flip an ADR `proposed → accepted` (the "green" flip).** When the decision is made and
the `## Status` prose supports it, a session may transcribe the flip into the frontmatter `status:`
field (and set `decided:`) — exactly the transcription the human used to perform. This does NOT overturn
ADR-0006/0031: status remains a projection of the evidence/prose, never an invented write; what changes
is that the **agent**, not only the human, may perform that transcription.

**2. Scope: the green flip only.** This authorises `proposed → accepted`. It does NOT authorise an agent
to flip an ADR to `superseded` (that retires a standing decision and rewires the supersession graph — a
human call, or a future ADR), nor to flip `accepted → proposed` (un-deciding). The
`supersede-consistency`, `adr-edge-integrity`, `adr-number-unique`, and `adr-frontmatter` gates continue
to bind regardless of who performs an edit.

**3. The catch is observability, not a pre-flip gate.** A wrong flip is caught after the fact, not
prevented before it:
- the studio docs viewer renders each ADR's `## Status` prose, so the owner can read what was decided;
- the story world renders the downstream effect — a story the ADR greens lights up;
- the `green-flip` ADR-health check (ADR-0037 §3) fails CI if a `healthy` story rests on a still-
  `proposed` deciding ADR — now **self-resolvable** by the same session, instead of an escalation.

A flip the owner disagrees with is reverted like any other edit (a one-line frontmatter change on a
reviewed PR). The owner keeps the final say by reviewing the PR before it merges.

**4. The honesty walls are untouched.** This is governance over a DOCUMENTATION projection, not over a
proof. `green = a signed verdict` (ADR-0020) is unaffected — an ADR status is not a gate verdict, and no
proof, attestation, or trunk-merge rule is loosened. The product story-trunk stays approval-gated
([ADR-0008](0008-ui-drives-agents-approvals.md) / `approval-gated-trunk`); `agent-never-self-exempts`
(never bypass the prove-it-gate) and `human-owns-the-outer-loop` (the human owns sequencing and
escalation) stand — this narrows neither.

## Consequences

**Good.**
- A decision reaches `accepted` in the same session that lands it — no manual round-trip for a flip the
  owner already authorised; the `green-flip` gate becomes self-healing rather than an escalation.
- The convention is now consistent across its three encodings (`CLAUDE.md`, `adr-frontmatter.ts`,
  `adr-health.ts`), all updated alongside this ADR, so the next session reads one rule, not a
  contradiction.

**Bad / costs / follow-on (surfaced, not buried).**
- A mistaken or premature flip can now happen without a human in the loop. Mitigated by the catch
  (decision 3): visible in the studio, the world, and the gate, and trivially reverted on the PR. The
  residual risk is an accepted-status that briefly overstates consensus until the owner reviews — judged
  acceptable for a solo-owner repo.
- The studio surfaces the `## Status` PROSE but not yet a structured at-a-glance status **chip** (the
  docs viewer strips frontmatter — [apiRouter.ts](../../apps/studio/server/apiRouter.ts) `stripFrontmatter`).
  A status chip on the docs / Library cards would make the catch at-a-glance — a named follow-on (a
  studio visual unit, operator-attested), NOT built here.
- This is the meta-layer (the dev repo's ADRs). It says nothing about the product story-trunk, which
  stays approval-gated.

## References

- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — structured ADR frontmatter + the ADR-health checks (amended: the green flip is no longer human-only).
- [ADR-0006](0006-event-store-observability-surface.md) / [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — status is a projection of evidence (refined: the agent may transcribe the flip).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed verdict` (unaffected — this is documentation governance).
- [ADR-0008](0008-ui-drives-agents-approvals.md) — the product trunk stays approval-gated (unaffected).
- [ADR-0050](0050-adr-number-allocation.md) — atomic ADR-number allocation (the flip joins the allocate-then-author flow).
- [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — the first flip applied under this policy.
- `packages/cli/src/adr-frontmatter.ts`, `packages/cli/src/adr-health.ts` — the convention encodings updated here.
