# Camera rasterisation comparison

Build: `9379cfe0+act2-bottom-anchor` · Chromium 148.0.7778.96 · 1600×1000

| variant | map nodes | baseline p50 | variant p50 | delta | samples (base/variant) |
| --- | ---: | ---: | ---: | ---: | ---: |
| final-product | 0-4k | 16.70 ms | 16.70 ms | -0.00 ms | 940/869 |
| final-product | 4-8k | 66.80 ms | 83.30 ms | +16.50 ms | 168/165 |
| final-product | 8-12k | 150.00 ms | 166.60 ms | +16.60 ms | 12/15 |
| final-product | 12-20k | 249.90 ms | 200.00 ms | -49.90 ms | 169/223 |

| variant | admitted run spans |
| --- | ---: |
| growth-only | 29.57 s, 29.58 s, 31.00 s, 29.55 s |
| final-product | 29.65 s, 29.65 s, 29.07 s, 30.25 s |

Accepted runs: 8; rejected runs: 0.
