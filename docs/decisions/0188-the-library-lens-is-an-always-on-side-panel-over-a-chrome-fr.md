---
status: accepted
decided: 2026-07-12
amends: [185, 187]
---
# ADR-0188: The library lens is an always-on side panel over a chrome-free full-depth DAG canvas

## Status

accepted (2026-07-12) — decided/directed by the owner in conversation on 2026-07-12, after attesting
the increment-8 staged permanent lens + Open overlay and rejecting the look AND the user flow (the
ADR-0070 stage-2 leg working as intended, as with the increment-5 rejection that produced ADR-0187),
then aligning on a remold proposal (flow diagram + walkable mock + element-by-element justification).
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends ADR-0185
(its dec 2 finder doctrine, in part) and ADR-0187 (its dec 3 overview information design, in part;
sharpens its dec 1 shell). The look legs remain operator-attested at build time (ADR-0070 stage 2).

**Amended by ADR-0191 (2026-07-13), reciprocal note.** Two decisions here are redefined, not deleted, by
ADR-0191 after the owner walked the lens live in the desktop app: **dec 6**'s component-local minimise
state machine (the bottom handle bar with Minimise/Restore) RETIRES — the lens now defaults to a persistent
top-edge drawer handle, visible on load, and minimise/collapse/close unify into clearing the `?overlay=library`
flag (URL-derived lens state). And the presence model carried through **dec 1** — the flag as the ONLY
presence gate, so "absent renders nothing" — changes: absent now renders the collapsed top handle (and only
it), present renders the lens expanded. The always-on side-panel body, the two-pane layout, and dec 2–5 /
dec 7 stand unchanged. (ADR-0191 is the incoming `amends` edge; this ADR's body is left intact per
copy-on-write — the redefinitions are stated here and inline at dec 1 and dec 6 below.)

## Context

The increment-8 attestation returned eleven feedback items. Beyond bugs (a selection whose detail
never rendered) and misplacements (a trailing Back button), two items overturn earlier decisions:
the whole-corpus overview constellation — ADR-0187 dec 3's centrepiece — was attested **gimmicky**
("leave it blank for now"), and the owner asked for **categories** as a browse entry, which
ADR-0185 dec 2's "search-only, no kind-filter chips" had prohibited. The rest raise the bar the
increments were building to: the reference DAG must actually draw its edges at full depth (the
shipped focus subgraph is three DIV columns — no SVG edges, an effective 3-level ceiling), the
panel must not blend into the world, and every element must map to a user flow. The organising
principle the owner ratified: **one instrument, two panes, zero orphan pixels** — a constant side
panel (find/scope/selection) over a canvas that does exactly one job (the selected artifact's
reference DAG).

## Decision

**1. The side panel is always present; search is always on top at full panel width (new).** The
lens body is a two-pane layout: a persistent side panel (left) and the DAG canvas (right). The
side panel exists in every state and always leads with the full-width search input. *(Amended by
ADR-0191: the presence gate is redefined — `?overlay=library` absent no longer renders nothing but the
collapsed top drawer handle; present renders this side-panel lens expanded. The two-pane body itself
stands.)*

**2. Categories are the idle browse entry and a search scope (amends ADR-0185 dec 2).** With no
query and no scope, the side panel shows the **category shelf** — the artifact kinds (plus
Decisions/ADRs) with counts, derived from the loaded corpus, never hardcoded. Picking a category
turns it into a removable **scope chip**: the panel lists the category's artifacts and subsequent
search filters **within** the scope (the placeholder names the scope). Search stays primary and
the finder stays the selection lifter — dec 2's search-first doctrine survives; its "no kind
filter chips" prohibition does not. Categories are a browse **entry**, not filter chrome bolted
onto results.

**3. The selected artifact renders as a pinned selection card in the side panel (sharpens
ADR-0187 dec 2; retires its bottom-strip preview).** The card shows title, kind, an ADR's
status/load-bearing badge (the inc-6 wire), the description looked up from the loaded corpus, and
the **Open** button. It is the permanent home of "what am I looking at" — the structural fix for
the attested blank-panel bug. The Open document overlay itself (dec 2's "like opening a Word
doc") is unchanged.

**4. The overview constellation retires to a quiet idle canvas (amends ADR-0187 dec 3).** The
zoomed-out dot field is not mounted; with no selection the canvas is quiet (at most one muted
hint line — the exact copy is a look-leg detail the owner attests). ADR-0187 dec 3's overview
information design (edges/size/legend/sidebar chrome on the constellation) is retired before
being built to that spec; its **wire prerequisites stay load-bearing** — the incs 6–7
`loadBearing`/typed-edge signals feed the selection card, hover cards, and chain weighting
instead. The corpus-count chrome is removed (counts survive only on the category shelf, where
they inform a choice). The idle canvas is reserved space for a future dashboard (agent SLAs /
open questions / friction) — a candidate, NOT decided.

**5. The focus DAG draws its edges at full depth (sharpens ADR-0185 dec 3's surface).** The
focused canvas renders a true layered DAG: reference edges drawn (soft vine strokes; the selected
transitive chain highlighted — colour stays state, kind stays text, dec 3 stands), rank depth
**uncapped**, and breadth tamed per-branch with in-place "⊕ n" expanders. The global depth
stepper retires (a global dial for a local problem). The canvas carries no header text; **← Back
leads the breadcrumb at the canvas's top-left**. The one-SVG-element-per-node budget discipline
extends to edges (draw the structurally-meaningful set, never a hairball).

**6. The lens minimises to a drawer handle (settles ADR-0187 dec 1's open shell detail).** The
lens carries a slim handle bar at its bottom edge (grip + wordmark + **Minimise**). Minimise
collapses the lens to the handle bar — the map fully visible and live — and the handle restores
it with state kept. This is the explicit affordance dec 1 left open ("leave via map navigation"
alone was not enough); the permanent-lens posture otherwise stands (no ×, no closed state — the
minimised lens is still present as its handle). *(Amended by ADR-0191: this component-local
minimise/restore state machine and its bottom handle bar RETIRE — the lens defaults to a persistent
top-edge drawer handle, and minimise/collapse/close unify into clearing the URL flag, the parent glue
owning the write. The handle idiom survives; the component-local machine does not.)*

**7. The palette is the seed-packet realisation of forest-cozy light (sharpens ADR-0185 dec 5).**
Named tokens — parchment/cream panels with visible borders and shadow ON the green world, moss
ink for structure, sprout green for scope/affordances, clay for the one primary action per
surface, sun-amber reserved for the selected chain — with a **contrast contract**: the lens reads
as an object on the map, never wallpaper. Forest-cozy LIGHT stands; blend-in realisations of it
do not. The owner-aligned mock is the attestation reference for the look legs.

## Consequences

- **The remaining arc re-decomposes**: increment 9 is the panel remold (category shelf, scope
  chip, selection card, minimise handle — plus retiring the overview mount), increment 10 is the
  DAG canvas overhaul (drawn edges, uncapped depth, expanders, breadcrumb/Back, palette),
  increment 11 retires `#/library`. The exact decomposition is the arc's plans (ADR-0183),
  authored fresh against this ADR. Increments 9 and 10 share one attestation sitting, with the
  owner-aligned mock as the reference target.
- The landed inc-5 overview (`LibraryOverview.tsx`) and its inc-8 double-click trigger stay
  signed but are **unmounted** at inc 9; whether the component is deleted or repurposed is
  deferred to the future-dashboard call. Its `lov-`/`lot-overview-*` contracts stay green while
  the source remains.
- Reworking the shell and finder re-authors signed surfaces again (the inc-8 precedent):
  now-false contracts are trimmed/re-homed by story-author as part of the increment — executing
  this decision, not a re-decision.
- ADR-0185 and ADR-0187 stay `accepted`; read 0185 dec 2 and 0187 dec 1/dec 3 through this ADR.
- Open for a later call (not blocking): whether load-bearing also sizes nodes in the focus DAG;
  the future idle-canvas dashboard.

## References

- ADR-0185 (the tech-tree overlay design), ADR-0187 (permanent lens + Open overlay; the
  increment-5 rejection precedent), ADR-0110 (design-time alignment is ratification), ADR-0070
  (two-stage proof), ADR-0183 (arcs/plans), ADR-0122 (coverage), ADR-0161 (the node-keyed
  context DAG the edges come from).
- The arc: `storytree arc show library-tech-tree-overlay-arc --pg` — the 2026-07-12
  `look-feedback` increment-log entry carries the eleven attested items this ADR settles.
- The owner-aligned remold proposal (2026-07-12 conversation): user-flow diagram, walkable
  five-state mock, element-by-element justification — the attestation reference for the inc-9/10
  look legs.
