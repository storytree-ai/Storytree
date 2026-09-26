# Decisions about the whole project sit on no shelf

- **Front cover of:** stories/library.md, capability 9
- **Full record:** ADR-0631 in storytree 0.2's decision log, storytree-ai/storytree02 (`pnpm storytree library artifact adr-0631`)

A decision about the whole project is the front cover of no story or capability: it sits on no shelf.

The owner chose this for the MVP spec, minimal viable TDD and the license, which each govern the
whole project. There is no shelf for the project, and no link is copied onto every story.

0.3's librarian draws the links between these decisions and the capability-level covers that rest
on them, once it is set up. Until then they are found by searching the library. No 0.3 librarian
exists yet, and this decision does not design one. The seed never writes a decision's links, so the
links a librarian draws survive every run.

The same holds for the decision that dropped verified health, whose story will not exist in 0.3. It
also holds for the planet's decision until its story has a file. When that file lands, the planet's
decision names the story and moves onto its shelf in place.

In the decision files, such a decision's `Front cover of:` line says `none`. A file that forgets
the line is refused, so a decision never lands on no shelf by accident.
