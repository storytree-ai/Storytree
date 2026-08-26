# Mutation-score baseline — spine-authored suites, 2026-08-25

**Arc** `test-strength-beyond-red-green-arc`, increment 1 · **Decision** ADR-0447

This is a MEASUREMENT, not a build. It adds no gate rung, no CI step, and nothing any other session
must obey. Its job is to produce a number the repo did not have, because every later increment on
this arc is priced against it — and because a high number was a legitimate reason to close most of
the arc unbuilt (ADR-0447 D5).

**The number came back MIXED: 78.67% across 1,425 mutants in three packages,** with two files below
32%. Neither "our suites are fine, close the arc" nor "our suites are theatre". The rest of this
document is what that means and what it does not.

---

## 1. Why this question needs its own instrument

Our prove-it-gate establishes that a genuine red preceded the green, that the spine rather than the
model observed both, and that a verdict was signed over it. It does not establish that the test would
catch any defect other than the one arranged to make it red.

ADR-0122 built per-contract coverage on static name-presence and deferred the hollow-test hole,
contemplating "a runtime-observed coverage signal". ADR-0126 closed that hole with a static AST
classifier — it catches `assert(true)` and skipped tests. Neither reads whether an assertion is
STRONG, and `packages/cli/src/coverage.ts` says so to the operator in as many words: *"A
substantive-but-irrelevant assertion still reads covered."*

Coverage cannot stand in. Suites have been measured at 100% line coverage and 4% mutation score
(arXiv 2506.02954), and a 2026 replicability study found coverage's correlation with real-bug
detection collapses once the code under test actually contains defects, while mutation score held at
r=0.863 (arXiv 2607.22880).

**What no published study could tell us:** every one of those datasets is post-hoc LLM test
generation — tests written *after* the implementation, the workflow our spine structurally prevents.
Nobody outside this repo can supply this number for us. That is the whole reason for this increment.

---

## 2. The numbers

Subjects are three pure, browser-safe, node-free packages, chosen to represent spine-authored proof
code rather than UI glue.

| Package | Score | Killed | Survived | Timeout | Mutants | Wall clock |
|---|---:|---:|---:|---:|---:|---:|
| `packages/proof-protocol` | **70.14%** | 101 | 43 | 0 | 144 | 4 s |
| `packages/notice-board` | **78.50%** | 840 | 230 | 0 | 1,070 | 3 m 26 s |
| `packages/studio-members` | **85.31%** | 178 | 31 | 2 | 211 | 1 m 09 s |
| **Combined** | **78.67%** | 1,119 | 304 | 2 | 1,425 | ~4 m 40 s |

Per file, worst first:

| File | Score | Killed | Survived |
|---|---:|---:|---:|
| `notice-board/src/store/ingest-merge.ts` | 31.11% | 28 | 62 |
| `proof-protocol/src/criterion-binding.ts` | 31.25% | 5 | 11 |
| `proof-protocol/src/attestations.ts` | 57.14% | 12 | 9 |
| `proof-protocol/src/enums.ts` | 65.22% | 15 | 8 |
| `proof-protocol/src/proof.ts` | 71.43% | 35 | 14 |
| `studio-members/src/store/user-store.ts` | 80.49% | 66 | 16 |
| `notice-board/src/claim-history.ts` | 81.86% | 176 | 39 |
| `notice-board/src/store/claim-store.ts` | 82.04% | 411 | 90 |
| `notice-board/src/claim.ts` | 85.23% | 225 | 39 |
| `studio-members/src/users.ts` | 88.37% | 112 | 15 |
| `notice-board/src/work-event.ts` | 94.12% | 16 | 1 |
| `proof-protocol/src/anchor.ts` | 100.00% | 10 | 0 |
| `proof-protocol/src/usage-event.ts` | 100.00% | 8 | 0 |

---

## 3. The instrument was validated before its numbers were trusted

A mutation harness that silently fails to run mutated code reports a perfect score. That is the
repo's own commonest defect class, so the harness was checked in BOTH directions by hand before any
number above was believed.

**A reported SURVIVOR genuinely survives.** Stryker reported that replacing `"retired"` with `""` in
`WorkEventDoc`'s event enum survives. Applied to the real source: `34 pass, 0 fail`.

**A reported KILL genuinely kills.** Stryker reported that changing `boundHash: z.string().min(1)` to
`.max(1)` in `anchor.ts` is killed. Applied to the real source: `33 pass, 1 fail` — *"Anchor
round-trips a valid doc and rejects a malformed one"*.

Both directions hold, so the harness observes what it claims to observe.

---

## 4. How to read a mutation score — the part that matters more than the number

**A score is a PROMPT TO LOOK, never a number to gate on.** The two sub-32% files in this run are
low for completely different reasons, and treating them the same would be wrong in both directions.

### 4a. `ingest-merge.ts` at 31.11% is NOT a weak-assertion finding

Its survivors are dominated by `BlockStatement → {}` (13) and `ConditionalExpression → true` (17) —
whole function bodies emptied with the suite still green. Reading the file explains it: the exported,
unit-testable surface is `releaseBranchClaims` and `parseMergedHeadRefs`, and the rest is a private
`async function main()` that opens a real Cloud SQL pool. That half is untestable by a hermetic unit
test BY DESIGN (`pnpm -r test` is credential-free, ADR-0302 D3).

Its low score is a statement about what the file IS, not about how well it is tested. **A naive
ceiling would have reported this as the worst problem in the repo, and it is not a problem at all.**
This single case is the strongest argument in this document against ADR-0447's rejected alternative
of a score-based gate threshold.

### 4b. `criterion-binding.ts` at 31.25% IS a real hole, and a sharp one

Its survivors are dominated by **regex anchor mutations**. Both of these survive:

```
- .regex(/^uatc_[0-9a-f]{24}$/, "criterionId must be an opaque uatc_ id")
+ .regex(/uatc_[0-9a-f]{24}$/,  …)      // start anchor dropped — survives
+ .regex(/^uatc_[0-9a-f]{24}/,  …)      // end anchor dropped  — survives
```

Verified by hand, stripping **both** anchors at once: `34 pass, 0 fail`. So a validator whose entire
job is to reject malformed opaque identities has no test that feeds it a malformed identity with
valid content embedded — `"junk-uatc_" + 24 hex + "-junk"` validates clean and nothing notices. The
same shape holds for `CriterionRevisionId`'s `uatr1:` binding.

This is precisely the class the arc exists to find: a test that runs, asserts substantively, names
its contract, went genuinely red once, and would not catch the bug.

### 4c. Enum members nothing exercises

`enums.ts` contributes 8 survivors, all `StringLiteral`, and `work-event.ts` contributes its single
survivor the same way: an enum member can be replaced by `""` with the suite green, meaning no test
ever constructs that state. The `WorkEventDoc` `"retired"` case in §3 is one of these. This is the
edge-case-gap axis in its purest form and is exactly what increment 2's property legs are for — a
property quantifying over `z.enum`'s members cannot leave one unexercised.

### 4d. Some survivors are cosmetic and should be ignored

Blanking an error MESSAGE string (`message: "criterion verdicts require…"` → `""`) survives, and
should. Asserting on human-readable message text would make the suite brittle for no fault-detection
gain. Equivalent mutants are real and a 100% score is not the goal anywhere.

---

## 5. Cost, and what it implies for increment 3

Wall clock scales with suite runtime × mutant count, because the `command` runner has no per-test
coverage analysis and re-runs the whole suite per mutant:

- `proof-protocol` — 144 mutants, ~50 ms warm suite → **4 s**
- `studio-members` — 211 mutants, larger suite → **69 s**
- `notice-board` — 1,070 mutants → **206 s**

Extrapolated naively across all 25 workspaces this is far past any gate budget. **Diff-scoped it is
cheap**, which is why increment 3 is specified to mutate only the files a landing touches, taking its
file set from the existing `packages/cli/src/ci-affected.ts` classifier rather than a second one.

---

## 6. Traps hit while doing this — do not rediscover them

**`pnpm dlx` cannot run Stryker here.** Stryker resolves `typescript` from its own install tree; under
`dlx` that isolation makes it `ERR_MODULE_NOT_FOUND`. It needs a real workspace install.

**`typescript@7` exports no compiler API** (ADR-0400 D3 — the package entry is a version stub), so
Stryker's tsconfig preprocessor dies with `TypeError: ts.parseConfigFileTextToJson is not a function`.
Worked around by pointing `tsconfigFile` at a path that does not exist, which is safe ONLY because the
`command` runner needs no tsconfig rewrite. A future Stryker `typescript-checker` re-opens this, and
per ADR-0400 D3 must NOT be answered with a fourth `typescript5` alias.

**Not every suite is hermetic to its own package.** `notice-board`'s suite reads repo-root files
(`.github/workflows/claim-release.yml`), so Stryker's package-scoped sandbox fails its initial run
with 3 failures. It must be driven from the repo root with a package-scoped `mutate` glob instead.
Recorded as a finding; not fixed here.

**Bun must be on PATH** and a shell that started before 2026-08-24 will not have it —
`export PATH="$PATH:/c/Users/mickh/.bun/bin"`.

---

## 7. Reproducing this

Requires `@stryker-mutator/core` (a root devDependency, wired into nothing) and Bun on PATH. Write
this config into the package directory, run, then delete it — no Stryker config is committed at any
package root, deliberately, so that a decision not to build increment 3 leaves no machinery behind.

```json
{
  "testRunner": "command",
  "commandRunner": { "command": "bun test src/" },
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"],
  "coverageAnalysis": "off",
  "reporters": ["json", "clear-text", "progress"],
  "jsonReporter": { "fileName": "reports/mutation.json" },
  "concurrency": 6,
  "timeoutMS": 60000,
  "tempDirName": ".stryker-tmp",
  "tsconfigFile": "stryker-no-tsconfig.json"
}
```

```bash
cd packages/proof-protocol && pnpm exec stryker run
```

For `notice-board`, place the same config at the REPO ROOT instead, with
`"command": "bun test packages/notice-board/src/"` and
`"mutate": ["packages/notice-board/src/**/*.ts", "!packages/notice-board/src/**/*.test.ts"]`.

---

## 8. What this measurement decides

**It does not close the arc** (ADR-0447 D5's early-exit is not taken). 78.67% with two files below
32% and a demonstrated real hole in identity validation is not a suite that needs no instrument.

**It does not justify a ceiling either.** §4a is the counterexample: the lowest-scoring file in the
run has no defect at all. ADR-0447's Consequences already forbid a threshold, and this run is the
evidence for that clause rather than against it.

**It sharpens increment 2.** The enum-member survivors (§4c) and the regex-anchor survivors (§4b) are
both shapes a property leg closes directly, and both live in packages already measured here — so the
before/after for increment 2 is already on the record.

**Not measured, deliberately:** `apps/studio` and `packages/app-surface`, the two `vitest` workspaces.
Their UI mutation profile does not represent spine-authored proof code, and including them would blur
the question this baseline exists to answer.

---

## 9. Follow-up — what increment 2 moved

Added 2026-08-25, same day, after the property leg landed (arc increment
`pbt-as-an-additive-proof-leg`, ADR-0447 D3). Same instrument, same config, same subject — so this is
a like-for-like before/after rather than a re-measurement.

| File | Before | After | Change |
|---|---:|---:|---|
| `criterion-binding.ts` | 31.25% | **87.50%** | anchors, length, character class, and the content hash |
| `enums.ts` | 65.22% | **100.00%** | every member set pinned to a hand-written literal |
| `work-event.ts` | 94.12% | **100.00%** | the `"retired"` member, and its two siblings |
| `attestations.ts` | 57.14% | 57.14% | untouched — not in this increment's scope |
| `proof.ts` | 71.43% | 71.43% | untouched — not in this increment's scope |
| **package total** | **70.14%** | **82.64%** | 101 → 119 killed, 43 → 25 survived |

**Both measured holes are closed**, and each was verified by hand rather than inferred from the
score: stripping `^` from `CriterionId`'s pattern now fails the suite (it did not before), stripping
`$` now fails, and deleting `"retired"` from `WorkEventDoc` now fails.

### Three things worth carrying forward

**A property is not always the right instrument, even on a mutation-found hole.** The enum survivors
are NOT closed by a property. The obvious property — *every member of `X.options` parses* — derives
its expectation from its own subject, so mutating the enum mutates the expectation and it stays
green. That is `an-expectation-derived-from-its-subject-cannot-fail` wearing a property-test costume.
What actually kills those mutants is an example-based assertion against a **hand-written literal set**;
the property only covers the complementary half (nothing outside the set parses). ADR-0447 D3's
"additive, never sole proof" turned out to be load-bearing on the very first use.

**The measurement found a third hole nobody had named.** `criterionRevisionId` — the FNV-1a/64
content binding behind `uatr1:` ids (ADR-0253) — was completely unexercised: emptying its mixing loop
and flipping its multiply to a divide both survived. A content binding whose loop does nothing
returns the same id for every input, so every criterion revision would collide. This was not in
increment 1's write-up because a 31.25% file's survivor list was read for its headline (the anchors)
and the rest deferred. **Read the whole survivor list, not the top of it.**

**A hash is close to the ideal property subject.** Its contract is stated over all inputs and there
is no interesting single example, so the example-based leg has nothing much to say. Determinism and
shape are the floor; DISTINCTNESS is what kills the mutants, because a broken mixer collides
immediately. Collision risk is negligible at 64 bits (birthday bound ~1.4e-14 over 1,000 pairs) and
the seed is pinned anyway.

### What is deliberately still surviving

`criterion-binding.ts`'s two remaining survivors are both blanked zod error-message strings, which
§4d already classified as cosmetic — asserting on human-readable message text buys no fault detection
and makes the suite brittle. `attestations.ts` (57.14%) and `proof.ts` (71.43%) were out of scope and
are untouched; they are the obvious next targets if this arc continues past increment 3.

---

## 10. Follow-up — what increment 4 moved, and where the manual sweep now stands

Added 2026-08-26 (arc increment `proof-protocol-remaining-weak-files`). Same instrument, same config,
same package — the two files §9 left untouched, plus one §9 could not have named.

### 10a. The numbers

| File | Before | After | What moved |
|---|---:|---:|---|
| `attestations.ts` | 57.14% | **85.71%** | the `testId`/`criterionId` binding, plus its issue path |
| `proof.ts` | 71.43% | **87.76%** | the issue paths on all three verdict refinements |
| `story-baseline.ts` | 73.68% | **94.74%** | anchors, the hash padding, and the canonical separator |
| **package total** | **82.95%** | **93.18%** | 146 → 164 killed, 30 → 12 survived |

⚠ **The package total is NOT comparable to §9's 82.64%,** and the per-file rows are. Two files have
landed in this package since §9 was written (`story-baseline.ts`, `scope-event.ts`), taking the
mutant count from 144 to 176, so the totals measure different populations. Every per-file row above
is like-for-like.

### 10b. Every survivor, classified — the three classes, plus a fourth this run needed

All 23 survivors across the two named files were classified before anything was written (§4's
discipline), and the classification is what decided the work rather than the score:

| Class | Count | Which | Action |
|---|---:|---|---|
| REAL hole | 3 | `attestations.ts`: the whole `superRefine` body, its condition, its if-body | closed |
| Consequential | 1 | `attestations.ts`: `ctx.addIssue({})` — zod THROWS on an issue with no code | closed by the same test |
| Diagnostic path | 10 | 2 in `attestations.ts`, 8 in `proof.ts` | closed |
| Cosmetic (message) | 6 | blanked message strings across both files | **left alive on purpose** |
| **Equivalent** | 3 | `CriterionVerdict`'s `||` and both its operands | **left alive, and PROVEN so** |

### 10c. The one real hole, and why only mutation could have found it

`Attestation`'s refinement — *a current attestation's `testId` must equal its `criterionId`* — was
**completely unexercised**. Emptied, an attestation whose `testId` names a DIFFERENT criterion parses
clean: `success: true` where the real schema returns `false`. A vouch is keyed by TEST id and never
rolls up to a story (ADR-0044 d.2), so that is a vouch filed against the wrong criterion, entering
the append-only log through the published shape other organisms `.safeParse()` across the ADR-0068 §3
boundary.

**The reason it hid is worth more than the finding.** `criterion-binding.ts` DOES assert
`Attestation.safeParse(base).success === false` — but `base` omits both ids, so it fails on the
REQUIRED fields and never reaches the refinement at all. **A rejection for the wrong reason is
indistinguishable from a rejection for the right one**, and no amount of reading the test would say
which you had. This is `an-expectation-derived-from-its-subject-cannot-fail`'s sibling: an assertion
that passes for a reason other than the one it names.

### 10d. `proof.ts` at 71.43% was NOT a weak-validator finding — say so plainly

Every mutant in `proof.ts` that changes whether a verdict is ACCEPTED OR REJECTED was already killed
before this increment. Its behavioural contract was fully pinned. What survived was diagnostics: six
message strings (cosmetic) and eight issue PATHS. **A file can sit at 71% and have nothing wrong with
what it lets through** — the second instance in this document, after §4a's `ingest-merge.ts`, of the
score pointing somewhere other than where a naive reading would send you. The two cases are different
though, and the difference matters: `ingest-merge.ts` had no defect at all, whereas `proof.ts` had a
real if narrower one.

**Paths were pinned; messages were not, and that line is deliberate.** §4d rules out asserting on
human-readable message text, and this increment keeps that. A `path` is a different class: structured,
machine-read data this repo's own renderers consume — `packages/library/src/library-doc.ts` builds
its missing-field list from `issue.path`, `packages/drive/src/uat-drive.ts` puts it in a refusal
reason an operator reads. One of them is real logic rather than a constant: `Verdict`'s
present-together refinement computes `hasCriterion ? ["revisionId"] : ["criterionId"]`, deliberately
naming the ABSENT half so the error says which field to add. Nothing exercised that ternary in either
direction, so inverting it was invisible — verified by hand, an inverted ternary now fails the suite.

### 10e. A fourth class: EQUIVALENT mutants, proven rather than asserted

`CriterionVerdict`'s three surviving conditional mutants (`||` → `&&`, and either operand → `false`)
are **equivalent**, and this was established by measurement rather than by reading the code. All four
id-presence states were enumerated against the original and each mutant:

| State | original | `||`→`&&` | left→`false` | right→`false` |
|---|---|---|---|---|
| both ids present | pass | pass | pass | pass |
| neither present | fail | fail | fail | fail |
| criterionId only | fail | fail | fail | fail |
| revisionId only | fail | fail | fail | fail |

**`success` is identical everywhere.** They survive because `Verdict`'s own present-together
refinement runs first, so the mixed states can never reach `CriterionVerdict` AS A SUCCESS — the
schema is redundant there by construction. The mutants differ only in whether a SECOND issue is
appended at the same path, so killing them means asserting a duplicate-diagnostic count: pinning
behaviour nobody wants, which would go red the moment someone sensibly de-duplicates.

This class is worth naming because it is not §4d's "cosmetic" and not §4a's "untestable by design".
It is code that is genuinely redundant, where the redundancy is a defensive choice. **Three of the
fourteen `proof.ts` survivors were structurally unkillable**, which is a concrete reason a score
ceiling would have been wrong here specifically, not just in principle.

### 10f. Reading the whole list paid again, one increment after it was named a lesson

`story-baseline.ts` (73.68%) is not in §2's table because it did not exist when the baseline was
taken — ADR-0416 D6 landed afterwards. It was **outside this increment's named scope** and got worked
anyway, because §9's closing lesson is *read the whole survivor list, not the top of it*, and
deferring it would have repeated increment 1's mistake one increment later. Three real holes, all
hand-verified:

- **Regex anchors** on `/^sbl1:[0-9a-f]{16}$/` — the identical shape §4b found in `criterion-binding.ts`,
  recurring in a newer file. The same defect class reappears in new code as it is written, which is an
  argument for increment 3's diff-scoped rung rather than for more manual sweeps.
- **The padding.** `padStart(16, "0")` → `padStart(16, "")` survived. One hash in sixteen has a leading
  zero nibble and renders short, so unpadded the constructor THROWS. `["cap-0"]` is such an input; it
  is promoted as a permanent example (ADR-0447 D3) rather than left for a generator to rediscover.
- **The canonical separator.** `join("\n")` → `join("")` survived, and is the sharpest of the three:
  `["ab", "c"]` and `["a", "bc"]` both canonicalise to `abc` and bind to the SAME fingerprint. A
  baseline fingerprint that collides across different declared sets cannot answer *"has the set
  moved?"*, which is the one question ADR-0416 D6 built it to answer — expansion beyond a proven
  baseline would silently read as none.

### 10g. Instruments, picked per hole

§9's finding held and gained a second instance. **Properties** for the anchors, the padding and the
distinctness — contracts stated over all inputs with no interesting single example. A **hand-written
literal table** for `proof.ts`'s issue paths, because the subject is a fixed two-case mapping and any
property phrased against the schema's own output would derive its expectation from its subject. And
an **example** for the `story-baseline` collision, because the failure is a specific structural
coincidence — two adjacent ids whose concatenation matches a different split — that a generator
drawing arbitrary strings would essentially never produce. The distinctness property beside it covers
the general half and would **not** have caught that one alone.

### 10h. Verification — the attribution the instrument cannot give

The `command` runner reports `killedBy: ["0"]`, where test `0` is literally named *"All tests"*, so it
can say the package caught a mutant and can never say which test did. Each kill was therefore checked
by hand in **both** directions with the new legs moved aside:

| Mutant | with the new legs | legs removed |
|---|---|---|
| `testId !== criterionId` → `false` | RED (2 fail) | GREEN |
| conditional issue path INVERTED | RED (1 fail) | GREEN |
| `path: ["unitId"]` → `[]` | RED (1 fail) | GREEN |
| `sbl1` start anchor dropped | RED (1 fail) | GREEN |
| `sbl1` end anchor dropped | RED (2 fail) | GREEN |
| `padStart(16, "0")` → `padStart(16, "")` | RED (3 fail) | GREEN |
| `join("\n")` → `join("")` | RED (1 fail) | GREEN |
| CONTROL — the `testId` message blanked | GREEN | GREEN |

Every kill is attributable to this increment's legs, and the cosmetic control survives either way.
Restoration was from byte-exact copies rather than `git checkout --`, and the run ends on a positive
control re-running the unmutated suite — a mutation harness that restores from HEAD deletes any
uncommitted work under test and keeps going, so every later line measures a tree nobody intended.

### 10i. What this decides about the manual sweep

**The manual sweep of this package is DONE, and it should not be widened to other packages.** This
increment was parked as the last speculative one of its shape, with the explicit instruction that how
well it paid is evidence either way. Read honestly, it paid LESS than increment 2 and the trend is the
argument:

- Increment 2 found **two** measured holes plus **one** nobody had named, in files scoring 31–65%.
- Increment 4 found **one** genuine accept/reject hole (`attestations.ts`) across the two named files.
  `proof.ts` — the larger of the two, and the one guarding the verdict shape — turned out to have
  nothing wrong with what it lets through.
- The remaining 12 survivors in the whole package are 9 cosmetic and 3 provably equivalent. **There is
  no next weak file here**: the package is at 93.18% and what is left is unkillable or not worth
  killing.

The one finding that argues for CONTINUED instrumentation argues specifically for increment 3 and not
for more sweeps: `story-baseline.ts` reproduced `criterion-binding.ts`'s exact anchor defect in code
written *after* that defect was found and fixed. A manual sweep cannot catch that — it is a
new-code problem, and the answer to a new-code problem is the diff-scoped rung, which mutates what a
landing touches. Sweeping `notice-board` or `studio-members` by hand would spend increasing effort on
files already scoring 78–85%, whose survivor profile §4a and §4c already characterise, to find fewer
holes than this run did.

**Recommendation, non-binding:** close the manual-sweep half of this arc here. The open question is
the one already with the owner — whether the diff-scoped rung is built at all
(`oq-mutation-testing-cannot-say-which-test-caught-a-defect-so`), which this run leaves untouched and
mildly strengthens: the attribution gap in the table above is exactly the thing that made every kill
here cost a hand-verification pass.
