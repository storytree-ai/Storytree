---
status: accepted
decided: 2026-08-02
amends: [168]
---
# ADR-0287: The tool route emits a proposal, and the proposal tier carries the delivery signal

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Recorded so a curator can check rather than take it: ADR-0168 D5 requires a *friction-born* ADR to be
born `proposed`, because "batch adjudication is never owner-directed in this conversation". That clause
fences the ADJUDICATOR from self-ratifying during a drain. It does not apply here: the adjudication
finished, the owner read the finding, chose the mechanism ("promoted into a proposal in the library"),
and picked both open forks (the pressure model and the backfill scope) in conversation. That is the
ADR-0110 case, so this is born `accepted`.

## Context

The friction loop (ADR-0168) captures signal well and delivers it unevenly, and the unevenness is
entirely on one route.

**Measured 2026-08-02** over the whole 227-item worklist (`storytree friction list --pg`, discharge
counted from the `dischargedBy` ✓ stamp):

| route | routed | discharged | rate |
|---|---|---|---|
| `tool` | 125 | 6 | **4.8 %** |
| `edit-existing` | 24 | 21 | 87.5 % |
| `guardrail` | 16 | 16 | 100 % |
| `principle` | 12 | 11 | 91.7 % |
| `process` | 2 | 2 | 100 % |
| `adr` | 8 | 1 | 12.5 % |
| `nothing` | 38 | — | archived by design |

The five Library routes deliver 50 of 54 (92.6 %). `tool` delivers 6 of 125 — and `tool` is **125 of
the 225 routed items, so 56 % of all captured signal flows into the one route with no delivery
mechanism.** (The ✓ is a MANUAL stamp and applying it is expensive — `--discharged-by` forces
`--reason` and overwrites the whole adjudication, itself an archived-and-unbuilt friction item
`stamping-a-delivered-remedy-overwrites-the-adjudication` — so 4.8 % is a FLOOR, not a precise rate.
It is not the load-bearing number; the structural finding below is.)

**The structural cause.** Every Library route names the artifact KIND its executor writes: `principle`
→ a principle, `process` → a process, `definition` → a definition. `tool` names no kind. It names a
destination (`story-author`) and stops. So:

- The item ARCHIVES the moment it is routed. `check:friction-drain` counts `open` items only, so
  routing to `tool` *satisfies* the only fail-closed gate in the loop while building nothing.
- Nothing downstream picks it up. Verified: `grep -rn '"tool"' packages/cli/src/check-*.ts` returns
  ZERO matches — no gate check anywhere reads `route == 'tool'`.

The loop is therefore **fail-closed on adjudication and fail-open on delivery.** Adjudication is a step
someone is forced to do; delivery is a step nobody is.

**ADR-0168 D2 already decided the missing half, and it was never built.** D2 states that "`friction`
joins `open-question` and `proposal` as the Library's **lifecycle tier** — transient-by-design kinds,
**each with a mandatory drain**", and defines the routed lifecycle as "route set, **output cited in
`references`**". So the design already expects a routed item to emit an artifact and cite it. Measured
2026-08-02: the `proposal` kind exists in `KIND_SPECS` (`packages/library/src/knowledge.ts`) and is
seed-scope, but there are **zero proposals live and zero in the seed** — `storytree library artifact
list proposal` reports `unknown category`, because `listCategory` derives its category list from kinds
that actually have instances. There is no `check:proposal-drain`. The tier is dead, and the "mandatory
drain" D2 promised was never instantiated.

The `proposal` kind's own KIND_SPECS comment describes precisely what a `tool`-routed item is: "the
INTENT of a change worth doing later … parked in the library now and kicked off when ready … it is NOT
a question: **the decision is made, only the EXECUTION is deferred.**"

**The worked example that surfaced this.** The export/corpus-gate surface accumulated five `tool`-routed
items across four board passes (2026-07-28 → 07-30), three of which independently instructed "build the
three as ONE capability unit". None was built; `grep -rln "export-corpus\|corpus-content" stories/`
returns ZERO files, so no story, capability or contract for that surface was ever authored. On
2026-08-01 the same surface produced **three more filings from three different branches in one day**,
all tombstoned on 2026-08-02 as duplicates of the unbuilt remedy. Adjudication worked flawlessly for
five days and produced nothing; the friction simply kept recurring against a remedy nobody owned.

## Decision

**The `tool` route stops being the exception: it emits a `proposal` artifact and cites it, exactly as
every other route emits its artifact — and the proposal tier carries the fail-closed delivery signal
ADR-0168 D2 already promised it would.**

### D1 — `tool` emits a proposal, cited in `references`

Routing a friction item to `tool` requires a `proposal` artifact capturing the remedy, and the friction
item cites it in `references`. This makes `tool` symmetric with the five Library routes and satisfies
ADR-0168 D2's routed lifecycle ("route set, output cited in `references`") for the one route that
never could. The route ENUM is unchanged — `tool` stays `tool`; no ninth route is added, and the 125
existing rows keep their value.

The proposal's fields already carry what the executing session needs (the before→after change, blast
radius, ordered steps, readiness preconditions), so the adjudicator's `routeReason` SCOPE paragraph —
which today is prose buried in an archived row — becomes the proposal body. Nothing new is written;
existing content moves to a surface that is listable, countable, seed-scope, and visible in the studio.

### D2 — the ADJUDICATOR writes it, not story-author

Forced by an existing fence rather than chosen: `story-author` is fail-closed scoped to `stories/**`
with "no Library artifact write, no DB/`--pg`" and "Never use a Library artifact command for a work
unit". It CANNOT write a Library proposal. The `graduation-synthesist` writes it at routing time —
where the scope is already being written anyway — and `story-author` then CONSUMES the proposal (a
read) when it authors the story. No fence is widened.

### D3 — the drain is RECURRENCE-DRIVEN (owner call)

A proposal is deliberately parked until ready, so a count ceiling would fight the kind's own purpose
and force premature builds. A WARN-only worklist is refuted by ADR-0168's own cited evidence (the
graduation queue "grew 31→58 in one session and drained nothing"). So the pressure is metered in real
cost (`asset:meter-fail-closed-caps-in-real-cost`, the ADR-0130 turn-cap precedent):

**An open proposal goes RED when its source friction gains a reinforcement dated after the proposal was
created** — i.e. when the trap demonstrably bit someone again. A parked proposal nobody is hitting stays
quiet indefinitely; one that keeps costing sessions escalates on its own. Ceiling and reachability
policy follow the `check:friction-drain` shape exactly: fail-closed on the queue, fail-open on the
substrate (SKIP offline / no creds / unreadable), local gate only, never CI.

The comparison is PROSPECTIVE from a proposal's `createdAt`: a reinforcement dated before it is the
historical pressure that justified parking the proposal, and stays quiet. Had a proposal for the
corpus-gate cluster already existed on 2026-08-01, its three recurrences that day would have redded
it — that is the sensitivity this rule is tuned for.

**Correction (2026-08-03, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
the gloss here originally read "Applied to today's state, the corpus-gate cluster would already be RED:
it recurred three times on 2026-08-01 alone", which contradicted two explicit clauses of this ADR and
predicted the wrong outcome for D4.** Nothing is re-decided: the rule in bold above is unchanged, and
D4's text is untouched. D4 backfills proposals for items *selected because they already carry
reinforcements*, and justifies staying targeted on the ground that a full backfill "would front-load a
large adjudication pass and immediately breach any ceiling"; D3's own rationale is that a ceiling must
not "force premature builds". Both clauses require the comparison to run forward from the proposal's
creation — otherwise every one of D4's ~10–20 backfilled proposals would red on arrival, the exact
outcome D4 designs against. That is what the built check does (`if (day < createdDay) continue;` in
`evaluateProposalDrain`, `packages/cli/src/proposal-drain.ts`), so a D4-backfilled proposal starts
QUIET on the very recurrences that selected it and reds on the NEXT hit. Recorded because the session
that builds D4 would otherwise read the old sentence, see quiet proposals on arrival, and conclude the
check was broken. Curator correction made during the librarian pass on the PR that built D3, and
flagged to the owner in that PR's debrief so it can be overruled.

**Confirmed empirically when D4 was built (2026-08-03).** With the eleven backfilled proposals in the
tier, `check:proposal-drain` reported `WARN — 16 open · 0 uncited · 0 delivered · 16 total` and named
no recurrence: every backfilled proposal was quiet on the reinforcements that selected it, exactly as
this correction predicts and as the retired gloss did not. The two same-day WARNs it did print are the
day-granularity rule working — one of them on a proposal whose source friction was reinforced by the
very session that parked it, which is the case D3's strict `>` exists to keep out of the red.

### D4 — targeted backfill (owner call)

Backfill proposals only for `tool` items that are demonstrably still live: the five-item corpus-gate
cluster, plus any `tool`-routed item carrying reinforcements. Bounded (~10–20). The remaining ~100 stay
as they are — many are stale, duplicative or already obsolete, and a full backfill would front-load a
large adjudication pass and immediately breach any ceiling. Not-backfilled items are not lost: recurrence
re-opens them through the normal reinforce path, and the next adjudication of a recurrence emits a
proposal under D1.

**Annotation (2026-08-03, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
four of the five named corpus-gate items were DELIVERED by
[ADR-0290](0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md) (PR #1090, merged
2026-08-02T16:02Z) between this ADR being written and D4 being built, so the list above no longer
describes a live backlog.** Nothing is re-decided: the backfill stays targeted, and the governing
qualifier is still "demonstrably still live" — which is precisely what selected against them. Measured
while building D4: `live-to-seed-drain-is-all-or-nothing-so-its-ceiling-cannot-reach-zero` is delivered
by ADR-0290 D6 (`export-corpus --id`, the per-artifact drain its `routeReason` asked for);
`corpus-content-v-count-understates-what-the-export-sweeps` by D4 (the live-only population is printed
on every path); `corpus-content-gate-red-on-sibling-mid-stream-live-edit` by D1/D2/D3 (ANOTHER WRITER is
never charged); and `a-drain-ceiling-a-sibling-breached-reds-a-session-that-touched-nothing-it-guards`
on its corpus-CONTENT half by D3 (BEHIND MAIN, with `git merge origin/main` as the remedy instead of the
export).

What survives is the corpus-**SYNC** half: `grep -c "origin/main\|merge-base\|library_event"` returns
15 / 11 / 4 across `check-corpus-content.ts`, `corpus-content-attribution.ts` and
`corpus-content-drain.ts`, and ZERO in both `check-corpus-sync.ts` and `sync-drain.ts`. So two of the
five remain live, share one proposal, and none of the delivered four was parked — parking a landed
remedy is the inverse of the signal D3 meters. Recorded because the list reads as a worklist: a later
session would otherwise mint four proposals for work already on `main`. Built in increment 3 of
`friction-delivery-signal-arc`, which parked 11 proposals across 14 still-live `tool` items.

## Consequences

- The `tool` route gains the delivery signal it never had, and the proposal tier stops being dead. A
  routed remedy becomes a countable Library artifact instead of prose inside an archived row.
- **Routing stops discharging the obligation.** Today `route: tool` clears `check:friction-drain` and
  ends the matter; after D1 it opens a proposal that persists until built. This is the intended cost:
  the loop gets a second queue, deliberately, because the first one was measuring the wrong step.
- The corpus-gate backlog becomes visible immediately under D4 and RED under D3 — which is the point.
  Draining it is separate work and is NOT authorised by this ADR.
- Proposals are seed-scope, so they land in the committed `knowledge.json` and are reviewable in PRs —
  and they will therefore show up in the `check:corpus-content` export ceremony. This adds a small
  amount of traffic to the very surface the worked example complains about; that is accepted, and it is
  an argument for building the corpus-gate unit sooner rather than a reason to hold D1.
- The 4.8 % delivery figure will not become directly comparable after this lands, because the signal
  moves from a manual `dischargedBy` stamp to a live proposal count. That is an improvement (the stamp
  is known-expensive and known-skipped) but it does break the series; the pre-change numbers are
  recorded in Context above so the baseline survives.
- Risk accepted: a recurrence-driven ceiling is silent on a genuinely costly trap that nobody happens
  to re-hit. That is the deliberate trade against forcing premature builds, and it fails in the
  quiet direction rather than the noisy one.

## References

- Amends ADR-0168 (the friction loop): D2's lifecycle tier + "output cited in `references`", and D5's
  `tool` → story-author routing-table entry, which D2 above narrows (the adjudicator writes the
  proposal first; story-author consumes it). The clause is annotated in place per ADR-0139.
- ADR-0110 (owner-directed ratification), ADR-0139 (correct in place), ADR-0196 (the open/archived
  lifecycle), ADR-0130 + `asset:meter-fail-closed-caps-in-real-cost` (metering a fail-closed cap in
  real cost), ADR-0252 D3 (the drain-ceiling pattern), ADR-0095 (graduation), ADR-0158 (agent-side
  capability discipline).
- Library: `asset:friction-adjudication` (the 7-question gate + route→executor table, which D2 above
  changes for `tool`), `asset:friction-justification-bar`, `asset:story-author` (the `stories/**`
  fence that forces D2), `asset:graduation-synthesist`.
- Code: `packages/library/src/knowledge.ts` (`FrictionRoute`, the `proposal` KIND_SPECS entry,
  `SEED_SCOPE_KINDS`), `packages/cli/src/check-friction-drain.ts` (the shape D3 mirrors),
  `packages/cli/src/friction.ts` (`routeFriction`), `packages/cli/src/commands.ts` (`listCategory`,
  whose instance-derived category list is why `proposal` is currently unlistable).
- Evidence (all measured 2026-08-02 on branch `claude/zen-chandrasekhar-e197f7`): the route/discharge
  table above; `grep -rn '"tool"' packages/cli/src/check-*.ts` → 0 matches;
  `grep -rln "export-corpus\|corpus-content" stories/` → 0 files; `storytree library artifact list
  proposal` → `unknown category`; the corpus-gate cluster adjudications of 2026-07-28 → 08-02.
