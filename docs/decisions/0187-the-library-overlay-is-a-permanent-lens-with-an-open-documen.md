---
status: accepted
decided: 2026-07-12
amends: [185]
---
# ADR-0187: The library overlay is a permanent lens with an Open document overlay, and the overview renders the mockup's load-bearing information design

## Status

accepted (2026-07-12) — decided/directed by the owner in conversation on 2026-07-12, after attesting
the increment-5 overview against the original mockup. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask. Amends ADR-0185 in part (its drawer state machine, dec 1, and
its overview look, dec 4); ADR-0185 otherwise stands (the peek/finder/subgraph doctrine, dec 2/3, the
forest-cozy palette, dec 5, and the v1-no-backend-change scope, dec 6, are unchanged — dec 6 already
anticipated the wire extension this ADR now makes load-bearing for the look).

## Context

Increment 5 landed the overview constellation (the empty-state whole-corpus dot field, ADR-0185 dec 4)
and was staged for the owner's look attestation. The owner rejected the look against the original
mockup: the shipped surface was a sparse, washed-out light-theme scatter of grey squares and a few
dots — no edges, no importance encoding beyond raw degree, no explanatory chrome, poorly framed — and
the drawer carried a "×" close button and a "Dive" action. The mockup is a legible constellation: a
graph with **drawn edges**, nodes **sized and colour-deepened by how load-bearing they are**, a sidebar
that explains the interaction ("type to make matches pulse … or zoom in and titles appear on their
own"), a footer legend ("dot = artifact · square = adr · size + depth of colour = how load-bearing ·
only the heaviest carry titles out here"), and hover cards. Two forces this exposes:

1. **The mockup's visual language is load-bearing.** Size + depth-of-colour = load-bearing, and the
   edges are the reference graph. ADR-0185 dec 4 realised importance as **degree-only** because
   `load_bearing` is not yet on the studio wire (that enrichment was deferred to the wire-extension
   increment, dec 6). So the polished look is **downstream of the wire/data**, not a cosmetic pass over
   the degree-only field — the increment order in the original plan had this backwards.
2. **The drawer's interaction model needs to change.** The owner wants a **permanent lens**, not a
   closable drawer, and reading an artifact should be an explicit **"Open"** into a **separate
   full-detail overlay over the map** (like opening a document), not the inline "Dive" slot ADR-0185
   dec 1 / increment 4 built.

The owner also chose to keep the **forest-cozy LIGHT palette** (ADR-0185 dec 5 stands) — the target is
the mockup's *information design* rendered in a polished forest-cozy light, NOT the mockup's dark
charcoal aesthetic.

## Decision

**1. The library overlay is a permanent lens (amends dec 1).** When invoked over the map it has **no
"closed" state and no "×" close button** — it is a permanent drawer/lens with the live map beneath it.
The `closed → peek → dive` state machine of ADR-0185 dec 1 is retired in favour of a permanent lens
plus the Open overlay below; leaving the library is via map navigation, not an in-panel close. (The
exact re-invocation/dismissal affordance is a shell-design detail for the plan, not decided here.)

**2. Reading an artifact is "Open", a separate full-detail overlay over the map (amends dec 1 / the
increment-4 dive).** The action is **renamed from "Dive" to "Open"**. It is triggered by
**double-clicking a node** (in the constellation or the focus subgraph) **or an "Open" button**. The
drawer carries a **small description section at the bottom** showing the currently-selected artifact's
summary + the Open button (the selection preview). Open renders a **separate overlay over the map
showing the full artifact detail — a document view, "like opening a Word doc"** — distinct from the
inline collapse-to-a-bar dive slot ADR-0185 dec 1 / increment 4 built. (The existing body renderers —
AssetView / DocView — are reused inside that overlay; the change is the container and the trigger, not
the body rendering.)

**3. The overview renders the mockup's load-bearing information design (sharpens dec 4).** The
empty-state constellation is a **legible reference graph**, not a scatter:

- **Nodes:** dot = artifact, square = ADR (unchanged).
- **Size + depth-of-colour = how load-bearing** (NOT raw degree). In the overview, the colour channel
  encodes **importance** (load-bearing depth) plus the search-glow pulse — kind is shape, not colour;
  there is no "selected chain" on this surface (that is the focus subgraph, dec 3), so this does not
  conflict with dec 3's "colour = state". This **requires the `load_bearing` signal on the wire**, so
  the wire extension is a **prerequisite** for the look (see consequence).
- **Edges are drawn** between nodes (the `references` graph, plus the richer typed edges as the wire
  carries them) — the overview reads as a tech-tree graph. The one-SVG-element-per-node perf discipline
  (dec 4) extends to edges with the same budget-consciousness (draw the structurally-meaningful edges;
  do not render a hairball).
- **Only the heaviest nodes carry titles by default; zoom reveals more** ("titles appear on their own
  as you zoom") — the LOD ladder of dec 4 stands, refined so title density tracks importance and zoom.
- **Explanatory chrome:** a sidebar with the search prompt + the interaction guidance copy + the corpus
  count ("161 artifacts · 184 adrs"), and a footer legend naming the encoding.
- **Hover cards:** full title + kind + status on hover, at any zoom.
- **Framing:** the constellation is **fit-to-view** (a bounded viewBox/bbox that frames the whole
  corpus) — closing the increment-5 gap where the un-framed field rendered offscreen. Fit-to-view is
  part of the overview's **geometry** (deterministic, machine-testable), not a look-only concern.
- **Palette:** polished **forest-cozy LIGHT** (dec 5 stands) — the mockup's structure, not its dark
  colour.

## Consequences

- **The remaining arc re-sequences.** Because the overview's size/colour/edges depend on `load_bearing`
  + typed edges on the wire, the **wire extension moves ahead of the overview look-overhaul** (it was
  the reverse). The exact decomposition is the arc's plans (ADR-0183), authored fresh against this ADR —
  not fixed here. Increment 5 (the degree-only overview) stays landed as the geometric scaffold the
  look-overhaul builds on; it is refined, not reverted.
- **The shipped increment-5 look was honestly rejected at the operator-attested leg (ADR-0070 stage 2)
  working exactly as intended** — the machine geometry was green, the owner caught the appearance gap.
- ADR-0185 stays `accepted` and mostly intact; this ADR overturns only its drawer state machine (dec 1)
  and raises its overview look bar (dec 4). The finder (dec 2), focus subgraph (dec 3), forest-cozy
  palette (dec 5), and no-backend-v1 framing (dec 6) are unchanged.
- **New surfaces to build:** the permanent-lens shell (retiring the close/closed state), the bottom
  description section + "Open" trigger, the separate full-detail document overlay, and the overview
  look-overhaul (edges + load-bearing size/colour + sidebar/legend chrome + hover cards + fit-to-view
  framing). Each routes through the prove-it-gate two-stage (machine geometry, operator-attested look),
  with the look riding the owner's attestation.
- The retro friction on the un-framed SVG
  (`friction-svg-cap-fit-to-view-framing-falls-in-the-geometry-look-gap`) is directly answered:
  fit-to-view framing is promoted into the overview's geometry contract here, so it can no longer sign
  green while rendering offscreen.

## References

- ADR-0185 (the library-as-tech-tree-overlay design this amends in part), ADR-0110 (owner design-time
  alignment is ratification), ADR-0070 (two-stage proof — machine geometry, operator-attested look),
  ADR-0171 (stress layout), ADR-0183 (arc/plan kinds — the disposable plans carry the re-sequenced
  decomposition), ADR-0161 (the node-keyed context DAG the typed edges come from).
- The arc: `library-tech-tree-overlay-arc` (`storytree arc show library-tech-tree-overlay-arc --pg`);
  increments 1–5 landed (#691/#693/#699/#701/#704).
- The owner's original mockup and the increment-5 attestation screenshots (2026-07-12 conversation).
