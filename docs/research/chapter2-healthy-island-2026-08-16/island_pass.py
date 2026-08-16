#!/usr/bin/env python3
"""THE ONE PLACE THIS PASS DECLARES ITS STORY, ITS CAMERA, AND WHAT IT SUPPRESSES.

Imported by every other script here, so nothing downstream carries a second copy of any of them —
the discipline `grass.py` established for the prior pass, inherited rather than restated.

WHAT THIS PASS IS FOR. The owner looked at the dressed island on 2026-08-16 and said, verbatim:

    "your grown triangle grass doesnt look good enough yet, it looks buggy, and theres bvlack grass
     and ther colors bleeding through, the green on the land is not consistent either with different
     mesh trianles rendering different colors, and the mess lines as well add to the noise. I think
     all of this was okay in 2d, but in 3d its very noisy and doesnt make space for shadows which is
     one of the bigger wins of going 3d."

and then: *"i think we focus on getting a healthy island looking right"*, and *"which story node did
you pick anyways"*.

That last question is the one this pass is built around. The answer, for every appearance judgment
this arc has made so far, was `fork-spike-island` — a SYNTHETIC fixture. See `README.md`.
"""

# --------------------------------------------------------------------------- the story
#: THE REAL STORY NODE. Chosen by `census_healthy.ts` over the whole corpus, not by preference.
#:
#: Sixteen stories render fully green. This is the only one that is green at BOTH TIERS: all eleven
#: capabilities carry their OWN signed pass (none leans on ADR-0097 gate coverage), AND all ten of
#: its UAT test criteria roll up `proven`. That second half is what makes it the right surface rather
#: than merely a green one — under ADR-0226 D4 a flower IS a UAT criterion with its verdict read from
#: FORM, so on any other candidate the island's flowers would all be closed buds. `library-tech-tree-
#: overlay` is larger (17 capabilities) but every one of its 4 criteria is `pending`, which would put
#: four unproven buds on a picture whose whole point is that it is healthy.
#:
#: 11 capabilities -> a 13-hex territory; real contract counts 4..7; 10 proven criteria.
STORY_ID = "context-traversal-capture"

#: The fixture every prior judgment on this arc was actually made against, kept here because this
#: pass renders it BESIDE the real island — a claim about a fixture is worth what the picture beside
#: it is worth.
FIXTURE_STORY_ID = "fork-spike-island"

# --------------------------------------------------------------------------- the camera
#: Owner look verdict, 2026-08-16 ("50 degrees looks good, i think we go with this"), for the
#: RESEARCH TRACK's authoring angle and nothing more. A NAMED PARAMETER even though it is signed:
#: that is what keeps a future change priced as a render rather than as a decision.
PASS_ELEVATION_DEG = 50.0

#: The shipped constant, quoted so the gap between "the track's angle" and "the app's angle" is
#: visible in the source rather than only in prose. For the reader, not for arithmetic.
APP_LAND_CAMERA_ELEVATION_DEG = 20.0

# --------------------------------------------------------------------------- the ground
#: OWNER-DIRECTED 2026-08-16: flat green. `mottle` (26.5% of delivered px) and `carpet`
#: (grass-as-ground) are both DECLINED and are not re-rendered — `carpet` was refused on a number by
#: PR #1371 (897 px of grass tracking no test count against 275 that do, i.e. ~3 in 4 grass px would
#: assert tests that do not exist, eating 9% of the real signal). `flat` costs nothing and leaves
#: 100% of non-ground pixels meaningful.
GROUND = "flat"

# --------------------------------------------------------------------------- the seams
#: OWNER-DECIDED 2026-08-16: *"i think we remove the mesh lines"*, and in the same message *"the mess
#: lines as well add to the noise"*. PR #1372 measured the whole question on the fixture — the
#: 214-cell relaxed mesh draws EVERY line, the 17 hex TILES draw ZERO, so `hex-off` is pixel-identical
#: to as-is and there is no hex-only lever. This pass EXECUTES that decision and RE-MEASURES its cost
#: on the real island, because the 4-of-77 figure was measured on the mixed-status spike fixture and
#: a boundary count is a function of the status mix.
#:
#: The delivered surface keeps the COAST stroke and drops every interior cell seam.
SEAMS_DRAWN = frozenset({"coast"})
#: The baseline it is measured against: the island exactly as the track has been shipping it.
SEAMS_AS_IS = frozenset({"coast", "cell", "hex"})

# --------------------------------------------------------------------------- the vocabulary
#: THE RENDERED STATUS VOCABULARY — what the map can actually draw, which is NOT the schema's six.
#: `apps/studio/src/lib/worldStatus.ts` folds `building -> proposed` (ADR-0038) and
#: `unhealthy -> mapped` (ADR-0296, owner-directed: the world draws no withered form), and
#: `retired` units are filtered out of the world entirely. Green comes only from a signed pass
#: (ADR-0040). `verify.py` re-derives this set from that file rather than trusting this line.
RENDERED_VOCABULARY = ("healthy", "mapped", "proposed", "unknown")

#: The five tokens `fork-spike-island` painted with. TWO of them — `building` and `unhealthy` — are
#: not in the rendered vocabulary above, so the fixture has been showing the owner colours the
#: shipped map cannot produce for any story in any state.
FIXTURE_TOKENS = ("healthy", "building", "proposed", "mapped", "unhealthy")
