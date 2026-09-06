# Has a signed GREEN ever been contradicted by later history?

**Taken 2026-09-06.** `verdict-accuracy-arc` increment 2. Instrument: `packages/cli/src/verdict-contradiction.ts` (+ `.run.ts`), run as `pnpm verdict-contradiction`.

## ⚠ Read this before quoting any number below

**This is a SMOKE TEST, not a precision figure.** It establishes whether the phenomenon exists and roughly how often. It does not measure a false-pass RATE, and no number in it should be quoted as one.

The reason is in the method and cannot be engineered away. Classifying a commit as a fix rather than a refactor or a feature is unreliable in both directions: a message saying "fix" may be a rename, and a real regression may land with no such word. The heuristic here is deliberately biased to OVER-report — commits it cannot classify at all stay in the shortlist rather than being dropped — so the widest rungs are upper bounds and the shortlist is a reading list, not a result. **The cases are the useful output; the counts are context for them.**

No LLM judge is used, deliberately. `docs/research/benchmark-landscape-2026-09-04.md` records the published finding that LLM judges cannot detect false completion (AUROC ≤0.65) where programmatic state checks can, which is the whole reason the spine is deterministic.

This document BANKS A READING and adjudicates nothing — no gate rung is added, no threshold is set, and no guidance changes on the strength of anything below (the arc's posture: "measure first, decide never"). If a case here is a genuine false pass, that is an owner fork to be opened on the evidence, not a decision taken inside the increment that found it.

## The population, and the premise that had to be re-scoped first

> **Finding 1 — the increment's own method selects an empty set, and this run re-confirmed it.** `boundHash` — ADR-0016's binding anchor, the field that would say WHICH BYTES a verdict proved — is stamped on **0 of 665** stored verdicts. The increment as authored says "for each `--real` verdict with a `boundHash`, resolve the span it bound"; there are none, on any row, and a content hash of a span as it stood at proof time cannot be back-filled afterwards. Span grain is unavailable for this entire corpus. (Increment 1 measured this first; it is re-measured here rather than inherited.)

So the reading below is taken at **declared-proof-pair grain** instead: a unit's `real.testFile` and `real.sourceFile`, the two paths the phase machine builds its write walls from, resolved the same way `leaf-test-strength.ts` resolves them. That is coarser than a span, and the ladder below exists because of it.

| | count | |
|---|---:|---|
| verdicts in `events.verdict` | 665 | every row |
| carrying a `boundHash` | 0 | Finding 1 |
| resolved to a declared proof pair | 178 | the population |
| distinct units those cover | 108 | deduped — a unit proved four times counts once |
| units whose proof commit is not in this checkout | 5 | a THIRD state: the proof ran on a branch since squashed away, so git cannot answer |
| **units history could be walked for** | **103** | the denominator for every rate below |

## The ladder

Each rung is a strict subset of the one above it. The widest admits everything, including commits that could not be classified; the narrowest is small enough to read by hand. `units` matters as much as `commits`: forty commits over three units is a different claim from forty over forty.

| rung | rows | distinct commits | units | units as share of the denominator | admits |
|---|---:|---:|---:|---:|---|
| `touched-source` | 516 | 298 | 83 | 80.6% | landed after the verdict and touched the file the verdict's unit was scoped to implement |
| `co-changed-pair` | 227 | 144 | 70 | 68.0% | ...and also touched that unit's declared test file, so the proof's own oracle had to move |
| `oracle-grew` | 221 | 142 | 68 | 66.0% | ...and ADDED lines to that test file, so a case was written that the original proof did not have |
| `fix-shaped-or-unclassified` | 88 | 55 | 43 | 41.7% | ...and reads as a repair, or could not be classified at all — THE SHORTLIST, to be hand-read |

**`rows` is not a count of distinct events, and the gap is large.** Units share files — three terminal units all declare the same studio component as their source file — so one commit is counted once per unit it reaches. Read `distinct commits` as the number of things that happened and `rows` as the number of (unit, commit) pairs. This is a property of file grain, not a defect of the walk, and it is one more reason the span-level anchor would be worth having.

Set aside before the ladder starts: **66** spine re-proof commits (`storytree real build …`). Those touch the proved pair by construction every time a unit is re-proved, and they are not contradictions — re-proving a unit means the leaf wrote a NEW test which the spine watched go red against the CURRENT source, and that red is about the new test, not about the old code being broken. Left in, they would have dominated the shortlist.

### What the test file is worth

The increment's fallback option was file grain alone — "did a later fix touch that FILE". Taken on its own that reading returns **92** commits over **38** units. The ladder's shortlist is **88**, because it also requires the unit's own declared test file to have been touched and to have grown. Both are reported: the narrowing is shown, not asserted.

### How the classifier read the widest rung

| class | commits |
|---|---:|
| `re-proof` | 0 |
| `fix-shaped` | 92 |
| `feature` | 256 |
| `refactor` | 44 |
| `test-only` | 10 |
| `housekeeping` | 5 |
| `unclassified` | 109 |

`unclassified` is not noise and is not dropped: this repo's history carries a large minority of commits with no conventional-commit prefix, and treating them as noise would silently discard the biggest unexamined bucket. They stay in the shortlist.

## The shortlist — the useful output

**88 commits over 43 units.** Ordered by lines added to the proved test file — the crudest available proxy for how much the oracle had to grow. Each row is a CANDIDATE to read, never a confirmed false pass.

| unit | +test lines | class | commit | subject |
|---|---:|---|---|---|
| `decision-point-playback` | 594 | unclassified | `c5efa463` | wip: restore decision-point-playback (reader, not producer; live studio consumer) |
| `experience-rollout-guardrails` | 465 | fix-shaped | `4a0b9dbc` | fix(gate): the Act 1 WebGL closure rung walks the graph it claims to walk |
| `multi-session-tabs` | 319 | unclassified | `3757292f` | Terminal UX table stakes (patterns-survey inc D): allowlisted links, OSC titles, per-tab search, write-only OSC 52 + right-click copyPaste |
| `seed-opens-new-tab` | 319 | unclassified | `3757292f` | Terminal UX table stakes (patterns-survey inc D): allowlisted links, OSC titles, per-tab search, write-only OSC 52 + right-click copyPaste |
| `terminal-dock-panel` | 319 | unclassified | `3757292f` | Terminal UX table stakes (patterns-survey inc D): allowlisted links, OSC titles, per-tab search, write-only OSC 52 + right-click copyPaste |
| `map-boot-independence` | 296 | fix-shaped | `0a5c8dd3` | fix(map-boot-independence): finish the dead-comments removal and cover all six contracts |
| `uat-machine-proof-binding` | 220 | unclassified | `9a719fab` | ADR-0206: rename story-level 'UAT tests' to 'UAT test criteria' |
| `noticeboard-cli` | 218 | unclassified | `6771aeda` | CLI + drive presence retirement — the claim ledger is the one session machinery (ADR-0200 D7, plan-6 lane B wave 1) |
| `library-typed-edges` | 217 | fix-shaped | `9fc01217` | fix(library): render an increment structurally so its cites reach the wire |
| `r3f-world-spike` | 188 | unclassified | `a3e55b07` | wip: parcel identity, embedded kit asset, and four crossings |
| `noticeboard-cli` | 183 | unclassified | `793974a9` | The board reads the ledger, the gate enforces the claim (ADR-0200 D7/D3, inc 3 units 2+3) |
| `pty-session-manager` | 161 | unclassified | `a112529c` | Terminal throughput (patterns-survey inc B): per-session data batching + ack-based flow control |
| `noticeboard-cli` | 150 | fix-shaped | `966a77c3` | feat(noticeboard): one stale predicate, and every claim surface says "stale" (ADR-0346 D1) |
| `ambient-integration` | 142 | unclassified | `6771aeda` | CLI + drive presence retirement — the claim ledger is the one session machinery (ADR-0200 D7, plan-6 lane B wave 1) |
| `multi-session-tabs` | 137 | unclassified | `4d1bf254` | Terminal ConPTY-aware resize (patterns-survey inc C): debounced pty resize forward + frontend-clear state-sync |
| `seed-opens-new-tab` | 137 | unclassified | `4d1bf254` | Terminal ConPTY-aware resize (patterns-survey inc C): debounced pty resize forward + frontend-clear state-sync |
| `terminal-dock-panel` | 137 | unclassified | `4d1bf254` | Terminal ConPTY-aware resize (patterns-survey inc C): debounced pty resize forward + frontend-clear state-sync |
| `noticeboard-cli` | 126 | fix-shaped | `2142acc2` | fix(cli): a write that took nothing stops reporting success |
| `r3f-world-spike` | 118 | unclassified | `89de6bd0` | ADR-0169: procedural reveal-on-focus trails — cost-field routing, trail merging, caves |
| `noticeboard-cli` | 114 | fix-shaped | `d5b7fe22` | fix(noticeboard): identity derives from any git-registered linked worktree (ADR-0033 D1) |
| `terminal-capture-activation` | 100 | unclassified | `7afb0c7f` | Give the traversal trace a window-grade identity, and record flagged reads |
| `multi-session-tabs` | 98 | unclassified | `4222315b` | Terminal rendering correctness (patterns-survey inc A): unicode11 parity, scrollback alignment, windowsPty, Claude-aware spawn env |
| `seed-opens-new-tab` | 98 | unclassified | `4222315b` | Terminal rendering correctness (patterns-survey inc A): unicode11 parity, scrollback alignment, windowsPty, Claude-aware spawn env |
| `terminal-dock-panel` | 98 | unclassified | `4222315b` | Terminal rendering correctness (patterns-survey inc A): unicode11 parity, scrollback alignment, windowsPty, Claude-aware spawn env |
| `local-backend-boot` | 88 | unclassified | `fed9bd90` | Desktop backend: mirror the studio's GET /api/claims + POST /api/adopt |
| `library-typed-edges` | 87 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `library-lifecycle-shelf` | 86 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `r3f-world-spike` | 86 | fix-shaped | `5b1dd4f7` | fix(forest-world-r3f): consolidate the real pass — contract-id coverage + positional faithfulness |
| `r3f-world-spike` | 84 | fix-shaped | `a251e304` | fix(chapter2): kill the mutation rung's sixteen survivors on this branch's own lines |
| `traversal-session-query` | 84 | unclassified | `7afb0c7f` | Give the traversal trace a window-grade identity, and record flagged reads |
| `multi-session-tabs` | 83 | unclassified | `dd7cccf5` | Terminal dock: render on xterm's WebGL renderer, DOM fallback stays honest |
| `seed-opens-new-tab` | 83 | unclassified | `dd7cccf5` | Terminal dock: render on xterm's WebGL renderer, DOM fallback stays honest |
| `terminal-dock-panel` | 83 | unclassified | `dd7cccf5` | Terminal dock: render on xterm's WebGL renderer, DOM fallback stays honest |
| `boot-read-routes` | 79 | unclassified | `99a5dc52` | Desktop backend: serve GET /api/docs/content (ADR body in the library overlay dive) |
| `r3f-world-spike` | 79 | unclassified | `c3a770c6` | Retire the placeholder story tree from the 3D map — the mesh and its caster |
| `terminal-boundary-observations` | 75 | unclassified | `7afb0c7f` | Give the traversal trace a window-grade identity, and record flagged reads |
| `local-backend-boot` | 73 | unclassified | `b56daae0` | desktop presence retirement: the sidecar goes presence-free (ADR-0200 D7, plan-6 lane E wave 1) |
| `traversal-trace-sink` | 73 | unclassified | `7afb0c7f` | Give the traversal trace a window-grade identity, and record flagged reads |
| `library-selection-card` | 70 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `library-overview` | 67 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `ambient-integration` | 65 | fix-shaped | `0f984493` | fix(notice-board): ambient heartbeat never resurrects a retired session (ADR-0141) |
| `pty-session-manager` | 64 | unclassified | `4d1bf254` | Terminal ConPTY-aware resize (patterns-survey inc C): debounced pty resize forward + frontend-clear state-sync |
| `multi-session-tabs` | 59 | unclassified | `a112529c` | Terminal throughput (patterns-survey inc B): per-session data batching + ack-based flow control |
| `seed-opens-new-tab` | 59 | unclassified | `a112529c` | Terminal throughput (patterns-survey inc B): per-session data batching + ack-based flow control |
| `terminal-dock-panel` | 59 | unclassified | `a112529c` | Terminal throughput (patterns-survey inc B): per-session data batching + ack-based flow control |
| `r3f-world-spike` | 58 | unclassified | `74605597` | Restore the island's true footprint at the signed 50°, and ladder the grove density beside it (ADR-0517) |
| `web-experience-sync` | 57 | fix-shaped | `4d080761` | fix(gate): a step that compared nothing reports SKIP, and a fixture stops forging a finished gate |
| `library-finder` | 53 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `web-experience-sync` | 52 | fix-shaped | `06e82a52` | fix(cli): shared test fixtures are not web-engine sources |
| `transcript-session-correlation` | 51 | fix-shaped | `4e8c6c6e` | fix(traversal): reach the subagent transcripts the scan stopped one level short of |
| `local-backend-boot` | 49 | fix-shaped | `6dbc1b80` | fix(desktop): serve claim departures on /api/activity |
| `traversal-session-query` | 47 | fix-shaped | `ee60282d` | fix(context-traversal): capacity render must not deny an observation it made |
| `act2-beat-director` | 43 | unclassified | `4fa1a697` | consolidate(act2-beat-director): coverage 4/4 + honest status mix (website proven, upstream building) |
| `verdict-line` | 39 | fix-shaped | `b091aa58` | fix(proof): let a signed uncovered say which of the two things it means |
| `library-category-shelf` | 38 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `library-typed-edges` | 38 | unclassified | `fa4f96a5` | retire(citations): remove the `references` field, its readers, and correct every denominator |
| `boot-read-routes` | 37 | fix-shaped | `c3d4c1d3` | fix(mirror): register /api/comments, and fix the drift it caught |
| `web-experience-sync` | 33 | fix-shaped | `54b23152` | fix(gate): withhold the skip CODE where the runner cannot read it, never the fact |
| `render-claim-as-wisp` | 32 | unclassified | `601f047e` | Claim-grade map renders default-ON: hover/queue/orbit wisps + departure legibility (ADR-0200 D7, arc inc 5) |
| `pty-session-manager` | 30 | unclassified | `4222315b` | Terminal rendering correctness (patterns-survey inc A): unicode11 parity, scrollback alignment, windowsPty, Claude-aware spawn env |
| `builder-role` | 28 | fix-shaped | `fbbf9270` | fix(studio): reject CRLF in invitee email + block storyId path traversal |
| `arc-explicit-id-fidelity` | 27 | unclassified | `fa4f96a5` | retire(citations): remove the `references` field, its readers, and correct every denominator |
| `multi-adapter-replay` | 25 | fix-shaped | `d57cb539` | fix(context-traversal-spawn): the CLI's replay must not deny the revisit field it now produces |
| `boot-read-routes` | 23 | unclassified | `fb75cf11` | feat!: the decision log leaves the filesystem — docs/decisions is deleted |
| `shared-forest-connection` | 23 | unclassified | `b56daae0` | desktop presence retirement: the sidecar goes presence-free (ADR-0200 D7, plan-6 lane E wave 1) |
| `leaf-slices-observer-activation` | 21 | fix-shaped | `327151fb` | fix(tests): make every suite that renders a Library prompt hermetic again |
| `library-open-trigger` | 20 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `noticeboard-cli` | 17 | unclassified | `0b3c771f` | Make Codex worktree bootstrap gate-safe |
| `boundhash-on-verdict` | 16 | fix-shaped | `b091aa58` | fix(proof): let a signed uncovered say which of the two things it means |
| `boot-read-routes` | 13 | fix-shaped | `87678946` | fix(desktop): /api/me serves member, not admin — Members panel degrades honestly |
| `uat-bound-command-adoption` | 12 | unclassified | `9a719fab` | ADR-0206: rename story-level 'UAT tests' to 'UAT test criteria' |
| `ambient-integration` | 11 | fix-shaped | `86d81a3d` | A build run never writes session presence (ADR-0199) — fix the --real build presence clobber |
| `multi-session-tabs` | 9 | unclassified | `a371a880` | xterm 6 renderer upgrade (patterns-survey inc E, owner GO): unify both cores on the 6.0 major |
| `seed-opens-new-tab` | 9 | unclassified | `a371a880` | xterm 6 renderer upgrade (patterns-survey inc E, owner GO): unify both cores on the 6.0 major |
| `terminal-dock-panel` | 9 | unclassified | `a371a880` | xterm 6 renderer upgrade (patterns-survey inc E, owner GO): unify both cores on the 6.0 major |
| `ambient-integration` | 7 | unclassified | `de933a63` | The claim-gated workspace ceremony: storytree worktree create (ADR-0200 D3, arc inc 2) |
| `local-backend-boot` | 6 | fix-shaped | `2b610422` | fix(studio): the dev-server probe answers "is it MINE", not "is something up" |
| `criterion-detail-pointer` | 4 | unclassified | `e9d3684b` | wip: lift criterion parser into uat-criterion, retire packages/model-uat |
| `inline-comment-thread` | 4 | unclassified | `2a9ae08d` | studio frontend presence retirement — the claim ledger is the one session render (ADR-0200 D7, plan-6 lane D) |
| `library-process-flow` | 4 | fix-shaped | `f43f32ab` | fix(studio): route the decisions scope to the artifact store |
| `boot-read-routes` | 3 | unclassified | `b6ee285d` | Mount brokered UAT signing in desktop |
| `brokered-local-uat-signing` | 2 | unclassified | `9a719fab` | ADR-0206: rename story-level 'UAT tests' to 'UAT test criteria' |
| `compositor-pan-transform` | 2 | unclassified | `005969a8` | inc-08: adjudicate no-known-value-widening, and migrate the two largest families |
| `r3f-world-spike` | 2 | unclassified | `412af01e` | One tree per capability: retire the grove (ADR-0518), ladder the ground cover's count and ship rung 3, keep the true footprint at 50° |
| `uat-machine-gate-resolution` | 2 | unclassified | `9a719fab` | ADR-0206: rename story-level 'UAT tests' to 'UAT test criteria' |
| `traversal-session-query` | 1 | unclassified | `57024be6` | wip: rewire capture + cli after offer deletion |
| `uat-bound-command-adoption` | 1 | fix-shaped | `c2c492d7` | fix(library): retire orphan reliability gates in place (ADR-0436) |
| `uat-criterion-detail` | 1 | unclassified | `e9d3684b` | wip: lift criterion parser into uat-criterion, retire packages/model-uat |

## The hand-read — AUTHORED, not generated

> Everything above this heading is written by `pnpm verdict-contradiction`. This section is not, and
> a re-run cannot reproduce it — which is why the runner REFUSES to overwrite an existing dated file
> unless passed `--force`.

The instrument's job was to get the haystack down to something a person could read. It did: 55
distinct commits. Here is what they are, read one by one.

**⚠ What this reading is, exactly.** I read the 55 commit SUBJECTS. I did not open 55 diffs and
confirm that each repair landed on the specific behaviour its unit's verdict certified. So every
count below is a reading of intent as stated by an author, one level weaker than a reading of code.
It is offered as what it is: the shortlist, triaged, so the next person starts from 17 candidates
instead of 516 rows.

### The `unclassified` bucket is almost entirely noise, and that is worth knowing

Of the 30 unclassified commits, **at most two** are plausibly repairs (`Make Codex worktree bootstrap
gate-safe`; `wip: restore decision-point-playback`). The other 28 are feature increments, planned
retirements, refactors and renames — the six `patterns-survey inc A–E` terminal commits, the
ADR-0200 presence-retirement programme, the chapter-2 forest work, `feat!: the decision log leaves
the filesystem`, and `ADR-0206: rename story-level 'UAT tests' to 'UAT test criteria'`.

That last one is the increment's own warning running in reverse. It warned that "a commit message
saying *fix* may be a rename". Here is a rename that says nothing at all, and the fail-wide policy
duly swept it in. **Keeping unclassified commits cost about 28 false positives and bought at most
two true ones.** That is the price of failing wide, now measured rather than assumed. It was still
the right default — the alternative was discarding the biggest unexamined bucket on the strength of
a guess about what was in it — but a future run can quote this figure instead of re-deriving it.

### Of the 25 fix-shaped commits, about 17 are genuine candidates

Eight are fix-shaped without contradicting anything a verdict proved: five are test or coverage work
(`kill the mutation rung's sixteen survivors`, `cover all six contracts`, `make every suite ...
hermetic again`, `consolidate the real pass — contract-id coverage`, `shared test fixtures are not
web-engine sources`), one is a planned retirement (`retire orphan reliability gates in place`), one
is gate plumbing that reached its unit through a shared file (`withhold the skip CODE where the
runner cannot read it`), and one is a plain keyword false positive — `feat(noticeboard): one stale
predicate, and every claim surface says "stale"` is a consolidation that the word *stale* dragged in.

The remaining **17 are what this increment was looking for**: a repair landing in code that a signed
verdict had certified.

### ★ The finding worth the session: what those repairs are ABOUT

The 17 do not scatter. Six of them are one family, and it is a pointed one:

| commit | what it repaired |
|---|---|
| `4a0b9dbc` | `fix(gate): the Act 1 WebGL closure rung walks the graph it claims to walk` |
| `4d080761` | `fix(gate): a step that compared nothing reports SKIP, and a fixture stops forging a finished gate` |
| `2142acc2` | `fix(cli): a write that took nothing stops reporting success` |
| `ee60282d` | `fix(context-traversal): capacity render must not deny an observation it made` |
| `d57cb539` | `fix(context-traversal-spawn): the CLI's replay must not deny the revisit field it now produces` |
| `b091aa58` | `fix(proof): let a signed uncovered say which of the two things it means` |

Every one of these is **an instrument that reported success while checking or doing nothing** — a
rung that did not walk the graph it named, a step that compared nothing and passed, a write that
took nothing and returned success, a fixture that forged a finished gate. That is the same failure
class the prove-it-gate exists to prevent, showing up in code the gate had already signed off.

The reading to take from it is narrow and should not be stretched. It is **not** that the gate is
weak: none of these six is a case of a leaf's test passing over broken product behaviour, which is
the false pass the arc's central bet is about. It is that the defects surviving a signed green in
this repo are disproportionately defects *in the observing machinery itself* — checks, probes,
renders and writes whose failure mode is to look successful. A red→green cycle is exactly the wrong
instrument for those, because an instrument that reports success unconditionally also passes its own
test unconditionally. That is a claim about where to point the next measurement, not a verdict on
the gate, and it is not adjudicated here.

The other eleven are ordinary behaviour repairs, and read as unremarkable: `/api/me serves member,
not admin`, `reject CRLF in invitee email + block storyId path traversal`, `identity derives from any
git-registered linked worktree`, `ambient heartbeat never resurrects a retired session`, `reach the
subagent transcripts the scan stopped one level short of`, `serve claim departures on /api/activity`,
`register /api/comments`, `render an increment structurally so its cites reach the wire`, `the
dev-server probe answers "is it MINE"`, `route the decisions scope to the artifact store`, and `fix
the --real build presence clobber`.

### ★ A correction to the increment's own fallback: the anchor is not unwired, it is uncalled

The increment offered two ways forward once `boundHash` turned out to be absent. The second was
**"wire the anchor first, then wait"**. That description is wrong, and the difference matters for
whoever picks this up.

**The anchor is already wired, and it has never had a caller.** Checked in code rather than inferred:

- `packages/orchestrator/src/prove-it-gate.ts:316` —
  `if (spec.binding !== undefined) verdict.boundHash = spec.binding.boundHash;`
  The gate stamps the hash whenever a proof supplies a binding, and emits an ADR-0016 `ChangeEvent`
  beside it when a change sink is also present (`:332`).
- `packages/proof-protocol/src/proof.ts:132` — `boundHash` is on the `Verdict` schema as an optional
  field, and its round-trip is covered by its own tests.
- The capability that did this, `binding-staleness#gate-emits-change`, was built and carries signed
  verdicts. So did `binding-staleness#boundhash-on-verdict`, the schema half — it appears in this
  document's own shortlist.

What does not exist is anything that **supplies** the binding. `ProvenBinding` is referenced exactly
once outside `prove-it-gate.ts` — in `gate-emits-change.test.ts`, its own proof. And every
production caller of `hashSpan` (`adr-rebind.ts`, `decision-source-decay.ts`, `drift.ts`) is on the
DECISION-anchor path, never the verdict path. The receiving half was built to a conditional
(`when a binding is supplied…`), the condition was never made true, and both units' outcomes say so
plainly once read: *"when no binding is supplied it signs exactly as before."*

**Why this is worth stating rather than filing as a nuance.** "Wire the anchor" sounds like schema
plus gate work. The actual missing piece is one caller: something that, at proof time, computes
`hashSpan` over the span being proved and puts it in the `ProveSpec`. That is much smaller — and it
is blocked on a genuine design question rather than on effort, which is the honest reason nobody has
done it:

> **What is "the proved span"?** A unit's `real:` arm declares a whole FILE, not a span. A caller
> would have to decide what to hash — the entire source file (cheap, and drifts on every unrelated
> edit, which is most of them), or the symbols the leaf actually wrote (precise, and requires
> knowing which those are, which is the same information the absent anchor was supposed to record).

That question is not settled here and this increment does not settle it. It is parked as
`verdict-accuracy-arc-inc-04` with this finding attached, so the next session starts from "pick the
span grain and add one caller" rather than from "build the anchor".

### So: has a signed GREEN ever been contradicted by later history?

**Yes, the phenomenon exists.** Roughly 17 commits across 103 proved units carry a later repair to
code a verdict had certified — call it one unit in six, and hold that number loosely for every reason
this document has already given.

**No, that is not a false-pass rate, and it must not be quoted as one.** Three things stand between
this figure and that claim, and none of them is fixable by trying harder at this grain:

1. **A repair in the same FILE is not a repair to the behaviour the verdict PROVED.** With no
   `boundHash` there is no span, so the two cannot be told apart. Even 17 is an upper bound.
2. **The classifier reads intent from a subject line.** It over-reports by construction and was
   measured doing so above.
3. **The denominator is units that were proved AND still resolve to a declared pair AND whose proof
   commit survives in this history** — 103 of 148, which is the honest population, not the whole
   corpus.

The clean version of this question needs an oracle nobody let the agent see. That is increment 3's
proposal, and it is owner-gated on a spend call.

## Re-running this over other work

The arc's end state 3 requires that both instruments attach to a real engagement without new design. This one needs three things and nothing else: verdict rows in `events.verdict` carrying a `unitId` and a `commitSha`; specs under `stories/**` whose `proof:` blocks declare a `real:` arm; and a git history containing those commits. `pnpm verdict-contradiction` against a checkout and store satisfying those re-takes the whole reading. Two limits travel with it, both structural: history is followed by PATH, so a renamed file reads as an absent one; and where a proof commit is not an ancestor of `HEAD` the walk is over-wide rather than wrong, which is the direction this instrument is biased in anyway.
