# Gate-rung qualification census — 2026-08-29

**Increment:** `seeded-defect-qualification-arc-inc-01` · **Decision:** ADR-0474 (D1, D4, D5)

Measurement system analysis applied to the gate: before an instrument may judge a part, the
instrument itself must be shown to distinguish good from bad. This is a **census**, not a repair
pass. The verdict is mechanical throughout — the gate runner's own per-step `PASS` / `FAIL` / `SKIP`
row, or a rung's raw exit code. No model graded anything (ADR-0474 D4).

---

## 1. The headline

**Eight rungs sampled. Twelve defects seeded. Twelve fired. Zero misses.**

| class | count | rungs |
|---|---|---|
| **QUALIFIED** | **8** | `lint`, `check:boundaries`, `check:ownership-totality`, `check:contract-grammar`, `check:desktop-route-coverage`, `check:guidance`, `check:library-dag-acyclic`, `check:hierarchy-camps` |
| UNQUALIFIED | 0 | — |
| NOT SEEDABLE | 0 | — |
| CLAIM UNCLEAR | 0 | — |

**The count of UNQUALIFIED rungs is zero**, which is what this increment was required to state
plainly. Every sampled rung caught both a canonical and a variant instance of the defect class it
claims to catch.

**But the number is not the finding.** Section 4 is: the premise that sent this census at the gate
rungs is refuted at its own source.

---

## 2. Method

The plan is `packages/cli/src/gate-order.ts` — **24 steps**, read from the authority, never from
prose (CLAUDE.md's own count has gone stale by six before). Of those, 21 are `check:*` rungs, one is
`lint`, and two are the expensive `pnpm -r` legs.

For each mine, in order:

1. **Assert the target file is TRACKED AND CLEAN.** Only then is `git checkout -- <path>` a restore
   rather than a deletion (`mutation-proof-revert-discards-uncommitted-work`). New-file mines are
   removed with `rm`, never with git.
2. **Apply the mine.**
3. **VERIFY THE MINE LANDED** — grep for a marker, or read the field back from the store. This step
   is not ceremony: it caught a real false result (§5.1), and without it an unapplied mine reads as
   an unqualified rung, which is the very vacuous-green class this census is about.
4. **Run the rungs** and record the mechanical verdict.
5. **Revert, and verify the revert.**
6. **Closing positive control** — re-run unmutated and assert the green we started from.

Round 1 ran all eight rungs after each mine, so cross-firing is measured rather than assumed. Round 2
ran only the target rung.

**Seeding a rung with a `SKIP`-able branch was avoided entirely.** A step exiting 3 is a declared
skip = UNVERIFIED, never a pass, and cannot be scored as QUALIFIED. `SKIP_CAPABLE_CHECKS` currently
holds **six** members (`check:web-grounding`, `check:web-experience-closure`,
`check:web-experience-markers`, `check:web-engine`, `check:land-art`, `check:mutation-diff`) — note
CLAUDE.md still says five; `check:land-art` was added since. No sampled rung skipped in any run.

---

## 3. The mines

### Round 1 — the canonical instance (8 mines)

| mine | rung | the claim, in one sentence | the seeded defect | verdict |
|---|---|---|---|---|
| M1 | `lint` | A source file violates one of the adopted anti-slop rules. | `{...(flag ? {extra:2} : {})}` — `no-conditional-empty-object-spread` | **FAIL — fired** |
| M2 | `check:boundaries` | A cross-package import exists that no declared edge covers. | a relative import escaping its own package dir | **FAIL — fired** |
| M3 | `check:ownership-totality` | A source file exists that the ownership map does not own. | a new undeclared `packages/cli/src/*.ts` | **FAIL — fired** |
| M4 | `check:contract-grammar` | An added/edited contract breaches the line grammar. | stripped every code span from an `asserts —` sentence and deleted its `covers —` bullet (breach G2 `system-unnamed`) | **FAIL — fired** |
| M5 | `check:desktop-route-coverage` | The frontend calls a route the desktop does not serve. | a new `/api/zz-seeded-unserved` call in the API client | **FAIL — fired** |
| M6 | `check:guidance` | A committed guidance projection is stale against the live store. | a word inserted inside CLAUDE.md's generated region | **FAIL — fired** |
| M7 | `check:library-dag-acyclic` | The corpus's authored `dependsOn` edges contain a cycle. | a live-store edge making `adr-0474 → adr-0447 → adr-0474` | **FAIL — fired** |
| M8 | `check:hierarchy-camps` | A hierarchy reader is not declared in the camps registry. | a `"stories/…"` path literal added to an undeclared `node:fs`-importing module | **FAIL — fired** |

**Specificity was perfect.** In all seven file-based rounds, exactly one rung went red — its own —
and the other seven stayed green. No rung fired on another's mine.

M7 required a transient write to the shared live store. It was fenced: the prior value was captured
first, the edit was read back to prove the cycle was live when the rung ran, and an unconditional
restore ran on exit. Exposure was ~20 s on an idle box (`storytree own --all` showed only corpses).
Restore was verified byte-identical and the rung re-read green at 1,449 edges.

### Round 2 — the variant (4 mines)

Round 1 only shows a rung catches the *obvious* instance. ADR-0474 names that bias itself: *"a seeded
defect that is easy to catch produces a comfortable number, and nothing here forces mines to be
hard."* Round 2 plants a **different shape of the same claimed class** — still inside each rung's own
stated claim, so a miss would be a real finding and not an unfair mine.

| mine | rung | the variant | verdict |
|---|---|---|---|
| V1 | `check:guidance` | drift in `definitions.generated.json` — the *third* projection, not the CLAUDE.md region | **fired** (`definitions.generated.json is missing or stale`) |
| V2 | `check:desktop-route-coverage` | an `/api/*` literal in a frontend file **outside** the API client | **fired** — and via the fail-closed path: *"THE DERIVATION WENT BLIND — this is a RED, not a skip"* |
| V3 | `check:ownership-totality` | an orphan file under `apps/*/src` rather than `packages/*/src` | **fired** |
| V4 | `check:hierarchy-camps` | a reader reaching the hierarchy through the **live-store door** (`work_hierarchy`), not the checkout literal | **fired** |

V2 is worth reading precisely: the rung did not name an unserved route, it **refused to answer**
because its derivation had been disturbed. That is the correct behaviour for a fence and is a fire,
not a miss — but a consumer reading only "did it go red" should know the two are different.

---

## 4. THE FINDING: the premise is refuted at its own source

ADR-0474's Context, and this increment's own body, rest on a specific claim:

> *"the repo's documented vacuous-green incidents are concentrated exactly there [the check rungs]
> … Every documented vacuous-green incident in agent-memory sits in this blind spot."*

**That claim is false.** The catalogue is real, the incidents are real, and every one was correctly
recorded — but **not one of the eight is a `check:*` gate rung failing to catch its own claimed
defect class.** Classified against the actual memory bodies:

| catalogued incident | what its subject actually is |
|---|---|
| `moving-a-write-target-makes-old-readers-vacuously-green` | a **test** (a UAT leg assertion) whose precondition was silently falsified elsewhere |
| `an-expectation-derived-from-its-subject-cannot-fail` | a **harness floor** (`capture.mjs` / `prop-presence.ts`) |
| `source-text-check-trips-on-its-own-rationale` | a **test file** (`install-sh-script.test.ts`) — and the *false-positive* shape, not a vacuous pass |
| `cheap-prefilter-narrower-than-its-matcher` | a **measurement probe** (`decision-reads.ts`), not a gate step |
| `negative-permission-test-passes-vacuously` | a **test** (proving a SQL grant narrow) |
| `check-coverage-scans-only-real-testfile` | `check:coverage` — **retired by ADR-0311 D2**, and the memory calls the behaviour *"EXPECTED, not a gap"* |
| `dead-symbol-doc-sweep-greps-the-symbol` | an **absent** rung — the memory says outright *"No gate rung catches any of this"* |
| `render-text-assertion-matched-preexisting-text` | a **test** (`decision-read-coverage.test.ts`) |

Five tests, one harness floor, one ad-hoc probe, one absent rung, and one retired advisory whose
behaviour was never a defect. **Zero live gate rungs.**

So the two measurements agree, from opposite directions:

- **Seeding says** the sampled rungs catch their own defect class, canonical and variant alike.
- **The catalogue says** the repo's vacuous-green history was never about gate rungs in the first
  place. It is about **tests, harnesses and probes** — which is `test-strength-beyond-red-green-arc`'s
  subject (mutation testing already mutates source and asks whether the suite notices), and about
  **checks that do not exist**, which no qualification instrument can reach.

A rung cannot be blind to a defect class it never claimed. Several catalogued incidents are of
exactly that shape: nothing was watching, and the finding was that nothing was watching.

---

## 5. What went wrong while measuring, recorded because it is the same fault class

### 5.1 A silent no-op write nearly produced a false UNQUALIFIED

The M7 live-store mine was first applied with
`storytree library artifact adr-0447 --set dependsOn=@file --pg`. It **exited 0, printed a full
artifact render, and wrote nothing** — the `edit` verb was missing. The rung then reported `PASS —
no dependsOn cycle`, which without the read-back would have been recorded as
`check:library-dag-acyclic` UNQUALIFIED: a false finding, produced by an instrument that had not
planted the defect it was measuring.

This is the recorded `library-set-without-edit-verb-is-a-silent-read` trap, and the route into it is
worth naming: **the CLI's own `--out` footer prints the verbless form as its suggested next command**,
so the documented path emits the broken one. The read-back in step 3 is what caught it.

### 5.2 Two mines failed to land and were correctly refused rather than scored

V1's first attempt guessed the wrong field name in `definitions.generated.json` and the marker never
appeared; the harness printed `MINE DID NOT LAND — not measured` and scored nothing. Re-run against
the real field (`oneLine`), it fired. **An unverified mine is not a measurement**, and a harness
without step 3 would have logged two extra "unqualified" rungs here.

---

## 6. Scope, and what this census does not say

**Sampled (8 of 22 non-expensive steps):** the eight in §1, chosen to span the kinds — a lint rule
engine, an import-graph check, two coverage/totality checks, a corpus-grammar ratchet, a
generated-projection drift check, a live-store graph invariant, and a manifest-declaration fence.

**Deliberately NOT sampled:**

- **`check:mutation-diff` — excluded by the arc's scope fence.** It is the sibling arc's
  `diff-scoped-mutation-rung`, parked behind
  `oq-is-a-twice-patched-community-plugin-an-acceptable-foundat` (ADR-0474 D8). This arc stays
  independent of it. *(Increment 1's body offered it "if present locally"; the fence outranks the
  parenthetical.)*
- **The four `web:*` rungs** — skip-capable locally with the `web/` submodule absent. A skip is
  UNVERIFIED, so no local seed could produce a scorable verdict.
- **`check:land-art`, `check:palette-transcription`, `check:ground-space`** — pixel/art rungs; one is
  skip-capable, and a seeded pixel defect is a different measurement with its own threshold problem
  (`pixel-threshold-reads-off-a-same-run-control`).
- **`check:agents`** — the same generator and the same drift class as `check:guidance`; one of the
  pair was sampled.
- **`check:mirror-conformance`, `check:adr-health`, `check:definition-adjudication`,
  `check:hierarchy-drift`, `check:verification-decay`** — not sampled. The increment said sample, do
  not sweep.

**Three things the census does not establish**, stated so nobody reads it wider than it is:

1. **It does not prove the rungs catch every instance of their class.** Twelve seeded instances is
   twelve, not a proof of coverage. It moves the rungs from *unmeasured* to *measured on two shapes
   each*.
2. **It says nothing about the 14 unsampled rungs.**
3. **It cannot see a defect class nobody wrote a rung for** — which, per §4, is where a real share of
   the repo's documented history actually lives.

---

## 7. Recommendation to `adopt-what-the-experiments-earned`

**Adoption candidate 1 — a seeded-defect fixture beside every check — is REFUSED, on two independent
measurements.**

1. **No unqualified rung was found.** The adoption's trigger condition ("if UNQUALIFIED rungs were
   found") did not occur across 12 mines on 8 rungs.
2. **The fault class it would guard does not live in the rungs.** Zero of the eight catalogued
   vacuous-green incidents is a gate rung, so a fixture beside every check would have caught none of
   them.

A third reason to refuse it, independent of both numbers, is the shape of the guard itself. A seeded
fixture beside every check taxes the check's author on every landing, forever, to re-answer a
question this census answered once for a third of the plan — and ADR-0474 already concedes that "a
seeded-defect fixture beside every check is a maintenance surface that will rot if the check's defect
class moves." A rotted fixture is a green that means nothing, which is the failure it was built to
prevent, one level up.

**The census itself has paid for the increment.** Under ADR-0447 D5 (reused by ADR-0474 D5) an
experiment that refuses a build is a first-class outcome, and this one buys a decision plus a
correction to the decision that chartered it.

**One in-place correction is owed** (ADR-0139's correct-in-place mandate): ADR-0474's Context and
this increment's body both assert that the catalogued incidents sit in the gate-rung blind spot.
They do not. The decision's *conclusion* — that gate rungs were unqualified and that mutation cannot
reach them — survives intact and is now measured; only the sentence about where the catalogue points
is wrong, and it should be corrected rather than left standing green.
