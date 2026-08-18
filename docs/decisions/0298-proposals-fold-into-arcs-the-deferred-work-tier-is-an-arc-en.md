---
status: accepted
decided: 2026-08-03
arc: proposals-fold-into-arcs-arc
supersedes: [287]
amends: [168, 183]
---
# ADR-0298: Proposals fold into arcs: the deferred-work tier is an arc entry, not a kind

## Status

accepted (2026-08-03) — decided and directed by the owner in conversation on 2026-08-03: *"i think
proposals dont really earn a separate concept, it makes more sense to me to just expand arcs to have a
proposal shape, this should push sessions to setup arcs rather then create a separate concept"*, then
*"yes retire the proposal kind entirely"*. Design-time alignment IS the ratification (ADR-0110); no
second end-of-flow ask.

This is a SUPERSEDE, not an ADR-0139 in-place correction. ADR-0287's `tool` route decided *the route
emits a `proposal`, and the proposal TIER carries the delivery signal*. The kind it names is being
retired, so the decision changed — that is ADR-0139's supersede-and-replace fork, and ADR-0287 is
flipped to `superseded` and kept as a browsable file.

The `amends` edges are carried FORWARD rather than dropped. ADR-0287 amended ADR-0168 D5's `tool`
routing-table row; this ADR still amends that row (to a different destination), so the edge must
survive its amender's supersession or ADR-0168 silently reverts to naming `story-author`. The second
edge is new: D5 below narrows ADR-0183 D4's implementation-surface ban.

**Amended by ADR-0311 (2026-08-05):** the arc entry shape, `frictionRefs` edge and realization
discharge remain current. The recurrence diagnostic remains available, but
`check:arc-proposal-drain` no longer runs as a root/CI merge obligation.

## Context

**Two tiers were answering the same question.** ADR-0168 D2 named `proposal` part of the Library's
lifecycle tier and ADR-0287 D1 instantiated it, so a friction item routed to `tool` emitted a
free-floating `proposal` artifact. Separately, ADR-0183 D1 chartered `arc`: the initiative overlay, a
named multi-story intent tracked to a closed end-state. A proposal is change-sized; an arc is
initiative-sized. But both answer *what has been decided and is not yet built*, and nothing in the
schema, the CLI, or the process said which one a session should reach for.

In practice sessions reached for the cheaper one. A `proposal` needed no owner, no end-state and no
narrative — `storytree proposal new` and the obligation was discharged — so the remedy arrived
detached from any initiative that would carry it. The arc it belonged to either did not exist or was
never consulted.

**Measured on the live store, 2026-08-03** (`storytree library artifact list proposal --pg`, and the
per-artifact bodies read in full):

| | |
|---|---|
| live proposals at the opening measurement | **8** (11 by the time the migration ran — three more arrived from sibling sessions the same day) |
| proposals reachable from any arc | **0** |
| proposals whose work plainly belongs to an existing or obviously-chartered arc | **all of them** |
| proposals in the seed | **not 0 — see the correction below** |
| arcs live | 35 |
| arcs chartered to drain the proposal tier | 1 (`proposal-tier-drain-arc`) |

**CORRECTED IN PLACE 2026-08-04 (ADR-0139), and the correction has a live consequence.** The seed row
above originally read `0 (they are seed-scope, and every realized one was deleted from the seed by the
PR that built it)`. That was wrong when written, and it is worth being exact about how, because the
error is what the residue below rests on. The parenthetical is sound only for REALIZED proposals; it
never accounted for the live, UNREALIZED ones, which were seed-scope too and therefore exported like
any other seed-scope kind. Measured on this branch from git rather than re-reasoned: the seed carried
**18** proposals at `3d9d5dbc` (2026-08-03 18:41), **8** at `0d833027` (21:36) and **11** at
`21e080e5` (22:28 — a commit whose subject is literally *"export the 3 proposals the adjudication
emitted"*). It was never observed at 0 on the day it was recorded as 0, and the table's own
neighbouring row — 8 live, rising to 11 — is what it should have agreed with.

THE DECISION IS UNCHANGED and nothing in D1–D7 is reopened: the `proposal` kind is retired, deferred
work is an arc entry, and the owner ratified that. What the wrong number did was remove the reason to
clean the seed, so the retirement landed on ONE side only. As of 2026-08-04 the live tier is gone —
`storytree library artifact list proposal --pg` answers *unknown category "proposal"* — while
`apps/studio/data/knowledge.json` still holds **10** rows of the retired kind, and the OFFLINE read
surface still serves them: `storytree library` (no `--pg`, the in-memory seed every DB-free read and
all of CI use) lists `proposal (10)` as a live category. So the tier reads retired live and alive
offline. The residue is inert rather than dangerous — all 10 are orphaned, with no `asset:` citation
to any of them from any non-proposal seed doc (checked across all 218 seed docs this pass), and
`check:corpus-sync` already excludes them (it reports 196 seed non-agent artifacts against 206 in the
file, the difference being exactly these 10) — which is also why no gate has ever complained. Removing
them from the seed is the unlanded half of D7 and is deliberately NOT done here: it is a 10-row
migration of the highest-contention file in the repo, unrelated to the increment this pass was
serving, and it is exactly the read-then-delete window `a-tier-retiring-migration-cannot-see-rows-that-arrive-mid-flight`
was filed about. It wants its own unit on `cli-write-fidelity-arc`, whose
`sync-corpus-skips-a-live-deletion` entry already sits on the same seam.

Every one is real, adjudicated, ready-to-build engineering work with a declared blast radius — and
every one is a lane of an initiative that already exists or should. Four are proof-and-gate integrity
(`verification-integrity-arc`). One is the claim ceremony's identity derivation
(`session-isolation-arc`). Four are one coherent class nobody had chartered — a CLI write that reports
success while storing something other than what the caller authored. One pair is the `tool` route's
own missing reverse gear. The full placement, with reasoning, is D7.

**The tell is `proposal-tier-drain-arc`.** An arc was chartered on 2026-08-03 for no purpose other
than draining the proposal tier, with a hand-authored seven-lane map in its `intent` doing the work an
arc's own structure should have done. A tier that needs an arc to drain it is a tier that wanted to be
arc entries. The same session that drained it filed four of the remaining proposals *about the
draining ceremony itself* — a tier generating maintenance friction against its own lifecycle.

**What must not be lost.** ADR-0287 D3 is the reason the `tool` route stopped being fail-open on
delivery, and its rationale is untouched by any of the above:

> An open proposal goes RED when its source friction gains a reinforcement dated after the proposal
> was created — i.e. when the trap demonstrably bit someone again.

Metered in real cost rather than as a count (`asset:meter-fail-closed-caps-in-real-cost`), because a
count ceiling fights a parked item's whole purpose and forces premature builds, and a WARN-only
worklist is refuted by ADR-0168's own evidence (the graduation queue "grew 31→58 in one session and
drained nothing"). Critically, **it has no tunable number to raise**, so the only discharges are the
real ones. Retiring the KIND must not retire that GUARANTEE — which is the load-bearing question this
ADR has to answer, and D3 below answers it.

## Decision

**The `proposal` kind is retired entirely. Deferred, decided-but-unbuilt work becomes a dated entry ON
the arc that owns it, and the `tool` route emits one of those instead.**

### D1 — the kind is retired; the arc gains a proposal shape

`proposal` is removed from `KnowledgeKind`, `KIND_SPECS`, `SEED_SCOPE_KINDS`, `lifecycleOf`, the
template scaffolds, the CLI area list, and the studio's kind list. The `storytree proposal` area and
its verbs are deleted.

In its place `Arc` gains a schema-level `proposals` array — the same move `increments` already makes
(structured metadata that never round-trips through markdown), and it carries the proposal body
verbatim rather than a thinned summary: `summary` and `motivation` required, `change` / `scope` /
`migration` / `readiness` / `risks` optional, exactly the fields the retired `KIND_SPECS` entry
declared. Nothing an existing proposal carries has anywhere it cannot go.

Each entry additionally carries what makes it an *arc* entry rather than a free artifact:

- `id` — a slug unique within the arc, so the entry is addressable.
- `parked` — the ISO timestamp it was parked. **This is D3's comparison point**, and it is per-entry
  rather than per-arc precisely because an arc long outlives any one parked item.
- `frictionRefs` — the source friction ids. See D3.
- `realized` — `{ date, pr?, note? }`, absent while parked. Set when the work lands.

(**Amended 2026-08-04 — [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md)
D1/D2/D6:** the `proposals` ARRAY is removed. Parked work is an **increment in `proposal` status** —
the same artifact that later goes `ready`, `active` and `closed` — rather than a second array beside
`increments`. The decision this clause records is unchanged in substance: parked work still lives on
an arc, never as a free artifact, and an adjudicator must still find or charter an arc before it can
park anything. What moves is the container. `parked` and `frictionRefs` move onto the increment
verbatim, so D3's delivery measurement is unaffected; `realized` is replaced by the increment's own
`outcome`, which is the same `{date, pr?, note?}` shape. The structural guarantee in D4 — that
unbuilt work can never sit in the landing log — becomes a status filter rather than two arrays, a
weakening ADR-0305 D7 accepts and states as an obligation on every arc surface.)

### D2 — what the `tool` route emits now

Routing a friction item to `tool` requires an ARC ENTRY capturing the remedy, and the friction item
cites the owning arc in `references` (`asset:<arc-id>`). Symmetry with the five Library routes is
preserved — the route still names the artifact its executor writes — and ADR-0168 D2's routed
lifecycle ("route set, output cited in `references`") still holds for all eight routes. The route ENUM
is unchanged: `tool` stays `tool`, no ninth route is added, and the ~125 existing rows keep their
value.

The ADJUDICATOR still holds the pen, for the reason ADR-0287 D2 recorded as FORCED rather than chosen:
`asset:story-author` is fail-closed fenced to `stories/**` with no Library artifact write and no
`--pg`, so it cannot write an arc entry any more than it could write a proposal. No fence is widened.
What changes is that the adjudicator must now FIND OR CHARTER AN ARC before it can park anything —
which is the behaviour the owner asked for, enforced by the verb rather than by discipline.

**Two edges, doing two different jobs, and this is deliberate rather than redundant.** The friction →
arc citation satisfies ADR-0168 D2's routed lifecycle and gives a friction row its outbound pointer.
The entry → friction `frictionRefs` is what D3's join needs: an arc may carry many parked entries, so
a citation that names only the arc cannot say WHICH entry a recurrence presses on. ADR-0287 D1 put no
reverse pointer on the proposal because a proposal was 1:1 with its friction; an arc entry is not.

### D3 — the delivery signal survives; only the object it counts moves

ADR-0287 D3's recurrence predicate is preserved, with `proposal` reading `arc entry`:

> An open arc entry is reported when a friction item it names gains a reinforcement dated after the
> entry was parked.

Every property that made it worth having is retained, and each is retained for its original reason:

- **Recurrence-driven, not a count.** A parked entry is parked BY DESIGN; a count ceiling would force
  premature builds.
- **No tunable number.** There is still no integer to edit, so ADR-0269's "when may a ceiling rise"
  question still cannot arise here.
- **Day-granular and strictly `>`.** Same-day is a WARN, so a session can never red itself on its own
  emission.
- **Pure — no clock, no session identity.** The verdict is a function of two stored dates.
- **Diagnostic on the queue, fail-open on the substrate.** SKIP offline / no creds / DB unreachable;
  ADR-0311 retires the local gate wiring.
- **The same accepted risk.** An entry whose trap nobody happens to re-hit stays quiet. Failing in the
  quiet direction remains the deliberate trade.

`check:proposal-drain` was replaced by `check:arc-proposal-drain`; ADR-0311 later removes that
replacement from gate policy. The join
runs entry → friction (via `frictionRefs`) rather than friction → proposal (via `references`), because
D2 moved where the unambiguous edge lives; the comparison itself is unchanged.

**The discharge gains a second, honest form.** ADR-0287's only discharge was `friction
--discharged-by`, a manual stamp its own Context measured as expensive and known-skipped ("4.8 % is a
FLOOR"). An arc entry has a better one available for free: `realized` is set when the work lands, in
the same closing leg that already appends the arc's increment (ADR-0271). A realized entry stops
pressing. The `dischargedBy` path is kept — it is the only discharge available for a friction item
whose remedy landed without an entry — but it is no longer the only one, which is the first structural
improvement to that 4.8 % rather than a restatement of it.

### D4 — parked work is NOT an increment, and `increments` is unchanged

`Arc.increments` stays exactly what ADR-0183 D1 made it: the append-AT-LANDING log of what actually
happened, the arc's durable residue. It must never hold unbuilt work — an increment log that lists
intentions stops being evidence of anything.

So `proposals` is a SECOND array with the opposite lifecycle: appended at PARKING, mutated once
(`realized`), and prunable thereafter. The two are complementary, and the transition between them is
the point: **a parked entry that gets built becomes an increment.** At landing, the closing leg
appends the increment (already required by ADR-0271) and marks the entry realized. That the arc holds
both halves is what makes a deferred intention traceable to the landing that discharged it — which no
proposal ever was, since a realized proposal was DELETED and its only residue was a retirement reason.

### D5 — ADR-0183 D4's surface ban is narrowed to the arc's own narrative

ADR-0183 D4 reads: *"Implementation surface may only be written into anchored, disposable artifacts. A
file list in a durable doc (ADR body, story, principle, arc) is a staleness bug; a file list in a plan
dies with the plan."* A parked entry carries `scope`, which is a blast radius with file paths in it.
That is a real tension and it is resolved by narrowing D4 rather than ignoring it.

Read D4's rule against its own test rather than against the word "arc" in its parenthetical. What it
permits is *anchored and disposable*; what it forbids is surface in something durable and undated. A
parked entry passes both halves of D4's own test. It is ANCHORED — `parked` is required, and it is
load-bearing for D3, so it can never be omitted or go stale unnoticed. It is DISPOSABLE — marked
realized and prunable the moment the work lands, exactly as "a file list in a plan dies with the
plan". The arc's `intent` and `endState` fail both halves, which is what D4's parenthetical was
reaching for.

So the ban is narrowed to what its rationale actually reaches: **the arc's own narrative fields.**
`intent` and `endState` still carry no file lists — and `proposals` existing is the thing that makes
that enforceable rather than aspirational, since a session with surface to record now has a legitimate
place to put it instead of smuggling it into the intent. (`proposal-tier-drain-arc`'s hand-authored
seven-lane file map, sitting in its `intent` today, is what happens when it does not.)

### D6 — the adjudicator folds into an existing arc before chartering a new one

`asset:friction-adjudication` is corrected so the `tool` route reads: find the arc that owns this
remedy and park an entry on it; charter a new arc only when no existing arc owns the work, and say in
`routeReason` which arcs were considered. This is `asset:edit-first-curation` applied to the
initiative tier — the same fold-before-create discipline the corpus already requires for artifacts —
and it is the mechanism behind the owner's "this should push sessions to setup arcs". Charter-anyway
stays first-class and free: the failure being fenced is minting a HOMELESS item, not chartering an
arc.

**Correction (2026-08-17, per [ADR-0377](0377-arc-folding-defaults-to-a-new-arc-folding-requires-surface-o.md)):
"owns" above was never defined, and in practice got satisfied by thematic resemblance — an arc being
describable as the same subject as the defect — rather than by owning the surface a fix actually
edits. Measured cost: one arc (`verification-integrity-arc`) absorbed 20 friction ids across 14
parked entries over 19 days by the thematic reading and never trended toward zero, while ten
arcs chartered under a genuine-ownership reading over the same window all closed honestly. "Owns"
now means owns the surface (the package/panel/write-path a fix edits) — a thematic match alone does
not satisfy it, and D6's shape (fold if owned, charter if not) is unchanged. ADR-0377 additionally
capped every arc at 20 increments, closed included, independent of this fix; that numeric cap was
withdrawn the next day by [ADR-0382](0382-the-20-increment-arc-cap-is-withdrawn-placement-discipline-r.md)
— placement discipline alone is what bounds an arc's size now.

### D7 — every live proposal is rehomed before anything is deleted

Each is placed on the arc that owns it, by reading its `motivation` and `scope`, never by keyword.
**Eleven, not eight**: three more were parked by sibling sessions between this branch cutting and its
migration running, so the set was re-read immediately before the delete rather than taken from the
opening measurement.

| entry | arc |
|---|---|
| `gate-runs-every-step-and-reports-per-step` | `verification-integrity-arc` |
| `render-fixtures-default-to-the-shipped-map` | `verification-integrity-arc` |
| `verification-decay-charges-by-authorship` | `verification-integrity-arc` |
| `committed-derived-evidence-carries-producer` | `verification-integrity-arc` |
| `cli-write-paths-carry-branch-attribution` | `cli-write-fidelity-arc` (chartered here) |
| `at-path-expansion-at-the-flag-boundary` | `cli-write-fidelity-arc` |
| `scaffolder-refuses-an-id-it-would-truncate` | `cli-write-fidelity-arc` |
| `sync-corpus-skips-a-live-deletion` | `cli-write-fidelity-arc` |
| `session-identity-from-any-linked-worktree` | `session-isolation-arc` |
| `discharge-stamp-exempt-from-the-fence` | `proposals-fold-into-arcs-arc` |
| `realizing-an-entry-drops-the-friction-edge` | `proposals-fold-into-arcs-arc` |

**`verification-integrity-arc` takes four** because all four are the class its own charter names — *"a
stale oracle report, a vacuous test, and two drifted copies all look identical to a healthy system
from the outside"*. A gate that hid thirteen later steps behind one abort (fixed 2026-08-04), a render fixture omitting
the inputs the shipped map actually sends, a decay ceiling charging a sibling's red to every session,
and committed derived evidence with no link to what produced it are four instances of that one
sentence, not four strays sharing a keyword.

**Four are ONE class nobody had chartered** — a CLI write path that returns success while the durable
record it wrote differs from what the caller authored (a literal `@path` string stored as a retirement
rationale; an explicit id silently truncated mid-word; a retirement resurrected by a migrate-only
sync; an attribution silently omitted). `cli-write-fidelity-arc` is chartered for that class under D6,
rather than scattering four items onto arcs that do not own them.

**The last two are the `tool` route's own missing reverse gear, and they are TRANSLATED rather than
transplanted.** `a-verb-drops-a-realized-proposals-emission-edge` was written about retiring a
proposal artifact — a premise this ADR removes. Its remedy is re-stated against the new shape as
`realizing-an-entry-drops-the-friction-edge`: the "no verb" half is DELIVERED by D3's `arc proposal
realize`, and what survives is dropping the friction's arc citation at realization plus narrowing
`referencedAssetIds` to real `references[]` edges. Both the rewrite and the original premise are
recorded in the entry, so the translation is visible rather than silent.

**The deletion did not use `artifact retire`, and that is worth recording rather than hiding.** At the
time of this ADR the retire verb hard-refused while any `asset:<id>` token appeared anywhere in another
doc, because `referencedAssetIds` walked EVERY string value — so a prose mention inside a 6 kB
`routeReason` blocked it. The migration therefore re-pointed all 13 friction citations first and deleted
through the store with an explicit reason naming the arc and entry each body moved to. That over-broad
scan was exactly the parked work above; working around it here was not fixing it.

**Correction (2026-08-08, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
the parked work above has LANDED, so the two paragraphs are put in the past tense rather than left
reading as live defects. Nothing decided here is re-decided** — this ADR settled where the remedy is
PARKED, never how the verb behaves, so both halves are a correction in place.

- **The over-broad scan is closed.** `referencedAssetIds` is anchored (`/^asset:([A-Za-z0-9_-]+)$/`
  against the trimmed value), so it counts a string only when the WHOLE value IS a ref. It still walks
  every string value, which is the half worth keeping: that is what covers `references[]`, an agent's
  refList fields and `stepRefs[].refs`, a process's `branchEdges[].ref`, and the single `arcRef` on an
  increment or open question, with no per-kind list to maintain. So read the delivered narrowing as
  *whole-value refs anywhere in the body*, not as the narrower "real `references[]` edges" this ADR
  predicted at line 286 — retire remains strictly wider than `tree focus`'s `references[]`-only inbound
  view. What it gives up on purpose: an artifact can now be retired while another artifact's PROSE
  mentions it. A name in a paragraph resolves nothing and breaks no render, whereas a declared ref that
  dangles is a broken pull.
- **The `tool` route's reverse gear exists.** `storytree arc increment close` drops the
  `asset:<arc-id>` citation from each friction the closing entry names, in the same verb — and only
  when no other OPEN increment on that arc still names that friction, so a citation another parked lane
  holds up is KEPT and its holder named. The trace is not lost: the closed increment keeps its own
  `frictionRefs`, and a closed increment is permanent (ADR-0305 D3), so the edge survives in the
  direction that carries the delivery signal.

Recorded because a reader of these paragraphs alone would conclude the scan is still over-broad and the
`tool` route still has no reverse gear, and would either re-open landed work or route around a fence
that no longer refuses — the exact stale-prose harm ADR-0139 exists to prevent. The modules' own headers
are the authority on the delivered shape and are not restated here (`asset:reference-dont-restate`):
`packages/cli/src/retire.ts` and `dropDischargedCitations` in `packages/arc/src/arc.ts` (moved out of
`packages/cli` by ADR-0369; `retire.ts` was not part of that move and stays in `cli`).

`proposal-tier-drain-arc` is CLOSED by this ADR. Its end state — "the proposal tier holds no
undelivered adjudicated remedy" — is reached, though not the way it planned: the tier is gone and its
remedies sit on the arcs that own them. Its lane map and ranking survive as its own increment log.

## Consequences

- **A session with a deferred remedy must now find or charter an arc.** That is the intended cost and
  the owner's stated purpose. It is strictly more work than `proposal new` was, and it is the work
  that was being skipped.
- **The delivery signal keeps its teeth and gains a cheaper discharge.** D3 preserves the ceiling
  exactly; `realized` gives it a discharge that rides a step the closing leg already performs, instead
  of depending only on a manual stamp measured at 4.8 %.
- **Deferred work stops being seed traffic.** `proposal` was seed-scope, so parking one added a
  `check:corpus-content` export ceremony and a `knowledge.json` diff — and `sync-corpus`'s
  migrate-only semantics then resurrected retired ones from a stale seed (measured twice on
  2026-08-03, 16 resurrections in one session). `arc` is NOT seed-scope, so an arc entry never enters
  the seed and that whole failure surface closes for this class of work. The underlying `sync-corpus`
  defect is unaffected and stays parked as an entry on `cli-write-fidelity-arc`.
- **A realized entry leaves a trace where a realized proposal left none.** Retiring a proposal was a
  delete; the entry is marked and kept next to the increment that discharged it.
- **Arcs get bigger, and one of them will eventually get too big.** An arc carrying twenty parked
  entries is a worklist wearing an initiative's clothes — the same criticism this ADR makes of the
  proposal tier. No ceiling is imposed on entry count, deliberately, for D3's own reason (a count
  ceiling forces premature builds). The tripwire is qualitative and is stated here so a later session
  can name it: if an arc's parked list stops being readable as one initiative, the remedy is to SPLIT
  THE ARC, not to re-charter a flat tier.
- **The live rows are migrated by hand, once.** There is no automated migration path and none is
  built for eleven rows; the exact placements are D7's table, and the deletion happens only after the
  entries exist. The set was RE-READ immediately before the delete rather than trusted from the
  opening measurement, which is how the three sibling-parked arrivals were caught — on a repo taking
  ~100 commits a day, a migration that trusts its own opening count silently drops whatever landed
  while it was being written.
- Risk accepted: rehoming is a judgement, and a wrong placement buries a real remedy on an arc nobody
  reads. Mitigated by recording the reasoning per item rather than the placement alone, and by the
  fact that the recurrence signal (D3) follows the entry to whichever arc it lands on.

## References

- Supersedes [ADR-0287](0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md) (the
  `tool` route emits a proposal; the proposal tier carries the delivery signal). D3 above preserves
  its ceiling verbatim; D1/D2 replace the object it counts.
- Amends [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) — D2's
  lifecycle tier loses one of its three kinds, and D5's `tool` routing-table row now names an arc
  entry (the edge ADR-0287 held, carried forward).
- Amends [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — D1's arc gains a second schema-level array; D4's
  implementation-surface ban is narrowed to the arc's narrative fields (D5 above).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (owner-directed ratification),
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) (supersede vs
  correct-in-place — this is the supersede fork), [ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) (the
  universal lifecycle projection), [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) (the arc's stored
  closure flag), [ADR-0271](0271-sessions-end-at-merge-land-debrief-go-inert-work-re-enters-t.md) (the closing leg that appends the
  increment and now marks the entry realized), [ADR-0269](0269-a-drain-ceiling-rises-only-when-the-measured-population-enla.md) (why
  "no tunable number" matters), [ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md) +  `asset:meter-fail-closed-caps-in-real-cost`.
- Library: `asset:friction-adjudication` (corrected by D6), `asset:graduation-synthesist` (the seat
  that parks the entry), `asset:story-author` (the `stories/**` fence that still forces D2),
  `asset:edit-first-curation` (the fold-before-create discipline D6 extends to arcs), `asset:arc`.
- Code: `packages/library/src/knowledge.ts` (`ArcProposal`, `Arc.proposals`, and the removed
  `proposal` kind / `KIND_SPECS` entry / `SEED_SCOPE_KINDS` membership),
  `packages/library/src/lifecycle.ts`, `packages/library/src/templates.ts`,
  `packages/arc/src/arc.ts` (the `arc proposal add|realize` verbs; moved out of `packages/cli` by
  ADR-0369),
  `packages/cli/src/friction.ts` (`routeFriction`'s rewired `tool` fence),
  `packages/cli/src/arc-proposal-drain.ts` + `check-arc-proposal-drain.ts` (D3's ceiling), and the
  deleted `proposal.ts` / `proposal-drain.ts` / `proposal-citation.ts` / `check-proposal-drain.ts`.
- Evidence (measured 2026-08-03 on branch `claude/blissful-mclean-29a3c3`): `storytree library
  artifact list proposal --pg` → 8 at the opening measurement and 11 at the migration; every body
  read in full; `storytree library artifact list arc --pg` → 35; zero arc→proposal edges in any arc
  doc; `proposal-tier-drain-arc`'s `intent` carrying a hand-authored seven-lane map; the 13 friction
  citations re-pointed, and `list proposal --pg` → 0 after the delete.
