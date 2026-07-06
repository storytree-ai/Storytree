---
status: accepted
decided: 2026-07-06
amends: [32, 95]
load_bearing: true
---
# ADR-0168: Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop

## Status

**accepted** (2026-07-06) — the design was authored `proposed` by the owner-chipped deep-think +
research session (`task_cfcc5788`; landed PR #632) and the owner **directed the open forks in
conversation the same day**, reviewing the proposal (ADR-0110: design-time alignment IS the
ratification; ADR-0084: the green flip). The owner's direction, recorded verbatim in substance:

1. **Friction belongs in the Library as an artifact** (fork F1 → the new `friction` kind, not the
   proposed disk shelf): *"our system should work like an organisation so employees have a way to
   voice their challenges so they can get looked at from the top end of our system which has the
   full picture of how everything works."*
2. **The owner is OUT of the default loop**: *"I shouldn't need to be included in this loop unless a
   dedicated subagent says so"* — adjudication and escalation judgment belong to a dedicated
   subagent with the whole-system view; the owner appears only on that subagent's escalation. This
   **un-parks the `graduation-synthesist`** (previously an owner-deferred build).
3. **Calibrate to the current workhorses** (Opus 4.8 / Sonnet 5, and frontier peers): *"GPT-3.5 is
   not a good benchmark"* — mechanical scaffolding is retained ONLY where frontier-era evidence
   (2025–26), not 2023 weak-model caution, shows judgment still fails (see "Calibration" below).

Fork F2 (the fail-closed drain ceiling) was recommended in the proposal and stood unobjected; with
the owner out of the default loop it never pulls the owner in (a ceiling breach spawns an agent-side
drain session), so it stands as decided. The prior-art research pass that informs this design is
[`docs/research/session-retro-feedback-loop-prior-art.md`](../research/session-retro-feedback-loop-prior-art.md)
(dated and model-tagged per source, per the owner's charter).

*(History note, ADR-0139 honesty: the `proposed` draft on PR #632 recommended a disk-canonical
`docs/friction/` shelf with the Library kind as an evidence-gated later promotion. The owner chose
the kind directly — the shelf option is superseded by this acceptance and survives only as the
offline-capture fallback in D2. This section is the in-place record of that re-direction; the draft
body was revised in place because a `proposed` ADR is a working draft, not decided history.)*

## Context

### The ask

The owner's north star: **agent effectiveness** — a standing way for every session to feed its
friction back into the Library so the system keeps improving to deliver what agents need. The named
core problem is **anti-slop**: "make sure we don't spam the Library with slop friction." The
organizational frame is load-bearing, not decorative: agents are employees, friction items are how
employees **voice their challenges upward**, and the review sits at the top end of the system where
the full picture lives.

### What already exists (this ADR completes a designed loop; it does not invent one)

- **[ADR-0032](0032-cite-graduation-mechanism.md)** designed the signal → Library loop: a *comment*
  is a signal an artifact needs attention (BUILT — `events.comment`, `PgCommentStore`); a *cite* is a
  typed link forming a signal-graph (**never built** — no `events.cite` exists); *graduation* is a
  synthesis agent reading accumulated signal into the OQ→ADR flow (`graduation-synthesist` — named,
  unbuilt until now; **this ADR un-parks it**). Its §5 deliberately deprioritized anti-*gaming*
  machinery as solving an unobserved problem.
- **[ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md)** added agent-memory
  as a signal source with a working mechanical engine (`graduationCandidates`), the pre-merge
  librarian pass (D7), the able-things-only rule (D5), and the genuine-durability bar (D8).
- **`friction-analyst`** (BUILT, on-demand): per-RUN friction analysis over typed events, emitting an
  anchored signal post. **Per-run, not per-session** — and interactive sessions emit no typed event
  stream, so a session retro is structurally *self-report*.
- **The anti-slop corpus**: `signal-and-noise`, `edit-first-curation`, `reference-dont-restate`,
  `two-consumer-extraction`, `stateless-vs-stateful-graduation`, the ADR-0024 blind-reconstruction
  test.
- **[ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md)/[ADR-0161](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md)**:
  process artifacts make no new policy; enforcement is three-layered (code fences / structural gates /
  librarian judgment).

### The evidence — the observed failure is BLOAT, not forgery

ADR-0032 §5's posture was "defend on evidence." The evidence has arrived, but for **slop** (honest,
low-value volume), not gaming: agent-memory hit 115 files / 71 KB index against a ~24 KB budget
(ADR-0095's own context); `check:graduation-worklist` surfaced **31 mostly-event-specific candidates
on every gate run — grown to 58 within the design session itself** — a WARN that fires constantly
and drains nothing; graduation candidates reached the owner **one at a time with no standing gate**.
Two structural lessons:

1. **A WARN-backed worklist with no drain obligation rots.** The failure is the *drain*, not the
   capture format. Any new friction store inherits this failure unless the drain is load-bearing.
2. **Self-report is where slop enters.** A session retro has no typed event stream to cite, and an
   eager frontier model will manufacture plausible lessons — so the evidence bar must be structural
   at capture, and worth must be verified (not just cited) before anything renders into guidance.

### The prior-art pass (summary; full writeup in docs/research/, 25 claims adversarially verified 3-0)

Across Reflexion, Voyager, Generative Agents, ExpeL (2023, pre-frontier) and Mem0, Memory-R1,
ReasoningBank, ACE, SSGM (2025–26, frontier-era), five verified findings bear directly on this design
(each source dated and model-tagged in the writeup): **(a)** the owner's hypothesis is substantially
confirmed — the 2023 cohort's arithmetic scaffolding (hard caps, decay×importance retrieval, vote
counters) existed because judge models were weak (ExpeL's authors said so verbatim in 2023), and the
2025 field moved to judgment-based curation — the bet ADR-0032 §3/§5 already made; **(b)** two hard
counterpoints bound that shift: letting an LLM *holistically rewrite* a store is destructive (ACE's
"context collapse": 18,282 tokens → 122 in one step, below the no-memory baseline — so ACE keeps a
deterministic non-LLM write path even with frontier models), and judgment-only admission does not
keep a store clean at production scale (a Mem0 audit found 97.8% of 10,134 LLM-gated entries were
junk); **(c)** format is load-bearing — naive failure logging measurably *hurt* (AWM 44.4→42.2)
while distilled lessons capped at **max 3 per trajectory** helped (ReasoningBank, 46.5→49.7): the
cap-3 retro and never-inject-raw-friction choices below are that finding applied; **(d)** what
frontier models do NOT fix and structure must: confabulated lessons atop real evidence, staleness
detection (best 2026 model: 55.2% at noticing invalidated memories), and counter-evidence collection
once a wrong rule is written (the self-reinforcing-bad-lesson loop); **(e)** **no surveyed system
uses human ratification as a graduation gate** — every one automates admission. The owner has now
matched that posture by default (the dedicated subagent adjudicates; the owner is pulled in only on
its escalation), which makes the escalation judgment itself the piece to keep honest.

### Calibration — designed for Opus 4.8 / Sonnet 5 workhorses (owner direction 3)

The loop trusts frontier judgment for every **worth** decision. The only mechanical fences retained
are the ones **frontier-era** evidence justifies:

| Retained fence | Frontier-era evidence (not 2023 caution) |
|---|---|
| Evidence required at capture, fail-closed | Mem0 production audit (2025): judgment-only admission shipped 97.8% junk |
| No agent ever holistically rewrites the friction store; per-item edits + deterministic archival | ACE context collapse (2025, DeepSeek-V3.1): one whole-store rewrite → below no-memory baseline |
| Fail-closed drain ceiling | This repo (2026): the WARN-only worklist rot, 31→58 during one session |
| Provenance + tombstones + re-open paths (structural staleness) | STALE benchmark (2026): best frontier model 55.2% at noticing invalidated memories |
| Cap 3 items per retro, distilled not raw | ReasoningBank ablation (2025, Gemini-2.5/Claude-3.7): raw failure logs hurt, max-3 distilled lessons helped |

Everything else — worth, durability, routing, escalation — is undiluted model judgment. No numeric
threshold ever decides what graduates (ADR-0032 §3/§5 intact).

## Decision

**One sentence:** every landing session runs a bounded, evidence-fenced **retro** that files typed
**`friction` artifacts — a new Library kind, the employees' upward voice channel** — and a
**dedicated adjudicator subagent (the un-parked `graduation-synthesist`) with the whole-system view**
drains the friction worklist through a justification gate, routing each item to
**ADR / tool / principle-or-guardrail / process / definition / edit-existing / nothing** with
verification proportional to blast radius, a fail-closed ceiling, and a rollback story — **the owner
appears only when the adjudicator escalates** (a friction-born ADR, a genuine owner fork), never as
a standing step.

### D1 — The retro: a capped, evidence-fenced orchestrator step BEFORE the librarian pass

The session-orchestrator workflow gains a step between "gate green" and the ADR-0095 D7 librarian
pass (a seed-canonical agent edit, ADR-0055): review the session for friction — *what fought you, at
what cost, with what evidence* — and file **at most 3** items; **"nothing to report" is a
first-class, free outcome** (no marker, no penalty). Capture compliance is **discipline** (the
generated workflow region), not a per-session gate — a compliance gate would price the ceremony
toward retro theater; the backstop is the worklist ceiling (D4). `friction-analyst` (per-run,
evidence-typed) may also file items when invoked — the best-evidenced producer.

### D2 — `friction` is a Library artifact kind (owner direction 1)

Friction becomes the **10th structured kind** in `KIND_SPECS` (`packages/library/src/knowledge.ts`;
the CLI's `template` listing category is not a kind). Body fields, per the KIND_SPECS shape:

- `statement` (lead, required) — the friction in one sentence: *what fought you, not what you learned*;
- `evidence` (required) — ≥1 concrete citation: command + output excerpt, file path, PR#, quoted
  error. **The CLI refuses an evidence-free write, fail-closed** (`check:corpus-content` gains the
  structural floor);
- `impact` (required) — what it cost (time, a red gate, a wrong build) and who hits it next;
- `route` (optional, set only at adjudication) — `adr | tool | principle | guardrail | process |
  definition | edit-existing | nothing`; **capture never classifies** (no severity enums, no
  taxonomy — classification-at-capture is the eager-synthesis failure, and the adjudicator reads
  prose);
- `routeReason` (optional) — the justification-gate answers, or the archive-with-reason for `nothing`.

Plus structured fields **outside** the body table (the `stepRefs`/`branchEdges` precedent — optional,
schema-level, **no `CURRENT_SCHEMA_VERSION` bump, zero migration**, verified): `provenance
{ branch, date, source: "retro" | "run-analysis" }` and `reinforcedBy [{ branch, date, evidence }]`.
The existing shared `references` field carries the implicated artifacts/ADRs — the multi-target
anchoring a comment's single anchor cannot play, and it makes every friction item a real node in the
ADR-0161 context DAG. **Recurrence reinforces, never duplicates**: a session that re-hits a filed
trap appends to `reinforcedBy` — **with its own evidence** — on the existing artifact
(`edit-first-curation` applied to friction; this realizes ADR-0032's cite-as-reinforcement without
building the cite store, and `reinforcedBy.length` is testimony the adjudicator weighs, never a
threshold). Lifecycle is derived, not a state machine: **open** (no route) → **routed** (route set,
output cited in `references`) → **archived** (`route: nothing` + reason). An archived item is
**retained** (a tombstone — recurrence of an archived trap must be detectable and re-open it with the
stronger evidence); deletion happens only at a long consolidation horizon, and **no agent ever
rewrites the friction tier wholesale** (per Calibration).

**The D5 relationship (ADR-0095, amended here):** `friction` joins `open-question` and `proposal` as
the Library's **lifecycle tier** — transient-by-design kinds, each with a mandatory drain — now named
explicitly. D5's able-things-only rule stands verbatim for every durable tier: raw friction never
graduates *as itself*; only its durable essence is extracted into 'able' artifacts through the
existing judgment, and the friction item is then routed/archived. (D5's own kind enumeration already
omitted the transient kinds; this names the tier rather than carving an exception.)

**Offline/remote capture fallback (the shelf's surviving role):** `storytree friction new --pg` needs
the live store; a session that cannot reach it (remote 443-only, offline docs session) writes the
same doc JSON to a `docs/friction-inbox/` staging file in its PR, and the adjudicator (or the next
live session's librarian pass) files it live and deletes the staging file — migrate-only, mirroring
`sync-corpus`. Session-end never acquires a hard DB dependency (the ADR-0162 bar).

### D3 — Anti-slop at capture (machine, fail-closed)

The `friction new` CLI validates fail-closed: evidence present and concrete (a resolvable
path/PR#/command/error marker — a structural floor, deliberately dumb about truth); >3 items per
branch/date refused; `references` must resolve. The zod schema is `.strict()` like every kind.
`check:corpus-content` extends to friction docs; `check:friction-drain` (below) carries the hygiene
WARNs/red. The inbox staging dir is validated by the same schema in `pnpm gate` (offline-checkable).

### D4 — The drain: bounded, aged, and fail-closed at a ceiling (the load-bearing mechanism)

- **Aged:** an item becomes *routable* only once it is at least one session old (the session that
  filed it never adjudicates it — no marking your own homework).
- **Bounded:** the pre-merge librarian pass hygiene-checks new items and drains the **K oldest
  routable items** (K≈3) — never the whole worklist per merge (doesn't scale with landing rate;
  parallel sessions would clobber same-artifact adjudications).
- **Fail-closed ceiling:** at open-count > **N (≈12)** or oldest-open > **M (≈21 days)**,
  `check:friction-drain` flips WARN → **red** and landing requires a **board drain session** — a
  spawned adjudicator (D5) session that drains the backlog. The board is **agent-side**; it does not
  pull the owner in. Its output digest is a *visibility* surface (the studio, the PR), not a
  sign-off. A WARN-only drain is the mechanism that already produced the worklist rot; the
  fail-closed cap follows `meter-fail-closed-caps-in-real-cost` / the ADR-0130 turn-cap precedent.
  The ceiling gates **queue hygiene only** — no count or age ever decides what *graduates*.
  (Honest cost of the kind substrate: the live-store check runs where the DB is reachable — local
  gates — and SKIPs in DB-free CI, like `check:agents-sync`; the offline-checkable parts are the
  inbox schema and the seed export. The standing adjudicator duty, not CI, is the primary drain.)

### D5 — The adjudicator: the un-parked `graduation-synthesist` (owner direction 2)

The dedicated subagent the owner named is the **`graduation-synthesist`** — the role ADR-0032 §3
designed for exactly this seat: it reads the accumulated signal **with the whole-system view**
(friction artifacts + comments + agent-memory candidates + the decision log) and its charter now
extends to **chairing friction adjudication**: ask the justification questions, set
`route`/`routeReason`, and **decide what escalates to the owner**. Least-authority is preserved: the
synthesist routes and escalates; the per-route authors execute (table below). Its build is
authorised by this ADR (it was parked awaiting an owner fork; the owner has now exercised it).
Until it is built, the librarian-curator holds the chair under the same ceremony — the ceremony is
role-agnostic by design.

The gate's **RULE** is this ADR plus a `friction-justification-bar` principle (authored through
guidance-curator — behavioural floor); its **PROCEDURE** ships as a `friction-adjudication` process
artifact making no new policy (ADR-0034 §2 / ADR-0154). The questions, answered into `routeReason`:

1. **Does the evidence *support* the claim?** — not merely exist. A real cold-start log does not
   support "always `db:up` first" (it contradicts ADR-0162). Spot-verify; for any route that renders
   into agent guidance, spawn **corpus-investigator** to verify (blast-radius rule below).
2. **Reconstructible?** Would a fresh agent re-derive this from today's corpus just-in-time?
   (ADR-0024) → `nothing`.
3. **Closest existing artifact — why is an edit not enough?** (`edit-first-curation`; the search and
   its result go in `routeReason`.)
4. **Stateless?** (`stateless-vs-stateful-graduation`) UNCERTAIN → stays open.
5. **Discriminatory?** Name the concrete future situation where an agent acts differently.
   (`signal-and-noise`.)
6. **Recurred — or structurally certain to recur?** One-offs wait for reinforcement.
7. **Cheapest fix?** A code fence or tool beats guidance an agent must remember — prefer the `tool`
   route over prose.

| route | output | executor → reviewer |
|---|---|---|
| `nothing` | tombstone + `routeReason` | synthesist archives (the logged reason is the audit) |
| `edit-existing` | edit + provenance backref | librarian; guidance-curator if floor; **corpus-investigator verify** |
| `principle` / `guardrail` | floor artifact | **guidance-curator** authors; **corpus-investigator verify** (renders into every future session — highest blast radius) |
| `process` | derived ceremony | librarian; must cite its deciding ADR (ADR-0154) |
| `definition` | reference tier | librarian |
| `adr` | **born-`proposed` ADR — THE owner escalation** | synthesist drafts with the alignment check below; **owner ratifies** (this IS "a dedicated subagent says so") |
| `tool` | capability work routed to **story-author** (agent-side, ADR-0158 discipline); a `spawn_task` chip only when the synthesist judges owner visibility warranted | story-author / the normal prove-it-gate |

**Verification proportional to blast radius:** the ADR route is contained (born `proposed`,
owner-held); the principle/guardrail/edit routes flow through the render pipeline into **every
future session's guidance** — so those carry the *mandatory* corpus-investigator verification.
Batch adjudication is never "owner-directed in this conversation," so a friction-born ADR can
**never** be born `accepted` under ADR-0110.

**The alignment check (friction → ADR):** before the draft leaves the adjudicator — (a) survey
`storytree adr list --load-bearing` and name every touched decision in the new ADR's Context; (b)
corpus-investigator verifies the friction's factual claims against live sources; (c) declare
`amends`/`supersedes`/`supersedes_in_part` edges up front (`adr-health` enforces mechanically); (d) a
contradiction with an accepted load-bearing ADR halts as an owner escalation — never drafted around.

### D6 — Rollback, and the self-sealing hazard

Every friction-born artifact carries provenance back to its friction item(s) and their evidence. A
graduated rule that turns out wrong is **reverted through the library-edit ceremony** (edit/retire +
regenerate + `sync-agents`), and its originating friction re-opens with the counter-evidence.
Explicitly: **contradicting a friction-born artifact with new evidence is itself first-class friction
— never non-adherence.** (Without this line, the corpus's own owner-fork-bar discipline makes a wrong
graduated rule self-sealing: sessions obey it and questioning it reads as defection.)

### D7 — Three-layer enforcement (the ADR-0161 mapping)

- **Machine, blocking:** the `friction new` capture validator (evidence, cap, refs) + schema
  strictness; the drain ceiling (where the store is reachable); `adr-health` edges on the ADR route;
  inbox-staging schema in the gate.
- **Machine, WARN:** drain-age advisories below the ceiling; the existing `check:graduation-worklist`
  (unchanged).
- **Adjudicator/librarian judgment:** the seven questions, routing, reinforce-vs-new calls,
  tombstoning, **owner-escalation judgment** — worth is never arithmetic.
- **Owner-held:** ratifying friction-born ADRs and whatever else the adjudicator escalates;
  un-deciding. Nothing else — the owner is not a standing step (owner direction 2).

### D8 — What stays unchanged

`friction-analyst` (per-run) is untouched as a producer. `check:graduation-worklist` and the
ADR-0095 memory-graduation path are unchanged (memory and friction are different sources feeding the
same judgment; the synthesist reads both). ADR-0032 §5's anti-gaming deferral is **reaffirmed**:
this ADR answers observed slop with structure-only mechanics; no forge-resistance, no cite-integrity
machinery, no worth-thresholds.

## Success measures — how we know it's working (the north star is effectiveness, not inbox health)

**Primary observable: post-route recurrence extinction.** After a friction routes to a fix, the same
trap must stop appearing — no re-file, no reinforcement, no reappearance in agent-memory. A routed
item that keeps recurring means the loop produces bloat, not learning.

**Falsification tripwires** (any standing ~a month falsifies the design as tuned, and escalates —
via the adjudicator): open count growing monotonically across 4+ weeks with the ceiling hit
repeatedly; `route: nothing` share near 0% (gate is theater) or near 100% (capture is noise);
reinforcement never firing (duplicates minting); an archived trap re-filed without its tombstone
re-opening; retro output ~always empty (ceremony priced too high); **owner-escalation rate near 0%
or high enough to reconstitute a standing owner step** (the escalation judgment itself drifting).

## Resolved forks (decision record)

- **F1 — substrate: DECIDED by the owner (2026-07-06): the Library `friction` kind.** The proposal
  recommended a disk shelf first; the owner chose the kind for the organizational reason recorded in
  Status (the upward voice channel belongs in the shared surface with the full picture — the studio
  inbox, the DAG references, the per-id live rows). The shelf survives only as the offline-capture
  inbox (D2). *Why not reuse `open-question`/`proposal`:* both force route-classification at capture
  (an OQ is already a question, a proposal already a decided change) — the eager-synthesis failure
  this design defers to adjudication; and neither can carry evidence-required-at-capture or
  reinforcement without distorting its spec.
- **F2 — drain ceiling: fail-closed, as recommended** (N≈12 / M≈21 days, tunable on evidence);
  unobjected at review, and agent-side under direction 2.
- **Adjudicator staffing: DECIDED by direction 2** — a dedicated subagent; the
  `graduation-synthesist` is un-parked and takes the chair (librarian-curator holds it until built).
- **Owner involvement: DECIDED by direction 2** — escalation-only, at the adjudicator's judgment.

## Consequences

**Good.** The designed-but-dormant feedback loop gets its missing pieces — a capture moment, a
first-class shared artifact kind, a dedicated adjudicator, a drain obligation, and an
escalation-only owner — completing ADR-0032's vision (friction artifacts + `reinforcedBy` +
`references` realize the signal-graph the cite store never built, and the synthesist finally gets
its substrate); raw friction stays out of the durable tiers (the lifecycle tier is named and
drained); every worth-decision remains judgment; loop health is measured against agent effectiveness
(recurrence extinction), not Library growth.

**Bad / costs.** Honest build cost is **~6–7 units** (the kind + validators + template; the
`friction new/reinforce/list/route` CLI; `check:friction-drain` + corpus-content extension + inbox
fallback; a full studio unit — `types.ts`/`Library.tsx`/`apiRouter.ts` allowlist/`knowledgeFields.ts`/
CSS/`build-corpus.mjs` all hardcode the kind list; the synthesist agent build; corpus authoring +
agent edits). The drain ceiling can block an unrelated landing until a board session runs (its job —
but it will annoy). The live-store check is CI-blind (DB-free CI), so the adjudicator duty carries
the drain. The biggest residual risk is unchanged: **adjudication-cadence collapse** — if board
sessions rubber-stamp `nothing` to clear the ceiling (the archive mill), the loop performs instead of
learning; the Success-measures tripwires exist to catch exactly that, and with the owner out of the
default loop, the tripwires are the adjudicator's standing obligation to watch.

**Build (authorised; landed as separate provable units in dependency order):** (1) the `friction`
kind — `KnowledgeKind` + `KIND_SPECS` + schema fields + `template-friction` (no migration, verified);
(2) the capture CLI + fail-closed validator + inbox fallback; (3) `check:friction-drain` + gate
wiring; (4) the studio kind surfaces; (5) the `graduation-synthesist` agent build (seed-canonical) +
`friction-adjudication` process + `friction-justification-bar` principle + session-orchestrator/
librarian-curator agent edits + regenerate + `sync-agents`.

## References

- [ADR-0032](0032-cite-graduation-mechanism.md) (**amended**: friction artifacts + `reinforcedBy` +
  `references` realize the signal-graph for this path, retiring the unbuilt cite store here; the
  synthesist is un-parked into its §3 seat; §3/§5 no-threshold / no-anti-gaming posture reaffirmed),
  [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) (**amended**: D4
  routing gains the friction rows; D5's transient kinds are named the lifecycle tier with friction
  joining OQ/proposal; D7 pass gains capture-before + bounded drain; D8 operationalized by the
  justification bar), [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)
  (superseded origin), [ADR-0024](0024-blind-reconstruction-test-for-documentation.md),
  [ADR-0034](0034-process-artifacts-ways-of-working.md) / [ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md)
  (process = projection), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) /
  [ADR-0084](0084-agents-may-flip-an-adr-green.md) (this acceptance), [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md),
  [ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md) (the nudge
  pattern), [ADR-0158](0158-the-autonomous-chat-writes-only-proof-producing-work-un-prov.md) (the
  tool route's write discipline), [ADR-0161](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md)
  (three-layer enforcement; friction items as DAG nodes), [ADR-0162](0162-manage-session-onboarding-cost-optimize-the-cost-centers-the.md)
  (the session-cost bar the retro must respect).
- Library artifacts: `signal-and-noise`, `edit-first-curation`, `reference-dont-restate`,
  `two-consumer-extraction`, `stateless-vs-stateful-graduation`, `meter-fail-closed-caps-in-real-cost`,
  agents `friction-analyst` / `graduation-synthesist` / `librarian-curator` / `guidance-curator` /
  `corpus-investigator` / `story-author`.
- [`docs/research/session-retro-feedback-loop-prior-art.md`](../research/session-retro-feedback-loop-prior-art.md)
  — the dated, model-tagged prior-art pass (owner charter item 5).
- Design method: four independent designs (minimalist / new-kind / frontier-native / organizational-
  practice) adversarially audited from four lenses (corpus-alignment, anti-slop red-team, cost,
  owner-intent) against the live repo, 2026-07-06; the audit corrected six load-bearing claims before
  synthesis (private-memory substrate flaw, SessionEnd-hook misconception, remote 443-only capture,
  D5's actual letter, kind-count, studio cost).
- Owner charter conversation + owner ratification conversation, 2026-07-06 (`task_cfcc5788`; PR #632
  carried the `proposed` draft).
