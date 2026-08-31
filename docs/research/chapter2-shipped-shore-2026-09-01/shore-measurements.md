# the landform that falls to the shore — three widths, one instrument

renderer: Google Inc. (NVIDIA Corporation) — ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)
software rasteriser: false
timer query: true · batch 30 · 5 repeats, median reported

## what each arm costs — every column identical by construction, and checked

⚠ THE POINT OF THIS TABLE IS THAT IT DOES NOT VARY. A vertical fall creates no geometry,
so a moving column here would be a BUG rather than a cost, and the driver refuses the run.

size    arm         band  tris  ringVerts  vertexKB  sq units  draws
one     none            0  2264        864     238.8     11935      1
one     authored      3.1  2264        864     238.8     11935      1
one     beach           7  2264        864     238.8     11935      1
one     shelf        16.5  2264        864     238.8     11935      1
forest  none            0 79240      30240    8357.3    421369      1
forest  authored      3.1 79240      30240    8357.3    421369      1
forest  beach           7 79240      30240    8357.3    421369      1
forest  shelf        16.5 79240      30240    8357.3    421369      1

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
forest  none            0/13748   0.0%    0.000     0.000     -4.21…4.22           0
forest  authored     8883/13748  64.6%    4.839     0.671     -4.21…4.21        7027
forest  beach        8884/13748  64.6%    4.839     0.671     -4.21…4.21        7029
forest  shelf       10979/13748  79.9%    4.839     0.562     -4.21…4.21        8122

## what the shore band moved ON SCREEN — against the frame, and against itself

⚠ the second column is the one to read. A shore band is a thin annulus, so the first column
  is small for every honest arm; the third divides by the arm's own footprint.

size    zoom  arm         % of frame   shore px   beach px
one        2 authored         0.340      13921       14.0
one        2 beach            0.340      13921       14.0
one        2 shelf            0.424      17353       14.0
one        8 authored         5.418     221906       56.0
one        8 beach            5.418     221906       56.0
one        8 shelf            6.790     278119       56.0
one      fit authored         5.635     230807       57.1
one      fit beach            5.635     230807       57.1
one      fit shelf            7.060     289163       57.1
forest     2 authored         1.593      65245       14.0
forest     2 beach            1.593      65262       14.0
forest     2 shelf            2.022      82834       14.0
forest     8 authored         5.724     234470       56.0
forest     8 beach            5.724     234470       56.0
forest     8 shelf            7.252     297031       56.0
forest   fit authored         0.975      39931        4.0
forest   fit beach            0.975      39930        4.0
forest   fit shelf            1.210      49569        4.0

## are the three shapes actually three shapes?

size    zoom  authored vs beach   beach vs shelf   (pixels)
one        2                  0             8145
one        8                  0           130106
one      fit                  0           135050
forest     2                 59            37381
forest     8                  0           128522
forest   fit                 31            21766

## frame cost (median GPU ms per render, and the spread over repeats)

⚠ REPRODUCIBLE PER ROW, NOT PER TABLE. Take two runs and diff them row by row; quote
  only the rows that agree, and say which were dropped.

size    zoom  arm            ms    spread ms   samples
one        2 none          0.1601      0.0857         5
one        2 authored      0.1566      0.0005         5
one        2 beach         0.1567      0.0005         5
one        2 shelf         0.1576      0.0003         5
one        8 none          1.2261      0.6801         5
one        8 authored      0.5467      0.0363         5
one        8 beach         0.5257      0.0013         5
one        8 shelf         0.5228      0.0018         5
one      fit none          0.5488      0.0014         5
one      fit authored      0.5463      0.0018         5
one      fit beach         0.5448      0.0006         5
one      fit shelf         0.5458      0.0010         5
forest     2 none          0.9441      0.0109         5
forest     2 authored      0.9542      0.6051         5
forest     2 beach         0.3496      0.0011         5
forest     2 shelf         0.3512      0.0007         5
forest     8 none          0.3535      0.0012         5
forest     8 authored      0.3547      0.0015         5
forest     8 beach         0.3550      0.0013         5
forest     8 shelf         0.3547      0.0009         5
forest   fit none          0.4538      0.0004         5
forest   fit authored      0.4502      0.0019         5
forest   fit beach         0.4519      0.0033         5
forest   fit shelf         1.1678      0.7264         5

## does the band cover the beach, or stop short of it?

⚠ THE QUESTION THIS PAGE EXISTS FOR. The coast outsets by 7 ground units, so the beach it
added is 7 units wide (modulated per vertex by the coast wave). A band NARROWER than that
leaves part of the map's own new land standing at full height; a band wider than it starts
lowering ground that was there before the coast, and that ground carries props.

one     authored    band  3.1 units — stops 3.9 units SHORT of the beach's outer edge; 255/394 vertices moved (64.7%), 211 rung flips
one     beach       band    7 units — covers exactly the land the coast added, and no more; 255/394 vertices moved (64.7%), 211 rung flips
one     shelf       band 16.5 units — reaches 9.5 units INLAND of the pre-coast boundary; 318/394 vertices moved (80.7%), 244 rung flips
forest  authored    band  3.1 units — stops 3.9 units SHORT of the beach's outer edge; 8883/13748 vertices moved (64.6%), 7027 rung flips
forest  beach       band    7 units — covers exactly the land the coast added, and no more; 8884/13748 vertices moved (64.6%), 7029 rung flips
forest  shelf       band 16.5 units — reaches 9.5 units INLAND of the pre-coast boundary; 10979/13748 vertices moved (79.9%), 8122 rung flips

pictures: 20
  shore-forest-fitpx-none.png
  shore-forest-fitpx-authored.png
  shore-forest-fitpx-beach.png
  shore-forest-fitpx-shelf.png
  shore-forest-2px-none.png
  shore-forest-2px-authored.png
  shore-forest-2px-beach.png
  shore-forest-2px-shelf.png
  shore-forest-8px-none.png
  shore-forest-8px-authored.png
  shore-forest-8px-beach.png
  shore-forest-8px-shelf.png
  shore-one-2px-none.png
  shore-one-2px-authored.png
  shore-one-2px-beach.png
  shore-one-2px-shelf.png
  shore-one-8px-none.png
  shore-one-8px-authored.png
  shore-one-8px-beach.png
  shore-one-8px-shelf.png
