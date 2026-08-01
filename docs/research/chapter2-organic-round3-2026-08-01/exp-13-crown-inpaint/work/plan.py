"""The single-canvas mask ladder for exp-13-crown-inpaint.

One base canvas (`base.png`). Every stage is an inpaint of THAT canvas with a
rectangular mask. For the four trunk stages we additionally alpha-clear every
pixel ABOVE the mask, so the mature branch structure is not in the picture yet;
the model then draws the young tip inside the mask while the pixels BELOW the
mask stay frozen. No stage ever composites two separately authored sprites.
"""

# (name, mask_x, mask_y, mask_w, mask_h, young)
# `young` = a trunk stage: every pixel above the mask's BOTTOM edge is alpha-cleared
# (inside the mask as well as outside it), so the mature branch structure is simply
# not in the picture yet and no orphan twig can survive outside the mask. The model
# redraws the young top inside the mask, growing out of the frozen root flare below.
LADDER = [
    ("f0", 60, 126, 72, 52, True),
    ("f1", 50, 100, 92, 58, True),
    ("f2", 38,  72, 116, 68, True),
    ("f3", 26,  44, 140, 76, True),
    ("f4", 58,  28, 72, 48, False),
    ("f5", 48,  24, 96, 68, False),
    ("f6", 36,  20, 120, 86, False),
    ("f7", 26,  16, 140, 102, False),
    ("f8", 20,  12, 152, 120, False),
]

PROMPTS = {
    "f0": ("a young sapling seedling: one slim brown stem rising straight up out of the old spread "
           "roots below it, carrying five or six large pointed green leaves alternating along its "
           "length, the leaves drawn big and clear with a lighter green top face and a dark green "
           "underside, dark brown outline, storybook game pixel art; everything around the little "
           "sapling is completely empty transparent background, no soil, no grass, no other plant"),
    "f1": ("the same sapling grown taller and slightly thicker: a slim brown stem continuing "
           "straight up out of the roots below, splitting near the top into two shoots, each "
           "carrying several large pointed green leaves, light and dark green leaf faces, dark "
           "brown outline, storybook game pixel art; everything else is completely empty "
           "transparent background, no soil, no grass, no second plant"),
    "f2": ("the same tree as a young whip: a slender brown trunk rising out of the roots below and "
           "forking into three or four thin limbs, each limb carrying a spray of pointed green "
           "leaves, still open and airy so you can see between the limbs, light and dark green "
           "leaf faces, dark brown outline, storybook game pixel art; everything around it is "
           "completely empty transparent background, no soil, no grass, no second plant"),
    "f3": ("the same tree as a tall young sapling: the brown trunk below continues up and spreads "
           "into an open crown of thin brown branches, each carrying loose clusters of pointed "
           "green leaves, airy enough to see branches through the gaps, light and dark green leaf "
           "faces, dark brown outline, storybook game pixel art; everything around the branches is "
           "completely empty transparent background, no soil, no grass"),
    "f4": ("a small tuft of fresh green leaves budding directly on the topmost twigs of the bare "
           "tree below, a compact little clump of round leafy foliage wrapped tightly around those "
           "exact twigs so the twigs pass through it, two tones of green with a dark outline, "
           "storybook pixel art; the rest of the area is empty transparent background"),
    "f5": ("a small young canopy of round leafy clumps sitting on the upper branches of the bare "
           "tree below, the leaf clumps growing out along those exact branches and letting the "
           "brown twigs show through the gaps, two tones of green with a dark outline, storybook "
           "pixel art; the rest of the area is empty transparent background"),
    "f6": ("a spreading green canopy of round leafy clumps filling the upper half of this tree's "
           "branches, each clump attached to the brown branches beneath it with twig tips poking "
           "out at the edges, layered light and dark green with a dark outline, storybook pixel "
           "art; the rest of the area is empty transparent background"),
    "f7": ("a broad green canopy of overlapping round leafy clumps covering most of this tree's "
           "branches, growing outward and downward along the limbs, brown branches visible through "
           "the gaps underneath, layered light and dark green with a dark outline, storybook pixel "
           "art; the rest of the area is empty transparent background"),
    "f8": ("the full mature canopy of this tree: a broad dome of overlapping round green leafy "
           "clumps covering every branch tip, sitting down onto the main limbs so the crown and the "
           "brown boughs merge into one shape, layered light and dark green with a dark outline, "
           "storybook pixel art; the rest of the area is empty transparent background"),
}
