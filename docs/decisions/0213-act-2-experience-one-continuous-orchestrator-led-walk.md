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

**In-place extension (2026-07-20)** — owner-directed LOOK strategy session: arc phases become Bait →
Guiding Principles → D → I → Z (D3); Guiding Principles locked as **Attention must be earned**,
**Every signal must be honest**, and **Humans own intention** (D13), including per-principle **assets**
(map vignette / TDD-ring flowchart + hard-link / anti-pattern montage) and shared
nameplate→gloss→optional-inspect surface. Bait craft, hotspot inventories, and post-build D/I/Z
dedupe stay §Open iteration. Design-time alignment IS ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)).

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
visitor-paced walk: a curiosity bait, then Guiding Principles (how storytree addresses AI-coding
challenges), then the system on a growing diagram, then watched for real on the island, then paid
off by a zoom-out to the studio view.** Copy spine: *"everything in this UI is a signal of what the
agents are building."* Thirteen points:

### D1 — Website-first, same prompt

Act 2 opens from Act 1's same request ("build me a shopping website"). The orchestrator proposes a
**mock local website first — no backend upfront** — then scaffolds complexity as the walk continues.
Meet the vibe coder where they are; never dump the full stack; never hide that the stack exists.

### D2 — One continuous walk

The upstream forest is **not** a CTA-gated second phase. It is the next beats of the same arc. Any
"what's next" affordance is a **continuation seam**, not a destination to a separate experience.

### D3 — Arc phases: Bait → Guiding Principles → D → I → Z

1. **Bait** — after Act 1's transform, a short curiosity spark: watch a full mock forest grow
   (fast-forward of the real product surface; placeholder growth OK). Not a teach dump and not a
   second CTA-gated experience (D2) — then the walk continues. Craft open (§Open iteration).
2. **Guiding Principles** — how storytree addresses current AI-coding challenges, one principle at a
   time; the visitor drives how far each principle decomposes (D13).
3. **Phase D** — the system, on one growing diagram (before the paced island walk).
4. **Phase I** — watch it for real on the 2.5D island walk.
5. **Phase Z** — zoom out to the real studio view.

Why before model before demo: Guiding Principles name *why this exists*; Phase D assembles the
picture; island and studio prove it. Payoff stays in the surface the pitch is about.

### D4 — Thesis

*"Everything you'll see in this UI is a signal of what the agents are actually building. You don't
read the diffs — you read the map, until a signal says look closer."* Guiding Principles introduce
this claim at principle altitude (starting with D13's first principle); Phase D assembles it on the
diagram; the island and studio prove it.

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

### D13 — Guiding Principles (three locked)

After the bait and **before** Phase D, Act 2 walks **Guiding Principles**: storytree's answers to
current AI-coding challenges, grouped under named principles. One principle at a time; the visitor
drives how far that principle **decomposes**. The decomposition mechanic *demonstrates* Attention; it
is not itself a fourth named principle unless a later Decision splits it.

**Order (locked):** (1) Attention must be earned → (2) Every signal must be honest → (3) Humans own
intention.

**Shared surface (locked):** each principle shows **nameplate + one-line gloss + one staged asset**.
The visitor may open the gloss for the longer plain-language explanation, and may inspect
**load-bearing** parts of the asset for leaf detail. Exploring is **optional**; a primary reply chip
always advances to the next principle (or into Phase D). Depth is capped: one detail surface, not a
nested FAQ product / second app. Advance stays in the orchestrator chat (D6); detail is an inspect
panel/callout, not a route change. Every hotspot must earn its pixels (Attention applied to the teach
UI) — decorative clicks with empty copy are forbidden.

**1 — Attention must be earned**

- **Gloss:** *Everything on the map earns its pixels. You decide when to look closer.*
- **Hinge:** default attention is glance-level; deeper attention is opt-in and visitor-driven; the UI
  is built so the glance is already honest — maximize signal / minimize noise; every element is
  load-bearing (not decorative); screen real estate means *more meaning per pixel*, not denser
  chrome.
- **Owns:** audit-via-map rather than diffs/terminals; babysitting / botsitting; terminal sprawl;
  color that must earn its meaning; glanceable forest / comprehension debt; review volume filtered
  by signal before a dive.
- **Asset (locked):** an **in-world 2.5D map vignette** (real product substrate) — e.g. two connected
  story nodes. Inspect load-bearing pieces (tree / path / live-session mark / pale-vs-green signal —
  only what carries a claim). Do **not** reuse this map lesson for principle 2.

**2 — Every signal must be honest**

- **Gloss:** *Every signal on the map tells the truth. An agent saying “done” is not done — green
  only means the system signed a proof.*
- **Hinge:** verification is **relocated**, not eliminated — machine-checkable proof is observed and
  signed by the system (the agent never grades its own homework); human taste / UAT / decisions stay
  human. Never claim “we eliminate verification” or that proven includes secure
  ([`industry-framing-2026`](../research/industry-framing-2026.md)).
  Signals (green / pale / withered / live) must not dress “done” and “not yet” the same.
- **Owns:** verification gap / “done is a lie”; grades-own-homework; silent wrongness and reward
  hacking at principle altitude; signed proof; pale ≠ green; system-as-referee / gate.
- **Asset (locked):** a **flowchart of the drive / prove machinery**, iterated from the landed
  **honest TDD loop ring** (system-as-referee; reuse that craft as the base — do not invent a second
  parallel diagram language), plus the **hard link to the code** (proof ↔ declared contracts ↔
  tests/code). Inspect nodes/arrows for leaf detail. **No** island/wisp/map re-teach here. Do **not**
  revive retired CI/CD row-list corner overlays as wallpaper — one honest loop + hard-link is enough.
  After this lands in the walk, **dedupe** the later tutorial (especially Phase D's D5 loop bloom) so
  the same teach is not said twice.

**3 — Humans own intention**

- **Gloss:** *You can’t shape the clay if you can’t see it. The map shows what is being built so
  humans can steer the product in real time.*
- **Hinge:** agents generate; humans keep **intention** — what to build, why, and when to change
  course. Visibility is for **steering** (spot bad architectural paths while the clay is still wet,
  reshape outcomes on the map), not for babysitting tokens. Distinct from Attention (signal
  discipline) and Every signal must be honest (truth of green): this is **who owns direction**.
- **Owns:** orphaned intent made visible as work-on-the-map; humans shaping the product live;
  spotting bad architecture / wrong-order stack early because structure is shown; owner-held forks /
  outer loop ([ADR-0030](0030-all-in-on-claude-agent-sdk.md) human-owns-the-outer-loop posture).
- **Asset (locked):** a **slideable montage of anti-pattern stills** the system would make obvious
  (e.g. an island with too many connections, an island larger than it should be, a capability that
  looks wrong or asks for a closer look). Frame as *spot bad shape early, then reshape* — not shame,
  and not a return of the retired wrong-way-road as Phase I's main teach (D8's positive dependency
  advantage stands on the island). Visitor slides through stills; may inspect a still for one leaf.

**Not a Guiding Principle:** durable library / “agent wiki” / second-brain-style shared context.
That is **context engineering** — mainstream AI-agent best practice — and belongs embodied in Phase
D (and the product) without a fourth principle nameplate. Do not elevate it here.

A fourth Guiding Principle stays **open** only if it earns a claim these three do not already cover
(§Open iteration). Dedupe against Phase D / I / Z once Guiding Principles are built into the walk.

## Open iteration

These are **not frozen**. Future sessions may reshape them without superseding this ADR, unless the
change breaks a Decision point above:

| Open item | Current default | Iterate when… |
|---|---|---|
| Bait craft (growth montage, duration, auto vs chip handoff, reduced-motion) | Short product-surface fast-forward; placeholder OK; continuous into Guiding Principles | Feels brochure-y, second CTA, or too long |
| Fourth+ Guiding Principle (only if it earns a new claim) | Three locked (D13); library/agent-wiki is NOT a principle | A pain these three don’t cover |
| Guiding Principles hotspot / still inventories + leaf copy | Locked asset *kinds* (D13); exact clicks/slides open | Hotspot noise, empty clicks, or weak teach |
| Guiding Principles detail-panel craft (depth cap, motion, a11y) | Optional inspect; one detail surface; chip always advances | Feels like a second app or traps the walk |
| Exact beat copy / chip wording / thesis phrasing | 0165 script table as structural baseline; Guiding Principles narratives from D13 glosses | Slide-like, jargon-y, or unpersuasive |
| Tap count / merges | ~15 taps; merge D0+D1 and/or Z1+Z2 → ~13 if long; Guiding Principles taps TBD | Gate feels long or thin |
| Phase D diagram craft (geometry, bloom, compaction) | L→R spine; loop at D5 **until Guiding Principles #2 lands**, then thin/dedupe | Weak teach or duplicate of D13 #2 |
| Wisp motion / timing / reduced-motion | Orbit ~9s ellipse; pulse-only when reduced | Presence doesn't read as a live session |
| Phase Z studio chrome fidelity | Token re-creation; staged multi-island scene | Doesn't read as "the actual studio" |
| Upstream pacing / inspectability depth | Two beats; what+why on proposed trees | Diamond confusing or too thin |
| Shopping fiction labels (Cart / Payments / Receipts) | Retained from increment G | Fiction fights the teach |
| Dedupe Guiding Principles ↔ D / I / Z | **Required after Guiding Principles build** — especially D5 loop vs D13 #2 TDD ring; map/signal teaches vs D13 #1; architecture spot vs D13 #3 | Same teach said twice |

## Consequences

**Good.**

- One document is the Act 2 current state — sessions stop reconstructing an amend stack.
- Spine (D1–D13) is stable enough to guide builds; §Open iteration names the cheap collaboration
  surface for the LOOK — Guiding Principles nameplates **and asset kinds** are locked (map vignette /
  TDD-ring flowchart / anti-pattern montage); bait craft, hotspot inventories, and post-build D/I/Z
  dedupe remain open.
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
