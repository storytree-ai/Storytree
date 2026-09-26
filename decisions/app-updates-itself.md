# The app updates itself

- **Front cover of:** stories/app.md, capability 4
- **Full record:** ADR-0637 in storytree 0.2's decision log, storytree-ai/storytree02 (`pnpm storytree library artifact adr-0637`)

The app keeps itself up to date by itself, so nobody rebuilds it when main moves, and it never runs unmerged work.

The owner asked for it answering the question of whether the app you open runs merged main: "Can't
we also bring an auto update feature for 0.3? this feels important for good user experience, i'd
hope it works better than 0.2 which seems to constantly need updating every time main moves." He
approved the capability's description on 2026-09-27: on his machine the app runs from its own copy
of merged main, notices new merges within a few minutes, and rebuilds and restarts itself in the
background. Before first users, an installed app does the same from published releases.

The work is in two halves, a split the recording session made. The half for storytree 0.3's own
development is built now. The users' half needs an installer in place of today's portable exe, and
waits with the rest of the users' work, due before first users.
