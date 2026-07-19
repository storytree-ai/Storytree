---
status: accepted
decided: 2026-07-18
supersedes: [145, 148, 150, 153, 157, 165]
---
# ADR-0213: Act 2 experience: one continuous orchestrator-led walk

## Status

accepted (2026-07-18) — decided/directed by the owner in conversation on 2026-07-18, where the
owner approved consolidating the Act 2 amend stack into one readable authority and directed
allocate-and-write ("go, we can iterate more after we consolidate this"). Design-time alignment IS
the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second
end-of-flow ask.

**Supersedes** [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md),
[ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md),
[ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md),
[ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md),
[ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md), and
[ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) — the Act 2
experience amend stack. Their bodies stay as history; **this ADR is the sole current authority for
the Act 2 visitor experience.** It does **not** supersede the website-story frame
([ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md) — consolidates
0134/0167/0172) or Act 1
([ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md)).

## Context

Act 2's current shape was decided correctly in pieces, then refined at successive owner gates
(2.5D substrate → website-first → continuous upstream → real UI / correct edges → BaaS / plain
language / TDD loop → growing diagram / chat chips / studio zoom-out). Each refinement was an
`amends` ADR. The result: six accepted bodies plus nested forward pointers. A session cannot
calibrate to "what Act 2 is" without reconstructing history — measured as token burn and an
unreadable strategy inventory. That fails the spirit of
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md): the accepted set
must be true in full for a reader, not only locally true per file.

This ADR is copy-on-write consolidation ([ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md)):
one current-state decision, no archaeology in the body. Expression details that still need owner
taste stay explicitly **open** (§Open iteration) so later sessions can reshape the LOOK without
another full-stack supersede — unless a change breaks a Decision point below.

**Sibling consolidations:** website-story frame is
[ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md); Act 1 is
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md) (frozen).
Parent/engine contracts stay on
[`act2-beat-director`](../../stories/website-experience/act2-beat-director.md) — cited, not
restated.

## Decision

**After Act 1's transform, the visitor stays with the session orchestrator for ONE continuous
visitor-paced walk: the system is explained on a growing diagram, then watched for real on the
island, then paid off by a zoom-out to the studio view.** Copy spine: *"everything in this UI is a
signal of what the agents are building."* Twelve points:

### D1 — Website-first, same prompt

Act 2 opens from Act 1's same request ("build me a shopping website"). The orchestrator proposes a
**mock local website first — no backend upfront** — then scaffolds complexity as the walk continues.
Meet the vibe coder where they are; never dump the full stack; never hide that the stack exists.

### D2 — One continuous walk

The upstream forest is **not** a CTA-gated second phase. It is the next beats of the same arc. Any
"what's next" affordance is a **continuation seam**, not a destination to a separate experience.

### D3 — Three phases: D → I → Z

1. **Phase D** — the system, on one growing diagram (before any island).
2. **Phase I** — watch it for real on the 2.5D island walk.
3. **Phase Z** — zoom out to the real studio view.

Model before demo; payoff in the surface the pitch is about.

### D4 — Thesis

*"Everything you'll see in this UI is a signal of what the agents are actually building. You don't
read the diffs — you read the map, until a signal says look closer."* Phase D assembles this claim;
the island and studio prove it.

### D5 — Phase D diagram (additive only)

One canvas, left-to-right, **additive only** (nothing replaced or swapped):

intent (visitor's own prompt) → decision record → library (definitions · principles · capabilities ·
contracts) → story (nameplate pre-echo of the island) → **honest TDD loop** (system is the referee —
not the AI grading its own homework) → map signal (green = signed proof).

D0 folds the outcome brief into the orchestrator chat open (our real session-orchestrator voice,
[ADR-0030](0030-all-in-on-claude-agent-sdk.md)). The loop's content and system-as-referee honesty
obligations stand; its home is inside this diagram (not a corner overlay).

### D6 — Advance, pacing, Back, leave

- Advance is **bounded reply chips in the orchestrator chat** (separate Next button stays retired).
- Visitor-paced: one tap per step; nothing auto-plays past the visitor.
- **Back** stays: pure replay, byte-identical scenes.
- A quiet persistent leave affordance stays.
- Optional quiet "why does that matter?" aside may stream without advancing.

### D7 — Island honesty and presence

- Substrate is the **real 2.5D map** (synced `buildScene` / `worldSvg`) — not an R3F Act 2 forest.
- Island beats reuse the `act2-beat-director` default script; site owns chrome/motion.
- First story lands **proposed** (pale, not green) — green only on a **signed-proof** marker
  (`abd-green-only-on-signed-proof`; [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)).
- The wisp is live-session presence; current motion is an **orbit** around the island (exact
  easing/timing open — §Open iteration).
- Anchored callouts stay as pointers (no buttons on them).

### D8 — Dependency layer is the advantage (BaaS diamond)

Positive teach (wrong-way-road antipattern is **not** the teach): the visitor SEES the layers and
builds in order.

- Edge direction: **dependent → prerequisite** (`cross-story-dependency` library principle /
  [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)).
- Taught stack is the **BaaS diamond**: `website.dependsOn=[backend, database]`,
  `backend.dependsOn=[database]`, `database.dependsOn=[]` — frontend reads the catalog directly;
  writes/checkout still go through the backend.
- Spatial preference: **frontend HIGH / foundation BELOW** (screen axis; data direction is the
  convention).

### D9 — Upstream beats and mini-map

- Keep **two** upstream beats (backend, then database / direct-read) — not merged into one.
- A persistent docked **mini-map** carries the "one diagram" promise through Phase I and Z.
- Corner drive-machinery overlays stay **retired** (loop teach lives in D5; gates/CI/CD compress to
  load-bearing chat words **"gate"** and **"signed"**).

### D10 — Phase Z and real-app UI

- After the island finale, crossfade into a **studio frame** (legend → forest → details → honest
  done).
- Substrate: site's **real map renderer** + **re-created studio chrome** from studio tokens — **not
  screenshots**; not a live studio embed across the repo boundary.
- Done state keeps the diorama boundary explicit (staged / fictional data —
  [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)).
- Real-app UI with **progressive disclosure** (hide chrome until the walk earns it).

### D11 — Plain language and copy honesty

- Plain newcomer / vibe-coder language throughout (`plain-language-first` library principle).
- No "storm" metaphor on Act 2 surfaces.
- Industry-framing honesty rules bind visitor-facing copy (from
  [`docs/research/industry-framing-2026.md`](../research/industry-framing-2026.md)): embody terms in
  the walk; never overclaim verification / "proven" / Sonar / unsourced viral stats; never imply
  proven includes secure.

### D12 — Proof and iteration boundary

- LOOK caps stay [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
  operator-attested — appearance and feel never self-signed.
- Site owns chrome/motion; the director stays renderer-agnostic scene semantics (no diagram fields
  in the engine).
- Experience chrome may iterate **without** engine re-proof when the director default script is
  untouched. Engine contract changes stay on `act2-beat-director` (and a thin engine ADR only if a
  new fork appears).

## Open iteration

These are **not frozen**. Future sessions may reshape them without superseding this ADR, unless the
change breaks a Decision point above:

| Open item | Current default | Iterate when… |
|---|---|---|
| Exact beat copy / chip wording / thesis phrasing | 0165 script table as structural baseline | Slide-like, jargon-y, or unpersuasive |
| Tap count / merges | ~15 taps; merge D0+D1 and/or Z1+Z2 → ~13 if long | Gate feels long or thin |
| Phase D diagram craft (geometry, bloom, compaction) | L→R spine; loop at D5; 6-dot mini-map | Weak teach or new clutter |
| Wisp motion / timing / reduced-motion | Orbit ~9s ellipse; pulse-only when reduced | Presence doesn't read as a live session |
| Phase Z studio chrome fidelity | Token re-creation; staged multi-island scene | Doesn't read as "the actual studio" |
| Upstream pacing / inspectability depth | Two beats; what+why on proposed trees | Diamond confusing or too thin |
| Shopping fiction labels (Cart / Payments / Receipts) | Retained from increment G | Fiction fights the teach |

## Consequences

**Good.**

- One document is the Act 2 current state — sessions stop reconstructing an amend stack.
- Spine (D1–D12) is stable enough to guide builds; §Open iteration names the cheap collaboration
  surface for the LOOK the owner still wants to improve.
- Engine / website-story / Act 1 stay separate authorities — this ADR does not become a god-doc.

**Costs / risks.**

- **Consolidation is not a terminal LOOK close.** Landed builds were attested as step-forward; Act 2
  still needs iteration. Treat §Open iteration as the work queue, not as unfinished Decision prose.
- **Caps and site copy may still cite superseded ADR numbers** until a follow-on pass rewrites
  citations to 0213. Citation drift is curation debt, not a re-decision.

## Out of scope

- Two-act framing, brochure retirement, a11y marker policy, site-wide replay-only →
  [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md).
- Act 1 terminal swarm / finale / transform choreography →
  [ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md).
- `act2-beat-director` zod / `dependsOn` / `abd-*` contracts / `--real` proofs → the LEAF cap.
- `worldSvg` / sync / grounding rail mechanism → ADR-0093 / 0056 / 0066 (cite).
- General copy style as principle → Library (`plain-language-first`; graduate industry-honesty if
  durable).

## References

- Superseded (history): [0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md),
  [0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md),
  [0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md),
  [0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md),
  [0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md),
  [0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md).
- Sibling frame (not superseded here): [0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md).
- Sibling Act 1 (not superseded here): [0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md).
- Cited: [0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md),
  [0020](0020-red-green-enforcement-on-the-owned-loop.md),
  [0030](0030-all-in-on-claude-agent-sdk.md),
  [0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md),
  [0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md),
  [0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md),
  [0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md),
  [0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md),
  [0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
- Caps: [`act2-guided-walkthrough`](../../stories/website-experience/act2-guided-walkthrough.md),
  [`act2-guided-forest`](../../stories/website-experience/act2-guided-forest.md),
  [`act2-beat-director`](../../stories/website-experience/act2-beat-director.md),
  [`website-experience`](../../stories/website-experience/story.md).
- Research: [`docs/research/industry-framing-2026.md`](../research/industry-framing-2026.md).
