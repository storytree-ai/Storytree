# Every knowledge read is recorded, and a new note has a default place

- **Front cover of:** stories/agent-link.md, capability 6
- **Full record:** ADR-0624 in storytree 0.2's decision log, storytree-ai/storytree02 (`pnpm storytree library artifact adr-0624`)

Every note an agent reads through storytree's tools is recorded, with the session, how it was found and how much.

Each entry says which session read which note, and when; how the agent found it (a search result, a
link from another note, a shelf, or its id); and whether it took a peek or the whole note. The record
is only ever added to, from the day it was built: nothing earlier is reconstructed. It lives in the
agent link's own activity log, beside the library.

It records what was reached, never what helped. No view may present a read as evidence that a note
was useful, and two reads close together are not evidence that a link was followed.

When an agent writes a note and names no place for it, the note goes onto the shelf of the
capability its session has claimed. A decision becomes a front cover there. A memory or definition
links to the cover the session last opened on that shelf, or else to the shelf's first book. With an
empty shelf nothing is added and the agent is told so. With no claim there is no default, and a
place the agent names always wins. (The knowledge model redirected this default the same day it was
decided, since a note can no longer link to a capability.)

It was decided so that a later view of where agents go in the knowledge starts from real history,
with roots to hang it on, rather than starting blind.
