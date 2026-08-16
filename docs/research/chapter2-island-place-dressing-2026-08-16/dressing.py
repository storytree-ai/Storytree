#!/usr/bin/env python3
"""THE ONE PLACE THIS PASS DECLARES ITS CAMERA, ITS SEED AND ITS VOCABULARY.

Imported by every other script here, so the angle is a NAMED PARAMETER rather than a literal
scattered through the pass. The owner signed 50 degrees by LOOKING on 2026-08-16 ("50 degrees looks
good, i think we go with this"), choosing it over 45 from `camera-elevation-45-vs-50.png`. That is a
verdict about THIS RESEARCH TRACK's authoring angle and nothing more:

    `LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` IS STILL 20 AND IS NOT
    TOUCHED BY THIS PASS. The app-side constant is fenced by `frontend-visual-judgment-arc`'s
    dogfood fixture (owner, 2026-08-15). An angle settled for the research track is not the app
    adopting it.

Keeping it a parameter is part of the deliverable. The whole reason the owner can pick angles
cheaply is that this track prices them as RENDERS: `python render_all.py --elev 45` re-renders and
re-composes the entire pass at another angle with no source edit. A literal is what takes that away.
"""

# --------------------------------------------------------------------------- the camera
#: The angle this pass is authored at. Owner look verdict, 2026-08-16. Overridable end-to-end with
#: `render_all.py --elev <deg>`; nothing downstream carries a second copy of it, because every
#: script reads the angle back out of `island.json`'s own camera block.
PASS_ELEVATION_DEG = 50.0

#: The shipped constant, quoted so the gap between "the track's angle" and "the app's angle" is
#: visible in the source rather than only in prose. Read from `camera.ts` by `emit_dressing.ts`
#: and asserted there — this copy is for the reader, not for arithmetic.
APP_LAND_CAMERA_ELEVATION_DEG = 20.0

#: Every deterministic choice in the pass keys off this string.
SEED = "island-place-dressing-2026-08-16"

# --------------------------------------------------------------------------- the vocabulary
#: WHAT MAY BE SCATTERED, AND WHAT MAY NOT.
#:
#: This is not a free art-direction choice: the app has ALREADY DECIDED its vegetation vocabulary
#: (ADR-0226 D4), and inventing a parallel one would re-commit the ADR-0367 D5 failure — art that
#: says something the meaning layer does not authorise — one layer up from the palette bug the
#: interior fork caught. The rule the app settled on:
#:
#:     grass          = a capability's TESTS
#:     dead grass     = an UNHEALTHY capability (the existing status wilt)
#:     a flower       = the story's UAT, and ONLY UAT — form reads the verdict
#:     the decorative wildflower / anemone / heather-bell accents are RETIRED
#:
#: So this pass renders THAT vocabulary properly instead of adding a prettier one beside it. See
#: the README's "What was deliberately left out" for the three things an unfenced dressing pass
#: would obviously have added, and the dated owner call that already refused each.
DECOR_KINDS = (
    "tuft",        # grass — a capability's tests. Three variants.
    "tuft-dead",   # the status wilt, for an unhealthy capability.
    "shrub",       # a foliage dome (`parcel-shrub`), the mid-height mass between grass and tree.
    "flower",      # ONE per UAT criterion, form reading the verdict. Island-level, not per-cell.
)
