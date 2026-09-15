# The arc queue caret, before and after it grew — 2026-09-15

Evidence for `arc-queue-caret-is-big-enough-to-find` on `arc-queue-and-question-legibility-arc`.
Owner, 2026-09-15, after he could not find the five 3D arcs queued behind `inner-loop-exit-arc`:
"found it, and the arrow, we should make this arrow bigger".

Captured headlessly (Chromium through Playwright, a 1600x1000 viewport at 2x) against a studio dev
server running this branch on the live store, on the `inner-loop-exit-arc` lane — the one lane in the
Active scope that has a queue.

| | before | after |
|---|---|---|
| the whole lane list, queue collapsed | `before-lanes-collapsed.png` | `after-lanes-collapsed.png` |
| the lane, collapsed | `before-row-collapsed.png` | `after-row-collapsed.png` |
| the lane, expanded | `before-row-expanded.png` | `after-row-expanded.png` |
| keyboard focus on the caret | — | `after-row-focus.png` |

Measured in the same runs:

| | before | after |
|---|---|---|
| caret button | 13 x 15 px | 26 x 26 px |
| glyph | 10.8 px (0.72em) | 19.5 px (1.3em) |
| caret gutter, on every row | 18 px | 30 px |
| where each lane's state chip starts | x = 35 on all 6 rows | x = 47 on all 6 rows |
| where the expanded chip run starts | x = 35 | x = 47 |
| caret centre against the title line's centre | 3.6 px high | level |

The clickable area, probed with `document.elementFromPoint` on a half-pixel grid, is 26 px straight
through the centre on both axes; only the 6 px rounded corners fall outside it, as on any rounded
button.

Unchanged, and checked in the same runs: no count beside the caret, collapsed by default, the queued
arcs nested under their blocker, `aria-expanded` / `aria-controls` / the count-carrying `aria-label`,
and a visible keyboard focus ring. The drawer has a single light palette and no dark-scheme rules, so
captures taken under `prefers-color-scheme: dark` are byte-identical to the light ones.
