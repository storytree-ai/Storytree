---
status: accepted
decided: 2026-07-19
---
# ADR-0216: Act 1 experience: attested overwhelm → finale → transform (frozen)

## Status

accepted (2026-07-19) — decided/directed by the owner in conversation on 2026-07-19, where the
owner approved consolidating Act 1's attested as-built into one readable authority and directed
allocate-and-write for this chip (after ADR-0213 / ADR-0215). Design-time alignment IS the
ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second
end-of-flow ask.

**Supersedes** none. Act 1 lived inside superseded
[ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md); this ADR is born as
the **sole current authority for the Act 1 visitor experience** (overwhelm → finale → transform).
It does **not** supersede the website-story frame
([ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md)) or Act 2
([ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md)) — cite those, do not
restate.

## Context

Act 1's choreography was decided and attested inside the old two-act pitch ADR (0134 §1–§2), then
refined once at the finale gate (diegetic root-agent terminal + ghost exit). The built experience is
live and owner-attested; the authority that described it was then superseded for *site frame* by
ADR-0215, leaving Act 1 without a sole current decision document. Sessions were reconstructing Act
1 from a superseded body and as-built cap prose — the same unreadable-stack failure ADR-0213 /
ADR-0215 closed for their slices. That fails the spirit of
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).

This ADR is copy-on-write consolidation
([ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md)): one current-state
decision, no archaeology in the body. Unlike Act 2, Act 1 is **frozen** — the attested LOOK is
closed authority; further redesign needs a new ADR (§Open iteration is empty on purpose).

**Sibling authorities (cite, do not restate):** site frame →
[ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md); post-transform Act
2 walk → [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md). Build records
stay on [`act1-terminal-storm`](../../stories/website-experience/act1-terminal-storm.md) and
[`storm-to-forest-inflection`](../../stories/website-experience/storm-to-forest-inflection.md).

## Decision

**Act 1 is the attested overwhelm → finale → transform arc.** Seven points:

### D1 — Freeze

The attested as-built Act 1 is **closed LOOK authority**. Further redesign of overwhelm, finale, or
transform needs a **new ADR** — do not amend this body in place for taste changes.

### D2 — Overwhelm

One visitor prompt (**"build me a shopping website"** — same prompt Act 2 reuses). Diegetic spawn
(agents spawn agents that *become* terminals — never visitor-opened windows). Peak ≈ **10–12**
windows. Every terminal parks on an **unanswerable demand**. Arcade HUD (`AGENTS: n ▲`). Tech:
plain **DOM/CSS** + canvas grain + **Web Audio** (gesture-unlocked on send). **No WebGL** in Act 1.

### D3 — Finale

At peak, a **diegetic finale terminal** (the root agent) powers on, concedes the swarm isn't
working, and offers a fork: the **transform** option plus an **external ghost exit** for anyone who
genuinely prefers the terminal wall.

### D4 — Transform

One click: silence → collapse into **soil** → Act 2 land. Lazy-load the next-act bundle **at the
click** (no prefetch during Act 1). Handoff into
[ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md) — do not restate Act 2
here.

### D5 — No "storm" metaphor on visitor-facing surfaces

Visitor-facing copy uses plain **overwhelm / swarm** language. Historical / machine cap ids
(`act1-terminal-storm`, `storm-to-forest-inflection`, internal titles) may keep "storm" — they are
handles, not surfaces.

### D6 — A11y floor

Cite [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md) (skip / Escape /
reduced-motion / no-JS fallback). Do not re-litigate the site-frame a11y policy here.

### D7 — Proof

LOOK stays [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
operator-attested — appearance and feel never self-signed. Machine floor is the
`experience-rollout-guardrails` markers (`check:web-experience`).

## Open iteration

**Frozen.** No open LOOK collaboration surface on this ADR. Reopen only via a new ADR that
supersedes or amends this one.

## Consequences

**Good.**

- One document is the Act 1 current state — sessions stop reading Act 1 out of superseded 0134.
- The freeze is explicit: Act 1 is not Act 2's open-iteration queue.
- Site frame (0215) and Act 2 (0213) stay separate authorities — this ADR does not become a god-doc.

**Costs / risks.**

- **Freeze means a redesign is a new decision.** Taste changes that break D1–D7 need allocate-and-
  write, not quiet cap edits.
- **Caps may still carry historical "storm" prose** in as-built records (true history, copy-on-
  write). Citation cleanup to 0216 is curation debt, not a re-decision.

## Out of scope

- Two-act pitch, experience-is-the-site, diorama/boundary, a11y-only escapes, replay-only →
  [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md).
- Act 2 walk phases, diagram, BaaS diamond, chips, studio zoom-out, Act 2 LOOK iteration →
  [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md) (§Open iteration).
- R3F / shared render core / sync / grounding → ADR-0123 / 0093 / 0056 / 0066 (cite).
- Cap as-built file:line records → the LEAF caps (build history, not decision authority).

## References

- Sibling frame: [0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md).
- Sibling Act 2 / post-transform handoff:
  [0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md).
- Historical home (superseded; Act 1 lived here):
  [0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md).
- Cited: [0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md),
  [0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md),
  [0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md),
  [0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md),
  [0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
- Caps: [`act1-terminal-storm`](../../stories/website-experience/act1-terminal-storm.md),
  [`storm-to-forest-inflection`](../../stories/website-experience/storm-to-forest-inflection.md),
  [`experience-rollout-guardrails`](../../stories/website-experience/experience-rollout-guardrails.md),
  [`website-experience`](../../stories/website-experience/story.md).
