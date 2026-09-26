# The arc surface's capability tree

- **Front cover of:** stories/arc-surface.md
- **Full record:** ADR-0638 in storytree 0.2's decision log, storytree-ai/storytree02 (`pnpm storytree library artifact adr-0638`)

The arc surface is 0.2's arc surface ported whole, as a read-only overlay over the forest, in five capabilities.

In build order they are Work states, Agents on the board, Arc surface, Waits and Briefing. Work
states is the one rule for every part, increment and arc, so no two views can disagree: a part is
planned, in progress or landed; an increment is landed or not completed once closed, and waiting on
you, queued, held or open before that; an arc is waiting, blocked, claimed, idle, quiet, parked or
closed. The forest reads the part states, and the live reading that keeps both views current,
which belongs to the Arc surface capability.

The owner's choices: in progress means started and not landed, at both grains; an idle holder still
holds, and nothing reads as free to take; no health on the overlay, since health stays on the
forest; and a proposal means not built yet, never waiting on him. Only work held on a question he
has not answered waits on him.

An increment has four colours: green landed; red anything not completed, whether it failed, was
withdrawn or was closed with nothing recorded; yellow waiting or blocked, on his answer or on other
work; grey open. The record keeps which kind of close it was, and the hover shows it.

The floor-health lamp is not in the MVP overlay and not cut: it comes back later, reworked.
Capability claims and increment-level claims both stay, as in 0.2, and an arc reads claimed when a
live session holds any claim on its work.

The library and the agent link store and read what the overlay shows of increments, questions and
waits, and those sides are decided in their own revised trees.
