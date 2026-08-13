---
status: accepted
decided: 2026-08-13
arc: guidance-write-path-integrity-arc
amends: [352]
---
# ADR-0361: The guidance write path proves its own fidelity: a trusted channel for long prose, and a refusal for every truncation-shaped write

## Status

accepted (2026-08-13) — the owner directed `guidance-write-path-integrity-arc` be driven to close in
conversation on 2026-08-13. The arc's three end states were the owner-facing decision; its two parked
increments explicitly delegated the SHAPE of each remedy to the increment ("to be settled in the
increment rather than pre-committed here"), and this is that settlement. Closes the arc.

## Context

The generated harness projections — `CLAUDE.md`, root `AGENTS.md`, the five harness agent
directories — are read at session start by every session on every branch, BEFORE any tool can run.
They are generated from live `agent` artifacts, and `check:guidance` / `check:agents` defend them by
comparing each projection against the live store.

That defence sits DOWNSTREAM of where corruption enters. When the STORE holds the damage, both sides
of the comparison carry it and the checks report in sync. Three measured incidents, each with a
different proximate cause and the same undetectable outcome:

1. **The documented round trip captured the tool's own output** (2026-08-08). `library-edit-ceremony`
   prescribes reading a long field with `--raw`, redirecting it to a file, and writing it back with
   `--set field=@file`. Run the read the way every guidance surface in this repo spells the CLI —
   `pnpm storytree …` — and pnpm's two-line run banner goes to STDOUT ahead of the payload, so the
   redirect captures it as the field's first bytes. 175 bytes of banner entered the live
   `session-orchestrator` `workflow`, and `build:guidance` rendered `**Workflow.** > storytree@0.0.0
   storytree …` into CLAUDE.md and AGENTS.md. It surfaced as a red `check:guidance` on an UNRELATED
   branch, where the standard remedy — regenerate and commit — would have made it permanent across
   all five agent directories. The more disciplined the session, the more likely it hits this.

2. **An inline edit truncated a long field while reporting success** (2026-08-11). An inline
   `--set` of `session-orchestrator`'s `workflow` persisted only a prefix; the projections then
   regenerated faithfully from the truncated source, dropping workflow step 7 (ADR-0314 D5's
   escalation-authors-the-question), the ADR-0303 blocked-mid-unit landing, and the line "Never
   self-exempt from the gate or the ceremony." File-backed `@path` values restored the field.

3. **A regeneration read a half-landed value** (2026-08-11/12) — `regen-mid-edit-truncates-guidance-silently`,
   already adjudicated to ADR-0352, whose field-scoped `--set` removed the cause.

In every case the write reported success at exit 0 and the drift checks reported in sync. Only manual
inspection caught any of them — a human reading prose and noticing an absence, which is the one thing
nobody greps for.

### What the evidence actually says, against what the increments assumed

Both parked increments named a cause. One of them is wrong, and correcting it is what changed the
remedy — so it is recorded here rather than quietly worked around.

`long-field-writes-land-whole-or-fail` states "the ceiling is in argv handling" and proposes refusing
an inline value near the platform argv ceiling. **Measured 2026-08-13 on Windows 11 / Node 24, that
ceiling is not a silent failure and needs no guard.** Single-argument values of 4,000 / 8,000 / 8,200 /
16,000 / 30,000 / 32,000 characters all arrived INTACT through both shells; past ~32,767 both refuse
loudly — Git Bash with `Argument list too long`, PowerShell with `The filename or extension is too
long`. Nothing truncates silently on length.

What DOES cut a value silently is **quoting**, which the friction's own first sentence says
("can lose quoting and persist only a prefix") and which reproduces exactly:

```
value:  START of prose. Then a quote: "quoted" and more prose after it. END   (65 chars)
argv:   … --set whatItIs=START of prose. Then a quote:   quoted   and more prose after it. END
result: argc=4, the flag's value 30 characters long, exit 0
```

A 65-character value stored as 30 — no length ceiling within two orders of magnitude. The tail did
not vanish: it arrived as **stray positionals**, and the dispatch destructures `[area, sub, third,
fourth]` and drops the rest in silence. A length threshold would therefore have caught none of the
three incidents while taxing every honest inline edit — so it is not taken.

### The one remedy already put to the owner and refused

The shrink-guard — refuse a projection or a write that SHORTENS a guidance section — was proposed by
incident 3's friction item and **REJECTED by the owner on 2026-08-12**: shortening a guidance section
is normal wanted work, so it taxes the legitimate case, and a guard the honest case must argue with
trains sessions to pass the override by reflex. Nothing below re-proposes it. Every refusal here is
keyed on a shape an honest edit does not have, and each one's remedy is a channel rather than an
override flag.

## Decision

**The channel split is the whole design.** INLINE is the UNTRUSTED channel and `@path` is the TRUSTED
one, because a file's bytes reach the process whole by construction while an inline value crosses a
shell that may cut it. Each refusal below fires only on the inline channel, and each names the file
channel as the way to say the same thing on purpose — so the honest case is priced at one file write,
never at an override.

**D1 — the raw read owns its own output channel.** `library artifact <id> --raw <field> --out <path>`
writes the field's exact bytes to a file the CLI itself opens, and prints an ordinary envelope on
stdout. Nothing a wrapper emits can enter a file this process opened, so incident 1 is not guarded
against — it is structurally unavailable. The stdout form is unchanged and still right for a pipe or
an eye. `--out` is what the ceremony, the help text and the `next:` hints now spell.

**D2 — a value carrying a package manager's run banner is refused at the write.** Checked on BOTH
channels, because the banner enters through the READ and therefore arrives inside an otherwise
trustworthy file — including a file captured before `--out` existed. The refusal names the offending
line and prints the `--out` round trip.

**D3 — a prose-carrying write refuses positionals no verb reads.** The stray words are the one
deterministic artefact of a shell that ended a value early; ignoring them is the defect. It is
enforced at the flag-parsing boundary, once, for the same reason the `@path` expansion is: so no verb
can re-open the hole by not thinking about it. Nobody passes stray positionals on purpose, so the
honest case pays nothing.

**D4 — an INLINE `--set` whose value is a proper prefix of the stored value is refused.** A cut can
only ever produce a head; an edit almost never leaves one byte-identical. The floor is 64 characters,
which keeps ordinary short-field edits free. A caller who genuinely means to delete a tail sends the
same bytes from a file, and it lands.

**D5 — no length threshold on inline values,** for the measured reason above: the argv ceiling
already fails loudly, and a threshold would tax every honest inline edit for a failure mode that is
not silent. This overrides the direction `long-field-writes-land-whole-or-fail` proposed.

**D6 — `library artifact history <id> [--field <f>]`** reports what each write did to an artifact's
fields, read from `events.library_event` rather than from current state. It reports sizes, losses,
the actor and the sequence; it renders no verdict, and it names a prefix-shaped write without calling
it damage, because a shrink is ordinary curation more often than it is corruption. This is the
technique ADR-0352's own adjudication used by hand-querying that table; it becomes a verb so the next
reader needs neither SQL nor a hypothesis.

## Consequences

The arc's three end states hold:

1. *A documented read-then-write round trip cannot capture anything but the field's own bytes* — D1,
   with D2 as the last-moment catch for a file captured the old way. Proved by a byte-exact round-trip
   test over a value carrying a leading blank line, inner double quotes, backticks and trailing
   whitespace.
2. *A long-field write either lands whole or fails loudly* — D3 and D4, with D5 recording why the
   third proposed direction is unnecessary. Both refusals are proved to leave the stored value
   untouched, and the same prefix write is proved to LAND from a file.
3. *There is a way to tell that an edit LOST content which does not consult only the store that edit
   just wrote* — D6.

**What this does not close.** D4 catches a cut only where the result is a prefix of what is stored; a
truncated write that also edits the head is invisible to it, and D3 catches that case only when the
shell leaves stray words behind. A cut that leaves neither signature still lands. That is a narrower
hole than the one this ADR found, and D6 is the instrument for it after the fact — deliberately, since
the alternative (comparing against an expected length the caller would have to supply) puts the
guarantee back on the discipline that failed three times.

**A guard that is wrong once is a tax forever.** D3 and D4 refuse commands, so a false positive costs
a session real time. D4's false positive is bounded and named in its own message — a deliberate
trailing deletion, which lands unchanged from a file. D3 has no known false positive: the five
free-text areas (`orchestrate`, `onboarding`, `doctor`, `dispatch`, `guide`) are exempt, and no other
verb both reads more than four positionals and accepts a prose flag. If that stops being true the
exemption list is where it is fixed, not the arity.

**This amends ADR-0352** rather than superseding it: field-scoped `--set` removed the LOST-UPDATE
cause of incident 3 and stands unchanged. What it did not address is a value that is already damaged
when it reaches the store, which is incidents 1 and 2 — so the two are complementary halves of the
same guarantee, and ADR-0352's body is no longer wholly self-describing about the write path.

## References

- `guidance-write-path-integrity-arc` — the arc, its three end states, and both parked increments.
- ADR-0352 — a `--set` edit writes only the fields it names (the lost-update half).
- `packages/cli/src/write-fidelity.ts` + `.test.ts` — D2 / D3 / D4 and the byte-exact round trip.
- `packages/cli/src/artifact-history.ts` + `.test.ts` — D6.
- `packages/cli/src/at-path.ts`, `set-value.ts` — the two sibling value boundaries this joins.
- Friction: `a-read-write-round-trip-captures-the-tools-own-banner`,
  `library-edit-inline-argument-truncates-long-agent-fields-on-windows`,
  `regen-mid-edit-truncates-guidance-silently`.
