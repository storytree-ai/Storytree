// `node --import ./scripts/tsx-cache-off.mjs --import tsx …` — tsx WITHOUT its on-disk transform
// cache (`the-gate-costs-what-the-change-risks-arc` inc 4).
//
// WHY. tsx caches every esbuild transform as one file in a FLAT directory under `os.tmpdir()`, and
// nothing ever evicts it. On this dev box that directory reached **232,254 files / 4.18 GB**, at
// which point every cache LOOKUP is a file open in a 232k-entry directory and the cache costs far
// more than the transform it saves. Measured on one spawned CLI process (median of 7, quiet box):
//
//   tsx cache ON, that 232k-file directory   3703 ms CPU / 3899 ms wall
//   tsx cache OFF (this preload)             2078 ms CPU / 2173 ms wall     <- 44% cheaper
//   tsx cache ON, a FRESH empty directory    1796 ms CPU / 2071 ms wall
//
// So the cache read as worth ~280 ms/process while small and ~1600 ms/process once bloated. Turning
// it off trades that best case for a floor that CANNOT rot. tsx still memoises transforms in-process
// (it swaps its FileSystemCache for a plain `Map`), so a single run loses nothing.
//
// A SECOND MEASUREMENT (inc 7) CONTRADICTED THAT ROW; A THIRD (ADR-0401) REPRODUCED IT, AND THE
// DISABLE IS RE-AFFIRMED. ⚠ DO NOT REMOVE THIS PRELOAD: re-enabling the cache COSTS roughly
// 1.1-1.6 s per spawned CLI process. That is the settled reading — the sequence is recorded because
// this header is where a reader meets it, and because the middle reading is the one that invites a
// session to delete the file.
//
// inc 7 re-ran the protocol TWICE, hours apart, from two worktrees, against the same directory, and
// got cache OFF 1735/1802 ms against cache ON 1192/1361 ms — the "rotted" directory measuring ~25%
// FASTER than no cache. It named its own confound (the directory had been listed shortly before, so
// its NTFS index was warm) and left the disable standing, but recorded the founding row as having
// failed to reproduce.
//
// ADR-0401 (2026-08-21) settled it with a different INSTRUMENT rather than a third point estimate:
// arms INTERLEAVED round-robin inside one run (so box drift hits every arm equally — this box varies
// 2.6x across a day), a fresh-directory third arm to isolate the mechanism, and every repetition
// reported instead of only the median. Wall ms against the real directory, then 215,377 files:
//
//   run                                  fresh dir     cache OFF     the 215k dir     big / off
//   1  index COLD, loaded, 7 reps            -           1852 ms       2966 ms          1.60x
//   2  index WARMED by enumeration           -           2457 ms       3533 ms          1.44x
//   3  3-arm, loaded, 7 reps               1823 ms       2490 ms       4045 ms          1.63x
//   4  3-arm, QUIET box, 9 reps            1539 ms       2185 ms       3738 ms          1.71x
//
// The big directory is slower than no cache in 29 of 30 individual repetitions. Run 1 is the cold
// shot (nothing had read the directory since this preload landed); run 2 tested inc 7's named
// confound directly — index warmth does NOT produce its numbers. Controls: the cache-ON arm was
// genuinely on (the fresh directory populated to 246 files); the big-directory runs were pure HITS,
// not writes (215,377 files before AND after); and inc 7 did address the real directory, since tsx
// nests `tsx-<user>` inside $TMPDIR and no nested `tsx-mickh\tsx-mickh` exists. Why inc 7 measured
// what it did is not recoverable. The ordering inc 4 claimed is confirmed: healthy < off << rotted.
//
// AT THE SCALE THAT MATTERS — the whole `pnpm -r --no-bail test` leg, two runs per arm interleaved
// on a quiet box, the same 5,446 tests in every arm:
//
//   cache ON    745 s / 621 s wall     780.4 s / 714.9 s of summed per-project test work
//   cache OFF   444 s / 424 s wall     465.8 s / 445.9 s
//
// Every one of the 23 reporting projects got faster; the two cost centres this increment was aimed
// at moved most in absolute terms (packages/cli 287.3 s -> 193.5 s, context-traversal-capture
// 179.2 s -> 64.6 s).
//
// A HEALTHY CACHE IS STILL THE FASTEST THING THERE IS, AND THE ~280 ms/process ABOVE BADLY
// UNDERSTATES IT AT SUITE SCALE. The single-process figure measures one mostly-cold process; across
// a whole run, hundreds of processes HIT entries their predecessors wrote. Same measurement harness,
// `pnpm -r --no-bail test`, the same 5,475 tests in every arm:
//
//   tsx cache, FRESH directory   296 s (cold) then 277 s / 273 s
//   tsx cache OFF (this preload) 358 s
//   tsx cache, the 232k-file dir 745 s / 621 s
//
// So the honest ordering is: healthy cache < no cache << rotted cache. This preload buys the FLOOR —
// the guarantee that the third row can never happen — at about 30% against the first.
//
// WHICH IS WHY CI OPTS BACK IN. A hosted runner gets a fresh VM per job, so its cache is healthy BY
// CONSTRUCTION and can never reach the third row; `.github/workflows/ci.yml` sets
// `TSX_DISABLE_CACHE: ""` for exactly that reason. Nothing on a long-lived dev box has that
// guarantee, and tsx offers no eviction and no cache-directory knob.
//
// THE "BOUND THE CACHE" FOLLOW-UP IS CLOSED, NOT PENDING (inc 7). The mechanism was built and
// proven: setting TMPDIR/TEMP/TMP before `--import tsx` and restoring them after redirects tsx's
// cache and nothing else, it captured 100% of a full suite run's transforms (the user temp directory
// gained nothing), it costs ~4% per process against the default location, and a whole
// `pnpm -r --no-bail test` fills a partition with just 1,478 files / 30 MB — genuinely bounded per
// worktree. It STAYS closed under ADR-0401, but on a REPLACED reason, because the one inc 7 gave
// has since been falsified. inc 7's reason was "(1) the ROT it exists to bound did not reproduce,
// so it would fence a hazard nobody can currently observe" — the rot DOES reproduce (the table
// above), so that reason is dead. What holds instead: `bun-runtime-migration-arc` (chartered
// 2026-08-21) is migrating packages off `node --import tsx` one at a time and names this very
// script string as its migration path, so tsx-specific cache machinery is investment in a component
// with a chartered exit. Revisit only if that direction stalls. inc 7's second reason survives
// intact: the benefit is not resolvable on this box — interleaved arms measured cache-OFF at 548 s
// and 820 s and cache-ON at 514 s / 609 s / 635 s, a 122 s mean difference favouring ON inside a
// 272 s within-arm spread, and the same leg was separately measured at 318 s, 512 s and 749 s the
// same day. The per-process saving is real; the suite-scale figure is not measurable here without
// far more repeats than the answer is worth. ⚠ A bounded cache is the ONLY way to capture the
// ~650 ms/process a healthy cache is worth — simply deleting this preload does the OPPOSITE, and
// costs 1.1-1.6 s/process.
//
// This buys the SAME proof more cheaply — no test is skipped, sampled or moved off the gate, which
// is the one direction this arc forbids.
//
// WHY A SEPARATE PRELOAD RATHER THAN A LINE INSIDE tsx's OWN ENTRY. tsx reads
// `process.env.TSX_DISABLE_CACHE` once, when its module graph is evaluated, so the variable has to
// be set BEFORE `--import tsx` runs. `--import` preloads run left to right, so this file placed
// first is the only ordering that works — and it deliberately imports NOTHING, so it needs no
// dependency of its own and cannot fail to resolve from the repo root (which carries no
// `node_modules` under pnpm).
//
// ESCAPE HATCH, and why it is spelled that way. `??=` leaves an explicitly-set value alone, and tsx
// tests the variable for TRUTHINESS — so `TSX_DISABLE_CACHE=0` still disables the cache, and the
// only way back to the on-disk cache is the EMPTY string:
//
//   TSX_DISABLE_CACHE= pnpm test        # re-enables tsx's on-disk transform cache
process.env["TSX_DISABLE_CACHE"] ??= "1";
