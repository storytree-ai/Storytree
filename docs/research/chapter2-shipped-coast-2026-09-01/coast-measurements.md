# the coast clip — three shapes, one instrument

renderer: Google Inc. (NVIDIA Corporation) — ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)
software rasteriser: false
timer query: true · batch 30 · 5 repeats, median reported

## what each arm costs, and what it bounds

size    arm         tris  ringVerts  vertexKB  sq units  cap bound  least  draws
one     none         1640        656     173.0      8425        0/0   1.00      1
one     outset       1640        656     173.0     12009       4/52   0.70      1
one     project      1640        656     173.0     11827       4/52   0.90      1
one     subdivide    2264        864     238.8     11935       6/52   0.70      1
forest  none        57400      22960    6053.9    294860        0/0   1.00      1
forest  outset      57400      22960    6053.9    423752   124/1820   0.60      1
forest  project     57400      22960    6053.9    416933    72/1820   0.80      1
forest  subdivide   79240      30240    8357.3    421401   109/1820   0.60      1

## what the coast MOVED — against the frame, and against the coast itself

⚠ the second column is the one to read. A coast is a thin annulus, so the first column
  is small for every honest arm; the third divides by the arm's own footprint.

size    zoom  arm         % of frame   coast px   beach px
one        2 outset           0.379      15529       14.0
one        2 project          0.363      14882       14.0
one        2 subdivide        0.370      15139       14.0
one        8 outset           6.069     248575       56.0
one        8 project          5.831     238845       56.0
one        8 subdivide        5.919     242423       56.0
one      fit outset           6.311     258513       57.1
one      fit project          6.063     248340       57.1
one      fit subdivide        6.154     252080       57.1
forest     2 outset           1.808      74063       14.0
forest     2 project          1.745      71484       14.0
forest     2 subdivide        1.790      73316       14.0
forest     8 outset           6.178     253046       56.0
forest     8 project          5.944     243474       56.0
forest     8 subdivide        6.024     246762       56.0
forest   fit outset           1.092      44737        4.0
forest   fit project          1.053      43124        4.0
forest   fit subdivide        1.079      44181        4.0

## are the three shapes actually three shapes?

size    zoom  outset vs project   project vs subdivide   (pixels)
one        2               2778                   4252
one        8              45156                  67760
one      fit              46954                  70572
forest     2              13035                  20771
forest     8              46799                  64904
forest   fit               7605                  12471

## frame cost (median GPU ms per render, and the spread over repeats)

⚠ REPRODUCIBLE PER ROW, NOT PER TABLE. Take two runs and diff them row by row; quote
  only the rows that agree, and say which were dropped.

size    zoom  arm            ms    spread ms   samples
one        2 none          0.1324      0.1847         5
one        2 outset        0.1518      0.0004         5
one        2 project       0.1494      0.0004         5
one        2 subdivide     0.1580      0.0006         5
one        8 none          0.9457      0.0003         5
one        8 outset        0.5059      0.4480         5
one        8 project       0.5020      0.0033         5
one        8 subdivide     0.5248      0.0017         5
one      fit none          0.4086      0.0003         5
one      fit outset        0.5263      0.0020         5
one      fit project       0.5209      0.0010         5
one      fit subdivide     0.5476      0.0019         5
forest     2 none          0.7018      0.0051         5
forest     2 outset        0.7588      0.0104         5
forest     2 project       0.7637      0.0107         5
forest     2 subdivide     0.3513      0.6053         5
forest     8 none          0.2578      0.0011         5
forest     8 outset        0.8042      0.0044         5
forest     8 project       0.8048      0.0047         5
forest     8 subdivide     0.9850      0.6385         5
forest   fit none          0.3293      0.0010         5
forest   fit outset        0.3769      0.0018         5
forest   fit project       0.3721      0.0022         5
forest   fit subdivide     0.4572      0.0005         5

## how much of each arm's own coast the fold cap had to give up

one     outset      4/52 rim vertices capped (7.7%), the worst kept 0.70 of its beach
one     project     4/52 rim vertices capped (7.7%), the worst kept 0.90 of its beach
one     subdivide   6/52 rim vertices capped (11.5%), the worst kept 0.70 of its beach
forest  outset      124/1820 rim vertices capped (6.8%), the worst kept 0.60 of its beach
forest  project     72/1820 rim vertices capped (4.0%), the worst kept 0.80 of its beach
forest  subdivide   109/1820 rim vertices capped (6.0%), the worst kept 0.60 of its beach

pictures: 20
  coast-forest-fitpx-none.png
  coast-forest-fitpx-outset.png
  coast-forest-fitpx-project.png
  coast-forest-fitpx-subdivide.png
  coast-forest-2px-none.png
  coast-forest-2px-outset.png
  coast-forest-2px-project.png
  coast-forest-2px-subdivide.png
  coast-forest-8px-none.png
  coast-forest-8px-outset.png
  coast-forest-8px-project.png
  coast-forest-8px-subdivide.png
  coast-one-2px-none.png
  coast-one-2px-outset.png
  coast-one-2px-project.png
  coast-one-2px-subdivide.png
  coast-one-8px-none.png
  coast-one-8px-outset.png
  coast-one-8px-project.png
  coast-one-8px-subdivide.png
