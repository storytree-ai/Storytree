---
status: accepted
decided: 2026-08-02
arc: factory-self-load-tune-the-guidance-loop-back-to-evidence-arc
amends: [252, 263]
---
# ADR-0290: The corpus-content ceiling measures what the branch authored, not what the shared store holds

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

`check:corpus-content` (ADR-0120) compares the committed seed `apps/studio/data/knowledge.json`
against the live Cloud SQL store, body for body, and since ADR-0252 D3 / ADR-0263 it has run at a ZERO
ceiling on both axes: the first unreconciled durable-tier artifact BLOCKS the local gate.

Those two inputs are not the same kind of thing, and that is the defect. **The seed is one branch's
working tree. The live store is shared by every concurrent session on the machine and by the studio.**
The check joins a per-branch surface to a machine-shared one and charges the total, at zero tolerance,
to whoever runs the gate next — who is routinely not the party that caused it. Because live is not in
git, no ordinary `git diff` can tell the two apart, so a session could not even establish its own
innocence without a bespoke measurement.

### The measurement

The cleanest control available was taken on 2026-08-02 on branch `claude/sleepy-northcutt-4d5383`,
before any of this landed: `HEAD == origin/main`
(`git rev-list --left-right --count origin/main...HEAD` → `0 0`), working tree clean, zero commits,
zero live writes. `pnpm check:corpus-content` exited 1:

```
RED — corpus-content drain ceiling breached: 3 value-drift, 0 degraded-live.
3 artifact(s) carry a live body differing from seed, past the ceiling (V=0):
  friction-adjudication, merge-ceremony, the-same-file-in-another-tree-is-a-different-file
```

A session that had done nothing at all, on a branch identical to `main`, could not land. It cannot be
staleness (the branch IS main) and cannot be that session's edit (there is no diff), so all three were
siblings' undrained live edits.

That is not an isolated run. Three consecutive sessions on this arc each recorded it in their own
increment log — PR #1067 ("RED locally with 11 export-scope artifacts differing seed-to-live, none of
them authored by this session"), PR #1074 (13), PR #1080 (2, where a librarian pass called LIVE
canonical for both and STOPPED WITHOUT WRITING, because the corrections sat on an unlanded sibling
branch). Each proved its innocence by hand, with a pristine-HEAD differential, every time.

An owner-commissioned audit on 2026-08-02 found roughly ten friction items in this cluster, of which
**six are the same defect filed independently by six different sessions** rather than as
reinforcements — itself a measurement that the guidance loop had stopped converging.

### What the filings established, including one that falsified another

- **Staleness is a real and distinct cause.** The most-reinforced item
  (`a-drain-ceiling-a-sibling-breached-reds-a-session-that-touched-nothing-it-guards`, ×5) was FILED as
  "a sibling's live edit" and its own reinforcement 3 corrected it: the branch was 12 commits behind
  `origin/main`, main's seed ALREADY carried the body live held, and materialising main's seed in place
  produced `OK — every seed body matches live across 177 export-scope artifacts`, exit 0. The check's
  printed remedy (`export-corpus --pg --write`) is actively wrong there — following it re-authors a
  hunk already on main.
- **A concurrent writer is the residual that survives a staleness fix**
  (`corpus-content-gate-red-on-sibling-mid-stream-live-edit`, ×2, whose adjudication insisted it needed
  its own acceptance check). Discriminating detail: the pending set moved WITHIN one session with no
  fetch and no merge — 1 update at T, 3 at T+45min — which a fixed branch offset cannot do.
- **The drain was all-or-nothing**, so even a session that DID author drift could not discharge only
  its own item (`live-to-seed-drain-is-all-or-nothing-so-its-ceiling-cannot-reach-zero`, ×3). Measured
  cost: a session that authored exactly one new principle faced a dry run of `2 update(s) + 1
  addition(s)` where the two updates were provably a sibling's (written ~90 min earlier per
  `events.library_event`), and spent ~20 minutes hand-writing a restore script to avoid committing
  them under its own name.
- **The check under-reports what its own remedy writes**
  (`corpus-content-v-count-understates-what-the-export-sweeps`). `diffCorpusContent` iterates the SEED
  scope and does `const l = liveById.get(s.id); if (!l) continue;`, so a LIVE-ONLY artifact is counted
  on NEITHER axis, while `computeExportedSeed` APPENDS every one. Measured 2026-07-30: a GREEN check
  (`OK … across 177`, exit 0) alongside a dry run reporting one pending addition —
  `oq-diff-view-altitude`, an open question the owner had RETIRED under ADR-0267 D5, one blind
  `--write` from being resurrected into the committed seed.

### The constraint

**Raising the ceiling was not available.** ADR-0269 is accepted and load-bearing: *a drain ceiling
rises only when the measured population enlarges, never to absorb growth.* The population had not
enlarged. It was **mis-defined** — the check was measuring a shared store's total unreconciled state
and charging it to a single branch, and no value of the constant fixes that.

## Decision

**The corpus-content ceilings measure what THIS BRANCH authored. The numbers stay at zero; the
aperture changes.** This is the ADR-0269 4(f) decomposition, and it moves in both directions.

**D1 — Attribution is computed from two EXACT signals, and both are required.**
- *Seed side (git):* ids whose seed entry differs between `git merge-base origin/main HEAD` and the
  working tree, uncommitted edits included.
- *Live side (the event log):* ids whose LATEST live write names this branch.

Either signal alone leaves a hole in a whole direction. A pure git differential cannot see a live
edit — the ceremony's normal direction (ADR-0023: live is the edit surface) and therefore the exact
case the check exists to catch. A pure event signal cannot see a hand-edited seed. Precedence is
AUTHORED > STALE > FOREIGN: a branch that changed the seed entry of an artifact main already matches
has REVERTED main's export, which is its own work.

**D2 — Live library writes record the branch.** `events.library_event.actor` carried the constant
`"cli"`, which names the tool rather than the writer, so the log could not answer "was this mine".
CLI writes now stamp `cli@<branch>`, on the precedent ADR-0050's allocator already sets by recording
the reserving branch against every ADR number. `STORYTREE_ACTOR` still wins where it is set, so studio
and desktop writes keep their own identity and are never branch-attributed — correctly, since a studio
edit is nobody's gate to answer for. Every pre-existing row reads as unattributed, so the whole
existing backlog reports as foreign rather than landing on the first session to gate after this ships.

**D3 — Three outcomes, and only one of them is charged.**
- **AUTHORED** → RED at zero, as before.
- **BEHIND MAIN** (`origin/main`'s seed already matches live) → reported with the remedy `git merge
  origin/main`, and explicitly NOT the export remedy, which is wrong there.
- **ANOTHER WRITER** → reported with its writer and timestamp, so it can be routed back. Never charged.

Nothing prints more quietly: every id named before is still named, with strictly more information.

**D4 — The check gains an axis it was blind to.** An export-scope artifact THIS BRANCH created live
and never carried into the seed now reds (ceiling zero, at birth rather than by drain — there is no
inherited backlog, because the axis is authorship-scoped from the start). The live-only population is
also PRINTED in full on every path, including the clean one, split into yours and not-yours, because a
green drift verdict has never been evidence that a bare `--write` is a no-op.

**D5 — Degraded-live is deliberately NOT authorship-scoped.** It stays charged to whoever gates. It is
the one axis where a foreign red is affordable: the remedy is per-artifact, its direction needs no
judgement (the seed is canonical by construction), and it writes only the LIVE store — so discharging
a stranger's degraded body puts nothing foreign in your commit under your name, which is the hazard
the rest of this ADR removes. It has also read zero at every sampled revision in the check's life. The
one caveat rides the printed remedy: merge `origin/main` first, because restoring from a stale seed
writes a stale body live.

**D6 — The drain becomes one artifact wide.** `storytree library export-corpus --id <id> [--id …]
--pg --write` scopes the write to named artifacts through `computeExportedSeed`'s single narrowing
point — both the overwrite pass and the append pass — so a scoped run cannot diverge in policy from an
unscoped one. Every invariant is unconditional: a degraded body named explicitly is still refused, an
out-of-scope kind named explicitly is still not exported, an unknown id is a no-op. The check prints
the exact `--id` invocation for what it charges. The bare unscoped form remains, and remains
all-or-nothing.

**D7 — Attribution fails CLOSED, per axis, and this is the opposite of the substrate posture around
it.** The shell still SKIPs (exit 0) on an unreachable DB or absent creds — that fail-open predates
this and is untouched, which keeps CI DB-free. But if the git or event signals cannot be read once the
check IS running, it falls back to the PRE-ADR-0290 behaviour **of each axis**: every drift is charged
(as before), and live-only is charged to nobody (as before, when it was invisible), with the reason
printed. The asymmetry is deliberate — a wrongly-charged red costs a merge or a routed report, while a
wrongly-excused red lands a one-sided edit that no LATER gate catches either, because the next
session's check would excuse it as foreign too.

## Consequences

**Good.**
- The measured defect is gone. Re-run on the same branch and the same three artifacts, after the
  change: `3 of 193 export-scope artifacts differ … ANOTHER WRITER — not yours [3]`, exit **0**. Six
  sessions' worth of hand-written innocence proofs are now the check's own work.
- A session that DOES leave a one-sided edit is caught more precisely than before — named as YOURS,
  with the one-artifact command to discharge it.
- The blind spot is closed. A live-only artifact this branch authored now reds; every live-only
  artifact is now printed, so the `oq-diff-view-altitude` class of resurrection has a visible tripwire
  rather than a prose warning.
- The all-or-nothing hazard is closed at the tool rather than patched in guidance. A session no longer
  has to choose between its own landing and committing a sibling's unreviewed body.

**Bad / accepted.**
- Attribution rests on a stamp that only exists going forward. Pre-2026-08-02 live rows are
  unattributed and therefore never charged; the existing backlog can only drain by its authors' own
  future gates, or by a deliberate librarian pass. That is the honest state — nobody now gating
  authored those edits — but it does mean the backlog is not swept by this change.
- A branch renamed or recut mid-flight loses its live attribution and under-charges. Fail-open on that
  edge, stated rather than hidden.
- `reconciledOnMain` reads the LOCAL `origin/main` ref and does not fetch (CLAUDE.md: no reflexive
  fetch). An unfetched ref makes a stale drift report as foreign — a worse message, never a wrong
  verdict, which is why it is diagnostic-only and outside the fail-closed predicate.
- One extra `DISTINCT ON` query and up to three `git` invocations per run. Bounded and local; the
  check remains local-only and SKIPs in CI.

**Explicitly not decided here.** `check:corpus-sync`'s sibling defect — that it renders a missed
migration and a deliberate RETIRE identically and prints one unconditional remedy that resurrects the
retire (`a-zero-ceiling-local-only-check-reads-a-live-store-a-sibling-session-can-mutate-mid-gate`) —
is a different fault with a different fix (classify the absence from `events.library_event`). The
attribution module is reusable by it, and it is left open rather than half-done.

**Correction (2026-08-04, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
that deferral has since been TAKEN UP, so "left open" no longer describes the world; nothing decided
here is re-decided.** `check:corpus-sync` gained the absence classifier on 2026-08-03
(PR [#1115](https://github.com/storytree-ai/Storytree/pull/1115), commit `c6f4e648`), by exactly the
route this paragraph anticipated: `corpus-content-attribution.ts` was **WIDENED** to carry
`classifyAbsence` rather than forked, on the stated reasoning that two checks disagreeing about what
"behind main" means would make a gate's own printed output untrustworthy. Absences now classify
NEVER MIGRATED / RETIRED LIVE / BEHIND MAIN, precedence AUTHORED > RETIRED LIVE > BEHIND MAIN, and only
never-migrated is charged; the git seed reads were extracted to `seed-revisions.ts` and are shared by
both checks. **No ceiling moved** — M=0 stands. The module's own header is now the authority on the
two-classifier shape and is not restated here (`asset:reference-dont-restate`). Recorded because a
reader of this paragraph alone would conclude the sibling defect is still live and re-open work that
has landed — the exact stale-prose harm ADR-0139 exists to prevent.

## References

- [ADR-0120](0120-live-to-seed-reconciliation-export-corpus-and-unit-status-to.md) — the live→seed
  export and the per-artifact direction judgement this does not disturb.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D3 — the drain-ceiling
  shape; amended here in APERTURE, not in value.
- [ADR-0263](0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md) — the durable-tier
  allowlist that made a zero ceiling affordable at all; amended here by the `--id` scope.
- [ADR-0269](0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md) — a ceiling rises only
  on an enlarged population; 4(f) is the decomposition requirement this ADR discharges.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born `accepted`.
- [ADR-0050](0050-adr-number-allocation.md) — the branch-recording precedent D2 follows.
- [ADR-0246](0246-forests-for-other-projects-the-adr-0133-deferral-is-lifted-a.md) — the repo-root seam the git reads go through.
- `packages/cli/src/corpus-content-attribution.ts` · `corpus-content-drain.ts` ·
  `check-corpus-content.ts` · `cli-actor.ts` · `packages/library/src/store/export-corpus.ts`.
- `process:library-edit-ceremony` — the ceremony whose manual pristine-HEAD differential this
  mechanises.
