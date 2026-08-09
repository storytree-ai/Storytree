---
status: proposed
arc: arc-and-open-question-truth-maintenance-arc
---
# ADR-0338: Arc and open-question truth-maintenance: reactive trigger extension plus an explored staleness fork

## Status

proposed (2026-08-10) — explored per owner direction, on an explicit explore-only instruction
("EXPLORE ONLY — do not implement code, do not born-accept any ADR, do not close this out as
decided"). This ADR names a structural gap that is not itself in dispute, then lays out a menu of
options across two independent axes for the owner to pick from in a later session. Nothing below is
ratified. Per [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) a
batch-explored ADR is never "the owner directed this decision in conversation", so it is born
`proposed` exactly as the [ADR-0279](0279-a-corpus-mandated-ceremony-that-only-an-agent-s-discretion-e.md)
precedent was.

## Context

**The librarian pass's decision-log-curation half is trigger-gated, and the trigger names a fixed set
of kinds.** [ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) D2: the
pass fires when a branch's diff touches `docs/decisions/**`, `stories/**`, the generated guidance
projections (`CLAUDE.md`, `AGENTS.md`, the harness agent directories), or when the session performed a
live-store write to an `agent`/`principle`/`guardrail`/`pattern`/`process` artifact. Reading the
`librarian-curator` agent artifact's workflow in full (`storytree library artifact librarian-curator
--pg`) confirms the sweep this trigger arms is scoped the same way: step 5 ("Decision-log
truth-maintenance") is written entirely in terms of ADR bodies and their frontmatter edges: correct
overtaken prose in place, supersede-and-replace on a genuine re-decision, rehome durable guidance out
of ADR bodies. **`arc` and `open-question` do not appear anywhere in that trigger clause or that
workflow step** — not as a diff path, not as a live-store-write kind, not as a sweep target.

This is not an oversight to be read as a bug in ADR-0324 — that ADR's own scope is the *decision log*
specifically (its title says so), and D4 explicitly declines to widen enforcement further without
evidence. It is a gap ADR-0324 never claimed to close, now confirmed to matter in practice.

**The gap is confirmed, not hypothetical.** On 2026-08-09, in this same working session, all 4 live
`open-question` artifacts were fanned out to `corpus-investigator` for an independent freshness check.
**2 of the 4 (50%) had already drifted:**

- `oq-close-context-decision-tree-arc-or-hold-for-d7` (now retired) carried a self-reported adoption
  statistic that read "n=1, self-measured" at authoring time and had moved to "n=43 sessions, 1
  independent hit" within **3 days** — a real, material change to the question's own stakes — with
  nobody noticing until this session asked.
- `oq-should-the-retired-check-web-experience-rung-be-re-wired` (now retired) was **flatly wrong about
  a test-suite coverage fact from the moment it was authored** — not drift over time, a defect present
  at birth that nothing caught.

Both required manual correction in this conversation. **No process would have caught either on its
own** — neither is a diff that would trip ADR-0324 D2's trigger (an open-question's `arcRef` write is
not one of the five listed kinds), and no periodic sweep of the open-question tier exists at all.

**Correcting the content, once found, is already mechanically possible and needs no new capability.**
`storytree library artifact edit <id> --set <field>=<value> --pg` already works on any structured
Knowledge kind, `open-question` and `arc` included — the same validated write path the librarian uses
for ADR-adjacent artifacts. **The entire gap is "who looks, and when" — not "can the fix be written."**
This matters for scoping every option below: none of them need a new write mechanism, only a trigger
or a schedule that gets an agent to look.

**Two distinct staleness modes, and they likely need different remedies.**

1. **"A landing overtook it"** — the same shape ADR truth-maintenance already handles: a session's own
   diff falsifies a claim in an arc or open-question its work touches (an arc's `endState` describes a
   condition the landed PR just met; an open-question's premise is resolved by the very change that
   answers it). This is diff-observable in principle, exactly like the ADR case, and is closeable the
   same way: widen ADR-0324 D2's trigger and the curator's step-5 sweep to the `arc`/`open-question`
   kinds.
2. **"The world moved, nobody landed anything that touches it"** — the `oq-close-context-decision-
   tree-arc-or-hold-for-d7` case exactly: real sessions ran, and their aggregate activity moved a live
   count from n=1 to n=43, but no single diff caused it and no session's branch touched the arc or the
   question. **A diff-based trigger structurally cannot catch this — there is no diff to key on.**
   [ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) D4 explicitly
   declined a scheduled/batched drain for the ADR-curation case, citing "no evidence yet triggered
   passes are redundant with each other," and named its own revisit condition as "triggered passes
   routinely finding nothing." That evidence bar is for a *different* claim than this ADR is testing —
   D4 was asking whether the EXISTING triggered mechanism was working too hard for too little, not
   whether a NEW mechanism is needed for a class of drift the existing one cannot see at all. The
   50%-of-4 measurement above is not "D4's revisit condition met"; it is evidence for a genuinely
   different mechanism gap that D4 never covered, on a tier ADR-0324 never targeted.

**Relevant precedent already built and available to draw on, read in full for this ADR:**

- **[ADR-0202](0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md)** — the
  park-lease ceremony for agent-memory candidates: a reviewed item can be **parked** (verdict, reason,
  content hash, review date, lease length, default 60 days), a content-hash change re-enters it
  immediately on edit, and lease expiry **inverts the question** from "should this graduate?" to "is
  this still alive?" with three honest outcomes (re-park / delete / graduate-then-delete). This is a
  worked TTL-with-hash-invalidation mechanism already proven in this corpus, on a tier with a similar
  shape to open-questions: reviewed-but-not-yet-actioned items that may go stale silently.
- **[ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md)** — the
  verification-decay process: a cheap, continuous mechanical sweep (advisory, per-finding, fail-closed
  only on a *drain-ceiling COUNT* — never on any single finding) paired with an expensive judgment
  pass that has **no calendar cadence** and fires only at a natural checkpoint (arc close) when the
  closing session judges it warranted, with a mechanical escalation as the backstop against
  indefinite decline. D4 there explicitly rejects "not a new unattended scheduled job... the cost is
  not one to spend unwitnessed" as a design constraint — a rejection this ADR's Option 2C below
  inherits directly.
- **[ADR-0182](0182-delegatable-library-agents-carry-a-model-tier.md)** — the workhorse/judgment model
  split: sweep-compare-against-an-explicit-standard work (`corpus-investigator`, `librarian-curator`,
  `explorer`) runs on **sonnet**; whole-system judgment calls (`graduation-synthesist`,
  `guidance-curator`, `story-author`, `planner`) run on **opus**. Confirmed against the live roster
  (`.claude/agents/*.md`): `corpus-investigator` and `librarian-curator` are both pinned `sonnet`;
  `graduation-synthesist` is pinned `opus`.
- **The optional-schema-field precedent** (`Agent.model`, `Agent.aliases`, `Friction.route`/
  `provenance`/`reinforcedBy` — `packages/library/src/knowledge.ts`): adding a new optional field to a
  structured kind via `.extend()` needs no `CURRENT_SCHEMA_VERSION` bump and no migration, because
  every existing document simply omits it and still validates. Any option below that needs a new field
  on `OpenQuestion` (a verification timestamp, a lease length) is this same cheap shape, not a schema
  migration.

## Decision

**This ADR does not decide.** It records options across two independent axes — the reactive-trigger
extension (mode 1) and the no-landing-drift mechanism (mode 2) — so the owner can pick a point in the
combined space next session. The axes are independent: any mode-1 option composes with any mode-2
option, including "none."

### Axis 1 — Mode 1: reactive extension (closes "a landing overtook it")

**Option 1A — Widen ADR-0324 D2's trigger and the curator's step-5 sweep to `arc`/`open-question`.**
Add the two kind names to the live-store-write trigger clause (today: `agent`/`principle`/
`guardrail`/`pattern`/`process`) and extend the librarian-curator's workflow with a step naming these
kinds explicitly, using the SAME correct-in-place / supersede-and-replace choice ADR-0139 already
governs for ADRs — an open-question whose premise a landing resolved is **retired** (the existing
`question` lifecycle verb, the open-question analogue of "supersede"); an arc whose `endState` or
Context prose a landing falsified is **corrected in place** (the existing generic `artifact edit
--pg`, the open-question/arc analogue of an ADR correction).
- *Who / how often / tier:* the same `librarian-curator` pass, same trigger, same **sonnet** tier
  (ADR-0324 D3's reasoning — sweep-compare against an explicit standard — applies unchanged: "does
  this arc's endState still hold", "does this open-question's premise still stand" is the same
  mechanical class as "does this ADR clause still hold").
- *Marginal cost:* small. The trigger fires on the SAME diffs it already fires on (a session touching
  `docs/decisions/**`/`stories/**`/guidance is not obviously more likely to also touch an arc or
  open-question, but when it does, this closes the gap at zero extra trigger cost — only the sweep
  widens). ADR-0324's own measurement (D3: cost per triggered pass fell to $2.40; frequency ~90% of
  sessions post-trigger) is the base to add this against — not re-measured here.
- *Catches:* mode 1 only — a landing that falsifies an arc/open-question claim on the SAME branch
  that's already tripping the trigger for another reason, or a branch whose OWN write to the
  open-question/arc tier is what's added to the trigger clause.
- *Does not catch:* mode 2 by construction — a diff-based trigger cannot see drift with no diff. Does
  not catch a branch that touches neither a curated path nor the open-question/arc tier but whose
  landed CODE falsifies an open-question's premise (the same residual ADR-0324's own Consequences
  names and accepts for the ADR case — "the next session to touch that artifact fixes it").

**Option 1B — Narrower: extend only for `open-question`, not `arc`.** Same mechanism as 1A, scoped to
the tier where the measured incident actually occurred and where the failure mode is sharpest: an
open-question's whole POINT is a concrete, answerable-cold briefing (ADR-0314 D5) carrying live
numeric/factual claims by design — an arc's `intent`/`endState` prose is comparatively abstract and
less likely to carry a fast-decaying number. Cheaper to build and to reason about; leaves arc-body
staleness as an accepted residual, on the argument that an arc's factual content is thinner than an
open-question's and arcs are already visited relatively often (every `increment add`/`close`/`new`
write touches the parent arc's rollup).
- *Cost / tier:* strictly smaller than 1A — half the kinds to sweep.
- *Catches / doesn't catch:* same as 1A, narrowed to the open-question tier; arc-body drift (an
  `endState` a landing already satisfied, as ADR-0314's own several "corrected in place" annotations
  show happening to ADR bodies about arcs) is explicitly left uncaught by this option.

### Axis 2 — Mode 2: no-landing drift (closes "the world moved, nobody landed anything")

**Option 2A — Stay manual; no new mechanism.** The status quo as of this ADR: a session verifies an
open-question's or arc's claims only when something prompts it to look — an owner asking, an
orchestrator about to act on the question, or (as in this session) a commissioned audit.
- *Who / how often:* nobody, on no schedule; entirely ad hoc.
- *Cost:* zero standing cost.
- *Catches:* whatever an ad hoc look happens to catch — which is how the 2/4 drift above WAS
  eventually caught, three days and one un-triggered incident later.
- *Does not catch:* anything nobody happens to ask about. The measured 50%-of-4 rate is small-N (4
  items) and should not be read as a population-wide rate, but it is non-zero evidence where ADR-0324
  D4 had none for the ADR-curation case; whether that evidence clears the bar for building something
  is the owner's call, not decided here.

**Option 2B — A park-lease on open-questions, adapted from ADR-0202.** Add two optional fields to
`OpenQuestion` (no schema-version bump, per the optional-field precedent above): a `verifiedAt`
timestamp and a `leaseDays` (a shorter default than agent-memory's 60 is worth naming explicitly —
the one measured drift here moved a live count within **3 days**, two orders of magnitude faster than
agent-memory's park-lease population; a starting point in the 7–14 day range is closer to the observed
decay rate, though the right number is a build-time call, not this ADR's). On expiry the question
routes back through the SAME `librarian-curator` pass (or, for a genuinely live numeric claim,
delegates the re-verification to a fresh `corpus-investigator` spawn — the exact move this session
made by hand) with the SAME inverted question ADR-0202 uses: not "is this still worth asking" but "is
this claim still true" — re-lease (re-verified, unchanged), correct-in-place (drifted, fixed), or
retire (moot / answered).
- *Who / how often / tier:* the check itself (does a lease exist, has it expired) is a cheap read,
  foldable into the SAME pass that already runs — and because the tier is small (ADR-0314's own
  measurement: the whole open-question tier held **0** items as of 2026-08-05, 4 as of this session's
  audit), checking it costs close to nothing even UNCONDITIONALLY, every landing, the way ADR-0324 D1
  keeps graduation session-local-and-unconditional rather than trigger-gated — population size is the
  argument FOR making this half unconditional rather than trigger-gated, unlike the docs/decisions
  sweep ADR-0324 D2 gates (hundreds of ADRs, expensive to sweep blindly). The re-verification itself
  (actually re-deriving a live number) is the expensive step and should stay a bounded, LEASE-KEYED
  drain (K≈1-3 expired items, mirroring the friction-drain and graduation-drain shapes) rather than a
  sweep of the whole tier every time — **sonnet** for the mechanical park/expiry bookkeeping,
  optionally a `corpus-investigator` spawn (also sonnet) for the actual re-derivation of a numeric
  claim.
- *Catches:* mode 2 — drift with no diff, bounded by the lease length, on a population small enough
  that checking it costs little regardless of trigger state.
- *Does not catch:* drift that happens and is corrected within one lease window is fine; a claim that
  changes twice within one lease window is caught only at expiry, same residual risk ADR-0202 accepts
  for agent-memory. Needs a build-time decision this ADR does not make: the lease length, and whether
  re-verification is mechanical-only (sonnet reads a cited source) or needs a live re-query
  (corpus-investigator spawn) — which is only knowable per-question and argues for Option 2E below as
  a prerequisite that makes THIS option cheaper and more reliable.

**Option 2C — A scheduled/periodic sweep independent of any trigger or lease.** E.g. "check every open
question weekly" on a calendar, regardless of population size or activity.
- *Named for completeness, and named as the option this corpus's own precedent argues against.*
  ADR-0252 D4 rejected exactly this shape for the deep verification pass — "not a new unattended
  scheduled job... the cost is not one to spend unwitnessed" — preferring a judgment-gated trigger at
  a natural checkpoint over a bare calendar. ADR-0324 D4 similarly declined a batched drain for the
  ADR case. A calendar-keyed job also has no session driving it, which conflicts with this corpus's
  standing pattern that mechanical waiting/scheduling should not pay context rent unwitnessed (the
  `mechanical-waiting-never-pays-context-rent` guardrail the session-orchestrator itself is held to).
  Included here as a real point in the design space, but the corpus already has two independent
  rejections of its closest cousins; an owner choosing this would be choosing AGAINST that precedent
  and should have a reason to.

**Option 2D — On-read staleness surfacing (advisory, zero recurring cost).** Render the age since
`verifiedAt` (if present — from Option 2B, or standing alone as a bare timestamp with no lease logic
at all) on `storytree arc show` / `storytree question show`, the same shape `increment check`'s
consumption-time freshness check uses for git-anchored plans, but keyed to a timestamp rather than a
git log. A session about to ACT on an open-question or arc sees "verified 11 days ago" and can choose
to re-check before relying on it.
- *Who / how often / tier:* nobody — this is a CLI rendering change, not an agent pass. Zero recurring
  spend.
- *Catches:* nothing on its own — it is advisory and easy to ignore, exactly the failure mode ADR-0252
  named for unbounded advisory lists (though here there is no list to bound, only a per-item render).
  Its value is compositional: it is the rendering half Option 2B needs to be legible, and by itself
  raises the odds an ad hoc look (Option 2A) actually happens at the moment it matters most — when a
  session is about to rely on the claim.
- *Does not catch:* anything nobody reads. Strictly weaker than 2B alone; strictly cheaper.

**Option 2E — Author-time discipline: record the measurement method, not just the number.** Extend the
`question new` (and optionally `arc new`/`arc edit`) authoring convention — a guidance-curator-owned
`pattern`/`guardrail`, not a schema change — to require any LIVE numeric or measured claim to name HOW
it was derived (a query, a command, "self-measured, n=1" vs. "counted via `storytree session-cost`,
n=43") rather than the number alone. This does not by itself catch drift; it makes every other option
here cheaper and more reliable, because the specific 2026-08-09 failure was NOT that a number changed
— it was that a later reader (this session) could not tell from the artifact alone whether the number
was reproducible or a one-off snapshot, and had to reconstruct the measurement from scratch to check
it.
- *Who / how often / tier:* one-time authoring of a `pattern`/`guardrail` artifact
  (`guidance-curator`, opus — this IS a judgment call about what durable guidance should say, per
  ADR-0182's split) plus a standing discipline every future `question new`/`arc new` call is held to.
  No recurring agent spend.
- *Catches:* nothing directly; lowers the cost of every re-verification, whether manual (2A), leased
  (2B), or on-read-triggered (2D).
- *Does not catch:* anything by itself. Pure force-multiplier, and the cheapest option in the set to
  land.

### Composability

None of the above are mutually exclusive. A minimal-cost floor is **1B + 2D + 2E**: extend the
reactive trigger narrowly to open-questions, add a zero-agent-cost read-time age render, and land a
one-time authoring discipline — no new schema TTL, no new bounded drain, close to the cost of what
exists today. A fuller closure of mode 2 adds **2B** on top, at the cost of a bounded lease-driven
drain (sonnet, small population) plus a build-time call on lease length. **2C** is named but is the
option this corpus's own precedent (ADR-0252 D4, ADR-0324 D4) argues against picking without a reason
that distinguishes this case from those two rejections.

## Consequences

**What is genuinely unresolved and left to the owner, not smoothed over here:**
- Whether `arc` truth-maintenance is worth the same reactive-trigger cost as `open-question` (1A vs.
  1B) — this ADR leans on the observation that arcs are visited more often via increment writes and
  open-questions carry the sharper, faster-decaying claims, but that is a judgment call, not a
  measurement; only 2 of 20+ live arcs were audited for staleness in the incident this ADR is grounded
  on (the open-question audit was exhaustive at n=4; no equivalent arc-body audit has been run).
- Whether mode 2 is worth building at all yet (2A) versus building the cheapest floor (2D/2E) versus a
  full lease (2B) — the 50%-of-4 measurement is real but small-N, and this ADR does not claim it
  settles the cost/benefit call the way ADR-0323's ten-session window settled the librarian-pass
  frequency question.
- The lease length for 2B, if chosen — the 3-day observed drift argues against anything near
  agent-memory's 60-day default, but no principled number is derived here.
- Whether 2B's re-verification step needs a `corpus-investigator` spawn (a live re-query) or can stay
  inside the sonnet librarian-curator pass reading cited sources — this is per-question and is exactly
  what 2E's measurement-method discipline would make legible if landed first.

**Good, if any reactive-extension option (1A/1B) is taken:** the same shape that already works for
ADRs — correct-in-place vs. retire/supersede, chosen by intent, sonnet-tier, folded into an existing
triggered pass — closes mode 1 at low marginal cost, with no new agent, no new schedule, and a
precedent-consistent design.

**Good, if any mode-2 option beyond status quo is taken:** the corpus gains its first mechanism for
catching drift that no diff causes — a class of staleness ADR-0324 D4 explicitly declined to build a
remedy for on the ADR tier, now with concrete evidence (not present when D4 was decided) that the
open-question tier specifically needs one.

**Bad / accepted regardless of pick:** every option here (except 2C, argued against) leaves SOME
residual uncaught — 1A/1B never see drift with no trigger-tripping diff; 2B never sees drift within
one lease window; 2D/2A never see drift nobody reads about. This mirrors ADR-0324's own accepted
residual for the ADR case (the pure-`packages/**` diff that silently falsifies an ADR) rather than
inventing a new risk class.

**Neutral.** This ADR decides nothing and closes no arc. Whichever combination the owner picks belongs
in a follow-up ADR that `supersedes` or `amends` this one (per ADR-0139's own edge discipline) once a
choice is made, or in a superseding accepted ADR born via `--decided`. The exploring arc
(`arc-and-open-question-truth-maintenance-arc`) stays open, carrying this ADR's number as its parked
increment's pointer, pending that pick.

## References

- [ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) — the trigger this
  ADR's Axis 1 options would widen; D4's declined-batched-drain reasoning Axis 2 is tested against.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — the correct-in-
  place / supersede-and-replace discipline every Axis 1 option reuses unchanged.
- [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) D5 — the
  escalation-authors-a-question discipline that populates the open-question tier this ADR is about;
  its own body's repeated "corrected in place" annotations are the arc-adjacent precedent for Option
  1A's arc half.
- [ADR-0202](0202-parked-memory-leases-the-graduation-worklist-counts-only-new.md) — the park-lease /
  hash-invalidation / inverted-expiry-question mechanism Option 2B adapts.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — the two-phase
  mechanical-locate/judgment-establish shape, the drain-ceiling pattern, and D4's rejection of an
  unwitnessed scheduled job, which Option 2C is weighed against.
- [ADR-0182](0182-delegatable-library-agents-carry-a-model-tier.md) — the sonnet-workhorse /
  opus-judgment split every cost estimate above applies.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) /
  [ADR-0279](0279-a-corpus-mandated-ceremony-that-only-an-agent-s-discretion-e.md) — why this ADR is
  born `proposed` and the owner-fork-recording style it follows.
- `storytree library artifact librarian-curator --pg` — the full agent artifact read before drafting
  this ADR, confirming the trigger's sweep never mentions `arc`/`open-question`.
- `arc:arc-and-open-question-truth-maintenance-arc` — the exploring arc this ADR was produced under.
- The 2026-08-09 corpus-investigator freshness fan-out over the 4 live open-questions (this session) —
  the measured 2-of-4 drift this ADR is grounded on.
