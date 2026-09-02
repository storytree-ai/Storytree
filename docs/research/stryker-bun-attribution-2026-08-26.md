# Mutation-kill attribution on Bun — plugin evaluation and adoption, 2026-08-26

**Arc** `test-strength-beyond-red-green-arc`, increment `attribution-wire-for-diff-scoped-mutation` ·
**Decision** ADR-0450 (Option C) · **Unblocks** `diff-scoped-mutation-rung`

Increment 1 measured mutation scores with StrykerJS's officially-supported `command` runner driving
`bun test`. That works and its numbers are trustworthy, but it reports one pseudo-test — `"All
tests"` — per killed mutant, and `coveredBy: undefined`. `diff-scoped-mutation-rung` cannot enforce
"the branch's **own** new or changed tests must kill these mutants" against a signal that names no
test. Closing that gap is this increment.

**Outcome: attribution is real, proven, and re-runnable — at the cost of two patches against an
unofficial plugin.** `pnpm mutation:attribution-probe` returns a pass/fail verdict in ~15 s.

---

## 1. What was evaluated

Exactly two community Bun runners exist on npm (searched 2026-08-26; there is still no official one —
stryker-js #4439 / #5424 remain open).

| | `@hughescr/stryker-bun-runner` | `stryker-mutator-bun-runner` |
|---|---|---|
| Latest | **1.3.8**, 2026-07-17 | 0.4.0, 2025-07-07 |
| Versions published | 18 | 1 |
| Repo last pushed | 2026-07-17 (5 weeks) | 2025-10-23 (10 months) |
| Open issues / stars | 2 / 2 | 9 / 6 |
| Maintainers | 1 (`hughescr`) | 1 (`menoncello`) |
| Declared peer | `@stryker-mutator/core@^9.0.0` | `@stryker-mutator/core@^9.0.0` |
| Attribution mechanism | Bun **Inspector Protocol** (WebSocket `TestReporter` events, needs Bun ≥ 1.3.7) | **scrapes `bun test` console output** |
| Extra install weight | `ws`, `smol-toml`, `tinyglobby` | `execa`, `glob`, `semver`, **and the `bun` npm package** |
| Result here | **works, after two patches** | **does not run** |

**The `^9.0.0` peer range is stale, not a real incompatibility.** Stryker 10.0.0's only breaking
change is dropping Node.js 20 (`packages/core/CHANGELOG.md`); the plugin API is unchanged from 9.6.1.
Both plugins load fine against core 10 — `pnpm` warns about the unmet peer and nothing else. Do not
downgrade core to satisfy it.

### `stryker-mutator-bun-runner` — rejected

It spawns Bun and then parses the human-readable console output. On this box it produced
`Parsed 0 tests: 0 passed, 0 failed` and `Collected coverage for 0 tests`, with no diagnostic beyond
Stryker's generic `No tests were executed`. Bun itself runs the same fixture correctly from the same
shell, with and without the plugin's own `BUN_TEST_QUIET=1`, and with either path separator — so the
failure is the plugin's, not Bun's or the fixture's.

Not investigated further, because even working it would be the weaker choice: output scraping breaks
on any reporter change, the package has one published version in 13 months, and it drags the whole
`bun` npm package in as a dependency.

---

## 2. The two defects in `@hughescr/stryker-bun-runner@1.3.8`

Both are patched in `patches/@hughescr__stryker-bun-runner@1.3.8.patch` (38 lines, via
`pnpm patch`, wired through `pnpm.patchedDependencies` alongside the existing `node-pty` patch).

### Defect A — unescaped Windows path in the generated preload (blocks startup; Windows-only)

The plugin writes a preload script into the OS temp dir by substituting the absolute path of its own
`preload-logic.js` into a template placeholder:

```js
const content = template.replace("__PRELOAD_LOGIC_PATH__", preloadLogicPath)…
```

`preloadLogicPath` is a `path.join()` result, so on Windows it lands **inside a single-quoted JS
string literal** with backslashes intact:

```ts
} from 'C:\code\storytree\.claude\worktrees\ts-attribution-wire\node_modules\…\preload-logic.js';
```

Bun then reads `\t` as a tab and `\n` as a newline, and the run dies with
`Cannot find package 'C:codestorytree.claudeworktrees<TAB>s-attribution-wire<NL>ode_modules…'`.
Every mutant reports as an error and Stryker exits with `No tests were executed`.

Fix: normalise the separators before substitution. Purely a portability escape — no behaviour change
off Windows.

### Defect B — `killedBy` is always empty (blocks the deliverable; probably all platforms)

With Defect A fixed the run completes and `coveredBy` is populated correctly — but **`killedBy` is
`[]` on every killed mutant**, which is the entire point of the increment. It is not a bail artifact:
with `disableBail: true` and both covering tests actually executed (`testsCompleted: 2`), it is still
empty.

**The plugin computes the right answer and then throws it away.** Its own warning stream says so:

```
Mutant 5: 1 failed test name(s) could not be resolved to dry-run test ids and will not be
recorded in killedBy: attribution-probe\src\subject.test.ts > PROBE_DELTA_SHARP doubles three
Mutant 5: no killing test identifiable — emitting empty killedBy
```

The cause is that the two halves derive test names from different sources, in different formats:

- the **dry run** takes names from the Inspector Protocol, which reports the resolved module path —
  `C:\…\.stryker-tmp\sandbox-XXXX\attribution-probe\src\subject.test.ts > PROBE_ALPHA adds one`
- the **mutant run** takes failed names from the run output, which echoes the *invocation* path —
  `attribution-probe\src\subject.test.ts > PROBE_ALPHA adds one`

`resolveKilledBy` only ever compares whole ids (its "base name" logic strips a trailing ` [N]`
duplicate-suffix and nothing else), so the absolute-vs-relative mismatch misses every time.

Fix: after the existing exact and base-name lookups fail, match by **path suffix** — normalise
separators and accept a candidate whose id equals the raw name or ends with `"/" + rawName`. If more
than one candidate matches, the patch resolves nothing and falls through to the plugin's existing
"unresolved" warning, so an ambiguity degrades to today's behaviour rather than crediting a guess.

**This is very likely not Windows-specific.** The relative-vs-absolute mismatch is orthogonal to the
separator, so on Linux `attribution-probe/src/subject.test.ts > X` would still miss
`/abs/sandbox/attribution-probe/src/subject.test.ts > X`. Not verified on Linux — no Linux box was
available — so treat it as strongly indicated rather than measured. It may need the specific shape
used here (driven from a repo root, test file given as a relative subpath, Stryker sandboxing on) to
trigger; the plugin dogfoods itself and presumably does not hit it.

Both defects are worth reporting upstream. The repo is alive (pushed 5 weeks ago, 2 open issues).

### Defect C — the mutant run files a failed test under the wrong test file (CI-only; added 2026-09-02)

Found on PR #1802, on both of its `verify` runs, never locally. The mutant run derives each failed
test's name by scraping `bun test`'s console output: `<file> > <title>`, with the file read off the
**last file header** the output printed (`parseBunTestOutput`, `currentFile`). Bun prints that header
lazily — only when a file's first failure is reported — and under CI's timing it reported a `node:test`
failure from `src/banded-ground-material.test.ts` under the header of the file *before* it,
`harness/shipped-grass-scene.test.ts`. The name therefore reached `resolveKilledBy` with the WRONG
file half and the RIGHT title, matched no dry-run id through either the exact or the path-suffix rung
(Defect B's fix), and six mutants that every local run kills with a named killer were scored
`UNPROVEN`. The set moved between the two runs (five, then six, four shared) because the lag is a
timing race, and the diagnostic is the plugin's own warning:

```
WARN BunTestRunner Mutant 1: 1 failed test name(s) could not be resolved to dry-run test ids …:
  packages/forest-world-r3f/harness/shipped-grass-scene.test.ts > the three refusals say the WHOLE reason …
```

— a test that lives in `src/banded-ground-material.test.ts`.

Fix (the same patch file): after the path-suffix rung fails, strip the file half and credit the
**one** dry-run id carrying that exact title — the mutant's covering filter first, then the whole
registry. Two or more carriers resolve nothing, so a duplicated title still lands in the fail-closed
empty-`killedBy` path exactly as an ambiguous suffix match does, and a name with no test-file prefix
is not treated as mis-filed at all. Its proof is `attribution-probe/verify-title-fallback.mjs`,
which drives `resolveKilledBy` directly with hand-built registries (the header lag cannot be
reproduced through the probe fixture) and was red-green'd against the unpatched bundle — four of its
eight cases fail there. It is chained into `pnpm mutation:attribution-probe`.

This is the third hunk against the bundle; §5 below counts two and its properties still hold.

---

## 3. The instrument was validated before its output was trusted

An attribution instrument that always named the first covering test would *look* like it worked. So
the fixture (`attribution-probe/src/subject.ts`, five tests) is built so that a constant answer, a
coverage-shaped answer, and a whole-suite answer are each provably wrong, and the expectations
(`attribution-probe/verify-attribution.mjs`) were **hand-derived from the fixture's arithmetic before
any report was read** — not copied from output.

| Mutant | Covered by | Expected `killedBy` | Result |
|---|---|---|---|
| `alpha`: `n + 1` → `n - 1` | ALPHA | ALPHA | ✅ |
| `beta`: `.toUpperCase()` → `.toLowerCase()` | BETA | BETA (**not** the first test) | ✅ |
| **`delta`: `n * 2` → `n / 2`** | **BLIND + SHARP** | **SHARP only** | ✅ |
| `delta`: body → `{}` | BLIND + SHARP | BLIND **and** SHARP | ✅ |
| `gamma`: `"small"` → `""` | GAMMA | GAMMA (the **last** test) | ✅ |
| `gamma`: `n > 1000` → `n >= 1000` | GAMMA | *(survives)* | ✅ survived |

The **delta** row is the load-bearing one. `delta(0)` is `0` under both `*` and `/`, so
`PROBE_DELTA_BLIND` covers that mutant and cannot possibly detect it; `delta(3)` is `6` vs `1.5`, so
only `PROBE_DELTA_SHARP` can. Reporting both would be reporting **coverage** and calling it
attribution — precisely the substitution ADR-0447 exists to reject. The instrument reports SHARP
alone.

The `delta → {}` row is its complement: both tests genuinely do kill it, and the instrument says so,
proving the single-name results above are not an artifact of only ever emitting one name.

### The verifier itself was red-green'd

A check that cannot fail verifies nothing, so the verifier was run against three deliberately
corrupted reports:

| Fake instrument | Exit |
|---|---|
| delta mutant credited to **all covering tests** (coverage-shaped) | **1** |
| every kill credited to the **first test** (constant answer) | **1** |
| the **survivor rewritten as a kill** | **1** |
| the real, unmodified report | **0** |

---

## 4. What `diff-scoped-mutation-rung` can now rely on

Per mutant, in Stryker's standard `mutation-testing-report-schema` v1.0 JSON:

```jsonc
{
  "id": "5",
  "status": "Killed",              // Killed | Survived | NoCoverage | Timeout | …
  "killedBy":  ["3"],              // test ids that FAILED under this mutant  ← the new signal
  "coveredBy": ["2", "3"],         // test ids that EXECUTED the mutated code
  "testsCompleted": 2,
  "location": { "start": { "line": 16, "column": 10 }, … }
}
```

Test ids resolve through `report.testFiles[<file>].tests[]` (`{ id, name }`), where `name` is
`<absolute sandbox path> > <full test name>`. **The sandbox path segment changes every run**
(`sandbox-RL2TUj`), so a consumer must match on the part after `" > "`, or suffix-match the file —
never on the whole string.

Four things the rung must not get wrong:

1. **`coveredBy` is not `killedBy`.** Covering means the test executed the mutated line; killing
   means it detected the change. The delta case above is a covering test that provably cannot
   detect. Enforcing "the branch's own tests must kill it" against `coveredBy` would credit a test
   that discriminates nothing.
2. **`coverageAnalysis: "perTest"` is required.** Without it there is no per-test coverage, every
   mutant re-runs the whole suite, and attribution is unavailable.
3. **`disableBail: true` is required for a COMPLETE killing set.** With Stryker's default bail the
   plugin stops at the first failing test, so `killedBy` holds only whichever covering test happened
   to run first. For a diff-scoped rule that is a real hazard: if an older test runs first, the
   branch's own new test never appears in `killedBy` even though it also kills, and the rung would
   red a landing that actually did its job. It costs wall clock; pay it.
4. **An empty `killedBy` on a `Killed` mutant means "not identifiable", not "nothing killed it".**
   That is the plugin's fail-closed path (patch B narrows it but does not remove it — an ambiguous
   suffix match still lands there). The rung must treat it as *unproven*, never as a pass, and never
   as a survivor.

### Cost

The probe (14 mutants, 5 tests) runs in **~13–15 s** wall clock, against ~4 s for the same
`proof-protocol` full-suite run in increment 1. Per-test analysis means Stryker runs only the
covering tests — `Ran 1.00 tests per mutant on average` here rather than the whole suite each time —
so attribution should get *cheaper* than increment 1's numbers as suite size grows, not dearer. Not
measured on a real package; increment 3 should measure `proof-protocol` before budgeting.

---

## 5. The risk being taken on, stated plainly

ADR-0450's Consequences already accept "a new, unofficial, single-maintainer dependency sits on the
path that can decide whether work lands." What that decision did **not** weigh, because it was not
yet known, is that the plugin does not deliver `killedBy` out of the box at all: **we now carry two
patches against a 313 KB bundled `dist/index.js`, and one of them is inside the kill-attribution
resolution itself.**

Honest properties of that position:

- **It fails closed, in three independent ways.** `pnpm` errors loudly if the patch stops applying on
  an upstream bump; an ambiguous suffix match resolves nothing rather than guessing; and an
  unresolved name yields an empty `killedBy`, which §4.4 requires the rung to read as *unproven*.
- **It is patched against a bundle, not source**, so every upstream release needs the patch
  re-derived by reading minified-ish output. That is real recurring maintenance on an unofficial
  package.
- **Our own test suite cannot hold it.** Nothing in `pnpm -r test` exercises the patch. Its only
  proof is `pnpm mutation:attribution-probe`, which is a manual verb, not a gate rung.

**Nothing on a landing path changed in this increment, deliberately.** `pnpm gate` is untouched; the
plugin and its patches sit behind one opt-in script. The moment `diff-scoped-mutation-rung` makes
this a gate step, the position above becomes a landing-path risk, and that is an owner call rather
than a build detail — authored as `oq-mutation-attribution-vendor-patch-posture`.

---

## 6. Reproducing / re-validating

```bash
pnpm mutation:attribution-probe     # runs Stryker + checks the hand-written expectations, ~15 s
```

Exit 0 means attribution is trustworthy on this machine. Exit 1 means it is not — and per the
verifier's own message, do not build or rely on a diff-scoped mutation rung until it passes. Re-run
it after any bump of Bun, `@stryker-mutator/core`, or the plugin.

Traps already paid for, carried forward from increment 1 and confirmed still live:

- **`tsconfigFile` must point at a path that DOES NOT EXIST.** `typescript@7` exports no compiler API
  (ADR-0400 D3), so Stryker's tsconfig preprocessor throws `ts.parseConfigFileTextToJson is not a
  function` if it finds a real one. Still safe here — the Bun runner needs no tsconfig rewrite. A
  future `typescript-checker` re-opens this and must **not** be answered with a fourth `typescript5`
  alias.
- **`pnpm dlx` cannot run Stryker**; it needs a real workspace install.
- **Bun must be on PATH** (`pnpm storytree doctor --dev` probes it).
- **Drive from the repo root**, not a package directory: some suites are not hermetic to their own
  package (`notice-board` reads `.github/workflows/`), so a package-scoped sandbox fails its initial
  run. The probe config already does this via a package-scoped `mutate` glob.
