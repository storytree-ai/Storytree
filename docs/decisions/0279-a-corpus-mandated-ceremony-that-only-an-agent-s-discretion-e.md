---
status: proposed
amends: [95]
---
# ADR-0279: A corpus-mandated ceremony that only an agent's discretion enforces is not mandated: make the librarian pass observable, and resolve the harness conflict at the owner's layer

## Status

proposed (2026-08-01) — born from a commissioned friction board-drain, **not** owner-directed. Per
ADR-0110, batch adjudication is never "the owner directed this decision in conversation", so this ADR
is born `proposed` and the owner ratifies or redirects it. It is the escalation half of the ADR-0168
D5 friction loop: the `graduation-synthesist` adjudicated the friction item
`harness-agenttool-instruction-suppresses-mandated-librarian-pass` to the `adr` route, and a
friction-born ADR **is** the owner escalation. Every factual claim below was verified by a
commissioned `corpus-investigator` before this draft was written; the one claim that could **not** be
verified is marked as such rather than smoothed over.

## Context

ADR-0095 D7 mandates a `librarian-curator` pass before each merge ceremony — *"Graduation runs inside
general session orchestration — a librarian-curator pass before each merge ceremony. **(Owner's
call.)** … it runs before each merge ceremony as a standard orchestration step — green unit →
librarian pass (curate + graduate) → merge."* The `session-orchestrator` agent restates it
imperatively at workflow step 5: *"spawn the librarian-curator … the pass must finish before `gh pr
create`."* The language carries no discretion — no "may", no "consider", no "at your discretion".

Three facts, each verified, put that mandate in question.

**1. The mandate is enforced by statement only, never by a check.** Nothing mechanical observes
whether the pass ran. `merge-ceremony`'s own Verification section names no check for it; the pass does
not even appear in `merge-ceremony`'s numbered steps 1–9, surfacing only in its failure-mode prose.
Compliance therefore rests entirely on the agent reading its instructions and choosing to comply.

**2. Something in the execution environment tells agents not to comply, and it is not ours.** The
originating friction reports that three of thirteen overnight landings on 2026-07-30/31 resolved a
conflict with a standing harness instruction — *do not call the Agent tool unless the user explicitly
requested it* — in three different ways: one session skipped the pass and disclosed the skip; one
self-performed it inline; one skipped it silently (and filed no friction retro either). An exhaustive
repo search establishes that **no such instruction exists in any surface this repository controls**:
not `CLAUDE.md`, not `.claude/settings.json`, not `.claude/settings.local.json` (absent), not any of
the nine `.claude/agents/*.md`, `.cursor/agents/*.md` or `.codex/agents/*.toml` files, and there is no
`.claude/hooks/` directory at all. Repo-wide greps for `AgentTool`, `explicitly requested`, `do not
call` and `unless the user` return no matching instruction. The instruction is injected by the desktop
harness's own system prompt. **No edit to any file in this repository reaches it.**

**3. The corpus is silent on which one wins.** A sweep of all five guidance-bearing tiers — 64
principles, 17 guardrails, 25 patterns, 17 processes, 52 definitions — found no artifact resolving a
conflict between a harness standing instruction and a corpus-mandated ceremony.
`agent-never-self-exempts` is scoped narrowly to operator-attestation, not ceremony-skipping.
`orchestrator-is-sole-fan-out` concerns the deterministic code spine scheduling DAG nodes, not
session-level tool use — a scope mismatch, not a governing rule. `escalate-up-when-blocked-or-out-of-
scope` states the right instinct (stop and hand up; never silently skip) but is written for a spawned
specialist escalating to its orchestrator, not for the orchestrator blocked by its own harness.
`in-session-subagent` names the librarian-curator spawn as the canonical intended use of the very tool
being discouraged — confirming the intended mechanism without saying what happens when it is
discouraged.

**What is NOT established.** The three sessions' quoted reasoning lives in transcripts outside this
repository and could not be verified. Git corroborates only the weaker fact that none of PRs #1032,
#1035 or #1039 carries a distinct librarian-pass commit — and that is genuinely weak evidence, because
a pass touching only the live Postgres Library store via `--pg` leaves no git trace at all. The
compliance rate is therefore *reported, not measured*. The decision below does not depend on the exact
rate: it depends on fact 1, which is structural.

The forces in tension: a ceremony the owner deliberately placed inside the session; an execution
environment the corpus has no authority over; and a standing preference in this system for fences over
guidance an agent must remember.

## Decision

**D1. Name the honest status quo: an unenforced mandate is a request.** A ceremony step whose only
enforcement is an agent's reading of competing instructions is not mandated in any load-bearing sense —
its compliance is luck, and will vary with harness version, session shape and model. This ADR amends
ADR-0095 D7 by recording that its "standard orchestration step" has never been enforced, only stated.

**D2. The corpus does not legislate over the harness.** Authoring an artifact that instructs agents to
disregard a standing harness instruction is refused as a remedy, on two independent grounds: it would
not reliably work, and the harness's configuration belongs to the owner's layer, not the corpus's. This
forecloses the tempting agent-side "fix" so that a later session does not reach for it.

**D3. Disclosure is the required resolution when the environment blocks a ceremony step.** A session
that cannot perform a corpus-mandated step because its execution environment forbids or discourages the
required action must not silently skip it and must not silently substitute its own inline version. It
performs what it legitimately can and **discloses the gap in its debrief**, naming the step and the
reason. Of the three observed resolutions, only the disclosed skip was honest; that is the behaviour to
standardise. This is agent-side, costs nothing, and is actionable immediately.

**D4. If the pass is to stay mandatory, it must become observable — on an observable that actually
observes it.** Making the pass gate-enforced is the only way to convert D1's request back into a
mandate. But the obvious implementation is a trap: a git-diff proxy would be blind to a `--pg`-only
pass, reproducing exactly the defect `an-observable-is-evidence-only-for-what-it-observes` names and
that `check:declared` already exhibits (it observes *that* a session claimed some node, never *whether*
the claimed node matches what it writes). Any check adopted here must key on a signal the pass itself
emits. The mechanism is unbuilt and is routed to `story-author` as capability work, not decided here.

**D5. The harness layer is an OWNER FORK, recorded rather than guessed.** Only the owner can act on the
instruction in fact 2. The options are: **(a)** adjust the harness configuration so the ceremony spawn
is explicitly expected, removing the conflict at its source; **(b)** leave the harness as-is and accept
D3 + D4 as the mitigation; or **(c)** relocate the pass out of the individual session altogether — for
example onto the scheduled board pass this seat already runs, which has no such constraint. This ADR
deliberately does not pick. ADR-0095 D7's in-session placement was itself explicitly "(Owner's call.)",
so relocating it is a re-decision only the owner can make. Following the ADR-0262 precedent, the fork is
recorded for the owner rather than guessed by an agent.

## Consequences

**Good.** D1 replaces a comfortable fiction with a measured statement, so nobody again reads "mandated"
as "reliably happening". D3 is free and immediate: it converts the worst observed outcome (a silent
skip, from a session that also filed no retro) into a visible one, and visible gaps are drainable
through the existing friction loop. D2 spares a future session from authoring guidance that could not
have worked. D4 states the constraint that makes a future check honest rather than decorative — cheaper
to state now than to discover after building the wrong observable.

**Bad, and accepted.** Until D5 is settled the conflict persists, so compliance stays variable; D3
makes it visible without making it uniform. D4 defers real work and leaves the pass unenforced in the
meantime. D1 also has a cost worth naming: recording that a mandate was never enforced invites reading
other unenforced ceremony steps the same way — which is uncomfortable, and probably correct.

**Falsification.** If disclosed skips do not appear in debriefs after D3, the failure is not the harness
but the disclosure discipline, and D3 is the wrong remedy. If the compliance gap disappears without any
of D4 or D5 being built — for instance because a harness version changes underneath us — then fact 2 was
version-specific rather than structural, and this ADR should be retired rather than implemented.

## References

- `docs/decisions/0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md` — D7, the mandate this amends; its in-session placement is explicitly "(Owner's call.)".
- `docs/decisions/0168-session-retro-friction-every-session-feeds-friction-to-the-l.md` — D5, the adjudication loop that produced this ADR; a friction-born ADR is the owner escalation.
- `docs/decisions/0110-collapse-the-redundant-end-of-flow-adr-ratification-record-t.md` — why this is born `proposed`: batch adjudication is never owner-directed-in-conversation.
- `docs/decisions/0262-contract-clauses-are-declared-but-not-observable-check-covera.md` — the precedent for recording a fork rather than guessing it.
- `docs/decisions/0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md` — why D1 is an `amends` of ADR-0095 rather than a supersede: the decision did not change, its enforcement claim is being corrected.
- `docs/decisions/0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md` — the debrief D3 attaches disclosure to.
- `asset:an-observable-is-evidence-only-for-what-it-observes` — the constraint D4 is built around.
- `asset:in-session-subagent` — names the librarian-curator spawn as the canonical use of the discouraged tool.
- `asset:escalate-up-when-blocked-or-out-of-scope` — the adjacent norm D3 extends to the orchestrator's own blocked case.
- Friction item `harness-agenttool-instruction-suppresses-mandated-librarian-pass` (live store) — the originating signal and its full adjudication.
