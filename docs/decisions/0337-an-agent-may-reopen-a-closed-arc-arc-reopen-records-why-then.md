---
status: accepted
decided: 2026-08-09
amends: [239]
arc: arcs-hold-increments-arc
---
# ADR-0337: An agent may reopen a closed arc: arc reopen records why, then flips the bit

## Status

accepted (2026-08-09) — decided/directed by the owner in conversation on 2026-08-09. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The fork was surfaced with four
costed options (an owner-attestation flag enforced by guidance, a real identity gate, a
studio-UI-only control, or documenting a manual DB write) and the owner directed the simplest:
*"Just build the cli verb, agents should be able to reopen arcs if they need to."*

**Amends** [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md)
— D2's second paragraph reserved `closed → active` for the owner; that reservation is withdrawn and
the transition is given the verb it never had. D2's first paragraph — a lifecycle bit is a projection
of prose that supports it, never a free flip — is untouched and is extended to the opening direction.
D1, D3, D4 and D5 are untouched.

## Context

### The reservation had no mechanism, so it bound nobody

ADR-0239 D2 wrote: *"Re-opening (`closed → active`) is **owner-only**, mirroring ADR-0084's
human-only `accepted → proposed` un-deciding."* Nothing was ever built behind that sentence:

- `storytree arc close` refuses when the arc is already closed
  (`packages/cli/src/arc.ts`, the `lifecycle === "closed"` guard in `arcClose`).
- `storytree library artifact edit <arc-id> --set lifecycle=active --pg` is refused unconditionally
  for the `arc` kind (`packages/cli/src/commands.ts`, the `--set` loop's policy guard).
- A repo-wide search found no `arc reopen` verb, and neither refusal carried a flag, an env var, or
  any owner escape path.

So the transition was not owner-only. It was **nobody-only**: the owner could not exercise the
authority the guard reserved for them, and both refusals ended by quoting a rule that pointed at no
verb — the dead end *was* the advice.

### It failed for real, and the failure is on the record

On 2026-08-09, ADR-0334 superseded ADR-0333's closure of `parallel-session-dispatch-arc` and landed
`accepted`, saying the arc is open. The arc doc still read `closed`, because there was no way to flip
it and writing directly to the store to bypass a guard the CLI deliberately refuses was not
acceptable. `storytree arc list` therefore showed that arc closed while its own accepted ADR reopened
it, and any reader querying arcs rather than the decision log missed the reopening entirely.
ADR-0334's Consequences record this under "THE ARC'S `lifecycle` BIT COULD NOT BE FLIPPED", and
deliberately did *not* build the repair inline: it changes a governance gate, and doing that to
unblock the session that tripped it is the wrong reason.

### The precedent the reservation cited is itself prose-only

D2 justified the reservation by mirroring ADR-0084's human-only un-deciding. But ADR-0084 has no
mechanism either: ADR statuses are frontmatter on disk, `packages/cli/src/adr.ts` ships no
status-flip verb at all (`--status` is a read filter on `adr list`), and any agent with an editor can
change `accepted` to `proposed`. "Human-only" in this codebase already means *a rule agents are told
not to cross*, not a wall. So the reservation was not importing a guarantee from ADR-0084 — it was
importing a discipline, and then attaching it to a transition that, unlike an ADR status, had no
editor path either.

That asymmetry is the whole defect. ADR-0084's rule is enforced by nothing and is still *reachable*;
ADR-0239 D2's rule was enforced by nothing and was *unreachable*, which is strictly worse: it bought
no safety and cost the ability to correct the state at all.

## Decision

**An agent may reopen a closed arc.** The owner-only reservation in ADR-0239 D2 is withdrawn, and the
transition gets a first-class verb.

### D1 — `storytree arc reopen <id> --reason <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg`

The mirror image of `arc close`: it records an increment stating why the arc is open again, then sets
`lifecycle: active`. `--reason` is **required**, exactly as `--outcome` is on close.

### D2 — What survives the amendment is the discipline, not the gate

ADR-0239 D2's load-bearing half — *the state is a projection of the prose that supports it, never a
free flip* — is unchanged and now applies in **both** directions. Concretely:

- `--reason` is required, so an arc cannot go active without prose saying why its end state does not
  hold after all;
- `library artifact edit --set lifecycle=<anything>` stays refused for arcs, and its refusal now
  names both verbs instead of naming `close` and then quoting an unreachable rule;
- the reopening increment is durable (ADR-0305 D3) and marked `REOPENED`, so the log shows the
  reversal happened rather than presenting the latest state as the only one there ever was.

### D3 — No attestation flag, and deliberately no simulated one

The costed alternative was `--owner-attested`, with agent guidance forbidding agents from passing it.
That is rejected: an agent can pass a flag, so it buys no mechanical guarantee, while the flag's
existence advertises a fence that is not there. Given the owner's direction that agents may reopen
arcs, a flag would have been pure ceremony. The other two options are recorded as not-taken rather
than refuted — a real identity gate is blocked on the same unsolved OIDC credential that
`remote-session-access-arc` carries (ADR-0254 D4 retired `storytree-remote-dev`), and a
studio-UI-only control would leave the CLI, where the work happens, with no path.

### D4 — Increment-first, for the same reason `arc close` is

ADR-0305 D1 made the increment its own row, so no transaction spans the two writes (ADR-0239 D2's
"SINGLE atomic write" already did not survive that fold). `arcReopen` orders them increment-then-flip.
Interrupted, that leaves a still-**closed** arc carrying a reopening increment: visibly unfinished,
and fixed by re-running the verb. Flipping first would leave an arc reading `active` with nothing
saying why — the same lie in the other direction, and the one the ordering exists to prevent.

## Consequences

**The lifecycle bit is a bit again, not a one-way latch.** `lifecycleOf`'s `arc` branch
(`packages/library/src/lifecycle.ts`) reads a field that can now move both ways, so the projection
and the CLI can no longer disagree with an accepted ADR the way they did on 2026-08-09. ADR-0334's
recorded gap is discharged, and `parallel-session-dispatch-arc` is flipped back to `active` as this
ADR's first use.

**A governance guarantee is given up — knowingly, and it was never real.** Anyone can now reopen any
arc. What that gives up is the *idea* that a human ratified every reopening; what it costs in
practice is nothing, because no mechanism ever delivered that idea, and the guard's only measured
effect was to strand a correct decision. The remaining protection is the same one every other
prose-projected status in this repo relies on: the transition must state its reason, that reason
lands as a durable row, and both are visible to the next reader. If reopenings are later found being
minted casually, the evidence to act on is the increment log itself — every one of them is on it by
construction.

**`arc close` is no longer terminal in the strong sense**, and downstream readers should not treat a
`closed` arc as permanently settled. Nothing in the codebase did — `arc list --all/--closed` already
render closed arcs, and `lifecycleOf` already computed `archived` from a mutable field — but prose in
several places implied closure was final. Those spots are corrected in place per ADR-0139
(`arcClose`'s header, the `--set` refusal, `arc --help`, `knowledge.ts`'s `Arc` schema note,
`lifecycle.ts`'s `arc` branch); ADR-0239 D2 is likewise corrected in place to point here.

**The `REOPENED` marker is a documented transform of the author's prose, not a second parameter.**
`arc increment add` derives an increment's title from the first sentence it is given, so an unmarked
reopening reads in the log as one more landing — the one entry whose whole point is that it is not
one. The marker therefore appears in both the rendered log and the stored `body`, so the two cannot
disagree about which entry moved the bit. The cost is that the stored prose is not byte-identical to
what the author typed, which is stated here rather than left to be discovered.

## References

- ADR-0239 — amended here: D2's owner-only reservation is withdrawn; its projection-of-prose rule is
  kept and extended to the opening direction. D1/D3/D4/D5 untouched.
- ADR-0334 — the failure that forced this: an accepted ADR reopened an arc the machinery could not.
- ADR-0305 D1/D3 — the increment is its own durable row, which is why the ordering (D4) replaces the
  atomicity and why the reopening entry is permanent.
- ADR-0084 — the human-only un-deciding D2 mirrored, itself enforced by prose with no verb behind it.
- ADR-0139 — why the prose corrections above are made in place rather than by superseding.
- `packages/cli/src/arc.ts` (`arcReopen`), `packages/cli/src/commands.ts` (dispatch + the `--set`
  refusal), `packages/cli/src/arc.test.ts` / `cli.test.ts` (the contract).
