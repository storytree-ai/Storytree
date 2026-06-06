// Seed the Library with artifacts:
//   1. curated principles/guidelines — durable guidance synthesised from the ADRs
//      (each cites its source ADR via `references`) plus a few v1 imports;
//   2. one `template` artifact per artifact category (the fillable scaffolds);
//   3. one `definition` artifact per term in docs/glossary.md, auto-extracted.
//
//   node data/seed.assets.mjs            # writes data/assets.json if missing
//   node data/seed.assets.mjs --force    # overwrites
//
// Provenance only: data/assets.json is the runtime store the dev server reads
// and writes. Re-run this to reset the seed. ADRs themselves stay as documents
// (history) under docs/decisions — they are not artifacts.

import { writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const STAMP = '2026-06-05T00:00:00.000Z';
const dataDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dataDir, '..', '..', '..');
const docsDir = path.join(repoRoot, 'docs');
const decisionsDir = path.join(docsDir, 'decisions');

// --- map ADR number -> doc topic ref, from the decisions dir -----------------

const adrFiles = readdirSync(decisionsDir).filter((f) => f.endsWith('.md'));
const adrByNumber = new Map();
for (const f of adrFiles) {
  const m = f.match(/^(\d{4})-/);
  if (m) adrByNumber.set(m[1], `doc:decisions/${f}`);
}
const adr = (n) => adrByNumber.get(String(n).padStart(4, '0')) ?? null;
const GLOSSARY = 'doc:glossary.md';

// --- curated artifacts (principles & guidelines synthesised from ADRs) --------

const para = (...lines) => lines.join('\n\n');

const curated = [
  {
    id: 'deep-modules',
    category: 'principle',
    title: 'Deep modules',
    description:
      "How to judge where a boundary belongs: a module's interface is a cost paid by every caller; its hidden functionality is the benefit. Pay the interface cost only when the hidden work justifies it.",
    body: para(
      "A module's **interface** is a cost paid by every caller (names to learn, invariants to preserve, parameters to thread). The **functionality** it hides is the benefit. Pay the interface cost only when the hidden functionality justifies it.",
      '- **Deep module** — small public surface, large hidden implementation. Callers see one concept and trust it.',
      '- **Shallow module** — wide public surface relative to the work it does; the boundary buys nothing.',
      '### The deletion test',
      '> Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.',
      '_Attribution: Ousterhout, via Matt Pocock. Imported from v1 `assets/principles/deep-modules.yml`. ADR-0002’s work-hierarchy model rests on this._',
    ),
    references: [adr(2)],
  },
  {
    id: 'edit-first-curation',
    category: 'pattern',
    title: 'Edit-first curation',
    description: 'Edit is the default; authoring a new artifact is the justified exception. Search before you write.',
    body: para(
      '**Rule.** Edit is the default. Writing a new artifact is the exception and must be justified: what search terms were run, what the closest existing artifact was, and why editing it was not the right move.',
      '- Duplicate artifacts split authority — a consumer does not know which to trust.',
      '- An edit keeps the revision history and evidence chain attached to the original.',
      '- Search-before-write is the cheapest duplication defence there is.',
      '_Imported from v1 `assets/guidelines/edit-first-curation.yml`._',
    ),
    references: [],
  },
  {
    id: 'assess-tradeoffs-by-naming-both-sides',
    category: 'pattern',
    title: 'Assess tradeoffs by naming both sides',
    description:
      'Every tradeoff surfaced must answer “what are we trading — A vs B?” with both sides in concrete, user-facing terms.',
    body: para(
      'Any tradeoff surfaced must answer **“what are we trading? — A vs B”**, with both sides in concrete user-facing terms: latency, blast radius, contract strength, observability, security posture, reversibility.',
      'Generic “more work” / “more complex” framings do **not** satisfy the rule. In an AI-coded corpus, cascade work amortises; the only durable “more work” cost is AI-illegible complexity guidance and tooling cannot solve.',
      '_Imported from v1. ADR-0001’s “Alternatives considered” follows it._',
    ),
    references: [adr(1)],
  },
  {
    id: 'prove-it-gate',
    category: 'principle',
    title: 'Prove-it gate',
    description: 'A unit reaches `healthy` only via earned, on-disk evidence — never a hand-edit.',
    body: para(
      'A unit reaches `healthy` only through earned, on-disk **evidence** produced by one of its proof modes — never a hand-edit. The gate **refuses** invalid work rather than warning about it.',
      'Corollary — **cold-rebuild** (an authoring guideline, not a gate): a story should be written self-contained enough that a cold agent — from the story’s spec plus its upstream stories’ declared interfaces, and nothing else — could rebuild it and pass its UAT (the internals may differ). It is not the definition of `healthy` and is never machine-enforced (ADR-0010 §6).',
      '_storytree-native; from `docs/glossary.md` and ADR-0007._',
    ),
    references: [GLOSSARY, adr(7)],
  },
  {
    id: 'proof-mode',
    category: 'definition',
    title: 'Proof mode',
    description: 'The four ways a unit earns `healthy`, one rung per tier — UAT, integration-test, contract-test, and operator-attested.',
    body: para(
      'How a unit earns `healthy`, one rung per tier (ADR-0010). `packages/core` encodes these as a discriminated `proof_mode` union (ADR-0007).',
      '- **UAT** (story) — an honest scripted acceptance walkthrough against *real* collaborators, proving the whole organism end to end.',
      '- **integration-test** (capability) — the organs wired against *real in-story collaborators* (no stubs within the organism).',
      '- **contract-test** (contract) — one isolated automated assertion (collaborators stubbed; the mock-UAT seam permits it).',
      '- **operator-attested** — a per-unit, operator-granted signed event for surfaces with neither an honest UAT nor an isolatable test. An agent can never self-exempt.',
    ),
    references: [adr(7), adr(2)],
  },
  {
    id: 'observability-first',
    category: 'principle',
    title: 'Observability-first',
    description:
      'If a state change isn’t a typed event the UI can render, it doesn’t exist. The event model is designed before features.',
    body: para(
      'The event model is designed **before** features. Every state change — pi events and orchestrator events alike — is a typed record in the event store, the single source of truth the studio renders. No external trace SaaS sits in the loop.',
      'Test of the principle: if a state change is not an event the UI can render, **it does not exist**. Observability is not a later pass; it is the foundation.',
      '_Synthesised from ADR-0001 (principles) and ADR-0006 (event store)._',
    ),
    references: [adr(1), adr(6)],
  },
  {
    id: 'own-the-layers',
    category: 'principle',
    title: 'Go slow, own the layers',
    description:
      'Own every load-bearing layer; stay model-agnostic and self-hosted. No vibing the parts the system rests on.',
    body: para(
      'v2’s bet, learned from v1: **design the load-bearing layers up front, go slow, own every layer, stay model-agnostic.** No vibing the parts the system rests on (the event model, concurrency-safe state, the orchestrator spine).',
      'Model-agnostic and self-hosted: API keys, not a subscription; your data and traces stay yours. The orchestrator owns only what pi does not — multi-node scheduling and durable, concurrency-safe shared state.',
      '_Synthesised from ADR-0001._',
    ),
    references: [adr(1)],
  },
  {
    id: 'one-model-boundary',
    category: 'guardrail',
    title: 'Confine model calls to one boundary',
    description:
      'pi is reached only through packages/pi-adapter; only the orchestrator drives it; a run is an event, never a node; the orchestrator is the sole fan-out point.',
    body: para(
      'Confine every model call behind one orchestrator-driven boundary, so model-unavailability is a *local* failure, never a system outage.',
      '- pi is reached **only** through `packages/pi-adapter` — the sole place a model runtime is imported.',
      '- **Only** `packages/orchestrator` drives the adapter; `packages/core` and `apps/studio` have no path to a model runtime.',
      '- **Run ≠ node:** a pi run/attempt is an execution event, never a new tree node.',
      '- The orchestrator is the **sole fan-out point** — pi nodes never schedule child nodes.',
      '**Enforced by.** A package-boundary dependency rule: `packages/pi-adapter` is the only module that may import a model runtime, and only `packages/orchestrator` may import the adapter — `packages/core` and `apps/studio` have no build-graph path to either.',
      '_Synthesised from ADR-0004._',
    ),
    references: [adr(4)],
  },
  {
    id: 'spine-sequences-leaf-judges',
    category: 'principle',
    title: 'The spine sequences, the leaf judges',
    description:
      'If a for-loop or a match could express the routing, the spine (code) owns it; if the routing needs the model to decide what comes next, the leaf (pi node) owns it.',
    body: para(
      'The discriminator for where control-flow lives (carried verbatim from v1):',
      '> If a for-loop or a match could express the routing, the **spine** owns it; if the routing needs the model to decide what comes next, the **leaf** (pi node) owns it.',
      'The spine is the code-sequenced orchestrator over DBOS workflows — closed, deterministic routing. A pi session’s own model loop is the leaf it delegates to.',
      '_Synthesised from ADR-0005._',
    ),
    references: [adr(5)],
  },
  {
    id: 'approval-gated-trunk',
    category: 'guardrail',
    title: 'Approval-gated trunk',
    description:
      'A green result is a request for human diff-review, not an automatic merge. The human holds the outer loop; content invariants are never bypassable.',
    body: para(
      'The studio **drives** agents; the human sits at the **outer loop**.',
      '- **Per-action approval** is first-class (inverts v1’s skip-permissions): approve / reject / steer individual pi actions in-loop.',
      '- **Approval-gated trunk** (inverts auto-merge-on-green): a green result surfaces for human diff-review and lands only on approval, as a signed promotion event.',
      '- Content invariants — contracts green, UAT signed, upstream healthy — are **never bypassable**.',
      '**Enforced by.** The promotion gate: landing on trunk is a signed `promotion` event the orchestrator emits only after an operator approves the diff *and* the content invariants pass — there is no code path that writes the trunk without it.',
      '_Synthesised from ADR-0008._',
    ),
    references: [adr(8)],
  },
  {
    id: 'claims-in-the-shared-store',
    category: 'guardrail',
    title: 'Claims live in the shared store',
    description:
      'Write-ownership is a typed claim checked at node-schedule time in the one shared store; a conflict is a hard refusal, never a warning.',
    body: para(
      'Coordination moves off git and into the one shared Postgres store (DBOS).',
      '- A **claim** is a typed write-ownership record naming what a node intends to write, checked under a serializable/unique constraint at **node-schedule time**.',
      '- A conflict is a **hard refusal** (a `claim-conflict-refused` event), never a warning.',
      '- DBOS workflow isolation replaces branch-per-session for coordination; DB-allocated ids dissolve the collision classes.',
      '**Enforced by.** A serializable/unique constraint on the claims table in the shared Postgres (DBOS) store, checked at node-schedule time: a conflicting claim raises a `claim-conflict-refused` event instead of committing, so two nodes can never hold the same write.',
      '_Synthesised from ADR-0009._',
    ),
    references: [adr(9)],
  },

  // --- techstack (what we build on) ---
  {
    id: 'stack-typescript-node-pnpm',
    category: 'techstack',
    title: 'TypeScript · Node 24 · pnpm workspaces',
    description:
      'The language and runtime: TypeScript on Node 24, organised as pnpm workspaces. Model-agnostic, owns the loop.',
    body: para(
      'storytree is a TypeScript / Node 24 / pnpm-workspaces monorepo. TS gives typed boundaries and invalid-state modelling in `packages/core`; pnpm workspaces keep `packages/*` and `apps/*` independent but linked.',
      'Chosen over v1’s Rust for model-agnostic, own-the-loop development speed.',
    ),
    references: [adr(1)],
  },
  {
    id: 'stack-pi-coding-agent',
    category: 'techstack',
    title: 'pi — the per-node coding agent',
    description:
      'pi (earendil-works/pi) writes the code inside each node: model-agnostic (15+ providers), with a clean lifecycle event stream + edit diffs.',
    body: para(
      'pi owns everything *inside* a node — the model loop, steering, diffs, approvals. It is reached only through `packages/pi-adapter`, the sole place a model runtime is imported.',
      'Model-agnostic and pay-as-you-go: API keys, any provider, not tied to a subscription.',
    ),
    references: [adr(1), adr(4)],
  },
  {
    id: 'stack-dbos-postgres',
    category: 'techstack',
    title: 'DBOS (Transact-TS) over Postgres',
    description:
      'Durable execution: crash-safe concurrent workflows, auto-resume, durable queues — parallelism as a library, not a cluster.',
    body: para(
      'DBOS gives crash-safe parallelism: auto-resumed workflows, durable queues with concurrency caps, collision-free workflow ids. The orchestrator owns only what pi does not — multi-node scheduling and durable, concurrency-safe shared state.',
      'Restate is the reserved alternative if a single self-contained binary is later preferred over a Postgres dependency.',
    ),
    references: [adr(1), adr(9)],
  },
  {
    id: 'stack-pixijs-react-studio',
    category: 'techstack',
    title: 'PixiJS v8 + @pixi/react studio',
    description:
      'The studio is a React web IDE with an embedded PixiJS 2D-isometric tree (deferred): fastest 2D, batches 1000s of live sprites at 60fps.',
    body: para(
      'The studio is a React shell embedding a PixiJS v8 (`@pixi/react`) 2D-isometric tree that renders the event store live. Art is deferred; the engine is settled.',
      '**Note:** this foundation build ships the React forum shell only — no PixiJS yet.',
    ),
    references: [adr(1)],
  },

  // --- guardrail (a hard boundary you can't cross) ---
  {
    id: 'never-bypass-the-gate',
    category: 'guardrail',
    title: 'The gate is never bypassable',
    description:
      'Content invariants — contracts green, UAT signed, upstream healthy — can never be bypassed; the gate refuses invalid work rather than warning.',
    body: para(
      'A **gate** is a structural enforcement point that **refuses** invalid work, not a warning. Promotion onto the trunk requires its content invariants — contracts green, UAT signed, upstream healthy — and these are **never bypassable**. An operator approval admits work that has *already* passed the gate; it cannot waive it.',
      '**Enforced by.** The gate is the sole writer of trunk-promotion events and emits one only when every content invariant holds; the operator-approval check runs *after* the invariants and has no branch that can waive them.',
      '_Synthesised from ADR-0008 / ADR-0007._',
    ),
    references: [adr(8), adr(7)],
  },
  {
    id: 'agent-never-self-exempts',
    category: 'guardrail',
    title: 'An agent can never self-exempt',
    description:
      'operator-attested promotion is operator-granted only; an agent can never grant itself the attestation that reaches `healthy`.',
    body: para(
      'The `operator-attested` proof mode promotes a unit to `healthy` only via an explicit, per-unit, **operator-granted** signed event. An agent can **never** self-exempt, and the attestation is distinguishable in the audit trail from a UAT walkthrough sign.',
      '**Enforced by.** The event store requires the `operator-attested` event to carry an operator signature distinct from any agent identity; an attestation signed by the agent under test is rejected, so an agent cannot mint its own promotion.',
      '_Synthesised from ADR-0007._',
    ),
    references: [adr(7)],
  },
  {
    id: 'run-is-not-a-node',
    category: 'guardrail',
    title: 'A run is not a node',
    description:
      'A pi run/attempt is an execution event (many per node), never a new tree node. The execution environment is not the coordination structure.',
    body: para(
      'A pi **run** (attempt) is recorded as an execution **event**, many-per-node — it is **never** a new node on the DAG. The coordination/scheduling grain (the node) is kept distinct from the execution grain (the run).',
      '**Enforced by.** The `packages/core` schema: a run is a `run`-typed row in the event store keyed to its node id, with no node identity of its own and no slot in the node table for one to occupy.',
      '_Synthesised from ADR-0004 (glossary: node, run)._',
    ),
    references: [adr(4)],
  },
  {
    id: 'orchestrator-is-sole-fan-out',
    category: 'guardrail',
    title: 'The orchestrator is the sole fan-out point',
    description:
      'Only the orchestrator schedules nodes; pi nodes never schedule child nodes (no agent-spawns-agent).',
    body: para(
      'The orchestrator is the **only** module that drives the pi-adapter and the **sole fan-out point** — it schedules nodes. A pi node never schedules child nodes; there is no agent-spawns-agent path.',
      '**Enforced by.** Only `packages/orchestrator` holds the schedule-node capability; the pi-adapter surface exposes no scheduling call upward, so a pi node has no API by which to spawn a child node.',
      '_Synthesised from ADR-0004 / ADR-0005._',
    ),
    references: [adr(4), adr(5)],
  },

  // --- pattern (a reusable structure) ---
  {
    id: 'thin-wrapper-over-the-runtime',
    category: 'pattern',
    title: 'Thin wrapper over the runtime',
    description:
      'Own a thin, typed wrapper over the agent runtime’s documented surface; expose nothing model-shaped upward.',
    body: para(
      '`packages/pi-adapter` is a project-owned thin wrapper over pi’s *documented* surface (`prompt`/`steer`/`followUp` + lifecycle stream + `edit` diffs). It normalizes pi’s stream into the typed events the store renders and exposes nothing model-shaped upward — `core` and `studio` never parse a pi stream directly.',
      '_Carries v1’s own-a-thin-wrapper-over-the-agent-runtime principle (ADR-0004)._',
    ),
    references: [adr(4), adr(6)],
  },
  {
    id: 'event-log-then-projection',
    category: 'pattern',
    title: 'Event log, then projection',
    description:
      'The append-only event log is the only thing written; per-unit status/verdict is a derived projection (node rollup), never hand-maintained.',
    body: para(
      'The **event log** is the typed, append-only record — the single source of truth and the only thing **written**. The **node rollup** (current status + latest verdict per unit) is a **projection** over the log, *read off* it, never written beside it.',
      'v2’s answer to v1’s per-build `runs`-grain mess.',
    ),
    references: [adr(6)],
  },
  {
    id: 'durable-workflow-per-node',
    category: 'pattern',
    title: 'One durable workflow per node',
    description:
      'Each node is a single pi session driven inside one DBOS workflow — crash-safe and auto-resumed, with isolation keyed on the node.',
    body: para(
      'A node under construction is driven by one pi session inside a DBOS workflow. DBOS workflow isolation (not a branch-per-session) provides crash-safe, auto-resumed execution; claims in the shared store handle write-ownership.',
      '_Synthesised from ADR-0001 / ADR-0009 (glossary: node)._',
    ),
    references: [adr(1), adr(9)],
  },
  {
    id: 'standalone-resilient-library',
    category: 'pattern',
    title: 'Standalone-resilient library',
    description:
      'Structure a unit as a library with minimal load-bearing deps, exercised end-to-end by integration tests, behind a thin CLI/adapter wrapper.',
    body: para(
      'Build each unit as a library with minimal load-bearing dependencies, exercised end-to-end by integration tests, behind a thin CLI/adapter wrapper. Keeps units provable in isolation and resilient to surrounding churn.',
      '_Carried from v1 (glossary: standalone-resilient-library)._',
    ),
    references: [GLOSSARY],
  },

  // --- pattern: practices & cautionary lessons (advisory, not enforced) ---
  {
    id: 'auto-merge-on-green',
    category: 'pattern',
    title: 'Auto-merge on green',
    description:
      'v1 auto-merged on green and tolerated a knowingly-broken mainline; v2 rejects it — green is a request for human diff-review.',
    body: para(
      'v1’s trunk auto-merged on green and tolerated broken intermediate states under an eventual-consistency posture. v2 **inverts** this: the trunk is approval-gated, a green result is a *request for human diff-review*, and the trunk never holds knowingly-broken states.',
      '_See the `approval-gated-trunk` constraint (ADR-0008)._',
    ),
    references: [adr(8)],
  },
  {
    id: 'faked-uat-theatre',
    category: 'pattern',
    title: 'Faked-UAT theatre',
    description:
      'Stubbing collaborators in a UAT is a structural defect — the mock-UAT seam forbids it. Guardrail surfaces use operator-attested, not a fake walkthrough.',
    body: para(
      'Stubs/mocks are correct in a contract test (isolated) but a **structural defect** in a UAT (real collaborators). Don’t fake a walkthrough for a behavioural/guardrail surface that has no honest UAT — use the `operator-attested` proof mode instead.',
      '_The mock-UAT seam; synthesised from ADR-0007._',
    ),
    references: [adr(7)],
  },
  {
    id: 'vibe-the-load-bearing-layers',
    category: 'pattern',
    title: 'Vibing the load-bearing layers',
    description:
      'v1’s internals were vibed and became unobservable. Don’t vibe the parts the system rests on — the event model, concurrency-safe state, the spine.',
    body: para(
      'v1 proved the *idea* but its internals were vibed and are hard to see. v2’s stance: **go slow, own the load-bearing layers.** The event model, concurrency-safe shared state, and the orchestrator spine are designed up front, not improvised.',
      '_Synthesised from ADR-0001._',
    ),
    references: [adr(1)],
  },
  {
    id: 'store-lock-races-and-id-collisions',
    category: 'pattern',
    title: 'Store-lock races & id collisions',
    description:
      'v1 hit store-lock races and in-process story-ID collisions under concurrency. v2 designs concurrency-safe state from day one (DBOS + DB-allocated ids).',
    body: para(
      'v1’s concurrency scars: store-lock races and in-process story-ID collisions (even duplicate ADR numbers). v2 treats concurrency-safe state as a **foundation, not a retrofit** — DBOS workflow isolation, claims in the one shared store, and DB-allocated collision-free ids.',
      '_Synthesised from ADR-0001 / ADR-0009._',
    ),
    references: [adr(1), adr(9)],
  },

  // --- authority & precedence (was governance) ---
  {
    id: 'glossary-wins',
    category: 'pattern',
    title: 'When a term is in question, the glossary wins',
    description:
      'docs/glossary.md is the authoritative terminology every layer speaks; when a term’s meaning is contested, it wins.',
    body: para(
      'Every layer — `packages/core` types, the orchestrator, the studio, the ADRs — uses the glossary’s terms as defined. **When a term’s meaning is in question, `docs/glossary.md` wins**; the reasoning lives in the cited ADR.',
      '_From the glossary preamble (ADR-0002)._',
    ),
    references: [GLOSSARY, adr(2)],
  },
  {
    id: 'human-owns-the-outer-loop',
    category: 'guardrail',
    title: 'The human owns the outer loop',
    description:
      'Inner loop (drive a unit red→green) is automatable; outer loop (accept to trunk, accept a decomposition, amend/retry/abandon) is human judgment.',
    body: para(
      '**inner loop** = driving one unit red→green (automatable, owned by a pi node). **outer loop** = accepting a result onto the trunk, accepting a decomposition, or amending/retrying/abandoning a unit (held by **human judgment** in the studio).',
      'The human-in-the-loop gate sits at the outer loop; the north-star may later dissolve it.',
      '**Enforced by.** The outer-loop transitions (accept-to-trunk, accept-decomposition, amend / retry / abandon) are operator-only actions in the studio, each recorded as an operator-signed event; the orchestrator exposes no automated path that performs them.',
      '_Synthesised from ADR-0008 / ADR-0007._',
    ),
    references: [adr(8), adr(7)],
  },
];

// --- templates (one fillable scaffold per artifact category) -----------------
// Category `template`; a new artifact of category X starts from `template-X` in
// the editor. The editor enforces required sections on save — notably a
// guardrail must keep its **Enforced by** section naming the deterministic
// enforcement (see apps/studio/src/lib/templates.ts).
// `adr` is a first-class artifact category now: `template-adr` scaffolds a new
// ADR artifact. (The canonical ADRs under docs/decisions/ also fold into the
// Library read-only, so the `adr` category spans both.)

const templates = [
  {
    id: 'template-definition',
    category: 'template',
    title: 'Template — definition',
    description: 'Fillable scaffold for a new definition artifact (what something is).',
    body: para(
      '**In one line.** _What this term means, stated once._',
      '## What it is',
      '_The precise meaning — genus and differentia. Be exact._',
      '## What it is not',
      '_The nearest neighbours it must not be confused with._',
      '## See also',
      '_The glossary entry / ADR that governs the term, and related artifacts._',
    ),
    references: [],
  },
  {
    id: 'template-principle',
    category: 'template',
    title: 'Template — principle',
    description: 'Fillable scaffold for a new principle artifact (how to judge).',
    body: para(
      '**The principle.** _The judgement rule, in one sentence._',
      '## Why',
      '_What goes wrong without it; the cost it pays for._',
      '## How to apply',
      '_What following it looks like in practice — the test you run._',
      '## See also',
      '_Source ADR(s) and related artifacts._',
    ),
    references: [],
  },
  {
    id: 'template-pattern',
    category: 'template',
    title: 'Template — pattern',
    description: 'Fillable scaffold for a new pattern artifact (a reusable approach).',
    body: para(
      '**The pattern.** _The reusable approach, in one sentence._',
      '## Problem',
      '_The recurring situation this addresses._',
      '## Approach',
      '_The structure to apply — the shape or the steps._',
      '## Tradeoffs',
      '_What you trade — A vs B — in concrete, user-facing terms._',
      '## See also',
      '_Source ADR(s) and related artifacts._',
    ),
    references: [],
  },
  {
    id: 'template-guardrail',
    category: 'template',
    title: 'Template — guardrail',
    description:
      'Fillable scaffold for a new guardrail artifact — requires an "Enforced by" section.',
    body: para(
      '**The boundary.** _The line that must not be crossed, in one sentence._',
      '## Rule',
      '_The invariant, stated as a hard boundary._',
      '## Enforced by',
      '_The deterministic mechanism that makes this non-bypassable — a gate, a schema, a DB constraint, or a specific code path. If nothing enforces it, this is a `pattern`, not a guardrail._',
      '## Failure mode prevented',
      '_What breaks if the boundary is crossed._',
      '## See also',
      '_Source ADR(s) and related artifacts._',
    ),
    references: [],
  },
  {
    id: 'template-techstack',
    category: 'template',
    title: 'Template — techstack',
    description: 'Fillable scaffold for a new techstack artifact (what we build on).',
    body: para(
      '**The choice.** _What we build on, in one sentence._',
      '## What it is',
      '_The technology and the role it plays._',
      '## Why this',
      '_What it buys us; what it was chosen over._',
      '## Constraints',
      '_Version pins, boundaries, and what it must not be used for._',
      '## See also',
      '_Source ADR(s) and related artifacts._',
    ),
    references: [],
  },
  {
    id: 'template-adr',
    category: 'template',
    title: 'Template — adr',
    description:
      'The scaffold a new ADR artifact starts from — the canonical decision-record section shape (Status / Context / Decision / Consequences).',
    body: para(
      '# ADR-NNNN: <short imperative title>',
      '## Status',
      '_proposed · accepted · superseded by ADR-XXXX_',
      '## Date',
      '_YYYY-MM-DD_',
      '## Context',
      '_The forces at play — what makes this decision necessary now, and the constraints it must satisfy._',
      '## Decision',
      '_What we are doing, stated plainly in the present tense._',
      '## Consequences',
      '_What follows — the trade-offs accepted, the new constraints, what gets easier or harder._',
      '## Alternatives considered',
      '_What else was on the table and why it lost (name both sides of each trade)._',
      '## References',
      '_Source / related ADRs, glossary terms, and Library artifacts._',
    ),
    references: [],
  },
];

// --- definitions auto-extracted from docs/glossary.md ------------------------

function firstSentence(text) {
  const plain = text
    .replace(/\s+/g, ' ')
    .replace(/[*_`]/g, '')
    .trim();
  const m = plain.match(/^(.+?[.;])(\s|$)/);
  const s = (m ? m[1] : plain).trim();
  return s.length > 200 ? s.slice(0, 197).trimEnd() + '…' : s;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractGlossaryDefinitions(usedIds) {
  const raw = readFileSync(path.join(docsDir, 'glossary.md'), 'utf8');
  // Drop the v1→v2 term-map table at the end — it isn't term definitions.
  const cut = raw.indexOf('## v1 → v2 term map');
  const text = cut === -1 ? raw : raw.slice(0, cut);

  const out = [];
  const seen = new Set(usedIds);
  for (const block of text.split(/\n\s*\n/)) {
    const b = block.trim();
    // A definition block: **term** [(aside)] — body…   (em/en dash)
    const m = b.match(/^\*\*(.+?)\*\*\s*(?:\([^)]*\))?\s*[—–]\s*([\s\S]+)$/);
    if (!m) continue;
    const term = m[1].replace(/[*_`]/g, '').trim();
    const defBody = m[2].trim();
    const id = slugify(term);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const refs = [GLOSSARY];
    for (const am of defBody.matchAll(/ADR-(\d{4})/g)) {
      const ref = adr(am[1]);
      if (ref && !refs.includes(ref)) refs.push(ref);
    }
    out.push({
      id,
      category: 'definition',
      title: term,
      description: firstSentence(defBody),
      body: defBody,
      references: refs,
      createdAt: STAMP,
      updatedAt: STAMP,
    });
  }
  return out;
}

// --- assemble + write --------------------------------------------------------

const stamp = (a) => ({
  ...a,
  references: a.references.filter(Boolean),
  createdAt: STAMP,
  updatedAt: STAMP,
});
const curatedFull = curated.map(stamp);
const templatesFull = templates.map(stamp);
const definitions = extractGlossaryDefinitions(
  [...curatedFull, ...templatesFull].map((a) => a.id),
);
const assets = [...curatedFull, ...templatesFull, ...definitions];

const force = process.argv.includes('--force');
const outFile = path.join(dataDir, 'assets.json');
if (existsSync(outFile) && !force) {
  console.log(`assets.json already exists; pass --force to overwrite (${outFile})`);
} else {
  writeFileSync(outFile, JSON.stringify(assets, null, 2) + '\n', 'utf8');
  const byCat = assets.reduce((acc, a) => ((acc[a.category] = (acc[a.category] ?? 0) + 1), acc), {});
  console.log(`wrote ${assets.length} artifacts → ${outFile}`);
  console.log('  by category:', JSON.stringify(byCat));
}
