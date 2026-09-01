# the landform that falls to the shore — three widths and two inset rings

renderer: Google Inc. (NVIDIA Corporation) — ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)
software rasteriser: false
timer query: true · batch 30 · 5 repeats, median reported

## what each arm costs — flat across the WIDTH axis, and paid on the RING axis

⚠ READ THIS TABLE AS TWO. The four width arms must be identical down every column — a
vertical fall creates no geometry, so a moving column there is a BUG and the driver refuses
the run. The two ring arms must MOVE the triangles and must NOT move `sq units`: they divide
parcels, and a division that changed how much land there is has either lost ground or drawn
some of it twice — which on this map is one capability's status painted over another's.

size    arm         band  rings        tris     +%  ringVerts  vertexKB  sq units  draws
one     none            0          -    2264      —        864     238.8     11935      1
one     authored      3.1          -    2264      —        864     238.8     11935      1
one     beach           7          -    2264      —        864     238.8     11935      1
one     shelf        16.5          -    2264      —        864     238.8     11935      1
one     ring            7       3.50    2962   30.8        970     312.4     11935      1
one     ring-pair       7  2.33,4.67    3424   51.2       1076     361.1     11935      1
forest  none            0          -   79240      —      30240    8357.3    421369      1
forest  authored      3.1          -   79240      —      30240    8357.3    421369      1
forest  beach           7          -   79240      —      30240    8357.3    421369      1
forest  shelf        16.5          -   79240      —      30240    8357.3    421369      1
forest  ring            7       3.50  103714   30.9      33950   10938.6    421369      1
forest  ring-pair       7  2.33,4.67  120524   52.1      37660   12711.5    421369      1

## ⚠⚠ DOES THE MESH CARRY THE FALLOFF'S SHAPE? — the sag, in ground units

`shoreRelief` is analytic: it answers the smoothstep at every point. What the map DRAWS is a
triangulation that samples it at the vertices and interpolates flat between them. With no
vertex between the coastline and the first interior corner 8.66 units inland, the drawn shore
is a straight ramp and the falloff's shape is not coarse but ABSENT. The sag is that gap,
measured per band triangle between its own plane and the field at its centroid.

⚠ THE REGION IS FIXED at the 7-unit beach for EVERY arm, never the arm's own band. Measured
over its own band, `authored` reported a LOWER sag than `beach` and read as the better arm —
but only the denominator had moved. Fixed, the order inverts, and `none` becomes a real
baseline: the sine relief's own chordal error over the same ground, with no band at all.

⚠⚠ AND THE FIXED REGION SEPARATES TWO ARMS THAT DELIVER THE BIT-IDENTICAL LAND. `authored`
and `beach` move the same vertices by the same amounts — the void finding — and still report
different sags, because each is measured against its OWN analytic field: `authored`'s
smoothstep finishes in 3.1 units where `beach`'s takes 7, so the straight ramp this mesh is
forced to draw departs from it further. The narrower the authored band, the more of its shape
the mesh fails to carry. That is the void finding as a quantity rather than as an identity.

⚠ SO A LOW SAG DOES NOT BY ITSELF SELECT AN ARM, and `shelf` is the reason to say so: its band
is so wide that the falloff is gentle enough for even this mesh, which is why it reports the
lowest sag of the four width arms. It is still REFUSED, and for a reason this column cannot
see — it lowers ground inland of the pre-coast boundary, and that ground carries props.

⚠ A RING THAT COST TRIANGLES AND DID NOT MOVE THIS BOUGHT NOTHING. That outcome was a live
possibility when this page was written, and the driver refuses the run rather than shipping it.

⚠ `coastal` EXCLUDES the parcels this module refuses on principle rather than on geometry:
one whose vertices are ALL on the coast, and one meeting the coast in two separate runs (five
in 1,854 on the forest). The denominator is the parcels a single band COULD reach.

size    arm         bandTris  maxSag  meanSag   vs beach  divided/coastal  capped  least  inserted
one     none             269   1.179    0.287          —             0/0       0    1.0         0
one     authored         269   3.379    0.720      71.5%             0/0       0    1.0         0
one     beach            269   2.427    0.420       0.0%             0/0       0    1.0         0
one     shelf            269   0.830    0.168     -60.1%             0/0       0    1.0         0
one     ring             712   1.753    0.286     -31.9%           47/53      18    0.1       106
one     ring-pair        913   1.591    0.138     -67.1%           36/53       8    0.5       212
forest  none            9409   2.740    0.294          —             0/0       0    1.0         0
forest  authored        9409   4.147    0.704      71.2%             0/0       0    1.0         0
forest  beach           9409   3.715    0.411       0.0%             0/0       0    1.0         0
forest  shelf           9409   1.674    0.172     -58.3%             0/0       0    1.0         0
forest  ring           24272   3.147    0.268     -34.7%       1657/1849     564    0.1      3710
forest  ring-pair      32118   2.816    0.140     -66.0%       1313/1849     301    0.1      7420

## what each arm MOVED — the land, and the delivered colour

⚠ `rung flips` is the only column a viewer can see. The banded material quantises
dot(n, L) onto the authored ladder, so a band that moved ground but flipped no rung is
invisible on the shipped material however deep its drop. It is a LOWER bound — taken per
vertex, while the shader quantises per fragment.

size    arm         moved/verts     %  maxDrop  meanDrop  height range      rung flips
one     none              0/394   0.0%    0.000     0.000     -3.91…4.03           0
one     authored        255/394  64.7%    4.076     0.665     -3.91…4.03         211
one     beach           255/394  64.7%    4.076     0.665     -3.91…4.03         211
one     shelf           318/394  80.7%    4.076     0.550     -3.91…3.65         244
one     ring            497/636  78.1%    4.076     0.594     -3.91…4.03         391
one     ring-pair       620/759  81.7%    4.076     0.594     -3.91…4.03         491
forest  none            0/13748   0.0%    0.000     0.000     -4.21…4.22           0
forest  authored     8883/13748  64.6%    4.839     0.671     -4.21…4.21        7027
forest  beach        8884/13748  64.6%    4.839     0.671     -4.21…4.21        7029
forest  shelf       10979/13748  79.9%    4.839     0.562     -4.21…4.21        8122
forest  ring        17375/22239  78.1%    4.839     0.565     -4.21…4.21       13948
forest  ring-pair   22058/26922  81.9%    4.839     0.519     -4.21…4.21       17622

## what the shore band moved ON SCREEN — against the frame, and against itself

⚠ the second column is the one to read. A shore band is a thin annulus, so the first column
  is small for every honest arm; the third divides by the arm's own footprint.

size    zoom  arm         % of frame   shore px   beach px
one        2 authored         0.340      13921       14.0
one        2 beach            0.340      13921       14.0
one        2 shelf            0.424      17353       14.0
one        2 ring             0.330      13510       14.0
one        2 ring-pair        0.336      13747       14.0
one        8 authored         5.418     221906       56.0
one        8 beach            5.418     221906       56.0
one        8 shelf            6.790     278119       56.0
one        8 ring             5.257     215324       56.0
one        8 ring-pair        5.344     218896       56.0
one      fit authored         5.635     230807       57.1
one      fit beach            5.635     230807       57.1
one      fit shelf            7.060     289163       57.1
one      fit ring             5.467     223910       57.1
one      fit ring-pair        5.561     227778       57.1
forest     2 authored         1.593      65245       14.0
forest     2 beach            1.593      65262       14.0
forest     2 shelf            2.022      82834       14.0
forest     2 ring             1.649      67547       14.0
forest     2 ring-pair        1.648      67486       14.0
forest     8 authored         5.724     234470       56.0
forest     8 beach            5.724     234470       56.0
forest     8 shelf            7.252     297031       56.0
forest     8 ring             5.670     232224       56.0
forest     8 ring-pair        5.717     234155       56.0
forest   fit authored         0.975      39931        4.0
forest   fit beach            0.975      39930        4.0
forest   fit shelf            1.210      49569        4.0
forest   fit ring             1.005      41149        4.0
forest   fit ring-pair        1.011      41407        4.0

## are these actually different lands? — pixels between adjacent arms

⚠ `authored vs beach` is expected to be ZERO and is the width axis's own finding: both
bands sit inside the vertex void, so the mesh delivers the bit-identical land and the two
committed PNGs are the same file. The ring columns are the ones this increment turns on.

size    zoom  authored|beach   beach|shelf   beach|ring   ring|ring-pair   (pixels)
one        2               0          8145        11056             5453
one        8               0        130106       176784            86988
one      fit               0        135050       183635            90451
forest     2              59         37381        53065            27242
forest     8               0        128522       191019            93120
forest   fit              31         21766        31288            16515

## frame cost (median GPU ms per render, and the spread over repeats)

⚠ REPRODUCIBLE PER ROW, NOT PER TABLE. Take two runs and diff them row by row; quote
  only the rows that agree, and say which were dropped.

size    zoom  arm            ms    spread ms   samples
one        2 none          0.1596      0.0005         5
one        2 authored      0.1567      0.0003         5
one        2 beach         0.1568      0.0004         5
one        2 shelf         0.1576      0.0003         5
one        2 ring          0.1646      0.0004         5
one        2 ring-pair     0.1691      0.0272         5
one        8 none          1.2253      0.6799         5
one        8 authored      0.5457      0.0010         5
one        8 beach         0.5462      0.0028         5
one        8 shelf         0.5432      0.1092         5
one        8 ring          0.5757      0.0020         5
one        8 ring-pair     0.5844      0.0034         5
one      fit none          0.5689      0.0009         5
one      fit authored      0.5677      0.0014         5
one      fit beach         0.5636      0.0015         5
one      fit shelf         0.5655      0.0011         5
one      fit ring          0.5958      0.0011         5
one      fit ring-pair     0.6060      0.0043         5
forest     2 none          0.9669      0.0183         5
forest     2 authored      0.9512      0.6188         5
forest     2 beach         0.3500      0.0029         5
forest     2 shelf         0.3506      0.0021         5
forest     2 ring          0.4359      0.0022         5
forest     2 ring-pair     0.4919      0.0037         5
forest     8 none          0.3505      0.0010         5
forest     8 authored      0.3514      0.0013         5
forest     8 beach         0.3512      0.0003         5
forest     8 shelf         0.3519      0.0012         5
forest     8 ring          0.4382      0.0008         5
forest     8 ring-pair     0.5018      0.0063         5
forest   fit none          0.4584      0.0022         5
forest   fit authored      0.4597      0.0086         5
forest   fit beach         0.4634      0.0023         5
forest   fit shelf         0.4636      0.0852         5
forest   fit ring          0.0874      0.0004         5
forest   fit ring-pair     0.0988      0.0002         5

## does the band cover the beach, or stop short of it?

⚠ THE QUESTION THIS PAGE EXISTS FOR. The coast outsets by 7 ground units, so the beach it
added is 7 units wide (modulated per vertex by the coast wave). A band NARROWER than that
leaves part of the map's own new land standing at full height; a band wider than it starts
lowering ground that was there before the coast, and that ground carries props.

one     authored    band  3.1 units — stops 3.9 units SHORT of the beach's outer edge; no ring — the band has no vertex to bend through; 255/394 vertices moved (64.7%), 211 rung flips
one     beach       band    7 units — covers exactly the land the coast added, and no more; no ring — the band has no vertex to bend through; 255/394 vertices moved (64.7%), 211 rung flips
one     shelf       band 16.5 units — reaches 9.5 units INLAND of the pre-coast boundary; no ring — the band has no vertex to bend through; 318/394 vertices moved (80.7%), 244 rung flips
one     ring        band    7 units — covers exactly the land the coast added, and no more; rings at 3.50 units, sag 0.286 mean over 712 band triangles; 497/636 vertices moved (78.1%), 391 rung flips
one     ring-pair   band    7 units — covers exactly the land the coast added, and no more; rings at 2.33,4.67 units, sag 0.138 mean over 913 band triangles; 620/759 vertices moved (81.7%), 491 rung flips
forest  authored    band  3.1 units — stops 3.9 units SHORT of the beach's outer edge; no ring — the band has no vertex to bend through; 8883/13748 vertices moved (64.6%), 7027 rung flips
forest  beach       band    7 units — covers exactly the land the coast added, and no more; no ring — the band has no vertex to bend through; 8884/13748 vertices moved (64.6%), 7029 rung flips
forest  shelf       band 16.5 units — reaches 9.5 units INLAND of the pre-coast boundary; no ring — the band has no vertex to bend through; 10979/13748 vertices moved (79.9%), 8122 rung flips
forest  ring        band    7 units — covers exactly the land the coast added, and no more; rings at 3.50 units, sag 0.268 mean over 24272 band triangles; 17375/22239 vertices moved (78.1%), 13948 rung flips
forest  ring-pair   band    7 units — covers exactly the land the coast added, and no more; rings at 2.33,4.67 units, sag 0.140 mean over 32118 band triangles; 22058/26922 vertices moved (81.9%), 17622 rung flips

pictures: 20
  ring-forest-fitpx-none.png
  ring-forest-fitpx-beach.png
  ring-forest-fitpx-ring.png
  ring-forest-fitpx-ring-pair.png
  ring-forest-2px-none.png
  ring-forest-2px-beach.png
  ring-forest-2px-ring.png
  ring-forest-2px-ring-pair.png
  ring-forest-8px-none.png
  ring-forest-8px-beach.png
  ring-forest-8px-ring.png
  ring-forest-8px-ring-pair.png
  ring-one-2px-none.png
  ring-one-2px-beach.png
  ring-one-2px-ring.png
  ring-one-2px-ring-pair.png
  ring-one-8px-none.png
  ring-one-8px-beach.png
  ring-one-8px-ring.png
  ring-one-8px-ring-pair.png
