#!/usr/bin/env python3
"""THE ONE PLACE THIS PASS DECLARES ITS CAMERA, ITS SEED, AND THE TWO FORKS IT SWEEPS.

Imported by every other script here, so nothing downstream carries a second copy of any of them.

THE CAMERA IS A NAMED PARAMETER, NOT A LITERAL — inherited unchanged from the island-place-dressing
pass, and for the same reason: this track prices camera angles as RENDERS rather than as decisions,
and a literal sitting in four scripts is what takes that away. `python render_all.py --elev 45`
rebuilds the whole pass at another angle with no source edit.

    `LAND_CAMERA_ELEVATION_DEG` in `packages/forest-world/src/camera.ts` IS STILL 20 AND IS NOT
    TOUCHED BY THIS PASS. The app-side constant is `frontend-visual-judgment-arc`'s live dogfood
    fixture and the owner has refused a fix (2026-08-15: "i dont want this fixed by any session").
    An angle settled for the research track is not the app adopting it.

WHAT THIS PASS IS FOR. The owner looked at the island-place-dressing pass and said the grass "looks
rather ugly", then proposed doing "something basic (maybe even just a flat green) and then use the ^
for grass that represents test density or other signals".

THE SECOND HALF OF THAT IS ALREADY DECIDED AND IS NOT REOPENED HERE. ADR-0226 (accepted 2026-07-21,
owner-directed) D2 fixed grass = a capability's TESTS with `grassCount = 2 + tests*1.9`; D3 fixed
grass HEALTH as the capability's proof state (unhealthy = dead grass, status-driven, explicitly not
per-test); D4 fixed flowers = the story's UAT criteria 1:1 with the verdict read from FORM, and
RETIRED the decorative wildflower so that "flower" means UAT and only UAT. So this pass adds no
member to the vocabulary, proposes no new mapping, and restores no decorative species.

WHAT IS GENUINELY OPEN, and all this pass measures:
  1. the LOOK of the grass — does the decided vocabulary read as SIGNAL rather than noise at
     delivered pixel scale, and what makes it so;
  2. the BASE treatment, which is new — how much of the ground cover should the terrain carry.
"""

# --------------------------------------------------------------------------- the camera
#: Owner look verdict, 2026-08-16 ("50 degrees looks good, i think we go with this"), for the
#: RESEARCH TRACK's authoring angle and nothing more.
PASS_ELEVATION_DEG = 50.0

#: The shipped constant, quoted so the gap between "the track's angle" and "the app's angle" is
#: visible in the source rather than only in prose. For the reader, not for arithmetic.
APP_LAND_CAMERA_ELEVATION_DEG = 20.0

#: Every deterministic choice in the pass keys off this string.
SEED = "grass-reads-as-signal-2026-08-16"

# --------------------------------------------------------------------------- fork 1: the normals
#: THE MIX SWEEP, RE-MEASURED FOR GRASS. The mechanism is the arc's triage item 1 — shared custom
#: vertex normals from a smooth ANALYTIC proxy — which shipped for the hero tree's CROWN at 0.22.
#:
#: 0.22 IS NOT INHERITED, and the arc's own record says why it must not be: it is a STRICT optimum
#: for a 4200 px crown, picked against exp-16's highlight-cap structure, and between 0.32 and 0.45
#: the crown's highlight percolates into one blob and FALLS. A tuft is 26-42 delivered pixels. The
#: mechanism transfers; the number is a different measurement on a different instrument.
NORMAL_MIXES = (0.00, 0.15, 0.30, 0.45, 0.60, 0.80, 1.00)

# --------------------------------------------------------------------------- fork 2: the geometry
#: `blade` — N independent twisting ribbons, one object each. The vendored pass's tuft, and the
#:           thing the owner called ugly.
#: `clump` — the same N ribbons WELDED into one mesh standing on a low base mound. The arc's one
#:           transferable strategic takeaway ("sparse clump meshes rather than individual blades")
#:           made geometry rather than left as advice.
GEOMETRIES = ("blade", "clump")

# --------------------------------------------------------------------------- fork 3: the base
#: THE OWNER'S OWN PROPOSAL, TAKEN SERIOUSLY RATHER THAN AS A THROWAWAY — and the constraint makes
#: it STRONGER here than in the game the technique reference is aimed at. The prior pass measured
#: the whole dressing at 1.01% of delivered land pixels, so detail below the quantisation threshold
#: does not become subtle, it becomes noise.
#:
#: `flat`    — the settled `b++` ground exactly as delivered: one flat status-tinted fill per cell.
#:             The owner's "maybe even just a flat green".
#: `mottle`  — the same ground carrying a low-frequency two-shade variation, drawn from the SAME
#:             (token x shade) pairs already in the closed palette. Ground interest that adds no
#:             second thing meaning "tests".
#: `carpet`  — grass used AS the ground treatment: a uniform per-cell quota of tufts that does NOT
#:             scale with test count, laid under the signal tufts. This is the naive reading of the
#:             technique reference's "rely ~80% on the terrain treatment", and it is rendered so it
#:             can be REFUSED WITH A NUMBER rather than with an opinion — see `signalFraction` in
#:             `grass-report.json`. Under ADR-0226 grass MEANS tests, so a carpet of grass that
#:             tracks no test count is art asserting something the meaning layer does not authorise,
#:             which is the ADR-0367 D5 failure. The measurement is what makes that concrete.
BASES = ("flat", "mottle", "carpet")

#: The per-cell tuft quota the `carpet` base lays down, independent of any capability's test count.
CARPET_PER_CELL = 3

# --------------------------------------------------------------------------- signal legibility
#: THE PASS'S MOST IMPORTANT MEASUREMENT. A prettier grass that no longer distinguishes 3 tests from
#: 30 has FAILED, and that is quantified rather than asserted from an impression.
#:
#: The counts a capability is driven to, spanning the app's own rule `round(2 + tests*1.9)` from an
#: untested capability to one far past anything the corpus carries.
TEST_COUNTS = (0, 1, 2, 3, 5, 8, 13, 21, 30)

#: The two statuses the D3 health read has to separate at delivered scale.
HEALTH_PAIR = ("healthy", "unhealthy")
