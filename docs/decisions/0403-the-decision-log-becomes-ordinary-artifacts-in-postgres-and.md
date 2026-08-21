---
status: accepted
decided: 2026-08-21
arc: decision-log-home-arc
amends: [139, 223]
---
# ADR-0403: The decision log becomes ordinary artifacts in Postgres, and open-sourcing is deferred

## Status

accepted (2026-08-21) — decided/directed by the owner in conversation on 2026-08-21. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

`docs/decisions/` is the LAST file-canonical tier. ADR-0302 D1 made every other kind online-only,
with no seed-authored exception left; the decision log stayed on disk because nothing had decided
otherwise, not because a decision put it there.

**The question this answers arrived bundled with a second one, and the two wanted different
answers.** The owner was strongly considering moving the log into Postgres in order to open-source
the repository without publishing the thinking behind it. Counted on disk 2026-08-21, that move does
not deliver that goal:

- `docs/decisions/` — 391 files, 5.6 MB. **45%** of the narrative-dense committed content by bytes.
- `stories/` — 316 files, 6.2 MB. **52%**. Equally internal, and a second job.
- `CLAUDE.md` (96 KB) + `AGENTS.md` (36 KB) + `.claude/agents/` (10 files, 176 KB) — 12 files,
  308 KB. Small by volume and **by far the densest internal narrative per byte**: they are the
  assembled operating instructions and they name decisions, owner calls, costs and dead ends on
  almost every line.

That third row is generated from the live store by `pnpm build:guidance` / `pnpm build:agents` and
then COMMITTED, because ADR-0307 D2/D4 requires the harness to be able to read it at session start —
before any tool runs, and therefore before any database is reachable. Generated-then-committed is
still committed, and committed is what publishes. So a storage migration leaves the densest surface
exactly where it was.

**The owner's answer separated the two goals** (2026-08-21, in conversation): open-sourcing is
something to unlock later rather than a present need; the generated guidance projections remaining
in the repository is explicitly acceptable; what is wanted now is the ADRs out of files and into the
database. The owner also settled the shape — ordinary artifacts, not a distinct kind held outside
the graph — and the sequencing: the ADRs enter the dependency graph FIRST, the migration follows.

Two facts make the move cheaper than it looks, and both are already paid:

- **Number allocation is already transactional against the store** (ADR-0050), which is what made
  parallel ADR authoring safe in the first place.
- **The store already keeps append-only per-field history**, readable with
  `storytree library artifact history <id>`. That is the component ADR-0139's correct-in-place
  policy needs when `git log -p` stops being the archive of record.

One fact makes it interact with work already in flight: `adrs-into-the-dag-arc` is deciding what it
means to walk the decision log for depth, and ADR-0402 has just renamed the Library's authored
dependency edge `standsOn` → `dependsOn` while deliberately leaving `amends` and `supersedes` alone.
Making ADRs ordinary artifacts settles that arc's central fork by construction, so this decision had
to be recorded before that one was designed around a boundary that will not exist.

## Decision

**1. The decision log moves into the shared Cloud SQL Postgres store, and ADRs become ORDINARY
Library artifacts.** Same store, same graph, no special tier and no separate kind held outside the
DAG. This finishes what ADR-0302 D1 started: after it, no tier is file-canonical.

**2. OPEN-SOURCING IS DEFERRED, EXPLICITLY, AND THIS MOVE IS NOT A STEP TOWARD IT.** It is recorded
here so the measurement is not re-derived by a later session: a storage migration addresses under
half of the narrative-dense committed content, and the densest part per byte cannot follow it while
ADR-0307 D2/D4 stands. **When open-sourcing is picked up, the mechanism is a REPOSITORY BOUNDARY** —
a private submodule or a split, the only mechanism that can cover every internal surface including
the committed guidance projections. ADR-0307 D2/D4 is untouched by this ADR and the generated
projections stay committed.

**3. SEQUENCING: the ADRs enter the dependency graph FIRST; the migration follows.** Owner-directed.
The walk must therefore be built with its EDGE RESOLUTION AS A SEAM — where an edge comes from is
swappable, so the migration replaces the file-backed resolver without touching the walk. A walk that
hard-codes file parsing is rework this decision has already priced.

**4. ADR-0223 D4's SINK RULE DOES NOT SURVIVE THIS, and the consequence is a simplification.** D4
made ADRs tier-0 bedrock so the knowledge tree could not contain a loop, which is exactly where the
depth walk halts today. One graph of ordinary artifacts has no boundary to cross, so the
"does crossing the boundary cost a hop?" fork on `oq-what-does-backing-adrs-into-the-dag-mean` is
MOOT: there is one number, not a pair.

**5. A CYCLE PROOF OVER THE COMBINED GRAPH IS A PRECONDITION OF (4), not a consequence of it.**
`pnpm probe:adr-graph` proved the decision graph acyclic on all three readings — `amends` alone,
`supersedes` alone, and their union. **It never checked decisions-plus-Library.** D4's guarantee was
structural; replacing it with a proof means running that proof over the union before anything walks
it. It is a probe, not a migration, and it can run today against files.

**6. `amends` REMAINS THE DEPTH EDGE AND IS NEVER SUMMED WITH `supersedes`,** and the exclusion lives
in the SHAPE of the code rather than in a comment — no edge-type parameter, which will eventually be
called with the wrong one. ADR-0402 dec 2 kept both names for this reason; this ADR does not disturb
it.

**7. BOTH POINTER SPELLINGS MUST RESOLVE.** The corpus carries `doc:decisions/…` and
`doc:docs/decisions/…` naming the same files. The cycle census's own first parser accepted one
form and silently reclassified 371 of 390 pointers as "not an ADR", producing a plausible wrong
answer. Any migration or walk that resolves one spelling and not the other fails the same way.

**The count is 997 / 38 across 1,035 pointers, not 371 / 19** — corrected in place 2026-08-22 from
the `-inc-02` reader census, which measured every string field of `events.library_artifact` rather
than one. 371 / 19 is the `dependsOn` row alone, which is the correct denominator for the cycle
census that produced it and 38% of the migration's real exposure. The bulk sits in `references`
(624 / 19), the field `referential-integrity` reads — and that reader was carrying this exact bug
when the census found it. **Size the migration off 1,035, and take the number from a query rather
than from this paragraph**; the per-field table is in
[the census](../research/decision-log-readers-census-2026-08-22.md).

**8. THE ARCHIVE GETS A CLEAN SEAM AT MIGRATION DAY. No history is imported.** The files are removed
from `docs/decisions/`; git retains every prior revision up to that commit, so `git log -p` and
`git show <sha>:<path>` keep recovering pre-migration text forever. From that commit forward the
store's append-only per-field history is the archive. ADR-0139's correct-in-place policy therefore
stands unchanged in substance, and this ADR amends it only to name where the archive lives either
side of the seam.

**9. A ROUND-TRIP EDIT COMMAND IS IN SCOPE FOR THE MIGRATION,** not a follow-up. Decisions are the
longest prose this corpus holds; `--set <field>=@path` with a manual `--out` capture (ADR-0361) is a
correct write path but not an acceptable PRIMARY authoring path for the most-written tier. The
migration ships a verb that pulls a decision to a file, lets it be edited normally, and writes it
back.

**10. THE MIGRATION RUNS WITH NO OTHER SESSIONS RUNNING, AND QUIESCENCE IS RECORDED RATHER THAN
ASSUMED.** `storytree own --all` names registered background work by owning session; its floor is
that it sees only work that registered itself, so an empty inventory is evidence of quiet, not proof
of it.

## Consequences

**The last file-canonical tier joins the rest.** One store, one set of rules, one concurrency story.
Per-id transactional upserts mean two sessions editing different decisions never contend, which is
the property that made the Library tier work.

**Two of `adrs-into-the-dag-arc`'s open questions shrink, one of them for free.** ADRs read as
artifacts are read with `storytree library artifact <id>`, which is ALREADY on the traversal
recorder's allowlist — so the capture gap that arc was chartered to close (zero recorded ADR reads
across 485 traces, against 3,199–3,838 sitting in harness transcripts) closes as a side effect of
the migration rather than as work. The transcript route retains its own distinct value: it is the
only thing that recovers the HISTORY, back to 2026-06-08. A dedicated `storytree adr show` read verb
becomes unnecessary.

**The depth ceiling can finally move.** 390 of the corpus's 754 dependency pointers terminate at a
decision record — precisely where the walk halts today, which is why the measure can only ever
return 0, 1 or 2 and therefore can never fail and never warn. The `amends` ladder is 13 rungs (17 is
the union of both edge types walked as one graph, and is not a depth reading).

**Accepted costs, each named rather than discovered later:**

- **The offline cannot-drift read of `storytree adr list` dies.** Today it reads `docs/decisions/`
  from disk with no database, which is why `adr list` / `doctor` / the help surfaces touch no store.
  Session-start orientation on the decision log gains a DB dependency. Accepted under ADR-0302 D2's
  online-or-nothing posture, and the instance runs 24/7 (both scheduler jobs and the cost backstop
  are gone).
- **Remote sessions lose the decision log entirely.** Already descoped by the owner (ADR-0254 D4);
  the connector cannot survive a TLS-terminating proxy by construction (ADR-0250).
- **`adr-health` and the cross-PR duplicate-number check must dial the store in CI.** CI holds the
  keyless WIF credential for exactly this (ADR-0302 D3).
- **The affected-scope classifier's `docs/decisions/` mapping goes dead** (ADR-0394, widened by
  ADR-0399, maps it to cli + drive + app-surface). A decision edit stops affecting gate scope at
  all, which is arguably correct — a row edit is not a code change — but it is a behaviour change,
  not a no-op.
- **The write-authority wall stops applying to decisions.** ADR-0255/ADR-0257 deny file writes under
  the primary checkout; a row is not a file, so decisions become editable from the lobby. This is a
  widening, and it is accepted because the store's own validated write path is the guarded one.
- **391 files to migrate**, and every reader of `docs/decisions/**` on disk has to be found before it
  breaks rather than after.

**What is deliberately NOT decided here:** what the public repository contains once the thinking is
out of it. That is the real design problem behind open-sourcing and it is downstream of a decision
that has now been deferred; it is recorded on `decision-log-home-arc`'s end state rather than left
implicit.

## References

- [ADR-0302](0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md) — D1 made every
  other tier online-only; D2 the online-or-nothing posture; D3 the keyless CI credential.
- [ADR-0307](0307-the-agent-tier-goes-live-canonical-the-committed-seed-stops.md) — D2/D4 pin the
  generated guidance projections to disk; untouched by this ADR.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) —
  correct-in-place policy; amended here only to name where the archive lives either side of the
  migration seam.
- [ADR-0223](0223-the-knowledge-dag-is-an-authored-standson-edge-not-the-citat.md) — dec 1 created
  the authored dependency edge; D4 made ADRs sinks. This ADR overtakes D4.
- [ADR-0402](0402-the-knowledge-dag-edge-is-renamed-dependson-amends-keeps-its.md) — `standsOn` →
  `dependsOn`; `amends` / `supersedes` deliberately keep their names.
- [ADR-0050](0050-adr-number-allocation.md) — atomic number reservation, already store-backed.
- [ADR-0361](0361-the-guidance-write-path-proves-its-own-fidelity-a-trusted-ch.md) — `--out` and the
  write-side refusals; the round trip this decision's item 9 replaces as the primary authoring path.
- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) /
  [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) — the write
  authority wall that stops applying to decisions once they are rows.
- `oq-where-does-the-decision-log-live-and-does-moving-it-to-po` — the open question this answers.
- `oq-what-does-backing-adrs-into-the-dag-mean` — the sibling question whose central fork this
  settles by construction.
