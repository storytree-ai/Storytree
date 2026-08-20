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
// So the cache is worth ~280 ms/process while it is small, and costs ~1600 ms/process once it has
// bloated — and it always bloats, because tsx has no eviction and this repo runs many worktrees.
// Turning it off trades that best case for a floor that CANNOT rot. tsx still memoises transforms
// in-process (it swaps its FileSystemCache for a plain `Map`), so a single run loses nothing.
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
// guarantee, and tsx offers no eviction and no cache-directory knob, so here the floor is the right
// trade. The BETTER answer — bound the cache and keep it everywhere — is real and unbuilt; it is
// parked on `the-gate-costs-what-the-change-risks-arc`, and it is worth roughly the 30% above.
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
