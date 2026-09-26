# The forest's capability tree

- **Front cover of:** stories/forest.md
- **Full record:** ADR-0632 in storytree 0.2's decision log, storytree-ai/storytree02 (`pnpm storytree library artifact adr-0632`)

The forest has seven capabilities, each with a shelf of decisions, and each story node is a grove with one tree per capability.

In build order they are story nodes, the capability tree, the story node render, the drill-down,
agent capability claims, unclaimed work and library entrypoints. They are named for what the forest
durably does, and every decision that shapes one is a book on its shelf. A changed decision is a new
book on a shelf, never a renamed capability.

A story node's place comes from its story alone: the next place on a spiral, in the order stories
were created, fixed for good. A retired story leaves open sea, so nothing ever moves a node, and the
planet decided for later is a new placement book rather than a rewrite.

A story node is a grove, one tree per capability, in the land look endorsed for 0.2, ported as it
stands with no art research. A tree's size follows the work state and its leaves follow the agent's
report: a seedling while planned or being built, a pale tree once landed with nothing reported, a
full green tree once landed and reported passing, and a dead tree once landed with a failing report.
The leaves are always labelled as the agent's own report.

The arc surface owns the one rule for planned, in progress or landed, and the live reading that
keeps both views current. The forest uses both. The 0.3 app gets a story of its own for its frame:
its database, the project switcher, hosting the views with the Forest | Arcs toggle, and which
project it opens on.

"Unplanned activity" is renamed "unclaimed work": the edits and commands of a session holding no
claim at that moment, decided by the claim and never by the files. It is never guessed onto a story,
and it is listed beside the forest with a count always in view.

Left out compared with 0.2: its layout engine and 2D map, the rig for measuring looks, the website
mount, health from signed verdicts, wisps, the story panel's sub-map, session dock and library
drawer, citation lists, art research and a second style, and 0.2's forest in the 0.3 app.
