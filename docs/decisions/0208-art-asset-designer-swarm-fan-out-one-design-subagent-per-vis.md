---
status: accepted
decided: 2026-07-17
amends: [70, 159]
load_bearing: false
---
# ADR-0208: Art-asset designer-swarm: fan out one design subagent per visual asset in a frontend unit

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Validated by a live spike the
same day whose artwork the owner liked and asked to "bake in for future sessions". Extends the
frontend-builder two-stage proof (ADR-0070) and the render-and-witness self-QA (ADR-0159) with a
fan-out authoring structure for Stage-2 look work; it reverses nothing in either.

## Context

A frontend unit often contains several DISTINCT visual assets at once — the forest world alone draws
building glyphs, land-surface themes, and flora sets, each a separate art problem with its own
silhouette, palette use, and scale. Until now a session built these serially in its own context: one
agent nursing every glyph, holding the whole style in its head, eyeballing renders ad hoc. That
serial path is slow, it blurs the assets together (a shared author drifts toward a shared look), and —
the failure the spike set out to fix — it routinely ships **code-only art**: a plausible-looking
generator function that was never actually rendered and looked at, so the first time anyone sees it is
in the composite, where it is expensive to unpick.

Two structural facts make a better path available. First, the forest-world render core is already a
set of pure, deterministic **builders** over a world-model→render seam (`packages/forest-world/src/scene.ts`:
`buildTree` / `buildBloom` / `buildPlant` / `buildConifer` / `buildTerritoryFlora`, each `(...params, rand) → drawable`,
seeded by `rand01(hash(...))`, no `Math.random`) — ADR-0069 / `deterministic-parameterised-geometry`.
Each art asset therefore has a narrow, self-contained pure-function boundary that maps 1:1 onto a
builder, which means one asset can be authored in isolation and spliced in without the scene core
losing its snapshot-testability. Second, an orchestrating session can already fan work out to its own
subagents (`orchestrate-route-supplement`) — the missing piece was a discipline for WHAT each design
subagent is handed, what it must return, and how it proves its own craft before returning.

The spike proved the shape: one design subagent per asset, each given a shared style bible and a
narrow pure-function contract, each mandated to render-and-look before returning, all routed to
sonnet-class models (design iteration measured ~60–110k tokens per designer). The owner liked the
result and directed it be made the default. This ADR records that.

## Decision

When a frontend unit contains distinct visual assets, the orchestrating frontend session (the
`frontend-builder`, or the session driving frontend work) **fans out ONE design subagent per asset**,
under six rules:

1. **Shared style bible.** Every designer is handed the same written style contract — the world's
   palette (the studio's CSS custom properties, never invented hexes), the cel-shading rules (flat
   facets; a second face in a darker tone for depth; no gradients, no filters), the determinism rule
   (no `Math.random`; a seeded `rand()` is passed IN), and hard scale bounds (the px footprint the
   asset must fit). One bible, so the assets read as one world.

2. **Narrow pure-function contract.** Each designer returns exactly ONE self-contained plain-JS/TS
   pure function — e.g. `(x, y, s, rand) => svgString` for a building, `(cells, status, testCount, rand) => { ground, flora[] }`
   for a land surface. The signature is chosen to map 1:1 onto a drawable builder in
   `packages/forest-world/src/scene.ts`, so integration is a splice and the scene core stays
   snapshot-testable. No shared mutable state, no reach outside the signature.

3. **Mandatory visual self-verification.** A designer builds a throwaway HTML harness, screenshots it
   headlessly (Playwright), LOOKS at the render, iterates until the craft is right, and DELETES every
   temporary file before returning. **Code-only art submissions are not acceptable** — a generator
   that was never rendered and looked at is not done. (This is the designer's own craft check; it is
   FEEDBACK, never a verdict — `render-and-witness-a-flag-guarded-surface`.)

4. **Integration and composite verification stay with the orchestrating session.** The designers
   produce isolated assets; splicing them into `scene.ts`, proving the scene core red-green (the
   Stage-1 `--real` proof), and witnessing the composite are the orchestrator's job. The swarm
   SUPPLEMENTS the routing filter (`orchestrate-route-supplement`); it does not replace the inner loop
   and never touches the prove-it-gate.

5. **The look verdict stays owner-attested.** Designers self-verify their own craft; they NEVER sign
   the visual verdict. The composite look remains a Stage-2 operator-attested call the owner makes
   (ADR-0070 §3 / ADR-0159) — unchanged.

6. **Model routing.** Design iteration is token-hungry (~60–110k tokens per designer in the spike).
   Route designers to **sonnet-class models by default**; escalate an individual asset to a stronger
   tier only when that specific asset needs it.

## Consequences

- **Good.** Assets are authored in parallel, each in its own fresh context, so they don't blur
  together and the session's own context stays clean. The 1:1 pure-function/​builder mapping keeps
  integration a splice and the scene core snapshot-testable. The mandatory render-and-look kills the
  code-only-art failure at the leaf, before the composite. Sonnet-default keeps the token-hungry
  iteration cheap. The owner's proven-good spike workflow is now the default, not a one-off.
- **Cost / risk.** Fan-out has overhead — writing the style bible and per-asset contracts up front is
  more work than nursing one glyph, and it only pays off when a unit genuinely has several distinct
  assets; a single-asset tweak decomposes as before (no swarm). A shared bible is a single point of
  drift: if it is vague, the assets diverge anyway. Designers must be trusted to clean up their temp
  harnesses (the rule is explicit) or the working tree accumulates cruft.
- **Boundary held.** Nothing here changes the two-stage proof: Stage-1 red-green on the scene core is
  still spine-observed and signed, and the Stage-2 look is still owner-attested. The prove-it-gate is
  untouched. The pattern is a pullable `pattern` artifact (`art-asset-designer-swarm`), cited by
  `frontend-builder`; future frontend sessions reach for it just-in-time.

## References

- doc:decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md — the two-stage proof this extends.
- doc:decisions/0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md — Stage-1 through the inner loop; render-and-witness first-classed.
- doc:decisions/0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md — the world-model→render seam the builders live on.
- doc:decisions/0062-the-forest-world-is-the-observability-layer-rendered-one-art.md — one art element per signal.
- asset:art-asset-designer-swarm — the pullable how-to this ADR records.
- asset:orchestrate-route-supplement — the routing/supplement discipline the swarm extends.
- asset:render-and-witness-a-flag-guarded-surface — the leaf self-QA the designers perform.
- asset:deterministic-parameterised-geometry — the pure-generator rule the contracts honour.
- packages/forest-world/src/scene.ts — the drawable builders the contracts map onto.
