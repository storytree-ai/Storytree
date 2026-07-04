---
status: accepted
decided: 2026-07-03
amends: [134, 145]
---
# ADR-0148: Act 2 is a website-first walk that grows into an orchestrator-guided forest

## Status

accepted (2026-07-03) — decided/directed by the owner at the `act2-guided-walkthrough` attestation
gate on 2026-07-03. Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second end-of-flow ask.
Amends [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) (the two-act
experience concept) and [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)
(whose R3F retreat this completes — the landing island too now goes; the 2.5D tutorial becomes the
WHOLE of the post-storm experience).

## Context

[ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) staked Act 2 on teaching
how storytree answers the vibe-coding gripes;
[ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) settled its substrate
(the real 2.5D map, not R3F). The first build to reach the owner gate on that substrate (2026-07-03,
storytree-web PR #22) was machine-floor green — a visitor-paced five-beat walk growing **one** story on
**one** island (a relatable shopping-checkout, the owner's own fiction). The owner judged it *"good
progress forward"* but redirected the NARRATIVE and demanded end-to-end COHESION: a single story growing
green teaches a metaphor, not the product, and the flow into it (a 3D landing island that flips to a 2.5D
map, an optional escape to a classic homepage, a cryptic finale monologue) was disjointed. Storytree
grows a **forest** — work lives at story › capability › contract, stories exist at every level (a
website, a backend, a database) — and the session orchestrator (the human-facing planning agent,
ADR-0030) is the thing a real user actually meets first.

The forces the owner named:

- **Meet the user where they are, don't hide the complexity — scaffold it.** A vibe coder wants to
  *see a website* to validate their idea; leading with "you need a backend first" misdirects and
  overwhelms. But the complexity is real and must not be hidden — it is revealed in the order a human
  can hold it, as the user asks for the next step.
- **The orchestrator is the protagonist, and it pushes back.** The experience is not a story
  auto-growing; it is the session orchestrator planning *with* the user — proposing, honestly
  bounding, and guiding to what comes next. (This is the org analogy the owner favours: the
  orchestrator is the manager who scopes the work.)
- **Stories at every level, not just leaves.** It is fine — correct, even — that a database and a
  backend sit UPSTREAM of the website the user asked for. Storytree adds stories at any level of the
  DAG; the walk must show that, not pretend the website is a leaf.
- **One cohesive path, all-in on the tutorial.** No competing destinations and no jarring seams: the
  finale's "show me the better way" must lead straight into the Act 2 tutorial, not to a static
  homepage and not through a 3D-island-that-flips-to-2.5D. The classic front page as an opt-out
  destination goes; the tutorial IS the front door.
- **Narrative unity with Act 1.** Act 1's storm already has the visitor type a task into a terminal.
  Reusing that same prompt — *"build me a shopping website"* — makes Act 1 the request done the
  chaotic way (a dozen agents flailing) and Act 2 the SAME request done right. One prompt, two ways:
  the gripe, then the answer. The finale's own voice turns on the visitor — it is waiting on *them*,
  it senses they are overwhelmed, and it offers a better way that "feels like playing a game."

## Decision

Act 2 is **the vibe coder's request, handled the storytree way** — a website-first walk that grows into
an orchestrator-guided forest, on the 2.5D map (ADR-0145), narrated by anchored callouts (ADR-0145),
over fictional data (the teaching-diorama boundary, ADR-0056/0066/0093, holds).

1. **It opens from the reused Act 1 prompt, rewritten to the shopping website.** Act 1's storm terminal
   leads with **"build me a shopping website"**; that same request is what Act 2 replays done right. One
   prompt spans both acts.
2. **The session orchestrator proposes a mock local website first — no backend — meeting the user where
   they are.** A short scripted orchestrator exchange (felt, not merely narrated) answers the prompt by
   proposing the honest minimum a vibe coder wants: a mock local website to validate the idea. It does
   not misdirect (it is explicitly a mock with no backend) and it does not overwhelm (it does not lead
   with the backend).
3. **The walk grows that one website story green** — the existing visitor-paced beats on the 2.5D map,
   one Next-tap per beat: intent on a label → presence without babysitting → a limb greens only on
   signed proof → the wrong-way road flagged → the legible pull-back. The relatable shopping fiction
   (Cart / Payments / Receipts) is retained — and its features are precisely the ones that cannot truly
   work without a backend, which sets up the next step.
4. **Then the orchestrator guides the user to the next stories, as they ask "what's next."** A database,
   a proper backend — the forest of PROPOSED trees, growing UPSTREAM of the website, stories at every
   level. The user can inspect each proposed story to understand what it is and why it is proposed, and
   walk them green progressively. Complexity is scaffolded, revealed on demand — never dumped up front.
   *(Amended by [ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md),
   2026-07-04: increment H is NO LONGER a "what's next" CTA-gated separate phase — it is the SAME
   continuous walk continuing upstream, and G's "what's next" CTA becomes a CONTINUATION SEAM the walk
   flows through ("it shouldnt be separate"). The upstream forest (§4's database + backend) and the
   scaffolded-complexity obligation stand; only the phase boundary dissolves into one arc. Noted in
   place per ADR-0139.)*
5. **The whole flow is cohesive — all-in on the tutorial.** The finale terminal's **"show me the better
   way"** routes DIRECTLY into the Act 2 2.5D tutorial — not to a static/classic homepage, and not via a
   3D landing island that then flips to 2.5D. The **R3F 3D landing island is dropped** (the flip read as
   awkward; this completes ADR-0145's R3F retreat — Act 2 is now pure 2.5D SVG/DOM, zero WebGL). The
   **classic front page is removed as a destination** — the tutorial is the front door for capable
   visitors; the no-JS / reduced-motion accessibility fallback and skip affordance STAY (ADR-0134,
   gate-enforced) as graceful degradation, not as an opt-out a capable visitor is offered. *(As built,
   web main `ff70222b`, 2026-07-04: this §5 principle is realised in the skip's routing itself — the
   persistent top-left "show me a better way" control (`data-experience-skip`) jumps a **capable (JS)
   visitor STRAIGHT into the 2.5D tutorial** via `window.__stormSkipToTutorial` (`index.astro:73–75`,
   which carries this ADR-0148 §5 rationale inline); it falls through to the `#calm-view`
   `data-experience-fallback` page **only with no JS / a failed engine**. So the skip is not merely a
   degradation exit — for a capable visitor it is a fast-path INTO the primary experience, and the
   classic/calm page is reachable by them only as the accessibility fallback tier. This tightens, not
   changes, the decision: the tutorial is the front door; the classic page is never an opt-out offered
   to a capable visitor. Noted in place per ADR-0139.)* The **finale
   copy** turns to address the visitor directly — it is waiting on *them*, it names their likely
   overwhelm, and it offers a better way that "feels like playing a game" (replacing the earlier cryptic
   "the bottleneck is not the agents" monologue).

**Rollout (owner call, ship-now/extend-next):**

- **Increment G — the website-first walk (ships first).** The 2.5D walk already built and witnessed,
  PLUS the cohesion that lands it honestly and end-to-end: the rewritten Act 1 prompt, the new finale
  copy, "show me the better way" routing straight into the 2.5D tutorial (R3F island + classic front
  page dropped), the orchestrator's mock-website proposal exchange, and a CTA that hands off to "what's
  next." Operator-attested (ADR-0070) — the owner walks the finished G and attests before it merges
  live. Reshapes the `act2-guided-walkthrough` capability.
- **Increment H — the guided forest (extends next).** The orchestrator guiding the user upstream to the
  database and backend stories, the forest growing on demand. A new capability under
  `website-experience`, also operator-attested. The story-author owns the exact split.

## Consequences

- The `act2-guided-walkthrough` capability is re-specified to increment G (attestation history kept;
  the prior single-story build is its foundation, not discarded — the 2.5D map render, pacing, callout,
  and beat engine all carry forward). A new capability captures increment H. The `story-author` authors
  both against the live Library.
- The 2.5D substrate (ADR-0145) and the diorama/fictional-data boundary are unchanged; this ADR moves
  the NARRATIVE and STRUCTURE (one story → a website-first walk that reveals an upstream forest) AND the
  end-to-end cohesion of the path into it.
- **The inflection is simplified, not preserved as-was.** ADR-0148 overrides the earlier "keep the R3F
  landing / keep the classic front page as an escape" posture: "show me the better way" transforms the
  storm straight into the 2.5D tutorial; the R3F 3D island landing is dropped and the classic front page
  is no longer a capable-visitor destination. Act 1's storm choreography itself (the swarm, the collapse
  to soil) stays; only its finale copy is rewritten and its resolution retargeted at the 2.5D tutorial.
- **Accessibility stays load-bearing.** The skip affordance and the no-JS / reduced-motion fallback
  (data-experience-skip / data-experience-fallback) remain and keep the `check:web-experience` gate
  green (ADR-0134). "Get rid of the classic front page" means removing it as an *opt-out for capable
  visitors*, not removing the graceful-degradation fallback — that fallback becomes a clean minimal
  static page, not the old marketing homepage.
- Dropping the R3F island removes the ~1.2 MB WebGL chunk from the entire post-storm path — Act 2 is now
  pure SVG/DOM, which resolves the open asset/perf-budget question (ADR-0123) for this surface in the
  lightest possible direction. The R3F renderer package/capability (ADR-0123) still exists for
  far-future use; it is simply no longer on the website's path.
- A new build surface: a short scripted orchestrator exchange (the planning/pushback moment). It is the
  meatiest new piece of G and the seam H extends (the same orchestrator returns to guide "what's next").
- Honest scaffolding is now a stated design obligation of Act 2: the walk must meet the user at a
  comprehensible level and reveal complexity on demand, never hide it and never dump it.

## References

- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — the two-act
  experience concept (amended here — the classic front page retires as a capable-visitor destination).
- [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — the 2.5D substrate
  + anchored callouts (amended here — the R3F retreat now includes the landing island; Act 2 is all 2.5D).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the session orchestrator as the human-facing planning
  agent the walk now dramatises.
- [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) — the R3F renderer, now off the website path (kept for
  far-future).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is
  ratification (this ADR born accepted).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the
  operator-attested gate G and H each pass.
- `stories/website-experience/act2-guided-walkthrough.md` — the capability re-specified to increment G.
- `docs/research/vibe-coding-gripes-2026.md` — the gripe evidence Act 2 answers.
