---
status: accepted
decided: 2026-06-08
---

# ADR-0023: Agents reach the Library through an exploratory, just-in-time CLI

## Status

accepted (2026-06-08; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — realises [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)'s
pull-based, just-in-time context as a concrete **agent interface**; operationalises the Library tier
([ADR-0017](0017-cross-cutting-knowledge-tier.md) / [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) /
[ADR-0019](0019-library-tier-name-and-defer-dbos.md)) over the built `packages/store`; informed by
[`agent-library-interaction`](../research/agent-library-interaction.md) (the options study). This is
the "full agent↔Library interaction protocol" that ADR-0018/0019 named as *under design separately*.

## Date

2026-06-08

## Context

The Library tier is migrated into Cloud SQL and is real (74 units + templates + comments in the live
DB; ADR-0019/0021). What was missing is **how an agent interacts with it**. Two facts shaped the
decision:

- **ADR-0011 makes context engineering owned and pull-based** — each agent assembles only the slice
  it needs, just-in-time, never a whole-corpus dump. A Library interface that dumps the corpus (or
  trusts the agent to have memorised a written protocol) fights that principle.
- **V1 (`Agentic`) drove agent guidance through the CLI** — `--help` plus every command emitting
  next-steps and guidance back to the agent. That pattern worked: the CLI *is* the guidance surface,
  not a separate document the agent must remember. The owned-loop tool layer already follows the same
  contract — `packages/agent/src/fs-tools.ts` never throws on an expected failure; it returns a
  data-bearing result the model adapts to.

The owner's framing: the Library CLI should read like a **choose-your-own-adventure storybook** —
context is just-in-time, and the agent must **explore to earn it**. The entry point shows only a
surface map; depth is reached by drilling into subcommands and `--help`. This makes ADR-0011's
just-in-time principle a *navigational affordance*, not just a context-assembly algorithm.

## Decision

1. **The CLI is the agent's interface to the Library, and it is exploratory.** No command dumps the
   corpus. The agent navigates inward: a top-level map → a kind/category → a single artifact → that
   artifact's local DAG. Each step reveals only the next set of choices. Context is just-in-time
   (ADR-0011); the agent pays for detail by asking for it.

2. **`storytree library` is the entry point and the dashboard.** It runs a **health check**, then
   emits: (a) a table of artifacts — each artifact, what kind it is, and the **total count**; and
   (b) a **surface-level command list (names only)**. It does *not* explain the commands — the agent
   runs `<command> --help` to go deeper. This is the **first command** an agent runs when it plans to
   work with the Library.

3. **Command surface** (namespaced `storytree <area> <verb>`):
   - `storytree library` — health + dashboard + surface command list (above).
   - `storytree library artifact <name|id>` — print the artifact to stdout.
   - `storytree library artifact new|edit|comment <name|id>` — the lifecycle / interaction commands
     (create / propose-edit / comment), each honouring the auto-vs-gated discipline below.
   - `storytree library tree focus <name|id>` — render the DAG **for that node only** (its local
     provenance + abstraction neighbourhood). Root ADRs surface *here*, on demand — the one place
     justification records enter context.
   - `storytree library artifact list <category>` — list artifacts by kind. The **interim "search"**
     (see §6).

4. **Every command emits guidance back to the agent** (the V1 pattern, the owned-loop tool contract).
   A command result is an envelope, not bare data: the **result**, the **applicable doctrine** (the
   guardrails/principles bearing on what was just done), and **`next`** (suggested follow-up
   commands). Errors are guidance, never bare failures — a blocked action explains *why* and *how to
   proceed*. `--help` is rich and example-led; it is itself a "page" in the storybook.

5. **Structural guardrails fail closed; meaning-level rules are emitted as guidance**
   ([`agent-library-interaction`](../research/agent-library-interaction.md) §6.4). The CLI rejects,
   deterministically: edge cycles, edge-type disjointness violations, unknown/duplicate edge types,
   un-rooted artifacts, and exact-duplicate creates. It *advises* (does not block) on meaning-level
   matters: anchor (genus-differentia) presence, possible semantic duplicates, edit-first-curation.
   Create and body-edit are **gated** (proposal → owner approval); comment and edge-link are **auto**.

6. **Search is deferred; `list <category>` is the stopgap.** Real search is **scoped to the
   story-tree node an agent is working on** — which requires the first story-tree node to exist. Until
   then, `storytree library artifact list <category>` is the discovery path. Full search lands when
   the story tree does.

7. **Agent context/system-prompt is a separate namespace — `storytree agents <name>`.** The Library
   CLI has **no `pull`**. An agent obtains its own assembled context / system prompt via
   `storytree agents <name>`; the context-assembly algorithm behind it is ADR-0011's concern, not the
   Library's. This keeps "navigate the Library" and "assemble my context" as distinct surfaces.

8. **An agent has exactly three input surfaces; the Library leans on the tool surface.** The surfaces
   are: (#1) the **system prompt**, (#2) **tool / guardrail emissions**, and (#3) **steering** from
   the user or another agent. The Library delivers *content* through #2 (exploration output **is** the
   context) and uses #1 only for a **minimal boot baseline**. There is no fourth "proactively inject a
   slice" surface — that was the discarded `pull`.

9. **The boot baseline is map-only; guidance is friction-driven, not front-loaded.** An agent boots
   (surface #1) with the minimum — its goal and a pointer to `storytree library` — **not** a doctrine
   floor. Non-bypassable rules reach it at the tool boundary (#2), emitted at the point of the action
   they govern, so pre-loading them is redundant. The set of emitted guidance is **grown by observed
   friction**, not designed up front: the build reveals what each command must say. *Liberty:* the
   agent that sets up a new agent may **curate extra up-front injection** for that agent's role — the
   baseline is a floor of zero, not a ceiling. **Posture: minimalist and flexible — build first, let
   friction prove what guidance is actually needed** rather than speculatively engineering it.

10. **Fast-iteration write mode (interim).** To let multiple sessions iterate on artifacts in
    parallel *now*, artifact writes go **directly** to the shared store via the CLI (`artifact new` /
    `edit`), each as one event + projection upsert — **the gated proposal flow of §5 is deferred**.
    Justification at single-operator scale: the operator drives each session, so "human owns the
    outer loop" is preserved by *who runs the session*, not by an in-CLI approval gate. Concurrency
    is safe by construction — `library_artifact` is keyed by `id` and `upsertDoc` is transactional, so
    **different artifacts never contend**; *same-artifact* concurrency (which would need ADR-0009
    claims, DBOS-deferred) is out of scope. `new` still refuses to overwrite an existing id (pointing
    at `edit` — edit-first-curation as a guardrail), and every write re-validates at the boundary
    (`validateLibraryDoc`), returning the failure as guidance rather than persisting.

11. **The shared store is the live source of truth for artifact state; `knowledge.json` is a seed.**
    Parallel artifact work goes through the CLI to the **live `--pg` store** (the offline in-memory
    copy is read-only-by-convention — a write without `--pg` is refused with guidance). `knowledge.json`
    + the generated `assets.json` / `docs/glossary.md` are the **migration seed / export view**, no
    longer the edit-here surface for live changes. **Do not re-run `load-corpus.ts --force`** against a
    live DB that has CLI edits — it would revert them (a DB→seed export path is later work). The studio
    reflects CLI edits only when run in store mode (`STORYTREE_STUDIO_STORE=pg`) — the single UI
    session's concern; this ADR changes no studio code.

## Consequences

- **A new top-level `storytree` CLI** (provisionally `packages/cli`), run via `tsx`, no build step
  (project convention), dependency-free using node's `util.parseArgs`. It wraps the built narrow
  `Store` (`packages/store`) and `packages/core`'s `validateLibraryDoc` — **no store schema change is
  required to begin** (`upsertDoc` / `queryDocs` / `getDoc` / `deleteDoc` / `appendEvent` /
  `readEvents` already suffice for read, list, comment, retire).
- **Edges stay as typed ID-ref arrays inside the doc** (the store's "relationships are ID refs inside
  docs, never FKs" rule); `tree focus` derives the local DAG by resolving those refs, and the
  back-edge ("who points at me") view is a derived `queryDocs` scan — cheap at current scale.
- **Gated edits need one additive event `type`** (a proposal/approval beyond created/updated/deleted);
  retire is the existing `deleted` event (history survives — tombstone-by-event is already the
  built behaviour).
- **The `storytree` namespace is established** for later areas (`agents`, and eventually `tree` /
  `story` when the story tree exists). The Library is the first inhabitant.
- **The research options doc is the backing study**; this ADR records the chosen interaction model.

## What this does NOT decide

- **Full search semantics** — deferred to story-tree-node-scoped search (§6), blocked on the first
  story-tree node.
- **The context-assembly algorithm behind `storytree agents <name>`** — ADR-0011 territory.
- **The proposal/approval event schema** and the **final edge-storage shape** (embedded vs
  first-class) — parked as implementation; the CLI starts on embedded ID-refs.
- The **open-question resolve→retire automation** trigger details (all-comments vs decision-flagged)
  — to settle when `artifact resolve` is built; the manual workflow (ADR-0018 §6) stands meanwhile.
- **How an agent's "process" / high-level arc is delivered** — whether a goal alone suffices (purist
  CYOA: the agent emits friction, the tooling answers) or an arc is injected up front. Parked; a real
  open thread the build will resolve, not over-engineered now.
- **DBOS** — still deferred (ADR-0019).

## References

- [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (own the loop; pull-based JIT
  context), [ADR-0017](0017-cross-cutting-knowledge-tier.md) /
  [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) /
  [ADR-0019](0019-library-tier-name-and-defer-dbos.md) (the Library tier / source / name + store),
  [ADR-0016](0016-knowledge-code-binding-and-staleness.md) (staleness, surfaced via `tree focus`).
- [`agent-library-interaction`](../research/agent-library-interaction.md) (the options study this
  decides), `packages/store` (the store it wraps), `packages/agent/src/fs-tools.ts` (the
  guidance-emitting tool contract it mirrors).
- Design conversation, 2026-06-08 (owner counter-proposal: the choose-your-own-adventure CLI).
