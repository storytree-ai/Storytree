---
status: proposed
arc: session-staleness-arc
---
# ADR-0300: Staleness is diagnosed for the session, not discovered by it

## Status

proposed — written 2026-08-04 by the session the owner asked to survey the factory after halting most
of it ("felt like there was session sprawl and the system was thrashing"). The owner delegated the
choice of fix ("happy for you to land whatever fix you think is best, i'll review it in the morning")
but did not direct these decisions, so this is NOT born accepted under ADR-0110 — D1 is already built
and D2–D4 are stated here for the owner's ratification. If any decision is rejected, the built half of
D1 stands on its own as a message-quality fix and can be kept or reverted independently.

## Context

The owner's hypothesis on halting the factory was that a needed landing had been missed and the other
sessions had blocked on it. That happened, exactly once and concretely — but it was a SYMPTOM. The
measurement puts the cause elsewhere.

Across 2026-08-02/03: **44 PRs merged in ~2 days**, peaking at 7 in one hour, against **40
`merge origin/main into <branch>` re-syncs** — very nearly one re-sync per landing. **43 distinct
sessions** wrote to the live library tier in 3 days, across **61 worktrees**, filing **41 friction
items** in 2 days. `main` moved every 15–30 minutes for a full day. At that cadence a branch cut from
a current `main` is stale within the hour, so **"working against a stale picture" is the default state
of a session, not an exception.**

Three costs follow, each recorded in the tree rather than inferred.

**A live write can outrun its own schema.** ADR-0298's sweep wrote a `proposals` key onto four live
arcs roughly **1h40m before PR #1128 landed the schema half** that accepts it. The library tier is
live-canonical (ADR-0023) and nothing gates that ordering. For the whole window every session on
main-derived code was hard-refused on those four arcs — including `verification-integrity-arc`, the
busiest in the tree — by a bare zod `unrecognized_keys` dump. The message named the KEY, so it read as
"you passed a bad field" when the field was not the caller's at all; and the obvious way past it
(strip the key) would have persisted the stripped doc back over another session's landed sweep. It
strikes at `arc increment add`, the merge ceremony's residue step — after automerge, when the branch is
dead. The session that hit it spent four tool-calls establishing the blocker was neither its own data
nor a bug, then re-homed its context into a new arc.

**A brief that names a defect never names the arc that already answered it.** Three separate sessions
were dispatched on 2026-08-03 against the same `check:verification-decay` 25/24 breach, each with the
same framing and opening instruction. The diagnosis, the refuted alternative, the two-tree measurement
recipe and the exact remedy were all parked on `verification-integrity-arc` as
`drain-unproven-seam-default-back-to-24` **before the second and third were spawned.** The third
session's entire contribution was confirming the number had not moved. Its own increment states the
mechanism: *"a task brief that states a metric breach as though undiscovered is not evidence that it is
undiscovered… The brief pointed at the SOURCE FILE; nothing pointed at the arc."*

**A session cannot distinguish "not yet authored" from "authored and not yet landed".** Three recorded
instances in two days. A `proposal-tier-drain` lane declared *"THE ARC HAS A DEADLOCK BY CONSTRUCTION,
and every remaining lane will meet it"* — false; PR #1115 had already shipped the fix and that lane's
branch predated it, requiring a correction increment minutes later. `session-isolation-arc` increment 5
shipped a closing sentence that was already stale when written, from a branch cut 76 minutes before the
PR that falsified it. And a full investigation chased a "missing proposal" defect that was FALSE — the
artifact had been created, realized and correctly retired the same day. **No ref-scoped search can see
this:** `git grep origin/main` correctly reports a field absent, which reads as "never authored" rather
than "authored and not yet landed", and after a merge `git ls-remote` still returns empty because the
branch died (ADR-0142) while `git branch -r --contains` says main carries the commit. Neither
instrument alone discriminates.

The through-line: **the system knows a session's picture is stale and never says so.** Note what is
NOT claimed — that concurrency is wrong, or that the dispatch rate should be lower. That is the owner's
call and this ADR does not take it. What is claimed is that at ANY concurrency the system should
diagnose staleness rather than let each session pay to discover it.

## Decision

**D1 — a validation refusal caused by a STORED field is diagnosed as schema skew, charged by
authorship. (BUILT.)** `explainDocValidationError` takes the doc's key set as read from the store and
partitions unrecognized keys: a key the caller introduced is reported as before ("field(s) this kind
does not have"), while a key already in the stored doc is reported as SCHEMA SKEW — naming the cause,
printing `git fetch origin && git merge origin/main` as the remedy, and explicitly refusing the
destructive workaround. Attribution is EXACT, not heuristic: the write path already holds the doc as
read, so a key present there was demonstrably not introduced by this write. This is ADR-0290's
charge-by-authorship move applied to schema skew; no new mechanism is invented. Wired into all five arc
write paths. Absent the stored-key evidence the message is byte-identical to before, so skew is never
guessed.

**D2 — a schema-extending live sweep does not run before its schema half is on `main`.** When a change
adds a field to a live-canonical doc, the schema that validates it lands FIRST; the sweep that writes it
runs after. The ordering is free to the author — the sweep is a separate command — and the alternative
charges every concurrent session for the window. This is a process rule, not a gate: a mechanical fence
would have to model "which writes introduce new fields", which is the schema itself.

**D3 — a defect- or metric-shaped brief is checked against the owning arc's parked work before it is
spent against.** A session handed a measured breach queries the arc tier first, and a brief that has an
owning arc cites `arc show <id> --pg` rather than restating the method. Parked entries exist precisely
so a remedy survives the session that found it (ADR-0298); three sessions on one brief is that
mechanism working and nothing reading it.

**D4 — absence measured against a ref is not evidence that a thing was never authored.** Before
concluding a cited artifact does not exist or that a system is broken, a session establishes whether
the thing is on a sibling's unlanded branch. `git merge-base --is-ancestor <sha> origin/main` after a
fresh fetch is the discriminator; sibling worktrees must be scanned directly, because no ref-scoped
search reaches an untracked file in one.

## Consequences

**Good.** The 1h40m incident becomes a one-read answer: the refusal now states the cause, the remedy,
and what not to do. D1 covers every caller of the explainer, so `friction reinforce`, `friction route`
and `artifact edit --set` gain the same diagnosis as they pass stored keys. D2–D4 are cheap — each is a
check a session performs in one command, and each replaces a multi-tool-call investigation that has
already been paid for at least three times.

**Bad, and accepted.** D2, D3 and D4 are guidance, so they bind only sessions that read them; none is
gate-enforced, and D3 in particular is defeated by a brief written outside the system (the owner's own
prompts do not pass through any arc check). D1's attribution is only as good as the stored-key evidence
its caller passes — a caller that omits `storedKeys` silently gets the old, wrong-for-skew message, and
nothing forces a new write path to pass it. That is a deliberate fail-open: the alternative is claiming
skew without evidence, which would misdiagnose real typos as someone else's problem.

**What this does not do.** It does not reduce the cost of a stale branch, only the cost of MISREADING
one. If the re-sync ratio stays near 1:1 after these land, the honest conclusion is that the remedy is
dispatch rate rather than instrumentation — and `session-staleness-arc` records that as a falsification
rather than extending itself.

## References

- `session-staleness-arc` — the owning arc, carrying the full measurement.
- ADR-0023 — the library tier is live-canonical, which is what allows a write to precede its schema.
- ADR-0290 — charge seed↔live drift BY AUTHORSHIP; D1 is the same move for schema skew.
- ADR-0298 / PR #1128 — the sweep whose schema half landed ~1h40m late.
- ADR-0142 — a branch dies on merge, which is why `git ls-remote` is not a discriminator.
- ADR-0252 D3 — never raise a drain ceiling as a remedy (the trap the three dispatched sessions avoided).
- `packages/library/src/library-doc.ts` — `explainDocValidationError`, D1's implementation.
- `packages/library/src/library-doc-schema-skew.test.ts` — D1's red-green fence.
- `packages/cli/src/arc.ts` — `loadArcForWrite` captures `storedKeys`; five write paths pass it.
- Friction `a-live-arc-write-outran-its-schema-and-blocked-4-arcs` — the incident as filed.
