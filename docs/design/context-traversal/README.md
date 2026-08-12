# Context traversal visual contract

Status: owner-approved design reference for arc `linked-session-context-arc`.

Revised 2026-07-27 by owner direction in conversation: the per-node gauge is retired in favour of a
single playhead bar, nodes become plain marks, and revisit loop-back lines are dropped. See
[Revision 2026-07-27](#revision-2026-07-27) for what changed. Both reference artifacts below were
regenerated against that revision on 2026-07-27 and now conform.

## Canonical references

- [Playable narrow-panel mock](session-traversal-playback.html) — normative for the **grammar**. No
  longer authoritative for **layout** (ADR-0354 D4); see the banner below.
- [Static reference image](session-traversal-playback.png) — review fallback and visual-regression anchor.
- [Playable bottom-panel composition](bottom-panel-traversal-composition.html) — the **layout**
  successor, at the bottom panel's width. **Produced 2026-08-13; awaiting the owner's LOOK**, which
  ADR-0354 D4 requires before the wide layout is built. Until that LOOK it is a proposal, not a
  reference: nothing may be built against it, and nothing in it overrides the grammar below.
- [Static bottom-panel image](bottom-panel-traversal-composition.png) — review fallback for the
  above, captured at 1360px with the default trace played to the end. The HTML is authoritative when
  the two differ; the image shows one trace in one state and cannot carry the animation, the four
  other bundled traces, or the dock-height behaviour.

The narrow HTML reference is authoritative on grammar when the two differ. The image captures the
full-trace state at a narrow story-details-panel width.

The bottom-panel composition is drawn from three real recorded traces on the authoring machine
(`elegant-rosalind-2b9a05`, `clever-mestorf-1041a3`, `recursing-neumann-3a74d7`), and every derived
figure in it is produced by the shipped libraries — `buildTraversalTimeScale`, `computeTraversalDepth`,
`buildTraversalLanes`, `buildOccupancySeries`, and the server's own `computeDecisionPoints` — so it
cannot describe a trace differently from the panel that implements it.

**The red is not visible in either artifact, and that is honest rather than missing.** The recorded
reference trace peaks at 240.9k, so its fill never reaches the 500k threshold and never turns red.
The rule is shown in the legend as an example fill, which marks nothing on the bar itself; it was
also exercised directly against the live render (forcing a 720k reading through the same path puts a
red segment starting at the threshold and nowhere else). A future artifact drawn from a trace that
does cross 500k should show the red on the bar and drop the legend example.

## Product composition

This is **not a dashboard**.

> **PLACEMENT SUPERSEDED 2026-08-12 by [ADR-0354](../../decisions/0354-the-context-traversal-replay-lives-in-a-bottom-panel-tab-bes.md)
> — owner-directed.** Steps 1–3 below, and acceptance clause 1, no longer describe where the replay
> lives: it moves to a **tab in the bottom panel beside the terminal** (which stays), and the session
> list becomes this machine's **whole local trace index, newest first**, with the claim-join withdrawn.
> Measured cause: 339 local traces, exactly one reachable through the claim-gated panel. The width
> premise goes with it — the picture RE-FLOWS to the bottom panel, so `PANEL_MIN=360` is no longer the
> constraint that shapes the grammar.
>
> **This file remains normative for the GRAMMAR, and is no longer authoritative for LAYOUT.** Everything
> under "Visual grammar" below still binds exactly as signed — one playhead bar, red only past 500k with
> no marker, plain marks, solid/dotted read edges, the search glyph, branching by animation, explicit-only
> forks with a raw `M of N`.
>
> The composition reference at width that ADR-0354 D4 requires now EXISTS —
> [`bottom-panel-traversal-composition.html`](bottom-panel-traversal-composition.html), produced
> 2026-08-13 — and is **awaiting the owner's LOOK**. It proposes one layout decision worth naming here,
> because it is the reading of D3 the owner is being asked to confirm: **the time axis rotates**, running
> left → right, with depth indenting downward and the occupancy bar becoming a vertical track at the
> right. D3's words are permissions ("lanes may sit side by side, depth may take real horizontal room,
> and the axis may stretch"), and a plain 90° reading of them would simply move the 360px panel's
> crowding onto the bottom panel's scarce vertical. Until the LOOK lands, no wide layout may be built —
> against that proposal or any other.

The traversal opens from the existing forest:

1. The owner selects a story-node island. *(superseded — ADR-0354 D1)*
2. The story's narrow right-hand details panel shows a dropdown of active sessions that claimed it. *(superseded — ADR-0354 D1/D2)*
3. Selecting a session renders the traversal playback in that panel. *(superseded — ADR-0354 D1)*
4. A footprint can be selected or double-clicked to drill into detail; the overview remains primarily pictorial. *(stands)*

The chronological traversal is the dominant picture. It is an **animation that is played and replayed** —
that is the primary way the shape is read, not a static diagram that happens to move.

## Visual grammar

- The traversal progresses through time on a compact vertical spine. Confirmed idle spans are folded explicitly rather than removed or visually stretched.
- **Context visits are plain node marks, not gauges.** They carry identity, read strength, and agent
  type — not a per-visit token readout.
- **One bar carries context occupancy for the whole panel.** It fills as the playback advances, showing
  context resident in the runtime-declared window at the playhead. The portion of the fill beyond the
  owner-selected 500k threshold renders red; **no marker, tick, or danger arc is drawn for the
  threshold itself.** The red is the whole signal, and it stays display-only — never a runtime cutoff,
  eviction trigger, or claim about any model's window size.
- The occupancy quantity the bar plots is settled by ADR-0248: it is a per-request resident-context
  figure, sourced from the host transcript surface, which can fall as well as rise. A billing total is
  monotonic and cannot draw this bar.
- Search is the only non-circular context mark and uses a small magnifying glass.
- A full payload traversal edge is solid. A grey dotted edge means front matter was read without pulling the full body.
- **Branching is carried by the animation, not by a drawn back-link.** When traversal descends a
  pathway and later resumes elsewhere, the tree splits and the abandoned branch simply stops
  progressing. Two branches advance at the same time only when work genuinely ran in parallel, which in
  practice means spawned subagents. Revisits are still recorded in the telemetry and remain answerable
  by query or drill-down; they are not drawn as loop-back lines in the overview.
- Time never runs backwards in the playback. Depth into the Library DAG is the axis that moves both
  ways: a descent indents, a return to a shallower node comes back. This requires deterministic
  `parentVisitId`, and nothing else — a causal FORK additionally needs followed-edge metadata (next
  bullet), but plain depth does not. Where parent links are absent the traversal honestly renders as a
  single column rather than an inferred tree. (Narrowed 2026-07-27: this clause used to require
  `parentVisitId` AND followed-edge metadata for depth, which reads as "no tree may ever be drawn" —
  at the time followed-edge had no producer, while `parentVisitId` had just gained one. The
  conjunction was wrong; the honesty rule it guards is unchanged. Corrected 2026-07-28: the reason
  given for the narrowing was overtaken by ADR-0260, which decided followed-edge WILL gain a producer
  — the narrowing itself stands on its own merit, since depth has never needed a fork.)
- A causal knowledge fork is shown only when deterministic offered/followed-edge metadata exists. Temporal proximity is not evidence of a fork.
- Parent and subagents occupy linked lanes. A child receives a payload from the parent, runs an independent context window and inner loop, then returns a result to the parent.
- Color and compact icons identify stable agent types, not individual instances. The approved initial types are primary, general-purpose, Explore, and librarian-curator.
- Labels and prose are intentionally sparse at overview level. Detailed words belong in drill-down or in an agent's answer about the telemetry.

## Explicit anti-goals

- No standalone analytics dashboard.
- No card grid, KPI row, or collection of large gauges.
- No per-node gauge, and no threshold marker drawn on any ring or bar.
- No wide central canvas detached from the selected forest story.
- No inferred retrieval edges, hidden idle time, or merged parent/child token accounting.
- No model-authored path diary, compaction control, pruning control, or context limit.

## Reference trace

The mock is shaped from metadata extracted from recorded session `02b6a304-6b29-41d0-9276-b9ce7b8958e3`; no transcript contents or hidden reasoning are included.

- Wall-clock horizon: 7h39m, with explicit multi-hour idle folding.
- Parent: 180 model turns, 186 tool calls, maximum observed input context 240.9k.
- Children: five spawned agents, 208 combined tool calls.
- Child types represented: Explore, general-purpose, and librarian-curator.
- Spawn and result-return lanes are observable in the source trace.
- Causal knowledge forks are intentionally absent because the source trace predates deterministic `parentVisitId`, candidate, and followed-edge metadata. All three have since gained producers — `parentVisitId`, then `candidate_set` on 2026-07-28, then `followed_edge` on 2026-07-29 (both below). **The absence here is a property of the source trace, not of the repo** — these artifacts must not be redrawn to show any of them (see below).

The trace's occupancy series is load-bearing beyond composition: it **recedes** (240.9k → 228.1k, and
239.8k → 229.6k, with per-visit `added` falling to 0 on those visits). That is the evidence in ADR-0248
that the bar needs a quantity which can fall, and that no existing token field can supply it.

The series was re-derived on 2026-07-27 by running the shipped host-transcript extractor
(`readTranscriptWindow`, story `context-traversal-transcript`) over the same recorded session, which
confirms the numbers the mock draws are `residentInputTokens` and not a re-labelled billing total:
180 parent observations, a 457.9-minute horizon, a 240.9k maximum, three receding steps, and
five-minute bucket maxima that match the mock's column exactly. The mock's per-visit `added` column
was dropped in the regeneration, since a single bar needs one quantity and ADR-0248 D3 deletes that
field.

## Implementation acceptance

A visual implementation is conformant only when:

- ~~it is reached through story island → claimed session → narrow details panel~~ — **SUPERSEDED by
  [ADR-0354](../../decisions/0354-the-context-traversal-replay-lives-in-a-bottom-panel-tab-bes.md) D1/D2.**
  Replace with: it is reached through a **tab in the bottom panel beside the terminal**, whose session
  list is this machine's whole local trace index newest-first — no claim, no story selection, and
  nothing caught in flight; a session with no readable local trace is still offered-and-explained
  rather than dropped, and a machine that captured none still answers an honest empty list;
- the traversal, not the bar or any metric, dominates the first glance;
- the bar reads occupancy at the playhead and turns red only for the portion past 500k, with no marker;
- no per-node gauge and no drawn revisit loop-back appears;
- parent/child handoffs and time remain legible on an eight-hour trace;
- the dotted/full-read, search, and explicit-only fork semantics above survive;
- a direct comparison against the canonical HTML is presented for owner attestation.

## Revision 2026-07-27

Owner-directed in conversation, and the reason ADR-0248 could be settled:

1. **Per-node gauges retired.** Nodes become plain marks. This buys panel room for depth excursions and
   child lanes, which the gauge glyphs were crowding out.
2. **One playhead bar replaces them.** A bar needs ONE quantity, so "context added by this visit" stops
   being something that must be drawn. ADR-0248 D3 therefore DELETES `addedInputTokens` rather than
   giving it a real per-visit delta — it was a duplicate of `cumulativeInputTokens` and now has no
   consumer.
3. **The threshold marker is gone.** Overflow is shown by colouring the over-threshold portion of the
   fill red. Cheaper than a danger arc, and it survives any window size — including a build leaf's
   200k, where a 500k marker had no meaning.
4. **Revisit loop-backs are not drawn.** The animation carries branching; the data still records the
   link.

Regenerated 2026-07-27. Correction to this file's own earlier account of what was stale: the previous
artifacts rendered per-node gauges and a bottom-of-circle danger marker, but they never drew a revisit
loop-back at all, so clause 4 was already satisfied and cost the regeneration nothing. What changed is
clauses 1–3 plus two things they made possible — a search visit is now drawn as a magnifying glass
*instead of* a circle rather than layered over a gauge ring, and the marks shrank from 6.8/5.2 to
3.4/2.8 units, which is the panel room the revision was after.

**Depth: half the metadata now exists, and these artifacts still show none of it — deliberately.**
Narrowed 2026-07-27: `parentVisitId` gained its first producer anywhere in the repo (capability
`agent-ref-descent`, story `context-traversal-capture`). `storytree agents <name>` renders each floor
ref's one-line assertion by resolving that ref's explicit id inside one process, so each resolved ref
is recorded as a child visit naming the agent's visit as its parent — a within-process containment
fact, not a correlation. Depth on that surface genuinely moves: down one level, then back.

These two artifacts are nonetheless NOT redrawn, and must not be. Their reference trace is recorded
session `02b6a304`, which predates the emission entirely and contains no `agents` invocation at all —
so an indented tree drawn over it would be inferred depth, which the honesty clause above forbids and
which would forge the arc's own reference evidence. They stay a single column because *their* trace is
one. A future artifact drawn from a trace that does carry parent links should show the descent.

**Candidate sets: corrected 2026-07-28, and the same do-not-redraw reasoning applies.** This section
previously closed by recording that followed-edge metadata had no producer "and is not expected to gain
one". Both halves are now overtaken, and by a decision rather than by drift — ADR-0260 settled that an
offer carries an identity and the answering command names it, so a followed edge becomes constructible
without the temporal proximity ADR-0235 clause 3 refuses. Concretely:

- `candidate_set` **has a producer** as of 2026-07-28 (capability `artifact-offer-candidate-sets`, same
  story). A `storytree library artifact <id>` read records the onward artifacts its Sources block
  printed, at RENDER time and whether or not anything follows — ADR-0260 D2, which is load-bearing: an
  offer emitted only once something followed it would rebuild the containment tree while looking correct.
- `followed_edge` **has a producer** as of 2026-07-29 (capability `offer-follow-edges`, same story),
  built exactly as ADR-0260 D3 settled: an artifact render prints a pasteable follow-up carrying
  `--from-offer <candidateSetId>`, and a read invoked with that id stamps `followedEdgeId` on its own
  visit and records the edge naming both ends. The id travels in argv and is never resolved from the
  trace, so no temporal proximity is engaged.
- The decision point itself is legible as of 2026-08-04 (capability `decision-point-playback`, same
  story): `traversal show` renders each recorded offer's every candidate with what the trace
  deterministically says happened to it — followed, not followed, unfollowable, or ambiguous — which
  is the first surface anywhere in the repo on which an UNFOLLOWED branch is visible. It is a text
  replay, not this pictorial panel; what it settles for a future artifact is that the metadata and the
  honest-gap vocabulary now exist to draw one from.
- The offer set's own DENOMINATOR is stated as of 2026-08-05 (capability `offer-observability-share`,
  same story, ADR-0312): each recorded offer renders `offered N, observable M of N` with a named reason
  for every unobservable entry, closing with the sentence that the followed counts are over the
  observable branches and not the offered ones. This matters for anything drawn FROM this metadata,
  including a future version of this panel: `doc:` refs are 36.7% of the corpus's 1500 references and
  an individual offer set can be anywhere from 0% to 100% unobservable, so a fork count drawn without
  the denominator systematically over-reports how often a session stayed inside the asset graph. A
  pictorial panel that draws forks must therefore also show what it could not see — the same
  honest-gap rule the "explicit-only forks" clause already states, applied to the SET rather than to
  the individual edge. ADR-0312 also settles that this gap is measured rather than closed: `doc:` refs
  gain no CLI read shape, because making one followable would turn every unanswered `doc:` offer into
  a *declined branch* it never was.

These artifacts are still NOT redrawn to show any of it, for exactly the reason given above: recorded
session `02b6a304` predates every one of those emissions, so drawing offers or forks over it would be
inferred, not observed — and would forge the arc's own reference evidence. They stay a single column
because *their* trace is one. What ADR-0260 changes is what a FUTURE artifact, drawn from a trace that
carries the metadata, is allowed to show — never what this one may be back-filled with. **A trace that
does carry it can now be recorded on demand**, which is what makes a future artifact a matter of
choosing a session rather than of waiting for a producer.
