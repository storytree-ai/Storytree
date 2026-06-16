---
status: accepted
decided: 2026-06-17
amends: [10]
---
# ADR-0068: Make the organism model physical: real story isolation and the farmer owns the proof ruler

## Status

accepted (2026-06-17, owner) — a design conversation diagnosing why concurrent sessions keep
colliding on shared files. **Amends [ADR-0010](0010-organism-model-story-bounded-context.md)**: the
organism model (story = bounded context, duplicate-don't-share-across, cross-story coupling only
through a declared interface) is kept and made **physically real** — the model was declared in 2026-06
but the repo never realized it. Aligned with [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)
§2 (the farmer is an ordinary organism that many depend on — the emergent-trunk shape — NOT the
"substrate tier" §2 explicitly rejected) and with [ADR-0030](0030-all-in-on-claude-agent-sdk.md) §1
(the research object is the story tree; this hardens the boundaries that make the tree mean
something). The decision is made here; **execution is deferred** to a quiet window and captured as the
live-library proposal artifact `organism-physical-rebuild`.

## Date

2026-06-17

## Context

[ADR-0010](0010-organism-model-story-bounded-context.md) (2026-06-06) declared a story a **bounded
context** — self-contained, the microservice grain, with behaviour **duplicated not shared across
stories** and the **only** legal cross-story coupling a declared interface (the "boundary"/"port",
§4, *deliberately left unbuilt*). The repo never realized that model. It is a layered pnpm monorepo
(`packages/core`, `packages/agent`, `packages/orchestrator`, `packages/cli`, `packages/store`,
`apps/studio`), and stories are **vertical slices threaded through shared horizontal layers**: no story
owns a package, and `packages/core` is a shared god-package every story imports. ADR-0010 §4's
cross-story interface — the keystone any real isolation depends on — was never built, so cross-story
coupling is hidden and unenforced.

Two incidents from two independent sessions surfaced the gap, and they share one root cause:

1. **The 2026-06-16 file collision.** Two concurrent sessions edited the same foundation files —
   `packages/core/src/proof.ts`, `packages/orchestrator/src/prove-it-gate.ts`, and others. One was
   delivering `stories/binding-staleness` (which by design *adds a field to the signed `Verdict` and
   edits the gate*); the other was widening the inner-loop proof envelope (ADR-0064 — foundation work
   on the same gate). They merged clean **by luck** (different regions of the same files); nothing
   warned. Every colliding file was shared proof machinery.
2. **The AST/tree-sitter block.** Swapping `hashSpan`'s text fingerprint for an AST fingerprint
   (ADR-0016 Fork C) is blocked because `hashSpan` lives in `@storytree/core`, which is **bundled into
   the browser** (the studio runs there), and tree-sitter is a native binary a browser cannot load —
   the same reason `core` hand-rolls FNV instead of using Node's `crypto`. A server-only concern is
   hostage to the browser bundle of a shared package.

The owner's question — *"if stories are microservices, why do they share files?"* — names the smell.
The diagnosis (this conversation): **the stories are not the problem; `core` is.** `core` crams several
organisms' organs into one package everyone imports — most load-bearingly the **proof machinery**:
`proof.ts` (`Verdict`/`ProofMode`/`SigningRow`), `signer.ts`, `hashSpan`, and the gate that consumes
them. That single fact is *both* incidents: it is why organisms are not isolated (everyone compiles in
the proof machinery's guts), and it is why an animal (binding-staleness) was *able* to reach in and
edit the ruler at all.

The resolving reframe (owner): the gate + proof machinery is **an organism — the farmer** — whose job
is tending the other organisms and pronouncing them healthy. Crucially, **animals do not carry the
ruler; they are measured by the one farmer.** A `Verdict`/`ProofMode`/`healthy` is not a private domain
model a story owns — it is the *measurement standard* every node on the tree is judged by, and the
entire research object (a tree of units all claiming `healthy` by one standard) is only meaningful if
every organism was measured by the **identical** instrument. A single farmer guarantees one ruler by
construction. A shared *imported* kernel does not: it yields one ruler per commit of `main` and **N
branch-copies** under concurrency — which is exactly what collided on 2026-06-16.

## Decision

Make the bounded-context boundary **physically real and enforced**, and reframe the proof machinery as
an organism that *measures* rather than a package that is *imported*. Five parts:

### 1. The organism boundary is physical, not aspirational

Each story owns its code; **cross-story coupling passes through a declared interface (ADR-0010 §4),
never by importing or editing another organism's source.** ADR-0010 §4's boundary/port — the keystone
left unbuilt since 2026-06 — **gets built** (its name ratified when the schema lands). "Independently
deployable / the microservice grain" stops being framing and becomes the build target in its
bounded-context sense: an organism can be built, run, tested, and proven **in isolation against its
declared interfaces**. (Whether two organisms *co-deploy* onto one runtime — as `studio`,
`studio-cloud`, and `studio-members` share one Cloud Run service — is a separate axis, not a weakening
of isolation; see *What this does NOT decide*.)

### 2. The farmer owns the ruler

The proof / sign / hash machinery — today `proof.ts`, `signer.ts`, `hashSpan`, and the gate — belongs
to the **farmer organism** (today's `stories/drive-machinery`), not to a shared package every story
imports. **Animals produce evidence** (a proof command exits green); **the farmer inspects them and
constructs the verdict.** There is exactly one farmer, therefore exactly one ruler, and no other
organism holds a copy to drift.

### 3. Consumers read the farmer's output as versioned data, not as imported types

The store and the studio consume verdicts as the farmer's **declared, versioned output** (already JSON
in `events.verdict`), across the boundary — they do **not** import the farmer's types. This works at
runtime *and* at compile time, because the only thing that ever needs the `Verdict` *type* is the
farmer that builds it; everyone else needs its *shape*, which is a contract. The farmer's output schema
is **version-tagged** so a ruler change migrates readers instead of silently reinterpreting every past
proof — generalizing ADR-0016's `fnv1:`/`ast1:` fingerprint tagging from the hash to the whole output.

### 4. Dissolve `core`

The shared god-package is decomposed: each type/function moves to the organism that owns it. The
farmer's organs leave `core` and live in the farmer. If any genuinely-universal primitive survives
scrutiny it becomes a **minimal, dependency-light, browser-safe shared base** — but it earns its place
by being universal, not by being convenient. This is the **keystone** of the rebuild; the exact
per-type carve-up is follow-on work (*What this does NOT decide*).

### 5. The farmer is an organism, not a tier

This does **not** reintroduce the "substrate / foundational story" tier that [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)
§2 rejected. The farmer (`drive-machinery`) is an ordinary organism with its own consumer journey
(ADR-0058 §6); it simply has the **emergent-trunk shape** — depended upon by many. `library` is the
other exemplar. Nothing here adds a schema flag, a new tier, or a journey-principle exception.

## Consequences

- **The 2026-06-16 collision class becomes unrepresentable.** A story cannot edit another organism's
  source. `binding-staleness` wanting verdicts to carry a `boundHash` becomes either *farmer work* (a
  capability of the farmer) or a *farmer-vN request through the boundary* — never an animal editing the
  ruler on a side branch. The two sessions could not have collided on `proof.ts`/the gate.
- **The AST/browser block dissolves for free.** With `hashSpan` inside the farmer (server/CLI) and the
  studio consuming drift/verdicts as data, the studio never imports `core`, never bundles tree-sitter,
  and the browser-safety constraint that blocks ADR-0016 Fork C simply goes away. One model move
  resolves two pains surfaced by two different sessions — the signal the model is load-bearing.
- **`stories/binding-staleness` is re-framed.** Its proof-machinery edits are farmer capabilities; its
  `storytree drift` CLI consumes the farmer's output. Its `depends_on: [drive-machinery]` edge stops
  being an "extends-the-provider's-source" relation (which ADR-0010 §4 never sanctioned) and becomes a
  real consume-through-the-boundary edge.
- **`packages/agent` (the leaf organism) gets authored.** `drive-machinery`'s open modeling call #2 —
  the `PhaseAuthor` seam as a declared cross-story interface — is settled by this rebuild: the seam
  becomes the leaf organism's boundary.
- **A large, sequenced migration.** Dissolving `core` touches every package. It is keystone-first: the
  farmer boundary + verdict-as-versioned-output + extracting proof machinery out of `core`, before the
  per-organism carve-up and the studio/store re-wiring. The ordered plan and readiness preconditions
  live in the `organism-physical-rebuild` proposal.
- **Within-organism concurrency still needs coordination.** Cross-organism collisions die structurally,
  but two sessions growing *the same* organism (e.g. the farmer during bootstrap) still contend —
  that is the claims question ([ADR-0009](0009-concurrency-isolation-id-allocation.md), DBOS-deferred)
  and the parked advisory file-overlap signal (ADR-0065), unchanged by this ADR.
- **A proof outlives the farmer version that produced it.** §3's version-tagging is the honest record;
  binding the *validity* of a landed proof to the farmer version that signed it (not just to the target
  code it proved) is a noted future refinement, deferred (no live anchors yet).
- **Bootstrap honesty.** The friction clusters on the farmer because we are self-hosting — the
  instrument is currently also the target. At steady state, application organisms grow on a stable
  farmer and this whole class quiets down.

## What this does NOT decide

- The exact per-type carve-up of today's `core` — which type goes to which organism, and whether any
  universal browser-safe base survives (and what is allowed in it). In particular, who owns the
  **work-hierarchy schema** (`story`/`capability`/`contract`): the farmer, a tree/orchestrator
  organism, or the minimal shared base.
- The **verdict/output contract publishing mechanism**: codegen from a schema spec, a versioned
  published package each organism pins, or a hand-authored TS contract.
- The **sequencing** of the rebuild beyond keystone-first, and which organism is carved out first.
- Whether (and which) stories become **literal separate deployables** versus co-deployed surfaces; the
  decision here is bounded-context isolation, not a deployment-per-story mandate.
- The boundary/port **name** (ADR-0010 §4) — ratified when `packages/core`'s successor formalizes the
  schema.

## References

- [ADR-0010](0010-organism-model-story-bounded-context.md) (organism model — amended here),
  [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) (farmer =
  emergent-trunk organism, not the rejected substrate tier),
  [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the story tree is the research object),
  [ADR-0016](0016-knowledge-code-binding-and-staleness.md) (binding/staleness; the `fnv1:`/`ast1:`
  tagging this generalizes), [ADR-0009](0009-concurrency-isolation-id-allocation.md) (claims —
  within-organism concurrency), ADR-0065 (parked advisory file-overlap signal),
  [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (work hierarchy).
- `docs/glossary.md` — `story`, `boundary`/`port`, `dependency`, `deep-modules`.
- `stories/drive-machinery/story.md` (the farmer; open calls #2, #5), `stories/binding-staleness/story.md`,
  `packages/core/src/{proof,signer,knowledge}.ts`, `packages/core/src/anchor.ts` (`hashSpan`).
- Library proposal artifact `organism-physical-rebuild` (the deferred execution plan).
- Design conversation, 2026-06-17 (the farmer reframe; the sun/database/farmer analogies).
