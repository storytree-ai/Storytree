# exp-18 — Topology-eroded prior

**A deterministic apical erosion becomes the GENERATION PRIOR, not the render.**

Round 3, Chapter 2 organic-growth arc · 2026-08-01 · seed block 31800+

---

## The question

Experiment 3 was ranked LAST: it masked a static mature plate, and the owner immediately
read "a slowly revealed picture", not growth — because **the mask WAS the render**.

The insight it missed: *a growth silhouette is a superb PRIOR and a terrible RENDER.*

So exp-18 keeps exp-3's one real asset — a growth sequence whose topology is by
construction the mature tree's own topology — and throws away the part that failed. The
erosion silhouette is never shown. It is fed back into the generator, which redraws each
truncated shape as a whole younger tree.

## The technique in two sentences

One mature hero tree is generated once. A pure-PIL, model-free **anisotropic chamfer
geodesic** is then seeded at that plate's root contact and propagated through its own
alpha; thresholding at ascending distances retreats the silhouette from the branch and
root TIPS back toward the root along the tree's own topology, and a clustered crown mass
derived from the same field is attached at the exposed apex.

Each of the nine resulting silhouettes is fed back to PixelLab as an `init_image` at high
preservation with *"the same tree at an earlier age, redrawn as a complete healthy young
tree, same root, same palette"* — so **the silhouette determines the topology and the model
supplies the younger-tree detail**, and no frame is ever a cropped crop of the mature.

## Result

| | |
|---|---|
| usable track | **yes** |
| frames | 9 |
| canvas | 192 x 192 transparent RGBA8 (fixed) |
| declared root anchor | (96, 188) — the round-1 registration |
| **max root drift, shipped** | **0.5 px in x, 0 px in y** |
| max root drift, model's own (pre-normalisation) | 3.9 px in x (contact centre ranged 91.0 – 94.9) |
| alpha components per frame | **1 on every frame** (no detached crown anywhere) |
| encoded bytes | 38,849 (limit 200,000) |
| decoded RGBA bytes | 1,327,104 (limit 1,600,000) |
| generations spent | **54** |
| depth slot | single organic layer, `tree` slot, painter order unchanged |

Artifacts: `contact-sheet.png` · `preview.gif` · `silhouette-vs-redraw.png` ·
`anchor-stack.png` · `frames/` · `silhouettes/` · `raw/` · `path-growth.md`

---

## 1. The deterministic half (no model involved)

`work/build_priors3.py`. Everything here is pure Python + PIL, seedless and reproducible.

1. **Wood / leaf split** by colour: a pixel is leaf iff `G > R+12` and `G > B+12`.
   Measured on the source plate: 3,935 wood px, 9,538 leaf px.
2. **Root contact band** = the bottom `ROOT_BAND = 4` rows carrying alpha (`root_y = 180`).
   This plate's base is an *arch* — four separate root feet, no central foot — which is why
   the band, not a single point, is the multi-source seed.
3. **Anisotropic chamfer geodesic** `D`, 8-connected, propagated only through the plate's
   own alpha:

   | step | cost |
   |---|---|
   | vertical | `CV = 2` |
   | horizontal | `CH = 5` |
   | diagonal | `CD = 5` |

   `d_max = 480`. `CH > CV` is the load-bearing choice: lateral travel is expensive, so
   distance grows fastest **out along the splayed roots and out to the crown's lateral
   tips**, and slowest straight up the trunk. With the isotropic metric (`CV=CH=CD`,
   `d_max = 339`) the field is dominated by height and the threshold degenerates into a
   bottom-up **wipe** — which is exactly the exp-3 failure re-created in a new costume.
   That was built, looked at, and rejected; the isotropic curve is in `work/erosion-curve.json`.
4. **Stage cut**: stage *k* retains `{p : D(p) <= CUT[k]}`.
5. **Lateral taper** `TAPER[k]`: each horizontal run of the retained WOOD loses that many
   px from each end, never below `MIN_RUN = 2` px. Because no run can vanish, the bottom
   contact row and its span centre are **invariant under the taper by construction**.
6. **Clustered crown mass** `S_k`: the apex band (`D >= max(CUT[k]-60, 0.60*CUT[k])`, and
   within the upper 45 % of the retained stem's own height) is dilated by `CROWN_R[k]`,
   unioned with any retained real canopy, then re-expressed as overlapping discs of radius
   `0.68*CROWN_R` on a lattice of spacing `1.35 * disc radius`, over an eroded solid core.
   Fill tones are **sampled from the plate's own canopy** — light `#77AC4B`, mid `#549041`,
   dark `#27562B` — banded by height with dark disc rims. The mass is hard-stopped 14 px
   above the contact row (a canopy never reaches the ground).

### Measured erosion table

| stage | cut | taper px | crown r px | area px | wood px | real leaf px | synthetic crown px | bbox | height px |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 78 | 5 | 9 | 2043 | 938 | 0 | 1110 | 56,126,134,180 | 55 |
| 1 | 112 | 4 | 11 | 2791 | 1246 | 0 | 1546 | 53,105,134,180 | 76 |
| 2 | 152 | 4 | 14 | 4279 | 1616 | 0 | 2664 | 53,81,134,180 | 100 |
| 3 | 195 | 3 | 17 | 6103 | 2066 | 35 | 4003 | 44,60,134,180 | 121 |
| 4 | 245 | 3 | 19 | 9392 | 2445 | 834 | 6114 | 32,50,148,180 | 131 |
| 5 | 295 | 2 | 20 | 10917 | 2890 | 2785 | 5242 | 33,33,156,180 | 148 |
| 6 | 350 | 1 | 15 | 12574 | 3363 | 5819 | 3392 | 25,11,171,180 | 170 |
| 7 | 412 | 1 | 7 | 12542 | 3367 | 8431 | 744 | 26,5,169,180 | 176 |
| 8 | 480 | 0 | 0 | 13473 | 3935 | 9538 | 0 | 12,10,178,180 | 171 |

Every prior's contact row is 180 and every prior's contact-span centre is 88.5 — the
deterministic half contributes **zero** anchor drift. Full JSON: `work/erosion-table.json`.

## 2. The generated half

`create_image_pixflux` img2img, one call per stage, `init_image_base64` = the prior,
`color_image_base64` = the mature plate (forced palette), **one seed for the whole track**
(31850) so the model's noise field is identical frame to frame.

`init_image_strength` is **not** constant. It is set from the measured synthetic-crown area:

```
strength = round(280 - 90 * min(1, synthetic_crown_px / 5000))
```

Rationale, measured: where the synthetic mass is large (stages 3–6) a flat strength of 260
came back with my flat colour bands **preserved verbatim** — a painted slab behind the
branches, and a hard style pop against the plate-carried late frames. Where the plate's own
canopy carries the crown (stages 7–8) a low strength would have destroyed real art. The
prior is a weaker constraint exactly where it carries least information.

---

## 3. Every prompt, verbatim

**Mature plate** (`create_image_pixflux`, 192x192, `no_background: true`, `view: low top-down`,
`outline: selective outline`, `shading: basic shading`, `detail: medium detail`,
`text_guidance_scale: 8`):

> a single mature broadleaf hero tree standing alone, one continuously connected organism: a thick brown trunk with a flared exposed root base, sturdy branches spreading upward and fusing directly into one rounded moss-green and olive leaf canopy with no gap or seam between branch and leaf, storybook pixel art, transparent background, no ground, no soil, no grass, no dirt tile, no shadow, no frame, no border, exactly one tree

**Redraw pass** (same tool/settings, `text_guidance_scale: 9`, plus `init_image_base64`,
`init_image_strength` per the ramp, `color_image_base64` = the mature plate):

> the same tree at an earlier age, redrawn as a complete healthy young tree, same root, same palette: keep this exact trunk, branch fork and root contact, and turn the flat green mass into a real leafy canopy of layered round moss-green and olive leaf clusters growing directly out of these branches, rounded soft branch tips, one continuously connected organism with no gap or seam between trunk and leaves, storybook pixel art, transparent background, no ground, no soil, no grass, no shadow, no frame, no border, exactly one tree

**Rejected probe prompt A** (fed to a BARE-WOOD prior — see §5, reject class 2):

> the same tree at an earlier age, redrawn as a complete healthy young tree: keep this exact trunk lean, branch fork and root contact, but draw it as a whole living sapling with rounded soft-tipped branch ends and a full leafy moss-green and olive canopy sitting directly on those branches, one continuously connected organism with no gap between trunk and leaves, same brown bark and same green palette, storybook pixel art, transparent background, no ground, no soil, no grass, no dirt tile, no shadow, no frame, no border, exactly one tree

**Rejected probe prompt B** (leaf-first phrasing, also fed to a bare-wood prior):

> a small young leafy tree covered in a full round moss-green and olive leaf canopy, thin brown trunk rising into the middle of the green leaves, one connected organism with no gap between trunk and leaves, storybook pixel art, transparent background, no ground, no soil, no grass, no shadow, no border, exactly one tree

## 4. Model / seed / job id / cost

Model: **PixelLab PixFlux** (`create_image_pixflux`) for every call. Cost: **1 generation each**.
54 generations total. No `create_image_pro`, `edit_image` or `inpaint_image` was used.

### Shipped

| frame | prior | strength | seed | job id | file |
|---|---|---|---|---|---|
| — | — | — | 31801 | `efcd8090-da5f-4625-8204-6080d90974e0` | `raw/mature-b-efcd8090-00.png` (source plate) |
| 00 | prior-00 | 260 | 31850 | `f62aa447-abec-440f-9ed8-c77181e34207` | `raw/v5-00-f62aa447-00.png` |
| 01 | prior-01 | 252 | 31850 | `cb78d704-5c2c-441b-9f83-3f69693ce9bd` | `raw/v5-01-cb78d704-00.png` |
| 02 | prior-02 | 232 | 31850 | `742032b4-9af0-490e-abe1-95bd975aae02` | `raw/v5-02-742032b4-00.png` |
| 03 | prior-03 | 208 | 31850 | `9211e5ec-5f41-4474-9115-063a9f1a1bd4` | `raw/v4-03-9211e5ec-00.png` |
| 04 | prior-04 | 190 | 31850 | `2a558db1-0ad4-4416-bc3d-fe1eb373efe8` | `raw/v4-04-2a558db1-00.png` |
| 05 | prior-05 | 190 | 31850 | `42c7d421-2155-4859-967f-07f5f011179e` | `raw/v4-05-42c7d421-00.png` |
| 06 | prior-06 | 219 | 31850 | `29787cad-e401-4bdf-921d-3b20cc89cc86` | `raw/v4-06-29787cad-00.png` |
| 07 | prior-07 | 267 | 31850 | `02caaf48-02f3-485a-b015-6b215b621e1b` | `raw/v4-07-02caaf48-00.png` |
| 08 | prior-08 | 280 | 31850 | `b9445bcd-e648-4b34-8987-aff211a4122a` | `raw/v4-08-b9445bcd-00.png` |

Every raw model return in this experiment — shipped, superseded and rejected — is in `raw/`
(54 files, named by job id). Superseded whole passes: `v1-*` (seed 31830), `v2-*` (31840),
`v3-*` (31850, flat strength 260), `v4-00..02` (31850) — see §5.

## 5. Rejects, with job id and reason

**Class 1 — the mature plate carried a ground tile.**

| job id | reason |
|---|---|
| `2975155c-996d-401b-82ea-378164197abe` (seed 31800) | grass tuft + green soil patch at the base; ADR-0274 D1/D6 forbid land. Rejected in favour of seed 31801, which is clean and — measured — a **single** connected alpha component (13,473 px, 0 unreachable pixels from the root band). That connectivity is a hard precondition: a plate whose leaf blobs float free of the branches would leave them unreachable by the geodesic and they would vanish from every stage. |

**Class 2 — the model will NOT invent a crown on bare wood.** This is the experiment's most
useful negative result and it cost 7 generations to establish. Feeding a *pure geodesic cut*
(bare trunk, no green — the technique exactly as first specified) back with a
"redraw as a young leafy tree" prompt produced a **cleaned-up bare tree every time**, across
the whole preservation and guidance range:

| job id | strength | text guidance | result |
|---|---|---|---|
| `5133d777-3998-45b9-ba05-90af33705d27` | 380 | 8 | bare |
| `2ee19c28-95e9-446d-af5d-c032545f7d43` | 300 | 8 | bare |
| `7beb289d-3a46-4704-8a04-2979c1af73a1` | 200 | 8 | bare |
| `2d70d4a2-5699-4c03-b41c-13b77a4035eb` | 300 | 20 | bare |
| `11d06c87-d4c3-4ad6-91a4-fcd1b552df97` | 200 | 18 | bare |
| `f4e55931-c556-475c-b909-bbba7bfe9b17` | 130 | 12 | bare |
| `ed736539-75be-439e-b525-79a29e83d183` | 80 | 10 | bare |

Saved as `raw/probe-bare*.png`. **Physical reason:** a mature tree's lower trunk carries no
leaves, so *any* root-seeded geodesic cut is bare wood by construction, and the init image
reads as "dead tree" no matter what the text says. The technique as literally specified
cannot work. The fix — the clustered crown mass of §1.6, still derived only from the same
distance field and the plate's own palette — is what makes it work.

**Class 3 — superseded whole passes** (all normalised and looked at, all rejected on sight):

| pass | seed | fault |
|---|---|---|
| `v1-*` | 31830 | smooth-blob priors. frame-00 read as a green **worm** lying on the roots (the isotropic apex band swallowed the splayed root tips, so the dilation ran horizontally); hard style pop at 05→06. |
| `v2-*` | 31840 | first clustered priors. Crowns at 05/06 read as **discrete balls** — lattice spacing equalled the crown radius, so the discs barely overlapped. |
| `v3-*` | 31850 | flat strength 260. Frame 04 came back as a **three-band flat slab** with the branches painted on top — my colour prior survived the "redraw" untouched. This is what produced the strength ramp. |
| `v4-00..02` | 31850 | good, but the early cuts (60/100/145) left frame 00 as a leaf tuft on a stump with no visible stem. Re-cut at 78/112/152 as `v5`; stages 3–8 are byte-identical priors, so only three frames were regenerated. |

**Class 4 — anchor definition, rejected on measurement.** The first normaliser took the
contact centre as the *midpoint of the bottom alpha row's span*. One stray root spur swings
that by 25–30 px: it shifted frame 06 by +32 px and clipped it against the canvas edge
(bbox `x1 = 192`). Replaced by the **alpha-weighted x-centroid over the bottom 10 rows**,
which held every frame's shift to +1…+5 px. Both are in `work/normalize.py`, with the
rejected one documented in the docstring.

**Class 5 — proportional taper, rejected on measurement.** An attempt to slim the young
stages' root flare by shrinking each run to a *fraction* of its width (0.30 at stage 0)
severed the arch joining the two root feet; the largest-component filter then dropped one
foot and **the contact centre jumped from 88.5 to 111.5 — 23 px of anchor drift.** A
protected variant (no taper within 6 rows of contact, ramping over 20 rows) restored the
anchor but changed the wood mask by ≤ 80 px, i.e. it did nothing. Abandoned; see §7.

---

## 6. Measured per-frame registration

`work/registration.json`. Alpha threshold 32. Anchor (96, 188). Canvas 192 x 192.

| frame | model's own contact centre (pre-norm) | author-time shift | contact row / centre | drift x | drift y | alpha bbox | alpha px | components | bytes |
|---|---|---|---|---|---|---|---|---|---|
| 00 | 94.5 | +2, +7 | 188 / 96.5 | **+0.5** | 0 | 60,133,137,189 | 2120 | **1** | 1672 |
| 01 | 91.5 | +5, +8 | 188 / 96.5 | **+0.5** | 0 | 55,114,141,189 | 2826 | **1** | 2111 |
| 02 | 92.5 | +3, +9 | 188 / 95.5 | **-0.5** | 0 | 56,91,138,189 | 4395 | **1** | 2708 |
| 03 | 94.9 | +1, +8 | 188 / 95.9 | **-0.1** | 0 | 46,69,136,189 | 5970 | **1** | 2999 |
| 04 | 92.0 | +4, +7 | 188 / 96.0 | **-0.0** | 0 | 36,58,155,189 | 9497 | **1** | 4526 |
| 05 | 92.5 | +4, +6 | 188 / 96.5 | **+0.5** | 0 | 37,39,160,189 | 10765 | **1** | 5435 |
| 06 | 91.0 | +5, +8 | 188 / 96.0 | **-0.0** | 0 | 31,20,177,189 | 12444 | **1** | 6211 |
| 07 | 92.4 | +4, +8 | 188 / 96.4 | **+0.4** | 0 | 29,14,176,189 | 12686 | **1** | 6840 |
| 08 | 93.2 | +3, +8 | 188 / 96.2 | **+0.2** | 0 | 15,18,182,189 | 13414 | **1** | 6347 |

- **Max shipped root drift: 0.5 px in x, 0 px in y.**
- The model's *unaided* root axis held to a 3.9 px spread (91.0 – 94.9) across nine
  independent generations. The author-time shift that closes it is +1…+5 px in x and
  +6…+9 px in y — small, and no frame is clipped by the canvas.
- **Alpha area is strictly monotonic**: 2120 → 2826 → 4395 → 5970 → 9497 → 10765 → 12444 →
  12686 → 13414. No frame shrinks.
- **Every frame is one 8-connected alpha component.** There is no detached crown, no floating
  blob and no orphan leaf cluster anywhere in the track. `anchor-stack.png` overlays all nine
  silhouettes with the declared anchor drawn on top: the base is tight, not smeared.
- One author-time cleanup was applied and is reported, not swallowed: a **2 px** stray fleck
  below the roots on frame 02 (components under 12 px are erased before measuring, because
  that fleck was the bottom-most alpha row and dragged the contact row 1 px down).

### The direct rebuttal to exp-3

If a frame were a masked reveal of a static plate, the pixels **inside the previous
frame's silhouette** would be byte-identical — 0 % repainted. Measured here
(`work/redraw-delta.json`):

| pair | new alpha px | shared px | shared px repainted | % repainted |
|---|---|---|---|---|
| 00→01 | 980 | 1846 | 1412 | 76.5 % |
| 01→02 | 1826 | 2569 | 1753 | 68.2 % |
| 02→03 | 2242 | 3728 | 2577 | 69.1 % |
| 03→04 | 3844 | 5653 | 4147 | 73.4 % |
| 04→05 | 2077 | 8688 | 6794 | 78.2 % |
| 05→06 | 3583 | 8861 | 5910 | 66.7 % |
| 06→07 | 2162 | 10524 | 5485 | 52.1 % |
| 07→08 | 1312 | 12102 | 5551 | 45.9 % |

**Mean 66.3 % of the overlapping silhouette is genuinely repainted between consecutive
frames** (exp-3's number is 0 % by construction). The tree is redrawn at every age, not
uncovered.

---

## 7. Honest self-assessment against the recorded failure list

| failure | verdict |
|---|---|
| **seam** (crown attached to trunk along a visible join) | **absent.** There is no join to see: the crown mass is grown from the retained branch tips of the same plate, so the trunk enters the canopy rather than meeting it. |
| **gap** (exp-2's canopy↔trunk gap that read "buggy") | **absent, and structurally impossible.** The prior is one 8-connected mask by construction, and all nine shipped frames measure as 1 component. |
| **floating crown** | **absent.** Same measurement. |
| **blob** | **mostly absent, one soft spot.** Frames 00–02 are honest small trees with visible forked stems. Frame 05's crown is the least articulated in the track — a lobed mass with a hollow through the middle where the branches show. It does not read as a blob but it is the weakest canopy. |
| **pasted-on crown** | **absent.** Nothing is composited; every frame is a single generated image. |
| **silhouette snap** | **absent.** Alpha area is monotonic and the anchor stack shows no base smear. Frame 05→06 is the largest single step (3583 new px). |
| **style pop** | **largely fixed, not perfectly.** v3 had a hard pop at 04 (flat slab); the strength ramp removed it. Residually, frames 00–03 have slightly softer, larger leaf clumps than 06–08's tight small circles, because the early crowns are the model's invention and the late ones are the plate's own art. Visible if you look for it; I do not think it reads as a different tree. |
| **topology mutation** | **absent by construction, and this is the technique's core claim.** Every stage's wood is a subset of the same plate's wood pixels; the trunk lean, the fork position, the branch angles and the root-flare shape are literally the same pixels at every age. |

### What is genuinely weak

1. **The root footprint never grows.** The contact band is the geodesic seed, so it sits at
   distance 0 and is retained at every stage: frame 00 wears the mature tree's full
   root flare (bbox width 78 px against a 55 px tall tree). It reads more "young tree beside
   old roots" than "seedling". This is not a tuning miss — it is the price of the zero-drift
   anchor, and §5 class 5 records the measured attempt to fix it that broke the anchor by
   23 px. **Frame 00 is the weakest frame in the track.**
2. **The crown mass is authored geometry, not model art.** The §1.6 disc lattice is my
   construction. It is deterministic, derived only from the same distance field and the
   plate's own three canopy tones, and 66 % of it is repainted by the model — but it is
   honest to say the *shape* of a young crown here comes from a parameter, not from the tree.
3. **`create_map_object` was never pulled.** The tree is generated in isolation and does not
   yet sit in the real island plate at the real camera.

### What I would do next

1. **Re-seed the geodesic from a plate with a single central root foot.** This plate's base
   is a four-footed arch, which is what forces the whole contact band to be the seed. A
   plate with one continuous base would let the seed be a narrow central column, the splayed
   flare would then carry real geodesic distance, and it would *erode away* for the young
   stages — killing weakness 1 without touching the anchor.
2. **Run the whole track through one `edit_image` call** (one consistent edit across
   multiple frames, cost per call not per frame) to close the residual style gradient
   between the model-invented early crowns and the plate-carried late ones.
3. **Generate the mature plate with `create_map_object` against the real island plate**, so
   the source topology is already at the app camera and in the island palette, then erode
   that. The erosion is indifferent to where its source came from.
4. Ship the erosion as an **author-time tool**, not a one-off: `work/build_priors3.py` turns
   any single mature plate into an N-stage growth prior in seconds with no model calls, so a
   second tree species costs one generation plus N cheap redraws.

---

## 8. Constraint compliance (ADR-0274 / 0277 / 0219 / 0237)

- **PixelLab is author-time only.** No vendor call, credential, hostname, model call or
  asset-owned clock appears in this directory or would reach a build artifact or the browser.
  The token was never printed and lives only in the scratchpad env file.
- **Island: untouched.** No land, coast, ground tile, soil or composite was generated. Every
  mature-plate candidate carrying a ground tuft was rejected (§5 class 1). Experiment 6's
  connected SVG accretion remains the island control.
- **Plants: untouched.** The ADR-0277 D2 registered cutout/pose plant track is unchanged.
- **App owns the clock.** These are nine ordered appearance frames on a fixed canvas with a
  fixed count and a declared anchor. Nothing here carries timing, easing, holds, progress,
  Next/Back/Replay, reduced-motion settlement or painter order. `preview.gif` is a review
  aid, not an asset.
- **Camera.** Matches the round-1 accepted tree track's framing at 192 x 192 with the
  (96, 188) anchor. It is a low, slightly-elevated storybook view rather than a strong
  isometric — the same read as the current provisional leader, not a new camera.
- **Budget.** 38,849 encoded bytes / 1,327,104 decoded RGBA bytes, 9 frames, 1 organic
  layer — inside the round-1 envelope on every axis.
- **Nothing outside this directory was written.**

## 9. Files

```
raw/                        54 unmodified model returns, named by job id
  mature-a-2975155c-00.png    rejected source plate (ground tuft)
  mature-b-efcd8090-00.png    the SOURCE PLATE for the whole track
  probe-bare*.png             the 7 bare-wood refusals (§5 class 2)
  probe-crown*.png            the crown-mass strength probes
  probe-p04-*.png             the stage-4 strength probes that set the ramp
  v1-* v2-* v3-*              superseded whole passes
  v4-* v5-*                   the shipped returns
silhouettes/
  prior-00..08.png            the deterministic priors, in plate colours
  mask-00..08.png             the same masks as flat ink
frames/frame-00..08.png     the normalised, anchored, transparent track
contact-sheet.png           the nine frames on a checkerboard
silhouette-vs-redraw.png    each prior beside its redraw — the technique's whole claim
anchor-stack.png            all nine silhouettes stacked over the declared anchor
preview.gif                 384x384 nearest-neighbour dark-field preview
path-growth.md              the path-growth treatment
work/                       every script, every args file, every measurement JSON
```
