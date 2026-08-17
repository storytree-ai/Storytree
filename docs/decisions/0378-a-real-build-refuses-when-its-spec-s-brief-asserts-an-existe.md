---
status: accepted
decided: 2026-08-17
arc: verification-integrity-arc
---
# ADR-0378: A --real build refuses when its spec's brief asserts an existence claim the declared sourceFile falsifies

## Status

accepted (2026-08-17) — decided/directed by the owner in conversation on 2026-08-17. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The open question `oq-where-should-the-stale-negative-existence-claim-rule-live` measured 30 specs
under `stories/**` whose brief asserts, anchored on the file's own basename, that a declared
`proof.real.sourceFile` "does not exist at HEAD" — when that exact path already exists on disk,
usually because the capability was already built by an earlier `--real` run. Two independent
scanning methods converged on the same 30. The claim was true the day the spec was written; nothing
re-checks prose once the code lands, and the one advisory instrument that looks like it should catch
this (`contract-binding-drift`) only consults history when a declared path is *missing* — the
moment the path exists it stops looking, which is precisely the stale-claim case.

Left alone, a `--real` build dispatched against one of these 30 hands a live agent a brief
instructing it to create a file that is already there — the "proof theater" ADR-0085 and ADR-0097
ban: a red or green that says nothing true about the system. Three homes were considered and are not
this one: a 6th `check:verification-decay` instrument (an amendment to accepted ADR-0252, carrying
its own advisory worklist and false-positive surface); a curation pass across all 30 specs now (real
work, but a `story-author`-tier judgment call per spec, not a mechanical rule, and leaves nothing
protected while it's in flight); or accepting the risk with no mechanism (rejected — 30 of 31
per-capability absence claims in the corpus are already stale, so this is the normal state of a
spec, not a rare tail, and it only worsens as more capabilities ship).

## Decision

`storytree node build <id> --real` (and the story-build path that calls it, `story build --real`)
refuses to dispatch a spec's brief to the authoring agent when all of the following hold:

1. The spec declares `proof.real.sourceFile`.
2. That declared path exists on disk at the point the build would start.
3. The spec's body contains an absence phrase ("does not exist", "does not yet exist", "is not
   built", "absent at HEAD", or equivalent) anchored on that file's own basename — the phrase must
   name the file, within roughly 160 characters, not merely appear somewhere in a 300-line document.

The anchor is required, not incidental: without it the same scan over‑fires on brownfield specs
(`editsExisting: true`) whose prose correctly says something absent about a *symbol or behaviour*
inside a file that itself always existed — 17 of the corpus's 47 raw matches were exactly this
shape, and flagging them would be wrong. The discriminator is current existence on disk, never git
history: this rule never asks whether the file *moved* or *who* created it, only whether the
sentence the brief is about to hand an agent is true right now.

Refusal names the spec, the declared path, and the offending sentence, and stops before the agent is
invoked — the human (or a future session) corrects the spec's `status`/prose/`sourceFile` and
re-runs. This is a precondition on the build path (ADR-0060/ADR-0081 territory — those ADRs made
`--real`/`--live` always persist and never silently fall back; this adds one more condition under
which the build does not proceed at all), not a new `check:verification-decay` instrument: it
carries no advisory worklist, no drain ceiling, and needs no amendment to ADR-0252, because it never
runs unless and until someone actually attempts to build one of the affected specs.

## Consequences

- Zero backlog at landing time: none of the 30 specs are touched or repaired by this ADR, and
  nothing reds today. The refusal only fires the moment a `--real` build is attempted against one of
  them, which is rare until someone does.
- The refusal is invisible to a plain reader of a stale spec — a human or an agent that merely reads
  one of the 30 without building it is still misinformed by the stale sentence. This ADR accepts that
  gap deliberately (recommended over the alternative that would surface it, because that alternative
  costs a standing 30-item advisory list and an ADR-0252 amendment); a later curation pass ( 	
  story-author tier, out of scope here) remains the way to actually clean the 30 up.
- `contract-binding-drift` and the other four `check:verification-decay` instruments are unchanged —
  this class stays outside that tier by design, not by oversight.
- A spec correctly declaring a path that is genuinely still missing is unaffected: the refusal
  condition requires the path to exist, so the one spec in the corpus where the claim is actually
  true today is never blocked.

## References

- [ADR-0060](0060-live-and-real-builds-own-the-database-default-store-pg-auto.md) — live/real builds always persist; the class of refusal this extends.
- [ADR-0081](0081-remove-the-store-memory-opt-out-live-and-real-builds-always.md) — live/real builds never silently fall back; same territory.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — the `check:verification-decay` instrument tier this deliberately does *not* extend.
- ADR-0085 / ADR-0097 — proof-theater bans this refusal serves.
- `oq-where-should-the-stale-negative-existence-claim-rule-live` — the open question this answers.
