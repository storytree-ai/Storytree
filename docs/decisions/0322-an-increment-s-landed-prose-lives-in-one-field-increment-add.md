---
status: accepted
decided: 2026-08-08
load_bearing: true
arc: arcs-hold-increments-arc
amends: [305]
---
# ADR-0322: An increment's landed prose lives in one field: increment add stops dual-writing body and outcome.note

## Status

accepted (2026-08-08) — the owner directed this fix in conversation on 2026-08-08, naming the arc's
two candidate arms verbatim (*"Fix is either: stop dual-writing, or teach the edit path to reach the
object-valued half"*). Design-time alignment IS the ratification (ADR-0110). The choice BETWEEN the
arms is not a fresh fork either: the parked increment
`increment-outcome-note-is-unreachable-for-correction` had already adjudicated it in writing —
*"(a) is the one that matches this arc's stated end state … (b)/(c) are recorded so the choice is
made rather than inherited"* — and this ADR takes (a).

## Context

### One paragraph, stored twice, and only one copy reachable

`storytree arc increment add <arc> --outcome …` is the merge ceremony's residue step (ADR-0271): it
mints a `closed` increment recording what landed. It persisted the `--outcome` prose into **two**
fields — `body` (a plain string) and `outcome.note` (a field inside an object).

The only correction verb is `library artifact edit --set`, and it resolves `@path` to a STRING. So
`--set body=@file` succeeds and `--set outcome=@file` is refused by the schema
(`outcome: Expected object, received string`). There is no `arc increment edit`. The result: an
ADR-0139 in-place correction on a landed increment **half-applies**, and the row is left disagreeing
with itself.

Measured on `session-decoupling-arc-inc-22` (2026-08-06, live store): `body` carried the corrected
text and `outcome.note` still carried the pre-correction wording.

### The failure is silent, and it inverts the usual staleness direction

The surfaces a reader normally hits — `arc show`, `library artifact <id>` — render `body`, so the
record looks fully corrected. The reader who goes to `--raw=outcome`, which is the documented way to
see fields the render drops, gets the stale copy with no signal that it is stale. **The more careful
reader is the one who gets the wrong answer.**

And it fires at exactly the wrong moment: the pre-merge librarian pass exists to make landed records
honest under ADR-0139, and on an increment that pass could only ever half-succeed.

### Why the copy was written at all

Not carelessness — an invariant left no alternative. `assertIncrementInvariants` demanded, of every
closure, *an outcome with no `pr` needs a `note`* (ADR-0305 D5, on D2's reasoning that collapsing
`superseded`/`retired` into `closed` is only honest if the reason is written down). A landing with no
PR ref therefore had to put *something* in `note`, and the only text available was the prose already
in `body`.

So the duplication is a symptom. The defect is that the invariant could not tell the increment
tier's **two different closures** apart:

- An increment **parked first** (`parked` stamped by `arc increment new`) has a `body` that is the
  INTENTION — a plan. Its closure genuinely needs its own prose, or a reader cannot tell a shipped
  increment from an abandoned one.
- An increment **born closed** (`arc increment add`) has a `body` that IS the terminal prose. The
  verb refuses without `--outcome` and the schema requires `body`, so the closure cannot be
  unexplained.

### The second cost: it also broke ADR-0305 D7's own rendering rule

`renderArcRollup` prints `outcome.note` in the increment log whenever it differs from the objective.
For a PR-less landing that note WAS the whole body — so the log printed an entire body into a
section whose own stated rule is *"each row is ONE line plus its objective and a PULL COMMAND —
never its body"*. The bloat ADR-0305 D7 was written to prevent was being re-created by the
duplication.

### Measured blast radius

Against the live store on 2026-08-08, over all 534 increment rows (460 `closed`):

| | count |
|---|---|
| closed with `pr` only (no note) | 366 |
| closed with a note | 93 |
| — of those, `note` **exactly equals** `body` | **54** |
| — of those, `note` says something else | 39 |
| duplicates that carry `pr` | 0 |
| duplicates that carry `parked` | 0 |
| closed rows with neither `pr` nor `note` | 0 |

Every one of the 54 duplicates is born-closed (no `parked`) and PR-less, and no parked increment
carries such a copy. `parked` separates the two closures with **zero exceptions** across all 460
closed rows.

## Decision

### D1 — `arc increment add` writes the landing prose ONCE, into `body`

The `outcome` it mints is `{date}` or `{date, pr}` — never a `note` copied from the text it just
wrote to `body`. `arc close` inherits this, because it mints its terminal increment through the same
function.

`outcome.note` is unchanged as a field and keeps its job: the closing REASON on `arc increment close
--note`, where it says something `body` does not.

### D2 — the ref-or-reason invariant is conditioned on `parked`, amending ADR-0305 D5

`assertIncrementInvariants` refuses an outcome with neither `pr` nor `note` **only when the increment
carries `parked`**. The decision ADR-0305 D2/D5 made — *a closure must state why* — is unchanged;
what changes is that the check now recognises where a born-closed increment states it.

This is an `amends` edge, not a supersession (ADR-0139): ADR-0305 stays current and true, with the
narrower rule read alongside it.

The relaxation is deliberately narrow. `closed ⇒ outcome` is untouched, and so is `proposal ⇒
parked`. Only the third clause moves, and only for rows that were never parked.

### D3 — migration #6 drops `outcome.note` when it is a verbatim copy of `body`

`CURRENT_SCHEMA_VERSION` goes 5 → 6. The transform is kind-scoped on `increment` and compares the
two fields after trimming: **exact equality only**.

A note differing by even a sentence is treated as a second fact and kept. This is not conservatism
for its own sake — the 39 divergent rows are a MIX of legitimate `--note` closures and rows that
already diverged through this very defect, and nothing in the data distinguishes them. Recovering an
already-diverged note is a human read of `events.library_event`, not a guess made by a migration.

The transform also **withholds the drop** when it would leave a row its own validator refuses (a
parked increment with no `pr`). No live row hits that case; a hand-authored one can, and a migration
that hands back an unwritable doc bricks exactly the rows it was written for.

Unlike migrations #4 and #5 this is a CLEANUP, not a writability fix: a stored duplicate still
validates, so nothing is bricked without it (migration #3 is the same class). What it buys is that
the 54 rows stop being able to diverge later.

### D4 — arms (b) and (c) are declined, on the record

The parked increment recorded three arms. (b) *teach the correction verb to reach the object half* —
a targeted `--set outcome.note=@file` or an `arc increment edit` verb — is smaller, but it keeps two
copies of one paragraph and only makes them easier to keep in step; the next session that corrects
one field and not the other re-creates the defect. (c) *report the divergence* makes the defect
visible without removing it. Both were weighed against this arc's stated end state — ONE durable
typed tier, not two copies of one field — and (a) is the arm that reaches it.

## Consequences

**A correction to a landed increment can no longer half-apply.** `library artifact edit --set
body=@file` reaches the only copy there is, which makes the ADR-0139 librarian pass whole on this
tier for the first time.

**`arc show`'s increment log gets quieter.** A PR-less landing stops printing its whole body into the
log, restoring the D7 rule the duplication was violating.

**54 live rows lose a redundant field, and 39 keep an ambiguous one.** The kept ones are not
resolved by this decision: some are genuine closing reasons, some are the residue of corrections that
already half-applied. They are readable, and `events.library_event` holds their history — but no
mechanical pass can sort them, and this ADR does not pretend otherwise.

**The version floor moves, so the live store must be migrated, not just the code.** Until a batch
migrate runs, `storytree library`'s health view reports every stored unit below `schemaVersion 6`.
That is a dashboard signal, not a gate rung — but it is loud, and leaving it is a half-landing.

**`parked` becomes load-bearing for a second reason.** It was ADR-0298 D3's delivery-ceiling
comparison point; it is now also the discriminator between the tier's two closures. A future change
that stamps `parked` on born-closed increments, or strips it from parked ones, would silently move
this invariant. That coupling is the real cost of this decision and is stated here rather than left
to be discovered.

**A new verb could still be wanted.** Nothing here gives `outcome.note` an edit path, so correcting a
genuine closing reason still means a hand-authored write. That is arm (b)'s remaining value, and it
is now a much smaller question because the field is no longer written by accident.

**`arc increment close` stays STRICTER than the schema, deliberately.** Its CLI guard refuses without
`--pr` or `--note` unconditionally, where D2 now lets the schema accept a never-parked closure with
neither. The asymmetry is intentional and is stated here so a later reader does not file it as a bug:
that verb closes an increment that ALREADY EXISTS, whose `body` was written as an intention, so
demanding a reason is right every time it is reachable. In practice the two never disagree — every
increment that verb can reach was minted by `arc increment new`, which always stamps `parked` — so
the gap is only reachable by a hand-authored row. The schema is the backstop; the verb is the
ergonomic, and the ergonomic is allowed to ask for more.

## References

- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — D5's `outcome`
  record and D2's collapse of `superseded`/`retired`, whose invariant this amends; D7's rendering
  rule, which the duplication was breaking.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — the in-place
  correction discipline this defect made impossible to complete on an increment.
- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) — `parked` as the
  delivery ceiling's comparison point; D2's role is unchanged, D3's field gains a second job.
- [ADR-0271](0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md) — the closing leg whose residue step
  writes these rows.
- `packages/library/src/knowledge.ts` — `assertIncrementInvariants`.
- `packages/library/src/migrations.ts` — migration #6.
- `packages/arc/src/arc.ts` (moved out of `packages/cli` by ADR-0369) — `arcIncrementAdd`.
- Source friction: `increment-add-dual-writes-prose-and-only-one-copy-is-editable`; parked increment:
  `increment-outcome-note-is-unreachable-for-correction`.
