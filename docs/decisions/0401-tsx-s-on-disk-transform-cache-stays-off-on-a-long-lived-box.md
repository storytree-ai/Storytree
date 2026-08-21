---
status: accepted
amends: [162]
decided: 2026-08-21
---
# ADR-0401: tsx's on-disk transform cache stays off on a long-lived box — the rot reproduces

## Status

accepted (2026-08-21) — the owner directed this re-decision on 2026-08-21 and specified the decision
rule IN ADVANCE: try to reproduce the disable's founding measurement on a cold directory index, and
"if it reproduces, inc-04 was right about a condition inc-07 could not recreate, and the disable
stands — record that and stop." It reproduced, in four independent interleaved runs. Design-time
alignment IS the ratification (ADR-0110); the evidence satisfied the first branch of a rule the owner
set before the measurement was taken.

## Context

**The decision this re-decides has been made twice, on contradictory evidence, a day apart.**
`the-gate-costs-what-the-change-risks-arc` increment 4 (PR #1464/#1466, 2026-08-20) disabled tsx's
on-disk transform cache repo-wide via `scripts/tsx-cache-off.mjs`, preloaded ahead of every
`--import tsx`. tsx writes one file per esbuild transform into a FLAT `os.tmpdir()/tsx-<user>`
directory and never evicts; on this box that directory had reached 232,254 files / 4.18 GB, at which
point inc-04 measured a cache LOOKUP as costing more than the transform it saves — 3703 ms against
2078 ms with the cache off, median of 7 spawned `storytree not-a-real-storytree-command`.

Increment 7 (PR #1482, 2026-08-21) re-measured that with the same protocol, twice, hours apart, from
two different worktrees, against the same directory — and got the OPPOSITE result: cache OFF
1735/1802 ms, cache ON against the big directory 1192/1361 ms, i.e. the "rotted" directory measuring
as fast as a fresh one and ~25% FASTER than no cache. inc-07 named one confound rather than hiding
it: that directory had been listed shortly before the probe, so its NTFS index was warm. It left the
disable in place but recorded, prominently and in several places, that the founding row "DID NOT
REPRODUCE" — which left the live question "should the cache simply be turned back ON", framed as a
one-line change worth ~450 ms per spawned CLI process.

**Neither measurement could adjudicate the other, and the reason is the instrument.** Both were
median-of-7 point estimates taken at different times on a box that the same arc measured varying
2.6x on the same work in one day (300 s / 512 s / 548 s / 749 s / 820 s on the same test leg). A
point estimate taken on one day cannot be compared with one taken on the next when the box moves
that much — and indeed every one of inc-07's arms is faster than inc-04's counterpart, including the
arms that were supposed to be unchanged.

**What this re-measurement did differently.** Three changes, all aimed at removing the cross-day
comparison rather than repeating it:

1. **Arms are INTERLEAVED round-robin** — every arm is measured inside the same repetition, seconds
   apart — so box drift, load and thermal state hit all arms equally and the comparison lives
   *within* a run rather than *between* runs.
2. **A third arm, a genuinely fresh cache directory, is carried alongside** — which isolates the
   mechanism, because fresh and big differ only in directory size.
3. **Every repetition is reported, not just the median**, so a cold-first-run effect is visible
   instead of being absorbed.

**The finding: inc-04's ordering reproduces, four times, under both index conditions and both load
conditions.** Wall ms, `node packages/cli/launch.mjs not-a-real-storytree-command`, against the real
cache directory (215,377 files / 3.60 GB today):

| run | conditions | cache ON, fresh dir | cache OFF | cache ON, the 215k dir | big ÷ off |
|---|---|---|---|---|---|
| 1 | index COLD, box loaded, 7 reps | — | 1852 ms | 2966 ms | 1.60x |
| 2 | index WARMED by full enumeration, box loaded, 7 reps | — | 2457 ms | 3533 ms | 1.44x |
| 3 | 3-arm, box loaded, 7 reps | 1823 ms | 2490 ms | 4045 ms | 1.63x |
| 4 | 3-arm, box QUIET, 9 reps, ~30 min later | 1539 ms | 2185 ms | 3738 ms | 1.71x |

The big directory is slower than no cache in **29 of 30 individual repetitions** (the exception is
one box hiccup in run 4 where both arms spiked). For comparison the ratio was **1.78x** in inc-04
and **0.69x** in inc-07.

**Run 1 is the cold-index reproduction the owner asked for**, and it was available only once:
nothing had read that directory since the disable landed on 2026-08-20, so its index was as cold as
it gets without a reboot. Its first repetition cost 5025 ms and it then plateaued at 2703–3089 ms —
i.e. repeated use warms it somewhat but never brings it near either the fresh arm or the cache-off
arm. Run 2 then tested inc-07's own named confound directly, by fully enumerating and stat-ing all
215,377 files immediately beforehand: **index warmth does not produce inc-07's numbers.**

**Four controls make the reading trustworthy, and one of them kills the obvious explanation.**

- The cache-ON arm is genuinely ON: the fresh directory populated to 246 files during the run.
- The big-directory runs were pure cache HITS, not writes: the directory held 215,377 files before
  the seven cache-ON runs and 215,377 after. So this is the same all-hits arm inc-07 reported.
- tsx builds its cache directory by joining `os.tmpdir()` with a `tsx-<uid>` segment — it always
  nests a `tsx-<user>` directory INSIDE `$TMPDIR` (`tsx@4.22.4/dist/index-gbaejti9.mjs`). The
  tempting explanation for inc-07 — that it pointed `TMPDIR` at the big directory itself and so
  silently measured a fresh nested subdirectory — is **DISPROVEN**: no `tsx-mickh\tsx-mickh` exists.
  inc-07 did address the real directory.
- The directory is SMALLER today than when inc-07 measured it (215,377 against ~235,000; roughly
  20,000 entries have since disappeared, presumably to Windows temp cleanup). Today's arm is
  therefore, if anything, favourable to the cache.

**Why inc-07 measured what it did is not recoverable from here**, and this ADR does not pretend
otherwise. What is established is that its reading does not reproduce under any condition tested —
cold index, enumeration-warmed index, loaded box or quiet box — and that the confound it named is
not the explanation.

**The mechanism is isolated by the fresh-vs-big contrast.** Same code, same box, same repetitions,
both arms pure hits after their first run; the only variable is the entry count of the directory
being looked up in — 246 against 215,377. Lookup cost in a flat NTFS directory scales with the
number of entries, and somewhere below 215k it crosses the cost of simply redoing the transform.
That is exactly the claim inc-04 made, now with a cleaner isolation than inc-04 had.

**Why the suite-scale figure could not settle this, and must not be used to reopen it.** The
per-process cost of re-enabling is +1076 to +1555 ms. inc-04 independently measured the whole
`pnpm -r --no-bail test` leg at roughly 250 s slower with the rotted cache than without, which
implies on the order of 150 spawned processes — consistent with the per-process figure, and a useful
cross-check. But a ~200 s effect sits underneath this box's measured 2.6x spread on that same leg,
which is precisely why inc-07's interleaved suite arms (OFF 548 s / 820 s against ON 514 s / 609 s /
635 s) returned a 122 s mean difference inside a 272 s within-arm spread and resolved nothing. The
per-process instrument reproduces to ±5%; the suite instrument does not resolve at all. Predict the
suite figure from the per-process one, never the reverse.

## Decision

1. **The disable STANDS, and the cache is NOT re-enabled on this box.** `scripts/tsx-cache-off.mjs`
   is kept unchanged at all ~45 call sites (every package `test` script, twenty root scripts, and
   `packages/cli/launch.mjs`), and CI keeps its `TSX_DISABLE_CACHE: ""` opt-in, whose justification
   is untouched: a hosted runner gets a fresh VM per job, so its cache is healthy by construction.

2. **Re-enabling would COST roughly 1.1–1.6 s per spawned CLI process, not save ~450 ms.** The sign
   of the effect is inverted from the framing inc-07's record left behind. Anyone proposing to turn
   the cache on is proposing to make the gate slower.

3. **The record is corrected IN PLACE wherever it currently says the founding row did not
   reproduce** (ADR-0139: the decision did not change, so this is a correction, not a
   supersede-and-replace). Three sites carried that caveat prominently — ADR-0162's item-2
   correction, `scripts/tsx-cache-off.mjs`'s header, and `packages/cli/launch.mjs`'s comment — and
   all three now carry the third measurement instead.

4. **The per-process median is the instrument of record for this question.** A suite-scale
   wall-clock A/B on this box is not evidence about it in either direction, and may not be used to
   reopen it.

5. **The bounded-cache mechanism stays CLOSED, on a replaced reason.** inc-07 closed it because it
   "fences a rot that cannot currently be observed"; that reason is now falsified — the rot is
   observable and reproduces. It stays closed anyway, for a reason that did not exist when it was
   first closed: `bun-runtime-migration-arc` (chartered 2026-08-21) is migrating packages off
   `node --import tsx` a package at a time, and names that exact script string as its migration
   path. Building tsx-specific cache machinery now is investment in a component with a chartered
   exit. This is recorded rather than escalated because no option is being taken away: the mechanism
   was already built and proven (TMPDIR redirect and restore; captures 100% of a suite's transforms;
   ~4% per-process cost; a whole test run fills a partition with 1,478 files / 30 MB), and it is
   described in `scripts/tsx-cache-off.mjs`'s header should the Bun direction stall.

## Consequences

**Good.**
- A question that had been decided twice in opposite directions is settled on an instrument that
  reproduces, and the reasoning is recorded where the next reader meets it rather than in a
  transcript.
- The next session to open `scripts/tsx-cache-off.mjs` no longer finds a prominent warning that the
  file's own justification failed to reproduce — which was an active invitation to spend a session
  removing it, at a real cost to the gate.
- The interleaved-arms-plus-isolating-third-arm shape is now a worked example on this box, which is
  the only shape that has resolved anything here: it broke a deadlock between two median-of-7 point
  estimates.

**Costs and risks.**
- **A healthy cache is still the fastest state there is, and that value is left on the table** —
  the fresh arm is ~30% faster than cache-off (1539 ms against 2185 ms on a quiet box), worth
  roughly 650 ms per spawned process. Decision 5 declines to capture it. If Bun stalls and the
  monorepo is still on `node --import tsx` in six months, that is the trigger to revisit.
- The mechanism is inferred, not instrumented: this ADR shows that lookup cost tracks directory size
  and that nothing else varied, but it does not measure NTFS B-tree behaviour directly. The
  threshold at which a flat cache directory turns from a win into a loss is unknown — only that
  246 entries is well under it and 215,377 is well over.
- Why inc-07 measured what it did remains unexplained. A third contradictory reading could still
  appear; if one does, the response is to interleave it against the other arms in the same run, not
  to record another standalone median.

## References

- ADR-0162 §Roadmap item 2 — the amended target: it carries the disable's founding correction, and
  its "RE-MEASURED (inc 7) … DID NOT REPRODUCE" block is corrected in place by this ADR.
- `scripts/tsx-cache-off.mjs` — the preload, its header, and the bounded-cache mechanism's description.
- `packages/cli/launch.mjs` — the second site setting `TSX_DISABLE_CACHE`, ahead of the tsx import.
- `.github/workflows/ci.yml` — CI's `TSX_DISABLE_CACHE: ""` opt-in for a fresh-per-job runner.
- `the-gate-costs-what-the-change-risks-arc` increments 4 and 7 (PRs #1464 / #1466 / #1482) — the two
  prior measurements. The arc is CLOSED; this ADR deliberately does not reopen it.
- `bun-runtime-migration-arc` — the chartered exit from `node --import tsx` that decision 5 rests on.
- ADR-0139 (correct an overtaken claim in place; supersede only on a genuine re-decision) ·
  ADR-0110 (owner-directed design-time alignment IS ratification) · ADR-0023 / ADR-0115 (raw TS via
  tsx, no build step — why a transform cache exists at all).
