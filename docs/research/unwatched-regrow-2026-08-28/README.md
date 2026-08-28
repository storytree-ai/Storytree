# The forest keeps growing while you are not watching it — before and after

You reported this from using the app: *"it freezes and stops growing … it should just keep growing
in the background else it looks like its bugged out."* You were right, and there were two separate
faults, not one. This is the proof you can watch.

## Watch these two first

| | |
|---|---|
| **`before-park.webm`** | Start the forest growing, click through to another screen, come back after 8 seconds. The forest is **fully grown**. It never grew — it jumped. |
| **`after-park.webm`** | Same thing, today's code. You come back to a forest that is **two thirds grown and still growing**, because eight seconds of real growing happened while you were away. |

Then the second fault:

| | |
|---|---|
| **`before-occlude.webm`** | Start it growing, cover the window, uncover it. It is **stuck at 20%** and stays stuck. The only way out is the "Regrow the forest" button. That is the freeze you saw. |
| **`after-occlude.webm`** | Same thing, today's code. Still growing. |

## The numbers, taken in the same run

The app prints its own progress in the panel at the top of every frame — *depth, islands, pathways
growing, percent* — so every still below is self-describing. Away for 8 seconds each time, over the
real 35-island forest, in a real browser.

|  | left at | came back at | 2 s later | what happened |
|---|---|---|---|---|
| **before** — clicked to another screen | 18.7% | **100%** | 100% | jumped straight to finished |
| **before** — window covered | 18.4% | **20.4%** | 20.4% | froze, and never moved again |
| **after** — clicked to another screen | 18.1% | 63.1% | 78.5% | kept growing, still growing |
| **after** — window covered | 19.1% | 54.9% | 68.7% | kept growing, still growing |

The "2 s later" column is the one that matters most. A forest that has stopped and a forest that is
growing look identical in a single screenshot; only a second reading a moment later tells them
apart. On the old code that column never moves. On today's code it always does.

The stills are the same three moments from each run: `01-left-at`, `02-returned`,
`03-two-seconds-later`. `measurements.json` has the raw figures.

## Why it broke, in one paragraph

The growth was being measured in *frames drawn* rather than in *time passed*. That works only while
somebody is looking, because a browser stops drawing frames to a window nobody can see. Two
defences had been built on top of that: one deliberately stopped the growth when the window was
hidden (and nothing ever started it again), and the other threw the run away entirely when you left
the map screen. Today the growth is measured against the clock instead, so a gap in drawing is just
time that passed, and the next frame drawn reports where the forest genuinely got to. Both defences
were deleted along with the thing they were defending. Nothing is drawn while you are away — an
unwatched forest still costs nothing.

## How to re-run this yourself

```
pnpm db:up
pnpm --filter studio capture:unwatched
```

It runs both versions of the code against one server and one forest, so the only thing that differs
between the two halves is the fix. **It checks its own honesty**: the "before" half has to actually
reproduce both faults, or the script fails and tells you its answer cannot be trusted. That guard
has already earned its keep once — the first version of it looked for the freeze in the wrong place
and reported a defect it had failed to reproduce, rather than quietly passing.
