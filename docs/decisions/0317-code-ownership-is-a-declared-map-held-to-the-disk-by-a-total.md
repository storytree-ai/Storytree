---
status: accepted
decided: 2026-08-06
load_bearing: true
arc: first-class-edges-arc
amends: [310]
---
# ADR-0317: Code ownership is a declared map held to the disk by a totality check, at every grain

## Status

accepted (2026-08-06) — decided/directed by the owner in conversation on 2026-08-06. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

This ADR `amends` ADR-0310: it settles that ADR's D4 escalation
(`oq-claim-unit-any-addressable-object`) and corrects the binding-mechanism guidance its D3
consequences left open ("may need widening — globs, or a directory-level declaration"). ADR-0310's
D1 (the claim-audit read verb) and D2 (typed, resolvable claim namespace) are undisturbed and remain
unconditional.

## Context

### The question, and why the obvious answer is wrong

The owner asked, on seeing that 78.2% of source files match no declared owner: *"I expected our code
detection to be procedural — how did these files bypass it?"*

**Nothing bypassed anything, and `check:boundaries` is not broken.** Verified at HEAD `7115c899`: it
genuinely walks the disk (`readdirSync` over `packages/`, `apps/`, `stories/`) and enforces
`repo-manifest.json` `packageOwnership` over every package directory — **24 of 24, zero unmapped**
(ADR-0074, amended ADR-0075/ADR-0100). The procedure the owner remembers exists, runs, and passes.
It is satisfied by the directory *above* the file. Nothing should be read here as treating shared
substrate as drift, or as a reason to replace that check.

The natural next inference — *"so file-grain ownership is a hand-typed enumeration that nobody kept
up"* — is also wrong, and getting it wrong would build the wrong instrument. **There is no ownership
map at file grain at all, in either style.** What was read as one is a build instruction for the
prove-it-gate, pointing the opposite direction.

### The decisive fact: the proof map cannot be inverted into an ownership map

`proof.real.sourceFile` is typed `sourceFile: string` — *"Repo-relative implementation file named in
the leaf brief. IMPLEMENT may write per scope"* (`packages/orchestrator/src/proof-config.ts`). It is
a total function **unit → the one file that unit authors**. Ownership requires a total function
**file → its owner**. The first cannot be inverted into the second, for two independent reasons.
Measured 2026-08-06 at HEAD `7115c899`:

| | |
|---|---|
| `sourceFile:` declarations across `stories/**` | 155 |
| **distinct** values among them | **127** |
| of those, existing on disk under `packages/`\|`apps/` | **117** |
| nodes in the tree (45 `story.md` + 251 unit `.md`) | 296 |
| non-test source files under `packages/*` / `apps/*` | 519 |

- **Not surjective.** One `sourceFile` per real-buildable unit means the image is bounded by the NODE
  count (296), not the file count (519). Even at 100% adoption — every node in the tree
  real-buildable — the field could not cover the repo. The shortfall is structural, not behavioural.
- **Not injective.** `apps/studio/src/components/TreeView.tsx` is named by **7 different units**;
  `ChatPanel.tsx` by 4; `boundaries.ts`, `TerminalDock.tsx`, `LibraryFinder.tsx`, `LibraryDrawer.tsx`
  and `App.tsx` by 3 each. Inverting yields that file seven owners and 402 files none.

**So the enumeration is not decayed — it is nearly full.** ADR-0310 measured 111 owned files
(2026-08-05) against the 117 declared targets that exist on disk. The residue of six is method drift
between the two counts (a non-test `.ts`/`.tsx` denominator versus a raw existence check, taken a day
apart), not a backlog. Sessions have been maintaining this field diligently; it simply is not, and
never was, an ownership map. The 78.2% figure remains true and worth acting on as a statement about
what the prove-it-gate covers — it is just not evidence that anyone forgot anything.

### The real difference is a totality check, not procedure-versus-enumeration

`packageOwnership` is *also* a hand-typed enumeration — 24 entries in `repo-manifest.json`, zero
globs. It does not decay because a procedure walks the disk and demands totality. The gather says so
itself (`packages/cli/src/check-boundaries.ts:81`):

> *"Every included package must be classified (rule 0), so a new app can't slip in unowned either."*

**Both maps are declared. Only one is held to the disk by a procedure.** That is the entire
difference, and there is no counterpart one grain down. The distinction to carry forward is therefore
*checked-for-totality* versus *unchecked*, not *procedural* versus *declared* — a derived map is not
what makes the directory grain work.

### Why globs are filtered from the proof map, and why that reason does not transfer

`check-boundaries.ts:227` filters glob patterns out of the proof-bound path set
(`real.scope.sourceGlobs.filter((g) => !isGlobPattern(g))`). The stated reason is **over-attribution**,
not verdict precision: *"a WILDCARD glob is the write-scope breadth, not the unit's owned file —
resolving it would over-attribute siblings owned by OTHER units/stories."* `scope.sourceGlobs` is the
per-phase **write wall** — what a leaf may edit — and is deliberately *broader* than what the unit
owns or proves.

So neither field is an ownership map: one is a build target, the other a fence. Widening
`sourceFile` to carry globs would overload a field whose single-target meaning the phase machine and
the signed verdict both depend on, and would re-admit exactly the over-attribution `:227` exists to
prevent. The correct reading is that an ownership map and a proof-binding map are **two maps with
opposite tolerances for imprecision** — the proof map must be literal because a verdict has to name
what it covered; an ownership map may be coarse because it binds no verdict — and conflating them is
what made the gap invisible.

## Decision

**D1. Record the diagnosis: file-grain ownership does not exist, rather than existing and decaying.**
Any instrument built here starts from that. `proof.real.sourceFile` is a unit→file build target and
`scope.sourceGlobs` is a write fence; neither is an ownership declaration, and no future check,
report or ADR may treat the strict-coverage number as a maintenance backlog. `check:boundaries` is
correct at its own grain and is not to be replaced or weakened.

**D2. Ownership becomes a SECOND declared map, at subtree grain, with its own totality check —
the `packageOwnership` pattern one level down.** Owner-directed 2026-08-06.

- It is **declared, not derived.** Derivation from the import graph would be complete by construction
  but would encode who *depends on* a file rather than who is *responsible for* it, could not express
  a deliberately-shared file, and would attribute shared substrate like `@storytree/library` to all
  45 stories. Its errors would be silent and indistinguishable from its correct answers. The declared
  map fails loudly and incompletely instead, which is the failure mode the totality check converts
  into a gate.
- It is declared over **subtrees, and globs are permitted here** — safe precisely because this map
  binds no verdict, the same economy that makes 24 `packageOwnership` entries sustainable.
  *(Corrected in place 2026-08-06 after the map was authored in full, ADR-0139: this bullet
  predicted the economy would "keep the entry count in the tens rather than at 519". Measured, it
  does not. 527 files took **372 declarations**. The economy holds where a directory is homogeneous —
  `packages/forest-world/src` is one line, `packages/procedural-architecture/src/buildings` is one
  line — and breaks in flat, heterogeneous `src/` directories where ownership genuinely varies file
  by file: `packages/cli/src` is 100 files fronting ~20 different organisms with no subdirectory
  structure to exploit. Globs still pay — 372 is a 29% reduction on per-file — but "tens" was an
  estimate made before anyone walked the backlog, and 372:527 is what totality actually costs here.
  It is also the maintenance bill any future blocking rung must argue against.)*
- Its **totality check is a disk walk**: every source file must fall under some declared subtree, and
  a file falling under none is named. This is the missing rung, and it is the only part of the
  arrangement that keeps the map honest over time.
- **`proof.real.sourceFile` and `scope.sourceGlobs` are untouched.** The prove-it-gate, the phase
  machine, the write scopes and every signed verdict carry zero risk from this decision. Suggested
  home and name for the new map: `repo-manifest.json` → `sourceOwnership`, sibling to
  `packageOwnership`; the implementing increment may choose otherwise, but it must not live inside
  the proof configuration.
- It ships **REPORT-ONLY first**, per ADR-0310 D3 — unchanged. But note what the subtree grain does
  to the ratchet argument: the blocking version was impossible because it would red the repo against
  398 *files*; against unowned *subtrees* the initial list is a walkable backlog, so a ratchet becomes
  reachable rather than indefinitely deferred. ADR-0311 retired sixteen gate rungs for want of
  evidence, so the blocking rung must still earn its place on the report's own numbers before it
  lands.

**D3. The claim unit is ANY addressable object in the work graph — settling
`oq-claim-unit-any-addressable-object` and ADR-0310 D4.** Owner-directed 2026-08-06. Stories,
capabilities, arcs and declared subtrees are all claimable under one rule, and edges become an
instance of the same rule rather than a separate design.

This is what closes ADR-0310 D3's named failure mode. A declared-substrate entry that cannot be
claimed would satisfy the coverage check while changing nothing about coupling: "claim the capability
you are writing" would still have nothing to bind to, and sessions would still fall upward to the
story or the arc — the same hole with a declaration in front of it. Making the subtree claimable is
therefore not an extra; it is the half that makes the map worth building.

ADR-0310 D2 (typed, resolvable claim namespace) is the hard prerequisite and is unchanged: without
it, nothing can distinguish a legitimate new claimable kind from one of the 26 measured phantom ids.
D3 here does not license claiming before D2 ships.

*(BUILT 2026-08-06, and one thing this decision left open is settled by the build — recorded here in
place, ADR-0139, because "declared subtrees are claimable" does not on its own say BY WHAT ID.*
***A subtree's claim id is its `sourceOwnership.subtrees` KEY, verbatim, and only an exact key
resolves.*** *The key is where the object is declared, so it is its address; a derived slug would be
a second name to keep in sync, and it would collide (`packages/cli/src/ownership.ts` and
`packages/cli/src/*ownership*.ts` slug alike). Exactness is a correctness rule rather than a
preference: a claim row is keyed by the raw `unit_id` string, so resolving any CONTAINED file path
would write the file as the row and let two sessions hold two ids over the same code without ever
contending — the "claim that protects nothing" ADR-0310 D2 exists to close. A contained path is a
near-miss suggestion instead, naming the subtree and its declared owner.*

*Two consequences worth carrying. **A subtree claim does not contend with a claim on its declared
owner**, and that overlap is announced at claim time rather than enforced: the ledger keys claims by
id and knows no containment, and teaching it one across globs has no measured demand behind it —
all 56 refusals in the 40-day history were on nodes, none cross-grain — which is the bar ADR-0311
set. And **a subtree cannot ANCHOR a worktree**, since `worktree create` derives a directory and
branch name from its first `--node`; it may be claimed as a later node, and the refusal now says so
rather than advising a rename.)*

## Consequences

**Good.** The owner's question has a precise answer that does not impugn a working check or a diligent
corpus: detection is procedural at the grain it was designed for, and the grain below it was never
designed at all. The remedy has a proven template in-repo — `packageOwnership` has held at 24/24 for
its whole life — so this is a copy of a known-good shape rather than a new mechanism. Separating the
ownership map from the proof map dissolves the conflation of three jobs (proof binding, claim
addressing, map rendering) that ADR-0310's increment entry flagged as unresolved, and it does so
without touching the prove-it-gate. Answering D4 as a general rule means edges and subtrees fall out
of one decision instead of being designed twice.

**Bad, and stated plainly.** This adds a second hand-maintained map to `repo-manifest.json`, and the
totality check is the only thing standing between it and the decay everyone assumed had already
happened — if that check is ever made non-blocking or skipped, the new map rots exactly as feared.
Subtree grain is coarser than file grain, so a subtree owned by one capability may contain a file
that morally belongs to another; the map will say "owned" where a finer instrument would say
"mis-owned", and this ADR accepts that in exchange for an entry count a human can maintain. The
initial authoring of the map across `packages/cli` (91 unowned files), `apps/studio` (76),
`packages/drive` (38), `packages/orchestrator` (31), `packages/library` (29) and `apps/desktop` (26)
is real work that nobody has scheduled yet. And report-only means the hole stays open while it is
walked down — a report nobody reads changes nothing.

*(Corrected in place 2026-08-06, ADR-0139 — the decision is unchanged, two of its stated costs are
now settled facts rather than predictions. The initial authoring IS DONE: 527 of 527 files carry a
declared owner across 372 declarations, 0 contested / 0 stale / 0 unresolved. The coarseness this
paragraph accepts showed up exactly where predicted and is recorded rather than hidden —
`apps/studio/src/components/TreeView.tsx`, named by seven units, is declared at STORY grain because
no single capability is responsible for it. And the grain mix is now COUNTED: 363 files (68.9%)
capability-grain, 164 (31.1%) story-grain, the residual concentrating in `cli` 51, `studio` 34,
`drive-machinery` 13 and `desktop` 11 — a `story-author` worklist, not a closed hole. The totality
check demonstrated itself during that authoring: a merge of `main` brought two new
`packages/drive/src` files and the report named them unowned immediately, which is why the map
carries no per-package catch-all that would have absorbed them silently.)*

**Not a concurrency cap.** The owner rejected any in-flight limit, dispatch throttle or queue depth on
2026-08-04, on the ground that the system was divided into story nodes precisely so work could run in
parallel. Every decision here removes coupling by making claims finer and more precisely addressable,
or adds an instrument. A session reaching for a throttle is re-proposing the rejected option.

**Sequencing.** This feeds `first-class-edges-arc`'s existing increment
`capability-coverage-report-and-claimable-substrate`, which asked for exactly this question to be
settled before a checker was written ("Decide which one carries ownership BEFORE writing the checker,
or the checker will encode the wrong answer"). No new arc is chartered: the detection-mechanism
question is not separable from the remedy that arc already owns. ADR-0310 D1 and D2 remain the first
two increments and are unblocked by this decision.

## References

- ADR-0310 — the typed claim namespace and the addressable-object fork; **amended here**: D4 is
  settled (D3 above) and the D3 consequences' open binding-mechanism question is answered (D2 above).
  Its D1 and D2 stand unchanged.
- ADR-0074 (amended ADR-0075/ADR-0100) — package-grain ownership and `check:boundaries`: the enforced
  layer this ADR explicitly does NOT disturb, and the template D2 copies.
- ADR-0270 — capability-grain claims; D1's rule is undisturbed, and D3 here widens the namespace it
  draws from rather than re-opening the grain question.
- ADR-0311 — gate survival is evidence-backed; the bar any future blocking coverage rung must clear.
- ADR-0016 — the re-anchorable code binding; `Anchor.file` was the other ownership candidate and is
  essentially unpopulated in the disk-canonical markdown, so it is not chosen here.
- ADR-0192 — the landlord rule, which already consumes `real.sourceFile` + literal `sourceGlobs` via
  `readUnitSourceFiles`; unaffected, since neither field changes.
- `first-class-edges-arc` — the owning arc, carrying the increments and the falsifier.
- `packages/orchestrator/src/proof-config.ts` (`RealProofConfig.sourceFile` / `scope`),
  `packages/cli/src/check-boundaries.ts` (`:81` totality rule, `:227` glob filter,
  `readUnitSourceFiles`), `repo-manifest.json` (`packageOwnership`).
