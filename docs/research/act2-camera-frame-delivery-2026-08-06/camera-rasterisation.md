# Camera rasterisation comparison

Build: `7c739fbb+act2-camera-frame-delivery-protocol5` · Chromium 148.0.7778.96 · 1600×1000

## Painting frames

| variant | map nodes | baseline p50 | variant p50 | delta | samples (base/variant) |
| --- | ---: | ---: | ---: | ---: | ---: |
| final-product | 0-4k | 16.70 ms | 16.70 ms | +0.00 ms | 905/879 |
| final-product | 4-8k | 50.10 ms | 66.60 ms | +16.50 ms | 152/146 |
| final-product | 8-12k | 150.00 ms | 133.40 ms | -16.60 ms | 26/22 |
| final-product | 12-20k | 266.60 ms | 266.65 ms | +0.05 ms | 124/124 |
| final-product | 20k+ | 341.65 ms | 316.60 ms | -25.05 ms | 48/48 |

## Committed stable-picture frames

Target: final-product 20k+ stable-picture p50 is no more than 16.7 ms above the same-build growth-only control. Verdict: **pass**.

| variant | map nodes | control stable-picture p50 | variant stable-picture p50 | delta | samples (control/variant; min each) | adequacy | target verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| svg-camera | 0-4k | — | — | — | 0/0; min 100 | inadequate | — |
| svg-camera | 4-8k | — | — | — | 0/0; min 100 | inadequate | — |
| svg-camera | 8-12k | — | — | — | 0/0; min 100 | inadequate | — |
| svg-camera | 12-20k | — | — | — | 0/0; min 100 | inadequate | — |
| svg-camera | 20k+ | 16.70 ms | — | — | 654/0; min 100 | inadequate | — |
| html-compositor | 0-4k | — | — | — | 0/0; min 100 | inadequate | — |
| html-compositor | 4-8k | — | — | — | 0/0; min 100 | inadequate | — |
| html-compositor | 8-12k | — | — | — | 0/0; min 100 | inadequate | — |
| html-compositor | 12-20k | — | — | — | 0/0; min 100 | inadequate | — |
| html-compositor | 20k+ | 16.70 ms | — | — | 654/0; min 100 | inadequate | — |
| final-product | 0-4k | — | — | — | 0/0; min 100 | inadequate | — |
| final-product | 4-8k | — | — | — | 0/0; min 100 | inadequate | — |
| final-product | 8-12k | — | — | — | 0/0; min 100 | inadequate | — |
| final-product | 12-20k | — | — | — | 0/0; min 100 | inadequate | — |
| final-product | 20k+ | 16.70 ms | 33.30 ms | +16.60 ms | 654/461; min 100 | adequate | pass |

## Admitted run-span envelope

| variant | admitted run spans |
| --- | ---: |
| growth-only | 32.27 s, 30.47 s, 30.18 s, 30.22 s |
| final-product | 32.67 s, 30.23 s, 30.97 s, 30.18 s |

Accepted runs: 8; rejected runs: 0.
