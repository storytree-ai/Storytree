# Whose signature is that? — the UAT blooms on the shipped map

**2026-08-31 · RTX 2060 (ANGLE/OpenGL, `software=false`) · one run, three arms, four frames each.**
Instrument: `packages/forest-world-r3f/harness/shipped-blooms.html`, driven by
`pnpm --filter @storytree/forest-world-r3f measure-shipped-blooms`. Increment:
`draw-the-uat-blooms-on-the-shipped-map` on `adopt-the-land-into-the-shipped-map-arc`.

## What a flower is, and why this is a misreport question rather than a feature

A flower on the map is **one UAT criterion the owner has signed** — one per criterion, 1:1
(ADR-0226 D4). So it is a claim about **proof state**, and it is bound by the same fence as the
land's colour: a unit reads as the state it holds and as no other (ADR-0392 D5 / ADR-0398 D7).

Both shipped call sites passed `blooms: 0` and said so in terms. The reason was structural: a
`cell-ground` descriptor named the **capability** whose parcel it was and nothing else, so a count
read off that stream had no island to spend it on. One `dressIslandFromKit` call over a whole map
scatters the blooms over **every cell it is given** — which means one story's signatures land on
every other story's island. Drawing none was the honest state.

`worldTo3D` now carries an **island id** on every family that belongs to exactly one island, and
`src/map-dressing.ts` spends each story's signatures on that story's own ground.

## The census — the acceptance test, and it is a count rather than a picture

| arm | drawn | signed | **misattributed** | undrawn | stories wearing an unsigned flower |
|---|---|---|---|---|---|
| `none` | 0 | 210 | 0 | 210 | 0 |
| `scattered` | 210 | 210 | **92** | 92 | **14** |
| `attributed` | 210 | 210 | **0** | 0 | 0 |

Every placed flower is attributed to the island it stands on (nearest island centre) and compared
against what that story actually signed. The forest is the real map's own 35-island status mix, so
some stories have signed all ten and some have signed nothing — a criterion defaults to `proven` on
a HEALTHY island and `pending` on any other, because a story's status IS its own signed UAT verdict
(ADR-0033 d.4).

**14 stories that have signed nothing wear flowers in the `scattered` arm.** That is the map
asserting a signature on work nobody has checked, which is the one direction this surface may not be
wrong in.

`scattered` is **not a picture of the past** — the map never drew it. The count was pinned at zero
precisely so it could not happen. It is here because "we avoided a misreport" is not something a
reader can check without seeing the misreport.

## The pictures — and which of them can show anything

`blooms-<arm>-<view>.png`, three arms × four views.

| view | what it frames | does the defect show? |
|---|---|---|
| `fit` | the whole forest on a laptop screen | **no** — see below |
| `2px` | a neighbourhood, centred on the crowd's anchor island | barely — a flower is a few pixels |
| `8px` | the anchor island, which is HEALTHY and signed all ten | **no** — both arms are correct there |
| `unsigned-8px` | **a story that has signed NOTHING**, same 8 px/unit | **yes** |

⚠ **`blooms-none-fit.png` and `blooms-scattered-fit.png` came back BYTE-IDENTICAL**, and that is a
finding rather than a bug: a bloom is 4 ground units wide and the forest is ~3,500, so at the
overview 210 misplaced flowers are sub-pixel and paint nothing at all. A comparison taken only at
the overview zoom would have shown a clean bill of health for a map that was misreporting 92
signatures. That is why `unsigned-8px` exists, and why the census — not the pixels — is what the
driver refuses on.

**The frame to look at is the pair `blooms-scattered-unsigned-8px.png` against
`blooms-attributed-unsigned-8px.png`.** Same island, same story, same land, same camera. The
scattered arm stands small flowers on it; the attributed arm does not, because this story has signed
nothing.

## What else the arms differ in, said out loud

The trees move slightly between arms, and it is the **same change** rather than a second one. A
placement is seeded from the capability's position in the list it was handed, so numbering island
12's capabilities from 0 instead of from 132 puts its objects on a different spot inside the same
parcel. Every arm stands an object for exactly the same capabilities (374 of them; the map holds 385
parcels and `unknown` grows nothing). What the per-island call buys is that **an island's dressing is
now a function of that island alone** — it looks the same drawn by itself as it does in a crowd of
thirty-five.

## ⚠ A confound this found in the crowd instrument, and fixed

`crowdCells` builds the 35-island forest by copying ONE fixture island's descriptors 35 times. Until
this increment those copies carried **no island id at all** (the stream had none) **and the same
eleven capability ids**. Both are now re-stamped per island. Without the second half the page would
have differed by **374 trees** between the whole-map and per-island arms — and that difference would
have been the fixture's, not the dressing's.

## Numbers you can re-derive

- 385 parcels across the forest (35 islands × 11 capabilities), 374 of them grow an object.
- 210 signatures held across the forest; 584 objects standing in the two arms that draw them.
- The kit MERGES every placement of a part into one mesh, so the renderer sees 5 meshes without
  flowers and 6 with. `meshes` is not an object count and the report keeps the two apart.
