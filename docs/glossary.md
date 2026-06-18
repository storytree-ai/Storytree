# Glossary

Authoritative terminology for storytree. Every layer — the library schema, the
orchestrator, the studio UI, and the ADRs — uses these words as defined
here. When a term's meaning is in question, **this file wins**. The reasoning
and the tier-boundary rules live in
[ADR-0002](decisions/0002-work-hierarchy-story-capability-contract.md).

## The work hierarchy

**story** — The top-level unit of work you watch grow, and a node on the DAG the
studio renders. A **bounded context / organism** — self-contained and
**independently deployable** (the microservice grain), *composed of
capabilities*. The map grain: the thing a newcomer points at ("the event store",
"the tree renderer"). A story is **proven as a whole by ≥1 integrated UAT**
(acceptance walkthrough of the organism against real collaborators), not a pure
rollup of its capabilities. Inside it capabilities share machinery (DRY is good);
across stories behaviour is duplicated, not shared, except through a declared
**boundary** (ADR-0010). Deliberately bigger than v1's story.

**capability** — An **organ within a story** (bounded context): independently
viable, proven by ≥1 **integration test** against **real in-story collaborators**
(no stubs within the organism), and composed of **contracts**. It no longer
carries the UAT — that moved up to the story. The unit within-story dependencies
are drawn between (code-derived; see **dependency**), and the unit v1 (Agentic)
called a "story". A unit is a capability — not a contract — if it is an
integration-wired organ rather than a single isolated behaviour (ADR-0010).

**contract** — A single **test-proven behaviour** within a capability: one
automated, **isolated** unit test (collaborators stubbed). The leaf — the bottom
rung of the proof ladder (unit → integration → UAT). A unit is a contract — not a
capability — if the only honest proof is an isolated automated assertion, with no
wired-up organ around it.

## Supporting terms

**node** — A unit being worked **on the DAG** — a story or capability under
construction — driven by one owned-loop session (the intended DBOS workflow
wrapper is deferred, ADR-0019). The coordination/scheduling grain (the thing the
orchestrator schedules and the isolation/claim layer is keyed on). Distinct from
a **run** below: an owned-loop run/attempt against a node is an execution event
(many-per-node), never a new node. The execution environment is not the
coordination structure (ADR-0004, ADR-0009, ADR-0011).

**run** (owned-loop run / attempt) — A single per-node **execution** attempt, recorded
as an event in the event store — many-per-node, never a new node. Distinct from
v1's overloaded `runs`/`test_runs` table (per-build vs per-event vs id-keyed
dir); here `run` is strictly the per-node execution attempt (ADR-0004, ADR-0011; see
`open-questions.md` §3, §8).

**UAT** (user-acceptance walkthrough) — A prose journey, run end-to-end against
*real* collaborators, that proves a **story** (the whole organism) meets its goal.
Minimal-first: ship one that proves the goal, grow more as defects surface. Lives
at the **story** level — capabilities get integration tests, contracts get
isolated unit tests, not UATs (ADR-0010).

**contract test** — The automated test that proves a contract: the **isolated
unit test** at the bottom rung of the proof ladder (unit → integration → UAT).
Collaborators are stubbed, for fast feedback during the build.

**dependency** — A directed edge, defined at two altitudes (ADR-0010).
**Within a story**, capability→capability edges are **code-derived** (static
analysis of imports/calls): inside the boundary a dependency *is* the code
coupling, read off the source, not hand-authored. **Across stories**, one story
may depend on another **only** through a declared, documented **boundary** (§4) —
hidden cross-story coupling is forbidden. You cannot prove a unit that stands on
an unproven one.

**boundary** (cross-story interface; *schema name TBD*) — The declared, documented
seam between two stories — the **only** legal cross-story coupling: two organisms
dependent to deliver an outcome but each still functioning in isolation against
the seam, the way a frontend depends on a database. The name is provisional: bare
`interface` collides with TS `interface` (the same collision that sank
`component` in ADR-0002), so the candidates are **`boundary`** or **`port`**,
to be ratified when `packages/core` formalises the schema (ADR-0010 §4).

**event** — A typed record of a state change (owned-loop events + orchestrator events) —
the unit of observability. If a state change isn't an event the UI can render,
it doesn't exist (ADR-0001, observability-first). Defined alongside the schema in
`packages/core`. Includes operator-actor events (see **approval event /
promotion event**), not just agent activity.

**event log** — The typed, **append-only** record in the event store — one row
per state change — that is the single source of truth the studio renders and the
only thing **written**. The artifact behind the `event` term; distinct from the
derived **node rollup** below (ADR-0006).

**node rollup** — The current status and latest `verdict` **per** story /
capability / contract, derived as a **projection** over the event log and never
hand-maintained. A capability's lifecycle status (proposed / building / healthy;
unhealthy computed) is *read off* the log, not written beside it. v2's answer to
v1's per-build `runs`-grain mess (ADR-0006).

**owned-loop event stream** — the owned loop's structured lifecycle event stream (plus `edit`-tool
diffs/patches) emitted as it works inside a node — the **agent-activity ingest
channel** into the event store, normalized by `packages/agent`. One of
exactly two defined ingest channels; the other is orchestrator events (ADR-0001,
ADR-0006, ADR-0011).

**approval event / promotion event** — Typed events with `actor = operator`
recorded in the event store: an **approval / steering event** (a human in-loop
intervention) and a signed **promotion event** (the human accepting a
unit's green result onto the trunk, carrying operator identity and, for a story,
the UAT verdict). Part of the same observability record as the owned loop's own activity (ADR-0008);
identity backing is open (`open-questions.md` §1).

**DAG** — The directed acyclic graph the studio renders and watches grow.
Stories are its visible nodes; capability dependencies are the fine-grained edges
beneath. The exact inter-level grain is open (see ADR-0002 → "What this does NOT
decide").

## Lifecycle (a capability's status)

Status lives on every tier (story / capability / contract); a **story**'s state is
not a pure rollup — it carries its own UAT proof (ADR-0010) on top of its
capabilities'. Carried from v1's lifecycle, with
`under_construction` renamed to **building** and the health metaphor kept (we did
*not* rename `healthy` to "proven" — "proven" stays as general proof-mode
language, `healthy` is the status word).

**lifecycle status** — A unit's status, drawn from six states. **proposed** — authored but not yet selected for implementation; the initial state. **building** — selected and under active implementation (v1: `under_construction`); written at pickup as the first commit, before any code edits. **healthy** — proven: the unit reached `healthy` through its tier's proof mode at HEAD — a story by a UAT pass over fresh green capabilities, a capability by integration tests over fresh green contracts, a contract by its isolated unit test (or, where neither honest test exists, operator-attested) (ADR-0010). **unhealthy** — a once-healthy capability that has drifted (a contract test now fails, owned files changed, or the proof no longer matches HEAD); **computed** from evidence, never written to disk. **mapped** — brownfield: the capability is *observationally* verified by an existing target-repo test suite, without storytree driving a red→green flow; a distinct, weaker state than `healthy` — observational green never short-circuits to proven; v2 **supports** brownfield, the exact mapping mechanism under the owned loop / DBOS is still to design (see `open-questions.md` §2). **retired** — terminal off-tree state: pruned from the active tree; may carry `retired_reason` (prose) and `superseded_by` (an edge to its replacement).

## Proof, evidence & gating

**gate** — A structural enforcement point that **refuses** invalid work rather
than warning. storytree keeps the commit-time / promotion gate (ADR-0001 cites it
as a proven v1 idea).

**prove-it-gate** — The principle that a unit reaches `healthy` only via earned,
on-disk evidence — never a hand-edit.

**proof mode** — How a unit earns `healthy`, one rung per tier (ADR-0010):
**UAT** (an honest scripted story-level walkthrough), **integration-test** (a
capability's organs wired against real in-story collaborators), **contract-test**
(an isolated unit assertion), and **operator-attested** (below). `packages/core`
encodes these as a discriminated `proof_mode` union; the carrying tier of the UAT
mode moves from capability to story (ADR-0007, amended by ADR-0010).

**operator-attested** — A proof mode (alongside UAT, integration-test and
contract-test) for behavioural/guardrail surfaces that have neither an honest
scripted UAT nor an isolatable automated test — e.g. the orchestrator's own
routing / approval / steering discipline. Promotion to `healthy` is an explicit,
per-unit, **operator-granted** attestation recorded as a typed **signed event**;
an agent can never self-exempt, and the attestation is distinguishable in the
audit trail from a UAT walkthrough sign. Successor to v1's `manual_signings`
(Agentic ADR-0024); defined authoritatively in ADR-0007. Distinct from `mapped`
(observational, never `healthy`). Its persistence/identity backing is still open
(`open-questions.md` §1).

**convergence** — Two **distinct** senses v1 conflated and v2 keeps separate;
always qualify which is meant. (1) *DAG-stabilisation* — the dependency DAG is
iterated to a fixed point before any unit goes red (owned by the
decomposition/scheduler loop; see `open-questions.md` §4). (2) *cold-rebuild* —
below. (ADR-0003, ADR-0007.)

**cold-rebuild** — An **authoring guideline** (not a gate), at **story grain**: a
story should be written self-contained enough that a cold agent — given the story's
own spec **plus the declared interfaces of its upstream stories** (never their
internals), and nothing else — could rebuild it and pass its UAT. The rebuilt
*internals* may legitimately differ (many implementations satisfy one UAT). The
cold-rebuild sense of `convergence`, distinct from DAG-stabilisation. It is **not**
the definition of `healthy` (earned via the proof modes / prove-it-gate) and is
**not machine-enforced** — v1 carried it as guidance for agents authoring stories
and never tested it (ADR-0010 §6; ADR-0007; carried from Agentic ADR-0006/0027).

**per-node budget** — A code-enforced ceiling (iterations / token-cost /
wall-cost — exact unit TBD) on a node's spine loop. The loop terminates on green
**or** budget-exhausted, the latter a typed terminal event with per-round cost
visible in the event store. Resurrected for pay-as-you-go (ADR-0005), inverting
v1's "cascade rounds are not a cost"; the concrete unit and default ceiling stay
open (`open-questions.md` §6).

**approval** (approval-gated trunk) — A first-class, typed operator act
(`actor = operator`) in which the human accepts an agent action, or a
capability's green result, **onto the trunk** via the studio. The trunk is
**approval-gated**: a green signal is a *request for human diff-review*, not an
automatic merge (inverts v1's auto-merge-on-green). Distinct from a **gate**
(which structurally refuses invalid work); an approval is the human admitting
work that has already passed the gate's content invariants (ADR-0008). The
identity backing the signature is open (`open-questions.md` §1).

**verdict** — The Pass/Fail outcome of a story's UAT. Reserved for UAT
outcomes; v1 also used "verdict" for agent conclusions and evidence-row states —
those are different concepts and do not claim the word here.

**evidence** — The forensic record that a unit's tests went red→green and its
story's UAT was signed: an audit trail, not itself the gate. How v2 persists
evidence (events vs files) and the attestation/identity model are open
(`open-questions.md` §1).

**proof hash** — A hash of a unit's proof-bearing content (outcome, contracts, …)
that invalidates a prior verdict when the content changes.

**red-green** — The discipline that a failing (red) contract test is authored
before the implementation that turns it green. A *principle*, not a synonym for
`contract`.

**mock-UAT seam** — **No mocks within an organism**: capability integration tests
and the story UAT both run against real in-story collaborators. The one stubbable
boundary is the declared cross-story **boundary** — a story's UAT may run against
a stubbed / contract-tested version of an upstream story's interface (like
acceptance-testing a frontend against a stubbed database). Isolated unit
(contract) tests still stub freely. This is isolation, not theatre (ADR-0010 §5).

## Principles & patterns (carried from v1)

**deep-modules** — A unit's public interface should be small relative to its rich
implementation (interface is cost, capability is benefit). ADR-0002's model rests
on this.

**defects-amend-the-owning-story** — A defect amends the capability whose contract
it violates (reverting it to `building`), rather than spawning a new unit.

**fail-closed-on-dirty-tree** — A command that writes attestable evidence refuses
to run on a dirty working tree (writes nothing, non-zero exit code).

**standalone-resilient-library** — Structure a unit as a library with minimal
load-bearing deps, exercised end-to-end by integration tests, with a thin
CLI/adapter wrapper.

**verification-wins** — The stance that binding to external truth via tests +
on-disk evidence **overrides** LLM memory consolidation / recency
("recency-wins"). v2 rejects Dreams-style reconciliation in favour of a
commit/event-bound evidence chain. Carried from v1's learning-loop design
(Agentic ADR-0011); the learning loop's v2 home is still open
(`open-questions.md` §5).

**inner loop / outer loop** — **inner loop** = driving one unit from red to green
(automatable, owned by an owned-loop node). **outer loop** = accepting a result onto the
trunk, accepting a decomposition, or amending / retrying / abandoning a unit
(held by **human judgment** in the studio). The human-in-the-loop gate sits at
the outer loop; the north-star may later dissolve it (ADR-0007, ADR-0008; carried
from Agentic ADR-0006/0020).

## Unit fields

**unit fields** — The four core fields a unit carries. **outcome** — a capability's plain-English, single-sentence value statement (no conjunctions — split the unit if it needs them). **guidance** — non-obvious technical context needed to rebuild a unit; only what an agent could not derive from outcome + proof. **title** — short human label for a unit; not load-bearing for proof. **id** — a unit's unique identifier; v2 must allocate these **conflict-free across concurrent sessions** (a stated goal; an earlier DBOS spike showed durable, collision-free workflow IDs as one candidate mechanism, but DBOS is deferred — ADR-0019 — so that mechanism is reference, not in place).

## Concurrency & isolation

**claim** — A typed **write-ownership** record (a row/event in the one shared
event store) naming what a node intends to write, checked under a
serializable/unique constraint at **node-schedule time**; a conflict is a **hard
refusal** (a `claim-conflict-refused` event), never a warning. The v2 successor
to v1's per-worktree `session_claims` table (Agentic ADR-0022), now living in the
single shared Postgres store (ADR-0009). Granularity, the conflict-resolution
ceremony, and whether code *edits* still use a git branch/worktree per node are
open (`open-questions.md` §3).

**write-ownership** (scope) — The single vocabulary for *what surface/unit* a node
claims the right to write, used by the claim / conflict-detection layer. Unifies
v1's scattered terms (`declared_scope` vs per-agent `does_not_touch`) into one
concept (ADR-0009); the exact shape (node-scoped vs file-glob) is open
(`open-questions.md` §3).

**noticeboard** — The session-presence surface — one of the three working surfaces (tree = the work, noticeboard = the sessions, library = the knowledge) and the coordination organ: parallel sessions declare "I exist, in this worktree, working on X" anchored to story nodes (ADR-0033). One upserted declaration per session over append-only history (`events.session_event` + `events.session`); identity is the worktree name (derived, never typed; no signer chain — presence is not proof). Advisory-only: the board *shows* overlap, nothing refuses anything (claims-with-refusal is named-deferred, like DBOS); staleness by `lastSeenAt` replaces release discipline; automation never touches a blocking-capable hook and a board write failure never fails the enclosing action. Live-DB only — offline surfaces render without presence lines. Distinct from the feedback organ (`stories/feedback-graduation`, ADR-0032).

## Studio & tooling

**story tree** — The **work surface**: the living, populated DAG of stories > capabilities > contracts along which the software is grown — one of the three working surfaces (tree = the work, noticeboard = the sessions, library = the knowledge). It is the project's **research object** (ADR-0030): the map of the AI-driven SDLC a human watches grow, not an incidental task list. Authored file-per-unit as frontmatter markdown under `stories/` (a `story.md` per story plus a file per capability, contracts inline by convention, statuses and `depends_on` in frontmatter); rendered by the storytree CLI and the studio. Nodes **exist** when authored; green-ness is per-node and earned later through the prove-it-gate. Distinct from the git commit tree, and from the bare **DAG** (the shape — the story tree is the populated artifact that has it).

**library** — The shared **knowledge tier**: schema-validated artifact docs (definitions,
principles, patterns, guardrails, techstack, processes, open questions) living in the
shared Cloud SQL Postgres store — JSONB, zod-validated at write; history = events,
current state = projection (ADR-0017, ADR-0019). The live store is the source of truth
for artifact state; git holds code plus *generated* views (this glossary, `assets.json`),
and `knowledge.json` is the migration seed (ADR-0023 §11). One of the three working
surfaces (story tree = the work, noticeboard = the sessions, library = the knowledge —
ADR-0034); sessions read it just-in-time via the exploratory `storytree library` CLI,
humans via the studio. Artifacts are derived from ADRs and cite them — on disagreement
the ADR wins.

**studio** — The live PixiJS web IDE that renders the tree and **drives** the
agents (diffs, approvals, steering, per-node chat). Supersedes v1's read-only
`dashboard` — a richer, driving surface, not merely a renamed view.

**orchestrator** — The thin custom TypeScript layer (`packages/orchestrator`)
over plain Postgres (DBOS deferred, ADR-0019; ADR-0001): owns the story-DAG, the
scheduler, and the event store, and is the **only** module that drives
`packages/agent` (the owned loop). It is the code-sequenced **spine** and the
sole **fan-out** point — it schedules nodes; owned-loop nodes never schedule
child nodes. Distinct from an owned-loop session (which owns work *inside* a
node) (ADR-0004, ADR-0005, ADR-0011).

**spine** — The code-sequenced control-flow layer (the orchestrator over plain
Postgres — DBOS deferred, ADR-0019) that owns **closed, deterministic routing**:
the order steps run in, when a loop iterates, which branch is taken. The **leaf**
it delegates to runs behind the executor seam (live: the Claude Agent SDK; offline/fallback:
the owned loop — ADR-0030). Discriminator (carried verbatim from
Agentic ADR-0026): *if a for-loop or a match could express the routing, the spine
owns it; if the routing needs the model to decide what comes next, the leaf
owns it.* Authoritatively defined by ADR-0005.

**leaf step / leaf judgment** — A single step in a code-sequenced cascade whose
work is owned by the **leaf runtime** (what to write, how to satisfy
a contract) rather than by the spine — the **control-flow** sense of "leaf"
(ADR-0005, ADR-0011). The leaf runs behind the executor seam: live, the Claude
Agent SDK; offline/fallback, the owned loop (ADR-0030). Distinct from **contract**,
the *leaf tier* of the work hierarchy
(ADR-0002); the two senses must not be conflated.

**agent package** (`packages/agent`) — The project-owned **thin wrapper** (`packages/agent`) and
typed-event parser over the leaf surface (prompt / steer / follow-up
+ lifecycle events + `edit`-tool diffs). The **sole** surface through which
a leaf runtime is invoked and the **only** place a model runtime is imported. It hosts **both**
executors behind the `PhaseAuthor` seam: the **owned loop** (offline/deterministic + pivot-out
fallback, ADR-0011) and the **Claude Agent SDK** leaf (`ClaudeAgentAuthor` — the live runtime,
ADR-0030); it normalizes the stream into the typed events the event store renders, and
exposes nothing model-shaped upward. `packages/core` and `apps/studio` never parse the leaf's stream directly
(ADR-0004, ADR-0006, ADR-0011, ADR-0030). Carries v1's own-a-thin-wrapper-over-the-agent-runtime
principle (Agentic ADR-0008/0026).

**trunk** — The canonical **integrated mainline** a capability lands on once
**approved**. In v2 the trunk is **approval-gated** (a human admits a green
result), never auto-merge-on-green, and never holds knowingly-broken intermediate
states (ADR-0008). Supersedes v1's trunk, which auto-merged on green and tolerated
broken intermediate states under an eventual-consistency posture.

**steering** — A first-class, typed operator act of **redirecting an in-flight
owned-loop run mid-execution** (the owned loop's steer operation), recorded as an event in the event
store. The in-loop counterpart to **approval**: the human shapes an action *while
it runs*, rather than only accepting/rejecting its result (ADR-0008).

**ADR** — Architecture Decision Record under `docs/decisions/`, capturing a
cross-cutting decision.

**fixture** — A test-supporting artifact (data file, scaffold, temp crate)
created during a walkthrough and cleaned up before signing.

**ndjson** — Newline-delimited JSON; the line-delimited record format (a candidate
backing for the event stream). v1 used "JSONL" interchangeably — standardize on
**ndjson**.

**asset** — In storytree, a **tree/game art asset** for the isometric renderer
(ADR-0001, deferred). Note: this is *not* v1's "asset" (shared DRY content under
`assets/`), which does not carry — guard against the collision when importing v1
docs.

## v1 → v2 term map

For reading v1 (Agentic) docs. Left = what v1 wrote; right = how to read it here.

| v1 term | storytree |
|---|---|
| story | **capability** (the in-story provable unit, now integration-proven; ADR-0010) |
| epic | a grouping — closest is **story**; a dedicated epic tier is deferred |
| `contract.yml` (per-agent) | — dropped (v2 has no per-agent contract file) |
| "story is a contract" / red-green | the **red-green** principle / a capability's proof — not the noun `contract` |
| acceptance / acceptance.tests | a story's **UAT** + its capabilities' **integration tests** + their **contract tests** (ADR-0010) |
| depends_on / predecessor / prerequisite | **dependency** (in-story: code-derived; cross-story: via a **boundary**; ADR-0010) |
| under_construction | **building** |
| healthy / proven | **healthy** |
| dashboard | **studio** |
| `manual_signings` (ADR-0024) | **operator-attested** proof mode (ADR-0007) |
| `session_claims` table (ADR-0022) | **claim** in the shared store (ADR-0009) |
| `declared_scope` / `does_not_touch` | **write-ownership** (one vocabulary; ADR-0009) |
| `runs` / `test_runs` (per-build) | a per-node **run** (execution event) + the **node rollup** projection (ADR-0004, ADR-0006) |
| auto-merge-on-green trunk | the **approval-gated trunk** (human admits green; ADR-0008) |
| asset (shared DRY content) | — dropped; in storytree **asset = tree art** (ADR-0001) |
| pattern (the `patterns/` subsystem) | — dropped; named patterns (e.g. standalone-resilient-library) carry |
| deployment (v1, ×3 overload) | — not carried; v1 conflated VCS-exclusion vs runtime-artifact-exclusion (ADR-0003) — guard against the overload, do not reintroduce the word |
