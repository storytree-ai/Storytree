# The art instrument becomes a build rung — `check:land-art`

**2026-08-28** · arc `adopt-the-land-into-the-shipped-map-arc`, increment
`the-art-instrument-becomes-a-build-rung` · measured on an RTX 2060 box, but the rung itself runs on
**SwiftShader** and needs no GPU.

---

## The one sentence

> ADR-0418 D4's replacement for the lifted palette fence was built and mutation-tested the day
> before — and **no build ever ran it**. It is now the gate's `check:land-art`, and six hand-run
> mutations — across five different halves of it — each turn the gate red.

---

## 1. What was actually missing, because it was not what the arc thought

Arc fence 3 says, verbatim:

> **THE REPLACEMENT CHECK IS A PRECONDITION OF ADOPTION SPECIFICALLY** (ADR-0418 D4). … Until the
> replacement lands, no automated instrument can fail a build for the art being wrong.

The replacement **had** landed. `replace-the-palette-closure-check` (PR #1673) built all three parts
of D4 into `capture.mjs` — per-prop non-vacuity, the colour-spread band, the hardware floor — and
proved each one refuses with six hand-run mutations against the live page. ADR-0418's own
Consequences were corrected in place to say so. None of that work is redone here and none of it is
in doubt.

What that increment ALSO recorded, twice, about itself:

> "Worth knowing because the `undeclared` refusal is UNCONDITIONAL and **`capture.mjs` is a manual
> tool, not a gate rung**: a manifest entry disagreeing with a page breaks the next person's run and
> **nothing in CI would notice**."

> "**MUTATION EVIDENCE IS HAND-RUN, AND THE GATE CANNOT PRODUCE IT.**"

Confirmed by direct search on this branch rather than taken from the prose:

| where a build could have run it | result |
|---|---|
| the gate plan (`packages/cli/src/gate-order.ts`, 21 steps at the time) | **absent** |
| `.github/workflows/ci.yml` | **absent** |
| the package's own `test` script | **unreachable** — `bun test src/ harness/` collects `*.test.ts`; capture is a `.mjs` driver |

So `pnpm --filter forest-world-r3f capture` was a verb a human types, against a vite server that
human also started. **Break the land art and `pnpm gate` went green.** Fence 3's literal words were
still true, for a reason the arc had not noticed:

> an instrument that CAN fail, that no build ever runs, cannot fail A BUILD.

That is the gap this increment closes. It is a wiring problem, not an instrument problem — and it is
the same fault class this factory keeps catching ("an instrument that cannot fail") arriving one
level up, where the instrument is fine and *nothing asks it*.

---

## 2. Why the rung drives three pages, and why that is the load-bearing design choice

Measured on this branch, one `capture.mjs` run per page against the live harness:

| page | canvases | opaque px | prop islands verified | continuous canvases judged |
|---|---|---|---|---|
| `grain.html` | 8 | 5,242,624 | **0** | **4** |
| `island.html` | 44 | 29,085,906 | **7** | 0 |
| `directions.html` | 12 | 987,118 | **10** | 0 |
| `compare.html` | 22 | 46,576 | 0 | 0 |

**Every one of those exits 0.** Three of the four print a line saying, in terms, that a whole half of
ADR-0418 D4 checked nothing on them — `NO PROP DECLARATIONS ON THIS PAGE — the prop floor checked
nothing`, or `NO CONTINUOUS CANVASES ON THIS PAGE — the band checked nothing`.

`grain.html` is the **only** page in the harness carrying continuously-shaded canvases, so it is the
only page on which ADR-0418 D4's replacement band bites at all. `island.html` and `directions.html`
are the reverse. A rung driving any single page would have been half vacuous on its first day.

`compare.html` is excluded: at 46,576 opaque px it proves neither half and costs a browser launch.

---

## 3. The rung refuses on two independent grounds, and the second is the one capture cannot supply

**(a) The art is wrong.** `capture.mjs` is spawned as a subprocess and its exit code is propagated
verbatim, with the tail of its output. No readback and no refusal is re-implemented here — this arc
already carries three ~700-line compositor copies and a fork detector that had to be built because
nothing noticed they had diverged.

**(b) A page audited less than it is declared to prove.** This fires on a *green* capture run. It is
the half a script cannot assert about the run it is inside, and it is what stops the rung quietly
becoming a green tick over nothing — a renamed tag, a deleted panel or a manifest entry that stopped
resolving all reduce what was audited without moving any exit code
(`moving-a-write-target-makes-old-readers-vacuously-green`).

It has three dimensions and one level-up guard:

- `continuous` — continuous canvases the band actually judged (D4 part 2)
- `props` — islands whose declared props were verified present (D4 part 1)
- `palette-held` — opaque px **still held to the authored closure**, i.e. page total minus whatever a
  `continuous` declaration exempted. ⚠ **This closes a hole `capture.mjs` does not cover.** The
  exemption is granted by declaration and by nothing else, which is right and is proved by PR #1673's
  mutation M4 — but nothing downstream floors what is *left*. Exempt a whole page and capture prints
  `PALETTE CLOSED ON THE GPU (…N px exempt by declaration)` and exits 0, having closed a palette over
  zero pixels.
- **the declaration SET itself** — every dimension above is a page failing to deliver what it
  declared, and none of them fires if the *declaration* is what shrank. Drop `grain.html` from the
  set and the other two pass perfectly (this is mutation MU2 below, and it is exactly what happened).

⚠ **Why the coverage floors are hand-authored, and why that is not the "picked number" fault.** This
harness has a real rule that a threshold is read off a control in the same run and never chosen
(`colour-spread.ts`'s bar, `frame-budget.ts`'s control arm). It governs **measurements of the art**,
and none of these are that. These are **coverage** floors: how much the instrument must have been
*asked*, not what the answer must be. Deriving them from the run is the actual fault, and
`prop-presence.ts` already states why at length — *"a manifest derived from `buildDressing` would stop
expecting a wall at the same moment the wall stopped being built."* A coverage floor computed from the
page it audits can never notice the page shrinking. Each figure is **structural** — what the page is
built to contain — and a unit test asserts none of them sits above what its page actually delivers,
which is what stops a floor being nudged to "just under the measured value".

---

## 4. The mutation evidence — every refusal, fired against the live rung

Each mutation was applied to the **real source**, run through `pnpm check:land-art` exactly as the
gate runs it, then reverted; `git status` was asserted clean after every one. Logs are committed
beside this README.

| # | mutation (the real subject) | what fired | `capture.mjs` exit | rung exit |
|---|---|---|---|---|
| **MU1** | `GRAIN_COLOUR_MIX` 0.13 → **0.0** — the grain's colour term stops reaching pixels | `ART` — capture's own `COLOUR SPREAD [collapsed]`, propagated | **1** on `grain.html` | **1** |
| **MU2** | `grain.html` dropped from `LAND_ART_PAGES` | `DECLARATION` — D4 part 2 uncovered | **0 on every page** | **1** |
| **MU3** | the `colour` variant removed from `grain.tsx`'s `VARIANTS` | `COVERAGE [continuous]` — delivered 2, declared 4 | **0 on every page** | **1** |
| **MU4** | `colourSpread.continuousChecked` renamed in capture's report | `COVERAGE` — report unreadable, ×3 | **0 on every page** | **1** |
| **MU5** | `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty directory | `SKIP`, loudly | (never launched) | **3** |
| **MU6** | the dev server forced onto the pinned `strictPort: 5184` | `REFUSED` — a sibling worktree may be serving that port | (never launched) | **1** |

**Each one breaks a different half, and that was the requirement.** If two deliberately-wrong cases
broke the same half, a rung that had quietly lost the other half would still refuse both and look
healthy.

- **MU1 is the only one `capture.mjs` catches.** It proves the rung propagates a real art failure
  rather than swallowing it.
- **MU2, MU3 and MU4 all leave `capture.mjs` exiting 0.** Three of the five refusals come from layers
  the instrument cannot supply for itself.
- **MU3 is the sharpest.** The page and the manifest stay perfectly consistent — capture has nothing
  to object to and says so — and the rung still refuses, because the band judged two canvases where
  the page is built to carry four. This is precisely the silent-decay case, and it is invisible to
  every rung that existed before this one.
- **MU4 is the vacuous-green guard.** The reader throws on a missing field rather than defaulting it.
  Under a `?? 0` this mutation would have been a **silent pass** — and would have stayed one forever.
- **MU6 is the one this README was wrong about first.** The initial draft claimed the rung took an
  OS-assigned ephemeral port and that a sibling therefore "cannot" answer it. Measuring the actual
  allocation showed vite scanning upward from its default instead, so the guarantee did not exist —
  it was a plausible sentence about a mechanism nobody had checked. The remedy was to make the claim
  true rather than to soften it: read the pinned port off `vite.config.ts` and refuse if the server
  landed there.
- **MU5 proves the skip is narrow and not a pass.** Exit **3**, never 0, with
  `⚠ SKIP IS NOT A PASS` printed. A Playwright browser that was never downloaded is the *only*
  skippable condition; vite failing, a page 404ing and capture crashing are all reds. Deliberately
  there is **no** diff-conditional skip: the whole run is ~29 s, and "this branch probably didn't
  touch the art" would be a second vacuity path bought for no meaningful saving.

### The two dimensions with no live mutation, named rather than left to be discovered

`props` and `palette-held` are **unit-tested only**. Every realistic live mutation of them is
pre-empted by one of `capture.mjs`'s own refusals firing first — an island tag that stops resolving
trips `ST_EXPECT_PROP_CANVASES`, and flipping a banded canvas to `continuous` trips
`control-missing`/`control-not-banded`. That is defence in depth rather than a hole, but it means the
*live* evidence for those two dimensions is the unit suite and not a browser run. Stated here for the
same reason PR #1673 stated it about its own `vacuous` fault.

---

## 5. Cost, measured rather than feared

| leg | wall clock |
|---|---|
| vite dev server, programmatic start on an ephemeral port | **135 ms** |
| `grain.html` — 8 canvases, 5.2 M px | ~4.7 s |
| `island.html` — 44 canvases, 29.1 M px | ~17.6 s |
| `directions.html` — 12 canvases, 987 K px | ~5.1 s |
| **whole rung** | **~29 s** |

Cheaper than several rungs already in the plan, so the contention hazard that would ordinarily argue
against a browser rung does not bite at this size.

**It also addresses a recorded friction — and the first draft of this README got the mechanism
wrong, which is worth recording.** `vite.config.ts` pins `strictPort: 5184` for every worktree, so a
sibling worktree's harness left running on the default port means you measure *its* tree and report
the number as yours (`capture-default-url-is-a-port-a-sibling-worktree-may-own`, measured
2026-08-22). This rung passes vite `port: 0` — and **`port: 0` does not mean an OS-assigned ephemeral
port here.** Measured: vite scans upward from its own default and takes the first free one, giving
5174 and then 5175 on two back-to-back servers. That is fine for concurrency — two land-art runs get
different ports, which is what a sibling gate needs — and it is *not* a guarantee, because with
5173–5183 occupied the scan reaches 5184 and photographs the sibling's tree.

So the guarantee is **asserted, not assumed**: the rung reads the pinned port off `vite.config.ts`
itself (never a restated constant, which would go stale silently) and refuses if it landed there.
That is mutation MU6.

**And it writes to scratch, never to the committed evidence.** Pointed at its default output,
`capture.mjs` rewrites 22 committed files under `docs/research/chapter2-live-render-2026-08-19/`. A
rung that dirties the working tree every run is one that gets `git checkout .`-ed away along with
whatever else was in the diff. `ST_OUT_DIR` goes to `.capture-scratch/`, which `.gitignore` already
carries for exactly this purpose.

---

## 6. ⚠ What this does NOT do

- ~~**It does not run in CI.**~~ **IT DOES NOW — and the number that was missing is what changed the
  answer.** This section originally parked the CI leg on the grounds that it meant "a browser download
  plus a real per-PR cost on a two-core runner rasterising 29 M pixels in software". Nobody had
  measured that cost. Measured on the rung itself, same box, same branch:

  | cores | wall clock |
  |---|---|
  | 12 (unrestricted) | 29.1 s |
  | 2 (`taskset -c 0,1`) | **29.0 s** |

  **The rung is not CPU-parallel-bound.** SwiftShader rasterises each canvas serially and the wall
  clock is dominated by page render, so a small runner costs what a large one does — the two-core
  worry was the whole objection and it was unfounded. Landed as two steps in
  `.github/workflows/ci.yml` (`the-art-rung-runs-in-ci`), for the one class of breakage a local gate
  structurally cannot see: two branches each green alone whose MERGE breaks the art. CI is the only
  thing that builds that merge.

  ⚠ **The CI step INSTALLS the browser rather than tolerating its absence, and that is load-bearing.**
  The rung's only skippable condition is a Playwright browser that was never downloaded, and the
  reserved exit 3 is local-only. The tempting CI fix — print and exit 0 — is the vacuous-green shape:
  a rung that passes forever because the browser never arrived. Installing it means the skip branch
  cannot fire there at all, and an install that fails fails loudly as its own step. It installs FULL
  `chromium`, never `chromium-headless-shell` alone: the preflight resolves
  `chromium.executablePath()`, and a shell-only install would leave that path absent and the rung
  would SKIP in CI while looking installed.
- **It does not make the band catch DEGRADATION.** The 24× margin stands. ADR-0418 D4 named that
  trade ("roughly in range" vs "exactly right or not") and tightening the bar is explicitly refused
  in `colour-spread.ts` — a number placed near the measured value is the picked number the design
  exists to avoid.
- **It does not say whether the art is GOOD.** The owner's look is the instrument for that, and
  ADR-0392 D1 rations it deliberately.
- **It does not reach `packages/forest-world-r3f/src`.** Adoption stays a separate event (ADR-0380 D6
  / ADR-0406 D2). This is the gate adoption must later pass, not a walk through it.
- **It does not add MICRO/STRUCT to the refusal set.** They are spatial and capture's readback is a
  histogram; that needs a second readback and remains deliberately undone, as PR #1673 recorded.

---

## Files

- `packages/forest-world-r3f/harness/land-art-check.ts` — the rung: preflight, its own vite server,
  the three page runs, the verdict.
- `packages/forest-world-r3f/harness/land-art-coverage.ts` — the pure half: the declaration, the
  per-page coverage check, the declaration-set check, the fail-closed report reader.
- `packages/forest-world-r3f/harness/land-art-coverage.test.ts` — 14 unit tests over the real
  measured run.
- `packages/cli/src/gate-order.ts` — the plan entry and the `SKIP_CAPABLE_CHECKS` reason.
- `MU1-…` … `MU6-pinned-port.txt` — the committed refusals, plus `PASS-baseline.txt` for contrast.
  (`.txt`, not `.log`: the repo gitignores `*.log` globally, so committing the refusals as logs would have silently committed nothing — which is the same fault class one more level up.)
