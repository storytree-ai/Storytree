# Camera rasterisation comparison

Build: `c7eaac1b+act2-regrow-camera-final` · Chromium 148.0.7778.96 · 1600×1000

| variant | map nodes | baseline p50 | variant p50 | delta | samples (base/variant) |
| --- | ---: | ---: | ---: | ---: | ---: |
| final-product | 0-4k | 16.70 ms | 16.70 ms | +0.00 ms | 1632/1617 |
| final-product | 4-8k | 33.30 ms | 33.30 ms | +0.00 ms | 498/496 |
| final-product | 8-12k | 66.60 ms | 50.10 ms | -16.50 ms | 38/39 |
| final-product | 12-20k | 116.70 ms | 116.70 ms | +0.00 ms | 342/348 |

| variant | admitted run spans |
| --- | ---: |
| growth-only | 29.57 s, 29.55 s, 29.57 s, 29.55 s |
| final-product | 29.55 s, 29.58 s, 29.55 s, 29.57 s |

Accepted runs: 8; rejected runs: 0.
