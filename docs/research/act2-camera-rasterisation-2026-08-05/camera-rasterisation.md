# Camera rasterisation comparison

Build: `5d74c9b1150bf35661a6fe60d88781aa31b0d613+camera-rasterisation-probe` · Chromium 148.0.7778.96 · 1600×1000

| variant | map nodes | baseline p50 | variant p50 | delta | samples (base/variant) |
| --- | ---: | ---: | ---: | ---: | ---: |
| svg-camera | 0-4k | 16.70 ms | 16.70 ms | +0.00 ms | 566/302 |
| svg-camera | 4-8k | 216.70 ms | 249.90 ms | +33.20 ms | 72/31 |
| svg-camera | 8-12k | 516.70 ms | 533.30 ms | +16.60 ms | 8/4 |
| svg-camera | 12-20k | 399.95 ms | 533.35 ms | +133.40 ms | 124/54 |
| html-compositor | 0-4k | 16.70 ms | 16.70 ms | +0.00 ms | 566/236 |
| html-compositor | 4-8k | 216.70 ms | 366.70 ms | +150.00 ms | 72/23 |
| html-compositor | 8-12k | 516.70 ms | 766.70 ms | +250.00 ms | 8/3 |
| html-compositor | 12-20k | 399.95 ms | 516.70 ms | +116.75 ms | 124/53 |

Accepted runs: 8; rejected runs: 0.
