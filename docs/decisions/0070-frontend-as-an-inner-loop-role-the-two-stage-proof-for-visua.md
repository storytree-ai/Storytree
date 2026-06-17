---
status: accepted
decided: 2026-06-17
---
# ADR-0070: Frontend as an inner-loop role: the two-stage proof for visual surfaces

## Status

accepted (2026-06-17) — owner steer in a design conversation about codifying the studio's
forest-world / visualization work (the chipped-off session that produced ADR-0069). The owner asked
whether the visual work — today improvised ad-hoc by the orchestrator session via
`orchestrate-route-supplement` — should be a dedicated agent, and steered it to be an **inner-loop**
role ("this should be an inner-loop agent … since our inner loop can't take screenshots is there a
way it can coordinate with the outer loop?"). This ADR records the role (`frontend-builder`), the
proof model it implies, and the inner↔outer coordination that answers the screenshot question. It is
the agent-tier + proof-model counterpart to [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)
(the *authoring model* for the geometry it builds) and stands on the existing inner-loop
machinery ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) and the fourth proof mode
([ADR-0007](0007-proof-model.md)).

## Context

Visual/frontend work — most visibly the `#/tree` forest world ([ADR-0036](0036-story-world-studio-visualisation.md))
— has been the most iteration-expensive glue in the project (rivers alone: ~6 rounds, PRs #157,
#186–#193; substrate #156/#162/#171; coast #195), and ADR-0069 just landed pointing at *more*
procedural-geometry work. Today the orchestrator session improvises this work each time by spinning a
cold `general-purpose` subagent under the `orchestrate-route-supplement` pattern, re-briefing the
non-obvious invariants (determinism, the world-model→render seam, one-element-per-signal, stay-on-SVG,
the screenshot-nod gate) from scratch — the same "improvised by the orchestrator session" failure that
motivated the dedicated `story-author`. The owner's standing direction is that the **inner loop is for
all work**, and that an inner-loop capability gap is a problem to *raise and expand*, not silently fall
back to the outer loop.

The forces that make frontend work distinctive:

- **Frontend splits into three provability layers.** *Geometry/logic* (the pure deterministic
  generators in [`riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) — MST, drainage,
  `offsetCurve`, meander) and *component behaviour* (a click toggles focus; a deep-link opens a panel)
  are **red-green-provable** with isolatable assertions. *Appearance* ("does this river look right?")
  is **not** — there is no assertion for taste; ADR-0069 states it plainly: "visual 'is this right?'
  has no compiler." Industry practice (Percy/Chromatic/Playwright visual-regression snapshots) only
  catches *unintended* change; it cannot judge whether a deliberate new look is good.
- **The inner loop's leaf cannot screenshot, and must not self-judge the look.** The prove-it-gate's
  leaf (`red-builder`/`green-builder`) has no Bash by design — the *spine* observes red/green
  ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)). There is no honest way for the leaf
  to assert "looks right," and `agent-never-self-exempts` forbids it manufacturing one.
- **storytree already has the right proof mode.** `operator-attested` is a first-class `ProofMode`
  ([`packages/core/src/proof.ts`](../../packages/core/src/proof.ts), ADR-0007): "the human-anchored,
  dogfood-only mode … can never be self-granted by an agent." Visual aesthetics is the canonical
  case of "neither an honest scripted UAT nor an isolatable automated test." The screenshot-nod **is**
  an operator attestation — it was just never modelled as one.

## Decision

**Frontend/visual work is an inner-loop role, `frontend-builder`, and a frontend unit is proven in two
stages — red-green for the provable layer, `operator-attested` for the appearance — with the leaf
preparing the visual artifact and the human supplying the judgment it structurally cannot.**

1. **`frontend-builder` is a codified inner-loop builder for all studio visual surfaces** (the forest
   world, the studio panels, the members UI, the [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   website). It is a **seed-canonical** `agent` library artifact (ADR-0055), rendered to a delegatable
   `.claude/agents/frontend-builder.md` (ADR-0052) — the orchestrator delegates frontend units to it
   *by name* instead of re-briefing a cold subagent. Its doctrine-heaviest domain is the
   forest-world geometry; the unifying thread across all its surfaces is exactly the two-stage proof.

2. **Stage 1 — red-green on the provable layer.** Geometry/logic and component behaviour go through
   the existing prove-it-gate unchanged (ADR-0020): the leaf authors the failing test and the minimum
   implementation; the **spine** observes red→green; the verdict is `contract`/`capability` proof mode.
   The studio's tests run on **vitest** (`apps/studio/package.json`), so the spec-borne `proofCommand`
   ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)) targets the
   studio vitest suite (the `node:test`-only assumption is overtaken — see capability gap B).

3. **Stage 2 — `operator-attested` on the appearance.** The look earns a verdict at `operator-attested`
   proof mode: the leaf builds the visual change behind a parameter/flag, emits a typed
   **visual-review request carrying a hosted deep-link** (`#/tree/<id>` renders identically on first
   paint — ADR-0036 §5 deep-links exist for exactly this), and **stops**. The outer loop — the human,
   who can view the hosted site — observes and records an `operator-attested` signed verdict. The leaf
   **never self-signs the look** (`agent-never-self-exempts`). The agent's own dev-server screenshots
   are **feedback only**, never the proof — structurally identical to how leaf feedback tools don't
   count, only the spine's observation does (ADR-0020). This is the inner↔outer coordination the owner
   asked for: the inner loop carries the test-provable load and *prepares the observable artifact*; the
   outer loop supplies the one judgment the leaf cannot make.

4. **The geometry it authors follows ADR-0069**, captured as a new pullable library principle
   **`deterministic-parameterised-geometry`** (the form of ADR-0069, as `one-element-per-signal` is the
   form of ADR-0062): pure deterministic generators (`hash`/`rand01`, no `Math.random`, no wall-clock)
   driven by meaningful parameters over the world-model→render seam, emitting point arrays stringified
   to SVG at the edge; stay on SVG, Konva named-deferred behind the seam.

5. **Two capability gaps are named for expansion, not treated as blockers** (the owner's
   "raise-and-expand", not "fall back"):
   - **Gap A — no visual-attestation phase.** `operator-attested` exists as a *type* but the
     prove-it-gate phase machine (`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`,
     [`phase-machine.ts`](../../packages/orchestrator/src/phase-machine.ts)) produces no
     `operator-attested` verdict through human review. Wiring a visual-attestation phase (emit the
     review request with a deep-link → block → operator signs → operator-attested verdict) is a
     **follow-on build unit**, not part of this ADR.
   - **Gap B — vitest proof command.** Stage 1 through `node build --real` needs the spec-borne
     `proofCommand` to drive the studio vitest suite (the dogfood path has been `node:test`-centric).

This ADR records the role and the proof model; the machinery in Gap A/B is sequenced as later
inner-loop expansion.

## Consequences

- **Good:** the most iteration-expensive glue gains a codified, delegatable inner-loop role with the
  forest-world invariants pre-loaded (no per-session re-briefing — the `story-author` win, repeated);
  the screenshot-nod is formalised as an `operator-attested` verdict in the audit trail rather than an
  informal nod; the provable geometry/behaviour is proven red-green like any other code; and the
  inner↔outer handoff reuses existing machinery (operator-attested + deterministic deep-links) instead
  of inventing a mechanism.
- **Cost / bad:** this does **not** reduce taste rounds — appearance has no compiler, and the agent
  cannot own the aesthetic call (it prepares variants; the owner judges). The visual-attestation phase
  (Gap A) and the vitest proof path (Gap B) are unbuilt — until Gap A ships, the Stage-2 attestation is
  recorded by the orchestrator/owner via the existing promotion path, not a dedicated gate phase. The
  agent tier grows by one (now eight delegatable + the dedicated-surface roles).
- **Bootstrapping:** the agent + principle land now (seed-canonical authoring is itself outer-loop
  work); the inner-loop machinery they presume (Gap A/B) follows as separate provable units.

## References

- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the procedural
  geometry authoring model `frontend-builder` follows (this ADR's sibling: role + proof vs. authoring).
- [ADR-0007](0007-proof-modes-and-the-evidence-chain.md) — `operator-attested`, the fourth proof mode
  the Stage-2 visual verdict uses.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate / spine-observes-red-green
  that Stage 1 reuses and the visual-attestation phase (Gap A) extends.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) /
  [ADR-0036](0036-story-world-studio-visualisation.md) / [ADR-0038](0038-story-world-vocabulary-recalibration.md)
  — the visual vocabulary the agent draws faithfully (one-element-per-signal, the world, growth).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
  [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) /
  [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the agent tier (seed-canonical, `build:agents`,
  `sync-agents`) this artifact lands through.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — spec-borne proof
  config (the `proofCommand` Gap B targets at vitest).
- [`apps/studio/src/lib/riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) /
  [`riverGeometry.test.ts`](../../apps/studio/src/lib/riverGeometry.test.ts) — the existing
  Stage-1-provable generators + their vitest proof, the model the agent extends.
- Library principle `deterministic-parameterised-geometry` (authored with this ADR) and the
  `frontend-builder` agent artifact — the pullable forms of decisions 4 and 1.
