---
status: accepted
decided: 2026-07-11
amends: [2]
load_bearing: true
---
# ADR-0183: Arcs contain plans: the initiative overlay upstream of stories and ADRs, and its ephemeral git-anchored choreography tier

## Status

**accepted** (2026-07-11) — the owner directed every fork in the design conversation the same day
(ADR-0110: design-time alignment IS the ratification; no second end-of-flow ask). The owner's
direction, recorded verbatim in substance:

1. **Naming:** `arc` is the canonical kind key; **"Epic" is the frontend display alias** (the studio
   renders "Epic" by default, flippable to "Arc") — *"I like arc but epic is better for users."*
2. **Arcs contain many plans, and plans live in Postgres with no git artifact** — *"plans will move
   very rapidly and managing them in git will be a pain"* — so only arcs are managed in the
   ceremonies; plans are the first **ephemeral** (live-only) kind class.
3. **Topology:** *"arcs are upstream of stories and adrs — they can span multiple of these, but
   stories and adrs can reveal the arc that produced them, and the arc can reveal the plans if an
   agent ever needs to dig that deep."*

## Context

### The parked question, and the evidence it should re-open

[ADR-0002](0002-work-hierarchy-story-capability-contract.md) deliberately parked a fourth grouping
tier: *"Whether a fourth grouping tier (an 'epic' over stories) ever returns. Not now; not
precluded."* The evidence that it should return arrived organically: **the tier already exists,
trapped in private agent memory.** Session-orchestrator memory accumulated files literally called
"arcs" (`adr0169-map-pathways-arc`, `friction-feedback-loop-arc`, `onboarding-cost-arc`, …), each
tracking an owner intent spanning multiple stories/ADRs/PRs — increment sequence, landed PR#s, halt
points, owner-attestation legs. They work, but they are invisible to the studio, to parallel
sessions, and to the owner; the multi-increment handoff is a `spawn_task` chip prompt — unversioned,
unqueryable, one-reader.

### Why no existing artifact can carry implementation surface or upfront coordination

The owner's second observation — ADRs and stories don't cover implementation surface (files,
packages, ordering) or parallel-agent coordination upfront — is true **by design**: stories are
proof-bounded, not file-bounded (ADR-0002/0010), and ADR-0139 actively evicts execution prose from
ADR bodies because it rots. Surface data goes stale fast, and every durable artifact is forbidden
from carrying stale prose. Coordination today is reactive-only (claims ADR-0121, wisps
ADR-0138/0142, presence) — nothing declares the choreography before the sessions collide.

The proof system already solved this class of problem: verdicts pin `anchor` hashes and source
drift is **detected** (`packages/orchestrator/src/proof/source-drift.ts`), never assumed absent.
The same move applies to intentions: a *disposable, git-anchored* artifact whose staleness is
checked mechanically at consumption.

### The model-tier economics

Planning intelligence and execution intelligence are separable spends. An expensive planner model
(Fable-class today via the Claude SDK; other providers later through the ADR-0177 author-seam
precedent) can author the choreography as an inspectable artifact that a cheaper orchestrating
model consumes. The artifact is the handoff contract — reviewable *before* any `--real` build burns
turns (ADR-0130's turn caps are the brake, but a bad decomposition still costs failed slices), and
reusable across N parallel sessions that each take a different lane.

## Decision

### D1 — The `arc` kind: the initiative overlay

A new Library kind **`arc`**: a named multi-story initiative — the owner's intent tracked through
an **increment log** to a closed end-state. Live-canonical like every non-agent kind (ADR-0023),
curated in the ceremonies, a node in the ADR-0161 context DAG.

- An arc is an **overlay, not a tier**: it *references* stories, ADRs, and plans; nothing
  proof-related rolls up to it. The story remains the top proof grain (no verdict, no UAT, no
  rollup on an arc).
- The arc's only authored mutations are slow: intent changes and **increment-log entries at
  landing** (PR#, outcome, what was consumed or re-planned). The increment log is the **durable
  residue** — history survives plan pruning.
- An arc is not durable guidance: lessons still graduate out through ADR-0095/0168; the arc holds
  state and pointers only.
- **UI naming:** the studio displays the kind as **"Epic"** by default, with a display toggle to
  "Arc". The kind key, CLI, refs, and corpus use `arc` exclusively — one canonical name in the
  machine, one legible name for humans.

### D2 — The `plan` kind: ephemeral, git-anchored choreography

A new Library kind **`plan`**: a disposable execution choreography for one increment of an arc —
unit decomposition (story/capability ids + proof route: `--real` / glue per ADR-0158 /
operator-attested), dependency order, **parallel lanes** (independent units, expected file surface
per lane as fence hints, contention warnings), budgets in turn-cap vocabulary (ADR-0130), known
traps, escalation points.

`plan` is the first **ephemeral kind class** — Postgres-only, no git artifact:

- **Excluded from the seed and every seed ceremony**: `export-corpus`, `sync-corpus`, and the
  `check:corpus-sync` gate warning must all ignore the `plan` kind (else every live plan reads as
  seed drift forever). Plans never appear in `knowledge.json`.
- **Git-anchored:** a plan pins the git SHA it was planned against. **Consumption begins with a
  mechanical freshness check** — git-log the paths the plan names since its anchor; drift past
  threshold means re-plan, not repair. (This promotes the "stale would-be spec — git-log before
  building" trap from a private memory warning to an enforced rule.)
- **Consumed, then retired.** Once consumption starts a plan is never edited — re-planning is cheap
  by construction, so supersede. Consumed plans are prunable; the arc's increment log is what
  endures.

### D3 — Topology: upstream by provenance, edges authored on the child

Arcs sit **upstream** of stories and ADRs and can span many of each. Every containment edge is
**stored on the child; the upward view is derived by query** (the `adr list` pattern —
derived-from-source, never hand-maintained):

- A **plan** is born citing its arc.
- An **ADR** or **story** gains an optional **`arc:` provenance stamp** at creation
  (`storytree adr new --arc <id>`; story frontmatter). The stamp is immutable provenance — "arc X
  produced me" cannot rot, so it respects ADR-0139 — and is never required (pre-0182 artifacts and
  arc-less work stay unstamped).
- The arc **reveals** its plans/stories/ADRs dynamically; it is never edited when a child is born.
  This is what keeps arcs ceremony-light despite being upstream: rapid plan churn touches only
  plan rows.

**Upstream means provenance and intent, not authority.** The arc never overrides story-author on
WHAT or the decision log on WHY — it is the narrative index over them. The layered disclosure is
the ADR-0023 pull model: orient on a story → climb to the arc for intent → descend into plans only
when choreography-level detail is needed.

### D4 — The surface rule

**Implementation surface may only be written into anchored, disposable artifacts.** A file list in
a durable doc (ADR body, story, principle, arc) is a staleness bug; a file list in a plan dies with
the plan. This graduates into the Library as a principle alongside the kind build.

### D5 — The planner tier

Plans are authored by a **planner library agent** whose spawned runtime is configured to the
expensive model tier (the ADR-0177/0178 pluggable-runtime precedent; a non-Anthropic author adapter
is future work, not a blocker). The planner **never decides and never defines work**: a design fork
discovered while planning exits to an ADR; hierarchy changes route through story-author. The
orchestrator consumes: validate freshness (D2), take lanes via the existing claim machinery
(ADR-0121/0142), execute, record the outcome on the arc.

### D6 — Scope guard: plans are never mandatory

A one-session, one-unit piece of work stays planless — the session-orchestrator's existing
decide-and-decompose step is right at that scale. The trigger: work that **spans sessions or
parallel lanes** gets an arc; an arc increment big enough to hand off gets a plan. Mandatory plans
would price the ceremony toward plan-theater — the exact failure ADR-0168 refused for retros.

## Consequences

**Gained.** The de facto epic tier becomes shared and owner-visible (studio, CLI, parallel
sessions) instead of private memory; chip prompts shrink to "pull arc X, take the next increment";
expensive-model planning output becomes an inspectable, reusable checkpoint between thinking spend
and building spend; upfront lane declaration composes with reactive claim enforcement; the
stale-spec trap gains a mechanical gate.

**Paid / accepted knowingly.**

- **Remote (web/VM) sessions cannot read or write plans** — the 3307 egress block (ADR-0063)
  applies to all live-store data. Planning and plan-consumption are local-session activities; this
  is a stated property, not an outage.
- Plans do not survive outside the DB (no git history, no seed). Disposable by design; the arc's
  increment log is the durable record.
- Two new kinds to model (KIND_SPECS + schemas + renderer + studio), plus the ephemeral-class
  exclusions in the export/sync/gate machinery. The `friction` kind (ADR-0168 D2) is the recent
  precedent: a new kind touches no existing doc, so no migration.
- ADR-0002's naming filter rejected "epic" as jargon for the *story* tier; it returns here only as
  a display alias on a different concept, never as a data name.

## Execution sketch (increments, not commitments)

1. `arc` + `plan` kinds in `packages/library` (KIND_SPECS, schemas, ephemeral-class exclusions,
   CLI render) — red-green provable.
2. `arc`/`plan` definition artifacts + the D4 surface principle; planner agent; CLI verbs
   (`adr new --arc`, derived arc views, plan freshness check).
3. Session-orchestrator workflow amendment (pull-plan / freshness-check / take-lane); studio
   rendering with the Epic alias; migrate one live memory arc as the dogfood.

## What this does NOT decide

- The exact field specs of both kinds (build-increment detail, held to the kind template).
- The planner agent's prompt, model binding, and a non-Anthropic author adapter.
- Whether the studio map renders an arc's span over story wisps (natural follow-on, owner's look
  call).
- Any change to agent memory discipline — memory remains for what ADR-0095 says; existing arc
  files migrate as increments land, not by fiat.

## References

- ADR-0002 (the parked fourth tier this amends), ADR-0010 (proof-bounded hierarchy).
- ADR-0023 (live-canonical Library, pull model), ADR-0161 (node-keyed context DAG),
  ADR-0156 (essentials-only prompts).
- ADR-0139 (no stale prose — why surface can't live in durable artifacts),
  ADR-0158 (glue), ADR-0130/0131 (turn caps), ADR-0121/0138/0142 (claims and wisps).
- ADR-0168 (the friction kind — new-kind precedent and the anti-ceremony lesson),
  ADR-0095 (graduation; arcs hold state, not guidance).
- ADR-0177/0178 (pluggable agent runtimes — the planner-tier seam).
- `packages/orchestrator/src/proof/source-drift.ts` (the anchor/drift move plans reuse).
- Design conversation, 2026-07-11.
